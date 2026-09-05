// server.js - Backend Monsite
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const {
    allowedOrigins,
    allowedOriginsSet,
    canTryFallbackPort,
    getRuntimeReadiness,
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
} = require('./config/app');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

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
app.use('/api/payment', require('./routes/payment'));
app.use('/api/transbank', require('./routes/transbank'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/security', require('./routes/security'));
app.use('/webhook', require('./routes/webhook'));

// Health check
const { name: serviceName, version: serviceVersion } = require('./package.json');

app.get('/health', (req, res) => {
    res.json({
        status: '✅ Backend funcionando',
        service: serviceName,
        version: serviceVersion,
        env: nodeEnv,
        uptimeSeconds: Math.round(process.uptime())
    });
});

// Readiness check (producción)
app.get('/ready', (req, res) => {
    const readiness = getRuntimeReadiness();
    if (!readiness.ready) {
        return res.status(503).json({
            status: '❌ Backend no listo para pagos',
            ...readiness
        });
    }

    return res.json({
        status: '✅ Backend listo',
        ...readiness
    });
});

// Error handling
app.use((err, req, res, next) => {
    if (err && err.message === 'Origen no permitido por CORS') {
        return res.status(403).json({
            error: 'Origen no autorizado',
            message: 'El origen de la solicitud no está permitido'
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

validateProductionEnvironment();

function startServer(port, attempt = 0) {
    server = app.listen(port, () => {
        const readiness = getRuntimeReadiness();

        console.log(`🚀 Backend corriendo en http://localhost:${port}`);
        console.log(`🌍 Entorno: ${nodeEnv}`);
        console.log(`📱 Frontend(s) permitidos: ${allowedOrigins.join(', ')}`);

        if (!readiness.checks.mercadopagoAccessToken) {
            console.warn('⚠️ MERCADOPAGO_ACCESS_TOKEN no configurado: los endpoints de pago fallarán.');
        }
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

startServer(requestedPort);

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

module.exports = app;
