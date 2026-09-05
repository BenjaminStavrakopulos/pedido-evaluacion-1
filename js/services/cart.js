// cart.js - VERSIÓN MEJORADA CON SINCRONIZACIÓN
console.log('🛒 cart.js cargado');

// Usar window.currentCart directamente desde app.js
function initCart() {
    console.log('📦 Inicializando carrito...');
    
    // Configurar botón checkout
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn && !checkoutBtn.hasAttribute('data-listener')) {
        checkoutBtn.addEventListener('click', goToCheckout);
        checkoutBtn.setAttribute('data-listener', 'true');
        console.log('✅ Evento checkout configurado');
    }
    
    // Actualizar UI inicial
    updateCartUI();
}

function getCartSummary(cart) {
    return cart.reduce((summary, item) => {
        summary.total += item.price * item.quantity;
        summary.totalItems += item.quantity;
        return summary;
    }, { total: 0, totalItems: 0 });
}

function getCartDiscountText(item) {
    if (item?.discountType === 'percentage' && Number(item.discountPercent) > 0) {
        return `${Number(item.discountPercent)}% OFF`;
    }
    if (item?.discountType === 'amount' && Number(item.discountAmount) > 0) {
        return `-${formatCartCLP(item.discountAmount)}`;
    }
    return '';
}

function formatCartCLP(amount) {
    if (typeof window.formatCLP === 'function') {
        return window.formatCLP(amount);
    }

    const numericAmount = Number(amount) || 0;
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(numericAmount);
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

function sanitizeCartImageUrl(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
        return escapeHtml(trimmed);
    }
    return '';
}

// Función para actualizar el sidebar del carrito
function updateCartUI() {
    const originalCart = Array.isArray(window.currentCart) ? window.currentCart : [];
    window.currentCart = originalCart.map(item => {
        const quantity = Math.max(1, Number.parseInt(item?.quantity, 10) || 1);
        return item?.quantitySource === 'user'
            ? { ...item, quantity }
            : { ...item, quantity: 1, quantitySource: 'user' };
    });

    if (window.currentCart.some((item, index) => item.quantity !== originalCart[index]?.quantity || item.quantitySource !== originalCart[index]?.quantitySource)) {
        const cartKey = window.currentUser?.uid ? `hairia_cart_${window.currentUser.uid}` : 'hairia_guest_cart';
        localStorage.setItem(cartKey, JSON.stringify(window.currentCart));
    }

    console.log('🔄 Actualizando UI del carrito...');
    console.log('📋 Items en carrito:', window.currentCart.length);
    console.log('📦 Detalles:', window.currentCart);
    
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    const checkoutBtn = document.getElementById('checkoutBtn');
    
    if (!cartItems || !cartTotal) {
        console.log('❌ Elementos del carrito no encontrados');
        return;
    }
    
    if (window.currentCart.length === 0) {
        cartItems.innerHTML = '<p class="empty-cart">Tu carrito está vacío</p>';
        cartTotal.textContent = '$0';
        if (checkoutBtn) checkoutBtn.style.display = 'none';
        updateCartCount(0);
    } else {
        const summary = getCartSummary(window.currentCart);

        cartItems.innerHTML = window.currentCart.map(item => {
            const safeItemName = escapeHtml(item.name || 'Producto');
            const safeItemId = escapeHtml(String(item.id));
            const safeImage = sanitizeCartImageUrl(item.image);
            const hasDiscount = getCartDiscountText(item) && Number(item.originalPrice) > Number(item.price);
            return `
            <div class="cart-item">
                <div class="cart-item-thumb">
                    ${safeImage ? `<img src="${safeImage}" alt="${safeItemName}">` : '<span class="cart-item-thumb-placeholder">🧴</span>'}
                </div>
                <div class="cart-item-info">
                    <strong>${safeItemName}</strong>
                    ${hasDiscount ? `<del>${formatCartCLP(item.originalPrice)}</del><span class="cart-discount-price">${formatCartCLP(item.price)} <em>${escapeHtml(getCartDiscountText(item))}</em></span>` : `<span>${formatCartCLP(item.price)}</span>`}
                </div>
                <div class="cart-item-controls">
                    <button data-action="quantity" data-change="-1" data-product-id="${safeItemId}">-</button>
                    <span>${item.quantity}</span>
                    <button data-action="quantity" data-change="1" data-product-id="${safeItemId}">+</button>
                    <button data-action="remove" data-product-id="${safeItemId}" class="remove-btn">🗑️</button>
                </div>
                <div class="cart-item-total">
                    ${formatCartCLP(item.price * item.quantity)}
                </div>
            </div>
        `;
        }).join('');

        cartTotal.textContent = formatCartCLP(summary.total);
        updateCartCount(summary.totalItems);
        
        if (checkoutBtn) {
            checkoutBtn.style.display = 'block';
            checkoutBtn.disabled = false;
        }
    }
}

