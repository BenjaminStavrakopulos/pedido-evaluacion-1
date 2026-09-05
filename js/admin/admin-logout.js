// admin-logout.js - Logout unico y compartido para todas las vistas admin/bodega.
// Cierra la sesion real de Firebase Auth (ademas de limpiar el cache local) para
// evitar que el listener onAuthStateChanged vuelva a "revivir" la sesion.
window.logoutUser = function () {
    const finish = () => {
        try { localStorage.removeItem('hairia_current_user'); } catch (error) { /* noop */ }
        try { sessionStorage.removeItem('hairia_current_user'); } catch (error) { /* noop */ }
        window.location.href = '../login.html';
    };

    const signOutFromFirebase = () => {
        if (window.firebase && typeof window.firebase.logoutUser === 'function') {
            return window.firebase.logoutUser().catch((error) => {
                console.warn('⚠️ Error cerrando sesion en Firebase:', error);
            });
        }
        return Promise.resolve();
    };

    signOutFromFirebase().finally(finish);
};
