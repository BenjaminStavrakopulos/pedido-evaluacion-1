// reset-password.js - Lógica para cambiar contraseña
console.log('✅ reset-password.js cargado');

let isProcessing = false;

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Inicializando formulario de reset...');
    setupResetForm();
    validatePasswordMatch();
});

function setupResetForm() {
    const form = document.getElementById('resetPasswordForm');
    const newPassword = document.getElementById('newPassword');
    const confirmPassword = document.getElementById('confirmPassword');
    const submitBtn = document.getElementById('submitBtn');

    if (!form || !newPassword || !confirmPassword) {
        console.error('❌ No se encontraron elementos del formulario');
        return;
    }

    // Validar coincidencia en tiempo real
    newPassword.addEventListener('input', validatePasswordMatch);
    confirmPassword.addEventListener('input', validatePasswordMatch);

    // Validar que el botón se habilite/deshabilite correctamente
    newPassword.addEventListener('input', updateSubmitButtonState);
    confirmPassword.addEventListener('input', updateSubmitButtonState);

    // Enviar formulario
    form.addEventListener('submit', handlePasswordReset);

    // Inicializar estado del botón
    updateSubmitButtonState();
}

function updateSubmitButtonState() {
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const submitBtn = document.getElementById('submitBtn');

    const isValid = newPassword.length >= 6 && 
                    confirmPassword.length >= 6 && 
                    newPassword === confirmPassword;

    submitBtn.disabled = !isValid;
}

function validatePasswordMatch() {
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const matchMessage = document.getElementById('matchMessage');
    const noMatchMessage = document.getElementById('noMatchMessage');

    if (!newPassword || !confirmPassword) {
        matchMessage.style.display = 'none';
        noMatchMessage.style.display = 'none';
        return;
    }

    if (newPassword === confirmPassword && newPassword.length >= 6) {
        matchMessage.style.display = 'block';
        noMatchMessage.style.display = 'none';
    } else if (confirmPassword.length > 0 && newPassword !== confirmPassword) {
        matchMessage.style.display = 'none';
        noMatchMessage.style.display = 'block';
    } else {
        matchMessage.style.display = 'none';
        noMatchMessage.style.display = 'none';
    }
}

async function handlePasswordReset(e) {
    e.preventDefault();

    if (isProcessing) return;

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const submitBtn = document.getElementById('submitBtn');
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');

    // Ocultar mensajes previos
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    // Validación - Contraseña mínimo 6 caracteres
    if (newPassword.length < 6) {
        showError('🔐 La contraseña debe tener al menos 6 caracteres', errorDiv);
        return;
    }

    // Validación - Contraseñas deben coincidir EXACTAMENTE
    if (newPassword !== confirmPassword) {
        showError('❌ Las contraseñas no coinciden. Por favor verifica que ambas sean idénticas', errorDiv);
        return;
    }

    // Obtener el código de reset de la URL
    const oobCode = getOobCode();
    if (!oobCode) {
        showError('🔗 El enlace de restablecimiento no es válido o expiró. Solicita uno nuevo en el login', errorDiv);
        return;
    }

    // Validar Firebase está disponible
    if (!window.firebase || !window.firebase.confirmPasswordReset) {
        showError('⚠️ El servicio no está disponible. Por favor intenta más tarde', errorDiv);
        return;
    }

    isProcessing = true;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading"></span> Cambiando contraseña...';
    submitBtn.style.opacity = '0.7';

    try {
        console.log('🔄 Confirmando cambio de contraseña con Firebase...');
        const result = await window.firebase.confirmPasswordReset(oobCode, newPassword);

        if (result && result.success) {
            console.log('✅ Contraseña cambiada exitosamente');
            showSuccess('✅ ¡Contraseña cambiada exitosamente! Redirigiendo al login...', successDiv);
            
            // Redirigir a login después de 2.5 segundos
            setTimeout(() => {
                console.log('🔄 Redirigiendo a login...');
                window.location.href = 'login.html?resetSuccess=true';
            }, 2500);
        } else {
            const errorMsg = result?.message || 'Error al cambiar la contraseña. Por favor intenta de nuevo';
            showError(errorMsg, errorDiv);
            console.error('❌ Error en reset:', errorMsg);
        }

    } catch (error) {
        console.error('❌ Error en handlePasswordReset:', error);
        let errorMsg = 'Ocurrió un error al cambiar la contraseña';
        
        if (error.code === 'auth/expired-action-code') {
            errorMsg = '⏱️ El enlace expiró. Por favor solicita uno nuevo en el login';
        } else if (error.code === 'auth/invalid-action-code') {
            errorMsg = '🔗 El enlace no es válido. Por favor solicita uno nuevo en el login';
        } else if (error.code === 'auth/weak-password') {
            errorMsg = '🔐 La contraseña es muy débil. Usa una contraseña más fuerte';
        } else if (error.message) {
            errorMsg = error.message;
        }
        
        showError(errorMsg, errorDiv);
    } finally {
        isProcessing = false;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.innerHTML = 'Cambiar Contraseña';
        updateSubmitButtonState();
    }
}

function getOobCode() {
    const params = new URLSearchParams(window.location.search);
    let code = params.get('oobCode');
    
    // Si no hay oobCode en los parámetros, buscar en el hash (#)
    if (!code && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        code = hashParams.get('oobCode');
    }
    
    console.log('🔍 oobCode detectado:', code ? 'Sí' : 'No');
    return code;
}

function showError(message, element) {
    if (!element) return;
    element.textContent = message;
    element.style.display = 'block';
    element.style.animation = 'slideIn 0.3s ease-out';
    setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

function showSuccess(message, element) {
    if (!element) return;
    element.textContent = message;
    element.style.display = 'block';
    element.style.animation = 'slideIn 0.3s ease-out';
    setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// Validar que el código exista al cargar
window.addEventListener('load', function() {
    console.log('🔄 Validando código de reset al cargar página...');
    
    const oobCode = getOobCode();
    const errorDiv = document.getElementById('errorMessage');
    const form = document.getElementById('resetPasswordForm');
    
    if (!oobCode) {
        console.error('❌ No se encontró oobCode en la URL');
        if (errorDiv) {
            showError('🔗 Enlace inválido o expirado. Por favor solicita un nuevo restablecimiento de contraseña en el login', errorDiv);
        }
        if (form) {
            form.style.display = 'none';
        }
    } else {
        console.log('✅ oobCode válido detectado');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
        if (form) {
            form.style.display = 'block';
        }
    }
});
