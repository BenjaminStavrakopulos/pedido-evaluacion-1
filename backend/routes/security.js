const express = require('express');
const router = express.Router();

function normalizeJsonBody(input) {
    if (!input) {
        return {};
    }

    if (typeof input === 'string') {
        try {
            return JSON.parse(input);
        } catch (_) {
            return { raw: input.slice(0, 4000) };
        }
    }

    if (typeof input === 'object') {
        return input;
    }

    return { value: String(input) };
}

router.post('/csp-report', (req, res) => {
    const body = normalizeJsonBody(req.body);
    const report = body['csp-report'] || body;

    const event = {
        documentUri: report['document-uri'] || report.documentURI || report.documentUri || null,
        blockedUri: report['blocked-uri'] || report.blockedURL || report.blockedUri || null,
        violatedDirective: report['violated-directive'] || report.violatedDirective || report.effectiveDirective || null,
        sourceFile: report['source-file'] || report.sourceFile || null,
        lineNumber: report['line-number'] || report.lineNumber || null,
        userAgent: req.get('user-agent') || null,
        receivedAt: new Date().toISOString()
    };

    console.warn('⚠️ CSP report recibido:', event);
    return res.status(204).end();
});

module.exports = router;
