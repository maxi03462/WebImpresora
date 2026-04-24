// camara.js
const video = document.getElementById('video');
const startCamBtn = document.getElementById('startCam');
const takePhotoBtn = document.getElementById('takePhoto');
const stopCamBtn = document.getElementById('stopCam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const flashFx = document.getElementById('flashFx');
const arcadeState = document.getElementById('arcadeState');
const printTarget = document.getElementById('printTarget');

const IMAGE_CONFIG_STORAGE_KEY = 'webimpresora.imageConfig';

const DEFAULT_IMAGE_CONFIG = {
  mode: 'dithering',
  threshold: 127,
  dithering: 'atkinson',
  brightness: 0,
  contrast: 1.0,
  gamma: 1.0,
  noiseReduction: 'off',
  invert: false,
  resize: 'fit_width'
};

const IMAGE_PRESETS = {
  texto: {
    mode: 'threshold',
    threshold: 145,
    dithering: 'atkinson',
    brightness: 8,
    contrast: 1.7,
    gamma: 1.0,
    noiseReduction: 'low',
    invert: false,
    resize: 'fit_width'
  },
  logo: {
    mode: 'threshold',
    threshold: 130,
    dithering: 'atkinson',
    brightness: 0,
    contrast: 1.8,
    gamma: 1.0,
    noiseReduction: 'off',
    invert: false,
    resize: 'fit_width'
  },
  foto: {
    mode: 'dithering',
    threshold: 120,
    dithering: 'floyd-steinberg',
    brightness: 5,
    contrast: 1.15,
    gamma: 1.1,
    noiseReduction: 'medium',
    invert: false,
    resize: 'fit_width'
  },
  qr: {
    mode: 'threshold',
    threshold: 150,
    dithering: 'atkinson',
    brightness: 0,
    contrast: 2.0,
    gamma: 1.0,
    noiseReduction: 'off',
    invert: false,
    resize: 'keep_size'
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeConfig(raw) {
  const cfg = { ...DEFAULT_IMAGE_CONFIG, ...(raw || {}) };
  cfg.mode = ['threshold', 'adaptive', 'dithering'].includes(cfg.mode) ? cfg.mode : DEFAULT_IMAGE_CONFIG.mode;
  cfg.threshold = clamp(Number(cfg.threshold) || 127, 0, 255);
  cfg.dithering = ['floyd-steinberg', 'atkinson', 'bayer'].includes(cfg.dithering) ? cfg.dithering : DEFAULT_IMAGE_CONFIG.dithering;
  cfg.brightness = clamp(Number(cfg.brightness) || 0, -100, 100);
  cfg.contrast = clamp(Number(cfg.contrast) || 1, 0.5, 2.0);
  cfg.gamma = clamp(Number(cfg.gamma) || 1, 0.5, 3.0);
  cfg.noiseReduction = ['off', 'low', 'medium', 'high'].includes(cfg.noiseReduction) ? cfg.noiseReduction : 'off';
  cfg.invert = Boolean(cfg.invert);
  cfg.resize = ['fit_width', 'keep_size'].includes(cfg.resize) ? cfg.resize : 'fit_width';
  return cfg;
}

function loadImageConfig() {
  try {
    const raw = localStorage.getItem(IMAGE_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_IMAGE_CONFIG };
    return sanitizeConfig(JSON.parse(raw));
  } catch (_) {
    return { ...DEFAULT_IMAGE_CONFIG };
  }
}

function saveImageConfig(cfg) {
  try {
    localStorage.setItem(IMAGE_CONFIG_STORAGE_KEY, JSON.stringify(cfg));
  } catch (_) {
    // no-op: localStorage puede estar bloqueado
  }
}

function blurGray(gray, width, height) {
  const out = new Float32Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        const ny = y + oy;
        if (ny < 0 || ny >= height) continue;
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          if (nx < 0 || nx >= width) continue;
          sum += gray[ny * width + nx];
          count += 1;
        }
      }
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

function applyNoiseReduction(gray, width, height, level) {
  const passesByLevel = { off: 0, low: 1, medium: 2, high: 3 };
  const passes = passesByLevel[level] || 0;
  let working = gray;
  for (let i = 0; i < passes; i += 1) {
    working = blurGray(working, width, height);
  }
  return working;
}

function ditherFloydSteinberg(gray, width, height, threshold) {
  const work = new Float32Array(gray);
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const oldVal = work[i];
      const newVal = oldVal >= threshold ? 255 : 0;
      out[i] = newVal;
      const err = oldVal - newVal;

      if (x + 1 < width) work[i + 1] += err * (7 / 16);
      if (y + 1 < height) {
        if (x > 0) work[i + width - 1] += err * (3 / 16);
        work[i + width] += err * (5 / 16);
        if (x + 1 < width) work[i + width + 1] += err * (1 / 16);
      }
    }
  }
  return out;
}

