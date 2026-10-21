import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, copyFile, mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip, gzipSync } from 'node:zlib';

export const auditRetentionDays = 90;
export const archiveFolderName = 'audit trail archive';
let archiveQueue = Promise.resolve();

const eventKey = event => String(event.id || createHash('sha256').update(JSON.stringify(event)).digest('hex'));
const quarterFor = timestamp => {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
};

async function appendQuarter(archiveRoot, quarter, events) {
  const target = join(archiveRoot, `audit-trail-${quarter}.jsonl.gz`);
  const pending = new Map(events.map(event => [eventKey(event), event]));
  let exists = false;
  try { await stat(target); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }

  // A previous archive may have succeeded before the active JSON save failed.
  // Reading its IDs makes retrying the same batch safe.
  if (exists) {
    const lines = createInterface({ input:createReadStream(target).pipe(createGunzip()), crlfDelay:Infinity });
    for await (const line of lines) {
      if (line) pending.delete(eventKey(JSON.parse(line)));
    }
  }
  if (!pending.size) return false;

  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    if (exists) await copyFile(target, temporary);
    const content = [...pending.values()].sort((a, b) => eventKey(a).localeCompare(eventKey(b))).map(event => JSON.stringify(event)).join('\n') + '\n';
    if (exists) await appendFile(temporary, gzipSync(content));
    else await writeFile(temporary, gzipSync(content), { mode:0o600 });
    await rename(temporary, target);
    return true;
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export function hasArchiveRunToday(data, now = new Date()) {
  return data.adminSettings?.lastArchiveDate === now.toISOString().slice(0, 10);
}

async function archiveExpiredEventsImpl(data, dataFile, now) {
  const cutoff = now.getTime() - auditRetentionDays * 86400000;
  const archiveRoot = join(dirname(dataFile), archiveFolderName);
  const retained = {};
  const expired = [];

  for (const key of ['auditEvents', 'activityEvents']) {
    retained[key] = [];
    for (const event of data[key] || []) {
      const received = Date.parse(event.serverReceivedAt || event.occurredAt);
      if (Number.isFinite(received) && received < cutoff) expired.push({ key, event });
      else retained[key].push(event);
    }
  }

  const groups = new Map();
  for (const { event } of expired) {
    const quarter = quarterFor(event.serverReceivedAt || event.occurredAt);
    if (!groups.has(quarter)) groups.set(quarter, []);
    groups.get(quarter).push(event);
  }

  // Write every archive before removing any event from the active data file.
  let files = 0;
  if (groups.size) await mkdir(archiveRoot, { recursive:true, mode:0o700 });
  for (const [quarter, events] of groups) if (await appendQuarter(archiveRoot, quarter, events)) files += 1;

  data.auditEvents = retained.auditEvents;
  data.activityEvents = retained.activityEvents;
  data.adminSettings ||= {};
  data.adminSettings.auditRetentionDays = auditRetentionDays;
  data.adminSettings.activityRetentionDays = auditRetentionDays;
  data.adminSettings.lastArchiveDate = now.toISOString().slice(0, 10);
  return { archived:expired.length, files, directory:archiveRoot };
}

export function archiveExpiredEvents(data, dataFile, now = new Date()) {
  const task = archiveQueue.then(() => archiveExpiredEventsImpl(data, dataFile, now));
  archiveQueue = task.catch(() => {});
  return task;
}
