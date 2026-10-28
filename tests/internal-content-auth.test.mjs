import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer as createNetServer } from 'node:net';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { activeSessionActor, hasEmployeeRole } from '../auth-session.mjs';
import { canOpenAdmin, removedContent, rolePermissionError } from '../public/admin-permissions.js';

const projectRoot = dirname(fileURLToPath(new URL('../server.mjs', import.meta.url)));
const roles = { EMPLOYEE: [], CONTENT_EDITOR: ['content.edit'], ADMIN: ['access.manage'] };
const employee = { id: 'employee-1', name: 'Employee', email: 'employee@example.test', role: 'EMPLOYEE' };
const admin = { id: 'admin-1', name: 'Administrator', email: 'admin@example.test', role: 'ADMIN' };

test('valid employee and administrator sessions are eligible for internal content', () => {
  const future = Date.now() + 60_000;
  assert.deepEqual(activeSessionActor({ actor: employee, expiresAt: future }), employee);
  assert.deepEqual(activeSessionActor({ actor: admin, expiresAt: future }), admin);
  assert.equal(hasEmployeeRole(employee, roles), true);
  assert.equal(hasEmployeeRole(admin, roles), true);
});

test('invalid, expired, and unrecognized sessions are rejected', () => {
  const now = Date.now();
  assert.equal(activeSessionActor(null, now), null);
  assert.equal(activeSessionActor({ actor: employee, expiresAt: now - 1 }, now), null);
  assert.equal(activeSessionActor({ actor: employee, expiresAt: Number.NaN }, now), null);
  assert.equal(hasEmployeeRole({ ...employee, role: 'UNKNOWN' }, roles), false);
});

test('role dependencies and deletion checks match the permission controls', () => {
  assert.equal(canOpenAdmin(['page.media','content.edit']), false);
  assert.equal(canOpenAdmin(['admin.access','page.media','media.manage']), true);
  assert.match(rolePermissionError(['page.media']), /Admin Panel access/);
  assert.match(rolePermissionError(['admin.access','page.media']), /media.manage/);
  assert.match(rolePermissionError(['admin.access','page.overview']), /Administration capability/);
  assert.match(rolePermissionError(['admin.access','action.reset']), /Edit content/);
  assert.match(rolePermissionError(['admin.access','content.publish','content.edit']), /Announcements page/);
  assert.match(rolePermissionError(['admin.access','audit.export','audit.view']), /Activity & audit page/);
  assert.equal(rolePermissionError(['admin.access','content.edit','content.publish','page.announcements']), '');
  assert.equal(rolePermissionError(['intranet.home']), '');
  assert.equal(removedContent({ announcementTemplates:[{ id:'one' }] }, { announcementTemplates:[] }, ['announcementTemplates']), true);
  assert.equal(removedContent({ apps:[{ id:'one' }] }, { apps:[{ id:'one', title:'Updated' }] }, ['apps']), false);
  assert.equal(removedContent({ socialLinks:{ cards:[{ id:'one' }] } }, { socialLinks:{} }, ['socialLinks']), true);
});

