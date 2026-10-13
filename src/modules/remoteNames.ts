export function validateRemoteName(name: string): string | undefined {
  if (!name.trim() || name === '.' || name === '..' || /[\/\\\x00-\x1f]/.test(name)) {
    return 'Enter a file or folder name without slashes or control characters.';
  }
  return undefined;
}
