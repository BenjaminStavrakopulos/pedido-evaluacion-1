// admin-products-simple.js - Versión simplificada y funcional
console.log('🔥 admin-products-simple.js cargado');

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM cargado');
    initializeAdminProducts();
});

// Variables globales
window.productsData = [];
window.categories = [];
window.brandsData = [];
let currentImageData = '';
const LAST_USED_BRAND_KEY = 'hairia_admin_last_brand';

const DEFAULT_BRANDS = [
    { id: 'olaplex', name: 'Olaplex', description: 'Tratamientos profesionales para reparación capilar', logo: '', active: true },
    { id: 'kerastase', name: 'Kérastase', description: 'Línea de lujo para el cuidado del cabello', logo: '', active: true },
    { id: 'tigi', name: 'Tigi', description: 'Productos profesionales para peluquería', logo: '', active: true },
    { id: 'k18', name: 'K18', description: 'Reparación molecular para cabello dañado', logo: '', active: true },
    { id: 'living-proof', name: 'Living Proof', description: 'Ciencia capilar avanzada para resultados visibles', logo: '', active: true },
    { id: 'revlon', name: 'Revlon', description: 'Coloración y cuidado capilar profesional', logo: '', active: true },
    { id: 'moroccanoil', name: 'Moroccanoil', description: 'Nutrición capilar con aceite de argán', logo: '', active: true },
    { id: 'dabalash', name: 'Dabalash', description: 'Cuidado especializado para pestañas y cejas', logo: '', active: true }
];

function ensureBrandsData(rawBrands) {
    const existingBrands = Array.isArray(rawBrands) ? rawBrands : [];
    const brandMap = new Map(existingBrands.map(brand => [brand.id, brand]));

    DEFAULT_BRANDS.forEach(defaultBrand => {
        if (!brandMap.has(defaultBrand.id)) {
            brandMap.set(defaultBrand.id, {
                ...defaultBrand,
                createdAt: new Date().toISOString()
            });
        }
    });

    return Array.from(brandMap.values());
}

async function initializeAdminProducts() {
    console.log('🚀 Inicializando admin products...');
    const hasAccess = await checkAdminAuth();
    if (!hasAccess) {
        return;
    }
    await loadProductsFromFirebase();  // ✅ ESPERAR a que carguen los productos
    updateStats();  // ✅ Ahora sí hay productos para contar
    setupEventListeners();
    setupModalHandlers();
    setupProductsTableDelegation();
    setupProductsPageActions();
    console.log('✅ Admin products inicializado');
}

function setupProductsTableDelegation() {
    const tableBody = document.getElementById('productsTableBody');
    if (!tableBody || tableBody.dataset.listener === 'true') return;

    tableBody.addEventListener('click', function(event) {
        const actionButton = event.target.closest('button[data-action][data-product-id]');
        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const productId = actionButton.dataset.productId;

        if (action === 'edit') {
            editProduct(productId);
        } else if (action === 'toggle') {
            toggleProductStatus(productId);
        } else if (action === 'delete') {
            deleteProduct(productId);
        }
    });

    tableBody.dataset.listener = 'true';
}

