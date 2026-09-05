document.addEventListener('DOMContentLoaded', function() {
    initializeAdmin();
    initThemeToggle();
});

async function initializeAdmin() {
    const hasAccess = await checkAdminAuth();
    if (!hasAccess) {
        return;
    }
    await loadDashboardStats();
    await loadAudienceAnalytics();
    await loadWeeklySales();
    setupDashboard();
    setupAdminActions();
}

const ADMIN_CHILE_TIMEZONE = 'America/Santiago';

function getAdminDateParts(dateInput) {
    const date = dateInput ? new Date(dateInput) : new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: ADMIN_CHILE_TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
    }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: parts.weekday };
}

function getAdminWeekStart(dateInput) {
    const parts = getAdminDateParts(dateInput);
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const day = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
    return date.toISOString().slice(0, 10);
}

function getAdminWeekDays(weekStart) {
    const start = new Date(`${weekStart}T00:00:00Z`);
    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + index);
        return date.toISOString().slice(0, 10);
    });
}

function getAdminOrderDateKey(order) {
    return getAdminDateParts(order?.paidAt || order?.createdAt).year
        ? new Intl.DateTimeFormat('en-CA', { timeZone: ADMIN_CHILE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(order?.paidAt || order?.createdAt))
        : '';
}

function isAdminSale(order) {
    return order?.status !== 'pending' && order?.status !== 'cancelled' && order?.status !== 'refunded';
}

function getAdminOrderTotal(order) {
    return Number(order?.totals?.total ?? order?.total ?? 0) || 0;
}

function formatAdminWeekLabel(weekStart) {
    const days = getAdminWeekDays(weekStart);
    const format = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('es-CL', { timeZone: ADMIN_CHILE_TIMEZONE, day: 'numeric', month: 'short' });
    return `${format(days[0])} - ${format(days[6])}`;
}

async function loadWeeklySales() {
    const select = document.getElementById('weeklySalesWeek');
    if (!select || !window.firebaseData?.loadOrders) return;

    try {
        const orders = await window.firebaseData.loadOrders();
        const weeks = [...new Set(orders.filter(isAdminSale).map(getAdminOrderDateKey).filter(Boolean).map(getAdminWeekStart))];
        const currentWeek = getAdminWeekStart();
        if (!weeks.includes(currentWeek)) weeks.push(currentWeek);
        weeks.sort().reverse();
        select.innerHTML = weeks.map(week => `<option value="${week}">${week === currentWeek ? 'Esta semana' : formatAdminWeekLabel(week)}</option>`).join('');
        const render = () => renderWeeklySales(orders, select.value);
        select.addEventListener('change', render);
        render();
    } catch (error) {
        console.warn('No se pudieron cargar ventas semanales:', error.message);
    }
}

function renderWeeklySales(orders, weekStart) {
    const days = getAdminWeekDays(weekStart);
    const sales = days.map(day => orders.filter(order => isAdminSale(order) && getAdminOrderDateKey(order) === day));
    const totals = sales.map(dayOrders => dayOrders.reduce((sum, order) => sum + getAdminOrderTotal(order), 0));
    document.getElementById('weeklySalesRange').textContent = formatAdminWeekLabel(weekStart);
    document.getElementById('weeklySalesRevenue').textContent = `$${totals.reduce((sum, total) => sum + total, 0).toLocaleString('es-CL')}`;
    document.getElementById('weeklySalesOrders').textContent = sales.reduce((sum, dayOrders) => sum + dayOrders.length, 0);
    document.getElementById('weeklySalesUnits').textContent = sales.flat().reduce((sum, order) => sum + (order.items || []).reduce((itemSum, item) => itemSum + (Number(item.quantity) || 0), 0), 0);
    renderAnalyticsLine('weeklySalesChart', totals, ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], '#f97316', value => `$${value.toLocaleString('es-CL')}`);
}

function setupAdminActions() {
    const viewStoreBtn = document.getElementById('adminDashboardViewStoreBtn');
    if (viewStoreBtn && viewStoreBtn.dataset.listener !== 'true') {
        viewStoreBtn.addEventListener('click', () => {
            window.location.href = '../index.html';
        });
        viewStoreBtn.dataset.listener = 'true';
    }

    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn && logoutBtn.dataset.listener !== 'true') {
        logoutBtn.addEventListener('click', () => {
            if (typeof window.logoutUser === 'function') {
                window.logoutUser();
            }
        });
        logoutBtn.dataset.listener = 'true';
    }
}

