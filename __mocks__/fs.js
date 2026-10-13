const { fs } = require('memfs');

// Materialize stream getters before graceful-fs clones the fs module.
const mockFs = { ...fs, __mock__: true };
mockFs.realpath.native = mockFs.realpath;
mockFs.realpathSync.native = mockFs.realpathSync;
// memfs does not derive Writable.autoDestroy from fs.WriteStream.autoClose.
// Match Node: keep a supplied descriptor open until the transfer closes it.
mockFs.createWriteStream = (file, options) => fs.createWriteStream(file, {
  ...options, autoDestroy: !(options && options.autoClose === false),
});
module.exports = mockFs;
