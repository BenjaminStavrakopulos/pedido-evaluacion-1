// admin-categories.js - Gestión de categorías
document.addEventListener('DOMContentLoaded', function() {
    initializeAdminCategories();
});

let categoriesFilterDebounceTimer = null;
const CATEGORIES_FILTER_DEBOUNCE_MS = 180;

async function initializeAdminCategories() {
    const hasAccess = await checkAdminAuth();
    if (!hasAccess) {
        return;
    }
    loadCategoriesList();
    setupCategoryForm();
    setupCategorySearch();
    setupCategoryActionsDelegation();
    setupCategoryModalHandlers();
    setupCategoryPageActions();
}

function sanitizeCategoryColor(value) {
    if (typeof value !== 'string') {
        return '#1a1a1a';
    }

    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(trimmed)) {
        return trimmed;
    }

    return '#1a1a1a';
}

async function getCategoriesData() {
    if (!window.firebaseData?.loadCategories) {
        console.error('❌ firebaseData.loadCategories no está disponible');
        return [];
    }

    return await window.firebaseData.loadCategories();
}

async function getProductsData() {
    if (!window.firebaseData?.loadProducts) {
        console.error('❌ firebaseData.loadProducts no está disponible');
        return [];
    }

    return await window.firebaseData.loadProducts();
}

function setupCategorySearch() {
    const searchInput = document.getElementById('categorySearchInput');
    if (!searchInput || searchInput.dataset.listener === 'true') return;

    searchInput.addEventListener('input', function(event) {
        const term = event.target.value;
        if (categoriesFilterDebounceTimer) {
            clearTimeout(categoriesFilterDebounceTimer);
        }
        categoriesFilterDebounceTimer = setTimeout(() => {
            filterCategories(term);
        }, CATEGORIES_FILTER_DEBOUNCE_MS);
    });

    searchInput.dataset.listener = 'true';
}

function setupCategoryActionsDelegation() {
    const categoriesList = document.getElementById('categoriesList');
    if (!categoriesList || categoriesList.dataset.listener === 'true') return;

    categoriesList.addEventListener('click', function(event) {
        const actionButton = event.target.closest('button[data-action]');
        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const categoryId = actionButton.dataset.categoryId;

        if (action === 'new-category') {
            showCategoryForm();
            return;
        }

        if (!categoryId) return;

        if (action === 'edit') {
            editCategory(categoryId);
        } else if (action === 'delete') {
            deleteCategory(categoryId);
        }
    });

    categoriesList.dataset.listener = 'true';
}

function setupCategoryModalHandlers() {
    const modal = document.getElementById('categoryFormModal');
    const closeBtn = document.getElementById('categoryModalCloseBtn');
    const cancelBtn = document.getElementById('categoryModalCancelBtn');

    if (modal && modal.dataset.listener !== 'true') {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                hideCategoryForm();
            }
        });
        modal.dataset.listener = 'true';
    }

    if (closeBtn && closeBtn.dataset.listener !== 'true') {
        closeBtn.addEventListener('click', hideCategoryForm);
        closeBtn.dataset.listener = 'true';
    }

    if (cancelBtn && cancelBtn.dataset.listener !== 'true') {
        cancelBtn.addEventListener('click', hideCategoryForm);
        cancelBtn.dataset.listener = 'true';
    }
}

function setupCategoryPageActions() {
    const newCategoryBtn = document.getElementById('newCategoryBtn');
    if (newCategoryBtn && newCategoryBtn.dataset.listener !== 'true') {
        newCategoryBtn.addEventListener('click', () => showCategoryForm());
        newCategoryBtn.dataset.listener = 'true';
    }

    const viewStoreBtn = document.getElementById('adminCategoriesViewStoreBtn');
    if (viewStoreBtn && viewStoreBtn.dataset.listener !== 'true') {
        viewStoreBtn.addEventListener('click', () => {
            window.location.href = '../index.html';
        });
        viewStoreBtn.dataset.listener = 'true';
    }

    const logoutBtn = document.getElementById('adminCategoriesLogoutBtn');
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
        showNotification('❌ No se pudo verificar permisos de administrador');
        window.location.href = '../login.html';
        return false;
    }

    try {
        const isAdmin = await window.firebase.isUserAdmin(user.uid);
        if (!isAdmin) {
            console.log('❌ Usuario no es admin, redirigiendo a inicio...');
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

        console.log('✅ Usuario admin verificado en Firebase');
        return true;
    } catch (error) {
        console.warn('⚠️ No se pudo verificar admin en Firebase:', error);
        showNotification('❌ Error verificando permisos de administrador');
        window.location.href = '../login.html';
        return false;
    }
}

