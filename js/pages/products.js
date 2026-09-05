// products.js - Sistema de búsqueda y filtros para products.html
document.addEventListener('DOMContentLoaded', function() {
    initializeProductsPage();
});

let productSearchIndex = [];
let categoryNameById = {};
let currentCategoryFilter = 'all';
let currentBrandFilter = 'all';
let searchDebounceTimer = null;
const SEARCH_DEBOUNCE_MS = 180;
let productsPageReadySubscribed = false;
let hasInvalidCatalogFilter = false;

// Paginación del catálogo: se renderiza de a PRODUCTS_PAGE_SIZE productos
const PRODUCTS_PAGE_SIZE = 24;
let productsVisibleCount = PRODUCTS_PAGE_SIZE;
let currentRenderedProducts = [];

function resetProductsPagination() {
    productsVisibleCount = PRODUCTS_PAGE_SIZE;
}

const BRANDS_LOGO_MAP = {
    'olaplex': 'images/olaplex.jpg',
    'kerastase': 'images/kerastase.jpg',
    'tigi': 'images/tigi.jpg',
    'k18': 'images/k18.jpg',
    'living-proof': 'images/livingprof.jpg',
    'revlon': 'images/revlon.jpg',
    'moroccanoil': 'images/Moroccanoil.jpg',
    'dabalash': 'images/Dabalash.jpg'
};

function isProductAvailable(product) {
    if (!product || product.active === false) return false;
    const stock = Number.parseInt(product.stock, 10);
    return Number.isFinite(stock) ? stock > 0 : true;
}

