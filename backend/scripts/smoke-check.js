/* smoke-check.js - Verificación técnica rápida para producción */
require('dotenv').config();

const port = Number(process.env.PORT) || 3000;
const baseUrl = `http://localhost:${port}`;

async function checkEndpoint(path, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`);
  const body = await response.text();

  return {
    path,
    ok: response.status === expectedStatus,
    status: response.status,
    body
  };
}

async function run() {
  const checks = [];

  try {
    checks.push(await checkEndpoint('/health', 200));
    checks.push(await checkEndpoint('/ready', process.env.MERCADOPAGO_ACCESS_TOKEN ? 200 : 503));
    checks.push(await checkEndpoint('/webhook/test', 200));
  } catch (error) {
    console.error('❌ No se pudo conectar al backend. ¿Está corriendo?');
    console.error(error.message);
    process.exit(1);
  }

  let hasFailures = false;
  for (const result of checks) {
    const icon = result.ok ? '✅' : '❌';
    console.log(`${icon} ${result.path} -> ${result.status}`);

    if (!result.ok) {
      hasFailures = true;
      console.log(`   Respuesta: ${result.body}`);
    }
  }

  if (hasFailures) {
    console.error('❌ Smoke check con fallas');
    process.exit(1);
  }

  console.log('✅ Smoke check completado');
}

run();
