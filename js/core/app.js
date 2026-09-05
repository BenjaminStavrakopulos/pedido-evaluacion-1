// app.js - VERSIÓN COMPLETA CORREGIDA
console.log('🚀 HairIA App Iniciada');

document.addEventListener('DOMContentLoaded', function () {
    initializeApplication();
});

// Variables globales
window.currentCart = [];
window.currentUser = null;
window.__hairiaAuthSyncStarted = false;
window.__hairiaAuthHydrated = false;

// Datos de productos (inicializar vacíos, se cargarán desde Firebase)
window.productsData = [];

// Categorías (se cargan desde Firebase en initializeSystems)
window.categories = [];
const CUSTOM_CATEGORIES_STORAGE_KEY = 'hairia_custom_categories';
const SAMPLE_PRODUCTS_PURGE_KEY = 'hairia_sample_products_purged_v1';
const LEGACY_SAMPLE_PRODUCT_NAMES = new Set([
    'Shampoo Kerastase Premium',
    'Acondicionador Intenso',
    'Mascarilla Reparadora',
    'Shampoo Reparador Intenso',
    'Acondicionador Hidratante'
]);

const FIXED_CATEGORIES = Object.freeze([
    { id: 'shampoo', name: 'Shampoo', color: '#1a1a1a', description: 'Limpieza y cuidado diario del cabello' },
    { id: 'acondicionador', name: 'Acondicionador', color: '#2d2d2d', description: 'Hidratación y suavidad para el cabello' },
    { id: 'tratamiento', name: 'Tratamiento capilar', color: '#404040', description: 'Reparación y nutrición intensiva' },
    { id: 'peinado', name: 'Peinado', color: '#555555', description: 'Definición y fijación del peinado' },
    { id: 'mascarilla', name: 'Mascarilla capilar', color: '#6b7280', description: 'Hidratación profunda semanal' },
    { id: 'serum', name: 'Sérum capilar', color: '#4b5563', description: 'Brillo y protección para puntas' },
    { id: 'proteccion-termica', name: 'Protección térmica', color: '#374151', description: 'Protección frente al calor de secador o plancha' },
    { id: 'aceite', name: 'Aceite capilar', color: '#1f2937', description: 'Nutrición y control del frizz' },
    { id: 'otros', name: 'Otros', color: '#111827', description: 'Productos adicionales de cuidado capilar' }
]);

function getFixedCategories() {
    return FIXED_CATEGORIES.map(category => ({ ...category }));
}

function loadCustomCategories() {
    try {
        const stored = JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_STORAGE_KEY) || '[]');
        if (!Array.isArray(stored)) return [];
        return stored
            .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
            .map(item => ({
                id: item.id,
                name: item.name,
                color: item.color || '#111827',
                description: item.description || ''
            }));
    } catch (error) {
        console.warn('⚠️ No se pudieron cargar categorías personalizadas:', error);
        return [];
    }
}

function getMergedCategories() {
    const merged = [...getFixedCategories()];
    const fixedIds = new Set(merged.map(category => category.id));
    const customCategories = (Array.isArray(window.categories) ? window.categories : [])
        .filter(category => category && !fixedIds.has(category.id));
    merged.push(...customCategories);
    return merged;
}

function normalizeCatalogText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim();
}

function normalizeCatalogBrandKey(value) {
    return normalizeCatalogText(value).replace(/\s+/g, '-');
}

