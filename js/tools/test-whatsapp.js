let consoleLines = [];

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = function(...args) {
    originalLog.apply(console, args);
    addConsoleLog('log', args.join(' '));
};

console.error = function(...args) {
    originalError.apply(console, args);
    addConsoleLog('error', args.join(' '));
};

console.warn = function(...args) {
    originalWarn.apply(console, args);
    addConsoleLog('warn', args.join(' '));
};

function addConsoleLog(type, message) {
    const timestamp = new Date().toLocaleTimeString('es-CL');
    const className = type === 'error'
        ? 'console-error'
        : type === 'warn'
            ? 'console-warn'
            : message.includes('?') ? 'console-success' : '';

    const line = `<div class="console-line ${className}">[${timestamp}] ${message}</div>`;
    consoleLines.push(line);

    if (consoleLines.length > 50) {
        consoleLines.shift();
    }

    const output = document.getElementById('console-output');
    output.innerHTML = consoleLines.join('');
    output.scrollTop = output.scrollHeight;
}

function clearConsole() {
    consoleLines = [];
    document.getElementById('console-output').innerHTML = '<div class="console-line">Consola limpiada...</div>';
}

function checkConfig() {
    const config = window.WHATSAPP_CONFIG;
    let html = '';
    const backendConfigured = typeof config.backendUrl === 'string' && config.backendUrl.length > 0;

    html += `
        <div class="config-item">
            <span class="config-label">Modo de envio:</span>
            <span class="config-value">Backend only (seguro)</span>
            <span class="status-badge status-success">OK</span>
        </div>
    `;

    html += `
        <div class="config-item">
            <span class="config-label">Backend URL:</span>
            <span class="config-value">${backendConfigured ? config.backendUrl : 'No configurado'}</span>
            <span class="status-badge ${backendConfigured ? 'status-success' : 'status-error'}">
                ${backendConfigured ? 'OK' : 'Falta'}
            </span>
        </div>
    `;

    html += `
        <div class="config-item">
            <span class="config-label">Sistema:</span>
            <span class="config-value">${config.enabled ? 'Habilitado' : 'Deshabilitado'}</span>
            <span class="status-badge ${config.enabled ? 'status-success' : 'status-error'}">
                ${config.enabled ? 'Activo' : 'Inactivo'}
            </span>
        </div>
    `;

    document.getElementById('config-status').innerHTML = html;

    if (!backendConfigured) {
        showMessage('warning', 'Falta backendUrl para enviar notificaciones por backend.');
    } else {
        showMessage('success', 'Configuracion segura lista. Twilio queda oculto en backend.');
    }

    return backendConfigured;
}

function createSampleOrder() {
    return {
        id: 'ORD-TEST-' + Date.now(),
        createdAt: new Date().toISOString(),
        userEmail: 'juan.perez@example.com',
        status: 'paid',
        shippingData: {
            firstName: 'Juan',
            lastName: 'Perez',
            rut: '12.345.678-9',
            phone: '+56912345678',
            email: 'juan.perez@example.com',
            street: 'Av. Libertador 1234',
            apartment: 'Depto 501',
            city: 'Santiago',
            region: 'Region Metropolitana',
            zipcode: '8320000',
            notes: 'Por favor, llamar antes de llegar. Horario preferido: 14:00-18:00'
        },
        items: [
            {
                id: 'prod-1',
                name: 'Shampoo Kerastase Resistance',
                price: 29990,
                quantity: 2,
                image: 'https://via.placeholder.com/70x70?text=Shampoo'
            },
            {
                id: 'prod-2',
                name: 'Acondicionador Loreal Elvive',
                price: 24990,
                quantity: 1,
                image: 'https://via.placeholder.com/70x70?text=Acondicionador'
            }
        ],
        totals: {
            subtotal: 84970,
            shipping: 2000,
            discount: 0,
            total: 86970
        }
    };
}

async function testNotification() {
    if (!checkConfig()) {
        showMessage('error', 'No se puede enviar. Completa la configuracion primero.');
        return;
    }

    const button = document.querySelector('.btn');
    const buttonText = document.getElementById('btn-text');
    const originalText = buttonText.textContent;

    button.disabled = true;
    buttonText.innerHTML = '<span class="loading"></span> Enviando...';

    try {
        console.log('Preparando orden de prueba...');
        const order = createSampleOrder();

        console.log('Enviando WhatsApp via Twilio...');
        const result = await window.sendWhatsAppOrderNotification(order);

        if (result) {
            showMessage('success', 'WhatsApp enviado correctamente. Revisa tu telefono en 5-10 segundos.');
            console.log('Notificacion enviada con exito');
        } else {
            showMessage('error', 'Error al enviar WhatsApp. Revisa la consola para mas detalles.');
        }
    } catch (error) {
        console.error('Error:', error);
        showMessage('error', 'Error: ' + error.message);
    } finally {
        button.disabled = false;
        buttonText.textContent = originalText;
    }
}

