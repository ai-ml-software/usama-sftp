import { window } from 'vscode';
import app from '../app';
import { upath, UResource } from '../core';
import { handleCtxFromUri } from '../fileHandlers';
import { ExplorerItem } from '../modules/remoteExplorer';
import { validateRemoteName } from '../modules/remoteNames';
import { checkCommand } from './abstract/createCommand';

export default checkCommand({
  id: 'usamaSftp.renameRemote',
  async handleCommand(item?: ExplorerItem, providedName?: string) {
    if (!item || !item.resource || !UResource.isRemote(item.resource.uri) || (item as any).explorerContext) {
      return window.showInformationMessage('Right-click a remote file or folder in Usama SFTP to rename it.');
    }
    const source = item.resource.fsPath;
    const currentName = upath.basename(source);
    const name = providedName === undefined ? await window.showInputBox({ prompt: 'New remote name', value: currentName,
      validateInput: validateRemoteName }) : providedName;
    if (name === undefined || name === currentName) return;
    const error = validateRemoteName(name);
    if (error) throw new Error(error);
    const { fileService, config } = handleCtxFromUri(item.resource.uri);
    const fs = await fileService.getRemoteFileSystem(config);
    const parent = upath.dirname(source);
    const entries = await fs.list(parent);
    if (entries.some(entry => entry.name === name)) {
      throw new Error('A remote file or folder already has that name.');
    }
    await fs.rename(source, upath.join(parent, name));
    app.remoteExplorer.refresh();
  },
});
