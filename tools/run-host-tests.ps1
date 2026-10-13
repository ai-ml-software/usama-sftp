param([string]$ProjectRoot, [string]$RunRoot, [string]$ExtensionRoot, [int]$DebugPort, [string]$IdeExecutable)
$ErrorActionPreference = 'Stop'
$env:USAMA_TEST_ROOT = $RunRoot
$fixtureKey = Join-Path $RunRoot 'native-client-key.pem'
$fixtureIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$fixtureAcl = New-Object System.Security.AccessControl.FileSecurity
$fixtureAcl.SetOwner($fixtureIdentity)
$fixtureAcl.SetAccessRuleProtection($true, $false)
$fixtureAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($fixtureIdentity, 'FullControl', 'Allow')))
Set-Acl -LiteralPath $fixtureKey -AclObject $fixtureAcl
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$codeExe = Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe'
if ($IdeExecutable) { $codeExe = $IdeExecutable }
if (-not $ExtensionRoot) { $ExtensionRoot = $ProjectRoot }
$arguments = @(
    '--new-window', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
    ('--remote-debugging-port=' + $DebugPort),
    ('--user-data-dir="' + (Join-Path $RunRoot 'user-data') + '"'),
    ('--extensions-dir="' + (Join-Path $RunRoot 'extensions') + '"'),
    ('--extensionDevelopmentPath="' + $ExtensionRoot + '"'),
    ('--extensionTestsPath="' + (Join-Path $ProjectRoot 'tools\modern-host-tests.cjs') + '"'),
    ('"' + (Join-Path $RunRoot 'workspace') + '"')
)
$hostProcess = Start-Process -FilePath $codeExe -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait `
    -RedirectStandardOutput (Join-Path $RunRoot 'host.stdout.log') `
    -RedirectStandardError (Join-Path $RunRoot 'host.stderr.log')
exit $hostProcess.ExitCode
