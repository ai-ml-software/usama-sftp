import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ConfigStore } from './config';
import { Remote } from './remote';
import { Queue } from './queue';
import { GitCheckout } from './checkout';
import { Target, Snapshot, Plan, Entry, excluded, hash, localFile, relativeName, resolve, syncChanges } from './model';
const exec = promisify(execFile);
async function fileHash(file: string): Promise<string> { const digest = require('crypto').createHash('sha256'); for await (const chunk of fs.createReadStream(file)) digest.update(chunk); return digest.digest('hex'); }
export class Engine {
  readonly queue = new Queue(); readonly changed = new vscode.EventEmitter<void>();
  readonly checkout = new GitCheckout(vscode.workspace.getConfiguration('usamaSftp').get<string>('git.path', 'git'));
  constructor(readonly store: ConfigStore) {}
  async browse<T>(t: Target, fn: (remote: Remote) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const remote = new Remote(this.store, t); try { await remote.connect(signal); return await fn(remote); } finally { remote.close(); }
  }
  async list(t: Target, name = ''): Promise<Entry[]> { return this.browse(t, r => r.list(relativeName(name))); }
  async localList(t: Target, name = ''): Promise<Entry[]> {
    const result: Entry[] = [];
    for (const entry of await fs.promises.readdir(localFile(t, name), { withFileTypes: true })) {
      if (excluded(t, path.posix.join(name, entry.name), entry.isDirectory()) || entry.isSymbolicLink()) continue;
      const stat = await fs.promises.lstat(localFile(t, path.posix.join(name, entry.name)));
      result.push({ name: entry.name, directory: entry.isDirectory(), symlink: false, size: stat.size, mtime: stat.mtimeMs });
    }
    return result;
  }
  async allowed(t: Target, name: string) {
    const safe = relativeName(name);
    if (excluded(t, safe)) throw new Error('This path is ignored by the server configuration.');
    let current = t.localRoot;
    for (const part of safe.split('/').filter(Boolean)) {
      current = path.join(current, part);
      try { if ((await fs.promises.lstat(current)).isSymbolicLink()) throw new Error('Symbolic links are excluded from transfers.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return safe;
  }
  async upload(t: Target, name: string, content?: Buffer, sourceName = name) {
    if (t.protocol === 'git') throw new Error('Edit the local Git checkout, then commit and push using Source Control.');
    name = await this.allowed(t, name);
    sourceName = await this.allowed(t, sourceName);
    if (!name) throw new Error('Choose a file.');
    return this.queue.add(`Upload ${t.name}: ${name}`, async (signal, progress) => {
      await this.allowed(t, sourceName);
      const size = content === undefined ? (await fs.promises.stat(localFile(t, sourceName))).size : content.length;
      await this.browse(t, r => r.upload(name, content === undefined ? fs.createReadStream(localFile(t, sourceName)) : Readable.from([content]), size, progress), signal); this.changed.fire();
    });
  }
  async download(t: Target, name: string, destination = name) {
    name = await this.allowed(t, name);
    destination = await this.allowed(t, destination);
    return this.queue.add(`Download ${t.name}: ${name}`, async (signal, progress) => {
      await this.allowed(t, destination);
      const file = localFile(t, destination), temp = file + '.usama-' + hash(Date.now() + Math.random().toString()).slice(0, 12) + '.tmp';
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      try { await this.browse(t, r => r.download(name, fs.createWriteStream(temp, { flags: 'wx' }), progress), signal); if (signal.aborted) throw new Error('Transfer cancelled.'); await fs.promises.rename(temp, file); }
      finally { await fs.promises.unlink(temp).catch(() => undefined); }
      this.changed.fire();
    });
  }
  async folder(t: Target, prefix: string, direction: string, destination = prefix) {
    await this.allowed(t, prefix); await this.allowed(t, destination);
    if (direction === 'upload') {
      await this.browse(t, r => r.mkdir(destination));
      for (const entry of await this.localList(t, prefix)) {
        const source = path.posix.join(prefix, entry.name), target = path.posix.join(destination, entry.name);
        if (entry.directory) await this.folder(t, source, direction, target); else await this.upload(t, target, undefined, source);
      }
    } else {
      await fs.promises.mkdir(localFile(t, destination), { recursive: true });
      for (const entry of await this.list(t, prefix)) {
        const source = path.posix.join(prefix, entry.name), target = path.posix.join(destination, entry.name);
        if (entry.symlink || excluded(t, source, entry.directory)) continue;
        if (entry.directory) await this.folder(t, source, direction, target); else await this.download(t, source, target);
      }
    }
  }
  async read(t: Target, name: string) { await this.allowed(t, name); return this.browse(t, r => r.read(name)); }
  async snapshots(t: Target, prefix = ''): Promise<{ local: Snapshot; remote: Snapshot }> {
    const local: Snapshot = Object.create(null), remote: Snapshot = Object.create(null);
    const scanLocal = async (name: string) => {
      for (const entry of await this.localList(t, name)) {
        const child = path.posix.join(name, entry.name);
        if (entry.directory) await scanLocal(child);
        else local[child] = { hash: await fileHash(localFile(t, child)), mtime: entry.mtime, size: entry.size };
      }
    };
    const scanRemote = async (r: Remote, name: string) => {
      for (const entry of await r.list(name)) {
        const child = path.posix.join(name, entry.name);
        if (entry.symlink || excluded(t, child, entry.directory) || entry.name.includes('.usama-') && entry.name.endsWith('.tmp')) continue;
        if (entry.directory) await scanRemote(r, child);
        else remote[child] = await r.digest(child);
      }
    };
    await scanLocal(relativeName(prefix)); await this.browse(t, r => scanRemote(r, relativeName(prefix)));
    return { local, remote };
  }
  baselineKey(t: Target) { return `baseline:${t.key}:${hash(t.localRoot + ':' + t.host + ':' + t.port + ':' + t.remotePath)}`; }
  async plan(t: Target, mode = 'both', deletes = false, prefix = ''): Promise<Plan> {
    if (t.protocol === 'git') throw new Error('Use Source Control in the local checkout to review and commit Git changes.');
    const snapshots = await this.snapshots(t, prefix);
    const baseline = this.store.context.workspaceState.get<Snapshot>(this.baselineKey(t), {});
    return { target: t, mode, ...snapshots, changes: syncChanges(snapshots.local, snapshots.remote, baseline, mode, deletes).filter(x => !prefix || x.name === prefix || x.name.startsWith(prefix + '/')) };
  }
  async apply(plan: Plan, choices: { [name: string]: string } = {}, confirmDeletes = false) {
    const actions = plan.changes.map(x => ({ name: x.name, action: resolve(x, choices[x.name]) }));
    if (!confirmDeletes && actions.some(x => x.action.startsWith('delete'))) throw new Error('Confirm deletions before applying this plan.');
    // Recheck every planned path before modifying anything; previews can become stale.
    for (const change of plan.changes) {
      let l: string | undefined, r: string | undefined;
      try { l = await fileHash(localFile(plan.target, change.name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      try { r = (await this.browse(plan.target, remote => remote.digest(change.name))).hash; } catch (error) { if (error.code !== 2 && error.code !== 'FileNotFound') throw error; }
      if (l !== change.local?.hash || r !== change.remote?.hash) throw new Error(`Preview is stale: ${change.name}. Refresh the preview.`);
    }
    for (const op of actions) {
      await this.allowed(plan.target, op.name);
      if (op.action === 'upload') await this.upload(plan.target, op.name);
      else if (op.action === 'download') await this.download(plan.target, op.name);
      else if (op.action === 'deleteLocal') await fs.promises.unlink(localFile(plan.target, op.name));
      else await this.queue.add(`Delete ${plan.target.name}: ${op.name}`, signal => this.browse(plan.target, r => r.remove(op.name), signal));
    }
    const previous = this.store.context.workspaceState.get<Snapshot>(this.baselineKey(plan.target), {});
    const current = await this.snapshots(plan.target);
    const baseline: Snapshot = Object.assign(Object.create(null), previous);
    for (const name of new Set([...Object.keys(current.local), ...Object.keys(current.remote), ...Object.keys(previous)])) {
      if (current.local[name] && current.remote[name] && current.local[name].hash === current.remote[name].hash) baseline[name] = current.local[name];
      else if (!current.local[name] && !current.remote[name]) delete baseline[name];
    }
    await this.store.context.workspaceState.update(this.baselineKey(plan.target), baseline); this.changed.fire();
  }
  async gitPlan(t: Target, ref?: string): Promise<{ uploads: string[]; deletes: string[]; head: string }> {
    if (t.protocol === 'git') throw new Error('Use Source Control in the local checkout to review and commit Git changes.');
    const options = { cwd: t.localRoot, maxBuffer: 8 * 1024 * 1024, windowsHide: true };
    const root = (await exec('git', ['rev-parse', '--show-toplevel'], options)).stdout.trim();
    const head = (await exec('git', ['rev-parse', 'HEAD'], options)).stdout.trim();
    const args = ref ? ['diff', '--name-status', '-z', '-M', '--end-of-options', ref, '--'] : ['status', '--porcelain=v1', '-z', '--untracked-files=all'];
    const fields = (await exec('git', args, { ...options, cwd: root })).stdout.split('\0');
    const uploads = new Set<string>(), deletes = new Set<string>();
    const add = (collection: Set<string>, name: string) => {
      const relative = path.relative(t.localRoot, path.resolve(root, name)).replace(/\\/g, '/');
      if (relative && !relative.startsWith('../') && !path.isAbsolute(relative) && !excluded(t, relative)) collection.add(relative);
    };
    for (let i = 0; i < fields.length && fields[i]; i++) {
      const record = fields[i]; let status: string, name: string;
      if (ref) { status = record; name = fields[++i]; if (/^[RC]/.test(status)) { const destination = fields[++i]; if (status[0] === 'R') add(deletes, name); name = destination; } }
      else { status = record.slice(0, 2); name = record.slice(3); if (status.includes('R') || status.includes('C')) { const original = fields[++i]; if (status.includes('R')) add(deletes, original); } }
      if (status.includes('D')) add(deletes, name); else add(uploads, name);
    }
    return { uploads: [...uploads], deletes: [...deletes], head };
  }
  async gitDeploy(t: Target, plan: { uploads: string[]; deletes: string[]; head: string }, confirmDeletes = false) {
    if (plan.deletes.length && !confirmDeletes) throw new Error('Confirm Git deletions before deploying.');
    for (const name of plan.uploads) await this.upload(t, name);
    for (const name of plan.deletes) await this.queue.add(`Git delete ${t.name}: ${name}`, signal => this.browse(t, r => r.remove(name).catch(error => { if (error.code !== 2 && error.code !== 'FileNotFound') throw error; }), signal));
    await this.store.context.workspaceState.update(`gitDeploy:${t.key}`, plan.head); this.changed.fire();
  }
}
