// routes/payment.js - Mercado Pago Payment Routes
const express = require('express');
const router = express.Router();
const mercadopago = require('mercadopago');
const {
    allowedOriginsSet,
    getFrontendBaseUrl,
    getWebhookUrl,
    isProduction
} = require('../config/app');
const { getFirestoreAdminSafe, verifyIdTokenSafe } = require('../lib/firebase-admin');
const { markOrderAsPaid } = require('../lib/order-payment');
const requireApiKey = require('../middleware/require-api-key');

function getMercadoPagoClient() {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
        return null;
    }

    return new mercadopago.MercadoPagoConfig({
        accessToken,
        options: { timeout: 5000 }
    });
}

function sanitizeText(value, { maxLength = 120, allowEmpty = false } = {}) {
    if (typeof value !== 'string') {
        return allowEmpty ? '' : null;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized && !allowEmpty) {
        return null;
    }

    return normalized.slice(0, maxLength);
}

function normalizeEntityId(value) {
    return String(value == null ? '' : value).trim();
}

// Calcula el precio unitario con el descuento del producto aplicado (desde Firestore).
// Replica la lógica del frontend (getDiscountedPrice) para cobrar lo que el cliente vio.
function getDiscountedUnitPrice(product) {
    const price = Number(product?.price) || 0;

    if (product?.discountType === 'percentage') {
        const pct = Number(product.discountPercent) || 0;
        if (pct > 0) {
            return Math.max(0, Math.round(price - (price * pct / 100)));
        }
    }

    if (product?.discountType === 'amount') {
        const amount = Number(product.discountAmount) || 0;
        if (amount > 0) {
            return Math.max(0, price - amount);
        }
    }

    return Math.round(price);
}

function getBearerToken(req) {
    const rawAuth = req.get('authorization') || '';
    const match = rawAuth.match(/^Bearer\s+(.+)$/i);
    return match ? String(match[1]).trim() : '';
}

async function findOrderByReference(orderReference) {
    const orderId = normalizeEntityId(orderReference);
    if (!orderId) {
        return null;
    }

    const db = getFirestoreAdminSafe();
    if (!db) {
        return null;
    }

    const directDoc = await db.collection('orders').doc(orderId).get();
    if (directDoc.exists) {
        return {
            firestoreDocId: directDoc.id,
            id: orderId,
            ...directDoc.data()
        };
    }

    const fallbackSnapshot = await db.collection('orders').where('id', '==', orderId).limit(1).get();
    if (fallbackSnapshot.empty) {
        return null;
    }

    const firstDoc = fallbackSnapshot.docs[0];
    return {
        firestoreDocId: firstDoc.id,
        id: firstDoc.data()?.id || firstDoc.id,
        ...firstDoc.data()
    };
}

function buildOrderItemsSignature(items) {
    if (!Array.isArray(items) || items.length === 0) {
        return '';
    }

    const normalized = items
        .map((item) => {
            const id = normalizeEntityId(item?.id || item?.productId || item?.product?.id);
            const quantity = Number.parseInt(item?.quantity, 10);
            if (!id || !Number.isInteger(quantity) || quantity <= 0) {
                return null;
            }
            return `${id}:${quantity}`;
        })
        .filter(Boolean)
        .sort();

    return normalized.join('|');
}

async function loadProductsByIds(productIds) {
    const db = getFirestoreAdminSafe();
    if (!db) {
        throw new Error('Firestore Admin no disponible para validar carrito');
    }

    const normalizedIds = Array.from(new Set(productIds.map(normalizeEntityId).filter(Boolean)));
    const result = new Map();

    for (let index = 0; index < normalizedIds.length; index += 10) {
        const chunk = normalizedIds.slice(index, index + 10);
        const snapshot = await db.collection('products').where('__name__', 'in', chunk).get();
        snapshot.forEach((docSnap) => {
            result.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        });
    }

    return result;
}

