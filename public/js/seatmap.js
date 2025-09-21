// Este archivo se encarga de la lógica específica del mapa de asientos.

document.addEventListener('DOMContentLoaded', () => {
    // No hacer nada si no estamos en la página principal
    if (!document.getElementById('seatMap')) return;

    // Configuración
    const USD_EXCHANGE_RATE = parseFloat(process.env.USD_EXCHANGE_RATE) || 18.0;

    // Elementos del DOM
    const seatMapContainer = document.querySelector('.seat-map-container');
    const summaryCard = document.querySelector('[data-testid="summary-card"] .price-summary');

    function createLegend() {
        const legend = document.createElement('div');
        legend.className = 'seat-legend';
        legend.innerHTML = `
            <div class="legend-item"><div class="seat-demo available"></div><span>Disponible</span></div>
            <div class="legend-item"><div class="seat-demo selected"></div><span>Seleccionado</span></div>
            <div class="legend-item"><div class="seat-demo occupied"></div><span>Ocupado</span></div>
            <div class="legend-item"><div class="seat-demo premium"></div><span>Premium</span></div>
            <div class="legend-item"><i class="fas fa-steering-wheel"></i><span>Conductor</span></div>
        `;
        seatMapContainer.appendChild(legend);
    }

    function createLiveTotalDisplay() {
        const totalContainer = document.createElement('div');
        totalContainer.className = 'live-total-container';
        totalContainer.innerHTML = `
            <div class="total-local">Total: $<span id="liveTotalPrice">0.00</span> MXN</div>
            <div class="total-usd">≈ $<span id="liveTotalUsd">0.00</span> USD</div>
        `;
        summaryCard.appendChild(totalContainer);
    }

    // Función global para actualizar el total (será llamada desde app.js)
    window.updateLiveTotal = function(totalLocal) {
        const localPrice = parseFloat(totalLocal) || 0;
        const usdPrice = localPrice / USD_EXCHANGE_RATE;

        const liveTotalPrice = document.getElementById('liveTotalPrice');
        const liveTotalUsd = document.getElementById('liveTotalUsd');

        if (liveTotalPrice && liveTotalUsd) {
            liveTotalPrice.textContent = localPrice.toFixed(2);
            liveTotalUsd.textContent = usdPrice.toFixed(2);
        }
    }

    // Inicializar
    createLegend();
    createLiveTotalDisplay();
});
