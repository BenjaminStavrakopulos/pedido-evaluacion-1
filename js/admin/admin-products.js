// admin-products.js - Sistema de administración de productos
document.addEventListener('DOMContentLoaded', function() {
    initializeAdminProducts();
});

// Variables globales
window.productsData = [];
window.categories = [];
let currentImageData = '';
let adminProductsSearchIndex = [];
let productFilterDebounceTimer = null;
const PRODUCT_FILTER_DEBOUNCE_MS = 180;
const PRODUCT_SKU_MAX_LENGTH = 30;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 200;
const CUSTOM_CATEGORIES_STORAGE_KEY = 'hairia_custom_categories';
const CUSTOM_BRANDS_STORAGE_KEY = 'hairia_custom_brands';
const SKU_COUNTER_STORAGE_KEY = 'hairia_sku_counter';
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

const FIXED_BRANDS = Object.freeze([
    { id: 'olaplex', name: 'Olaplex', logo: 'images/olaplex.jpg', searchTerms: ['olaplex'] },
    { id: 'kerastase', name: 'Kérastase', logo: 'images/kerastase.jpg', searchTerms: ['kerastase', 'kérastase'] },
    { id: 'tigi', name: 'Tigi', logo: 'images/tigi.jpg', searchTerms: ['tigi'] },
    { id: 'k18', name: 'K18', logo: 'images/k18.jpg', searchTerms: ['k18'] },
    { id: 'living-proof', name: 'Living Proof', logo: 'images/livingprof.jpg', searchTerms: ['living proof', 'livingproof', 'living prof'] },
    { id: 'revlon', name: 'Revlon', logo: 'images/revlon.jpg', searchTerms: ['revlon'] },
    { id: 'moroccanoil', name: 'Moroccanoil', logo: 'images/Moroccanoil.jpg', searchTerms: ['moroccanoil', 'moroccan oil'] },
    { id: 'dabalash', name: 'Dabalash', logo: 'images/Dabalash.jpg', searchTerms: ['dabalash'] }
]);

