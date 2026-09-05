// admin-brands.js - Gestión de marcas
document.addEventListener('DOMContentLoaded', function() {
    initializeAdminBrands();
});

// Variables globales
window.brandsData = [];
let currentLogoData = '';

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

async function initializeAdminBrands() {
    const hasAccess = await checkAdminAuth();
    if (!hasAccess) {
        return;
    }
    await loadGlobalBrandsData();
    await loadBrandsList();
    updateBrandsStats();
    setupBrandsEventListeners();
    setupModalClose();
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
        window.location.href = '../login.html';
        return false;
    }

    try {
        const isAdmin = await window.firebase.isUserAdmin(user.uid);
        if (!isAdmin) {
            console.log('❌ Usuario no es admin, redirigiendo a inicio...');
            window.location.href = '../index.html';
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
        window.location.href = '../login.html';
        return false;
    }
}

async function loadGlobalBrandsData() {
    if (!window.firebaseData?.loadBrands) {
        console.error('❌ firebaseData.loadBrands no está disponible');
        window.brandsData = [];
        return;
    }

    window.brandsData = await window.firebaseData.loadBrands();
    
    console.log('🏷️ Marcas cargadas:', window.brandsData.length);
    
    // Si no hay marcas, inicializar con algunas por defecto
    if (window.brandsData.length === 0) {
        await initializeSampleBrands();
    }
}

async function initializeSampleBrands() {
    window.brandsData = [
        {
            id: 'olaplex',
            name: 'Olaplex',
            description: 'Tratamientos profesionales para reparación capilar',
            logo: '',
            active: true,
            createdAt: new Date().toISOString()
        },
        {
            id: 'kerastase', 
            name: 'Kérastase',
            description: 'Línea de lujo para el cuidado del cabello',
            logo: '',
            active: true,
            createdAt: new Date().toISOString()
        },
        {
            id: 'tigi',
            name: 'Tigi',
            description: 'Productos profesionales para peluquería',
            logo: '',
            active: true,
            createdAt: new Date().toISOString()
        }
    ];

    if (window.firebaseData?.saveBrand) {
        for (const brand of window.brandsData) {
            await window.firebaseData.saveBrand(brand);
        }
    }
}

async function getProductsData() {
    if (!window.firebaseData?.loadProducts) {
        console.error('❌ firebaseData.loadProducts no está disponible');
        return [];
    }

    return await window.firebaseData.loadProducts();
}

