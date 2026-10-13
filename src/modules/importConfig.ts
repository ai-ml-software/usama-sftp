import * as fse from 'fs-extra';
import * as path from 'path';
import { CONFIG_PATH } from '../constants';

// Import connection details without turning on automatic remote writes.
export function disableAutomaticTransfers(value: any): any {
  if (Array.isArray(value)) return value.map(disableAutomaticTransfers);
  if (!value || typeof value !== 'object') return value;
  const result = { ...value, uploadOnSave: false, downloadOnOpen: false };
  if (value.watcher) result.watcher = { ...value.watcher, autoUpload: false, autoDelete: false };
  if (value.profiles) {
    result.profiles = {};
    Object.keys(value.profiles).forEach(key => {
      result.profiles[key] = disableAutomaticTransfers(value.profiles[key]);
    });
  }
  return result;
}

export async function importConfig(sourcePath: string, workspacePath: string): Promise<string> {
  const parsed = await fse.readJson(sourcePath);
  const configs = Array.isArray(parsed) ? parsed : [parsed];
  if (!configs.length || configs.some(config => !config || typeof config !== 'object' ||
      Array.isArray(config) || typeof config.host !== 'string' || typeof config.username !== 'string' ||
      typeof config.remotePath !== 'string')) {
    throw new Error('Select a valid SFTP configuration with host, username and remotePath.');
  }
  const destination = path.join(workspacePath, CONFIG_PATH);
  await fse.ensureDir(path.dirname(destination));
  await fse.writeFile(destination, JSON.stringify(disableAutomaticTransfers(parsed), null, 4) + '\n',
    { encoding: 'utf8', flag: 'wx' });
  return destination;
}
