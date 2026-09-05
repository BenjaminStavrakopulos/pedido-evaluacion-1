// checkout.js - Sistema de checkout y órdenes

// Base de datos completa de regiones y comunas de Chile
const regionesCiudades = {
    "Region de Arica y Parinacota": ["Arica", "Camarones", "Putre", "General Lagos"],
    "Region de Tarapaca": ["Iquique", "Alto Hospicio", "Camiña", "Colchane", "Huara", "Pica", "Pozo Almonte"],
    "Region de Antofagasta": ["Antofagasta", "Mejillones", "Sierra Gorda", "Calama", "San Pedro de Atacama", "Tocopilla", "María Elena"],
    "Region de Atacama": ["Copiapó", "Caldera", "Tierra Amarilla", "Chañaral", "Diego de Almagro", "Vallenar", "Alto del Carmen"],
    "Region de Coquimbo": ["La Serena", "Coquimbo", "Ovalle", "La Higuera", "Paiguano", "Andacollo", "Vicuña", "Illapel", "Canela", "Salamanca"],
    "Region de Valparaiso": ["Valparaíso", "Viña del Mar", "Quilpué", "Villa Alemana", "Limache", "Olmué", "Quillota", "La Calera", "Cabildo", "Concon", "Casablanca", "Catemu", "Nogales", "Papudo", "Petorca", "Puchuncaví", "Quintero", "Reñaca", "Zapallar"],
    "Region Metropolitana": ["Santiago", "Maipú", "Puente Alto", "La Florida", "Ñuñoa", "La Reina", "Providencia", "Las Condes", "Vitacura", "Lo Barnechea", "San Miguel", "Estación Central", "Independencia", "Recoleta", "Conchalí", "San Bernardo", "Pirque", "Talagante", "Paine", "Calera de Tango", "El Bosque", "San Joaquín", "Macul", "Peñalolén", "Huechuraba", "Quinta Normal", "Cerrillos", "Renca", "Pudahuel", "Lampa", "Colina", "Curacaví", "Melipilla", "Alhué", "San Pedro", "Buin", "Peñaflor", "Isla de Maipo", "Padre Hurtado"],
    "Region del Libertador General Bernardo O'Higgins": ["Rancagua", "Machalí", "Graneros", "San Francisco de Mostazal", "Peumo", "Pichidegua", "Santa Cruz", "Palmilla", "Nancagua", "Requínoa", "Rengo", "Olivar", "San Vicente de Tagua Tagua", "Doñihue", "Coinco", "Coltauco"],
    "Region del Maule": ["Talca", "Curicó", "Linares", "Maule", "San Javier", "Parral", "Cauquenes", "Constitución", "Molina", "Pencahue", "Rauco", "Retiro", "Sagrada Familia", "Empedrado", "Romeral", "San Clemente", "Longaví", "Chillan Viejo"],
    "Region de Nuble": ["Chillán", "Chillán Viejo", "Ñiquén", "San Carlos", "Yungay", "Pemuco", "Portezuelo", "Coelemu", "Ninhue", "Ranquil", "Quillón", "San Ignacio", "Treguaco", "Bulnes"],
    "Region del Biobio": ["Concepción", "Talcahuano", "Huachipato", "Penco", "Tomé", "Dichato", "Los Ángeles", "Lota", "Coronel", "Santa Juana", "Arauco", "Curanilahue", "Lebu", "Tirúa", "Cañete", "Contulmo", "Nacimiento", "Mulchén", "Negrete"],
    "Region de La Araucania": ["Temuco", "Padre Las Casas", "Nueva Imperial", "Carahue", "Traiguén", "Pucón", "Villarrica", "Purén", "Los Sauces", "Renaico", "Curacautín", "Malalcahuello", "Lonquimay", "Melipeuco", "Tolten"],
    "Region de Los Rios": ["Valdivia", "Corral", "Lachón", "Paillaco", "Los Lagos", "Futrono", "Río Bueno", "La Unión", "Panguipulli", "Mariquina"],
    "Region de Los Lagos": ["Puerto Montt", "Frutillar", "Llanquihue", "Ancud", "Castro", "Quellón", "Chonchi", "Dalcahue", "Curaco de Vélez", "Puqueldón", "Osorno", "Puerto Octay", "Purranque", "Puyehue", "Río Negro", "San Juan de la Costa", "San Pablo", "Hornopirén", "Chaitén", "La Junta", "Futaleufú", "Palena"],
    "Region de Aysen": ["Coyhaique", "Mallín", "Balmaceda", "Villa Santa Lucía", "Puyuhuapi", "Cisnes", "Laguna San Rafael", "Guaitecas", "Chile Chico", "Río Ibáñez"],
    "Region de Magallanes": ["Punta Arenas", "Puerto Natales", "Puerto Williams", "Porvenir", "Timaukel", "Laguna Blanca", "Río Verde", "Cabo de Hornos"]
};

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeCheckout);
} else {
    // Si el documento ya se cargó, inicializar inmediatamente
    initializeCheckout();
}

let checkoutUserCache = null;
let checkoutCartCache = null;
let savedShippingCache = null;
let latestCreatedOrder = null;
let paymentRuntimeConfigCache = null;
let currentStep = 1;
const FREE_SHIPPING_THRESHOLD = 50000;
const clpFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});

function formatCheckoutCLP(amount) {
    if (typeof window.formatCLP === 'function') {
        return window.formatCLP(amount);
    }

    const numericAmount = Number(amount) || 0;
    return clpFormatter.format(numericAmount);
}

