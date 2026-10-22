import { createHash, createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const directoryScope = 'https://www.googleapis.com/auth/admin.directory.user.readonly';
const orgUnitScope = 'https://www.googleapis.com/auth/admin.directory.orgunit.readonly';
const calendarScope = 'https://www.googleapis.com/auth/calendar.events.readonly';
const placeholder = 'To be confirmed';
const base64url = value => Buffer.from(value).toString('base64url');
const text = (value, limit = 200) => String(value || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, limit);
const stableId = (kind, parts) => `${kind}-${createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 24)}`;
export const eligibleEmployeeOu = path => {
  const segments = String(path || '').split('/').filter(Boolean);
  return segments.length > 0 && !segments.some(segment => /\b(?:Guests?|Consultants?)\b/i.test(segment)) && /\b(?:Employees?|Interns?)\b/i.test(segments.at(-1));
};

export function workspaceSyncConfig(env = process.env) {
  const rawOus = String(env.GOOGLE_RECENTLY_JOINED_OUS || env.GOOGLE_RECENTLY_JOINED_OU || '').split(',').map(value => value.trim()).filter(Boolean);
  const ous = rawOus.map(value => value.replace(/\/+$/, ''));
  const calendars = String(env.GOOGLE_CALENDAR_RESOURCES || '').split(',').map(entry => {
    const value = entry.trim(), separator = value.indexOf('|');
    return separator < 0 ? { id:value, label:'Calendar event' } : { id:value.slice(separator + 1).trim(), label:text(value.slice(0, separator), 80) || 'Calendar event' };
  }).filter(calendar => calendar.id);
  if (ous.some(ou => !ou.startsWith('/') || !ou || ou.includes('\\')) || ous.length > 20 || new Set(ous).size !== ous.length) throw new Error('GOOGLE_RECENTLY_JOINED_OUS needs up to 20 distinct non-root OU paths, such as /Egypt/Full-Time Employees.');
  if (calendars.length > 20 || new Set(calendars.map(calendar => calendar.id)).size !== calendars.length) throw new Error('Configure no more than 20 distinct Google resource calendars.');
  const keyFile = String(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || '').trim();
  const subject = String(env.GOOGLE_SYNC_SUBJECT || '').trim().toLowerCase();
  if ((ous.length || calendars.length) && (!keyFile || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject))) throw new Error('Google sync needs GOOGLE_SERVICE_ACCOUNT_KEY_FILE and GOOGLE_SYNC_SUBJECT.');
  const lookbackDays = Math.min(365, Math.max(1, Number(env.GOOGLE_RECENTLY_JOINED_LOOKBACK_DAYS) || 30));
  return { keyFile, subject, ous, calendars, lookbackDays, hireDateField:String(env.GOOGLE_HIRE_DATE_FIELD || '').trim(), divisionField:String(env.GOOGLE_DIVISION_FIELD || '').trim(), enabled:Boolean(ous.length || calendars.length) };
}

function customField(user, path) {
  if (!/^[A-Za-z][\w-]*\.[A-Za-z][\w-]*$/.test(path)) return '';
  const [schema, field] = path.split('.');
  return text(user.customSchemas?.[schema]?.[field]);
}

