// admin-discounts.js - Gestión de códigos de descuento

document.addEventListener('DOMContentLoaded', function() {
    initializeAdminDiscounts();
});

let discountFilterDebounceTimer = null;
const DISCOUNT_FILTER_DEBOUNCE_MS = 180;

async function initializeAdminDiscounts() {
    const hasAccess = await checkAdminAuth();
    if (!hasAccess) {
        return;
    }
    await loadDiscountsList();
    setupDiscountForm();
    setupDiscountSearch();
    setupDiscountActionsDelegation();
    setupDiscountPageActions();
    setupDiscountModalHandlers();
    setupDiscountPreviewListeners();
    
    // Asegurar que el modal esté cerrado al cargar
    const modal = document.getElementById('discountFormModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function setupDiscountPageActions() {
    const viewStoreBtn = document.getElementById('adminDiscountsViewStoreBtn');
    if (viewStoreBtn && viewStoreBtn.dataset.listener !== 'true') {
        viewStoreBtn.addEventListener('click', () => {
            window.location.href = '../index.html';
        });
        viewStoreBtn.dataset.listener = 'true';
    }

    const newDiscountBtn = document.getElementById('adminDiscountsNewBtn');
    if (newDiscountBtn && newDiscountBtn.dataset.listener !== 'true') {
        newDiscountBtn.addEventListener('click', () => showDiscountForm());
        newDiscountBtn.dataset.listener = 'true';
    }

    const logoutBtn = document.getElementById('adminDiscountsLogoutBtn');
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
}

function toSafePositiveInt(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }
    return Math.floor(parsed);
}

function setupDiscountSearch() {
    const searchInput = document.getElementById('discountSearchInput');
    if (!searchInput || searchInput.dataset.listener === 'true') return;

    searchInput.addEventListener('input', function(event) {
        const term = event.target.value;
        if (discountFilterDebounceTimer) {
            clearTimeout(discountFilterDebounceTimer);
        }
        discountFilterDebounceTimer = setTimeout(() => {
            filterDiscounts(term);
        }, DISCOUNT_FILTER_DEBOUNCE_MS);
    });

    searchInput.dataset.listener = 'true';
}

function setupDiscountActionsDelegation() {
    const discountsList = document.getElementById('discountsList');
    if (!discountsList || discountsList.dataset.listener === 'true') return;

    discountsList.addEventListener('click', function(event) {
        const actionButton = event.target.closest('button[data-action]');
        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const discountId = actionButton.dataset.discountId;

        if (action === 'new-discount') {
            showDiscountForm();
            return;
        }

        if (!discountId) return;

        if (action === 'edit') {
            editDiscount(discountId);
        } else if (action === 'delete') {
            deleteDiscount(discountId);
        }
    });

    discountsList.dataset.listener = 'true';
}

function setupDiscountModalHandlers() {
    const modal = document.getElementById('discountFormModal');
    const closeBtn = document.getElementById('discountModalCloseBtn');
    const cancelBtn = document.getElementById('discountModalCancelBtn');

    if (modal && modal.dataset.listener !== 'true') {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                hideDiscountForm();
            }
        });
        modal.dataset.listener = 'true';
    }

    if (closeBtn && closeBtn.dataset.listener !== 'true') {
        closeBtn.addEventListener('click', hideDiscountForm);
        closeBtn.dataset.listener = 'true';
    }

    if (cancelBtn && cancelBtn.dataset.listener !== 'true') {
        cancelBtn.addEventListener('click', hideDiscountForm);
        cancelBtn.dataset.listener = 'true';
    }
}

function setupDiscountPreviewListeners() {
    const codeInput = document.getElementById('discountCode');
    const typeSelect = document.getElementById('discountType');
    const valueInput = document.getElementById('discountValue');
    const maxUsesInput = document.getElementById('discountMaxUses');
    const perUserInput = document.getElementById('discountPerUser');

    [codeInput, valueInput, maxUsesInput, perUserInput].forEach((element) => {
        if (element && element.dataset.listener !== 'true') {
            element.addEventListener('input', updateDiscountPreview);
            element.dataset.listener = 'true';
        }
    });

    if (typeSelect && typeSelect.dataset.listener !== 'true') {
        typeSelect.addEventListener('change', updateDiscountPreview);
        typeSelect.dataset.listener = 'true';
    }
}

