const path = require('path');
const admin = require('firebase-admin');

function resolveCredential() {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (serviceAccountPath) {
        const absolutePath = path.isAbsolute(serviceAccountPath)
            ? serviceAccountPath
            : path.join(process.cwd(), serviceAccountPath);
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const serviceAccount = require(absolutePath);
        return {
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID
        };
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKeyRaw) {
        throw new Error(
            'Falta configuración Firebase Admin. Define FIREBASE_SERVICE_ACCOUNT_PATH o FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.'
        );
    }

    return {
        credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKeyRaw.replace(/\\n/g, '\n')
        }),
        projectId
    };
}

function initializeFirebaseAdmin() {
    if (admin.apps.length > 0) {
        return admin.app();
    }

    const { credential, projectId } = resolveCredential();
    return admin.initializeApp({ credential, projectId });
}

function getFirestoreAdminSafe() {
    try {
        initializeFirebaseAdmin();
        return admin.firestore();
    } catch (error) {
        console.warn(`⚠️ Firebase Admin no disponible: ${error.message}`);
        return null;
    }
}

function getAuthAdminSafe() {
    try {
        initializeFirebaseAdmin();
        return admin.auth();
    } catch (error) {
        console.warn(`⚠️ Firebase Admin Auth no disponible: ${error.message}`);
        return null;
    }
}

async function verifyIdTokenSafe(idToken) {
    const auth = getAuthAdminSafe();
    if (!auth) {
        return null;
    }

    const token = typeof idToken === 'string' ? idToken.trim() : '';
    if (!token) {
        return null;
    }

    try {
        return await auth.verifyIdToken(token, true);
    } catch (_) {
        return null;
    }
}

module.exports = {
    getFirestoreAdminSafe,
    getAuthAdminSafe,
    verifyIdTokenSafe
};
