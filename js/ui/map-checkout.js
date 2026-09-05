// map-checkout.js - Mapa interactivo para verificar dirección

let map;
let marker;
let selectedCoordinates = null;

// Centros de regiones de Chile (lat, lng)
const regionCenters = {
    "Region de Arica y Parinacota": [-18.4861, -70.2976],
    "Region de Tarapaca": [-21.2282, -69.2181],
    "Region de Antofagasta": [-23.6629, -70.4030],
    "Region de Atacama": [-27.3692, -70.3522],
    "Region de Coquimbo": [-29.9533, -71.3395],
    "Region de Valparaiso": [-33.0472, -71.6127],
    "Region Metropolitana": [-33.4489, -70.6693],
    "Region del Libertador General Bernardo O'Higgins": [-34.1708, -70.7406],
    "Region del Maule": [-35.4264, -71.5236],
    "Region de Nuble": [-36.7304, -72.1120],
    "Region del Biobio": [-37.2722, -73.2381],
    "Region de La Araucania": [-38.7381, -72.5898],
    "Region de Los Rios": [-39.8142, -73.2354],
    "Region de Los Lagos": [-41.4735, -72.2635],
    "Region de Aysen": [-45.5752, -72.0662],
    "Region de Magallanes": [-53.1638, -70.9171]
};

// Inicializar mapa cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    setupMapListeners();
});

function initializeMap() {
    const mapElement = document.getElementById('addressMap');
    if (!mapElement) return;

    // Crear mapa centrado en Chile
    map = L.map('addressMap').setView([-35.6751, -71.5430], 4);

    // Agregar capa de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    // Agregar evento de click en el mapa
    map.on('click', onMapClick);
}

function setupMapListeners() {
    // Actualizar mapa cuando cambia la región
    const regionSelect = document.getElementById('region');
    if (regionSelect) {
        regionSelect.addEventListener('change', onRegionChange);
    }

    // Buscar dirección cuando se completan los campos
    const streetInput = document.getElementById('street');
    const cityInput = document.getElementById('city');
    
    if (streetInput) {
        streetInput.addEventListener('blur', searchAddress);
    }
    if (cityInput) {
        cityInput.addEventListener('change', searchAddress);
    }
}

function onRegionChange(event) {
    const region = event.target.value;
    if (region && regionCenters[region]) {
        const [lat, lng] = regionCenters[region];
        map.setView([lat, lng], 8);
    }
}

function onMapClick(event) {
    const { lat, lng } = event.latlng;
    selectedCoordinates = { lat, lng };

    // Remover marcador anterior
    if (marker) {
        map.removeLayer(marker);
    }

    // Crear nuevo marcador
    marker = L.marker([lat, lng], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(map);

    // Mostrar popup con coordenadas
    marker.bindPopup(`
        <strong>📍 Ubicación Confirmada</strong><br>
        Lat: ${lat.toFixed(4)}<br>
        Lng: ${lng.toFixed(4)}<br>
        <small>Haz clic aquí para copiar</small>
    `).openPopup();

    // Actualizar texto de coordenadas
    updateCoordinatesDisplay(lat, lng);

    // Intentar obtener dirección desde las coordenadas (geocodificación inversa)
    reverseGeocode(lat, lng);
}

function searchAddress() {
    const street = document.getElementById('street')?.value || '';
    const city = document.getElementById('city')?.value || '';
    const region = document.getElementById('region')?.value || '';

    if (!street || !city) return;

    // Construir dirección de búsqueda
    const address = `${street}, ${city}, ${region}, Chile`;

    // Usar Nominatim (OpenStreetMap) para geocodificar
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lng = parseFloat(result.lon);

                // Centrar mapa en la dirección encontrada
                map.setView([lat, lng], 15);

                // Colocar marcador
                if (marker) {
                    map.removeLayer(marker);
                }

                marker = L.marker([lat, lng], {
                    icon: L.icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    })
                }).addTo(map);

                marker.bindPopup(`
                    <strong>📍 ${result.display_name}</strong><br>
                    Lat: ${lat.toFixed(4)}<br>
                    Lng: ${lng.toFixed(4)}
                `).openPopup();

                selectedCoordinates = { lat, lng };
                updateCoordinatesDisplay(lat, lng);
            }
        })
        .catch(error => {
            console.error('Error buscando dirección:', error);
            showMapNotification('No se encontró la dirección. Verifica los datos e intenta nuevamente.');
        });
}

function reverseGeocode(lat, lng) {
    // Buscar dirección desde coordenadas
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
        .then(response => response.json())
        .then(data => {
            if (data && data.address) {
                const address = data.address;
                // Actualizar campos si es posible
                if (address.road) {
                    const street = document.getElementById('street');
                    if (street && !street.value) {
                        street.value = address.road + (address.house_number ? ' ' + address.house_number : '');
                    }
                }
            }
        })
        .catch(error => console.error('Error en geocodificación inversa:', error));
}

function updateCoordinatesDisplay(lat, lng) {
    const coordElement = document.getElementById('mapCoordinates');
    if (coordElement) {
        coordElement.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

function showMapNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: #ff6b6b;
        color: white;
        padding: 15px 20px;
        border-radius: 6px;
        z-index: 2000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        font-size: 14px;
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 4000);
}

// Hacer funciones globales
window.searchAddress = searchAddress;
window.onRegionChange = onRegionChange;