test('employee Home exposes permitted Administration entry points without the legacy editor', async () => {
  const html = await readFile(join(projectRoot, 'public', 'index.html'), 'utf8');
  const script = await readFile(join(projectRoot, 'public', 'app.js'), 'utf8');
  const sharedNav = await readFile(join(projectRoot, 'public', 'destination-nav.js'), 'utf8');
  const adminHtml = await readFile(join(projectRoot, 'public', 'admin.html'), 'utf8');
  const adminScript = await readFile(join(projectRoot, 'public', 'admin.js'), 'utf8');
  assert.match(html, /id="admin-panel-link" href="\/admin\.html" hidden/);
  assert.doesNotMatch(html, /id="admin-view-link"|Admin view|Employee view/);
  assert.doesNotMatch(sharedNav, /data-admin-menu-link|Admin view|Employee view/);
  assert.doesNotMatch(adminHtml.match(/<div class="admin-account-menu"[\s\S]*?<\/div>/)?.[0] || '', /View intranet/);
  assert.match(script, /\$\('#admin-panel-link'\)\.hidden = !showAdminPanel/);
  assert.doesNotMatch(html, /id="cms-panel"|id="cms-toggle"|id="content-form"/);
  assert.match(script, /function applyLayout\(\)/);
  assert.doesNotMatch(script, /\/api\/admin\/dashboard|\/api\/uploads|function saveDashboard\(/);
  assert.match(adminHtml, /<body class="admin-loading" aria-busy="true">/);
  assert.match(adminScript, /document\.body\.classList\.remove\('admin-loading'\)/);
  assert.match(adminScript, /profilePhotoUrl = key === 'newMembers' \? await uploadEmployeeProfilePhoto\(photo\) : ''/);
});

test('role editor separates intranet pages from Admin Panel editing access', async () => {
  const adminScript = await readFile(join(projectRoot, 'public', 'admin.js'), 'utf8');
  const permissions = await readFile(join(projectRoot, 'public', 'intranet-permissions.js'), 'utf8');
  assert.match(adminScript, /Intranet pages access/);
  assert.match(adminScript, /Admin Panel \(Edit Content\)/);
  assert.match(adminScript, /value="admin\.access"/);
  for (const path of ['/apps.html','/announcements.html','/news.html','/social-media.html','/moments.html','/knowledge-hub.html','/events.html','/whistleblower.html','/recently-joined.html','/new-hires.html']) {
    assert.ok(permissions.includes(path), `${path} must have a role permission`);
  }
});

async function availablePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function startIsolatedServer({ demoRole = '', permissions = [], legacy = false, seedTransform = null, fakeGroupMembers = null, fakeGroupStatuses = null } = {}) {
  const tempDir = await mkdtemp(join(tmpdir(), 'siware-internal-content-auth-'));
  const dataFile = join(tempDir, 'intranet.json');
  await copyFile(join(projectRoot, 'data', 'seed.json'), dataFile);
  if (demoRole || seedTransform) {
    const data = JSON.parse(await readFile(dataFile, 'utf8'));
    if (demoRole) {
      data.user.role = demoRole;
      data.accessRoles = { [demoRole]:permissions };
      if (!legacy) data.permissionsSchemaVersion = 2;
    }
    seedTransform?.(data);
    await writeFile(dataFile, JSON.stringify(data));
  }
  const port = await availablePort();
  let googleKeyFile = '';
  if (fakeGroupMembers) {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength:2048 });
    googleKeyFile = join(tempDir, 'google-key.json');
    await writeFile(googleKeyFile, JSON.stringify({ type:'service_account', client_email:'test@project.iam.gserviceaccount.com', private_key_id:'test-key', private_key:privateKey.export({ type:'pkcs8', format:'pem' }) }));
  }
  const child = spawn(process.execPath, [...(fakeGroupMembers ? ['--import', new URL('./fake-google-group-api.mjs', import.meta.url).href] : []), 'server.mjs'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: dataFile,
      LOCAL_ADMIN_NAME: 'Authorization Test Administrator',
      LOCAL_ADMIN_EMAIL: demoRole ? '' : 'admin@test.local',
      LOCAL_ADMIN_PASSWORD: demoRole ? '' : 'test-only-password',
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      GOOGLE_SERVICE_ACCOUNT_KEY_FILE: googleKeyFile,
      GOOGLE_SYNC_SUBJECT: fakeGroupMembers ? 'admin@si-ware.com' : '',
      SIWARE_TEST_GROUP_MEMBERS_JSON:fakeGroupMembers ? JSON.stringify(fakeGroupMembers) : '',
      SIWARE_TEST_GROUP_STATUS_JSON:fakeGroupStatuses ? JSON.stringify(fakeGroupStatuses) : '',
      SECURE_COOKIES: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out starting test server: ${output}`)), 8_000);
    const onData = chunk => {
      output += chunk;
      if (output.includes('running at')) { clearTimeout(timeout); resolve(); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Test server exited with ${code}: ${output}`)); });
  });
  await ready;
  return { child, tempDir, origin: `http://127.0.0.1:${port}` };
}

async function stopIsolatedServer({ child, tempDir }) {
  if (child.exitCode === null && !child.killed) {
    child.kill();
    await once(child, 'exit');
  }
  await rm(tempDir, { recursive: true, force: true });
}

