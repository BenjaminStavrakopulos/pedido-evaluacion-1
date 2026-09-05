// lib/order-payment.js - Lógica compartida de validación y confirmación de pagos
// Reutilizada por Mercado Pago (routes/payment.js, routes/webhook.js) y Transbank (routes/transbank.js)
const { getFirestoreAdminSafe } = require('./firebase-admin');

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

async function loadProductsByIds(productIds) {
    const db = getFirestoreAdminSafe();
    if (!db) {
        throw new Error('Firestore Admin no disponible para validar carrito');
    }

    const normalizedIds = Array.from(new Set(productIds.map(normalizeEntityId).filter(Boolean)));
    const result = new Map();

    for (let index = 0; index < normalizedIds.length; index += 10) {
        const chunk = normalizedIds.slice(index, index + 10);
        const snapshot = await db.collection('products').where('__name__', 'in', chunk).get();
        snapshot.forEach((docSnap) => {
            result.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
    }

    return result;
}

async function findOrderByReference(orderReference) {
    const orderId = normalizeEntityId(orderReference);
    if (!orderId) {
        return null;
    }

    const db = getFirestoreAdminSafe();
    if (!db) {
        return null;
    }

    const directDoc = await db.collection('orders').doc(orderId).get();
    if (directDoc.exists) {
        return {
            firestoreDocId: directDoc.id,
            id: orderId,
            ...directDoc.data()
        };
    }

    const fallbackSnapshot = await db.collection('orders').where('id', '==', orderId).limit(1).get();
    if (fallbackSnapshot.empty) {
        return null;
    }

    const firstDoc = fallbackSnapshot.docs[0];
    return {
        firestoreDocId: firstDoc.id,
        id: firstDoc.data()?.id || firstDoc.id,
        ...firstDoc.data()
    };
}

/**
 * Marca la orden como pagada y descuenta el stock de forma atómica e idempotente.
 * @param {object} order - Orden con firestoreDocId.
 * @param {object} paymentMeta - Metadatos del pago (paymentMethod, gatewayPaymentId, gatewayStatus, paymentDate).
 */
async function markOrderAsPaid(order, paymentMeta = {}) {
    const db = getFirestoreAdminSafe();
    if (!db || !order?.firestoreDocId) {
        return;
    }

    const orderRef = db.collection('orders').doc(order.firestoreDocId);
    const paymentDate = paymentMeta.paymentDate || new Date().toISOString();
    const paymentMethod = paymentMeta.paymentMethod || 'unknown';
    const gatewayPaymentId = String(paymentMeta.gatewayPaymentId || '').trim();
    const gatewayStatus = paymentMeta.gatewayStatus || 'approved';

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
            paymentMethod,
            paymentDate,
            paymentGatewayStatus: gatewayStatus,
            paymentGatewayPaymentId: gatewayPaymentId,
            paymentProcessingStatus: 'completed',
            paymentProcessingUpdatedAt: nowIso,
            updatedAt: nowIso
        };

        // Mantener compatibilidad con los campos históricos de Mercado Pago
        if (paymentMethod === 'mercado_pago') {
            updatePayload.mercadoPagoStatus = gatewayStatus;
            updatePayload.mercadoPagoPaymentId = gatewayPaymentId;
        }
        if (paymentMethod === 'transbank_webpay') {
            updatePayload.transbankStatus = gatewayStatus;
            updatePayload.transbankBuyOrder = gatewayPaymentId;
        }

        // Idempotencia: si ya se ajustó inventario, solo actualizar estado.
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

module.exports = {
    buildOrderItemsSignature,
    findOrderByReference,
    loadProductsByIds,
    markOrderAsPaid,
    normalizeEntityId
};
