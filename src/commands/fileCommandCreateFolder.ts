import { COMMAND_CREATE_FOLDER } from '../constants';
import { createRemoteFolder } from '../fileHandlers';
import { checkFileCommand } from './abstract/createCommand';
import { remoteChild } from './remoteChild';

export default checkFileCommand({
  id: COMMAND_CREATE_FOLDER,
  getFileTarget: (item, items, name) => remoteChild(item, items, 'folder', name),
  handleFile: createRemoteFolder,
});
