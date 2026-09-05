// Modal de detalle de producto para products.html
console.log('Cargando sistema de modal para products.html...');

function openProductModal(productId) {
    console.log('Abriendo modal para producto ID:', productId);

    const product = window.productsData.find(p => p.id === productId);
    if (!product) {
        console.log('Producto no encontrado');
        return;
    }

    console.log('Producto encontrado:', product.name);

    document.getElementById('modalProductName').textContent = product.name;
    document.getElementById('modalProductPrice').textContent = formatCLP(product.price);
    document.getElementById('modalProductCategory').textContent = getCategoryName(product.category);
    document.getElementById('modalProductDescription').textContent = product.description;
    document.getElementById('modalProductSKU').textContent = product.sku || 'N/A';
    document.getElementById('modalProductStock').textContent = product.stock;
    document.getElementById('modalProductQuantity').textContent = product.quantity && product.unit
        ? `${product.quantity} ${product.unit}`
        : 'N/A';

    const productImage = document.getElementById('modalProductImage');
    const imagePlaceholder = document.getElementById('modalImagePlaceholder');

    if (product.image) {
        productImage.src = product.image;
        productImage.style.display = 'block';
        imagePlaceholder.style.display = 'none';
    } else {
        productImage.style.display = 'none';
        imagePlaceholder.style.display = 'flex';
    }

    const ingredientsSection = document.getElementById('modalIngredientsSection');
    const ingredientsText = document.getElementById('modalProductIngredients');
    if (product.ingredients) {
        ingredientsText.textContent = product.ingredients;
        ingredientsSection.style.display = 'block';
    } else {
        ingredientsSection.style.display = 'none';
    }

    const usageSection = document.getElementById('modalUsageSection');
    const usageText = document.getElementById('modalProductUsage');
    if (product.usage) {
        usageText.textContent = product.usage;
        usageSection.style.display = 'block';
    } else {
        usageSection.style.display = 'none';
    }

    const addToCartBtn = document.getElementById('modalAddToCart');
    const newAddToCartBtn = addToCartBtn.cloneNode(true);
    addToCartBtn.replaceWith(newAddToCartBtn);
    const stock = Number.parseInt(product.stock, 10);
    const outOfStock = product.active === false || (Number.isFinite(stock) && stock <= 0);
    newAddToCartBtn.disabled = outOfStock;
    newAddToCartBtn.textContent = outOfStock ? 'Agotado' : 'Agregar al Carrito';
    newAddToCartBtn.classList.toggle('out-of-stock-button', outOfStock);
    newAddToCartBtn.addEventListener('click', function(event) {
        event.stopPropagation();
        if (outOfStock) return;
        addToCart(product);
        closeProductModal();
    });

    const modal = document.getElementById('productModal');
    modal.classList.add('active');
    console.log('Modal activado');
    document.body.style.overflow = 'hidden';
}

function closeProductModal() {
    const modal = document.getElementById('productModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    console.log('Modal cerrado');
}

function getCategoryName(categoryId) {
    const category = (window.categories || []).find(cat => cat.id === categoryId);
    return category ? category.name : categoryId;
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('Configurando modal para products.html...');

    const modalOverlay = document.getElementById('modalOverlay');
    const modalClose = document.getElementById('modalClose');

    if (modalOverlay) {
        modalOverlay.addEventListener('click', closeProductModal);
        console.log('Overlay configurado');
    }

    if (modalClose) {
        modalClose.addEventListener('click', closeProductModal);
        console.log('Boton cerrar configurado');
    }

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeProductModal();
        }
    });

    console.log('Modal para products.html completamente configurado');
});

window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.getCategoryName = getCategoryName;
