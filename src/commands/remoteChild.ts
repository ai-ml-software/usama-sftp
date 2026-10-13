import { Uri, window } from 'vscode';
import { UResource, upath } from '../core';
import { validateRemoteName } from '../modules/remoteNames';
import { uriFromExplorerContextOrEditorContext } from './shared';

export async function remoteChild(item, items, kind: 'file' | 'folder', providedName?: string): Promise<Uri | undefined> {
  const targets = uriFromExplorerContextOrEditorContext(item, items);
  if (!targets) {
    await window.showInformationMessage('Select a folder in Usama SFTP first.');
    return;
  }
  if (Array.isArray(targets) && targets.length !== 1) {
    throw new Error('Select one parent folder.');
  }
  const parent = Array.isArray(targets) ? targets[0] : targets;
  const name = providedName === undefined ? await window.showInputBox({
    prompt: 'New remote ' + kind + ' name', validateInput: validateRemoteName,
  }) : providedName;
  if (name === undefined) return;
  const error = validateRemoteName(name);
  if (error) throw new Error(error);
  if (UResource.isRemote(parent)) {
    const resource = UResource.makeResource(parent);
    return UResource.updateResource(resource, { remotePath: upath.join(resource.fsPath, name) }).uri;
  }
  return Uri.file(upath.join(parent.fsPath, name));
}
