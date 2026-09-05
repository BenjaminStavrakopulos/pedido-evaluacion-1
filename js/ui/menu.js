// Menu Hamburguesa Mejorado
const menuToggle = document.getElementById('menuToggle');
const mobileNav = document.getElementById('mobileNav');
const mobileOverlay = document.getElementById('mobileOverlay');
const mobileClose = document.getElementById('mobileClose');

function normalizeNavText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function ensureMobileNavPrimaryLinks() {
    if (!mobileNav) {
        return;
    }

    const navHeader = mobileNav.querySelector('.mobile-nav-header');
    const navLinks = Array.from(mobileNav.querySelectorAll('.nav-link'));

    const findLink = (matcher) => navLinks.find((link) => matcher(normalizeNavText(link.textContent)));

    let inicioLink = findLink((text) => text === 'inicio');
    let productosLink = findLink((text) => text.includes('producto') || text.includes('catalogo'));
    let quienesLink = findLink((text) => text.includes('quienes somos') || text.includes('nosotros'));

    const createLink = (text, href) => {
        const link = document.createElement('a');
        link.className = 'nav-link';
        link.href = href;
        link.textContent = text;
        return link;
    };

    if (!inicioLink) {
        inicioLink = createLink('Inicio', 'index.html');
    }
    if (!productosLink) {
        productosLink = createLink('Productos', 'products.html');
    }
    if (!quienesLink) {
        quienesLink = createLink('Quienes somos', 'index.html#nosotros');
    }

    inicioLink.href = 'index.html';
    inicioLink.textContent = 'Inicio';
    productosLink.href = 'products.html';
    productosLink.textContent = 'Productos';
    quienesLink.href = 'index.html#nosotros';
    quienesLink.textContent = 'Quienes somos';

    if (navHeader) {
        navHeader.insertAdjacentElement('afterend', quienesLink);
        navHeader.insertAdjacentElement('afterend', productosLink);
        navHeader.insertAdjacentElement('afterend', inicioLink);
    } else {
        mobileNav.prepend(quienesLink);
        mobileNav.prepend(productosLink);
        mobileNav.prepend(inicioLink);
    }
}

function setupMobileCatalogMenu() {
    if (!mobileNav) {
        return;
    }

    const desktopCatalogDropdown = document.querySelector('.nav-catalog .catalog-dropdown');
    const mobileCatalogTrigger = Array.from(mobileNav.querySelectorAll('.nav-link')).find((link) => {
        const text = (link.textContent || '').trim().toLowerCase();
        return text.includes('catálogo') || text.includes('catalogo');
    });

    if (!desktopCatalogDropdown || !mobileCatalogTrigger) {
        return;
    }

    if (mobileNav.querySelector('.mobile-catalog-submenu')) {
        return;
    }

    mobileCatalogTrigger.dataset.mobileCatalogToggle = 'true';
    mobileCatalogTrigger.setAttribute('aria-expanded', 'false');
    mobileCatalogTrigger.setAttribute('aria-haspopup', 'true');

    const submenu = document.createElement('div');
    submenu.className = 'mobile-catalog-submenu';

    const columns = desktopCatalogDropdown.querySelectorAll('.catalog-column');
    columns.forEach((column) => {
        const section = document.createElement('div');
        section.className = 'mobile-catalog-section';

        const title = column.querySelector('h4');
        if (title) {
            const heading = document.createElement('h4');
            heading.textContent = title.textContent || '';
            section.appendChild(heading);
        }

        const links = column.querySelectorAll('a[href]');
        links.forEach((sourceLink) => {
            const link = document.createElement('a');
            link.className = sourceLink.className || 'catalog-link';
            link.href = sourceLink.href;
            link.textContent = sourceLink.textContent || '';
            link.addEventListener('click', closeMenu);
            section.appendChild(link);
        });

        submenu.appendChild(section);
    });

    mobileCatalogTrigger.insertAdjacentElement('afterend', submenu);

    mobileCatalogTrigger.addEventListener('click', (event) => {
        event.preventDefault();
        const isOpen = submenu.classList.toggle('active');
        mobileCatalogTrigger.classList.toggle('active', isOpen);
        mobileCatalogTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
}

function toggleMenu() {
    if (!menuToggle || !mobileNav || !mobileOverlay) {
        return;
    }

    menuToggle.classList.toggle('active');
    mobileNav.classList.toggle('active');
    mobileOverlay.classList.toggle('active');
    menuToggle.setAttribute('aria-expanded', mobileNav.classList.contains('active') ? 'true' : 'false');
    
    // Prevenir scroll cuando el menú está abierto
    document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
}

function closeMenu() {
    if (!menuToggle || !mobileNav || !mobileOverlay) {
        return;
    }

    menuToggle.classList.remove('active');
    mobileNav.classList.remove('active');
    mobileOverlay.classList.remove('active');
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
}

function setupLogoHomeNavigation() {
    if (window.location.pathname.includes('/admin/')) {
        return;
    }

    const goHome = () => {
        window.location.href = 'index.html';
    };

    document.querySelectorAll('.logo, .mobile-nav-logo').forEach((logo) => {
        if (logo.closest('a[href]')) {
            return;
        }

        logo.style.cursor = 'pointer';
        logo.setAttribute('tabindex', '0');
        logo.setAttribute('role', 'button');
        logo.setAttribute('aria-label', 'Ir al inicio');

        logo.addEventListener('click', goHome);
        logo.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                goHome();
            }
        });
    });
}

