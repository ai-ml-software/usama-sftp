"""Temporary test servers; listen on loopback and confine files to the test run."""
import datetime
import base64
import hashlib
import ipaddress
import json
import logging
import os
from pathlib import Path
import socket
import sys
import threading
import time

import paramiko
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler, TLS_FTPHandler
from pyftpdlib.ioloop import IOLoop
from pyftpdlib.servers import FTPServer

logging.basicConfig(level=logging.ERROR)
run_root = Path(sys.argv[1]).resolve()
ssh_root = run_root / 'remote-sftp'
ssh_root.mkdir(parents=True, exist_ok=True)
client_key = paramiko.RSAKey.generate(2048)
client_key_path = run_root / 'client-key.pem'
client_key.write_private_key_file(str(client_key_path), password='fixture-passphrase')
native_key_path = run_root / 'native-client-key.pem'
client_key.write_private_key_file(str(native_key_path))

class Auth(paramiko.ServerInterface):
    def get_allowed_auths(self, username):
        return 'password,publickey'

    def check_auth_publickey(self, username, key):
        return paramiko.AUTH_SUCCESSFUL if username == 'fixture' and key == client_key else paramiko.AUTH_FAILED

    def check_auth_password(self, username, password):
        return paramiko.AUTH_SUCCESSFUL if (username, password) == ('fixture', 'fixture') else paramiko.AUTH_FAILED

    def check_channel_request(self, kind, chanid):
        return paramiko.OPEN_SUCCEEDED if kind == 'session' else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED

class Handle(paramiko.SFTPHandle):
    def write(self, offset, data):
        if 'slow-transfer' in self.filename:
            time.sleep(0.01)
        return super().write(offset, data)
    def stat(self):
        return paramiko.SFTPAttributes.from_stat(os.fstat(self.stream.fileno()))

    def chattr(self, attr):
        if attr.st_atime is not None and attr.st_mtime is not None:
            os.utime(self.filename, (attr.st_atime, attr.st_mtime))
        return paramiko.SFTP_OK

class Files(paramiko.SFTPServerInterface):
    def local(self, remote):
        target = (ssh_root / remote.lstrip('/').replace('\\', '/')).resolve()
        if not target.is_relative_to(ssh_root):
            raise PermissionError('outside fixture root')
        return target

    def stat(self, remote):
        try:
            return paramiko.SFTPAttributes.from_stat(self.local(remote).stat())
        except OSError as error:
            return paramiko.SFTPServer.convert_errno(error.errno or 13)

    def lstat(self, remote):
        try:
            return paramiko.SFTPAttributes.from_stat(self.local(remote).lstat())
        except OSError as error:
            return paramiko.SFTPServer.convert_errno(error.errno or 13)

    def list_folder(self, remote):
        try:
            entries = []
            for entry in self.local(remote).iterdir():
                attr = paramiko.SFTPAttributes.from_stat(entry.stat())
                attr.filename = entry.name
                entries.append(attr)
            return entries
        except OSError as error:
            return paramiko.SFTPServer.convert_errno(error.errno or 13)

    def open(self, remote, flags, attr):
        try:
            target = self.local(remote)
            descriptor = os.open(target, flags | os.O_BINARY, 0o666)
            mode = 'r+b' if flags & os.O_RDWR else 'wb' if flags & os.O_WRONLY else 'rb'
            stream = os.fdopen(descriptor, mode, buffering=0)
            handle = Handle(flags)
            handle.stream = stream
            handle.filename = str(target)
            handle.readfile = stream
            handle.writefile = stream
            return handle
        except OSError as error:
            return paramiko.SFTPServer.convert_errno(error.errno or 13)

    def operation(self, callback):
        try:
            callback()
            return paramiko.SFTP_OK
        except OSError as error:
            return paramiko.SFTPServer.convert_errno(error.errno or 13)

    def mkdir(self, remote, attr):
        return self.operation(lambda: self.local(remote).mkdir())

    def remove(self, remote):
        return self.operation(lambda: self.local(remote).unlink())

    def rmdir(self, remote):
        return self.operation(lambda: self.local(remote).rmdir())

    def rename(self, source, destination):
        return self.operation(lambda: self.local(source).rename(self.local(destination)))

    def posix_rename(self, source, destination):
        return self.operation(lambda: self.local(source).replace(self.local(destination)))

    def chattr(self, remote, attr):
        def change():
            if attr.st_atime is not None and attr.st_mtime is not None:
                os.utime(self.local(remote), (attr.st_atime, attr.st_mtime))
        return self.operation(change)

