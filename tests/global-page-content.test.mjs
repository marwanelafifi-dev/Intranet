import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultGlobalPageContent, normaliseGlobalPageContent } from '../public/global-page-content.js';

test('global page content starts with the published brand defaults', () => {
  assert.deepEqual(normaliseGlobalPageContent(), defaultGlobalPageContent);
});

test('global page content accepts saved copy and uploaded images', () => {
  const content = normaliseGlobalPageContent({
    headerLogoUrl:'/uploads/brand-logo.png', faviconUrl:'/uploads/brand.ico',
    headerWordmark:'STAFF INTRANET', footerSupportEmail:'support@example.com',
    footerWebsiteUrl:'https://example.com/team'
  });
  assert.equal(content.headerLogoUrl, '/uploads/brand-logo.png');
  assert.equal(content.faviconUrl, '/uploads/brand.ico');
  assert.equal(content.headerWordmark, 'STAFF INTRANET');
  assert.equal(content.footerSupportEmail, 'support@example.com');
  assert.equal(content.footerWebsiteUrl, 'https://example.com/team');
});

test('global page content rejects unsafe links and image paths', () => {
  const content = normaliseGlobalPageContent({
    headerLogoUrl:'javascript:alert(1)', faviconUrl:'//example.com/icon.png',
    footerWebsiteUrl:'javascript:alert(1)', footerLinkedinUrl:'http://example.com',
    footerSupportEmail:'not-an-email'
  });
  for (const key of ['headerLogoUrl','faviconUrl','footerWebsiteUrl','footerLinkedinUrl','footerSupportEmail']) {
    assert.equal(content[key], defaultGlobalPageContent[key]);
  }
});

test('published global content survives a dashboard reload and can reset to defaults', async () => {
  const projectRoot = dirname(fileURLToPath(new URL('../server.mjs', import.meta.url)));
  const tempDir = await mkdtemp(join(tmpdir(), 'siware-global-content-'));
  const dataFile = join(tempDir, 'intranet.json');
  await copyFile(join(projectRoot, 'data', 'seed.json'), dataFile);
  const portServer = createNetServer();
  await new Promise((resolve, reject) => portServer.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = portServer.address();
  await new Promise(resolve => portServer.close(resolve));
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd:projectRoot,
    env:{ ...process.env, PORT:String(port), DATA_FILE:dataFile, LOCAL_ADMIN_EMAIL:'', LOCAL_ADMIN_PASSWORD:'', GOOGLE_CLIENT_ID:'', GOOGLE_CLIENT_SECRET:'', GOOGLE_SERVICE_ACCOUNT_KEY_FILE:'', GOOGLE_SYNC_SUBJECT:'' },
    stdio:['ignore','pipe','pipe']
  });
  try {
    let output = '';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Test server timed out: ${output}`)), 8000);
      const onData = chunk => { output += chunk; if (output.includes('running at')) { clearTimeout(timer); resolve(); } };
      child.stdout.on('data', onData); child.stderr.on('data', onData);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited ${code}: ${output}`)); });
    });
    const origin = `http://127.0.0.1:${port}`;
    const get = async path => (await fetch(origin + path)).json();
    const adminPage = await (await fetch(origin + '/admin.html')).text();
    assert.match(adminPage, /Global pages content/);
    const loginPage = await (await fetch(origin + '/login.html')).text();
    assert.match(loginPage, /login-global-content\.js/);
    let dashboard = await get('/api/admin/dashboard');
    assert.ok(dashboard.globalPageContent);
    const changed = { ...dashboard.globalPageContent, headerWordmark:'TEAM HUB', footerSupportEmail:'support@example.com' };
    let response = await fetch(origin + '/api/admin/dashboard', { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ data:{ ...dashboard, globalPageContent:changed }, version:dashboard._version }) });
    assert.equal(response.status, 200, await response.text());
    dashboard = await get('/api/admin/dashboard');
    assert.equal(dashboard.globalPageContent.headerWordmark, 'TEAM HUB');
    assert.equal((await get('/api/global-page-content')).footerSupportEmail, 'support@example.com');
    const defaults = await get('/api/admin/defaults');
    response = await fetch(origin + '/api/admin/dashboard', { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ data:{ ...dashboard, globalPageContent:defaults.defaults.globalPageContent }, version:dashboard._version, operation:'reset' }) });
    assert.equal(response.status, 200, await response.text());
    assert.equal((await get('/api/global-page-content')).headerWordmark, defaultGlobalPageContent.headerWordmark);
  } finally {
    if (child.exitCode === null && !child.killed) { child.kill(); await once(child, 'exit'); }
    await rm(tempDir, { recursive:true, force:true });
  }
});