test('global announcement bell switch suppresses existing alerts and persists channel defaults', async () => {
  const permissions = ['intranet.announcements', 'admin.access', 'content.edit', 'content.publish', 'settings.manage', 'page.announcements', 'page.notifications'];
  const server = await startIsolatedServer({ demoRole:'NOTIFICATION_EDITOR', permissions });
  try {
    const settings = await (await fetch(`${server.origin}/api/admin/notifications`)).json();
    assert.equal(settings.inAppEnabled, true);
    assert.equal(settings.inAppDefaultEnabled, true);
    assert.equal(settings.emailDefaultEnabled, false);
    const unverifiedGroup = await fetch(`${server.origin}/api/admin/notifications`, { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ inAppEnabled:true, emailEnabled:false, approvedGroups:['everyone@si-ware.com'], defaultGroup:'everyone@si-ware.com' }) });
    assert.equal(unverifiedGroup.status, 422);

    const before = await (await fetch(`${server.origin}/api/admin/dashboard`)).json();
    const unapprovedAnnouncement = { id:'unapproved-group', title:'Unapproved audience', notification:{ audienceGroup:'outside@si-ware.com', inAppEnabled:true, emailEnabled:false } };
    const blockedAudience = await fetch(`${server.origin}/api/admin/dashboard`, { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ version:before._version, data:{ ...before, announcements:[unapprovedAnnouncement, ...(before.announcements || [])] } }) });
    assert.equal(blockedAudience.status, 422);
    const announcement = { id:'notification-test', title:'Notification test', body:'Published for test', publishedAt:new Date().toISOString(), notification:{ inAppEnabled:true, emailEnabled:false } };
    const saved = await fetch(`${server.origin}/api/admin/dashboard`, { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ version:before._version, data:{ ...before, announcements:[announcement, ...(before.announcements || [])] } }) });
    assert.equal(saved.status, 200);
    const beforeSwitch = await (await fetch(`${server.origin}/api/dashboard`)).json();
    assert.deepEqual(beforeSwitch.announcements.find(item => item.id === announcement.id).notification, { inAppEnabled:false, inAppVisible:false });

    const update = await fetch(`${server.origin}/api/admin/notifications`, { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ inAppEnabled:false, inAppDefaultEnabled:false, emailEnabled:false, emailDefaultEnabled:true }) });
    assert.equal(update.status, 200);
    const changed = await update.json();
    assert.equal(changed.inAppEnabled, false);
    assert.equal(changed.inAppDefaultEnabled, false);
    assert.equal(changed.emailDefaultEnabled, true);

    const adminDashboard = await (await fetch(`${server.origin}/api/admin/dashboard`)).json();
    assert.equal(adminDashboard.notificationDefaults.inAppEnabled, false);
    assert.equal(adminDashboard.notificationDefaults.emailDefaultEnabled, true);
    assert.equal(adminDashboard.announcements.find(item => item.id === announcement.id).notification.inAppEnabled, true);

    const employeeDashboard = await (await fetch(`${server.origin}/api/dashboard`)).json();
    const publicNotification = employeeDashboard.announcements.find(item => item.id === announcement.id).notification;
    assert.deepEqual(publicNotification, { inAppEnabled:false, inAppVisible:false });
  } finally {
    await stopIsolatedServer(server);
  }
});

test('group-targeted announcements fail closed when Google membership cannot be verified', async () => {
  const server = await startIsolatedServer({ demoRole:'EMPLOYEE', permissions:['intranet.announcements'], seedTransform:data => {
    data.user.email = 'member@si-ware.com';
    data.adminSettings ||= {};
    data.adminSettings.notificationSettings = { approvedGroups:['everyone@si-ware.com'], defaultGroup:'everyone@si-ware.com', inAppEnabled:true, emailEnabled:false };
    data.announcements = [
      { id:'private-group', title:'Private group update', notification:{ audienceGroup:'everyone@si-ware.com', inAppEnabled:true, emailEnabled:false } },
      { id:'legacy', title:'Older company update', notification:{ inAppEnabled:true, emailEnabled:false } },
      { id:'legacy-targeted', title:'Older targeted update', notification:{ inAppEnabled:true, emailEnabled:false, to:['everyone@si-ware.com'] } },
      { id:'hidden', title:'Hidden company update', hidden:true, notification:{ inAppEnabled:true, emailEnabled:false } }
    ];
  } });
  try {
    const response = await fetch(`${server.origin}/api/dashboard`);
    assert.equal(response.status, 200);
    const dashboard = await response.json();
    assert.deepEqual(dashboard.announcements.map(item => item.id), ['legacy']);
    assert.deepEqual(dashboard.announcements[0].notification, { inAppEnabled:false, inAppVisible:false });
  } finally { await stopIsolatedServer(server); }
});

