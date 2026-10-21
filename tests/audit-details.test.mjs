import assert from 'node:assert/strict';
import test from 'node:test';
import { describeContentChanges } from '../audit-details.mjs';

test('content audit names records and records before and after values', () => {
  const before = { announcements:[{ id:'one', title:'Old title', bodyHtml:'<p>Before</p>' }] };
  const next = { announcements:[{ id:'one', title:'New title', bodyHtml:'<p>After</p>' }] };
  const result = describeContentChanges(before, next, ['announcements']);
  assert.deepEqual(result.details.map(detail => [detail.record, detail.field, detail.before, detail.after]), [
    ['New title', 'title', 'Old title', 'New title'],
    ['New title', 'bodyHtml', 'Before', 'After']
  ]);
  assert.equal(result.truncated, false);
});

test('content audit omits secrets and limits excessive detail', () => {
  const before = { settings:{ password:'old', title:'Before', token:'old' } };
  const next = { settings:{ password:'new', title:'After', token:'new' } };
  assert.deepEqual(describeContentChanges(before, next, ['settings']).details.map(detail => detail.field), ['title']);
  assert.equal(describeContentChanges({ settings:{ a:1, b:1 } }, { settings:{ a:2, b:2 } }, ['settings'], 1).truncated, true);
});

test('content audit identifies image and formatting-only edits', () => {
  const before = { announcements:[{ id:'one', bodyHtml:'<div style="background:#fff"><img src="data:image/png;base64,old" alt="Poster">Hello</div>' }] };
  const next = { announcements:[{ id:'one', bodyHtml:'<div style="background:#123"><img src="data:image/png;base64,new" alt="Poster">Hello</div>' }] };
  const detail = describeContentChanges(before, next, ['announcements']).details[0];
  assert.equal(detail.before, 'Hello · 1 image');
  assert.match(detail.after, /formatting or media changed/);
  assert.doesNotMatch(JSON.stringify(detail), /base64|#123/);
});
