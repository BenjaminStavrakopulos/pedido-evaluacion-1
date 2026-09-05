(function () {
    const STORAGE_KEY = 'admin-theme';

    function getStoredTheme() {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw === 'dark' ? 'dark' : 'light';
    }

    function updateRootBackground(theme) {
        // El fondo lo controla admin.css con var(--admin-bg) según data-theme.
        // Aquí solo limpiamos cualquier inline previo para que la variable mande.
        document.documentElement.style.backgroundColor = '';
        if (document.body) {
            document.body.style.backgroundColor = '';
        }
    }

    function updateThemeButton(theme) {
        const themeText = document.querySelector('.theme-text');
        if (themeText) {
            themeText.textContent = theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro';
        }
    }

    function applyAdminTheme(theme, persist) {
        const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', normalizedTheme);
        updateRootBackground(normalizedTheme);

        if (persist) {
            localStorage.setItem(STORAGE_KEY, normalizedTheme);
        }

        updateThemeButton(normalizedTheme);
        return normalizedTheme;
    }

    function initAdminThemeToggle() {
        const button = document.getElementById('themeToggle');
        if (!button || button.dataset.themeListener === 'true') {
            updateThemeButton(getStoredTheme());
            return;
        }

        button.addEventListener('click', function () {
            const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyAdminTheme(nextTheme, true);
        });

        button.dataset.themeListener = 'true';
        updateThemeButton(getStoredTheme());
    }

    const initialTheme = getStoredTheme();
    applyAdminTheme(initialTheme, false);

    document.addEventListener('DOMContentLoaded', function () {
        initAdminThemeToggle();
    });

    window.applyAdminTheme = function (theme) {
        return applyAdminTheme(theme, true);
    };

    window.initAdminThemeToggle = initAdminThemeToggle;
    window.toggleTheme = function () {
        const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyAdminTheme(nextTheme, true);
    };
})();
