// routes/transbank.js - Transbank Webpay Plus Payment Routes
const express = require('express');
const router = express.Router();
const {
    WebpayPlus,
    Options,
    IntegrationCommerceCodes,
    IntegrationApiKeys,
    Environment
} = require('transbank-sdk');
const {
    allowedOriginsSet,
    getFrontendBaseUrl,
    isProduction
} = require('../config/app');
const { verifyIdTokenSafe, getFirestoreAdminSafe } = require('../lib/firebase-admin');
const {
    buildOrderItemsSignature,
    findOrderByReference,
    loadProductsByIds,
    markOrderAsPaid,
    normalizeEntityId
} = require('../lib/order-payment');

function getTransbankTransaction() {
    const commerceCode = normalizeEntityId(process.env.TRANSBANK_COMMERCE_CODE) || IntegrationCommerceCodes.WEBPAY_PLUS;
    const apiKey = normalizeEntityId(process.env.TRANSBANK_API_KEY) || IntegrationApiKeys.WEBPAY;
    const environment = isProduction ? Environment.Production : Environment.Integration;

    return new WebpayPlus.Transaction(new Options(commerceCode, apiKey, environment));
}

function sanitizeText(value, { maxLength = 120, allowEmpty = false } = {}) {
    if (typeof value !== 'string') {
        return allowEmpty ? '' : null;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized && !allowEmpty) {
        return null;
    }

    return normalized.slice(0, maxLength);
}

function getBearerToken(req) {
    const rawAuth = req.get('authorization') || '';
    const match = rawAuth.match(/^Bearer\s+(.+)$/i);
    return match ? String(match[1]).trim() : '';
}

function isValidEmail(email) {
    if (typeof email !== 'string') {
        return false;
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.length <= 254;
}

// Precio unitario con el descuento del producto aplicado (desde Firestore).
// Replica la lógica del frontend para cobrar lo que el cliente vio en el checkout.
function getDiscountedUnitPrice(product) {
    const price = Number(product?.price) || 0;

    if (product?.discountType === 'percentage') {
        const pct = Number(product.discountPercent) || 0;
        if (pct > 0) {
            return Math.max(0, Math.round(price - (price * pct / 100)));
        }
    }

    if (product?.discountType === 'amount') {
        const amount = Number(product.discountAmount) || 0;
        if (amount > 0) {
            return Math.max(0, price - amount);
        }
    }

    return Math.round(price);
}

function isValidPublicOrigin(origin) {
    if (!origin) {
        return false;
    }

    return allowedOriginsSet.has(origin);
}

function requirePublicOrigin(req, res, next) {
    if (!isProduction) {
        return next();
    }

    const origin = req.get('origin');
    if (!isValidPublicOrigin(origin)) {
        return res.status(403).json({ error: 'Origen no autorizado' });
    }

    return next();
}

function getBackendBaseUrl(req) {
    const configured = normalizeEntityId(process.env.BACKEND_PUBLIC_URL);
    if (configured) {
        return configured.replace(/\/+$/, '');
    }

    const protocol = req.protocol || 'http';
    const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
    return `${protocol}://${host}`;
}

function redirectToPaymentResult(res, page, orderId, extraParams = {}) {
    const frontendBaseUrl = getFrontendBaseUrl();
    const params = new URLSearchParams({ orderId: String(orderId || '') });
    Object.entries(extraParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value));
        }
    });
    return res.redirect(`${frontendBaseUrl}/${page}?${params.toString()}`);
}

/**
 * POST /api/transbank/create
 * Crear transacción Webpay Plus y devolver { url, token } para redirigir al usuario.
 */
