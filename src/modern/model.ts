import * as path from 'path';
import * as crypto from 'crypto';
import ignore from 'ignore';

export interface Server {
  id: string; name: string; protocol: 'sftp' | 'ftp' | 'ftps' | 'git'; host: string; port: number;
  username: string; auth: 'password' | 'key' | 'agent'; privateKeyPath?: string;
  remotePath: string; localPath: string; uploadOnSave: boolean; ignore: string[];
  implicitTls?: boolean; caPath?: string; hostFingerprint?: string;
  repositoryUrl?: string; branch?: string;
}
export interface Target extends Server { workspace: string; key: string; localRoot: string; }
export interface Entry { name: string; directory: boolean; symlink: boolean; size: number; mtime: number; }
export interface Stamp { hash: string; mtime: number; size: number; }
export type Snapshot = { [name: string]: Stamp };
export type Operation = 'upload' | 'download' | 'deleteLocal' | 'deleteRemote' | 'conflict';
export interface Change { name: string; action: Operation; local?: Stamp; remote?: Stamp; }
export interface Plan { target: Target; mode: string; local: Snapshot; remote: Snapshot; changes: Change[]; }
export const hash = (data: Buffer | string) => crypto.createHash('sha256').update(data).digest('hex');
export function relativeName(name: string): string {
  const normalized = name.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized) || normalized.split('/').some(x => x === '..') || /[\x00-\x1f]/.test(normalized)) throw new Error('Path must stay inside the configured folder.');
  return normalized.split('/').filter(x => x && x !== '.').join('/');
}
export function childName(name: string): string {
  if (!name.trim() || name === '.' || name === '..' || /[\\/\x00-\x1f]/.test(name)) throw new Error('Enter a single valid file or folder name.');
  return name;
}
export function localFile(t: Target, name: string): string { return path.join(t.localRoot, relativeName(name)); }
export function remoteFile(t: Target, name: string): string { return path.posix.join(t.remotePath, relativeName(name)); }
export function excluded(t: Server, name: string, directory = false): boolean {
  const safe = relativeName(name);
  if (!safe) return false;
  return ignore().add(['.git', '.vscode', '.usama-remote', ...t.ignore]).ignores(safe + (directory ? '/' : ''));
}
export function syncChanges(local: Snapshot, remote: Snapshot, baseline: Snapshot, mode = 'both', deletes = false): Change[] {
  const changes: Change[] = [];
  for (const name of [...new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(baseline)])].sort()) {
    const get = (snapshot: Snapshot) => Object.prototype.hasOwnProperty.call(snapshot, name) ? snapshot[name] : undefined;
    const l = get(local), r = get(remote), b = get(baseline);
    if (l && r && l.hash === r.hash) continue;
    let action: Operation | undefined;
    if (mode === 'push') action = l ? 'upload' : r && deletes ? 'deleteRemote' : undefined;
    else if (mode === 'pull') action = r ? 'download' : l && deletes ? 'deleteLocal' : undefined;
    else if (!b) action = l && r ? 'conflict' : l ? 'upload' : r ? 'download' : undefined;
    else {
      const lc = !l || l.hash !== b.hash, rc = !r || r.hash !== b.hash;
      if (!l && !r) continue;
      if (lc && rc) action = 'conflict';
      else if (lc) action = l ? 'upload' : 'deleteRemote';
      else if (rc) action = r ? 'download' : 'deleteLocal';
    }
    if (action) changes.push({ name, action, local: l, remote: r });
  }
  return changes;
}
export function resolve(change: Change, choice: string): Operation {
  if (change.action !== 'conflict') return change.action;
  if (choice === 'newer') {
    if (!change.local || !change.remote || change.local.mtime === change.remote.mtime) throw new Error(`Choose local or server for ${change.name}.`);
    choice = change.local.mtime > change.remote.mtime ? 'local' : 'remote';
  }
  if (choice === 'local') return change.local ? 'upload' : 'deleteRemote';
  if (choice === 'remote') return change.remote ? 'download' : 'deleteLocal';
  throw new Error(`Resolve the conflict for ${change.name}.`);
}
