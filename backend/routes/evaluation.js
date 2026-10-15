const express = require('express');
const { getFirestoreAdminSafe } = require('../lib/firebase-admin');
const { findOrderByReference, markOrderAsPaid } = require('../lib/order-payment');

const router = express.Router();

// Esta API no reproduce las pasarelas: ejercita la logica existente con datos ficticios.
router.post('/payments', async (req, res, next) => {
    const { orderId } = req.body || {};
    if (typeof orderId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(orderId)) {
        return res.status(400).json({ error: 'orderId invalido' });
    }
    try {
        if (!getFirestoreAdminSafe()) {
            throw new Error('Firestore Emulator no disponible');
        }
        const order = await findOrderByReference(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Orden ficticia no encontrada' });
        }
        if (!Array.isArray(order.items) || order.items.length === 0) {
            return res.status(409).json({ error: 'La orden ficticia no tiene productos' });
        }
        await markOrderAsPaid(order, {
            paymentMethod: 'evaluation_mock',
            gatewayPaymentId: `mock-${orderId}`,
            gatewayStatus: 'approved'
        });
        return res.json({ simulated: true, charged: false, orderId, status: 'approved' });
    } catch (error) {
        return next(error);
    }
});

router.post('/notifications', async (req, res, next) => {
    const { channel, message } = req.body || {};
    if (!['email', 'whatsapp'].includes(channel)
        || typeof message !== 'string' || !message.trim() || message.length > 1000) {
        return res.status(400).json({ error: 'channel o message invalido' });
    }
    try {
        const db = getFirestoreAdminSafe();
        if (!db) {
            throw new Error('Firestore Emulator no disponible');
        }
        const notification = await db.collection('evaluation-outbox').add({
            channel, message, simulated: true, delivered: false
        });
        return res.status(202).json({
            id: notification.id, simulated: true, delivered: false
        });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
