import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { workspaceSyncConfig, createWorkspaceClient, mergeDirectoryMembers, mergeCalendarEvents, syncWorkspaceContent, eligibleEmployeeOu } from '../google-workspace-sync.mjs';

const now = new Date('2026-10-22T10:00:00.000Z');
const config = { ous:['/People/New Hires'], lookbackDays:30, hireDateField:'Employment.hireDate', divisionField:'Employment.division', calendars:[{ id:'room@resource.calendar.google.com', label:'Training Room' }] };
const user = overrides => ({ id:'google-123', primaryEmail:'new.person@si-ware.com', orgUnitPath:config.ous[0], creationTime:'2026-10-21T08:00:00Z', name:{ fullName:'New Person' }, organizations:[{ primary:true, title:'Engineer', department:'R&D' }], relations:[{ type:'manager', value:'Manager Name' }], customSchemas:{ Employment:{ hireDate:'2026-10-20', division:'Solutions' } }, ...overrides });

test('OU picker accepts employment branches but excludes guests and consultants', () => {
  assert.equal(eligibleEmployeeOu('/Egypt/Full-Time Employees'), true);
  assert.equal(eligibleEmployeeOu('/Egypt/Graduate Interns'), true);
  assert.equal(eligibleEmployeeOu('/Europe/Employees'), true);
  assert.equal(eligibleEmployeeOu('/Workspace Guests/Employees'), false);
  assert.equal(eligibleEmployeeOu('/Egypt/Consultants'), false);
  assert.equal(eligibleEmployeeOu('/Egypt/Employees/Consultants/Interns'), false);
});

test('requires one non-root OU and explicit delegated credentials', () => {
  assert.throws(() => workspaceSyncConfig({ GOOGLE_RECENTLY_JOINED_OU:'/' }), /non-root/);
  assert.throws(() => workspaceSyncConfig({ GOOGLE_RECENTLY_JOINED_OU:'/People/New Hires' }), /needs/);
  const parsed = workspaceSyncConfig({ GOOGLE_RECENTLY_JOINED_OU:'/People/New Hires/', GOOGLE_SYNC_SUBJECT:'admin@si-ware.com', GOOGLE_SERVICE_ACCOUNT_KEY_FILE:'/run/secrets/key.json', GOOGLE_CALENDAR_RESOURCES:'Training Room|room@example.com,events@example.com' });
  assert.deepEqual(parsed.ous, ['/People/New Hires']);
  assert.deepEqual(parsed.calendars, [{ id:'room@example.com', label:'Training Room' }, { id:'events@example.com', label:'Calendar event' }]);
});

test('adds only recent active accounts in the exact OU and uses HR hire date', () => {
  const data = { newMembers:[] };
  const result = mergeDirectoryMembers(data, [user(), user({ id:'child', orgUnitPath:'/People/New Hires/Team' }), user({ id:'old', creationTime:'2026-01-01T00:00:00Z' }), user({ id:'suspended', suspended:true })], config, now);
  assert.deepEqual(result, { created:1, updated:0 });
  assert.equal(data.newMembers[0].name, 'New Person');
  assert.equal(data.newMembers[0].joined, 'October 2026');
  assert.equal(data.newMembers[0].employmentType, 'To be confirmed');
  assert.equal(data.newMembers[0].directManager, 'Manager Name');
  assert.equal(mergeDirectoryMembers(data, [user()], config, now).created, 0);
});

test('matches an existing card by email and respects manual corrections', () => {
  const data = { newMembers:[{ id:'manual-1', companyEmail:'new.person@si-ware.com', name:'Preferred Name', role:'Senior Engineer', department:'To be confirmed' }] };
  mergeDirectoryMembers(data, [user()], config, now);
  assert.equal(data.newMembers.length, 1);
  assert.equal(data.newMembers[0].id, 'manual-1');
  assert.equal(data.newMembers[0].googleUserId, 'google-123');
  assert.equal(data.newMembers[0].name, 'Preferred Name');
  assert.equal(data.newMembers[0].role, 'Senior Engineer');
  assert.equal(data.newMembers[0].department, 'R&D');
  assert.equal(data.newMembers[0].joined, 'October 2026');
});

test('unknown hire date remains unconfirmed rather than using account creation', () => {
  const data = { newMembers:[] };
  mergeDirectoryMembers(data, [user({ customSchemas:{} })], config, now);
  assert.equal(data.newMembers[0].joined, 'To be confirmed');
});

