// auth.js - VERSIÓN CON ANIMACIONES MEJORADAS
let isProcessing = false;
let isResetProcessing = false;
const WAREHOUSE_UID = 'yFNJUJUJiaXbOiHLGGPsIJWShbC2';
const WAREHOUSE_EMAIL = 'bodegamonsite@gmail.com';

function isWarehouseAccount(user) {
    if (!user) return false;
    const uid = String(user.uid || user.id || '').trim();
    const email = String(user.email || '').trim().toLowerCase();
    return uid === WAREHOUSE_UID || email === WAREHOUSE_EMAIL;
}

function persistCurrentUserSession(sessionData) {
    sessionStorage.setItem('hairia_current_user', JSON.stringify(sessionData));
    localStorage.removeItem('hairia_current_user');
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ auth.js cargado');
    
    // Verificar si Firebase está cargado
    checkFirebaseLoaded();
    
    setupAuthEventListeners();
    checkExistingSession();
    handleGoogleRedirectLogin();
    
    // Añadir estilos CSS para notificaciones
    addNotificationStyles();
});

async function handleGoogleRedirectLogin() {
    if (!window.firebase || typeof window.firebase.getGoogleRedirectUser !== 'function') {
        return;
    }

    try {
        const user = await window.firebase.getGoogleRedirectUser();
        if (!user) return;

        const sessionData = {
            uid: user.uid,
            email: user.email,
            name: user.name || user.displayName || user.email?.split('@')[0] || 'Usuario',
            role: user.role || 'client',
            provider: 'google',
            photoURL: user.photoURL || '',
            loggedInAt: new Date().toISOString()
        };

        persistCurrentUserSession(sessionData);

        showNotification(`¡Bienvenido ${sessionData.name}! ✅ Sesión iniciada con Google`, 'success', 2800);
        const postLoginRedirect = getPostLoginRedirect(sessionData);
        setTimeout(() => {
            window.location.href = postLoginRedirect;
        }, 1200);
    } catch (error) {
        console.error('Error procesando redirect de Google:', error);
        const errorMessage = error?.customMessage || error?.message || 'No se pudo completar el inicio de sesión con Google';
        showNotification(errorMessage, 'error');
    }
}

// ========== VERIFICACIÓN DE FIREBASE ==========
function checkFirebaseLoaded() {
    let attempts = 0;
    const maxAttempts = 10;
    
    const checkInterval = setInterval(() => {
        attempts++;
        
        if (window.firebase && typeof window.firebase.registerUser === 'function') {
            console.log('✅ Firebase cargado correctamente en intento', attempts);
            clearInterval(checkInterval);
            return;
        }
        
        if (attempts >= maxAttempts) {
            console.error('❌ Firebase no se cargó después de', maxAttempts, 'intentos');
            showNotification('Error: El servicio de autenticación no se cargó. Recarga la página.', 'error');
            clearInterval(checkInterval);
        }
        
        console.log('⏳ Esperando Firebase... intento', attempts);
    }, 500);
}

