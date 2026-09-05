// admin-firebase.js - Sincronización de admin-products con Firebase
console.log('🔥 admin-firebase.js cargado');

/**
 * Cargar todos los productos desde Firebase para admin
 */
async function loadAdminProducts() {
    console.log('📥 Cargando productos para admin desde Firebase...');
    
    try {
        if (!window.firebase || !window.firebase.getProducts) {
            throw new Error('Firebase no disponible para admin productos');
        }
        
        const products = await window.firebase.getProducts();
        
        if (products && products.length > 0) {
            console.log('✅ Productos cargados desde Firebase:', products.length);
            window.productsData = products;
            return products;
        } else {
            console.log('⚠️ No hay productos en Firebase');
            window.productsData = [];
            return [];
        }
    } catch (error) {
        console.error('❌ Error cargando productos:', error);
        window.productsData = [];
        return [];
    }
}

/**
 * Cargar productos desde localStorage (fallback)
 */
function loadAdminProductsLocal() {
    console.warn('⚠️ loadAdminProductsLocal deshabilitado en modo Firebase-only');
    window.productsData = [];
    return window.productsData;
}

/**
 * Guardar producto en Firebase (crear o actualizar)
 */
async function saveProductToFirebase(product) {
    console.log('💾 Guardando producto en Firebase:', product.name);
    
    try {
        if (!window.firebase) {
            console.warn('⚠️ Firebase no disponible');
            return false;
        }
        
        let savedProduct;
        
        if (product.id && product.id.length > 20) {
            // Es un ID de Firestore, actualizar
            await window.firebase.updateProduct(product.id, product);
            savedProduct = product;
        } else {
            // Crear nuevo en Firebase
            const newProduct = await window.firebase.createProduct(product);
            savedProduct = newProduct;
        }
        
        // Actualizar en memoria
        const memIndex = window.productsData.findIndex(p => p.id === savedProduct.id);
        if (memIndex !== -1) {
            window.productsData[memIndex] = savedProduct;
        } else {
            window.productsData.push(savedProduct);
        }
        
        console.log('✅ Producto guardado exitosamente:', savedProduct.id);
        return savedProduct;
        
    } catch (error) {
        console.error('❌ Error guardando producto:', error);
        return false;
    }
}

/**
 * Eliminar producto en Firebase
 */
async function deleteProductFromFirebase(productId) {
    console.log('🗑️ Eliminando producto de Firebase:', productId);
    
    try {
        if (!window.firebase) {
            console.warn('⚠️ Firebase no disponible');
            return false;
        }
        
        await window.firebase.deleteProduct(productId);
        
        // Remover de memoria
        window.productsData = window.productsData.filter(p => p.id !== productId);
        
        console.log('✅ Producto eliminado exitosamente:', productId);
        return true;
        
    } catch (error) {
        console.error('❌ Error eliminando producto:', error);
        return false;
    }
}

/**
 * Sincronizar todos los productos locales a Firebase
 */
async function syncAllProductsToFirebase() {
    console.log('🔄 Sincronizando todos los productos a Firebase...');
    
    if (!window.productsData || !Array.isArray(window.productsData)) {
        console.warn('❌ No hay productos para sincronizar');
        return { success: 0, failed: 0 };
    }
    
    let success = 0;
    let failed = 0;
    
    for (const product of window.productsData) {
        try {
            const result = await saveProductToFirebase(product);
            if (result) {
                success++;
            } else {
                failed++;
            }
        } catch (error) {
            console.error('Error sincronizando producto:', product.name, error);
            failed++;
        }
    }
    
    const summary = {
        success,
        failed,
        total: window.productsData.length,
        percentage: Math.round((success / window.productsData.length) * 100)
    };
    
    console.log(`✅ Sincronización completada: ${success}/${window.productsData.length} (${summary.percentage}%)`);
    return summary;
}

/**
 * Obtener estadísticas de productos
 */
async function getProductStats() {
    console.log('📊 Obteniendo estadísticas de productos...');
    
    try {
        const products = window.productsData || [];
        
        const stats = {
            total: products.length,
            active: products.filter(p => p.active !== false).length,
            featured: products.filter(p => p.featured).length,
            byCategory: {},
            lowStock: products.filter(p => p.stock < 10),
            noImage: products.filter(p => !p.image || p.image === '')
        };
        
        // Agrupar por categoría
        products.forEach(product => {
            const cat = product.category || 'sin categoría';
            stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
        });
        
        console.log('📊 Estadísticas:', stats);
        return stats;
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        return {};
    }
}

// Exponer funciones globalmente
window.adminFirebase = {
    loadAdminProducts,
    loadAdminProductsLocal,
    saveProductToFirebase,
    deleteProductFromFirebase,
    syncAllProductsToFirebase,
    getProductStats
};

console.log('✅ Admin Firebase Helper cargado');
