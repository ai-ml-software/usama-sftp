# Lingma installation and saved SSH connection

Usama SFTP is installed in Lingma IDE on this computer. The installer is `releases/usama-sftp-2.1.0.vsix`; extension ID is `usama.usama-sftp`.

The project server settings are in `C:/laragon/www/atlas/atlas/.vscode/usama-sftp.json`. They use the existing `altusgulf` connection from your SSH configuration and the host fingerprint already trusted in your SSH known-hosts file. Your encrypted key is already loaded in the running Windows SSH Agent; the extension uses **SSH agent** authentication without copying the private key or asking for its passphrase again.

Automatic local uploads are off. The optional local transfer folder is `.usama-remote/altusgulf`, keeping it separate from the Atlas application files. That folder has not been created or populated by direct remote browsing. Explicit Download creates local copies; direct remote editor saves upload the editor buffer to the selected server file.

1. Open `C:/laragon/www/atlas/atlas` in Lingma.
2. If the new extension is not visible, run **Developer: Reload Window** once.
3. Open the **Usama SFTP** activity-bar icon and expand **AltusGulf** under **SFTP / FTP Servers**.
4. Click a remote file to open it directly; **Ctrl+S** saves changes to the server. New, rename and delete actions are available in the remote tree.
5. Use **Add or Edit Servers** → **Test Connection** to verify the profile or change the folder.

The real server connection was tested read-only through the installed extension in Lingma: SSH-agent authentication, pinned host verification, remote-folder listing and directory stat passed. Remote edit/save, sync, Git deployment, transfers and UI actions use disposable loopback fixtures for acceptance tests, so no real server files are changed by that test suite.

If agent authentication stops working after a restart, check `ssh-add -l` in a terminal. Unlock the existing key using `ssh-add "$env:USERPROFILE/.ssh/id_rsa"` when necessary; enter the passphrase into the terminal's secure prompt. Do not place the passphrase in project JSON.

An isolated Lingma acceptance run can be repeated from the extension source folder:

```powershell
$env:USAMA_EXTENSION_PATH = "$env:USERPROFILE/.lingma/extensions/usama.usama-sftp-2.1.0"
$env:USAMA_TEST_IDE_PATH = "$env:LOCALAPPDATA/Programs/Lingma/Lingma.exe"
$env:USAMA_SFTP_READ_TEST_CONFIG = "C:/laragon/www/atlas/atlas/.vscode/usama-sftp.json"
npm run test:host
Remove-Item Env:USAMA_EXTENSION_PATH
Remove-Item Env:USAMA_TEST_IDE_PATH
Remove-Item Env:USAMA_SFTP_READ_TEST_CONFIG
```

The third environment variable optionally adds a read-only test of the saved real connection. Without it, the suite only uses loopback servers. The test uses a separate editor profile and clears its own first-run notifications.

## GitHub connection

The Atlas config also contains `usama` as a Git HTTPS connection. Its checkout is `.usama-remote/usama-github`. Select it in Overview and click Connect or Open Local Checkout. Git uses the existing credential manager; no SSH key is needed. Git files save locally and require normal commit/push. AltusGulf remains the default SFTP connection and its files save directly to the server. Run Developer: Reload Window once after installing 2.1.0.