async function loadCategoriesList() {
    const categoriesList = document.getElementById('categoriesList');
    if (!categoriesList) return;

    const categories = await getCategoriesData();
    const products = await getProductsData();
    
    if (categories.length === 0) {
        categoriesList.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center;">
                <p>No hay categorías creadas</p>
                <button class="btn-primary" data-action="new-category" style="margin-top: 1rem;">Crear Primera Categoría</button>
            </div>
        `;
        updateCategoriesCount(0);
        return;
    }

    categoriesList.innerHTML = categories.map(category => {
        const categoryProducts = products.filter(p => p.category === category.id);
        const safeCategoryId = escapeAttr(String(category.id || ''));
        const safeCategoryName = escapeHtml(String(category.name || ''));
        const safeCategoryDescription = escapeHtml(String(category.description || 'Sin descripción'));
        const safeCategoryColor = sanitizeCategoryColor(category.color);
        const safeCategoryNameSearch = escapeAttr(String(category.name || '').toLowerCase());
        const safeCategoryIdSearch = escapeAttr(String(category.id || '').toLowerCase());
        
        return `
            <div class="category-card-admin" data-category-name="${safeCategoryNameSearch}" data-category-id="${safeCategoryIdSearch}">
                <div class="category-header">
                    <div class="category-color" style="background-color: ${safeCategoryColor}"></div>
                    <h3>${safeCategoryName}</h3>
                    <span class="product-count">${categoryProducts.length} productos</span>
                </div>
                <div class="category-body">
                    <p>${safeCategoryDescription}</p>
                    <div class="category-actions">
                        <button class="btn-secondary" data-action="edit" data-category-id="${safeCategoryId}">Editar</button>
                        <button class="btn-danger" data-action="delete" data-category-id="${safeCategoryId}" ${categoryProducts.length > 0 ? 'disabled' : ''}>Eliminar</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    updateCategoriesCount(categories.length);
}

function setupCategoryForm() {
    const form = document.getElementById('categoryForm');
    if (form) {
        form.addEventListener('submit', handleCategorySubmit);
    }
}

async function showCategoryForm(categoryId = null) {
    const modal = document.getElementById('categoryFormModal');
    const formTitle = document.getElementById('categoryFormTitle');
    const form = document.getElementById('categoryForm');
    
    if (categoryId) {
        formTitle.textContent = 'Editar Categoría';
        await loadCategoryData(categoryId);
    } else {
        formTitle.textContent = 'Nueva Categoría';
        form.reset();
        document.getElementById('categoryId').value = '';
        document.getElementById('categoryColor').value = '#1a1a1a';
    }
    
    modal.classList.add('active');
}

function hideCategoryForm() {
    const modal = document.getElementById('categoryFormModal');
    modal.classList.remove('active');
}

async function loadCategoryData(categoryId) {
    const categories = await getCategoriesData();
    const category = categories.find(c => c.id === categoryId);
    
    if (!category) return;
    
    document.getElementById('categoryId').value = category.id;
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryIdInput').value = category.id;
    document.getElementById('categoryColor').value = category.color;
    document.getElementById('categoryDescription').value = category.description || '';
}

async function handleCategorySubmit(event) {
    event.preventDefault();
    
    const categoryId = document.getElementById('categoryId').value;
    const categoryData = {
        id: document.getElementById('categoryIdInput').value.toLowerCase().replace(/\s+/g, '-'),
        name: document.getElementById('categoryName').value,
        color: document.getElementById('categoryColor').value,
        description: document.getElementById('categoryDescription').value
    };
    
    if (categoryId) {
        await updateCategory(categoryId, categoryData);
    } else {
        await createCategory(categoryData);
    }
}

async function createCategory(categoryData) {
    const categories = await getCategoriesData();
    
    // Verificar si ya existe una categoría con ese ID
    if (categories.find(c => c.id === categoryData.id)) {
        alert('Ya existe una categoría con ese ID. Por favor usa un ID único.');
        return;
    }
    
    if (!window.firebaseData?.saveCategory) {
        showNotification('❌ No se pudo guardar: Firebase no disponible');
        return;
    }

    await window.firebaseData.saveCategory(categoryData);

    await loadCategoriesList();
    hideCategoryForm();
    showNotification('✅ Categoría creada exitosamente');
}

async function updateCategory(oldId, categoryData) {
    const categories = await getCategoriesData();
    const index = categories.findIndex(c => c.id === oldId);
    
    if (index !== -1) {
        // Si cambió el ID, actualizar también los productos
        if (oldId !== categoryData.id) {
            await updateProductsCategory(oldId, categoryData.id);
        }
        
        categories[index] = categoryData;

        if (!window.firebaseData?.saveCategory) {
            showNotification('❌ No se pudo actualizar: Firebase no disponible');
            return;
        }

        await window.firebaseData.saveCategory(categoryData);

        await loadCategoriesList();
        hideCategoryForm();
        showNotification('✅ Categoría actualizada exitosamente');
    }
}

async function updateProductsCategory(oldCategoryId, newCategoryId) {
    if (!window.firebaseData?.loadProducts || !window.firebaseData?.saveProduct) {
        return;
    }

    const products = await window.firebaseData.loadProducts();
    const productsToUpdate = products.filter(product => product.category === oldCategoryId);

    for (const product of productsToUpdate) {
        await window.firebaseData.saveProduct({
            ...product,
            category: newCategoryId
        });
    }
}

function editCategory(categoryId) {
    showCategoryForm(categoryId);
}

async function deleteCategory(categoryId) {
    const products = await getProductsData();
    const productsInCategory = products.filter(p => p.category === categoryId);
    
    if (productsInCategory.length > 0) {
        alert(`No puedes eliminar esta categoría porque tiene ${productsInCategory.length} productos asociados. Primero mueve o elimina esos productos.`);
        return;
    }
    
    if (confirm('¿Estás seguro de que quieres eliminar esta categoría?')) {
        if (!window.firebaseData?.deleteCategory) {
            showNotification('❌ No se pudo eliminar: Firebase no disponible');
            return;
        }

        await window.firebaseData.deleteCategory(categoryId);

        await loadCategoriesList();
        showNotification('✅ Categoría eliminada exitosamente');
    }
}

function filterCategories(searchTerm) {
    const cards = document.querySelectorAll('.category-card-admin');
    const searchTermLower = searchTerm.toLowerCase().trim();
    let visibleCount = 0;

    cards.forEach(card => {
        const categoryName = card.getAttribute('data-category-name') || '';
        const categoryId = card.getAttribute('data-category-id') || '';
        
        const matches = categoryName.includes(searchTermLower) || categoryId.includes(searchTermLower);
        
        if (matches) {
            card.style.display = '';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });

    // Mostrar mensaje si no hay resultados
    const categoriesList = document.getElementById('categoriesList');
    let noResultsDiv = document.getElementById('no-results-message');
    
    if (visibleCount === 0 && searchTermLower.length > 0) {
        if (!noResultsDiv) {
            noResultsDiv = document.createElement('div');
            noResultsDiv.id = 'no-results-message';
            noResultsDiv.className = 'empty-state';
            noResultsDiv.style.cssText = 'grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center;';
            noResultsDiv.innerHTML = `
                <p>📭 No se encontraron categorías con: "<strong>${escapeHtml(searchTerm)}</strong>"</p>
                <p style="font-size: 0.9rem; color: var(--admin-text-secondary); margin-top: 0.5rem;">Intenta con otro término de búsqueda</p>
            `;
            categoriesList.appendChild(noResultsDiv);
        } else {
            noResultsDiv.innerHTML = `
                <p>📭 No se encontraron categorías con: "<strong>${escapeHtml(searchTerm)}</strong>"</p>
                <p style="font-size: 0.9rem; color: var(--admin-text-secondary); margin-top: 0.5rem;">Intenta con otro término de búsqueda</p>
            `;
        }
    } else if (noResultsDiv) {
        noResultsDiv.remove();
    }

    updateCategoriesCount(visibleCount, searchTermLower.length > 0);
}

function updateCategoriesCount(count, isFiltered = false) {
    const countElement = document.getElementById('categoriesCount');
    if (countElement) {
        const text = isFiltered ? `${count} encontrada${count !== 1 ? 's' : ''}` : `${count} categor${count === 1 ? 'ía' : 'ías'}`;
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
window.showCategoryForm = showCategoryForm;
window.hideCategoryForm = hideCategoryForm;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;
window.filterCategories = filterCategories;