(function () {
    const SESSION_KEY = 'hairia_current_user';

    function readSessionValue() {
        try {
            const userFromLocal = window.localStorage.getItem(SESSION_KEY);
            const userFromSession = window.sessionStorage.getItem(SESSION_KEY);
            return userFromLocal || userFromSession || null;
        } catch (_) {
            return null;
        }
    }

    function getCurrentUser() {
        const userFromLocal = window.localStorage.getItem(SESSION_KEY);
        const userFromSession = window.sessionStorage.getItem(SESSION_KEY);
        const raw = userFromLocal || userFromSession || null;
        if (!raw) {
            return null;
        }

        try {
            const parsed = JSON.parse(raw);

            if (userFromLocal) {
                persistCurrentUser(parsed);
            }

            return parsed;
        } catch (error) {
            console.warn('⚠️ No se pudo parsear la sesión actual:', error);
            return null;
        }
    }

    function persistCurrentUser(sessionData) {
        // Guardar en AMBOS storages: localStorage garantiza que la sesión sobreviva
        // la redirección a la pasarela de pago (Mercado Pago / Webpay) y regreso,
        // ya que sessionStorage puede perderse en ese flujo.
        const serialized = JSON.stringify(sessionData);
        window.localStorage.setItem(SESSION_KEY, serialized);
        window.sessionStorage.setItem(SESSION_KEY, serialized);
        return sessionData;
    }

    function clearCurrentUser() {
        window.localStorage.removeItem(SESSION_KEY);
        window.sessionStorage.removeItem(SESSION_KEY);
    }

    function getCurrentUserId() {
        const user = getCurrentUser();
        return user?.uid || user?.id || null;
    }

    window.hairiaSession = {
        SESSION_KEY,
        clearCurrentUser,
        getCurrentUser,
        getCurrentUserId,
        persistCurrentUser
    };
})();