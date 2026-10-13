const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
exports.drive = async function (runRoot, port, isFinished) {
  let browser, lastPhase;
  try {
    while (!isFinished()) {
      let request;
      try { request = JSON.parse(await fs.readFile(path.join(runRoot, 'ui-request.json'), 'utf8')); } catch (_) {}
      if (request && request.phase !== lastPhase) {
        lastPhase = request.phase;
        try {
          browser ||= await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
          const page = browser.contexts()[0].pages()[0]; let frame;
          for (let i = 0; i < 100; i++) {
            for (const candidate of page.frames()) {
              if (await candidate.locator(`body[data-kind="${request.kind}"]`).count().catch(() => 0)) { frame = candidate; break; }
            }
            if (frame && await frame.locator('h1').count()) break;
            await new Promise(r => setTimeout(r, 100));
          }
          assert.ok(frame, `No ${request.kind} webview found`);
          if (request.phase === 'git-connections') {
            assert.equal(await frame.locator('input[name="repositoryUrl"]').inputValue(), 'https://fixture.invalid/repository.git');
            assert.equal(await frame.locator('input[name="password"]').count(), 0);
            assert.equal(await frame.locator('input[name="privateKeyPath"]').count(), 0);
            await frame.getByRole('button', { name: 'Test Connection', exact: true }).click();
            await frame.locator('#notice').filter({ hasText: 'Git branch main is accessible' }).waitFor({ timeout: 30000 });
            await frame.getByRole('button', { name: 'Save Server', exact: true }).click();
            await frame.locator('#notice').filter({ hasText: 'Server saved.' }).waitFor({ timeout: 30000 });
            await frame.getByRole('button').filter({ hasText: /^UI Verified SFTP/ }).click();
            await frame.locator('select[name="auth"]').selectOption('agent');
            assert.ok(await frame.locator('input[name="password"]').isHidden()); assert.ok(await frame.locator('input[name="privateKeyPath"]').isHidden());
            await frame.locator('select[name="auth"]').selectOption('key'); assert.ok(await frame.locator('input[name="privateKeyPath"]').isVisible());
            await frame.locator('select[name="auth"]').selectOption('password'); assert.ok(await frame.locator('input[name="password"]').isVisible());
            await page.screenshot({ path: path.join(runRoot, 'ui-git-setup.png') });
            let overview;
            for (let i = 0; i < 100; i++) { for (const candidate of page.frames()) { if (await candidate.locator('body[data-kind="overview"]').count().catch(() => 0)) overview = candidate; } if (overview && await overview.locator('.connection-select').count().catch(() => 0)) break; await new Promise(r => setTimeout(r, 100)); }
            assert.ok(overview); const chooser = overview.locator('.connection-select');
            assert.ok((await chooser.locator('option').allTextContents()).some(t => t.includes('Git Fixture (Git / HTTPS)')));
            await chooser.selectOption(request.gitKey);
            await overview.getByRole('button', { name: 'Connect', exact: true }).click();
            await overview.getByText(/Checkout ready:/).first().waitFor({ timeout: 30000 });
            await chooser.selectOption(request.sftpKey);
            await overview.getByRole('button', { name: 'Toggle Upload on Save', exact: true }).waitFor();
            assert.equal(await overview.getByRole('button', { name: 'Open Local Checkout', exact: true }).count(), 0);
            await page.screenshot({ path: path.join(runRoot, 'ui-connections.png') });
          } else if (request.kind === 'servers') {
            await frame.locator('input[name="name"]').fill('UI Verified SFTP');
            assert.equal(await frame.locator('input[name="password"]').inputValue(), '');
            await frame.getByRole('button', { name: 'Test Connection', exact: true }).click();
            await frame.locator('#notice').filter({ hasText: 'Connected.' }).waitFor({ timeout: 30000 });
            await frame.getByRole('button', { name: 'Browse remote…', exact: true }).click();
            await frame.getByRole('button', { name: 'Select this folder', exact: true }).waitFor({ timeout: 30000 });
            await frame.getByRole('button', { name: 'Select this folder', exact: true }).click();
            await frame.getByRole('button', { name: 'Save Server', exact: true }).click();
            await frame.locator('#notice').filter({ hasText: 'Server saved.' }).waitFor({ timeout: 30000 });
          } else if (request.kind === 'manager') {
            const row = frame.locator('#files-local tr').filter({ hasText: 'ui-manager.txt' }); await row.waitFor(); await row.click();
            await frame.getByRole('button', { name: 'Upload →', exact: true }).click();
            await frame.locator('#files-remote tr').filter({ hasText: 'ui-manager.txt' }).waitFor({ timeout: 30000 });
            await frame.locator('#pane-remote').focus(); await frame.locator('#pane-remote').press('F5');
            const dragged = frame.locator('#files-local tr').filter({ hasText: 'ui-drag.txt' });
            await dragged.dragTo(frame.locator('#pane-remote'));
            await frame.locator('#files-remote tr').filter({ hasText: 'ui-drag.txt' }).waitFor({ timeout: 30000 });
            await frame.locator('#pane-local').getByRole('button', { name: 'New folder', exact: true }).click();
            const input = page.locator('.quick-input-widget input:visible').first(); await input.waitFor(); await input.fill('UI created folder'); await input.press('Enter');
            await frame.locator('#files-local tr').filter({ hasText: 'UI created folder' }).waitFor({ timeout: 30000 });
          } else if (request.kind === 'sync') {
            await frame.getByRole('button', { name: 'Preview Sync', exact: true }).click();
            await frame.locator('tr').filter({ hasText: 'ui-sync.txt' }).waitFor({ timeout: 30000 });
            await assert.rejects(fs.stat(request.remoteFile), { code: 'ENOENT' });
            await frame.getByRole('button', { name: 'Apply Reviewed Changes', exact: true }).click();
            await frame.locator('#notice').filter({ hasText: 'Sync completed.' }).waitFor({ timeout: 30000 });
            assert.equal(await fs.readFile(request.remoteFile, 'utf8'), 'UI sync');
          }
          await page.screenshot({ path: path.join(runRoot, 'ui-' + request.kind + '.png') });
          await fs.writeFile(path.join(runRoot, `ui-${request.phase}-result.json`), JSON.stringify({ passed: true }));
        } catch (error) { await fs.writeFile(path.join(runRoot, `ui-${request.phase}-result.json`), JSON.stringify({ passed: false, error: error.stack })); }
      }
      await new Promise(r => setTimeout(r, 200));
    }
  } finally { await browser?.close().catch(() => undefined); }
};
