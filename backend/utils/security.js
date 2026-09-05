const crypto = require('crypto');

function safeCompareTokens(providedValue, expectedValue) {
    if (typeof providedValue !== 'string' || typeof expectedValue !== 'string') {
        return false;
    }

    const providedBuffer = Buffer.from(providedValue, 'utf8');
    const expectedBuffer = Buffer.from(expectedValue, 'utf8');

    if (providedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

module.exports = {
    safeCompareTokens
};