router.post('/create', requirePublicOrigin, async (req, res) => {
    try {
        const { items, email, orderId } = req.body || {};

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'No hay items en el carrito' });
        }

        const requestedItems = items
            .map(item => ({
                productId: normalizeEntityId(item?.id || item?.productId),
                quantity: Number(item?.quantity)
            }))
            .filter(item => item.productId && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 100);

        if (requestedItems.length === 0 || requestedItems.length > 30) {
            return res.status(400).json({ error: 'Items inválidos' });
        }

        const sanitizedOrderId = sanitizeText(orderId, { maxLength: 80, allowEmpty: true });
        if (!sanitizedOrderId) {
            return res.status(400).json({ error: 'orderId requerido' });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: 'Email inválido' });
        }

        const idToken = getBearerToken(req);
        const decodedToken = await verifyIdTokenSafe(idToken);
        if (!decodedToken?.uid) {
            return res.status(401).json({ error: 'Sesión inválida o expirada' });
        }

        const order = await findOrderByReference(sanitizedOrderId);
        if (!order || !order.firestoreDocId) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const orderOwnerId = normalizeEntityId(order.userId);
        if (!orderOwnerId || orderOwnerId !== decodedToken.uid) {
            return res.status(403).json({ error: 'No autorizado para pagar esta orden' });
        }

        const orderStatus = normalizeEntityId(order.status).toLowerCase();
        const orderPaymentStatus = normalizeEntityId(order.paymentStatus).toLowerCase();
        if (orderStatus === 'paid' || orderPaymentStatus === 'approved') {
            return res.status(409).json({ error: 'La orden ya se encuentra pagada' });
        }

        // Validar que el carrito solicitado coincida con la orden guardada
        const requestedSignature = buildOrderItemsSignature(requestedItems);
        const orderSignature = buildOrderItemsSignature(order.items);
        if (!requestedSignature || !orderSignature || requestedSignature !== orderSignature) {
            return res.status(409).json({ error: 'El carrito no coincide con la orden guardada' });
        }

        // Recalcular el subtotal de productos desde Firestore (nunca confiar en el precio del cliente)
        const productsById = await loadProductsByIds(requestedItems.map(item => item.productId));
        let itemsSubtotal = 0;

        for (const item of requestedItems) {
            const product = productsById.get(item.productId);
            if (!product || product.active === false) {
                return res.status(400).json({ error: `Producto inválido o inactivo: ${item.productId}` });
            }

            const basePrice = Number(product.price);
            if (!Number.isFinite(basePrice) || basePrice <= 0 || basePrice > 2000000) {
                return res.status(400).json({ error: `Precio inválido para producto: ${item.productId}` });
            }

            const stock = Number.parseInt(product.stock, 10);
            if (Number.isFinite(stock) && stock >= 0 && item.quantity > stock) {
                return res.status(400).json({ error: `Stock insuficiente para producto: ${item.productId}` });
            }

            // Aplicar el descuento del producto (leído de Firestore, igual que el frontend)
            const unitPrice = getDiscountedUnitPrice(product);
            itemsSubtotal += unitPrice * item.quantity;
        }

        // Sumar el envío y restar el descuento guardados en la orden (validados en el checkout)
        const shippingCost = Math.max(0, Math.round(Number(order?.totals?.shipping) || 0));
        const discountAmount = Math.max(0, Math.round(Number(order?.totals?.discount) || 0));

        // Total real de la orden: productos + envío - descuento
        let totalAmount = Math.round(itemsSubtotal + shippingCost - discountAmount);
        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            return res.status(400).json({ error: 'Monto total inválido' });
        }

        const transaction = getTransbankTransaction();
        const returnUrl = `${getBackendBaseUrl(req)}/api/transbank/commit`;
        // Webpay exige buyOrder y sessionId de máximo 26 y 61 caracteres respectivamente
        const buyOrder = sanitizedOrderId.slice(0, 26);
        const sessionId = normalizeEntityId(decodedToken.uid).slice(0, 61);

        const tbkResponse = await transaction.create(buyOrder, sessionId, totalAmount, returnUrl);

        // Guardar intención de pago en la orden
        const db = getFirestoreAdminSafe();
        if (db) {
            await db.collection('orders').doc(order.firestoreDocId).set({
                paymentMethod: 'transbank_webpay',
                paymentExpectedAmount: totalAmount,
                paymentExpectedCurrency: 'CLP',
                paymentItemsSignature: requestedSignature,
                transbankBuyOrder: buyOrder,
                transbankSessionId: sessionId,
                transbankToken: String(tbkResponse?.token || '').slice(0, 200),
                transbankStatus: 'created',
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }

        console.log('✅ Transacción Webpay creada:', tbkResponse?.token);

        return res.json({
            success: true,
            url: tbkResponse?.url,
            token: tbkResponse?.token,
            buyOrder
        });

    } catch (error) {
        console.error('❌ Error creando transacción Webpay:', error);
        return res.status(500).json({
            error: 'Error al crear transacción de pago',
            message: isProduction ? 'Error interno' : error.message
        });
    }
});

/**
 * GET/POST /api/transbank/commit
 * Webpay redirige aquí al usuario tras el pago (return_url). Se confirma la transacción.
 */
