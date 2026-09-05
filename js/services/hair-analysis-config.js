// hair-analysis-config.js - Config compartida del feature "Análisis de cabello con IA"
(function () {
    const DEFAULT_CONFIG = Object.freeze({
        habilitada: true,
        estado: 'beta',
        visibilidad: 'publico',
        mensaje: 'Prueba nuestro nuevo análisis con IA',
        mostrarEnInicio: true
    });

    let cachedConfig = null;
    let pendingLoad = null;

    async function loadHairAnalysisConfig(forceRefresh = false) {
        if (cachedConfig && !forceRefresh) {
            return cachedConfig;
        }

        if (pendingLoad && !forceRefresh) {
            return pendingLoad;
        }

        pendingLoad = (async () => {
            if (!window.firebaseData?.loadHairAnalysisConfig) {
                cachedConfig = { ...DEFAULT_CONFIG };
                return cachedConfig;
            }

            try {
                const remoteConfig = await window.firebaseData.loadHairAnalysisConfig();
                cachedConfig = { ...DEFAULT_CONFIG, ...(remoteConfig || {}) };
            } catch (error) {
                console.warn('⚠️ No se pudo cargar configuración de análisis capilar, se usan valores por defecto:', error.message);
                cachedConfig = { ...DEFAULT_CONFIG };
            }

            return cachedConfig;
        })();

        const result = await pendingLoad;
        pendingLoad = null;
        return result;
    }

    function getDefaultConfig() {
        return { ...DEFAULT_CONFIG };
    }

    window.hairAnalysisConfig = {
        load: loadHairAnalysisConfig,
        getDefaults: getDefaultConfig
    };
})();
