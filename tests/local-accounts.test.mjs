import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer as createNetServer } from 'node:net';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { hashLocalPassword, passwordPolicyError, publicAccessUser, verifyLocalPassword } from '../local-accounts.mjs';

const projectRoot = dirname(fileURLToPath(new URL('../server.mjs', import.meta.url)));

test('local passwords are validated and stored only as salted hashes', async () => {
  assert.match(passwordPolicyError('short', 'member@example.test'), /15/);
  assert.equal(passwordPolicyError('A long original passphrase 2026', 'member@example.test'), '');
  const first = await hashLocalPassword('A long original passphrase 2026');
  const second = await hashLocalPassword('A long original passphrase 2026');
  assert.notEqual(first, second);
  assert.equal(await verifyLocalPassword('A long original passphrase 2026', first), true);
  assert.equal(await verifyLocalPassword('another long passphrase', first), false);
  assert.equal(publicAccessUser({ email:'member@example.test', passwordHash:first }).passwordHash, undefined);
  assert.equal(publicAccessUser({ email:'member@example.test', avatarUrl:'/uploads/profile.jpg' }).avatarUrl, '/uploads/profile.jpg');
});

async function availablePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('an administrator can create, sign in, and deactivate a persistent local user without exposing the password', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'siware-local-user-test-'));
  const dataFile = join(tempDir, 'intranet.json');
  await copyFile(join(projectRoot, 'data', 'seed.json'), dataFile);
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd:projectRoot,
    env:{ ...process.env, PORT:String(port), DATA_FILE:dataFile, LOCAL_ADMIN_NAME:'Test Administrator', LOCAL_ADMIN_EMAIL:'admin@test.local', LOCAL_ADMIN_PASSWORD:'test-only-password', GOOGLE_CLIENT_ID:'', GOOGLE_CLIENT_SECRET:'', GOOGLE_SERVICE_ACCOUNT_KEY_FILE:'', GOOGLE_SYNC_SUBJECT:'', SECURE_COOKIES:'false' },
    stdio:['ignore','pipe','pipe']
  });
  let output = '';
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 10_000);
      const onData = chunk => { output += chunk; if (output.includes('running at')) { clearTimeout(timeout); resolve(); } };
      child.stdout.on('data', onData); child.stderr.on('data', onData);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited with ${code}: ${output}`)); });
    });
    const request = (path, options = {}) => fetch(origin + path, options);
    const signIn = await request('/auth/local', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ email:'admin@test.local', password:'test-only-password' }) });
    assert.equal(signIn.status, 200);
    const adminCookie = signIn.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(adminCookie);
    const adminHeaders = { cookie:adminCookie, 'content-type':'application/json' };
    const before = await request('/api/admin/access', { headers:{ cookie:adminCookie } });
    assert.equal(before.status, 200);
    const environmentAdmin = (await before.json()).users.find(user => user.email === 'admin@test.local');
    assert.deepEqual({ role:environmentAdmin.role, authType:environmentAdmin.authType, source:environmentAdmin.source, active:environmentAdmin.active, sessionActive:environmentAdmin.sessionActive }, { role:'ADMIN', authType:'local', source:'environment', active:true, sessionActive:true });
    const editEnvironmentAdmin = await request('/api/admin/access', { method:'PATCH', headers:adminHeaders, body:JSON.stringify({ email:'admin@test.local', name:'Changed Name', role:'EMPLOYEE', authType:'google' }) });
    assert.equal(editEnvironmentAdmin.status, 409);
    const password = 'A long original passphrase 2026';
    const create = await request('/api/admin/access', { method:'PATCH', headers:adminHeaders, body:JSON.stringify({ name:'Local Test User', email:'local.user@example.test', role:'EMPLOYEE', authType:'local', password, passwordConfirm:password, active:true }) });
    assert.equal(create.status, 200, await create.text());
    const access = await request('/api/admin/access', { headers:{ cookie:adminCookie } });
    assert.equal(access.status, 200);
    const body = await access.text();
    assert.ok(body.includes('local.user@example.test'));
    assert.ok(!body.includes(password));
    assert.ok(!body.includes('passwordHash'));
    const beforeFirstSignIn = JSON.parse(body).users.find(user => user.email === 'local.user@example.test');
    assert.equal(beforeFirstSignIn.intranetJoinedAt, '');
    const stored = JSON.parse(await readFile(dataFile, 'utf8')).accessUsers.find(user => user.email === 'local.user@example.test');
    assert.ok(stored.passwordHash?.startsWith('scrypt:'));
    assert.ok(!JSON.stringify(stored).includes(password));
    const employeeSignIn = await request('/auth/local', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ email:'local.user@example.test', password }) });
    assert.equal(employeeSignIn.status, 200);
    const employeeCookie = employeeSignIn.headers.get('set-cookie')?.split(';', 1)[0];
    assert.equal((await request('/api/auth/me', { headers:{ cookie:employeeCookie } })).status, 200);
    const afterFirstSignIn = await request('/api/admin/access', { headers:{ cookie:adminCookie } });
    const localAccount = (await afterFirstSignIn.json()).users.find(user => user.email === 'local.user@example.test');
    assert.ok(Date.parse(localAccount.intranetJoinedAt), 'first successful intranet sign-in sets the intranet joined date');
    const deactivate = await request('/api/admin/access', { method:'PATCH', headers:adminHeaders, body:JSON.stringify({ name:'Local Test User', email:'local.user@example.test', role:'EMPLOYEE', active:false }) });
    assert.equal(deactivate.status, 200, await deactivate.text());
    assert.equal((await request('/api/auth/me', { headers:{ cookie:employeeCookie } })).status, 401);
    assert.equal((await request('/auth/local', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ email:'local.user@example.test', password }) })).status, 401);
  } finally {
    if (child.exitCode === null && !child.killed) { child.kill(); await once(child, 'exit'); }
    await rm(tempDir, { recursive:true, force:true });
  }
});