test('group members and explicitly copied users receive the announcement and bell', async () => {
  for (const [email, expectedIds] of [
    ['member@si-ware.com', ['private-group']],
    ['copied@si-ware.com', ['private-group']],
    ['blind@si-ware.com', ['private-group']],
    ['outsider@si-ware.com', []]
  ]) {
    const server = await startIsolatedServer({ demoRole:'EMPLOYEE', permissions:['intranet.announcements'], fakeGroupMembers:{ 'everyone@si-ware.com':['member@si-ware.com'] }, seedTransform:data => {
      data.user.email = email;
      data.adminSettings ||= {};
      data.adminSettings.notificationSettings = { approvedGroups:['everyone@si-ware.com'], defaultGroup:'everyone@si-ware.com', inAppEnabled:true, emailEnabled:false };
      data.announcements = [{ id:'private-group', title:'Private group update', notification:{ audienceGroup:'everyone@si-ware.com', inAppEnabled:true, emailEnabled:false, cc:['copied@si-ware.com'], bcc:['blind@si-ware.com'] } }];
    } });
    try {
      const response = await fetch(`${server.origin}/api/dashboard`);
      assert.equal(response.status, 200);
      const dashboard = await response.json();
      assert.deepEqual(dashboard.announcements.map(item => item.id), expectedIds);
      if (expectedIds.length) assert.deepEqual(dashboard.announcements[0].notification, { inAppEnabled:true, inAppVisible:true });
    } finally { await stopIsolatedServer(server); }
  }
});

test('CC and BCC outside the group are accepted while To stays on the group', async () => {
  const permissions = ['admin.access', 'content.edit', 'content.publish', 'page.announcements'];
  const server = await startIsolatedServer({ demoRole:'GROUP_EDITOR', permissions, fakeGroupMembers:{ 'everyone@si-ware.com':['member@si-ware.com'] }, seedTransform:data => {
    data.adminSettings ||= {};
    data.adminSettings.notificationSettings = { approvedGroups:['everyone@si-ware.com'], defaultGroup:'everyone@si-ware.com', inAppEnabled:true, emailEnabled:true };
  } });
  try {
    const before = await (await fetch(`${server.origin}/api/admin/dashboard`)).json();
    const notification = { audienceGroup:'everyone@si-ware.com', inAppEnabled:true, emailEnabled:true, emailDeliveryState:'sent', to:['everyone@si-ware.com'], cc:['outsider@si-ware.com'], bcc:['blind@si-ware.com'] };
    const publish = (state, value, id) => fetch(`${server.origin}/api/admin/dashboard`, { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ version:state._version, data:{ ...state, announcements:[{ id, title:'Private email', notification:value }, ...(state.announcements || [])] } }) });
    assert.equal((await publish(before, notification, 'private-email')).status, 200);
    const after = await (await fetch(`${server.origin}/api/admin/dashboard`)).json();
    assert.deepEqual(after.announcements.find(item => item.id === 'private-email').notification.cc, ['outsider@si-ware.com']);
    assert.deepEqual(after.announcements.find(item => item.id === 'private-email').notification.bcc, ['blind@si-ware.com']);
    assert.equal((await publish(after, { ...notification, to:['outsider@si-ware.com'] }, 'wrong-to')).status, 422);
  } finally { await stopIsolatedServer(server); }
});

test('notification administrator can approve the two Google Groups and select a default', async () => {
  const server = await startIsolatedServer({ demoRole:'NOTIFICATION_ADMIN', permissions:['admin.access', 'settings.manage', 'page.notifications'], fakeGroupMembers:{ 'eg.team@si-ware.com':[], 'everyone@si-ware.com':[] } });
  try {
    const response = await fetch(`${server.origin}/api/admin/notifications`, { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ inAppEnabled:true, emailEnabled:false, approvedGroups:['eg.team@si-ware.com','everyone@si-ware.com'], defaultGroup:'eg.team@si-ware.com' }) });
    assert.equal(response.status, 200);
    const settings = await response.json();
    assert.deepEqual(settings.approvedGroups, ['eg.team@si-ware.com','everyone@si-ware.com']);
    assert.equal(settings.defaultGroup, 'eg.team@si-ware.com');
  } finally { await stopIsolatedServer(server); }
});

