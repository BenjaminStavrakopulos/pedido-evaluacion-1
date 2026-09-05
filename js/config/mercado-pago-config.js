// Configuración de Mercado Pago - frontend sin secretos
const paymentRuntime = window.hairiaPaymentRuntime;
const localPaymentConfig = paymentRuntime?.getConfig() || window.PAYMENT_CONFIG || {};
const MP_PUBLIC_KEY = localPaymentConfig.mpPublicKey || window.MP_PUBLIC_KEY || '';

// Inicializar SDK de Mercado Pago de forma robusta (esperar si se carga dinámicamente)
function waitForMercadoPago(timeout = 5000) {
    return new Promise((resolve) => {
        if (window.MercadoPago) {
            resolve(window.MercadoPago);
            return;
        }

        const start = Date.now();
        const int = setInterval(() => {
            if (window.MercadoPago) {
                clearInterval(int);
                resolve(window.MercadoPago);
            } else if (Date.now() - start > timeout) {
                clearInterval(int);
                resolve(null);
            }
        }, 200);
    });
}

async function initMercadoPagoIfAvailable() {
    if (!MP_PUBLIC_KEY) {
        console.warn('⚠️ MP_PUBLIC_KEY no configurada');
        return;
    }

    const MP = await waitForMercadoPago();
    if (MP) {
        try {
            const mp = new MP(MP_PUBLIC_KEY, { locale: 'es-CL' });
            window.mp = mp;
            console.log('✅ Mercado Pago SDK inicializado para Checkout Pro');
        } catch (e) {
            console.warn('⚠️ Error inicializando Mercado Pago SDK:', e);
        }
    } else {
        console.warn('⚠️ Mercado Pago SDK no disponible (probablemente estás en localhost o no cargó a tiempo)');
    }
}

// Lanzar inicialización en background (no bloqueante)
initMercadoPagoIfAvailable();

/**
 * Crear preferencia de pago en Mercado Pago
 * NOTA: En producción, esto debería hacerse desde el backend
 */
async function createCheckoutPreference(order) {
    try {
        console.log('📋 Creando preferencia de pago...');

        const preferenceData = {
            items: order.items.map(item => ({
                id: item.id || item.productId || item.product?.id || '',
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                description: item.description || ''
            })),
            email: order.shippingData.email,
            firstName: order.shippingData.firstName,
            lastName: order.shippingData.lastName,
            phone: order.shippingData.phone,
            address: order.shippingData.street,
            city: order.shippingData.city,
            orderId: order.id
        };

        console.log('📤 Datos de preferencia:', preferenceData);

        const response = await fetch(`${paymentRuntime?.getBackendUrl() || window.BACKEND_URL || 'http://localhost:3000'}/api/payment/create-preference`, {
            method: 'POST',
            headers: await (paymentRuntime?.buildAuthHeaders({ 'Content-Type': 'application/json' }) || { 'Content-Type': 'application/json' }),
            body: JSON.stringify(preferenceData)
        });

        console.log('📥 Respuesta de Mercado Pago:', response.status, response.statusText);

        if (!response.ok) {
            const errorData = await response.json();
            console.error('🔴 Error de Mercado Pago:', errorData);
            throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(errorData)}`);
        }

        const preference = await response.json();
        console.log('✅ Preferencia creada:', preference);

        return {
            id: preference.preferenceId,
            init_point: preference.init_point,
            sandbox_init_point: preference.sandbox_init_point
        };

    } catch (error) {
        console.error('❌ Error creando preferencia:', error);
        throw error;
    }
}

/**
 * Redirigir a Checkout Pro de Mercado Pago
 */
async function redirectToCheckoutPro(order) {
    try {
        console.log('🔄 Redirigiendo a Checkout Pro...');
        
        // Crear preferencia
        const preference = await createCheckoutPreference(order);
        
        // Redirigir a Checkout Pro usando la URL pública de preferencia (no requiere SDK en cliente)
        if (preference && preference.id && (preference.init_point || preference.sandbox_init_point)) {
            const forceSandbox = localPaymentConfig.useSandboxCheckout === true;
            const checkoutUrl = forceSandbox
                ? (preference.sandbox_init_point || preference.init_point)
                : (preference.init_point || preference.sandbox_init_point);

            if (!checkoutUrl) {
                throw new Error('Mercado Pago no devolvió URL de checkout');
            }

            console.log('🌐 Redirigiendo a Checkout Pro:', checkoutUrl);
            window.location.href = checkoutUrl;
        } else {
            throw new Error('No se pudo crear la preferencia de pago (falta preference.id)');
        }

    } catch (error) {
        console.error('❌ Error redirigiendo a Checkout Pro:', error);
        throw error;
    }
}