function setupProductsPageActions() {
    const newProductBtn = document.getElementById('newProductBtn');
    if (newProductBtn && newProductBtn.dataset.listener !== 'true') {
        newProductBtn.addEventListener('click', () => showProductForm());
        newProductBtn.dataset.listener = 'true';
    }

    const closeBtn = document.getElementById('productModalCloseBtn');
    if (closeBtn && closeBtn.dataset.listener !== 'true') {
        closeBtn.addEventListener('click', hideProductForm);
        closeBtn.dataset.listener = 'true';
    }

    const cancelBtn = document.getElementById('productModalCancelBtn');
    if (cancelBtn && cancelBtn.dataset.listener !== 'true') {
        cancelBtn.addEventListener('click', hideProductForm);
        cancelBtn.dataset.listener = 'true';
    }

    const viewStoreBtn = document.getElementById('adminProductsViewStoreBtn');
    if (viewStoreBtn && viewStoreBtn.dataset.listener !== 'true') {
        viewStoreBtn.addEventListener('click', () => {
            window.location.href = '../index.html';
        });
        viewStoreBtn.dataset.listener = 'true';
    }

    const logoutBtn = document.getElementById('adminProductsLogoutBtn');
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
    console.log('🔐 Verificando admin auth...');
    const userLS = JSON.parse(localStorage.getItem('hairia_current_user') || 'null');
    const userSS = JSON.parse(sessionStorage.getItem('hairia_current_user') || 'null');
    const user = userLS || userSS;

    if (!user || !user.uid) {
        console.error('❌ Acceso denegado: solo administradores');
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
            console.error('❌ Acceso denegado: solo administradores');
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

    } catch (error) {
        console.warn('⚠️ No se pudo verificar admin en Firebase:', error);
        window.location.href = '../login.html';
        return false;
    }

    console.log('✅ Acceso admin permitido');
    return true;
}

// Cargar productos desde Firebase
async function loadProductsFromFirebase() {
    console.log('📥 Cargando productos desde Firebase...');
    
    // Esperar a que admin-firebase esté disponible
    if (window.adminFirebase && window.adminFirebase.loadAdminProducts) {
        await window.adminFirebase.loadAdminProducts();
    }
    
    // Cargar también categorías y marcas
    await loadGlobalData();
    loadCategoriesDropdown();
    loadBrandsDropdown();
    loadProductsTable();
}

async function loadGlobalData() {
    window.productsData = Array.isArray(window.productsData) ? window.productsData : [];

    if (window.firebaseData?.loadCategories) {
        window.categories = await window.firebaseData.loadCategories();
    } else {
        window.categories = [];
    }

    if (window.firebaseData?.loadBrands) {
        window.brandsData = ensureBrandsData(await window.firebaseData.loadBrands());
    } else {
        window.brandsData = ensureBrandsData([]);
    }
    
    if (window.categories.length === 0) {
        window.categories = [
            { id: 'shampoo', name: 'Shampoo', color: '#1a1a1a' },
            { id: 'acondicionador', name: 'Acondicionador', color: '#2d2d2d' },
            { id: 'tratamiento', name: 'Tratamientos', color: '#404040' }
        ];
    }
    
    console.log('📦 Datos cargados:', {productos: window.productsData.length, categorias: window.categories.length, marcas: window.brandsData.length});
}

