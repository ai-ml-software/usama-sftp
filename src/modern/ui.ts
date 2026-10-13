import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Engine } from './engine';
import { Target, Plan, childName, localFile, relativeName } from './model';
import { Remote } from './remote';
import { remoteUri } from './filesystem';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export class UI {
  private connections = new Map<string, { checked: string; message: string; ok: boolean }>();
  private panels = new Set<vscode.WebviewPanel>();
  private webviews = new Set<vscode.Webview>();
  constructor(readonly engine: Engine, readonly context: vscode.ExtensionContext) {
    context.subscriptions.push(engine.queue.changed.event(() => this.broadcast()), engine.store.changed.event(() => this.broadcast()));
  }
  private async state() { return { servers: this.engine.store.targets.map(t => ({ ...this.engine.store.serialize(t), key: t.key, workspace: t.workspace })), active: this.engine.store.activeKey,
    connections: Object.fromEntries(this.connections),
    jobs: this.engine.queue.jobs.map(({ id, label, state, bytes, total, speed, error }) => ({ id, label, state, bytes, total, speed, error })), workspaces: (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath) }; }
  async broadcast() { const state = await this.state(); for (const webview of this.webviews) webview.postMessage({ type: 'state', data: state }); }
  provider(kind: string): vscode.WebviewViewProvider { return { resolveWebviewView: view => { this.attach(view.webview, kind); view.onDidDispose(() => this.webviews.delete(view.webview)); } }; }
  open(kind: string, target?: Target) {
    const panel = vscode.window.createWebviewPanel(`usamaSftp.${kind}`, `Usama SFTP — ${kind === 'servers' ? 'SFTP / FTP Servers' : kind === 'manager' ? 'File Manager' : 'Sync Preview'}`, vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
    this.panels.add(panel); this.attach(panel.webview, kind, target); panel.onDidDispose(() => { this.panels.delete(panel); this.webviews.delete(panel.webview); }); return panel;
  }
  private attach(webview: vscode.Webview, kind: string, initial?: Target) {
    webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'resources')] };
    const nonce = require('crypto').randomBytes(16).toString('hex');
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'modern.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'modern.css'));
    webview.html = `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${style}"></head><body data-kind="${escapeHtml(kind)}" data-server="${initial?.key || ''}"><main id="app"></main><script nonce="${nonce}" src="${script}"></script></body></html>`;
    this.webviews.add(webview);
    let plan: Plan | undefined; let git: { target: Target; plan: { uploads: string[]; deletes: string[]; head: string } } | undefined;
    webview.onDidReceiveMessage(async message => {
      const request = message.id;
      try {
        let data: any;
        const t = () => this.engine.store.get(message.key || this.engine.store.activeKey);
        switch (message.action) {
          case 'ready': data = await this.state(); break;
          case 'save': {
            if (!(vscode.workspace.workspaceFolders || []).some(f => f.uri.fsPath === message.workspace)) throw new Error('Choose an open workspace.');
            const target = this.engine.store.target(message.workspace, message.server); await this.engine.store.save(target, message.secrets); data = { key: target.key, message: 'Server saved. Credentials are stored in VS Code Secret Storage.' }; break;
          }
          case 'test': {
            const target = this.engine.store.target(message.workspace, message.server);
            if (target.protocol === 'git') { await this.engine.checkout.test(target); data = { message: `Connected. Git branch ${target.branch} is accessible. No SSH key is required for HTTPS.` }; break; }
            const remote = new Remote(this.engine.store, target);
            try { await remote.connect(undefined, message.secrets); data = { message: `Connected. ${(await remote.list()).length} entries in ${target.remotePath}.` }; } finally { remote.close(); } break;
          }
          case 'browseFolder': {
            const target = this.engine.store.target(message.workspace, message.server); target.remotePath = '/';
            const remote = new Remote(this.engine.store, target);
            try { await remote.connect(undefined, message.secrets); const name = relativeName(message.folder || ''); data = { folder: name, entries: (await remote.list(name)).filter(x => x.directory && !x.symlink) }; } finally { remote.close(); } break;
          }
          case 'askName': data = await vscode.window.showInputBox({ prompt: message.prompt || 'Name', value: message.value || '' }); break;
          case 'chooseLocal': { const picked = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false }); data = picked?.[0]?.fsPath; break; }
          case 'chooseKey': case 'chooseCA': { const picked = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false }); data = picked?.[0]?.fsPath; break; }
          case 'active': await this.engine.store.setActive(t().key); break;
          case 'connect': {
            const target = t();
            try {
              await this.engine.store.setActive(target.key);
              if (target.protocol === 'git') await this.engine.checkout.ensure(target); else await this.engine.list(target);
              const text = target.protocol === 'git' ? `Checkout ready: ${target.localRoot}. Files save locally; commit and push with Source Control.` : 'Connected. Open a file under SFTP / FTP Servers to edit and save directly.';
              this.connections.set(target.key, { ok: true, checked: new Date().toISOString(), message: text }); data = { message: text };
            } catch (error) { this.connections.set(target.key, { ok: false, checked: new Date().toISOString(), message: error.message }); throw error; }
            finally { await this.broadcast(); }
            break;
          }
          case 'configFile': await vscode.commands.executeCommand('usamaSftp.openConfigFile', message.key); break;
          case 'reload': await this.engine.store.load(); data = { message: 'Connections reloaded from configuration.' }; break;
          case 'checkout': await vscode.commands.executeCommand('usamaSftp.openCheckout', t().key); break;
          case 'gitSignIn': {
            const target = message.server ? this.engine.store.target(message.workspace, message.server) : t();
            if (target.protocol !== 'git') throw new Error('Select a Git repository.');
            const terminal = vscode.window.createTerminal({ name: 'Usama Git sign-in', cwd: target.workspace, shellPath: process.platform === 'win32' ? 'powershell.exe' : undefined });
            const quote = (value: string) => process.platform === 'win32' ? "'" + value.replace(/'/g, "''") + "'" : "'" + value.replace(/'/g, "'\\''") + "'";
            terminal.show(); terminal.sendText(`${process.platform === 'win32' ? '& ' : ''}${quote(this.engine.checkout.executable)} ls-remote ${quote(target.repositoryUrl!)} HEAD`);
            data = { message: 'Complete the Git sign-in in the terminal or browser, then connect again.' }; break;
          }
          case 'configure': this.open('servers', this.engine.store.targets.find(x => x.key === message.key)); break;
          case 'manager': this.open('manager', t()); break;
          case 'syncWindow': this.open('sync', t()); break;
          case 'toggle': if (t().protocol === 'git') throw new Error('Git files save locally. Commit and push from Source Control.'); await this.engine.store.save({ ...t(), uploadOnSave: !t().uploadOnSave }); break;
          case 'list': {
            if (t().protocol === 'git') await this.engine.checkout.ensure(t());
            const name = relativeName(message.folder || '');
            const entries = message.side === 'local' ? await this.engine.localList(t(), name) : await this.engine.list(t(), name);
            data = { side: message.side, folder: name, entries: entries.filter(x => !x.symlink) }; break;
          }
          case 'open': if (message.side === 'local') await vscode.window.showTextDocument(vscode.Uri.file(localFile(t(), message.name))); else await vscode.window.showTextDocument(remoteUri(t(), message.name)); break;
          case 'transfer': {
            const name = relativeName(message.name);
            const destination = relativeName(message.destination || name);
            if (message.side === 'local') {
              await this.engine.allowed(t(), name);
              const stat = await fs.promises.lstat(localFile(t(), name));
              if (stat.isDirectory()) await this.engine.folder(t(), name, 'upload', destination);
              else await this.engine.upload(t(), destination, undefined, name);
            } else {
              const entry = await this.engine.browse(t(), r => r.stat(name));
              if (entry.directory) await this.engine.folder(t(), name, 'download', destination);
              else await this.engine.download(t(), name, destination);
            }
            break;
          }
          case 'mkdir': {
            const name = path.posix.join(relativeName(message.folder || ''), childName(message.name));
            await this.engine.allowed(t(), name);
            if (message.side === 'local') await fs.promises.mkdir(localFile(t(), name)); else await this.engine.browse(t(), r => r.mkdir(name)); break;
          }
          case 'rename': {
            const source = relativeName(message.name), destination = path.posix.join(path.posix.dirname(source), childName(message.newName));
            await this.engine.allowed(t(), source); await this.engine.allowed(t(), destination);
            if (message.side === 'local') { try { await fs.promises.stat(localFile(t(), destination)); throw new Error('Destination already exists.'); } catch (error) { if (error.code !== 'ENOENT') throw error; } await fs.promises.rename(localFile(t(), source), localFile(t(), destination)); }
            else await this.engine.browse(t(), r => r.rename(source, destination)); break;
          }
          case 'delete': {
            const name = relativeName(message.name); if (!name) throw new Error('Cannot delete the root.');
            const choice = await vscode.window.showWarningMessage(`Delete ${name} ${message.side === 'local' ? 'locally' : 'on the server'}?`, { modal: true }, 'Delete');
            if (choice === 'Delete') { await this.engine.allowed(t(), name); if (message.side === 'local') await fs.promises.rm(localFile(t(), name), { recursive: true }); else await this.engine.browse(t(), r => r.remove(name, true)); } break;
          }
          case 'diff': await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(localFile(t(), message.name)), remoteUri(t(), message.name), `Local ↔ ${t().name}: ${message.name}`); break;
          case 'plan': plan = await this.engine.plan(t(), message.mode, !!message.deletes); git = undefined; data = { changes: plan.changes }; break;
          case 'apply': if (!plan) throw new Error('Preview the sync first.'); await this.engine.apply(plan, message.choices, !!message.confirmDeletes); plan = undefined; data = { message: 'Sync completed.' }; break;
          case 'gitPlan': {
            let ref = message.ref;
            if (message.mode === 'lastDeploy') { ref = this.context.workspaceState.get<string>(`gitDeploy:${t().key}`); if (!ref) throw new Error('No previous Git deployment recorded for this server.'); }
            if (message.mode === 'ref' && !ref) throw new Error('Enter a Git ref.');
            git = { target: t(), plan: await this.engine.gitPlan(t(), ref) }; plan = undefined;
            data = { changes: [...git.plan.uploads.map(name => ({ name, action: 'upload' })), ...git.plan.deletes.map(name => ({ name, action: 'deleteRemote' }))] }; break;
          }
          case 'gitApply': if (!git) throw new Error('Preview Git changes first.'); await this.engine.gitDeploy(git.target, git.plan, !!message.confirmDeletes); git = undefined; data = { message: 'Git deployment completed.' }; break;
          case 'cancel': this.engine.queue.cancel(message.job); break;
          case 'retry': await this.engine.queue.retry(message.job); break;
          case 'clear': this.engine.queue.clear(); break;
          case 'import': await vscode.commands.executeCommand('usamaSftp.importLegacy'); break;
          case 'disconnect': this.engine.queue.cancel(); break;
          default: throw new Error('Unknown action.');
        }
        await webview.postMessage({ type: 'response', id: request, data });
        if (!['ready', 'list', 'browseFolder', 'plan', 'gitPlan'].includes(message.action)) this.engine.changed.fire();
      } catch (error) { await webview.postMessage({ type: 'response', id: request, error: error.message }); }
    }, undefined, this.context.subscriptions);
  }
  dispose() { for (const panel of this.panels) panel.dispose(); }
}
