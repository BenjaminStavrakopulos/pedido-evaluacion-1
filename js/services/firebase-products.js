// firebase-products.js - Sincronización de productos entre localStorage y Firebase
console.log('🔥 firebase-products.js cargado');

/**
 * Cargar productos desde Firebase o localStorage (fallback)
 */
async function loadProductsFromFirebase() {
    console.log('📥 Cargando productos desde Firebase...');
    
    try {
        // Esperar a que Firebase esté disponible
        if (!window.firebase || !window.firebase.getProducts) {
            console.warn('⚠️ Firebase no disponible, usando localStorage');
            return loadProductsFromLocalStorage();
        }
        
        const products = await window.firebase.getProducts();
        
        if (products && products.length > 0) {
            console.log('✅ Productos cargados desde Firebase:', products.length);
            
            // Guardar en localStorage para cache
            localStorage.setItem('hairia_products', JSON.stringify(products));
            window.productsData = products;
            
            return products;
        } else {
            console.log('⚠️ No hay productos en Firebase, creando datos de ejemplo...');
            return await createDefaultProducts();
        }
    } catch (error) {
        console.error('❌ Error cargando de Firebase:', error);
        console.log('📦 Usando localStorage como fallback...');
        return loadProductsFromLocalStorage();
    }
}

/**
 * Cargar productos desde localStorage
 */
function loadProductsFromLocalStorage() {
    console.log('📦 Cargando productos desde localStorage...');
    
    const stored = localStorage.getItem('hairia_products');
    if (stored) {
        try {
            window.productsData = JSON.parse(stored);
            console.log('✅ Productos cargados de localStorage:', window.productsData.length);
            return window.productsData;
        } catch (error) {
            console.error('Error parseando localStorage:', error);
        }
    }
    
    // Si no hay datos, retornar array vacío (se inicializarán después)
    window.productsData = [];
    return [];
}

/**
 * Crear productos predeterminados en Firebase
 */
async function createDefaultProducts() {
    console.log('➕ Creando productos predeterminados en Firebase...');
    
    const defaultProducts = [
        {
            name: "Shampoo Reparador Intenso",
            price: 19990,
            category: "shampoo",
            featured: true,
            description: "Shampoo con keratina para cabello dañado y quebradizo",
            image: "",
            stock: 50,
            sku: "SHR-001",
            active: true,
            discountType: "none",
            discountPercent: null,
            discountAmount: null
        },
        {
            name: "Acondicionador Hidratante", 
            price: 14990,
            category: "acondicionador",
            featured: false,
            description: "Acondicionador profundo con aceite de argán",
            image: "",
            stock: 45,
            sku: "ACH-001",
            active: true,
            discountType: "none",
            discountPercent: null,
            discountAmount: null
        },
        {
            name: "Mascarilla Reconstructora",
            price: 24990,
            category: "tratamiento",
            featured: true,
            description: "Tratamiento intensivo nocturno para reparación capilar",
            image: "",
            stock: 30,
            sku: "MAS-001",
            active: true,
            discountType: "none",
            discountPercent: null,
            discountAmount: null
        },
        {
            name: "Aceite Capilar Sellador",
            price: 17990,
            category: "aceite",
            featured: false,
            description: "Aceite nutritivo para puntas abiertas y frizz",
            image: "",
            stock: 25,
            sku: "ACE-001",
            active: true,
            discountType: "none",
            discountPercent: null,
            discountAmount: null
        }
    ];
    
    const createdProducts = [];
    
    try {
        for (const product of defaultProducts) {
            const createdProduct = await window.firebase.createProduct(product);
            createdProducts.push(createdProduct);
        }
        
        console.log('✅ Productos predeterminados creados:', createdProducts.length);
        
        // Guardar en localStorage
        localStorage.setItem('hairia_products', JSON.stringify(createdProducts));
        window.productsData = createdProducts;
        
        return createdProducts;
    } catch (error) {
        console.error('❌ Error creando productos predeterminados:', error);
        return [];
    }
}

/**
 * Sincronizar un producto a Firebase
 */
async function syncProductToFirebase(product) {
    console.log('🔄 Sincronizando producto a Firebase:', product.name);
    
    try {
        if (!window.firebase) {
            console.warn('⚠️ Firebase no disponible');
            return false;
        }
        
        if (product.id && product.id.length > 20) {
            // Es un ID de Firestore (string largo)
            await window.firebase.updateProduct(product.id, product);
        } else {
            // Es un ID numérico, crear como nuevo
            const newProduct = await window.firebase.createProduct(product);
            product.id = newProduct.id;
        }
        
        console.log('✅ Producto sincronizado:', product.id);
        return true;
    } catch (error) {
        console.error('❌ Error sincronizando producto:', error);
        return false;
    }
}

/**
 * Sincronizar todos los productos a Firebase
 */
async function syncAllProductsToFirebase() {
    console.log('🔄 Sincronizando todos los productos a Firebase...');
    
    if (!window.productsData || !Array.isArray(window.productsData)) {
        console.warn('❌ No hay productos para sincronizar');
        return false;
    }
    
    let synced = 0;
    
    for (const product of window.productsData) {
        try {
            await syncProductToFirebase(product);
            synced++;
        } catch (error) {
            console.error('Error sincronizando producto:', product.name, error);
        }
    }
    
    console.log(`✅ Sincronización completada: ${synced}/${window.productsData.length}`);
    return synced === window.productsData.length;
}

/**
 * Eliminar producto de Firebase
 */
async function deleteProductFromFirebase(productId) {
    console.log('🗑️ Eliminando producto de Firebase:', productId);
    
    try {
        if (!window.firebase) {
            console.warn('⚠️ Firebase no disponible');
            return false;
        }
        
        await window.firebase.deleteProduct(productId);
        console.log('✅ Producto eliminado:', productId);
        return true;
    } catch (error) {
        console.error('❌ Error eliminando producto:', error);
        return false;
    }
}

/**
 * Actualizar producto en Firebase y localStorage
 */
async function updateProductInFirebase(productId, updates) {
    console.log('📝 Actualizando producto:', productId);
    
    try {
        // Actualizar en Firebase
        if (window.firebase) {
            await window.firebase.updateProduct(productId, updates);
        }
        
        // Actualizar en localStorage
        const localProducts = JSON.parse(localStorage.getItem('hairia_products')) || [];
        const index = localProducts.findIndex(p => p.id === productId);
        
        if (index !== -1) {
            localProducts[index] = { ...localProducts[index], ...updates };
            localStorage.setItem('hairia_products', JSON.stringify(localProducts));
        }
        
        // Actualizar en memoria
        if (window.productsData) {
            const productIndex = window.productsData.findIndex(p => p.id === productId);
            if (productIndex !== -1) {
                window.productsData[productIndex] = { 
                    ...window.productsData[productIndex], 
                    ...updates 
                };
            }
        }
        
        console.log('✅ Producto actualizado en todos los sistemas');
        return true;
    } catch (error) {
        console.error('❌ Error actualizando producto:', error);
        return false;
    }
}

// Exponer funciones globalmente
window.firebaseProducts = {
    loadProductsFromFirebase,
    loadProductsFromLocalStorage,
    createDefaultProducts,
    syncProductToFirebase,
    syncAllProductsToFirebase,
    deleteProductFromFirebase,
    updateProductInFirebase
};

console.log('✅ Firebase Products Helper cargado');