if (menuToggle && mobileNav && mobileOverlay && mobileClose) {
    ensureMobileNavPrimaryLinks();
    setupMobileCatalogMenu();

    menuToggle.addEventListener('click', toggleMenu);
    mobileOverlay.addEventListener('click', closeMenu);
    mobileClose.addEventListener('click', closeMenu);

    // Cerrar menú al hacer clic en un enlace
    const navLinks = document.querySelectorAll('.mobile-nav .nav-link');
    navLinks.forEach(link => {
        if (link.dataset.mobileCatalogToggle === 'true') {
            return;
        }

        link.addEventListener('click', closeMenu);
    });

    // Cerrar menú con tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && mobileNav.classList.contains('active')) {
            closeMenu();
        }
    });
    
    console.log('✅ Menú hamburguesa mejorado configurado');
}

setupLogoHomeNavigation();

function isInternalNavigableLink(anchor) {
    if (!anchor) return false;
    if (anchor.hasAttribute('download')) return false;
    if (anchor.target && anchor.target.toLowerCase() === '_blank') return false;

    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return false;

    try {
        const targetUrl = new URL(anchor.href, window.location.href);
        const currentUrl = new URL(window.location.href);
        return targetUrl.origin === currentUrl.origin;
    } catch (_) {
        return false;
    }
}

function getClosestAnchorFromTarget(target) {
    if (!target || typeof target.closest !== 'function') {
        return null;
    }

    return target.closest('a[href]');
}

function setupSmoothPageNavigation() {
    if (document.body?.dataset.navTransitionReady === 'true') return;

    window.addEventListener('pageshow', () => {
        document.documentElement.classList.remove('is-page-leaving');
        document.body.classList.remove('is-page-leaving');
    });

    window.addEventListener('pagehide', () => {
        document.documentElement.classList.remove('is-page-leaving');
        document.body.classList.remove('is-page-leaving');
    });

    document.addEventListener('click', (event) => {
        const anchor = getClosestAnchorFromTarget(event.target);
        if (!isInternalNavigableLink(anchor)) return;

        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }

        const current = new URL(window.location.href);
        const next = new URL(anchor.href, window.location.href);
        if (current.href === next.href) return;

        closeMenu();
    });

    document.body.dataset.navTransitionReady = 'true';
}

setupSmoothPageNavigation();

function setupInternalPrefetch() {
    if (document.body?.dataset.navPrefetchReady === 'true') return;

    const prefetched = new Set();
    const tryPrefetchHref = (href) => {
        if (!href || prefetched.has(href)) return;

        const prefetchLink = document.createElement('link');
        prefetchLink.rel = 'prefetch';
        prefetchLink.href = href;
        document.head.appendChild(prefetchLink);
        prefetched.add(href);
    };

    const prefetchAnchor = (anchor) => {
        if (!isInternalNavigableLink(anchor)) return;
        tryPrefetchHref(anchor.href);
    };

    const initialInternalLinks = document.querySelectorAll('a[href]');
    initialInternalLinks.forEach(prefetchAnchor);

    document.addEventListener('pointerenter', (event) => {
        const anchor = getClosestAnchorFromTarget(event.target);
        prefetchAnchor(anchor);
    }, true);

    document.addEventListener('touchstart', (event) => {
        const anchor = getClosestAnchorFromTarget(event.target);
        prefetchAnchor(anchor);
    }, { passive: true, capture: true });

    document.body.dataset.navPrefetchReady = 'true';
}
function setupShippingBanner() {
if (document.body?.dataset.shippingBannerReady === 'true') return;

const shippingBanner = document.getElementById('shippingBanner');
const shippingBannerClose = document.getElementById('shippingBannerClose');
const header = document.querySelector('.header');

if (!header) return;

// Si la página NO tiene banner, el header debe pegarse al tope (top: 0)
// para que no quede un hueco ni corte el contenido de páginas sin banner.
if (!shippingBanner) {
    header.classList.add('banner-closed');
    document.body.classList.add('no-shipping-banner');
    document.body.dataset.shippingBannerReady = 'true';
    syncContentOffsetWithHeader(header, null);
    return;
}

if (shippingBannerClose) {
    shippingBannerClose.addEventListener('click', function () {
        shippingBanner.classList.add('hidden');
        header.classList.add('banner-closed');
        syncContentOffsetWithHeader(header, shippingBanner);
    });
}

// Posicionar el contenido según la altura real de banner + header desde el inicio,
// para que no haya salto visual al cargar la página.
syncContentOffsetWithHeader(header, shippingBanner);

document.body.dataset.shippingBannerReady = 'true';

}

// Mide la altura real del header (y del banner si está visible) y expone
// --header-height con el total, para que el contenido de cada página quede
// justo debajo, sin cortarse ni saltar.
function syncContentOffsetWithHeader(header, shippingBanner) {
const applyOffset = () => {
    let total = Math.ceil(header.getBoundingClientRect().height);
    if (shippingBanner && !shippingBanner.classList.contains('hidden')) {
        total += Math.ceil(shippingBanner.getBoundingClientRect().height);
    }
    if (total > 0) {
        document.documentElement.style.setProperty('--header-height', `${total}px`);
    }
};
applyOffset();
window.addEventListener('resize', applyOffset);
}

if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', setupShippingBanner);
} else {
setupShippingBanner();
}


setupInternalPrefetch();
