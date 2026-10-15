const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateEvaluationEnvironment, projectId } = require('../config/evaluation');
const { safeCompareTokens } = require('../utils/security');

function environment() {
    return {
        EVALUATION_MODE: 'true',
        FIREBASE_PROJECT_ID: projectId,
        GCLOUD_PROJECT: projectId,
        FIRESTORE_EMULATOR_HOST: 'firebase:8080',
        FIREBASE_AUTH_EMULATOR_HOST: 'firebase:9099'
    };
}

test('permite solo proyectos ficticios y emuladores locales', () => {
    assert.doesNotThrow(() => validateEvaluationEnvironment(environment()));
    const local = { ...environment(), FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' };
    assert.doesNotThrow(() => validateEvaluationEnvironment(local));
});

for (const [key, value] of [
    ['EVALUATION_MODE', 'false'],
    ['EVALUATION_MODE', undefined],
    ['FIREBASE_PROJECT_ID', 'real-project'],
    ['GCLOUD_PROJECT', 'real-project'],
    ['FIRESTORE_EMULATOR_HOST', 'firestore.googleapis.com:443'],
    ['FIREBASE_AUTH_EMULATOR_HOST', 'public.example.com:9099'],
    ['FIRESTORE_EMULATOR_HOST', 'firebase:65536'],
    ['FIRESTORE_EMULATOR_HOST', 'firebase:0'],
    ['FIREBASE_AUTH_EMULATOR_HOST', undefined]
]) {
    test(`bloquea configuracion insegura: ${key}=${value}`, () => {
        assert.throws(() => validateEvaluationEnvironment({ ...environment(), [key]: value }));
    });
}

for (const key of [
    'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_SERVICE_ACCOUNT_PATH',
    'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CONFIG',
    'MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET',
    'TRANSBANK_COMMERCE_CODE', 'TRANSBANK_API_KEY',
    'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'SMTP_HOST', 'SMTP_PASSWORD'
]) {
    test(`rechaza credenciales externas: ${key}`, () => {
        assert.throws(() => validateEvaluationEnvironment({ ...environment(), [key]: 'test-only' }));
    });
}

test('comparacion de tokens: igualdad, diferencias, longitud y tipos invalidos', () => {
    assert.equal(safeCompareTokens('test-token', 'test-token'), true);
    for (const value of ['different!', 'short', undefined, null, 123, ['test-token']]) {
        assert.equal(safeCompareTokens(value, 'test-token'), false);
    }
    assert.equal(safeCompareTokens('test-token', undefined), false);
});