function escapeHtml(value) {
    const text = value == null ? '' : String(value);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function readStorageJSON(key, fallback = null) {
    return window.hairiaStorage?.readJSON(key, fallback) ?? fallback;
}

function writeStorageJSON(key, value) {
    return window.hairiaStorage?.writeJSON(key, value) ?? value;
}

function loadPaymentRuntimeConfig() {
    if (paymentRuntimeConfigCache) {
        return paymentRuntimeConfigCache;
    }

    paymentRuntimeConfigCache = window.hairiaPaymentRuntime?.getConfig() || {
        backendUrl: window.BACKEND_URL || 'http://localhost:3000',
        useSandboxCheckout: false
    };
    return paymentRuntimeConfigCache;
}

async function buildPaymentApiHeaders(baseHeaders = {}) {
    return window.hairiaPaymentRuntime?.buildAuthHeaders(baseHeaders) || baseHeaders;
}

async function createCheckoutPreferenceFromOrder(order) {
    const config = loadPaymentRuntimeConfig();
    const backendUrl = String(config.backendUrl || '').trim() || 'http://localhost:3000';

    const payload = {
        items: (order.items || []).map(item => ({
            id: item.id || item.productId || item.product?.id || '',
            name: item.name || item.title || 'Producto',
            quantity: Number(item.quantity) || 1,
            price: Number(item.price) || 0,
            description: item.description || ''
        })),
        email: order.userEmail || order.shippingData?.email || '',
        firstName: order.shippingData?.firstName || 'Cliente',
        lastName: order.shippingData?.lastName || '',
        phone: order.shippingData?.phone || '',
        address: order.shippingData?.street || '',
        city: order.shippingData?.city || 'Santiago',
        orderId: order.id
    };

    const response = await fetch(`${backendUrl}/api/payment/create-preference`, {
        method: 'POST',
        headers: await buildPaymentApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let message = `No se pudo crear la preferencia (${response.status})`;
        try {
            const errorData = await response.json();
            if (errorData?.message) {
                message = errorData.message;
            }
        } catch (_) {
            // no-op
        }
        throw new Error(message);
    }

    const data = await response.json();
    if (!data?.preferenceId) {
        throw new Error('Respuesta inválida de Mercado Pago (sin preferenceId)');
    }

    const useSandboxCheckout = config.useSandboxCheckout === true;
    const redirectUrl = useSandboxCheckout
        ? (data.sandbox_init_point || data.init_point)
        : (data.init_point || data.sandbox_init_point);

    if (!redirectUrl) {
        throw new Error('Mercado Pago no devolvió URL de checkout');
    }

    return {
        preferenceId: data.preferenceId,
        redirectUrl
    };
}

// Crear transacción Webpay (Transbank) y devolver url + token para redirigir con form POST
async function createWebpayTransactionFromOrder(order) {
    const config = loadPaymentRuntimeConfig();
    const backendUrl = String(config.backendUrl || '').trim() || 'http://localhost:3000';

    const payload = {
        items: (order.items || []).map(item => ({
            id: item.id || item.productId || item.product?.id || '',
            quantity: Number(item.quantity) || 1
        })),
        email: order.userEmail || order.shippingData?.email || '',
        orderId: order.id
    };

    const response = await fetch(`${backendUrl}/api/transbank/create`, {
        method: 'POST',
        headers: await buildPaymentApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        let message = `No se pudo crear la transacción (${response.status})`;
        try {
            const errorData = await response.json();
            if (errorData?.message) {
                message = errorData.message;
            }
        } catch (_) {
            // no-op
        }
        throw new Error(message);
    }

    const data = await response.json();
    if (!data?.url || !data?.token) {
        throw new Error('Respuesta inválida de Transbank (sin url/token)');
    }

    return { url: data.url, token: data.token };
}

// Webpay exige redirigir con un formulario POST que lleva el token_ws
function redirectToWebpay(url, token) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = url;
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'token_ws';
    input.value = token;

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
}

function getSelectedPaymentMethod() {
    const selected = document.querySelector('input[name="paymentMethod"]:checked');
    return selected?.value || 'mercadopago';
}

function getShippingStorageKey(userKey) {
    return `hairia_shipping_${userKey}`;
}

function getCheckoutUser() {
    if (checkoutUserCache) {
        return checkoutUserCache;
    }

    checkoutUserCache = window.hairiaSession?.getCurrentUser() || null;
    return checkoutUserCache;
}

function getCheckoutUserKey() {
    const user = getCheckoutUser();
    return user?.uid || user?.id;
}

function getCheckoutCart(forceRefresh = false) {
    if (!forceRefresh && Array.isArray(checkoutCartCache)) {
        return checkoutCartCache;
    }

    const userKey = getCheckoutUserKey();
    if (userKey) {
        checkoutCartCache = readStorageJSON(`hairia_cart_${userKey}`, []);
    } else {
        checkoutCartCache = readStorageJSON('hairia_guest_cart', []);
    }

    return checkoutCartCache;
}

function normalizeCurrencyValue(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    if (value === null || value === undefined) {
        return 0;
    }

    let sanitized = String(value).trim().replace(/[^\d,.-]/g, '');
    if (!sanitized) return 0;

    const hasDot = sanitized.includes('.');
    const hasComma = sanitized.includes(',');

    if (hasDot && hasComma) {
        const lastDot = sanitized.lastIndexOf('.');
        const lastComma = sanitized.lastIndexOf(',');
        if (lastDot > lastComma) {
            sanitized = sanitized.replace(/,/g, '');
        } else {
            sanitized = sanitized.replace(/\./g, '').replace(',', '.');
        }
    } else if (hasComma) {
        const parts = sanitized.split(',');
        const decimalCandidate = parts[parts.length - 1];
        sanitized = (decimalCandidate.length === 3 && parts.length > 1)
            ? sanitized.replace(/,/g, '')
            : sanitized.replace(',', '.');
    } else if (hasDot) {
        const parts = sanitized.split('.');
        const decimalCandidate = parts[parts.length - 1];
        if (decimalCandidate.length === 3 && parts.length > 1) {
            sanitized = sanitized.replace(/\./g, '');
        }
    }

    const parsed = Number.parseFloat(sanitized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCartItems(cart) {
    if (!Array.isArray(cart)) return [];

    return cart
        .map(item => ({
            ...item,
            quantity: Math.max(1, Number.parseInt(item?.quantity, 10) || 1),
            price: normalizeCurrencyValue(item?.price)
        }))
        .filter(item => (item?.id || item?.name));
}

function getCheckoutDiscountText(item) {
    if (item?.discountType === 'percentage' && Number(item.discountPercent) > 0) {
        return `${Number(item.discountPercent)}% OFF`;
    }
    if (item?.discountType === 'amount' && Number(item.discountAmount) > 0) {
        return `-${formatCheckoutCLP(item.discountAmount)}`;
    }
    return '';
}

function normalizeEntityId(value) {
    return String(value ?? '').trim();
}

function persistLocalProductsStock(stockByProductId) {
    if (!Array.isArray(window.productsData)) return;

    window.productsData = window.productsData.map((product) => {
        const productId = normalizeEntityId(product?.id);
        if (!productId || !stockByProductId.has(productId)) {
            return product;
        }

        return {
            ...product,
            stock: stockByProductId.get(productId),
            updatedAt: new Date().toISOString()
        };
    });
}

async function applyInventoryDiscountForOrder(order) {
    if (!order?.id || !Array.isArray(order.items) || order.items.length === 0) {
        return;
    }

    if (order.inventoryAdjustedAt) {
        return;
    }

    if (!window.firebaseData?.loadProducts || !window.firebaseData?.saveProduct || !window.firebaseData?.saveOrder) {
        console.warn('⚠️ No hay funciones Firebase suficientes para descontar stock');
        return;
    }

    const products = await window.firebaseData.loadProducts();
    if (!Array.isArray(products) || !products.length) {
        return;
    }

    const productById = new Map();
    products.forEach((product) => {
        const productId = normalizeEntityId(product?.id);
        if (productId) {
            productById.set(productId, product);
        }
    });

    const stockByProductId = new Map();

    for (const item of order.items) {
        const itemId = normalizeEntityId(item?.id ?? item?.productId ?? item?.product?.id);
        if (!itemId || !productById.has(itemId)) {
            continue;
        }

        const product = productById.get(itemId);
        const currentStock = Number.parseInt(product?.stock, 10) || 0;
        const quantity = Math.max(1, Number.parseInt(item?.quantity, 10) || 1);
        const nextStock = Math.max(0, currentStock - quantity);

        if (nextStock === currentStock) {
            continue;
        }

        const nextProduct = {
            ...product,
            stock: nextStock,
            updatedAt: new Date().toISOString()
        };

        await window.firebaseData.saveProduct(nextProduct);
        productById.set(itemId, nextProduct);
        stockByProductId.set(itemId, nextStock);
    }

    if (stockByProductId.size > 0) {
        persistLocalProductsStock(stockByProductId);
    }

    const inventoryAdjustedAt = new Date().toISOString();
    await window.firebaseData.saveOrder({
        id: order.id,
        inventoryAdjustedAt
    });

    order.inventoryAdjustedAt = inventoryAdjustedAt;
}

function clearCheckoutCart() {
    const userKey = getCheckoutUserKey();

    if (userKey) {
        localStorage.removeItem(`hairia_cart_${userKey}`);
    } else {
        localStorage.removeItem('hairia_guest_cart');
    }

    checkoutCartCache = [];
}

function recalculateTotalsFromCurrentCart() {
    calculateTotals(normalizeCartItems(getCheckoutCart()));
}

// ========== ANALYTICS ==========
function trackEvent(eventName, data = {}) {
    try {
        if (typeof window.gtag === 'function') {
            window.gtag('event', eventName, data);
        }
        console.log(`📊 [Analytics] ${eventName}`, data);
    } catch (_) { /* no-op */ }
}

// ========== NAVEGACIÓN POR PASOS ==========
function goToStep(step) {
    currentStep = step;

    document.querySelectorAll('.step-panel').forEach(panel => {
        panel.classList.remove('active');
        panel.style.display = 'none';
    });
    const targetPanel = document.getElementById(`step-panel-${step}`);
    if (targetPanel) {
        targetPanel.classList.add('active');
        targetPanel.style.display = 'block';
    }

    document.querySelectorAll('.checkout-steps .step[data-step]').forEach(el => {
        const n = parseInt(el.dataset.step, 10);
        const numEl = el.querySelector('.step-number');
        if (!numEl) return;
        if (!numEl.dataset.original) numEl.dataset.original = numEl.textContent;

        el.classList.remove('active', 'completed');
        if (n < step) {
            el.classList.add('completed');
            numEl.textContent = '✓';
        } else if (n === step) {
            el.classList.add('active');
            numEl.textContent = numEl.dataset.original;
        } else {
            numEl.textContent = numEl.dataset.original;
        }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

    const events = { 2: 'shipping_started', 3: 'payment_started' };
    if (events[step]) trackEvent(events[step]);
}

// ========== SIDEBAR: ITEMS Y BARRA DE ENVÍO GRATIS ==========
function updateSidebarItems(cart) {
    const container = document.getElementById('sidebarItems');
    if (!container) return;
    const items = normalizeCartItems(cart || getCheckoutCart());
    container.innerHTML = items.map(item => `
        <div class="sidebar-item">
            <span class="sidebar-item-name">${escapeHtml(item.name || 'Producto')}</span>
            <span class="sidebar-item-qty">x${Number(item.quantity) || 0}</span>
            <span class="sidebar-item-price">${formatCheckoutCLP(item.price * item.quantity)}</span>
        </div>
    `).join('');
}

function updateFreeShippingBar(subtotal) {
    const bar = document.getElementById('freeShippingBar');
    if (!bar) return;
    if (subtotal >= FREE_SHIPPING_THRESHOLD) {
        bar.innerHTML = `<div class="shipping-free-badge">🚚 ¡Envío GRATIS en tu compra!</div>`;
        bar.style.display = 'block';
        return;
    }
    const remaining = FREE_SHIPPING_THRESHOLD - subtotal;
    const pct = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);
    bar.style.display = 'block';
    bar.innerHTML = `
        <p class="shipping-bar-text">Te faltan <strong>${formatCheckoutCLP(remaining)}</strong> para envío gratis</p>
        <div class="shipping-bar-track"><div class="shipping-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
    `;
}

// ========== CONTROLES DE CANTIDAD DEL CARRITO ==========
function updateCartItemQty(itemId, delta) {
    const userKey = getCheckoutUserKey();
    const cartKey = userKey ? `hairia_cart_${userKey}` : 'hairia_guest_cart';
    const cart = readStorageJSON(cartKey, []);
    const item = cart.find(i => String(i.id || i.name) === String(itemId));
    if (!item) return;
    const newQty = Math.max(0, (Number(item.quantity) || 1) + delta);
    if (newQty === 0) { removeCartItem(itemId); return; }
    item.quantity = newQty;
    writeStorageJSON(cartKey, cart);
    checkoutCartCache = null;
    loadCheckoutCart();
}

function removeCartItem(itemId) {
    const userKey = getCheckoutUserKey();
    const cartKey = userKey ? `hairia_cart_${userKey}` : 'hairia_guest_cart';
    const cart = readStorageJSON(cartKey, []);
    const next = cart.filter(i => String(i.id || i.name) !== String(itemId));
    writeStorageJSON(cartKey, next);
    checkoutCartCache = null;
    if (next.length === 0) {
        showNotification('Tu carrito está vacío');
        setTimeout(() => { window.location.href = 'products.html'; }, 1800);
        return;
    }
    loadCheckoutCart();
}

// ========== PAGO: CREAR ORDEN + PREFERENCIA + REDIRECT ==========
async function handlePayNow() {
    const btn = document.getElementById('payNowBtn');
    const text = document.getElementById('payNowText');
    if (btn) btn.disabled = true;
    if (text) text.textContent = 'Procesando...';
    trackEvent('payment_submitted');

    try {
        const method = getSelectedPaymentMethod();
        const order = await createOrder();

        if (method === 'webpay') {
            const webpay = await createWebpayTransactionFromOrder(order);
            console.log('🌐 Redirigiendo a Webpay:', webpay.url);
            redirectToWebpay(webpay.url, webpay.token);
            return;
        }

        // Por defecto: Mercado Pago
        const preference = await createCheckoutPreferenceFromOrder(order);
        window.location.href = preference.redirectUrl;
    } catch (error) {
        console.error('❌ Error en handlePayNow:', error);
        trackEvent('payment_error', { message: error.message });
        showNotification(`No se pudo procesar el pago: ${error.message}`);
        if (btn) btn.disabled = false;
        if (text) text.textContent = 'Pagar ahora';
    }
}

async function initializeCheckout() {
    const user = getCheckoutUser();
    
    if (!user || (!user.id && !user.uid)) {
        showNotification('Debes iniciar sesión para continuar');
        window.location.href = 'login.html?redirect=checkout';
        return;
    }

    trackEvent('checkout_started');
    loadCheckoutCart();
    await prefillUserData(user);
    setupCheckoutForm();
    goToStep(1);
}

// ========== CARRITO EN CHECKOUT ==========
function loadCheckoutCart() {
    const userKey = getCheckoutUserKey();

    restorePendingCheckoutCart(userKey);

    const cart = normalizeCartItems(getCheckoutCart(true));
    checkoutCartCache = cart;
    
    if (cart.length === 0) {
        showNotification('Tu carrito está vacío');
        setTimeout(() => {
            window.location.href = 'products.html';
        }, 2000);
        return;
    }

    const cartItemsContainer = document.getElementById('cartItemsCheckout');
    
    cartItemsContainer.innerHTML = cart.map(item => {
        const itemId = escapeHtml(String(item.id || item.name));
        return `
        <div class="checkout-item" data-item-id="${itemId}">
            <div class="item-details">
                <h4>${escapeHtml(item.name || 'Producto')}</h4>
                ${item.variant ? `<span class="item-variant">${escapeHtml(item.variant)}</span>` : ''}
            </div>
            <div class="item-qty-controls">
                <button type="button" class="qty-btn" data-action="decrease" data-item-id="${itemId}" aria-label="Reducir cantidad">−</button>
                <span class="qty-value">${Number(item.quantity) || 0}</span>
                <button type="button" class="qty-btn" data-action="increase" data-item-id="${itemId}" aria-label="Aumentar cantidad">+</button>
            </div>
            <div class="item-price">${Number(item.originalPrice) > Number(item.price) ? `<del>${formatCheckoutCLP(item.originalPrice * item.quantity)}</del><strong>${formatCheckoutCLP(item.price * item.quantity)}</strong><small>${escapeHtml(getCheckoutDiscountText(item))}</small>` : formatCheckoutCLP(item.price * item.quantity)}</div>
            <button type="button" class="item-remove" data-item-id="${itemId}" aria-label="Eliminar producto">×</button>
        </div>`;
    }).join('');

    cartItemsContainer.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const delta = btn.dataset.action === 'increase' ? 1 : -1;
            updateCartItemQty(btn.dataset.itemId, delta);
        });
    });
    cartItemsContainer.querySelectorAll('.item-remove').forEach(btn => {
        btn.addEventListener('click', () => removeCartItem(btn.dataset.itemId));
    });

    calculateTotals(cart);
}

function restorePendingCheckoutCart(userKey) {
    const pendingCheckout = localStorage.getItem('pending_checkout');
    const checkoutRedirect = localStorage.getItem('checkout_redirect');

    if (!pendingCheckout || checkoutRedirect !== 'true') {
        return;
    }

    localStorage.removeItem('pending_checkout');
    localStorage.removeItem('checkout_redirect');

    try {
        const pendingCart = JSON.parse(pendingCheckout) || [];
        if (!pendingCart.length) {
            localStorage.removeItem('pending_checkout');
            localStorage.removeItem('checkout_redirect');
            return;
        }

        if (userKey) {
            const userCartKey = `hairia_cart_${userKey}`;
            const currentCart = readStorageJSON(userCartKey, []);

            pendingCart.forEach(item => {
                const existing = currentCart.find(cartItem => String(cartItem.id) === String(item.id));
                if (existing) {
                    existing.quantity += item.quantity || 1;
                } else {
                    currentCart.push({ ...item, quantity: item.quantity || 1 });
                }
            });

            writeStorageJSON(userCartKey, currentCart);
        } else {
            const guestCart = readStorageJSON('hairia_guest_cart', []);
            pendingCart.forEach(item => {
                const existing = guestCart.find(cartItem => String(cartItem.id) === String(item.id));
                if (existing) {
                    existing.quantity += item.quantity || 1;
                } else {
                    guestCart.push({ ...item, quantity: item.quantity || 1 });
                }
            });
            writeStorageJSON('hairia_guest_cart', guestCart);
        }

    } catch (error) {
        console.error('❌ Error recuperando carrito pendiente en checkout:', error);
    }
}

function calculateTotals(cart) {
    const normalizedCart = normalizeCartItems(cart);
    const subtotal = normalizedCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Calcular envío basado en región y monto
    let shipping = 0;
    const region = document.getElementById('region')?.value || '';
    
    // Si la compra es >= 50000, envío gratis a cualquier parte
    if (subtotal >= 50000) {
        shipping = 0;
    } else if (region) {
        // Envío: $2000 para Santiago, $8600 para otras regiones
        if (region === "Region Metropolitana") {
            shipping = 2000;
        } else {
            shipping = 8600;
        }
    }
    
    // Calcular descuento si hay uno aplicado
    let discount = 0;
    const appliedDiscount = window.appliedDiscount;
    if (appliedDiscount) {
        const base = subtotal + shipping;
        if (appliedDiscount.type === 'percentage') {
            discount = Math.round((base * appliedDiscount.value) / 100);
        } else {
            discount = appliedDiscount.value;
        }
    }
    
    const total = subtotal + shipping - discount;

    document.getElementById('subtotalAmount').textContent = formatCheckoutCLP(subtotal);
    document.getElementById('shippingAmount').textContent = shipping === 0 ? 'Gratis' : formatCheckoutCLP(shipping);
    document.getElementById('totalAmount').textContent = formatCheckoutCLP(Math.max(0, total));

    window.orderTotals = {
        subtotal,
        shipping,
        discount,
        total: Math.max(0, total)
    };

    updateSidebarItems(normalizedCart);
    updateFreeShippingBar(subtotal);

    const previewEl = document.getElementById('summaryTotalPreview');
    if (previewEl) previewEl.textContent = formatCheckoutCLP(Math.max(0, total));

    const discountRow = document.getElementById('discountRow');
    const discountTotalAmountEl = document.getElementById('discountTotalAmount');
    if (discountRow) discountRow.style.display = discount > 0 ? 'flex' : 'none';
    if (discountTotalAmountEl && discount > 0) discountTotalAmountEl.textContent = `-${formatCheckoutCLP(discount)}`;
}

// ========== PRE-LLENAR DATOS DEL USUARIO ==========
async function prefillUserData(user) {
    // Si el usuario tiene nombre completo, rellenarlo
    if (user.name) {
        const nameParts = user.name.split(' ');
        document.getElementById('firstName').value = nameParts[0] || '';
        document.getElementById('lastName').value = nameParts.slice(1).join(' ') || '';
    }
    
    if (user.email) {
        document.getElementById('email').value = user.email;
    }

    // Si hay datos guardados de envío anterior, cargarlos
    const userKey = user?.uid || user?.id;
    let savedShipping = null;

    try {
        if (window.firebaseData?.loadShippingData) {
            savedShipping = await window.firebaseData.loadShippingData(userKey);
        }
    } catch (error) {
        console.warn('⚠️ No se pudieron cargar datos de envío desde Firebase:', error.message);
    }

    if (!savedShipping && userKey) {
        savedShipping = readStorageJSON(getShippingStorageKey(userKey), null);
    }

    savedShippingCache = savedShipping || null;
    renderSavedAddressOption(savedShippingCache);
}

function applyShippingDataToForm(savedShipping) {
    if (!savedShipping) return;

    document.getElementById('firstName').value = savedShipping.firstName || document.getElementById('firstName').value;
    document.getElementById('lastName').value = savedShipping.lastName || document.getElementById('lastName').value;
    document.getElementById('email').value = savedShipping.email || document.getElementById('email').value;
    document.getElementById('phone').value = savedShipping.phone || '';
    document.getElementById('street').value = savedShipping.street || '';
    document.getElementById('apartment').value = savedShipping.apartment || '';
    document.getElementById('region').value = savedShipping.region || '';

    if (savedShipping.region) {
        updateCities();
        setTimeout(() => {
            document.getElementById('city').value = savedShipping.city || '';
        }, 0);
    }

    document.getElementById('notes').value = savedShipping.notes || '';
    document.getElementById('rut').value = formatRUT(savedShipping.rut || document.getElementById('rut').value);
}

function renderSavedAddressOption(savedShipping) {
    const card = document.getElementById('savedAddressCard');
    const text = document.getElementById('savedAddressText');
    const btn = document.getElementById('useSavedAddressBtn');

    if (!card || !text || !btn) return;

    if (!savedShipping || !savedShipping.street || !savedShipping.region || !savedShipping.city) {
        card.style.display = 'none';
        return;
    }

    const addressLine = `${savedShipping.street}${savedShipping.apartment ? `, ${savedShipping.apartment}` : ''}`;
    const ownerName = `${savedShipping.firstName || ''} ${savedShipping.lastName || ''}`.trim();
    text.textContent = `${ownerName ? ownerName + ' · ' : ''}${addressLine} · ${savedShipping.city}, ${savedShipping.region}`;
    card.style.display = 'block';

    btn.disabled = false;
    if (btn.dataset.listener !== 'true') {
        btn.addEventListener('click', () => {
            applyShippingDataToForm(savedShippingCache);
            showNotification('✅ Dirección cargada automáticamente');
        });
        btn.dataset.listener = 'true';
    }
}

// ========== VALIDACIÓN DE RUT ==========
function sanitizeRUTInput(rawValue) {
    return String(rawValue || '')
        .replace(/[^0-9kK]/g, '')
        .toUpperCase()
        .slice(0, 9);
}

function formatRUT(rawValue) {
    const cleaned = sanitizeRUTInput(rawValue);

    if (!cleaned) return '';
    if (cleaned.length === 1) return cleaned;

    const body = cleaned.slice(0, -1);
    const dv = cleaned.slice(-1);
    const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    return `${formattedBody}-${dv}`;
}

function validateRUT(rut) {
    // Limpiar formato
    rut = rut.replace(/\./g, '').replace(/-/g, '').toUpperCase();
    
    // Verificar formato básico
    if (!/^[0-9]{7,8}[0-9K]$/.test(rut)) {
        return false;
    }

    // Validar dígito verificador
    const rutNums = rut.slice(0, -1);
    const dv = rut.slice(-1);
    
    let suma = 0;
    let multiplicador = 2;
    
    for (let i = rutNums.length - 1; i >= 0; i--) {
        suma += parseInt(rutNums[i]) * multiplicador;
        multiplicador++;
        if (multiplicador > 7) multiplicador = 2;
    }
    
    const dvCalculado = 11 - (suma % 11);
    let dvEsperado = dvCalculado === 11 ? '0' : dvCalculado === 10 ? 'K' : dvCalculado.toString();
    
    return dv === dvEsperado;
}

// ========== VALIDACIÓN DE FORMULARIO ==========
function validateCheckoutForm() {
    let isValid = true;
    const errors = {};

    // Validar nombre
    const firstName = document.getElementById('firstName').value.trim();
    if (!firstName || firstName.length < 2) {
        errors.firstName = 'El nombre debe tener al menos 2 caracteres';
        isValid = false;
    }

    // Validar apellido
    const lastName = document.getElementById('lastName').value.trim();
    if (!lastName || lastName.length < 2) {
        errors.lastName = 'El apellido debe tener al menos 2 caracteres';
        isValid = false;
    }

    // Validar RUT
    const rutInput = document.getElementById('rut');
    rutInput.value = formatRUT(rutInput.value);
    const rut = rutInput.value.trim();
    if (!rut) {
        errors.rut = 'El RUT es obligatorio';
        isValid = false;
    } else if (!validateRUT(rut)) {
        errors.rut = 'RUT inválido. Usa formato: 12.345.678-9';
        isValid = false;
    }

    // Validar email
    const email = document.getElementById('email').value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        errors.email = 'Email inválido';
        isValid = false;
    }

    // Validar teléfono
    const phone = document.getElementById('phone').value.trim();
    const phoneRegex = /^(\+56)?[0-9]{9}$/;
    if (!phone || !phoneRegex.test(phone.replace(/\D/g, ''))) {
        errors.phone = 'Teléfono inválido. Usa formato: +56912345678 o 912345678';
        isValid = false;
    }

    // Validar dirección
    const street = document.getElementById('street').value.trim();
    if (!street || street.length < 5) {
        errors.street = 'La dirección debe tener al menos 5 caracteres';
        isValid = false;
    }

    // Validar ciudad
    const city = document.getElementById('city').value.trim();
    if (!city || city.length < 2) {
        errors.city = 'La ciudad es obligatoria';
        isValid = false;
    }

    // Validar región
    const region = document.getElementById('region').value;
    if (!region) {
        errors.region = 'Debes seleccionar una región';
        isValid = false;
    }

    // Mostrar errores
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
    Object.keys(errors).forEach(key => {
        const errorEl = document.getElementById(`${key}Error`);
        if (errorEl) {
            errorEl.textContent = errors[key];
        }
    });

    return isValid;
}

