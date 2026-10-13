# Usama SFTP

Edit files directly on your SFTP, FTP or FTPS server from VS Code. Browse the server, open a file, change it and press **Ctrl+S**: the extension saves it back to the server without creating a copy in your local project. No manual download or folder sync is required for this workflow.

Usama SFTP also provides upload on save, content-based sync previews, Git deployment, multiple servers, a dual-pane manager and a transfer queue. This local extension has no trial, subscription or transfer quota.

## Features and benefits

| Feature | Benefit |
| --- | --- |
| Direct remote editing | Make server changes from the VS Code editor without maintaining a local mirror. |
| SFTP, FTP and explicit/implicit FTPS | Connect to SSH-based servers or existing FTP hosting. |
| Server setup and connection test | Save multiple connections and check the selected remote folder before transferring. |
| Encrypted credential storage | Passwords and key passphrases stay in VS Code SecretStorage rather than project JSON. |
| SSH fingerprint and FTPS certificate checks | Verify the server identity before accessing its files. |
| Active-server upload on save | Deploy a local file when you save it; choose the receiving server explicitly. |
| Remote explorer | Open, create, rename, delete, download, compare and copy remote paths. |
| Sync preview and conflict choices | Review local/server changes, resolve conflicts and confirm deletions before applying. |
| Git deployment preview | Upload changed local Git files, including additions and confirmed rename/deletion operations. |
| Dual-pane manager | Navigate local/server folders, transfer selections or drag between panes. |
| Transfer queue | See bytes, speed and errors; cancel, retry or clear completed transfers. |
| Legacy import | Import `.vscode/sftp.json` or `sftp-sync.json`, including profiles, without changing the original file. |

## Easy connections in 2.1.0

The Overview dropdown now holds SFTP/FTP/FTPS servers and Git HTTPS repositories. Selecting an entry selects the active connection. Click **Connect**, **File Manager**, or **Open Config File**. Saved configuration changes refresh the dropdown automatically; **Refresh Connections** reloads it manually.

- **AltusGulf (SFTP):** uses the existing Windows SSH agent and pinned server fingerprint. No new key or password is needed. Expand the server and open a file; Ctrl+S saves directly to that server. Upload on save separately controls local file uploads.
- **usama (Git / HTTPS):** uses saved Git credentials. Connect creates a separate checkout once. Expand its files to edit locally, or click **Open Local Checkout** to open the checkout in another window. Use Source Control to commit and push. Reconnecting preserves local edits and does not pull/reset automatically. The initial clone uses the configured branch.
- For another SFTP account, choose **SSH agent**, **Private key file**, or **Password**. The form shows the fields needed by that mode and explains them. Passwords and passphrases go in the form and VS Code SecretStorage, not in JSON.
- For a Git account needing authentication, click **Sign in with Git** and finish Git credential manager's terminal/browser sign-in, then retry Connect. GitHub HTTPS does not need an SSH key.

`.vscode/usama-sftp.json` has editor completion and validation. A Git connection is configured as:

```json
{
  "id": "usama",
  "name": "usama",
  "protocol": "git",
  "repositoryUrl": "https://github.com/Saifeldin2401/alboabid-heritage-hub.git",
  "branch": "main",
  "localPath": ".usama-remote/usama-github",
  "uploadOnSave": false,
  "ignore": []
}
```

GitHub is accessed through Git, and server files through SFTP. Do not point an SFTP profile at github.com. The checkout folder `.usama-remote` is excluded from server transfers.

## Install in VS Code

This computer already has `usama.usama-sftp@2.1.0` installed. Run **Developer: Reload Window** once if the updated extension is not active.

For another computer:

1. Obtain `kosama685.usama-sftp-2.1.0.vsix` from the supplied `releases` folder.
2. Press **Ctrl+Shift+X**, open the Extensions **…** menu, choose **Install from VSIX…**, and select the installer.
3. Run **Developer: Reload Window** from **Ctrl+Shift+P**.
4. Open the **Usama SFTP** activity-bar icon or run **Usama SFTP: Add or Edit Servers**.

Alternatively, from the extension source folder:

```powershell
code --install-extension ./releases/kosama685.usama-sftp-2.1.0.vsix --force
code --list-extensions --show-versions
```

VS Code must satisfy the extension's `engines.vscode` requirement, currently `^1.74.0`. Installation does not require a developer Node.js installation. VSIX installation is also described in the [official VS Code guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#packaging-extensions).