async function handleCommit(req, res) {
    // Webpay puede volver con token_ws (pago completado), TBK_TOKEN (anulación/timeout), etc.
    const tokenWs = normalizeEntityId(req.method === 'POST' ? (req.body?.token_ws ?? req.query?.token_ws) : req.query?.token_ws);
    const tbkToken = normalizeEntityId(req.method === 'POST' ? (req.body?.TBK_TOKEN ?? req.query?.TBK_TOKEN) : req.query?.TBK_TOKEN);
    const tbkBuyOrder = normalizeEntityId(req.method === 'POST' ? (req.body?.TBK_ORDEN_COMPRA ?? req.query?.TBK_ORDEN_COMPRA) : req.query?.TBK_ORDEN_COMPRA);
    const tbkSessionId = normalizeEntityId(req.method === 'POST' ? (req.body?.TBK_ID_SESION ?? req.query?.TBK_ID_SESION) : req.query?.TBK_ID_SESION);

    // El usuario anuló el pago o hubo timeout (Webpay devuelve TBK_TOKEN en ese caso)
    if (!tokenWs && tbkToken) {
        console.warn('⚠️ Pago Webpay anulado o expirado. buyOrder:', tbkBuyOrder);
        return redirectToPaymentResult(res, 'payment-failure.html', tbkBuyOrder || '', { reason: 'aborted' });
    }

    if (!tokenWs) {
        return redirectToPaymentResult(res, 'payment-failure.html', '', { reason: 'missing_token' });
    }

    try {
        const transaction = getTransbankTransaction();
        const commitResponse = await transaction.commit(tokenWs);

        const buyOrder = normalizeEntityId(commitResponse?.buy_order);
        const responseCode = Number(commitResponse?.response_code);
        const status = normalizeEntityId(commitResponse?.status).toUpperCase();
        const amount = Number(commitResponse?.amount);
        const authorizationCode = normalizeEntityId(commitResponse?.authorization_code);
        const paymentTypeCode = normalizeEntityId(commitResponse?.payment_type_code);
        const accountingDate = normalizeEntityId(commitResponse?.accounting_date);

        const order = await findOrderByReference(buyOrder);
        const db = getFirestoreAdminSafe();

        // Pago autorizado (response_code 0 = aprobado)
        const isApproved = responseCode === 0 && (status === 'AUTHORIZED' || status === 'CAPTURED');

        if (order && db) {
            // Validar que el monto pagado coincida con lo esperado
            const expectedAmount = Number(order.paymentExpectedAmount);
            const amountMatches = Number.isFinite(expectedAmount) ? expectedAmount === amount : true;

            if (isApproved && amountMatches) {
                await markOrderAsPaid(order, {
                    paymentMethod: 'transbank_webpay',
                    gatewayPaymentId: buyOrder,
                    gatewayStatus: status || 'AUTHORIZED',
                    paymentDate: commitResponse?.transaction_date || new Date().toISOString()
                });

                await db.collection('orders').doc(order.firestoreDocId).set({
                    transbankAuthorizationCode: authorizationCode,
                    transbankPaymentTypeCode: paymentTypeCode,
                    transbankAccountingDate: accountingDate,
                    transbankResponseCode: responseCode,
                    transbankAmount: amount,
                    transbankCardLast4: normalizeEntityId(commitResponse?.card_detail?.card_number),
                    transbankStatus: status || 'AUTHORIZED',
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                console.log('✅ Pago Webpay confirmado:', buyOrder);
                return redirectToPaymentResult(res, 'payment-success.html', buyOrder);
            }

            // Pago rechazado o monto no coincide
            await db.collection('orders').doc(order.firestoreDocId).set({
                status: amountMatches ? 'payment_failed' : 'payment_validation_failed',
                paymentStatus: amountMatches ? 'rejected' : 'amount_mismatch',
                transbankStatus: status || 'REJECTED',
                transbankResponseCode: responseCode,
                transbankAmount: amount,
                paymentProcessingStatus: 'failed',
                paymentProcessingError: amountMatches
                    ? `Pago rechazado por Transbank (código ${responseCode})`
                    : `Monto pagado (${amount}) no coincide con el esperado (${expectedAmount})`,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            console.warn('⚠️ Pago Webpay no aprobado:', buyOrder, 'código', responseCode);
            return redirectToPaymentResult(res, 'payment-failure.html', buyOrder, { reason: 'rejected' });
        }

        // No se encontró la orden asociada
        console.error('❌ Orden no encontrada para buyOrder:', buyOrder);
        return redirectToPaymentResult(res, 'payment-failure.html', buyOrder, { reason: 'order_not_found' });

    } catch (error) {
        console.error('❌ Error confirmando transacción Webpay:', error);

        // Si el commit falla porque la transacción ya fue confirmada (doble redirect / recarga),
        // intentar recuperar el estado para no marcar erróneamente como fallida.
        try {
            const transaction = getTransbankTransaction();
            const statusResponse = await transaction.status(tokenWs);
            const buyOrder = normalizeEntityId(statusResponse?.buy_order);
            const responseCode = Number(statusResponse?.response_code);
            const status = normalizeEntityId(statusResponse?.status).toUpperCase();

            if (responseCode === 0 && (status === 'AUTHORIZED' || status === 'CAPTURED')) {
                const order = await findOrderByReference(buyOrder);
                if (order) {
                    await markOrderAsPaid(order, {
                        paymentMethod: 'transbank_webpay',
                        gatewayPaymentId: buyOrder,
                        gatewayStatus: status || 'AUTHORIZED',
                        paymentDate: statusResponse?.transaction_date || new Date().toISOString()
                    });
                    return redirectToPaymentResult(res, 'payment-success.html', buyOrder);
                }
            }

            return redirectToPaymentResult(res, 'payment-failure.html', buyOrder || '', { reason: 'commit_error' });
        } catch (statusError) {
            console.error('❌ Error recuperando estado de transacción Webpay:', statusError);
            return redirectToPaymentResult(res, 'payment-failure.html', '', { reason: 'commit_error' });
        }
    }
}

router.get('/commit', handleCommit);
router.post('/commit', handleCommit);

module.exports = router;