function loadProductsTable() {
    const tableBody = document.getElementById('productsTableBody');
    if (!tableBody) return;
    
    if (window.productsData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8">No hay productos</td></tr>';
        return;
    }
    
    tableBody.innerHTML = window.productsData.map(product => `
        <tr>
            <td>
                ${product.image ? `<img src="${product.image}" alt="${product.name}" style="width: 40px; height: 40px; object-fit: cover;">` : '📷'}
            </td>
            <td>
                <strong>${product.name}</strong><br>
                <small>${product.description?.substring(0, 50) || ''}...</small>
            </td>
            <td>${product.sku || 'N/A'}</td>
            <td><strong>$${product.price.toLocaleString('es-CL')}</strong></td>
            <td><span class="category-tag">${getCategoryName(product.category)}</span></td>
            <td>${product.stock}</td>
            <td><span class="status-badge ${product.active !== false ? 'status-active' : 'status-inactive'}">${product.active !== false ? 'Activo' : 'Inactivo'}</span></td>
            <td>
                <div class="table-actions">
                    <button class="table-actions-btn" title="Editar" data-action="edit" data-product-id="${product.id}">✏️</button>
                    <button class="table-actions-btn" title="Toggle" data-action="toggle" data-product-id="${product.id}">👁️</button>
                    <button class="table-actions-btn delete-btn" title="Eliminar" data-action="delete" data-product-id="${product.id}">🗑️</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function getCategoryName(categoryId) {
    const cat = window.categories.find(c => c.id === categoryId);
    return cat ? cat.name : categoryId;
}

function loadCategoriesDropdown() {
    const select = document.getElementById('productCategory');
    if (!select) return;
    
    select.innerHTML = '<option value="">Seleccionar</option>' + 
        window.categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
}

function loadBrandsDropdown() {
    const select = document.getElementById('productBrand');
    if (!select) return;

    const activeBrands = (window.brandsData || []).filter(brand => brand.active !== false);
    select.innerHTML = '<option value="">Sin marca (opcional)</option>' +
        activeBrands.map(brand => `<option value="${brand.id}">${brand.name}</option>`).join('');
}

function getLastUsedBrand() {
    return localStorage.getItem(LAST_USED_BRAND_KEY) || '';
}

function saveLastUsedBrand(brandId) {
    localStorage.setItem(LAST_USED_BRAND_KEY, brandId || '');
}

function updateStats() {
    const products = window.productsData || [];
    console.log('📊 Actualizando stats con', products.length, 'productos');
    document.getElementById('totalProducts').textContent = products.length;
    document.getElementById('featuredProducts').textContent = products.filter(p => p.featured).length;
    document.getElementById('lowStockProducts').textContent = products.filter(p => p.stock <= (p.minStock || 5)).length;
    document.getElementById('discountProducts').textContent = products.filter(p => p.discountType !== 'none').length;
}

// Mostrar/ocultar campos de descuento según el tipo
function toggleDiscountFields() {
    const discountType = document.getElementById('discountType').value;
    const discountFields = document.getElementById('discountFields');
    const percentageField = document.getElementById('percentageField');
    const amountField = document.getElementById('amountField');
    
    if (discountType === 'none') {
        discountFields.style.display = 'none';
    } else {
        discountFields.style.display = 'grid';
        if (discountType === 'percentage') {
            percentageField.style.display = 'block';
            amountField.style.display = 'none';
        } else if (discountType === 'amount') {
            percentageField.style.display = 'none';
            amountField.style.display = 'block';
        }
    }
    
    calculateFinalPrice();
}

// Calcular precio final con descuento
function calculateFinalPrice() {
    const priceInput = document.getElementById('productPrice');
    const discountType = document.getElementById('discountType').value;
    const discountPercent = document.getElementById('productDiscountPercent');
    const discountAmount = document.getElementById('productDiscountAmount');
    const finalPriceInput = document.getElementById('finalPrice');
    
    if (!priceInput || !finalPriceInput) return;
    
    const price = parseInt(priceInput.value) || 0;
    let finalPrice = price;
    
    if (discountType === 'percentage') {
        const percent = parseInt(discountPercent?.value) || 0;
        finalPrice = Math.round(price - (price * percent / 100));
    } else if (discountType === 'amount') {
        const amount = parseInt(discountAmount?.value) || 0;
        finalPrice = Math.max(0, price - amount);
    }
    
    // Mostrar precio final formateado
    finalPriceInput.value = `$${finalPrice.toLocaleString('es-CL')}`;
    console.log('💰 Precio final calculado:', finalPrice);
}

function setupEventListeners() {
    const form = document.getElementById('productForm');
    if (form) {
        form.addEventListener('submit', handleProductSubmit);
        console.log('✅ Form listener configurado');
    }
    
    // Event listeners para descuentos y precio
    const discountType = document.getElementById('discountType');
    const productPrice = document.getElementById('productPrice');
    const discountPercent = document.getElementById('productDiscountPercent');
    const discountAmount = document.getElementById('productDiscountAmount');
    
    if (discountType) {
        discountType.addEventListener('change', toggleDiscountFields);
    }
    
    if (productPrice) {
        productPrice.addEventListener('change', calculateFinalPrice);
        productPrice.addEventListener('input', calculateFinalPrice);
    }
    
    if (discountPercent) {
        discountPercent.addEventListener('change', calculateFinalPrice);
        discountPercent.addEventListener('input', calculateFinalPrice);
    }
    
    if (discountAmount) {
        discountAmount.addEventListener('change', calculateFinalPrice);
        discountAmount.addEventListener('input', calculateFinalPrice);
    }
}

function setupModalHandlers() {
    const modal = document.getElementById('productFormModal');
    if (modal) {
        const closeBtn = modal.querySelector('.close-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', hideProductForm);
        }
        // Cerrar modal al hacer click fuera
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                hideProductForm();
            }
        });
    }
    
    // Manejador de cambio de imagen
    const imageInput = document.getElementById('productImage');
    const imagePreview = document.getElementById('imagePreview');
    
    if (imageInput && imagePreview) {
        // Click en el contenedor abre el input
        imagePreview.parentElement.addEventListener('click', function() {
            imageInput.click();
        });
        
        // Cambio de imagen
        imageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                // Verificar tamaño
                if (file.size > 1048576) {
                    console.warn('⚠️ Imagen muy grande (' + (file.size / 1024).toFixed(2) + ' KB), comprimiendo...');
                    compressImage(file, (compressedBase64) => {
                        currentImageData = compressedBase64;
                        imagePreview.innerHTML = `<img src="${currentImageData}" alt="Preview">`;
                        imagePreview.classList.add('has-image');
                        console.log('✅ Imagen comprimida (tamaño: ' + (compressedBase64.length / 1024).toFixed(2) + ' KB)');
                    });
                } else {
                    // Imagen pequeña, usar directamente
                    const reader = new FileReader();
                    reader.onload = function(event) {
                        currentImageData = event.target.result;
                        imagePreview.innerHTML = `<img src="${currentImageData}" alt="Preview">`;
                        imagePreview.classList.add('has-image');
                        console.log('✅ Imagen cargada (tamaño: ' + (file.size / 1024).toFixed(2) + ' KB)');
                    };
                    reader.readAsDataURL(file);
                }
            }
        });
    }
}

// Mostrar formulario
function showProductForm(productId = null) {
    const modal = document.getElementById('productFormModal');
    const form = document.getElementById('productForm');
    const title = document.getElementById('productFormTitle');
    const imagePreview = document.getElementById('imagePreview');
    
    if (!modal || !form) {
        console.error('❌ Modal o formulario no existe');
        return;
    }
    
    // Limpiar formulario
    form.reset();
    currentImageData = '';
    document.getElementById('productId').value = '';
    title.textContent = 'Nuevo Producto';
    
    // Limpiar preview de imagen
    if (imagePreview) {
        imagePreview.innerHTML = '<span>📷 Haz clic para subir imagen</span>';
        imagePreview.classList.remove('has-image');
    }
    
    // Si es edición, cargar datos del producto
    if (productId) {
        const product = window.productsData.find(p => p.id === productId);
        if (product) {
            document.getElementById('productId').value = product.id;
            document.getElementById('productName').value = product.name || '';
            document.getElementById('productSKU').value = product.sku || '';
            document.getElementById('productPrice').value = product.price || '';
            document.getElementById('productCategory').value = product.category || '';
            document.getElementById('productBrand').value = product.brand || '';
            document.getElementById('productStock').value = product.stock || '';
            document.getElementById('productDescription').value = product.description || '';
            
            // Cargar descuentos si existen
            if (product.discountType) {
                document.getElementById('discountType').value = product.discountType;
                if (product.discountType === 'percentage' && product.discountPercent) {
                    document.getElementById('productDiscountPercent').value = product.discountPercent;
                } else if (product.discountType === 'amount' && product.discountAmount) {
                    document.getElementById('productDiscountAmount').value = product.discountAmount;
                }
                toggleDiscountFields();
            }
            
            // Cargar checkboxes
            document.getElementById('productFeatured').checked = product.featured || false;
            document.getElementById('productActive').checked = product.active !== false;
            
            // Cargar imagen si existe
            if (product.image) {
                currentImageData = product.image;
                if (imagePreview) {
                    imagePreview.innerHTML = `<img src="${currentImageData}" alt="Preview">`;
                    imagePreview.classList.add('has-image');
                }
            }
            
            title.textContent = 'Editar Producto: ' + product.name;
            console.log('📝 Edición: ' + product.name);
        }
    } else {
        const brandSelect = document.getElementById('productBrand');
        if (brandSelect) {
            brandSelect.value = getLastUsedBrand();
        }
    }
    
    modal.classList.add('active');
    // Calcular precio final después de cargar datos
    setTimeout(calculateFinalPrice, 100);
    console.log('✅ Modal abierto');
}

window.showProductForm = showProductForm;

// Cerrar formulario
function hideProductForm() {
    const modal = document.getElementById('productFormModal');
    if (modal) {
        modal.classList.remove('active');
    }
    currentImageData = '';
}

window.hideProductForm = hideProductForm;

// MANEJAR SUBMIT
function handleProductSubmit(event) {
    event.preventDefault();
    console.log('📝 Submitting form...');
    
    const name = document.getElementById('productName')?.value?.trim();
    const sku = document.getElementById('productSKU')?.value?.trim();
    const price = parseInt(document.getElementById('productPrice')?.value);
    const category = document.getElementById('productCategory')?.value;
    const brand = (document.getElementById('productBrand')?.value || '').trim();
    const stock = parseInt(document.getElementById('productStock')?.value);
    const description = document.getElementById('productDescription')?.value?.trim();
    
    // Datos de descuento
    const discountType = document.getElementById('discountType')?.value || 'none';
    const discountPercent = discountType === 'percentage' ? parseInt(document.getElementById('productDiscountPercent')?.value) || 0 : 0;
    const discountAmount = discountType === 'amount' ? parseInt(document.getElementById('productDiscountAmount')?.value) || 0 : 0;
    
    // Checkboxes
    const featured = document.getElementById('productFeatured')?.checked || false;
    const active = document.getElementById('productActive')?.checked !== false;
    
    console.log({name, sku, price, category, brand, stock, description, discountType, discountPercent, discountAmount, featured, active});
    
    if (!name || !sku || !price || !category || !description) {
        alert('❌ Por favor completa todos los campos requeridos (Nombre, SKU, Precio, Categoría, Descripción)');
        return;
    }

    saveLastUsedBrand(brand);
    
    const productId = document.getElementById('productId')?.value;
    let productToSave;
    
    if (productId) {
        // Actualizar
        const productIndex = window.productsData.findIndex(p => p.id === productId);
        if (productIndex !== -1) {
            productToSave = {
                ...window.productsData[productIndex],
                name,
                sku,
                price,
                category,
                brand,
                stock,
                description,
                discountType,
                discountPercent,
                discountAmount,
                featured,
                active,
                image: currentImageData || window.productsData[productIndex].image
            };
            console.log('✅ Producto actualizado');
        }
    } else {
        // Crear
        productToSave = {
            id: Date.now().toString(),
            name,
            sku,
            price,
            category,
            brand,
            stock,
            description,
            discountType,
            discountPercent,
            discountAmount,
            featured,
            active,
            image: currentImageData || '',
            createdAt: new Date().toISOString()
        };
        console.log('✅ Producto creado:', productToSave);
    }
    
    // Guardar en Firebase
    if (window.adminFirebase && window.adminFirebase.saveProductToFirebase) {
        console.log('💾 Guardando en Firebase...');
        window.adminFirebase.saveProductToFirebase(productToSave).then(() => {
            console.log('✅ Producto guardado en Firebase');
            
            // Recargar datos desde Firebase
            if (window.adminFirebase && window.adminFirebase.loadAdminProducts) {
                window.adminFirebase.loadAdminProducts().then(() => {
                    console.log('✅ Datos recargar desde Firebase');
                    loadProductsTable();
                    updateStats();
                    hideProductForm();
                    showNotification('✅ ¡Producto guardado exitosamente!');
                });
            } else {
                loadProductsTable();
                updateStats();
                hideProductForm();
                showNotification('✅ ¡Producto guardado exitosamente!');
            }
        }).catch((error) => {
            console.error('❌ Error guardando:', error);
            showNotification('❌ Error al guardar el producto');
        });
    } else {
        showNotification('❌ Firebase no disponible para guardar producto');
    }
}

// Editar producto
function editProduct(productId) {
    console.log('Editando:', productId);
    const product = window.productsData.find(p => p.id === productId);
    if (product) {
        document.getElementById('productName').value = product.name;
        document.getElementById('productSKU').value = product.sku || '';
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productCategory').value = product.category;
        document.getElementById('productStock').value = product.stock;
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productId').value = productId;
        
        showProductForm(productId);
    }
}

window.editProduct = editProduct;

// Eliminar producto
function deleteProduct(productId) {
    if (confirm('¿Estás seguro que quieres eliminar este producto?')) {
        console.log('🗑️ Eliminando producto:', productId);
        
        // Eliminar de Firebase
        if (window.adminFirebase && window.adminFirebase.deleteProductFromFirebase) {
            window.adminFirebase.deleteProductFromFirebase(productId).then(() => {
                console.log('✅ Producto eliminado de Firebase');
                // Recargar desde Firebase
                if (window.adminFirebase && window.adminFirebase.loadAdminProducts) {
                    window.adminFirebase.loadAdminProducts().then(() => {
                        loadProductsTable();
                        updateStats();
                        showNotification('✅ Producto eliminado');
                    });
                } else {
                    loadProductsTable();
                    updateStats();
                    showNotification('✅ Producto eliminado');
                }
            });
        } else {
            showNotification('❌ Firebase no disponible para eliminar');
        }
    }
}

window.deleteProduct = deleteProduct;

// Alternar estado del producto
function toggleProductStatus(productId) {
    const product = window.productsData.find(p => p.id === productId);
    if (product) {
        product.active = product.active !== false ? false : true;
        console.log('👁️ Alternando estado:', productId, 'Nuevo estado:', product.active);
        
        // Guardar en Firebase
        if (window.adminFirebase && window.adminFirebase.saveProductToFirebase) {
            window.adminFirebase.saveProductToFirebase(product).then(() => {
                console.log('✅ Estado guardado en Firebase');
                // Recargar desde Firebase
                if (window.adminFirebase && window.adminFirebase.loadAdminProducts) {
                    window.adminFirebase.loadAdminProducts().then(() => {
                        loadProductsTable();
                        showNotification('✅ Estado del producto actualizado');
                    });
                } else {
                    loadProductsTable();
                    showNotification('✅ Estado del producto actualizado');
                }
            });
        } else {
            showNotification('❌ Firebase no disponible para actualizar estado');
        }
    }
}

window.toggleProductStatus = toggleProductStatus;

// Mostrar notificación
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

// Comprimir imagen para que no exceda límite de Firestore (1MB)
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function(event) {
        const img = new Image();
        img.src = event.target.result;
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Redimensionar si es muy grande
            if (width > 1200) {
                height = Math.round((height * 1200) / width);
                width = 1200;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            
            // Reducir calidad iterativamente hasta que quepa en Firestore
            let quality = 0.8;
            let compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            
            while (compressedBase64.length > 900000 && quality > 0.1) {
                quality -= 0.1;
                compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            }
            
            callback(compressedBase64);
        };
    };
}

console.log('✅ admin-products-simple.js listo');
