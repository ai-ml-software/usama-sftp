import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Server, Target, hash } from './model';
import { repositoryUrl } from './checkout';

export function expand(file: string) { return file.startsWith('~') ? path.join(os.homedir(), file.slice(1)) : file; }
export class ConfigStore {
  targets: Target[] = [];
  activeKey = '';
  readonly changed = new vscode.EventEmitter<void>();
  private pending: Promise<any> = Promise.resolve();
  private transact<T>(fn: () => Promise<T>): Promise<T> { const work = this.pending.then(fn); this.pending = work.catch(() => undefined); return work; }
  constructor(readonly context: vscode.ExtensionContext) {}
  secretKey(t: Target, field: string) { return `usama:${t.key}:${field}`; }
  async secret(t: Target, field: string) { return this.context.secrets.get(this.secretKey(t, field)); }
  async setSecret(t: Target, field: string, value: string) { await this.context.secrets.store(this.secretKey(t, field), value); }
  target(workspace: string, raw: any, index = 0): Target {
    const protocol = raw.protocol === 'ftps' || raw.protocol === 'ftp' && raw.secure ? 'ftps' : raw.protocol || 'sftp';
    if (protocol === 'git') {
      const url = repositoryUrl(raw.repositoryUrl || '');
      const id = raw.id || hash(`${raw.name || ''}:${url}:${index}`).slice(0, 16);
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Connection ID must contain only letters, numbers, _ and -.');
      const localPath = raw.localPath || `.usama-remote/${id}`;
      const localRoot = path.resolve(workspace, expand(localPath)), relative = path.relative(workspace, localRoot);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Choose a separate checkout folder inside this workspace.');
      const branch = raw.branch || 'main';
      if (typeof branch !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.includes('..')) throw new Error('Enter a valid Git branch name.');
      return { id, key: hash(workspace.toLowerCase() + ':' + id).slice(0, 24), workspace, name: raw.name || id,
        protocol: 'git', repositoryUrl: url, branch, host: new URL(url).hostname, port: 443, username: 'git', auth: 'agent',
        remotePath: '/', localPath, localRoot, uploadOnSave: false, ignore: Array.isArray(raw.ignore) ? raw.ignore : [] };
    }
    if (!['sftp', 'ftp', 'ftps'].includes(protocol)) throw new Error('Choose SFTP, FTP, FTPS or Git repository (HTTPS).');
    if (typeof raw.host !== 'string' || !raw.host.trim() || /[\x00-\x20]/.test(raw.host)) throw new Error('A valid server host is required.');
    const remotePath = raw.remotePath || '/';
    if (!remotePath.startsWith('/') || remotePath.split('/').includes('..')) throw new Error('Remote folder must be an absolute path without ..');
    const id = raw.id || hash(`${raw.name || ''}:${raw.host}:${index}`).slice(0, 16);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Server ID must contain only letters, numbers, _ and -.');
    const port = Number(raw.port || (protocol === 'sftp' ? 22 : raw.implicitTls ? 990 : 21));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.');
    const localPath = raw.localPath || raw.context || '.';
    if (!['password', 'key', 'agent'].includes(raw.auth || 'password')) throw new Error('Unknown authentication mode.');
    return { id, key: hash(workspace.toLowerCase() + ':' + id).slice(0, 24), workspace,
      name: raw.name || id, protocol, host: raw.host.trim(), port, username: raw.username || 'anonymous',
      auth: raw.auth || (raw.privateKeyPath ? 'key' : raw.agent ? 'agent' : 'password'), privateKeyPath: raw.privateKeyPath,
      remotePath, localPath, localRoot: path.resolve(workspace, expand(localPath)), uploadOnSave: raw.uploadOnSave === true,
      ignore: Array.isArray(raw.ignore) ? raw.ignore : ['node_modules', '.DS_Store'], implicitTls: !!raw.implicitTls,
      caPath: raw.caPath, hostFingerprint: raw.hostFingerprint };
  }
  serialize(t: Target): Server {
    const { workspace, key, localRoot, ...server } = t;
    if (t.protocol === 'git') return { id: t.id, name: t.name, protocol: 'git', repositoryUrl: t.repositoryUrl,
      branch: t.branch, localPath: t.localPath, uploadOnSave: false, ignore: t.ignore } as Server;
    return server;
  }
  load() { return this.transact(() => this.loadNow()); }
  private async loadNow() {
    const targets: Target[] = [];
    for (const folder of vscode.workspace.workspaceFolders || []) {
      const workspace = folder.uri.fsPath, file = path.join(workspace, '.vscode', 'usama-sftp.json');
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      const rawProfiles = data.profiles && Array.isArray(data.profiles) ? data.profiles : Array.isArray(data) ? data : [data];
      const profiles: Target[] = [];
      for (let i = 0; i < rawProfiles.length; i++) {
        const raw = rawProfiles[i], t = this.target(workspace, raw, i);
        for (const field of ['password', 'passphrase']) if (typeof raw[field] === 'string') await this.setSecret(t, field, raw[field]);
        profiles.push(t);
        if (raw.profiles && !Array.isArray(raw.profiles)) for (const name of Object.keys(raw.profiles)) {
          const merged = { ...raw, ...raw.profiles[name], profiles: undefined, id: `${t.id}-${hash(name).slice(0, 8)}`, name: `${t.name} / ${name}` };
          const child = this.target(workspace, merged, i);
          for (const field of ['password', 'passphrase']) if (typeof merged[field] === 'string') await this.setSecret(child, field, merged[field]);
          profiles.push(child);
        }
      }
      if (new Set(profiles.map(t => t.id)).size !== profiles.length) throw new Error('Server IDs must be unique within a workspace.');
      // Store credentials first; only then remove plaintext from our own configuration.
      if (!data.version || rawProfiles.some(p => p.password !== undefined || p.passphrase !== undefined || p.profiles && !Array.isArray(p.profiles))) {
        await fs.promises.writeFile(file, JSON.stringify({ version: 2, defaultProfile: data.defaultProfile || profiles[0]?.id, profiles: profiles.map(t => this.serialize(t)) }, null, 2) + '\n');
      }
      targets.push(...profiles);
      if (!this.activeKey) this.activeKey = profiles.find(t => t.id === data.defaultProfile)?.key || profiles[0]?.key || '';
    }
    this.targets = targets;
    const stored = this.context.workspaceState.get<string>('activeServer');
    if (stored && targets.some(t => t.key === stored)) this.activeKey = stored;
    if (!targets.some(t => t.key === this.activeKey)) this.activeKey = targets[0]?.key || '';
    this.changed.fire();
  }
  active(): Target { const t = this.targets.find(x => x.key === this.activeKey); if (!t) throw new Error('Add a server in Usama SFTP first.'); return t; }
  get(key: string): Target { const t = this.targets.find(x => x.key === key); if (!t) throw new Error('Server no longer exists.'); return t; }
  async setActive(key: string) { this.get(key); this.activeKey = key; await this.context.workspaceState.update('activeServer', key); this.changed.fire(); }
  save(t: Target, secrets: any = {}) { return this.transact(() => this.saveNow(t, secrets)); }
  private async saveNow(t: Target, secrets: any) {
    for (const field of ['password', 'passphrase']) {
      if (secrets[`clear${field}`]) await this.context.secrets.delete(this.secretKey(t, field));
      else if (secrets[field]) await this.setSecret(t, field, secrets[field]);
    }
    const sameWorkspace = (x: Target) => process.platform === 'win32' ? x.workspace.toLowerCase() === t.workspace.toLowerCase() : x.workspace === t.workspace;
    const profiles = this.targets.filter(x => sameWorkspace(x) && x.id !== t.id).concat(t);
    const dir = path.join(t.workspace, '.vscode'); await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, 'usama-sftp.json'), temporary = file + '.tmp';
    await fs.promises.writeFile(temporary, JSON.stringify({ version: 2, defaultProfile: secrets.defaultServer ? t.id : profiles.find(x => x.key === this.activeKey)?.id || t.id, profiles: profiles.map(x => this.serialize(x)) }, null, 2) + '\n');
    await fs.promises.rename(temporary, file);
    await this.loadNow(); if (secrets.defaultServer) await this.setActive(t.key);
  }
  async importFile(workspace: string, file: string) {
    const data = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    const raws = Array.isArray(data.profiles) ? data.profiles : Array.isArray(data) ? data : [data];
    for (let i = 0; i < raws.length; i++) {
      const raw = raws[i];
      const variants = [raw, ...Object.keys(raw.profiles || {}).map(name => ({ ...raw, ...raw.profiles[name], name: `${raw.name || 'Server'} / ${name}` }))];
      for (const variant of variants) {
        const t = this.target(workspace, { ...variant, id: `import-${hash(JSON.stringify(variant) + file).slice(0, 12)}`, uploadOnSave: false }, i);
        await this.save(t, variant);
      }
    }
  }
}