test('multiple exact Egypt OUs map known employment types without importing child OUs', async () => {
  const settings = { ...config, ous:['/Egypt/Full-Time Employees', '/Egypt/Graduate Interns'], calendars:[] };
  const data = { newMembers:[], events:[] };
  const result = await syncWorkspaceContent(data, settings, {
    users:async ou => [user({ id:ou, primaryEmail:`${ou.includes('Graduate') ? 'graduate' : 'employee'}@si-ware.com`, orgUnitPath:ou }), user({ id:`${ou}-child`, primaryEmail:'child@si-ware.com', orgUnitPath:`${ou}/Team` })],
    events:async () => []
  }, now);
  assert.equal(result.members.created, 2);
  assert.deepEqual(new Set(data.newMembers.map(member => member.employmentType)), new Set(['Full Time', 'Graduate Intern']));
  assert.equal(data.newMembers.some(member => member.companyEmail === 'child@si-ware.com'), false);
});

test('calendar sync keeps manual items, expands imported occurrences, and removes stale ones', () => {
  const data = { events:[{ id:'manual', title:'Manual event', day:'25', month:'OCT', time:'9:00 AM', type:'Company' }] };
  const calendar = config.calendars[0];
  const first = mergeCalendarEvents(data, calendar, [
    { id:'weekly_1', summary:'Training session', start:{ dateTime:'2026-10-23T11:00:00+02:00' } },
    { id:'weekly_2', summary:'Private booking', visibility:'private', start:{ date:'2026-10-24' } },
    { id:'weekly_3', summary:'Cancelled', status:'cancelled', start:{ date:'2026-10-25' } }
  ]);
  assert.deepEqual(first, { changed:true, count:1 });
  assert.equal(data.events[0].title, 'Training session');
  assert.equal(data.events[0].type, 'Training Room');
  assert.equal(data.events[0].day, '23');
  assert.equal(data.events[1].id, 'manual');
  assert.equal(mergeCalendarEvents(data, calendar, []).count, 0);
  assert.deepEqual(data.events.map(event => event.id), ['manual']);
});

test('failed calendar reads preserve previously imported events', async () => {
  const data = { newMembers:[], events:[{ id:'google-event-1', source:'google-calendar', sourceCalendarId:config.calendars[0].id, title:'Existing' }] };
  const result = await syncWorkspaceContent(data, config, { users:async () => [], events:async () => { throw new Error('Access denied'); } }, now);
  assert.equal(result.changed, false);
  assert.equal(result.errors.length, 1);
  assert.equal(data.events[0].title, 'Existing');
});

test('delegated client uses read-only scopes and paginates the OU and resource calendar', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength:2048 });
  const credentials = { type:'service_account', client_email:'sync@project.iam.gserviceaccount.com', private_key_id:'key-1', private_key:privateKey.export({ type:'pkcs8', format:'pem' }) };
  const calls = [];
  const fetchImpl = async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname === '/token') return { ok:true, json:async () => ({ access_token:'test-token', expires_in:3600 }) };
    if (url.pathname.endsWith('/users')) return { ok:true, json:async () => url.searchParams.has('pageToken') ? { users:[user({ id:'second' })] } : { users:[user()], nextPageToken:'next' } };
    if (url.pathname.endsWith('/orgunits')) return { ok:true, json:async () => ({ organizationUnits:[{ orgUnitPath:'/Egypt/Full-Time Employees', name:'Full-Time Employees', parentOrgUnitPath:'/Egypt' }, { orgUnitPath:'/Egypt/Consultants', name:'Consultants', parentOrgUnitPath:'/Egypt' }] }) };
    return { ok:true, json:async () => ({ items:[{ id:'event-1', summary:'Workshop', start:{ date:'2026-10-23' } }] }) };
  };
  const client = await createWorkspaceClient({ ...config, keyFile:'test-key.json', subject:'admin@si-ware.com' }, { fetchImpl, now:() => now, readCredentials:async () => JSON.stringify(credentials) });
  assert.deepEqual(await client.orgUnits(), [{ path:'/Egypt/Full-Time Employees', name:'Full-Time Employees', parent:'/Egypt' }]);
  assert.equal((await client.users(config.ous[0])).length, 2);
  assert.equal((await client.events(config.calendars[0].id, now, new Date('2026-11-22T10:00:00Z'))).length, 1);
  assert.equal(calls.filter(call => call.url.pathname === '/token').length, 3);
  const directory = calls.find(call => call.url.pathname.endsWith('/users'));
  assert.equal(directory.url.searchParams.get('viewType'), 'admin_view');
  assert.equal(directory.url.searchParams.get('query'), "orgUnitPath='/People/New Hires'");
  assert.equal(directory.options.headers.authorization, 'Bearer test-token');
  const calendar = calls.find(call => call.url.pathname.endsWith('/events'));
  assert.equal(calendar.url.searchParams.get('singleEvents'), 'true');
  assert.equal(calendar.url.searchParams.get('eventTypes'), 'default');
});
