Crear archivos para SSL

openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout key.pem -out cert.pem

Ejecutar servidor HTTPS

python main.py

Notas PWA

- La app usa `manifest.json` y `service-worker.js`.
- El boton `Instalar app` aparece cuando el navegador emite `beforeinstallprompt`.
- Para probar offline: abre la app una vez con internet, luego recarga sin conexion.
