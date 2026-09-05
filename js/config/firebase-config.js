// firebase-config.js - VERSIÓN COMPLETA CORREGIDA
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    query,
    where,
    updateDoc,
    doc,
    setDoc,
    getDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";
import {
    getStorage,
    ref as storageRef,
    uploadString,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    GoogleAuthProvider,
    signOut, 
    onAuthStateChanged,
    updateProfile,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// Configuración de Firebase (modo seguro para repositorio público)
// Opciones de carga de config:
// 1) window.FIREBASE_CONFIG inyectado por script local
// 2) archivo local JSON (si existe)
// 3) fallback publico embebido (seguro para cliente web)
const FALLBACK_FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAYqq0MEXq4mHvLxMM8V334dnExPcPqZ5w',
    authDomain: 'monsite-85424.firebaseapp.com',
    projectId: 'monsite-85424',
    storageBucket: 'monsite-85424.appspot.com',
    messagingSenderId: '736268363141',
    appId: '1:736268363141:web:1acf814ce570374ccb90ec',
    measurementId: 'G-WG4CRFJWJJ'
};

function loadFirebaseConfigFromLocalJson() {
    const configPaths = [
        '/js/config/firebase-config.local.json',
        './firebase-config.local.json',
        'firebase-config.local.json'
    ];

    for (const path of configPaths) {
        try {
            const request = new XMLHttpRequest();
            request.open('GET', path, false);
            request.send(null);

            if (request.status >= 200 && request.status < 300 && request.responseText) {
                const parsed = JSON.parse(request.responseText);
                if (parsed && typeof parsed === 'object' && parsed.apiKey) {
                    return parsed;
                }
            }
        } catch (_) {
            // no-op
        }
    }

    return null;
}

const firebaseConfig = window.FIREBASE_CONFIG || FALLBACK_FIREBASE_CONFIG || loadFirebaseConfigFromLocalJson();

if (!firebaseConfig || typeof firebaseConfig !== 'object' || !firebaseConfig.apiKey) {
    throw new Error('No se pudo resolver la configuracion de Firebase.');
}

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

console.log('✅ Firebase Inicializado');

// ========== FUNCIONES DE AUTENTICACIÓN ==========

/**
 * Registrar nuevo usuario
 */
async function registerUser(email, password, name) {
    console.log('🔄 [registerUser] Iniciando registro para:', email);

    if (!isStrongPassword(password)) {
        throw {
            code: 'auth/weak-password',
            message: 'La contraseña no cumple los requisitos de seguridad',
            customMessage: 'La contraseña debe tener al menos 12 caracteres, 1 mayúscula, 1 número y 1 carácter especial.'
        };
    }
    
    try {
        // 1. Crear usuario en Authentication
        console.log('🔑 Creando usuario en Auth...');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log('✅ Usuario creado en Auth. UID:', user.uid);

        // 2. Actualizar el displayName en el perfil
        console.log('👤 Actualizando perfil...');
        try {
            await updateProfile(user, { displayName: name });
            console.log('✅ Perfil actualizado');
        } catch (profileError) {
            console.warn('⚠️ No se pudo actualizar el perfil (continuando):', profileError.message);
        }

        // 3. Guardar datos en Firestore
        console.log('💾 Guardando datos en Firestore...');
        try {
            const userDocRef = doc(db, "users", user.uid);
            
            const userData = {
                uid: user.uid,
                name: name,
                email: email,
                displayName: name,
                role: "client",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                emailVerified: false
            };
            
            console.log('📄 Datos a guardar:', userData);
            await setDoc(userDocRef, userData);
            console.log('✅ Datos guardados en Firestore');
                
        } catch (firestoreError) {
            console.error('❌ Error en Firestore:', firestoreError);
            // Continuamos aunque falle Firestore
        }

        // 4. Retornar datos del usuario
        console.log('🎉 Registro completado exitosamente');
        return {
            uid: user.uid,
            email: user.email,
            name: name,
            displayName: name,
            role: "client",
            success: true
        };

    } catch (error) {
        console.error('💥 ERROR en registerUser:', error);
        
        const structuredError = {
            code: error.code || 'unknown',
            message: error.message || 'Error desconocido',
            customMessage: getFirebaseErrorMessage(error.code),
            timestamp: new Date().toISOString()
        };
        
        throw structuredError;
    }
}

/**
 * Iniciar sesión
 */
async function loginUser(email, password) {
    console.log('🔄 [loginUser] Intentando login:', email);
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log('✅ Login exitoso. UID:', user.uid);
        
        // Obtener datos adicionales de Firestore
        let firestoreData = {};
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                firestoreData = userDoc.data();
                console.log('📄 Datos de Firestore obtenidos');
            }
        } catch (fsError) {
            console.warn('⚠️ No se pudieron obtener datos de Firestore:', fsError.message);
        }
        
        const userData = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email,
            name: firestoreData.name || user.displayName || user.email,
            role: firestoreData.role || 'client',
            ...firestoreData
        };
        
        return userData;
        
    } catch (error) {
        console.error('❌ Error en loginUser:', error);
        throw {
            code: error.code,
            message: error.message,
            customMessage: getFirebaseErrorMessage(error.code)
        };
    }
}

/**
 * Iniciar sesión con Google
 */
async function loginWithGoogle() {
    console.log('🔄 [loginWithGoogle] Iniciando login con Google...');

    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        let firestoreData = {};
        try {
            firestoreData = await upsertGoogleUserProfile(user);
        } catch (profileError) {
            console.warn('⚠️ Login Google correcto; no se pudo sincronizar el perfil:', profileError.message);
        }
        return buildGoogleUserSessionPayload(user, firestoreData);

    } catch (error) {
        console.error('❌ Error en loginWithGoogle:', error);

        if (error.code === 'auth/operation-not-allowed') {
            throw {
                code: error.code,
                message: error.message,
                customMessage: 'Google Sign-In no está habilitado en Firebase. Activa el proveedor Google en Firebase Console > Authentication > Sign-in method.'
            };
        }

        if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
            await signInWithRedirect(auth, googleProvider);
            return {
                redirectStarted: true
            };
        }

        throw {
            code: error.code,
            message: error.message,
            customMessage: getFirebaseErrorMessage(error.code)
        };
    }
}

