import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { archiveExpiredEvents, archiveFolderName, hasArchiveRunToday } from '../audit-archive.mjs';

test('keeps one compressed file per quarter for both event streams', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'siware-audit-archive-'));
  try {
    const now = new Date('2026-10-21T12:00:00.000Z');
    const oldAudit = { id:'old-audit', serverReceivedAt:'2026-07-01T10:00:00.000Z', action:'content.updated' };
    const oldActivity = { id:'old-activity', serverReceivedAt:'2026-07-01T11:00:00.000Z', action:'page.open' };
    const recent = { id:'recent', serverReceivedAt:'2026-10-20T10:00:00.000Z', action:'page.open' };
    const data = { auditEvents:[oldAudit], activityEvents:[oldActivity, recent], adminSettings:{} };

    const result = await archiveExpiredEvents(data, join(directory, 'intranet.json'), now);
    assert.equal(result.archived, 2);
    assert.equal(result.files, 1);
    assert.deepEqual(data.auditEvents, []);
    assert.deepEqual(data.activityEvents, [recent]);
    assert.equal(data.adminSettings.auditRetentionDays, 90);
    assert.equal(data.adminSettings.activityRetentionDays, 90);
    assert.equal(hasArchiveRunToday(data, now), true);

    const archiveDirectory = join(directory, archiveFolderName);
    const files = await readdir(archiveDirectory);
    assert.deepEqual(files, ['audit-trail-2026-Q3.jsonl.gz']);
    const readEvents = async () => gunzipSync(await readFile(join(archiveDirectory, files[0]))).toString().trim().split('\n').map(JSON.parse);
    assert.deepEqual((await readEvents()).map(event => event.id).sort(), ['old-activity', 'old-audit']);

    const repeated = await archiveExpiredEvents(data, join(directory, 'intranet.json'), now);
    assert.equal(repeated.archived, 0);
    assert.equal((await readdir(archiveDirectory)).length, 1);

    // A retry after archive success but before the active JSON save must not duplicate records.
    const nextOld = { id:'next-old', serverReceivedAt:'2026-08-01T10:00:00.000Z', action:'page.open' };
    const retry = { auditEvents:[oldAudit], activityEvents:[oldActivity, nextOld], adminSettings:{} };
    const later = await archiveExpiredEvents(retry, join(directory, 'intranet.json'), new Date('2026-12-01T12:00:00.000Z'));
    assert.equal(later.files, 1);
    assert.equal((await readdir(archiveDirectory)).length, 1);
    assert.deepEqual((await readEvents()).map(event => event.id).sort(), ['next-old', 'old-activity', 'old-audit']);
  } finally {
    await rm(directory, { recursive:true, force:true, maxRetries:5, retryDelay:100 });
  }
});

test('creates a separate file for another calendar quarter', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'siware-audit-archive-'));
  try {
    const data = { auditEvents:[
      { id:'first', serverReceivedAt:'2026-03-31T23:59:00.000Z' },
      { id:'second', serverReceivedAt:'2026-04-01T00:01:00.000Z' }
    ], activityEvents:[], adminSettings:{} };
    const result = await archiveExpiredEvents(data, join(directory, 'intranet.json'), new Date('2026-10-21T12:00:00.000Z'));
    assert.equal(result.files, 2);
    assert.deepEqual(await readdir(join(directory, archiveFolderName)), [
      'audit-trail-2026-Q1.jsonl.gz', 'audit-trail-2026-Q2.jsonl.gz'
    ]);
  } finally {
    await rm(directory, { recursive:true, force:true, maxRetries:5, retryDelay:100 });
  }
});

test('keeps active records untouched if an archive cannot be written', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'siware-audit-archive-'));
  try {
    await writeFile(join(directory, archiveFolderName), 'occupied');
    const old = { id:'old', serverReceivedAt:'2026-01-01T00:00:00.000Z' };
    const data = { auditEvents:[old], activityEvents:[], adminSettings:{} };
    await assert.rejects(archiveExpiredEvents(data, join(directory, 'intranet.json'), new Date('2026-10-21T12:00:00.000Z')));
    assert.deepEqual(data.auditEvents, [old]);
    assert.equal(data.adminSettings.lastArchiveDate, undefined);
  } finally {
    await rm(directory, { recursive:true, force:true, maxRetries:5, retryDelay:100 });
  }
});
