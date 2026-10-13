import * as vscode from 'vscode';
import { UResource } from '../core';
import { ExplorerItem } from '../modules/remoteExplorer';
import { checkCommand } from './abstract/createCommand';

export default checkCommand({
  id: 'usamaSftp.copyRemotePath',
  async handleCommand(item?: ExplorerItem) {
    if (!item || !item.resource || !UResource.isRemote(item.resource.uri)) {
      return vscode.window.showInformationMessage('Right-click a server, file or folder in Usama SFTP to copy its remote path.');
    }
    await vscode.env.clipboard.writeText(item.resource.fsPath);
  },
});
