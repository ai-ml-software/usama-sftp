const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { importConfig } = require('../src/modules/importConfig');

describe('configuration import', () => {
  let root;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'usama-import-')); });
  afterEach(async () => { await fs.remove(root); });

  test('imports multiple servers and nested profiles with automatic transfers off', async () => {
    const source = path.join(root, 'source.json');
    const config = [{ host: '127.0.0.1', username: 'fixture', remotePath: '/', password: 'fixture',
      protocol: 'ftp', uploadOnSave: true, downloadOnOpen: true,
      watcher: { files: '**/*', autoUpload: true, autoDelete: true },
      profiles: { production: { host: 'example.invalid', uploadOnSave: true,
        watcher: { files: '**/*', autoDelete: true } } } }];
    await fs.writeJson(source, config);
    const destination = await importConfig(source, root);
    expect(destination).toBe(path.join(root, '.vscode', 'usama-sftp.json'));
    expect(await fs.readJson(source)).toEqual(config);
    const [imported] = await fs.readJson(destination);
    expect(imported.password).toBe('fixture');
    expect(imported.protocol).toBe('ftp');
    expect(imported.uploadOnSave).toBe(false);
    expect(imported.downloadOnOpen).toBe(false);
    expect(imported.watcher.autoUpload).toBe(false);
    expect(imported.watcher.autoDelete).toBe(false);
    expect(imported.profiles.production.host).toBe('example.invalid');
    expect(imported.profiles.production.uploadOnSave).toBe(false);
    expect(imported.profiles.production.watcher.autoDelete).toBe(false);
  });

  test('never overwrites an existing Usama configuration', async () => {
    const source = path.join(root, 'source.json');
    const existing = path.join(root, '.vscode', 'usama-sftp.json');
    await fs.outputJson(existing, { keep: true });
    await fs.writeJson(source, { host: '127.0.0.1', username: 'fixture', remotePath: '/' });
    await expect(importConfig(source, root)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await fs.readJson(existing)).toEqual({ keep: true });
  });

  test.each([[], null, 'invalid', { host: '127.0.0.1' }])('rejects invalid source %p', async value => {
    const source = path.join(root, 'source.json');
    await fs.writeJson(source, value);
    await expect(importConfig(source, root)).rejects.toThrow('valid SFTP configuration');
    expect(await fs.pathExists(path.join(root, '.vscode', 'usama-sftp.json'))).toBe(false);
  });
});
