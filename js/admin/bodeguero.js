document.addEventListener('DOMContentLoaded', function() {
    initializeWarehouseView();
});

let warehouseOrders = [];
let warehouseFilterTimer = null;
let warehouseItemsFilterTimer = null;
const WAREHOUSE_FILTER_MS = 180;
const ALLOWED_ROLE = new Set(['bodeguero', 'admin']);
const BODEGA_VIEW_UID = 'yFNJUJUJiaXbOiHLGGPsIJWShbC2';
const BODEGA_VIEW_EMAIL = 'bodegamonsite@gmail.com';
const CHILE_TIMEZONE = 'America/Santiago';
let pendingPrintOrderId = '';
let activeWarehouseView = 'orders';

function escapeHtml(value) {
    const text = value == null ? '' : String(value);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
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

function readSessionUser() {
    const userLS = JSON.parse(localStorage.getItem('hairia_current_user') || 'null');
    const userSS = JSON.parse(sessionStorage.getItem('hairia_current_user') || 'null');
    return userLS || userSS;
}

async function initializeWarehouseView() {
    const access = await checkWarehouseAccess();
    if (!access) {
        return;
    }

    setupWarehouseActions();
    await loadWarehouseOrders();
}

async function checkWarehouseAccess() {
    const currentUser = readSessionUser();
    if (!currentUser || !currentUser.uid) {
        window.location.href = '../login.html';
        return false;
    }

    if (!window.firebase || typeof window.firebase.getUserRole !== 'function') {
        showWarehouseNotification('No se pudo validar el acceso', true);
        window.location.href = '../login.html';
        return false;
    }

    try {
        const role = await window.firebase.getUserRole(currentUser.uid);
        const byIdentity = currentUser.uid === BODEGA_VIEW_UID
            || String(currentUser.email || '').toLowerCase() === BODEGA_VIEW_EMAIL;

        if (!ALLOWED_ROLE.has(role) && !byIdentity) {
            showWarehouseNotification('Acceso denegado para esta cuenta', true);
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 1200);
            return false;
        }

        const effectiveRole = ALLOWED_ROLE.has(role) ? role : 'bodeguero';

        if (currentUser.role !== effectiveRole) {
            const nextSession = {
                ...currentUser,
                role: effectiveRole
            };
            sessionStorage.setItem('hairia_current_user', JSON.stringify(nextSession));
            localStorage.removeItem('hairia_current_user');
        }

        return true;
    } catch (error) {
        console.warn('Error validando rol de bodega:', error);
        window.location.href = '../login.html';
        return false;
    }
}