function buildGoogleUserSessionPayload(user, firestoreData = {}) {
    return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email,
        name: firestoreData?.name || user.displayName || user.email,
        role: firestoreData?.role || 'client',
        photoURL: user.photoURL || '',
        provider: 'google'
    };
}

async function upsertGoogleUserProfile(user) {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    let firestoreData = null;

    if (!userSnap.exists()) {
        firestoreData = {
            uid: user.uid,
            name: user.displayName || user.email?.split('@')[0] || 'Usuario',
            email: user.email,
            displayName: user.displayName || user.email,
            photoURL: user.photoURL || '',
            role: 'client',
            provider: 'google',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            emailVerified: !!user.emailVerified
        };

        await setDoc(userRef, firestoreData, { merge: true });
        console.log('✅ Usuario Google creado en Firestore');
    } else {
        firestoreData = userSnap.data();
        await setDoc(userRef, {
            name: user.displayName || firestoreData.name || user.email,
            displayName: user.displayName || firestoreData.displayName || user.email,
            photoURL: user.photoURL || firestoreData.photoURL || '',
            updatedAt: new Date().toISOString(),
            provider: 'google'
        }, { merge: true });
    }

    return firestoreData;
}

/**
 * Procesar resultado de login con Google vía redirect
 */
async function getGoogleRedirectUser() {
    try {
        const result = await getRedirectResult(auth);
        if (!result || !result.user) {
            return null;
        }

        const user = result.user;
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        let firestoreData = null;

        if (!userSnap.exists()) {
            firestoreData = {
                uid: user.uid,
                name: user.displayName || user.email?.split('@')[0] || 'Usuario',
                email: user.email,
                displayName: user.displayName || user.email,
                photoURL: user.photoURL || '',
                role: 'client',
                provider: 'google',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                emailVerified: !!user.emailVerified
            };
            await setDoc(userRef, firestoreData, { merge: true });
        } else {
            firestoreData = userSnap.data();
            await setDoc(userRef, {
                name: user.displayName || firestoreData.name || user.email,
                displayName: user.displayName || firestoreData.displayName || user.email,
                photoURL: user.photoURL || firestoreData.photoURL || '',
                updatedAt: new Date().toISOString(),
                provider: 'google'
            }, { merge: true });
        }

        return {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email,
            name: firestoreData?.name || user.displayName || user.email,
            role: firestoreData?.role || 'client',
            photoURL: user.photoURL || '',
            provider: 'google'
        };
    } catch (error) {
        console.error('❌ Error en getGoogleRedirectUser:', error);
        throw {
            code: error.code,
            message: error.message,
            customMessage: getFirebaseErrorMessage(error.code)
        };
    }
}

/**
 * Enviar email de restablecimiento de contraseña
 */
async function requestPasswordReset(email) {
    console.log('🔄 [requestPasswordReset] Solicitud para:', email);

    try {
        const emailQuery = query(collection(db, 'users'), where('email', '==', email));
        const snapshot = await getDocs(emailQuery);

        if (snapshot.empty) {
            return {
                success: false,
                notFound: true,
                message: 'No existe una cuenta con ese correo'
            };
        }

        const actionCodeSettings = {
            url: `${window.location.origin}/reset-password.html`,
            handleCodeInApp: true
        };

        await sendPasswordResetEmail(auth, email, actionCodeSettings);

        return {
            success: true,
            message: 'Email de restablecimiento enviado'
        };

    } catch (error) {
        console.error('❌ Error en requestPasswordReset:', error);
        return {
            success: false,
            notFound: false,
            message: getFirebaseErrorMessage(error.code) || error.message
        };
    }
}

/**
 * Confirmar restablecimiento de contraseña
 */
async function confirmPasswordResetFunction(oobCode, newPassword) {
    console.log('🔄 [confirmPasswordReset] Confirmando reset...');

    try {
        await confirmPasswordReset(auth, oobCode, newPassword);
        console.log('✅ Contraseña restablecida exitosamente');
        
        return {
            success: true,
            message: 'Contraseña cambiada exitosamente'
        };

    } catch (error) {
        console.error('❌ Error en confirmPasswordReset:', error);
        return {
            success: false,
            message: getFirebaseErrorMessage(error.code) || error.message
        };
    }
}