async function loadBrandsList() {
    const brandsList = document.getElementById('brandsList');
    if (!brandsList) return;

    if (window.firebaseData?.loadBrands) {
        window.brandsData = await window.firebaseData.loadBrands();
    }

    const brands = window.brandsData || [];
    const products = await getProductsData();
    
    if (brands.length === 0) {
        brandsList.innerHTML = `
            <div class="empty-state">
                <p>No hay marcas creadas</p>
                <button class="btn-primary" data-action="create-first">Crear Primera Marca</button>
            </div>
        `;
        return;
    }

    brandsList.innerHTML = brands.map(brand => {
        const brandProducts = products.filter(p => p.brand === brand.id);
        const safeBrandName = escapeHtml(brand.name || '');
        const safeBrandDescription = escapeHtml(brand.description || 'Sin descripción');
        const safeBrandLogo = sanitizeImageUrl(brand.logo);
        const encodedBrandId = encodeURIComponent(String(brand.id || ''));
        
        return `
            <div class="category-card-admin">
                <div class="category-header">
                    <div class="category-color" style="background-color: #6366f1"></div>
                    <h3>${safeBrandName}</h3>
                    <span class="product-count">${brandProducts.length} productos</span>
                </div>
                <div class="category-body">
                    <p>${safeBrandDescription}</p>
                    <div class="brand-logo-preview">
                        ${safeBrandLogo ? `<img src="${safeBrandLogo}" alt="${safeBrandName}" class="brand-logo-small">` : ''}
                    </div>
                    <div class="category-actions">
                        <button class="btn-secondary" data-action="edit" data-brand-id="${escapeAttr(encodedBrandId)}">Editar</button>
                        <button class="btn-danger" data-action="delete" data-brand-id="${escapeAttr(encodedBrandId)}" ${brandProducts.length > 0 ? 'disabled' : ''}>Eliminar</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function setupBrandsEventListeners() {
    setupBrandsListDelegation();
    setupBrandPageActions();

    const brandForm = document.getElementById('brandForm');
    if (brandForm) {
        brandForm.addEventListener('submit', handleBrandSubmit);
    }
    
    const logoInput = document.getElementById('brandLogo');
    const logoPreview = document.getElementById('logoPreview');
    
    if (logoInput && logoPreview) {
        logoPreview.addEventListener('click', () => logoInput.click());
        logoInput.addEventListener('change', handleLogoUpload);
    }
}

function setupBrandsListDelegation() {
    const brandsList = document.getElementById('brandsList');
    if (!brandsList || brandsList.dataset.listener === 'true') {
        return;
    }

    brandsList.addEventListener('click', function(event) {
        const actionButton = event.target.closest('button[data-action]');
        if (!actionButton) {
            return;
        }

        const action = actionButton.dataset.action;

        if (action === 'create-first') {
            showBrandForm();
            return;
        }

        const encodedBrandId = actionButton.dataset.brandId;
        if (!encodedBrandId) {
            return;
        }

        const brandId = decodeURIComponent(encodedBrandId);

        if (action === 'edit') {
            editBrand(brandId);
        } else if (action === 'delete') {
            deleteBrand(brandId);
        }
    });

    brandsList.dataset.listener = 'true';
}

function handleLogoUpload(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('logoPreview');
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentLogoData = e.target.result;
            const safeLogo = sanitizeImageUrl(currentLogoData);
            preview.innerHTML = safeLogo ? `<img src="${safeLogo}" alt="Preview">` : '<span>🖼️ Haz clic para subir logo</span>';
            preview.classList.add('has-image');
        };
        reader.readAsDataURL(file);
    }
}

function showBrandForm(brandId = null) {
    const modal = document.getElementById('brandFormModal');
    const formTitle = document.getElementById('brandFormTitle');
    const form = document.getElementById('brandForm');
    
    currentLogoData = '';
    
    if (brandId) {
        formTitle.textContent = 'Editar Marca';
        loadBrandData(brandId);
    } else {
        formTitle.textContent = 'Nueva Marca';
        form.reset();
        document.getElementById('logoPreview').innerHTML = '<span>🖼️ Haz clic para subir logo</span>';
        document.getElementById('logoPreview').classList.remove('has-image');
        document.getElementById('brandId').value = '';
        document.getElementById('brandActive').checked = true;
    }
    
    modal.classList.add('active');
}

function hideBrandForm() {
    const modal = document.getElementById('brandFormModal');
    modal.classList.remove('active');
}

function loadBrandData(brandId) {
    const brand = window.brandsData.find(b => b.id === brandId);
    if (!brand) return;
    
    document.getElementById('brandId').value = brand.id;
    document.getElementById('brandName').value = brand.name;
    document.getElementById('brandIdInput').value = brand.id;
    document.getElementById('brandDescription').value = brand.description || '';
    document.getElementById('brandActive').checked = brand.active !== false;
    
    const preview = document.getElementById('logoPreview');
    if (brand.logo) {
        const safeLogo = sanitizeImageUrl(brand.logo);
        preview.innerHTML = safeLogo ? `<img src="${safeLogo}" alt="Preview">` : '<span>🖼️ Haz clic para subir logo</span>';
        preview.classList.add('has-image');
        currentLogoData = safeLogo;
    }
}

async function handleBrandSubmit(event) {
    event.preventDefault();
    
    const brandId = document.getElementById('brandId').value;
    const brandDataId = document.getElementById('brandIdInput').value.toLowerCase().replace(/\s+/g, '-');
    let logo = currentLogoData || '';

    if (logo.startsWith('data:image/') && window.firebase?.uploadBrandLogo) {
        try {
            logo = await window.firebase.uploadBrandLogo(logo, brandDataId);
        } catch (error) {
            console.error('❌ Error subiendo logo de marca:', error);
            showNotification('❌ No se pudo subir el logo de la marca');
            return;
        }
    }

    const brandData = {
        id: brandDataId,
        name: document.getElementById('brandName').value,
        description: document.getElementById('brandDescription').value,
        logo,
        active: document.getElementById('brandActive').checked,
        updatedAt: new Date().toISOString()
    };
    
    if (brandId) {
        await updateBrand(brandId, brandData);
    } else {
        await createBrand(brandData);
    }
}

async function createBrand(brandData) {
    const brands = window.brandsData || [];
    
    // Verificar si ya existe una marca con ese ID
    if (brands.find(b => b.id === brandData.id)) {
        alert('Ya existe una marca con ese ID. Por favor usa un ID único.');
        return;
    }
    
    const newBrand = {
        ...brandData,
        createdAt: new Date().toISOString()
    };

    if (!window.firebaseData?.saveBrand) {
        showNotification('❌ No se pudo guardar: Firebase no disponible');
        return;
    }

    await window.firebaseData.saveBrand(newBrand);

    await loadBrandsList();
    updateBrandsStats();
    hideBrandForm();
    showNotification('✅ Marca creada exitosamente');
}

async function updateBrand(oldId, brandData) {
    const brands = window.brandsData || [];
    const index = brands.findIndex(b => b.id === oldId);
    
    if (index !== -1) {
        // Si cambió el ID, actualizar también los productos
        if (oldId !== brandData.id) {
            await updateProductsBrand(oldId, brandData.id);
        }
        
        brands[index] = {
            ...brands[index],
            ...brandData
        };

        window.brandsData = brands;

        if (!window.firebaseData?.saveBrand) {
            showNotification('❌ No se pudo actualizar: Firebase no disponible');
            return;
        }

        await window.firebaseData.saveBrand(brands[index]);

        await loadBrandsList();
        updateBrandsStats();
        hideBrandForm();
        showNotification('✅ Marca actualizada exitosamente');
    }
}

async function updateProductsBrand(oldBrandId, newBrandId) {
    if (!window.firebaseData?.loadProducts || !window.firebaseData?.saveProduct) {
        return;
    }

    const products = await window.firebaseData.loadProducts();
    const productsToUpdate = products.filter(product => product.brand === oldBrandId);

    for (const product of productsToUpdate) {
        await window.firebaseData.saveProduct({
            ...product,
            brand: newBrandId
        });
    }
}

function editBrand(brandId) {
    showBrandForm(brandId);
}

async function deleteBrand(brandId) {
    const products = await getProductsData();
    const productsWithBrand = products.filter(p => p.brand === brandId);
    
    if (productsWithBrand.length > 0) {
        alert(`No puedes eliminar esta marca porque tiene ${productsWithBrand.length} productos asociados. Primero actualiza esos productos.`);
        return;
    }
    
    if (confirm('¿Estás seguro de que quieres eliminar esta marca?')) {
        if (!window.firebaseData?.deleteBrand) {
            showNotification('❌ No se pudo eliminar: Firebase no disponible');
            return;
        }

        await window.firebaseData.deleteBrand(brandId);

        await loadBrandsList();
        updateBrandsStats();
        showNotification('✅ Marca eliminada exitosamente');
    }
}

async function updateBrandsStats() {
    const brands = window.brandsData || [];
    const products = await getProductsData();
    
    document.getElementById('totalBrands').textContent = brands.length;
    document.getElementById('brandsWithProducts').textContent = 
        brands.filter(brand => products.some(p => p.brand === brand.id)).length;
}

function saveBrands() {
    console.log('ℹ️ saveBrands() no-op en modo Firebase-only');
}

function setupModalClose() {
    const modal = document.getElementById('brandFormModal');
    const modalContent = document.querySelector('.modal-content');
    
    if (modal && modalContent) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                hideBrandForm();
            }
        });
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                hideBrandForm();
            }
        });
        
        modalContent.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--admin-success);
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        z-index: 3000;
        box-shadow: var(--admin-shadow-lg);
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Hacer funciones globales
window.showBrandForm = showBrandForm;
window.hideBrandForm = hideBrandForm;
window.editBrand = editBrand;
window.deleteBrand = deleteBrand;
function initThemeToggle() {
    if (typeof window.initAdminThemeToggle === 'function') {
        window.initAdminThemeToggle();
        return;
    }

    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('admin-theme') || 'light';
    
    // Aplicar tema guardado al cargar
    applyTheme(savedTheme);
    
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = current === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
        });
        
        console.log('✅ Theme toggle configurado en marcas');
    } else {
        console.error('❌ No se encontró el botón themeToggle en marcas');
    }
}

function applyTheme(theme) {
    if (typeof window.applyAdminTheme === 'function') {
        window.applyAdminTheme(theme);
        return;
    }

    // Aplicar atributo data-theme
    document.documentElement.setAttribute('data-theme', theme);
    
    // Guardar preferencia
    localStorage.setItem('admin-theme', theme);
    
    // Actualizar texto del botón
    updateThemeButton(theme);
    
    console.log('🎨 Tema aplicado en marcas:', theme);
}

function updateThemeButton(theme) {
    const themeText = document.querySelector('.theme-text');
    if (themeText) {
        themeText.textContent = theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro';
    }
}

// Actualizar la función initializeAdminBrands para incluir el theme toggle
async function initializeAdminBrands() {
    const hasAccess = await checkAdminAuth();
    if (!hasAccess) {
        return;
    }
    await loadGlobalBrandsData();
    await loadBrandsList();
    updateBrandsStats();
    setupBrandsEventListeners();
    setupModalClose();
    initThemeToggle(); // ← Agregar esta línea
}

function setupBrandPageActions() {
    const logoutBtn = document.getElementById('adminBrandsLogoutBtn');
    if (logoutBtn && logoutBtn.dataset.listener !== 'true') {
        logoutBtn.addEventListener('click', () => {
            if (typeof window.logoutUser === 'function') {
                window.logoutUser();
            }
        });
        logoutBtn.dataset.listener = 'true';
    }

    const viewStoreBtn = document.getElementById('adminBrandsViewStoreBtn');
    if (viewStoreBtn && viewStoreBtn.dataset.listener !== 'true') {
        viewStoreBtn.addEventListener('click', () => {
            window.location.href = '../index.html';
        });
        viewStoreBtn.dataset.listener = 'true';
    }

    const newBrandBtn = document.getElementById('adminBrandsNewBtn');
    if (newBrandBtn && newBrandBtn.dataset.listener !== 'true') {
        newBrandBtn.addEventListener('click', () => showBrandForm());
        newBrandBtn.dataset.listener = 'true';
    }

    const closeBtn = document.getElementById('brandFormCloseBtn');
    if (closeBtn && closeBtn.dataset.listener !== 'true') {
        closeBtn.addEventListener('click', hideBrandForm);
        closeBtn.dataset.listener = 'true';
    }

    const cancelBtn = document.getElementById('brandFormCancelBtn');
    if (cancelBtn && cancelBtn.dataset.listener !== 'true') {
        cancelBtn.addEventListener('click', hideBrandForm);
        cancelBtn.dataset.listener = 'true';
    }
}