function joinedLabel(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return placeholder;
  const date = new Date(`${match[0]}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[0] ? placeholder : new Intl.DateTimeFormat('en', { month:'long', year:'numeric', timeZone:'UTC' }).format(date);
}

export function mergeDirectoryMembers(data, users, config, now = new Date()) {
  const current = Array.isArray(data.newMembers) ? data.newMembers : [];
  const byGoogleId = new Map(current.filter(item => item.googleUserId).map(item => [String(item.googleUserId), item]));
  const byEmail = new Map(current.filter(item => item.companyEmail).map(item => [String(item.companyEmail).toLowerCase(), item]));
  const threshold = now.getTime() - config.lookbackDays * 86400000;
  let created = 0, updated = 0;
  for (const user of users) {
    const email = String(user.primaryEmail || '').toLowerCase();
    if (!user.id || !email || !config.ous.includes(user.orgUnitPath) || user.suspended || user.archived || user.isGuestUser) continue;
    const emailMatch = byEmail.get(email);
    const existing = byGoogleId.get(String(user.id)) || (emailMatch && (!emailMatch.googleUserId || emailMatch.googleUserId === String(user.id)) ? emailMatch : null);
    const createdAt = Date.parse(user.creationTime);
    if (!existing && (!Number.isFinite(createdAt) || createdAt < threshold || createdAt > now.getTime() + 86400000)) continue;
    const organization = user.organizations?.find(item => item.primary) || user.organizations?.[0] || {};
    const manager = user.relations?.find(item => item.type === 'manager')?.value || '';
    const phone = user.phones?.find(item => item.primary || item.type === 'work')?.value || '';
    const fullName = text(user.name?.fullName || [user.name?.givenName, user.name?.familyName].filter(Boolean).join(' ')) || email;
    const employmentType = /\/Full-Time Employees$/i.test(user.orgUnitPath) ? 'Full Time' : /\/Part-time Employees$/i.test(user.orgUnitPath) ? 'Part Time' : /\/Graduate Interns$/i.test(user.orgUnitPath) ? 'Graduate Intern' : /\/Summer Interns$/i.test(user.orgUnitPath) ? 'Summer Intern' : placeholder;
    const imported = {
      name:fullName, role:text(organization.title) || placeholder,
      department:text(organization.department) || placeholder,
      division:customField(user, config.divisionField) || placeholder,
      directManager:text(manager) || placeholder,
      joined:joinedLabel(customField(user, config.hireDateField)),
      companyEmail:email, phone:text(phone, 40), employmentType
    };
    if (existing) {
      const previous = existing.googleImportedFields || {};
      let dirty = false;
      for (const [key, value] of Object.entries(imported)) {
        if (!existing[key] || existing[key] === placeholder || existing[key] === previous[key]) {
          if (existing[key] !== value) { existing[key] = value; dirty = true; }
        }
      }
      if (existing.googleUserId !== String(user.id)) { existing.googleUserId = String(user.id); dirty = true; }
      existing.googleImportedFields = imported;
      if (dirty) updated += 1;
      continue;
    }
    const member = {
      id:stableId('google-member', [String(user.id)]), googleUserId:String(user.id), source:'google-directory',
      ...imported, googleImportedFields:imported, team:imported.department,
      initials:fullName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase(),
      color:'#dceeff', message:''
    };
    current.unshift(member);
    byGoogleId.set(String(user.id), member);
    byEmail.set(email, member);
    created += 1;
  }
  data.newMembers = current;
  return { created, updated };
}

export function mergeCalendarEvents(data, calendar, events) {
  const current = Array.isArray(data.events) ? data.events : [];
  const imported = events.filter(event => event?.id && event.status !== 'cancelled' && event.visibility !== 'private' && event.visibility !== 'confidential' && event.eventType !== 'outOfOffice' && event.summary && (event.start?.date || event.start?.dateTime)).map(event => {
    const allDay = Boolean(event.start.date), date = allDay ? new Date(`${event.start.date}T12:00:00Z`) : new Date(event.start.dateTime);
    if (Number.isNaN(date.getTime())) return null;
    const zone = allDay ? 'UTC' : 'Africa/Cairo';
    return {
      id:stableId('google-event', [calendar.id, event.id]), source:'google-calendar', sourceCalendarId:calendar.id,
      sourceEventId:event.id, day:new Intl.DateTimeFormat('en', { day:'2-digit', timeZone:zone }).format(date),
      month:new Intl.DateTimeFormat('en', { month:'short', timeZone:zone }).format(date).toUpperCase(),
      title:text(event.summary), time:allDay ? 'All day' : new Intl.DateTimeFormat('en', { hour:'numeric', minute:'2-digit', timeZone:zone }).format(date),
      type:calendar.label, startsAt:allDay ? event.start.date : date.toISOString()
    };
  }).filter(Boolean).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const previous = current.filter(item => item.source === 'google-calendar' && item.sourceCalendarId === calendar.id);
  const manual = current.filter(item => !(item.source === 'google-calendar' && item.sourceCalendarId === calendar.id));
  if (JSON.stringify(previous) === JSON.stringify(imported)) return { changed:false, count:imported.length };
  data.events = [...imported, ...manual.filter(item => item.source === 'google-calendar')].sort((a, b) => String(a.startsAt || '').localeCompare(String(b.startsAt || ''))).concat(manual.filter(item => item.source !== 'google-calendar'));
  return { changed:true, count:imported.length };
}

function signedAssertion(credentials, subject, scope, now) {
  const issued = Math.floor(now.getTime() / 1000);
  const header = { alg:'RS256', typ:'JWT', kid:credentials.private_key_id };
  const claims = { iss:credentials.client_email, sub:subject, scope, aud:'https://oauth2.googleapis.com/token', iat:issued, exp:issued + 3600 };
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = createSign('RSA-SHA256'); signer.update(input); signer.end();
  return `${input}.${signer.sign(credentials.private_key, 'base64url')}`;
}

async function checkedJson(response, label) {
  if (!response.ok) throw new Error(`${label} failed (HTTP ${response.status}).`);
  return response.json();
}

export async function createWorkspaceClient(config, { fetchImpl = fetch, now = () => new Date(), readCredentials = readFile } = {}) {
  const credentials = JSON.parse(await readCredentials(config.keyFile, 'utf8'));
  if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) throw new Error('The Google key file is not a service-account credential.');
  const tokens = new Map();
  async function accessToken(scope) {
    const cached = tokens.get(scope);
    if (cached && cached.expiresAt > now().getTime() + 60000) return cached.value;
    const assertion = signedAssertion(credentials, config.subject, scope, now());
    const response = await fetchImpl('https://oauth2.googleapis.com/token', { method:'POST', headers:{ 'content-type':'application/x-www-form-urlencoded' }, body:new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal:AbortSignal.timeout(15000) });
    const token = await checkedJson(response, 'Google authorization');
    if (!token.access_token) throw new Error('Google authorization returned no access token.');
    tokens.set(scope, { value:token.access_token, expiresAt:now().getTime() + Math.max(60, Number(token.expires_in) || 3600) * 1000 });
    return token.access_token;
  }
  async function get(url, scope) {
    const response = await fetchImpl(url, { headers:{ authorization:`Bearer ${await accessToken(scope)}` }, signal:AbortSignal.timeout(20000) });
    return checkedJson(response, 'Google Workspace request');
  }
  async function pages(url, scope, itemKey) {
    const items = [];
    for (let page = 0, token = ''; page < 20; page += 1) {
      const next = new URL(url);
      if (token) next.searchParams.set('pageToken', token);
      const result = await get(next, scope);
      items.push(...(result[itemKey] || []));
      token = result.nextPageToken || '';
      if (!token) return items;
    }
    throw new Error('Google Workspace result exceeded the 20-page safety limit; no partial data was published.');
  }
  return {
    async orgUnits() {
      const url = new URL('https://admin.googleapis.com/admin/directory/v1/customer/my_customer/orgunits');
      url.searchParams.set('type', 'all');
      const result = await get(url, orgUnitScope);
      return (result.organizationUnits || []).filter(unit => eligibleEmployeeOu(unit.orgUnitPath)).map(unit => ({ path:unit.orgUnitPath, name:unit.name || unit.orgUnitPath.split('/').pop(), parent:unit.parentOrgUnitPath || '/' })).sort((a, b) => a.path.localeCompare(b.path));
    },
    async users(ou) {
      const url = new URL('https://admin.googleapis.com/admin/directory/v1/users');
      url.search = new URLSearchParams({ customer:'my_customer', projection:'full', viewType:'admin_view', maxResults:'500', query:`orgUnitPath='${ou.replaceAll("'", "\\'")}'`, fields:'nextPageToken,users(id,primaryEmail,name,orgUnitPath,organizations,relations,phones,creationTime,suspended,archived,isGuestUser,customSchemas)' }).toString();
      return pages(url, directoryScope, 'users');
    },
    async events(calendarId, from, until) {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      url.search = new URLSearchParams({ singleEvents:'true', orderBy:'startTime', showDeleted:'false', eventTypes:'default', timeMin:from.toISOString(), timeMax:until.toISOString(), maxResults:'250', fields:'nextPageToken,items(id,status,summary,visibility,eventType,start)' }).toString();
      return pages(url, calendarScope, 'items');
    }
  };
}

export async function syncWorkspaceContent(data, config, client, now = new Date()) {
  const result = { members:{ created:0, updated:0 }, calendars:[], errors:[], changed:false };
  for (const ou of config.ous) {
    try {
      const merged = mergeDirectoryMembers(data, await client.users(ou), config, now);
      result.members.created += merged.created;
      result.members.updated += merged.updated;
      result.changed ||= merged.created > 0 || merged.updated > 0;
    } catch (error) { result.errors.push(`Directory ${ou}: ${error.message}`); }
  }
  const from = new Date(now.getTime() - 7 * 86400000), until = new Date(now.getTime() + 90 * 86400000);
  for (const calendar of config.calendars) {
    try {
      const merged = mergeCalendarEvents(data, calendar, await client.events(calendar.id, from, until));
      result.calendars.push({ id:calendar.id, count:merged.count });
      result.changed ||= merged.changed;
    } catch (error) { result.errors.push(`Calendar ${calendar.label}: ${error.message}`); }
  }
  return result;
}