## Set up a server

For this computer's Lingma IDE installation and existing SSH-agent connection, see the [Lingma setup guide](docs/LINGMA.md).

1. Open a trusted workspace folder. For remote-only editing, this can be an empty settings folder; it does not need a copy of your server files.
2. Run **Usama SFTP: Add or Edit Servers**, then **+ Add server**.
3. Choose the workspace, server name, protocol, host, port and user name.
4. For SFTP, select **Password**, **Private key**, or **SSH agent**. Enter the password or key path/passphrase. An agent must already be running if you choose agent authentication.
5. Enter the remote folder, such as `/var/www/html`, or use **Browse remote…**. Choose a local folder for optional local upload/download/sync work. It is not a prerequisite for opening a remote document.
6. Add ignore patterns, one per line. `.git` and `.vscode` are always excluded. Add `.env` and other private paths if they must remain local.
7. Click **Test Connection**. On the first SFTP connection, compare the displayed fingerprint with your server's known fingerprint before trusting it. For FTPS, certificate validation stays enabled; use an additional PEM CA file for a private certificate authority. Select **Implicit FTPS** only when your host requires it, usually on port 990.
8. Click **Save Server** and select the desired active server. Keep **Upload on save** off for remote-only editing; it controls local-file uploads separately.

Typical ports are SFTP 22, FTP/explicit FTPS 21, implicit FTPS 990. Your hosting provider may use different ports or paths.

## Edit directly on the server — no local project copy

1. Expand your server in **SFTP / FTP Servers**.
2. Click a remote file. It opens as a writable `usama-sftp-remote:` document.
3. Edit normally and press **Ctrl+S**. The transfer queue saves the editor's contents to that server file.
4. Reopen the file to read the current server contents. Saving is blocked if the server file changed after you opened it; reopen or compare before proceeding.

The extension reads content across the network into the editor, but does not create a matching local workspace file for direct editing. VS Code can maintain its own editor recovery data. **Download** deliberately creates a local copy; avoid that command when you only want direct remote editing. Files up to 64 MB can be opened in the remote editor; larger files can still be transferred with the streaming upload/download commands.

An acceptance test opens a file that exists only on each test server, edits and saves it, checks the server bytes, and verifies the local file remains absent before opening, after opening, and after saving.

## Local uploads, downloads and the file manager

- **Upload** sends the selected local file/folder to the active server. **Download from Server** creates or updates the corresponding local copy.
- **Upload to Server…** selects a different server for a file. The status bar switches the active server.
- **Ctrl+Alt+U** uploads a local file; **Ctrl+Alt+D** downloads it.
- Enable **Upload on save** for automatic uploads of local documents to the active server. Saving a remote document already writes to its own server regardless of this setting.
- **Open File Manager (Dual Pane)** displays Local and Server folders. Select and transfer, double-click to navigate/edit, or drag to the other pane. Folder transfers preserve empty folders and respect ignore rules.
- Manager shortcuts: **F5** refresh, **F2** rename, **Enter** open, **Backspace** parent folder, **Delete** delete with confirmation, **F6/F7** transfer the selection.
- The **Usama Transfers** panel shows progress, speed, errors, cancellation and retry. Browse connections are separate from transfer connections.

## Sync folders

1. Run **Usama SFTP: Sync Folder with Server…** and select the server.
2. Choose **Two-way sync**, **Push local → server**, or **Pull server → local**.
3. Enable mirror deletions only when you intend to remove files missing from the source side.
4. Click **Preview Sync**. It scans content hashes and displays proposed actions without changing files.
5. Resolve conflicts using **Keep local**, **Keep server**, or **Keep newer**, individually or for all conflicts. Equal timestamps and delete-versus-edit conflicts require an explicit local/server choice.
6. Confirm displayed deletions, then click **Apply Reviewed Changes**.

Successful sync records a content baseline for that server/folder combination. If a planned file changes after previewing, application stops and you must refresh the preview. Sync tracks files; it does not mirror empty-folder deletion.

## Git remote and Git deployment

There are three separate workflows:

| Workflow | What it does |
| --- | --- |
| Git remote (`origin`) | Stores versioned commits in a Git repository, using Git fetch/push. |
| Usama Git deployment | Selects changed files from a local Git working tree and transfers them to a configured SFTP/FTP/FTPS server. |
| Direct server editing | Edits a server file through the remote editor without requiring a local working tree for that file. |

