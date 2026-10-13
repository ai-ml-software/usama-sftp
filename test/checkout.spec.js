const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');
const { GitCheckout, repositoryUrl } = require('../src/modern/checkout');

describe('separate editable Git checkouts', () => {
  let root, workspace, seed, checkout, target;
  const url = 'https://fixture.invalid/repository.git';
  const git = (args, cwd) => execFileSync('git', args, { cwd, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'usama-checkout-test-'));
    workspace = path.join(root, 'workspace'); seed = path.join(root, 'seed');
    fs.mkdirSync(workspace); fs.mkdirSync(seed);
    git(['init', '-b', 'main'], seed); git(['config', 'user.name', 'Checkout Test'], seed); git(['config', 'user.email', 'test@example.invalid'], seed);
    fs.writeFileSync(path.join(seed, 'hello.txt'), 'repository file');
    git(['add', '.'], seed); git(['commit', '-m', 'fixture'], seed);
    checkout = new GitCheckout();
    const run = checkout.run.bind(checkout);
    // Real Git cloning over a local transport: no network or real-account mutations.
    checkout.run = (args, cwd, timeout) => run(['-c', `url.${pathToFileURL(seed).href}.insteadOf=${url}`, ...args], cwd, timeout);
    target = { workspace, localRoot: path.join(workspace, '.usama-remote', 'repository'), repositoryUrl: url, branch: 'main' };
  });
  afterEach(() => {
    if (root && path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('usama-checkout-test-')) fs.rmSync(root, { recursive: true, force: true });
  });
  test('tests access, creates a separate checkout once, and preserves local edits on reconnect', async () => {
    expect(await checkout.test(target)).toBe(git(['rev-parse', 'HEAD'], seed).trim());
    await Promise.all([checkout.ensure(target), checkout.ensure(target)]);
    expect(fs.readFileSync(path.join(target.localRoot, 'hello.txt'), 'utf8')).toBe('repository file');
    fs.writeFileSync(path.join(target.localRoot, 'hello.txt'), 'local edit');
    await checkout.ensure(target);
    expect(fs.readFileSync(path.join(target.localRoot, 'hello.txt'), 'utf8')).toBe('local edit');
    expect(fs.readFileSync(path.join(seed, 'hello.txt'), 'utf8')).toBe('repository file');
    expect(git(['status', '--porcelain'], target.localRoot)).toContain('hello.txt');
    expect(fs.readdirSync(path.dirname(target.localRoot))).toEqual(['repository']);
  });
  test('refuses an unrelated repository and a populated destination', async () => {
    await checkout.ensure(target);
    git(['remote', 'set-url', 'origin', 'https://fixture.invalid/other.git'], target.localRoot);
    await expect(checkout.ensure(target)).rejects.toThrow('another repository');
    target.localRoot = path.join(workspace, 'existing'); fs.mkdirSync(target.localRoot);
    fs.writeFileSync(path.join(target.localRoot, 'keep.txt'), 'keep');
    await expect(checkout.ensure(target)).rejects.toThrow('already exists');
    expect(fs.readFileSync(path.join(target.localRoot, 'keep.txt'), 'utf8')).toBe('keep');
  });
  test('rejects parent checkout, traversal and option-like branch before cloning', async () => {
    await expect(checkout.ensure({ ...target, localRoot: workspace })).rejects.toThrow('separate checkout');
    await expect(checkout.ensure({ ...target, localRoot: path.join(root, 'outside') })).rejects.toThrow('separate checkout');
    await expect(checkout.ensure({ ...target, branch: '--upload-pack=x' })).rejects.toThrow('branch');
    expect(fs.existsSync(target.localRoot)).toBe(false);
  });
  test.each(['http://github.com/a/b.git', 'sftp://github.com/a/b.git', 'https://user:secret@github.com/a/b.git', 'https://github.com/a/b.git?token=secret'])('rejects unsupported or credential-bearing URL %s', value => {
    expect(() => repositoryUrl(value)).toThrow();
  });
});
