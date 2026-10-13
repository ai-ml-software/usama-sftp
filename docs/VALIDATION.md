# Usama SFTP 2.0 validation

Validated on Windows on October 7, 2026 using Microsoft VS Code 1.141.0, Node 24.16.0, Python 3.13 and Windows OpenSSH 9.5.

- TypeScript check and production Webpack compilation passed.
- All 88 automated tests across seven suites passed, including the new content-based sync planner, conflict/deletion decisions and special filenames.
- Actual VS Code extension activation and all contributed commands registered.
- Loopback SFTP, FTP, explicit FTPS and implicit FTPS: authenticated upload/download, binary integrity, overwriting existing files, editable remote documents, stale-save rejection, lazy tree listing, Unicode/space names and create/rename/delete passed.
- Encrypted private-key authentication, pinned-host mismatch rejection, wrong-password rejection and untrusted FTPS certificate rejection passed. TLS certificate checking was never disabled.
- Actual VS Code save event, active target selection, ignored files and path traversal checks passed.
- Recursive folder transfers preserve empty directories and support different destination paths. A live cancelled SFTP upload preserved the existing destination and cleaned its temporary file; an authentication-failed upload retried successfully.
- Native Windows SCP transferred a file to a pinned temporary SSH host. Rsync is absent and its command reported an actionable error.
- Two-way sync baseline, conflict resolution, confirmed deletion, stale-preview rejection and push mirror passed. A real temporary Git repository exercised staged rename, addition, deletion, working/ref previews and the last-deployment marker.
- Legacy nested profiles imported with secrets moved out of JSON, original source preserved and automatic uploads disabled.
- Playwright exercised the real VS Code webviews: Test Connection, Save Server, Browse Remote, dual-pane upload, F5 refresh, drag between panes, New Folder through VS Code input, and Sync Preview / Apply. Preview was verified to leave the destination untouched until Apply.
- Additional installed-package test: server-only documents opened, edited and saved successfully over SFTP, FTP, explicit FTPS and implicit FTPS. The corresponding local workspace file remained absent before opening, after opening, and after saving.

Passing source acceptance run: `.test-host/run-1791406070533/result.json`. Its `ui-servers.png`, `ui-manager.png` and `ui-sync.png` show the actual test VS Code window. The release installation report records the final installed-package rerun.

Direct-remote installed acceptance run: `.test-host/run-1791406622764/result.json`, passed. Git remote verification and authentication limits are recorded in [GIT-REMOTE-CHECK.md](GIT-REMOTE-CHECK.md). GitHub ref access and SFTP file access are separate checks.

Tests listen only on `127.0.0.1`, use generated keys/certificates and disposable credentials, and operate in a separate VS Code profile. Fixture servers terminate after the runner exits. Existing user servers are not contacted.

```powershell
python -m pip install --target .test-host/python-lib -r tools/loopback-requirements.txt
npm run check
npm test -- --runInBand
npm run compile
npm run test:host
# Test the installed package instead of the development folder:
$env:USAMA_EXTENSION_PATH = "$env:USERPROFILE/.vscode/extensions/usama.usama-sftp-2.0.1"
npm run test:host
Remove-Item Env:USAMA_EXTENSION_PATH
```

See [FEATURES.md](FEATURES.md) for implementation details and unverified limits, including the running SSH agent, interactive SSH shell and missing Rsync. No production host credentials were supplied. This report does not imply every server's permissions/extensions or large-scale performance was tested.

## Lingma and the existing SSH profile — October 8, 2026

Usama SFTP 2.0.1 was installed in Lingma IDE 0.11.4 and its complete acceptance suite passed in `.test-host/run-1791409914745/result.json`. The launcher used `C:/Users/Lenovo/AppData/Local/Programs/Lingma/Lingma.exe` and the installed extension under `.lingma/extensions`. Lingma's extension API identifies itself as “Visual Studio Code”; the test report records the actual launch executable separately.

The user's saved `altusgulf` SSH connection passed a read-only SFTP login, pinned-host verification, directory listing and directory stat through the installed plugin and existing Windows SSH Agent. No real server files were changed. Test fixture operations and actual setup/manager/sync webview buttons also passed in Lingma. This updates the earlier lack of a live agent/real-server check; interactive SSH-shell behavior and large-scale performance remain unverified. See [LINGMA.md](LINGMA.md) for the configured workspace and usage.

MIT upstream copyright and documentation are preserved. The modern runtime is independently implemented; the proprietary Utiltools source and purchase mechanism were not copied or changed.
