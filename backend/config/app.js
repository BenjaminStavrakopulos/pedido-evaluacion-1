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

module.exports = {
    allowedOrigins,
    allowedOriginsSet,
    canTryFallbackPort,
    isProduction,
    maxFallbackAttempts,
    nodeEnv,
    paymentRateLimitMaxRequests,
    paymentRateLimitWindowMs,
    rateLimitMaxRequests,
    rateLimitWindowMs,
    requestBodyLimit,
    requestedPort
};