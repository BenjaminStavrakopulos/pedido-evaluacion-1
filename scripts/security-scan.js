const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getTrackedFiles() {
    const raw = execSync('git ls-files', { encoding: 'utf8' });
    return raw
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean);
}

function isLikelyBinary(filePath) {
    const binaryExtensions = new Set([
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.woff', '.woff2', '.ttf'
    ]);

    return binaryExtensions.has(path.extname(filePath).toLowerCase());
}

function looksLikePlaceholder(value) {
    if (!value) return false;
    return /tu_|example|placeholder|define_|xxxx|sample|test/i.test(value);
}

function run() {
    let trackedFiles;
    try {
        trackedFiles = getTrackedFiles();
    } catch (error) {
        console.error('❌ No se pudo leer archivos trackeados de Git.');
        console.error(error.message);
        process.exit(1);
    }

    const blockedTrackedFiles = new Set([
        '.env',
        'backend/.env',
        'service-account.json',
        'backend/service-account.json'
    ]);

    const exactViolations = trackedFiles.filter((file) => blockedTrackedFiles.has(file));

    const wildcardViolations = trackedFiles.filter((file) => {
        const normalized = file.replace(/\\/g, '/').toLowerCase();
        if (normalized.endsWith('service-account.example.json')) return false;
        return /(^|\/)service-account[^/]*\.json$/.test(normalized);
    });

    const contentViolations = [];

    const contentPatterns = [
        {
            id: 'private-key-material',
            regex: /-----BEGIN PRIVATE KEY-----/,
            message: 'Material de clave privada detectado'
        },
        {
            id: 'mercadopago-access-token',
            regex: /MERCADOPAGO_ACCESS_TOKEN\s*=\s*([^\r\n]+)/,
            message: 'Posible access token de Mercado Pago en archivo trackeado'
        },
        {
            id: 'twilio-auth-token',
            regex: /TWILIO_AUTH_TOKEN\s*=\s*([^\r\n]+)/,
            message: 'Posible auth token de Twilio en archivo trackeado'
        },
        {
            id: 'backend-api-key',
            regex: /BACKEND_API_KEY\s*=\s*([^\r\n]+)/,
            message: 'Posible API key interna en archivo trackeado'
        }
    ];

    for (const relativePath of trackedFiles) {
        if (isLikelyBinary(relativePath)) continue;

        const fullPath = path.resolve(process.cwd(), relativePath);
        if (!fs.existsSync(fullPath)) continue;

        let content;
        try {
            content = fs.readFileSync(fullPath, 'utf8');
        } catch (_) {
            continue;
        }

        const normalizedPath = relativePath.replace(/\\/g, '/');

        for (const pattern of contentPatterns) {
            if (pattern.id === 'private-key-material' && normalizedPath === 'scripts/security-scan.js') {
                continue;
            }

            const match = content.match(pattern.regex);
            if (!match) continue;

            const matchedValue = match[1] ? String(match[1]).trim() : '';
            if (pattern.id !== 'private-key-material' && looksLikePlaceholder(matchedValue)) {
                continue;
            }

            if (normalizedPath.endsWith('.md') || normalizedPath.endsWith('.example.json') || normalizedPath.endsWith('.env.example')) {
                continue;
            }

            contentViolations.push({ file: normalizedPath, message: pattern.message });
        }
    }

    const hasErrors = exactViolations.length > 0 || wildcardViolations.length > 0 || contentViolations.length > 0;

    if (!hasErrors) {
        console.log('✅ Security scan OK: no se detectaron secretos críticos trackeados.');
        return;
    }

    console.error('❌ Security scan detectó riesgos de exposición:');

    for (const file of exactViolations) {
        console.error(` - Archivo sensible trackeado: ${file}`);
    }

    for (const file of wildcardViolations) {
        console.error(` - Posible service-account trackeado: ${file}`);
    }

    for (const violation of contentViolations) {
        console.error(` - ${violation.message}: ${violation.file}`);
    }

    process.exit(1);
}

run();
