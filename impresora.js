// impresora.js

/* Variables impresora */
let device = null;
let server = null;
let writeCharacteristic = null;
/* END Variables impresora END */

function initImpresora() {
    //import ReceiptPrinterEncoder from "dist/receipt-printer-encoder.umd.js";

    const btnConnect = document.getElementById('btnConnect');
    const btnDisconnect = document.getElementById('btnDisconnect');
    const logEl = document.getElementById('log');

    const KNOWN_SERVICES = [
        // Nordic UART Service (NUS)
        '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
        // East-Asia BLE printers often use custom FFE0/FFE5
        0xffe0,
        0xffe5,
        // Some ESC/POS BLE bridges use 0x18F0/0x2AF1
        0x18f0,
        // Others vendor services can be discovered dynamically
    ];

    function log(msg, cls = '') {
        const p = document.createElement('div');
        p.textContent = msg;
        if (cls) p.classList.add(cls);
        logEl.appendChild(p);
        logEl.scrollTop = logEl.scrollHeight;
    }

    function supportsWebBluetooth() {
        return !!navigator.bluetooth;
    }

    async function connect() {
        if (!supportsWebBluetooth()) {
            log('Este navegador no soporta Web Bluetooth. Usa Chrome/Edge en Android/desktop y habilita Bluetooth.', 'err');
            return;
        }

        try {
            log('Mostrando selector de dispositivos…');
            const filters = [];

            device = await navigator.bluetooth.requestDevice({
                filters: [
                    { name: "BlueTooth Printer" }
                ],
                optionalServices: KNOWN_SERVICES
            });

            log(`Seleccionado: ${device.name || '(sin nombre)'}`, 'ok');

            device.addEventListener('gattserverdisconnected', () => {
                log('Desconectado', 'warn');
                btnDisconnect.disabled = true;
            });

            server = await device.gatt.connect();
            log('GATT conectado', 'ok');

            // Intentar servicios conocidos primero
            for (const svc of KNOWN_SERVICES) {
                try {
                    const service = await server.getPrimaryService(svc);
                    const characteristics = await service.getCharacteristics();
                    for (const ch of characteristics) {
                        if (ch.properties.write || ch.properties.writeWithoutResponse) {
                            writeCharacteristic = ch;
                            break;
                        }
                    }
                    if (writeCharacteristic) break;
                } catch (e) { /* ignorar y seguir */ }
            }

            // Si no se encontró, descubrir todos los servicios y elegir el primer characteristic con write
            if (!writeCharacteristic) {
                const services = await server.getPrimaryServices();
                for (const service of services) {
                    const chs = await service.getCharacteristics();
                    writeCharacteristic = chs.find(c => c.properties.write || c.properties.writeWithoutResponse) || null;
                    if (writeCharacteristic) break;
                }
            }

            if (!writeCharacteristic) {
                throw new Error('No se encontró ningún characteristic de escritura BLE. La impresora puede ser sólo Bluetooth clásico.');
            }

            log('Canal de escritura listo ✅', 'ok');
            btnDisconnect.disabled = false;
        } catch (err) {
            log('Error: ' + err.message, 'err');
            console.error(err);
        }
    }

    async function disconnect() {
        try {
            if (device && device.gatt.connected) {
                device.gatt.disconnect();
                log('Desconectado manualmente');
            }
        } catch (e) {
            log('Error al desconectar: ' + e.message, 'err');
        }
    }

    btnConnect.addEventListener('click', connect);
    btnDisconnect.addEventListener('click', disconnect);

    log("Bluetooth iniciado");
}

async function writeEscPos(data) {
    if (!writeCharacteristic) throw new Error('No hay characteristic de escritura');
    // Dividir en trozos para MTU (~180 bytes típicos)
    const CHUNK = 180;
    for (let i = 0; i < data.length; i += CHUNK) {
        const slice = data.slice(i, i + CHUNK);
        try {
            // Preferir writeWithoutResponse si está disponible
            if (writeCharacteristic.properties && writeCharacteristic.properties.writeWithoutResponse) {
                await writeCharacteristic.writeValueWithoutResponse(slice);
            } else {
                await writeCharacteristic.writeValue(slice);
            }
        } catch (e) {
            // Algunos stacks requieren un pequeño delay entre escrituras
            await new Promise(r => setTimeout(r, 30));
            if (writeCharacteristic.writeValue) await writeCharacteristic.writeValue(slice);
        }
        await new Promise(r => setTimeout(r, 10));
    }
}