function getStoredCategoriesFallback() {
    try {
        const parsed = JSON.parse(localStorage.getItem('hairia_categories') || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('⚠️ No se pudieron leer categorías para menú catálogo:', error);
        return [];
    }
}

function getStoredCustomBrandsFallback() {
    try {
        const parsed = JSON.parse(localStorage.getItem('hairia_custom_brands') || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('⚠️ No se pudieron leer marcas personalizadas para menú catálogo:', error);
        return [];
    }
}

function getCatalogMenuCategories() {
    const source = Array.isArray(window.categories) && window.categories.length
        ? window.categories
        : getFixedCategories();

    return source
        .filter(category => category && category.id && category.name)
        .map(category => ({
            id: String(category.id).trim(),
            name: String(category.name).trim()
        }))
        .filter(category => category.id && category.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function getCatalogMenuBrands() {
    const brandsMap = new Map();

    const productsSource = Array.isArray(window.productsData) ? window.productsData : [];
    productsSource.forEach(product => {
        const rawBrand = String(product?.brand || '').trim();
        if (!rawBrand) return;

        const key = normalizeCatalogBrandKey(rawBrand);
        if (!key || brandsMap.has(key)) return;

        brandsMap.set(key, {
            key,
            name: rawBrand
        });
    });

    return Array.from(brandsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function renderDynamicCatalogMenu() {
    const dropdowns = document.querySelectorAll('.catalog-dropdown');
    if (!dropdowns.length) return;

    const brands = getCatalogMenuBrands();
    const categories = getCatalogMenuCategories();
    const productsBasePath = 'products.html';

    if (!brands.length || !categories.length) {
        return;
    }

    const brandsHtml = brands.map(brand => {
        const safeName = escapeHtml(brand.name);
        const safeKey = encodeURIComponent(brand.key);
        return `<a href="${productsBasePath}?brand=${safeKey}" class="catalog-link">${safeName}</a>`;
    }).join('');

    const categoriesHtml = categories.map(category => {
        const safeName = escapeHtml(category.name);
        const safeId = encodeURIComponent(category.id);
        return `<a href="${productsBasePath}?category=${safeId}" class="catalog-link">${safeName}</a>`;
    }).join('');

    dropdowns.forEach(dropdown => {
        const columns = dropdown.querySelectorAll('.catalog-column');
        if (columns.length < 2) return;

        const brandsColumn = columns[0];
        const categoriesColumn = columns[1];

        brandsColumn.innerHTML = `<h4>Marcas</h4>${brandsHtml}`;
        categoriesColumn.innerHTML = `<h4>Categorías</h4>${categoriesHtml}`;
    });
}

async function initializeApplication() {
    console.log('🔄 Inicializando aplicación...');

    renderDynamicCatalogMenu();
    
    // Cargar usuario
    window.currentUser = window.hairiaSession?.getCurrentUser() || null;

    if (window.currentUser) {
        console.log('👤 Usuario cargado en sesión:', window.currentUser.name || window.currentUser.email);
    } else {
        console.log('👤 No hay usuario logueado');
    }
    
    // Manejar checkout pendiente si existe
    handlePendingCheckout();
    
    // Configurar UI y sistemas
    setupUserInterface();
    setupAuthStateSync();
    try {
        await initializeSystems();
    } catch (error) {
        console.error('❌ Error inicializando sistemas:', error);
        showNotification('No se pudieron cargar los productos. Reintentando...');

        setTimeout(async () => {
            try {
                await initializeSystems();
            } catch (retryError) {
                console.error('❌ Reintento fallido de inicialización:', retryError);
            }
        }, 1200);
    }
}

function setupAuthStateSync() {
    if (window.__hairiaAuthSyncStarted) return;
    window.__hairiaAuthSyncStarted = true;

    const attachAuthListener = async () => {
        try {
            await waitForFirebaseReady();
            if (!window.firebase || typeof window.firebase.getCurrentUser !== 'function') {
                return;
            }

            window.firebase.getCurrentUser((firebaseUser) => {
                const previousUid = window.currentUser?.uid || null;

                if (firebaseUser && firebaseUser.uid) {
                    const sessionData = {
                        uid: firebaseUser.uid,
                        email: firebaseUser.email,
                        name: firebaseUser.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
                        role: firebaseUser.role || 'client',
                        photoURL: firebaseUser.photoURL || '',
                        provider: firebaseUser.provider || 'password',
                        loggedInAt: window.currentUser?.loggedInAt || new Date().toISOString()
                    };

                    window.hairiaSession?.persistCurrentUser(sessionData);
                    window.currentUser = sessionData;
                    window.__hairiaAuthHydrated = true;

                    if (!previousUid || previousUid !== sessionData.uid) {
                        handlePendingCheckout();
                    }
                } else {
                    // Evita el parpadeo: si ya hay una sesión local cargada,
                    // no la limpiamos mientras Firebase termina de responder.
                    if (window.currentUser?.uid) {
                        window.__hairiaAuthHydrated = true;
                        setupUserInterface();
                        return;
                    }

                    window.hairiaSession?.clearCurrentUser();
                    window.currentUser = null;
                    window.__hairiaAuthHydrated = true;
                }

                setupUserInterface();
            });
        } catch (error) {
            console.warn('⚠️ No se pudo iniciar sincronización de sesión con Firebase Auth:', error);
        }
    };

    attachAuthListener();
}

async function waitForFirebaseReady(maxAttempts = 40, delayMs = 150) {
    const isReady = () => {
        const hasFirebaseConfig = !!window.firebase
            && typeof window.firebase.getProducts === 'function';
        const hasFirebaseData = !!window.firebaseData
            && typeof window.firebaseData.loadProducts === 'function';
        return hasFirebaseConfig && hasFirebaseData;
    };

    if (isReady()) {
        return true;
    }

    let resolvedByEvent = false;
    const eventPromise = new Promise((resolve) => {
        const onReadyEvent = () => {
            if (isReady()) {
                resolvedByEvent = true;
                window.removeEventListener('hairia:firebase-ready', onReadyEvent);
                window.removeEventListener('hairia:firebase-data-ready', onReadyEvent);
                resolve(true);
            }
        };

        window.addEventListener('hairia:firebase-ready', onReadyEvent);
        window.addEventListener('hairia:firebase-data-ready', onReadyEvent);
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (resolvedByEvent || isReady()) {
            return true;
        }

        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    if (resolvedByEvent || isReady()) {
        return true;
    }

    await Promise.race([
        eventPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase aún no está listo para cargar datos')), 2000))
    ]);

    return true;
}

function handlePendingCheckout() {
    const pendingCheckout = localStorage.getItem('pending_checkout');
    const checkoutRedirect = localStorage.getItem('checkout_redirect');
    
    if (pendingCheckout && checkoutRedirect === 'true' && window.currentUser) {
        console.log('🛒 Recuperando checkout pendiente...');

        localStorage.removeItem('pending_checkout');
        localStorage.removeItem('checkout_redirect');
        
        try {
            const pendingCart = JSON.parse(pendingCheckout);
            
            // Fusionar carrito pendiente con carrito actual
            pendingCart.forEach(item => {
                const existingItem = window.currentCart.find(cartItem => cartItem.id === item.id);
                if (existingItem) {
                    existingItem.quantity += item.quantity;
                } else {
                    window.currentCart.push(item);
                }
            });
            
            // Guardar carrito fusionado
            saveCart();
            
            console.log('✅ Carrito pendiente recuperado, redirigiendo a checkout...');
            
            // Redirigir a checkout después de un breve delay
            setTimeout(() => {
                if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                    window.location.href = 'checkout.html';
                }
            }, 1000);
            
        } catch (error) {
            console.error('❌ Error procesando checkout pendiente:', error);
        }
    }
}

function setupUserInterface() {
    console.log('🖥️ Configurando interfaz de usuario...');
    
    let loginBtn = document.getElementById('loginBtn');
    let userMenuContainer = document.querySelector('.user-menu-container');
    let userDropdown = document.getElementById('userDropdown');
    let logoutBtn = document.getElementById('logoutBtn');
    let userNameSpan = document.getElementById('userName');
    let manageProductsBtn = document.getElementById('manageProductsBtn');
    
    if (!loginBtn || !userMenuContainer || !userDropdown) {
        console.log('ℹ️ Elementos de usuario no encontrados');
        return;
    }

    let showLoginBtn = document.getElementById('showLoginBtn');
    let showRegisterBtn = document.getElementById('showRegisterBtn');

    document.querySelectorAll('.dropdown-link[data-href]').forEach((button) => {
        if (button.dataset.listener === 'true') return;
        button.addEventListener('click', () => {
            window.location.href = button.dataset.href;
        });
        button.dataset.listener = 'true';
    });

    if (window.currentUser && window.currentUser.name) {
        console.log('👤 Mostrando usuario:', window.currentUser.name);
        
        if (userNameSpan) userNameSpan.textContent = window.currentUser.name;
        userMenuContainer.style.display = 'flex';
        loginBtn.style.display = '';
        userDropdown.style.display = 'none';
        
        if (showLoginBtn) showLoginBtn.style.display = 'none';
        if (showRegisterBtn) showRegisterBtn.style.display = 'none';
        
        // Mostrar botón de gestionar productos solo para admins
        if (window.currentUser.role === 'admin') {
            console.log('👑 Usuario es admin, mostrando botón de gestión...');
            if (manageProductsBtn) {
                manageProductsBtn.style.display = '';
                if (manageProductsBtn.dataset.listener !== 'true') {
                    manageProductsBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        console.log('🔧 Redirigiendo al panel de administración...');
                        window.location.href = 'admin/admin-products.html';
                    });
                    manageProductsBtn.dataset.listener = 'true';
                }
            }
        } else {
            if (manageProductsBtn) manageProductsBtn.style.display = 'none';
        }
        
        // Menú: abrir/cerrar solo al hacer clic
        function openMenu() {
            userMenuContainer.classList.add('open');
            userDropdown.style.display = 'flex';
        }
        
        function closeMenu() {
            userMenuContainer.classList.remove('open');
            userDropdown.style.display = 'none';
        }
        
        if (loginBtn.dataset.listener !== 'true') {
            loginBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (userMenuContainer.classList.contains('open')) {
                    closeMenu();
                } else {
                    openMenu();
                }
            });
            loginBtn.dataset.listener = 'true';
        }
        
        document.addEventListener('click', function (e) {
            if (!userMenuContainer.contains(e.target)) {
                closeMenu();
            }
        });
        
        // Cerrar sesión
        if (logoutBtn) {
            if (logoutBtn.dataset.listener !== 'true') {
                logoutBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    logoutUser();
                });
                logoutBtn.dataset.listener = 'true';
            }
        }
    } else {
        console.log('👤 Mostrando botón de login');
        
        userMenuContainer.style.display = 'flex';
        loginBtn.style.display = 'none';
        userDropdown.style.display = 'none';
        if (manageProductsBtn) manageProductsBtn.style.display = 'none';
        
        if (showLoginBtn) {
            showLoginBtn.style.display = '';
            if (showLoginBtn.dataset.listener !== 'true') {
                showLoginBtn.addEventListener('click', function () {
                    console.log('🔑 Redirigiendo a login...');
                    window.location.href = 'login.html';
                });
                showLoginBtn.dataset.listener = 'true';
            }
        }
        
        if (showRegisterBtn) showRegisterBtn.style.display = 'none';
    }
}

async function initializeSystems() {
    console.log('⚙️ Inicializando sistemas...');

    await waitForFirebaseReady();
    
    if (!window.firebaseData?.loadProducts) {
        throw new Error('FirebaseData no está disponible para inicializar productos');
    }

    // Cargar productos y categorías desde Firebase
    window.productsData = await window.firebaseData.loadProducts();
    window.firebaseData.trackPageVisit().catch(() => {});
    await purgeLegacySampleProducts();

    if (typeof window.firebaseData.loadCategories === 'function') {
        window.categories = await window.firebaseData.loadCategories();
    } else if (window.firebase && typeof window.firebase.getCategories === 'function') {
        console.warn('⚠️ loadCategories no disponible en firebaseData, usando fallback window.firebase.getCategories()');
        const fallbackCategories = await window.firebase.getCategories();
        window.categories = Array.isArray(fallbackCategories) ? fallbackCategories : [];
    } else {
        console.warn('⚠️ No hay función de categorías disponible, usando arreglo vacío');
        window.categories = [];
    }

    window.categories = getMergedCategories();
    try {
        localStorage.setItem('hairia_categories', JSON.stringify(window.categories));
    } catch (error) {
        console.warn('⚠️ No se pudieron guardar categorías en localStorage:', error);
    }
    
    loadUserCart();
    await loadFeaturedProducts();
    loadCategories();
    loadProducts();
    renderDynamicCatalogMenu();
    setupCatalogDelegation();
    // setupUserMenuInteractions(); // ESTA FUNCIÓN YA NO ES NECESARIA
    setupSearch();

    window.dispatchEvent(new CustomEvent('hairia:data-ready', {
        detail: {
            productsCount: Array.isArray(window.productsData) ? window.productsData.length : 0,
            categoriesCount: Array.isArray(window.categories) ? window.categories.length : 0
        }
    }));
    
    console.log('✅ Sistemas inicializados correctamente');
    console.log('📦 Productos disponibles:', window.productsData.length);
}

async function purgeLegacySampleProducts() {
    const wasPurged = localStorage.getItem(SAMPLE_PRODUCTS_PURGE_KEY) === 'true';
    if (wasPurged) {
        return;
    }

    const products = Array.isArray(window.productsData) ? window.productsData : [];
    const sampleProducts = products.filter(product => LEGACY_SAMPLE_PRODUCT_NAMES.has(String(product?.name || '').trim()));

    if (!sampleProducts.length) {
        localStorage.setItem(SAMPLE_PRODUCTS_PURGE_KEY, 'true');
        return;
    }

    if (window.firebaseData?.deleteProduct) {
        for (const sampleProduct of sampleProducts) {
            try {
                await window.firebaseData.deleteProduct(sampleProduct.id);
            } catch (error) {
                console.warn('⚠️ No se pudo eliminar producto de muestra en Firebase:', sampleProduct?.name, error);
            }
        }
    }

    window.productsData = products.filter(product => !LEGACY_SAMPLE_PRODUCT_NAMES.has(String(product?.name || '').trim()));

    try {
        localStorage.setItem('hairia_products', JSON.stringify(window.productsData));
    } catch (error) {
        console.warn('⚠️ No se pudo sincronizar productos tras purga de muestras:', error);
    }

    localStorage.setItem(SAMPLE_PRODUCTS_PURGE_KEY, 'true');
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');

    if (!searchInput || !searchButton) return;

    function performSearch() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        if (searchTerm) {
            window.location.href = `products.html?search=${encodeURIComponent(searchTerm)}`;
        }
    }

    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

function getDiscountedPrice(product) {
    const price = Number(product?.price) || 0;
    if (product?.discountType === 'percentage') {
        return Math.max(0, Math.round(price - (price * (Number(product.discountPercent) || 0) / 100)));
    } else if (product?.discountType === 'amount') {
        return Math.max(0, price - (Number(product.discountAmount) || 0));
    }
    return price;
}

function getDiscountText(product) {
    if (product?.discountType === 'percentage' && Number(product.discountPercent) > 0) {
        return `${Number(product.discountPercent)}% OFF`;
    } else if (product?.discountType === 'amount' && Number(product.discountAmount) > 0) {
        return `-${formatCLP(product.discountAmount)}`;
    }
    return '';
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

function sanitizeImageUrl(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';

    if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
        return trimmed;
    }

    return '';
}

function isProductAvailable(product) {
    if (!product || product.active === false) return false;
    const stock = Number.parseInt(product.stock, 10);
    return Number.isFinite(stock) ? stock > 0 : true;
}

function isProductOutOfStock(product) {
    const stock = Number.parseInt(product?.stock, 10);
    return product?.active === false || (Number.isFinite(stock) && stock <= 0);
}

function setupCatalogDelegation() {
    const grids = ['featuredCarousel', 'productsGrid'];

    grids.forEach((gridId) => {
        const grid = document.getElementById(gridId);
        if (!grid || grid.dataset.listener === 'true') return;

        grid.addEventListener('click', (event) => {
            const cartButton = event.target.closest('button[data-action="add-to-cart"][data-product-id]');
            if (cartButton) {
                event.stopPropagation();
                addToCartFromButton(cartButton.dataset.productId);
                return;
            }

            if (event.target.closest('button[data-action="out-of-stock"]')) {
                event.stopPropagation();
                return;
            }

            const card = event.target.closest('[data-action="open-product"][data-product-id]');
            if (card) {
                openProductModal(card.dataset.productId);
            }
        });

        grid.dataset.listener = 'true';
    });
}

function parseStoredOrders() {
    try {
        const raw = localStorage.getItem('hairia_orders');
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('⚠️ No se pudieron leer órdenes desde localStorage:', error);
        return [];
    }
}

function getFallbackFeaturedProducts(limit = 3) {
    const products = (Array.isArray(window.productsData) ? window.productsData : []).filter(isProductAvailable);

    return [...products]
        .sort((a, b) => {
            const dateA = new Date(a?.createdAt || 0).getTime() || 0;
            const dateB = new Date(b?.createdAt || 0).getTime() || 0;
            return dateB - dateA;
        })
        .slice(0, limit);
}

async function getTopSellingProducts(limit = 3) {
    const products = (Array.isArray(window.productsData) ? window.productsData : []).filter(isProductAvailable);
    if (!products.length) return [];

    let orders = [];

    if (window.firebaseData?.loadOrders) {
        try {
            orders = await window.firebaseData.loadOrders();
        } catch (error) {
            console.warn('⚠️ No se pudieron cargar órdenes desde Firebase para top ventas:', error);
        }
    }

    if (!Array.isArray(orders) || !orders.length) {
        orders = parseStoredOrders();
    }

    if (!orders.length) {
        return getFallbackFeaturedProducts(limit);
    }

    const soldByProductId = new Map();

    orders.forEach((order) => {
        if (!Array.isArray(order?.items)) return;

        order.items.forEach((item) => {
            const productId = item?.id ?? item?.productId ?? item?.product?.id;
            if (productId == null) return;

            const key = String(productId);
            const quantity = Math.max(1, Number.parseInt(item?.quantity, 10) || 1);
            soldByProductId.set(key, (soldByProductId.get(key) || 0) + quantity);
        });
    });

    const rankedProducts = products
        .map((product) => ({
            ...product,
            __soldUnits: soldByProductId.get(String(product.id)) || 0
        }))
        .sort((a, b) => {
            if (b.__soldUnits !== a.__soldUnits) {
                return b.__soldUnits - a.__soldUnits;
            }

            const dateA = new Date(a?.createdAt || 0).getTime() || 0;
            const dateB = new Date(b?.createdAt || 0).getTime() || 0;
            return dateB - dateA;
        });

    const topSold = rankedProducts.filter(product => product.__soldUnits > 0).slice(0, limit);
    return topSold.length ? topSold : getFallbackFeaturedProducts(limit);
}

async function loadFeaturedProducts() {
    const featuredCarousel = document.getElementById('featuredCarousel');
    
    if (!featuredCarousel) return;

    const featuredProducts = await getTopSellingProducts(3);
    
    if (featuredProducts.length > 0) {
        featuredCarousel.innerHTML = featuredProducts.map(product => {
            const safeName = escapeHtml(product.name || 'Producto');
            const safeProductId = escapeHtml(String(product.id));
            const safeImage = sanitizeImageUrl(product.image);

            return `
            <div class="product-card" data-action="open-product" data-product-id="${safeProductId}" style="cursor: pointer;">
                <div class="product-image">
                    ${safeImage ?
                        `<img src="${safeImage}" alt="${safeName}" class="product-real-image">` :
                        `<div class="image-placeholder">
                            <span class="product-emoji">${getCategoryEmoji(product.category)}</span>
                            <span class="product-text">${escapeHtml((product.name || '').split(' ')[0] || '')}</span>
                        </div>`
                    }
                    <span class="featured-badge">🔥 Top ventas</span>
                </div>
                <div class="product-info">
                    <h3>${safeName}</h3>
                    ${getDiscountText(product) ?
                        `<div class="price-with-discount">
                            <span class="original-price">${formatCLP(product.price)}</span>
                            <div class="discount-price-row">
                                <p class="product-price discounted">${formatCLP(getDiscountedPrice(product))}</p>
                                <span class="discount-badge">${getDiscountText(product)}</span>
                            </div>
                        </div>` :
                        `<p class="product-price">${formatCLP(product.price)}</p>`
                    }
                    <button class="add-to-cart" data-action="add-to-cart" data-product-id="${safeProductId}">
                        Agregar al Carrito
                    </button>
                </div>
            </div>
        `;
        }).join('');
    } else {
        featuredCarousel.innerHTML = '<p class="no-featured">Aún no hay suficientes ventas para destacar productos.</p>';
    }
}

function loadCategories() {
    const categoriesGrid = document.getElementById('categoriesGrid');
    if (!categoriesGrid) return;

    const productCountByCategory = (window.productsData || []).reduce((acc, product) => {
        acc[product.category] = (acc[product.category] || 0) + 1;
        return acc;
    }, {});

    categoriesGrid.innerHTML = window.categories.map(category => {
        const safeCategoryId = escapeHtml(String(category.id || ''));
        const safeCategoryName = escapeHtml(category.name || 'Categoría');
        const safeColor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(category.color || '') ? category.color : '#1a1a1a';

        return `
        <div class="category-card" data-category="${safeCategoryId}">
            <div class="category-icon" style="background-color: ${safeColor}">
                ${getCategoryEmoji(category.id)}
            </div>
            <h3>${safeCategoryName}</h3>
            <p>${productCountByCategory[category.id] || 0} productos</p>
            <a href="products.html?category=${encodeURIComponent(String(category.id || ''))}" class="category-link">Ver productos</a>
        </div>
    `;
    }).join('');
}

function getCategoryEmoji(categoryId) {
    const emojis = {
        'shampoo': '🧴',
        'acondicionador': '💧',
        'tratamiento': '🎭',
        'peinado': '💇',
        'mascarilla': '🫧',
        'serum': '✨',
        'proteccion-termica': '🔥',
        'aceite': '💧',
        'otros': '🛍️'
    };
    return emojis[categoryId] || '🛍️';
}

function loadProducts() {
    const productsGrid = document.getElementById('productsGrid');
    if (!productsGrid) return;

    const productsToShow = (window.productsData || []).slice(0, 6);
    const categoryNameById = (window.categories || []).reduce((acc, category) => {
        acc[category.id] = category.name;
        return acc;
    }, {});

    if (productsToShow.length === 0) {
        productsGrid.innerHTML = '<p class="no-featured">No hay productos disponibles en este momento.</p>';
        return;
    }

    productsGrid.innerHTML = productsToShow.map(product => {
        const safeName = escapeHtml(product.name || 'Producto');
        const safeProductId = escapeHtml(String(product.id));
        const safeImage = sanitizeImageUrl(product.image);
        const isOutOfStock = isProductOutOfStock(product);

        return `
        <div class="product-card${isOutOfStock ? ' product-card-out-of-stock' : ''}" data-action="open-product" data-product-id="${safeProductId}" style="cursor: pointer;">
            <div class="product-image">
                ${safeImage ?
                    `<img src="${safeImage}" alt="${safeName}" class="product-real-image">` :
                    `<div class="image-placeholder">
                        <span class="product-emoji">${getCategoryEmoji(product.category)}</span>
                        <span class="product-text">${escapeHtml((product.name || '').split(' ')[0] || '')}</span>
                    </div>`
                }
                ${product.featured ? '<span class="featured-badge">⭐ Destacado</span>' : ''}
            </div>
            <div class="product-info">
                <h3>${safeName}</h3>
                ${product.discountType && product.discountType !== 'none' ?
                    `<div class="price-with-discount">
                        <span class="original-price">${formatCLP(product.price)}</span>
                        <span class="discount-badge">${getDiscountText(product)}</span>
                        <p class="product-price discounted">${formatCLP(getDiscountedPrice(product))}</p>
                    </div>` :
                    `<p class="product-price">${formatCLP(product.price)}</p>`
                }
                <div class="product-category">${escapeHtml(categoryNameById[product.category] || product.category || '')}</div>
                <button class="add-to-cart${isOutOfStock ? ' out-of-stock-button' : ''}" data-action="${isOutOfStock ? 'out-of-stock' : 'add-to-cart'}" data-product-id="${safeProductId}" ${isOutOfStock ? 'disabled' : ''}>
                    ${isOutOfStock ? 'Agotado' : 'Agregar al Carrito'}
                </button>
            </div>
        </div>
    `;
    }).join('');
}

function loadUserCart() {
    if (window.currentUser?.uid) {
        const userCartKey = `hairia_cart_${window.currentUser.uid}`;
        window.currentCart = JSON.parse(localStorage.getItem(userCartKey)) || [];
        console.log('🛒 Carrito de usuario cargado:', window.currentCart.length, 'items');
    } else {
        window.currentCart = JSON.parse(localStorage.getItem('hairia_guest_cart')) || [];
        console.log('🛒 Carrito de invitado cargado:', window.currentCart.length, 'items');
    }

    window.currentCart = window.currentCart.map(normalizeCartItemQuantity);
    window.currentCart = window.currentCart.map(normalizeCartItemPrice);
    saveCart();

    if (typeof window.updateCartUI === 'function') {
        window.updateCartUI();
    }
}

function normalizeCartItemQuantity(item) {
    const quantity = Math.max(1, Number.parseInt(item?.quantity, 10) || 1);
    if (item?.quantitySource === 'user') {
        return { ...item, quantity };
    }

    return { ...item, quantity: quantity > 1 ? 1 : quantity, quantitySource: 'user' };
}

function normalizeCartItemPrice(item) {
    const product = (window.productsData || []).find(productItem => String(productItem.id) === String(item?.id));
    if (!product || !getDiscountText(product)) return item;

    const originalPrice = Number(item.originalPrice) || Number(product.price) || 0;
    return {
        ...product,
        ...item,
        originalPrice,
        price: getDiscountedPrice(product)
    };
}

// updateCartUI es manejado por cart.js
// Esta función se define en cart.js y es llamada cuando el carrito cambia

function addToCart(product) {
    console.log('➕ Agregando al carrito:', product.name);

    if (isProductOutOfStock(product)) {
        showNotification('Este producto está agotado');
        return;
    }

    const originalPrice = Number(product.price) || 0;
    const finalPrice = getDiscountedPrice(product);
    
    const existingItem = window.currentCart.find(item => item.id === product.id);

    if (existingItem) {
        const refreshedItem = normalizeCartItemPrice({
            ...existingItem,
            name: product.name,
            description: product.description,
            image: product.image,
            discountType: product.discountType,
            discountPercent: product.discountPercent,
            discountAmount: product.discountAmount
        });
        Object.assign(existingItem, refreshedItem);
        existingItem.quantity = Math.max(1, Number.parseInt(existingItem.quantity, 10) || 1);
        existingItem.quantity += 1;
        existingItem.quantitySource = 'user';
    } else {
        window.currentCart.push({
            ...product,
            originalPrice,
            price: finalPrice,
            quantity: 1,
            quantitySource: 'user'
        });
    }

    saveCart();
    showNotification(`${product.name} agregado al carrito`);
}

function removeFromCart(productId) {
    console.log('➖ Eliminando del carrito:', productId);
    
    window.currentCart = window.currentCart.filter(item => item.id !== productId);
    saveCart();
    showNotification('Producto eliminado del carrito');
}

function updateQuantity(productId, change) {
    console.log('📊 Actualizando cantidad:', productId, change);
    
    const item = window.currentCart.find(item => String(item.id) === String(productId));
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(productId);
        } else {
            saveCart();
            updateCartUI();
        }
    }
}