function isValidEmail(email) {
    if (typeof email !== 'string') {
        return false;
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.length <= 254;
}

function isValidPublicOrigin(origin) {
    if (!origin) {
        return false;
    }

    return allowedOriginsSet.has(origin);
}

function requirePublicOrigin(req, res, next) {
    if (!isProduction) {
        return next();
    }

    const origin = req.get('origin');
    if (!isValidPublicOrigin(origin)) {
        return res.status(403).json({ error: 'Origen no autorizado' });
    }

    return next();
}

/**
 * POST /api/payment/create-preference
 * Crear preferencia de pago en Mercado Pago
 */
router.post('/create-preference', requirePublicOrigin, async (req, res) => {
    try {
        const client = getMercadoPagoClient();
        if (!client) {
            return res.status(503).json({ error: 'MERCADOPAGO_ACCESS_TOKEN no configurado en backend' });
        }

        const frontendBaseUrl = getFrontendBaseUrl();
        const { items, email, firstName, lastName, phone, address, city, orderId } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'No hay items en el carrito' });
        }

        const requestedItems = items
            .map(item => ({
                productId: normalizeEntityId(item?.id || item?.productId),
                quantity: Number(item?.quantity),
                clientPrice: Number(item?.price)
            }))
            .filter(item => item.productId && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 100);

        if (requestedItems.length === 0 || requestedItems.length > 30) {
            return res.status(400).json({ error: 'Items inválidos' });
        }

        const productsById = await loadProductsByIds(requestedItems.map(item => item.productId));
        const normalizedItems = [];

        for (const item of requestedItems) {
            const product = productsById.get(item.productId);
            if (!product || product.active === false) {
                return res.status(400).json({ error: `Producto inválido o inactivo: ${item.productId}` });
            }

            const basePrice = Number(product.price);
            const validPrice = Number.isFinite(basePrice) && basePrice > 0 && basePrice <= 2000000;
            if (!validPrice) {
                return res.status(400).json({ error: `Precio inválido para producto: ${item.productId}` });
            }

            const stock = Number.parseInt(product.stock, 10);
            if (Number.isFinite(stock) && stock >= 0 && item.quantity > stock) {
                return res.status(400).json({ error: `Stock insuficiente para producto: ${item.productId}` });
            }

            // Aplicar el descuento del producto (leído de Firestore, igual que el frontend)
            const unitPrice = getDiscountedUnitPrice(product);

            normalizedItems.push({
                id: product.id,
                name: sanitizeText(product.name, { maxLength: 120 }) || 'Producto',
                description: sanitizeText(product.description, { maxLength: 300, allowEmpty: true }),
                price: unitPrice,
                quantity: item.quantity
            });
        }

        if (!isValidEmail(email)) {
            return res.status(400).json({ error: 'Email inválido' });
        }

        const sanitizedOrderId = sanitizeText(orderId, { maxLength: 80, allowEmpty: true });
        if (!sanitizedOrderId) {
            return res.status(400).json({ error: 'orderId requerido' });
        }

        const idToken = getBearerToken(req);
        const decodedToken = await verifyIdTokenSafe(idToken);
        if (!decodedToken?.uid) {
            return res.status(401).json({ error: 'Sesión inválida o expirada' });
        }

        const order = await findOrderByReference(sanitizedOrderId);
        if (!order || !order.firestoreDocId) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const orderOwnerId = normalizeEntityId(order.userId);
        if (!orderOwnerId || orderOwnerId !== decodedToken.uid) {
            return res.status(403).json({ error: 'No autorizado para pagar esta orden' });
        }

        const orderStatus = normalizeEntityId(order.status).toLowerCase();
        const orderPaymentStatus = normalizeEntityId(order.paymentStatus).toLowerCase();
        if (orderStatus === 'paid' || orderPaymentStatus === 'approved') {
            return res.status(409).json({ error: 'La orden ya se encuentra pagada' });
        }

        const requestedSignature = buildOrderItemsSignature(requestedItems);
        const orderSignature = buildOrderItemsSignature(order.items);
        if (!requestedSignature || !orderSignature || requestedSignature !== orderSignature) {
            return res.status(409).json({ error: 'El carrito no coincide con la orden guardada' });
        }

        const sanitizedFirstName = sanitizeText(firstName, { maxLength: 80, allowEmpty: true }) || 'Cliente';
        const sanitizedLastName = sanitizeText(lastName, { maxLength: 80, allowEmpty: true }) || '';
        const sanitizedAddress = sanitizeText(address, { maxLength: 160, allowEmpty: true }) || 'Dirección no especificada';
        const sanitizedCity = sanitizeText(city, { maxLength: 100, allowEmpty: true }) || 'Santiago';
        const sanitizedPhone = sanitizeText(phone, { maxLength: 20, allowEmpty: true }) || '';

        // Subtotal de productos (validado contra Firestore)
        const itemsSubtotal = normalizedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Costo de envío y descuento guardados en la orden (ya validados en el checkout)
        const shippingCost = Math.max(0, Math.round(Number(order?.totals?.shipping) || 0));
        const discountAmount = Math.max(0, Math.round(Number(order?.totals?.discount) || 0));

        // El total a cobrar es el total real de la orden: productos + envío - descuento
        let totalAmount = itemsSubtotal + shippingCost - discountAmount;

        // Si la orden guardó un total confiable, úsalo como referencia de seguridad
        const storedTotal = Math.round(Number(order?.totals?.total) || 0);
        if (storedTotal > 0 && Math.abs(storedTotal - totalAmount) > 1) {
            console.warn(`⚠️ Descuadre de total: orden=${storedTotal} calculado=${totalAmount}. Se usa el calculado.`);
        }

        if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
            return res.status(400).json({ error: 'Monto total inválido' });
        }

        const canUseAutoReturn = /^https:\/\//i.test(frontendBaseUrl);
        const shouldExpirePreference = process.env.MP_ENABLE_PREFERENCE_EXPIRATION === 'true' && isProduction;
        const backUrlOrderId = encodeURIComponent(sanitizedOrderId);

        // Construir items para MP: productos + envío (visible) - descuento (item negativo)
        const mpItems = normalizedItems.map(item => ({
            title: item.name,
            description: item.description || '',
            unit_price: item.price,
            quantity: item.quantity,
            currency_id: 'CLP'
        }));

        // Agregar el costo de envío como un item visible para que el cliente lo vea
        if (shippingCost > 0) {
            mpItems.push({
                title: 'Costo de envío',
                description: 'Despacho a domicilio',
                unit_price: shippingCost,
                quantity: 1,
                currency_id: 'CLP'
            });
        }

        // Aplicar el descuento como un item negativo (MP lo permite en Checkout Pro)
        if (discountAmount > 0) {
            mpItems.push({
                title: 'Descuento aplicado',
                description: 'Código de descuento',
                unit_price: -discountAmount,
                quantity: 1,
                currency_id: 'CLP'
            });
        }

        // Crear preferencia
        const preference = {
            items: mpItems,
            payment_methods: {
                installments: 12,
                excluded_payment_methods: [],
                excluded_payment_types: []
            },
            binary_mode: false,
            payer: {
                name: sanitizedFirstName,
                surname: sanitizedLastName,
                email: email.trim(),
                phone: {
                    area_code: '56',
                    number: sanitizedPhone
                },
                address: {
                    street_name: sanitizedAddress,
                    street_number: 1,
                    zip_code: sanitizedCity
                }
            },
            back_urls: {
                success: `${frontendBaseUrl}/payment-success.html?orderId=${backUrlOrderId}`,
                failure: `${frontendBaseUrl}/payment-failure.html?orderId=${backUrlOrderId}`,
                pending: `${frontendBaseUrl}/payment-pending.html?orderId=${backUrlOrderId}`
            },
            notification_url: getWebhookUrl(),
            external_reference: sanitizedOrderId,
            expires: false
        };

        if (canUseAutoReturn) {
            preference.auto_return = 'approved';
        }

        if (shouldExpirePreference) {
            preference.expires = true;
            preference.expiration_date_from = new Date().toISOString();
            preference.expiration_date_to = new Date(Date.now() + 86400000).toISOString(); // 24 horas
        }

        const db = getFirestoreAdminSafe();
        if (db) {
            await db.collection('orders').doc(order.firestoreDocId).set({
                paymentExpectedAmount: totalAmount,
                paymentExpectedCurrency: 'CLP',
                paymentItemsSignature: requestedSignature,
                paymentPreferenceCreatedAt: new Date().toISOString(),
                paymentPreferenceStatus: 'created',
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }

        // Crear preferencia en Mercado Pago
        const preferenceClient = new mercadopago.Preference(client);
        const mpResponse = await preferenceClient.create({ body: preference });

        console.log('✅ Preferencia creada:', mpResponse.id);

        res.json({
            success: true,
            preferenceId: mpResponse.id,
            init_point: mpResponse.init_point,
            sandbox_init_point: mpResponse.sandbox_init_point
        });

    } catch (error) {
        console.error('❌ Error creando preferencia:', error);
        res.status(500).json({ 
            error: 'Error al crear preferencia de pago',
            message: isProduction ? 'Error interno' : error.message
        });
    }
});

