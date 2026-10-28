import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { workspaceSyncConfig, createWorkspaceClient, mergeDirectoryMembers, mergeCalendarEvents, syncWorkspaceContent, eligibleEmployeeOu } from '../google-workspace-sync.mjs';

const now = new Date('2026-10-22T10:00:00.000Z');
const config = { ous:['/People/New Hires'], lookbackDays:30, hireDateField:'Employment.hireDate', divisionField:'Employment.division', calendars:[{ id:'room@resource.calendar.google.com', label:'Training Room' }] };
const user = overrides => ({ id:'google-123', primaryEmail:'new.person@si-ware.com', orgUnitPath:config.ous[0], creationTime:'2026-10-21T08:00:00Z', thumbnailPhotoUrl:'https://lh3.googleusercontent.com/a/profile-photo', externalIds:[{ type:'organization', value:'439' }], name:{ fullName:'New Person' }, organizations:[{ primary:true, title:'Engineer', department:'R&D' }], relations:[{ type:'manager', value:'Manager Name' }], phones:[{ type:'home', value:'01018191555' }], customSchemas:{ Employment:{ hireDate:'2026-10-20', division:'Solutions' } }, ...overrides });

test('OU picker accepts every non-root Google Workspace organizational unit', () => {
  assert.equal(eligibleEmployeeOu('/Egypt/Full-Time Employees'), true);
  assert.equal(eligibleEmployeeOu('/Egypt/Graduate Interns'), true);
  assert.equal(eligibleEmployeeOu('/Egypt'), true);
  assert.equal(eligibleEmployeeOu('/Egypt/Consultants'), true);
  assert.equal(eligibleEmployeeOu('/Workspace Guests'), true);
  assert.equal(eligibleEmployeeOu('/'), false);
});

test('requires one non-root OU and explicit delegated credentials', () => {
  assert.throws(() => workspaceSyncConfig({ GOOGLE_RECENTLY_JOINED_OU:'/' }), /non-root/);
  assert.throws(() => workspaceSyncConfig({ GOOGLE_RECENTLY_JOINED_OU:'/People/New Hires' }), /needs/);
  const parsed = workspaceSyncConfig({ GOOGLE_RECENTLY_JOINED_OU:'/People/New Hires/', GOOGLE_SYNC_SUBJECT:'admin@si-ware.com', GOOGLE_SERVICE_ACCOUNT_KEY_FILE:'/run/secrets/key.json', GOOGLE_CALENDAR_RESOURCES:'Training Room|room@example.com,events@example.com' });
  assert.deepEqual(parsed.ous, ['/People/New Hires']);
  assert.deepEqual(parsed.calendars, [{ id:'room@example.com', label:'Training Room' }, { id:'events@example.com', label:'Calendar event' }]);
});

test('adds every active account in the exact OU and retains the Google creation date', () => {
  const data = { newMembers:[] };
  const result = mergeDirectoryMembers(data, [user(), user({ id:'child', orgUnitPath:'/People/New Hires/Team' }), user({ id:'old', primaryEmail:'old@si-ware.com', creationTime:'2026-01-01T00:00:00Z' }), user({ id:'suspended', suspended:true })], config, now);
  assert.deepEqual(result, { created:2, updated:0 });
  assert.equal(data.newMembers[0].name, 'New Person');
  assert.equal(data.newMembers[0].joined, 'October 2026');
  assert.equal(data.newMembers[0].employmentType, 'To be confirmed');
  assert.equal(data.newMembers[0].directManager, 'Manager Name');
  assert.equal(data.newMembers[0].photoUrl, `/api/directory-photo/${data.newMembers[0].id}`);
  assert.equal(data.newMembers[0].employeeId, '439');
  assert.equal(data.newMembers[0].phone, '01018191555');
  assert.equal(data.newMembers[0].organizationUnit, '/People/New Hires');
  assert.equal(data.newMembers.some(member => member.googleUserId === 'old'), true);
  assert.equal(data.newMembers.find(member => member.companyEmail === 'new.person@si-ware.com').googleCreatedAt, '2026-10-21T08:00:00.000Z');
  assert.equal(mergeDirectoryMembers(data, [user()], config, now).created, 0);
});