function saveCart() {
    if (window.currentUser?.uid) {
        const userCartKey = `hairia_cart_${window.currentUser.uid}`;
        localStorage.setItem(userCartKey, JSON.stringify(window.currentCart));
        console.log('💾 Carrito guardado para usuario:', window.currentUser.uid);
    } else {
        localStorage.setItem('hairia_guest_cart', JSON.stringify(window.currentCart));
        console.log('💾 Carrito guardado para invitado');
    }
    
    // Notificar a cart.js para actualizar UI
    if (window.updateCartUI && typeof window.updateCartUI === 'function') {
        window.updateCartUI();
    }
}

// Exponer saveCart globalmente
window.saveCart = saveCart;

window.addToCartFromButton = function (productId) {
    console.log('🛒 addToCartFromButton llamado para producto:', productId);
    
    const product = window.productsData.find(p => p.id === productId);
    if (product) {
        addToCart(product);
    } else {
        console.error('❌ Producto no encontrado:', productId);
    }
};

window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;

window.logoutUser = async function () {
    console.log('👋 Cerrando sesión...');
    
    // Guardar el carrito del usuario antes de borrarlo
    if (window.currentUser?.uid) {
        const userCartKey = `hairia_cart_${window.currentUser.uid}`;
        localStorage.setItem(userCartKey, JSON.stringify(window.currentCart));
        console.log('💾 Carrito del usuario guardado');
    }
    
    try {
        if (window.firebase && typeof window.firebase.logoutUser === 'function') {
            await window.firebase.logoutUser();
        }
    } catch (error) {
        console.warn('⚠️ Error cerrando sesión en Firebase Auth (continuando limpieza local):', error);
    }

    // Limpiar datos de usuario
    window.hairiaSession?.clearCurrentUser();
    window.currentUser = null;
    
    // Cargar carrito de invitado
    window.currentCart = JSON.parse(localStorage.getItem('hairia_guest_cart')) || [];
    console.log('🛒 Carrito de invitado cargado:', window.currentCart.length, 'items');
    
    // Actualizar UI del carrito
    if (typeof updateCartUI === 'function') {
        updateCartUI();
    }
    
    console.log('✅ Sesión cerrada, redirigiendo...');
    window.location.href = 'index.html';
};