async function checkAdminAuth() {
    const userLS = JSON.parse(localStorage.getItem('hairia_current_user') || 'null');
    const userSS = JSON.parse(sessionStorage.getItem('hairia_current_user') || 'null');
    const user = userLS || userSS;
    
    if (!user || !user.uid) {
        window.location.href = '../login.html';
        return false;
    }

    if (!window.firebase || typeof window.firebase.isUserAdmin !== 'function') {
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

        return true;
    } catch (error) {
        console.warn('⚠️ No se pudo verificar admin en Firebase:', error);
        showNotification('❌ Error verificando permisos de administrador');
        window.location.href = '../login.html';
        return false;
    }
}

async function loadDiscountsList() {
    const discountsList = document.getElementById('discountsList');
    if (!discountsList) return;

    if (!window.firebaseData?.loadDiscountCodes) {
        discountsList.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center;">
                <p>❌ Firebase no disponible para cargar descuentos</p>
            </div>
        `;
        updateDiscountsCount(0);
        return;
    }

    const discounts = await window.firebaseData.loadDiscountCodes();
    
    if (discounts.length === 0) {
        discountsList.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center;">
                <p>No hay códigos de descuento creados</p>
                <button class="btn-primary" data-action="new-discount" style="margin-top: 1rem;">Crear Primer Código</button>
            </div>
        `;
        updateDiscountsCount(0);
        return;
    }

    discountsList.innerHTML = discounts.map(discount => {
        const usedCount = toSafePositiveInt(discount.usedCount, 0);
        const maxUses = toSafePositiveInt(discount.maxUses, 0);
        const usesPerUser = toSafePositiveInt(discount.usesPerUser, 1);
        const discountValue = toSafePositiveInt(discount.value, 0);
        const normalizedType = discount.type === 'percentage' ? 'percentage' : 'fixed';
        const createdAtDate = discount.createdAt ? new Date(discount.createdAt) : null;
        const createdAtLabel = createdAtDate && !Number.isNaN(createdAtDate.getTime())
            ? createdAtDate.toLocaleDateString('es-CL')
            : 'N/A';
        const progressPercent = maxUses > 0 ? Math.round((usedCount / maxUses) * 100) : 0;
        const safeProgressPercent = Math.min(Math.max(progressPercent, 0), 100);
        const statusClass = maxUses > 0 && usedCount >= maxUses ? 'expired' : 'active';
        const statusText = statusClass === 'expired' ? 'Expirado' : 'Activo';
        const safeCode = escapeHtml(String(discount.code || ''));
        const safeDiscountCodeSearch = escapeAttr(String(discount.code || '').toLowerCase());
        const safeDiscountId = escapeAttr(String(discount.id || ''));
        
        return `
            <div class="discount-card-admin ${statusClass}" data-discount-code="${safeDiscountCodeSearch}">
                <div class="discount-header">
                    <div class="discount-code">
                        <h3>${safeCode}</h3>
                        <span class="discount-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="discount-value">
                        <span class="value-badge">${normalizedType === 'percentage' ? discountValue + '%' : '$' + discountValue}</span>
                    </div>
                </div>
                
                <div class="discount-details">
                    <p><strong>Tipo:</strong> ${normalizedType === 'percentage' ? 'Porcentaje' : 'Monto Fijo'}</p>
                    <p><strong>Usos por usuario:</strong> Máximo ${usesPerUser}</p>
                    <p><strong>Creado:</strong> ${createdAtLabel}</p>
                </div>

                <div class="discount-progress">
                    <div class="progress-label">
                        <span>Usos totales:</span>
                        <span class="progress-stat">${usedCount} / ${maxUses}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${safeProgressPercent}%"></div>
                    </div>
                    <div class="progress-percent">${safeProgressPercent}% utilizado</div>
                </div>

                <div class="discount-actions">
                    <button class="btn-secondary" data-action="edit" data-discount-id="${safeDiscountId}">Editar</button>
                    <button class="btn-danger" data-action="delete" data-discount-id="${safeDiscountId}">Eliminar</button>
                </div>
            </div>
        `;
    }).join('');

    updateDiscountsCount(discounts.length);
}

