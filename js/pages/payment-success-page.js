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

    // Esperar a que Firebase Auth restaure el usuario (para tener el token disponible)
    function waitForAuthUser(maxWaitMs = 6000) {
        return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
                const user = window.firebase?.auth?.currentUser;
                if (user) {
                    resolve(user);
                    return;
                }
                if (Date.now() - start >= maxWaitMs) {
                    resolve(null); // seguir sin token tras el timeout
                    return;
                }
                setTimeout(check, 150);
            };
            check();
        });
    }

    // Render optimista: muestra el estado conocido desde la URL sin esperar al backend
    function renderOptimistic(orderId, isApproved) {
        const statusText = isApproved ? 'Pagada' : 'En validacion';
        const statusColor = isApproved ? '#27ae60' : '#f39c12';
        document.getElementById('orderDetails').innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Orden:</span>
                <span class="detail-value">${escapeHtml(orderId)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Estado:</span>
                <span class="detail-value" style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
            </div>
            <div class="detail-row">
                <span class="detail-value" style="color:#64748b; font-size:0.9em;">Cargando detalle...</span>
            </div>
        `;
    }

    async function renderOrderDetails() {
        const urlParams = new URLSearchParams(window.location.search);
        const orderId = urlParams.get('orderId');
        // Mercado Pago devuelve payment_id y status en la URL tras el pago
        const paymentId = urlParams.get('payment_id') || urlParams.get('collection_id');
        const mpStatus = (urlParams.get('status') || urlParams.get('collection_status') || '').toLowerCase();
        const mpApproved = mpStatus === 'approved';

        if (!orderId) {
            document.getElementById('orderDetails').innerHTML = '<p>No se encontro informacion de la orden.</p>';
            return;
        }

        // Si MP ya dijo que está aprobado en la URL, mostrar "Pagada" de inmediato
        // mientras se confirma en segundo plano (evita el parpadeo de "En validación").
        if (mpApproved) {
            renderOptimistic(orderId, true);
        }

        try {
            // Esperar a que Firebase restaure la sesión para tener el token
            await waitForAuthUser();

            // Confirmar el pago con MP (respaldo del webhook): marca la orden como pagada.
            // Se hace en segundo plano; la UI ya mostró "Pagada" si MP lo confirmó en la URL.
            if (paymentId && typeof paymentRuntime.confirmMercadoPagoPayment === 'function') {
                try {
                    const result = await paymentRuntime.confirmMercadoPagoPayment(orderId, paymentId);
                    console.log('✅ Confirmación de pago:', result?.status);
                } catch (confirmError) {
                    console.warn('No se pudo confirmar el pago de inmediato:', confirmError.message);
                }
            }

            const order = await paymentRuntime.fetchOrderStatus(orderId);
            const total = Number(order?.totals?.total) || 0;
            const fullName = `${order?.shipping?.firstName || ''} ${order?.shipping?.lastName || ''}`.trim();
            // Si MP ya lo aprobó en la URL, forzar "Pagada" aunque el backend aún no refleje el cambio
            const rawStatus = String(order?.paymentStatus || order?.status || 'pending').toLowerCase();
            const isPaid = mpApproved || rawStatus === 'approved' || rawStatus === 'paid';
            const statusText = isPaid ? 'Pagada' : 'En validacion';
            const statusColor = isPaid ? '#27ae60' : '#f39c12';

            const detailsHTML = `
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
                <div class="detail-row">
                    <span class="detail-label">Envio a:</span>
                    <span class="detail-value">${escapeHtml(fullName || 'Cliente')}</span>
                </div>
            `;
            document.getElementById('orderDetails').innerHTML = detailsHTML;
        } catch (error) {
            console.warn('No se pudo cargar estado autenticado de orden:', error.message);
            document.getElementById('orderDetails').innerHTML = '<p>No se pudo cargar el detalle de la orden. Revisa Mis Ordenes.</p>';
        }
    }

    renderOrderDetails();

    let secondsLeft = 8;
    const countdownEl = document.getElementById('redirectCountdown');
    const timer = setInterval(() => {
        secondsLeft -= 1;
        if (countdownEl) {
            countdownEl.textContent = String(Math.max(secondsLeft, 0));
        }

        if (secondsLeft <= 0) {
            clearInterval(timer);
            window.location.href = 'index.html';
        }
    }, 1000);
})();