function getFixedCategories() {
    return FIXED_CATEGORIES.map(category => ({ ...category }));
}

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCategoryIdFromName(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
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

function saveCustomCategories(customCategories) {
    localStorage.setItem(CUSTOM_CATEGORIES_STORAGE_KEY, JSON.stringify(customCategories));
}

function getFixedCategoryIds() {
    return new Set(getFixedCategories().map(category => category.id));
}

function getMergedCategories(remoteCategories = null) {
    const merged = [...getFixedCategories()];
    const fixedIds = new Set(merged.map(category => category.id));
    const source = Array.isArray(remoteCategories) ? remoteCategories : loadCustomCategories();
    const customCategories = source.filter(category => category && !fixedIds.has(category.id));
    merged.push(...customCategories);
    return merged;
}

function getFixedBrands() {
    return FIXED_BRANDS.map(brand => ({ ...brand }));
}

function normalizeBrandIdFromName(name) {
    return String(name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function loadCustomBrands() {
    try {
        const stored = JSON.parse(localStorage.getItem(CUSTOM_BRANDS_STORAGE_KEY) || '[]');
        if (!Array.isArray(stored)) return [];
        return stored
            .filter(item => item && typeof item.id === 'string' && typeof item.name === 'string')
            .map(item => ({
                id: item.id,
                name: item.name,
                logo: item.logo || '',
                searchTerms: Array.isArray(item.searchTerms) && item.searchTerms.length > 0
                    ? item.searchTerms
                    : [item.id],
                isCustom: true
            }));
    } catch (error) {
        console.warn('⚠️ No se pudieron cargar marcas personalizadas:', error);
        return [];
    }
}

function saveCustomBrands(customBrands) {
    try {
        localStorage.setItem(CUSTOM_BRANDS_STORAGE_KEY, JSON.stringify(customBrands));
        return true;
    } catch (error) {
        console.error('❌ No se pudieron guardar marcas personalizadas:', error);
        showNotification('❌ No se pudo guardar la marca. El logo es muy pesado, usa una imagen más liviana.');
        return false;
    }
}

function getMergedBrands(remoteBrands = null) {
    const merged = [...getFixedBrands()];
    const fixedIds = new Set(merged.map(brand => brand.id));
    const source = Array.isArray(remoteBrands) ? remoteBrands : loadCustomBrands();
    const customBrands = source.filter(brand => brand && !fixedIds.has(brand.id));
    merged.push(...customBrands);
    return merged;
}

function getFixedBrandIds() {
    return new Set(getFixedBrands().map(brand => brand.id));
}

function rebuildAdminProductsSearchIndex() {
    adminProductsSearchIndex = (window.productsData || []).map(product => ({
        id: String(product.id),
        category: product.category,
        text: `${product.name || ''} ${product.sku || ''} ${product.description || ''} ${product.brand || ''}`.toLowerCase()
    }));
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

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
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

function normalizeProductId(value) {
    return String(value ?? '').trim();
}

function truncateText(value, maxLength) {
    const text = value == null ? '' : String(value);
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, maxLength)}…`;
}

function buildHyphenatedNameHtml(name, chunkSize = 12) {
    const rawText = name == null ? '' : String(name);
    const tokens = rawText.split(/(\s+)/);

    return tokens.map((token) => {
        if (/^\s+$/.test(token) || token.length <= chunkSize) {
            return escapeHtml(token);
        }

        const parts = [];
        let cursor = 0;
        while (cursor < token.length) {
            parts.push(token.slice(cursor, cursor + chunkSize));
            cursor += chunkSize;
        }

        return parts.map(escapeHtml).join('&shy;');
    }).join('');
}

function computeMaxSkuSequence(products) {
    return (products || []).reduce((maxValue, product) => {
        const sku = String(product?.sku || '');
        const match = sku.match(/(\d+)$/);
        if (!match) {
            return maxValue;
        }

        const sequence = Number.parseInt(match[1], 10);
        return Number.isFinite(sequence) ? Math.max(maxValue, sequence) : maxValue;
    }, 0);
}

function generateNextSku() {
    const maxFromProducts = computeMaxSkuSequence(window.productsData || []);
    const storedCounter = Number.parseInt(localStorage.getItem(SKU_COUNTER_STORAGE_KEY) || '0', 10);
    const nextSequence = Math.max(Number.isFinite(storedCounter) ? storedCounter : 0, maxFromProducts) + 1;

    localStorage.setItem(SKU_COUNTER_STORAGE_KEY, String(nextSequence));
    return `PRD-${String(nextSequence).padStart(5, '0')}`;
}

async function persistProductCreate(newProductData) {
    if (!window.firebaseData?.saveProduct) {
        return {
            id: String(Date.now()),
            ...newProductData,
            createdAt: new Date().toISOString()
        };
    }

    const savedProduct = await window.firebaseData.saveProduct(newProductData);
    return {
        ...newProductData,
        ...(savedProduct || {}),
        id: savedProduct?.id || String(savedProduct?.id || ''),
        createdAt: savedProduct?.createdAt || newProductData.createdAt || new Date().toISOString()
    };
}

async function persistProductUpdate(productId, updatedProductData) {
    if (!window.firebaseData?.saveProduct) {
        return true;
    }

    await window.firebaseData.saveProduct({
        ...updatedProductData,
        id: productId
    });

    return true;
}

function renderProductRow(product) {
    const productId = String(product.id ?? '');
    const fullName = String(product.name || '');
    const safeNameHtml = buildHyphenatedNameHtml(fullName);
    const safeFullName = escapeAttr(fullName);
    const safeSku = escapeHtml(truncateText(product.sku || 'N/A', 14));
    const safeCategoryName = escapeHtml(getCategoryName(product.category) || '');
    const safeImage = sanitizeImageUrl(product.image);
    const stock = Number(product.stock) || 0;

    return `
        <tr>
            <td>
                <div class="product-image-small">
                    ${safeImage ?
                        `<img src="${safeImage}" alt="${escapeAttr(fullName)}">` :
                        '<div class="no-image">📷</div>'
                    }
                </div>
            </td>
            <td>
                <strong class="product-cell-title" title="${safeFullName}">${safeNameHtml}</strong>
                ${product.featured ? '<span class="featured-indicator">⭐</span>' : ''}
            </td>
            <td>${safeSku}</td>
            <td>
                ${product.discountType !== 'none' ?
                    `<div class="price-with-discount">
                        <span class="original-price">${formatCLP(product.price)}</span>
                        <span class="discount-badge">${escapeHtml(getDiscountText(product))}</span>
                        <strong class="discounted-price">${formatCLP(getDiscountedPrice(product))}</strong>
                    </div>` :
                    `<strong>${formatCLP(product.price)}</strong>`
                }
            </td>
            <td>
                <span class="category-tag" title="${escapeAttr(getCategoryName(product.category) || '')}">${safeCategoryName}</span>
            </td>
            <td>
                <div class="stock-info">
                    <span>${stock}</span>
                    <span class="status-badge ${getStockStatus(stock, product.minStock)}">
                        ${getStockText(stock, product.minStock)}
                    </span>
                </div>
            </td>
            <td>
                <span class="status-badge ${product.active !== false ? 'status-active' : 'status-inactive'}">
                    ${product.active !== false ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>
                <div class="table-actions">
                    <button class="table-actions-btn" data-action="edit" data-product-id="${escapeAttr(productId)}" title="Editar">✏️</button>
                    <button class="table-actions-btn" data-action="toggle" data-product-id="${escapeAttr(productId)}" title="${product.active !== false ? 'Desactivar' : 'Activar'}">
                        ${product.active !== false ? '👁️' : '👁️‍🗨️'}
                    </button>
                    <button class="table-actions-btn delete-btn" data-action="delete" data-product-id="${escapeAttr(productId)}" title="Eliminar">🗑️</button>
                </div>
            </td>
        </tr>
    `;
}

async function initializeAdminProducts() {
    const hasAccess = await checkAdminAuth();
    if (!hasAccess) {
        return;
    }
    
    // CARGAR DATOS DE FORMA ASÍNCRONA
    loadGlobalData().then(() => {
        rebuildAdminProductsSearchIndex();
        loadProductsTable();
        loadCategoriesDropdown();
        loadBrandsDropdown();
        updateStats();
        setupEventListeners();
        setupDiscountCalculations();
        setupModalClose();
    }).catch(error => {
        console.error('❌ Error en inicialización:', error);
    });
}

// FUNCIÓN MEJORADA: Cargar datos globales desde Firebase
async function loadGlobalData() {
    console.log('📥 Cargando datos desde Firebase...');
    
    try {
        // Cargar productos
        if (window.firebaseData?.loadProducts) {
            window.productsData = await window.firebaseData.loadProducts();
        } else {
            window.productsData = [];
        }

        await purgeLegacySampleProducts();
        
        window.categories = getMergedCategories(await window.firebaseData.loadCategories());
        window.brandsData = getMergedBrands(await window.firebaseData.loadBrands());
        
        console.log('✅ Datos cargados:', {
            productos: window.productsData.length,
            categorias: window.categories.length
        });
        
    } catch (error) {
        console.error('❌ Error cargando datos:', error);
        
        window.productsData = [];
        window.categories = getFixedCategories();
        window.brandsData = getFixedBrands();
    }
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
    saveProducts();
    localStorage.setItem(SAMPLE_PRODUCTS_PURGE_KEY, 'true');
}

function initializeSampleProducts() {
    window.productsData = [
        {
            id: 1,
            name: "Shampoo Reparador Intenso",
            price: 19990,
            category: "shampoo",
            brand: "kerastase",
            featured: true,
            description: "Shampoo con keratina para cabello dañado y quebradizo",
            image: "",
            stock: 50,
            sku: "SHR-001",
            active: true,
            discountType: "none",
            discountPercent: null,
            discountAmount: null,
            createdAt: new Date().toISOString()
        },
        {
            id: 2,
            name: "Acondicionador Hidratante", 
            price: 14990,
            category: "acondicionador",
            brand: "olaplex",
            featured: false,
            description: "Acondicionador profundo con aceite de argán",
            image: "",
            stock: 45,
            sku: "ACH-001",
            active: true,
            discountType: "none",
            discountPercent: null,
            discountAmount: null,
            createdAt: new Date().toISOString()
        }
    ];
    saveProducts();
}

async function checkAdminAuth() {
    const userLS = JSON.parse(localStorage.getItem('hairia_current_user') || 'null');
    const userSS = JSON.parse(sessionStorage.getItem('hairia_current_user') || 'null');
    const user = userLS || userSS;
    
    if (!user || !user.uid) {
        console.log('⚠️ No hay usuario, redirigiendo a login...');
        window.location.href = '../login.html';
        return false;
    }

    if (!window.firebase || typeof window.firebase.isUserAdmin !== 'function') {
        console.error('❌ Verificación admin no disponible');
        showNotification('No se pudo verificar permisos de administrador', 'error');
        window.location.href = '../login.html';
        return false;
    }

    try {
        const isAdmin = await window.firebase.isUserAdmin(user.uid);
        if (!isAdmin) {
            console.log('❌ Usuario no es admin, redirigiendo a inicio...');
            showNotification('Acceso denegado: solo administradores pueden acceder', 'error');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1200);
            return false;
        }

        if (user.role !== 'admin') {
            user.role = 'admin';
            if (userLS) {
                sessionStorage.setItem('hairia_current_user', JSON.stringify(user));
                localStorage.removeItem('hairia_current_user');
            } else {
                sessionStorage.setItem('hairia_current_user', JSON.stringify(user));
            }
        }

        console.log('✅ Usuario admin verificado en Firebase');
        return true;
    } catch (error) {
        console.warn('⚠️ No se pudo verificar admin en Firebase:', error);
        showNotification('Error verificando permisos de administrador', 'error');
        window.location.href = '../login.html';
        return false;
    }
}

// FUNCIÓN MEJORADA: Cargar tabla de productos
function loadProductsTable() {
    const tableBody = document.getElementById('productsTableBody');
    if (!tableBody) return;

    const products = window.productsData || [];
    
    if (products.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="no-products">
                    <p>No hay productos registrados</p>
                    <button class="btn-primary" data-action="create-first">Crear Primer Producto</button>
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = products.map(renderProductRow).join('');
}

// FUNCIONES AUXILIARES PARA PRECIOS
function getDiscountedPrice(product) {
    if (product.discountType === 'percentage' && product.discountPercent) {
        return product.price - (product.price * product.discountPercent / 100);
    } else if (product.discountType === 'amount' && product.discountAmount) {
        return product.price - product.discountAmount;
    }
    return product.price;
}

function getDiscountText(product) {
    if (product.discountType === 'percentage' && product.discountPercent) {
        return `-${product.discountPercent}%`;
    } else if (product.discountType === 'amount' && product.discountAmount) {
        return `-${formatCLP(product.discountAmount)}`;
    }
    return '';
}

function getCategoryName(categoryId) {
    const category = window.categories.find(cat => cat.id === categoryId);
    return category ? category.name : categoryId;
}

function getStockStatus(stock, minStock = 5) {
    if (stock === 0) return 'status-out-of-stock';
    if (stock <= minStock) return 'status-low-stock';
    return 'status-active';
}

function getStockText(stock, minStock = 5) {
    if (stock === 0) return 'Sin Stock';
    if (stock <= minStock) return 'Stock Bajo';
    return 'En Stock';
}

function loadCategoriesDropdown() {
    const categorySelect = document.getElementById('productCategory');
    const categoryFilter = document.getElementById('categoryFilter');
    
    if (categorySelect) {
        categorySelect.innerHTML = `
            <option value="">Seleccionar categoría</option>
            ${window.categories.map(category => `
                <option value="${escapeAttr(category.id)}">${escapeHtml(category.name)}</option>
            `).join('')}
            <option value="__new__">Otros (crear nueva categoría)</option>
        `;
        console.log('✅ Dropdown de categorías cargado:', window.categories.length, 'categorías');
    }
    
    if (categoryFilter) {
        categoryFilter.innerHTML = `
            <option value="">Todas las categorías</option>
            ${window.categories.map(category => `
                <option value="${escapeAttr(category.id)}">${escapeHtml(category.name)}</option>
            `).join('')}
        `;
        
        categoryFilter.addEventListener('change', filterProductsTable);
    }
}

function loadCustomCategoryDeleteDropdown() {
    const deleteSelect = document.getElementById('customCategoryDeleteSelect');
    if (!deleteSelect) return;

    const fixedIds = getFixedCategoryIds();
    const customCategories = (window.categories || []).filter(category => !fixedIds.has(category.id));

    deleteSelect.innerHTML = `
        <option value="">Seleccionar categoría personalizada</option>
        ${customCategories.map(category => `
            <option value="${escapeAttr(category.id)}">${escapeHtml(category.name)}</option>
        `).join('')}
    `;
}

function toggleNewCategoryBox(show) {
    const box = document.getElementById('newCategoryBox');
    const input = document.getElementById('newCategoryName');
    if (!box || !input) return;

    box.style.display = show ? 'block' : 'none';
    if (!show) {
        input.value = '';
        return;
    }

    loadCustomCategoryDeleteDropdown();

    setTimeout(() => input.focus(), 0);
}

async function addCustomCategoryFromInput() {
    const input = document.getElementById('newCategoryName');
    const categorySelect = document.getElementById('productCategory');
    if (!input || !categorySelect) return;

    const categoryName = (input.value || '').trim();
    if (!categoryName) {
        showNotification('❌ Debes escribir un nombre de categoría');
        return;
    }

    if (categoryName.length < 3) {
        showNotification('❌ El nombre de la categoría debe tener al menos 3 caracteres');
        return;
    }

    const existingByName = (window.categories || []).find(category => {
        const pattern = new RegExp(`^${escapeRegex(categoryName)}$`, 'i');
        return pattern.test(category.name || '');
    });

    if (existingByName) {
        categorySelect.value = existingByName.id;
        toggleNewCategoryBox(false);
        showNotification('✅ Esa categoría ya existe y fue seleccionada');
        return;
    }

    let nextId = normalizeCategoryIdFromName(categoryName);
    if (!nextId) {
        showNotification('❌ El nombre ingresado no es válido');
        return;
    }

    const existingIds = new Set((window.categories || []).map(category => category.id));
    let suffix = 2;
    const baseId = nextId;
    while (existingIds.has(nextId)) {
        nextId = `${baseId}-${suffix}`;
        suffix += 1;
    }

    const newCategory = {
        id: nextId,
        name: categoryName,
        color: '#111827',
        description: 'Categoría personalizada'
    };

    if (!window.firebaseData?.saveCategory) {
        showNotification('❌ Firebase no está disponible para guardar la categoría');
        return;
    }

    await window.firebaseData.saveCategory(newCategory);

    window.categories = getMergedCategories(await window.firebaseData.loadCategories());
    loadCategoriesDropdown();
    loadCustomCategoryDeleteDropdown();
    categorySelect.value = newCategory.id;
    toggleNewCategoryBox(false);
    showNotification('✅ Categoría agregada correctamente');
}

async function deleteCustomCategorySelected() {
    const deleteSelect = document.getElementById('customCategoryDeleteSelect');
    const categorySelect = document.getElementById('productCategory');
    if (!deleteSelect) return;

    const categoryId = (deleteSelect.value || '').trim();
    if (!categoryId) {
        showNotification('❌ Debes seleccionar una categoría personalizada para eliminar');
        return;
    }

    const fixedIds = getFixedCategoryIds();
    if (fixedIds.has(categoryId)) {
        showNotification('❌ No se puede eliminar una categoría base del sistema');
        return;
    }

    const categoryInUse = (window.productsData || []).some(product => product.category === categoryId);
    if (categoryInUse) {
        showNotification('❌ No se puede eliminar: hay productos usando esta categoría');
        return;
    }

    if (!window.firebaseData?.deleteCategory) {
        showNotification('❌ Firebase no está disponible para eliminar la categoría');
        return;
    }

    await window.firebaseData.deleteCategory(categoryId);
    window.categories = getMergedCategories(await window.firebaseData.loadCategories());
    loadCategoriesDropdown();
    loadCustomCategoryDeleteDropdown();

    if (categorySelect && categorySelect.value === categoryId) {
        categorySelect.value = '';
    }

    deleteSelect.value = '';
    showNotification('✅ Categoría personalizada eliminada correctamente');
}

function loadBrandsDropdown() {
    const brandSelect = document.getElementById('productBrand');
    if (!brandSelect) {
        return;
    }

    brandSelect.innerHTML = `
        <option value="">Seleccionar marca</option>
        ${(window.brandsData || []).map(brand => `
            <option value="${escapeAttr(brand.id)}">${escapeHtml(brand.name)}</option>
        `).join('')}
        <option value="__new_brand__">Otros (agregar nueva marca)</option>
    `;

    console.log('✅ Dropdown de marcas cargado:', (window.brandsData || []).length, 'marcas');
}

function loadCustomBrandDeleteDropdown() {
    const deleteSelect = document.getElementById('customBrandDeleteSelect');
    if (!deleteSelect) return;

    const fixedBrandIds = getFixedBrandIds();
    const customBrands = (window.brandsData || []).filter(brand => !fixedBrandIds.has(brand.id));

    deleteSelect.innerHTML = `
        <option value="">Seleccionar marca personalizada</option>
        ${customBrands.map(brand => `
            <option value="${escapeAttr(brand.id)}">${escapeHtml(brand.name)}</option>
        `).join('')}
    `;
}

function showBrandManagerModal() {
    const modal = document.getElementById('brandManagerModal');
    if (!modal) return;

    const brandNameInput = document.getElementById('newBrandName');
    const logoInput = document.getElementById('newBrandLogo');
    const logoPreview = document.getElementById('newBrandLogoPreview');

    if (brandNameInput) brandNameInput.value = '';
    if (logoInput) logoInput.value = '';
    if (logoPreview) {
        logoPreview.innerHTML = '<span>🖼️ Haz clic para subir el logo</span>';
        logoPreview.classList.remove('has-image');
    }

    modal.dataset.logoData = '';
    loadCustomBrandDeleteDropdown();
    modal.classList.add('active');

    if (brandNameInput) {
        setTimeout(() => brandNameInput.focus(), 0);
    }
}

function hideBrandManagerModal() {
    const modal = document.getElementById('brandManagerModal');
    if (!modal) return;
    modal.classList.remove('active');
}

function setupBrandLogoUpload() {
    const logoInput = document.getElementById('newBrandLogo');
    const logoPreview = document.getElementById('newBrandLogoPreview');
    const modal = document.getElementById('brandManagerModal');

    if (!logoInput || !logoPreview || !modal || logoInput.dataset.listener === 'true') {
        return;
    }

    logoPreview.addEventListener('click', function() {
        logoInput.click();
    });

    logoPreview.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            logoInput.click();
        }
    });

    logoInput.addEventListener('change', function(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        const maxLogoBytes = 700 * 1024;
        if (file.size > maxLogoBytes) {
            logoInput.value = '';
            modal.dataset.logoData = '';
            logoPreview.innerHTML = '<span>🖼️ Haz clic para subir el logo</span>';
            logoPreview.classList.remove('has-image');
            showNotification('❌ El logo es muy pesado. Usa una imagen menor a 700 KB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const imageData = typeof e.target?.result === 'string' ? e.target.result : '';
            if (!imageData) return;

            modal.dataset.logoData = imageData;
            const safeLogo = sanitizeImageUrl(imageData);
            logoPreview.innerHTML = safeLogo
                ? `<img src="${safeLogo}" alt="Logo marca">`
                : '<span>🖼️ Haz clic para subir el logo</span>';
            logoPreview.classList.add('has-image');
        };
        reader.readAsDataURL(file);
    });

    logoInput.dataset.listener = 'true';
}

async function saveCustomBrandFromModal() {
    const modal = document.getElementById('brandManagerModal');
    const brandSelect = document.getElementById('productBrand');
    const brandNameInput = document.getElementById('newBrandName');
    if (!modal || !brandSelect || !brandNameInput) return;

    const brandName = (brandNameInput.value || '').trim();
    const brandLogo = modal.dataset.logoData || '';

    if (!brandName) {
        showNotification('❌ Debes ingresar el nombre de la marca');
        return;
    }

    if (brandName.length < 2) {
        showNotification('❌ El nombre de la marca debe tener al menos 2 caracteres');
        return;
    }

    if (!brandLogo) {
        showNotification('❌ Debes subir el logo de la marca');
        return;
    }

    const existingByName = (window.brandsData || []).find(brand => {
        const pattern = new RegExp(`^${escapeRegex(brandName)}$`, 'i');
        return pattern.test(brand.name || '');
    });

    if (existingByName) {
        brandSelect.value = existingByName.id;
        hideBrandManagerModal();
        showNotification('✅ Esa marca ya existe y fue seleccionada');
        return;
    }

    let newBrandId = normalizeBrandIdFromName(brandName);
    if (!newBrandId) {
        showNotification('❌ El nombre de marca no es válido');
        return;
    }

    const existingIds = new Set((window.brandsData || []).map(brand => brand.id));
    const baseId = newBrandId;
    let suffix = 2;
    while (existingIds.has(newBrandId)) {
        newBrandId = `${baseId}-${suffix}`;
        suffix += 1;
    }

    const newCustomBrand = {
        id: newBrandId,
        name: brandName,
        logo: brandLogo,
        searchTerms: [newBrandId, normalizeBrandIdFromName(brandName)],
        isCustom: true
    };

    if (!window.firebaseData?.saveBrand) {
        showNotification('❌ Firebase no está disponible para guardar la marca');
        return;
    }

    await window.firebaseData.saveBrand(newCustomBrand);
    window.brandsData = await window.firebaseData.loadBrands();
    loadBrandsDropdown();
    loadCustomBrandDeleteDropdown();
    brandSelect.value = newCustomBrand.id;
    hideBrandManagerModal();
    showNotification('✅ Marca agregada correctamente');
}

async function deleteCustomBrandSelected() {
    const deleteSelect = document.getElementById('customBrandDeleteSelect');
    const productBrandSelect = document.getElementById('productBrand');
    if (!deleteSelect) return;

    const brandId = (deleteSelect.value || '').trim();
    if (!brandId) {
        showNotification('❌ Debes seleccionar una marca personalizada para eliminar');
        return;
    }

    const fixedBrandIds = getFixedBrandIds();
    if (fixedBrandIds.has(brandId)) {
        showNotification('❌ No se puede eliminar una marca base del sistema');
        return;
    }

    const brandInUse = (window.productsData || []).some(product => product.brand === brandId);
    if (brandInUse) {
        showNotification('❌ No se puede eliminar: hay productos usando esta marca');
        return;
    }

    if (!window.firebaseData?.deleteBrand) {
        showNotification('❌ Firebase no está disponible para eliminar la marca');
        return;
    }

    await window.firebaseData.deleteBrand(brandId);
    window.brandsData = await window.firebaseData.loadBrands();
    loadBrandsDropdown();
    loadCustomBrandDeleteDropdown();

    if (productBrandSelect && productBrandSelect.value === brandId) {
        productBrandSelect.value = '';
    }

    deleteSelect.value = '';
    showNotification('✅ Marca personalizada eliminada correctamente');
}

function setupEventListeners() {
    console.log('⚙️ Configurando event listeners...');

    const viewStoreBtn = document.getElementById('adminProductsViewStoreBtn');
    if (viewStoreBtn && viewStoreBtn.dataset.listener !== 'true') {
        viewStoreBtn.addEventListener('click', () => {
            window.location.href = '../index.html';
        });
        viewStoreBtn.dataset.listener = 'true';
    }

    const newProductBtn = document.getElementById('newProductBtn');
    if (newProductBtn) {
        newProductBtn.addEventListener('click', () => showProductForm());
    }

    const productModalCloseBtn = document.getElementById('productModalCloseBtn');
    if (productModalCloseBtn) {
        productModalCloseBtn.addEventListener('click', hideProductForm);
    }

    const productModalCancelBtn = document.getElementById('productModalCancelBtn');
    if (productModalCancelBtn) {
        productModalCancelBtn.addEventListener('click', hideProductForm);
    }
    
    // Form submit - Configurar en la inicialización
    const productForm = document.getElementById('productForm');
    if (productForm) {
        console.log('✅ Formulario encontrado, configurando listener de submit');
        productForm.addEventListener('submit', handleProductSubmit);
        
        // Agregar listener directo al botón de guardar como alternativa
        const submitBtn = productForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            console.log('✅ Botón de guardar encontrado, agregando listener directo');
            submitBtn.addEventListener('click', function(e) {
                console.log('🖱️ Click en botón guardar - previniendo default y llamando handleProductSubmit');
                e.preventDefault();
                handleProductSubmit(e);
            });
        }
    } else {
        console.error('❌ Formulario #productForm no encontrado');
    }
    
    // Image upload
    const imageInput = document.getElementById('productImage');
    const imagePreview = document.getElementById('imagePreview');
    
    if (imageInput && imagePreview) {
        imagePreview.addEventListener('click', () => imageInput.click());
        imageInput.addEventListener('change', handleImageUpload);
    }
    
    // Search
    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            if (productFilterDebounceTimer) {
                clearTimeout(productFilterDebounceTimer);
            }
            productFilterDebounceTimer = setTimeout(filterProductsTable, PRODUCT_FILTER_DEBOUNCE_MS);
        });
    }

    const categorySelect = document.getElementById('productCategory');
    if (categorySelect) {
        categorySelect.addEventListener('change', function() {
            toggleNewCategoryBox(categorySelect.value === '__new__');
        });
    }

    const addCategoryBtn = document.getElementById('addNewCategoryBtn');
    if (addCategoryBtn) {
        addCategoryBtn.addEventListener('click', addCustomCategoryFromInput);
    }

    const deleteCategoryBtn = document.getElementById('deleteCustomCategoryBtn');
    if (deleteCategoryBtn) {
        deleteCategoryBtn.addEventListener('click', deleteCustomCategorySelected);
    }

    const cancelCategoryBtn = document.getElementById('cancelNewCategoryBtn');
    if (cancelCategoryBtn) {
        cancelCategoryBtn.addEventListener('click', function() {
            const productCategory = document.getElementById('productCategory');
            if (productCategory && productCategory.value === '__new__') {
                productCategory.value = '';
            }
            toggleNewCategoryBox(false);
        });
    }

    const productBrandSelect = document.getElementById('productBrand');
    if (productBrandSelect) {
        productBrandSelect.addEventListener('change', function() {
            if (productBrandSelect.value === '__new_brand__') {
                showBrandManagerModal();
            }
        });
    }

    const saveNewBrandBtn = document.getElementById('saveNewBrandBtn');
    if (saveNewBrandBtn) {
        saveNewBrandBtn.addEventListener('click', saveCustomBrandFromModal);
    }

    const deleteCustomBrandBtn = document.getElementById('deleteCustomBrandBtn');
    if (deleteCustomBrandBtn) {
        deleteCustomBrandBtn.addEventListener('click', deleteCustomBrandSelected);
    }

    const brandManagerCloseBtn = document.getElementById('brandManagerCloseBtn');
    if (brandManagerCloseBtn) {
        brandManagerCloseBtn.addEventListener('click', hideBrandManagerModal);
    }

    const brandManagerCancelBtn = document.getElementById('brandManagerCancelBtn');
    if (brandManagerCancelBtn) {
        brandManagerCancelBtn.addEventListener('click', hideBrandManagerModal);
    }

    const brandManagerModal = document.getElementById('brandManagerModal');
    if (brandManagerModal) {
        brandManagerModal.addEventListener('click', function(event) {
            if (event.target === brandManagerModal) {
                hideBrandManagerModal();
            }
        });
    }

    setupBrandLogoUpload();

    setupProductsTableActions();
    
    console.log('✅ Event listeners configurados');
}

function setupProductsTableActions() {
    const tableBody = document.getElementById('productsTableBody');
    if (!tableBody || tableBody.dataset.listener === 'true') {
        return;
    }

    tableBody.addEventListener('click', function(event) {
        const actionButton = event.target.closest('button[data-action]');
        if (!actionButton) {
            return;
        }

        const action = actionButton.dataset.action;

        if (action === 'create-first') {
            showProductForm();
            return;
        }

        const productId = actionButton.dataset.productId;
        if (!productId) {
            return;
        }

        if (action === 'edit') {
            editProduct(productId);
        } else if (action === 'toggle') {
            toggleProductStatus(productId);
        } else if (action === 'delete') {
            deleteProduct(productId);
        }
    });

    tableBody.dataset.listener = 'true';
}

// NUEVA FUNCIÓN: Configurar cálculos de descuento
function setupDiscountCalculations() {
    const inputs = [
        'productPrice', 
        'productDiscountPercent', 
        'productDiscountAmount'
    ];
    
    inputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', calculateFinalPrice);
        }
    });
    
    const discountType = document.getElementById('discountType');
    if (discountType) {
        discountType.addEventListener('change', function() {
            toggleDiscountFields();
            calculateFinalPrice();
        });
    }
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('imagePreview');
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentImageData = e.target.result;
            const safeImage = sanitizeImageUrl(currentImageData);
            preview.innerHTML = safeImage ? `<img src="${safeImage}" alt="Preview">` : '<span>📷 Haz clic para subir imagen</span>';
            preview.classList.add('has-image');
        };
        reader.readAsDataURL(file);
    }
}

function showProductForm(productId = null) {
    console.log('🎯 Abriendo formulario para producto ID:', productId);
    
    const modal = document.getElementById('productFormModal');
    const formTitle = document.getElementById('productFormTitle');
    const form = document.getElementById('productForm');
    
    console.log('Modal existe:', !!modal, 'Formulario existe:', !!form);
    
    if (!modal || !form) {
        console.error('❌ Modal o formulario no encontrados');
        return;
    }
    
    // Resetear variables
    currentImageData = '';
    
    if (productId) {
        formTitle.textContent = 'Editar Producto';
        toggleNewCategoryBox(false);
        loadCustomCategoryDeleteDropdown();
        loadProductData(productId);
    } else {
        formTitle.textContent = 'Nuevo Producto';
        form.reset();
        document.getElementById('imagePreview').innerHTML = '<span>📷 Haz clic para subir imagen</span>';
        document.getElementById('imagePreview').classList.remove('has-image');
        document.getElementById('productId').value = '';
        document.getElementById('discountType').value = 'none';
        toggleNewCategoryBox(false);
        loadCustomCategoryDeleteDropdown();
        toggleDiscountFields();
        calculateFinalPrice();
    }
    
    modal.classList.add('active');
    console.log('✅ Modal abierto');
    
    // Prevenir que el click dentro del modal lo cierre
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.removeEventListener('click', stopPropagation);
        modalContent.addEventListener('click', stopPropagation);
    }
}

function stopPropagation(e) {
    e.stopPropagation();
}

function hideProductForm() {
    const modal = document.getElementById('productFormModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Asignar funciones a window para que funcionen los onclick
window.showProductForm = showProductForm;
window.hideProductForm = hideProductForm;

function loadProductData(productId) {
    const normalizedId = normalizeProductId(productId);
    const product = window.productsData.find(p => normalizeProductId(p.id) === normalizedId);
    if (!product) return;
    
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productCategory').value = product.category;
    document.getElementById('productBrand').value = product.brand || '';
    document.getElementById('productStock').value = product.stock;
    document.getElementById('productQuantity').value = product.quantity || '';
    document.getElementById('productUnit').value = product.unit || 'ml';
    document.getElementById('productDescription').value = product.description;
    document.getElementById('productIngredients').value = product.ingredients || '';
    document.getElementById('productUsage').value = product.usage || '';
    
    // Cargar datos de descuento
    document.getElementById('discountType').value = product.discountType || 'none';
    if (product.discountPercent) {
        document.getElementById('productDiscountPercent').value = product.discountPercent;
    }
    if (product.discountAmount) {
        document.getElementById('productDiscountAmount').value = product.discountAmount;
    }
    
    // Imagen
    const preview = document.getElementById('imagePreview');
    if (product.image) {
        const safeImage = sanitizeImageUrl(product.image);
        preview.innerHTML = safeImage ? `<img src="${safeImage}" alt="Preview">` : '<span>📷 Haz clic para subir imagen</span>';
        preview.classList.add('has-image');
        currentImageData = safeImage;
    }
    
    toggleDiscountFields();
    calculateFinalPrice();
}

async function handleProductSubmit(event) {
    if (event) {
        event.preventDefault();
    }

    try {
        const requiredFields = [
            { id: 'productName', label: 'Nombre del Producto' },
            { id: 'productPrice', label: 'Precio' },
            { id: 'productCategory', label: 'Categoría' },
            { id: 'productBrand', label: 'Marca' },
            { id: 'productStock', label: 'Stock' },
            { id: 'productDescription', label: 'Descripción' }
        ];

        const errors = [];

        const selectedCategory = document.getElementById('productCategory')?.value || '';
        if (selectedCategory === '__new__') {
            errors.push('Debes crear y seleccionar una categoría válida');
        }

        const selectedBrand = document.getElementById('productBrand')?.value || '';
        if (selectedBrand === '__new_brand__') {
            errors.push('Debes crear y seleccionar una marca válida');
        }

        requiredFields.forEach(field => {
            const input = document.getElementById(field.id);
            const value = input ? input.value : '';

            if (!input || !value || value.trim() === '') {
                errors.push(`${field.label} es obligatorio`);
                if (input) {
                    input.style.borderColor = '#ef4444';
                    input.style.backgroundColor = '#fee2e2';
                    input.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.2)';
                    setTimeout(() => {
                        input.style.borderColor = '';
                        input.style.backgroundColor = '';
                        input.style.boxShadow = '';
                    }, 5000);
                }
            }
        });

        const priceInput = document.getElementById('productPrice');
        const parsedPrice = parseInt(priceInput.value, 10);
        if (isNaN(parsedPrice) || parsedPrice < 0) {
            errors.push('Precio debe ser un número válido y mayor a 0');
            priceInput.style.borderColor = '#ef4444';
            priceInput.style.backgroundColor = '#fee2e2';
            priceInput.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.2)';
            setTimeout(() => {
                priceInput.style.borderColor = '';
                priceInput.style.backgroundColor = '';
                priceInput.style.boxShadow = '';
            }, 5000);
        }

        const stockInput = document.getElementById('productStock');
        const parsedStock = parseInt(stockInput.value, 10);
        if (isNaN(parsedStock) || parsedStock < 0) {
            errors.push('Stock debe ser un número válido y mayor o igual a 0');
            stockInput.style.borderColor = '#ef4444';
            stockInput.style.backgroundColor = '#fee2e2';
            stockInput.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.2)';
            setTimeout(() => {
                stockInput.style.borderColor = '';
                stockInput.style.backgroundColor = '';
                stockInput.style.boxShadow = '';
            }, 5000);
        }

        if (errors.length > 0) {
            showNotification('❌ ' + errors.join(' | '));
            return;
        }

        const productId = document.getElementById('productId').value;
        const discountType = document.getElementById('discountType').value;

        let discountPercent = null;
        let discountAmount = null;
        if (discountType === 'percentage') {
            discountPercent = parseInt(document.getElementById('productDiscountPercent').value, 10) || 0;
        } else if (discountType === 'amount') {
            discountAmount = parseInt(document.getElementById('productDiscountAmount').value, 10) || 0;
        }

        const productData = {
            name: (document.getElementById('productName').value || '').trim(),
            price: parsedPrice || 0,
            discountType,
            discountPercent,
            discountAmount,
            category: document.getElementById('productCategory').value,
            brand: document.getElementById('productBrand').value,
            stock: parsedStock || 0,
            minStock: 5,
            quantity: document.getElementById('productQuantity').value
                ? parseFloat(document.getElementById('productQuantity').value)
                : null,
            unit: document.getElementById('productUnit').value,
            description: (document.getElementById('productDescription').value || '').trim().slice(0, PRODUCT_DESCRIPTION_MAX_LENGTH),
            ingredients: document.getElementById('productIngredients').value,
            usage: document.getElementById('productUsage').value,
            featured: false,
            active: true,
            trackStock: true,
            image: currentImageData || '',
            updatedAt: new Date().toISOString()
        };

        if (productId) {
            await updateProduct(productId, productData);
            return;
        }

        await createProduct(productData);
    } catch (error) {
        console.error('❌ Error en handleProductSubmit:', error);
        showNotification('❌ Error al procesar: ' + error.message);
    }
}

async function createProduct(productData) {
    console.log('➕ Creando nuevo producto:', productData);
    const newProductData = {
        ...productData,
        sku: generateNextSku().slice(0, PRODUCT_SKU_MAX_LENGTH),
        createdAt: new Date().toISOString()
    };

    try {
        const savedProduct = await persistProductCreate(newProductData);
        window.productsData.push(savedProduct);
        rebuildAdminProductsSearchIndex();
        saveProducts();

        loadProductsTable();
        updateStats();
        hideProductForm();
        showNotification('✅ Producto creado exitosamente');
        console.log('✅ Producto guardado');
    } catch (error) {
        console.error('❌ Error guardando producto:', error);
        showNotification('❌ No se pudo guardar el producto en Firebase');
    }
}

async function updateProduct(productId, productData) {
    console.log('✏️ Actualizando producto ID:', productId);
    const normalizedId = normalizeProductId(productId);
    const index = window.productsData.findIndex(p => normalizeProductId(p.id) === normalizedId);
    if (index !== -1) {
        const updatedProduct = {
            ...window.productsData[index],
            ...productData,
            sku: window.productsData[index].sku || productData.sku || generateNextSku().slice(0, PRODUCT_SKU_MAX_LENGTH)
        };

        try {
            await persistProductUpdate(updatedProduct.id, updatedProduct);

            window.productsData[index] = updatedProduct;
            rebuildAdminProductsSearchIndex();
            saveProducts();

            loadProductsTable();
            updateStats();
            hideProductForm();
            showNotification('✅ Producto actualizado exitosamente');
            console.log('✅ Producto actualizado');
        } catch (error) {
            console.error('❌ Error actualizando producto en Firebase:', error);
            showNotification('❌ No se pudo actualizar el producto en Firebase');
        }
    } else {
        console.error('❌ Producto no encontrado con ID:', productId);
        showNotification('❌ No se encontró el producto para actualizar');
    }
}

// Funciones expuestas globalmente para los botones de la tabla
window.editProduct = function(productId) {
    showProductForm(productId);
};

window.toggleProductStatus = async function(productId) {
    const normalizedId = normalizeProductId(productId);
    const product = window.productsData.find(p => normalizeProductId(p.id) === normalizedId);
    if (product) {
        const previousActive = product.active !== false;
        const updatedProduct = { ...product, active: !previousActive };

        try {
            await persistProductUpdate(updatedProduct.id, updatedProduct);
            Object.assign(product, updatedProduct);
            rebuildAdminProductsSearchIndex();
            saveProducts();
            loadProductsTable();
            updateStats();
            showNotification(`✅ Producto ${updatedProduct.active ? 'activado' : 'desactivado'}`);
        } catch (error) {
            console.error('❌ Error actualizando visibilidad del producto:', error);
            showNotification('❌ No se pudo actualizar la visibilidad en Firebase');
        }
    }
};

window.deleteProduct = async function(productId) {
    if (confirm('¿Estás seguro de que quieres eliminar este producto? Esta acción no se puede deshacer.')) {
        const normalizedId = normalizeProductId(productId);
        // Obtener el producto antes de eliminarlo (para obtener su ID de Firebase si existe)
        const product = window.productsData.find(p => normalizeProductId(p.id) === normalizedId);
        
        window.productsData = window.productsData.filter(p => normalizeProductId(p.id) !== normalizedId);
        rebuildAdminProductsSearchIndex();
        
        // Eliminar de Firebase si está disponible
        if (window.firebaseData?.deleteProduct && product?.id) {
            try {
                await window.firebaseData.deleteProduct(product.id);
            } catch (error) {
                console.error('❌ Error eliminando de Firebase:', error);
                // Pero continuar con localStorage (ya se eliminó arriba)
            }
        }

        saveProducts();
        
        loadProductsTable();
        updateStats();
        showNotification('✅ Producto eliminado exitosamente');
    }
};

function filterProductsTable() {
    const searchTerm = document.getElementById('productSearch')?.value.toLowerCase() || '';
    const categoryFilter = document.getElementById('categoryFilter')?.value || '';

    let filteredProducts = window.productsData || [];

    if (searchTerm) {
        const matchingIds = new Set(
            adminProductsSearchIndex
                .filter(item => item.text.includes(searchTerm))
                .map(item => item.id)
        );
        filteredProducts = filteredProducts.filter(product => matchingIds.has(String(product.id)));
    }

    if (categoryFilter) {
        filteredProducts = filteredProducts.filter(product => product.category === categoryFilter);
    }
    
    const tableBody = document.getElementById('productsTableBody');
    if (tableBody) {
        if (filteredProducts.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="no-results">
                        No se encontraron productos que coincidan con los filtros
                    </td>
                </tr>
            `;
        } else {
            tableBody.innerHTML = filteredProducts.map(renderProductRow).join('');
        }
    }
}

function updateStats() {
    const products = window.productsData || [];
    
    document.getElementById('totalProducts').textContent = products.length;
    document.getElementById('featuredProducts').textContent = products.filter(p => p.featured).length;
    document.getElementById('lowStockProducts').textContent = products.filter(p => p.stock <= (p.minStock || 5)).length;
    document.getElementById('discountProducts').textContent = products.filter(p => p.discountType !== 'none').length;
}

function saveProducts() {
    localStorage.setItem('hairia_products', JSON.stringify(window.productsData));
    console.log('💾 Productos guardados:', window.productsData.length);
}

function saveCategories() {
    localStorage.setItem('hairia_categories', JSON.stringify(window.categories));
    console.log('💾 Categorías guardadas:', window.categories.length);
}

function saveBrands() {
    const brandsToStore = (window.brandsData || []).map(brand => ({
        id: brand.id,
        name: brand.name,
        searchTerms: Array.isArray(brand.searchTerms) ? brand.searchTerms : []
    }));

    try {
        localStorage.setItem('hairia_brands', JSON.stringify(brandsToStore));
        console.log('💾 Marcas guardadas:', brandsToStore.length);
    } catch (error) {
        console.warn('⚠️ No se pudieron guardar marcas en localStorage:', error);
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--primary-black);
        color: var(--primary-white);
        padding: 1rem 1.5rem;
        border-radius: 6px;
        z-index: 3000;
        box-shadow: var(--shadow);
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// FUNCIONES DE DESCUENTO
function toggleDiscountFields() {
    const discountType = document.getElementById('discountType').value;
    const discountFields = document.getElementById('discountFields');
    const percentageField = document.getElementById('percentageField');
    const amountField = document.getElementById('amountField');
    
    if (discountType === 'none') {
        discountFields.style.display = 'none';
        // Limpiar campos de descuento
        document.getElementById('productDiscountPercent').value = '';
        document.getElementById('productDiscountAmount').value = '';
    } else {
        discountFields.style.display = 'flex';
        if (discountType === 'percentage') {
            percentageField.style.display = 'block';
            amountField.style.display = 'none';
            document.getElementById('productDiscountAmount').value = '';
        } else {
            percentageField.style.display = 'none'; 
            amountField.style.display = 'block';
            document.getElementById('productDiscountPercent').value = '';
        }
    }
    calculateFinalPrice();
}

// Exponer toggleDiscountFields globalmente para el onchange del HTML
window.toggleDiscountFields = toggleDiscountFields;

function calculateFinalPrice() {
    const priceInput = document.getElementById('productPrice');
    const discountType = document.getElementById('discountType').value;
    const discountPercentInput = document.getElementById('productDiscountPercent');
    const discountAmountInput = document.getElementById('productDiscountAmount');
    const finalPriceInput = document.getElementById('finalPrice');
    
    if (!priceInput || !finalPriceInput) return;
    
    const price = parseInt(priceInput.value) || 0;
    const discountPercent = parseInt(discountPercentInput?.value) || 0;
    const discountAmount = parseInt(discountAmountInput?.value) || 0;
    
    let finalPrice = price;
    
    if (discountType === 'percentage' && discountPercent > 0) {
        finalPrice = Math.max(0, price - (price * discountPercent / 100));
    } else if (discountType === 'amount' && discountAmount > 0) {
        finalPrice = Math.max(0, price - discountAmount);
    }
    
    finalPriceInput.value = formatCLP(finalPrice);
}

function formatCLP(amount) {
    if (!amount && amount !== 0) return '$0';
    
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// ========== MEJORAS DE MODAL ==========

function setupModalClose() {
    const modal = document.getElementById('productFormModal');
    const modalContent = modal?.querySelector('.modal-content');
    
    if (modal && modalContent) {
        modalContent.removeEventListener('click', stopPropagation);
        modalContent.addEventListener('click', stopPropagation);

        // Cerrar al hacer click fuera del contenido
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                hideProductForm();
            }
        });
        
        // Cerrar con tecla ESC
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                hideProductForm();
            }
        });
        
        console.log('✅ Modal close events configured');
    }
}

