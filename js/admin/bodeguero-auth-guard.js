// bodeguero-auth-guard.js - Guardia sincrona anti-flash para el panel de bodega.
// Igual que admin-auth-guard.js pero acepta admin, bodeguero o la cuenta
// especial de bodega, replicando la logica de checkWarehouseAccess().
(function () {
    try {
        var raw = localStorage.getItem('hairia_current_user') || sessionStorage.getItem('hairia_current_user');
        var user = raw ? JSON.parse(raw) : null;
        var email = user && user.email ? String(user.email).toLowerCase() : '';
        var allowed = !!(user && user.uid && (
            user.role === 'admin' ||
            user.role === 'bodeguero' ||
            user.uid === 'yFNJUJUJiaXbOiHLGGPsIJWShbC2' ||
            email === 'bodegamonsite@gmail.com'
        ));
        if (!allowed) {
            window.location.replace('../login.html');
        }
    } catch (error) {
        window.location.replace('../login.html');
    }
})();
