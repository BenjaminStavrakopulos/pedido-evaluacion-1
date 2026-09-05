// routes/webhook.js - Mercado Pago Webhook Handler
const express = require('express');
const router = express.Router();
const mercadopago = require('mercadopago');
const { safeCompareTokens } = require('../utils/security');
const { getFirestoreAdminSafe } = require('../lib/firebase-admin');
const whatsappService = require('../services/whatsapp');
const emailService = require('../services/email');

function getWebhookType(req) {
    return req.query.type || req.body?.type || req.body?.topic || null;
}

function getWebhookPaymentId(req) {
    const queryData = req.query.data;
    const queryDataId = req.query['data.id'];
    const bodyDataId = req.body?.data?.id;
    const bodyResource = req.body?.resource;

    const candidates = [
        queryData?.id,
        queryDataId,
        bodyDataId,
        bodyResource
    ];

    for (const candidate of candidates) {
        if (candidate == null) {
            continue;
        }

        const asString = String(candidate).trim();
        if (/^\d+$/.test(asString)) {
            return asString;
        }
    }

    return null;
}

function parseMercadoPagoSignature(signatureHeader) {
    if (typeof signatureHeader !== 'string' || !signatureHeader.trim()) {
        return null;
    }

    const values = {};
    signatureHeader.split(',').forEach((part) => {
        const [key, value] = part.split('=');
        if (!key || !value) return;
        values[key.trim()] = value.trim();
    });

    if (!values.ts || !values.v1) {
        return null;
    }

    return {
        ts: values.ts,
        v1: values.v1
    };
}

function verifyMercadoPagoSignature(req, webhookSecret) {
    if (typeof webhookSecret !== 'string' || !webhookSecret.trim()) {
        return false;
    }

    const signatureHeader = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    const parsed = parseMercadoPagoSignature(signatureHeader);
    const paymentId = getWebhookPaymentId(req);

    if (!parsed || typeof requestId !== 'string' || !paymentId) {
        return false;
    }

    const manifest = `id:${paymentId};request-id:${requestId};ts:${parsed.ts};`;
    const expectedHash = require('crypto')
        .createHmac('sha256', webhookSecret)
        .update(manifest)
        .digest('hex');

    return safeCompareTokens(parsed.v1, expectedHash);
}

function requireWebhookAuth(req, res, next) {
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (webhookSecret) {
        const signatureValid = verifyMercadoPagoSignature(req, webhookSecret);
        if (signatureValid) {
            return next();
        }
        return res.status(401).json({ error: 'Firma de webhook inválida' });
    }

    if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ error: 'MERCADOPAGO_WEBHOOK_SECRET no configurado en producción' });
    }

    const configuredToken = process.env.WEBHOOK_TOKEN;
    const providedToken = req.headers['x-webhook-token'];

    if (!configuredToken) {
        return next();
    }

    if (!safeCompareTokens(providedToken, configuredToken)) {
        return res.status(401).json({ error: 'Webhook no autorizado' });
    }

    next();
}
function normalizeEntityId(value) {
    return String(value == null ? '' : value).trim();
}

function buildOrderItemsSignature(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return '';
    }

    const normalized = items
        .map((item) => {
            const id = normalizeEntityId(item?.id || item?.productId || item?.product?.id);
            const quantity = Number.parseInt(item?.quantity, 10);
            if (!id || !Number.isInteger(quantity) || quantity <= 0) {
                return null;
            }
            return `${id}:${quantity}`;
        })
        .filter(Boolean)
        .sort();

    return normalized.join('|');
}

function getMercadoPagoClient() {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
        return null;
    }

    return new mercadopago.MercadoPagoConfig({
        accessToken,
        options: { timeout: 5000 }
    });
}

async function findOrderByReference(orderReference) {
    const orderId = String(orderReference || '').trim();
    if (!orderId) return null;

    const db = getFirestoreAdminSafe();
    if (!db) return null;

    const directDoc = await db.collection('orders').doc(orderId).get();
    if (directDoc.exists) {
        return {
            firestoreDocId: directDoc.id,
            id: orderId,
            ...directDoc.data()
        };
    }

    const lookupSnapshot = await db.collection('orders').where('id', '==', orderId).limit(1).get();
    if (lookupSnapshot.empty) {
        return null;
    }

    const firstDoc = lookupSnapshot.docs[0];
    return {
        firestoreDocId: firstDoc.id,
        id: firstDoc.data()?.id || firstDoc.id,
        ...firstDoc.data()
    };
}