/**
 * GET /api/payment/status/:payment_id
 * Obtener estado de un pago
 */
router.get('/status/:payment_id', requirePublicOrigin, async (req, res) => {
    try {
        const client = getMercadoPagoClient();
        if (!client) {
            return res.status(503).json({ error: 'MERCADOPAGO_ACCESS_TOKEN no configurado en backend' });
        }

        const { payment_id } = req.params;
        const sanitizedOrderId = sanitizeText(req.query.orderId, { maxLength: 80, allowEmpty: true });
        if (!sanitizedOrderId) {
            return res.status(400).json({ error: 'orderId requerido para consultar estado' });
        }

        const idToken = getBearerToken(req);
        const decodedToken = await verifyIdTokenSafe(idToken);
        if (!decodedToken?.uid) {
            return res.status(401).json({ error: 'Sesión inválida o expirada' });
        }

        const order = await findOrderByReference(sanitizedOrderId);
        if (!order || !order.firestoreDocId) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const orderOwnerId = normalizeEntityId(order.userId);
        if (!orderOwnerId || orderOwnerId !== decodedToken.uid) {
            return res.status(403).json({ error: 'No autorizado para consultar esta orden' });
        }

        const expectedPaymentId = normalizeEntityId(order.mercadoPagoPaymentId);
        if (expectedPaymentId && expectedPaymentId !== normalizeEntityId(payment_id)) {
            return res.status(409).json({ error: 'El payment_id no coincide con la orden indicada' });
        }

        const paymentClient = new mercadopago.Payment(client);
        const payment = await paymentClient.get(payment_id);

        res.json({
            id: payment.id,
            status: payment.status,
            status_detail: payment.status_detail,
            amount: payment.transaction_amount
        });

    } catch (error) {
        console.error('❌ Error obteniendo estado de pago:', error);
        res.status(500).json({ error: 'Error al obtener estado de pago' });
    }
});