async function updateCurrentUserName(newName) {
    const trimmedName = String(newName || '').trim();
    if (!trimmedName) {
        throw {
            code: 'validation/invalid-name',
            message: 'Nombre inválido',
            customMessage: 'Ingresa un nombre válido.'
        };
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw {
            code: 'auth/not-authenticated',
            message: 'No hay sesión activa',
            customMessage: 'Debes iniciar sesión para actualizar tu perfil.'
        };
    }

    await updateProfile(currentUser, { displayName: trimmedName });
    await setDoc(doc(db, 'users', currentUser.uid), {
        name: trimmedName,
        displayName: trimmedName,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    return {
        uid: currentUser.uid,
        name: trimmedName,
        email: currentUser.email || ''
    };
}

async function verifyCurrentPassword(currentPassword) {
    const currentUser = auth.currentUser;
    const normalizedPassword = String(currentPassword || '').trim();

    if (!currentUser || !currentUser.email) {
        throw {
            code: 'auth/not-authenticated',
            message: 'No hay sesión activa',
            customMessage: 'Debes iniciar sesión para cambiar tu contraseña.'
        };
    }

    if (!normalizedPassword) {
        throw {
            code: 'validation/empty-current-password',
            message: 'Contraseña actual vacía',
            customMessage: 'Ingresa tu contraseña actual.'
        };
    }

    const credential = EmailAuthProvider.credential(currentUser.email, normalizedPassword);
    await reauthenticateWithCredential(currentUser, credential);
    return true;
}

async function changeCurrentUserPassword(newPassword) {
    const currentUser = auth.currentUser;

    if (!currentUser) {
        throw {
            code: 'auth/not-authenticated',
            message: 'No hay sesión activa',
            customMessage: 'Debes iniciar sesión para cambiar tu contraseña.'
        };
    }

    if (!isStrongPassword(newPassword)) {
        throw {
            code: 'auth/weak-password',
            message: 'La contraseña no cumple los requisitos de seguridad',
            customMessage: 'La nueva contraseña debe tener al menos 12 caracteres, 1 mayúscula, 1 número y 1 carácter especial.'
        };
    }

    await updatePassword(currentUser, newPassword);
    await setDoc(doc(db, 'users', currentUser.uid), {
        updatedAt: new Date().toISOString()
    }, { merge: true });

    return true;
}

async function requestAccountDeletion(reason = '') {
    const currentUser = auth.currentUser;

    if (!currentUser) {
        throw {
            code: 'auth/not-authenticated',
            message: 'No hay sesión activa',
            customMessage: 'Debes iniciar sesión para solicitar la eliminación de tu cuenta.'
        };
    }

    const payload = {
        uid: currentUser.uid,
        email: currentUser.email || '',
        name: currentUser.displayName || currentUser.email || 'Usuario',
        reason: String(reason || '').trim(),
        status: 'pending',
        requestedAt: new Date().toISOString()
    };

    const requestRef = await addDoc(collection(db, 'accountDeletionRequests'), payload);

    await setDoc(doc(db, 'users', currentUser.uid), {
        deletionRequest: {
            status: 'pending',
            requestedAt: payload.requestedAt,
            requestId: requestRef.id,
            reason: payload.reason
        },
        updatedAt: new Date().toISOString()
    }, { merge: true });

    return {
        requestId: requestRef.id,
        ...payload
    };
}

/**
 * Verificar si un usuario es administrador
 */
async function isUserAdmin(userId) {
    try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            return userData.role === 'admin';
        }
        return false;
    } catch (error) {
        console.error('Error al verificar rol:', error);
        return false;
    }
}

async function getUserRole(userId) {
    try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (!userDoc.exists()) {
            return 'client';
        }

        const userData = userDoc.data() || {};
        return String(userData.role || 'client');
    } catch (error) {
        console.error('Error al obtener rol de usuario:', error);
        return 'client';
    }
}

async function isUserBodeguero(userId) {
    try {
        if (String(userId || '') === 'yFNJUJUJiaXbOiHLGGPsIJWShbC2') {
            return true;
        }

        const role = await getUserRole(userId);
        if (role === 'bodeguero') {
            return true;
        }

        const userDoc = await getDoc(doc(db, "users", userId));
        if (!userDoc.exists()) {
            return false;
        }

        const email = String(userDoc.data()?.email || '').toLowerCase();
        return email === 'bodegamonsite@gmail.com';
    } catch (error) {
        console.error('Error al verificar rol bodeguero:', error);
        return false;
    }
}

/**
 * Cerrar sesión
 */
async function logoutUser() {
    try {
        await signOut(auth);
        console.log('✅ Sesión cerrada');
        return true;
    } catch (error) {
        console.error('❌ Error al cerrar sesión:', error);
        throw error;
    }
}

/**
 * Crear usuario admin (solo por administrador)
 */
async function createAdminUser(email, password, name) {
    console.log('👨‍💼 [createAdminUser] Creando usuario admin:', email);
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName: name });
        
        // Guardar con rol admin en Firestore
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, {
            uid: user.uid,
            name: name,
            email: email,
            displayName: name,
            role: "admin",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            emailVerified: false,
            permissions: {
                products: true,
                categories: true,
                orders: true,
                users: false
            }
        });
        
        console.log('✅ Usuario admin creado:', email);
        return {
            uid: user.uid,
            email: user.email,
            name: name,
            role: "admin",
            success: true
        };
    } catch (error) {
        console.error('❌ Error creando admin:', error);
        throw {
            code: error.code,
            message: error.message,
            customMessage: getFirebaseErrorMessage(error.code)
        };
    }
}

/**
 * Promover usuario a admin
 */
async function promoteUserToAdmin(userId) {
    console.log('👨‍💼 [promoteUserToAdmin] Promoviendo usuario:', userId);
    
    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, {
            role: "admin",
            updatedAt: new Date().toISOString(),
            permissions: {
                products: true,
                categories: true,
                orders: true,
                users: false
            }
        });
        
        console.log('✅ Usuario promovido a admin:', userId);
        return true;
    } catch (error) {
        console.error('❌ Error promoviendo usuario:', error);
        throw error;
    }
}

/**
 * Obtener usuario actual
 */
function getCurrentUser(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userDoc = await getDoc(doc(db, "users", user.uid));
                let userData = {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName || user.email
                };
                
                if (userDoc.exists()) {
                    const firestoreData = userDoc.data();
                    userData = { ...userData, ...firestoreData };
                }
                
                callback(userData);
            } catch (error) {
                console.error('Error al obtener datos de usuario:', error);
                callback(user);
            }
        } else {
            callback(null);
        }
    });
}

// ========== FUNCIONES DE ÓRDENES (DEFINIRLAS ANTES DE USARLAS) ==========

/**
 * Sanitizar datos para Firestore
 */
function sanitizeForFirestore(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeForFirestore(item));
    }
    
    const cleaned = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key) && obj[key] !== undefined) {
            cleaned[key] = sanitizeForFirestore(obj[key]);
        }
    }
    return cleaned;
}

/**
 * Crear nueva orden
 */