// ========== CONFIGURACIÓN DE EVENT LISTENERS ==========
function setupAuthEventListeners() {
    console.log('🔧 Configurando event listeners...');

    // Desactiva la validacion nativa para evitar bloqueos por controles ocultos.
    document.querySelectorAll('.auth-form').forEach((form) => {
        form.noValidate = true;
    });
    
    // Tabs de login/registro
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            setActiveAuthForm(tabName);
        });
    });

    // Formularios
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
        console.log('✅ Listener de registro agregado');
    }
    
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        console.log('✅ Listener de login agregado');
    }
    
    const adminForm = document.getElementById('adminForm');
    if (adminForm) {
        adminForm.addEventListener('submit', handleAdminLogin);
        console.log('✅ Listener de admin agregado');
    }

    const googleBtn = document.querySelector('.google-btn');
    if (googleBtn) {
        googleBtn.addEventListener('click', handleGoogleLogin);
        console.log('✅ Listener de Google agregado');
    }

    // Mostrar/ocultar contraseña
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', function() {
            const inputId = this.dataset.target;
            const input = document.getElementById(inputId);
            if (input) {
                if (input.type === 'password') {
                    input.type = 'text';
                    this.textContent = 'HIDE';
                } else {
                    input.type = 'password';
                    this.textContent = 'SHOW';
                }
            }
        });
    });

    // Switch entre modos cliente/admin
    document.getElementById('switchToAdminMode')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchToAuthMode('admin');
    });
    
    document.getElementById('switchToAdminModeRegister')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchToAuthMode('admin');
    });
    
    document.getElementById('switchToClientMode')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchToAuthMode('client');
    });

    // Restablecer contraseña
    const forgotPasswordLink = document.querySelector('.forgot-password');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            openResetPasswordModal();
        });
    }

    const resetModal = document.getElementById('resetPasswordModal');
    const resetClose = document.getElementById('resetPasswordClose');
    const resetCancel = document.getElementById('resetPasswordCancel');
    const resetForm = document.getElementById('resetPasswordForm');

    if (resetModal) {
        resetModal.addEventListener('click', (e) => {
            if (e.target === resetModal) closeResetPasswordModal();
        });
    }

    resetClose?.addEventListener('click', closeResetPasswordModal);
    resetCancel?.addEventListener('click', closeResetPasswordModal);

    if (resetForm) {
        resetForm.noValidate = true;
        resetForm.addEventListener('submit', handlePasswordReset);
    }

    setActiveAuthForm('login');
    
    console.log('✅ Event listeners configurados');
}

function syncAuthFormControls(form, isActive) {
    form.querySelectorAll('input, select, textarea, button').forEach((control) => {
        if (!control.dataset.originalRequired) {
            control.dataset.originalRequired = control.required ? 'true' : 'false';
        }

        const shouldBeRequired = control.dataset.originalRequired === 'true';
        control.disabled = !isActive;

        if (isActive && shouldBeRequired) {
            control.setAttribute('required', 'required');
        } else {
            control.removeAttribute('required');
        }
    });
}

function setActiveAuthForm(formName) {
    document.querySelectorAll('.tab-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === formName);
    });

    document.querySelectorAll('.auth-form').forEach((form) => {
        const isActive = form.dataset.form === formName;
        form.classList.toggle('active', isActive);
        syncAuthFormControls(form, isActive);
    });

    // Mostrar el mensaje solo en Inicio de Sesión
    const authGuidance = document.getElementById('authGuidance');

    if (authGuidance) {
        if (formName === 'login') {
            authGuidance.style.display = 'block';
        } else {
            authGuidance.style.display = 'none';
        }
    }
}

function openResetPasswordModal() {
    const modal = document.getElementById('resetPasswordModal');
    if (modal) {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.getElementById('resetEmail')?.focus();
    }
}

function closeResetPasswordModal() {
    const modal = document.getElementById('resetPasswordModal');
    if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }
    const resetEmail = document.getElementById('resetEmail');
    if (resetEmail) resetEmail.value = '';
}

