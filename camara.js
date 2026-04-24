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

function initCameraUploader() {
  let stream = null;
  let currentFacingMode = 'environment';

  const toggleCameraBtn = document.getElementById('toggleCamera');

  const imageConfig = window.initImageConfigModule({
    video,
    printTarget,
    onStatus: setStatus
  });

  function setArcadeState(label, tone) {
    if (!arcadeState) return;
    arcadeState.textContent = label;
    arcadeState.dataset.tone = tone;
  }

  function setStatus(text) {
    status.textContent = text;
    window.dispatchEvent(new CustomEvent('camera-status', { detail: text }));

    const lower = String(text).toLowerCase();
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
      console.error('No se pudo abrir la camara:', err);
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
      console.error(`No se pudo cambiar a camara ${cameraLabel}:`, err);
      setStatus(`No se pudo acceder a camara ${cameraLabel}. Dispositivo no disponible.`);
      toggleCameraBtn.disabled = false;
      try {
        await startCamera(prevFacingMode);
      } catch (backErr) {
        console.error('Error restaurando camara anterior:', backErr);
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

      imageConfig.processForPrint(video, canvas);

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

  if (startCamBtn) startCamBtn.addEventListener('click', startCamera);
  if (stopCamBtn) stopCamBtn.addEventListener('click', stopCamera);
  if (toggleCameraBtn) toggleCameraBtn.addEventListener('click', toggleCamera);
  takePhotoBtn.addEventListener('click', takePhoto);
  window.addEventListener('pagehide', stopCamera);

  startCamera().catch((err) => {
    console.error('Error al iniciar camara:', err);
    if (toggleCameraBtn) toggleCameraBtn.disabled = true;
  });
}
