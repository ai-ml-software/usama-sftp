# Changelog

## 2.1.0

- Shared dropdown for SFTP/FTP/FTPS and Git HTTPS connections; selection changes the active connection.
- Connect, Open Config File, Refresh Connections and connection check messages in Overview.
- Git connections create separate editable local checkouts using existing Git credentials; reconnect preserves local work.
- Authentication fields and guidance follow SSH agent, private key or password mode.
- Configuration schema provides completion and validation; managed checkouts are excluded from server transfers.

## 2.0.1

- Rsync preview consistently targets the selected active server, even when another remote editor is focused.
- Installed and validated in Lingma IDE with the existing Windows SSH agent profile.
- Acceptance launcher supports Lingma and isolated first-run notifications.

## 2.0.0

- Independent server setup UI, connection testing, remote folder browsing and encrypted credential storage.
- Writable remote filesystem with stale-save protection, active server upload-on-save and multi-server setup.
- SFTP host-key verification; FTP and explicit/implicit FTPS with certificate validation.
- Transfer queue with progress, speed, cancel, retry and destination-preserving temporary uploads.
- Content-based sync preview, baseline tracking, conflict choices, stale-preview checks and confirmed mirror deletions.
- Git deployment previews for working changes, last deploy and arbitrary refs, including renames/deletions.
- Dual-pane manager with drag, keyboard actions and recursive transfers to different folders.
- Legacy configuration migration/import; native SSH/SCP and optional Rsync dry-run commands.
- Real VS Code extension-host, protocol and webview tests.

## 1.0.0

- First Usama SFTP build, based on MIT-licensed vscode-sftp 1.16.3.
