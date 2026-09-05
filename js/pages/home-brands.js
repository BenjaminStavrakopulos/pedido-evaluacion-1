(function () {
    const CUSTOM_BRANDS_STORAGE_KEY = 'hairia_custom_brands';

    const fixedBrandsData = [
        { id: 'olaplex', name: 'Olaplex', logo: 'images/olaplex.jpg', searchTerms: ['olaplex', 'olplex'] },
        { id: 'kerastase', name: 'Kérastase', logo: 'images/kerastase.jpg', searchTerms: ['kerastase', 'kérastase'] },
        { id: 'tigi', name: 'Tigi', logo: 'images/tigi.jpg', searchTerms: ['tigi'] },
        { id: 'k18', name: 'K18', logo: 'images/k18.jpg', searchTerms: ['k18'] },
        { id: 'living-proof', name: 'Living Proof', logo: 'images/livingprof.jpg', searchTerms: ['living proof', 'livingproof', 'living prof'] },
        { id: 'revlon', name: 'Revlon', logo: 'images/revlon.jpg', searchTerms: ['revlon'] },
        { id: 'moroccanoil', name: 'Moroccanoil', logo: 'images/Moroccanoil.jpg', searchTerms: ['moroccanoil', 'moroccan oil'] },
        { id: 'dabalash', name: 'Dabalash', logo: 'images/Dabalash.jpg', searchTerms: ['dabalash'] }
    ];

    let brandsData = [];
    let homeBrandUiInitialized = false;

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

    function loadCustomBrandsData() {
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
                        : [item.id]
                }));
        } catch (error) {
            console.warn('No se pudieron cargar marcas personalizadas en inicio:', error);
            return [];
        }
    }

    function getMergedBrandsData() {
        const merged = [...fixedBrandsData];
        const fixedIds = new Set(merged.map(brand => brand.id));
        return merged;
    }

    function normalizeBrandValue(value) {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9-\s]/g, '')
            .trim();
    }

    function normalizeBrandKey(value) {
        return normalizeBrandValue(value).replace(/\s+/g, '-');
    }

    function uniqueSearchTerms(values) {
        const terms = Array.isArray(values) ? values : [];
        const unique = new Set();

        terms.forEach((value) => {
            const normalized = normalizeBrandValue(value);
            if (normalized) {
                unique.add(normalized);
            }
        });

        return Array.from(unique);
    }

    function mergeBrandsByKey(baseBrands, incomingBrands) {
        const result = [];
        const indexByKey = new Map();

        const upsert = (brand) => {
            if (!brand || typeof brand !== 'object') return;

            const rawId = String(brand.id || '').trim();
            const rawName = String(brand.name || '').trim();
            const key = normalizeBrandKey(rawId || rawName);
            if (!key) return;

            const normalizedBrand = {
                id: rawId || key,
                name: rawName || rawId || key,
                logo: typeof brand.logo === 'string' ? brand.logo : '',
                searchTerms: uniqueSearchTerms([
                    ...(Array.isArray(brand.searchTerms) ? brand.searchTerms : []),
                    rawId,
                    rawName,
                    key
                ])
            };

            const existingIndex = indexByKey.get(key);
            if (existingIndex === undefined) {
                indexByKey.set(key, result.length);
                result.push(normalizedBrand);
                return;
            }

            const existing = result[existingIndex];
            const mergedSearchTerms = uniqueSearchTerms([
                ...(existing.searchTerms || []),
                ...(normalizedBrand.searchTerms || [])
            ]);

            result[existingIndex] = {
                ...existing,
                ...normalizedBrand,
                id: existing.id || normalizedBrand.id,
                name: existing.name || normalizedBrand.name,
                logo: normalizedBrand.logo || existing.logo || '',
                searchTerms: mergedSearchTerms
            };
        };

        (Array.isArray(baseBrands) ? baseBrands : []).forEach(upsert);
        (Array.isArray(incomingBrands) ? incomingBrands : []).forEach(upsert);

        return result;
    }

    function buildBrandsFromProducts(products, knownBrands) {
        const knownKeys = new Set(
            (Array.isArray(knownBrands) ? knownBrands : [])
                .map(brand => normalizeBrandKey(brand?.id || brand?.name))
                .filter(Boolean)
        );

        const derivedBrands = [];

        (Array.isArray(products) ? products : []).forEach((product) => {
            const rawBrand = String(product?.brand || '').trim();
            if (!rawBrand) return;

            const brandKey = normalizeBrandKey(rawBrand);
            if (!brandKey || knownKeys.has(brandKey)) {
                return;
            }

            knownKeys.add(brandKey);
            derivedBrands.push({
                id: rawBrand,
                name: rawBrand,
                logo: '',
                searchTerms: [rawBrand, brandKey]
            });
        });

        return derivedBrands;
    }

    async function resolveHomeBrandsData() {
        const baseBrands = getMergedBrandsData();
        let firebaseBrands = [];

        if (window.firebaseData?.loadBrands) {
            try {
                firebaseBrands = await window.firebaseData.loadBrands();
            } catch (error) {
                console.warn('No se pudieron cargar marcas desde Firebase en home:', error);
            }
        }

        const mergedWithFirebase = mergeBrandsByKey(baseBrands, firebaseBrands);
        const derivedBrands = buildBrandsFromProducts(window.productsData, mergedWithFirebase);
        return mergeBrandsByKey(mergedWithFirebase, derivedBrands);
    }

    function sanitizeUiImageUrl(value) {
        if (typeof value !== 'string') return '';
        const trimmed = value.trim();
        if (!trimmed) return '';

        if (/^(https?:\/\/|data:image\/)/i.test(trimmed)) {
            return trimmed;
        }

        if (/^(\.\/|\.\.\/|\/|images\/)/i.test(trimmed)) {
            return trimmed;
        }

        return '';
    }

    function toBrandDomKey(brandId) {
        const raw = String(brandId || '').trim();
        if (!raw) return '';
        return encodeURIComponent(raw);
    }

    function getProductsBrandUrl(brand) {
        const brandSource = String(brand?.id || brand?.name || '').trim();
        const normalizedBrand = normalizeBrandKey(brandSource);

        const basePath = 'products.html';

    if (!normalizedBrand) {
        return basePath;
    }

    return `${basePath}?brand=${encodeURIComponent(normalizedBrand)}`;
    }

    function isProductAvailableForHome(product) {
        if (!product) {
            return false;
        }
        return true;
    }

    function isProductOutOfStockForHome(product) {
        const stock = Number.parseInt(product?.stock, 10);
        return product?.active === false || (Number.isFinite(stock) && stock <= 0);
    }

    function getBrandProducts(brandId) {
        if (!Array.isArray(window.productsData)) {
            return [];
        }

        const brand = brandsData.find(item => item.id === brandId);
        const searchTerms = Array.isArray(brand?.searchTerms) ? brand.searchTerms : [brandId];
        const normalizedBrandId = normalizeBrandValue(brandId);
        const normalizedSearchTerms = searchTerms.map(term => normalizeBrandValue(term)).filter(Boolean);

        return window.productsData.filter(product => {
            if (!isProductAvailableForHome(product)) {
                return false;
            }

            const normalizedProductBrand = normalizeBrandValue(product.brand || '');
            if (normalizedProductBrand && (normalizedProductBrand === normalizedBrandId || normalizedSearchTerms.includes(normalizedProductBrand))) {
                return true;
            }

            const searchable = [
                product.brand || '',
                product.name || '',
                product.description || ''
            ].map(item => normalizeBrandValue(item)).join(' ');

            return normalizedSearchTerms.some(term => searchable.includes(term));
        });
    }

    function getBrandsWithProducts() {
        return (brandsData || []).filter(brand => getBrandProducts(brand.id).length > 0);
    }

    function renderBrandShowcaseBlocks() {
        const container = document.getElementById('brandShowcaseContainer');
        if (!container) return;

        const brandsWithProducts = getBrandsWithProducts();

        if (!brandsWithProducts.length) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = brandsWithProducts.map(brand => {
            const brandDomKey = toBrandDomKey(brand.id);
            const safeBrandId = escapeAttr(brand.id);
            const safeBrandName = escapeHtml(brand.name);
            const productsBrandUrl = getProductsBrandUrl(brand);

            return `
            <div class="brand-showcase-block" id="brand-${brandDomKey}" data-brand-id="${safeBrandId}" data-brand-dom-key="${brandDomKey}">
                <div class="brand-showcase-inner">
                    <div class="brand-showcase-title-row">
                        <h3 class="brand-showcase-title" id="brand-title-${brandDomKey}" tabindex="-1">${safeBrandName}</h3>
                        <a href="${productsBrandUrl}" class="brand-showcase-link">Ver mas</a>
                    </div>
                    <div class="brand-products-carousel">
                        <button class="brand-products-btn brand-products-prev" data-brand-nav="prev" data-brand-id="${safeBrandId}" data-brand-dom-key="${brandDomKey}">‹</button>
                        <div class="brand-products-track" id="brandTrack-${brandDomKey}"></div>
                        <button class="brand-products-btn brand-products-next" data-brand-nav="next" data-brand-id="${safeBrandId}" data-brand-dom-key="${brandDomKey}">›</button>
                    </div>
                </div>
            </div>
        `;
        }).join('');
    }

    function getCategoryEmoji(categoryId) {
        const emojis = {
            shampoo: '🧴',
            acondicionador: '💧',
            tratamiento: '🎭',
            aceite: '💧'
        };

        return emojis[categoryId] || '🛍️';
    }

    function renderBrandPriceHtml(product) {
        const price = Number(product?.price) || 0;
        let discountedPrice = price;
        let discountText = '';

        if (product?.discountType === 'percentage' && Number(product.discountPercent) > 0) {
            discountedPrice = Math.max(0, Math.round(price - (price * Number(product.discountPercent) / 100)));
            discountText = `${Number(product.discountPercent)}% OFF`;
        } else if (product?.discountType === 'amount' && Number(product.discountAmount) > 0) {
            discountedPrice = Math.max(0, price - Number(product.discountAmount));
            discountText = `-${window.formatCLP ? window.formatCLP(product.discountAmount) : '$' + product.discountAmount}`;
        }

        if (!discountText) {
            return `<p class="product-price">${window.formatCLP ? window.formatCLP(price) : '$' + price}</p>`;
        }

        const formattedPrice = window.formatCLP ? window.formatCLP(discountedPrice) : '$' + discountedPrice;
        const originalPrice = window.formatCLP ? window.formatCLP(price) : '$' + price;
        return `<div class="price-with-discount">
            <span class="original-price">${originalPrice}</span>
            <div class="discount-price-row">
                <p class="product-price discounted">${formattedPrice}</p>
                <span class="discount-badge">${discountText}</span>
            </div>
        </div>`;
    }

    function renderBrandTrack(brandId) {
        const brandDomKey = toBrandDomKey(brandId);
        const track = document.getElementById(`brandTrack-${brandDomKey}`);
        if (!track) return;

        const products = getBrandProducts(brandId);
        if (products.length === 0) {
            track.innerHTML = '';
            return;
        }

        track.classList.toggle('single-item', products.length === 1);

        track.innerHTML = products.map(product => {
            const safeProductId = escapeAttr(String(product.id || ''));
            const safeProductName = escapeHtml(String(product.name || 'Producto'));
            const safeImage = sanitizeUiImageUrl(product.image);
            const safeProductText = escapeHtml(String((product.name || '').split(' ')[0] || ''));
            const isOutOfStock = isProductOutOfStockForHome(product);

            return `
            <div class="brand-products-card${isOutOfStock ? ' product-card-out-of-stock' : ''}" data-action="open-product" data-product-id="${safeProductId}">
                <div class="product-image">
                    ${safeImage ?
                        `<img src="${safeImage}" alt="${safeProductName}" class="product-real-image">` :
                        `<div class="image-placeholder">
                            <span class="product-emoji">${getCategoryEmoji(product.category)}</span>
                            <span class="product-text">${safeProductText}</span>
                        </div>`
                    }
                </div>
                <div class="product-info">
                    <h4>${safeProductName}</h4>
                    ${renderBrandPriceHtml(product)}
                    <button class="add-to-cart${isOutOfStock ? ' out-of-stock-button' : ''}" data-action="${isOutOfStock ? 'out-of-stock' : 'add-to-cart'}" data-product-id="${safeProductId}" ${isOutOfStock ? 'disabled' : ''}>
                        ${isOutOfStock ? 'Agotado' : 'Agregar al Carrito'}
                    </button>
                </div>
            </div>
        `;
        }).join('');

        if (track.dataset.listener !== 'true') {
            track.addEventListener('click', function (event) {
                const cartButton = event.target.closest('button[data-action="add-to-cart"][data-product-id]');
                if (cartButton) {
                    event.stopPropagation();
                    if (typeof window.addToCartFromButton === 'function') {
                        window.addToCartFromButton(cartButton.dataset.productId);
                    }
                    return;
                }

                if (event.target.closest('button[data-action="out-of-stock"]')) {
                    event.stopPropagation();
                    return;
                }

                const card = event.target.closest('[data-action="open-product"][data-product-id]');
                if (card && typeof window.openProductModal === 'function') {
                    window.openProductModal(card.dataset.productId);
                }
            });
            track.dataset.listener = 'true';
        }
    }

    function scrollToBrandShowcase(brandId) {
        const brandDomKey = toBrandDomKey(brandId);
        const target = document.getElementById(`brand-${brandDomKey}`);
        const titleTarget = document.getElementById(`brand-title-${brandDomKey}`);
        if (!target || !titleTarget) return;

        const targetTop = target.getBoundingClientRect().top + window.scrollY;
        const visualOffset = 112;
        window.scrollTo({
            top: Math.max(0, targetTop - visualOffset),
            behavior: 'smooth'
        });

        titleTarget.focus({ preventScroll: true });
        target.classList.add('brand-showcase-highlight');
        setTimeout(() => target.classList.remove('brand-showcase-highlight'), 1400);
    }

    function loadBrandsCarousel() {
        const brandsTrack = document.getElementById('brandsTrack');
        if (!brandsTrack) return;

        brandsTrack.innerHTML = '';

        const brandsWithProducts = getBrandsWithProducts();
        if (!brandsWithProducts.length) {
            return;
        }

        brandsWithProducts.forEach(brand => {
            const brandItem = document.createElement('div');
            brandItem.className = 'brand-logo-item';
            brandItem.dataset.brandId = String(brand.id || '');
            brandItem.dataset.brandName = String(brand.name || '');

            const safeBrandName = escapeHtml(String(brand.name || 'Marca'));
            const safeLogo = sanitizeUiImageUrl(brand.logo);
            const placeholderText = safeBrandName.substring(0, 3);

            if (safeLogo) {
                brandItem.innerHTML = `
                    <img src="${safeLogo}" alt="${safeBrandName}" class="brand-logo">
                    <span class="brand-name">${safeBrandName}</span>
                `;
            } else {
                brandItem.innerHTML = `
                    <div class="brand-logo-placeholder">${placeholderText}</div>
                    <span class="brand-name">${safeBrandName}</span>
                `;
            }

            if (safeLogo) {
                const brandLogo = brandItem.querySelector('.brand-logo');
                if (brandLogo) {
                    brandLogo.addEventListener('error', () => {
                        const fallback = document.createElement('div');
                        fallback.className = 'brand-logo-placeholder';
                        fallback.textContent = placeholderText;
                        brandLogo.replaceWith(fallback);
                    }, { once: true });
                }
            }

            brandItem.addEventListener('click', () => scrollToBrandShowcase(brand.id));
            brandsTrack.appendChild(brandItem);
        });

        setupBrandsCarouselNav();
    }

    function setupBrandsCarouselNav() {
        const track = document.getElementById('brandsTrack');
        const prevBtn = document.getElementById('brandsPrev');
        const nextBtn = document.getElementById('brandsNext');

        if (!track || !prevBtn || !nextBtn) return;

        const scrollAmount = () => {
            const firstItem = track.querySelector('.brand-logo-item');
            if (!firstItem) return 140;

            const styles = window.getComputedStyle(track);
            const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
            return firstItem.getBoundingClientRect().width + gap;
        };

        const moveTrack = (direction) => {
            const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
            const currentLeft = track.scrollLeft;
            const isAtStart = currentLeft <= 1;
            const isAtEnd = currentLeft >= maxScrollLeft - 1;
            const step = scrollAmount();
            let targetLeft = currentLeft + (direction * scrollAmount());

            if (direction < 0 && isAtStart && maxScrollLeft > 0) {
                targetLeft = maxScrollLeft;
            } else if (direction > 0 && isAtEnd && maxScrollLeft > 0) {
                targetLeft = 0;
            } else if (direction < 0 && targetLeft < step / 2) {
                targetLeft = 0;
            } else if (direction > 0 && targetLeft > maxScrollLeft - (step / 2)) {
                targetLeft = maxScrollLeft;
            }

            track.scrollTo({
                left: Math.max(0, Math.min(targetLeft, maxScrollLeft)),
                behavior: 'smooth'
            });
        };

        if (prevBtn.dataset.listener !== 'true') {
            prevBtn.addEventListener('click', () => moveTrack(-1));
            prevBtn.dataset.listener = 'true';
        }

        if (nextBtn.dataset.listener !== 'true') {
            nextBtn.addEventListener('click', () => moveTrack(1));
            nextBtn.dataset.listener = 'true';
        }
    }

    function setupBrandProductsNav() {
        document.querySelectorAll('[data-brand-nav]').forEach(btn => {
            if (btn.dataset.listener === 'true') return;

            btn.addEventListener('click', () => {
                const brandId = btn.dataset.brandId;
                const brandDomKey = btn.dataset.brandDomKey || toBrandDomKey(brandId);
                const direction = btn.dataset.brandNav;
                const track = document.getElementById(`brandTrack-${brandDomKey}`);
                if (!track) return;

                const firstCard = track.querySelector('.brand-products-card');
                const styles = window.getComputedStyle(track);
                const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
                const step = (firstCard?.getBoundingClientRect().width || 260) + gap;
                const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
                const currentLeft = track.scrollLeft;
                const directionValue = direction === 'next' ? 1 : -1;
                const targetLeft = currentLeft + (directionValue * step);
                const nextLeft = directionValue > 0 && targetLeft >= maxScrollLeft - (step / 2)
                    ? 0
                    : directionValue < 0 && targetLeft <= step / 2
                        ? maxScrollLeft
                        : Math.max(0, Math.min(targetLeft, maxScrollLeft));

                track.scrollTo({ left: nextLeft, behavior: 'smooth' });
            });

            btn.dataset.listener = 'true';
        });
    }

    function renderBrandShowcases(attempt = 0) {
        if ((!Array.isArray(window.productsData) || window.productsData.length === 0) && attempt < 12) {
            setTimeout(() => renderBrandShowcases(attempt + 1), 500);
            return;
        }

        getBrandsWithProducts().forEach(brand => renderBrandTrack(brand.id));
        setupBrandProductsNav();
    }

    async function refreshHomeBrandUi() {
        brandsData = await resolveHomeBrandsData();

        renderBrandShowcaseBlocks();
        loadBrandsCarousel();
        renderBrandShowcases();
        homeBrandUiInitialized = true;
    }

    async function initHomeBrandUi() {
        if (homeBrandUiInitialized) return;
        await refreshHomeBrandUi();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initHomeBrandUi();
        });
    } else {
        initHomeBrandUi();
    }

    window.addEventListener('hairia:data-ready', () => {
        refreshHomeBrandUi();
    });
})();
