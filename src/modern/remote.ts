import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Readable, Writable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { Client as FtpClient } from 'basic-ftp';
import { ConfigStore, expand } from './config';
import { Entry, Target, remoteFile, relativeName, childName } from './model';
const SshClient = require('ssh2').Client;

export class Remote {
  private ssh: any; private sftp: any; private ftp?: FtpClient;
  private signal?: AbortSignal; private abort = () => this.close();
  constructor(readonly store: ConfigStore, readonly target: Target) {}
  async connect(signal?: AbortSignal, secrets: any = {}) {
    if (this.target.protocol === 'git') throw new Error('This is a Git repository connection. Connect to open its separate local checkout.');
    this.signal = signal;
    if (signal?.aborted) throw new Error('Transfer cancelled.');
    signal?.addEventListener('abort', this.abort, { once: true });
    const t = this.target;
    const password = secrets.password || await this.store.secret(t, 'password');
    if (t.protocol !== 'sftp') {
      this.ftp = new FtpClient(20000);
      await this.ftp.access({ host: t.host, port: t.port, user: t.username, password,
        secure: t.protocol === 'ftps' ? t.implicitTls ? 'implicit' : true : false,
        secureOptions: { rejectUnauthorized: true, ca: t.caPath ? await fs.promises.readFile(expand(t.caPath)) : undefined } });
      return this;
    }
    this.ssh = new SshClient();
    const trustKey = `host:${t.host}:${t.port}`;
    const options: any = { host: t.host, port: t.port, username: t.username, readyTimeout: 20000, hostHash: 'sha256',
      hostVerifier: (hex: string, callback: (trusted: boolean) => void) => {
        const fingerprint = 'SHA256:' + Buffer.from(hex, 'hex').toString('base64').replace(/=+$/, '');
        const pinned = t.hostFingerprint || this.store.context.globalState.get<string>(trustKey);
        if (pinned) { callback(pinned === fingerprint); return; }
        vscode.window.showWarningMessage(`Trust SSH host ${t.host}:${t.port}? Fingerprint ${fingerprint}`, { modal: true }, 'Trust Host').then(async choice => {
          if (choice === 'Trust Host') { await this.store.context.globalState.update(trustKey, fingerprint); callback(true); } else callback(false);
        }, () => callback(false));
      } };
    if (t.auth === 'key') {
      if (!t.privateKeyPath) throw new Error('Select a private key file.');
      options.privateKey = await fs.promises.readFile(expand(t.privateKeyPath));
      options.passphrase = secrets.passphrase || await this.store.secret(t, 'passphrase');
    } else if (t.auth === 'agent') options.agent = process.env.SSH_AUTH_SOCK || (process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : undefined);
    else options.password = password;
    await new Promise<void>((resolve, reject) => {
      this.ssh.once('error', reject).once('close', () => reject(new Error('SSH connection closed.'))).once('ready', () => {
        this.ssh.sftp((error: Error, sftp: any) => { if (error) reject(error); else { this.sftp = sftp; resolve(); } });
      }).connect(options);
    });
    return this;
  }
  private call(method: string, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => this.sftp[method](...args, (error: Error, value: any) => error ? reject(error) : resolve(value)));
  }
  private async safeParents(name: string) {
    let current = '';
    for (const part of relativeName(name).split('/').slice(0, -1)) {
      current = current ? current + '/' + part : part;
      const entry = await this.stat(current);
      if (!entry.directory || entry.symlink) throw new Error('Remote symbolic links are excluded from transfers.');
    }
  }
  async list(name = ''): Promise<Entry[]> {
    if (name) await this.safeParents(name + '/child');
    const file = remoteFile(this.target, name);
    const entries: Entry[] = this.ftp ? (await this.ftp.list(file)).map(x => ({ name: x.name, directory: x.isDirectory, symlink: x.isSymbolicLink, size: x.size, mtime: x.modifiedAt?.getTime() || 0 })) : (await this.call('readdir', file)).map(x => ({ name: x.filename, directory: x.attrs.isDirectory(), symlink: x.attrs.isSymbolicLink(), size: x.attrs.size, mtime: x.attrs.mtime * 1000 }));
    return entries.filter(x => x.name !== '.' && x.name !== '..').map(x => ({ ...x, name: childName(x.name) }));
  }
  async stat(name: string): Promise<Entry> {
    if (this.ftp) {
      if (!name) return { name: '', directory: true, symlink: false, size: 0, mtime: 0 };
      const found = (await this.list(path.posix.dirname(name) === '.' ? '' : path.posix.dirname(name))).find(x => x.name === path.posix.basename(name));
      if (!found) throw vscode.FileSystemError.FileNotFound(name); return found;
    }
    const attrs = await this.call('lstat', remoteFile(this.target, name));
    return { name, directory: attrs.isDirectory(), symlink: attrs.isSymbolicLink(), size: attrs.size, mtime: attrs.mtime * 1000 };
  }
  async mkdir(name: string) {
    let current = '';
    for (const part of name.split('/').filter(Boolean)) {
      current = current ? current + '/' + part : part;
      try { const entry = await this.stat(current); if (!entry.directory || entry.symlink) throw new Error('Parent is not a regular directory.'); }
      catch (error) { if (error.code !== 2 && error.code !== 'FileNotFound') throw error; if (this.ftp) await this.ftp.send('MKD ' + remoteFile(this.target, current)); else await this.call('mkdir', remoteFile(this.target, current)); }
    }
  }
  async rename(oldName: string, newName: string) {
    if (!oldName || !newName) throw new Error('Cannot rename the server root.');
    await this.safeParents(oldName); await this.safeParents(newName);
    try { await this.stat(newName); } catch (error) { if (error.code === 2 || error.code === 'FileNotFound') { if (this.ftp) return this.ftp.rename(remoteFile(this.target, oldName), remoteFile(this.target, newName)); return this.call('rename', remoteFile(this.target, oldName), remoteFile(this.target, newName)); } throw error; }
    throw new Error('Destination already exists.');
  }
  async remove(name: string, recursive = false) {
    if (!name) throw new Error('Cannot delete the server root.');
    await this.safeParents(name);
    const entry = await this.stat(name);
    if (entry.directory && !entry.symlink) {
      if (recursive) for (const child of await this.list(name)) await this.remove(path.posix.join(name, child.name), true);
      if (this.ftp) await this.ftp.send(`RMD ${remoteFile(this.target, name)}`); else await this.call('rmdir', remoteFile(this.target, name));
    } else if (this.ftp) await this.ftp.remove(remoteFile(this.target, name)); else await this.call('unlink', remoteFile(this.target, name));
  }
  async read(name: string): Promise<Buffer> {
    const chunks: Buffer[] = []; let size = 0;
    const sink = new Writable({ write(chunk, encoding, callback) { size += chunk.length; if (size > 64 * 1024 * 1024) callback(new Error('Use Download for files larger than 64 MB.')); else { chunks.push(Buffer.from(chunk)); callback(); } } });
    await this.download(name, sink); return Buffer.concat(chunks);
  }
  async digest(name: string) {
    const digest = require('crypto').createHash('sha256'); const entry = await this.stat(name);
    const sink = new Writable({ write(chunk, encoding, callback) { digest.update(chunk); callback(); } });
    await this.download(name, sink); return { hash: digest.digest('hex'), mtime: entry.mtime, size: entry.size };
  }
  async download(name: string, sink: Writable, progress?: (bytes: number, total?: number) => void) {
    await this.safeParents(name);
    const entry = await this.stat(name); if (entry.directory || entry.symlink) throw new Error('Choose a regular file.');
    if (this.ftp) { this.ftp.trackProgress(info => progress?.(info.bytesOverall, entry.size)); await this.ftp.downloadTo(sink, remoteFile(this.target, name)); return; }
    let bytes = 0;
    const meter = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; progress?.(bytes, entry.size); callback(null, chunk); } });
    await pipeline(this.sftp.createReadStream(remoteFile(this.target, name)), meter, sink, { signal: this.signal });
  }
  async upload(name: string, source: Readable, size: number, progress?: (bytes: number, total?: number) => void) {
    await this.mkdir(path.posix.dirname(name) === '.' ? '' : path.posix.dirname(name));
    await this.safeParents(name);
    // Upload beside the destination, then rename, so cancellation never leaves a partial destination.
    const temporary = name + '.usama-' + require('crypto').randomBytes(6).toString('hex') + '.tmp';
    try {
      if (this.ftp) { this.ftp.trackProgress(info => progress?.(info.bytesOverall, size)); await this.ftp.uploadFrom(source, remoteFile(this.target, temporary)); await this.replace(temporary, name); }
      else {
        let bytes = 0;
        const meter = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; progress?.(bytes, size); callback(null, chunk); } });
        await pipeline(source, meter, this.sftp.createWriteStream(remoteFile(this.target, temporary)), { signal: this.signal });
        if (this.signal?.aborted) throw new Error('Transfer cancelled.');
        // OpenSSH supports atomic replacement; portable fallback preserves transfer compatibility.
        if (this.sftp.ext_openssh_rename) { try { await this.call('ext_openssh_rename', remoteFile(this.target, temporary), remoteFile(this.target, name)); return; } catch (error) { if (error.code !== 8 && !error.message.includes('does not support')) throw error; } }
        await this.replace(temporary, name);
      }
    } catch (error) {
      source.destroy();
      this.close();
      // A cancelled connection cannot remove its temporary upload. Reconnect only to clean that exact file.
      const cleaner = new Remote(this.store, this.target);
      try {
        await cleaner.connect();
        // Some servers need time to release the canceled writer before deleting its temporary file.
        for (let attempt = 0; attempt < 8; attempt++) {
          try { await cleaner.remove(temporary); break; }
          catch (cleanupError) {
            if (cleanupError.code === 2 || cleanupError.code === 'FileNotFound') break;
            if (attempt === 7) throw cleanupError;
            await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
          }
        }
      } catch (_) {} finally { cleaner.close(); }
      throw error;
    }
  }
  private async replace(temporary: string, name: string) {
    const rename = (a: string, b: string) => this.ftp ? this.ftp.rename(remoteFile(this.target, a), remoteFile(this.target, b)) : this.call('rename', remoteFile(this.target, a), remoteFile(this.target, b));
    const backup = temporary + '.backup'; let existing = false;
    try { const entry = await this.stat(name); if (entry.directory || entry.symlink) throw new Error('Cannot replace a directory or symbolic link.'); existing = true; }
    catch (error) { if (error.code !== 2 && error.code !== 'FileNotFound') throw error; }
    if (existing) await rename(name, backup);
    try { await rename(temporary, name); } catch (error) { if (existing) await rename(backup, name); throw error; }
    if (existing) await this.remove(backup);
  }
  close() { this.signal?.removeEventListener('abort', this.abort); this.ftp?.close(); this.ssh?.end(); this.sftp = undefined; }
}
