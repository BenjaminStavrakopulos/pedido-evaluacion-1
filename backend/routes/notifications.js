// notifications.js - Manejo de notificaciones (WhatsApp, Email, etc)
const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const requireApiKey = require('../middleware/require-api-key');
const { getFirestoreAdminSafe, verifyIdTokenSafe } = require('../lib/firebase-admin');
const emailService = require('../services/email');

async function findOrder(orderId) {
    const db = getFirestoreAdminSafe();
    if (!db) return null;
    const direct = await db.collection('orders').doc(String(orderId)).get();
    if (direct.exists) return { id: direct.id, ...direct.data() };
    const snapshot = await db.collection('orders').where('id', '==', String(orderId)).limit(1).get();
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

// ========== ENVIAR NOTIFICACIÓN POR WHATSAPP ==========
router.post('/send-whatsapp', requireApiKey, async (req, res) => {
    try {
        const { order } = req.body;
        
        if (!order) {
            return res.status(400).json({ 
                success: false, 
                error: 'Orden no proporcionada' 
            });
        }
        
        if (!whatsappService.isEnabled()) {
            return res.status(400).json({ 
                success: false, 
                error: 'Twilio no está configurado. Verifica TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_TO en .env' 
            });
        }

        const result = await whatsappService.sendNewOrderNotification(order);
        
        console.log(`✅ WhatsApp enviado. SID: ${result.messageId}`);
        
        res.json({ 
            success: true, 
            messageId: result.messageId,
            message: 'WhatsApp enviado correctamente' 
        });
        
    } catch (error) {
        console.error('❌ Error enviando WhatsApp:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ========== ENVIAR NOTIFICACIÓN DE ORDEN PAGADA (después de pago confirmado) ==========
router.post('/send-whatsapp-paid', requireApiKey, async (req, res) => {
    try {
        const { order } = req.body;
        
        if (!order) {
            return res.status(400).json({ 
                success: false, 
                error: 'Orden no proporcionada' 
            });
        }
        
        if (!whatsappService.isEnabled()) {
            return res.status(400).json({ 
                success: false, 
                error: 'Twilio no está configurado' 
            });
        }
        
        console.log(`📱 Enviando WhatsApp de orden pagada: ${order.id}`);
        
        const result = await whatsappService.sendPaidOrderNotification(order);
        
        console.log(`✅ WhatsApp de orden pagada enviado. SID: ${result.messageId}`);
        
        res.json({ 
            success: true, 
            messageId: result.messageId,
            message: 'WhatsApp de orden pagada enviado correctamente' 
        });
        
    } catch (error) {
        console.error('❌ Error enviando WhatsApp de orden pagada:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

router.post('/send-order-status-email', async (req, res) => {
    try {
        const token = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
        const decoded = await verifyIdTokenSafe(token);
        if (!decoded?.uid) return res.status(401).json({ success: false, error: 'Sesión inválida' });

        const db = getFirestoreAdminSafe();
        const user = await db.collection('users').doc(decoded.uid).get();
        const role = user.exists ? user.data()?.role : '';
        if (!['admin', 'bodeguero'].includes(role) && decoded.uid !== 'yFNJUJUJiaXbOiHLGGPsIJWShbC2') {
            return res.status(403).json({ success: false, error: 'No autorizado' });
        }

        const order = await findOrder(req.body?.orderId);
        const status = String(req.body?.status || '').trim().toLowerCase();
        if (!order || !['paid', 'shipped', 'delivered', 'refunded', 'cancelled'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Orden o estado inválido' });
        }

        const sentStatuses = Array.isArray(order.statusEmailSentStatuses) ? order.statusEmailSentStatuses : [];
        if (sentStatuses.includes(status)) return res.json({ success: true, skipped: true });

        const sent = await emailService.sendStatusEmail(order, status);
        if (sent) {
            await db.collection('orders').doc(order.id).set({
                statusEmailSentStatuses: [...new Set([...sentStatuses, status])],
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }
        return res.json({ success: true, sent });
    } catch (error) {
        console.error('❌ Error enviando email de estado:', error);
        return res.status(500).json({ success: false, error: 'No se pudo enviar email de estado' });
    }
});

module.exports = router;