async function createOrder(order) {
    try {
        const sanitizedOrder = sanitizeForFirestore(order);
        const explicitId = sanitizedOrder?.id ? String(sanitizedOrder.id) : '';

        if (explicitId) {
            await setDoc(doc(db, "orders", explicitId), {
                ...sanitizedOrder,
                id: explicitId
            }, { merge: true });
            console.log('✅ Orden creada en Firestore con ID determinístico:', explicitId);
            return explicitId;
        }

        const orderRef = await addDoc(collection(db, "orders"), sanitizedOrder);
        console.log('✅ Orden creada en Firestore:', orderRef.id);
        return orderRef.id;
    } catch (error) {
        console.error('❌ Error al crear orden:', error);
        throw error;
    }
}

/**
 * Obtener TODAS las órdenes (para admin)
 */
async function getAllOrders() {
    try {
        console.log('🔄 getAllOrders() - Conectando a Firebase...');
        
        // Verificar que db está disponible
        if (!db) {
            throw new Error('Firestore db no inicializado');
        }
        
        console.log('🔄 getAllOrders() - Obteniendo colección...');
        const ordersCollection = collection(db, "orders");
        
        console.log('🔄 getAllOrders() - Ejecutando query...');
        const querySnapshot = await getDocs(ordersCollection);
        
        console.log('🔄 getAllOrders() - Procesando documentos...', querySnapshot.size);
        const orders = [];

        querySnapshot.forEach((doc) => {
            const orderData = doc.data();
            console.log('📄 Documento encontrado:', doc.id, 'Status:', orderData.status);
            orders.push({
                ...orderData,
                id: orderData.id || doc.id,
                firestoreId: doc.id
            });
        });

        console.log('✅ Todas las órdenes cargadas desde Firebase:', orders.length, 'órdenes');
        return orders;
    } catch (error) {
        console.error('❌ Error CRÍTICO en getAllOrders:', error);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        throw error;
    }
}

/**
 * Obtener órdenes del usuario
 */
async function getUserOrders(userId) {
    try {
        const q = query(collection(db, "orders"), where("userId", "==", userId));
        const querySnapshot = await getDocs(q);
        const orders = [];

        querySnapshot.forEach((doc) => {
            const orderData = doc.data();
            orders.push({
                ...orderData,
                id: orderData.id || doc.id,
                firestoreId: doc.id
            });
        });

        console.log('✅ Órdenes cargadas:', orders.length);
        return orders;
    } catch (error) {
        console.error('❌ Error al obtener órdenes:', error);
        throw error;
    }
}

async function trackPageVisit() {
    try {
        const visitorKey = 'monsite_visitor_id';
        let visitorId = localStorage.getItem(visitorKey);
        if (!visitorId) {
            visitorId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            localStorage.setItem(visitorKey, visitorId);
        }

        const today = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
        const lastVisitKey = 'monsite_last_visit_date';
        if (localStorage.getItem(lastVisitKey) === today) return;
        localStorage.setItem(lastVisitKey, today);

        await addDoc(collection(db, 'analyticsVisits'), {
            date: today,
            visitorId,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        if (error?.code !== 'already-exists') {
            console.warn('No se pudo registrar visita anónima:', error.message);
        }
    }
}

async function getAnalyticsMetrics(startDate, endDate) {
    const visitsQuery = query(collection(db, 'analyticsVisits'), where('date', '>=', startDate), where('date', '<=', endDate));
    const usersQuery = query(collection(db, 'users'), where('createdAt', '>=', `${startDate}T00:00:00.000Z`), where('createdAt', '<=', `${endDate}T23:59:59.999Z`));
    const [visitsSnapshot, usersSnapshot] = await Promise.all([getDocs(visitsQuery), getDocs(usersQuery)]);
    return {
        visits: visitsSnapshot.docs.map(snapshot => snapshot.data()),
        newUsers: usersSnapshot.docs.map(snapshot => snapshot.data())
    };
}

/**
 * Actualizar estado de orden
 */
async function updateOrderStatus(orderId, newStatus) {
    try {
        const payload = {
            status: newStatus,
            updatedAt: new Date().toISOString(),
            paymentStatus: newStatus === 'paid' ? 'approved' : newStatus
        };

        if (newStatus === 'paid') {
            payload.paymentDate = new Date().toISOString();
        }

        const orderRef = doc(db, "orders", String(orderId));
        await updateDoc(orderRef, payload);

        console.log('✅ Orden actualizada:', orderId, '->', newStatus);
        return true;
    } catch (error) {
        const isNotFound = error?.code === 'not-found' || error?.message?.includes('No document to update');

        if (isNotFound) {
            console.warn('⚠️ Orden no encontrada por docId, buscando por campo id:', orderId);
            const lookupQuery = query(collection(db, "orders"), where("id", "==", String(orderId)));
            const lookupSnapshot = await getDocs(lookupQuery);

            if (!lookupSnapshot.empty) {
                const docToUpdate = lookupSnapshot.docs[0];
                const payload = {
                    status: newStatus,
                    updatedAt: new Date().toISOString(),
                    paymentStatus: newStatus === 'paid' ? 'approved' : newStatus
                };

                if (newStatus === 'paid') {
                    payload.paymentDate = new Date().toISOString();
                }

                await updateDoc(docToUpdate.ref, payload);
                console.log('✅ Orden actualizada por id lógico:', orderId, '->', newStatus);
                return true;
            }
        }

        console.error('❌ Error al actualizar orden:', error);
        throw error;
    }
}

async function updateOrderWarehouseData(orderId, updateData = {}) {
    const validStatus = new Set(['paid', 'shipped', 'delivered', 'refunded']);
    const validStockStatus = new Set(['unknown', 'in_stock', 'out_of_stock']);

    const payload = {
        updatedAt: new Date().toISOString()
    };

    if (typeof updateData.status === 'string' && validStatus.has(updateData.status)) {
        payload.status = updateData.status;
    }

    if (typeof updateData.warehouseStockStatus === 'string' && validStockStatus.has(updateData.warehouseStockStatus)) {
        payload.warehouseStockStatus = updateData.warehouseStockStatus;
    }

    if (typeof updateData.warehouseStockNote === 'string') {
        payload.warehouseStockNote = updateData.warehouseStockNote.trim().slice(0, 200);
    }

    if (typeof updateData.warehouseUpdatedBy === 'string' && updateData.warehouseUpdatedBy.trim()) {
        payload.warehouseUpdatedBy = updateData.warehouseUpdatedBy.trim();
    }

    if (updateData.warehouseItemsStatus && typeof updateData.warehouseItemsStatus === 'object') {
        payload.warehouseItemsStatus = sanitizeForFirestore(updateData.warehouseItemsStatus);
    }

    payload.warehouseUpdatedAt = new Date().toISOString();

    try {
        const orderRef = doc(db, "orders", String(orderId));
        await updateDoc(orderRef, payload);
        console.log('✅ Orden actualizada por bodega:', orderId);
        return true;
    } catch (error) {
        const isNotFound = error?.code === 'not-found' || error?.message?.includes('No document to update');

        if (isNotFound) {
            const lookupQuery = query(collection(db, "orders"), where("id", "==", String(orderId)));
            const lookupSnapshot = await getDocs(lookupQuery);

            if (!lookupSnapshot.empty) {
                await updateDoc(lookupSnapshot.docs[0].ref, payload);
                console.log('✅ Orden actualizada por id lógico (bodega):', orderId);
                return true;
            }
        }

        console.error('❌ Error al actualizar orden de bodega:', error);
        throw error;
    }
}

// ========== FUNCIONES DE PRODUCTOS ==========

/**
 * Obtener todos los productos
 */
async function getProducts() {
    try {
        const userLS = JSON.parse(localStorage.getItem('hairia_current_user') || 'null');
        const userSS = JSON.parse(sessionStorage.getItem('hairia_current_user') || 'null');
        const currentUser = userLS || userSS;
        const hasAdminRoleInSession = currentUser?.role === 'admin';
        let canUseAdminQuery = false;

        if (hasAdminRoleInSession && auth.currentUser?.uid) {
            canUseAdminQuery = await isUserAdmin(auth.currentUser.uid);
        }

        const productsQuery = collection(db, "products");

        const querySnapshot = await getDocs(productsQuery);
        const products = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            products.push({
                ...data,
                legacyId: data?.id ?? null,
                id: doc.id
            });
        });

        console.log('✅ Productos cargados:', products.length);
        return products;
    } catch (error) {
        const isPermissionError = error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied';

        if (isPermissionError) {
            console.warn('⚠️ Permiso denegado en consulta admin, reintentando consulta pública...');
            try {
                const publicQuery = query(collection(db, "products"), where("active", "==", true));
                const publicSnapshot = await getDocs(publicQuery);
                const publicProducts = [];

                publicSnapshot.forEach((productDoc) => {
                    const data = productDoc.data();
                    publicProducts.push({
                        ...data,
                        legacyId: data?.id ?? null,
                        id: productDoc.id
                    });
                });

                console.log('✅ Productos públicos cargados tras fallback:', publicProducts.length);
                return publicProducts;
            } catch (fallbackError) {
                console.error('❌ Error en fallback de productos públicos:', fallbackError);
            }
        }

        console.error('❌ Error al obtener productos:', error);
        throw error;
    }
}