/**
 * POST /api/payment/confirm
 * Confirmar un pago cuando el cliente vuelve de Mercado Pago (respaldo del webhook).
 * La página de éxito llama aquí con el payment_id que MP devuelve en la URL.
 * Consulta el pago a MP directamente y marca la orden como pagada si está aprobada.
 */
router.post('/confirm', requirePublicOrigin, async (req, res) => {
    try {
        const client = getMercadoPagoClient();
        if (!client) {
            return res.status(503).json({ error: 'MERCADOPAGO_ACCESS_TOKEN no configurado en backend' });
        }

        const paymentId = normalizeEntityId(req.body?.payment_id || req.body?.paymentId);
        const sanitizedOrderId = sanitizeText(req.body?.orderId, { maxLength: 80, allowEmpty: true });

        if (!paymentId || !sanitizedOrderId) {
            return res.status(400).json({ error: 'payment_id y orderId requeridos' });
        }

        const idToken = getBearerToken(req);
        const decodedToken = await verifyIdTokenSafe(idToken);
        if (!decodedToken?.uid) {
            return res.status(401).json({ error: 'Sesión inválida o expirada' });
        }

        const order = await findOrderByReference(sanitizedOrderId);
        if (!order || !order.firestoreDocId) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const orderOwnerId = normalizeEntityId(order.userId);
        if (!orderOwnerId || orderOwnerId !== decodedToken.uid) {
            return res.status(403).json({ error: 'No autorizado para confirmar esta orden' });
        }

        // Si ya está pagada, no hacer nada (idempotente)
        const alreadyPaid = normalizeEntityId(order.status).toLowerCase() === 'paid'
            || normalizeEntityId(order.paymentStatus).toLowerCase() === 'approved';
        if (alreadyPaid) {
            return res.json({ success: true, status: 'approved', alreadyPaid: true });
        }

        // Consultar el pago a Mercado Pago. En sandbox el get por ID puede fallar;
        // en ese caso buscamos por external_reference (la orden) como respaldo.
        const paymentClient = new mercadopago.Payment(client);
        let payment = null;

        try {
            payment = await paymentClient.get(paymentId);
        } catch (getError) {
            console.warn(`⚠️ payment.get(${paymentId}) no disponible (${getError.message}); buscando por external_reference...`);
            try {
                const searchResult = await paymentClient.search({
                    options: { external_reference: sanitizedOrderId, sort: 'date_created', criteria: 'desc' }
                });
                payment = (searchResult?.results || [])[0] || null;
            } catch (searchError) {
                console.warn('⚠️ Búsqueda por external_reference también falló:', searchError.message);
            }
        }

        // Si no pudimos obtener el pago (típico en sandbox), no es un error fatal:
        // la auto-confirmación de order-status ya se encarga. Respondemos OK.
        if (!payment) {
            return res.json({
                success: true,
                status: 'unknown',
                message: 'Pago no disponible vía API; se confirmará al consultar el estado de la orden'
            });
        }

        // Validar que el pago corresponde a esta orden
        if (normalizeEntityId(payment.external_reference) !== sanitizedOrderId) {
            return res.status(409).json({ error: 'El pago no corresponde a esta orden' });
        }

        if (payment.status === 'approved') {
            // Validar monto
            const expectedAmount = Number(order.paymentExpectedAmount);
            const paidAmount = Number(payment.transaction_amount);
            if (Number.isFinite(expectedAmount) && Number.isFinite(paidAmount) && Math.abs(expectedAmount - paidAmount) > 0.5) {
                console.warn(`⚠️ Monto no coincide para ${order.id}. Esperado ${expectedAmount}, recibido ${paidAmount}`);
                return res.status(409).json({ error: 'El monto pagado no coincide con la orden' });
            }

            await markOrderAsPaid(order, {
                paymentMethod: 'mercado_pago',
                gatewayPaymentId: String(payment.id),
                gatewayStatus: payment.status,
                paymentDate: payment.date_approved || payment.date_created || new Date().toISOString()
            });

            console.log('✅ Orden marcada como pagada vía confirmación (respaldo webhook):', order.id);
            return res.json({ success: true, status: 'approved' });
        }

        return res.json({ success: true, status: payment.status });

    } catch (error) {
        console.error('❌ Error confirmando pago:', error);
        return res.status(500).json({ error: 'Error al confirmar el pago' });
    }
});

