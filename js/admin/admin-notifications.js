// admin-notifications.js - Sistema de notificaciones para panel admin
console.log('🔔 admin-notifications.js cargado');

// Actualizar badge de órdenes en el sidebar
function updateOrdersNotificationBadge() {
    const count = parseInt(localStorage.getItem('hairia_pending_orders_count') || '0');
    
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
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    updateOrdersNotificationBadge();
    
    // Escuchar cambios en localStorage (cuando se actualice desde otra pestaña)
    window.addEventListener('storage', function(e) {
        if (e.key === 'hairia_pending_orders_count') {
            updateOrdersNotificationBadge();
        }
    });
    
    // Escuchar evento personalizado de actualización
    window.addEventListener('ordersCountUpdated', function(e) {
        updateOrdersNotificationBadge();
    });
    
    console.log('✅ Sistema de notificaciones inicializado');
});