function updateCartCount(totalItems = null) {
    const cartCount = document.querySelector('.cart-count');
    if (cartCount) {
        const resolvedTotalItems = totalItems === null
            ? window.currentCart.reduce((sum, item) => sum + item.quantity, 0)
            : totalItems;
        cartCount.textContent = resolvedTotalItems;
        console.log('🔢 Contador actualizado:', resolvedTotalItems);
    }
}

// ==============================
// MODAL DE CONFIRMACIÓN
// ==============================

let productToDelete = null;

function openDeleteModal(productId) {
    const item = window.currentCart.find(
        item => String(item.id) === String(productId)
    );

    if (!item) return;

    productToDelete = productId;

    const modal = document.getElementById('deleteModal');
    const message = document.getElementById('deleteModalMessage');

    if (!modal) return;

    if (message) {
        message.textContent =
            `¿Estás seguro de que quieres eliminar "${item.name}" del carrito?`;
    }

    modal.classList.add('active');
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');

    if (modal) {
        modal.classList.remove('active');
    }

    productToDelete = null;
}

function confirmDeleteProduct() {
    if (!productToDelete) return;

    removeFromCart(productToDelete);
    closeDeleteModal();
}


function updateQuantity(productId, change) {
    console.log('📊 Actualizando cantidad:', productId, change);

    const item = window.currentCart.find(
        item => String(item.id) === String(productId)
    );

    if (!item) return;

    // Si intenta pasar de 1 a 0
    if (item.quantity === 1 && change < 0) {
        openDeleteModal(productId);
        return;
    }

    item.quantity += change;
    item.quantitySource = 'user';

    if (item.quantity <= 0) {
        openDeleteModal(productId);
        return;
    }

    window.saveCart();
    updateCartUI();
}


function removeFromCart(productId) {
    console.log('➖ Eliminando del carrito:', productId);
    
    window.currentCart = window.currentCart.filter(item => String(item.id) !== String(productId));
    window.saveCart();
    updateCartUI();
}

// Función para que app.js pueda agregar items (compatibilidad)
window.addToCartFromCartJS = function(product) {
    console.log('➕ Agregando desde app.js:', product.name);
    
    // Solo llamar a app.js directamente
    if (window.addToCart) {
        window.addToCart(product);
    }
    
    updateCartUI();
    return true;
};

// Función de checkout
async function goToCheckout() {
    console.log('🛒 Iniciando checkout...');
    
    try {
        // Cerrar carrito
        closeCart();
        
        // Verificar si hay items
        if (window.currentCart.length === 0) {
            alert('Tu carrito está vacío');
            return;
        }
        
        // Mostrar loader
        showLoadingState();
        
        // Verificar autenticación
        const isAuthenticated = await checkAuthState();
        
        hideLoadingState();
        
        if (!isAuthenticated) {
            console.log('❌ Usuario no autenticado, redirigiendo a login');
            
            // Guardar carrito para después del login
            localStorage.setItem('pending_checkout', JSON.stringify(window.currentCart));
            localStorage.setItem('checkout_redirect', 'true');
            
            // Redirigir a login
            window.location.href = 'login.html?redirect=checkout';
            return;
        }
        
        console.log('✅ Usuario autenticado, redirigiendo a checkout');
        window.location.href = 'checkout.html';
        
    } catch (error) {
        console.error('❌ Error en checkout:', error);
        hideLoadingState();
        alert('Error al procesar la compra. Intente nuevamente.');
    }
}

async function checkAuthState() {
    return Boolean(window.hairiaSession?.getCurrentUser());
}