// ========== SETUP FORMULARIO ==========
function setupCheckoutForm() {
    const form = document.getElementById('checkoutForm');
    const rutInput = document.getElementById('rut');
    const regionSelect = document.getElementById('region');
    const applyDiscountBtn = document.getElementById('applyDiscountBtn');
    const removeDiscountBtn = document.getElementById('removeDiscountBtn');

    if (rutInput && !rutInput.hasAttribute('data-rut-listener')) {
        rutInput.addEventListener('input', function() {
            this.value = sanitizeRUTInput(this.value);
        });
        rutInput.addEventListener('blur', function() {
            this.value = formatRUT(this.value);
        });
        rutInput.addEventListener('change', function() {
            this.value = formatRUT(this.value);
        });
        rutInput.setAttribute('data-rut-listener', 'true');
    }

    if (regionSelect && !regionSelect.hasAttribute('data-listener')) {
        regionSelect.addEventListener('change', updateCities);
        regionSelect.setAttribute('data-listener', 'true');
    }

    if (applyDiscountBtn && !applyDiscountBtn.hasAttribute('data-listener')) {
        applyDiscountBtn.addEventListener('click', applyDiscount);
        applyDiscountBtn.setAttribute('data-listener', 'true');
    }

    if (removeDiscountBtn && !removeDiscountBtn.hasAttribute('data-listener')) {
        removeDiscountBtn.addEventListener('click', removeDiscount);
        removeDiscountBtn.setAttribute('data-listener', 'true');
    }

    // Navegación por pasos
    document.getElementById('continueToShipping')?.addEventListener('click', () => {
        if (normalizeCartItems(getCheckoutCart()).length === 0) {
            showNotification('Tu carrito está vacío');
            return;
        }
        trackEvent('cart_continued');
        goToStep(2);
    });

    document.getElementById('backToCart')?.addEventListener('click', () => goToStep(1));
    document.getElementById('backToShipping')?.addEventListener('click', () => goToStep(2));

    document.getElementById('payNowBtn')?.addEventListener('click', handlePayNow);

    document.getElementById('goToHomeBtn')?.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // Acordeón mobile del sidebar
    document.getElementById('summaryToggle')?.addEventListener('click', () => {
        const body = document.getElementById('sidebarBody');
        const toggle = document.getElementById('summaryToggle');
        const isOpen = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!isOpen));
        if (body) body.classList.toggle('open', !isOpen);
    });

    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            if (!validateCheckoutForm()) {
                showNotification('Por favor completa todos los campos correctamente');
                return;
            }
            trackEvent('shipping_completed');
            goToStep(3);
        });
    }
}