async function applyInventoryAndMarkPaid(order, payment) {
    const db = getFirestoreAdminSafe();
    if (!db || !order?.firestoreDocId) {
        return;
    }

    const orderRef = db.collection('orders').doc(order.firestoreDocId);
    const paymentId = String(payment?.id || '').trim();
    const paymentDate = payment?.date_approved || payment?.date_created || new Date().toISOString();

    await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) {
            return;
        }

        const currentOrder = orderSnap.data() || {};
        const nowIso = new Date().toISOString();
        const updatePayload = {
            status: 'paid',
            paymentStatus: 'approved',
            paymentMethod: 'mercado_pago',
            paymentDate,
            mercadoPagoStatus: payment?.status || 'approved',
            mercadoPagoPaymentId: paymentId,
            paymentProcessingStatus: 'completed',
            paymentProcessingUpdatedAt: nowIso,
            updatedAt: nowIso
        };

        // Idempotencia: si ya se ajustó inventario, no volver a descontar stock.
        if (currentOrder.inventoryAdjustedAt) {
            transaction.set(orderRef, updatePayload, { merge: true });
            return;
        }

        const items = Array.isArray(currentOrder.items) ? currentOrder.items : [];
        const quantityByProductId = new Map();

        for (const item of items) {
            const productId = String(item?.id || item?.productId || item?.product?.id || '').trim();
            if (!productId) continue;

            const quantity = Math.max(1, Number.parseInt(item?.quantity, 10) || 1);
            const previousQty = quantityByProductId.get(productId) || 0;
            quantityByProductId.set(productId, previousQty + quantity);
        }

        for (const [productId, quantity] of quantityByProductId.entries()) {
            const productRef = db.collection('products').doc(productId);
            const productSnap = await transaction.get(productRef);
            if (!productSnap.exists) continue;

            const product = productSnap.data() || {};
            const currentStock = Number.parseInt(product.stock, 10) || 0;
            const nextStock = Math.max(0, currentStock - quantity);

            transaction.set(productRef, {
                stock: nextStock,
                updatedAt: nowIso
            }, { merge: true });
        }

        transaction.set(orderRef, {
            ...updatePayload,
            inventoryAdjustedAt: nowIso
        }, { merge: true });
    });
}

async function markOrderProcessingFailure(order, reason, payment) {
    const db = getFirestoreAdminSafe();
    if (!db || !order?.firestoreDocId) {
        return;
    }

    const nowIso = new Date().toISOString();
    await db.collection('orders').doc(order.firestoreDocId).set({
        paymentProcessingStatus: 'failed',
        paymentProcessingError: String(reason || 'Error desconocido').slice(0, 500),
        paymentProcessingUpdatedAt: nowIso,
        mercadoPagoPaymentId: String(payment?.id || '').trim() || null,
        mercadoPagoStatus: payment?.status || null,
        updatedAt: nowIso
    }, { merge: true });
}

async function markOrderValidationFailure(order, validationStatus, details, payment) {
    const db = getFirestoreAdminSafe();
    if (!db || !order?.firestoreDocId) {
        return;
    }

    const nowIso = new Date().toISOString();
    await db.collection('orders').doc(order.firestoreDocId).set({
        paymentValidationStatus: String(validationStatus || 'validation_failed').slice(0, 80),
        paymentValidationDetails: String(details || 'Validacion de pago fallida').slice(0, 500),
        paymentValidationUpdatedAt: nowIso,
        paymentProcessingStatus: 'failed',
        paymentProcessingError: String(details || 'Validacion de pago fallida').slice(0, 500),
        paymentProcessingUpdatedAt: nowIso,
        paymentReceivedAmount: Number(payment?.transaction_amount) || null,
        mercadoPagoPaymentId: String(payment?.id || '').trim() || null,
        mercadoPagoStatus: payment?.status || null,
        updatedAt: nowIso
    }, { merge: true });
}

/**
 * POST /webhook/mercadopago
 * Escuchar notificaciones de Mercado Pago
 */
