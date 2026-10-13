# Usama SFTP 2.0.1 — installed and tested

Installed in Lingma on October 8, 2026.

- Extension: `usama.usama-sftp@2.0.1`.
- Installed location: `C:\Users\Lenovo\.lingma\extensions\usama.usama-sftp-2.0.1`.
- Editable source: `C:\Users\Lenovo\CodeGeeXProjects\usama-sftp`.
- Installer: `usama-sftp-2.0.1.vsix`.
- Source archive: `usama-sftp-2.0.1-source.zip`.
- SHA-256 checksum files accompany both artifacts.
- All 88 unit tests passed. The complete real VS Code acceptance run also passed against the installed package, including SFTP, FTP, explicit/implicit FTPS, remote editing, save uploads, sync, Git, queue cancellation/retry and actual webview interactions.
- Installed acceptance evidence: `C:\Users\Lenovo\CodeGeeXProjects\usama-sftp\.test-host\run-1791409914745\result.json` and `TEST-RESULTS-2.0.1.json`.
- Runtime dependency audit: zero known vulnerabilities at verification time.
- Direct remote-only edit/save passed over all four protocol variants; no local workspace copy was created.
- Git origin is configured to the requested ai-ml-software/usama-cv repository. Read access passed; push authentication is unavailable. No actual push was performed.

Run **Developer: Reload Window** in Lingma once. Open the **Usama SFTP** activity-bar icon, then **Add / Edit Servers**, enter your server details, **Test Connection** and **Save Server**. Credentials are stored by VS Code, outside the project JSON. Approve only the SSH fingerprint supplied by your server administrator.

Rsync is not installed on this computer. The saved real server connection was verified read-only using the existing Windows SSH Agent inside Lingma. Remote edit/save and transfer tests use isolated local fixtures; production files were not changed. Interactive SSH-shell workflows remain unverified.

See `README.md` for features, benefits, direct remote editing, setup, installation, Git remote and Marketplace publishing steps. `docs/FEATURES.md`, `docs/VALIDATION.md` and `docs/GIT-REMOTE-CHECK.md` record exact limits and verification. Test screenshots are included beside this report. The older 1.0.0 artifacts are retained for reference; use 2.0.1 for the requested modern features.
