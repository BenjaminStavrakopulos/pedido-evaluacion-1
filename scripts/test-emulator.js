const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));

async function main() {
    // Firebase CLI inyecta esta configuracion demo; no se transmite al backend.
    if (process.env.FIREBASE_CONFIG) {
        assert.deepEqual(JSON.parse(process.env.FIREBASE_CONFIG), {
            projectId: 'demo-monsite-evaluacion',
            storageBucket: 'demo-monsite-evaluacion.appspot.com',
            databaseURL: 'https://demo-monsite-evaluacion.firebaseio.com'
        });
        delete process.env.FIREBASE_CONFIG;
    }
    Object.assign(process.env, {
        EVALUATION_MODE: 'true',
        NODE_ENV: 'production',
        METADATA_SERVER_DETECTION: 'none',
        FIREBASE_PROJECT_ID: 'demo-monsite-evaluacion',
        GCLOUD_PROJECT: 'demo-monsite-evaluacion'
    });
    const app = require('../backend/server');
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
        const child = spawn(process.execPath, [
            '--test', path.join(__dirname, '..', 'backend', 'integration', 'compose.test.js')
        ], {
            stdio: 'inherit',
            signal: controller.signal,
            env: {
                ...process.env,
                BACKEND_URL: `http://127.0.0.1:${server.address().port}`
            }
        });
        const [code] = await once(child, 'exit');
        process.exitCode = code === 0 ? 0 : 1;
    } finally {
        clearTimeout(timeout);
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        const { getApps, deleteApp } = backendRequire('firebase-admin/app');
        await Promise.all(getApps().map(deleteApp));
    }
}

main().catch(error => {
    console.error('Pruebas con emulador fallaron:', error);
    process.exitCode = 1;
});
