// firebase-data.js - MÓDULO UNIFICADO FIREBASE-ONLY
// Responsable de: Productos, Órdenes, Carrito, Envíos, Categorías, Marcas y Descuentos

console.log('🔥 firebase-data.js cargado - modo Firebase-only');

function ensureFirebaseFunction(functionName) {
    if (!window.firebase || typeof window.firebase[functionName] !== 'function') {
        throw new Error(`Firebase no disponible: falta función ${functionName}`);
    }
}

// ============================================
// PRODUCTOS
// ============================================

async function loadProducts() {
    ensureFirebaseFunction('getProducts');
    const products = await window.firebase.getProducts();
    window.productsData = Array.isArray(products) ? products : [];
    return window.productsData;
}

async function createDefaultProducts() {
    ensureFirebaseFunction('createProduct');

    const defaultProducts = [
        {
            name: 'Shampoo Kerastase Premium',
            price: 29990,
            category: 'shampoo',
            featured: true,
            description: 'Shampoo premium con keratina y argan',
            image: '',
            stock: 50,
            sku: 'KERASTASE-001',
            active: true
        },
        {
            name: 'Acondicionador Intenso',
            price: 24990,
            category: 'acondicionador',
            featured: false,
            description: 'Acondicionador profundo hidratante',
            image: '',
            stock: 45,
            sku: 'ACOND-001',
            active: true
        },
        {
            name: 'Mascarilla Reparadora',
            price: 19990,
            category: 'tratamiento',
            featured: true,
            description: 'Tratamiento intensivo para cabello dañado',
            image: '',
            stock: 30,
            sku: 'MASK-001',
            active: true
        }
    ];

    for (const product of defaultProducts) {
        await window.firebase.createProduct(product);
    }

    return loadProducts();
}

async function saveProduct(product) {
    if (!product) return false;

    if (product.id) {
        ensureFirebaseFunction('updateProduct');
        await window.firebase.updateProduct(product.id, product);
        return product;
    }

    ensureFirebaseFunction('createProduct');
    return await window.firebase.createProduct(product);
}

async function updateProductStock(productId, stock, active = false) {
    ensureFirebaseFunction('updateProduct');
    return await window.firebase.updateProduct(productId, {
        stock: Math.max(0, Number.parseInt(stock, 10) || 0),
        active: active !== false,
        updatedAt: new Date().toISOString()
    });
}

async function deleteProduct(productId) {
    ensureFirebaseFunction('deleteProduct');
    await window.firebase.deleteProduct(productId);
    return true;
}

// ============================================
// ÓRDENES
// ============================================

async function loadOrders(userId = null) {
    if (userId) {
        ensureFirebaseFunction('getUserOrders');
        return await window.firebase.getUserOrders(userId);
    }

    let currentUser = window.hairiaSession?.getCurrentUser?.() || null;

    if (!currentUser) {
        try {
            const fromLocal = JSON.parse(localStorage.getItem('hairia_current_user') || 'null');
            const fromSession = JSON.parse(sessionStorage.getItem('hairia_current_user') || 'null');
            currentUser = fromLocal || fromSession;
        } catch (error) {
            currentUser = null;
        }
    }

    const isAdminSession = currentUser?.role === 'admin' || currentUser?.role === 'bodeguero';

    if (!isAdminSession) {
        // Public pages should not try to read all orders from Firestore.
        return [];
    }

    ensureFirebaseFunction('getAllOrders');
    return await window.firebase.getAllOrders();
}

async function trackPageVisit() {
    ensureFirebaseFunction('trackPageVisit');
    return await window.firebase.trackPageVisit();
}

async function loadAnalyticsMetrics(startDate, endDate) {
    ensureFirebaseFunction('getAnalyticsMetrics');
    return await window.firebase.getAnalyticsMetrics(startDate, endDate);
}

async function saveOrder(order) {
    if (window.firebase && typeof window.firebase.saveOrderById === 'function') {
        return await window.firebase.saveOrderById(order);
    }

    ensureFirebaseFunction('createOrder');
    return await window.firebase.createOrder(order);
}

async function updateOrderStatus(orderId, newStatus) {
    ensureFirebaseFunction('updateOrderStatus');
    await window.firebase.updateOrderStatus(orderId, newStatus);
    await notifyOrderStatusEmail(orderId, newStatus);
    return true;
}

