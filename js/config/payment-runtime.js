(function () {
    let cachedConfig = null;

    function getDefaultBackendUrl() {
        if (typeof window.BACKEND_URL === 'string' && window.BACKEND_URL.trim()) {
            return window.BACKEND_URL.trim();
        }

        return ['localhost', '127.0.0.1'].includes(window.location.hostname)
            ? 'http://localhost:3000'
            : 'https://skating-dimmed-splice.ngrok-free.dev';
    }

    function loadPaymentConfigFromLocalJson() {
        try {
            const request = new XMLHttpRequest();
            request.open('GET', '/js/config/payment-config.local.json', false);
            request.send(null);

            if (request.status >= 200 && request.status < 300 && request.responseText) {
                const parsed = JSON.parse(request.responseText);
                if (parsed && typeof parsed === 'object') {
                    return parsed;
                }
            }
        } catch (_) {
            // no-op
        }

        return null;
    }

    function getConfig() {
        if (cachedConfig) {
            return cachedConfig;
        }

        const fallback = {
            allowClientRequests: Boolean(window.ALLOW_CLIENT_NOTIFICATION_REQUESTS),
            backendUrl: getDefaultBackendUrl(),
            forceSimulatedMode: false,
            mpPublicKey: typeof window.MP_PUBLIC_KEY === 'string' ? window.MP_PUBLIC_KEY : '',
            useSandboxCheckout: false
        };

        const localConfig = loadPaymentConfigFromLocalJson() || {};
        const injectedConfig = window.PAYMENT_CONFIG && typeof window.PAYMENT_CONFIG === 'object'
            ? window.PAYMENT_CONFIG
            : {};

        cachedConfig = {
            ...fallback,
            ...localConfig,
            ...injectedConfig
        };

        window.PAYMENT_CONFIG = cachedConfig;
        window.BACKEND_URL = cachedConfig.backendUrl;
        return cachedConfig;
    }

    function getBackendUrl() {
        return String(getConfig().backendUrl || '').trim() || getDefaultBackendUrl();
    }

    async function buildAuthHeaders(baseHeaders = {}) {
        const headers = { ...baseHeaders };

        // ngrok gratis muestra una página de advertencia que rompe CORS;
        // este header la salta. Solo aplica cuando el backend es ngrok (desarrollo).
        if (/ngrok(-free)?\.(dev|app|io)/i.test(getBackendUrl())) {
            headers['ngrok-skip-browser-warning'] = 'true';
        }

        try {
            const firebaseUser = window.firebase?.auth?.currentUser;
            if (firebaseUser && typeof firebaseUser.getIdToken === 'function') {
                const idToken = await firebaseUser.getIdToken();
                if (idToken) {
                    headers.Authorization = `Bearer ${idToken}`;
                }
            }
        } catch (error) {
            console.warn('⚠️ No se pudo adjuntar token de sesión para backend:', error);
        }

        return headers;
    }

    async function fetchOrderStatus(orderId) {
        const response = await fetch(`${getBackendUrl()}/api/payment/order-status/${encodeURIComponent(orderId)}`, {
            headers: await buildAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`No se pudo cargar la orden (${response.status})`);
        }

        return response.json();
    }

    // Confirmar el pago con Mercado Pago cuando el cliente vuelve (respaldo del webhook)
    async function confirmMercadoPagoPayment(orderId, paymentId) {
        const response = await fetch(`${getBackendUrl()}/api/payment/confirm`, {
            method: 'POST',
            headers: await buildAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ orderId, payment_id: paymentId })
        });

        if (!response.ok) {
            throw new Error(`No se pudo confirmar el pago (${response.status})`);
        }

        return response.json();
    }

    // Sincronizar las órdenes pendientes del usuario con Mercado Pago.
    // Marca como pagadas las que MP confirme, aunque el cliente no haya esperado en la página de éxito.
    async function syncPendingOrders() {
        const response = await fetch(`${getBackendUrl()}/api/payment/sync-pending`, {
            method: 'POST',
            headers: await buildAuthHeaders({ 'Content-Type': 'application/json' })
        });

        if (!response.ok) {
            throw new Error(`No se pudieron sincronizar las órdenes (${response.status})`);
        }

        return response.json();
    }

    window.hairiaPaymentRuntime = {
        buildAuthHeaders,
        confirmMercadoPagoPayment,
        fetchOrderStatus,
        syncPendingOrders,
        getBackendUrl,
        getConfig
    };
})();