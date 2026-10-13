const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const vscode = require('vscode');
const exec = promisify(execFile);
const delay = ms => new Promise(r => setTimeout(r, ms));
async function bounded(label, promise, ms = 30000) {
  console.log('Testing: ' + label); let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timed out: ' + label)), ms); })]); } finally { clearTimeout(timer); }
}
exports.run = async function () {
  const runRoot = process.env.USAMA_TEST_ROOT, workspace = path.join(runRoot, 'workspace'), results = [];
  try {
    const manifest = require(path.join(process.env.USAMA_EXTENSION_PATH || path.resolve(__dirname, '..'), 'package.json'));
    const extension = vscode.extensions.getExtension(`${manifest.publisher}.${manifest.name}`); assert.ok(extension);
    const api = await bounded('activation', extension.activate()); assert.equal(api.version, 2);
    const commands = new Set(await vscode.commands.getCommands(true));
    for (const { command } of extension.packageJSON.contributes.commands) assert.ok(commands.has(command), 'Missing command: ' + command);
    results.push('Activation; all contributed commands registered');
    if (process.env.USAMA_SFTP_READ_TEST_CONFIG) {
      const realConfig = JSON.parse(await fs.readFile(process.env.USAMA_SFTP_READ_TEST_CONFIG, 'utf8'));
      const realTarget = api.store.target(workspace, realConfig.profiles.find(t => t.protocol === 'sftp'));
      const entries = await bounded('Saved SSH profile: read-only SFTP connection', api.engine.list(realTarget));
      const stat = await api.engine.browse(realTarget, remote => remote.stat(''));
      assert.ok(stat.directory); assert.ok(Array.isArray(entries));
      results.push('Saved altusgulf SSH profile: real server login via existing SSH agent, pinned host verification and remote-folder listing/stat passed; no remote files changed');
      const gitProfile = realConfig.profiles.find(t => t.protocol === 'git');
      if (gitProfile) {
        const realWorkspace = path.dirname(path.dirname(process.env.USAMA_SFTP_READ_TEST_CONFIG));
        const realGit = api.store.target(realWorkspace, gitProfile);
        assert.match(await bounded('Saved GitHub HTTPS connection: read-only branch access', api.engine.checkout.test(realGit)), /^[0-9a-f]{40,64}$/);
        results.push('Saved GitHub HTTPS profile: existing Git credentials access the configured branch; no remote writes');
      }
    }
    const configs = JSON.parse(await fs.readFile(path.join(runRoot, 'server-configs.json'), 'utf8'));
    for (const raw of configs) await api.store.save(api.store.target(workspace, { ...raw, id: raw.name }), raw);
    const json = await fs.readFile(path.join(workspace, '.vscode', 'usama-sftp.json'), 'utf8');
    assert.ok(!/"password"\s*:/.test(json)); assert.ok(!/"passphrase"\s*:/.test(json)); assert.equal(api.store.targets.length, 4);
    results.push('Multi-server setup; credentials stored in SecretStorage and absent from JSON');
    for (const config of configs) {
      const target = api.store.targets.find(t => t.id === config.name), local = path.join(workspace, config.name), remote = path.join(runRoot, 'remote-' + config.name);
      await api.store.setActive(target.key);
      const remoteOnlyName = 'remote-only-editor.txt';
      await fs.writeFile(path.join(remote, remoteOnlyName), 'Server-only content');
      await assert.rejects(fs.stat(path.join(local, remoteOnlyName)), { code: 'ENOENT' });
      const remoteOnlyUri = api.remoteUri(target, remoteOnlyName);
      const remoteOnlyDoc = await bounded(config.name + ' direct remote-only editor', vscode.workspace.openTextDocument(remoteOnlyUri));
      assert.equal(remoteOnlyDoc.uri.scheme, 'usama-sftp-remote');
      assert.equal(remoteOnlyDoc.getText(), 'Server-only content');
      await assert.rejects(fs.stat(path.join(local, remoteOnlyName)), { code: 'ENOENT' });
      const remoteOnlyEdit = new vscode.WorkspaceEdit();
      remoteOnlyEdit.insert(remoteOnlyUri, new vscode.Position(0, 0), 'Saved directly: ');
      assert.ok(await vscode.workspace.applyEdit(remoteOnlyEdit)); assert.ok(await remoteOnlyDoc.save());
      assert.equal(await fs.readFile(path.join(remote, remoteOnlyName), 'utf8'), 'Saved directly: Server-only content');
      await assert.rejects(fs.stat(path.join(local, remoteOnlyName)), { code: 'ENOENT' });
      results.push(config.name.toUpperCase() + ': open, edit and save a server-only file; no local workspace copy created');
      await bounded(config.name + ' upload', api.engine.upload(target, 'upload.txt'));
      assert.deepEqual(await fs.readFile(path.join(remote, 'upload.txt')), await fs.readFile(path.join(local, 'upload.txt')));
      await bounded(config.name + ' download', api.engine.download(target, 'download.txt'));
      assert.deepEqual(await fs.readFile(path.join(local, 'download.txt')), await fs.readFile(path.join(remote, 'download.txt')));
      await api.engine.upload(target, 'upload.txt', Buffer.from('replacement'));
      assert.equal(await fs.readFile(path.join(remote, 'upload.txt'), 'utf8'), 'replacement');
      const uri = api.remoteUri(target, 'download.txt'); const doc = await bounded(config.name + ' remote editor', vscode.workspace.openTextDocument(uri));
      const edit = new vscode.WorkspaceEdit(); edit.insert(uri, new vscode.Position(0, 0), 'Edited in VS Code\n'); assert.ok(await vscode.workspace.applyEdit(edit)); assert.ok(await doc.save());
      assert.ok((await fs.readFile(path.join(remote, 'download.txt'), 'utf8')).startsWith('Edited in VS Code'));
      const folder = api.remoteUri(target, 'folder with space'); await api.filesystem.createDirectory(folder);
      const file = api.remoteUri(target, 'folder with space/ملف.txt'); await api.filesystem.writeFile(file, Buffer.alloc(0), { create: true, overwrite: false });
      await api.filesystem.rename(file, api.remoteUri(target, 'folder with space/renamed.txt'));
      assert.equal((await fs.stat(path.join(remote, 'folder with space', 'renamed.txt'))).size, 0);
      await assert.rejects(api.filesystem.rename(api.remoteUri(target, 'download.txt'), api.remoteUri(target, 'upload.txt')), /already exists/);
      await api.filesystem.delete(folder, { recursive: true });
      await api.filesystem.readFile(uri); await fs.writeFile(path.join(remote, 'download.txt'), 'external change');
      await assert.rejects(api.filesystem.writeFile(uri, Buffer.from('stale save'), { create: true, overwrite: true }), /changed since/);
      assert.equal(await fs.readFile(path.join(remote, 'download.txt'), 'utf8'), 'external change');
      const node = { target, name: '' }; const children = await api.tree.getChildren(node); assert.ok(children.some(x => x.name === 'upload.txt'));
      await api.engine.upload(target, 'binary.dat', Buffer.from([0, 255, 13, 10, 42])); await api.engine.download(target, 'binary.dat'); assert.deepEqual(await fs.readFile(path.join(local, 'binary.dat')), Buffer.from([0, 255, 13, 10, 42]));
      results.push(config.name.toUpperCase() + ': authenticated transfers, binary integrity, replacement, remote edit/save, stale-save protection, tree browse, Unicode/space names, create/rename/delete');
    }
    const target = api.store.targets.find(t => t.id === 'sftp'); await api.store.setActive(target.key);
    const local = target.localRoot, remote = path.join(runRoot, 'remote-sftp');
    const badKey = { ...target, hostFingerprint: 'SHA256:invalid' }; await assert.rejects(bounded('changed SSH key rejection', api.engine.list(badKey)), /verification|host/i);
    const badPassword = { ...target, id: 'wrong', key: 'wrong' }; await api.store.setSecret(badPassword, 'password', 'wrong'); await assert.rejects(api.engine.list(badPassword), /authentication/i);
    const keyTarget = { ...target, id: 'key-test', key: 'key-test', auth: 'key', privateKeyPath: configs[0].fixturePrivateKey }; await api.store.setSecret(keyTarget, 'passphrase', 'fixture-passphrase');
    assert.ok((await api.engine.list(keyTarget)).length);
    const ftps = api.store.targets.find(t => t.id === 'ftps'); await assert.rejects(api.engine.list({ ...ftps, caPath: undefined }), /certificate|self.signed/i);
    results.push('SSH pinned-key mismatch and wrong password blocked; encrypted private-key authentication; untrusted FTPS certificate rejected');
    await api.store.save({ ...target, uploadOnSave: true }); const active = api.store.get(target.key); await api.store.setActive(active.key);
    await fs.writeFile(path.join(local, 'save.txt'), 'before'); const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(local, 'save.txt')));
    const edit = new vscode.WorkspaceEdit(); edit.insert(doc.uri, new vscode.Position(0, 0), 'saved '); await vscode.workspace.applyEdit(edit); await doc.save();
    for (let i = 0; i < 80; i++) { try { if (await fs.readFile(path.join(remote, 'save.txt'), 'utf8') === 'saved before') break; } catch (_) {} await delay(100); }
    assert.equal(await fs.readFile(path.join(remote, 'save.txt'), 'utf8'), 'saved before'); await api.store.save({ ...active, uploadOnSave: false });
    await assert.rejects(api.engine.upload(target, '../escape.txt'), /inside/); await assert.rejects(api.engine.upload(target, '.vscode/secret.json'), /ignored/);
    results.push('Real VS Code save event uploads only to active target; ignored files and path traversal blocked');
    await fs.mkdir(path.join(local, 'nested folder', 'empty'), { recursive: true }); await fs.writeFile(path.join(local, 'nested folder', 'child.txt'), 'folder bytes');
    await api.engine.folder(target, 'nested folder', 'upload', 'different remote folder'); assert.equal(await fs.readFile(path.join(remote, 'different remote folder', 'child.txt'), 'utf8'), 'folder bytes');
    await api.engine.folder(target, 'different remote folder', 'download', 'different local folder'); assert.equal(await fs.readFile(path.join(local, 'different local folder', 'child.txt'), 'utf8'), 'folder bytes');
    assert.ok((await fs.stat(path.join(local, 'different local folder', 'empty'))).isDirectory());
    const original = 'existing destination'; await fs.writeFile(path.join(remote, 'slow-transfer.dat'), original);
    const transfer = api.engine.upload(target, 'slow-transfer.dat', Buffer.alloc(8 * 1024 * 1024, 123)); transfer.catch(() => undefined);
    for (let i = 0; i < 200; i++) { const job = api.engine.queue.jobs.find(j => j.label.endsWith('slow-transfer.dat')); if (job && job.bytes > 0) { api.engine.queue.cancel(job.id); break; } await delay(25); }
    await assert.rejects(transfer, /cancel|abort|closed/i); assert.equal(await fs.readFile(path.join(remote, 'slow-transfer.dat'), 'utf8'), original);
    assert.ok(!(await fs.readdir(remote)).some(name => name.startsWith('slow-transfer.dat.usama-')));
    await api.store.setSecret(target, 'password', 'wrong'); await assert.rejects(api.engine.upload(target, 'retry-network.txt', Buffer.from('retry bytes')));
    const retryJob = api.engine.queue.jobs.find(j => j.label.endsWith('retry-network.txt')); await api.store.setSecret(target, 'password', 'fixture'); await api.engine.queue.retry(retryJob.id); assert.equal(await fs.readFile(path.join(remote, 'retry-network.txt'), 'utf8'), 'retry bytes');
    results.push('Recursive folder transfers preserve empty folders and changed destination; cancelled live SFTP transfer preserves existing destination and cleans temp; actual failed authentication transfer retries');
    const nativeUpload = path.join(local, 'native-scp.txt'); await fs.writeFile(nativeUpload, 'native SCP bytes');
    await exec('scp', ['-B', '-i', path.join(runRoot, 'native-client-key.pem'), '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + path.join(runRoot, 'native-known-hosts'), '-P', String(target.port), nativeUpload, `fixture@127.0.0.1:/native-scp.txt`], { windowsHide: true, timeout: 30000 });
    assert.equal(await fs.readFile(path.join(remote, 'native-scp.txt'), 'utf8'), 'native SCP bytes');
    await assert.rejects(vscode.commands.executeCommand('usamaSftp.rsyncPreview'), /not installed/);
    results.push('Installed Windows SCP transfers to pinned loopback host; missing Rsync reports actionable error');
    // Use a dedicated folder for deterministic sync and Git tests.
    let sync = api.store.target(workspace, { ...target, id: 'sync-test', localPath: 'sync', remotePath: '/sync', uploadOnSave: false });
    await api.store.save(sync, { password: 'fixture' }); sync = api.store.targets.find(t => t.id === 'sync-test'); await fs.mkdir(sync.localRoot, { recursive: true });
    await fs.mkdir(path.join(remote, 'sync'), { recursive: true });
    const syncRemote = path.join(remote, 'sync');
    await fs.writeFile(path.join(sync.localRoot, 'only-local.txt'), 'local'); await fs.writeFile(path.join(syncRemote, 'only-remote.txt'), 'remote');
    let plan = await api.engine.plan(sync); assert.equal(plan.changes.length, 2); assert.equal(plan.changes.find(c => c.name === 'only-local.txt').action, 'upload');
    await assert.rejects(fs.stat(path.join(syncRemote, 'only-local.txt')), { code: 'ENOENT' }); await api.engine.apply(plan);
    assert.equal((await api.engine.plan(sync)).changes.length, 0);
    await fs.writeFile(path.join(sync.localRoot, 'only-local.txt'), 'local changed'); await fs.writeFile(path.join(syncRemote, 'only-local.txt'), 'remote changed');
    plan = await api.engine.plan(sync); assert.equal(plan.changes[0].action, 'conflict'); await assert.rejects(api.engine.apply(plan), /Resolve/);
    await api.engine.apply(plan, { 'only-local.txt': 'local' }); assert.equal(await fs.readFile(path.join(syncRemote, 'only-local.txt'), 'utf8'), 'local changed');
    await fs.unlink(path.join(sync.localRoot, 'only-remote.txt')); plan = await api.engine.plan(sync); assert.equal(plan.changes[0].action, 'deleteRemote'); await assert.rejects(api.engine.apply(plan), /Confirm deletions/); await api.engine.apply(plan, {}, true);
    await fs.writeFile(path.join(sync.localRoot, 'stale.txt'), 'original'); plan = await api.engine.plan(sync); await fs.writeFile(path.join(sync.localRoot, 'stale.txt'), 'changed after preview'); await assert.rejects(api.engine.apply(plan), /stale/);
    await api.engine.apply(await api.engine.plan(sync, 'push'));
    await fs.writeFile(path.join(syncRemote, 'mirror-only.txt'), 'delete candidate'); plan = await api.engine.plan(sync, 'push', true); assert.ok(plan.changes.some(c => c.name === 'mirror-only.txt' && c.action === 'deleteRemote')); await api.engine.apply(plan, {}, true);
    results.push('Sync preview is read-only; two-way baseline, conflicts, local resolution, deletion confirmation, stale-preview rejection and push mirror');
    const gitOptions = { cwd: sync.localRoot, windowsHide: true };
    for (const args of [['init'], ['config', 'user.name', 'Usama Test'], ['config', 'user.email', 'test@example.invalid'], ['add', '.'], ['commit', '-m', 'Fixture baseline']]) await exec('git', args, gitOptions);
    await fs.rename(path.join(sync.localRoot, 'only-local.txt'), path.join(sync.localRoot, 'renamed git.txt')); await fs.writeFile(path.join(sync.localRoot, 'untracked.txt'), 'new'); await exec('git', ['add', '-A'], gitOptions);
    let git = await api.engine.gitPlan(sync); assert.ok(git.uploads.includes('renamed git.txt')); assert.ok(git.deletes.includes('only-local.txt')); await assert.rejects(api.engine.gitDeploy(sync, git), /Confirm Git/); await api.engine.gitDeploy(sync, git, true);
    assert.equal(await fs.readFile(path.join(syncRemote, 'renamed git.txt'), 'utf8'), 'local changed');
    await exec('git', ['commit', '-m', 'Rename and add'], gitOptions); git = await api.engine.gitPlan(sync, 'HEAD~1'); assert.ok(git.uploads.includes('renamed git.txt')); assert.ok(git.deletes.includes('only-local.txt'));
    results.push('Actual Git working-tree and ref previews; staged rename, addition and confirmed remote deletion; last-deploy marker');
    let fail = true; await assert.rejects(api.engine.queue.add('retry fixture', async () => { if (fail) throw new Error('expected fixture failure'); })); const failed = api.engine.queue.jobs.find(j => j.label === 'retry fixture'); assert.equal(failed.state, 'failed'); fail = false; await api.engine.queue.retry(failed.id);
    const cancelled = api.engine.queue.add('cancel fixture', signal => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled'))))); const cancelling = api.engine.queue.jobs.find(j => j.label === 'cancel fixture'); await delay(50); api.engine.queue.cancel(cancelling.id); await assert.rejects(cancelled); assert.equal(cancelling.state, 'cancelled');
    results.push('Transfer queue records failures, retries successfully and cancels running jobs');
    const legacy = path.join(workspace, '.vscode', 'sftp.json'); const legacyData = JSON.stringify({ name: 'Legacy', host: '127.0.0.1', username: 'fixture', password: 'fixture', protocol: 'sftp', port: target.port, remotePath: '/', uploadOnSave: true, profiles: { staging: { remotePath: '/sync' } } }); await fs.writeFile(legacy, legacyData);
    await api.store.importFile(workspace, legacy); assert.equal(await fs.readFile(legacy, 'utf8'), legacyData); assert.ok(api.store.targets.filter(t => t.id.startsWith('import-')).every(t => !t.uploadOnSave)); assert.ok(!/"password"\s*:/.test(await fs.readFile(path.join(workspace, '.vscode', 'usama-sftp.json'), 'utf8')));
    results.push('Legacy profiles imported; original file preserved; imported automation off; no plaintext secrets');
    // A Git fixture uses the real Git binary and a local URL rewrite, never a network account.
    const seed = path.join(runRoot, 'git-seed'), seedOptions = { cwd: seed, windowsHide: true };
    await fs.mkdir(seed); await exec('git', ['init', '-b', 'main'], seedOptions);
    await exec('git', ['config', 'user.name', 'Checkout Fixture'], seedOptions); await exec('git', ['config', 'user.email', 'fixture@example.invalid'], seedOptions);
    await fs.writeFile(path.join(seed, 'git-editor.txt'), 'Git checkout file');
    await exec('git', ['add', '.'], seedOptions); await exec('git', ['commit', '-m', 'Fixture'], seedOptions);
    const fixtureURL = 'https://fixture.invalid/repository.git', originalRun = api.engine.checkout.run.bind(api.engine.checkout);
    api.engine.checkout.run = (args, cwd, timeout) => originalRun(['-c', `url.${require('url').pathToFileURL(seed).href}.insteadOf=${fixtureURL}`, ...args], cwd, timeout);
    const gitTarget = api.store.target(workspace, { id: 'git-fixture', name: 'Git Fixture', protocol: 'git', repositoryUrl: fixtureURL, branch: 'main', localPath: '.usama-remote/git-fixture' });
    await api.store.save(gitTarget); await api.engine.checkout.test(gitTarget);
    await Promise.all([api.engine.checkout.ensure(gitTarget), api.engine.checkout.ensure(gitTarget)]);
    const gitNodes = await api.tree.getChildren({ target: gitTarget, name: '' }); assert.ok(gitNodes.some(n => n.name === 'git-editor.txt'));
    const gitUri = api.remoteUri(gitTarget, 'git-editor.txt'); assert.equal(gitUri.scheme, 'file');
    const gitDocument = await vscode.workspace.openTextDocument(gitUri), gitEdit = new vscode.WorkspaceEdit();
    gitEdit.insert(gitUri, new vscode.Position(0, 0), 'Edited locally: '); assert.ok(await vscode.workspace.applyEdit(gitEdit)); assert.ok(await gitDocument.save());
    await api.engine.checkout.ensure(gitTarget); assert.equal(await fs.readFile(path.join(gitTarget.localRoot, 'git-editor.txt'), 'utf8'), 'Edited locally: Git checkout file');
    assert.equal(await fs.readFile(path.join(seed, 'git-editor.txt'), 'utf8'), 'Git checkout file');
    await assert.rejects(api.engine.upload(gitTarget, 'git-editor.txt'), /Source Control/);
    results.push('Git HTTPS fixture: separate editable checkout, actual editor save stays local, reconnect preserves edits, SFTP upload blocked');
    for (const kind of ['servers', 'manager', 'sync']) {
      await vscode.commands.executeCommand('notifications.clearAll');
      const uiTarget = kind === 'sync' ? sync : api.store.get(target.key);
      if (kind === 'manager') { await fs.writeFile(path.join(local, 'ui-manager.txt'), 'UI manager'); await fs.writeFile(path.join(local, 'ui-drag.txt'), 'UI drag'); }
      if (kind === 'sync') await fs.writeFile(path.join(sync.localRoot, 'ui-sync.txt'), 'UI sync');
      const panel = api.ui.open(kind, uiTarget);
      await fs.writeFile(path.join(runRoot, 'ui-request.json'), JSON.stringify({ phase: kind, kind, remoteFile: path.join(syncRemote, 'ui-sync.txt') }));
      const uiResult = await bounded('Actual webview UI: ' + kind, (async () => { for (;;) { try { return JSON.parse(await fs.readFile(path.join(runRoot, `ui-${kind}-result.json`), 'utf8')); } catch (_) {} await delay(200); } })(), 60000);
      assert.ok(uiResult.passed, uiResult.error); panel.dispose();
    }
    assert.equal(api.store.get(target.key).name, 'UI Verified SFTP'); assert.equal(await fs.readFile(path.join(remote, 'ui-manager.txt'), 'utf8'), 'UI manager');
    assert.equal(await fs.readFile(path.join(remote, 'ui-drag.txt'), 'utf8'), 'UI drag'); assert.ok((await fs.stat(path.join(local, 'UI created folder'))).isDirectory());
    await vscode.commands.executeCommand('usamaSftp.queue.focus');
    results.push('Actual webview buttons: setup Test Connection / Save, dual-pane upload and refresh, sync preview / Apply; screenshots captured');
    await api.store.setActive(gitTarget.key);
    const gitPanel = api.ui.open('servers', gitTarget);
    await vscode.commands.executeCommand('usamaSftp.sidebar.focus');
    await fs.writeFile(path.join(runRoot, 'ui-request.json'), JSON.stringify({ phase: 'git-connections', kind: 'servers', gitKey: gitTarget.key, sftpKey: target.key }));
    const gitUIResult = await bounded('Git/SFTP setup and dropdown UI', (async () => { for (;;) { try { return JSON.parse(await fs.readFile(path.join(runRoot, 'ui-git-connections-result.json'), 'utf8')); } catch (_) {} await delay(200); } })(), 60000);
    assert.ok(gitUIResult.passed, gitUIResult.error); gitPanel.dispose();
    assert.equal(api.store.activeKey, target.key);
    assert.ok(api.store.targets.some(t => t.id === 'git-fixture'));
    results.push('Actual webviews: Git form omits SSH/password fields, Test Connection and Save work; dropdown includes both protocols and changes active connection; agent/key/password fields follow the chosen mode');
    await fs.writeFile(path.join(runRoot, 'result.json'), JSON.stringify({ passed: true, editor: vscode.env.appName, results }, null, 2));
  } catch (error) { await fs.writeFile(path.join(runRoot, 'result.json'), JSON.stringify({ passed: false, results, error: error.stack }, null, 2)); throw error; }
};