function ditherAtkinson(gray, width, height, threshold) {
  const work = new Float32Array(gray);
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const oldVal = work[i];
      const newVal = oldVal >= threshold ? 255 : 0;
      out[i] = newVal;
      const err = (oldVal - newVal) / 8;

      const spread = [
        [1, 0], [2, 0],
        [-1, 1], [0, 1], [1, 1],
        [0, 2]
      ];

      for (const [ox, oy] of spread) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        work[ny * width + nx] += err;
      }
    }
  }
  return out;
}

function ditherBayer(gray, width, height, threshold) {
  const matrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const delta = (matrix[y % 4][x % 4] - 7.5) * 8;
      out[i] = gray[i] >= (threshold + delta) ? 255 : 0;
    }
  }
  return out;
}

function adaptiveThreshold(gray, width, height) {
  const out = new Uint8ClampedArray(gray.length);
  const radius = 5;
  const bias = 7;

  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += gray[(y - 1) * width + (x - 1)];
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + rowSum;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);

      const A = integral[y0 * (width + 1) + x0];
      const B = integral[y0 * (width + 1) + (x1 + 1)];
      const C = integral[(y1 + 1) * (width + 1) + x0];
      const D = integral[(y1 + 1) * (width + 1) + (x1 + 1)];

      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const localMean = (D - B - C + A) / area;
      const v = gray[y * width + x];
      out[y * width + x] = v >= (localMean - bias) ? 255 : 0;
    }
  }

  return out;
}

function toBW(gray, width, height, cfg) {
  if (cfg.mode === 'adaptive') {
    return adaptiveThreshold(gray, width, height);
  }

  if (cfg.mode === 'dithering') {
    if (cfg.dithering === 'floyd-steinberg') return ditherFloydSteinberg(gray, width, height, cfg.threshold);
    if (cfg.dithering === 'bayer') return ditherBayer(gray, width, height, cfg.threshold);
    return ditherAtkinson(gray, width, height, cfg.threshold);
  }

  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i += 1) {
    out[i] = gray[i] >= cfg.threshold ? 255 : 0;
  }
  return out;
}

function drawSourceToTarget(source, tctx, targetW, targetH, resizeMode) {
  let sw = 0;
  let sh = 0;

  if (source instanceof HTMLVideoElement) {
    sw = source.videoWidth;
    sh = source.videoHeight;
  } else {
    sw = source.naturalWidth;
    sh = source.naturalHeight;
  }

  if (!sw || !sh) {
    tctx.drawImage(source, 0, 0, targetW, targetH);
    return;
  }

  if (source instanceof HTMLVideoElement && printTarget) {
    const videoRect = source.getBoundingClientRect();
    const targetRect = printTarget.getBoundingClientRect();

    const coverScale = Math.max(videoRect.width / sw, videoRect.height / sh);
    const displayedW = sw * coverScale;
    const displayedH = sh * coverScale;
    const offsetX = (videoRect.width - displayedW) / 2;
    const offsetY = (videoRect.height - displayedH) / 2;

    const targetXInVideo = targetRect.left - videoRect.left;
    const targetYInVideo = targetRect.top - videoRect.top;

    let sx = (targetXInVideo - offsetX) / coverScale;
    let sy = (targetYInVideo - offsetY) / coverScale;
    let sWidth = targetRect.width / coverScale;
    let sHeight = targetRect.height / coverScale;

    sx = Math.max(0, Math.min(sw - 1, sx));
    sy = Math.max(0, Math.min(sh - 1, sy));
    sWidth = Math.max(1, Math.min(sw - sx, sWidth));
    sHeight = Math.max(1, Math.min(sh - sy, sHeight));

    tctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);
    return;
  }

  if (resizeMode === 'keep_size') {
    const scale = Math.min(1, Math.min(targetW / sw, targetH / sh));
    const drawW = sw * scale;
    const drawH = sh * scale;
    const dx = (targetW - drawW) / 2;
    const dy = (targetH - drawH) / 2;
    tctx.drawImage(source, dx, dy, drawW, drawH);
    return;
  }

  const scale = Math.max(targetW / sw, targetH / sh);
  const drawW = sw * scale;
  const drawH = sh * scale;
  const dx = (targetW - drawW) / 2;
  const dy = (targetH - drawH) / 2;
  tctx.drawImage(source, dx, dy, drawW, drawH);
}

