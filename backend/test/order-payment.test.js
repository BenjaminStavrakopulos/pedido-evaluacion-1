const { test, mock, after } = require('node:test');
const assert = require('node:assert/strict');
const firebase = require('../lib/firebase-admin');
let database;
mock.method(firebase, 'getFirestoreAdminSafe', () => database);
const {
    normalizeEntityId, buildOrderItemsSignature, markOrderAsPaid, loadProductsByIds
} = require('../lib/order-payment');
after(() => mock.restoreAll());

test('normaliza identificadores y firmas de carrito independientemente del orden', () => {
    assert.equal(normalizeEntityId(null), '');
    assert.equal(normalizeEntityId(' item '), 'item');
    assert.equal(normalizeEntityId(12), '12');
    assert.equal(buildOrderItemsSignature(null), '');
    assert.equal(buildOrderItemsSignature([]), '');
    assert.equal(buildOrderItemsSignature([
        { productId: 'b', quantity: 2 },
        { product: { id: 'a' }, quantity: 1 },
        { id: 'invalid', quantity: -1 }
    ]), 'a:1|b:2');
});

function transactionDatabase(order, stocks) {
    const writes = [];
    let wrote = false;
    database = {
        collection: name => ({ doc: id => ({ name, id }) }),
        runTransaction: async callback => callback({
            get: async ref => {
                assert.equal(wrote, false, 'Firestore no permite leer despues de escribir');
                return ref.name === 'orders'
                    ? { exists: Boolean(order), data: () => order }
                    : { exists: ref.id in stocks, data: () => ({ stock: stocks[ref.id] }) };
            },
            set: (ref, data, options) => {
                wrote = true;
                writes.push({ ref, data, options });
            }
        })
    };
    return writes;
}

test('pago con varios productos agrega cantidades, descuenta stock y confirma atomicamente', async () => {
    const writes = transactionDatabase({
        items: [{ id: 'a', quantity: 2 }, { id: 'a', quantity: 1 }, { id: 'b', quantity: 4 }]
    }, { a: 8, b: 3 });
    await markOrderAsPaid({ firestoreDocId: 'order' }, {
        paymentMethod: 'evaluation_mock', gatewayPaymentId: 'mock-order'
    });
    assert.equal(writes.length, 3);
    assert.equal(writes[0].data.stock, 5);
    assert.equal(writes[1].data.stock, 0);
    assert.equal(writes[2].data.status, 'paid');
    assert.equal(writes[2].data.paymentGatewayPaymentId, 'mock-order');
    assert.ok(writes[2].data.inventoryAdjustedAt);
    assert.ok(writes.every(write => write.options.merge === true));
});

test('pago repetido no vuelve a descontar inventario', async () => {
    const writes = transactionDatabase({
        inventoryAdjustedAt: '2026-01-01T00:00:00Z', items: [{ id: 'a', quantity: 2 }]
    }, { a: 8 });
    await markOrderAsPaid({ firestoreDocId: 'order' });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].ref.name, 'orders');
});

test('no inventa una confirmacion si la orden no existe', async () => {
    const writes = transactionDatabase(null, {});
    await assert.rejects(markOrderAsPaid({ firestoreDocId: 'missing' }), /orden ya no existe/);
    assert.equal(writes.length, 0);
});

test('propaga fallos de transaccion y de acceso a productos', async () => {
    database = { collection: () => ({ doc: () => ({}) }), runTransaction: async () => {
        throw new Error('test transaction unavailable');
    } };
    await assert.rejects(markOrderAsPaid({ firestoreDocId: 'order' }), /transaction unavailable/);
    database = null;
    await assert.rejects(loadProductsByIds(['a']), /Firestore Admin no disponible/);
});