async function checkAdminAuth() {
    const userLS = JSON.parse(localStorage.getItem('hairia_current_user') || 'null');
    const userSS = JSON.parse(sessionStorage.getItem('hairia_current_user') || 'null');
    const user = userLS || userSS;
    
    if (!user || !user.uid) {
        console.log('⚠️ No hay usuario, redirigiendo a login...');
        window.location.href = '../login.html';
        return false;
    }

    if (!window.firebase || typeof window.firebase.isUserAdmin !== 'function') {
        console.error('❌ Verificación admin no disponible');
        window.location.href = '../login.html';
        return false;
    }

    try {
        const isAdmin = await window.firebase.isUserAdmin(user.uid);
        if (!isAdmin) {
            console.log('❌ Usuario no es admin, redirigiendo a inicio...');
            window.location.href = '../index.html';
            return false;
        }

        if (user.role !== 'admin') {
            user.role = 'admin';
            if (userLS) {
                sessionStorage.setItem('hairia_current_user', JSON.stringify(user));
                localStorage.removeItem('hairia_current_user');
            } else {
                sessionStorage.setItem('hairia_current_user', JSON.stringify(user));
            }
        }

        const welcomeElement = document.querySelector('.admin-welcome h1');
        if (welcomeElement) {
            welcomeElement.textContent = `Panel de Administración - ${user.name}`;
        }

        console.log('✅ Usuario admin verificado en Firebase');
        return true;
    } catch (error) {
        console.warn('⚠️ No se pudo verificar admin en Firebase:', error);
        window.location.href = '../login.html';
        return false;
    }
}

async function loadDashboardStats() {
    // Esperar a que los elementos existan
    const totalProductsEl = document.getElementById('totalProducts');
    const featuredProductsEl = document.getElementById('featuredProducts');
    const totalCategoriesEl = document.getElementById('totalCategories');
    const lowStockProductsEl = document.getElementById('lowStockProducts');
    
    // Si algún elemento no existe, no continuar
    if (!totalProductsEl || !featuredProductsEl || !totalCategoriesEl || !lowStockProductsEl) {
        console.warn('⚠️ Elementos del dashboard no encontrados');
        return;
    }
    
    let products = [];
    let categories = [];

    try {
        if (window.firebaseData?.loadProducts) {
            products = await window.firebaseData.loadProducts();
        }
        if (window.firebaseData?.loadCategories) {
            categories = await window.firebaseData.loadCategories();
        }
    } catch (error) {
        console.warn('⚠️ Error cargando estadísticas desde Firebase:', error.message);
    }
    
    totalProductsEl.textContent = products.length;
    featuredProductsEl.textContent = products.filter(p => p.featured).length;
    totalCategoriesEl.textContent = categories.length;
    lowStockProductsEl.textContent = products.filter(p => p.stock <= (p.minStock || 5)).length;
    
    console.log('✅ Dashboard stats cargados');
}

function setupDashboard() {
    // Configuraciones adicionales del dashboard
}

const ANALYTICS_TIMEZONE = 'America/Santiago';

function getAnalyticsDateKey(dateInput) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: ANALYTICS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date(dateInput || Date.now()));
}

