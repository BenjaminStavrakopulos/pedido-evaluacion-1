// hair-analysis-promo.js - Muestra/retira la tarjeta de promoción de IA en index.html
document.addEventListener('DOMContentLoaded', async () => {
    const section = document.getElementById('hairAnalysisSection');
    if (!section) return;

    const config = await (window.hairAnalysisConfig?.load() || Promise.resolve(window.hairAnalysisConfig?.getDefaults?.() || { habilitada: true, mostrarEnInicio: true, visibilidad: 'publico' }));

    if (!config.habilitada || !config.mostrarEnInicio) {
        section.remove();
        return;
    }

    // Mientras la funcionalidad está en desarrollo, solo el admin debe verla en el home.
    if (config.visibilidad === 'solo_admin') {
        const currentUser = window.hairiaSession?.getCurrentUser?.();
        if (currentUser?.role !== 'admin') {
            section.remove();
            return;
        }
    }

    section.classList.remove('hair-analysis-pending');
});

