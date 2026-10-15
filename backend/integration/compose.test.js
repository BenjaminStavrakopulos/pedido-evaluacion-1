const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { validateEvaluationEnvironment, projectId } = require('../config/evaluation');
validateEvaluationEnvironment();
const firebaseApp = initializeApp({ projectId });
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const baseUrl = process.env.BACKEND_URL || 'http://127.0.0.1:3000';
const suffix = randomUUID();
const orderId = `test-order-${suffix}`;
const ids = [`test-a-${suffix}`, `test-b-${suffix}`];
const createdNotifications = [];
let userId;
after(async () => {
    await Promise.all([
        db.collection('orders').doc(orderId).delete(),
        ...ids.map(id => db.collection('products').doc(id).delete()),
        ...createdNotifications.map(id => db.collection('evaluation-outbox').doc(id).delete()),
        ...(userId ? [auth.deleteUser(userId)] : [])
    ]);
    await deleteApp(firebaseApp);
});

async function post(route, body) {
    return fetch(`${baseUrl}${route}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
    });
}

test('Compose: health y readiness corresponden al proyecto demo y al commit construido', async () => {
    const health = await fetch(`${baseUrl}/health`).then(response => response.json());
    assert.equal(health.simulated, true);
    assert.equal(health.revision, process.env.APP_REVISION || 'local');
    const response = await fetch(`${baseUrl}/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ready: true, simulated: true, projectId });
});

test('Auth Emulator crea y verifica una identidad ficticia', async () => {
    const response = await fetch(
        `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
        {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: `test-${suffix}@example.test`, password: 'test-password-123', returnSecureToken: true
            })
        }
    );
    assert.equal(response.status, 200);
    const identity = await response.json();
    userId = identity.localId;
    const token = await auth.verifyIdToken(identity.idToken);
    assert.equal(token.uid, userId);
    assert.equal(token.aud, projectId);
});

test('pago simulado con varios productos conserva idempotencia, incluso concurrente', async () => {
    await Promise.all([
        db.collection('products').doc(ids[0]).set({ stock: 10 }),
        db.collection('products').doc(ids[1]).set({ stock: 20 }),
        db.collection('orders').doc(orderId).set({
            items: [{ id: ids[0], quantity: 2 }, { id: ids[1], quantity: 3 }]
        })
    ]);
    const responses = await Promise.all(Array.from({ length: 3 }, () =>
        post('/api/evaluation/payments', { orderId })));
    for (const response of responses) {
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            simulated: true, charged: false, orderId, status: 'approved'
        });
    }
    const stocks = await Promise.all(ids.map(id => db.collection('products').doc(id).get()));
    assert.deepEqual(stocks.map(snapshot => snapshot.data().stock), [8, 17]);
    const order = (await db.collection('orders').doc(orderId).get()).data();
    assert.equal(order.paymentMethod, 'evaluation_mock');
    assert.equal(order.status, 'paid');
    assert.ok(order.inventoryAdjustedAt);
});

test('orden inexistente no produce un pago aprobado', async () => {
    const response = await post('/api/evaluation/payments', { orderId: `missing-${suffix}` });
    assert.equal(response.status, 404);
});

test('email y WhatsApp solo generan registros en el emulador', async () => {
    for (const channel of ['email', 'whatsapp']) {
        const response = await post('/api/evaluation/notifications', { channel, message: 'test only' });
        assert.equal(response.status, 202);
        const result = await response.json();
        createdNotifications.push(result.id);
        assert.equal(result.delivered, false);
        const stored = (await db.collection('evaluation-outbox').doc(result.id).get()).data();
        assert.equal(stored.channel, channel);
        assert.equal(stored.simulated, true);
        assert.equal(stored.delivered, false);
    }
});