host_key = paramiko.RSAKey.generate(2048)
ssh_socket = socket.socket()
ssh_socket.bind(('127.0.0.1', 0))
ssh_socket.listen(10)
(run_root / 'native-known-hosts').write_text('[127.0.0.1]:' + str(ssh_socket.getsockname()[1]) + ' ' + host_key.get_name() + ' ' + host_key.get_base64() + '\n')

def ssh_session(connection):
    transport = paramiko.Transport(connection)
    transport.add_server_key(host_key)
    class NativeSFTP(paramiko.SFTPServer):
        def finish_subsystem(self):
            try:
                self.sock.send_exit_status(0)
            except (OSError, EOFError):
                pass
            super().finish_subsystem()
    transport.set_subsystem_handler('sftp', NativeSFTP, Files)
    try:
        transport.start_server(server=Auth())
        while transport.is_active():
            time.sleep(0.1)
    except (paramiko.SSHException, EOFError, ConnectionResetError):
        pass
    finally:
        transport.close()

def accept_ssh():
    while True:
        connection, _ = ssh_socket.accept()
        threading.Thread(target=ssh_session, args=(connection,), daemon=True).start()

threading.Thread(target=accept_ssh, daemon=True).start()

tls_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Usama SFTP loopback fixture')])
now = datetime.datetime.now(datetime.timezone.utc)
cert = (x509.CertificateBuilder().subject_name(subject).issuer_name(subject)
        .public_key(tls_key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=1)).not_valid_after(now + datetime.timedelta(days=1))
        .add_extension(x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(tls_key, hashes.SHA256()))
pem = cert.public_bytes(serialization.Encoding.PEM).decode()
cert_path = run_root / 'loopback-cert.pem'
key_path = run_root / 'loopback-key.pem'
cert_path.write_text(pem)
key_path.write_bytes(tls_key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                                         serialization.NoEncryption()))

servers = [{'protocol': 'sftp', 'name': 'sftp', 'port': ssh_socket.getsockname()[1]}]
class ImplicitTLS(TLS_FTPHandler):
    def on_connect(self):
        self.secure_connection(self.ssl_context)

for name, base_handler in [('ftp', FTPHandler), ('ftps', TLS_FTPHandler), ('implicit-ftps', ImplicitTLS)]:
    remote = run_root / ('remote-' + name)
    remote.mkdir(exist_ok=True)
    authorizer = DummyAuthorizer()
    authorizer.add_user('fixture', 'fixture', str(remote), perm='elradfmwMT')
    handler = type(name + 'Handler', (base_handler,), {'authorizer': authorizer})
    if name != 'ftp':
        handler.certfile, handler.keyfile = str(cert_path), str(key_path)
        handler.tls_control_required = True
        handler.tls_data_required = True
    server = FTPServer(('127.0.0.1', 0), handler, ioloop=IOLoop())
    threading.Thread(target=server.serve_forever, kwargs={'timeout': 0.1, 'handle_exit': False}, daemon=True).start()
    config = {'name': name, 'protocol': 'ftp', 'port': server.socket.getsockname()[1]}
    if name != 'ftp':
        config.update(protocol='ftps', caPath=str(cert_path), implicitTls=name == 'implicit-ftps')
    servers.append(config)

for config in servers:
    config.update(host='127.0.0.1', username='fixture', password='fixture', context=config['name'],
                  remotePath='/', uploadOnSave=False, ignore=['**/.vscode/**', '**/.git/**'])
    if config['protocol'] == 'sftp':
        config['hostFingerprint'] = 'SHA256:' + base64.b64encode(hashlib.sha256(host_key.asbytes()).digest()).decode().rstrip('=')
        config['fixturePrivateKey'] = str(client_key_path)
    local = run_root / 'workspace' / config['name']
    local.mkdir(parents=True, exist_ok=True)
    (local / 'upload.txt').write_text('Usama SFTP ' + config['name'] + '\n', encoding='utf8')
    (run_root / ('remote-' + config['name']) / 'download.txt').write_text('Remote ' + config['name'] + '\n', encoding='utf8')

config_file = run_root / 'server-configs.json'
config_file.write_text(json.dumps(servers), encoding='utf8')
print(json.dumps({'ready': True, 'configFile': str(config_file)}), flush=True)
while True:
    time.sleep(1)
