// camara.js
const video = document.getElementById('video');
const startCamBtn = document.getElementById('startCam');
const takePhotoBtn = document.getElementById('takePhoto');
const stopCamBtn = document.getElementById('stopCam');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
const logoLudineta = document.getElementById('logo');

function initCameraUploader() {
  
    let stream = null;
  
    function setStatus(s) { status.textContent = s; }
  
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        video.srcObject = stream;
        video.style.display = 'block';
        startCamBtn.disabled = true;
        takePhotoBtn.disabled = false;
        stopCamBtn.disabled = false;
        setStatus('Cámara abierta. Presiona "Tomar foto".');
      } catch (err) {
        console.error('No se pudo abrir la cámara:', err);
        setStatus('No se pudo abrir la cámara. Usa "Subir foto" como fallback.');
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
      startCamBtn.disabled = false;
      takePhotoBtn.disabled = true;
      stopCamBtn.disabled = true;
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

    function combinarCanvasYLogo(canvas, logo) {
      // Usar dimensiones reales del logo
      const logoAncho = logo.naturalWidth;
      const logoAlto = logo.naturalHeight;
    
      // Altura total = alto del logo + alto del canvas
      const nuevoAlto = logoAlto + canvas.height;
      const nuevoAncho = Math.max(logoAncho, canvas.width);
    
      // Crear/usar un nuevo canvas
      const nuevoCanvas = document.createElement("canvas");
      nuevoCanvas.width = nuevoAncho;
      nuevoCanvas.height = nuevoAlto;
      const ctx = nuevoCanvas.getContext("2d");
    
      // Dibujar logo arriba
      ctx.drawImage(logo, 0, 0, logoAncho, logoAlto);
    
      // Dibujar canvas original debajo
      ctx.drawImage(canvas, 0, logoAlto);
    
      return nuevoCanvas;
    }
  
    async function takePhoto() {
      setStatus('Procesando imagen...');
      takePhotoBtn.disabled = true;
      if (stream && video.readyState >= 2) {
        imageToGrayscaleAndResize(video);
        const encoder = new window.ReceiptPrinterEncoder();

        const combinado = combinarCanvasYLogo(canvas, logoLudineta);
        const ctxCombinado = combinado.getContext('2d');
        const imageData = ctxCombinado.getImageData(0, 0, combinado.width, combinado.height);

        console.log(combinado.width, combinado.height);

        const data = encoder
          .initialize()
          .image(imageData, combinado.width, combinado.height, "atkinson")
          .newline()
          .newline()
          .encode();
        await writeEscPos(data);
      } else {
        setStatus('Cámara no disponible. Por favor sube una foto.');
      }

      takePhotoBtn.disabled = false;
    }
  
    startCamBtn.addEventListener('click', startCamera);
    stopCamBtn.addEventListener('click', stopCamera);
    takePhotoBtn.addEventListener('click', takePhoto);
    window.addEventListener('pagehide', stopCamera);
}
  