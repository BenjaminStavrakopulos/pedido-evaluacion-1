// server.js - Backend Monsite
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { validateEvaluationEnvironment } = require('./config/evaluation');
validateEvaluationEnvironment();
const {
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
} = require('./config/app');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);

const apiLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Demasiadas solicitudes, intenta nuevamente en unos minutos'
    }
});

const paymentLimiter = rateLimit({
    windowMs: paymentRateLimitWindowMs,
    max: paymentRateLimitMaxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Demasiadas solicitudes de pago, intenta nuevamente en unos minutos'
    }
});

// Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
        : false
}));
app.use(compression());
app.use((req, res, next) => {
    const origin = req.get('origin');

    if (!origin) {
        return next();
    }

    if (!allowedOriginsSet.has(origin)) {
        return res.status(403).json({
            error: 'Origen no autorizado',
            message: 'El origen de la solicitud no está permitido'
        });
    }

    return next();
});
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOriginsSet.has(origin)) {
            return callback(null, true);
        }

        return callback(null, false);
    },
    credentials: true,
    // Permitir el header que salta la advertencia de ngrok (desarrollo)
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'x-webhook-token'],
    optionsSuccessStatus: 204
}));
app.use('/api', apiLimiter);
app.use('/api/payment', paymentLimiter);
app.use('/api/transbank', paymentLimiter);
app.use(express.json({ limit: requestBodyLimit }));
app.use(express.urlencoded({ limit: requestBodyLimit, extended: true }));

// Rutas
app.use('/api/evaluation', require('./routes/evaluation'));
for (const route of ['/api/payment', '/api/transbank', '/api/notifications', '/webhook']) {
    app.use(route, (req, res) => res.status(503).json({
        error: 'Integracion real deshabilitada en la evaluacion',
        simulated: true,
        evaluationApi: '/api/evaluation'
    }));
}
app.use('/api/security', require('./routes/security'));

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: '✅ Backend funcionando',
        env: nodeEnv,
        simulated: true,
        revision: process.env.APP_REVISION || 'local',
        uptimeSeconds: Math.round(process.uptime())
    });
});

// Readiness check (producción)
app.get('/ready', async (req, res) => {
    try {
        const { getFirestoreAdminSafe, getAuthAdminSafe } = require('./lib/firebase-admin');
        const db = getFirestoreAdminSafe();
        const auth = getAuthAdminSafe();
        if (!db || !auth) {
            throw new Error('Firebase Emulator no inicializado');
        }
        await Promise.all([db.listCollections(), auth.listUsers(1)]);
        return res.json({ ready: true, simulated: true, projectId: db.projectId });
    } catch (error) {
        console.error('Readiness del emulador fallo:', error.message);
        return res.status(503).json({ ready: false, simulated: true });
    }
});

// Error handling
app.use((err, req, res, next) => {
    if (err && err.message === 'Origen no permitido por CORS') {
        return res.status(403).json({
            error: 'Origen no autorizado',
            message: 'El origen de la solicitud no está permitido'
        });
    }

    if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
        return res.status(err.type === 'entity.too.large' ? 413 : 400).json({
            error: 'Cuerpo de solicitud invalido'
        });
    }
    console.error('❌ Error:', err);
    const safeMessage = isProduction ? 'Error interno del servidor' : err.message;
    res.status(500).json({ 
        error: 'Error en el servidor',
        message: safeMessage
    });
});

// Iniciar servidor
let server;

function startServer(port, attempt = 0) {
    server = app.listen(port, () => {
        console.log(`🚀 Backend corriendo en http://localhost:${port}`);
        console.log(`🌍 Entorno: ${nodeEnv}`);
        console.log(`📱 Frontend(s) permitidos: ${allowedOrigins.join(', ')}`);

        console.log('Evaluacion aislada: pagos y notificaciones reales deshabilitados.');
    });

    server.on('error', (error) => {
        if (error && error.code === 'EADDRINUSE') {
            if (canTryFallbackPort && attempt < maxFallbackAttempts) {
                const nextPort = port + 1;
                console.warn(`⚠️ Puerto ${port} en uso. Reintentando en ${nextPort}...`);
                startServer(nextPort, attempt + 1);
                return;
            }

            console.error(`❌ Puerto ${port} ya está en uso. Usa otro PORT o detén la instancia existente.`);
            process.exit(1);
            return;
        }

        console.error('❌ Error iniciando servidor:', error);
        process.exit(1);
    });
}

if (require.main === module) {
    startServer(requestedPort);
    for (const signal of ['SIGTERM', 'SIGINT']) {
        process.on(signal, () => {
            const deadline = setTimeout(() => process.exit(1), 10000);
            deadline.unref();
            server.close(() => {
                clearTimeout(deadline);
                process.exit(0);
            });
        });
    }
    process.on('unhandledRejection', (reason) => {
        console.error('Unhandled Rejection:', reason);
        process.exit(1);
    });
    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
        process.exit(1);
    });
}

module.exports = app;