function processImageToCanvas(source, outCanvas, cfg) {
  const targetW = outCanvas.width;
  const targetH = outCanvas.height;
  const outCtx = outCanvas.getContext('2d');

  const tmp = document.createElement('canvas');
  tmp.width = targetW;
  tmp.height = targetH;
  const tctx = tmp.getContext('2d');

  drawSourceToTarget(source, tctx, targetW, targetH, cfg.resize);

  const imageData = tctx.getImageData(0, 0, targetW, targetH);
  const d = imageData.data;
  const gray = new Float32Array(targetW * targetH);

  const brightnessShift = (cfg.brightness / 100) * 120;
  const gamma = Math.max(0.01, cfg.gamma);

  for (let i = 0, px = 0; i < d.length; i += 4, px += 1) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let v = lum + brightnessShift;
    v = (v - 128) * cfg.contrast + 128;
    v = 255 * Math.pow(clamp(v, 0, 255) / 255, 1 / gamma);
    if (cfg.invert) v = 255 - v;
    gray[px] = clamp(v, 0, 255);
  }

  const denoised = applyNoiseReduction(gray, targetW, targetH, cfg.noiseReduction);
  const bw = toBW(denoised, targetW, targetH, cfg);

  for (let i = 0, px = 0; i < d.length; i += 4, px += 1) {
    const v = bw[px];
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }

  outCtx.putImageData(imageData, 0, 0);
}

