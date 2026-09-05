// Redirige las acciones de autenticacion de Firebase a las paginas de Monsite.
const params = new URLSearchParams(window.location.search);
const mode = params.get('mode');
const oobCode = params.get('oobCode');

console.log('auth-action.html cargado');
console.log('Mode:', mode);
console.log('oobCode:', oobCode ? 'Presente' : 'No encontrado');

if (mode === 'resetPassword' && oobCode) {
    console.log('Redirigiendo a reset-password.html con oobCode');
    window.location.href = `/reset-password.html?oobCode=${encodeURIComponent(oobCode)}`;
} else {
    console.error('Error: mode o oobCode no encontrados');
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 3000);
}
