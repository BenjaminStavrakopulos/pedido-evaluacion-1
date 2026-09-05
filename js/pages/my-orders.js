// my-orders.js - Visualizar y gestionar órdenes del usuario
console.log('📦 my-orders.js cargado');

function escapeOrdersHtml(value) {
    const text = value == null ? '' : String(value);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeOrdersImageUrl(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
        return escapeOrdersHtml(trimmed);
    }
    return '';
}

// Variables globales
let currentFilter = 'all';
let userOrders = [];
let userOrdersById = new Map();
let currentUser = null;
let currentCartKey = 'hairia_guest_cart';
let currentCart = [];
const CHILE_TIMEZONE = 'America/Santiago';
const clpFormatter = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOrdersPage);
} else {
    // Si el documento ya se cargó, inicializar inmediatamente
    initializeOrdersPage();
}

async function initializeOrdersPage() {
    console.log('🔄 Inicializando página de órdenes...');
    
    // Verificar autenticación
    const user = window.hairiaSession?.getCurrentUser() || null;
    
    if (!user || (!user.id && !user.uid)) {
        showNotification('Debes iniciar sesión para ver tus órdenes');
        setTimeout(() => {
            window.location.href = 'login.html?redirect=my-orders';
        }, 1500);
        return;
    }

    currentUser = user;
    currentCartKey = user?.uid ? `hairia_cart_${user.uid}` : user?.id ? `hairia_cart_${user.id}` : 'hairia_guest_cart';
    if (window.firebaseData?.loadCart && user?.uid) {
        try {
            currentCart = await window.firebaseData.loadCart(user.uid);
        } catch (error) {
            console.warn('⚠️ No se pudo cargar carrito desde Firebase:', error.message);
            currentCart = [];
        }
    } else {
        currentCart = JSON.parse(localStorage.getItem(currentCartKey)) || [];
    }

    currentCart = currentCart.map(item => ({
        ...item,
        quantity: item?.quantitySource === 'user' ? Math.max(1, Number.parseInt(item.quantity, 10) || 1) : 1,
        quantitySource: 'user'
    }));
    await saveCurrentCart(currentCart);

    // Inicializar carrito
    initCart();
    
    // Cargar órdenes del usuario
    await loadUserOrders(user.uid || user.id);

    // Setup de filtros
    setupFilters();

    // Setup del modal
    setupOrderModal();
    
    // Configurar eventos del carrito
    setupCartEvents();
}

// ========== CARRITO ==========
function initCart() {
    console.log('🛒 Inicializando carrito en my-orders...');
    updateCartCount();
}

function getCurrentCartKey() {
    return currentCartKey;
}

function getCurrentCart() {
    return currentCart;
}

async function saveCurrentCart(cart) {
    currentCart = cart;
    if (window.firebaseData?.saveCart && currentUser?.uid) {
        await window.firebaseData.saveCart(currentUser.uid, cart);
    } else {
        localStorage.setItem(getCurrentCartKey(), JSON.stringify(cart));
    }
}

function updateCartCount() {
    const cart = getCurrentCart();
    const cartCount = document.querySelector('.cart-count');
    if (cartCount) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCount.textContent = totalItems;
    }
}

function setupCartEvents() {
    const cartIcon = document.getElementById('cartIcon');
    const closeCartBtn = document.getElementById('closeCart');
    const cartOverlay = document.getElementById('cartOverlay');
    const checkoutBtn = document.getElementById('checkoutBtn');
    
    if (cartIcon) {
        cartIcon.addEventListener('click', toggleCart);
        console.log('✅ Evento cartIcon configurado');
    }
    
    if (closeCartBtn) {
        closeCartBtn.addEventListener('click', closeCart);
    }
    
    if (cartOverlay) {
        cartOverlay.addEventListener('click', closeCart);
    }

    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', goToCheckoutFromOrders);
    }
}

function goToCheckoutFromOrders() {
    const cart = getCurrentCart();
    if (!cart.length) {
        showNotification('Tu carrito está vacío');
        return;
    }
    window.location.href = 'checkout.html';
}