test('notification group validation identifies inaccessible and missing groups', async () => {
  for (const [status, expected] of [[403, /group\.member\.readonly/], [404, /group address exists/]]) {
    const server = await startIsolatedServer({ demoRole:'NOTIFICATION_ADMIN', permissions:['admin.access', 'settings.manage', 'page.notifications'], fakeGroupMembers:{ 'eg.team@si-ware.com':[] }, fakeGroupStatuses:{ 'eg.team@si-ware.com':status } });
    try {
      const response = await fetch(`${server.origin}/api/admin/notifications`, { method:'PATCH', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ approvedGroups:['eg.team@si-ware.com'], defaultGroup:'eg.team@si-ware.com' }) });
      assert.equal(response.status, 422);
      const body = await response.json();
      assert.match(body.error, /eg\.team@si-ware\.com/);
      assert.match(body.error, expected);
    } finally { await stopIsolatedServer(server); }
  }
});

test('internal search and document routes require a session before returning content', async () => {
  const server = await startIsolatedServer();
  try {
    const protectedPaths = [
      '/api/search?q=Nour',
      '/api/documents/search?q=policy',
      '/api/documents/highlights?url=%2Fuploads%2Fmissing.pdf&page=1&q=policy',
      '/api/documents/info?url=%2Fuploads%2Fmissing.pdf',
      '/api/documents/page?url=%2Fuploads%2Fmissing.pdf&page=1',
      '/uploads/missing.pdf'
    ];

    for (const path of protectedPaths) {
      const response = await fetch(`${server.origin}${path}`);
      assert.equal(response.status, 401, `${path} should reject an unauthenticated direct request`);
      assert.deepEqual(await response.json(), { error: 'Sign in is required.' });
    }

    const invalidSession = await fetch(`${server.origin}/api/search?q=Nour`, { headers: { cookie: 'siware_session=invalid-session' } });
    assert.equal(invalidSession.status, 401);
    assert.deepEqual(await invalidSession.json(), { error: 'Sign in is required.' });

    const dashboardWithoutSession = await fetch(`${server.origin}/api/dashboard`);
    assert.equal(dashboardWithoutSession.status, 401, 'dashboard authentication behavior remains unchanged');

    const signIn = await fetch(`${server.origin}/auth/local`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.local', password: 'test-only-password' }),
      redirect: 'manual'
    });
    assert.equal(signIn.status, 200);
    const sessionCookie = signIn.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(sessionCookie, 'local sign-in returns a session cookie');
    const authenticated = { headers: { cookie: sessionCookie } };

    const dashboard = await fetch(`${server.origin}/api/dashboard`, authenticated);
    assert.equal(dashboard.status, 200);
    assert.equal((await dashboard.json()).user.role, 'ADMIN');

    const search = await fetch(`${server.origin}/api/search?q=Nour`, authenticated);
    assert.equal(search.status, 200);
    assert.equal(Array.isArray(await search.json()), true);

    const documentSearch = await fetch(`${server.origin}/api/documents/search?q=policy`, authenticated);
    assert.equal(documentSearch.status, 200);
    assert.equal(Array.isArray(await documentSearch.json()), true);

    for (const path of protectedPaths.slice(2)) {
      const response = await fetch(`${server.origin}${path}`, authenticated);
      assert.notEqual(response.status, 401, `${path} should pass the authorization boundary for an authenticated administrator`);
      assert.notDeepEqual(await response.json(), { error: 'Sign in is required.' });
    }
  } finally {
    await stopIsolatedServer(server);
  }
});

