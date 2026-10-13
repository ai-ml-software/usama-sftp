import * as vscode from 'vscode';
import * as fse from 'fs-extra';
import * as path from 'path';
import { CONFIG_PATH } from '../constants';
import { importConfig } from '../modules/importConfig';
import { checkCommand } from './abstract/createCommand';

export default checkCommand({
  id: 'usamaSftp.importConfig',
  async handleCommand() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || !folders.length) {
      return vscode.window.showInformationMessage('Open a project folder before importing a server.');
    }
    const choices = folders.map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder }));
    const selection = choices.length === 1 ? choices[0] :
      await vscode.window.showQuickPick(choices, { placeHolder: 'Import servers into which project?' });
    if (!selection) return;
    const workspacePath = selection.folder.uri.fsPath;
    const destination = path.join(workspacePath, CONFIG_PATH);
    if (await fse.pathExists(destination)) {
      await vscode.window.showInformationMessage('Usama SFTP configuration already exists. Opening it for editing.');
      return vscode.window.showTextDocument(vscode.Uri.file(destination));
    }
    const source = path.join(workspacePath, '.vscode', 'sftp.json');
    const files = await vscode.window.showOpenDialog({
      title: 'Import SFTP server configuration', canSelectMany: false,
      filters: { 'SFTP configuration': ['json'] },
      defaultUri: vscode.Uri.file(await fse.pathExists(source) ? source : workspacePath),
    });
    if (!files || !files.length) return;
    const configPath = await importConfig(files[0].fsPath, workspacePath);
    await vscode.window.showTextDocument(vscode.Uri.file(configPath));
    // Saving the editor loads the server configurations through the normal monitor.
    await vscode.window.showInformationMessage('Servers imported. Review and save the configuration. Automatic transfers are off.');
  },
});