function toggleCart() {
    const cartSidebar = document.getElementById('cartSidebar');
    const cartOverlay = document.getElementById('cartOverlay');

    if (cartSidebar && cartOverlay) {
        const isActive = cartSidebar.classList.contains('active');
        
        if (isActive) {
            cartSidebar.classList.remove('active');
            cartOverlay.classList.remove('active');
            document.body.style.overflow = '';
            console.log('🛒 Carrito cerrado');
        } else {
            cartSidebar.classList.add('active');
            cartOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            console.log('🛒 Carrito abierto');
        }
    }
}

function showNotification(message) {
    ensureAppNotificationStyles();

    const existing = document.getElementById('hairia-app-toast');
    if (existing) existing.remove();

    if (window.__appToastTimer) {
        clearTimeout(window.__appToastTimer);
        window.__appToastTimer = null;
    }

    const normalizedMessage = String(message || '').trim();
    const isError = /(^error|^no se pudo|^deb(es|e)|^fallo|^ocurrio|^invalid|^credenciales|^no encontrado)/i.test(normalizedMessage);
    const toneClass = isError ? 'hairia-app-toast-error' : 'hairia-app-toast-success';
    const toneTitle = isError ? 'No se pudo completar' : 'Listo';

    const toast = document.createElement('div');
    toast.id = 'hairia-app-toast';
    toast.className = `hairia-app-toast ${toneClass}`;
    toast.innerHTML = `
        <button type="button" class="hairia-app-toast-close" data-close-toast="true" aria-label="Cerrar">x</button>
        <h3 class="hairia-app-toast-title">${toneTitle}</h3>
        <p class="hairia-app-toast-text">${normalizedMessage}</p>
    `;

    const closeToast = () => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 180);
    };

    toast.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.dataset.closeToast === 'true') {
            closeToast();
        }
    });

    document.body.appendChild(toast);
    toast.offsetHeight;
    toast.classList.add('show');

    window.__appToastTimer = setTimeout(() => {
        closeToast();
        window.__appToastTimer = null;
    }, 2600);
}

