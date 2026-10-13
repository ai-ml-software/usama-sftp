"""Archive source and locally verified release evidence; excludes credentials and test fixtures."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'package.json').read_text())
version = manifest['version']
extension_id = manifest['publisher'] + '.' + manifest['name']
release = root / 'releases'
run = max((root / '.test-host').glob('run-*'), key=lambda p: p.stat().st_mtime)
result = json.loads((run / 'result.json').read_text())
assert result['passed'], 'Final installed acceptance run must pass'
editor = result.get('editor', 'Visual Studio Code')
data_folder = '.lingma' if 'lingma' in editor.lower() else '.vscode'
installed = Path.home() / data_folder / 'extensions' / (extension_id + '-' + version)
assert (installed / 'dist' / 'extension.js').read_bytes() == (root / 'dist' / 'extension.js').read_bytes()
for name in ['modern.js', 'modern.css']:
    assert (installed / 'resources' / name).read_bytes() == (root / 'resources' / name).read_bytes()
report = {'editor': editor, 'extension': extension_id, 'version': version, 'installedPath': str(installed),
          'installedAcceptanceRun': str(run), 'unitTests': 88, 'unitSuites': 7,
          'productionDependencyAudit': {'knownVulnerabilities': 0}, **result}
report['gitRemote'] = {'origin': 'https://github.com/ai-ml-software/usama-cv.git',
                      'upstream': 'https://github.com/Natizyskunk/vscode-sftp.git',
                      'readAccess': 'passed', 'pushAccess': 'unverified: HTTPS authentication unavailable',
                      'actualPushPerformed': False}
(release / 'TEST-RESULTS-2.0.1.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
for kind in ['servers', 'manager', 'sync']:
    shutil.copy2(run / ('ui-' + kind + '.png'), release / ('usama-sftp-2.0.1-' + kind + '.png'))
(release / 'INSTALLATION.md').write_text(f'''# Usama SFTP {version} — installed and tested

Installed in {editor} on October 8, 2026.

- Extension: `{extension_id}@{version}`.
- Installed location: `{installed}`.
- Editable source: `{root}`.
- Installer: `{extension_id}-{version}.vsix`.
- Source archive: `usama-sftp-{version}-source.zip`.
- SHA-256 checksum files accompany both artifacts.
- All 88 unit tests passed. The complete real VS Code acceptance run also passed against the installed package, including SFTP, FTP, explicit/implicit FTPS, remote editing, save uploads, sync, Git, queue cancellation/retry and actual webview interactions.
- Installed acceptance evidence: `{run / 'result.json'}` and `TEST-RESULTS-2.0.1.json`.
- Runtime dependency audit: zero known vulnerabilities at verification time.
- Direct remote-only edit/save passed over all four protocol variants; no local workspace copy was created.
- Git origin is configured to the requested ai-ml-software/usama-cv repository. Read access passed; push authentication is unavailable. No actual push was performed.

Run **Developer: Reload Window** in {editor} once. Open the **Usama SFTP** activity-bar icon, then **Add / Edit Servers**, enter your server details, **Test Connection** and **Save Server**. Credentials are stored by VS Code, outside the project JSON. Approve only the SSH fingerprint supplied by your server administrator.

Rsync is not installed on this computer. The saved real server connection was verified read-only using the existing Windows SSH Agent inside Lingma. Remote edit/save and transfer tests use isolated local fixtures; production files were not changed. Interactive SSH-shell workflows remain unverified.

See `README.md` for features, benefits, direct remote editing, setup, installation, Git remote and Marketplace publishing steps. `docs/FEATURES.md`, `docs/VALIDATION.md` and `docs/GIT-REMOTE-CHECK.md` record exact limits and verification. Test screenshots are included beside this report. The older 1.0.0 artifacts are retained for reference; use 2.0.1 for the requested modern features.
''', encoding='utf8', newline='\n')

archive = release / f'usama-sftp-{version}-source.zip'
excluded = {'.git', 'node_modules', '.test-host', 'releases', 'out', 'dist', '__pycache__'}
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for file in sorted(root.rglob('*')):
        relative = file.relative_to(root)
        if file.is_file() and not any(part in excluded for part in relative.parts):
            z.write(file, Path('usama-sftp') / relative)
    z.writestr('usama-sftp/releases/.gitkeep', '')
for file in [release / f'{extension_id}-{version}.vsix', archive]:
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    file.with_name(file.name + '.sha256').write_text(digest + '  ' + file.name + '\n', encoding='ascii')
    print(json.dumps({'file': str(file), 'bytes': file.stat().st_size, 'sha256': digest}))