function isProductOutOfStock(product) {
    const stock = Number.parseInt(product?.stock, 10);
    return product?.active === false || (Number.isFinite(stock) && stock <= 0);
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

function getDiscountedPrice(product) {
    const price = Number(product?.price) || 0;
    if (product?.discountType === 'percentage') {
        return Math.max(0, Math.round(price - (price * (Number(product.discountPercent) || 0) / 100)));
    }
    if (product?.discountType === 'amount') {
        return Math.max(0, price - (Number(product.discountAmount) || 0));
    }
    return price;
}

function getDiscountText(product) {
    if (product?.discountType === 'percentage' && Number(product.discountPercent) > 0) {
        return `${Number(product.discountPercent)}% OFF`;
    }
    if (product?.discountType === 'amount' && Number(product.discountAmount) > 0) {
        return `-${formatCLP(product.discountAmount)}`;
    }
    return '';
}

function renderPriceHtml(product) {
    const discountText = getDiscountText(product);

    // Estructura fija de 2 filas SIEMPRE (con o sin descuento) para que todos
    // los precios finales queden alineados a la izquierda y a la misma altura.
    const originalRow = discountText
        ? `<span class="original-price">${formatCLP(product.price)}</span>`
        : `<span class="original-price original-price-empty" aria-hidden="true"></span>`;

    const finalPrice = discountText ? getDiscountedPrice(product) : product.price;
    const badge = discountText ? `<span class="discount-badge">${escapeHtml(discountText)}</span>` : '';

    return `<div class="price-with-discount">
        ${originalRow}
        <div class="discount-price-row">
            <p class="product-price${discountText ? ' discounted' : ''}">${formatCLP(finalPrice)}</p>
            ${badge}
        </div>
    </div>`;
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim();
}

function normalizeBrandKey(value) {
    return normalizeText(value).replace(/\s+/g, '-');
}

function getBrandLogoByKey(brandKey) {
    return sanitizeImageUrl(BRANDS_LOGO_MAP[brandKey] || '');
}

function getAvailableBrands() {
    const source = (window.productsData || []).filter(product => product && product.active !== false);
    const map = new Map();

    source.forEach(product => {
        const rawBrand = String(product.brand || '').trim();
        if (!rawBrand) return;

        const key = normalizeBrandKey(rawBrand);
        if (!key) return;

        if (!map.has(key)) {
            map.set(key, {
                key,
                name: rawBrand,
                logo: getBrandLogoByKey(key)
            });
        }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function initializeProductsPage() {
    subscribeProductsDataReady();
    rebuildProductsPerformanceIndex();
    loadCategoriesFilters();
    loadBrandFilters();
    loadAllProducts();
    setupSearch();
    checkUrlParams();
}

function subscribeProductsDataReady() {
    if (productsPageReadySubscribed) return;
    productsPageReadySubscribed = true;

    window.addEventListener('hairia:data-ready', () => {
        rebuildProductsPerformanceIndex();
        loadCategoriesFilters();
        loadBrandFilters();
        loadAllProducts();
        checkUrlParams();
    });
}

function rebuildProductsPerformanceIndex() {
    categoryNameById = (window.categories || []).reduce((acc, category) => {
        acc[category.id] = category.name;
        return acc;
    }, {});

    productSearchIndex = (window.productsData || []).map(product => {
        const categoryName = categoryNameById[product.category] || product.category || '';
        return {
            id: String(product.id),
            text: `${product.name || ''} ${product.description || ''} ${categoryName} ${product.brand || ''}`.toLowerCase(),
            category: product.category
        };
    });
}

function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const searchTerm = urlParams.get('search');
    const category = urlParams.get('category');
    const brand = urlParams.get('brand');
    hasInvalidCatalogFilter = false;

    const categoryButtons = Array.from(document.querySelectorAll('.filter-btn[data-category]'));
    const brandButtons = Array.from(document.querySelectorAll('.brand-filter-chip[data-brand]'));
    const hasLoadedCategoryOptions = categoryButtons.some(btn => (btn.dataset.category || '') !== 'all');
    const hasLoadedBrandOptions = brandButtons.some(btn => (btn.dataset.brand || '') !== 'all');

    if (searchTerm) {
        document.getElementById('searchInput').value = searchTerm;
    }

    const normalizedRequestedCategory = category ? String(category).trim() : 'all';
    const normalizedRequestedBrand = brand ? normalizeBrandKey(brand) : 'all';

    currentCategoryFilter = normalizedRequestedCategory || 'all';
    currentBrandFilter = normalizedRequestedBrand || 'all';

    if (category) {
        const categoryBtn = document.querySelector(`[data-category="${category}"]`);
        if (categoryBtn) {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            categoryBtn.classList.add('active');
        } else if (hasLoadedCategoryOptions) {
            hasInvalidCatalogFilter = true;
        }
    } else if (categoryButtons.length) {
        categoryButtons.forEach(b => b.classList.remove('active'));
        const allCategoryBtn = document.querySelector('.filter-btn[data-category="all"]');
        if (allCategoryBtn) {
            allCategoryBtn.classList.add('active');
        }
    }

    if (brand) {
        const normalizedBrand = normalizeBrandKey(brand);
        const brandBtn = Array.from(document.querySelectorAll('.brand-filter-chip[data-brand]'))
            .find(btn => normalizeBrandKey(btn.dataset.brand || '') === normalizedBrand);
        if (brandBtn) {
            document.querySelectorAll('.brand-filter-chip').forEach(b => b.classList.remove('active'));
            brandBtn.classList.add('active');
        } else if (hasLoadedBrandOptions) {
            hasInvalidCatalogFilter = true;
        }
    } else if (brandButtons.length) {
        brandButtons.forEach(b => b.classList.remove('active'));
        const allBrandBtn = document.querySelector('.brand-filter-chip[data-brand="all"]');
        if (allBrandBtn) {
            allBrandBtn.classList.add('active');
        }
    }

    if (hasInvalidCatalogFilter) {
        const productsGrid = document.getElementById('productsGrid');
        const productsTitle = document.getElementById('productsTitle');
        if (productsTitle) {
            productsTitle.textContent = 'Elemento no encontrado';
        }
        if (productsGrid) {
            productsGrid.innerHTML = '<p class="no-results">Elemento no encontrado.</p>';
        }
        return;
    }

    applyProductFilters(searchTerm ? searchTerm.toLowerCase().trim() : '');
}

function loadBrandFilters() {
    const brandsRail = document.getElementById('brandsRail');
    if (!brandsRail) return;

    const brands = getAvailableBrands();

    brandsRail.innerHTML = `
        <button class="brand-filter-chip ${currentBrandFilter === 'all' ? 'active' : ''}" data-brand="all" type="button">Todas las marcas</button>
        ${brands.map(brand => {
            const safeName = escapeHtml(brand.name);
            const safeKey = escapeHtml(brand.key);
            const safeLogo = escapeHtml(brand.logo);
            const initials = escapeHtml((brand.name || 'M').substring(0, 2).toUpperCase());
            const isActive = currentBrandFilter === brand.key;

            return `
            <button class="brand-filter-chip ${isActive ? 'active' : ''}" data-brand="${safeKey}" type="button" aria-label="Filtrar por ${safeName}">
                ${safeLogo
                    ? `<img src="${safeLogo}" alt="${safeName}" class="brand-filter-logo">`
                    : `<span class="brand-filter-initials">${initials}</span>`
                }
                <span class="brand-filter-name">${safeName}</span>
            </button>`;
        }).join('')}
    `;

    brandsRail.querySelectorAll('.brand-filter-chip').forEach(btn => {
        btn.addEventListener('click', function() {
            brandsRail.querySelectorAll('.brand-filter-chip').forEach(item => item.classList.remove('active'));
            this.classList.add('active');
            filterProductsByBrand(this.dataset.brand || 'all');
        });
    });
}

function loadCategoriesFilters() {
    const filtersContainer = document.getElementById('categoryFilters');
    if (!filtersContainer) return;

    const categories = (window.categories || []).map((category) => ({
        id: String(category?.id || '').trim(),
        name: String(category?.name || '').trim()
    })).filter(category => category.id && category.name);

    filtersContainer.innerHTML = `
        <button class="filter-btn ${currentCategoryFilter === 'all' ? 'active' : ''}" data-category="all">Todos</button>
        ${categories.map(category => {
            const safeId = escapeHtml(category.id);
            const safeName = escapeHtml(category.name);
            const isActive = currentCategoryFilter === category.id;
            return `
            <button class="filter-btn ${isActive ? 'active' : ''}" data-category="${safeId}">${safeName}</button>
        `;
        }).join('')}
    `;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const category = this.dataset.category;
            filterProductsByCategory(category);
        });
    });
}