function ensureAppNotificationStyles() {
    if (document.getElementById('hairia-app-popup-styles')) return;

    const style = document.createElement('style');
    style.id = 'hairia-app-popup-styles';
    style.textContent = `
        .hairia-app-toast {
            position: fixed;
            top: 16px;
            right: 16px;
            width: min(90vw, 340px);
            z-index: 3500;
            opacity: 0;
            pointer-events: auto;
            transform: translateY(-10px);
            transition: opacity 0.2s ease, transform 0.2s ease;
            background: #ffffff;
            border: 1px solid #dbe3ee;
            border-radius: 12px;
            padding: 12px 12px 10px;
            box-shadow: 0 14px 30px rgba(15, 23, 42, 0.2);
        }

        .hairia-app-toast.show {
            opacity: 1;
            transform: translateY(0);
        }

        .hairia-app-toast.hide {
            opacity: 0;
            transform: translateY(-6px);
        }

        .hairia-app-toast::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            border-radius: 12px 12px 0 0;
            background: #10b981;
        }

        .hairia-app-toast-error::before {
            background: #ef4444;
        }

        .hairia-app-toast-title {
            margin: 0 16px 3px 0;
            font-size: 0.9rem;
            color: #0f172a;
        }

        .hairia-app-toast-text {
            margin: 0;
            color: #334155;
            line-height: 1.4;
            font-size: 0.84rem;
        }

        .hairia-app-toast-close {
            position: absolute;
            top: 7px;
            right: 8px;
            width: 22px;
            height: 22px;
            border: 0;
            border-radius: 6px;
            background: rgba(15, 23, 42, 0.09);
            color: #0f172a;
            font-weight: 800;
            cursor: pointer;
        }

        @media (max-width: 640px) {
            .hairia-app-toast {
                left: 10px;
                right: 10px;
                top: 10px;
                width: auto;
            }
        }
    `;

    document.head.appendChild(style);
}