test('matches an existing card by email and refreshes Google-sourced fields', () => {
  const data = { newMembers:[{ id:'manual-1', companyEmail:'new.person@si-ware.com', name:'Preferred Name', role:'Senior Engineer', department:'To be confirmed' }] };
  mergeDirectoryMembers(data, [user()], config, now);
  assert.equal(data.newMembers.length, 1);
  assert.equal(data.newMembers[0].id, 'manual-1');
  assert.equal(data.newMembers[0].googleUserId, 'google-123');
  assert.equal(data.newMembers[0].name, 'New Person');
  assert.equal(data.newMembers[0].role, 'Engineer');
  assert.equal(data.newMembers[0].department, 'R&D');
  assert.equal(data.newMembers[0].joined, 'October 2026');
});

test('keeps intranet-owned division, LinkedIn details, and original photos through future directory syncs', () => {
  const data = { newMembers:[{ id:'manual-2', googleUserId:'google-123', companyEmail:'new.person@si-ware.com', division:'Product', linkedinUrl:'https://www.linkedin.com/in/new-person', profilePhotoUrl:'/uploads/new-person-original.jpg', intranetOverrides:{ division:true, linkedinUrl:true }, googleImportedFields:{ division:'Solutions' } }] };
  mergeDirectoryMembers(data, [user({ customSchemas:{ Employment:{ hireDate:'2026-10-20', division:'Platform' } } })], config, now);
  assert.equal(data.newMembers[0].division, 'Product');
  assert.equal(data.newMembers[0].linkedinUrl, 'https://www.linkedin.com/in/new-person');
  assert.equal(data.newMembers[0].profilePhotoUrl, '/uploads/new-person-original.jpg');
  assert.equal(data.newMembers[0].googleImportedFields.division, 'Platform');
});

test('fills a previously empty card when Google later adds a photo, without replacing any existing photo', () => {
  const data = { newMembers:[
    { id:'empty-photo', googleUserId:'google-123', companyEmail:'new.person@si-ware.com', photoUrl:'' },
    { id:'uploaded-photo', googleUserId:'google-456', companyEmail:'uploaded@si-ware.com', profilePhotoUrl:'/uploads/uploaded-original.jpg', photoUrl:'/uploads/legacy-photo.jpg' },
    { id:'google-photo', googleUserId:'google-789', companyEmail:'google@si-ware.com', photoUrl:'/api/directory-photo/google-photo' }
  ] };
  mergeDirectoryMembers(data, [
    user(),
    user({ id:'google-456', primaryEmail:'uploaded@si-ware.com' }),
    user({ id:'google-789', primaryEmail:'google@si-ware.com', thumbnailPhotoUrl:'' })
  ], config, now);
  assert.equal(data.newMembers.find(member => member.id === 'empty-photo').photoUrl, '/api/directory-photo/empty-photo');
  assert.equal(data.newMembers.find(member => member.id === 'uploaded-photo').profilePhotoUrl, '/uploads/uploaded-original.jpg');
  assert.equal(data.newMembers.find(member => member.id === 'uploaded-photo').photoUrl, '/uploads/legacy-photo.jpg');
  assert.equal(data.newMembers.find(member => member.id === 'google-photo').photoUrl, '/api/directory-photo/google-photo');
});

test('unknown hire date falls back to the Google Workspace account creation date', () => {
  const data = { newMembers:[] };
  mergeDirectoryMembers(data, [user({ customSchemas:{} })], config, now);
  assert.equal(data.newMembers[0].joined, 'October 21, 2026');
});