function getAnalyticsDays(startDate, endDate) {
    const days = [];
    const cursor = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    while (cursor <= end) {
        days.push(getAnalyticsDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}

function renderAnalyticsLine(id, values, labels, color, formatValue = value => String(value)) {
    const chart = document.getElementById(id);
    if (!chart) return;

    const width = 700;
    const height = 220;
    const padding = { top: 18, right: 18, bottom: 34, left: 42 };
    const max = Math.max(...values, 1);
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const points = values.map((value, index) => {
        const x = padding.left + (values.length === 1 ? plotWidth / 2 : index * plotWidth / (values.length - 1));
        const y = padding.top + plotHeight - (value / max * plotHeight);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const step = Math.max(1, Math.ceil(labels.length / 7));
    const labelHtml = labels.map((label, index) => index % step === 0 || index === labels.length - 1
        ? `<text x="${padding.left + (labels.length === 1 ? plotWidth / 2 : index * plotWidth / (labels.length - 1))}" y="${height - 8}" text-anchor="middle">${label}</text>`
        : '').join('');
    const dots = values.map((value, index) => {
        const [x, y] = points[index].split(',');
        return `<circle cx="${x}" cy="${y}" r="4.5" fill="${color}" data-label="${labels[index]}" data-value="${formatValue(value)}"><title>${labels[index]}: ${formatValue(value)}</title></circle>`;
    }).join('');

    chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Tendencia diaria"><line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" class="analytics-axis"></line><polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>${dots}${labelHtml}</svg><div class="analytics-tooltip" role="status"></div>`;
    const tooltip = chart.querySelector('.analytics-tooltip');
    chart.querySelectorAll('circle[data-label]').forEach(point => {
        point.addEventListener('mouseenter', event => {
            tooltip.textContent = `${event.currentTarget.dataset.label}: ${event.currentTarget.dataset.value}`;
            tooltip.classList.add('visible');
        });
        point.addEventListener('mousemove', event => {
            const rect = chart.getBoundingClientRect();
            tooltip.style.left = `${event.clientX - rect.left}px`;
            tooltip.style.top = `${event.clientY - rect.top - 12}px`;
        });
        point.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    });
}

function getDefaultAnalyticsRange() {
    const end = getAnalyticsDateKey();
    const date = new Date(`${end}T12:00:00`);
    date.setDate(date.getDate() - 6);
    return { start: getAnalyticsDateKey(date), end };
}

function setupAnalyticsDateFilters() {
    const defaults = getDefaultAnalyticsRange();
    ['visitsAnalytics', 'usersAnalytics'].forEach(prefix => {
        const start = document.getElementById(`${prefix}Start`);
        const end = document.getElementById(`${prefix}End`);
        if (start && !start.value) start.value = defaults.start;
        if (end && !end.value) end.value = defaults.end;
        [start, end].forEach(input => {
            if (!input || input.dataset.listener === 'true') return;
            input.addEventListener('change', () => loadAudienceAnalytics(prefix));
            input.dataset.listener = 'true';
        });
    });
}

async function loadAudienceAnalytics(onlyPrefix = null) {
    if (!window.firebaseData?.loadAnalyticsMetrics) return;
    setupAnalyticsDateFilters();
    const prefixes = onlyPrefix ? [onlyPrefix] : ['visitsAnalytics', 'usersAnalytics'];
    const ranges = prefixes.map(prefix => ({
        prefix,
        start: document.getElementById(`${prefix}Start`)?.value,
        end: document.getElementById(`${prefix}End`)?.value
    }));
    for (const range of ranges) {
        if (!range.start || !range.end || range.start > range.end) continue;
        try {
            const days = getAnalyticsDays(range.start, range.end);
            const metrics = await window.firebaseData.loadAnalyticsMetrics(days[0], days[days.length - 1]);
            const values = range.prefix === 'visitsAnalytics'
                ? days.map(day => metrics.visits.filter(item => item.date === day).length)
                : days.map(day => metrics.newUsers.filter(item => String(item.createdAt || '').slice(0, 10) === day).length);
            const total = document.getElementById(`${range.prefix}Total`);
            const label = document.getElementById(`${range.prefix}Range`);
            if (total) total.textContent = values.reduce((sum, value) => sum + value, 0);
            if (label) label.textContent = `${range.start} - ${range.end}`;
            renderAnalyticsLine(`${range.prefix}Chart`, values, days.map(day => day.slice(5).replace('-', '/')), range.prefix === 'visitsAnalytics' ? '#f97316' : '#0ea5a4');
        } catch (error) {
            console.warn(`No se pudieron cargar analíticas de ${range.prefix}:`, error.message);
        }
    }
}

// ========== THEME TOGGLE SYSTEM ==========
function initThemeToggle() {
    if (typeof window.initAdminThemeToggle === 'function') {
        window.initAdminThemeToggle();
        return;
    }

    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('admin-theme') || 'light';
    
    // Aplicar tema guardado al cargar
    applyTheme(savedTheme);
    
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            const newTheme = current === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
        });
    }
}

function applyTheme(theme) {
    if (typeof window.applyAdminTheme === 'function') {
        window.applyAdminTheme(theme);
        return;
    }

    // Aplicar atributo data-theme
    document.documentElement.setAttribute('data-theme', theme);
    
    // Guardar preferencia
    localStorage.setItem('admin-theme', theme);
    
    // Actualizar texto del botón
    updateThemeButton(theme);
}

function updateThemeButton(theme) {
    const themeText = document.querySelector('.theme-text');
    if (themeText) {
        themeText.textContent = theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro';
    }
}

// Funciones de exportación/importación (opcionales)
window.exportData = async function() {
    if (!window.firebaseData?.loadProducts || !window.firebaseData?.loadCategories) {
        alert('Firebase no está disponible para exportar datos');
        return;
    }

    const data = {
        products: await window.firebaseData.loadProducts(),
        categories: await window.firebaseData.loadCategories(),
        exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monsite-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

window.importData = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(e) {
        const file = e.target.files[0];
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            try {
                const data = JSON.parse(e.target.result);
                
                if (confirm('¿Estás seguro de que quieres importar estos datos? Esto sobrescribirá los datos actuales.')) {
                    if (!window.firebaseData?.saveProduct || !window.firebaseData?.saveCategory) {
                        alert('Firebase no está disponible para importar datos');
                        return;
                    }

                    if (Array.isArray(data.categories)) {
                        for (const category of data.categories) {
                            await window.firebaseData.saveCategory(category);
                        }
                    }

                    if (Array.isArray(data.products)) {
                        for (const product of data.products) {
                            await window.firebaseData.saveProduct(product);
                        }
                    }
                    
                    setTimeout(() => location.reload(), 1000);
                }
            } catch (error) {
                alert('Error al importar datos: Archivo inválido');
            }
        };
        
        reader.readAsText(file);
    };
    
    input.click();
};