/**
 * Crear nuevo producto
 */
async function createProduct(productData) {
    try {
        const sanitizedData = sanitizeForFirestore(productData);
        const docRef = await addDoc(collection(db, "products"), {
            ...sanitizedData,
            active: sanitizedData.active !== false,
            createdAt: new Date().toISOString()
        });
        
        console.log('✅ Producto creado:', docRef.id);
        return {
            id: docRef.id,
            ...sanitizedData
        };
    } catch (error) {
        console.error('❌ Error al crear producto:', error);
        throw error;
    }
}

/**
 * Actualizar producto
 */
async function updateProduct(productId, productData) {
    try {
        const sanitizedData = sanitizeForFirestore(productData);
        const productRef = doc(db, "products", String(productId));
        
        await updateDoc(productRef, {
            ...sanitizedData,
            updatedAt: new Date().toISOString()
        });
        
        console.log('✅ Producto actualizado:', productId);
        return true;
    } catch (error) {
        const isNotFound = error?.code === 'not-found' || error?.message?.includes('No document to update');

        if (isNotFound) {
            console.warn('⚠️ Producto no encontrado por docId, intentando búsqueda por id lógico:', productId);
            const lookupQuery = query(collection(db, "products"), where("id", "==", String(productId)));
            const lookupSnapshot = await getDocs(lookupQuery);

            if (!lookupSnapshot.empty) {
                const productDoc = lookupSnapshot.docs[0];
                const sanitizedData = sanitizeForFirestore(productData);
                await updateDoc(productDoc.ref, {
                    ...sanitizedData,
                    updatedAt: new Date().toISOString()
                });
                console.log('✅ Producto actualizado por id lógico:', productId);
                return true;
            }
        }

        console.error('❌ Error al actualizar producto:', error);
        throw error;
    }
}

/**
 * Eliminar producto
 */
async function deleteProduct(productId) {
    try {
        const normalizedId = String(productId);
        await deleteDoc(doc(db, "products", normalizedId));

        console.log('✅ Producto eliminado definitivamente:', normalizedId);
        return true;
    } catch (error) {
        const isNotFound = error?.code === 'not-found' || error?.message?.includes('No document to delete');

        if (isNotFound) {
            console.warn('⚠️ Producto no encontrado por docId, intentando búsqueda por id lógico:', productId);
            const lookupQuery = query(collection(db, "products"), where("id", "==", String(productId)));
            const lookupSnapshot = await getDocs(lookupQuery);

            if (!lookupSnapshot.empty) {
                await deleteDoc(lookupSnapshot.docs[0].ref);
                console.log('✅ Producto eliminado por id lógico:', productId);
                return true;
            }
        }

        console.error('❌ Error al eliminar producto:', error);
        throw error;
    }
}