async function notifyOrderStatusEmail(orderId, status) {
    try {
        const firebaseUser = window.firebase?.auth?.currentUser;
        if (!firebaseUser?.getIdToken) return false;

        const backendUrl = window.BACKEND_URL || (['localhost', '127.0.0.1'].includes(window.location.hostname)
            ? 'http://localhost:3000'
            : 'https://api.monsite.cl');
        const token = await firebaseUser.getIdToken();
        const response = await fetch(`${backendUrl}/api/notifications/send-order-status-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ orderId, status })
        });
        return response.ok;
    } catch (error) {
        console.warn('No se pudo solicitar email de estado:', error.message);
        return false;
    }
}

async function updateOrderWarehouseData(orderId, updateData) {
    ensureFirebaseFunction('updateOrderWarehouseData');
    await window.firebase.updateOrderWarehouseData(orderId, updateData);
    if (updateData?.status) {
        await notifyOrderStatusEmail(orderId, updateData.status);
    }
    return true;
}

// ============================================
// CARRITO
// ============================================

async function loadCart(userId) {
    ensureFirebaseFunction('getCart');
    return await window.firebase.getCart(userId);
}

async function saveCart(userId, cart) {
    ensureFirebaseFunction('saveCart');
    await window.firebase.saveCart(userId, cart);
    return true;
}

// ============================================
// DATOS DE ENVÍO
// ============================================

async function loadShippingData(userId) {
    ensureFirebaseFunction('getShippingData');
    return await window.firebase.getShippingData(userId);
}

async function saveShippingData(userId, shippingData) {
    ensureFirebaseFunction('saveShippingData');
    await window.firebase.saveShippingData(userId, shippingData);
    return true;
}

// ============================================
// CATEGORÍAS, MARCAS, DESCUENTOS
// ============================================

async function loadCategories() {
    ensureFirebaseFunction('getCategories');
    const categories = await window.firebase.getCategories();
    window.categories = Array.isArray(categories) ? categories : [];
    return window.categories;
}

async function saveCategory(category) {
    ensureFirebaseFunction('saveCategory');
    return await window.firebase.saveCategory(category);
}

async function deleteCategory(categoryId) {
    ensureFirebaseFunction('deleteCategory');
    await window.firebase.deleteCategory(categoryId);
    return true;
}

async function loadBrands() {
    ensureFirebaseFunction('getBrands');
    const brands = await window.firebase.getBrands();
    window.brandsData = Array.isArray(brands) ? brands : [];
    return window.brandsData;
}

async function saveBrand(brand) {
    ensureFirebaseFunction('saveBrand');
    return await window.firebase.saveBrand(brand);
}

async function deleteBrand(brandId) {
    ensureFirebaseFunction('deleteBrand');
    await window.firebase.deleteBrand(brandId);
    return true;
}

async function loadDiscountCodes() {
    ensureFirebaseFunction('getDiscountCodes');
    return await window.firebase.getDiscountCodes();
}

async function saveDiscountCode(discount) {
    ensureFirebaseFunction('saveDiscountCode');
    return await window.firebase.saveDiscountCode(discount);
}

async function deleteDiscountCode(discountId) {
    ensureFirebaseFunction('deleteDiscountCode');
    await window.firebase.deleteDiscountCode(discountId);
    return true;
}

// ============================================
// CONFIGURACIÓN DE FUNCIONES DEL SITIO (FEATURE FLAGS)
// ============================================

async function loadHairAnalysisConfig() {
    ensureFirebaseFunction('getHairAnalysisConfig');
    return await window.firebase.getHairAnalysisConfig();
}

async function saveHairAnalysisConfig(config) {
    ensureFirebaseFunction('saveHairAnalysisConfig');
    return await window.firebase.saveHairAnalysisConfig(config);
}

async function loadHairAnalysisConsent(userId) {
    ensureFirebaseFunction('getHairAnalysisConsent');
    return await window.firebase.getHairAnalysisConsent(userId);
}

async function saveHairAnalysisConsent(userId, consent) {
    ensureFirebaseFunction('saveHairAnalysisConsent');
    return await window.firebase.saveHairAnalysisConsent(userId, consent);
}

async function uploadHairAnalysisTrainingSample(photos) {
    ensureFirebaseFunction('uploadHairAnalysisTrainingSample');
    return await window.firebase.uploadHairAnalysisTrainingSample(photos);
}

// ============================================
// EXPORTAR
// ============================================

window.firebaseData = {
    loadProducts,
    createDefaultProducts,
    saveProduct,
    updateProductStock,
    deleteProduct,
    loadOrders,
    trackPageVisit,
    loadAnalyticsMetrics,
    saveOrder,
    updateOrderStatus,
    updateOrderWarehouseData,
    loadCart,
    saveCart,
    loadShippingData,
    saveShippingData,
    loadCategories,
    saveCategory,
    deleteCategory,
    loadBrands,
    saveBrand,
    deleteBrand,
    loadDiscountCodes,
    saveDiscountCode,
    deleteDiscountCode,
    loadHairAnalysisConfig,
    saveHairAnalysisConfig,
    loadHairAnalysisConsent,
    saveHairAnalysisConsent,
    uploadHairAnalysisTrainingSample
};

console.log('✅ window.firebaseData exportado (Firebase-only)');
window.dispatchEvent(new CustomEvent('hairia:firebase-data-ready', {
    detail: {
        hasLoadProducts: typeof window.firebaseData.loadProducts === 'function',
        hasLoadCategories: typeof window.firebaseData.loadCategories === 'function'
    }
}));
