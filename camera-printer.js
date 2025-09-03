// camera-printer.js

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const startCamBtn = document.getElementById("startCam");
const takePhotoBtn = document.getElementById("takePhoto");
const stopCamBtn = document.getElementById("stopCam");
const btnConnect = document.getElementById("btnConnect");
const btnDisconnect = document.getElementById("btnDisconnect");
const statusEl = document.getElementById("status");

let stream = null;
let device = null;
let server = null;
let service = null;
let characteristic = null;

const KNOWN_SERVICES = [
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
  0xffe0,
  0xffe5,
  0x18f0,
];

// Calculamos dimensiones "seguras" (múltiplos de 8)
const safeWidth = Math.floor(canvas.width / 8) * 8;
const safeHeight = Math.floor(canvas.height / 8) * 8;
canvas.width = safeWidth;
canvas.height = safeHeight;

// === Cámara ===
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.style.display = "block";
    takePhotoBtn.disabled = false;
    stopCamBtn.disabled = false;
  } catch (err) {
    console.error("Error al iniciar cámara", err);
    statusEl.textContent = "Error al iniciar cámara.";
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    video.style.display = "none";
    takePhotoBtn.disabled = true;
    stopCamBtn.disabled = true;
  }
}

function takePhoto() {
  // Dibujar en canvas sin deformar: mantener aspecto y recortar el exceso
  const videoAspect = video.videoWidth / video.videoHeight;
  const canvasAspect = canvas.width / canvas.height;

  let sx, sy, sWidth, sHeight;
  if (videoAspect > canvasAspect) {
    // Video más ancho → recortar laterales
    sHeight = video.videoHeight;
    sWidth = sHeight * canvasAspect;
    sx = (video.videoWidth - sWidth) / 2;
    sy = 0;
  } else {
    // Video más alto → recortar arriba/abajo
    sWidth = video.videoWidth;
    sHeight = sWidth / canvasAspect;
    sx = 0;
    sy = (video.videoHeight - sHeight) / 2;
  }

  ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
}

// === BLE Impresora ===
async function connectPrinter() {
  try {
    statusEl.textContent = "Buscando impresora...";
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true
    });

    device.addEventListener("gattserverdisconnected", onDisconnected);

    server = await device.gatt.connect();
    for (let svc of KNOWN_SERVICES) {
      try {
        service = await server.getPrimaryService(svc);
        break;
      } catch {}
    }

    if (!service) throw new Error("Servicio no encontrado");

    const characteristics = await service.getCharacteristics();
    characteristic = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
    if (!characteristic) throw new Error("No se encontró característica de escritura");

    statusEl.textContent = "Impresora conectada.";
    btnDisconnect.disabled = false;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error al conectar: " + err.message;
  }
}

function onDisconnected() {
  statusEl.textContent = "Impresora desconectada.";
  btnDisconnect.disabled = true;
}

async function disconnectPrinter() {
  if (device && device.gatt.connected) {
    await device.gatt.disconnect();
  }
}

// === Imprimir ===
async function printCanvas() {
  if (!characteristic) {
    statusEl.textContent = "Impresora no conectada.";
    return;
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const encoder = new window.ReceiptPrinterEncoder();
  const data = encoder
    .initialize()
    .image(imageData, canvas.width, canvas.height, "atkinson")
    .newline()
    .encode();

  // Enviar en chunks de 20 bytes (BLE limit)
  let i = 0;
  while (i < data.length) {
    const chunk = data.slice(i, i + 20);
    await characteristic.writeValue(chunk);
    i += 20;
  }

  statusEl.textContent = "Impresión enviada.";
}

// === Eventos ===
startCamBtn.addEventListener("click", startCamera);
stopCamBtn.addEventListener("click", stopCamera);
takePhotoBtn.addEventListener("click", () => {
  takePhoto();
  printCanvas();
});
btnConnect.addEventListener("click", connectPrinter);
btnDisconnect.addEventListener("click", disconnectPrinter);