// ========== CREAR ORDEN ==========
async function createOrder() {
    const user = getCheckoutUser();
    const userKey = getCheckoutUserKey();
    const cart = normalizeCartItems(getCheckoutCart());

    // Recopilar datos del formulario
    const shippingData = {
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        rut: document.getElementById('rut').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        street: document.getElementById('street').value.trim(),
        apartment: document.getElementById('apartment').value.trim(),
        city: document.getElementById('city').value.trim(),
        region: document.getElementById('region').value,
        notes: document.getElementById('notes').value.trim()
    };

    // Crear objeto de orden
    const order = {
        id: generateOrderId(),
        userId: user.uid || user.id,
        userName: user.name,
        userEmail: user.email,
        items: cart,
        shippingData: shippingData,
        totals: window.orderTotals,
        status: 'pending', // pending, paid, shipped, delivered, cancelled
        paymentMethod: 'mercado_pago', // Para fase 2
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    // Guardar orden (localStorage)
    await saveOrder(order);
    latestCreatedOrder = order;

    // Guardar datos de envío para siguiente compra
    if (window.firebaseData?.saveShippingData) {
        await window.firebaseData.saveShippingData(userKey, shippingData);
    }

    if (userKey) {
        writeStorageJSON(getShippingStorageKey(userKey), shippingData);
    }

    // Registrar uso del descuento si fue aplicado
    if (window.appliedDiscount) {
        await registerDiscountUsage(window.appliedDiscount, userKey);
    }

    // Vaciar carrito del usuario
    clearCheckoutCart();
    window.currentCart = [];

    return order;
}

async function loadOrderById(orderId) {
    const normalizedOrderId = String(orderId || '').trim();
    if (!normalizedOrderId) {
        return null;
    }

    if (latestCreatedOrder?.id === normalizedOrderId) {
        return latestCreatedOrder;
    }

    try {
        if (window.firebaseData?.loadOrders) {
            const currentUser = window.hairiaSession?.getCurrentUser() || null;
            const currentUserId = currentUser?.uid || currentUser?.id || null;
            const orders = currentUserId
                ? await window.firebaseData.loadOrders(currentUserId)
                : await window.firebaseData.loadOrders();
            const fromFirebase = Array.isArray(orders)
                ? orders.find(order => String(order?.id || '') === normalizedOrderId)
                : null;

            if (fromFirebase) {
                return fromFirebase;
            }
        }
    } catch (error) {
        console.warn('⚠️ No se pudo cargar la orden desde Firebase para pago directo:', error);
    }

    return null;
}

// ========== GUARDAR ORDEN EN FIREBASE ==========
async function saveOrder(order) {
    if (!window.firebaseData?.saveOrder) {
        throw new Error('firebaseData.saveOrder no está disponible');
    }

    await window.firebaseData.saveOrder(order);
    console.log('✅ Orden guardada:', order.id);
}

// ========== GENERAR ID DE ORDEN ==========
function generateOrderId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `ORD-${timestamp}-${random}`;
}

