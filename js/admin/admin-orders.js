// admin-orders.js - Gestión de Órdenes para Admin
console.log('🔥 admin-orders.js cargado');

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM cargado');
    initializeAdminOrders();
});

let allOrders = [];
let filterDebounceTimer = null;
const FILTER_DEBOUNCE_MS = 180;
const CHILE_TIMEZONE = 'America/Santiago';
let selectedOrdersWeek = '';

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
    if (typeof value !== 'string') {
        return '';
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }

    if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) {
        return trimmed;
    }

    return '';
}

function getChileDateKey(dateInput) {
    const date = dateInput ? new Date(dateInput) : new Date();
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: CHILE_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function readOrdersFromStorage() {
    return Array.isArray(allOrders) ? allOrders : [];
}

function persistOrdersToStorage(orders) {
    allOrders = Array.isArray(orders) ? orders : [];
}

async function initializeAdminOrders() {
    console.log('🚀 Inicializando gestión de órdenes...');
    const hasAccess = await checkAdminAuth();
    if (!hasAccess) {
        return;
    }
    loadOrders();
    setupFilters();
    setupOrdersTableDelegation();
    setupOrderPageActions();
    console.log('✅ Gestión de órdenes inicializada');
}

function setupOrderPageActions() {
    const bindings = [
        { id: 'adminOrdersViewStoreBtn', handler: () => { window.location.href = '../index.html'; } },
        { id: 'adminOrdersLogoutBtn', handler: () => window.logoutUser && window.logoutUser() },
        { id: 'orderDetailsCloseBtn', handler: hideOrderDetails },
        { id: 'orderDetailsCloseActionBtn', handler: hideOrderDetails },
        { id: 'orderPrintBtn', handler: printOrder },
            { id: 'orderReceiptBtn', handler: openAdminOrderReceipt },
        { id: 'statusModalCloseBtn', handler: hideStatusModal },
        { id: 'statusModalCancelBtn', handler: hideStatusModal },
        { id: 'statusModalUpdateBtn', handler: updateOrderStatus }
    ];

    bindings.forEach(({ id, handler }) => {
        const element = document.getElementById(id);
        if (!element || element.dataset.listener === 'true') return;
        element.addEventListener('click', handler);
        element.dataset.listener = 'true';
    });

    setupModalOverlayClose();
}

function setupModalOverlayClose() {
    const modalIds = ['orderDetailsModal', 'statusModal'];

    modalIds.forEach((modalId) => {
        const modal = document.getElementById(modalId);
        if (!modal || modal.dataset.overlayListener === 'true') return;

        modal.addEventListener('click', (event) => {
            if (event.target !== modal) return;

            if (modalId === 'orderDetailsModal') {
                hideOrderDetails();
            } else {
                hideStatusModal();
            }
        });

        modal.dataset.overlayListener = 'true';
    });
}

function setupOrdersTableDelegation() {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody || tbody.dataset.delegated === 'true') {
        return;
    }

    tbody.addEventListener('click', (event) => {
        const actionButton = event.target.closest('button[data-action][data-order-id]');
        if (!actionButton) {
            return;
        }

        const orderIdEncoded = actionButton.dataset.orderId;
        const orderId = orderIdEncoded ? decodeURIComponent(orderIdEncoded) : '';
        const action = actionButton.dataset.action;

        if (!orderId || !action) {
            return;
        }

        if (action === 'view') {
            viewOrderDetails(orderId);
        } else if (action === 'status') {
            showStatusModal(orderId);
        }
    });

    tbody.dataset.delegated = 'true';
}