async function handlePasswordReset(e) {
    e.preventDefault();
    if (isResetProcessing) return;

    if (!window.firebase || typeof window.firebase.requestPasswordReset !== 'function') {
        showNotification('El servicio de restablecimiento no está disponible', 'error');
        return;
    }

    const resetEmail = document.getElementById('resetEmail')?.value.trim();
    const submitBtn = document.getElementById('resetPasswordSubmit');

    if (!resetEmail) {
        showNotification('Por favor ingresa tu email', 'error');
        return;
    }

    if (!isValidEmail(resetEmail)) {
        showNotification('Por favor ingresa un email válido', 'error');
        return;
    }

    isResetProcessing = true;
    if (submitBtn) submitBtn.disabled = true;

    try {
        const result = await window.firebase.requestPasswordReset(resetEmail);

        if (result?.notFound) {
            showNotification('No existe una cuenta con ese correo', 'error');
            return;
        }

        if (result?.success) {
            showNotification('Te enviamos un correo para restablecer tu contraseña', 'success', 4000);
            closeResetPasswordModal();
            return;
        }

        showNotification(result?.message || 'No se pudo enviar el correo de restablecimiento', 'error');

    } catch (error) {
        console.error('❌ Error en reset de contraseña:', error);
        showNotification('Ocurrió un error al enviar el correo', 'error');
    } finally {
        isResetProcessing = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

// ========== FUNCIÓN DE REGISTRO ==========
async function handleRegister(e) {
    e.preventDefault();
    
    console.log('🎯 Iniciando handleRegister');
    
    if (isProcessing) {
        console.log('⚠️ Ya hay un proceso en curso');
        return;
    }
    
    if (!window.firebase || typeof window.firebase.registerUser !== 'function') {
        console.error('❌ Firebase no disponible');
        showNotification('Error: El servicio no está listo. Espera unos segundos e intenta nuevamente.', 'error');
        return;
    }
    
    isProcessing = true;
    
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    const acceptTerms = document.getElementById('acceptTerms').checked;
    
    console.log('📋 Datos del formulario:', { name, email, acceptTerms });
    
    const submitBtn = e.target.querySelector('.auth-btn');
    setButtonLoading(submitBtn, true);
    
    let errorMessage = '';
    
    if (!name) errorMessage = 'Por favor ingresa tu nombre completo';
    else if (!email) errorMessage = 'Por favor ingresa tu email';
    else if (!password) errorMessage = 'Por favor ingresa una contraseña';
    else if (!confirmPassword) errorMessage = 'Por favor confirma tu contraseña';
    else if (!isValidEmail(email)) errorMessage = 'Por favor ingresa un email válido';
    else if (password.length < 12) errorMessage = 'La contraseña debe tener al menos 12 caracteres';
    else if (!isStrongPassword(password)) errorMessage = 'La contraseña debe incluir al menos 1 mayúscula, 1 número y 1 carácter especial';
    else if (password !== confirmPassword) errorMessage = 'Las contraseñas no coinciden';
    else if (!acceptTerms) errorMessage = 'Debes aceptar los términos y condiciones';
    
    if (errorMessage) {
        showNotification(errorMessage, 'error');
        setButtonLoading(submitBtn, false);
        isProcessing = false;
        return;
    }
    
    try {
        console.log('🚀 Llamando a firebase.registerUser...');
        const userData = await window.firebase.registerUser(email, password, name);
        console.log('✅ firebase.registerUser completado:', userData);
        
        if (userData && userData.uid) {
            const sessionData = {
                uid: userData.uid,
                email: userData.email,
                name: userData.name || name,
                role: userData.role || 'client',
                loggedInAt: new Date().toISOString()
            };
            
            persistCurrentUserSession(sessionData);
            console.log('💾 Sesión guardada');
            
            const guestCart = JSON.parse(localStorage.getItem('hairia_guest_cart')) || [];
            if (guestCart.length > 0) {
                localStorage.setItem(`hairia_cart_${userData.uid}`, JSON.stringify(guestCart));
                localStorage.removeItem('hairia_guest_cart');
            }
            
            // Notificación de éxito para registro
            showNotification(
                `¡Registro exitoso! 🎉 Bienvenido/a ${name}, tu cuenta ha sido creada correctamente.`,
                'success',
                4000
            );
            
            e.target.reset();
            
            setTimeout(() => {
                console.log('🔄 Redirigiendo a index.html');
                window.location.href = 'index.html';
            }, 2500);
            
        } else {
            throw new Error('No se recibieron datos válidos del usuario');
        }
        
    } catch (error) {
        console.error('💥 ERROR en handleRegister:', error);
        
        let userMessage = 'Error al crear la cuenta';
        
        if (error.customMessage) {
            userMessage = error.customMessage;
        } else if (error.code && window.firebase.getFirebaseErrorMessage) {
            userMessage = window.firebase.getFirebaseErrorMessage(error.code);
        } else if (error.message) {
            userMessage = error.message;
        }
        
        showNotification(userMessage, 'error');
        
    } finally {
        console.log('🏁 Finalizando handleRegister');
        if (submitBtn) setButtonLoading(submitBtn, false);
        isProcessing = false;
    }
}

// ========== FUNCIÓN DE LOGIN ==========
async function handleLogin(e) {
    e.preventDefault();
    if (isProcessing) return;
    
    if (!window.firebase || typeof window.firebase.loginUser !== 'function') {
        showNotification('El servicio de autenticación no está disponible', 'error');
        return;
    }
    
    isProcessing = true;
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const submitBtn = e.target.querySelector('.auth-btn');
    
    setButtonLoading(submitBtn, true);
    
    if (!email || !password) {
        showNotification('Por favor completa todos los campos', 'error');
        setButtonLoading(submitBtn, false);
        isProcessing = false;
        return;
    }
    
    if (!isValidEmail(email)) {
        showNotification('Por favor ingresa un email válido', 'error');
        setButtonLoading(submitBtn, false);
        isProcessing = false;
        return;
    }
    
    try {
        const user = await window.firebase.loginUser(email, password);
        
        // Verificar si es admin en Firebase
        let isAdmin = false;
        try {
            isAdmin = await window.firebase.isUserAdmin(user.uid);
        } catch (error) {
            console.warn('⚠️ No se pudo verificar rol de admin:', error);
        }
        
        const derivedRole = isWarehouseAccount(user)
            ? 'bodeguero'
            : (isAdmin ? 'admin' : (user.role || 'client'));

        const sessionData = {
            uid: user.uid,
            email: user.email,
            name: user.name || user.displayName || user.email.split('@')[0],
            role: derivedRole,
            loggedInAt: new Date().toISOString()
        };
        
        persistCurrentUserSession(sessionData);
        
        // Notificación diferenciada para admin
        if (isAdmin) {
            showNotification(
                `¡Acceso administrador! 🔧 Bienvenido ${sessionData.name}`,
                'success',
                3500
            );
        } else if (sessionData.role === 'bodeguero') {
            showNotification(
                `¡Acceso de bodega! 📦 Bienvenido ${sessionData.name}`,
                'success',
                3500
            );
        } else {
            showNotification(
                `¡Inicio de sesión exitoso! ✅ Bienvenido ${sessionData.name}`,
                'success',
                3500
            );
        }
        
        e.target.reset();
        const postLoginRedirect = getPostLoginRedirect(sessionData);
        
        setTimeout(() => {
            console.log('🔄 Redirigiendo a', postLoginRedirect);
            window.location.href = postLoginRedirect;
        }, 2000);
        
    } catch (error) {
        console.error('Login error:', error);
        
        let errorMessage = 'Email o contraseña incorrectos';
        
        if (error.customMessage) {
            errorMessage = error.customMessage;
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage = 'Email o contraseña incorrectos';
        } else if (error.code === 'auth/user-not-found') {
            errorMessage = 'No existe una cuenta con este email';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Contraseña incorrecta';
        }
        
        showNotification(errorMessage, 'error');
        
    } finally {
        setButtonLoading(submitBtn, false);
        isProcessing = false;
    }
}

// ========== FUNCIÓN DE LOGIN ADMINISTRADOR ==========
async function handleAdminLogin(e) {
    e.preventDefault();
    if (isProcessing) return;
    
    if (!window.firebase) {
        showNotification('El servicio de autenticación no está disponible', 'error');
        return;
    }
    
    isProcessing = true;
    
    const email = document.getElementById('adminEmail').value.trim();
    const password = document.getElementById('adminPassword').value;
    const submitBtn = e.target.querySelector('.auth-btn');
    
    setButtonLoading(submitBtn, true);
    
    if (!email || !password) {
        showNotification('Por favor completa todos los campos', 'error');
        setButtonLoading(submitBtn, false);
        isProcessing = false;
        return;
    }
    
    try {
        const user = await window.firebase.loginUser(email, password);
        const isAdmin = await window.firebase.isUserAdmin(user.uid);
        
        if (isAdmin) {
            const sessionData = {
                uid: user.uid,
                email: user.email,
                name: user.name || user.displayName || 'Administrador',
                role: 'admin',
                loggedInAt: new Date().toISOString()
            };
            
            persistCurrentUserSession(sessionData);
            
            // Notificación especial para admin
            showNotification(
                `¡Acceso administrador concedido! 🔧 Bienvenido ${sessionData.name} al panel de administración`,
                'success',
                3500
            );
            
            e.target.reset();
            
            setTimeout(() => {
                console.log('🔄 Redirigiendo a admin.html');
                window.location.href = 'admin/admin.html';
            }, 2000);
            
        } else {
            showNotification('No tienes permisos de administrador', 'error');
            await window.firebase.logoutUser();
        }
        
    } catch (error) {
        console.error('Admin login error:', error);
        
        let errorMessage = 'Credenciales de administrador incorrectas';
        
        if (error.customMessage) {
            errorMessage = error.customMessage;
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage = 'Email o contraseña de administrador incorrectos';
        }
        
        showNotification(errorMessage, 'error');
        
    } finally {
        setButtonLoading(submitBtn, false);
        isProcessing = false;
    }
}

// ========== FUNCIONES AUXILIARES ==========

function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function isStrongPassword(password) {
    const normalized = String(password || '');
    const hasUpper = /[A-ZÁÉÍÓÚÑ]/.test(normalized);
    const hasNumber = /\d/.test(normalized);
    const hasSpecial = /[^A-Za-z0-9]/.test(normalized);
    return normalized.length >= 6 && hasUpper && hasNumber && hasSpecial;
}

function setButtonLoading(button, isLoading) {
    if (!button) return;
    
    if (isLoading) {
        button.disabled = true;
        const btnText = button.querySelector('.btn-text');
        const btnLoading = button.querySelector('.btn-loading');
        if (btnText) btnText.style.display = 'none';
        if (btnLoading) btnLoading.style.display = 'inline-block';
    } else {
        button.disabled = false;
        const btnText = button.querySelector('.btn-text');
        const btnLoading = button.querySelector('.btn-loading');
        if (btnText) btnText.style.display = 'inline-block';
        if (btnLoading) btnLoading.style.display = 'none';
    }
}

function switchToAuthMode(mode) {
    const tabs = document.querySelector('.auth-tabs');
    const forms = document.querySelectorAll('.auth-form');
    const authGuidance = document.getElementById('authGuidance');

    if (mode === 'admin') {
        if (tabs) tabs.style.display = 'none';

        // Ocultar mensaje en modo administrador
        if (authGuidance) {
            authGuidance.style.display = 'none';
        }

        forms.forEach(form => {
            const isAdminForm = form.dataset.form === 'admin';
            form.classList.toggle('active', isAdminForm);
            syncAuthFormControls(form, isAdminForm);
        });
    } else {
        if (tabs) tabs.style.display = 'flex';

        // Volver a mostrar mensaje al entrar a Login
        setActiveAuthForm('login');
    }
}

function checkExistingSession() {
    if (!window.location.pathname.includes('login.html')) return;

    let hasRedirected = false;
    const redirectIfNeeded = (userData) => {
        if (!userData || hasRedirected) return;
        hasRedirected = true;
        console.log('👤 Usuario ya logueado, redirigiendo...');
        const redirectUrl = getPostLoginRedirect(userData);
        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 500);
    };

    const user = JSON.parse(
        localStorage.getItem('hairia_current_user') ||
        sessionStorage.getItem('hairia_current_user') ||
        'null'
    );

    if (user) {
        redirectIfNeeded(user);
    }

    let attempts = 0;
    const maxAttempts = 12;

    const tryAttachAuthObserver = () => {
        if (window.firebase && typeof window.firebase.getCurrentUser === 'function') {
            window.firebase.getCurrentUser((firebaseUser) => {
                if (!firebaseUser) {
                    localStorage.removeItem('hairia_current_user');
                    sessionStorage.removeItem('hairia_current_user');
                    return;
                }

                const sessionData = {
                    uid: firebaseUser.uid,
                    email: firebaseUser.email,
                    name: firebaseUser.name || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
                    role: isWarehouseAccount(firebaseUser) ? 'bodeguero' : (firebaseUser.role || 'client'),
                    provider: firebaseUser.provider || 'password',
                    photoURL: firebaseUser.photoURL || '',
                    loggedInAt: user?.loggedInAt || new Date().toISOString()
                };

                persistCurrentUserSession(sessionData);
                redirectIfNeeded(sessionData);
            });
            return;
        }

        attempts += 1;
        if (attempts < maxAttempts) {
            setTimeout(tryAttachAuthObserver, 350);
        }
    };

    tryAttachAuthObserver();
}

function getPostLoginRedirect(user) {
    const params = new URLSearchParams(window.location.search);
    const redirect = (params.get('redirect') || '').toLowerCase();

    if (redirect === 'checkout') return 'checkout.html';
    if (redirect === 'my-orders') return 'my-orders.html';
    if (redirect === 'admin' && user?.role === 'admin') return 'admin/admin.html';
    if (redirect === 'bodega' && user?.role === 'bodeguero') return 'admin/bodeguero.html';

    if (user?.role === 'admin') return 'admin/admin.html';
    if (user?.role === 'bodeguero') return 'admin/bodeguero.html';
    return 'index.html';
}

// ========== SISTEMA DE NOTIFICACIONES SIMPLIFICADO ==========

function showNotification(message, type = 'info', duration = 4000) {
    const existingNotification = document.getElementById('custom-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    if (window.__authNotificationTimer) {
        clearTimeout(window.__authNotificationTimer);
        window.__authNotificationTimer = null;
    }

    const toast = document.createElement('div');
    toast.id = 'custom-notification';
    toast.className = `custom-toast custom-toast-${type}`;

    const icon = type === 'success'
        ? 'OK'
        : type === 'error'
            ? '!'
            : type === 'warning'
                ? '!?'
                : 'i';

    const title = type === 'success'
        ? 'Completado'
        : type === 'error'
            ? 'No se pudo completar'
            : type === 'warning'
                ? 'Revisa este dato'
                : 'Informacion';

    toast.innerHTML = `
        <button type="button" class="custom-toast-close" aria-label="Cerrar" data-close-toast="true">x</button>
        <div class="custom-toast-header">
            <div class="custom-toast-icon">${icon}</div>
            <div>
                <h3 class="custom-toast-title">${title}</h3>
                <p class="custom-toast-text">${message}</p>
            </div>
        </div>
        <div class="custom-toast-progress">
            <span class="custom-toast-progress-fill"></span>
        </div>
    `;

    document.body.appendChild(toast);
    toast.offsetHeight;
    toast.classList.add('show');

    const progressFill = toast.querySelector('.custom-toast-progress-fill');
    if (progressFill) {
        progressFill.style.transition = `transform ${duration}ms linear`;
        setTimeout(() => {
            progressFill.style.transform = 'scaleX(0)';
        }, 20);
    }

    const closeToast = () => {
        if (!document.body.contains(toast)) return;
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 220);
    };

    toast.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.dataset.closeToast === 'true') {
            closeToast();
        }
    });

    window.__authNotificationTimer = setTimeout(() => {
        closeToast();
        window.__authNotificationTimer = null;
    }, duration);
}

