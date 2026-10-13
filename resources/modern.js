(function () {
  'use strict';
  const api = acquireVsCodeApi(), app = document.getElementById('app'), kind = document.body.dataset.kind;
  let state = { servers: [], jobs: [], workspaces: [], connections: {} }, selected = document.body.dataset.server, id = 0, pending = new Map(), folder = { local: '', remote: '' }, row = { local: null, remote: null }, changes = [], gitMode = false, draft = null;
  const el = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
  const current = () => state.servers.find(s => s.key === selected) || state.servers.find(s => s.key === state.active) || state.servers[0];
  const send = (action, values = {}) => new Promise((resolve, reject) => { const request = ++id; pending.set(request, { resolve, reject }); api.postMessage({ action, id: request, key: current()?.key, ...values }); });
  const notice = (text, error = false) => { let n = document.getElementById('notice'); if (!n) { n = el('div'); n.id = 'notice'; app.append(n); } n.textContent = text || ''; n.className = error ? 'error' : ''; };
  const run = async fn => { try { notice('Working…'); const result = await fn(); notice(result?.message || 'Done.'); return result; } catch (e) { notice(e.message, true); } };
  const button = (text, fn, secondary = false) => { const b = el('button', text, secondary ? 'secondary' : ''); b.type = 'button'; b.onclick = () => run(async () => { b.disabled = true; try { return await fn(); } finally { b.disabled = false; } }); return b; };
  function select(items, value) { const s = el('select'); items.forEach(([v, text]) => { const o = el('option', text); o.value = v; s.append(o); }); s.value = value || items[0]?.[0]; return s; }
  const label = t => `${t.name} (${t.protocol === 'git' ? 'Git / HTTPS' : t.protocol.toUpperCase()})`;
  function serverChooser(container) { const s = select(state.servers.map(t => [t.key, label(t)]), current()?.key); s.className = 'connection-select'; s.setAttribute('aria-label', 'Connection'); s.onchange = () => run(async () => { selected = s.value; draft = null; folder = { local: '', remote: '' }; await send('active'); render(); }); container.append(s); }
  function field(container, label, name, value, type = 'text') { const l = el('label', label), input = el(type === 'textarea' ? 'textarea' : 'input'); input.name = name; if (type !== 'textarea') input.type = type; input.value = value || ''; container.append(l, input); return input; }
  function checkbox(container, text, name, checked) { const label = el('label', text, 'check'), input = el('input'); input.type = 'checkbox'; input.name = name; input.checked = !!checked; label.prepend(input); container.append(label); return input; }
  function shell(title, description) { app.replaceChildren(el('h1', title), el('div', description, 'muted')); }
  function overview() {
    shell('Usama SFTP', 'SFTP · FTP · FTPS · Git'); app.className = 'sideview';
    const toolbar = el('div', undefined, 'toolbar'); serverChooser(toolbar); app.append(toolbar);
    const t = current();
    toolbar.append(button('Add / Edit Servers', () => send('configure')), button('Connect', () => send('connect')));
    if (t) {
      app.append(el('p', t.protocol === 'git' ? `${t.repositoryUrl}\nBranch: ${t.branch}\nCheckout: ${t.localPath}` : `${t.host}:${t.port}${t.remotePath}`, 'path'));
      app.append(el('p', t.protocol === 'git' ? 'HTTPS uses your saved Git sign-in. No SSH key required. Files save locally; commit and push from Source Control.' : t.auth === 'agent' ? 'SSH agent: uses your loaded key. No key or password needs to be entered here.' : t.auth === 'key' ? 'Private key: choose your key in Add / Edit Servers. Its passphrase is stored securely.' : 'Password: enter it in Add / Edit Servers; it is stored securely.', 'muted'));
      const status = state.connections?.[t.key]; if (status) app.append(el('p', status.message, status.ok ? 'connection-ok' : 'error'));
      if (t.protocol === 'git') toolbar.append(button('Open Local Checkout', () => send('checkout')), button('Sign in with Git', () => send('gitSignIn')));
      else toolbar.append(button('Sync / Deploy', () => send('syncWindow')), button('Toggle Upload on Save', () => send('toggle')));
      toolbar.append(button('File Manager', () => send('manager')));
      if (t.protocol !== 'git') app.append(el('p', `Upload on save: ${t.uploadOnSave ? 'On' : 'Off'}`));
    }
    toolbar.append(button('Open Config File', () => send('configFile')), button('Refresh Connections', () => send('reload')), button('Import sftp.json', () => send('import')));
    app.append(el('p', `${state.jobs.filter(j => ['queued', 'running'].includes(j.state)).length} transfers active`, 'muted'));
  }
  function servers() {
    shell('SFTP / FTP Servers', 'SFTP servers and Git repositories. Passwords and passphrases are stored securely, outside the config file.');
    const grid = el('div', undefined, 'grid'), nav = el('div', undefined, 'servers'), form = el('form'); grid.append(nav, form); app.append(grid);
    for (const s of state.servers) nav.append(button(`${label(s)}\n${s.protocol === 'git' ? s.repositoryUrl : s.host + s.remotePath}`, async () => { selected = s.key; draft = null; render(); }));
    nav.append(button('+ Add server', async () => { selected = 'new'; draft = null; render(); }), button('Open Config File', () => send('configFile')));
    const t = draft || (selected === 'new' ? {} : current() || {}), workspace = select(state.workspaces.map(p => [p, p]), t.workspace);
    form.append(el('label', 'Workspace'), workspace);
    field(form, 'Name', 'name', t.name || 'Production'); const protocol = select([['sftp', 'SFTP'], ['ftp', 'FTP'], ['ftps', 'FTPS'], ['git', 'Git repository (HTTPS)']], t.protocol); protocol.name = 'protocol'; form.append(el('label', 'Protocol'), protocol);
    protocol.onchange = () => { draft = { ...t, workspace: workspace.value, name: form.elements.name.value, protocol: protocol.value, port: protocol.value === 'sftp' ? 22 : 21 }; render(); };
    if (t.protocol === 'git') { gitServerForm(form, workspace, t, protocol); return; }
    field(form, 'Host', 'host', t.host); field(form, 'Port', 'port', t.port || 22, 'number');
    field(form, 'User name', 'username', t.username);
    const auth = select([['agent', 'SSH agent (use a loaded key)'], ['key', 'Private key file'], ['password', 'Password']], t.auth || 'agent'); auth.name = 'auth'; form.append(el('label', 'SFTP authentication'), auth);
    field(form, 'Password (leave blank to keep stored password)', 'password', '', 'password'); checkbox(form, 'Clear stored password', 'clearpassword', false);
    field(form, 'Private key path', 'privateKeyPath', t.privateKeyPath); form.append(button('Choose key…', async () => { const p = await send('chooseKey'); if (p) form.elements.privateKeyPath.value = p; }));
    field(form, 'Key passphrase (leave blank to keep stored passphrase)', 'passphrase', '', 'password'); checkbox(form, 'Clear stored passphrase', 'clearpassphrase', false);
    const authHelp = el('p', '', 'muted'); form.append(authHelp);
    const showAuth = () => {
      const show = (name, visible) => { const input = form.elements[name]; if (input.type === 'checkbox') input.parentElement.hidden = !visible; else { input.hidden = !visible; input.previousElementSibling.hidden = !visible; } };
      for (const name of ['password', 'clearpassword']) show(name, t.protocol !== 'sftp' && protocol.value !== 'sftp' || auth.value === 'password');
      for (const name of ['privateKeyPath', 'passphrase', 'clearpassphrase']) show(name, protocol.value === 'sftp' && auth.value === 'key');
      for (const b of form.querySelectorAll('button')) if (b.textContent === 'Choose key…') b.hidden = protocol.value !== 'sftp' || auth.value !== 'key';
      auth.hidden = protocol.value !== 'sftp'; auth.previousElementSibling.hidden = auth.hidden;
      authHelp.textContent = protocol.value !== 'sftp' ? 'Enter the hosting password here. It stays out of the configuration file.' : auth.value === 'agent' ? 'Uses the SSH key already loaded in your SSH agent. You do not need to enter a key or password here.' : auth.value === 'key' ? 'Choose a private key file (not the .pub file). Enter its passphrase only if the key is encrypted.' : 'Enter your SFTP account password here. It stays out of the configuration file.';
    }; auth.onchange = showAuth; showAuth();
    form.append(el('h2', 'Folders')); field(form, 'Remote folder', 'remotePath', t.remotePath || '/');
    field(form, 'Local folder (relative to workspace or absolute)', 'localPath', t.localPath || '.'); form.append(button('Browse local…', async () => { const p = await send('chooseLocal'); if (p) form.elements.localPath.value = p; }));
    form.append(el('h2', 'Behaviour')); checkbox(form, 'Upload on save', 'uploadOnSave', t.uploadOnSave); checkbox(form, 'Default server', 'defaultServer', t.key === state.active);
    field(form, 'Ignore — one .gitignore pattern per line', 'ignore', (t.ignore || ['node_modules', '.DS_Store']).join('\n'), 'textarea');
    form.append(el('h2', 'FTPS / SSH trust')); checkbox(form, 'Implicit FTPS (usually port 990)', 'implicitTls', t.implicitTls);
    field(form, 'Additional trusted CA file (PEM)', 'caPath', t.caPath); form.append(button('Choose CA…', async () => { const p = await send('chooseCA'); if (p) form.elements.caPath.value = p; }));
    field(form, 'Pinned SSH fingerprint (optional SHA256:…)', 'hostFingerprint', t.hostFingerprint);
    const values = () => { const get = n => form.elements[n].value; return { workspace: workspace.value, server: { id: t.id, name: get('name'), host: get('host'), port: Number(get('port')), protocol: get('protocol'), username: get('username'), auth: get('auth'), privateKeyPath: get('privateKeyPath'), remotePath: get('remotePath'), localPath: get('localPath'), uploadOnSave: form.elements.uploadOnSave.checked, ignore: get('ignore').split('\n').filter(Boolean), implicitTls: form.elements.implicitTls.checked, caPath: get('caPath') || undefined, hostFingerprint: get('hostFingerprint') || undefined }, secrets: { password: get('password'), passphrase: get('passphrase'), clearpassword: form.elements.clearpassword.checked, clearpassphrase: form.elements.clearpassphrase.checked, defaultServer: form.elements.defaultServer.checked } }; };
    form.append(button('Browse remote…', async () => {
      const picker = el('div', undefined, 'pane'); form.append(picker);
      let remote = (form.elements.remotePath.value || '/').replace(/^\//, '');
      const load = async () => {
        const result = await send('browseFolder', { ...values(), folder: remote }); picker.replaceChildren(el('p', '/' + remote));
        picker.append(button('↑ Parent', async () => { remote = remote.split('/').slice(0, -1).join('/'); await load(); }));
        for (const entry of result.entries) picker.append(button('📁 ' + entry.name, async () => { remote = [remote, entry.name].filter(Boolean).join('/'); await load(); }));
        picker.append(button('Select this folder', async () => { form.elements.remotePath.value = '/' + remote; picker.remove(); }));
      }; await load();
    }));
    finishServerForm(form, values);
    form.onsubmit = e => e.preventDefault();
  }
  function finishServerForm(form, values) {
    const toolbar = el('div', undefined, 'toolbar'); toolbar.append(button('Test Connection', () => send('test', values())), button('Save Server', async () => { const result = await send('save', values()); selected = result.key; draft = null; state = await send('ready'); render(); return result; })); form.append(toolbar); form.onsubmit = e => e.preventDefault();
  }
  function gitServerForm(form, workspace, t, protocol) {
    form.append(el('p', 'Use a GitHub HTTPS URL. Git uses your saved sign-in; no SFTP username, port, password or SSH key is needed.', 'muted'));
    field(form, 'Repository HTTPS URL', 'repositoryUrl', t.repositoryUrl || 'https://github.com/owner/repository.git');
    field(form, 'Branch', 'branch', t.branch || 'main');
    field(form, 'Separate local checkout folder', 'localPath', t.localPath || '.usama-remote/usama-github');
    form.append(el('p', 'Connect creates this checkout once. Opening a file edits its local copy. Use Source Control to commit and push; reconnecting preserves your local edits.', 'muted'));
    checkbox(form, 'Default connection', 'defaultServer', t.key === state.active);
    const values = () => ({ workspace: workspace.value, server: { id: t.id, name: form.elements.name.value, protocol: protocol.value, repositoryUrl: form.elements.repositoryUrl.value, branch: form.elements.branch.value, localPath: form.elements.localPath.value }, secrets: { defaultServer: form.elements.defaultServer.checked } });
    form.append(button('Sign in with Git', () => send('gitSignIn', values()))); finishServerForm(form, values);
  }
  function queue() {
    shell('Transfers', 'Progress, cancellation and retry'); const actions = el('div', undefined, 'toolbar');
    actions.append(button('Cancel all', () => send('cancel')), button('Retry failed', () => send('retry')), button('Clear finished', () => send('clear'))); app.append(actions);
    const table = el('table'); app.append(table);
    for (const job of state.jobs) { const tr = el('tr'); tr.append(el('td', job.label), el('td', job.state), el('td', `${Math.round(job.bytes / 1024)} / ${Math.round(job.total / 1024)} KB · ${Math.round(job.speed / 1024)} KB/s`)); const td = el('td'); if (['queued', 'running'].includes(job.state)) td.append(button('Cancel', () => send('cancel', { job: job.id }))); if (['failed', 'cancelled'].includes(job.state)) td.append(button('Retry', () => send('retry', { job: job.id }))); tr.append(td); table.append(tr); if (job.error) { const err = el('tr'); err.append(el('td', job.error)); table.append(err); } }
  }
  function manager() {
    if (current()?.protocol === 'git') { repository(); return; }
    shell('File Manager', 'Select a file, then upload/download. Double-click folders to browse or files to edit. Drag between panes to transfer.'); const toolbar = el('div', undefined, 'toolbar'); serverChooser(toolbar); toolbar.append(button('Refresh', async () => { await Promise.all(['local', 'remote'].map(loadPane)); })); app.append(toolbar);
    const panes = el('div', undefined, 'two'); app.append(panes);
    for (const side of ['local', 'remote']) {
      const pane = el('div', undefined, 'pane'); pane.id = 'pane-' + side; pane.tabIndex = 0; pane.append(el('h2', side === 'local' ? 'Local' : 'Server')); const actions = el('div', undefined, 'actions'); pane.append(actions);
      const transfer = async () => { const r = row[side]; if (!r) throw new Error('Select a file or folder.'); await send('transfer', { side, name: r.path }); await Promise.all(['local', 'remote'].map(loadPane)); };
      const remove = async () => { if (row[side]) { await send('delete', { side, name: row[side].path }); await loadPane(side); } };
      const rename = async () => { const r = row[side]; if (r) { const name = await send('askName', { prompt: 'New name', value: r.name }); if (name) { await send('rename', { side, name: r.path, newName: name }); await loadPane(side); } } };
      actions.append(button('↑ Parent', async () => { folder[side] = folder[side].split('/').slice(0, -1).join('/'); await loadPane(side); }), button(side === 'local' ? 'Upload →' : '← Download', transfer), button('New folder', async () => { const name = await send('askName', { prompt: 'Folder name' }); if (name) { await send('mkdir', { side, folder: folder[side], name }); await loadPane(side); } }), button('Rename', rename), button('Delete', remove), button('Diff', () => { if (!row[side]) throw new Error('Select a file.'); return send('diff', { name: row[side].path }); }));
      const path = el('p', '/', 'path'); path.id = 'path-' + side; const table = el('table'); table.id = 'files-' + side; pane.append(path, table); panes.append(pane);
      pane.onkeydown = e => { if (e.target.tagName === 'BUTTON') return; if (['F5', 'F2', 'Delete', 'Enter', 'Backspace'].includes(e.key)) e.preventDefault(); run(async () => { if (e.key === 'F5') await loadPane(side); if (e.key === 'F2') await rename(); if (e.key === 'Delete') await remove(); if (e.key === 'Enter' && row[side]) await openRow(side, row[side]); if (e.key === 'Backspace') { folder[side] = folder[side].split('/').slice(0, -1).join('/'); await loadPane(side); } if (e.key === 'F6' || e.key === 'F7') await transfer(); }); };
      pane.ondragover = e => e.preventDefault(); pane.ondrop = e => { e.preventDefault(); run(async () => { const data = JSON.parse(e.dataTransfer.getData('application/usama-sftp')); if (data.side === side) return; const destination = [folder[side], data.name].filter(Boolean).join('/'); await send('transfer', { side: data.side, name: data.path, destination }); await loadPane(side); }); };
    }
    Promise.all(['local', 'remote'].map(loadPane)).catch(e => notice(e.message, true));
  }
  function repository() {
    shell('Git Checkout', 'Files save locally. Use Source Control to review, commit and push your changes.');
    const toolbar = el('div', undefined, 'toolbar'); serverChooser(toolbar); toolbar.append(button('Connect', async () => { await send('connect'); await loadPane('local'); }), button('Open Local Checkout', () => send('checkout')), button('Refresh', () => loadPane('local'))); app.append(toolbar);
    const pane = el('div', undefined, 'pane'); pane.id = 'pane-local'; pane.append(button('↑ Parent', async () => { folder.local = folder.local.split('/').slice(0, -1).join('/'); await loadPane('local'); }));
    const path = el('p', '/', 'path'); path.id = 'path-local'; const table = el('table'); table.id = 'files-local'; pane.append(path, table); app.append(pane); loadPane('local').catch(e => notice(e.message, true));
  }
  async function openRow(side, r) { if (r.directory) { folder[side] = r.path; await loadPane(side); } else await send('open', { side, name: r.path }); }
  async function loadPane(side) {
    if (!current()) return; const result = await send('list', { side, folder: folder[side] }); const table = document.getElementById('files-' + side); if (!table) return; table.replaceChildren(); document.getElementById('path-' + side).textContent = '/' + result.folder; row[side] = null;
    result.entries.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)).forEach(entry => { const r = { ...entry, path: [result.folder, entry.name].filter(Boolean).join('/') }, tr = el('tr', undefined, 'file'); tr.draggable = true; tr.append(el('td', (r.directory ? '📁 ' : '') + r.name), el('td', r.directory ? '' : `${r.size} B`)); tr.onclick = () => { for (const sibling of table.children) sibling.classList.remove('selected'); tr.classList.add('selected'); row[side] = r; }; tr.ondblclick = () => run(() => openRow(side, r)); tr.ondragstart = e => { e.dataTransfer.setData('application/usama-sftp', JSON.stringify({ side, ...r })); }; table.append(tr); });
  }
  function sync() {
    if (current()?.protocol === 'git') { repository(); return; }
    shell('Sync / Git Deploy', 'Review the preview and resolve conflicts before applying changes. Content hashes detect edits on both sides.'); const toolbar = el('div', undefined, 'toolbar'); serverChooser(toolbar); app.append(toolbar);
    const mode = select([['both', 'Two-way sync'], ['push', 'Push local → server'], ['pull', 'Pull server → local']], 'both'); toolbar.append(mode); const deletes = checkbox(app, 'Mirror deletions (push / pull only)', 'deletes', false);
    const choices = Object.create(null), table = el('table'); const confirm = checkbox(app, 'I confirm the deletions shown in the preview', 'confirm', false);
    const show = result => { changes = result.changes; table.replaceChildren(); for (const c of changes) { const tr = el('tr'); tr.append(el('td', c.name), el('td', c.action)); if (c.action === 'conflict') { const s = select([['', 'Resolve…'], ['local', 'Keep local'], ['remote', 'Keep server'], ['newer', 'Keep newer']], ''); s.onchange = () => choices[c.name] = s.value; const td = el('td'); td.append(s); tr.append(td); } table.append(tr); } notice(`${changes.length} changes. No files have been changed.`); };
    toolbar.append(button('Preview Sync', async () => { gitMode = false; show(await send('plan', { mode: mode.value, deletes: deletes.checked })); }));
    const all = el('div', undefined, 'toolbar'); for (const [choice, title] of [['local', 'Keep all local'], ['remote', 'Keep all server'], ['newer', 'Keep all newer']]) all.append(button(title, async () => { for (const c of changes.filter(c => c.action === 'conflict')) choices[c.name] = choice; for (const select of table.querySelectorAll('select')) select.value = choice; })); app.append(all);
    app.append(el('h2', 'Git deployment')); const gitToolbar = el('div', undefined, 'toolbar'), gitSelect = select([['working', 'Uncommitted changes'], ['lastDeploy', 'Since last deploy'], ['ref', 'Since a Git ref']], 'working'), ref = el('input'); ref.placeholder = 'Git ref, e.g. HEAD~1'; gitToolbar.append(gitSelect, ref, button('Preview Git Changes', async () => { gitMode = true; show(await send('gitPlan', { mode: gitSelect.value, ref: ref.value || undefined })); })); app.append(gitToolbar, table, button('Apply Reviewed Changes', () => send(gitMode ? 'gitApply' : 'apply', { choices, confirmDeletes: confirm.checked })));
  }
  function render() { if (kind === 'servers') servers(); else if (kind === 'manager') manager(); else if (kind === 'sync') sync(); else if (kind === 'queue') queue(); else overview(); }
  window.addEventListener('message', event => { const m = event.data; if (m.type === 'state') {
    const previous = current(); if (kind !== 'servers' && m.data.active !== state.active) selected = m.data.active; state = m.data;
    if (['overview', 'queue'].includes(kind) || ['manager', 'sync'].includes(kind) && previous?.protocol !== current()?.protocol) render();
    else for (const chooser of document.querySelectorAll('.connection-select')) { chooser.replaceChildren(); for (const t of state.servers) { const option = el('option', label(t)); option.value = t.key; chooser.append(option); } chooser.value = current()?.key || ''; }
  } else if (m.type === 'response') { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); if (m.error) p.reject(new Error(m.error)); else p.resolve(m.data); } });
  send('ready').then(s => { state = s; render(); }).catch(e => notice(e.message, true));
})();
