import assert from 'node:assert/strict';
import test from 'node:test';
import { importedGroupAnnouncements } from '../inbound-group-email.mjs';

const body = value => Buffer.from(value).toString('base64url');
const message = (headers, text = 'A group update') => ({
  id:'gmail-123', internalDate:String(Date.parse('2026-10-28T12:05:00Z')),
  payload:{ mimeType:'multipart/alternative', headers:Object.entries(headers).map(([name, value]) => ({ name, value })), parts:[
    { mimeType:'text/html', body:{ data:body('<p>Wrong HTML copy</p>') } },
    { mimeType:'text/plain', body:{ data:body(text) } }
  ] }
});

test('one received email creates hidden, group-scoped announcements and preserves the sender address', () => {
  const email = message({ From:'Alex <alex@si-ware.com>', To:'Egypt Team <eg.team@si-ware.com>, Everyone <everyone@si-ware.com>', Subject:'Team update' });
  const items = importedGroupAnnouncements(email, ['eg.team@si-ware.com','everyone@si-ware.com'], 'intranet@si-ware.com', '2026-10-28T12:00:00Z');
  assert.equal(items.length, 2);
  assert.notEqual(items[0].id, items[1].id);
  for (const item of items) {
    assert.equal(item.hidden, true);
    assert.equal(item.title, 'Team update');
    assert.equal(item.body, 'A group update');
    assert.equal(item.source.fromEmail, 'alex@si-ware.com');
    assert.equal(item.notification.audienceGroup, item.source.group);
    assert.equal(item.notification.inAppEnabled, true);
    assert.equal(item.notification.emailEnabled, false);
    assert.deepEqual(item.notification.cc, []);
  }
});

test('unrelated, old, and intranet-sent messages are not imported', () => {
  const options = ['2026-10-28T12:06:00Z','2026-10-28T12:00:00Z'];
  assert.deepEqual(importedGroupAnnouncements(message({ From:'Alex <alex@si-ware.com>', To:'unrelated@si-ware.com' }), ['eg.team@si-ware.com'], 'intranet@si-ware.com', options[1]), []);
  assert.deepEqual(importedGroupAnnouncements(message({ From:'intranet@si-ware.com', To:'eg.team@si-ware.com' }), ['eg.team@si-ware.com'], 'intranet@si-ware.com', options[1]), []);
  assert.deepEqual(importedGroupAnnouncements(message({ From:'alex@si-ware.com', To:'eg.team@si-ware.com' }), ['eg.team@si-ware.com'], 'intranet@si-ware.com', options[0]), []);
});

test('HTML-only email is reduced to safe text and records attachments for admin review', () => {
  const email = { id:'html-1', internalDate:String(Date.parse('2026-10-28T12:05:00Z')), payload:{ mimeType:'multipart/mixed', headers:[{ name:'From', value:'sender@si-ware.com' }, { name:'Cc', value:'eg.team@si-ware.com' }, { name:'Subject', value:'=?UTF-8?B?VGVhbSBub3Rlcw==?=' }], parts:[{ mimeType:'text/html', body:{ data:body('<p>Hello <b>team</b></p><script>ignore()</script>') } }, { mimeType:'application/pdf', filename:'plan.pdf', body:{ attachmentId:'attachment-1' } }] } };
  const [item] = importedGroupAnnouncements(email, ['eg.team@si-ware.com'], 'intranet@si-ware.com', '2026-10-28T12:00:00Z');
  assert.equal(item.title, 'Team notes');
  assert.match(item.body, /Hello\s+team/);
  assert.doesNotMatch(item.body, /<|ignore\(\)/);
  assert.equal(item.source.hasAttachments, true);
});