test('administration routes enforce page, publishing, import, deletion, and audit permissions', async () => {
  const server = await startIsolatedServer();
  try {
    const signIn = await fetch(`${server.origin}/auth/local`, {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ email:'admin@test.local', password:'test-only-password' })
    });
    assert.equal(signIn.status, 200);
    const cookie = signIn.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(cookie);
    const headers = { cookie, 'content-type':'application/json' };
    const request = (path, method = 'GET', body) => fetch(`${server.origin}${path}`, {
      method, headers, ...(body === undefined ? {} : { body:JSON.stringify(body) })
    });
    const googleSync = await request('/api/admin/google-sync');
    assert.equal(googleSync.status, 200);
    const googleSyncData = await googleSync.json();
    assert.equal(typeof googleSyncData.settings.enabled, 'boolean');
    assert.equal(googleSyncData.resources.length, 2);
    assert.equal(googleSyncData.connected, false);
    assert.equal((await request('/api/admin/google-sync', 'PATCH', { enabled:true, ouPaths:['/Egypt/Consultants'], calendarIds:[] })).status, 422);
    assert.equal((await request('/api/admin/google-sync', 'PATCH', { enabled:true, ouPaths:['/Egypt/Full-Time Employees'], calendarIds:[] })).status, 422);
    for (const [path, method] of [
      ['/api/dashboard','PATCH'], ['/api/new-members','POST'], ['/api/sessions','POST'],
      ['/api/announcements','POST'], ['/api/policies','POST']
    ]) {
      assert.equal((await request(path, method, {})).status, 405, `${method} ${path} must not retain a legacy editing path`);
    }
    const employeeDashboard = await (await request('/api/dashboard')).json();
    for (const key of ['accessUsers','accessRoles','auditEvents','activityEvents','adminSettings','policyAcknowledgements','announcementTemplates']) {
      assert.equal(Object.hasOwn(employeeDashboard, key), false, `${key} must not appear in the employee payload`);
    }
    const invalidRole = await request('/api/admin/roles', 'PATCH', {
      id:'ADMIN', permissions:['access.manage','page.users','page.roles','page.media']
    });
    assert.equal(invalidRole.status, 422);
    const limited = ['admin.access','access.manage','page.users','page.roles','content.edit','page.announcements'];
    assert.equal((await request('/api/admin/roles', 'PATCH', { id:'ADMIN', permissions:limited })).status, 200);
    assert.equal((await request('/api/admin/audit')).status, 403);
    assert.equal((await request('/api/admin/media')).status, 403);
    assert.equal((await request('/api/admin/settings', 'PATCH', { auditRetentionDays:365, activityRetentionDays:90 })).status, 403);
    assert.equal((await request('/api/admin/google-sync')).status, 403);
    assert.equal((await request('/api/admin/google-sync', 'PATCH', { enabled:false, ouPaths:[], calendarIds:[] })).status, 403);
    assert.equal((await request('/api/admin/google-sync/run', 'POST', {})).status, 403);
    assert.equal((await request('/api/admin/access', 'PATCH', { email:'import@test.local', role:'EMPLOYEE', operation:'import' })).status, 403);
    const adminDashboard = await (await request('/api/admin/dashboard')).json();
    assert.equal(Object.hasOwn(adminDashboard, 'accessUsers'), false);
    assert.equal(Object.hasOwn(adminDashboard, 'announcementTemplates'), true);
    const announcement = { ...adminDashboard, announcements:[...(adminDashboard.announcements || []), { id:'test-announcement', title:'Test' }] };
    assert.equal((await request('/api/admin/dashboard', 'PATCH', { version:adminDashboard._version, data:announcement })).status, 403);
    const apps = { ...adminDashboard, apps:[...(adminDashboard.apps || []), { id:'test-app', name:'Test' }] };
    assert.equal((await request('/api/admin/dashboard', 'PATCH', { version:adminDashboard._version, data:apps })).status, 403);
    assert.equal((await request('/api/admin/dashboard', 'PATCH', { version:adminDashboard._version, data:{ ...adminDashboard, announcementTemplates:[...(adminDashboard.announcementTemplates || []), { id:'reset-check' }] }, operation:'reset' })).status, 403);
    const template = { id:'test-template', title:'Template', body:'Example' };
    const added = await request('/api/admin/dashboard', 'PATCH', { version:adminDashboard._version, data:{ ...adminDashboard, announcementTemplates:[...(adminDashboard.announcementTemplates || []), template] } });
    assert.equal(added.status, 200);
    const withTemplate = await added.json();
    assert.equal((await request('/api/admin/dashboard', 'PATCH', { version:withTemplate._version, data:{ ...withTemplate, announcementTemplates:[] } })).status, 403);
    assert.equal((await request('/api/admin/roles', 'PATCH', { id:'ADMIN', permissions:[...limited,'action.delete'] })).status, 200);
    const fresh = await (await request('/api/admin/dashboard')).json();
    assert.equal((await request('/api/admin/dashboard', 'PATCH', { version:fresh._version, data:{ ...fresh, announcementTemplates:[] } })).status, 200);
    assert.equal((await request('/api/admin/roles', 'PATCH', { id:'ADMIN', permissions:[...limited,'action.delete','page.home'] })).status, 200);
    const homeOnly = await (await request('/api/admin/dashboard')).json();
    const changedTheme = { ...homeOnly, settings:{ ...homeOnly.settings, theme:homeOnly.settings.theme === 'dark' ? 'light' : 'dark' } };
    assert.equal((await request('/api/admin/dashboard', 'PATCH', { version:homeOnly._version, data:changedTheme })).status, 403);
  } finally {
    await stopIsolatedServer(server);
  }
});