// ========== MODAL DE PAGO ==========
function setupPaymentModal() {
    const modal = document.getElementById('paymentModal');
    const closeBtn = document.getElementById('modalClose');

    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            modal.classList.remove('active');
        });
    }

    // Cerrar modal al hacer click afuera
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

function showPaymentConfirmation(order) {
    const modal = document.getElementById('paymentModal');
    
    // Cargar número de orden
    document.getElementById('orderNumber').textContent = order.id;
    modal.dataset.orderId = order.id;

    // Cargar resumen de pago
    const paymentSummary = document.getElementById('paymentSummary');
    paymentSummary.innerHTML = `
        <div class="summary-section">
            <h4>Productos</h4>
            ${order.items.map(item => `
                <div class="summary-item">
                    <span>${escapeHtml(item.name || 'Producto')} x${Number(item.quantity) || 0}</span>
                    <span>${formatCheckoutCLP(item.price * item.quantity)}</span>
                </div>
            `).join('')}
        </div>

        <div class="summary-section">
            <div class="summary-total">
                <span>Subtotal:</span>
                <span>${formatCheckoutCLP(order.totals.subtotal)}</span>
            </div>
            <div class="summary-total">
                <span>Envío:</span>
                <span>${order.totals.shipping === 0 ? 'Gratis' : formatCheckoutCLP(order.totals.shipping)}</span>
            </div>
            <div class="summary-total grand-total">
                <span>TOTAL:</span>
                <span>${formatCheckoutCLP(order.totals.total)}</span>
            </div>
        </div>

        <div class="summary-section">
            <h4>Datos de Envío</h4>
            <p><strong>${escapeHtml(order.shippingData.firstName || '')} ${escapeHtml(order.shippingData.lastName || '')}</strong></p>
            <p>${escapeHtml(order.shippingData.street || '')}${order.shippingData.apartment ? ' ' + escapeHtml(order.shippingData.apartment) : ''}</p>
            <p>${escapeHtml(order.shippingData.city || '')}</p>
            <p>${escapeHtml(order.shippingData.region || '')}</p>
            <p>Teléfono: ${escapeHtml(order.shippingData.phone || '')}</p>
        </div>
    `;

    // Mostrar modal
    modal.classList.add('active');
}