function toggleCart() {
    const cartSidebar = document.getElementById('cartSidebar');
    const cartOverlay = document.getElementById('cartOverlay');
    
    if (cartSidebar && cartOverlay) {
        if (cartSidebar.classList.contains('active')) {
            cartSidebar.classList.remove('active');
            cartOverlay.classList.remove('active');
            document.body.style.overflow = '';
            console.log('🛒 Carrito cerrado');
        } else {
            cartSidebar.classList.add('active');
            cartOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            console.log('🛒 Carrito abierto');
            updateCartSidebar();
        }
    }
}

function closeCart() {
    const cartSidebar = document.getElementById('cartSidebar');
    const cartOverlay = document.getElementById('cartOverlay');
    
    if (cartSidebar) cartSidebar.classList.remove('active');
    if (cartOverlay) cartOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

function updateCartSidebar() {
    const cart = getCurrentCart();
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');
    
    if (!cartItems || !cartTotal) return;
    
    if (cart.length === 0) {
        cartItems.innerHTML = '<p class="empty-cart">Tu carrito está vacío</p>';
        cartTotal.textContent = '$0';
    } else {
        cartItems.innerHTML = cart.map(item => {
            const safeItemName = escapeOrdersHtml(item.name || 'Producto');
            const safeImage = sanitizeOrdersImageUrl(item.image);
            return `
            <div class="cart-item">
                <div class="cart-item-thumb">
                    ${safeImage ? `<img src="${safeImage}" alt="${safeItemName}">` : '<span class="cart-item-thumb-placeholder">🧴</span>'}
                </div>
                <div class="cart-item-info">
                    <strong>${safeItemName}</strong>
                    <span>${formatCLP(item.price)}</span>
                </div>
                <div class="cart-item-controls">
                    <button onclick="updateCartQuantity(${item.id}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button onclick="updateCartQuantity(${item.id}, 1)">+</button>
                    <button onclick="removeFromCart(${item.id})" class="remove-btn">🗑️</button>
                </div>
                <div class="cart-item-total">${formatCLP(item.price * item.quantity)}</div>
            </div>
        `;
        }).join('');
        
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotal.textContent = formatCLP(total).replace('CLP', '').trim();
    }
}

async function updateCartQuantity(productId, change) {
    let cart = getCurrentCart();
    const item = cart.find(item => String(item.id) === String(productId));
    
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            cart = cart.filter(item => String(item.id) !== String(productId));
        }
        
        await saveCurrentCart(cart);
        updateCartSidebar();
        updateCartCount();
    }
}

async function removeFromCart(productId) {
    let cart = getCurrentCart();
    cart = cart.filter(item => String(item.id) !== String(productId));
    await saveCurrentCart(cart);
    updateCartSidebar();
    updateCartCount();
    showNotification('Producto eliminado del carrito');
}

// ========== CARGAR ÓRDENES DEL USUARIO ==========
async function loadUserOrders(userId) {
    try {
        console.log('📦 Cargando órdenes del usuario:', userId);

        if (!window.firebaseData?.loadOrders) {
            throw new Error('firebaseData.loadOrders no disponible');
        }

        // Sincronizar órdenes pendientes con Mercado Pago: marca como pagadas las que
        // MP confirme, aunque el cliente no haya esperado en la página de éxito.
        if (window.hairiaPaymentRuntime?.syncPendingOrders) {
            try {
                const syncResult = await window.hairiaPaymentRuntime.syncPendingOrders();
                if (syncResult?.synced > 0) {
                    console.log(`🔄 ${syncResult.synced} orden(es) sincronizadas como pagadas`);
                }
            } catch (syncError) {
                console.warn('⚠️ No se pudieron sincronizar las órdenes pendientes:', syncError.message);
            }
        }

        const allOrders = await window.firebaseData.loadOrders(userId);
        userOrders = allOrders.filter(order => String(order.userId) === String(userId));
        console.log('✅ Órdenes cargadas:', userOrders.length);

        // Ordenar por fecha descendente
        userOrders = userOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        userOrdersById = new Map(userOrders.map(order => [String(order.id), order]));

        // Renderizar
        displayOrders(userOrders);
    } catch (error) {
        console.error('❌ Error cargando órdenes:', error);
        userOrders = [];
        userOrdersById = new Map();
        displayOrders(userOrders);
    }
}

