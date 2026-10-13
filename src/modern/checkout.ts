import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Target } from './model';
const exec = promisify(execFile);

export function repositoryUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch (_) { throw new Error('Enter an HTTPS Git repository URL.'); }
  if (url.protocol !== 'https:' || !url.hostname || url.pathname === '/' || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTPS repository URL without a password or token. Git uses your saved credentials.');
  }
  return url.toString().replace(/\/$/, '');
}

// Never pull, reset, clean or overwrite a checkout automatically: it may contain unsaved work.
export class GitCheckout {
  private pending = new Map<string, Promise<string>>();
  constructor(readonly executable = 'git') {}
  async run(args: string[], cwd: string, timeout = 45000) {
    try {
      return await exec(this.executable, args, { cwd, windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
    } catch (error) {
      const detail = String(error.stderr || error.message);
      if (/Authentication failed|could not read Username|terminal prompts disabled|interactivity has been disabled/i.test(detail)) {
        throw new Error('Git sign-in is needed. Click Sign in with Git, use an account with repository access, then connect again.');
      }
      if (error.code === 'ENOENT') throw new Error('Git was not found. Install Git or set usamaSftp.git.path to its executable.');
      throw new Error(detail.trim());
    }
  }
  private async validate(t: Target) {
    repositoryUrl(t.repositoryUrl || '');
    if (!t.branch || t.branch.startsWith('-')) throw new Error('Enter a branch name, such as main.');
    await this.run(['check-ref-format', '--branch', t.branch], t.workspace);
    const relative = path.relative(t.workspace, t.localRoot);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Choose a separate checkout folder inside this workspace.');
    let current = t.workspace;
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part);
      try { if ((await fs.promises.lstat(current)).isSymbolicLink()) throw new Error('Checkout folders must not be symbolic links.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  async test(t: Target) {
    await this.validate(t);
    const result = await this.run(['ls-remote', '--exit-code', '--', t.repositoryUrl!, `refs/heads/${t.branch}`], t.workspace);
    return result.stdout.trim().split(/\s/)[0];
  }
  ensure(t: Target): Promise<string> {
    const key = process.platform === 'win32' ? t.localRoot.toLowerCase() : t.localRoot;
    const previous = this.pending.get(key) || Promise.resolve('');
    const work = previous.catch(() => '').then(() => this.ensureNow(t));
    this.pending.set(key, work);
    work.finally(() => { if (this.pending.get(key) === work) this.pending.delete(key); }).catch(() => undefined);
    return work;
  }
  private async ensureNow(t: Target) {
    await this.validate(t);
    const gitFolder = path.join(t.localRoot, '.git');
    if (fs.existsSync(gitFolder)) {
      const origin = (await this.run(['config', '--get', 'remote.origin.url'], t.localRoot)).stdout.trim();
      if (repositoryUrl(origin) !== repositoryUrl(t.repositoryUrl!)) throw new Error('This checkout belongs to another repository. Choose a different local folder.');
      const top = (await this.run(['rev-parse', '--show-toplevel'], t.localRoot)).stdout.trim();
      const normalized = (file: string) => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
      if (normalized(top) !== normalized(t.localRoot)) throw new Error('Choose the root of a separate Git checkout.');
      return t.localRoot;
    }
    if (fs.existsSync(t.localRoot)) throw new Error('The checkout folder already exists without a Git repository. Choose a new empty path; existing files will be preserved.');
    await fs.promises.mkdir(path.dirname(t.localRoot), { recursive: true });
    // Clone to a sibling first, so failed authentication never leaves a half-configured checkout.
    const temporary = t.localRoot + '.usama-clone-' + require('crypto').randomBytes(6).toString('hex');
    try {
      await this.run(['clone', '--single-branch', '--branch', t.branch!, '--', t.repositoryUrl!, temporary], t.workspace, 300000);
      if (fs.existsSync(t.localRoot)) throw new Error('The checkout folder was created while connecting. Choose a different local folder.');
      await fs.promises.rename(temporary, t.localRoot);
    } catch (error) {
      await fs.promises.rm(temporary, { recursive: true, force: true });
      throw error;
    }
    return t.localRoot;
  }
}
