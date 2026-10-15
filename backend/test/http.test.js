const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
Object.assign(process.env, {
    EVALUATION_MODE: 'true', NODE_ENV: 'production',
    FIREBASE_PROJECT_ID: 'demo-monsite-evaluacion', GCLOUD_PROJECT: 'demo-monsite-evaluacion',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    APP_REVISION: 'test-revision', RATE_LIMIT_MAX_REQUESTS: '50'
});
const firebase = require('../lib/firebase-admin');
let emulatorAvailable = true;
mock.method(firebase, 'getFirestoreAdminSafe', () => ({
    projectId: process.env.FIREBASE_PROJECT_ID,
    listCollections: async () => {
        if (!emulatorAvailable) throw new Error('test emulator offline');
        return [];
    },
    collection: () => ({ add: async () => ({ id: 'test-notification' }) })
}));
mock.method(firebase, 'getAuthAdminSafe', () => ({ listUsers: async () => ({ users: [] }) }));
const app = require('../server');
let server;
let baseUrl;
before(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    mock.restoreAll();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('importar app no abre puertos; health identifica la revision y simulacion', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.simulated, true);
    assert.equal(body.revision, 'test-revision');
    assert.equal(response.headers.has('x-powered-by'), false);
    assert.ok(response.headers.get('x-content-type-options'));
});

test('readiness exige Firestore y Auth disponibles', async () => {
    let response = await fetch(`${baseUrl}/ready`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ready, true);
    emulatorAvailable = false;
    try {
        response = await fetch(`${baseUrl}/ready`);
        assert.equal(response.status, 503);
        assert.equal((await response.json()).ready, false);
    } finally {
        emulatorAvailable = true;
    }
});

test('CORS rechaza origen externo y permite frontend local', async () => {
    assert.equal((await fetch(`${baseUrl}/health`, {
        headers: { Origin: 'https://untrusted.example' }
    })).status, 403);
    const response = await fetch(`${baseUrl}/health`, {
        headers: { Origin: 'http://localhost:5500' }
    });
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5500');
});

test('ninguna ruta heredada puede llamar pagos, webhooks ni notificaciones reales', async () => {
    for (const module of ['payment', 'transbank', 'notifications', 'webhook']) {
        assert.equal(fs.existsSync(path.join(__dirname, '..', 'routes', `${module}.js`)), false);
    }
    for (const route of [
        '/api/payment/create-preference', '/api/transbank/create',
        '/api/notifications/send-email', '/webhook'
    ]) {
        const response = await fetch(`${baseUrl}${route}`, { method: 'POST' });
        assert.equal(response.status, 503);
        assert.equal((await response.json()).simulated, true);
    }
});

test('JSON malformado e identificadores invalidos se rechazan', async () => {
    const post = body => fetch(`${baseUrl}/api/evaluation/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    });
    assert.equal((await post('{')).status, 400);
    assert.equal((await post('{}')).status, 400);
    assert.equal((await post('{"orderId":"../../real"}')).status, 400);
});

test('notificaciones se capturan en un outbox ficticio, no se envian', async () => {
    const post = body => fetch(`${baseUrl}/api/evaluation/notifications`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    assert.equal((await post({ channel: 'sms', message: 'test' })).status, 400);
    const response = await post({ channel: 'email', message: 'test' });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
        id: 'test-notification', simulated: true, delivered: false
    });
});

test('limita solicitudes API excesivas', async () => {
    let status;
    for (let index = 0; index < 51; index++) {
        status = (await fetch(`${baseUrl}/api/test-rate-limit`)).status;
    }
    assert.equal(status, 429);
});