A GitHub URL is not an SFTP host. Add it as a Git repository (HTTPS) connection to work in a separate local checkout. Git edits save locally and use normal Git commit/push; SFTP editor saves write directly to the server. Git-based SFTP deployment needs a local Git repository and server connection details.

### Verified remote configuration

The extension source at `C:/Users/Lenovo/CodeGeeXProjects/usama-sftp` is configured as:

```text
origin    https://github.com/ai-ml-software/usama-cv.git
upstream  https://github.com/Natizyskunk/vscode-sftp.git
```

On October 7, 2026, read access to the requested repository passed and `main` resolved to `c4add5e898de7192277599ff85e75c936699da2b`. The non-writing push preview could not authenticate because Git HTTPS credentials were unavailable. Actual push permission is therefore unverified.

The chosen repository already contains your CV website. The proposed extension branch is **`usama-sftp`**. Uploading that branch keeps its extension source separate from the existing `main` branch. No remote files or commits were changed during verification.

### Check access without cloning or downloading repository files

```powershell
git remote -v
git ls-remote origin HEAD refs/heads/main
git push --dry-run origin HEAD:refs/heads/usama-sftp
```

`ls-remote` queries remote refs; it does not check out repository files. A successful read check does not prove push permission. See [Git's command reference](https://git-scm.com/docs/git-ls-remote).

For HTTPS write access, sign in using the installed Git Credential Manager's authentication flow when Git requests credentials. If prompted for a password by GitHub, use the supported token-based authentication method rather than an account password. Use a credential helper rather than embedding a token in the remote URL. See [GitHub HTTPS authentication](https://docs.github.com/en/get-started/git-basics/about-remote-repositories#cloning-with-https-urls).

To change remotes in another repository, choose its folder first:

```powershell
git remote -v
# If origin already exists:
git remote set-url origin https://github.com/ai-ml-software/usama-cv.git
# If it does not exist, use instead:
# git remote add origin https://github.com/ai-ml-software/usama-cv.git
```

After reviewing and committing the extension changes locally, the upload command is:

```powershell
git push --dry-run origin usama-sftp:usama-sftp
git push -u origin usama-sftp:usama-sftp
```

These commands are instructions for a later source upload; an actual push has not been performed. Do not use `--force` or push this extension's history onto the CV site's `main` branch.

### Deploy changed Git files to an SFTP/FTP server

1. Set the server's local folder to your Git working tree or a folder inside it.
2. Run **Usama SFTP: Deploy Changed Git Files…**.
3. Choose **Uncommitted changes**, **Since last deploy**, or **Since a Git ref**; enter a ref such as `HEAD~1` for the last option.
4. Click **Preview Git Changes**. Review additions, updates, renamed destinations and deletions of old paths.
5. Confirm deletions, then **Apply Reviewed Changes**. A successful deployment records the current commit as the last-deploy marker.

This transfers files to the selected server. GitHub commit/push remains a separate Git action.

## Configuration and migration

Saved configuration: `.vscode/usama-sftp.json`.

```json
{
  "version": 2,
  "defaultProfile": "production",
  "profiles": [{
    "id": "production",
    "name": "Production",
    "protocol": "sftp",
    "host": "example.com",
    "port": 22,
    "username": "deploy",
    "auth": "key",
    "privateKeyPath": "~/.ssh/id_ed25519",
    "remotePath": "/var/www/html",
    "localPath": ".",
    "uploadOnSave": false,
    "ignore": ["node_modules", ".DS_Store", ".env"]
  }]
}
```

SFTP authentication modes are `password`, `key`, `agent`. FTPS supports `implicitTls` and `caPath`. Optional `hostFingerprint` pins a `SHA256:...` SSH fingerprint. Set passwords/passphrases in the form. Leave those fields blank to keep stored values, or use the clear checkboxes to remove them.

**Import Servers from sftp.json / sftp-sync.json** migrates profiles and credentials while preserving the original file. Imported upload-on-save starts disabled. Existing Usama 1.0 configurations migrate when loaded.

| VS Code setting | Default | Effect |
| --- | --- | --- |
| `usamaSftp.offerImport` | `true` | Offers legacy configuration import. |
| `usamaSftp.statusBar.show` | `true` | Shows active server and pending transfer count. |
| `usamaSftp.transfers.reveal` | `never` | Choose `never`, `always` or `onError`. |
| `usamaSftp.uploadOnSave.showSuccess` | `true` | Shows a short successful local-save upload message. |

Native SSH/SCP commands open the system client in a terminal, using its own authentication and host-trust prompts. SCP supports individual files; use the extension's folder upload to apply ignore rules. Native Rsync opens a dry-run preview and requires Rsync locally and remotely. Rsync is absent from the tested Windows system.

## Build and test from source

```powershell
Set-Location C:/Users/Lenovo/CodeGeeXProjects/usama-sftp
npm ci --ignore-scripts
npm run check
npm test -- --runInBand
npm run package
```

To run acceptance tests against temporary local servers and actual VS Code webviews:

```powershell
python -m pip install --target .test-host/python-lib -r tools/loopback-requirements.txt
npm run test:host
```

The host-test launcher is for this Windows VS Code installation. Playwright connects to the test VS Code's Chromium debugging port; a separate browser download is unnecessary. Test profiles, credentials and files are isolated from your normal editor and server settings. See [verification](docs/VALIDATION.md) and the [feature matrix](docs/FEATURES.md) for tested behavior and remaining limits.

## Upload to the VS Code Marketplace

The development build is installed locally as `usama.usama-sftp`; it has **not** been published to the Marketplace. The Marketplace package now uses publisher ID `kosama685` to match your selected publisher. Its Marketplace extension ID is `kosama685.usama-sftp`. Upload `releases/kosama685.usama-sftp-2.1.0.vsix` under `kosama685`.

1. Open [publisher management](https://marketplace.visualstudio.com/manage), sign in, and create or select your publisher. Set `package.json` → `publisher` to that exact ID; the display name can remain **Usama SFTP**. Changing publisher changes the extension's install ID.
2. Push the reviewed source to the `usama-sftp` branch of your chosen repository after authenticating. Its `repository` metadata should point to your repository; preserve original attribution in `LICENSE` and `docs/UPSTREAM.md`.
3. Run the build/test commands above, then `npm run package`. The script uses `--githubBranch usama-sftp` so README links resolve to the extension branch.
4. Under publisher **kosama685**, choose **New extension → Visual Studio Code** and upload `releases/kosama685.usama-sftp-2.1.0.vsix`. Review the listing and complete publishing.
5. After it is available, search for **Usama SFTP** in VS Code and verify the publisher ID before installing.

Alternatively, use the project's installed `vsce` CLI with your authenticated publisher. For supported PAT authentication, `npx vsce login kosama685` prompts for the token; then `npx vsce publish --packagePath ./releases/kosama685.usama-sftp-2.1.0.vsix` publishes the reviewed package. Microsoft's guide states that global Azure DevOps PATs retire on December 1, 2026; use its Entra ID publishing guidance for automation. Follow the [official publishing instructions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) for current authentication requirements.

For future releases, increase `package.json`'s version, update the lockfile, changelog and versioned package output path, rerun checks, package, and upload the new VSIX to the existing listing. The local installer, source ZIP and checksum files are under `releases`.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| No server appears | Open a trusted workspace, run Add or Edit Servers, save, then refresh the tree. |
| Connection fails | Check protocol, host, port, user, password/key and firewall/network access. Test Connection reports the failure. |
| SSH key mismatch | Verify the server's replacement fingerprint before changing a pin or trust configuration. |
| FTPS certificate rejected | Correct the hostname/certificate or provide the trusted private CA; verification remains enabled. |
| Remote save blocked | The server copy changed after opening. Reopen or compare before saving again. |
| Expected local file is absent | Direct remote editing intentionally does not create a workspace copy. Use Download when you want one. |
| Upload skipped | Check active server, local folder mapping, upload-on-save switch and ignore patterns. |
| Sync cannot apply | Resolve every conflict, confirm deletions, or refresh a stale preview. |
| Git read works but push fails | Authenticate a GitHub account with write permission and repeat the dry-run push. |
| Marketplace upload rejected | Confirm publisher ownership, package version, PNG icon, license and valid package metadata. |
| Rsync command fails | Install a compatible Rsync locally and ensure the SSH host also has it, or use built-in sync. |

MIT licensed. Initial source was based on Natizyskunk/vscode-sftp 1.16.3; original copyrights, license and upstream documentation are preserved. Version 2 uses an independent modern runtime. The referenced Utiltools implementation and purchase mechanism were not copied or modified.
