const { syncChanges, resolve, relativeName, childName } = require('../src/modern/model');
const stamp = (hash, mtime = 1) => ({ hash, mtime, size: 1 });
describe('content-based sync planning', () => {
  test.each([
    ['initial local', { f: stamp('a') }, {}, {}, 'upload'],
    ['initial remote', {}, { f: stamp('a') }, {}, 'download'],
    ['initial conflict', { f: stamp('a') }, { f: stamp('b') }, {}, 'conflict'],
    ['local edited', { f: stamp('b') }, { f: stamp('a') }, { f: stamp('a') }, 'upload'],
    ['remote edited', { f: stamp('a') }, { f: stamp('b') }, { f: stamp('a') }, 'download'],
    ['both edited', { f: stamp('b') }, { f: stamp('c') }, { f: stamp('a') }, 'conflict'],
    ['local deleted', {}, { f: stamp('a') }, { f: stamp('a') }, 'deleteRemote'],
    ['remote deleted', { f: stamp('a') }, {}, { f: stamp('a') }, 'deleteLocal'],
    ['local deleted and remote edited', {}, { f: stamp('b') }, { f: stamp('a') }, 'conflict'],
    ['remote deleted and local edited', { f: stamp('b') }, {}, { f: stamp('a') }, 'conflict'],
  ])('%s', (name, local, remote, baseline, expected) => { expect(syncChanges(local, remote, baseline)[0].action).toBe(expected); });
  test('matching hashes and both deleted have no action', () => {
    expect(syncChanges({ f: stamp('a', 99) }, { f: stamp('a', 1) }, {})).toEqual([]);
    expect(syncChanges({}, {}, { f: stamp('a') })).toEqual([]);
  });
  test('mirror deletion is opt-in', () => {
    expect(syncChanges({}, { f: stamp('a') }, {}, 'push')).toEqual([]);
    expect(syncChanges({}, { f: stamp('a') }, {}, 'push', true)[0].action).toBe('deleteRemote');
    expect(syncChanges({ f: stamp('a') }, {}, {}, 'pull', true)[0].action).toBe('deleteLocal');
  });
  test('resolve conflicts including deletion and equal timestamp ambiguity', () => {
    const c = { name: 'f', action: 'conflict', local: stamp('a', 2), remote: stamp('b') };
    expect(resolve(c, 'local')).toBe('upload'); expect(resolve(c, 'remote')).toBe('download'); expect(resolve(c, 'newer')).toBe('upload');
    expect(resolve({ ...c, local: undefined }, 'local')).toBe('deleteRemote');
    expect(resolve({ ...c, remote: undefined }, 'remote')).toBe('deleteLocal');
    expect(() => resolve({ ...c, remote: stamp('b', 2) }, 'newer')).toThrow('Choose'); expect(() => resolve(c, '')).toThrow('Resolve');
  });
  test.each(['../x', 'folder/../x', '/etc/passwd', 'C:\\x', 'a\u0000b'])('rejects escaping paths %s', name => expect(() => relativeName(name)).toThrow());
  test.each(['..', '.', '', 'x/y', 'x\\y'])('rejects invalid child name %s', name => expect(() => childName(name)).toThrow());
  test('preserves Unicode and spaces', () => expect(childName('ملف test.txt')).toBe('ملف test.txt'));
  test.each(['__proto__', 'constructor', 'toString'])('handles special dictionary filename %s', name => {
    const local = Object.create(null); local[name] = stamp('a');
    expect(syncChanges(local, {}, {})[0]).toMatchObject({ name, action: 'upload' });
  });
});