/**
 * Obtener productos por categoría
 */
async function getProductsByCategory(categoryId) {
    try {
        const q = query(
            collection(db, "products"), 
            where("category", "==", categoryId),
            where("active", "==", true)
        );
        const querySnapshot = await getDocs(q);
        const products = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            products.push({
                ...data,
                legacyId: data?.id ?? null,
                id: doc.id
            });
        });

        console.log(`✅ Productos de categoría ${categoryId}:`, products.length);
        return products;
    } catch (error) {
        console.error('❌ Error al obtener productos por categoría:', error);
        throw error;
    }
}

/**
 * Obtener productos destacados
 */
async function getFeaturedProducts() {
    try {
        const q = query(
            collection(db, "products"), 
            where("featured", "==", true),
            where("active", "==", true)
        );
        const querySnapshot = await getDocs(q);
        const products = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            products.push({
                ...data,
                legacyId: data?.id ?? null,
                id: doc.id
            });
        });

        console.log('✅ Productos destacados:', products.length);
        return products;
    } catch (error) {
        console.error('❌ Error al obtener productos destacados:', error);
        throw error;
    }
}

// ========== FUNCIONES DE CATEGORÍAS, MARCAS Y DESCUENTOS ==========

async function getCategories() {
    try {
        const querySnapshot = await getDocs(collection(db, "categories"));
        const categories = [];

        querySnapshot.forEach((categoryDoc) => {
            categories.push({
                id: categoryDoc.id,
                ...categoryDoc.data()
            });
        });

        return categories;
    } catch (error) {
        console.error('❌ Error al obtener categorías:', error);
        throw error;
    }
}

async function saveCategory(categoryData) {
    try {
        const id = String(categoryData.id || Date.now());
        const payload = sanitizeForFirestore({
            ...categoryData,
            id,
            updatedAt: new Date().toISOString()
        });

        await setDoc(doc(db, "categories", id), payload, { merge: true });
        return payload;
    } catch (error) {
        console.error('❌ Error al guardar categoría:', error);
        throw error;
    }
}

async function deleteCategory(categoryId) {
    try {
        await deleteDoc(doc(db, "categories", String(categoryId)));
        return true;
    } catch (error) {
        console.error('❌ Error al eliminar categoría:', error);
        throw error;
    }
}

async function getBrands() {
    try {
        const userLS = JSON.parse(localStorage.getItem('hairia_current_user') || 'null');
        const userSS = JSON.parse(sessionStorage.getItem('hairia_current_user') || 'null');
        const currentUser = userLS || userSS;
        const hasAdminRoleInSession = currentUser?.role === 'admin';
        let canUseAdminQuery = false;

        if (hasAdminRoleInSession && auth.currentUser?.uid) {
            canUseAdminQuery = await isUserAdmin(auth.currentUser.uid);
        }

        const brandsQuery = canUseAdminQuery
            ? collection(db, "brands")
            : query(collection(db, "brands"), where("active", "==", true));

        const querySnapshot = await getDocs(brandsQuery);
        const brands = [];

        querySnapshot.forEach((brandDoc) => {
            brands.push({
                id: brandDoc.id,
                ...brandDoc.data()
            });
        });

        return brands;
    } catch (error) {
        const isPermissionError = error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied';

        if (isPermissionError) {
            console.warn('⚠️ Permiso denegado en consulta admin de marcas, reintentando consulta publica...');
            try {
                const publicQuery = query(collection(db, "brands"), where("active", "==", true));
                const publicSnapshot = await getDocs(publicQuery);
                const publicBrands = [];

                publicSnapshot.forEach((brandDoc) => {
                    publicBrands.push({
                        id: brandDoc.id,
                        ...brandDoc.data()
                    });
                });

                return publicBrands;
            } catch (fallbackError) {
                console.error('❌ Error en fallback de marcas públicas:', fallbackError);
            }
        }

        console.error('❌ Error al obtener marcas:', error);
        throw error;
    }
}

async function saveBrand(brandData) {
    try {
        const id = String(brandData.id || Date.now()).toLowerCase();
        const payload = sanitizeForFirestore({
            ...brandData,
            id,
            updatedAt: new Date().toISOString()
        });

        await setDoc(doc(db, "brands", id), payload, { merge: true });
        return payload;
    } catch (error) {
        console.error('❌ Error al guardar marca:', error);
        throw error;
    }
}

async function uploadBrandLogo(dataUrl, brandId) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        return dataUrl || '';
    }

    const safeBrandId = String(brandId || 'brand').toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const path = `brand-logos/${safeBrandId}/${Date.now()}`;
    const fileRef = storageRef(storage, path);
    await uploadString(fileRef, dataUrl, 'data_url');
    return await getDownloadURL(fileRef);
}

async function deleteBrand(brandId) {
    try {
        await deleteDoc(doc(db, "brands", String(brandId).toLowerCase()));
        return true;
    } catch (error) {
        console.error('❌ Error al eliminar marca:', error);
        throw error;
    }
}

async function getDiscountCodes() {
    try {
        const querySnapshot = await getDocs(collection(db, "discountCodes"));
        const discounts = [];

        querySnapshot.forEach((discountDoc) => {
            discounts.push({
                id: discountDoc.id,
                ...discountDoc.data()
            });
        });

        return discounts;
    } catch (error) {
        console.error('❌ Error al obtener descuentos:', error);
        throw error;
    }
}

async function saveDiscountCode(discountData) {
    try {
        const id = String(discountData.id || discountData.code || Date.now()).toLowerCase();
        const payload = sanitizeForFirestore({
            ...discountData,
            id,
            updatedAt: new Date().toISOString()
        });

        await setDoc(doc(db, "discountCodes", id), payload, { merge: true });
        return payload;
    } catch (error) {
        console.error('❌ Error al guardar descuento:', error);
        throw error;
    }
}

