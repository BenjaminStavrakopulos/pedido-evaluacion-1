document.addEventListener('DOMContentLoaded', () => {
    initializeAccountSettings();
});

let passwordVerified = false;
let isGoogleProviderAccount = false;

function initializeAccountSettings() {
    const currentUser = getSessionUser();

    if (!currentUser || !(currentUser.uid || currentUser.id)) {
        window.location.href = 'login.html?redirect=my-orders';
        return;
    }

    const displayNameInput = document.getElementById('displayNameInput');
    if (displayNameInput) {
        displayNameInput.value = currentUser.name || '';
    }

    const nameForm = document.getElementById('nameForm');
    const verifyPasswordForm = document.getElementById('verifyPasswordForm');
    const newPasswordForm = document.getElementById('newPasswordForm');
    const deleteRequestForm = document.getElementById('deleteRequestForm');

    nameForm?.addEventListener('submit', handleNameUpdate);
    verifyPasswordForm?.addEventListener('submit', handleVerifyCurrentPassword);
    newPasswordForm?.addEventListener('submit', handleChangePassword);
    deleteRequestForm?.addEventListener('submit', handleDeleteRequest);

    configureProviderSpecificPasswordFlow(currentUser).catch((error) => {
        console.warn('⚠️ No se pudo determinar proveedor de cuenta:', error);
    });

    initializeHairAnalysisConsentSection(currentUser).catch((error) => {
        console.warn('⚠️ No se pudo cargar el consentimiento de análisis capilar:', error);
    });
}

async function configureProviderSpecificPasswordFlow(currentUser) {
    const provider = await detectAccountProvider(currentUser);
    isGoogleProviderAccount = provider === 'google';

    const verifyPasswordForm = document.getElementById('verifyPasswordForm');
    const newPasswordForm = document.getElementById('newPasswordForm');
    const googlePasswordNotice = document.getElementById('googlePasswordNotice');

    if (isGoogleProviderAccount) {
        if (verifyPasswordForm) verifyPasswordForm.style.display = 'none';
        if (newPasswordForm) newPasswordForm.style.display = 'none';
        if (googlePasswordNotice) googlePasswordNotice.style.display = 'block';
        return;
    }

    if (verifyPasswordForm) verifyPasswordForm.style.display = '';
    if (newPasswordForm) newPasswordForm.style.display = '';
    if (googlePasswordNotice) googlePasswordNotice.style.display = 'none';
}

async function detectAccountProvider(currentUser) {
    if ((currentUser?.provider || '').toLowerCase() === 'google') {
        return 'google';
    }

    const isReady = await waitForFirebase();
    if (!isReady || !window.firebase?.auth?.currentUser) {
        return 'password';
    }

    const providerData = Array.isArray(window.firebase.auth.currentUser.providerData)
        ? window.firebase.auth.currentUser.providerData
        : [];

    const hasGoogleProvider = providerData.some((item) => item?.providerId === 'google.com');
    return hasGoogleProvider ? 'google' : 'password';
}

function getSessionUser() {
    return window.hairiaSession?.getCurrentUser() || null;
}