/**
 * POST /api/payment/sync-pending
 * Sincroniza las órdenes PENDIENTES del usuario con Mercado Pago.
 * Se llama al cargar "Mis Compras" para que las órdenes pagadas en MP
 * se marquen como pagadas aunque el cliente no haya esperado en la página de éxito.
 */
router.post('/sync-pending', requirePublicOrigin, async (req, res) => {
    try {
        const client = getMercadoPagoClient();
        if (!client) {
            return res.status(503).json({ error: 'MERCADOPAGO_ACCESS_TOKEN no configurado en backend' });
        }

        const idToken = getBearerToken(req);
        const decodedToken = await verifyIdTokenSafe(idToken);
        if (!decodedToken?.uid) {
            return res.status(401).json({ error: 'Sesión inválida o expirada' });
        }

        const db = getFirestoreAdminSafe();
        if (!db) {
            return res.status(503).json({ error: 'Firestore no disponible' });
        }

        // Buscar órdenes pendientes del usuario que sean de Mercado Pago
        const pendingSnapshot = await db.collection('orders')
            .where('userId', '==', decodedToken.uid)
            .where('status', '==', 'pending')
            .get();

        if (pendingSnapshot.empty) {
            return res.json({ success: true, synced: 0 });
        }

        const paymentClient = new mercadopago.Payment(client);
        let syncedCount = 0;

        for (const orderDoc of pendingSnapshot.docs) {
            const orderData = orderDoc.data() || {};
            const orderId = normalizeEntityId(orderData.id || orderDoc.id);

            // Solo órdenes de Mercado Pago (tienen preferencia creada o paymentMethod mercado_pago)
            const isMercadoPago = normalizeEntityId(orderData.paymentMethod).toLowerCase() === 'mercado_pago'
                || orderData.paymentPreferenceStatus;
            if (!isMercadoPago || !orderId) {
                continue;
            }

            try {
                const searchResult = await paymentClient.search({
                    options: { external_reference: orderId, sort: 'date_created', criteria: 'desc' }
                });
                const latestPayment = (searchResult?.results || [])[0];

                if (latestPayment && latestPayment.status === 'approved') {
                    const expectedAmount = Number(orderData.paymentExpectedAmount);
                    const paidAmount = Number(latestPayment.transaction_amount);
                    const amountOk = !Number.isFinite(expectedAmount) || !Number.isFinite(paidAmount)
                        || Math.abs(expectedAmount - paidAmount) <= 0.5;

                    if (amountOk) {
                        await markOrderAsPaid(
                            { firestoreDocId: orderDoc.id, id: orderId, ...orderData },
                            {
                                paymentMethod: 'mercado_pago',
                                gatewayPaymentId: String(latestPayment.id),
                                gatewayStatus: latestPayment.status,
                                paymentDate: latestPayment.date_approved || latestPayment.date_created || new Date().toISOString()
                            }
                        );
                        syncedCount += 1;
                        console.log('✅ Orden sincronizada como pagada en Mis Compras:', orderId);
                    }
                }
            } catch (orderError) {
                console.warn(`⚠️ No se pudo sincronizar la orden ${orderId}:`, orderError.message);
            }
        }

        return res.json({ success: true, synced: syncedCount });

    } catch (error) {
        console.error('❌ Error sincronizando órdenes pendientes:', error);
        return res.status(500).json({ error: 'Error al sincronizar órdenes' });
    }
});