// ========== AÑADIR ESTILOS CSS PARA NOTIFICACIONES ==========

function addNotificationStyles() {
    if (document.getElementById('notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        .custom-toast {
            position: fixed;
            top: 16px;
            right: 16px;
            width: min(90vw, 360px);
            border-radius: 14px;
            padding: 14px 14px 10px;
            background: #ffffff;
            border: 1px solid #dbe3ee;
            box-shadow: 0 16px 36px rgba(15, 23, 42, 0.2);
            z-index: 10000;
            transform: translateY(-12px);
            opacity: 0;
            pointer-events: auto;
            transition: transform 0.22s ease, opacity 0.22s ease;
        }

        .custom-toast.show {
            transform: translateY(0);
            opacity: 1;
        }

        .custom-toast.hide {
            transform: translateY(-8px);
            opacity: 0;
        }

        .custom-toast::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            border-radius: 14px 14px 0 0;
            background: #3b82f6;
        }

        .custom-toast-success::before {
            background: #10b981;
        }

        .custom-toast-error::before {
            background: #ef4444;
        }

        .custom-toast-warning::before {
            background: #f59e0b;
        }

        .custom-toast-close {
            position: absolute;
            top: 8px;
            right: 8px;
            border: 0;
            width: 24px;
            height: 24px;
            border-radius: 6px;
            background: rgba(15, 23, 42, 0.08);
            color: #0f172a;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
        }

        .custom-toast-header {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding-right: 20px;
        }

        .custom-toast-icon {
            width: 30px;
            height: 30px;
            flex-shrink: 0;
            border-radius: 8px;
            display: grid;
            place-items: center;
            font-weight: 800;
            color: #0f172a;
            background: rgba(59, 130, 246, 0.14);
            font-size: 12px;
        }

        .custom-toast-success .custom-toast-icon {
            background: rgba(16, 185, 129, 0.15);
            color: #065f46;
        }

        .custom-toast-error .custom-toast-icon {
            background: rgba(239, 68, 68, 0.15);
            color: #7f1d1d;
        }

        .custom-toast-warning .custom-toast-icon {
            background: rgba(245, 158, 11, 0.18);
            color: #7c2d12;
        }

        .custom-toast-title {
            margin: 0 0 2px;
            color: #0f172a;
            font-size: 0.92rem;
            line-height: 1.2;
        }

        .custom-toast-text {
            margin: 0;
            color: #334155;
            font-size: 0.86rem;
            line-height: 1.38;
        }

        .custom-toast-progress {
            margin-top: 10px;
            height: 2px;
            border-radius: 999px;
            background: #e2e8f0;
            overflow: hidden;
        }

        .custom-toast-progress-fill {
            display: block;
            height: 100%;
            width: 100%;
            transform-origin: left center;
            transform: scaleX(1);
            background: #3b82f6;
        }

        .custom-toast-success .custom-toast-progress-fill {
            background: #10b981;
        }

        .custom-toast-error .custom-toast-progress-fill {
            background: #ef4444;
        }

        .custom-toast-warning .custom-toast-progress-fill {
            background: #f59e0b;
        }

        @media (max-width: 640px) {
            .custom-toast {
                left: 10px;
                right: 10px;
                top: 10px;
                width: auto;
            }
        }

        /* Animación de botón loading */
        .btn-loading {
            display: none;
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;

    document.head.appendChild(style);
}

// ========== LOGIN CON GOOGLE ==========
async function handleGoogleLogin(e) {
    e.preventDefault();
    if (isProcessing) return;

    if (!window.firebase || typeof window.firebase.loginWithGoogle !== 'function') {
        showNotification('El inicio de sesión con Google no está disponible en este momento', 'error');
        return;
    }

    isProcessing = true;
    const googleBtn = e.currentTarget;
    const originalText = googleBtn.querySelector('span')?.textContent || 'Google';
    googleBtn.disabled = true;
    const googleBtnSpan = googleBtn.querySelector('span');
    if (googleBtnSpan) googleBtnSpan.textContent = 'Conectando...';

    try {
        const user = await window.firebase.loginWithGoogle();

        if (user?.redirectStarted) {
            showNotification('Redirigiendo a Google para iniciar sesión...', 'info', 2500);
            return;
        }

        const sessionData = {
            uid: user.uid,
            email: user.email,
            name: user.name || user.displayName || user.email?.split('@')[0] || 'Usuario',
            role: user.role || 'client',
            provider: 'google',
            photoURL: user.photoURL || '',
            loggedInAt: new Date().toISOString()
        };

        persistCurrentUserSession(sessionData);

        showNotification(`¡Bienvenido ${sessionData.name}! ✅ Sesión iniciada con Google`, 'success', 3200);

        const postLoginRedirect = getPostLoginRedirect(sessionData);
        setTimeout(() => {
            window.location.href = postLoginRedirect;
        }, 1400);
    } catch (error) {
        console.error('Google login error:', error);

        const authenticatedUser = window.firebase?.auth?.currentUser;
        if (authenticatedUser?.uid) {
            const fallbackSession = {
                uid: authenticatedUser.uid,
                email: authenticatedUser.email || '',
                name: authenticatedUser.displayName || authenticatedUser.email?.split('@')[0] || 'Usuario',
                role: 'client',
                provider: 'google',
                photoURL: authenticatedUser.photoURL || '',
                loggedInAt: new Date().toISOString()
            };

            persistCurrentUserSession(fallbackSession);
            window.location.href = getPostLoginRedirect(fallbackSession);
            return;
        }

        const errorMessage = error?.customMessage || error?.message || 'No se pudo iniciar sesión con Google';
        showNotification(errorMessage, 'error');
    } finally {
        googleBtn.disabled = false;
        if (googleBtnSpan) googleBtnSpan.textContent = originalText;
        isProcessing = false;
    }
}