function setupDiscountForm() {
    const form = document.getElementById('discountForm');
    if (form) {
        form.addEventListener('submit', handleDiscountSubmit);
    }
}

async function showDiscountForm(discountId = null) {
    const modal = document.getElementById('discountFormModal');
    const formTitle = document.getElementById('discountFormTitle');
    const form = document.getElementById('discountForm');
    
    if (discountId) {
        formTitle.textContent = 'Editar Código de Descuento';
        await loadDiscountData(discountId);
    } else {
        formTitle.textContent = 'Nuevo Código de Descuento';
        form.reset();
        document.getElementById('discountCode').value = '';
        document.getElementById('discountType').value = 'percentage';
        document.getElementById('discountValue').value = '';
        document.getElementById('discountMaxUses').value = '';
        document.getElementById('discountPerUser').value = '1';
        delete document.getElementById('discountCode').dataset.originalId;
    }
    
    modal.classList.add('active');
    updateDiscountPreview();
}

function hideDiscountForm() {
    const modal = document.getElementById('discountFormModal');
    modal.classList.remove('active');
}

function closeDiscountModal(event) {
    const modal = document.getElementById('discountFormModal');
    if (event.target === modal) {
        hideDiscountForm();
    }
}

async function loadDiscountData(discountId) {
    if (!window.firebaseData?.loadDiscountCodes) return;

    const discounts = await window.firebaseData.loadDiscountCodes();
    const discount = discounts.find(d => d.id === discountId);
    
    if (!discount) return;
    
    document.getElementById('discountCode').value = discount.code;
    document.getElementById('discountType').value = discount.type;
    document.getElementById('discountValue').value = discount.value;
    document.getElementById('discountMaxUses').value = discount.maxUses;
    document.getElementById('discountPerUser').value = discount.usesPerUser;
    document.getElementById('discountCode').dataset.originalId = discountId;
}

function updateDiscountPreview() {
    const code = document.getElementById('discountCode').value || 'CODIGO';
    const type = document.getElementById('discountType').value;
    const value = document.getElementById('discountValue').value || '0';
    const maxUses = document.getElementById('discountMaxUses').value || '40';
    const perUser = document.getElementById('discountPerUser').value || '1';

    document.getElementById('previewCode').textContent = code.toUpperCase();
    document.getElementById('previewValue').textContent = type === 'percentage' ? value + '%' : '$' + value;
    document.getElementById('previewUses').textContent = `${maxUses} usos máx (${perUser} por usuario)`;
}

async function handleDiscountSubmit(event) {
    event.preventDefault();
    
    const code = document.getElementById('discountCode').value.toUpperCase().trim();
    const type = document.getElementById('discountType').value;
    const value = parseInt(document.getElementById('discountValue').value);
    const maxUses = parseInt(document.getElementById('discountMaxUses').value);
    const usesPerUser = parseInt(document.getElementById('discountPerUser').value);
    const originalId = document.getElementById('discountCode').dataset.originalId;

    if (!code || !value || !maxUses || !usesPerUser) {
        alert('Por favor completa todos los campos requeridos');
        return;
    }

    if (type === 'percentage' && (value < 1 || value > 100)) {
        alert('El porcentaje debe estar entre 1 y 100');
        return;
    }

    if (originalId) {
        await updateDiscount(originalId, { code, type, value, maxUses, usesPerUser });
    } else {
        await createDiscount({ code, type, value, maxUses, usesPerUser });
    }
}

