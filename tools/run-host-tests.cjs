const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function main() {
  const root = path.resolve(__dirname, '..');
  const runRoot = path.join(root, '.test-host', 'run-' + Date.now());
  await fs.mkdir(path.join(runRoot, 'workspace'), { recursive: true });
  await fs.mkdir(path.join(runRoot, 'user-data', 'User'), { recursive: true });
  await fs.writeFile(path.join(runRoot, 'user-data', 'User', 'settings.json'), JSON.stringify({
    'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false,
    'update.mode': 'none', 'telemetry.telemetryLevel': 'off', 'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false, 'git.openRepositoryInParentFolders': 'never',
  }));
  const env = { ...process.env, PYTHONPATH: path.join(root, '.test-host', 'python-lib') };
  const server = spawn('python', ['-u', path.join(__dirname, 'loopback_servers.py'), runRoot], { env, windowsHide: true });
  server.stderr.on('data', data => process.stderr.write(data));
  let host;
  const socket = require('node:net').createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const debugPort = socket.address().port; await new Promise(resolve => socket.close(resolve));
  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Loopback server startup timed out')), 30000);
      server.stdout.on('data', data => {
        output += data;
        if (output.includes('"ready": true')) { clearTimeout(timeout); resolve(); }
      });
      server.once('error', error => { clearTimeout(timeout); reject(error); });
      server.once('exit', code => { clearTimeout(timeout); reject(new Error('Fixture server exited: ' + code)); });
    });
    host = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(__dirname, 'run-host-tests.ps1'), '-ProjectRoot', root, '-RunRoot', runRoot,
      '-ExtensionRoot', process.env.USAMA_EXTENSION_PATH || root, '-DebugPort', String(debugPort),
      ...(process.env.USAMA_TEST_IDE_PATH ? ['-IdeExecutable', process.env.USAMA_TEST_IDE_PATH] : [])], { windowsHide: true });
    host.stdout.on('data', data => process.stdout.write(data));
    host.stderr.on('data', data => process.stderr.write(data));
    let finished = false;
    const driver = require('./ui-driver.cjs').drive(runRoot, debugPort, () => finished);
    await new Promise((resolve, reject) => {
      host.once('error', reject);
      host.once('exit', () => { finished = true; resolve(); });
    });
    await driver;
    const result = JSON.parse(await fs.readFile(path.join(runRoot, 'result.json'), 'utf8'));
    if (process.env.USAMA_TEST_IDE_PATH) {
      result.editorApiName = result.editor;
      result.editor = path.basename(process.env.USAMA_TEST_IDE_PATH, '.exe');
      result.ideExecutable = process.env.USAMA_TEST_IDE_PATH;
    }
    result.extensionRoot = process.env.USAMA_EXTENSION_PATH || root;
    await fs.writeFile(path.join(runRoot, 'result.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, runRoot }, null, 2));
    if (!result.passed) throw new Error(result.error);
  } finally {
    server.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
