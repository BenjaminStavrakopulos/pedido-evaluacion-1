const twilio = require('twilio');

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioWhatsappFrom = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
const twilioWhatsappTo = process.env.TWILIO_WHATSAPP_TO;

const isValidTwilioSid = typeof twilioAccountSid === 'string' && /^AC[a-zA-Z0-9]{32}$/.test(twilioAccountSid);
const isValidTwilioToken = typeof twilioAuthToken === 'string' && /^[a-zA-Z0-9]{32}$/.test(twilioAuthToken);
const hasValidDestination = typeof twilioWhatsappTo === 'string' && /^whatsapp:\+\d{8,15}$/.test(twilioWhatsappTo.trim());

if (!isValidTwilioSid || !isValidTwilioToken || !hasValidDestination) {
    console.warn('⚠️ Twilio no configurado completamente. WhatsApp deshabilitado.');
}

const twilioClient = isValidTwilioSid && isValidTwilioToken && hasValidDestination
    ? twilio(twilioAccountSid, twilioAuthToken)
    : null;

function isEnabled() {
    return Boolean(twilioClient);
}

function formatCLP(value) {
    const amount = Number(value) || 0;
    return `$${amount.toLocaleString('es-CL')}`;
}

function normalizeTotals(order) {
    if (order?.totals) {
        return {
            subtotal: Number(order.totals.subtotal) || 0,
            shipping: Number(order.totals.shipping) || 0,
            total: Number(order.totals.total) || 0
        };
    }

    const subtotal = (order?.items || []).reduce((sum, item) => {
        const price = Number(item?.price) || 0;
        const quantity = Number(item?.quantity) || 0;
        return sum + (price * quantity);
    }, 0);
    const shipping = Number(order?.shipping) || 0;

    return {
        subtotal,
        shipping,
        total: subtotal + shipping
    };
}

function generatePaidOrderMessage(order) {
    const totals = normalizeTotals(order);
    const createdAt = order?.createdAt ? new Date(order.createdAt).toLocaleString('es-CL') : new Date().toLocaleString('es-CL');

    let message = `🎉 *ORDEN PAGADA Y CONFIRMADA*\n\n`;
    message += `📋 *Orden:* #${order?.id || 'N/A'}\n`;
    message += `📅 *Fecha:* ${createdAt}\n`;
    message += `✅ *Estado:* PAGADA\n\n`;

    message += `👤 *CLIENTE*\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    message += `Nombre: ${order?.shippingData?.firstName || ''} ${order?.shippingData?.lastName || ''}\n`;
    message += `Teléfono: ${order?.shippingData?.phone || 'N/A'}\n\n`;

    message += `🛍️ *PRODUCTOS (${order?.items?.length || 0})*\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    (order?.items || []).forEach((item, index) => {
        const price = Number(item?.price) || 0;
        const quantity = Number(item?.quantity) || 0;
        message += `${index + 1}. ${item?.name || 'Producto'} × ${quantity} = ${formatCLP(price * quantity)}\n`;
    });

    message += `\n💰 *TOTAL: ${formatCLP(totals.total)}*\n\n`;
    message += `📦 La orden está lista para preparación y despacho.\n\n`;

    const frontendUrl = process.env.FRONTEND_URL || 'https://monsite.cl';
    message += `🔗 Admin: ${frontendUrl}/admin/admin-orders.html\n\n`;
    message += `_Monsite - Belleza & Cuidado Capilar_`;

    return message;
}

function generateNewOrderMessage(order) {
    const totals = normalizeTotals(order);
    const createdAt = order?.createdAt ? new Date(order.createdAt).toLocaleString('es-CL') : new Date().toLocaleString('es-CL');

    let message = `🛍️ *NUEVA ORDEN RECIBIDA*\n\n`;
    message += `📋 *Orden:* #${order?.id || 'N/A'}\n`;
    message += `📅 *Fecha:* ${createdAt}\n\n`;

    message += `👤 *CLIENTE*\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    message += `Nombre: ${order?.shippingData?.firstName || ''} ${order?.shippingData?.lastName || ''}\n`;
    message += `Teléfono: ${order?.shippingData?.phone || 'N/A'}\n`;
    message += `Email: ${order?.userEmail || order?.shippingData?.email || 'N/A'}\n\n`;

    message += `🛍️ *PRODUCTOS (${order?.items?.length || 0})*\n`;
    message += `━━━━━━━━━━━━━━━\n`;
    (order?.items || []).forEach((item, index) => {
        const price = Number(item?.price) || 0;
        const quantity = Number(item?.quantity) || 0;
        message += `${index + 1}. ${item?.name || 'Producto'} × ${quantity} = ${formatCLP(price * quantity)}\n`;
    });

    message += `\n💰 *TOTAL: ${formatCLP(totals.total)}*\n\n`;

    const frontendUrl = process.env.FRONTEND_URL || 'https://monsite.cl';
    message += `🔗 Admin: ${frontendUrl}/admin/admin-orders.html\n\n`;
    message += `_Monsite - Belleza & Cuidado Capilar_`;

    return message;
}

async function sendNewOrderNotification(order) {
    if (!isEnabled()) {
        return { success: false, error: 'Twilio no configurado' };
    }

    const body = generateNewOrderMessage(order);
    const result = await twilioClient.messages.create({
        from: twilioWhatsappFrom,
        to: twilioWhatsappTo,
        body
    });

    return {
        success: true,
        messageId: result.sid
    };
}

async function sendPaidOrderNotification(order) {
    if (!isEnabled()) {
        return { success: false, error: 'Twilio no configurado' };
    }

    const body = generatePaidOrderMessage(order);
    const result = await twilioClient.messages.create({
        from: twilioWhatsappFrom,
        to: twilioWhatsappTo,
        body
    });

    return {
        success: true,
        messageId: result.sid
    };
}

module.exports = {
    isEnabled,
    sendNewOrderNotification,
    sendPaidOrderNotification,
    generateNewOrderMessage,
    generatePaidOrderMessage
};