function displayOrders(orders) {
    const ordersContent = document.getElementById('ordersContent');
    const emptyOrders = document.getElementById('emptyOrders');

    if (orders.length === 0) {
        ordersContent.innerHTML = '';
        emptyOrders.style.display = 'flex';
        return;
    }

    emptyOrders.style.display = 'none';
    ordersContent.innerHTML = orders.map(order => createOrderCard(order)).join('');
}

function createOrderCard(order) {
    const date = new Date(order.createdAt);
    const formattedDate = date.toLocaleDateString('es-CL', {
        timeZone: CHILE_TIMEZONE,
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });

    const statusLabel = getStatusLabel(order.status);
    const statusClass = getStatusClass(order.status);

    return `
        <article class="order-card">
            <div class="order-header">
                <div class="order-info">
                    <span class="order-label">Compra</span>
                    <h3 class="order-id">#${order.id}</h3>
                    <p class="order-date">${formattedDate}</p>
                </div>
                <span class="order-status ${statusClass}">${statusLabel}</span>
            </div>

            <div class="order-footer">
                <span class="order-total">${formatCLP(order.totals.total)}</span>
                <button class="btn-details" onclick="openOrderDetail('${order.id}')">Ver detalle</button>
            </div>
        </article>
    `;
}

function getStatusLabel(status) {
    const labels = {
        pending: 'Pendiente de Pago',
        paid: 'Pagada',
        shipped: 'En camino',
        delivered: 'Entregada',
        refunded: 'Devuelta',
        cancelled: 'Cancelada'
    };
    return labels[status] || status;
}

function getStatusClass(status) {
    return `status-${status}`;
}

// ========== FILTROS ==========
function setupFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            currentFilter = this.dataset.filter;
            filterOrders();
        });
    });
}

function filterOrders() {
    if (currentFilter === 'all') {
        displayOrders(userOrders);
    } else {
        const filtered = userOrders.filter(order => order.status === currentFilter);
        displayOrders(filtered);
    }
}

// ========== MODAL DE DETALLES ==========
function setupOrderModal() {
    const modal = document.getElementById('orderModal');
    const closeBtn = document.getElementById('modalClose');

    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            modal.classList.remove('active');
        });
    }

    modal.addEventListener('click', function(e) {
        if (e.target === this || e.target.className === 'modal-overlay') {
            modal.classList.remove('active');
        }
    });
}

