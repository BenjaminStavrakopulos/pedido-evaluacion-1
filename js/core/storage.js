(function () {
    function readJSON(key, fallback = null, storage = window.localStorage) {
        try {
            const raw = storage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (error) {
            console.warn(`⚠️ Error leyendo storage key ${key}:`, error);
            return fallback;
        }
    }

    function writeJSON(key, value, storage = window.localStorage) {
        storage.setItem(key, JSON.stringify(value));
        return value;
    }

    function remove(key, storage = window.localStorage) {
        storage.removeItem(key);
    }

    window.hairiaStorage = {
        readJSON,
        writeJSON,
        remove
    };
})();