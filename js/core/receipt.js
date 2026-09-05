(function () {
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

    function openOrderReceipt(order) {
        if (!order) return;
        const items = Array.isArray(order.items) ? order.items : [];
        const totals = order.totals || {};
        const rows = items.map(item => `<tr><td>${escapeHtml(item.name || 'Producto')}</td><td>${Number(item.quantity) || 0}</td><td>${formatCLP(item.price)}</td><td>${formatCLP((Number(item.price) || 0) * (Number(item.quantity) || 0))}</td></tr>`).join('');
        const receipt = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Boleta Monsite</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:auto;padding:28px;color:#172033}h1{margin-bottom:4px}.brand{color:#2563eb;font-weight:700}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:10px;border-bottom:1px solid #dbe2ea}th{background:#f3f6fa}.total{text-align:right;font-size:1.2rem;font-weight:700}</style></head><body><div class="brand">Monsite</div><h1>Boleta de compra</h1><p>Orden: <strong>#${escapeHtml(order.id || '')}</strong></p><p>Fecha: ${escapeHtml(order.createdAt || order.paymentDate || '')}</p><table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p>Subtotal: ${formatCLP(totals.subtotal)}</p><p>Envío: ${formatCLP(totals.shipping)}</p><p>Descuento: ${formatCLP(totals.discount)}</p><p class="total">Total: ${formatCLP(totals.total)}</p><script>window.onload=function(){setTimeout(function(){window.print()},250)};<\/script></body></html>`;
        const popup = window.open('', '_blank', 'width=820,height=700');
        if (!popup) return;
        popup.document.write(receipt);
        popup.document.close();
    }

    window.openOrderReceipt = openOrderReceipt;
})();