test('a limited People editor can save Our Team without being blocked by non-editable event data', async () => {
  const permissions = ['intranet.home', 'intranet.people', 'intranet.announcements', 'admin.access', 'content.edit', 'content.publish', 'page.content', 'page.people', 'page.announcements'];
  const server = await startIsolatedServer({ demoRole:'PEOPLE_TEAM', permissions });
  try {
    const dashboardResponse = await fetch(`${server.origin}/api/admin/dashboard`);
    assert.equal(dashboardResponse.status, 200);
    const dashboard = await dashboardResponse.json();
    assert.equal(Object.hasOwn(dashboard, 'newMembers'), true);
    assert.equal(Object.hasOwn(dashboard, 'announcements'), true);
    assert.equal(Object.hasOwn(dashboard, 'events'), false);

    const changed = {
      ...dashboard,
      newMembers:[...(dashboard.newMembers || []), { id:'people-editor-test', name:'People Editor Test', companyEmail:'people.editor.test@si-ware.com' }]
    };
    const saved = await fetch(`${server.origin}/api/admin/dashboard`, {
      method:'PATCH',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ version:dashboard._version, data:changed })
    });
    assert.equal(saved.status, 200);
  } finally {
    await stopIsolatedServer(server);
  }
});

test('intranet page permissions block direct routes and restricted employee content', async () => {
  const server = await startIsolatedServer();
  try {
    const signIn = await fetch(`${server.origin}/auth/local`, {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ email:'admin@test.local', password:'test-only-password' })
    });
    assert.equal(signIn.status, 200);
    const cookie = signIn.headers.get('set-cookie')?.split(';', 1)[0];
    const headers = { cookie, 'content-type':'application/json' };
    const directory = await (await fetch(`${server.origin}/api/admin/access`, { headers })).json();
    const adminRole = directory.roles.find(role => role.id === 'ADMIN');
    assert.ok(adminRole.permissions.includes('admin.access'));
    const permissions = adminRole.permissions.filter(permission => !['intranet.knowledge','intranet.newsi','intranet.news'].includes(permission));
    const updated = await fetch(`${server.origin}/api/admin/roles`, {
      method:'PATCH', headers, body:JSON.stringify({ id:'ADMIN', permissions })
    });
    assert.equal(updated.status, 200);
    for (const path of ['/knowledge-hub.html','/KNOWLEDGE-HUB.HTML','/new-hires.html','/news.html']) {
      const response = await fetch(`${server.origin}${path}`, { headers });
      assert.equal(response.status, 403, path);
      assert.match(await response.text(), /Access to this page is restricted/);
    }
    assert.equal((await fetch(`${server.origin}/knowledge-hub.html`, { method:'HEAD', headers })).status, 403);
    assert.equal((await fetch(`${server.origin}/apps.html`, { headers })).status, 200);
    assert.equal((await fetch(`${server.origin}/admin.html`, { headers })).status, 200);
    const employeeDashboard = await (await fetch(`${server.origin}/api/dashboard`, { headers })).json();
    assert.deepEqual(employeeDashboard.sessions, []);
    assert.deepEqual(employeeDashboard.policies, []);
    assert.deepEqual(employeeDashboard.knowledgePageContent || {}, {});
    assert.ok(employeeDashboard.apps.length > 0);
    assert.equal((await fetch(`${server.origin}/api/documents/search?q=policy`, { headers })).status, 403);
    assert.equal((await fetch(`${server.origin}/api/company-news`, { headers })).status, 403);
    const search = await (await fetch(`${server.origin}/api/search?q=Patenting`, { headers })).json();
    assert.equal(search.some(result => result.type === 'Knowledge' || result.type === 'Policy' || result.type === 'Document'), false);
    const homeOnly = await fetch(`${server.origin}/api/admin/roles`, {
      method:'POST', headers, body:JSON.stringify({ id:'HOME_ONLY', permissions:['intranet.home'] })
    });
    assert.equal(homeOnly.status, 200);
  } finally {
    await stopIsolatedServer(server);
  }
});

