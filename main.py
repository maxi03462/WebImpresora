import http.server
import ssl
import sys
from pathlib import Path


def get_ssl_context(certfile, keyfile):
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(certfile, keyfile)
    context.set_ciphers("@SECLEVEL=1:ALL")
    return context


class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers["Content-Length"])
        post_data = self.rfile.read(content_length)
        print(post_data.decode("utf-8"))


def ensure_tls_files_exist(certfile, keyfile):
    cert_path = Path(certfile)
    key_path = Path(keyfile)
    if cert_path.exists() and key_path.exists():
        return

    print("Faltan archivos TLS para iniciar HTTPS.")
    if not cert_path.exists():
        print(f"- No existe: {cert_path}")
    if not key_path.exists():
        print(f"- No existe: {key_path}")

    print("\nGenera un certificado autofirmado con:")
    print(
        "openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes "
        f"-keyout {key_path} -out {cert_path} "
        "-subj '/CN=localhost'"
    )
    print("\nLuego vuelve a ejecutar: python main.py")
    sys.exit(1)


server_address = ('', 5000)
httpd = http.server.HTTPServer(server_address, MyHandler)

cert_file = "cert.pem"
key_file = "key.pem"

ensure_tls_files_exist(cert_file, key_file)
context = get_ssl_context(cert_file, key_file)
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

httpd.serve_forever()
