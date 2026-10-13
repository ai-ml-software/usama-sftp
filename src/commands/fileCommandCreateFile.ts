import { COMMAND_CREATE_FILE } from '../constants';
import { createRemoteFile } from '../fileHandlers';
import { checkFileCommand } from './abstract/createCommand';
import { remoteChild } from './remoteChild';

export default checkFileCommand({
  id: COMMAND_CREATE_FILE,
  getFileTarget: (item, items, name) => remoteChild(item, items, 'file', name),
  handleFile: createRemoteFile,
});