function initCameraUploader() {
  let stream = null;
  let currentFacingMode = 'environment';

  let imageConfig = loadImageConfig();
  let draftConfig = { ...imageConfig };

  // Estado global solicitado para integrar con ESC/POS.
  window.imagePrintConfig = { ...imageConfig };
  window.getImagePrintConfig = () => ({ ...imageConfig });

  const toggleCameraBtn = document.getElementById('toggleCamera');
  const openImageConfigBtn = document.getElementById('openImageConfig');

  const modal = document.getElementById('imageConfigModal');
  const cfgPreset = document.getElementById('cfgPreset');
  const cfgMode = document.getElementById('cfgMode');
  const cfgThreshold = document.getElementById('cfgThreshold');
  const cfgThresholdValue = document.getElementById('cfgThresholdValue');
  const cfgDitheringField = document.getElementById('cfgDitheringField');
  const cfgDithering = document.getElementById('cfgDithering');
  const cfgBrightness = document.getElementById('cfgBrightness');
  const cfgBrightnessValue = document.getElementById('cfgBrightnessValue');
  const cfgContrast = document.getElementById('cfgContrast');
  const cfgContrastValue = document.getElementById('cfgContrastValue');
  const cfgGamma = document.getElementById('cfgGamma');
  const cfgGammaValue = document.getElementById('cfgGammaValue');
  const cfgNoiseReduction = document.getElementById('cfgNoiseReduction');
  const cfgInvert = document.getElementById('cfgInvert');
  const cfgResize = document.getElementById('cfgResize');
  const cfgApply = document.getElementById('cfgApply');
  const cfgCancel = document.getElementById('cfgCancel');
  const cfgClose = document.getElementById('cfgClose');
  const configPreviewCanvas = document.getElementById('configPreviewCanvas');
  const configPreviewCtx = configPreviewCanvas.getContext('2d');

  let previewRaf = null;

  function setArcadeState(label, tone) {
    if (!arcadeState) return;
    arcadeState.textContent = label;
    arcadeState.dataset.tone = tone;
  }

  function setStatus(s) {
    status.textContent = s;
    window.dispatchEvent(new CustomEvent('camera-status', { detail: s }));

    const lower = String(s).toLowerCase();
    if (lower.includes('procesando') || lower.includes('imprimiendo') || lower.includes('printing')) {
      setArcadeState('PRINTING...', 'busy');
    } else if (lower.includes('no se pudo') || lower.includes('no disponible')) {
      setArcadeState('ERROR', 'error');
    } else if (lower.includes('camara abierta') || lower.includes('cámara abierta')) {
      setArcadeState('READY', 'ready');
    } else if (lower.includes('detenida')) {
      setArcadeState('SLEEP', 'idle');
    }
  }

  function setPresetByName(presetName) {
    if (!IMAGE_PRESETS[presetName]) return;
    draftConfig = sanitizeConfig({ ...draftConfig, ...IMAGE_PRESETS[presetName] });
    syncControlsFromDraft();
    renderConfigPreview();
  }

  function updateDitheringVisibility() {
    cfgDitheringField.style.display = draftConfig.mode === 'dithering' ? 'grid' : 'none';
  }

  function updateLiveValueLabels() {
    cfgThresholdValue.textContent = String(Math.round(draftConfig.threshold));
    cfgBrightnessValue.textContent = String(Math.round(draftConfig.brightness));
    cfgContrastValue.textContent = Number(draftConfig.contrast).toFixed(1);
    cfgGammaValue.textContent = Number(draftConfig.gamma).toFixed(1);
  }

  function syncControlsFromDraft() {
    cfgMode.value = draftConfig.mode;
    cfgThreshold.value = String(draftConfig.threshold);
    cfgDithering.value = draftConfig.dithering;
    cfgBrightness.value = String(draftConfig.brightness);
    cfgContrast.value = String(draftConfig.contrast);
    cfgGamma.value = String(draftConfig.gamma);
    cfgNoiseReduction.value = draftConfig.noiseReduction;
    cfgInvert.checked = !!draftConfig.invert;
    cfgResize.value = draftConfig.resize;
    updateDitheringVisibility();
    updateLiveValueLabels();
  }

  function readDraftFromControls() {
    draftConfig = sanitizeConfig({
      mode: cfgMode.value,
      threshold: Number(cfgThreshold.value),
      dithering: cfgDithering.value,
      brightness: Number(cfgBrightness.value),
      contrast: Number(cfgContrast.value),
      gamma: Number(cfgGamma.value),
      noiseReduction: cfgNoiseReduction.value,
      invert: cfgInvert.checked,
      resize: cfgResize.value
    });
    updateDitheringVisibility();
    updateLiveValueLabels();
  }

  function drawPreviewPlaceholder() {
    configPreviewCtx.clearRect(0, 0, configPreviewCanvas.width, configPreviewCanvas.height);
    configPreviewCtx.fillStyle = '#070b1a';
    configPreviewCtx.fillRect(0, 0, configPreviewCanvas.width, configPreviewCanvas.height);
    configPreviewCtx.fillStyle = '#9db2f6';
    configPreviewCtx.font = '12px Chakra Petch, sans-serif';
    configPreviewCtx.fillText('Abre la camara para ver preview', 12, 24);
  }

  function renderConfigPreview() {
    if (!modal.classList.contains('open')) return;
    if (!stream || video.readyState < 2) {
      drawPreviewPlaceholder();
      return;
    }

    processImageToCanvas(video, configPreviewCanvas, draftConfig);
  }

  function previewLoop() {
    renderConfigPreview();
    if (modal.classList.contains('open')) {
      previewRaf = requestAnimationFrame(previewLoop);
    }
  }

  function startPreviewLoop() {
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = requestAnimationFrame(previewLoop);
  }

  function stopPreviewLoop() {
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = null;
  }

  function openConfigModal() {
    draftConfig = { ...imageConfig };
    cfgPreset.value = 'custom';
    syncControlsFromDraft();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    startPreviewLoop();
  }

  function closeConfigModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    stopPreviewLoop();
  }

  function applyConfig() {
    imageConfig = sanitizeConfig({ ...draftConfig });
    window.imagePrintConfig = { ...imageConfig };
    saveImageConfig(imageConfig);
    closeConfigModal();
    setStatus('Configuracion de imagen aplicada.');
  }

  async function startCamera(facingModeOrEvent = 'environment') {
    try {
      let facingMode = 'environment';
      if (typeof facingModeOrEvent === 'string') {
        facingMode = facingModeOrEvent;
      } else if (facingModeOrEvent && facingModeOrEvent.preventDefault) {
        facingMode = currentFacingMode;
      }

      currentFacingMode = facingMode;

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: facingMode }
        },
        audio: false
      };

      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      video.style.display = 'block';
      if (startCamBtn) startCamBtn.disabled = true;
      takePhotoBtn.disabled = false;
      if (stopCamBtn) stopCamBtn.disabled = false;
      if (toggleCameraBtn) toggleCameraBtn.disabled = false;
      const cameraLabel = facingMode === 'user' ? 'frontal' : 'trasera';
      setStatus(`Camara ${cameraLabel} abierta. Presiona "Tomar foto".`);
    } catch (err) {
      console.error('No se pudo abrir la cámara:', err);
      const modeStr = typeof facingModeOrEvent === 'string' ? facingModeOrEvent : 'trasera';
      const cameraLabel = modeStr === 'user' ? 'frontal' : 'trasera';
      setStatus(`No se pudo abrir camara ${cameraLabel}. Usa "Subir foto" como fallback.`);
      throw err;
    }
  }

  async function toggleCamera() {
    if (!stream) return;

    toggleCameraBtn.disabled = true;
    const prevFacingMode = currentFacingMode;
    const newFacingMode = prevFacingMode === 'environment' ? 'user' : 'environment';
    const cameraLabel = newFacingMode === 'user' ? 'frontal' : 'trasera';

    setStatus(`Cambiando a camara ${cameraLabel}...`);

    const tracks = stream.getTracks();
    tracks.forEach(t => t.stop());
    stream = null;
    video.srcObject = null;

    try {
      await startCamera(newFacingMode);
    } catch (err) {
      console.error(`No se pudo cambiar a cámara ${cameraLabel}:`, err);
      setStatus(`No se pudo acceder a camara ${cameraLabel}. Dispositivo no disponible.`);
      toggleCameraBtn.disabled = false;
      try {
        await startCamera(prevFacingMode);
      } catch (backErr) {
        console.error('Error restaurando cámara anterior:', backErr);
        setStatus('Error de camara. Por favor recarga la pagina.');
      }
    }
  }

  function stopCamera() {
    if (stream) {
      const tracks = stream.getTracks();
      tracks.forEach(t => t.stop());
      stream = null;
    }
    video.srcObject = null;
    video.style.display = 'none';
    if (startCamBtn) startCamBtn.disabled = false;
    takePhotoBtn.disabled = true;
    if (stopCamBtn) stopCamBtn.disabled = true;
    setStatus('Camara detenida.');
  }

  async function takePhoto() {
    setStatus('Procesando imagen...');
    takePhotoBtn.disabled = true;
    if (stream && video.readyState >= 2) {
      if (flashFx) {
        flashFx.classList.add('active');
        setTimeout(() => flashFx.classList.remove('active'), 180);
      }

      processImageToCanvas(video, canvas, imageConfig);

      const encoder = new window.ReceiptPrinterEncoder();
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      setArcadeState('PRINTING...', 'busy');
      const data = encoder
        .initialize()
        .image(imageData, canvas.width, canvas.height, 'atkinson')
        .newline()
        .newline()
        .encode();
      await writeEscPos(data);
      setStatus('Impresion finalizada.');
      setArcadeState('READY', 'ready');
    } else {
      setStatus('Camara no disponible.');
    }

    takePhotoBtn.disabled = false;
  }

  openImageConfigBtn.addEventListener('click', openConfigModal);
  cfgApply.addEventListener('click', applyConfig);
  cfgCancel.addEventListener('click', closeConfigModal);
  cfgClose.addEventListener('click', closeConfigModal);

  modal.addEventListener('click', (ev) => {
    if (ev.target === modal) closeConfigModal();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modal.classList.contains('open')) {
      closeConfigModal();
    }
  });

  cfgPreset.addEventListener('change', (ev) => {
    const selected = ev.target.value;
    if (selected === 'custom') return;
    setPresetByName(selected);
  });

  const liveInputs = [
    cfgMode,
    cfgThreshold,
    cfgDithering,
    cfgBrightness,
    cfgContrast,
    cfgGamma,
    cfgNoiseReduction,
    cfgInvert,
    cfgResize
  ];

  liveInputs.forEach((el) => {
    const eventName = el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      readDraftFromControls();
      cfgPreset.value = 'custom';
      renderConfigPreview();
    });
    if (eventName !== 'change') {
      el.addEventListener('change', () => {
        readDraftFromControls();
        cfgPreset.value = 'custom';
        renderConfigPreview();
      });
    }
  });

  if (startCamBtn) startCamBtn.addEventListener('click', startCamera);
  if (stopCamBtn) stopCamBtn.addEventListener('click', stopCamera);
  if (toggleCameraBtn) toggleCameraBtn.addEventListener('click', toggleCamera);
  takePhotoBtn.addEventListener('click', takePhoto);
  window.addEventListener('pagehide', stopCamera);

  // Preview inicial del modal con config persistida.
  syncControlsFromDraft();

  startCamera().catch((err) => {
    console.error('Error al iniciar cámara:', err);
    if (toggleCameraBtn) toggleCameraBtn.disabled = true;
  });
}