async function deleteDiscountCode(discountId) {
    try {
        await deleteDoc(doc(db, "discountCodes", String(discountId).toLowerCase()));
        return true;
    } catch (error) {
        console.error('❌ Error al eliminar descuento:', error);
        throw error;
    }
}

// ========== HELPERS DE MIGRACIÓN (IDs DETERMINÍSTICOS) ==========

async function saveProductById(productData) {
    try {
        const id = String(productData.id || Date.now());
        const payload = sanitizeForFirestore({
            ...productData,
            id,
            updatedAt: new Date().toISOString()
        });

        await setDoc(doc(db, "products", id), payload, { merge: true });
        return payload;
    } catch (error) {
        console.error('❌ Error en saveProductById:', error);
        throw error;
    }
}

async function saveOrderById(orderData) {
    try {
        const id = String(orderData.id || Date.now());
        const payload = sanitizeForFirestore({
            ...orderData,
            id,
            updatedAt: new Date().toISOString()
        });

        await setDoc(doc(db, "orders", id), payload, { merge: true });
        return payload;
    } catch (error) {
        console.error('❌ Error en saveOrderById:', error);
        throw error;
    }
}

// ========== FUNCIONES AUXILIARES ==========

/**
 * Traducir errores de Firebase a mensajes amigables
 */
function getFirebaseErrorMessage(errorCode) {
    const errorMessages = {
        // Errores de registro
        'auth/email-already-in-use': 'Este correo electrónico ya está registrado.',
        'auth/invalid-email': 'El correo electrónico no es válido.',
        'auth/operation-not-allowed': 'El registro con email/contraseña no está habilitado.',
        'auth/weak-password': 'La contraseña es muy débil. Debe tener al menos 12 caracteres, 1 mayúscula, 1 número y 1 carácter especial.',
        'auth/requires-recent-login': 'Por seguridad, vuelve a verificar tu contraseña actual para continuar.',
        
        // Errores de login
        'auth/user-disabled': 'Esta cuenta ha sido deshabilitada.',
        'auth/user-not-found': 'No existe una cuenta con este correo electrónico.',
        'auth/wrong-password': 'La contraseña es incorrecta.',
        'auth/invalid-credential': 'Credenciales inválidas.',
        'auth/operation-not-allowed': 'Este método de inicio de sesión no está habilitado. Revisa Firebase Authentication > Sign-in method.',
        
        // Errores generales
        'auth/too-many-requests': 'Demasiados intentos fallidos. Intenta más tarde.',
        'auth/network-request-failed': 'Error de conexión. Verifica tu internet.',
        'auth/internal-error': 'Error interno del servidor.',
        'auth/popup-closed-by-user': 'Cerraste la ventana de Google antes de completar el inicio de sesión.',
        'auth/cancelled-popup-request': 'Se canceló el intento de inicio de sesión con Google.',
        'auth/popup-blocked': 'El navegador bloqueó la ventana emergente. Permite popups e inténtalo nuevamente.',
        'auth/account-exists-with-different-credential': 'Ya existe una cuenta con este correo usando otro método de acceso.',
        'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase. Agrega localhost/127.0.0.1 en Authentication > Settings > Authorized domains.',
        'auth/invalid-continue-uri': 'La URL de retorno no es válida. Verifica la configuración del dominio autorizado.',
        'auth/invalid-action-code': 'El enlace de restablecimiento no es válido.',
        'auth/expired-action-code': 'El enlace de restablecimiento expiró. Solicita uno nuevo.',
        
        // Errores personalizados
        'unknown': 'Error desconocido. Por favor, intenta nuevamente.'
    };
    
    return errorMessages[errorCode] || 'Ocurrió un error inesperado. Intenta nuevamente.';
}

// ========== FUNCIONES DE CARRITO ==========

/**
 * Obtener carrito del usuario
 */
async function getCart(userId) {
    try {
        const cartRef = doc(db, "userCarts", userId);
        const cartSnap = await getDoc(cartRef);
        
        if (cartSnap.exists()) {
            console.log('✅ Carrito obtenido de Firebase');
            return cartSnap.data().items || [];
        } else {
            console.log('ℹ️ Carrito vacío');
            return [];
        }
    } catch (error) {
        console.error('❌ Error al obtener carrito:', error);
        throw error;
    }
}

/**
 * Guardar carrito del usuario
 */