function filterProductsByCategory(category) {
    hasInvalidCatalogFilter = false;
    currentCategoryFilter = category;
    resetProductsPagination();
    const currentTerm = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    applyProductFilters(currentTerm);
}

function filterProductsByBrand(brand) {
    hasInvalidCatalogFilter = false;
    currentBrandFilter = brand || 'all';
    resetProductsPagination();
    const currentTerm = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    applyProductFilters(currentTerm);
}

function loadAllProducts() {
    resetProductsPagination();
    const productsGrid = document.getElementById('productsGrid');
    if (productsGrid) {
        renderProducts(window.productsData || [], productsGrid);
    }
}

function ensureProductsPaginationContainer(container) {
    let wrapper = document.getElementById('productsPagination');
    if (wrapper) return wrapper;

    wrapper = document.createElement('div');
    wrapper.id = 'productsPagination';
    wrapper.className = 'products-pagination';
    container.insertAdjacentElement('afterend', wrapper);
    return wrapper;
}

function renderProductsPagination(container, visibleCount, totalCount) {
    const wrapper = ensureProductsPaginationContainer(container);

    if (totalCount <= PRODUCTS_PAGE_SIZE) {
        wrapper.innerHTML = '';
        wrapper.style.display = 'none';
        return;
    }

    const remaining = Math.max(0, totalCount - visibleCount);
    const shown = Math.min(visibleCount, totalCount);

    wrapper.style.display = '';
    wrapper.innerHTML = `
        <p class="products-pagination-info">Mostrando ${shown} de ${totalCount} productos</p>
        ${remaining > 0
            ? `<button type="button" class="load-more-btn" id="loadMoreProducts">Cargar más productos (${remaining} restantes)</button>`
            : ''}
    `;

    const loadMoreBtn = document.getElementById('loadMoreProducts');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            productsVisibleCount += PRODUCTS_PAGE_SIZE;
            const productsGrid = document.getElementById('productsGrid');
            if (productsGrid) {
                renderProducts(currentRenderedProducts, productsGrid);
            }
        });
    }
}