function setupWarehouseActions() {
    const logoutBtn = document.getElementById('warehouseLogoutBtn');
    if (logoutBtn && logoutBtn.dataset.listener !== 'true') {
        logoutBtn.addEventListener('click', () => {
            if (typeof window.logoutUser === 'function') {
                window.logoutUser();
                return;
            }

            localStorage.removeItem('hairia_current_user');
            sessionStorage.removeItem('hairia_current_user');
            window.location.href = '../index.html';
        });
        logoutBtn.dataset.listener = 'true';
    }

    const reloadBtn = document.getElementById('warehouseReloadBtn');
    if (reloadBtn && reloadBtn.dataset.listener !== 'true') {
        reloadBtn.addEventListener('click', () => {
            loadWarehouseOrders();
        });
        reloadBtn.dataset.listener = 'true';
    }

    document.querySelectorAll('.admin-nav [data-view]').forEach((viewLink) => {
        if (viewLink.dataset.listener === 'true') return;
        viewLink.addEventListener('click', (event) => {
            event.preventDefault();
            setWarehouseView(viewLink.dataset.view);
        });
        viewLink.dataset.listener = 'true';
    });

    const searchInput = document.getElementById('warehouseSearch');
    if (searchInput && searchInput.dataset.listener !== 'true') {
        searchInput.addEventListener('input', () => {
            if (warehouseFilterTimer) {
                clearTimeout(warehouseFilterTimer);
            }

            warehouseFilterTimer = setTimeout(() => {
                applyWarehouseFilters();
            }, WAREHOUSE_FILTER_MS);
        });
        searchInput.dataset.listener = 'true';
    }

    const statusFilter = document.getElementById('warehouseStatusFilter');
    if (statusFilter && statusFilter.dataset.listener !== 'true') {
        statusFilter.addEventListener('change', applyWarehouseFilters);
        statusFilter.dataset.listener = 'true';
    }

    const itemsSearchInput = document.getElementById('warehouseItemsSearch');
    if (itemsSearchInput && itemsSearchInput.dataset.listener !== 'true') {
        itemsSearchInput.addEventListener('input', () => {
            if (warehouseItemsFilterTimer) {
                clearTimeout(warehouseItemsFilterTimer);
            }

            warehouseItemsFilterTimer = setTimeout(() => {
                applyWarehouseItemsFilters();
            }, WAREHOUSE_FILTER_MS);
        });
        itemsSearchInput.dataset.listener = 'true';
    }

    const tableBody = document.getElementById('warehouseOrdersBody');
    if (tableBody && tableBody.dataset.listener !== 'true') {
        tableBody.addEventListener('click', handleWarehouseTableClick);
        tableBody.dataset.listener = 'true';
    }

    const itemsBody = document.getElementById('warehouseItemsBody');
    if (itemsBody && itemsBody.dataset.listener !== 'true') {
        itemsBody.addEventListener('click', handleWarehouseItemsTableClick);
        itemsBody.dataset.listener = 'true';
    }

    const closeModalBtn = document.getElementById('warehouseOrderDetailsCloseBtn');
    if (closeModalBtn && closeModalBtn.dataset.listener !== 'true') {
        closeModalBtn.addEventListener('click', hideOrderDetailsModal);
        closeModalBtn.dataset.listener = 'true';
    }

    const closeModalActionBtn = document.getElementById('warehouseOrderDetailsCloseActionBtn');
    if (closeModalActionBtn && closeModalActionBtn.dataset.listener !== 'true') {
        closeModalActionBtn.addEventListener('click', hideOrderDetailsModal);
        closeModalActionBtn.dataset.listener = 'true';
    }

    const printModalBtn = document.getElementById('warehouseOrderPrintBtn');
    if (printModalBtn && printModalBtn.dataset.listener !== 'true') {
        printModalBtn.addEventListener('click', printOrderFromModal);
        printModalBtn.dataset.listener = 'true';
    }

    const detailsModal = document.getElementById('warehouseOrderDetailsModal');
    if (detailsModal && detailsModal.dataset.listener !== 'true') {
        detailsModal.addEventListener('click', (event) => {
            if (event.target === detailsModal) {
                hideOrderDetailsModal();
            }
        });
        detailsModal.dataset.listener = 'true';
    }

    const previewModal = document.getElementById('warehousePrintPreviewModal');
    if (previewModal && previewModal.dataset.listener !== 'true') {
        previewModal.addEventListener('click', (event) => {
            if (event.target === previewModal) {
                closePrintPreview();
            }
        });
        previewModal.dataset.listener = 'true';
    }

    const previewCloseBtn = document.getElementById('warehousePrintPreviewCloseBtn');
    if (previewCloseBtn && previewCloseBtn.dataset.listener !== 'true') {
        previewCloseBtn.addEventListener('click', closePrintPreview);
        previewCloseBtn.dataset.listener = 'true';
    }

    const previewCancelBtn = document.getElementById('warehousePrintPreviewCancelBtn');
    if (previewCancelBtn && previewCancelBtn.dataset.listener !== 'true') {
        previewCancelBtn.addEventListener('click', closePrintPreview);
        previewCancelBtn.dataset.listener = 'true';
    }

    const previewConfirmBtn = document.getElementById('warehousePrintPreviewConfirmBtn');
    if (previewConfirmBtn && previewConfirmBtn.dataset.listener !== 'true') {
        previewConfirmBtn.addEventListener('click', confirmPrintFromPreview);
        previewConfirmBtn.dataset.listener = 'true';
    }

    setWarehouseView('orders');
}

function setWarehouseView(view) {
    const nextView = view === 'items' ? 'items' : 'orders';
    activeWarehouseView = nextView;

    const ordersBtn = document.getElementById('warehouseNavOrders');
    const itemsBtn = document.getElementById('warehouseNavItems');
    const ordersPanel = document.getElementById('warehouseOrdersView');
    const itemsPanel = document.getElementById('warehouseItemsView');

    if (ordersBtn) {
        const isActive = nextView === 'orders';
        ordersBtn.classList.toggle('active', isActive);
        ordersBtn.setAttribute('aria-current', isActive ? 'page' : 'false');
    }

    if (itemsBtn) {
        const isActive = nextView === 'items';
        itemsBtn.classList.toggle('active', isActive);
        itemsBtn.setAttribute('aria-current', isActive ? 'page' : 'false');
    }

    if (ordersPanel) {
        ordersPanel.classList.toggle('active', nextView === 'orders');
    }

    if (itemsPanel) {
        itemsPanel.classList.toggle('active', nextView === 'items');
    }
}

