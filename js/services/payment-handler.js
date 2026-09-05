// payment-handler.js - Manejador de pagos con Mercado Pago
// Conecta el frontend con el backend

const paymentRuntime = window.hairiaPaymentRuntime;

/**
 * Crear preferencia de pago en Mercado Pago
 * @param {Object} cartItems - Items del carrito
 * @param {Object} userInfo - Datos del usuario (email, nombre, etc)
 * @param {Object} shippingData - Datos de envío
 * @returns {Promise<Object>} - { preferenceId, init_point, sandbox_init_point }
 */
async function createPaymentPreference(cartItems, userInfo, shippingData) {
    try {
        console.log('💳 Creando preferencia de pago...');

        // Validar datos
        if (!cartItems || cartItems.length === 0) {
            throw new Error('El carrito está vacío');
        }

        if (!userInfo || !userInfo.email) {
            throw new Error('Falta información del usuario');
        }

        if (!shippingData || !shippingData.address) {
            throw new Error('Falta información de envío');
        }

        // Preparar items para el backend
        const formattedItems = cartItems.map(item => ({
            id: item.id || item.productId || item.product?.id || '',
            name: item.name || item.title,
            price: item.price || item.priceUnit,
            quantity: item.quantity || 1,
            description: item.description || ''
        }));

        // Realizar petición al backend
        const runtimeConfig = paymentRuntime?.getConfig() || window.PAYMENT_CONFIG || {};
        const backendUrl = paymentRuntime?.getBackendUrl() || runtimeConfig.backendUrl || window.BACKEND_URL || 'http://localhost:3000';

        const response = await fetch(`${backendUrl}/api/payment/create-preference`, {
            method: 'POST',
            headers: await (paymentRuntime?.buildAuthHeaders({ 'Content-Type': 'application/json' }) || { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                items: formattedItems,
                email: userInfo.email,
                firstName: shippingData.name || userInfo.name || 'Cliente',
                lastName: shippingData.lastName || '',
                phone: shippingData.phone || '912345678',
                address: shippingData.address || '',
                city: shippingData.city || 'Santiago'
            })
        });

        // Verificar respuesta
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Error al crear preferencia de pago');
        }

        const data = await response.json();

        console.log('✅ Preferencia creada:', data.preferenceId);
        console.log('🔗 URL de pago:', data.init_point);

        return {
            success: true,
            preferenceId: data.preferenceId,
            paymentUrl: data.init_point, // URL en producción
            sandboxUrl: data.sandbox_init_point, // URL en sandbox
            redirect_url: runtimeConfig.useSandboxCheckout === true
                ? (data.sandbox_init_point || data.init_point)
                : (data.init_point || data.sandbox_init_point)
        };

    } catch (error) {
        console.error('❌ Error creando preferencia:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Obtener estado de un pago
 * @param {string} paymentId - ID del pago en Mercado Pago
 * @returns {Promise<Object>} - { status, amount, created_at }
 */
async function getPaymentStatus(paymentId, orderId) {
    try {
        if (!orderId) {
            throw new Error('orderId es requerido para consultar estado de pago');
        }

        const encodedOrderId = encodeURIComponent(String(orderId));
        const backendUrl = paymentRuntime?.getBackendUrl() || window.BACKEND_URL || 'http://localhost:3000';
        const response = await fetch(`${backendUrl}/api/payment/status/${paymentId}?orderId=${encodedOrderId}`, {
            headers: await (paymentRuntime?.buildAuthHeaders() || {})
        });
        
        if (!response.ok) {
            throw new Error('Error obteniendo estado del pago');
        }

        return await response.json();

    } catch (error) {
        console.error('❌ Error obteniendo estado:', error);
        return { error: error.message };
    }
}

/**
 * Procesar reembolso (devolución)
 * @param {string} paymentId - ID del pago a devolver
 * @returns {Promise<Object>} - { success, refundId, status }
 */
async function processRefund(paymentId) {
    try {
        const backendUrl = paymentRuntime?.getBackendUrl() || window.BACKEND_URL || 'http://localhost:3000';
        const response = await fetch(`${backendUrl}/api/payment/refund/${paymentId}`, {
            method: 'POST',
            headers: await (paymentRuntime?.buildAuthHeaders() || {})
        });

        if (!response.ok) {
            throw new Error('Error procesando reembolso');
        }

        return await response.json();

    } catch (error) {
        console.error('❌ Error en reembolso:', error);
        return { error: error.message };
    }
}

/**
 * Verificar que el backend está activo
 * @returns {Promise<boolean>}
 */
async function checkBackendStatus() {
    try {
        const backendUrl = paymentRuntime?.getBackendUrl() || window.BACKEND_URL || 'http://localhost:3000';
        const response = await fetch(`${backendUrl}/health`);
        return response.ok;
    } catch (error) {
        console.warn('⚠️ Backend no disponible:', error.message);
        return false;
    }
}

/**
 * Simular pago (modo prueba, sin credenciales)
 * Útil durante desarrollo
 */
function simulatePayment(cartItems, userInfo, shippingData) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({
                success: true,
                preferenceId: 'TEST_' + Date.now(),
                paymentUrl: 'https://www.mercadopago.com/mco/checkout/play',
                message: '⚠️ Modo simulación - Necesitas credenciales reales de Mercado Pago'
            });
        }, 1000);
    });
}

// Exportar para uso global
window.PaymentHandler = {
    createPaymentPreference,
    getPaymentStatus,
    processRefund,
    checkBackendStatus,
    simulatePayment
};

console.log('✅ Payment Handler cargado - window.PaymentHandler disponible');