/**
 * GET /api/payment/order-status/:order_id
 * Obtener estado de una orden autenticada por ownership
 */
router.get('/order-status/:order_id', requirePublicOrigin, async (req, res) => {
    try {
        const sanitizedOrderId = sanitizeText(req.params.order_id, { maxLength: 80, allowEmpty: true });
        if (!sanitizedOrderId) {
            return res.status(400).json({ error: 'order_id inválido' });
        }

        const idToken = getBearerToken(req);
        const decodedToken = await verifyIdTokenSafe(idToken);
        if (!decodedToken?.uid) {
            return res.status(401).json({ error: 'Sesión inválida o expirada' });
        }

        let order = await findOrderByReference(sanitizedOrderId);
        if (!order || !order.firestoreDocId) {
            return res.status(404).json({ error: 'Orden no encontrada' });
        }

        const orderOwnerId = normalizeEntityId(order.userId);
        if (!orderOwnerId || orderOwnerId !== decodedToken.uid) {
            return res.status(403).json({ error: 'No autorizado para consultar esta orden' });
        }

        // Auto-confirmación (respaldo del webhook): si la orden está pendiente y es de
        // Mercado Pago, consultamos MP directamente para marcarla como pagada.
        const isPending = normalizeEntityId(order.status).toLowerCase() !== 'paid'
            && normalizeEntityId(order.paymentStatus).toLowerCase() !== 'approved';
        const isMercadoPago = normalizeEntityId(order.paymentMethod).toLowerCase() === 'mercado_pago'
            || order.paymentPreferenceStatus; // órdenes de MP tienen este campo

        if (isPending && isMercadoPago) {
            try {
                const client = getMercadoPagoClient();
                if (client) {
                    // Buscar el pago más reciente asociado a esta orden (external_reference)
                    const searchClient = new mercadopago.Payment(client);
                    const searchResult = await searchClient.search({
                        options: { external_reference: sanitizedOrderId, sort: 'date_created', criteria: 'desc' }
                    });
                    const latestPayment = (searchResult?.results || [])[0];

                    if (latestPayment && latestPayment.status === 'approved') {
                        const expectedAmount = Number(order.paymentExpectedAmount);
                        const paidAmount = Number(latestPayment.transaction_amount);
                        const amountOk = !Number.isFinite(expectedAmount) || !Number.isFinite(paidAmount)
                            || Math.abs(expectedAmount - paidAmount) <= 0.5;

                        if (amountOk) {
                            await markOrderAsPaid(order, {
                                paymentMethod: 'mercado_pago',
                                gatewayPaymentId: String(latestPayment.id),
                                gatewayStatus: latestPayment.status,
                                paymentDate: latestPayment.date_approved || latestPayment.date_created || new Date().toISOString()
                            });
                            console.log('✅ Orden auto-confirmada como pagada al consultar estado:', order.id);
                            // Recargar la orden ya actualizada
                            order = await findOrderByReference(sanitizedOrderId) || order;
                        }
                    }
                }
            } catch (autoConfirmError) {
                console.warn('⚠️ Auto-confirmación de orden no disponible:', autoConfirmError.message);
            }
        }

        const totals = order.totals || {};
        const shippingData = order.shippingData || {};

        return res.json({
            id: order.id || sanitizedOrderId,
            status: normalizeEntityId(order.status).toLowerCase() || 'pending',
            paymentStatus: normalizeEntityId(order.paymentStatus).toLowerCase() || 'pending',
            mercadoPagoStatus: normalizeEntityId(order.mercadoPagoStatus).toLowerCase() || null,
            paymentMethod: normalizeEntityId(order.paymentMethod) || null,
            paymentDate: order.paymentDate || null,
            paymentProcessingStatus: normalizeEntityId(order.paymentProcessingStatus).toLowerCase() || null,
            paymentValidationStatus: normalizeEntityId(order.paymentValidationStatus).toLowerCase() || null,
            totals: {
                subtotal: Number(totals.subtotal) || 0,
                shipping: Number(totals.shipping) || 0,
                discount: Number(totals.discount) || 0,
                total: Number(totals.total) || 0
            },
            shipping: {
                firstName: sanitizeText(shippingData.firstName, { maxLength: 80, allowEmpty: true }) || '',
                lastName: sanitizeText(shippingData.lastName, { maxLength: 80, allowEmpty: true }) || ''
            }
        });
    } catch (error) {
        console.error('❌ Error obteniendo estado de orden:', error);
        return res.status(500).json({ error: 'Error al obtener estado de orden' });
    }
});

/**
 * POST /api/payment/refund/:payment_id
 * Revertir un pago (solo en casos especiales)
 */
router.post('/refund/:payment_id', requireApiKey, async (req, res) => {
    try {
        const client = getMercadoPagoClient();
        if (!client) {
            return res.status(503).json({ error: 'MERCADOPAGO_ACCESS_TOKEN no configurado en backend' });
        }

        const { payment_id } = req.params;

        const refundClient = new mercadopago.Refund(client);
        const refund = await refundClient.create({ payment_id });

        console.log('✅ Reembolso procesado:', refund.id);

        res.json({
            success: true,
            refundId: refund.id,
            status: refund.status
        });

    } catch (error) {
        console.error('❌ Error procesando reembolso:', error);
        res.status(500).json({ error: 'Error al procesar reembolso' });
    }
});

module.exports = router;