// ========== FILTRADO DE CIUDADES POR REGIÓN ==========
function updateCities() {
    const regionSelect = document.getElementById('region');
    const citySelect = document.getElementById('city');
    const selectedRegion = regionSelect.value;
    
    // Limpiar las ciudades
    citySelect.innerHTML = '<option value="">Selecciona una ciudad</option>';
    
    // Si no hay región seleccionada, desabilitar el select de ciudades
    if (!selectedRegion) {
        citySelect.disabled = true;
        return;
    }
    
    // Habilitar el select de ciudades y llenar con las opciones
    citySelect.disabled = false;
    
    const cities = regionesCiudades[selectedRegion] || [];
    cities.forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        option.textContent = city;
        citySelect.appendChild(option);
    });
    
    // Recalcular totales cuando cambia la región (ya que el costo de envío depende de esto)
    recalculateTotalsFromCurrentCart();
}

// ========== FUNCIONES DE NAVEGACIÓN ==========
async function goToPayment() {
    const modal = document.getElementById('paymentModal');
    const orderNumber = document.getElementById('orderNumber').textContent;

    const order = await loadOrderById(orderNumber);
    if (!order) {
        showNotification('No se encontró la orden para iniciar el pago.');
        return;
    }

    modal.classList.remove('active');

    try {
        const preference = await createCheckoutPreferenceFromOrder(order);
        console.log('✅ Preferencia creada desde checkout:', preference.preferenceId);
        console.log('🌐 Redirigiendo a:', preference.redirectUrl);
        window.location.href = preference.redirectUrl;
    } catch (error) {
        console.error('❌ Error iniciando Checkout Pro desde checkout:', error);
        showNotification(`No se pudo abrir Mercado Pago: ${error.message}`);
        modal.classList.add('active');
    }
}