test('an intranet-only role cannot open Administration or its APIs', async () => {
  const server = await startIsolatedServer({ demoRole:'HOME_ONLY', permissions:['intranet.home'] });
  try {
    assert.equal((await fetch(`${server.origin}/`)).status, 200);
    assert.equal((await fetch(`${server.origin}/admin.html`)).status, 403);
    assert.equal((await fetch(`${server.origin}/announcements.html`)).status, 403);
    assert.equal((await fetch(`${server.origin}/api/admin/dashboard`)).status, 403);
    assert.equal((await fetch(`${server.origin}/api/admin/audit`)).status, 403);
    const dashboard = await (await fetch(`${server.origin}/api/dashboard`)).json();
    assert.deepEqual(dashboard.announcements, []);
    assert.deepEqual(dashboard.sessions, []);
    assert.equal((await fetch(`${server.origin}/api/auth/me`)).status, 200);
  } finally {
    await stopIsolatedServer(server);
  }
});

test('existing saved roles keep their prior page access during migration', async () => {
  const server = await startIsolatedServer({ demoRole:'LEGACY_EDITOR', permissions:['content.edit','page.content'], legacy:true });
  try {
    const identity = await (await fetch(`${server.origin}/api/auth/me`)).json();
    assert.ok(identity.permissions.includes('intranet.home'));
    assert.ok(identity.permissions.includes('intranet.knowledge'));
    assert.ok(identity.permissions.includes('admin.access'));
    assert.equal((await fetch(`${server.origin}/knowledge-hub.html`)).status, 200);
    assert.equal((await fetch(`${server.origin}/admin.html`)).status, 200);
  } finally {
    await stopIsolatedServer(server);
  }
});

test('audit trail includes page opens, clicks, and field-level content changes without whistleblower activity', async () => {
  const server = await startIsolatedServer();
  try {
    const signIn = await fetch(`${server.origin}/auth/local`, {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ email:'admin@test.local', password:'test-only-password' })
    });
    assert.equal(signIn.status, 200);
    const cookie = signIn.headers.get('set-cookie')?.split(';', 1)[0];
    const headers = { cookie, 'content-type':'application/json' };
    const event = (action, route, control = '') => ({ id:randomUUID(), occurredAt:new Date().toISOString(), action, component:'test-control', route, metadata:{ page:'Administration · Roles', control } });
    const posted = await fetch(`${server.origin}/api/activity`, {
      method:'POST', headers, body:JSON.stringify({ events:[event('page.open', '/admin.html'), event('button.click', '/admin.html', 'Save role'), event('button.click', '/whistleblower.html', 'Private action')] })
    });
    assert.equal(posted.status, 202);
    assert.equal((await posted.json()).accepted, 2);
    const pageEvents = await (await fetch(`${server.origin}/api/admin/audit?category=page`, { headers })).json();
    assert.equal(pageEvents.records[0].action, 'page.open');
    assert.equal(pageEvents.records[0].actor.email, 'admin@test.local');
    const clicks = await (await fetch(`${server.origin}/api/admin/audit?category=click`, { headers })).json();
    assert.equal(clicks.records[0].metadata.control, 'Save role');
    assert.equal(clicks.records.some(record => record.route === '/whistleblower.html'), false);
    const before = await (await fetch(`${server.origin}/api/admin/dashboard`, { headers })).json();
    const updated = await fetch(`${server.origin}/api/admin/dashboard`, {
      method:'PATCH', headers,
      body:JSON.stringify({ version:before._version, data:{ ...before, homePageContent:{ ...before.homePageContent, heroTitle:'Audited title' } } })
    });
    assert.equal(updated.status, 200);
    const changes = await (await fetch(`${server.origin}/api/admin/audit?category=change`, { headers })).json();
    const titleChange = changes.records.find(record => record.changes?.details?.some(detail => detail.field === 'heroTitle'));
    assert.ok(titleChange);
    assert.equal(titleChange.changes.details.find(detail => detail.field === 'heroTitle').after, 'Audited title');
    const all = await (await fetch(`${server.origin}/api/admin/audit?category=all`, { headers })).json();
    assert.ok(all.counts.page >= 1 && all.counts.click >= 1 && all.counts.change >= 1);
    const csv = await (await fetch(`${server.origin}/api/admin/audit/export?category=change`, { headers })).text();
    assert.match(csv, /change_details/);
    assert.match(csv, /Audited title/);
  } finally {
    await stopIsolatedServer(server);
  }
});