router.post('/mercadopago', requireWebhookAuth, async (req, res) => {
    try {
        const client = getMercadoPagoClient();
        if (!client) {
            return res.status(503).json({ error: 'MERCADOPAGO_ACCESS_TOKEN no configurado en backend' });
        }

        const type = getWebhookType(req);

        if (type === 'payment') {
            const paymentId = getWebhookPaymentId(req);

            if (!paymentId) {
                return res.status(400).json({ error: 'payment_id inválido' });
            }

            // Obtener detalles del pago
            const paymentClient = new mercadopago.Payment(client);
            const payment = await paymentClient.get(paymentId);

            const paymentData = {
                id: payment.id,
                status: payment.status,
                status_detail: payment.status_detail,
                amount: payment.transaction_amount,
                external_reference: payment.external_reference,
                payer_email: payment.payer?.email,
                created_at: payment.date_created
            };

            console.log('💰 Notificación de pago recibida:', paymentData);

            // 🔔 ENVIAR NOTIFICACIÓN POR WHATSAPP SI EL PAGO FUE APROBADO
            if (payment.status === 'approved') {
                console.log('✅ Pago aprobado, buscando orden para enviar WhatsApp...');

                let order = null;
                try {
                    const orderReference = payment.external_reference;
                    order = await findOrderByReference(orderReference);

                    if (!order) {
                        console.warn(`⚠️ No se encontró orden para referencia ${orderReference}`);
                    } else {
                        const expectedAmount = Number(order.paymentExpectedAmount);
                        const paidAmount = Number(payment.transaction_amount);

                        if (Number.isFinite(expectedAmount) && Number.isFinite(paidAmount) && Math.abs(expectedAmount - paidAmount) > 0.5) {
                            console.warn(`⚠️ Monto no coincide para ${order.id}. Esperado ${expectedAmount}, recibido ${paidAmount}`);

                            await markOrderValidationFailure(
                                order,
                                'amount_mismatch',
                                `Monto esperado ${expectedAmount}, recibido ${paidAmount}`,
                                payment
                            );

                            return res.status(200).json({
                                success: true,
                                message: 'Webhook recibido con monto inconsistente, orden marcada para revision'
                            });
                        }

                        const expectedSignature = normalizeEntityId(order.paymentItemsSignature);
                        const currentSignature = buildOrderItemsSignature(order.items);
                        if (expectedSignature && currentSignature && expectedSignature !== currentSignature) {
                            console.warn(`⚠️ Firma de items inconsistente para orden ${order.id}`);
                            await markOrderValidationFailure(
                                order,
                                'items_signature_mismatch',
                                'La firma esperada de items no coincide con la orden persistida',
                                payment
                            );
                            return res.status(200).json({
                                success: true,
                                message: 'Webhook recibido con firma inconsistente, orden marcada para revision'
                            });
                        }

                        await applyInventoryAndMarkPaid(order, payment);
                    }
                } catch (error) {
                    console.error('❌ Error crítico procesando pago aprobado:', error.message);
                    await markOrderProcessingFailure(order, error.message, payment);
                    return res.status(500).json({
                        error: 'Error aplicando pago aprobado'
                    });
                }

                if (order) {
                    try {
                        if (!order.receiptEmailSentAt) {
                            const sent = await emailService.sendReceiptEmail(order);
                            const db = getFirestoreAdminSafe();
                            if (sent && db && order.firestoreDocId) {
                                await db.collection('orders').doc(order.firestoreDocId).set({
                                    receiptEmailSentAt: new Date().toISOString()
                                }, { merge: true });
                            }
                        }
                    } catch (emailError) {
                        console.warn('⚠️ Error enviando boleta por email (no bloqueante):', emailError.message);
                    }

                    try {
                        if (!whatsappService.isEnabled()) {
                            console.warn('⚠️ Twilio no configurado; se omite notificación WhatsApp');
                        } else {
                            const result = await whatsappService.sendPaidOrderNotification(order);
                            console.log(`✅ WhatsApp enviado desde webhook. SID: ${result.messageId}`);
                        }
                    } catch (notifyError) {
                        console.warn('⚠️ Error enviando WhatsApp (no bloqueante):', notifyError.message);
                    }
                }
            }

            // Responder a Mercado Pago
            res.status(200).json({ 
                success: true,
                message: 'Webhook procesado correctamente'
            });
        } else {
            res.status(200).json({ message: 'Notificación recibida' });
        }

    } catch (error) {
        console.error('❌ Error procesando webhook:', error);
        res.status(500).json({ error: 'Error procesando webhook' });
    }
});

/**
 * GET /webhook/test
 * Test endpoint para verificar que el webhook está funcionando
 */
router.get('/test', (req, res) => {
    res.json({ 
        message: '✅ Webhook está activo',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