async function loadWarehouseOrders() {
    const tableBody = document.getElementById('warehouseOrdersBody');
    const itemsBody = document.getElementById('warehouseItemsBody');
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="7" class="table-loading-cell">Cargando pedidos...</td></tr>';
    }
    if (itemsBody) {
        itemsBody.innerHTML = '<tr><td colspan="6" class="table-loading-cell">Cargando productos...</td></tr>';
    }

    try {
        if (!window.firebaseData?.loadOrders) {
            throw new Error('firebaseData.loadOrders no disponible');
        }

        const allOrders = await window.firebaseData.loadOrders();
        warehouseOrders = (Array.isArray(allOrders) ? allOrders : [])
            .filter((order) => ['paid', 'shipped', 'delivered', 'refunded'].includes(String(order.status || '').toLowerCase()))
            .sort((a, b) => {
                const aTime = new Date(a.createdAt || 0).getTime();
                const bTime = new Date(b.createdAt || 0).getTime();
                return bTime - aTime;
            });

        renderWarehouseStats(warehouseOrders);
        applyWarehouseFilters();
        applyWarehouseItemsFilters();
    } catch (error) {
        console.error('Error cargando pedidos de bodega:', error);
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="7" class="table-loading-cell">No se pudieron cargar los pedidos</td></tr>';
        }
        if (itemsBody) {
            itemsBody.innerHTML = '<tr><td colspan="6" class="table-loading-cell">No se pudieron cargar los productos</td></tr>';
        }
        showWarehouseNotification('No se pudo cargar la lista de pedidos', true);
    }
}

