const { getApps, getApp, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { projectId: evaluationProjectId, validateEvaluationEnvironment } = require('../config/evaluation');

function initializeFirebaseAdmin() {
    validateEvaluationEnvironment();
    if (getApps().length > 0) {
        if (getApp().options.projectId !== evaluationProjectId) {
            throw new Error('Firebase inicializado con un proyecto ajeno a la evaluacion.');
        }
        return getApp();
    }

    return initializeApp({ projectId: evaluationProjectId });
}

function getFirestoreAdminSafe() {
    try {
        return getFirestore(initializeFirebaseAdmin());
    } catch (error) {
        console.warn(`⚠️ Firebase Admin no disponible: ${error.message}`);
        return null;
    }
}

function getAuthAdminSafe() {
    try {
        return getAuth(initializeFirebaseAdmin());
    } catch (error) {
        console.warn(`⚠️ Firebase Admin Auth no disponible: ${error.message}`);
        return null;
    }
}

module.exports = {
    getFirestoreAdminSafe,
    getAuthAdminSafe
};