function viewSampleOrder() {
    const order = createSampleOrder();
    const container = document.getElementById('sample-order-container');
    const sampleDiv = document.getElementById('sample-order');

    let html = `
        <div class="order-section">
            <h4>Informacion de Orden</h4>
            <div class="order-item"><span class="order-label">ID Orden:</span><span class="order-value">${order.id}</span></div>
            <div class="order-item"><span class="order-label">Fecha:</span><span class="order-value">${new Date(order.createdAt).toLocaleString('es-CL')}</span></div>
            <div class="order-item"><span class="order-label">Estado:</span><span class="order-value">Pagada</span></div>
        </div>
        <div class="order-section">
            <h4>Datos del Cliente</h4>
            <div class="order-item"><span class="order-label">Nombre:</span><span class="order-value">${order.shippingData.firstName} ${order.shippingData.lastName}</span></div>
            <div class="order-item"><span class="order-label">RUT:</span><span class="order-value">${order.shippingData.rut}</span></div>
            <div class="order-item"><span class="order-label">Telefono:</span><span class="order-value">${order.shippingData.phone}</span></div>
            <div class="order-item"><span class="order-label">Email:</span><span class="order-value">${order.shippingData.email}</span></div>
        </div>
        <div class="order-section">
            <h4>Direccion de Envio</h4>
            <div class="order-item"><span class="order-label">Calle:</span><span class="order-value">${order.shippingData.street}</span></div>
            <div class="order-item"><span class="order-label">Depto/Casa:</span><span class="order-value">${order.shippingData.apartment}</span></div>
            <div class="order-item"><span class="order-label">Ciudad:</span><span class="order-value">${order.shippingData.city}</span></div>
            <div class="order-item"><span class="order-label">Region:</span><span class="order-value">${order.shippingData.region}</span></div>
            <div class="order-item"><span class="order-label">Codigo Postal:</span><span class="order-value">${order.shippingData.zipcode}</span></div>
        </div>
        <div class="order-section"><h4>Productos (${order.items.length})</h4>`;

    order.items.forEach((item, index) => {
        html += `<div class="order-item"><span class="order-label">${index + 1}. ${item.name}</span><span class="order-value">${item.quantity} x $${item.price.toLocaleString('es-CL')}</span></div>`;
    });

    html += `
        </div>
        <div class="order-section">
            <h4>Totales</h4>
            <div class="order-item"><span class="order-label">Subtotal:</span><span class="order-value">$${order.totals.subtotal.toLocaleString('es-CL')}</span></div>
            <div class="order-item"><span class="order-label">Envio:</span><span class="order-value">$${order.totals.shipping.toLocaleString('es-CL')}</span></div>
            <div class="order-item order-total"><span class="order-label">TOTAL:</span><span class="order-value">$${order.totals.total.toLocaleString('es-CL')}</span></div>
        </div>
    `;

    sampleDiv.innerHTML = html;
    container.style.display = 'block';

    console.log('Orden de ejemplo:', order);
    showMessage('info', 'Orden de ejemplo mostrada abajo. Tambien esta en la consola del navegador.');
}

function showMessage(type, text) {
    const messageDiv = document.getElementById('status-message');
    messageDiv.className = 'message show ' + type;
    messageDiv.textContent = text;

    setTimeout(() => {
        messageDiv.classList.remove('show');
    }, 8000);
}

window.addEventListener('DOMContentLoaded', () => {
    console.log('Pagina de test cargada');
    checkConfig();

    const testBtn = document.getElementById('testWhatsAppBtn');
    const sampleBtn = document.getElementById('viewSampleOrderBtn');
    const clearBtn = document.getElementById('clearConsoleBtn');

    if (testBtn && testBtn.dataset.listener !== 'true') {
        testBtn.addEventListener('click', testNotification);
        testBtn.dataset.listener = 'true';
    }

    if (sampleBtn && sampleBtn.dataset.listener !== 'true') {
        sampleBtn.addEventListener('click', viewSampleOrder);
        sampleBtn.dataset.listener = 'true';
    }

    if (clearBtn && clearBtn.dataset.listener !== 'true') {
        clearBtn.addEventListener('click', clearConsole);
        clearBtn.dataset.listener = 'true';
    }
});