async function createDiscount(discountData) {
    if (!window.firebaseData?.loadDiscountCodes || !window.firebaseData?.saveDiscountCode) {
        showNotification('❌ No se pudo guardar: Firebase no disponible');
        return;
    }

    const discounts = await window.firebaseData.loadDiscountCodes();
    
    // Verificar si ya existe un código con ese nombre
    if (discounts.find(d => d.code === discountData.code)) {
        alert('Ya existe un código con ese nombre. Por favor usa un código único.');
        return;
    }
    
    const newDiscount = {
        id: `DISC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        code: discountData.code,
        type: discountData.type,
        value: discountData.value,
        maxUses: discountData.maxUses,
        usesPerUser: discountData.usesPerUser,
        usedCount: 0,
        usersApplied: {},
        createdAt: new Date().toISOString()
    };
    
    await window.firebaseData.saveDiscountCode(newDiscount);

    await loadDiscountsList();
    hideDiscountForm();
    showNotification('✅ Código de descuento creado exitosamente');
}

async function updateDiscount(discountId, discountData) {
    if (!window.firebaseData?.loadDiscountCodes || !window.firebaseData?.saveDiscountCode) {
        showNotification('❌ No se pudo actualizar: Firebase no disponible');
        return;
    }

    const discounts = await window.firebaseData.loadDiscountCodes();
    const index = discounts.findIndex(d => d.id === discountId);
    
    if (index !== -1) {
        const updatedDiscount = {
            ...discounts[index],
            ...discountData,
            id: discountId
        };

        await window.firebaseData.saveDiscountCode(updatedDiscount);

        await loadDiscountsList();
        hideDiscountForm();
        showNotification('✅ Código actualizado exitosamente');
    }
}

function editDiscount(discountId) {
    showDiscountForm(discountId);
}

async function deleteDiscount(discountId) {
    if (confirm('¿Estás seguro de que quieres eliminar este código de descuento?')) {
        if (!window.firebaseData?.deleteDiscountCode) {
            showNotification('❌ No se pudo eliminar: Firebase no disponible');
            return;
        }

        await window.firebaseData.deleteDiscountCode(discountId);

        await loadDiscountsList();
        showNotification('✅ Código eliminado exitosamente');
    }
}

function filterDiscounts(searchTerm) {
    const cards = document.querySelectorAll('.discount-card-admin');
    const searchTermLower = searchTerm.toLowerCase().trim();
    let visibleCount = 0;

    cards.forEach(card => {
        const discountCode = card.getAttribute('data-discount-code') || '';
        const matches = discountCode.includes(searchTermLower);
        
        if (matches) {
            card.style.display = '';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    const discountsList = document.getElementById('discountsList');
    let noResultsDiv = document.getElementById('no-results-message');
    
    if (visibleCount === 0 && searchTermLower.length > 0) {
        if (!noResultsDiv) {
            noResultsDiv = document.createElement('div');
            noResultsDiv.id = 'no-results-message';
            noResultsDiv.className = 'empty-state';
            noResultsDiv.style.cssText = 'grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center;';
            noResultsDiv.innerHTML = `
                <p>📭 No se encontraron códigos con: "<strong>${escapeHtml(searchTerm)}</strong>"</p>
                <p style="font-size: 0.9rem; color: var(--admin-text-secondary); margin-top: 0.5rem;">Intenta con otro término de búsqueda</p>
            `;
            discountsList.appendChild(noResultsDiv);
        } else {
            noResultsDiv.innerHTML = `
                <p>📭 No se encontraron códigos con: "<strong>${escapeHtml(searchTerm)}</strong>"</p>
                <p style="font-size: 0.9rem; color: var(--admin-text-secondary); margin-top: 0.5rem;">Intenta con otro término de búsqueda</p>
            `;
        }
    } else if (noResultsDiv) {
        noResultsDiv.remove();
    }

    updateDiscountsCount(visibleCount, searchTermLower.length > 0);
}

function updateDiscountsCount(count, isFiltered = false) {
    const countElement = document.getElementById('discountsCount');
    if (countElement) {
        const text = isFiltered ? `${count} encontrado${count !== 1 ? 's' : ''}` : `${count} código${count === 1 ? '' : 's'}`;
        countElement.textContent = text;
    }
}

function escapeHtml(text) {
    const safeText = text == null ? '' : String(text);
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return safeText.replace(/[&<>"']/g, m => map[m]);
}

function escapeAttr(text) {
    return escapeHtml(text).replace(/`/g, '&#96;');
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

// Hacer funciones globales
window.showDiscountForm = showDiscountForm;
window.hideDiscountForm = hideDiscountForm;
window.editDiscount = editDiscount;
window.deleteDiscount = deleteDiscount;
window.filterDiscounts = filterDiscounts;
window.updateDiscountPreview = updateDiscountPreview;
window.closeDiscountModal = closeDiscountModal;
window.toggleTheme = function() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = current === 'light' ? 'dark' : 'light';
    if (typeof window.applyAdminTheme === 'function') {
        window.applyAdminTheme(newTheme);
        return;
    }

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('admin-theme', newTheme);
};