function openOrderDetail(orderId) {
    const order = userOrdersById.get(String(orderId));
    if (!order) return;

    const modal = document.getElementById('orderModal');
    const modalBody = document.getElementById('modalBody');

    const statusLabel = getStatusLabel(order.status);
    const statusClass = getStatusClass(order.status);
    const date = new Date(order.createdAt).toLocaleDateString('es-CL', {
        timeZone: CHILE_TIMEZONE,
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    modalBody.innerHTML = `
        <div class="order-detail">
            <h2>Detalle de Orden</h2>

            <div class="detail-section">
                <div class="detail-row">
                    <span class="detail-label">Número de Orden:</span>
                    <span class="detail-value">${order.id}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Fecha:</span>
                    <span class="detail-value">${date}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Estado:</span>
                    <span class="detail-value status ${statusClass}">${statusLabel}</span>
                </div>
            </div>

            <div class="detail-section">
                <h3>Productos</h3>
                ${order.items.map(item => `
                    <div class="detail-item">
                        <div class="item-name">${item.name}</div>
                        <div class="item-details">
                            <span>Cantidad: ${item.quantity}</span>
                            ${Number(item.originalPrice) > Number(item.price) ? `<span><del>${formatCLP(item.originalPrice)}</del> Precio unitario: ${formatCLP(item.price)}</span>` : `<span>Precio unitario: ${formatCLP(item.price)}</span>`}
                            <span class="item-subtotal">Subtotal: ${formatCLP(item.price * item.quantity)}</span>
                        </div>
                        <button class="btn-add-to-cart" data-product-id="${item.id}" data-product-name="${item.name}" data-product-price="${item.price}">
                            Agregar al carrito
                        </button>
                    </div>
                `).join('')}
                <button class="btn-add-all-to-cart" id="addAllToCartBtn">
                    Agregar todos los productos al carrito
                </button>
            </div>

            <div class="detail-section">
                <h3>Datos de Envío</h3>
                <p><strong>${order.shippingData.firstName} ${order.shippingData.lastName}</strong></p>
                <p>RUT: ${order.shippingData.rut}</p>
                <p>${order.shippingData.street}${order.shippingData.apartment ? ' ' + order.shippingData.apartment : ''}</p>
                <p>${order.shippingData.city || ''}</p>
                <p>${order.shippingData.region}</p>
                <p>Teléfono: ${order.shippingData.phone}</p>
                ${order.shippingData.notes ? `<p><strong>Notas:</strong> ${order.shippingData.notes}</p>` : ''}
            </div>

            <div class="detail-section">
                <h3>Resumen de Pago</h3>
                <div class="summary-row">
                    <span>Subtotal:</span>
                    <span>${formatCLP(order.totals.subtotal)}</span>
                </div>
                <div class="summary-row">
                    <span>Envío:</span>
                    <span>${formatCLP(order.totals.shipping)}</span>
                </div>
                <div class="summary-row total">
                    <span>Total:</span>
                    <span>${formatCLP(order.totals.total)}</span>
                </div>
            </div>

            <div class="detail-actions">
                <button class="btn-secondary" onclick="openOrderReceipt(userOrdersById.get('${order.id}'))">Ver boleta</button>
                <button class="btn-secondary" onclick="closeOrderDetail()">Cerrar</button>
            </div>
        </div>
    `;

    // Agregar listeners para los botones de agregar al carrito
    setTimeout(() => {
        // Botón para cada producto
        document.querySelectorAll('.btn-add-to-cart').forEach(btn => {
            btn.addEventListener('click', function() {
                const productId = this.getAttribute('data-product-id');
                const productName = this.getAttribute('data-product-name');
                const productPrice = parseFloat(this.getAttribute('data-product-price'));
                
                // Crear objeto producto
                const product = {
                    id: productId,
                    name: productName,
                    price: productPrice
                };
                
                // Agregar al carrito
                addToCart(product);
                showNotification(`${product.name} agregado al carrito`);
            });
        });
        
        // Botón para agregar todos los productos de la orden
        const addAllBtn = document.getElementById('addAllToCartBtn');
        if (addAllBtn) {
            addAllBtn.addEventListener('click', function() {
                order.items.forEach(item => {
                    const product = {
                        id: item.id,
                        name: item.name,
                        price: item.price
                    };
                    addToCart(product);
                });
                showNotification('Todos los productos de la orden fueron agregados al carrito');
            });
        }
    }, 100);

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeOrderDetail() {
    document.getElementById('orderModal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

// ========== FUNCIONES DEL CARRITO ==========
function addToCart(product) {
    console.log('➕ Agregando al carrito:', product.name);
    
    let cart = getCurrentCart();
    
    // Verificar si el producto ya está en el carrito
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
        existingItem.quantity += 1;
        existingItem.quantitySource = 'user';
    } else {
        cart.push({
            ...product,
            quantity: 1,
            quantitySource: 'user'
        });
    }
    
    // Guardar en localStorage
    saveCurrentCart(cart);
    
    // Actualizar UI
    updateCartCount();
    updateCartSidebar();
    
    return true;
}

// ========== FUNCIONES AUXILIARES ==========
function formatCLP(amount) {
    if (typeof amount !== 'number') {
        amount = parseFloat(amount) || 0;
    }

    return clpFormatter.format(amount);
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Agregar estilos para animaciones
if (!document.querySelector('#notification-animations')) {
    const style = document.createElement('style');
    style.id = 'notification-animations';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// ========== FUNCIONES GLOBALES ==========
window.openOrderDetail = openOrderDetail;
window.closeOrderDetail = closeOrderDetail;
window.proceedToPayment = proceedToPayment;
window.toggleCart = toggleCart;
window.closeCart = closeCart;
window.updateCartQuantity = updateCartQuantity;
window.removeFromCart = removeFromCart;
window.addToCart = addToCart;
window.formatCLP = formatCLP;

console.log('✅ my-orders.js completamente inicializado');