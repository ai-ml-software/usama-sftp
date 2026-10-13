import * as path from 'path';

const VENDOR_FOLDER = '.vscode';

export const EXTENSION_NAME = 'usamaSftp';
export const SETTING_KEY_REMOTE = 'remotefs.remote';

export const REMOTE_SCHEME = 'usama-sftp-remote';

export const CONGIF_FILENAME = 'usama-sftp.json';
export const CONFIG_PATH = path.join(VENDOR_FOLDER, CONGIF_FILENAME);

// command not in package.json
export const COMMAND_TOGGLE_OUTPUT = 'usamaSftp.toggleOutput';

// commands in package.json
export const COMMAND_CONFIG = 'usamaSftp.config';
export const COMMAND_SET_PROFILE = 'usamaSftp.setProfile';
export const COMMAND_CANCEL_ALL_TRANSFER = 'usamaSftp.cancelAllTransfer';
export const COMMAND_OPEN_CONNECTION_IN_TERMINAL = 'usamaSftp.openConnectInTerminal';

export const COMMAND_FORCE_UPLOAD = 'usamaSftp.forceUpload';
export const COMMAND_UPLOAD = 'usamaSftp.upload';
export const COMMAND_UPLOAD_FILE = 'usamaSftp.upload.file';
export const COMMAND_UPLOAD_CHANGEDFILES = 'usamaSftp.upload.changedFiles';
export const COMMAND_UPLOAD_ACTIVEFILE = 'usamaSftp.upload.activeFile';
export const COMMAND_UPLOAD_FOLDER = 'usamaSftp.upload.folder';
export const COMMAND_UPLOAD_ACTIVEFOLDER = 'usamaSftp.upload.activeFolder';
export const COMMAND_UPLOAD_PROJECT = 'usamaSftp.upload.project';

export const COMMAND_FORCE_UPLOAD_TO_ALL_PROFILES = 'usamaSftp.forceUpload.to.allProfiles';
export const COMMAND_UPLOAD_TO_ALL_PROFILES = 'usamaSftp.upload.to.allProfiles';
export const COMMAND_UPLOAD_FILE_TO_ALL_PROFILES = 'usamaSftp.upload.file.to.allProfiles';
export const COMMAND_UPLOAD_ACTIVEFILE_TO_ALL_PROFILES = 'usamaSftp.upload.activeFile.to.allProfiles';
export const COMMAND_UPLOAD_FOLDER_TO_ALL_PROFILES = 'usamaSftp.upload.folder.to.allProfiles';
export const COMMAND_UPLOAD_ACTIVEFOLDER_TO_ALL_PROFILES = 'usamaSftp.upload.activeFolder.to.allProfiles';
export const COMMAND_UPLOAD_PROJECT_TO_ALL_PROFILES = 'usamaSftp.upload.project.to.allProfiles';

export const COMMAND_FORCE_DOWNLOAD = 'usamaSftp.forceDownload';
export const COMMAND_DOWNLOAD = 'usamaSftp.download';
export const COMMAND_DOWNLOAD_FILE = 'usamaSftp.download.file';
export const COMMAND_DOWNLOAD_ACTIVEFILE = 'usamaSftp.download.activeFile';
export const COMMAND_DOWNLOAD_FOLDER = 'usamaSftp.download.folder';
export const COMMAND_DOWNLOAD_ACTIVEFOLDER = 'usamaSftp.download.activeFolder';
export const COMMAND_DOWNLOAD_PROJECT = 'usamaSftp.download.project';

export const COMMAND_SYNC_LOCAL_TO_REMOTE = 'usamaSftp.sync.localToRemote';
export const COMMAND_SYNC_REMOTE_TO_LOCAL = 'usamaSftp.sync.remoteToLocal';
export const COMMAND_SYNC_BOTH_DIRECTIONS = 'usamaSftp.sync.bothDirections';

export const COMMAND_DIFF = 'usamaSftp.diff';
export const COMMAND_DIFF_ACTIVEFILE = 'usamaSftp.diff.activeFile';
export const COMMAND_LIST = 'usamaSftp.list';
export const COMMAND_LIST_ACTIVEFOLDER = 'usamaSftp.listActiveFolder';
export const COMMAND_LIST_ALL = 'usamaSftp.listAll';
export const COMMAND_DELETE_REMOTE = 'usamaSftp.delete.remote';
export const COMMAND_REVEAL_IN_EXPLORER = 'usamaSftp.revealInExplorer';
export const COMMAND_REVEAL_IN_REMOTE_EXPLORER = 'usamaSftp.revealInRemoteExplorer';

export const COMMAND_REMOTEEXPLORER_REFRESH = 'usamaSftp.remoteExplorer.refresh';
export const COMMAND_REMOTEEXPLORER_EDITINLOCAL = 'usamaSftp.remoteExplorer.editInLocal';
export const COMMAND_REMOTEEXPLORER_VIEW_CONTENT = 'usamaSftp.viewContent';

export const COMMAND_CREATE_FOLDER = 'usamaSftp.create.folder';
export const COMMAND_CREATE_FILE = 'usamaSftp.create.file';