async function saveCart(userId, cartItems) {
    try {
        const cartRef = doc(db, "userCarts", userId);
        await setDoc(cartRef, {
            items: cartItems,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        
        console.log('✅ Carrito guardado en Firebase');
        return true;
    } catch (error) {
        console.error('❌ Error al guardar carrito:', error);
        throw error;
    }
}

// ========== FUNCIONES DE DATOS DE ENVÍO ==========

/**
 * Obtener datos de envío del usuario
 */
async function getShippingData(userId) {
    try {
        const shippingRef = doc(db, "shippingData", userId);
        const shippingSnap = await getDoc(shippingRef);
        
        if (shippingSnap.exists()) {
            console.log('✅ Datos de envío obtenidos de Firebase');
            return shippingSnap.data();
        } else {
            console.log('ℹ️ Sin datos de envío guardados');
            return null;
        }
    } catch (error) {
        console.error('❌ Error al obtener datos de envío:', error);
        throw error;
    }
}

/**
 * Guardar datos de envío del usuario
 */
async function saveShippingData(userId, shippingData) {
    try {
        const sanitizedData = sanitizeForFirestore(shippingData);
        const shippingRef = doc(db, "shippingData", userId);
        
        await setDoc(shippingRef, {
            ...sanitizedData,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        
        console.log('✅ Datos de envío guardados en Firebase');
        return true;
    } catch (error) {
        console.error('❌ Error al guardar datos de envío:', error);
        throw error;
    }
}

function isStrongPassword(password) {
    const normalized = String(password || '');
    const hasUpper = /[A-ZÁÉÍÓÚÑ]/.test(normalized);
    const hasNumber = /\d/.test(normalized);
    const hasSpecial = /[^A-Za-z0-9]/.test(normalized);
    return normalized.length >= 12 && hasUpper && hasNumber && hasSpecial;
}

/**
 * Obtener configuración del feature de análisis capilar con IA
 */
async function getHairAnalysisConfig() {
    try {
        const configRef = doc(db, "configuracion", "ia_cabello");
        const configSnap = await getDoc(configRef);

        if (configSnap.exists()) {
            return configSnap.data();
        }

        console.log('ℹ️ Sin configuración guardada para ia_cabello, se usan valores por defecto');
        return null;
    } catch (error) {
        console.error('❌ Error al obtener configuración de análisis capilar:', error);
        throw error;
    }
}

/**
 * Guardar configuración del feature de análisis capilar con IA
 */
async function saveHairAnalysisConfig(config) {
    try {
        const sanitizedConfig = sanitizeForFirestore(config);
        const configRef = doc(db, "configuracion", "ia_cabello");

        await setDoc(configRef, {
            ...sanitizedConfig,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        console.log('✅ Configuración de análisis capilar guardada en Firebase');
        return true;
    } catch (error) {
        console.error('❌ Error al guardar configuración de análisis capilar:', error);
        throw error;
    }
}

/**
 * Obtener evidencia de consentimiento del análisis capilar de un usuario
 */
async function getHairAnalysisConsent(userId) {
    try {
        const consentRef = doc(db, "hairAnalysisConsents", userId);
        const consentSnap = await getDoc(consentRef);
        return consentSnap.exists() ? consentSnap.data() : null;
    } catch (error) {
        console.error('❌ Error al obtener consentimiento de análisis capilar:', error);
        throw error;
    }
}

/**
 * Guardar evidencia de consentimiento (análisis obligatorio + entrenamiento opcional)
 * Registra qué versión de los términos aceptó el usuario y cuándo, para poder
 * demostrarlo ante una eventual auditoría o solicitud del titular de los datos.
 */
async function saveHairAnalysisConsent(userId, consent) {
    try {
        const consentRef = doc(db, "hairAnalysisConsents", userId);
        await setDoc(consentRef, {
            ...sanitizeForFirestore(consent),
            updatedAt: new Date().toISOString()
        }, { merge: true });

        console.log('✅ Consentimiento de análisis capilar registrado');
        return true;
    } catch (error) {
        console.error('❌ Error al registrar consentimiento de análisis capilar:', error);
        throw error;
    }
}

/**
 * Subir fotos de cabello para entrenamiento de IA de forma anonimizada.
 * Solo debe llamarse cuando el usuario otorgó explícitamente el consentimiento
 * opcional de entrenamiento. No recibe ni guarda nombre, correo, RUT ni uid:
 * el identificador de la muestra es aleatorio y no se vincula con la identidad
 * del usuario, para evitar asociar innecesariamente el dataset con datos personales.
 */
async function uploadHairAnalysisTrainingSample(photos) {
    const sampleId = generateAnonymousSampleId();
    const storagePaths = [];

    for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        if (!photo?.dataUrl) continue;

        const fileName = `img_${sampleId}_${index}.jpg`;
        const path = `hair-analysis-training/${sampleId}/${fileName}`;
        const fileRef = storageRef(storage, path);
        await uploadString(fileRef, photo.dataUrl, 'data_url');
        storagePaths.push(path);
    }

    const sampleRef = doc(db, "hairAnalysisTrainingSamples", sampleId);
    await setDoc(sampleRef, {
        sampleId,
        photoCount: storagePaths.length,
        storagePaths,
        createdAt: new Date().toISOString()
    });

    console.log('✅ Muestra anonimizada de entrenamiento almacenada:', sampleId);
    return sampleId;
}

function generateAnonymousSampleId() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

// ========== EXPORTAR FUNCIONES ==========
// DEFINIR el objeto window.firebase con TODAS las funciones
window.firebase = {
    // Autenticación
    registerUser,
    loginUser,
    loginWithGoogle,
    getGoogleRedirectUser,
    logoutUser,
    getCurrentUser,
    isUserAdmin,
    isUserBodeguero,
    getUserRole,
    requestPasswordReset,
    confirmPasswordReset: confirmPasswordResetFunction,
    updateCurrentUserName,
    verifyCurrentPassword,
    changeCurrentUserPassword,
    requestAccountDeletion,
    
    // Órdenes
    createOrder,
    getAllOrders,
    getUserOrders,
    trackPageVisit,
    getAnalyticsMetrics,
    updateOrderStatus,
    updateOrderWarehouseData,
    
    // Productos
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    saveProductById,
    getProductsByCategory,
    getFeaturedProducts,

    // Categorías, marcas y descuentos
    getCategories,
    saveCategory,
    deleteCategory,
    getBrands,
    saveBrand,
    uploadBrandLogo,
    deleteBrand,
    getDiscountCodes,
    saveDiscountCode,
    deleteDiscountCode,

    // Carrito
    getCart,
    saveCart,
    
    // Envío
    getShippingData,
    saveShippingData,

    // Configuración de funciones del sitio (feature flags)
    getHairAnalysisConfig,
    saveHairAnalysisConfig,

    // Consentimiento y entrenamiento del análisis capilar con IA
    getHairAnalysisConsent,
    saveHairAnalysisConsent,
    uploadHairAnalysisTrainingSample,
    
    // Instancias
    db,
    auth,
    
    // Funciones de Firestore (para admin-orders.js)
    getDocs,
    collection,
    
    // Utilidades
    getFirebaseErrorMessage,
    sanitizeForFirestore
};

console.log('✅ Firebase Config cargado - window.firebase disponible');
console.log('📋 Funciones disponibles:', Object.keys(window.firebase));
window.dispatchEvent(new CustomEvent('hairia:firebase-ready', {
    detail: {
        hasGetProducts: typeof window.firebase.getProducts === 'function',
        hasGetCategories: typeof window.firebase.getCategories === 'function'
    }
}));