test('uses the Google Admin employee-information description as the employment type', () => {
  const data = { newMembers:[] };
  mergeDirectoryMembers(data, [user({ organizations:[{ primary:true, title:'Engineer', department:'R&D', description:'Full-Time' }] })], config, now);
  assert.equal(data.newMembers[0].employmentType, 'Full-Time');
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

test('removes Google-managed cards after a user leaves or an administrator deselects an OU, without removing manual cards', async () => {
  const data = {
    newMembers:[
      { id:'left-user', source:'google-directory', googleUserId:'left-google-user', companyEmail:'left@si-ware.com', organizationUnit:'/People/New Hires' },
      { id:'active-user', source:'google-directory', googleUserId:'google-123', companyEmail:'new.person@si-ware.com', organizationUnit:'/People/New Hires' },
      { id:'manual-user', googleUserId:'manual-google-user', companyEmail:'manual@si-ware.com', organizationUnit:'/People/New Hires' },
      { id:'deselected-user', source:'google-directory', googleUserId:'old-google-user', companyEmail:'old@si-ware.com', organizationUnit:'/People/Alumni' }
    ],
    events:[]
  };
  const result = await syncWorkspaceContent(data, { ...config, calendars:[] }, { users:async () => [user()] }, now);
  assert.equal(result.members.removed, 2);
  assert.equal(result.changed, true);
  assert.deepEqual(new Set(data.newMembers.map(member => member.id)), new Set(['active-user', 'manual-user']));
});

test('does not remove directory cards when a selected OU cannot be read', async () => {
  const data = { newMembers:[{ id:'kept-user', source:'google-directory', googleUserId:'kept-google-user', companyEmail:'kept@si-ware.com', organizationUnit:'/People/New Hires' }], events:[] };
  const result = await syncWorkspaceContent(data, { ...config, calendars:[] }, { users:async () => { throw new Error('Directory unavailable'); } }, now);
  assert.equal(result.members.removed, 0);
  assert.equal(data.newMembers.length, 1);
  assert.match(result.errors[0], /Directory unavailable/);
});

test('calendar sync keeps manual items, expands imported occurrences, and removes stale ones', () => {
  const data = { events:[{ id:'manual', title:'Manual event', day:'25', month:'OCT', time:'9:00 AM', type:'Company' }] };
  const calendar = config.calendars[0];
  const first = mergeCalendarEvents(data, calendar, [
    { id:'weekly_1', summary:'Training session', description:'Bring your update. Join https://zoom.us/j/123456', hangoutLink:'https://meet.google.com/abc-defg-hij', organizer:{ email:'organizer@si-ware.com', displayName:'Meeting organizer' }, attendees:[{ email:'organizer@si-ware.com', displayName:'Meeting organizer' }, { email:'guest@si-ware.com', displayName:'Invited guest' }], attachments:[{ title:'Agenda', fileUrl:'https://drive.google.com/file/d/agenda', mimeType:'application/pdf' }], start:{ dateTime:'2026-10-23T11:00:00+02:00' } },
    { id:'weekly_2', summary:'Private booking', visibility:'private', start:{ date:'2026-10-24' } },
    { id:'weekly_3', summary:'Cancelled', status:'cancelled', start:{ date:'2026-10-25' } }
  ]);
  assert.deepEqual(first, { changed:true, count:1 });
  assert.equal(data.events[0].title, 'Training session');
  assert.equal(data.events[0].type, 'Training Room');
  assert.equal(data.events[0].day, '23');
  assert.equal(data.events[0].privateDetails.description, 'Bring your update. Join https://zoom.us/j/123456');
  assert.deepEqual(data.events[0].privateDetails.meetingLinks, [
    { label:'Join Google Meet', url:'https://meet.google.com/abc-defg-hij' },
    { label:'Join Zoom Meeting', url:'https://zoom.us/j/123456' }
  ]);
  assert.deepEqual(data.events[0].privateDetails.attachments.map(file => file.title), ['Agenda']);
  assert.deepEqual(data.events[0].privateDetails.organizer, { name:'Meeting organizer', email:'organizer@si-ware.com' });
  assert.deepEqual(data.events[0].privateDetails.invitees, [{ name:'Invited guest', email:'guest@si-ware.com' }]);
  assert.equal(data.events[0].privateAudienceHashes.includes('guest@si-ware.com'), false);
  assert.equal(data.events[0].privateAudienceHashes.length, 2);
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
    if (url.hostname === 'gmail.googleapis.com' && url.pathname.endsWith('/messages')) return { ok:true, json:async () => ({ messages:[{ id:'inbound-1' }] }) };
    if (url.hostname === 'gmail.googleapis.com' && url.pathname.endsWith('/messages/inbound-1')) return { ok:true, json:async () => ({ id:'inbound-1', payload:{ headers:[] } }) };
    if (url.pathname.endsWith('/users')) return { ok:true, json:async () => url.searchParams.has('pageToken') ? { users:[user({ id:'second' })] } : { users:[user()], nextPageToken:'next' } };
    if (url.pathname.includes('/hasMember/')) return { ok:true, json:async () => ({ isMember:!url.pathname.includes('outsider%40') }) };
    if (url.pathname.endsWith('/orgunits')) return { ok:true, json:async () => ({ organizationUnits:[{ orgUnitPath:'/Egypt/Full-Time Employees', name:'Full-Time Employees', parentOrgUnitPath:'/Egypt' }, { orgUnitPath:'/Egypt/Consultants', name:'Consultants', parentOrgUnitPath:'/Egypt' }] }) };
    return { ok:true, json:async () => ({ items:[{ id:'event-1', summary:'Workshop', start:{ date:'2026-10-23' } }] }) };
  };
  const client = await createWorkspaceClient({ ...config, keyFile:'test-key.json', subject:'admin@si-ware.com' }, { fetchImpl, now:() => now, readCredentials:async () => JSON.stringify(credentials) });
  assert.deepEqual(await client.orgUnits(), [
    { path:'/Egypt/Consultants', name:'Consultants', parent:'/Egypt' },
    { path:'/Egypt/Full-Time Employees', name:'Full-Time Employees', parent:'/Egypt' }
  ]);
  assert.equal((await client.users(config.ous[0])).length, 2);
  await client.photo('google-123');
  assert.equal(await client.hasGroupMember('everyone@si-ware.com', 'employee@si-ware.com'), true);
  assert.equal(await client.hasGroupMember('everyone@si-ware.com', 'outsider@si-ware.com'), false);
  assert.deepEqual(await client.gmailMessageIdsSince(1_700_000_000, ['eg.team@si-ware.com']), ['inbound-1']);
  assert.equal((await client.gmailMessage('inbound-1')).id, 'inbound-1');
  assert.match(calls.find(call => call.url.hostname === 'gmail.googleapis.com' && call.url.pathname.endsWith('/messages')).url.searchParams.get('q'), /to:eg\.team@si-ware\.com/);
  assert.equal((await client.events(config.calendars[0].id, now, new Date('2026-11-22T10:00:00Z'))).length, 1);
  assert.equal(calls.filter(call => call.url.pathname === '/token').length, 5);
  const gmailToken = calls.find(call => call.url.pathname === '/token' && JSON.parse(Buffer.from(new URLSearchParams(call.options.body).get('assertion').split('.')[1], 'base64url')).scope.endsWith('/gmail.readonly'));
  assert.ok(gmailToken);
  const group = calls.find(call => call.url.pathname.includes('/hasMember/'));
  assert.match(group.url.pathname, /everyone%40si-ware\.com\/hasMember\/employee%40si-ware\.com/);
  const groupToken = calls.find(call => call.url.pathname === '/token' && JSON.parse(Buffer.from(new URLSearchParams(call.options.body).get('assertion').split('.')[1], 'base64url')).scope.endsWith('/admin.directory.group.member.readonly'));
  assert.ok(groupToken);
  const directory = calls.find(call => call.url.pathname.endsWith('/users'));
  assert.equal(directory.url.searchParams.get('viewType'), 'admin_view');
  assert.equal(directory.url.searchParams.get('query'), "orgUnitPath='/People/New Hires'");
  assert.equal(directory.options.headers.authorization, 'Bearer test-token');
  const calendar = calls.find(call => call.url.pathname.endsWith('/events'));
  assert.equal(calendar.url.searchParams.get('singleEvents'), 'true');
  assert.equal(calendar.url.searchParams.get('eventTypes'), 'default');
  assert.match(calendar.url.searchParams.get('fields'), /description/);
  assert.match(calendar.url.searchParams.get('fields'), /attendees\(email,displayName\)/);
  assert.match(calendar.url.searchParams.get('fields'), /organizer\(email,displayName\)/);
  assert.match(directory.url.searchParams.get('fields'), /thumbnailPhotoUrl/);
  assert.match(directory.url.searchParams.get('fields'), /externalIds/);
  assert.equal(calls.some(call => call.url.pathname.endsWith('/users/google-123/photos/thumbnail')), true);
});
