const nodemailer = require('nodemailer');

function isEnabled() {
  return Boolean(
    process.env.SMTP_HOST
      && process.env.SMTP_PORT
      && process.env.SMTP_USER
      && process.env.SMTP_PASSWORD
      && process.env.EMAIL_FROM
  );
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCLP(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  });
}

function getOrderEmail(order) {
  return String(order?.userEmail || order?.shippingData?.email || '').trim();
}

function buildReceiptHtml(order, title = 'Boleta de compra') {
  const items = Array.isArray(order?.items) ? order.items : [];
  const totals = order?.totals || {};
  const rows = items.map(item => `
    <tr>
      <td>${escapeHtml(item.name || 'Producto')}</td>
      <td>${Number(item.quantity) || 0}</td>
      <td>${formatCLP(item.price)}</td>
      <td>${formatCLP((Number(item.price) || 0) * (Number(item.quantity) || 0))}</td>
    </tr>`).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>body{font-family:Arial,sans-serif;color:#172033;max-width:760px;margin:0 auto;padding:24px}h1{margin-bottom:4px}p{color:#526174}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #dbe2ea}th{background:#f3f6fa}.total{font-size:1.2rem;font-weight:700;text-align:right}.brand{color:#2563eb;font-weight:700}</style></head>
  <body><div class="brand">Monsite</div><h1>${escapeHtml(title)}</h1><p>Orden: <strong>#${escapeHtml(order?.id || '')}</strong></p><p>Fecha: ${escapeHtml(order?.createdAt || order?.paymentDate || '')}</p>
  <p>Cliente: ${escapeHtml(`${order?.shippingData?.firstName || ''} ${order?.shippingData?.lastName || ''}`.trim())}</p>
  <table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>
  <p>Subtotal: ${formatCLP(totals.subtotal)}</p><p>Envío: ${formatCLP(totals.shipping)}</p><p>Descuento: ${formatCLP(totals.discount)}</p><p class="total">Total: ${formatCLP(totals.total)}</p></body></html>`;
}

async function sendReceiptEmail(order) {
  const to = getOrderEmail(order);
  if (!isEnabled() || !to) return false;
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Boleta de compra Monsite #${order.id || ''}`,
    html: buildReceiptHtml(order)
  });
  return true;
}

async function sendStatusEmail(order, status) {
  const to = getOrderEmail(order);
  if (!isEnabled() || !to) return false;
  const labels = { paid: 'pagada', shipped: 'en camino', delivered: 'entregada', refunded: 'devuelta', cancelled: 'cancelada' };
  const label = labels[status] || status;
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Actualización de tu orden Monsite #${order.id || ''}`,
    html: `<p>Hola ${escapeHtml(order?.shippingData?.firstName || '')},</p><p>Tu orden <strong>#${escapeHtml(order.id || '')}</strong> ahora está <strong>${escapeHtml(label)}</strong>.</p>${buildReceiptHtml(order, 'Resumen de tu orden')}`
  });
  return true;
}

module.exports = { buildReceiptHtml, isEnabled, sendReceiptEmail, sendStatusEmail };