// Funciones UI
function showLoadingState() {
    let loader = document.getElementById('checkoutLoader');
    if (!loader) {
        loader = document.createElement('div');
        loader.id = 'checkoutLoader';
        loader.className = 'checkout-loader';
        loader.innerHTML = `
            <div class="loader-spinner"></div>
            <p>Procesando...</p>
        `;
        document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
}

function hideLoadingState() {
    const loader = document.getElementById('checkoutLoader');
    if (loader) loader.style.display = 'none';
}

function toggleCart() {
    console.log('🛒 toggleCart llamado desde cart.js');
    
    const cartSidebar = document.getElementById('cartSidebar');
    const cartOverlay = document.getElementById('cartOverlay');
    
    if (cartSidebar && cartOverlay) {
        if (cartSidebar.classList.contains('active')) {
            // Cerrar carrito
            cartSidebar.classList.remove('active');
            cartOverlay.classList.remove('active');
            document.body.style.overflow = '';
            console.log('🛒 Carrito cerrado');
        } else {
            // Abrir carrito
            cartSidebar.classList.add('active');
            cartOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            console.log('🛒 Carrito abierto');
            
            // Actualizar UI cuando se abre
            updateCartUI();
        }
    }
}

function closeCart() {
    console.log('❌ closeCart llamado desde cart.js');
    
    const cartSidebar = document.getElementById('cartSidebar');
    const cartOverlay = document.getElementById('cartOverlay');
    
    if (cartSidebar) cartSidebar.classList.remove('active');
    if (cartOverlay) cartOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 DOM cargado, inicializando carrito...');

    const bootstrapCart = () => {
        initCart();

        const cartIcon = document.getElementById('cartIcon');
        const closeCartBtn = document.getElementById('closeCart');
        const cartOverlay = document.getElementById('cartOverlay');

        if (cartIcon && !cartIcon.hasAttribute('data-listener')) {
            cartIcon.addEventListener('click', toggleCart);
            cartIcon.setAttribute('data-listener', 'true');
            console.log('✅ Evento cartIcon configurado');
        }

        if (closeCartBtn && !closeCartBtn.hasAttribute('data-listener')) {
            closeCartBtn.addEventListener('click', function() {
                closeCart();
            });
            closeCartBtn.setAttribute('data-listener', 'true');
            console.log('✅ Evento closeCartBtn configurado');
        }

        if (cartOverlay && !cartOverlay.hasAttribute('data-listener')) {
            cartOverlay.addEventListener('click', function() {
                closeCart();
            });
            cartOverlay.setAttribute('data-listener', 'true');
            console.log('✅ Evento cartOverlay configurado');
        }

        const cartItems = document.getElementById('cartItems');
        if (cartItems && !cartItems.hasAttribute('data-listener')) {
            cartItems.addEventListener('click', (event) => {
                const actionButton = event.target.closest('button[data-action][data-product-id]');
                if (!actionButton) return;

                const productId = actionButton.dataset.productId;
                if (actionButton.dataset.action === 'remove') {
                    openDeleteModal(productId);
                    return;
                }

                if (actionButton.dataset.action === 'quantity') {
                    const change = Number(actionButton.dataset.change);
                    if (Number.isFinite(change) && change !== 0) {
                        updateQuantity(productId, change);
                    }
                }
            });

            cartItems.setAttribute('data-listener', 'true');
            console.log('✅ Delegación de acciones del carrito configurada');
        }
    };

    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(bootstrapCart);
    } else {
        bootstrapCart();
    }

    // Eventos del modal de eliminación
const deleteModal = document.getElementById('deleteModal');
const closeDeleteModalBtn = document.getElementById('closeDeleteModal');
const cancelDeleteBtn = document.getElementById('cancelDelete');
const confirmDeleteBtn = document.getElementById('confirmDelete');

if (closeDeleteModalBtn && !closeDeleteModalBtn.hasAttribute('data-listener')) {
    closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
    closeDeleteModalBtn.setAttribute('data-listener', 'true');
}

if (cancelDeleteBtn && !cancelDeleteBtn.hasAttribute('data-listener')) {
    cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    cancelDeleteBtn.setAttribute('data-listener', 'true');
}

if (confirmDeleteBtn && !confirmDeleteBtn.hasAttribute('data-listener')) {
    confirmDeleteBtn.addEventListener('click', confirmDeleteProduct);
    confirmDeleteBtn.setAttribute('data-listener', 'true');
}

// Cerrar al hacer clic fuera del modal
if (deleteModal && !deleteModal.hasAttribute('data-listener')) {
    deleteModal.addEventListener('click', function(event) {
        if (event.target === deleteModal) {
            closeDeleteModal();
        }
    });

    deleteModal.setAttribute('data-listener', 'true');
}
});

// Hacer funciones globales
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;
window.toggleCart = toggleCart;
window.goToCheckout = goToCheckout;
window.closeCart = closeCart;
window.updateCartUI = updateCartUI;