function openProductModal(productId) {
    console.log('📦 Abriendo modal para producto:', productId);
    
    const product = window.productsData.find(p => p.id === productId);
    if (!product) {
        console.error('❌ Producto no encontrado:', productId);
        return;
    }

    document.getElementById('modalProductName').textContent = product.name;

    const modalHeader = document.querySelector('.modal-header');
    if (modalHeader) {
        modalHeader.innerHTML = `
            <h2 id="modalProductName">${product.name}</h2>
            <div class="modal-price-section">
                ${product.discountType !== 'none' ?
                    `<div class="modal-price-with-discount">
                        <span class="modal-original-price">${formatCLP(product.price)}</span>
                        <span class="modal-discount-badge">${getDiscountText(product)}</span>
                        <div class="modal-final-price">${formatCLP(getDiscountedPrice(product))}</div>
                    </div>` :
                    `<div class="modal-price">${formatCLP(product.price)}</div>`
                }
            </div>
        `;
    }

    const categoryElem = document.getElementById('modalProductCategory');
    if (categoryElem) {
        categoryElem.textContent = getCategoryName(product.category);
    }
    
    const descElem = document.getElementById('modalProductDescription');
    if (descElem) {
        descElem.textContent = product.description;
    }
    
    const quantityElem = document.getElementById('modalProductQuantity');
    if (quantityElem) {
        quantityElem.textContent = product.quantity && product.unit ?
            `${product.quantity} ${product.unit}` : 'N/A';
    }

    const productImage = document.getElementById('modalProductImage');
    const imagePlaceholder = document.getElementById('modalImagePlaceholder');
    
    if (productImage && imagePlaceholder) {
        if (product.image) {
            productImage.src = product.image;
            productImage.style.display = 'block';
            imagePlaceholder.style.display = 'none';
        } else {
            productImage.style.display = 'none';
            imagePlaceholder.style.display = 'flex';
        }
    }

    const ingredientsSection = document.getElementById('modalIngredientsSection');
    const ingredientsText = document.getElementById('modalProductIngredients');
    if (ingredientsSection && ingredientsText) {
        if (product.ingredients) {
            ingredientsText.textContent = product.ingredients;
            ingredientsSection.style.display = 'block';
        } else {
            ingredientsSection.style.display = 'none';
        }
    }

    const usageSection = document.getElementById('modalUsageSection');
    const usageText = document.getElementById('modalProductUsage');
    if (usageSection && usageText) {
        if (product.usage) {
            usageText.textContent = product.usage;
            usageSection.style.display = 'block';
        } else {
            usageSection.style.display = 'none';
        }
    }

    const addToCartBtn = document.getElementById('modalAddToCart');
    if (addToCartBtn) {
        const newAddToCartBtn = addToCartBtn.cloneNode(true);
        addToCartBtn.replaceWith(newAddToCartBtn);
        const outOfStock = isProductOutOfStock(product);
        newAddToCartBtn.disabled = outOfStock;
        newAddToCartBtn.textContent = outOfStock ? 'Agotado' : 'Agregar al Carrito';
        newAddToCartBtn.classList.toggle('out-of-stock-button', outOfStock);
        newAddToCartBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            if (outOfStock) return;
            addToCart(product);
            closeProductModal();
        });
    }

    document.getElementById('productModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeProductModal() {
    console.log('📦 Cerrando modal de producto');
    
    document.getElementById('productModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Configurar eventos del modal
document.addEventListener('DOMContentLoaded', function () {
    const modalOverlay = document.getElementById('modalOverlay');
    const modalClose = document.getElementById('modalClose');

    if (modalOverlay) modalOverlay.addEventListener('click', closeProductModal);
    if (modalClose) modalClose.addEventListener('click', closeProductModal);

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeProductModal();
        }
    });
});

