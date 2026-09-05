// hair-analysis.js - Controlador del flujo guiado de análisis de cabello con IA
//
// NOTA IMPORTANTE: el paso de "análisis" y las métricas de resultado son un marcador
// de posición funcional (heurística simple basada en el brillo promedio de las fotos).
// No existe todavía un backend de IA real conectado. Cuando exista, reemplazar
// `estimateHairProfile()` y `runAnalyzingSequence()` por la llamada real al servicio,
// manteniendo la misma interfaz de datos que consumen `renderResults()`.

(function () {
    const STEP_META = [
        {
            key: 'general',
            label: 'General',
            title: 'Vista general',
            instructions: 'Fotografía tu cabello completo desde atrás.',
            frameShape: 'general'
        },
        {
            key: 'raiz',
            label: 'Raíz',
            title: 'Ahora fotografiemos tu raíz',
            instructions: 'Acerca la cámara para que podamos observar mejor esta zona.',
            frameShape: 'raiz'
        },
        {
            key: 'puntas',
            label: 'Puntas',
            title: 'Por último, tus puntas',
            instructions: 'Acerca las puntas del cabello y mantenlas enfocadas.',
            frameShape: 'puntas'
        }
    ];

    const NEED_CONFIG = {
        hidratacion: { label: 'HIDRATACIÓN', categories: ['mascarilla', 'acondicionador', 'aceite'] },
        reparacion: { label: 'REPARACIÓN', categories: ['tratamiento', 'serum'] },
        frizz: { label: 'CONTROL DE FRIZZ', categories: ['serum', 'proteccion-termica', 'aceite'] }
    };

    const DARK_BRIGHTNESS_THRESHOLD = 60;
    const CONSENT_VERSION = '1.0';
    const GUEST_CONSENT_STORAGE_KEY = 'hairia_hair_analysis_consent';

    const state = {
        photoIndex: 0,
        photos: [null, null, null],
        lastCapture: null,
        stream: null,
        consent: null
    };

    let elements = null;

    function cacheElements() {
        elements = {
            startAnalysisBtn: document.getElementById('startAnalysisBtn'),
            consentBackBtn: document.getElementById('consentBackBtn'),
            consentAnalysis: document.getElementById('consentAnalysis'),
            consentTraining: document.getElementById('consentTraining'),
            consentGuestNote: document.getElementById('consentGuestNote'),
            continueToCameraBtn: document.getElementById('continueToCameraBtn'),
            captureExitBtn: document.getElementById('captureExitBtn'),
            captureHelpBtn: document.getElementById('captureHelpBtn'),
            cameraHelpTip: document.getElementById('cameraHelpTip'),
            captureStepLabel: document.getElementById('captureStepLabel'),
            captureProgress: document.getElementById('captureProgress'),
            video: document.getElementById('hairCameraVideo'),
            guideFrame: document.getElementById('hairGuideFrame'),
            fallbackMsg: document.getElementById('cameraFallbackMsg'),
            captureTitle: document.getElementById('captureTitle'),
            captureInstructions: document.getElementById('captureInstructions'),
            shutterBtn: document.getElementById('shutterBtn'),
            galleryInput: document.getElementById('galleryInput'),
            canvas: document.getElementById('hairCaptureCanvas'),
            confirmPhotoPreview: document.getElementById('confirmPhotoPreview'),
            confirmIcon: document.getElementById('confirmIcon'),
            confirmTitle: document.getElementById('confirmTitle'),
            confirmMessage: document.getElementById('confirmMessage'),
            useThisPhotoBtn: document.getElementById('useThisPhotoBtn'),
            retakePhotoBtn: document.getElementById('retakePhotoBtn'),
            reviewBackBtn: document.getElementById('reviewBackBtn'),
            reviewGrid: document.getElementById('reviewGrid'),
            analyzeBtn: document.getElementById('analyzeBtn'),
            analyzingProgressFill: document.getElementById('analyzingProgressFill'),
            analyzingPercent: document.getElementById('analyzingPercent'),
            analyzingChecklist: document.getElementById('analyzingChecklist'),
            resultsNeed: document.getElementById('resultsNeed'),
            resultsPhoto: document.getElementById('resultsPhoto'),
            resultsMetrics: document.getElementById('resultsMetrics'),
            resultsRecommendations: document.getElementById('resultsRecommendations'),
            recommendationsEmpty: document.getElementById('recommendationsEmpty'),
            viewAllProductsLink: document.getElementById('viewAllProductsLink')
        };
    }

    function showPanel(name) {
        document.querySelectorAll('.hair-panel').forEach((panel) => {
            panel.classList.toggle('active', panel.dataset.panel === name);
        });
    }

    function escapeHtml(value) {
        const text = value == null ? '' : String(value);
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatPrice(amount) {
        if (typeof window.formatCLP === 'function') {
            return window.formatCLP(amount);
        }
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(Number(amount) || 0);
    }

    function resetFlowState() {
        state.photoIndex = 0;
        state.photos = [null, null, null];
        state.lastCapture = null;
    }

    // ---------- Cámara ----------

    async function ensureCamera() {
        if (state.stream) {
            elements.fallbackMsg.hidden = true;
            elements.shutterBtn.disabled = false;
            return true;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            elements.fallbackMsg.hidden = false;
            elements.shutterBtn.disabled = true;
            return false;
        }

        try {
            state.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false
            });
            elements.video.srcObject = state.stream;
            elements.fallbackMsg.hidden = true;
            elements.shutterBtn.disabled = false;
            return true;
        } catch (error) {
            console.warn('⚠️ No se pudo acceder a la cámara:', error.message);
            elements.fallbackMsg.hidden = false;
            elements.shutterBtn.disabled = true;
            return false;
        }
    }

    function stopCamera() {
        if (state.stream) {
            state.stream.getTracks().forEach((track) => track.stop());
            state.stream = null;
        }
    }

    function computeAverageBrightness(imageData) {
        const data = imageData.data;
        const sampleStep = 4 * 20; // muestrea 1 de cada 20 píxeles por rendimiento
        let sum = 0;
        let sampledPixels = 0;

        for (let i = 0; i < data.length; i += sampleStep) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            sum += (r * 0.299) + (g * 0.587) + (b * 0.114);
            sampledPixels += 1;
        }

        return sampledPixels > 0 ? sum / sampledPixels : 140;
    }

    function capturePhoto() {
        const { video, canvas } = elements;
        if (!video.videoWidth || !video.videoHeight) {
            return;
        }

        // Si la foto se pudo tomar es porque la cámara sí está entregando video,
        // así que el mensaje de fallback ya no aplica (evita estados inconsistentes).
        elements.fallbackMsg.hidden = true;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const brightness = computeAverageBrightness(ctx.getImageData(0, 0, canvas.width, canvas.height));
        state.lastCapture = { dataUrl, brightness };
        showConfirmPanel();
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    function computeBrightnessFromDataUrl(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const { canvas } = elements;
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                try {
                    resolve(computeAverageBrightness(ctx.getImageData(0, 0, canvas.width, canvas.height)));
                } catch (error) {
                    console.warn('⚠️ No se pudo analizar el brillo de la imagen subida:', error.message);
                    resolve(140);
                }
            };
            img.onerror = () => resolve(140);
            img.src = dataUrl;
        });
    }

    async function handleGalleryUpload(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        const dataUrl = await readFileAsDataUrl(file);
        const brightness = await computeBrightnessFromDataUrl(dataUrl);
        state.lastCapture = { dataUrl, brightness };
        showConfirmPanel();
    }

    // ---------- Pasos de captura ----------

    function setupCaptureStep() {
        const meta = STEP_META[state.photoIndex];

        elements.captureStepLabel.textContent = `Foto ${state.photoIndex + 1} de 3`;
        elements.guideFrame.dataset.shape = meta.frameShape;
        elements.captureTitle.textContent = meta.title;
        elements.captureInstructions.textContent = meta.instructions;
        elements.cameraHelpTip.hidden = true;

        elements.captureProgress.querySelectorAll('.hair-dot').forEach((dot) => {
            const dotIndex = Number(dot.dataset.dot);
            dot.classList.toggle('hair-dot-done', dotIndex < state.photoIndex);
            dot.classList.toggle('hair-dot-active', dotIndex === state.photoIndex);
        });

        ensureCamera();
    }

    function showConfirmPanel() {
        const meta = STEP_META[state.photoIndex];
        const { dataUrl, brightness } = state.lastCapture;
        const isDark = brightness < DARK_BRIGHTNESS_THRESHOLD;

        elements.confirmPhotoPreview.src = dataUrl;
        elements.confirmIcon.textContent = isDark ? '⚠' : '✓';
        elements.confirmIcon.classList.toggle('hair-confirm-icon-warning', isDark);
        elements.confirmTitle.textContent = isDark ? 'Foto muy oscura' : '¡Se ve muy bien!';
        elements.confirmMessage.textContent = isDark
            ? `Repite la foto de "${meta.label}" con mejor iluminación para un análisis más preciso.`
            : 'La imagen tiene suficiente iluminación y nitidez.';
        elements.useThisPhotoBtn.disabled = isDark;
        elements.useThisPhotoBtn.classList.toggle('hair-btn-disabled', isDark);

        showPanel('confirm');
    }

    function acceptCurrentPhoto() {
        if (elements.useThisPhotoBtn.disabled || !state.lastCapture) return;

        const meta = STEP_META[state.photoIndex];
        state.photos[state.photoIndex] = { ...state.lastCapture, label: meta.label };
        state.lastCapture = null;

        if (state.photoIndex < STEP_META.length - 1) {
            state.photoIndex += 1;
            setupCaptureStep();
            showPanel('capture');
        } else {
            stopCamera();
            maybeUploadTrainingSample();
            renderReviewGrid();
            showPanel('review');
        }
    }

    // El envío es en segundo plano y opcional: nunca bloquea ni retrasa la revisión
    // de fotos del usuario. Solo se ejecuta si el usuario dio el consentimiento
    // voluntario de entrenamiento y tiene una cuenta (se requiere autenticación
    // para poder escribir en Storage, ver storage.rules).
    function maybeUploadTrainingSample() {
        if (!state.consent?.consentimiento_entrenamiento) return;

        const currentUser = window.hairiaSession?.getCurrentUser?.();
        if (!currentUser?.uid) return;

        window.firebaseData?.uploadHairAnalysisTrainingSample?.(state.photos)
            .catch((error) => {
                console.warn('⚠️ No se pudo guardar la muestra de entrenamiento:', error.message);
            });
    }

    function retakeCurrentPhoto() {
        state.lastCapture = null;
        setupCaptureStep();
        showPanel('capture');
    }

    function exitFlow() {
        const shouldExit = window.confirm('¿Salir del análisis? Perderás el progreso.');
        if (!shouldExit) return;

        stopCamera();
        resetFlowState();
        showPanel('intro');
    }

    // ---------- Consentimiento ----------

    function resetConsentPanel() {
        elements.consentAnalysis.checked = false;
        elements.consentTraining.checked = false;
        elements.consentGuestNote.hidden = true;
        elements.continueToCameraBtn.disabled = true;
    }

    function updateGuestNoteVisibility() {
        const currentUser = window.hairiaSession?.getCurrentUser?.();
        const isGuest = !currentUser?.uid;
        elements.consentGuestNote.hidden = !(elements.consentTraining.checked && isGuest);
    }

    // Registra evidencia verificable del consentimiento (qué se aceptó, versión de
    // términos y fecha), no solo un valor true/false, tal como exige demostrar el
    // consentimiento la Ley 19.628 y su reforma (Ley 21.719).
    async function recordConsent() {
        const consentRecord = {
            consentimiento_analisis: elements.consentAnalysis.checked,
            consentimiento_entrenamiento: elements.consentTraining.checked,
            version_terminos: CONSENT_VERSION,
            fecha_consentimiento: new Date().toISOString(),
            consentimiento_revocado: false
        };

        state.consent = consentRecord;

        const currentUser = window.hairiaSession?.getCurrentUser?.();
        const userId = currentUser?.uid || currentUser?.id;

        if (userId && window.firebaseData?.saveHairAnalysisConsent) {
            try {
                await window.firebaseData.saveHairAnalysisConsent(userId, consentRecord);
                return;
            } catch (error) {
                console.warn('⚠️ No se pudo registrar el consentimiento en Firebase:', error.message);
            }
        }

        try {
            localStorage.setItem(GUEST_CONSENT_STORAGE_KEY, JSON.stringify(consentRecord));
        } catch (error) {
            console.warn('⚠️ No se pudo guardar el consentimiento localmente:', error.message);
        }
    }

    // ---------- Revisión ----------

    function renderReviewGrid() {
        elements.reviewGrid.innerHTML = state.photos.map((photo, index) => `
            <div class="hair-review-card">
                <img class="hair-review-thumb" src="${photo?.dataUrl || ''}" alt="Foto ${escapeHtml(photo?.label || '')}">
                <div class="hair-review-card-footer">
                    <span>${escapeHtml(photo?.label || '')}</span>
                    <span class="hair-review-check">✓</span>
                    <button type="button" class="hair-review-retake" data-retake-index="${index}">Repetir</button>
                </div>
            </div>
        `).join('');

        elements.reviewGrid.querySelectorAll('[data-retake-index]').forEach((button) => {
            button.addEventListener('click', () => {
                state.photoIndex = Number(button.dataset.retakeIndex);
                setupCaptureStep();
                showPanel('capture');
            });
        });
    }

    // ---------- Análisis simulado ----------

    function resetAnalyzingUi() {
        elements.analyzingProgressFill.style.width = '0%';
        elements.analyzingPercent.textContent = '0%';
        elements.analyzingChecklist.querySelectorAll('li').forEach((item) => {
            item.classList.remove('hair-stage-active', 'hair-stage-done');
            item.querySelector('.hair-check-icon').textContent = '○';
        });
    }

    function runAnalyzingSequence() {
        return new Promise((resolve) => {
            resetAnalyzingUi();
            showPanel('analyzing');

            const stageItems = Array.from(elements.analyzingChecklist.querySelectorAll('li'));
            const stageThresholds = [0, 25, 50, 75, 100];
            const totalDurationMs = 3200;
            const start = performance.now();

            function tick(now) {
                const elapsed = now - start;
                const progress = Math.min(100, Math.round((elapsed / totalDurationMs) * 100));

                elements.analyzingProgressFill.style.width = `${progress}%`;
                elements.analyzingPercent.textContent = `${progress}%`;

                stageItems.forEach((item, index) => {
                    const from = stageThresholds[index];
                    const to = stageThresholds[index + 1];
                    const icon = item.querySelector('.hair-check-icon');

                    if (progress >= to) {
                        icon.textContent = '✓';
                        item.classList.add('hair-stage-done');
                        item.classList.remove('hair-stage-active');
                    } else if (progress >= from) {
                        icon.textContent = '●';
                        item.classList.add('hair-stage-active');
                    }
                });

                if (progress < 100) {
                    requestAnimationFrame(tick);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(tick);
        });
    }

    // ---------- Resultados ----------

    function clampPercent(value) {
        return Math.max(5, Math.min(95, Math.round(value)));
    }

    function describeLevel(key, value) {
        if (key === 'hidratacion') {
            if (value < 35) return 'Baja';
            if (value < 70) return 'Media';
            return 'Alta';
        }
        if (value < 35) return 'Leve';
        if (value < 70) return 'Moderado';
        return 'Alto';
    }

    function estimateHairProfile(photos) {
        const brightnessValues = photos.map((photo) => (typeof photo?.brightness === 'number' ? photo.brightness : 140));
        const avgBrightness = brightnessValues.reduce((sum, value) => sum + value, 0) / brightnessValues.length;

        const hidratacionValue = clampPercent(avgBrightness / 2.2);
        const danoValue = clampPercent(90 - (avgBrightness / 3.2));
        const frizzValue = clampPercent(85 - (avgBrightness / 3.6));

        const metrics = [
            { key: 'hidratacion', label: 'Hidratación', value: hidratacionValue, severity: 100 - hidratacionValue },
            { key: 'dano', label: 'Daño', value: danoValue, severity: danoValue },
            { key: 'frizz', label: 'Frizz', value: frizzValue, severity: frizzValue }
        ];

        metrics.forEach((metric) => {
            metric.tag = describeLevel(metric.key, metric.value);
        });

        const primaryMetric = metrics.reduce((worst, metric) => (metric.severity > worst.severity ? metric : worst), metrics[0]);
        const primaryNeedKey = primaryMetric.key === 'dano' ? 'reparacion' : primaryMetric.key;

        return { metrics, primaryNeedKey };
    }

    async function loadRecommendedProducts(primaryNeedKey) {
        const categories = NEED_CONFIG[primaryNeedKey]?.categories || [];
        let products = [];

        try {
            products = await window.firebaseData.loadProducts();
        } catch (error) {
            console.warn('⚠️ No se pudieron cargar productos para recomendaciones:', error.message);
            products = Array.isArray(window.productsData) ? window.productsData : [];
        }

        const availableProducts = products.filter((product) => (
            product && product.active !== false && (product.stock == null || Number(product.stock) > 0)
        ));

        const matched = [];
        categories.forEach((categoryId) => {
            availableProducts.forEach((product) => {
                if (product.category === categoryId && !matched.includes(product)) {
                    matched.push(product);
                }
            });
        });

        return (matched.length > 0 ? matched : availableProducts).slice(0, 4);
    }

    function renderRecommendations(products, categories) {
        elements.resultsRecommendations.querySelectorAll('.hair-product-card').forEach((el) => el.remove());

        if (!products.length) {
            elements.recommendationsEmpty.hidden = false;
            elements.viewAllProductsLink.href = 'products.html';
            return;
        }

        elements.recommendationsEmpty.hidden = true;

        products.forEach((product) => {
            const card = document.createElement('article');
            card.className = 'hair-product-card';
            const safeName = escapeHtml(product.name || 'Producto');
            const safeCategory = encodeURIComponent(product.category || '');
            const safeImage = typeof product.image === 'string' ? product.image : '';

            card.innerHTML = `
                <div class="hair-product-image">${safeImage ? `<img src="${escapeHtml(safeImage)}" alt="${safeName}">` : '<span class="hair-product-placeholder">IMG</span>'}</div>
                <h4>${safeName}</h4>
                <p class="hair-product-price">${formatPrice(product.price)}</p>
                <div class="hair-product-actions">
                    <a href="products.html?category=${safeCategory}" class="hair-product-link">Ver &rarr;</a>
                    <button type="button" class="hair-product-add" data-product-id="${escapeHtml(String(product.id))}">Agregar</button>
                </div>
            `;
            elements.resultsRecommendations.appendChild(card);
        });

        elements.resultsRecommendations.querySelectorAll('.hair-product-add').forEach((button) => {
            button.addEventListener('click', () => {
                const product = products.find((item) => String(item.id) === button.dataset.productId);
                if (product && typeof window.addToCart === 'function') {
                    window.addToCart(product);
                }
            });
        });

        const primaryCategory = categories[0] || '';
        elements.viewAllProductsLink.href = primaryCategory
            ? `products.html?category=${encodeURIComponent(primaryCategory)}`
            : 'products.html';
    }

    async function renderResults() {
        const { metrics, primaryNeedKey } = estimateHairProfile(state.photos);
        const needConfig = NEED_CONFIG[primaryNeedKey];

        elements.resultsNeed.textContent = needConfig.label;

        const generalPhoto = state.photos[0]?.dataUrl || state.photos.find((photo) => photo?.dataUrl)?.dataUrl || '';
        elements.resultsPhoto.src = generalPhoto;

        elements.resultsMetrics.innerHTML = metrics.map((metric) => `
            <div class="hair-metric-row">
                <div class="hair-metric-label-row">
                    <span>${escapeHtml(metric.label)}</span>
                    <span class="hair-metric-tag">${escapeHtml(metric.tag)}</span>
                </div>
                <div class="hair-metric-bar"><div class="hair-metric-bar-fill" style="width:${metric.value}%"></div></div>
            </div>
        `).join('');

        const products = await loadRecommendedProducts(primaryNeedKey);
        renderRecommendations(products, needConfig.categories);
    }

    async function startAnalysis() {
        await runAnalyzingSequence();
        await renderResults();
        showPanel('results');
    }

    // ---------- Eventos ----------

    function wireEvents() {
        elements.startAnalysisBtn.addEventListener('click', () => {
            resetFlowState();
            resetConsentPanel();
            showPanel('consent');
        });

        elements.consentBackBtn.addEventListener('click', () => {
            showPanel('intro');
        });

        elements.consentAnalysis.addEventListener('change', () => {
            elements.continueToCameraBtn.disabled = !elements.consentAnalysis.checked;
        });

        elements.consentTraining.addEventListener('change', updateGuestNoteVisibility);

        elements.continueToCameraBtn.addEventListener('click', async () => {
            if (!elements.consentAnalysis.checked) return;
            await recordConsent();
            setupCaptureStep();
            showPanel('capture');
        });

        elements.shutterBtn.addEventListener('click', capturePhoto);
        elements.galleryInput.addEventListener('change', handleGalleryUpload);
        elements.useThisPhotoBtn.addEventListener('click', acceptCurrentPhoto);
        elements.retakePhotoBtn.addEventListener('click', retakeCurrentPhoto);
        elements.captureExitBtn.addEventListener('click', exitFlow);
        elements.captureHelpBtn.addEventListener('click', () => {
            elements.cameraHelpTip.hidden = !elements.cameraHelpTip.hidden;
        });

        elements.reviewBackBtn.addEventListener('click', () => {
            resetFlowState();
            showPanel('intro');
        });

        elements.analyzeBtn.addEventListener('click', startAnalysis);

        // Red de seguridad: si el video llega a reproducir frames reales,
        // refleja siempre ese estado en la UI (evita mensajes de error obsoletos).
        elements.video.addEventListener('playing', () => {
            elements.fallbackMsg.hidden = true;
            elements.shutterBtn.disabled = false;
        });

        window.addEventListener('beforeunload', stopCamera);
    }

    // ---------- Bootstrap ----------

    async function verifyFeatureEnabled() {
        const defaults = window.hairAnalysisConfig?.getDefaults?.() || { habilitada: true, visibilidad: 'publico' };
        const config = await (window.hairAnalysisConfig?.load() || Promise.resolve(defaults));

        if (!config.habilitada) {
            window.location.href = 'index.html';
            return false;
        }

        // Mientras está en desarrollo, solo un admin verificado puede usar la ruta directa.
        if (config.visibilidad === 'solo_admin') {
            const isAdmin = await verifyCurrentUserIsAdmin();
            if (!isAdmin) {
                window.location.href = 'index.html';
                return false;
            }
        }

        return true;
    }

    async function verifyCurrentUserIsAdmin() {
        const currentUser = window.hairiaSession?.getCurrentUser?.();
        const userId = currentUser?.uid || currentUser?.id;
        if (!userId || typeof window.firebase?.isUserAdmin !== 'function') {
            return false;
        }

        try {
            return await window.firebase.isUserAdmin(userId);
        } catch (error) {
            console.warn('⚠️ No se pudo verificar permisos de administrador:', error.message);
            return false;
        }
    }

    async function init() {
        cacheElements();

        const enabled = await verifyFeatureEnabled();
        if (!enabled) return;

        wireEvents();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
