const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const root = path.join(__dirname, '..');
const read = name => YAML.parse(fs.readFileSync(path.join(root, name), 'utf8'));

test('Compose no publica emuladores, usa red interna y restringe backend a loopback', () => {
    const compose = read('compose.yaml');
    assert.equal(compose.networks.evaluation.internal, true);
    assert.equal(compose.services.firebase.ports, undefined);
    assert.deepEqual(compose.services.backend.ports, ['127.0.0.1::3000']);
    assert.equal(compose.services.backend.environment.EVALUATION_MODE, 'true');
    assert.equal(compose.services.backend.environment.FIREBASE_PROJECT_ID, 'demo-monsite-evaluacion');
    assert.equal(compose.services.backend.read_only, true);
    assert.equal(compose.services.backend.depends_on.firebase.condition, 'service_healthy');
    for (const service of Object.values(compose.services)) {
        assert.deepEqual(service.networks, ['evaluation']);
        assert.deepEqual(service.cap_drop, ['ALL']);
        assert.ok(service.mem_limit);
        assert.ok(service.cpus);
        assert.equal(service.env_file, undefined);
        assert.equal(service.volumes, undefined);
        assert.equal(service.container_name, undefined);
    }
});

test('CI bloquea construccion y despliegue tras fallos de pruebas o seguridad', () => {
    const workflow = read('.github/workflows/ci.yml');
    assert.equal(workflow.jobs.build.needs, 'quality');
    assert.deepEqual(workflow.jobs.deploy.needs, ['build', 'security']);
    assert.equal(workflow.permissions.contents, 'read');
    assert.equal(workflow.jobs.security.env.SNYK_TOKEN, '${{ secrets.SNYK_TOKEN }}');
    const serialized = JSON.stringify(workflow);
    assert.equal(serialized.includes('FIREBASE_SERVICE_ACCOUNT'), false);
    assert.equal(serialized.includes('action-hosting-deploy'), false);
    assert.equal(serialized.includes('continue-on-error'), false);
    assert.ok(serialized.includes('docker compose up'));
    assert.ok(serialized.includes('--no-build'));
    assert.ok(serialized.includes('--scale backend=2'));
    assert.ok(serialized.includes('snyk code test'));
    assert.ok(serialized.includes('snyk test'));
});

test('laboratorio no conserva SDKs ni configuracion de despliegue real', () => {
    const backend = JSON.parse(fs.readFileSync(path.join(root, 'backend/package.json'), 'utf8'));
    for (const dependency of ['mercadopago', 'transbank-sdk', 'twilio', 'nodemailer', 'dotenv']) {
        assert.equal(backend.dependencies[dependency], undefined);
    }
    for (const name of ['.firebaserc', 'firebase.json', 'js', 'backend/services']) {
        assert.equal(fs.existsSync(path.join(root, name)), false, `${name} no debe existir`);
    }
    const dockerfile = fs.readFileSync(path.join(root, 'backend/Dockerfile'), 'utf8');
    assert.equal(dockerfile.includes('COPY . .'), false);
    assert.ok(dockerfile.includes('USER node'));
});

test('Dependabot cubre manifiestos npm, Actions e imagenes Docker', () => {
    const config = read('.github/dependabot.yml');
    for (const [ecosystem, directory] of [
        ['npm', '/'], ['npm', '/backend'], ['npm', '/emulator'],
        ['github-actions', '/'], ['docker', '/backend'], ['docker', '/emulator']
    ]) {
        assert.ok(config.updates.some(update =>
            update['package-ecosystem'] === ecosystem && update.directory === directory));
    }
});