function goToHome() {
    window.location.href = 'index.html';
}

function viewMyOrders() {
    window.location.href = 'my-orders.html';
}

// ========== SISTEMA DE DESCUENTOS ==========
async function applyDiscount() {
    const code = document.getElementById('discountCode')?.value?.toUpperCase().trim();
    
    if (!code) {
        showDiscountMessage('Por favor ingresa un código', 'error');
        return;
    }

    if (!window.firebaseData?.loadDiscountCodes) {
        showDiscountMessage('No se pudo validar descuentos en Firebase', 'error');
        return;
    }

    const discountCodes = await window.firebaseData.loadDiscountCodes();
    const discountCode = discountCodes.find(d => d.code === code);

    if (!discountCode) {
        showDiscountMessage('Código de descuento no válido', 'error');
        return;
    }

    // Verificar si ha expirado (límite de usos)
    if (discountCode.usedCount >= discountCode.maxUses) {
        showDiscountMessage('Este código ha expirado (límite de usos alcanzado)', 'error');
        return;
    }

    const user = getCheckoutUser();
    const userId = user?.uid || user?.id;

    // Verificar usos por usuario
    const userUses = (discountCode.usersApplied?.[userId] || 0);
    if (userUses >= discountCode.usesPerUser) {
        showDiscountMessage(`Ya has usado este código el máximo de veces permitido (${discountCode.usesPerUser})`, 'error');
        return;
    }

    // Aplicar descuento
    window.appliedDiscount = {
        code: discountCode.code,
        type: discountCode.type,
        value: discountCode.value,
        id: discountCode.id
    };

    // Actualizar UI
    const discountAmount = calculateDiscountAmount(discountCode);
    document.getElementById('discountCodeName').textContent = code;
    document.getElementById('discountAmount').textContent = `-${formatCheckoutCLP(discountAmount)}`;
    document.getElementById('discountApplied').style.display = 'block';
    document.getElementById('discountCode').style.display = 'none';
    document.querySelector('.discount-input-group').style.display = 'none';
    document.getElementById('discountMessage').innerHTML = '';

    // Recalcular totales
    recalculateTotalsFromCurrentCart();

    showDiscountMessage(`✅ Código aplicado correctamente (Ahorras ${formatCheckoutCLP(discountAmount)})`, 'success');
}

