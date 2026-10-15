const projectId = 'demo-monsite-evaluacion';

function validateEvaluationEnvironment(env = process.env) {
    if (env.EVALUATION_MODE !== 'true') {
        throw new Error('Este repositorio solo permite EVALUATION_MODE=true. Usa Docker Compose.');
    }
    if (env.FIREBASE_PROJECT_ID !== projectId || env.GCLOUD_PROJECT !== projectId) {
        throw new Error(`La evaluacion requiere el proyecto ficticio ${projectId}.`);
    }
    for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
        if (!/^(firebase|127\.0\.0\.1|localhost):[1-9]\d{0,4}$/.test(env[name] || '')) {
            throw new Error(`${name} debe apuntar al emulador local o al servicio firebase.`);
        }
        if (Number(env[name].split(':')[1]) > 65535) {
            throw new Error(`${name} contiene un puerto invalido.`);
        }
    }
    const forbidden = [
        'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_PATH',
        'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CONFIG',
        'MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET',
        'TRANSBANK_COMMERCE_CODE', 'TRANSBANK_API_KEY',
        'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'SMTP_HOST', 'SMTP_PASSWORD'
    ];
    const present = forbidden.filter(name => env[name]);
    if (present.length) {
        throw new Error(`No se permiten credenciales ni servicios reales: ${present.join(', ')}`);
    }
}

module.exports = { projectId, validateEvaluationEnvironment };
