const { validateRemoteName } = require('../src/modules/remoteNames');

test.each(['', ' ', '.', '..', '../file', 'folder/file', 'folder\\file', 'name\n', 'name\x00'])
('rejects unsafe remote name %p', name => { expect(validateRemoteName(name)).toBeDefined(); });

test.each(['index.php', 'My Folder', 'ملف.txt', '.env'])
('accepts a single remote basename %p', name => { expect(validateRemoteName(name)).toBeUndefined(); });