function renderProducts(products, container) {
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

    if (products.length === 0) {
        container.innerHTML = '<p class="no-results">No se encontraron productos.</p>';
        renderProductsPagination(container, 0, 0);
        return;
    }

    currentRenderedProducts = products;
    const visibleProducts = products.slice(0, productsVisibleCount);

    container.innerHTML = visibleProducts.map(product => {
        const safeName = escapeHtml(product.name || 'Producto');
        const safeCategory = escapeHtml(product.category || '');
        const safeProductId = escapeHtml(String(product.id));
        const safeImage = sanitizeImageUrl(product.image);
        const safeCategoryName = escapeHtml(categoryNameById[product.category] || product.category || '');
        const isOutOfStock = isProductOutOfStock(product);

        return `
        <div class="product-card${isOutOfStock ? ' product-card-out-of-stock' : ''}" data-category="${safeCategory}" data-action="open-product" data-product-id="${safeProductId}" style="cursor: pointer;">
            <div class="product-image">
                ${safeImage ? 
                    `<img src="${safeImage}" alt="${safeName}" class="product-real-image" loading="lazy" decoding="async">` :
                    `<div class="image-placeholder">
                        <span class="product-emoji">${emojis[product.category] || '🛍️'}</span>
                        <span class="product-text">${escapeHtml((product.name || '').split(' ')[0] || '')}</span>
                    </div>`
                }
                ${product.featured ? '<span class="featured-badge">⭐ Destacado</span>' : ''}
            </div>
            <div class="product-info">
                <h3>${safeName}</h3>
                ${renderPriceHtml(product)}
                <div class="product-category">${safeCategoryName}</div>
                <button class="add-to-cart${isOutOfStock ? ' out-of-stock-button' : ''}" data-action="${isOutOfStock ? 'out-of-stock' : 'add-to-cart'}" data-product-id="${safeProductId}" ${isOutOfStock ? 'disabled' : ''}>
                    ${isOutOfStock ? 'Agotado' : 'Agregar al Carrito'}
                </button>
            </div>
        </div>
    `;
    }).join('');

    renderProductsPagination(container, visibleProducts.length, products.length);

    if (container.dataset.listener !== 'true') {
        container.addEventListener('click', (event) => {
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
        container.dataset.listener = 'true';
    }
}

function applyProductFilters(searchTerm = '') {
    const productsGrid = document.getElementById('productsGrid');
    const productsTitle = document.getElementById('productsTitle');

    if (!productsGrid || !productsTitle) {
        return;
    }

    let filteredProducts = window.productsData || [];

    if (currentCategoryFilter !== 'all') {
        filteredProducts = filteredProducts.filter(product => product.category === currentCategoryFilter);
    }

    if (currentBrandFilter !== 'all') {
        filteredProducts = filteredProducts.filter(product => normalizeBrandKey(product.brand) === currentBrandFilter);
    }

    if (searchTerm) {
        const idSet = new Set(
            productSearchIndex
                .filter(entry => (currentCategoryFilter === 'all' || entry.category === currentCategoryFilter) && entry.text.includes(searchTerm))
                .map(entry => entry.id)
        );
        filteredProducts = filteredProducts.filter(product => idSet.has(String(product.id)));
    }

    if (searchTerm) {
        if (filteredProducts.length > 0) {
            productsTitle.textContent = `Resultados para: "${searchTerm}" (${filteredProducts.length})`;
            renderProducts(filteredProducts, productsGrid);
        } else {
            productsTitle.textContent = `No se encontraron resultados para: "${searchTerm}"`;
            productsGrid.innerHTML = '<p class="no-results">No se encontraron productos que coincidan con tu búsqueda.</p>';
        }
        return;
    }

    const selectedBrandButton = document.querySelector(`.brand-filter-chip[data-brand="${currentBrandFilter}"] .brand-filter-name`);
    const selectedBrandName = currentBrandFilter === 'all'
        ? ''
        : (selectedBrandButton?.textContent || currentBrandFilter.replace(/-/g, ' '));

    if (currentCategoryFilter !== 'all' && currentBrandFilter !== 'all') {
        productsTitle.textContent = `${categoryNameById[currentCategoryFilter] || currentCategoryFilter} · ${selectedBrandName}`;
    } else if (currentCategoryFilter !== 'all') {
        productsTitle.textContent = categoryNameById[currentCategoryFilter] || currentCategoryFilter;
    } else if (currentBrandFilter !== 'all') {
        productsTitle.textContent = `Marca: ${selectedBrandName}`;
    } else {
        productsTitle.textContent = 'Todos los Productos';
    }

    renderProducts(filteredProducts, productsGrid);
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    
    if (!searchInput || !searchButton) return;

    function performSearch(searchTerm = null) {
        const term = searchTerm !== null ? searchTerm : searchInput.value.toLowerCase().trim();

        resetProductsPagination();

        if (term === '') {
            applyProductFilters('');
            return;
        }

        applyProductFilters(term);
    }

    searchButton.addEventListener('click', () => performSearch());
    searchInput.addEventListener('input', function() {
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }
        searchDebounceTimer = setTimeout(() => performSearch(), SEARCH_DEBOUNCE_MS);
    });
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    // Hacer la función global para checkUrlParams
    window.performSearch = performSearch;
}

/**
 * Agregar producto al carrito desde el botón
 * @param {string|number} productId - ID del producto (string para Firebase, número para local)
 */
function addToCartFromButton(productId) {
    console.log('➕ Agregando producto al carrito (ID:', productId, ')');
    
    // Asegurarse de que productId es el tipo correcto para comparar
    const product = window.productsData.find(p => String(p.id) === String(productId));
    
    if (!product) {
        console.error('❌ Producto no encontrado:', productId);
        showNotification('Error: Producto no encontrado');
        return;
    }
    
    // Llamar a la función global addToCart desde app.js
    if (typeof window.addToCart === 'function') {
        window.addToCart(product);
        console.log('✅ Producto agregado:', product.name);
    } else {
        console.error('❌ Función addToCart no disponible');
        showNotification('Error al agregar al carrito');
    }
}
