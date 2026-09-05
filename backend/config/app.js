const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const requestedPort = Number(process.env.PORT) || 3000;

const defaultLocalOrigins = [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
];

const envOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const allowedOrigins = envOrigins.length > 0 ? envOrigins : defaultLocalOrigins;
const allowedOriginsSet = new Set(allowedOrigins);

const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const rateLimitMaxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 300;
const paymentRateLimitWindowMs = Number(process.env.PAYMENT_RATE_LIMIT_WINDOW_MS) || 10 * 60 * 1000;
const paymentRateLimitMaxRequests = Number(process.env.PAYMENT_RATE_LIMIT_MAX_REQUESTS) || 60;
const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || '2mb';

const canTryFallbackPort = nodeEnv !== 'production';
const maxFallbackAttempts = 10;

function validateProductionEnvironment() {
    if (!isProduction) {
        return;
    }

    const requiredVariables = [
        'MERCADOPAGO_ACCESS_TOKEN',
        'BACKEND_API_KEY',
        'WEBHOOK_TOKEN',
        'MERCADOPAGO_WEBHOOK_SECRET'
    ];

    const missingVariables = requiredVariables.filter((variableName) => !process.env[variableName]);

    if (missingVariables.length > 0) {
        throw new Error(`Faltan variables críticas en producción: ${missingVariables.join(', ')}`);
    }
}

function getFrontendBaseUrl() {
    if (process.env.FRONTEND_URL) {
        return process.env.FRONTEND_URL;
    }

    return allowedOrigins[0] || 'http://localhost:5500';
}

function getWebhookUrl() {
    const rawWebhookUrl = process.env.WEBHOOK_URL;

    if (!rawWebhookUrl) {
        return undefined;
    }

    try {
        return new URL(rawWebhookUrl).toString();
    } catch (_) {
        return rawWebhookUrl;
    }
}

function getRuntimeReadiness() {
    const checks = {
        mercadopagoAccessToken: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
        // Transbank es opcional: en integración usa credenciales por defecto del SDK
        transbankConfigured: Boolean(
            process.env.TRANSBANK_COMMERCE_CODE && process.env.TRANSBANK_API_KEY
        ) || !isProduction,
        backendApiKeyConfigured: Boolean(process.env.BACKEND_API_KEY),
        webhookTokenConfigured: Boolean(process.env.WEBHOOK_TOKEN),
        firebaseAdminConfigured: Boolean(
            process.env.FIREBASE_SERVICE_ACCOUNT_PATH
            || (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
        )
    };

    return {
        checks,
        ready: checks.mercadopagoAccessToken
    };
}

module.exports = {
    allowedOrigins,
    allowedOriginsSet,
    canTryFallbackPort,
    getFrontendBaseUrl,
    getRuntimeReadiness,
    getWebhookUrl,
    isProduction,
    maxFallbackAttempts,
    nodeEnv,
    paymentRateLimitMaxRequests,
    paymentRateLimitWindowMs,
    rateLimitMaxRequests,
    rateLimitWindowMs,
    requestBodyLimit,
    requestedPort,
    validateProductionEnvironment
};