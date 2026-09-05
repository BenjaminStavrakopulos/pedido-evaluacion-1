const { isProduction } = require('../config/app');
const { safeCompareTokens } = require('../utils/security');

function requireApiKey(req, res, next) {
    const configuredApiKey = process.env.BACKEND_API_KEY;
    const providedApiKey = req.headers['x-api-key'];

    if (!configuredApiKey) {
        if (isProduction) {
            return res.status(500).json({ error: 'BACKEND_API_KEY no configurada en producción' });
        }

        return next();
    }

    if (!safeCompareTokens(providedApiKey, configuredApiKey)) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    return next();
}

module.exports = requireApiKey;