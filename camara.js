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
    let currentFacingMode = 'environment'; // 'environment' (trasera) o 'user' (frontal)
    const toggleCameraBtn = document.getElementById('toggleCamera');
  
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
      } else if (lower.includes('cámara abierta')) {
        setArcadeState('READY', 'ready');
      } else if (lower.includes('detenida')) {
        setArcadeState('SLEEP', 'idle');
      }
    }
  
    async function startCamera(facingModeOrEvent = 'environment') {
      try {
        // Soportar ambos: llamadas directas y eventos de click
        let facingMode = 'environment';
        if (typeof facingModeOrEvent === 'string') {
          facingMode = facingModeOrEvent;
        } else if (facingModeOrEvent && facingModeOrEvent.preventDefault) {
          // Es un evento, usar el facing mode actual
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
        setStatus(`Cámara ${cameraLabel} abierta. Presiona "Tomar foto".`);
      } catch (err) {
        console.error('No se pudo abrir la cámara:', err);
        const modeStr = typeof facingModeOrEvent === 'string' ? facingModeOrEvent : 'trasera';
        const cameraLabel = modeStr === 'user' ? 'frontal' : 'trasera';
        setStatus(`No se pudo abrir cámara ${cameraLabel}. Usa "Subir foto" como fallback.`);
        throw err;
      }
    }

    async function toggleCamera() {
      if (!stream) return;
      
      toggleCameraBtn.disabled = true;
      const prevFacingMode = currentFacingMode;
      const newFacingMode = prevFacingMode === 'environment' ? 'user' : 'environment';
      const cameraLabel = newFacingMode === 'user' ? 'frontal' : 'trasera';
      
      setStatus(`Cambiando a cámara ${cameraLabel}...`);
      
      // Detener la cámara actual
      const tracks = stream.getTracks();
      tracks.forEach(t => t.stop());
      stream = null;
      video.srcObject = null;
      
      // Iniciar la nueva cámara con mejor manejo de errores
      try {
        await startCamera(newFacingMode);
      } catch (err) {
        console.error(`No se pudo cambiar a cámara ${cameraLabel}:`, err);
        setStatus(`No se pudo acceder a cámara ${cameraLabel}. Dispositivo no disponible.`);
        toggleCameraBtn.disabled = false;
        // Intentar volver a la cámara anterior
        try {
          await startCamera(prevFacingMode);
        } catch (backErr) {
          console.error('Error restaurando cámara anterior:', backErr);
          setStatus('Error de cámara. Por favor recarga la página.');
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
      setStatus('Cámara detenida.');
    }
  
    function imageToGrayscaleAndResize(imgOrVideo) {
      const targetW = 384, targetH = 256;
      const tmp = document.createElement('canvas');
      tmp.width = targetW;
      tmp.height = targetH;
      const tctx = tmp.getContext('2d');
  
      let sw, sh;
      if (imgOrVideo instanceof HTMLVideoElement) {
        sw = imgOrVideo.videoWidth;
        sh = imgOrVideo.videoHeight;
      } else {
        sw = imgOrVideo.naturalWidth;
        sh = imgOrVideo.naturalHeight;
      }
      if (!sw || !sh) {
        tctx.drawImage(imgOrVideo, 0, 0, targetW, targetH);
      } else if (imgOrVideo instanceof HTMLVideoElement && printTarget) {
        const videoRect = imgOrVideo.getBoundingClientRect();
        const targetRect = printTarget.getBoundingClientRect();

        // Mapeo exacto de la zona objetivo (overlay) a pixeles reales del frame del video.
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

        // Clamp para evitar salirse del frame fuente.
        sx = Math.max(0, Math.min(sw - 1, sx));
        sy = Math.max(0, Math.min(sh - 1, sy));
        sWidth = Math.max(1, Math.min(sw - sx, sWidth));
        sHeight = Math.max(1, Math.min(sh - sy, sHeight));

        tctx.drawImage(imgOrVideo, sx, sy, sWidth, sHeight, 0, 0, targetW, targetH);
      } else {
        const scale = Math.max(targetW / sw, targetH / sh);
        const drawW = sw * scale;
        const drawH = sh * scale;
        const dx = (targetW - drawW) / 2;
        const dy = (targetH - drawH) / 2;
        tctx.drawImage(imgOrVideo, dx, dy, drawW, drawH);
      }
  
      const imgData = tctx.getImageData(0, 0, targetW, targetH);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = Math.round(0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]);
        d[i] = d[i+1] = d[i+2] = lum;
      }
      tctx.putImageData(imgData, 0, 0);
  
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(tmp, 0, 0);
    }

    async function takePhoto() {
      setStatus('Procesando imagen...');
      takePhotoBtn.disabled = true;
      if (stream && video.readyState >= 2) {
        if (flashFx) {
          flashFx.classList.add('active');
          setTimeout(() => flashFx.classList.remove('active'), 180);
        }

        imageToGrayscaleAndResize(video);
        const encoder = new window.ReceiptPrinterEncoder();
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        setArcadeState('PRINTING...', 'busy');
        const data = encoder
          .initialize()
          .image(imageData, canvas.width, canvas.height, "atkinson")
          .newline()
          .newline()
          .encode();
        await writeEscPos(data);
        setStatus('Impresión finalizada.');
        setArcadeState('READY', 'ready');
      } else {
        setStatus('Cámara no disponible. Por favor sube una foto.');
      }

      takePhotoBtn.disabled = false;
    }
  
    if (startCamBtn) startCamBtn.addEventListener('click', startCamera);
    if (stopCamBtn) stopCamBtn.addEventListener('click', stopCamera);
    if (toggleCameraBtn) toggleCameraBtn.addEventListener('click', toggleCamera);
    takePhotoBtn.addEventListener('click', takePhoto);
    window.addEventListener('pagehide', stopCamera);

    // Iniciar automaticamente la camara para flujo rapido en mobile.
    startCamera().catch(err => {
      console.error('Error al iniciar cámara:', err);
      if (toggleCameraBtn) toggleCameraBtn.disabled = true;
    });
}
  