function showAccountNotification(message, type = 'info') {
    if (typeof window.showNotification === 'function') {
        window.showNotification(message);
        return;
    }

    const notification = document.createElement('div');
    const color = type === 'error' ? '#b42318' : '#1a1a1a';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${color};
        color: #fff;
        padding: 0.8rem 1rem;
        border-radius: 8px;
        z-index: 5000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function isStrongPassword(password) {
    const normalized = String(password || '');
    const hasUpper = /[A-ZÁÉÍÓÚÑ]/.test(normalized);
    const hasNumber = /\d/.test(normalized);
    const hasSpecial = /[^A-Za-z0-9]/.test(normalized);
    return normalized.length >= 6 && hasUpper && hasNumber && hasSpecial;
}

function setPasswordFieldsEnabled(enabled) {
    const newPasswordInput = document.getElementById('newPasswordInput');
    const confirmNewPasswordInput = document.getElementById('confirmNewPasswordInput');
    const changePasswordBtn = document.getElementById('changePasswordBtn');

    if (newPasswordInput) newPasswordInput.disabled = !enabled;
    if (confirmNewPasswordInput) confirmNewPasswordInput.disabled = !enabled;
    if (changePasswordBtn) changePasswordBtn.disabled = !enabled;
}

async function waitForFirebase() {
    const maxAttempts = 25;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (window.firebase) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    return false;
}

function formatConsentDate(isoDate) {
    if (!isoDate) return 'sin fecha registrada';
    try {
        return new Date(isoDate).toLocaleString('es-CL');
    } catch (_) {
        return isoDate;
    }
}

async function initializeHairAnalysisConsentSection(currentUser) {
    const card = document.getElementById('hairAnalysisConsentCard');
    const summary = document.getElementById('hairAnalysisConsentSummary');
    const revokeBtn = document.getElementById('revokeHairTrainingBtn');
    const revokeHint = document.getElementById('hairAnalysisRevokeHint');
    if (!card || !summary || !revokeBtn) return;

    const userId = currentUser?.uid || currentUser?.id;
    if (!userId) return;

    const isReady = await waitForFirebase();
    if (!isReady || typeof window.firebaseData?.loadHairAnalysisConsent !== 'function') {
        return;
    }

    const consent = await window.firebaseData.loadHairAnalysisConsent(userId);
    if (!consent) {
        return;
    }

    card.hidden = false;
    renderHairAnalysisConsent(consent);

    revokeBtn.addEventListener('click', async () => {
        const shouldRevoke = window.confirm('¿Revocar la autorización para usar tus fotos en el entrenamiento de la IA?');
        if (!shouldRevoke) return;

        const updatedConsent = {
            ...consent,
            consentimiento_entrenamiento: false,
            consentimiento_revocado: true,
            fecha_revocacion: new Date().toISOString()
        };

        try {
            await window.firebaseData.saveHairAnalysisConsent(userId, updatedConsent);
            renderHairAnalysisConsent(updatedConsent);
            showAccountNotification('Autorización de entrenamiento revocada correctamente.');
        } catch (error) {
            showAccountNotification('No se pudo revocar la autorización. Intenta nuevamente.', 'error');
        }
    });
}

function renderHairAnalysisConsent(consent) {
    const summary = document.getElementById('hairAnalysisConsentSummary');
    const revokeBtn = document.getElementById('revokeHairTrainingBtn');
    const revokeHint = document.getElementById('hairAnalysisRevokeHint');

    const analysisText = consent.consentimiento_analisis ? 'Autorizado' : 'No autorizado';
    const trainingText = consent.consentimiento_revocado
        ? 'Revocado'
        : (consent.consentimiento_entrenamiento ? 'Autorizado' : 'No autorizado');

    summary.innerHTML = `
        <div>
            <p><strong>Procesamiento para el análisis:</strong> ${analysisText}</p>
            <p><strong>Entrenamiento de la IA:</strong> ${trainingText}</p>
            <p>Última actualización: ${formatConsentDate(consent.updatedAt || consent.fecha_consentimiento)} · Versión de términos: ${consent.version_terminos || '1.0'}</p>
        </div>
    `;

    const canRevoke = consent.consentimiento_entrenamiento && !consent.consentimiento_revocado;
    revokeBtn.hidden = !canRevoke;
    revokeHint.hidden = !canRevoke;
}

async function handleNameUpdate(event) {
    event.preventDefault();

    const isReady = await waitForFirebase();
    if (!isReady || typeof window.firebase.updateCurrentUserName !== 'function') {
        showAccountNotification('Servicio no disponible para actualizar nombre.', 'error');
        return;
    }

    const displayNameInput = document.getElementById('displayNameInput');
    const newName = String(displayNameInput?.value || '').trim();

    if (!newName) {
        showAccountNotification('Ingresa un nombre válido.', 'error');
        return;
    }

    try {
        const updated = await window.firebase.updateCurrentUserName(newName);
        const sessionUser = getSessionUser() || {};
        const nextSession = {
            ...sessionUser,
            name: updated.name
        };

        window.hairiaSession?.persistCurrentUser(nextSession);

        const userName = document.getElementById('userName');
        if (userName) userName.textContent = updated.name;

        showAccountNotification('Nombre actualizado correctamente.');
    } catch (error) {
        const message = error?.customMessage || error?.message || 'No se pudo actualizar el nombre.';
        showAccountNotification(message, 'error');
    }
}

async function handleVerifyCurrentPassword(event) {
    event.preventDefault();

    if (isGoogleProviderAccount) {
        showAccountNotification('Tu cuenta usa Google. Gestiona la contraseña directamente desde Google.', 'error');
        return;
    }

    const isReady = await waitForFirebase();
    if (!isReady || typeof window.firebase.verifyCurrentPassword !== 'function') {
        showAccountNotification('Servicio no disponible para verificar contraseña.', 'error');
        return;
    }

    const currentPasswordInput = document.getElementById('currentPasswordInput');
    const currentPassword = String(currentPasswordInput?.value || '');

    if (!currentPassword) {
        showAccountNotification('Ingresa tu contraseña actual.', 'error');
        return;
    }

    try {
        await window.firebase.verifyCurrentPassword(currentPassword);
        passwordVerified = true;
        setPasswordFieldsEnabled(true);
        showAccountNotification('Contraseña actual verificada. Ahora puedes ingresar la nueva contraseña.');
    } catch (error) {
        passwordVerified = false;
        setPasswordFieldsEnabled(false);
        const message = error?.customMessage || error?.message || 'La contraseña actual es incorrecta.';
        showAccountNotification(message, 'error');
    }
}

async function handleChangePassword(event) {
    event.preventDefault();

    if (isGoogleProviderAccount) {
        showAccountNotification('Tu cuenta usa Google. Gestiona la contraseña directamente desde Google.', 'error');
        return;
    }

    if (!passwordVerified) {
        showAccountNotification('Primero verifica tu contraseña actual.', 'error');
        return;
    }

    const isReady = await waitForFirebase();
    if (!isReady || typeof window.firebase.changeCurrentUserPassword !== 'function') {
        showAccountNotification('Servicio no disponible para cambiar contraseña.', 'error');
        return;
    }

    const newPasswordInput = document.getElementById('newPasswordInput');
    const confirmNewPasswordInput = document.getElementById('confirmNewPasswordInput');

    const newPassword = String(newPasswordInput?.value || '');
    const confirmPassword = String(confirmNewPasswordInput?.value || '');

    if (!newPassword || !confirmPassword) {
        showAccountNotification('Completa ambos campos de nueva contraseña.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showAccountNotification('Las nuevas contraseñas no coinciden.', 'error');
        return;
    }

    if (!isStrongPassword(newPassword)) {
        showAccountNotification('La nueva contraseña debe incluir 1 mayúscula, 1 número y 1 carácter especial.', 'error');
        return;
    }

    try {
        await window.firebase.changeCurrentUserPassword(newPassword);
        passwordVerified = false;
        setPasswordFieldsEnabled(false);

        if (newPasswordInput) newPasswordInput.value = '';
        if (confirmNewPasswordInput) confirmNewPasswordInput.value = '';

        const currentPasswordInput = document.getElementById('currentPasswordInput');
        if (currentPasswordInput) currentPasswordInput.value = '';

        showAccountNotification('Contraseña actualizada correctamente.');
    } catch (error) {
        const message = error?.customMessage || error?.message || 'No se pudo cambiar la contraseña.';
        showAccountNotification(message, 'error');
    }
}

async function handleDeleteRequest(event) {
    event.preventDefault();

    const isReady = await waitForFirebase();
    if (!isReady || typeof window.firebase.requestAccountDeletion !== 'function') {
        showAccountNotification('Servicio no disponible para solicitud de eliminación.', 'error');
        return;
    }

    const confirmCheckbox = document.getElementById('confirmDeleteRequest');
    const reasonInput = document.getElementById('deleteReasonInput');

    if (!confirmCheckbox?.checked) {
        showAccountNotification('Debes confirmar la solicitud de eliminación.', 'error');
        return;
    }

    try {
        const response = await window.firebase.requestAccountDeletion(reasonInput?.value || '');
        const currentUser = getSessionUser();

        if (currentUser?.uid) {
            localStorage.setItem(`hairia_deletion_request_${currentUser.uid}`, JSON.stringify(response));
        }

        if (reasonInput) reasonInput.value = '';
        if (confirmCheckbox) confirmCheckbox.checked = false;

        showAccountNotification('Solicitud de eliminación enviada. Te contactaremos para confirmación final.');
    } catch (error) {
        const message = error?.customMessage || error?.message || 'No se pudo enviar la solicitud de eliminación.';
        showAccountNotification(message, 'error');
    }
}
