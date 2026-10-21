import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/new-hires.html', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../public/admin.js', import.meta.url), 'utf8');
const checklist = readFileSync(new URL('../public/first-week-checklist.js', import.meta.url), 'utf8');
const targets = admin.match(/const newSiPageCopyTargets = \[([\s\S]*?)\];/)?.[1] || '';
const targetNames = new Set([...targets.matchAll(/'([^']+)'/g)].map(match => match[1]));
const pageNames = new Set([...html.matchAll(/data-newsi-copy="([^"]+)"/g)].map(match => match[1]));

for (const name of pageNames) assert.ok(targetNames.has(name), `${name} is visible but not editable in Admin`);
for (const name of ['checklistCompleteTitle','checklistCompleteText','checklistEmptyText','checklistInProgressText','checklistNextStepText','checklistReopenText','heroCompleteText']) {
  assert.ok(targetNames.has(name), `${name} is missing from Admin`);
  assert.ok(checklist.includes(`${name}:`) || checklist.includes(`'${name}'`), `${name} is not used by the checklist`);
}
for (const name of ['welcomeThanks','welcomeRecorded','welcomeBody','welcomeAction']) assert.ok(pageNames.has(name));
for (const name of ['itIntro','itPortalLabel','itContactIntro','itEmailLabel','peopleIntro','peopleMohrLabel','peopleMiddle','peoplePortalLabel','peopleContactIntro','peopleEmailLabel','administrationIntro','administrationPortalLabel','administrationOutro','financeIntro','financePortalLabel','financeOutro']) assert.ok(pageNames.has(name));
assert.match(admin, /policy-acknowledgement:rendered/);
assert.match(admin, /\['acceptedTitle',/);
assert.match(admin, /\['afterText',/);
assert.match(admin, /label\('Before confirmation', 'preview'\)/);
assert.match(admin, /label\('After confirmation', 'preview'\)/);
assert.match(admin, /data-admin-preview-ack-field="actionTitle"/);
assert.match(admin, /data-admin-preview-ack-field="acceptedTitle"/);
assert.match(admin, /policyHeadings = \{ actionTitle:'Before confirmation', acceptedTitle:'After confirmation'/);
assert.match(admin, /function enableNewSiPreviewTools\(frame\)/);
for (const section of ['#first-week','#training','#policies']) assert.ok(admin.includes(`section:'${section}'`), `${section} needs an in-preview edit control`);
assert.doesNotMatch(admin, /newSiTrainingVideosForm|newSiChecklistCompletionForm|newSiWelcomeForm/);
process.stdout.write('New Si-Warians copy coverage tests passed.\n');
