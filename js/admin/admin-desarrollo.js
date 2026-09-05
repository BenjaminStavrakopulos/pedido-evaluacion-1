// admin-desarrollo.js - Panel de funciones en desarrollo (feature flags)
document.addEventListener('DOMContentLoaded', function() {
    initializeAdminDesarrollo();
});

async function initializeAdminDesarrollo() {
    const hasAccess = await checkAdminAuth();
    if (!hasAccess) {
        return;
    }
    setupPageActions();
    initHairAnalysisCard();
}

function setupPageActions() {
    const viewStoreBtn = document.getElementById('adminDesarrolloViewStoreBtn');
    if (viewStoreBtn && viewStoreBtn.dataset.listener !== 'true') {
        viewStoreBtn.addEventListener('click', () => {
            window.location.href = '../index.html';
        });
        viewStoreBtn.dataset.listener = 'true';
    }

    const logoutBtn = document.getElementById('adminDesarrolloLogoutBtn');
    if (logoutBtn && logoutBtn.dataset.listener !== 'true') {
        logoutBtn.addEventListener('click', () => {
            if (typeof window.logoutUser === 'function') {
                window.logoutUser();
            }
        });
        logoutBtn.dataset.listener = 'true';
    }
}

function notifyAdminDesarrollo(message, isError = false) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${isError ? 'var(--admin-error)' : 'var(--admin-success)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        z-index: 3000;
        box-shadow: var(--admin-shadow-lg);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function updateHairAnalysisBadge(state) {
    const badge = document.getElementById('hairAnalysisStatusBadge');
    if (!badge) return;

    if (state === 'oculto') {
        badge.textContent = 'No visible';
        badge.style.background = '#ef4444';
        return;
    }

    if (state === 'solo_admin') {
        badge.textContent = 'Visible solo admin';
        badge.style.background = '#f59e0b';
        return;
    }

    badge.textContent = 'Visible';
    badge.style.background = '#10b981';
}

// Deriva el estado simple (visible/solo_admin/oculto) desde la configuración
// guardada en Firestore, que internamente sigue usando habilitada/visibilidad.
function getSimpleStateFromConfig(config) {
    if (config.habilitada === false) return 'oculto';
    if (config.visibilidad === 'solo_admin') return 'solo_admin';
    return 'visible';
}

function buildConfigFromSimpleState(state) {
    if (state === 'oculto') {
        return { habilitada: false, visibilidad: 'publico', mostrarEnInicio: false };
    }
    if (state === 'solo_admin') {
        return { habilitada: true, visibilidad: 'solo_admin', mostrarEnInicio: true };
    }
    return { habilitada: true, visibilidad: 'publico', mostrarEnInicio: true };
}

async function initHairAnalysisCard() {
    const stateSelect = document.getElementById('hairAnalysisVisibilityState');
    const saveBtn = document.getElementById('hairAnalysisSaveBtn');

    if (!stateSelect || !saveBtn) {
        return;
    }

    if (!window.firebaseData?.loadHairAnalysisConfig) {
        console.warn('⚠️ firebaseData.loadHairAnalysisConfig no está disponible');
        return;
    }

    let currentConfig = { habilitada: true, visibilidad: 'publico', mostrarEnInicio: true };

    try {
        const remoteConfig = await window.firebaseData.loadHairAnalysisConfig();
        currentConfig = { ...currentConfig, ...(remoteConfig || {}) };
    } catch (error) {
        console.warn('⚠️ No se pudo cargar configuración de análisis capilar:', error.message);
    }

    const simpleState = getSimpleStateFromConfig(currentConfig);
    stateSelect.value = simpleState;
    updateHairAnalysisBadge(simpleState);

    if (saveBtn.dataset.listener === 'true') {
        return;
    }

    saveBtn.addEventListener('click', async () => {
        const nextConfig = buildConfigFromSimpleState(stateSelect.value);

        saveBtn.disabled = true;
        try {
            await window.firebaseData.saveHairAnalysisConfig(nextConfig);
            updateHairAnalysisBadge(stateSelect.value);
            notifyAdminDesarrollo('✅ Configuración guardada correctamente');
        } catch (error) {
            console.error('❌ Error guardando configuración de análisis capilar:', error);
            notifyAdminDesarrollo('❌ No se pudo guardar la configuración', true);
        } finally {
            saveBtn.disabled = false;
        }
    });

    saveBtn.dataset.listener = 'true';
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

        return true;
    } catch (error) {
        console.warn('⚠️ No se pudo verificar admin en Firebase:', error);
        window.location.href = '../login.html';
        return false;
    }
}


