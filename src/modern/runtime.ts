import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { ConfigStore } from './config';
import { Engine } from './engine';
import { UI } from './ui';
import { RemoteFS, remoteUri, SCHEME } from './filesystem';
import { Entry, Target, childName, excluded, localFile, relativeName, remoteFile } from './model';
interface Node { target: Target; name: string; entry?: Entry; }
class Servers implements vscode.TreeDataProvider<Node> {
  readonly changed = new vscode.EventEmitter<Node | undefined>(); readonly onDidChangeTreeData = this.changed.event;
  constructor(readonly engine: Engine) {}
  getTreeItem(n: Node) {
    const directory = !n.entry || n.entry.directory;
    const item = new vscode.TreeItem(n.entry?.name || n.target.name, directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.contextValue = n.target.protocol === 'git' ? n.entry ? directory ? 'gitFolder' : 'gitFile' : 'gitRoot' : n.entry ? directory ? 'folder' : 'file' : 'root'; item.resourceUri = remoteUri(n.target, n.name);
    item.description = !n.entry ? `${n.target.protocol.toUpperCase()} ${n.target.key === this.engine.store.activeKey ? '• active' : ''}` : undefined;
    item.tooltip = n.target.protocol === 'git' ? localFile(n.target, n.name) : remoteFile(n.target, n.name);
    if (!directory) item.command = { command: 'usamaSftp.remote.open', title: 'Open', arguments: [n] }; return item;
  }
  async getChildren(n?: Node): Promise<Node[]> {
    if (!n) return this.engine.store.targets.map(target => ({ target, name: '' }));
    if (n.target.protocol === 'git') {
      await this.engine.checkout.ensure(n.target);
      return (await this.engine.localList(n.target, n.name)).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
        .map(entry => ({ target: n.target, name: path.posix.join(n.name, entry.name), entry }));
    }
    return (await this.engine.list(n.target, n.name)).filter(e => !e.symlink && !excluded(n.target, path.posix.join(n.name, e.name), e.directory)).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)).map(entry => ({ target: n.target, name: path.posix.join(n.name, entry.name), entry }));
  }
}
export async function start(context: vscode.ExtensionContext) {
  const store = new ConfigStore(context), engine = new Engine(store), filesystem = new RemoteFS(engine), ui = new UI(engine, context), tree = new Servers(engine);
  const output = vscode.window.createOutputChannel('Usama SFTP');
  context.subscriptions.push(output, store.changed, engine.changed, engine.queue, filesystem.events, tree.changed, { dispose: () => ui.dispose() });
  const report = (error: Error) => { output.appendLine(error.message); vscode.window.showErrorMessage(`Usama SFTP: ${error.message}`); };
  const register = (name: string, fn: (...args: any[]) => any) => context.subscriptions.push(vscode.commands.registerCommand('usamaSftp.' + name, async (...args) => { try { return await fn(...args); } catch (error) { report(error); throw error; } }));
  context.subscriptions.push(vscode.workspace.registerFileSystemProvider(SCHEME, filesystem, { isCaseSensitive: true }), vscode.window.registerTreeDataProvider('usamaSftp.servers', tree), vscode.window.registerWebviewViewProvider('usamaSftp.sidebar', ui.provider('overview')), vscode.window.registerWebviewViewProvider('usamaSftp.queue', ui.provider('queue')));
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9); bar.command = 'usamaSftp.switchTarget'; context.subscriptions.push(bar);
  const refresh = () => {
    tree.changed.fire(undefined); const t = store.targets.find(x => x.key === store.activeKey);
    bar.text = `$(cloud-upload) Usama SFTP${t ? ': ' + t.name : ''}${engine.queue.pending ? ' (' + engine.queue.pending + ')' : ''}`;
    bar.tooltip = t ? t.protocol === 'git' ? `${t.repositoryUrl}\nLocal checkout: ${t.localRoot}` : `${t.protocol.toUpperCase()}://${t.host}:${t.port}${t.remotePath}\nUpload on save: ${t.uploadOnSave ? 'on' : 'off'}` : 'Add or edit connections';
    if (vscode.workspace.getConfiguration('usamaSftp').get('statusBar.show', true)) bar.show(); else bar.hide();
  };
  context.subscriptions.push(store.changed.event(refresh), engine.changed.event(refresh), engine.queue.changed.event(() => {
    refresh(); const reveal = vscode.workspace.getConfiguration('usamaSftp').get<string>('transfers.reveal', 'never');
    if (reveal === 'always' || reveal === 'onError' && engine.queue.jobs.some(j => j.state === 'failed')) vscode.commands.executeCommand('usamaSftp.queue.focus');
  }));
  const nodeFor = (value?: Node | vscode.Uri): Node => {
    if (value && 'target' in value) return value;
    const uri = value instanceof vscode.Uri ? value : vscode.window.activeTextEditor?.document.uri;
    if (uri?.scheme === SCHEME) return filesystem.decode(uri);
    const target = store.active(); return { target, name: uri?.scheme === 'file' ? relativeName(path.relative(target.localRoot, uri.fsPath)) : '' };
  };
  const transfer = async (direction: string, value?: Node | vscode.Uri, project = false) => {
    const n = project ? { target: store.active(), name: '' } : nodeFor(value);
    const directory = !n.name || (direction === 'upload' ? (await fs.promises.lstat(localFile(n.target, n.name))).isDirectory() : (await engine.browse(n.target, r => r.stat(n.name))).directory);
    if (directory) await engine.folder(n.target, n.name, direction);
    else if (direction === 'upload') await engine.upload(n.target, n.name); else await engine.download(n.target, n.name);
  };
  register('configure', value => ui.open('servers', value?.target));
  register('openConfigFile', async (key?: string) => {
    const workspace = (key ? store.get(key) : store.targets.find(t => t.key === store.activeKey))?.workspace || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath; if (!workspace) throw new Error('Open a workspace folder first.');
    const file = path.join(workspace, '.vscode', 'usama-sftp.json');
    if (!fs.existsSync(file)) { await fs.promises.mkdir(path.dirname(file), { recursive: true }); await fs.promises.writeFile(file, JSON.stringify({ version: 2, profiles: [] }, null, 2)); }
    return vscode.window.showTextDocument(vscode.Uri.file(file));
  });
  register('switchTarget', async (key?: string) => { if (key) return store.setActive(key); const choice = await vscode.window.showQuickPick(store.targets.map(t => ({ label: t.name, description: `${t.protocol}://${t.host}${t.remotePath}`, key: t.key }))); if (choice) await store.setActive(choice.key); });
  register('toggleUploadOnSave', () => { if (store.active().protocol === 'git') throw new Error('Git files save locally. Commit and push from Source Control.'); return store.save({ ...store.active(), uploadOnSave: !store.active().uploadOnSave }); });
  register('connect', async (key?: string) => { const t = key ? store.get(key) : store.active(); await store.setActive(t.key); if (t.protocol === 'git') await engine.checkout.ensure(t); else await engine.list(t); tree.changed.fire(undefined); return t.localRoot; });
  register('openCheckout', async (key?: string) => { const t = key ? store.get(key) : store.active(); if (t.protocol !== 'git') throw new Error('Select a Git repository connection.'); const folder = await engine.checkout.ensure(t); return vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folder), true); });
  register('upload', value => transfer('upload', value)); register('download', value => transfer('download', value));
  register('uploadTo', async value => { const source = nodeFor(value); const choice = await vscode.window.showQuickPick(store.targets.map(t => ({ label: t.name, target: t }))); if (choice) { await engine.allowed(source.target, source.name); await engine.upload(choice.target, source.name, await fs.promises.readFile(localFile(source.target, source.name))); } });
  register('sync', value => ui.open('sync', value?.target || store.active())); register('deployGit', () => ui.open('sync', store.active())); register('openManager', value => ui.open('manager', value?.target || store.active()));
  register('showQueue', () => vscode.commands.executeCommand('usamaSftp.queue.focus'));
  register('cancelAll', () => engine.queue.cancel()); register('retryFailed', () => engine.queue.retry()); register('clearFinished', () => engine.queue.clear()); register('disconnect', () => engine.queue.cancel());
  register('diff', value => { const n = nodeFor(value); return vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(localFile(n.target, n.name)), remoteUri(n.target, n.name), `Local ↔ ${n.target.name}: ${n.name}`); });
  register('remote.open', value => { const n = nodeFor(value); return vscode.window.showTextDocument(remoteUri(n.target, n.name)); }); register('remote.refresh', async () => { await store.load(); tree.changed.fire(undefined); });
  register('remote.setActive', value => store.setActive(nodeFor(value).target.key)); register('remote.copyPath', value => { const n = nodeFor(value); return vscode.env.clipboard.writeText(remoteFile(n.target, n.name)); });
  register('remote.revealLocal', value => { const n = nodeFor(value); return vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(localFile(n.target, n.name))); });
  register('remote.download', value => transfer('download', value)); register('remote.diff', value => vscode.commands.executeCommand('usamaSftp.diff', value));
  for (const [command, directory] of [['remote.newFile', false], ['remote.newFolder', true]] as [string, boolean][]) register(command, async (value, provided?: string) => {
    const n = nodeFor(value), name = provided || await vscode.window.showInputBox({ prompt: directory ? 'New folder name' : 'New file name', validateInput: v => { try { childName(v); return undefined; } catch (error) { return error.message; } } });
    if (!name) return; const child = path.posix.join(n.entry && !n.entry.directory ? path.posix.dirname(n.name) : n.name, childName(name));
    const uri = remoteUri(n.target, child); if (directory) await filesystem.createDirectory(uri); else await filesystem.writeFile(uri, Buffer.alloc(0), { create: true, overwrite: false });
  });
  register('remote.rename', async (value, provided?: string) => { const n = nodeFor(value); if (!n.name) throw new Error('Cannot rename server root.'); const name = provided || await vscode.window.showInputBox({ prompt: 'New name', value: path.posix.basename(n.name) }); if (name) await filesystem.rename(remoteUri(n.target, n.name), remoteUri(n.target, path.posix.join(path.posix.dirname(n.name), childName(name)))); });
  register('remote.delete', async value => { const n = nodeFor(value); if (!n.name) throw new Error('Cannot delete server root.'); if (await vscode.window.showWarningMessage(`Delete ${n.name} on ${n.target.name}?`, { modal: true }, 'Delete') === 'Delete') await filesystem.delete(remoteUri(n.target, n.name), { recursive: true }); });
  register('remote.uploadHere', async value => { const n = nodeFor(value); const files = await vscode.window.showOpenDialog({ canSelectMany: true, canSelectFiles: true, canSelectFolders: false }); for (const file of files || []) await engine.upload(n.target, path.posix.join(n.name, path.basename(file.fsPath)), await fs.promises.readFile(file.fsPath)); });
  register('importLegacy', async (provided?: string, providedWorkspace?: string) => {
    const workspace = providedWorkspace || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath; if (!workspace) throw new Error('Open a workspace folder first.');
    const candidates = ['sftp.json', 'sftp-sync.json'].map(name => path.join(workspace, '.vscode', name)).filter(file => fs.existsSync(file));
    const file = provided || (candidates.length === 1 ? candidates[0] : await vscode.window.showQuickPick(candidates)); if (!file) throw new Error('No legacy configuration found.'); await store.importFile(workspace, file); return store.targets;
  });
  register('openConnectInTerminal', () => {
    const t = store.active(); if (t.protocol !== 'sftp') throw new Error('SSH requires an SFTP server.'); const quote = (s: string) => "'" + s.replace(/'/g, "''") + "'";
    const terminal = vscode.window.createTerminal({ name: `Usama SSH: ${t.name}`, shellPath: process.platform === 'win32' ? 'powershell.exe' : undefined }); terminal.show(); terminal.sendText(`ssh -p ${t.port} ${t.privateKeyPath ? '-i ' + quote(t.privateKeyPath) + ' ' : ''}${quote(t.username + '@' + t.host)}`);
  });
  const terminalTransfer = async (tool: string, value?: vscode.Uri) => {
    const n = tool === 'rsync' ? { target: store.active(), name: '' } : nodeFor(value), t = n.target; if (t.protocol !== 'sftp') throw new Error(`${tool} requires an SSH/SFTP server.`);
    await new Promise<void>((resolve, reject) => execFile(process.platform === 'win32' ? 'where.exe' : 'which', [tool], { windowsHide: true }, error => error ? reject(new Error(`${tool} is not installed or not on PATH. Install it before using this command.`)) : resolve()));
    const quote = (s: string) => process.platform === 'win32' ? "'" + s.replace(/'/g, "''") + "'" : "'" + s.replace(/'/g, "'\\''") + "'";
    const terminal = vscode.window.createTerminal({ name: `Usama ${tool}: ${t.name}`, shellPath: process.platform === 'win32' ? 'powershell.exe' : undefined });
    if (tool === 'scp') { await engine.allowed(t, n.name); if (!n.name || !(await fs.promises.lstat(localFile(t, n.name))).isFile()) throw new Error('Select a regular file for native SCP. Use Upload for folders so ignore rules are applied.'); terminal.sendText(`scp -P ${t.port} ${t.privateKeyPath ? '-i ' + quote(t.privateKeyPath) + ' ' : ''}${quote(localFile(t, n.name))} ${quote(t.username + '@' + t.host + ':' + remoteFile(t, n.name))}`); }
    else terminal.sendText(`rsync --archive --verbose --dry-run --exclude=.git --exclude=.vscode ${t.ignore.filter(p => !p.startsWith('!')).map(p => '--exclude=' + quote(p)).join(' ')} -e ${quote(`ssh -p ${t.port}`)} ${quote(t.localRoot.replace(/\\/g, '/') + '/')} ${quote(t.username + '@' + t.host + ':' + t.remotePath.replace(/\/$/, '') + '/')}`);
    terminal.show();
  };
  register('scpUpload', value => terminalTransfer('scp', value)); register('rsyncPreview', () => terminalTransfer('rsync'));
  const aliases = { config: 'configure', setProfile: 'switchTarget', cancelAllTransfer: 'cancelAll', importConfig: 'importLegacy', renameRemote: 'remote.rename', copyRemotePath: 'remote.copyPath', viewContent: 'remote.open', 'remoteExplorer.refresh': 'remote.refresh', 'remoteExplorer.editInLocal': 'remote.download', revealInExplorer: 'remote.revealLocal', revealInRemoteExplorer: 'remote.refresh', 'create.file': 'remote.newFile', 'create.folder': 'remote.newFolder', 'delete.remote': 'remote.delete', 'diff.activeFile': 'diff', 'upload.changedFiles': 'deployGit', list: 'openManager', listActiveFolder: 'openManager', listAll: 'openManager', 'sync.localToRemote': 'sync', 'sync.remoteToLocal': 'sync', 'sync.bothDirections': 'sync' };
  for (const alias of Object.keys(aliases)) register(alias, (...args) => vscode.commands.executeCommand('usamaSftp.' + aliases[alias], ...args));
  for (const direction of ['upload', 'download']) {
    for (const suffix of ['file', 'activeFile', 'folder', 'activeFolder', 'project']) register(direction + '.' + suffix, value => transfer(direction, value, suffix === 'project'));
    register('force' + direction[0].toUpperCase() + direction.slice(1), value => transfer(direction, value));
  }
  for (const suffix of ['file', 'activeFile', 'folder', 'activeFolder', 'project']) register('upload.' + suffix + '.to.allProfiles', async value => { const source = nodeFor(value); for (const target of store.targets) await transfer('upload', { target, name: suffix === 'project' ? '' : source.name }); });
  register('forceUpload.to.allProfiles', async value => { for (const target of store.targets) await transfer('upload', { target, name: nodeFor(value).name }); });
  const watcher = vscode.workspace.createFileSystemWatcher('**/.vscode/usama-sftp.json'); const reload = () => store.load().catch(report);
  context.subscriptions.push(watcher, watcher.onDidCreate(reload), watcher.onDidChange(reload), watcher.onDidDelete(reload), vscode.workspace.onDidChangeWorkspaceFolders(reload));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async document => {
    if (document.uri.scheme !== 'file') return; const target = store.targets.find(t => t.key === store.activeKey); if (!target?.uploadOnSave) return;
    try { const name = relativeName(path.relative(target.localRoot, document.uri.fsPath)); if (!name || excluded(target, name)) return; await engine.upload(target, name); if (vscode.workspace.getConfiguration('usamaSftp').get('uploadOnSave.showSuccess', true)) vscode.window.setStatusBarMessage(`Usama SFTP: uploaded ${name}`, 2500); }
    catch (error) { if (!error.message.includes('inside the configured')) report(error); }
  }));
  await store.load(); refresh(); await vscode.commands.executeCommand('setContext', 'usamaSftp.enabled', true);
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('usamaSftp')) refresh(); }));
  if (!store.targets.length && vscode.workspace.getConfiguration('usamaSftp').get('offerImport', true)) {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspace && ['sftp.json', 'sftp-sync.json'].some(name => fs.existsSync(path.join(workspace, '.vscode', name)))) vscode.window.showInformationMessage('Import existing SFTP servers into Usama SFTP?', 'Import').then(choice => { if (choice === 'Import') vscode.commands.executeCommand('usamaSftp.importLegacy'); });
  }
  return { store, engine, filesystem, ui, tree, remoteUri, version: 2 };
}