async function checkAdminAuth() {
    const userLS = JSON.parse(localStorage.getItem('hairia_current_user') || 'null');
    const userSS = JSON.parse(sessionStorage.getItem('hairia_current_user') || 'null');
    const user = userLS || userSS;

    if (!user || !user.uid) {
        console.warn('⚠️ No hay sesión activa, redirigiendo a login');
        window.location.href = '../login.html';
        return false;
    }

    if (!window.firebase || typeof window.firebase.isUserAdmin !== 'function') {
        console.error('❌ Verificación admin no disponible');
        showNotification('❌ No se pudo verificar permisos de administrador');
        window.location.href = '../login.html';
        return false;
    }

    try {
        const isAdmin = await window.firebase.isUserAdmin(user.uid);
        if (!isAdmin) {
            showNotification('❌ Acceso denegado: solo administradores');
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

        console.log('✅ Acceso admin verificado desde Firebase');
        return true;
    } catch (error) {
        console.warn('⚠️ No se pudo verificar admin en Firebase:', error);
        showNotification('❌ Error verificando permisos de administrador');
        window.location.href = '../login.html';
        return false;
    }
}

function openAdminOrderReceipt() {
    const orderId = document.getElementById('orderDetailsModal')?.dataset?.orderId;
    const order = allOrders.find(item => String(item.id) === String(orderId));
    if (order && typeof window.openOrderReceipt === 'function') {
        window.openOrderReceipt(order);
    }
}

// Cargar órdenes desde Firebase o localStorage
async function loadOrders() {
    console.log('📥 Cargando órdenes...');
    
    try {
        if (!window.firebaseData?.loadOrders) {
            throw new Error('firebaseData.loadOrders no disponible');
        }

        console.log('🔄 Cargando órdenes desde Firebase...');
        allOrders = await window.firebaseData.loadOrders();
        console.log('✅ Órdenes cargadas:', allOrders.length);

        allOrders = allOrders.map(enhanceOrderForList);
        
        console.log('📊 Total órdenes cargadas:', allOrders.length);
        setupOrdersWeekFilter();
        updateStats();
        displayOrders(allOrders);
        
    } catch (error) {
        console.error('❌ Error cargando órdenes:', error);
        allOrders = [];
        updateStats();
        displayOrders(allOrders);
    }
}

function getOrderTotal(order) {
    if (order.totals?.total) {
        return order.totals.total;
    }

    if (order.total) {
        return order.total;
    }

    const itemsTotal = (order.items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = order.shipping || order.totals?.shipping || 0;
    const discount = order.discount || order.totals?.discount || 0;

    return itemsTotal + shipping - discount;
}

function enhanceOrderForList(order) {
    const firstName = order.shippingData?.firstName || '';
    const lastName = order.shippingData?.lastName || '';
    const email = order.userEmail || order.shippingData?.email || '';
    const phone = order.shippingData?.phone || '';
    const searchIndex = `${order.id || ''} ${firstName} ${lastName} ${email} ${phone}`.toLowerCase();
    const sortTimestamp = order.createdAt ? new Date(order.createdAt).getTime() : 0;

    return {
        ...order,
        _searchIndex: searchIndex,
        _sortTimestamp: Number.isFinite(sortTimestamp) ? sortTimestamp : 0,
        _computedTotal: getOrderTotal(order)
    };
}

// Actualizar estadísticas
function updateStats() {
    // Excluir órdenes pendientes de las estadísticas
    const paidOrders = allOrders.filter(o => o.status !== 'pending');
    
    const total = paidOrders.length;
    const pending = 0; // Ya no mostramos pendientes
    const completed = paidOrders.filter(o => o.status === 'delivered').length;
    
    // Calcular ingresos totales (solo órdenes pagadas)
    const revenue = paidOrders
        .filter(o => o.status !== 'cancelled' && o.status !== 'refunded')
        .filter(o => !selectedOrdersWeek || getOrdersWeekStart(o.createdAt) === selectedOrdersWeek)
        .reduce((sum, o) => {
            // Intentar obtener el total de varias formas
            return sum + (o._computedTotal ?? getOrderTotal(o));
        }, 0);
    
    document.getElementById('totalOrders').textContent = total;
    document.getElementById('pendingOrders').textContent = paidOrders.filter(o => o.status === 'paid').length; // Pagadas pero no enviadas
    document.getElementById('completedOrders').textContent = completed;
    document.getElementById('totalRevenue').textContent = `$${revenue.toLocaleString('es-CL')}`;
    
    // Contar solo órdenes PAGADAS (que requieren ser enviadas)
    const needsAttention = paidOrders.filter(o => o.status === 'paid').length;
    
    // Actualizar badge en el sidebar
    updateOrdersBadge(needsAttention);
    
    // Actualizar título del navegador si hay órdenes pagadas
    if (needsAttention > 0) {
        document.title = `(${needsAttention}) Órdenes Pagadas - Monsite Admin`;
    } else {
        document.title = 'Gestión de Órdenes - Monsite Admin';
    }
}

function getOrdersWeekStart(dateInput) {
    const date = new Date(dateInput || Date.now());
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: CHILE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    const localDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
    const day = localDate.getUTCDay();
    localDate.setUTCDate(localDate.getUTCDate() - (day === 0 ? 6 : day - 1));
    return localDate.toISOString().slice(0, 10);
}

function formatOrdersWeek(weekStart) {
    const start = new Date(`${weekStart}T12:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    const format = date => date.toLocaleDateString('es-CL', { timeZone: CHILE_TIMEZONE, day: 'numeric', month: 'short' });
    return `${format(start)} - ${format(end)}`;
}

function setupOrdersWeekFilter() {
    const select = document.getElementById('ordersWeekFilter');
    if (!select) return;
    const weeks = [...new Set(allOrders.map(order => getOrdersWeekStart(order.createdAt)))];
    const currentWeek = getOrdersWeekStart();
    if (!weeks.includes(currentWeek)) weeks.push(currentWeek);
    weeks.sort().reverse();
    select.innerHTML = weeks.map(week => `<option value="${week}">${week === currentWeek ? 'Esta semana' : formatOrdersWeek(week)}</option>`).join('');
    selectedOrdersWeek = currentWeek;
    select.addEventListener('change', () => { selectedOrdersWeek = select.value; updateStats(); });
}

// Actualizar badge de notificaciones en el sidebar
function updateOrdersBadge(count) {
    // Buscar el enlace de órdenes en el sidebar
    const ordersLink = document.querySelector('a[href="admin-orders.html"]');
    if (!ordersLink) return;
    
    // Eliminar badge anterior si existe
    const existingBadge = ordersLink.querySelector('.notification-badge');
    if (existingBadge) {
        existingBadge.remove();
    }
    
    // Si hay órdenes pendientes, agregar badge
    if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'notification-badge';
        badge.textContent = count > 99 ? '99+' : count;
        ordersLink.appendChild(badge);
    }
    
    // Actualizar badge en todas las páginas admin (localStorage para compartir)
    localStorage.setItem('hairia_pending_orders_count', count.toString());
    
    // Disparar evento personalizado para actualizar en otras páginas
    window.dispatchEvent(new CustomEvent('ordersCountUpdated', { detail: { count } }));
}

// Mostrar órdenes en la tabla
function displayOrders(orders) {
    const tbody = document.getElementById('ordersTableBody');

    // Mostrar SOLO órdenes pagadas (o en proceso logístico tras el pago).
    // Las órdenes 'pending' son carritos que nunca se pagaron: no deben aparecer.
    const PAID_STATUSES = ['paid', 'shipped', 'delivered', 'refunded'];
    const displayOrders_filtered = (orders || []).filter(order => {
        const status = String(order?.status || '').toLowerCase();
        const paymentStatus = String(order?.paymentStatus || '').toLowerCase();
        return PAID_STATUSES.includes(status) || paymentStatus === 'approved';
    });

    if (displayOrders_filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: var(--admin-text-light);">
                    No hay órdenes pagadas para mostrar
                </td>
            </tr>
        `;
        return;
    }
    
    // Ordenar por fecha (más recientes primero)
    const sortedOrders = [...displayOrders_filtered].sort((a, b) => (b._sortTimestamp || 0) - (a._sortTimestamp || 0));
    
    // Agrupar órdenes por fecha
    const ordersByDate = {};
    sortedOrders.forEach(order => {
        const dateKey = getChileDateKey(order.createdAt);
        
        if (!ordersByDate[dateKey]) {
            ordersByDate[dateKey] = [];
        }
        ordersByDate[dateKey].push(order);
    });
    
    // Generar HTML con separadores de fecha
    let html = '';
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    Object.keys(ordersByDate).sort().reverse().forEach(dateKey => {
        const ordersInDay = ordersByDate[dateKey];
        const referenceDate = new Date(ordersInDay[0]?.createdAt || Date.now());
        
        // Determinar etiqueta de fecha
        let dateLabel = '';
        const todayKey = getChileDateKey(today);
        const yesterdayKey = getChileDateKey(yesterday);
        
        if (dateKey === todayKey) {
            dateLabel = '📅 HOY - ' + referenceDate.toLocaleDateString('es-CL', { timeZone: CHILE_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        } else if (dateKey === yesterdayKey) {
            dateLabel = '📅 AYER - ' + referenceDate.toLocaleDateString('es-CL', { timeZone: CHILE_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        } else {
            const daysDiff = Math.floor((today - referenceDate) / (1000 * 60 * 60 * 24));
            if (daysDiff <= 7) {
                dateLabel = '📅 ' + referenceDate.toLocaleDateString('es-CL', { timeZone: CHILE_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
            } else {
                dateLabel = '📅 ' + referenceDate.toLocaleDateString('es-CL', { timeZone: CHILE_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
            }
        }
        
        // Separador de fecha
        html += `
            <tr class="date-separator">
                <td colspan="8" style="background: linear-gradient(135deg, var(--admin-accent) 0%, #8b5cf6 100%); color: white; padding: 0.75rem 1rem; font-weight: bold; font-size: 14px; text-align: left; border-top: 3px solid var(--admin-accent); border-bottom: 3px solid var(--admin-accent);">
                    ${dateLabel} <span style="margin-left: 1rem; opacity: 0.9;">(${ordersInDay.length} orden${ordersInDay.length !== 1 ? 'es' : ''})</span>
                </td>
            </tr>
        `;
        
        // Órdenes del día
        ordersInDay.forEach(order => {
            // Calcular total si no existe
            const orderTotal = order._computedTotal ?? getOrderTotal(order);
            const safeOrderId = escapeAttr(order.id || '');
            const encodedOrderId = encodeURIComponent(order.id || '');
            const safeFirstName = escapeHtml(order.shippingData?.firstName || '');
            const safeLastName = escapeHtml(order.shippingData?.lastName || '');
            const safeEmail = escapeHtml(order.userEmail || order.shippingData?.email || 'Sin email');
            const safePhone = escapeHtml(order.shippingData?.phone || 'N/A');
            
            html += `
            <tr>
                <td><strong>#${safeOrderId}</strong></td>
                <td>
                    <div class="order-customer-name" title="${escapeAttr(`${safeFirstName} ${safeLastName}`.trim())}"><strong>${safeFirstName} ${safeLastName}</strong></div>
                    <div class="order-customer-email" title="${escapeAttr(safeEmail)}">${safeEmail}</div>
                </td>
                <td><span class="order-phone" title="${escapeAttr(safePhone)}">${safePhone}</span></td>
                <td>${order.items?.length || 0} producto(s)</td>
                <td><strong>$${orderTotal.toLocaleString('es-CL')}</strong></td>
                <td>${getStatusBadge(order.status)}</td>
                <td>${formatTime(order.createdAt)}</td>
                <td>
                    <button class="btn-icon" title="Ver detalles" data-action="view" data-order-id="${encodedOrderId}">👁️</button>
                    <button class="btn-icon" title="Cambiar estado" data-action="status" data-order-id="${encodedOrderId}">🔄</button>
                </td>
            </tr>
            `;
        });
    });
    
    tbody.innerHTML = html;
}

// Formatear solo la hora (para órdenes del mismo día)
function formatTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-CL', {
        timeZone: CHILE_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Badge de estado con colores
function getStatusBadge(status) {
    const base = 'display: inline-block; white-space: nowrap; color: white; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85em;';
    const badges = {
        'paid': `<span style="${base} background: #3b82f6;">💳 Pagada</span>`,
        'shipped': `<span style="${base} background: #8b5cf6;">🚚 Enviada</span>`,
        'delivered': `<span style="${base} background: #10b981;">✅ Entregada</span>`,
        'cancelled': `<span style="${base} background: #ef4444;">❌ Cancelada</span>`,
        'refunded': `<span style="${base} background: #6b7280;">💸 Devuelta</span>`
    };
    // Por defecto mostrar "Pagada" (nunca "Pendiente", esas ya no se listan)
    return badges[status] || badges['paid'];
}

// Formatear fecha
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CL', {
        timeZone: CHILE_TIMEZONE,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Ver detalles de orden
function viewOrderDetails(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;

    const safeOrderId = escapeAttr(order.id || '');
    const encodedOrderId = encodeURIComponent(order.id || '');
    const safeFirstName = escapeHtml(order.shippingData?.firstName || '');
    const safeLastName = escapeHtml(order.shippingData?.lastName || '');
    const safeRut = escapeHtml(order.shippingData?.rut || 'No proporcionado');
    const safeEmail = escapeHtml(order.userEmail || order.shippingData?.email || 'No proporcionado');
    const safePhone = escapeHtml(order.shippingData?.phone || 'No proporcionado');
    const safeStreet = escapeHtml(order.shippingData?.street || 'Calle no proporcionada');
    const safeApartment = escapeHtml(order.shippingData?.apartment || '');
    const safeCity = escapeHtml(order.shippingData?.city || 'Comuna no proporcionada');
    const safeRegion = escapeHtml(order.shippingData?.region || 'Región no proporcionada');
    const safeNotes = escapeHtml(order.shippingData?.notes || '');
    
    // Calcular total si no existe
    let orderTotal = 0;
    let orderSubtotal = 0;
    let orderShipping = 0;
    let orderDiscount = 0;
    
    if (order.totals) {
        orderTotal = order.totals.total || 0;
        orderSubtotal = order.totals.subtotal || 0;
        orderShipping = order.totals.shipping || 0;
        orderDiscount = order.totals.discount || 0;
    } else {
        // Calcular manualmente desde los items
        orderSubtotal = (order.items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
        orderShipping = order.shipping || 0;
        orderDiscount = order.discount || 0;
        orderTotal = orderSubtotal + orderShipping - orderDiscount;
    }
    
    const modal = document.getElementById('orderDetailsModal');
    const content = document.getElementById('orderDetailsContent');

    if (modal) {
        modal.dataset.orderId = order.id || '';
    }

    const currentOrderInput = document.getElementById('currentOrderId');
    if (currentOrderInput) {
        currentOrderInput.value = order.id || '';
    }
    
    content.innerHTML = `
        <div style="display: grid; gap: 2rem;">
            <!-- Información de la Orden -->
            <div>
                <h4 style="margin-bottom: 1rem; border-bottom: 2px solid var(--admin-border); padding-bottom: 0.5rem;">
                    📋 Información de la Orden
                </h4>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                    <div>
                        <strong>Número de Orden:</strong><br>
                        #${safeOrderId}
                    </div>
                    <div>
                        <strong>Estado:</strong><br>
                        ${getStatusBadge(order.status)}
                    </div>
                    <div>
                        <strong>Fecha:</strong><br>
                        ${formatDate(order.createdAt)}
                    </div>
                    <div>
                        <strong>Total:</strong><br>
                        <span style="font-size: 1.25em; color: var(--admin-accent);">$${orderTotal.toLocaleString('es-CL')}</span>
                    </div>
                </div>
            </div>

            <!-- Datos del Cliente -->
            <div>
                <h4 style="margin-bottom: 1rem; border-bottom: 2px solid var(--admin-border); padding-bottom: 0.5rem;">
                    👤 Datos del Cliente
                </h4>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;">
                    <div>
                        <strong>Nombre Completo:</strong><br>
                        ${safeFirstName} ${safeLastName}
                    </div>
                    <div>
                        <strong>RUT:</strong><br>
                        ${safeRut}
                    </div>
                    <div>
                        <strong>Email:</strong><br>
                        ${safeEmail}
                    </div>
                    <div>
                        <strong>Teléfono:</strong><br>
                        ${safePhone}
                    </div>
                </div>
            </div>

            <!-- Dirección de Envío -->
            <div>
                <h4 style="margin-bottom: 1rem; border-bottom: 2px solid var(--admin-border); padding-bottom: 0.5rem;">
                    📍 Dirección de Envío
                </h4>
                <div style="background: var(--admin-bg); padding: 1rem; border-radius: 8px;">
                    <p><strong>${safeStreet}${safeApartment ? ', ' + safeApartment : ''}</strong></p>
                    <p>${safeCity}, ${safeRegion}</p>
                    ${safeNotes ? `<p style="margin-top: 0.5rem; color: var(--admin-text-light);">Notas: ${safeNotes}</p>` : ''}
                </div>
            </div>

            <!-- Productos -->
            <div>
                <h4 style="margin-bottom: 1rem; border-bottom: 2px solid var(--admin-border); padding-bottom: 0.5rem;">
                    🛍️ Productos (${order.items?.length || 0})
                </h4>
                <div style="display: grid; gap: 0.75rem;">
                    ${(order.items || []).map(item => {
                        const safeItemName = escapeHtml(item.name || 'Producto');
                        const safeItemSku = escapeHtml(item.sku || 'N/A');
                        const safeItemImage = sanitizeImageUrl(item.image);
                        const itemQuantity = Number(item.quantity) || 0;
                        const itemPrice = Number(item.price) || 0;
                        return `
                        <div style="display: flex; gap: 1rem; background: var(--admin-bg); padding: 1rem; border-radius: 8px; align-items: center;">
                            ${safeItemImage ? `<img src="${safeItemImage}" alt="${safeItemName}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">` : '<div style="width: 60px; height: 60px; background: var(--admin-border); border-radius: 8px; display: flex; align-items: center; justify-content: center;">📦</div>'}
                            <div style="flex: 1;">
                                <strong>${safeItemName}</strong><br>
                                <small style="color: var(--admin-text-light);">SKU: ${safeItemSku}</small>
                            </div>
                            <div style="text-align: right;">
                                <div>Cantidad: <strong>${itemQuantity}</strong></div>
                                <div>$${itemPrice.toLocaleString('es-CL')} c/u</div>
                                <div style="color: var(--admin-accent); font-weight: bold;">Total: $${(itemPrice * itemQuantity).toLocaleString('es-CL')}</div>
                            </div>
                        </div>
                    `;
                    }).join('')}
                </div>
            </div>

            <!-- Resumen de Pago -->
            <div>
                <h4 style="margin-bottom: 1rem; border-bottom: 2px solid var(--admin-border); padding-bottom: 0.5rem;">
                    💰 Resumen de Pago
                </h4>
                <div style="background: var(--admin-bg); padding: 1rem; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span>Subtotal:</span>
                        <strong>$${orderSubtotal.toLocaleString('es-CL')}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span>Envío:</span>
                        <strong>$${orderShipping.toLocaleString('es-CL')}</strong>
                    </div>
                    ${orderDiscount > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; color: #10b981;">
                        <span>Descuento:</span>
                        <strong>-$${orderDiscount.toLocaleString('es-CL')}</strong>
                    </div>` : ''}
                    <div style="display: flex; justify-content: space-between; padding-top: 0.5rem; border-top: 1px solid var(--admin-border); font-size: 1.25em;">
                        <span><strong>Total:</strong></span>
                        <strong style="color: var(--admin-accent);">$${orderTotal.toLocaleString('es-CL')}</strong>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
}

// Función auxiliar para imprimir por ID
function printOrderById(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (order) {
        generateShippingLabel(order);
    }
}

function hideOrderDetails() {
    const modal = document.getElementById('orderDetailsModal');
    if (!modal) return;

    modal.classList.remove('active');
    delete modal.dataset.orderId;
}

// Modal de cambio de estado
function showStatusModal(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;
    
    document.getElementById('currentOrderId').value = orderId;
    document.getElementById('newOrderStatus').value = order.status;
    document.getElementById('statusNote').value = '';
    
    document.getElementById('statusModal').classList.add('active');
}

function hideStatusModal() {
    document.getElementById('statusModal').classList.remove('active');
}

// Actualizar estado de orden
async function updateOrderStatus() {
    const orderId = document.getElementById('currentOrderId').value;
    const newStatus = document.getElementById('newOrderStatus').value;
    const note = document.getElementById('statusNote').value;
    
    console.log('🔄 Actualizando estado de orden:', orderId, 'a', newStatus);
    
    try {
        // Actualizar en memoria primero (source of truth en esta vista)
        const orderIndex = allOrders.findIndex(o => o.id === orderId);
        
        if (orderIndex === -1) {
            showNotification('❌ Orden no encontrada');
            return;
        }
        
        // Actualizar datos de la orden
        allOrders[orderIndex].status = newStatus;
        allOrders[orderIndex].updatedAt = new Date().toISOString();
        allOrders[orderIndex].statusHistory = allOrders[orderIndex].statusHistory || [];
        allOrders[orderIndex].statusHistory.push({
            status: newStatus,
            note: note,
            date: new Date().toISOString(),
            updatedBy: 'admin'
        });
        
        // Sincronizar en Firebase
        if (window.firebaseData?.updateOrderStatus) {
            await window.firebaseData.updateOrderStatus(orderId, newStatus);
            console.log('✅ Estado actualizado en Firebase');
        }
        
        // Recargar órdenes y cerrar modal
        await loadOrders();
        hideStatusModal();
        showNotification(`✅ Estado actualizado a: ${getStatusText(newStatus)}`);
        
    } catch (error) {
        console.error('❌ Error actualizando estado:', error);
        showNotification('❌ Error al actualizar el estado');
    }
}

// Imprimir orden
function printOrder() {
    const orderDetailsModal = document.getElementById('orderDetailsModal');
    const orderId = orderDetailsModal?.dataset?.orderId ||
                    document.getElementById('currentOrderId')?.value;
    
    if (!orderId) {
        // Si no hay orden específica, buscar desde el modal de detalles
        const orderNumber = document.querySelector('#orderDetailsContent strong')?.textContent;
        if (orderNumber) {
            const cleanId = orderNumber.replace('#', '');
            const order = allOrders.find(o => o.id === cleanId);
            if (order) {
                generateShippingLabel(order);
                return;
            }
        }
        showNotification('❌ No se pudo identificar la orden');
        return;
    }
    
    const order = allOrders.find(o => o.id === orderId);
    if (!order) {
        showNotification('❌ Orden no encontrada');
        return;
    }
    
    generateShippingLabel(order);
}

// Generar etiqueta de envío
function generateShippingLabel(order) {
    // Calcular total
    let orderTotal = 0;
    if (order.totals?.total) {
        orderTotal = order.totals.total;
    } else if (order.total) {
        orderTotal = order.total;
    } else {
        const itemsTotal = (order.items || []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const shipping = order.shipping || order.totals?.shipping || 0;
        const discount = order.discount || order.totals?.discount || 0;
        orderTotal = itemsTotal + shipping - discount;
    }
    
    // Cargar el logo como base64
    const logoUrl = new URL('../images/logo.jpg', window.location.href).href;
    fetch(logoUrl)
        .then(response => response.blob())
        .then(blob => {
            const reader = new FileReader();
            reader.onloadend = function() {
                const logoBase64 = reader.result;
                generateLabelHTML(order, orderTotal, logoBase64);
            };
            reader.readAsDataURL(blob);
        })
        .catch(() => {
            // Si falla cargar la imagen, generar sin logo
            generateLabelHTML(order, orderTotal, null);
        });
    
    function generateLabelHTML(order, orderTotal, logoBase64) {
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            showNotification('❌ No se pudo abrir la ventana de impresión');
            return;
        }

        const safeOrderId = escapeHtml(String(order.id || 'N/A'));
        const safeOrderIdShort = escapeHtml(String(order.id || 'N/A').substring(0, 12));
        const safeFirstName = escapeHtml(String(order.shippingData?.firstName || 'CLIENTE'));
        const safeLastName = escapeHtml(String(order.shippingData?.lastName || ''));
        const safeStreet = escapeHtml(String(order.shippingData?.street || 'Dirección'));
        const safeApartment = escapeHtml(String(order.shippingData?.apartment || ''));
        const safeRut = escapeHtml(String(formatRut(order.shippingData?.rut)));
        const safePhone = escapeHtml(String(order.shippingData?.phone || 'N/A'));
        const safeCity = escapeHtml(String(order.shippingData?.city || 'Ciudad'));
        const safeRegion = escapeHtml(String(order.shippingData?.region || 'Región'));
        const safeStatusText = escapeHtml(String(getStatusText(order.status)));
        const safeLogo = typeof logoBase64 === 'string' && /^data:image\//i.test(logoBase64) ? logoBase64 : '';

        const safeItems = (order.items || []).map(item => ({
            quantity: Number(item.quantity) || 0,
            name: escapeHtml(String(item.name || 'Producto'))
        }));
        
        const labelHTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Etiqueta de Envío - ${safeOrderId}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        html, body {
            width: 100%;
            height: 100%;
        }
        
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: white;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            margin: 0;
        }
        
        .shipping-label {
            /* Tamaño de etiqueta compacta: 80x120mm */
            width: 80mm;
            height: 120mm;
            border: 2px solid #000;
            padding: 4mm;
            background: white;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
            font-size: 10px;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 4mm;
            padding-bottom: 3mm;
            border-bottom: 2px solid #000;
            gap: 3mm;
        }
        
        .logo {
            width: 18mm;
            height: auto;
            max-height: 16mm;
            flex-shrink: 0;
        }
        
        .header-right {
            text-align: right;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 2mm;
        }
        
        .delivery-date {
            font-size: 9px;
        }
        
        .delivery-date .label {
            display: block;
            font-size: 7px;
            color: #666;
        }
        
        .delivery-date .value {
            font-size: 12px;
            font-weight: bold;
        }
        
        .order-id {
            font-weight: bold;
        }
        
        .order-id .label {
            font-size: 7px;
            display: block;
            color: #666;
        }
        
        .order-id .value {
            border: 1px solid #000;
            padding: 1mm 2mm;
            display: inline-block;
            font-size: 8px;
            font-family: 'Courier New', monospace;
            font-weight: bold;
        }
        
        .from-section {
            font-size: 8px;
            margin-bottom: 3mm;
            padding: 2mm 3mm;
            border: 1px solid #999;
            background: #f8f8f8;
            line-height: 1.2;
        }
        
        .from-title {
            font-weight: bold;
            font-size: 7px;
            text-transform: uppercase;
            margin-bottom: 1mm;
        }
        
        .recipient-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            margin-bottom: 3mm;
            min-height: 0;
        }
        
        .recipient-title {
            font-weight: bold;
            font-size: 7px;
            text-transform: uppercase;
            margin-bottom: 1mm;
        }
        
        .recipient-box {
            border: 1px solid #000;
            padding: 3mm;
            background: white;
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
        }
        
        .recipient-name {
            font-size: 11px;
            font-weight: bold;
            margin-bottom: 2mm;
            line-height: 1.1;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .recipient-address {
            font-size: 8px;
            line-height: 1.2;
            overflow: hidden;
        }
        
        .recipient-city {
            font-size: 8px;
            font-weight: bold;
            border-top: 1px solid #ddd;
            padding-top: 1mm;
            margin-top: 1mm;
        }
        
        .contents {
            font-size: 7px;
            line-height: 1.2;
            padding: 2mm;
            border: 1px solid #999;
            background: #fafafa;
            margin-bottom: 3mm;
            max-height: 18mm;
            overflow-y: auto;
        }
        
        .contents-title {
            font-weight: bold;
            font-size: 7px;
            text-transform: uppercase;
            margin-bottom: 1mm;
        }
        
        .contents-item {
            margin-bottom: 0.5mm;
        }
        
        .tracking-box {
            text-align: center;
            border: 2px dashed #000;
            padding: 3mm 2mm;
            margin-bottom: 2mm;
            flex-shrink: 0;
        }
        
        .tracking-label {
            font-size: 7px;
            font-weight: bold;
            text-transform: uppercase;
            margin-bottom: 1mm;
        }
        
        .tracking-code {
            font-size: 13px;
            font-weight: bold;
            letter-spacing: 0.5px;
            font-family: 'Courier New', monospace;
            margin-bottom: 1mm;
            word-break: break-all;
        }
        
        .tracking-status {
            font-size: 7px;
            font-weight: bold;
        }
        
        .footer {
            text-align: center;
            font-size: 6px;
            color: #666;
            border-top: 1px solid #999;
            padding-top: 1mm;
        }
        
        @media print {
            body {
                padding: 0;
                margin: 0;
                background: white;
            }
            
            .shipping-label {
                box-shadow: none;
                page-break-after: always;
            }
            
            @page {
                size: 100mm 150mm;
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <div class="shipping-label">
        <!-- Header con Logo y Fecha -->
        <div class="header">
            ${safeLogo ? `<img src="${safeLogo}" alt="Monsite Logo" class="logo">` : '<div style="width: 18mm; font-weight: bold;">MONSITE</div>'}
            <div class="header-right">
                <div class="delivery-date">
                    <span class="label">ENTREGA:</span>
                    <span class="value">${new Date().toLocaleDateString('es-CL', { timeZone: CHILE_TIMEZONE, day: '2-digit', month: 'short' }).toUpperCase()}</span>
                </div>
                <div class="order-id">
                    <span class="label">ORDEN:</span>
                    <div class="value">${safeOrderIdShort}</div>
                </div>
            </div>
        </div>
        
        <!-- Remitente -->
        <div class="from-section">
            <div class="from-title">De:</div>
            <div><strong>Monsite</strong></div>
            <div>Belleza & Cuidado Capilar</div>
            <div>Padre Leon Dehon 6190</div>
            <div>Las Condes, RM</div>
        </div>
        
        <!-- Destinatario -->
        <div class="recipient-section">
            <div class="recipient-title">Para:</div>
            <div class="recipient-box">
                <div>
                    <div class="recipient-name">
                        ${safeFirstName} ${safeLastName}
                    </div>
                    <div class="recipient-address">
                        ${safeStreet}${safeApartment ? ' ' + safeApartment : ''}
                    </div>
                    <div class="recipient-address">
                        RUT: ${safeRut}
                    </div>
                    <div class="recipient-address">
                        Cel: ${safePhone}
                    </div>
                </div>
                <div class="recipient-city">
                    ${safeCity}, ${safeRegion}
                </div>
            </div>
        </div>
        
        <!-- Contenido -->
        <div class="contents">
            <div class="contents-title">📦 Contiene:</div>
            ${safeItems.map(item => `
                <div class="contents-item">• ${item.quantity}x ${item.name}</div>
            `).join('')}
        </div>
        
        <!-- Código de Seguimiento -->
        <div class="tracking-box">
            <div class="tracking-label">Rastrear:</div>
            <div class="tracking-code">${safeOrderId}</div>
            <div class="tracking-status">${safeStatusText}</div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <p>Impreso: ${new Date().toLocaleDateString('es-CL', { timeZone: CHILE_TIMEZONE })}</p>
        </div>
    </div>
    
    <script>
        window.onload = function() {
            setTimeout(() => window.print(), 300);
        };
        
        window.onafterprint = function() {
            window.close();
        };
    </script>
</body>
</html>
        `;
        
        printWindow.document.write(labelHTML);
        printWindow.document.close();
    }
}

// Obtener texto del estado
function getStatusText(status) {
    const statusTexts = {
        'paid': 'Pagada (por enviar)',
        'shipped': 'En Tránsito',
        'delivered': 'Entregada',
        'cancelled': 'Cancelada',
        'refunded': 'Devuelta'
    };
    return statusTexts[status] || 'Pagada';
}

// Formatear RUT chileno (00.000.000-0)
function formatRut(rut) {
    if (!rut) return 'N/A';
    const clean = String(rut).replace(/[^0-9kK]/g, '');
    if (clean.length < 2) return String(rut);
    const body = clean.slice(0, -1);
    const dv = clean.slice(-1).toUpperCase();
    const reversed = body.split('').reverse();
    const chunks = [];
    for (let i = 0; i < reversed.length; i += 3) {
        chunks.push(reversed.slice(i, i + 3).reverse().join(''));
    }
    const bodyFormatted = chunks.reverse().join('.');
    return `${bodyFormatted}-${dv}`;
}

// Configurar filtros
function setupFilters() {
    const searchInput = document.getElementById('searchOrders');
    const statusFilter = document.getElementById('filterStatus');
    
    if (searchInput) {
        searchInput.addEventListener('input', scheduleApplyFilters);
    }
    
    if (statusFilter) {
        statusFilter.addEventListener('change', applyFilters);
    }
}

function scheduleApplyFilters() {
    if (filterDebounceTimer) {
        clearTimeout(filterDebounceTimer);
    }

    filterDebounceTimer = setTimeout(() => {
        applyFilters();
    }, FILTER_DEBOUNCE_MS);
}

// Aplicar filtros
// Aplicar filtros
function applyFilters() {
    const searchTerm = document.getElementById('searchOrders').value.toLowerCase().trim();
    const statusFilter = document.getElementById('filterStatus').value;

    // Mostrar SOLO órdenes pagadas o en proceso logístico tras el pago
    const PAID_STATUSES = ['paid', 'shipped', 'delivered', 'refunded'];
    let filtered = allOrders.filter(o => {
        const status = String(o?.status || '').toLowerCase();
        const paymentStatus = String(o?.paymentStatus || '').toLowerCase();
        return PAID_STATUSES.includes(status) || paymentStatus === 'approved';
    });
    
    // Filtrar por búsqueda
    if (searchTerm) {
        filtered = filtered.filter(order => {
            const index = order._searchIndex || '';
            return index.includes(searchTerm);
        });
    }
    
    // Filtrar por estado
    if (statusFilter !== 'all') {
        filtered = filtered.filter(order => order.status === statusFilter);
    }
    
    displayOrders(filtered);
}

// Notificación
function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        z-index: 3000;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        font-weight: 500;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Exponer funciones globalmente
window.viewOrderDetails = viewOrderDetails;
window.hideOrderDetails = hideOrderDetails;
window.showStatusModal = showStatusModal;
window.hideStatusModal = hideStatusModal;
window.updateOrderStatus = updateOrderStatus;
window.printOrder = printOrder;
window.printOrderById = printOrderById;

console.log('✅ admin-orders.js listo');

// Actualizar badge en otras páginas admin cuando cambien las órdenes
if (typeof window !== 'undefined') {
    // Cargar contador desde localStorage al iniciar
    const savedCount = localStorage.getItem('hairia_pending_orders_count');
    if (savedCount && parseInt(savedCount) > 0) {
        updateOrdersBadge(parseInt(savedCount));
    }
}