function getCategoryName(categoryId) {
    const category = window.categories.find(cat => cat.id === categoryId);
    return category ? category.name : categoryId;
}

function formatCLP(amount) {
    if (typeof amount !== 'number') {
        amount = parseFloat(amount) || 0;
    }
    
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// Hacer funciones disponibles globalmente
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.formatCLP = formatCLP;
window.getCategoryName = getCategoryName;
window.toggleCart = toggleCart;
window.addToCart = addToCart;

// Función setupUserMenuInteractions que faltaba
function setupUserMenuInteractions() {
    const loginBtn = document.getElementById('loginBtn') || document.getElementById('loginButton');
    if (!loginBtn || !loginBtn.classList.contains('user-logged-in')) return;

    let hideTimeout;
    const dropdown = loginBtn.querySelector('.user-dropdown');

    if (!dropdown) return;

    dropdown.style.display = 'none';

    loginBtn.addEventListener('mouseenter', function () {
        clearTimeout(hideTimeout);
        dropdown.style.display = 'block';
    });

    loginBtn.addEventListener('mouseleave', function () {
        hideTimeout = setTimeout(() => {
            dropdown.style.display = 'none';
        }, 300);
    });

    dropdown.addEventListener('mouseenter', function () {
        clearTimeout(hideTimeout);
    });

    dropdown.addEventListener('mouseleave', function () {
        dropdown.style.display = 'none';
    });
}

// Añadir esta función al initializeSystems si la necesitas
// function initializeSystems() {
//     console.log('⚙️ Inicializando sistemas...');
//     
//     loadUserCart();
//     loadFeaturedProducts();
//     loadCategories();
//     loadProducts();
//     setupCartEvents();
//     setupUserMenuInteractions(); // DESCOMENTAR SI LA NECESITAS
//     setupSearch();
//     
//     console.log('✅ Sistemas inicializados correctamente');
// }

console.log('✅ app.js cargado correctamente');