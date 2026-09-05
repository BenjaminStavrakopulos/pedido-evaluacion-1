// admin-auth-guard.js - Guardia sincrona anti-flash para paginas de admin.
// Se carga en <head> (script normal, bloqueante) ANTES de que el <body> se
// parsee, asi que si no hay sesion admin valida redirige de inmediato y el
// contenido protegido nunca llega a pintarse en pantalla.
(function () {
    try {
        var raw = localStorage.getItem('hairia_current_user') || sessionStorage.getItem('hairia_current_user');
        var user = raw ? JSON.parse(raw) : null;
        if (!user || !user.uid || user.role !== 'admin') {
            window.location.replace('../login.html');
        }
    } catch (error) {
        window.location.replace('../login.html');
    }
})();
