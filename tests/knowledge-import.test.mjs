import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/admin.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const importer = source.slice(source.indexOf('function parseCsv(text)'), source.indexOf('const contentPages ='));
const linkValidator = source.slice(source.indexOf('function safeKnowledgeAdminLink(value)'), source.indexOf('async function saveKnowledgeSession'));
assert.ok(importer.startsWith('function parseCsv(text)'));
assert.ok(linkValidator.startsWith('function safeKnowledgeAdminLink(value)'));

const context = vm.createContext({ dashboard:{ sessions:[] }, URL, lastMessage:'' });
context.saveDashboard = async message => { context.lastMessage = message; };
context.flash = message => { context.lastMessage = message; };
vm.runInContext(`${importer}\n${linkValidator}\nglobalThis.importSessions = importKnowledgeSessionsCsv; globalThis.safeLink = safeKnowledgeAdminLink;`, context);
const file = (name, content) => ({ name, size:Buffer.byteLength(content), text:async () => content });

const tsv = [
  'Title\tPresenter\tCategory\tDate\tOutline\tPresentation Deck URL\tRecording URL\tSupporting Materials URL',
  'Intro\tTarek Zeinah\tWednesday, February 26, 2025\t"Line one\nLine two"\tOverview.pdf\tRecording.mp4\t\t',
  'Follow-up\t\tGeneral\t2025-03-01\tSummary\thttps://example.com/deck.pdf\twww.example.com/video\t\n'
].join('\n');
await context.importSessions(file('sessions.tsv', tsv));
assert.equal(context.dashboard.sessions.length, 2);
assert.equal(context.dashboard.sessions[0].category, 'General');
assert.equal(context.dashboard.sessions[0].date, '2025-02-26');
assert.equal(context.dashboard.sessions[0].outline, 'Line one\nLine two');
assert.equal(context.dashboard.sessions[0].presentationFilename, 'Overview.pdf');
assert.equal(context.dashboard.sessions[0].recordingFilename, 'Recording.mp4');
assert.equal(context.dashboard.sessions[1].presenter.name, 'Presenter not specified');
assert.equal(context.dashboard.sessions[1].recordingUrl, 'https://www.example.com/video');
assert.match(context.lastMessage, /2 added/);

const duplicateRows = [
  'Title,Presenter,Date',
  '  INTRO  ,Different presenter,2025-04-01',
  'New session,Person,2025-04-02',
  'new   SESSION,Person,2025-04-03'
].join('\n');
await context.importSessions(file('duplicates.csv', duplicateRows));
assert.equal(context.dashboard.sessions.length, 3);
assert.equal(context.dashboard.sessions.find(session => session.title === 'Intro').presenter.name, 'Tarek Zeinah');
assert.match(context.lastMessage, /1 added/);
assert.match(context.lastMessage, /2 duplicates skipped/);
const beforeDuplicateOnly = JSON.stringify(context.dashboard.sessions);
await context.importSessions(file('duplicates-only.csv', 'Title,Presenter,Date\nintro,Person,2025-04-01\n'));
assert.equal(JSON.stringify(context.dashboard.sessions), beforeDuplicateOnly);
assert.match(context.lastMessage, /No sessions added/);

const serverNames = serverSource.slice(serverSource.indexOf('const knowledgeSessionName ='), serverSource.indexOf('const actorFor ='));
const serverContext = vm.createContext({});
vm.runInContext(`${serverNames}\nglobalThis.duplicateName = duplicateKnowledgeSessionName;`, serverContext);
assert.equal(serverContext.duplicateName([{ title:'Intro' }, { title:'  INTRO  ' }]), 'INTRO');
assert.equal(serverContext.duplicateName([{ title:'Session Part 1' }, { title:'Session Part 2' }]), '');

const before = JSON.stringify(context.dashboard.sessions);
const invalid = 'Title,Presenter,Date,Recording URL\nUnsafe,Person,2025-02-26,javascript:alert(1)\n';
await assert.rejects(context.importSessions(file('bad.csv', invalid)), /Row 2, Recording URL/);
assert.equal(JSON.stringify(context.dashboard.sessions), before);

if (process.argv[2]) {
  const pasted = readFileSync(process.argv[2], 'utf8');
  context.dashboard.sessions = [];
  await context.importSessions(file('pasted.tsv', pasted));
  assert.equal(context.dashboard.sessions.length, 17);
  assert.equal(context.dashboard.sessions[0].date, '2025-02-26');
  assert.equal(context.dashboard.sessions[0].recordingFilename, 'GMT20250226-081430_Recording_1920x1080.mp4');
  assert.equal(context.dashboard.sessions.find(session => session.title.includes('Part 2') && session.title.includes('Smarter Workflows'))?.presenter.name, 'Presenter not specified');
}

process.stdout.write('Knowledge Hub import tests passed.\n');
