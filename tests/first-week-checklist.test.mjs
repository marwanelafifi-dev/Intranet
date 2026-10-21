import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/first-week-checklist.js', import.meta.url), 'utf8');
const handlers = {};
const attributes = () => ({ dataset:{}, toggleAttribute(name, enabled) { if (enabled) this[name] = ''; else this.removeAttribute(name); }, removeAttribute(name) { delete this[name]; if (name === 'data-newsi-copy') delete this.dataset.newsiCopy; } });
const label = attributes(), description = attributes(), nextStep = attributes(), bar = { style:{} };
const list = {
  innerHTML:'',
  addEventListener(name, handler) { handlers[name] = handler; },
  querySelectorAll() { return []; }
};
const elements = {
  '#first-week-checklist':list,
  '#checklist-progress-label':label,
  '#checklist-progress-description':description,
  '.checklist-next-step':nextStep,
  '#checklist-progress-bar':bar
};
const stored = new Map([['siware-first-week-checklist-v1', JSON.stringify(['systems', 'manager'])]]);
const document = {
  querySelector(selector) { return elements[selector] || null; },
  querySelectorAll() { return []; },
  addEventListener(name, handler) { handlers[name] = handler; },
  dispatchEvent() {}
};
const window = { addEventListener() {} };
const localStorage = { getItem:key => stored.get(key), setItem:(key, value) => stored.set(key, value) };
const fetch = async () => ({ ok:true, json:async () => ({
  newSiPageContent:{ checklistCompleteTitle:'Onboarding done', checklistCompleteText:'Ready for what comes next.' },
  firstWeekChecklist:[{ id:'systems', text:'Set up access' }, { id:'manager', text:'Meet your manager' }]
}) });

vm.runInNewContext(source, { document, window, localStorage, fetch, Event:class Event {} });
await new Promise(resolve => setImmediate(resolve));
assert.equal(label.textContent, 'Onboarding done');
assert.equal(description.textContent, 'Ready for what comes next.');
assert.equal(description.dataset.newsiCopy, 'checklistCompleteText');
assert.match(list.innerHTML, /checked/);
assert.doesNotMatch(list.innerHTML, /disabled/);

handlers.change({ target:{ closest:() => ({ checked:false, dataset:{ checklistItem:'systems' } }) } });
assert.equal(label.textContent, '1 of 2 complete');
assert.equal(description.textContent, 'Keep your momentum going.');
assert.equal(description.dataset.newsiCopy, 'checklistInProgressText');
assert.deepEqual(JSON.parse(stored.get('siware-first-week-checklist-v1')), ['manager']);
assert.equal(nextStep.textContent, 'Start with the task that gives you access.');

handlers.change({ target:{ closest:() => ({ checked:true, dataset:{ checklistItem:'systems' } }) } });
assert.equal(label.textContent, 'Onboarding done');
assert.deepEqual(new Set(JSON.parse(stored.get('siware-first-week-checklist-v1'))), new Set(['systems', 'manager']));
handlers['newsi-copy:preview-updated']({ detail:{ checklistCompleteTitle:'First week finished' } });
assert.equal(label.textContent, 'First week finished');
process.stdout.write('First-week checklist tests passed.\n');
