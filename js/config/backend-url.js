// Configura el backend segun el entorno actual.
// TEMPORAL (prueba con ngrok): en produccion apunta a la URL publica de ngrok.
// Cuando despliegues el backend real en api.monsite.cl, vuelve a poner esa URL.
window.BACKEND_URL = window.BACKEND_URL || (
    ['localhost', '127.0.0.1'].includes(window.location.hostname)
        ? 'http://localhost:3000'
        : 'https://skating-dimmed-splice.ngrok-free.dev'
);
