// whatsapp-notifications.js - Sistema de notificaciones por WhatsApp con Twilio
console.log('📱 whatsapp-notifications.js cargado');

// ========== CONFIGURACIÓN ==========
const WHATSAPP_CONFIG = {
    enabled: false,
    allowClientRequests: Boolean(window.hairiaPaymentRuntime?.getConfig()?.allowClientRequests),
    backendUrl: window.hairiaPaymentRuntime?.getBackendUrl() || window.BACKEND_URL || 'http://localhost:3000'
};

// ========== ENVIAR NOTIFICACIÓN DE NUEVA ORDEN VIA WHATSAPP ==========
async function sendWhatsAppOrderNotification(order) {
    console.log('📱 Enviando notificación WhatsApp de orden:', order.id);
    
    if (!WHATSAPP_CONFIG.enabled) {
        console.warn('⚠️ WhatsApp deshabilitado en configuración');
        return false;
    }
    
    try {
        const result = await sendWhatsAppViaBackend(order);
        
        if (result && result.success) {
            console.log('✅ WhatsApp enviado correctamente');
            return true;
        } else {
            console.error('❌ Error enviando WhatsApp:', result?.error || 'Error desconocido');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error enviando notificación WhatsApp:', error);
        return false;
    }
}

// ========== GENERAR MENSAJE DE WHATSAPP ==========
function generateWhatsAppMessage(order) {
    // Calcular total
    let orderTotal = 0;
    let orderSubtotal = 0;
    let orderShipping = 0;
    
    if (order.totals) {
        orderTotal = order.totals.total || 0;
        orderSubtotal = order.totals.subtotal || 0;
        orderShipping = order.totals.shipping || 0;
    } else {
        orderSubtotal = (order.items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
        orderShipping = order.shipping || 0;
        orderTotal = orderSubtotal + orderShipping;
    }
    
    // Emojis y formato profesional
    let message = `🛍️ *NUEVA ORDEN RECIBIDA*\n\n`;
    message += `📋 *Orden:* #${order.id}\n`;
    message += `📅 *Fecha:* ${new Date(order.createdAt).toLocaleString('es-CL')}\n\n`;
    
    message += `👤 *CLIENTE*\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    message += `Nombre: ${order.shippingData?.firstName || ''} ${order.shippingData?.lastName || ''}\n`;
    message += `RUT: ${order.shippingData?.rut || 'N/A'}\n`;
    message += `Teléfono: ${order.shippingData?.phone || 'N/A'}\n`;
    message += `Email: ${order.userEmail || order.shippingData?.email || 'N/A'}\n\n`;
    
    message += `📍 *DIRECCIÓN DE ENVÍO*\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    message += `${order.shippingData?.street || 'N/A'}`;
    if (order.shippingData?.apartment) {
        message += `, ${order.shippingData.apartment}`;
    }
    message += `\n${order.shippingData?.city || 'N/A'}, ${order.shippingData?.region || 'N/A'}\n`;
    message += `\n`;
    
    message += `🛍️ *PRODUCTOS (${order.items?.length || 0})*\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    (order.items || []).forEach((item, index) => {
        message += `${index + 1}. *${item.name}*\n`;
        message += `   Cantidad: ${item.quantity} × $${(item.price || 0).toLocaleString('es-CL')}\n`;
        message += `   Subtotal: $${((item.price || 0) * item.quantity).toLocaleString('es-CL')}\n`;
    });
    
    message += `\n💰 *TOTALES*\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    message += `Subtotal: $${orderSubtotal.toLocaleString('es-CL')}\n`;
    message += `Envío: $${orderShipping.toLocaleString('es-CL')}\n`;
    message += `*TOTAL: $${orderTotal.toLocaleString('es-CL')}*\n\n`;
    
    if (order.shippingData?.notes) {
        message += `📝 *Notas del cliente:*\n`;
        message += `"${order.shippingData.notes}"\n\n`;
    }
    
    message += `🔗 Ver en admin: https://tudominio.com/admin/admin-orders.html\n\n`;
    message += `_Monsite - Belleza & Cuidado Capilar_`;
    
    return message;
}

// ========== FUNCIÓN ALTERNATIVA: ENVIAR VIA SERVIDOR BACKEND ==========
// Esta es la forma RECOMENDADA para producción (más segura)
async function sendWhatsAppViaBackend(order) {
    try {
        if (!WHATSAPP_CONFIG.allowClientRequests) {
            return {
                success: false,
                error: 'Notificaciones desde cliente deshabilitadas por seguridad'
            };
        }

        const headers = {
            'Content-Type': 'application/json'
        };

        const response = await fetch(`${WHATSAPP_CONFIG.backendUrl}/api/notifications/send-whatsapp`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ order })
        });
        
        if (!response.ok) {
            throw new Error('Error en el servidor');
        }
        
        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('❌ Error llamando al backend:', error);
        return { success: false, error: error.message };
    }
}

// Exponer funciones globalmente
window.sendWhatsAppOrderNotification = sendWhatsAppOrderNotification;
window.WHATSAPP_CONFIG = WHATSAPP_CONFIG;

console.log('✅ Sistema de WhatsApp listo');
