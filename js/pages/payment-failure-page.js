(function () {
    function escapeHtml(value) {
        const text = value == null ? '' : String(value);
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const paymentRuntime = window.hairiaPaymentRuntime;

    function updateRetryLink(orderId) {
        const retryLink = document.querySelector('a.btn.btn-primary[href^="payment.html"]');
        if (!retryLink || !orderId) {
            return;
        }

        retryLink.href = `payment.html?orderId=${encodeURIComponent(orderId)}`;
    }

    async function renderOrderDetails() {
        const urlParams = new URLSearchParams(window.location.search);
        const orderId = urlParams.get('orderId');
        const detailsEl = document.getElementById('orderDetails');

        updateRetryLink(orderId);

        if (!orderId) {
            detailsEl.innerHTML = '<p>No se especifico orden en la URL.</p>';
            return;
        }

        try {
            const order = await paymentRuntime.fetchOrderStatus(orderId);
            const total = Number(order?.totals?.total) || 0;
            const paymentStatus = String(order?.paymentStatus || order?.status || 'rejected').toLowerCase();
            const statusText = paymentStatus === 'approved' || paymentStatus === 'paid' ? 'Pagada' : 'Rechazada';
            const statusColor = paymentStatus === 'approved' || paymentStatus === 'paid' ? '#27ae60' : '#e74c3c';

            detailsEl.innerHTML = `
                <div class="detail-row">
                    <span class="detail-label">Orden:</span>
                    <span class="detail-value">${escapeHtml(order.id || orderId)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Total:</span>
                    <span class="detail-value">${window.formatCLP ? window.formatCLP(total) : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(total)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Estado:</span>
                    <span class="detail-value" style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
                </div>
            `;
        } catch (error) {
            console.warn('No se pudo cargar estado autenticado de orden:', error.message);
            detailsEl.innerHTML = '<p>No se pudo cargar el detalle de la orden. Revisa Mis Ordenes.</p>';
        }
    }

    renderOrderDetails();
})();
