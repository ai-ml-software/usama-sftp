import * as vscode from 'vscode';
import { Engine } from './engine';
import { Target, hash, relativeName, localFile } from './model';
export const SCHEME = 'usama-sftp-remote';
export function remoteUri(t: Target, name = '') { return t.protocol === 'git' ? vscode.Uri.file(localFile(t, name)) : vscode.Uri.from({ scheme: SCHEME, authority: t.key, path: '/' + relativeName(name) }); }
export class RemoteFS implements vscode.FileSystemProvider {
  readonly events = new vscode.EventEmitter<vscode.FileChangeEvent[]>(); readonly onDidChangeFile = this.events.event;
  private versions = new Map<string, string>();
  constructor(readonly engine: Engine) {}
  decode(uri: vscode.Uri) { return { target: this.engine.store.get(uri.authority), name: relativeName(uri.path.slice(1)) }; }
  watch() { return new vscode.Disposable(() => undefined); }
  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const { target, name } = this.decode(uri); const entry = await this.engine.browse(target, r => r.stat(name));
    return { type: entry.directory ? vscode.FileType.Directory : entry.symlink ? vscode.FileType.SymbolicLink : vscode.FileType.File, ctime: 0, mtime: entry.mtime, size: entry.size };
  }
  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const { target, name } = this.decode(uri); return (await this.engine.list(target, name)).filter(x => !x.symlink).map(x => [x.name, x.directory ? vscode.FileType.Directory : vscode.FileType.File]);
  }
  async readFile(uri: vscode.Uri) { const { target, name } = this.decode(uri); const data = await this.engine.read(target, name); this.versions.set(uri.toString(), hash(data)); return data; }
  async writeFile(uri: vscode.Uri, data: Uint8Array, options: { create: boolean; overwrite: boolean }) {
    const { target, name } = this.decode(uri);
    let current: Buffer | undefined;
    try { current = await this.engine.read(target, name); } catch (error) { if (error.code !== 2 && error.code !== 'FileNotFound') throw error; }
    if (current && !options.overwrite) throw vscode.FileSystemError.FileExists(uri);
    if (!current && !options.create) throw vscode.FileSystemError.FileNotFound(uri);
    const original = this.versions.get(uri.toString());
    if (original && original !== (current ? hash(current) : undefined)) throw vscode.FileSystemError.Unavailable('Remote file changed since it was opened. Reopen or compare before saving.');
    await this.engine.upload(target, name, Buffer.from(data)); this.versions.set(uri.toString(), hash(Buffer.from(data)));
    this.events.fire([{ type: current ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created, uri }]);
  }
  async createDirectory(uri: vscode.Uri) { const { target, name } = this.decode(uri); await this.engine.allowed(target, name); await this.engine.browse(target, r => r.mkdir(name)); this.engine.changed.fire(); }
  async delete(uri: vscode.Uri, options: { recursive: boolean }) { const { target, name } = this.decode(uri); await this.engine.allowed(target, name); await this.engine.browse(target, r => r.remove(name, options.recursive)); this.events.fire([{ type: vscode.FileChangeType.Deleted, uri }]); this.engine.changed.fire(); }
  async rename(oldUri: vscode.Uri, newUri: vscode.Uri) {
    const source = this.decode(oldUri), destination = this.decode(newUri);
    await this.engine.allowed(source.target, source.name); await this.engine.allowed(destination.target, destination.name);
    if (source.target.key !== destination.target.key) throw new Error('Move between servers using download and upload.');
    await this.engine.browse(source.target, r => r.rename(source.name, destination.name)); this.versions.delete(oldUri.toString()); this.engine.changed.fire();
  }
}
