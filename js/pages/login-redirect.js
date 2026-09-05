document.addEventListener('DOMContentLoaded', function() {
    console.log('login.html cargado correctamente');

    const currentUser = JSON.parse(localStorage.getItem('hairia_current_user') || sessionStorage.getItem('hairia_current_user') || 'null');
    if (!currentUser || (!currentUser.id && !currentUser.uid)) {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    if (redirect === 'checkout') {
        window.location.href = 'checkout.html';
        return;
    }

    if (currentUser.role === 'admin') {
        window.location.href = 'admin/admin.html';
        return;
    }

    if (currentUser.role === 'bodeguero') {
        window.location.href = 'admin/bodeguero.html';
        return;
    }

    window.location.href = 'index.html';
});