function formatOrderDateTime(value) {
    if (!value) return 'N/A';

    try {
        const date = new Date(value);
        const dayPart = date.toLocaleDateString('es-CL', {
            timeZone: CHILE_TIMEZONE,
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const hourPart = date.toLocaleTimeString('es-CL', {
            timeZone: CHILE_TIMEZONE,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        return `${dayPart} ${hourPart}`;
    } catch (_) {
        return 'N/A';
    }
}

function renderWarehouseStats(orders) {
    const totalEl = document.getElementById('warehouseTotalOrders');
    const pendingEl = document.getElementById('warehousePendingShip');
    const outEl = document.getElementById('warehouseOutOfStock');

    if (totalEl) totalEl.textContent = String(orders.length);
    if (pendingEl) pendingEl.textContent = String(orders.filter((order) => order.status === 'paid').length);
    if (outEl) outEl.textContent = String(orders.filter((order) => order.warehouseStockStatus === 'out_of_stock').length);
}

function applyWarehouseFilters() {
    const search = String(document.getElementById('warehouseSearch')?.value || '').toLowerCase().trim();
    const status = String(document.getElementById('warehouseStatusFilter')?.value || 'all');

    let filtered = [...warehouseOrders];

    if (status !== 'all') {
        filtered = filtered.filter((order) => order.status === status);
    }

    if (search) {
        filtered = filtered.filter((order) => {
            const first = order.shippingData?.firstName || '';
            const last = order.shippingData?.lastName || '';
            const phone = order.shippingData?.phone || '';
            const indexText = `${order.id || ''} ${first} ${last} ${phone}`.toLowerCase();
            return indexText.includes(search);
        });
    }

    renderWarehouseTable(filtered);
}

function buildStatusOptions(currentStatus) {
    const normalized = String(currentStatus || 'paid');
    const baseOptions = ['paid', 'shipped', 'delivered', 'refunded'];

    if (!baseOptions.includes(normalized)) {
        return baseOptions;
    }

    return [normalized, ...baseOptions.filter((status) => status !== normalized)];
}

function getStatusLabel(status) {
    const map = {
        paid: 'Pendiente empaque',
        shipped: 'Enviada',
        delivered: 'Entregada',
        refunded: 'Devolución / sin stock'
    };
    return map[status] || status;
}

function getStockLabel(stockStatus) {
    const map = {
        unknown: 'Sin marcar',
        in_stock: 'Hay stock',
        out_of_stock: 'No hay stock'
    };
    return map[stockStatus] || 'Sin marcar';
}

function normalizeOrderItemKey(item, index) {
    const idPart = String(item?.id || item?.productId || item?.sku || item?.name || `item-${index}`).trim();
    return `${idPart}__${index}`;
}

function getOrderItemStockStatus(order, item, index) {
    const map = order?.warehouseItemsStatus && typeof order.warehouseItemsStatus === 'object'
        ? order.warehouseItemsStatus
        : {};
    const key = normalizeOrderItemKey(item, index);
    const entry = map[key];
    const status = String(entry?.status || 'unknown');
    return ['unknown', 'in_stock', 'out_of_stock'].includes(status) ? status : 'unknown';
}

function getOrderItemStockLabel(order, item, index) {
    return getStockLabel(getOrderItemStockStatus(order, item, index));
}

async function syncProductStockFromWarehouse(item, status) {
    if (!item?.id || !window.firebaseData?.loadProducts || !window.firebaseData?.updateProductStock) {
        return;
    }

    const products = await window.firebaseData.loadProducts();
    const product = products.find(productItem => String(productItem.id) === String(item.id));
    if (!product) return;

    if (status === 'out_of_stock') {
        await window.firebaseData.updateProductStock(product.id, 0, false);
        return;
    }

    if (status === 'in_stock' && Number.parseInt(product.stock, 10) <= 0) {
        await window.firebaseData.updateProductStock(product.id, 1, true);
    }
}

function renderWarehouseTable(orders) {
    const body = document.getElementById('warehouseOrdersBody');
    if (!body) return;

    if (!orders.length) {
        body.innerHTML = '<tr><td colspan="7" class="table-loading-cell">No hay pedidos para mostrar</td></tr>';
        return;
    }

    body.innerHTML = orders.map((order) => {
        const orderId = String(order.id || '');
        const firstName = escapeHtml(order.shippingData?.firstName || '');
        const lastName = escapeHtml(order.shippingData?.lastName || '');
        const phone = escapeHtml(order.shippingData?.phone || 'N/A');
        const createdAtText = escapeHtml(formatOrderDateTime(order.createdAt));
        const stockStatus = String(order.warehouseStockStatus || 'unknown');
        const statusOptions = buildStatusOptions(order.status)
            .map((statusValue) => `<option value="${statusValue}" ${statusValue === order.status ? 'selected' : ''}>${getStatusLabel(statusValue)}</option>`)
            .join('');

        return `
            <tr data-order-id="${encodeURIComponent(orderId)}">
                <td>
                    <button class="warehouse-order-link" data-action="view-order" title="Ver detalle de orden">#${escapeHtml(orderId)}</button>
                </td>
                <td>${firstName} ${lastName}</td>
                <td>${phone}</td>
                <td class="warehouse-date-cell">${createdAtText}</td>
                <td>
                    <select class="form-control-compact" data-field="status">
                        ${statusOptions}
                    </select>
                </td>
                <td>
                    <select class="form-control-compact" data-field="stock">
                        <option value="unknown" ${stockStatus === 'unknown' ? 'selected' : ''}>${getStockLabel('unknown')}</option>
                        <option value="in_stock" ${stockStatus === 'in_stock' ? 'selected' : ''}>${getStockLabel('in_stock')}</option>
                        <option value="out_of_stock" ${stockStatus === 'out_of_stock' ? 'selected' : ''}>${getStockLabel('out_of_stock')}</option>
                    </select>
                </td>
                <td>
                    <div class="warehouse-actions">
                        <button class="btn-primary" data-action="save-order">Guardar</button>
                        <button class="btn-secondary" data-action="view-order" title="Ver detalle">Detalle</button>
                        <button class="btn-secondary" data-action="print-order" title="Imprimir etiqueta">Etiqueta</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function applyWarehouseItemsFilters() {
    const term = String(document.getElementById('warehouseItemsSearch')?.value || '').toLowerCase().trim();
    renderWarehouseItemsByOrder(warehouseOrders, term);
}

function renderWarehouseItemsByOrder(orders, searchTerm = '') {
    const body = document.getElementById('warehouseItemsBody');
    if (!body) return;

    if (!orders.length) {
        body.innerHTML = '<tr><td colspan="6" class="table-loading-cell">No hay productos para mostrar</td></tr>';
        return;
    }

    const rows = [];

    orders.forEach((order) => {
        const orderId = String(order?.id || '');
        const customer = `${order?.shippingData?.firstName || ''} ${order?.shippingData?.lastName || ''}`.trim() || 'Cliente';
        const createdAt = formatOrderDateTime(order?.createdAt);
        const items = Array.isArray(order?.items) ? order.items : [];

        const filteredItems = items
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => {
                if (!searchTerm) return true;
                const text = `${orderId} ${customer} ${item?.name || ''} ${item?.id || ''}`.toLowerCase();
                return text.includes(searchTerm);
            });

        if (!filteredItems.length) {
            return;
        }

        rows.push(`
            <tr class="warehouse-order-group-row">
                <td colspan="6"><strong>Pedido #${escapeHtml(orderId)}</strong></td>
            </tr>
        `);

        filteredItems.forEach(({ item, index }) => {
            const itemKey = normalizeOrderItemKey(item, index);
            const status = getOrderItemStockStatus(order, item, index);
            const safeName = escapeHtml(item?.name || 'Producto');
            const qty = Number(item?.quantity) || 0;
            const safeImage = sanitizeImageUrl(item?.image || item?.imageUrl || item?.product?.image || item?.product?.imageUrl || '');

            rows.push(`
                <tr data-order-id="${encodeURIComponent(orderId)}" data-item-key="${encodeURIComponent(itemKey)}">
                    <td><button class="warehouse-order-link" data-action="view-order">#${escapeHtml(orderId)}</button></td>
                    <td>
                        ${safeImage
                            ? `<img src="${safeImage}" alt="${safeName}" class="warehouse-item-thumb">`
                            : '<span class="warehouse-item-thumb-empty">📦</span>'
                        }
                    </td>
                    <td>
                        <div class="warehouse-item-name">${safeName}</div>
                    </td>
                    <td>${qty}</td>
                    <td>
                        <select class="form-control-compact warehouse-item-stock-select" data-field="item-stock">
                            <option value="unknown" ${status === 'unknown' ? 'selected' : ''}>----</option>
                            <option value="in_stock" ${status === 'in_stock' ? 'selected' : ''}>Hay stock</option>
                            <option value="out_of_stock" ${status === 'out_of_stock' ? 'selected' : ''}>No hay stock</option>
                        </select>
                    </td>
                    <td><button class="btn-primary" data-action="save-item-stock">Guardar</button></td>
                </tr>
            `);
        });
    });

    body.innerHTML = rows.length
        ? rows.join('')
        : '<tr><td colspan="6" class="table-loading-cell">No hay productos para mostrar</td></tr>';
}

async function handleWarehouseTableClick(event) {
    const row = event.target.closest('tr[data-order-id]');
    if (!row) {
        return;
    }

    const orderId = decodeURIComponent(row.dataset.orderId || '');

    const actionButton = event.target.closest('button[data-action]');
    if (!actionButton) {
        const clickedControl = event.target.closest('select, input, textarea, button, a, label');
        if (!clickedControl) {
            viewOrderDetails(orderId);
        }
        return;
    }

    const action = actionButton.dataset.action || '';

    if (action === 'view-order') {
        viewOrderDetails(orderId);
        return;
    }

    if (action === 'print-order') {
        printOrderById(orderId);
        return;
    }

    if (action !== 'save-order') {
        return;
    }

    const statusValue = row.querySelector('select[data-field="status"]')?.value || 'paid';
    const stockValue = row.querySelector('select[data-field="stock"]')?.value || 'unknown';

    const currentUser = readSessionUser();
    if (!currentUser?.uid) {
        showWarehouseNotification('Sesion invalida, vuelve a iniciar sesion', true);
        return;
    }

    actionButton.disabled = true;

    try {
        if (!window.firebaseData?.updateOrderWarehouseData) {
            throw new Error('firebaseData.updateOrderWarehouseData no disponible');
        }

        await window.firebaseData.updateOrderWarehouseData(orderId, {
            status: statusValue,
            warehouseStockStatus: stockValue,
            warehouseUpdatedBy: currentUser.uid
        });

        showWarehouseNotification('Pedido actualizado correctamente');
        await loadWarehouseOrders();
    } catch (error) {
        console.error('Error guardando pedido en bodega:', error);
        showWarehouseNotification('No se pudo guardar el pedido', true);
    } finally {
        actionButton.disabled = false;
    }
}

async function handleWarehouseItemsTableClick(event) {
    const row = event.target.closest('tr[data-order-id][data-item-key]');
    if (!row) {
        return;
    }

    const orderId = decodeURIComponent(row.dataset.orderId || '');
    const itemKey = decodeURIComponent(row.dataset.itemKey || '');
    const actionButton = event.target.closest('button[data-action]');

    if (!actionButton) {
        return;
    }

    const action = actionButton.dataset.action || '';
    if (action === 'view-order') {
        viewOrderDetails(orderId);
        return;
    }

    if (action !== 'save-item-stock') {
        return;
    }

    const stockValue = row.querySelector('select[data-field="item-stock"]')?.value || 'unknown';
    const currentUser = readSessionUser();
    if (!currentUser?.uid) {
        showWarehouseNotification('Sesion invalida, vuelve a iniciar sesion', true);
        return;
    }

    const order = findOrderById(orderId);
    if (!order) {
        showWarehouseNotification('No se encontró la orden', true);
        return;
    }

    const nextMap = {
        ...(order.warehouseItemsStatus && typeof order.warehouseItemsStatus === 'object' ? order.warehouseItemsStatus : {}),
        [itemKey]: {
            status: stockValue,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser.uid
        }
    };

    actionButton.disabled = true;
    try {
        await window.firebaseData.updateOrderWarehouseData(orderId, {
            warehouseItemsStatus: nextMap,
            warehouseUpdatedBy: currentUser.uid
        });

        await syncProductStockFromWarehouse(order.items?.find((item, index) => normalizeOrderItemKey(item, index) === itemKey), stockValue);

        showWarehouseNotification('Stock del producto actualizado');
        await loadWarehouseOrders();
    } catch (error) {
        console.error('Error guardando stock por producto:', error);
        showWarehouseNotification('No se pudo guardar el stock del producto', true);
    } finally {
        actionButton.disabled = false;
    }
}

function findOrderById(orderId) {
    return warehouseOrders.find((order) => String(order.id || '') === String(orderId || '')) || null;
}

function formatDate(value) {
    if (!value) return 'N/A';
    try {
        return new Date(value).toLocaleDateString('es-CL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_) {
        return 'N/A';
    }
}

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
    return `${chunks.reverse().join('.')}-${dv}`;
}

function viewOrderDetails(orderId) {
    const order = findOrderById(orderId);
    if (!order) {
        showWarehouseNotification('No se encontró la orden', true);
        return;
    }

    const content = document.getElementById('warehouseOrderDetailsContent');
    const modal = document.getElementById('warehouseOrderDetailsModal');
    if (!content || !modal) return;

    modal.dataset.orderId = String(order.id || '');

    const subtotal = Number(order?.totals?.subtotal) || (order.items || []).reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
    const shipping = Number(order?.totals?.shipping) || 0;
    const discount = Number(order?.totals?.discount) || 0;
    const total = Number(order?.totals?.total) || (subtotal + shipping - discount);

    const safeFirstName = escapeHtml(order.shippingData?.firstName || '');
    const safeLastName = escapeHtml(order.shippingData?.lastName || '');
    const safeEmail = escapeHtml(order.userEmail || order.shippingData?.email || 'N/A');
    const safePhone = escapeHtml(order.shippingData?.phone || 'N/A');
    const safeStreet = escapeHtml(order.shippingData?.street || 'N/A');
    const safeApartment = escapeHtml(order.shippingData?.apartment || '');
    const safeCity = escapeHtml(order.shippingData?.city || 'N/A');
    const safeRegion = escapeHtml(order.shippingData?.region || 'N/A');
    const safeRut = escapeHtml(formatRut(order.shippingData?.rut || ''));

    const productsHtml = (order.items || []).map((item, index) => {
        const safeName = escapeHtml(item?.name || 'Producto');
        const safeSku = escapeHtml(item?.sku || item?.id || 'N/A');
        const quantity = Number(item?.quantity) || 0;
        const unitPrice = Number(item?.price) || 0;
        const safeImage = sanitizeImageUrl(item?.image || item?.product?.image || '');
        const stockLabel = getOrderItemStockLabel(order, item, index);

        return `
            <div style="display:flex; gap:0.8rem; align-items:center; background:var(--admin-bg); border:1px solid var(--admin-border); border-radius:10px; padding:0.7rem; margin-bottom:0.6rem;">
                <div style="width:64px; height:64px; border-radius:8px; overflow:hidden; background:var(--admin-card); border:1px solid var(--admin-border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    ${safeImage
                        ? `<img src="${safeImage}" alt="${safeName}" style="width:100%; height:100%; object-fit:cover;">`
                        : '<span style="font-size:1.3rem; opacity:0.7;">📦</span>'
                    }
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; color:var(--admin-text);">${safeName}</div>
                    <div style="font-size:0.85rem; color:var(--admin-text-light);">SKU/ID: ${safeSku}</div>
                    <div style="font-size:0.8rem; margin-top:0.2rem; color:var(--admin-text-light);">Stock bodega: <strong>${escapeHtml(stockLabel)}</strong></div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                    <div style="font-size:0.9rem;"><strong>x${quantity}</strong></div>
                    ${Number(item?.originalPrice) > unitPrice ? `<div style="font-size:0.75rem; color:var(--admin-text-light); text-decoration:line-through;">$${Number(item.originalPrice).toLocaleString('es-CL')}</div><div style="font-size:0.85rem; color:var(--admin-text); font-weight:700;">$${unitPrice.toLocaleString('es-CL')}</div>` : `<div style="font-size:0.85rem; color:var(--admin-text-light);">$${unitPrice.toLocaleString('es-CL')}</div>`}
                </div>
            </div>
        `;
    }).join('');

    content.innerHTML = `
        <div style="display:grid; gap:1rem;">
            <div>
                <strong>Orden:</strong> #${escapeHtml(order.id || '')}<br>
                <strong>Estado:</strong> ${escapeHtml(getStatusLabel(order.status || 'paid'))}<br>
                <strong>Fecha:</strong> ${escapeHtml(formatDate(order.createdAt))}
            </div>
            <div>
                <strong>Cliente:</strong> ${safeFirstName} ${safeLastName}<br>
                <strong>RUT:</strong> ${safeRut}<br>
                <strong>Email:</strong> ${safeEmail}<br>
                <strong>Teléfono:</strong> ${safePhone}
            </div>
            <div>
                <strong>Dirección:</strong> ${safeStreet}${safeApartment ? `, ${safeApartment}` : ''}<br>
                <strong>Comuna/Región:</strong> ${safeCity}, ${safeRegion}
            </div>
            <div>
                <strong>Productos:</strong>
                <div style="margin-top:0.5rem;">
                    ${productsHtml || '<p style="color:var(--admin-text-light);">No hay productos en esta orden.</p>'}
                </div>
            </div>
            <div>
                <strong>Total:</strong> $${Number(total).toLocaleString('es-CL')}
            </div>
        </div>
    `;

    modal.classList.add('active');
}

function hideOrderDetailsModal() {
    const modal = document.getElementById('warehouseOrderDetailsModal');
    if (!modal) return;
    modal.classList.remove('active');
    delete modal.dataset.orderId;
}

function printOrderFromModal() {
    const modal = document.getElementById('warehouseOrderDetailsModal');
    const orderId = modal?.dataset?.orderId || '';
    if (!orderId) {
        showWarehouseNotification('No se pudo identificar la orden', true);
        return;
    }
    openPrintPreview(orderId);
}

function printOrderById(orderId) {
    openPrintPreview(orderId);
}

function openPrintPreview(orderId) {
    const order = findOrderById(orderId);
    if (!order) {
        showWarehouseNotification('No se encontró la orden', true);
        return;
    }

    const previewFrame = document.getElementById('warehousePrintPreviewFrame');
    const previewModal = document.getElementById('warehousePrintPreviewModal');
    if (!previewFrame || !previewModal) {
        showWarehouseNotification('No se pudo abrir la vista previa', true);
        return;
    }

    pendingPrintOrderId = String(order.id || '');
    previewFrame.srcdoc = buildLabelDocument(order, { autoPrint: false, autoClose: false });
    previewModal.classList.add('active');
}

function closePrintPreview() {
    const previewModal = document.getElementById('warehousePrintPreviewModal');
    const previewFrame = document.getElementById('warehousePrintPreviewFrame');
    if (previewModal) {
        previewModal.classList.remove('active');
    }
    if (previewFrame) {
        previewFrame.srcdoc = '';
    }
    pendingPrintOrderId = '';
}

function confirmPrintFromPreview() {
    if (!pendingPrintOrderId) {
        showWarehouseNotification('No hay etiqueta seleccionada', true);
        return;
    }

    const order = findOrderById(pendingPrintOrderId);
    if (!order) {
        showWarehouseNotification('No se encontró la orden', true);
        return;
    }

    const printWindow = window.open('', '_blank', 'width=820,height=620');
    if (!printWindow) {
        showWarehouseNotification('No se pudo abrir la ventana de impresión', true);
        return;
    }

    printWindow.document.write(buildLabelDocument(order, { autoPrint: true, autoClose: true }));
    printWindow.document.close();
    closePrintPreview();
}

function buildLabelDocument(order, { autoPrint = false, autoClose = false } = {}) {

    const total = Number(order?.totals?.total) || (order.items || []).reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
    const safeOrderId = escapeHtml(String(order.id || 'N/A'));
    const safeFirstName = escapeHtml(String(order.shippingData?.firstName || 'CLIENTE'));
    const safeLastName = escapeHtml(String(order.shippingData?.lastName || ''));
    const safeStreet = escapeHtml(String(order.shippingData?.street || 'Dirección'));
    const safeApartment = escapeHtml(String(order.shippingData?.apartment || ''));
    const safeRut = escapeHtml(String(formatRut(order.shippingData?.rut || '')));
    const safePhone = escapeHtml(String(order.shippingData?.phone || 'N/A'));
    const safeCity = escapeHtml(String(order.shippingData?.city || 'Ciudad'));
    const safeRegion = escapeHtml(String(order.shippingData?.region || 'Región'));
    const safeStatus = escapeHtml(String(getStatusLabel(order.status || 'paid')));
    const safeDeliveryDate = escapeHtml(new Date().toLocaleDateString('es-CL', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).toUpperCase());
    const logoUrl = escapeHtml(new URL('../images/logo.jpg', window.location.href).href);
    const safeItems = (order.items || []).map((item) => ({
        quantity: Number(item.quantity) || 0,
        name: escapeHtml(String(item.name || 'Producto'))
    }));

    const labelHTML = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Etiqueta ${safeOrderId}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            margin: 0;
        }
        .shipping-label {
            width: 80mm;
            min-height: 120mm;
            border: 2px solid #000;
            padding: 4mm;
            background: #fff;
            display: flex;
            flex-direction: column;
            gap: 3mm;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 3mm;
            border-bottom: 2px solid #000;
            padding-bottom: 2mm;
        }
        .logo {
            width: 18mm;
            height: auto;
            max-height: 16mm;
            object-fit: contain;
        }
        .header-right {
            text-align: right;
            font-size: 8px;
            line-height: 1.3;
            flex: 1;
        }
        .order-id {
            font-family: 'Courier New', monospace;
            font-size: 9px;
            border: 1px solid #000;
            display: inline-block;
            padding: 1mm 2mm;
            margin-top: 1mm;
            font-weight: 700;
        }
        .section {
            border: 1px solid #999;
            padding: 2mm;
            font-size: 8px;
            line-height: 1.35;
        }
        .section-title {
            font-size: 7px;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 1mm;
        }
        .recipient-name {
            font-size: 10px;
            font-weight: 700;
            margin-bottom: 1mm;
        }
        .items-list {
            list-style: none;
            margin-top: 1mm;
        }
        .items-list li {
            margin-bottom: 0.5mm;
            word-break: break-word;
        }
        .tracking {
            border: 2px dashed #000;
            text-align: center;
            padding: 2mm;
        }
        .tracking-code {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            font-weight: 700;
            margin-top: 1mm;
            word-break: break-all;
        }
        .footer {
            margin-top: auto;
            text-align: center;
            font-size: 6px;
            color: #666;
            border-top: 1px solid #999;
            padding-top: 1mm;
        }

        @media print {
            @page {
                size: 100mm 150mm;
                margin: 0;
            }
            body { padding: 0; }
            .shipping-label { border-width: 2px; }
        }
    </style>
</head>
<body>
    <div class="shipping-label">
        <div class="header">
            <img src="${logoUrl}" alt="Monsite" class="logo" onerror="this.style.display='none'">
            <div class="header-right">
                <div><strong>ENTREGA:</strong> ${safeDeliveryDate}</div>
                <div><strong>ESTADO:</strong> ${safeStatus}</div>
                <div class="order-id">#${safeOrderId}</div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Remitente</div>
            <div><strong>Monsite</strong> - Belleza & Cuidado Capilar</div>
            <div>Padre Leon Dehon 6190, Las Condes</div>
        </div>

        <div class="section">
            <div class="section-title">Destinatario</div>
            <div class="recipient-name">${safeFirstName} ${safeLastName}</div>
            <div><strong>RUT:</strong> ${safeRut}</div>
            <div><strong>Tel:</strong> ${safePhone}</div>
            <div><strong>Direccion:</strong> ${safeStreet}${safeApartment ? `, ${safeApartment}` : ''}</div>
            <div><strong>Comuna/Region:</strong> ${safeCity}, ${safeRegion}</div>
        </div>

        <div class="section">
            <div class="section-title">Contenido</div>
            <ul class="items-list">
                ${safeItems.map((item) => `<li>- ${item.quantity} x ${item.name}</li>`).join('')}
            </ul>
            <div style="margin-top:1mm;"><strong>Total:</strong> $${Number(total).toLocaleString('es-CL')}</div>
        </div>

        <div class="tracking">
            <div style="font-size:7px; font-weight:700; text-transform:uppercase;">Codigo de rastreo</div>
            <div class="tracking-code">${safeOrderId}</div>
        </div>

        <div class="footer">Impreso: ${escapeHtml(new Date().toLocaleDateString('es-CL'))}</div>
    </div>
    <script>
        window.onload = function () {
            ${autoPrint ? 'setTimeout(function(){ window.print(); }, 250);' : ''}
        };
        window.onafterprint = function () {
            ${autoClose ? 'window.close();' : ''}
        };
    </script>
</body>
</html>`;

    return labelHTML;
}

function showWarehouseNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${isError ? '#b91c1c' : '#10b981'};
        color: white;
        padding: 0.8rem 1rem;
        border-radius: 8px;
        z-index: 4000;
        box-shadow: 0 8px 20px rgba(0,0,0,0.2);
    `;

    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2500);
}