function removeDiscount() {
    window.appliedDiscount = null;
    document.getElementById('discountApplied').style.display = 'none';
    document.getElementById('discountCode').value = '';
    document.getElementById('discountCode').style.display = 'block';
    document.querySelector('.discount-input-group').style.display = 'flex';
    document.getElementById('discountMessage').innerHTML = '';

    // Recalcular totales
    recalculateTotalsFromCurrentCart();
}

function calculateDiscountAmount(discountCode) {
    const subtotal = window.orderTotals?.subtotal || 0;
    const shipping = window.orderTotals?.shipping || 0;
    const base = subtotal + shipping;

    if (discountCode.type === 'percentage') {
        return (base * discountCode.value) / 100;
    } else {
        return Math.min(discountCode.value, base);
    }
}

function showDiscountMessage(message, type) {
    const messageEl = document.getElementById('discountMessage');
    messageEl.className = `discount-message ${type}`;
    messageEl.textContent = message;
}

async function registerDiscountUsage(discountData, userId) {
    if (!window.firebaseData?.loadDiscountCodes || !window.firebaseData?.saveDiscountCode) {
        console.warn('⚠️ firebaseData de descuentos no disponible');
        return;
    }

    const discounts = await window.firebaseData.loadDiscountCodes();
    const discountIndex = discounts.findIndex(d => d.id === discountData.id);

    if (discountIndex === -1) {
        return;
    }

    const updated = {
        ...discounts[discountIndex],
        usedCount: (discounts[discountIndex].usedCount || 0) + 1,
        usersApplied: {
            ...(discounts[discountIndex].usersApplied || {}),
            [userId]: ((discounts[discountIndex].usersApplied || {})[userId] || 0) + 1
        }
    };

    await window.firebaseData.saveDiscountCode(updated);
    console.log(`✅ Descuento "${discountData.code}" registrado en Firebase`);
}

// ========== NOTIFICACIONES ==========
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}
