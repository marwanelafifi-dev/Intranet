import { createServer } from 'node:http';
import { readFile, writeFile, access, copyFile, mkdir, unlink, stat, rename, readdir } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { extname, join, normalize, relative, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID, timingSafeEqual, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { connect as tlsConnect } from 'node:tls';
import { hashLocalPassword, passwordPolicyError, publicAccessUser, verifyLocalPassword } from './local-accounts.mjs';
import { activeSessionActor, hasEmployeeRole } from './auth-session.mjs';
import { describeContentChanges } from './audit-details.mjs';
import { archiveExpiredEvents, auditRetentionDays, hasArchiveRunToday } from './audit-archive.mjs';
import { workspaceSyncConfig, createWorkspaceClient, syncWorkspaceContent, eligibleEmployeeOu } from './google-workspace-sync.mjs';
import { importedGroupAnnouncements } from './inbound-group-email.mjs';
import { adminViewPermissions, adminActionPermissions, adminContentKeyPages, adminContentKeys, canOpenAdmin, removedContent, rolePermissionError } from './public/admin-permissions.js';
import { defaultGlobalPageContent, normaliseGlobalPageContent } from './public/global-page-content.js';
import { intranetPagePermissions, intranetRoutePermissions, intranetContentPermissions, firstAvailableIntranetPage } from './public/intranet-permissions.js';

const port = Number(process.env.PORT || 8080);
const publicDir = join(process.cwd(), 'public');
const uploadsDir = join(process.cwd(), 'data', 'uploads');
const dataFile = process.env.DATA_FILE || join(process.cwd(), 'data', 'intranet.json');
const notificationSecretsFile = join(dirname(dataFile), 'notification-secrets.json');
const inboundEmailStateFile = join(dirname(dataFile), 'group-email-import-state.json');
const seedFile = join(process.cwd(), 'data', 'seed.json');
const adminDefaultsFile = join(process.cwd(), 'data', 'admin-defaults.json');
const youtubeChannelId = 'UCPx_Gys4B6hSLw_JY3CkU5w';
const youtubeChannelUrl = 'https://www.youtube.com/@Si-Ware_Systems';
const youtubeCacheFile = join(process.cwd(), 'data', 'youtube-latest.json');
const companyNewsUrl = 'https://www.si-ware.com/company/news';
const companyNewsCacheFile = join(process.cwd(), 'data', 'company-news-latest.json');
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const googleWorkspaceDomain = (process.env.GOOGLE_WORKSPACE_DOMAIN || 'si-ware.com').toLowerCase();
const googleAdminEmails = new Set((process.env.GOOGLE_ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
const siVoiceApiUrl = String(process.env.SI_VOICE_API_URL || 'https://si-bot-dev.si-wareapps.com/api/agents/v1/chat/completions').trim();
const siVoiceApiToken = String(process.env.SI_VOICE_API_TOKEN || '').trim();
const siVoiceModel = String(process.env.SI_VOICE_MODEL || 'agent_p5r89lwIGSl7sYJRu80AH').trim();
const approvedResourceCalendars = Object.freeze([
  { id:'c_1886rrgqhtprciftkps7n738rs2fo@resource.calendar.google.com', label:'3rd Floor Meeting Room', resourceId:'61221782182' },
  { id:'c_188bj799if2eoj4el09lt4nbmlrmg@resource.calendar.google.com', label:'Recreational Area Space', resourceId:'2913182464' }
]);
const calendarEmail = value => String(value || '').trim().toLowerCase();
const calendarSource = value => {
  const id = calendarEmail(value?.id || value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id) || id.length > 320) return null;
  const known = approvedResourceCalendars.find(calendar => calendar.id === id);
  return known || { id, label:String(value?.label || id).replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, 100) || id, custom:true };
};
const configuredCalendars = settings => {
  const saved = Array.isArray(settings?.calendarSources) ? settings.calendarSources.map(calendarSource).filter(Boolean) : [];
  const sources = saved.length ? saved : approvedResourceCalendars;
  return [...new Map(sources.map(source => [source.id, source])).values()].slice(0, 20);
};
const defaultSyncSchedule = () => ({ enabled:false, frequency:'daily', time:'08:00', day:1 });
const defaultGoogleSyncSettings = () => ({ enabled:false, ouPaths:[], calendarIds:approvedResourceCalendars.map(calendar => calendar.id), calendarSources:approvedResourceCalendars, memberSchedule:defaultSyncSchedule(), calendarSchedule:defaultSyncSchedule() });
const googleSyncStatus = { lastAttemptAt:null, lastSuccessAt:null, lastError:'', membersCreated:0, membersUpdated:0, membersRemoved:0, calendarEvents:0 };
let runGoogleSync = async () => googleSyncStatus;
const scheduledSyncSlots = new Set();
const normalizedSchedule = value => {
  const schedule = value && typeof value === 'object' ? value : {};
  const frequency = ['hourly','daily','weekly'].includes(schedule.frequency) ? schedule.frequency : 'daily';
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(schedule.time || '')) ? String(schedule.time) : '08:00';
  const day = Number.isInteger(Number(schedule.day)) && Number(schedule.day) >= 0 && Number(schedule.day) <= 6 ? Number(schedule.day) : 1;
  return { enabled:schedule.enabled === true, frequency, time, day };
};
const syncDue = (schedule, kind, now = new Date()) => {
  if (!schedule.enabled) return false;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone:'Africa/Cairo', weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(now);
  const value = type => parts.find(part => part.type === type)?.value || '';
  const [hour, minute] = schedule.time.split(':');
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(value('weekday'));
  if (schedule.frequency === 'hourly' ? value('minute') !== minute : value('hour') !== hour || value('minute') !== minute) return false;
  if (schedule.frequency === 'weekly' && weekday !== schedule.day) return false;
  const slot = `${kind}:${now.toLocaleDateString('en-CA', { timeZone:'Africa/Cairo' })}:${value('hour')}:${minute}`;
  if (scheduledSyncSlots.has(slot)) return false;
  scheduledSyncSlots.add(slot); if (scheduledSyncSlots.size > 20) scheduledSyncSlots.delete(scheduledSyncSlots.values().next().value);
  return true;
};
const localAdminName = String(process.env.LOCAL_ADMIN_NAME || 'Local Administrator').trim();
const localAdminEmail = String(process.env.LOCAL_ADMIN_EMAIL || '').trim().toLowerCase();
const localAdminPassword = String(process.env.LOCAL_ADMIN_PASSWORD || '');
const notificationSender = 'intranet@si-ware.com';
const notificationSecretKey = String(process.env.NOTIFICATION_SECRET_KEY || '');
const notificationEncryptionKey = notificationSecretKey ? createHash('sha256').update(notificationSecretKey).digest() : null;
let localAccountsConfigured = false;
const sessions = new Map(), oauthStates = new Map();
const localLoginAttempts = new Map();
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const loginWindowMs = 15 * 60 * 1000;
const maxLocalAttempts = 5;
const acknowledgementContentDefault = { version:1, actionTitle:'Action required: acknowledge Si-Ware Policies', instructionText:'Before continuing, carefully review the mandatory policies below and record your acknowledgement in place of the former email reply.', beforeHeading:'Why this matters', beforeText:'Please read the mandatory Si-Ware Information Security Policy carefully. It covers information-handling policies including Computer Acceptable Use, Password, PDA/Smartphone and Remote Access, together with security awareness for your laptop, PC and mobile devices, physical security, virus protection, spyware/malware and social engineering/phishing. All Si-Ware users must know and adhere to these requirements. Confirmation is mandatory under Si-Ware security regulations.', confirmationLabel:'I confirm that I have read and accepted Si-Ware Policies.', confirmationHelp:'This records the current policy versions and confirmation time.', acceptedTitle:'Policies acknowledged', afterText:'Your acknowledgement has been recorded for the current policy versions.' };
const employmentTypes = ['Full Time', 'Part Time', 'Summer Intern', 'Graduate Intern', 'To be confirmed'];
const execFileAsync = promisify(execFile);
let youtubeCache = { expiresAt: 0, payload: null }, companyNewsCache = { expiresAt: 0, payload: null }, companyNewsRefresh = null;
const json = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
const readBody = req => new Promise((resolve, reject) => { let value = '', size = 0, finished = false; req.on('data', chunk => { size += chunk.length; if (size > 70 * 1024 * 1024) { finished = true; reject(new Error('Request body is too large')); req.destroy(); return; } if (!finished) value += chunk; }); req.on('end', () => { if (finished) return; try { resolve(JSON.parse(value || '{}')); } catch { reject(new Error('Invalid JSON')); } }); });
const cookiesFor = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(value => value.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
const sessionFor = req => {
  const id = cookiesFor(req).siware_session, session = sessions.get(id);
  const actor = activeSessionActor(session);
  if (!actor && session) sessions.delete(id);
  return actor;
};
const isGoogleConfigured = () => Boolean(googleClientId && googleClientSecret);
const isLocalAdminConfigured = () => Boolean(localAdminEmail && localAdminPassword);
const isAuthenticationConfigured = () => isGoogleConfigured() || isLocalAdminConfigured() || localAccountsConfigured;
const environmentLocalAdminActive = data => isLocalAdminConfigured() && storedUserFor(data, localAdminEmail)?.active !== false;
const localSignInAvailable = data => environmentLocalAdminActive(data) || data.accessUsers.some(user => user.authType === 'local' && user.passwordHash && user.active !== false && String(user.email || '').toLowerCase() !== localAdminEmail);
const googleProfilePhotoUrl = value => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && /(^|\.)googleusercontent\.com$/i.test(url.hostname) ? url.toString() : '';
  } catch { return ''; }
};
const linkedInProfileUrl = value => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && /(^|\.)linkedin\.com$/i.test(url.hostname) ? url.toString() : null;
  } catch { return null; }
};
const employeeProfilePhotoUpload = (dataUrl, filename) => {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ''));
  if (!match) throw new Error('Choose a JPEG, PNG, or WebP profile photo.');
  const content = Buffer.from(match[2], 'base64');
  if (!content.length || content.length > 10 * 1024 * 1024) throw new Error('Profile photos must be 10 MB or smaller.');
  return { dataUrl:`data:${match[1].toLowerCase()};base64,${match[2]}`, filename:String(filename || 'profile-photo') };
};
const isValidLocalAdminPassword = value => { const expected = Buffer.from(localAdminPassword), supplied = Buffer.from(String(value || '')); return expected.length === supplied.length && timingSafeEqual(expected, supplied); };
const safeReturnTo = value => {
  const path = String(value || '/');
  return /^\/(?!\/)/.test(path) && !/[\\\u0000-\u001f]/.test(path) ? path : '/';
};
const setCookie = (res, value, maxAge = 28800) => res.setHeader('set-cookie', `siware_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.SECURE_COOKIES === 'true' ? '; Secure' : ''}`);
const adminPagePermissions = Object.values(adminViewPermissions);
const rolePermissions = {
  EMPLOYEE: [...intranetPagePermissions],
  CONTENT_EDITOR: [...intranetPagePermissions, 'admin.access', 'content.edit', 'content.publish', 'media.manage', ...adminActionPermissions, 'page.content','page.apps','page.announcements','page.social','page.moments','page.knowledge','page.events','page.whistleblower','page.people','page.newsi','page.media'],
  AUDIT_VIEWER: [...intranetPagePermissions, 'admin.access', 'audit.view', 'page.activity', 'page.compliance'],
  ADMIN: [...intranetPagePermissions, 'events.details.all', 'admin.access', 'content.edit', 'content.publish', 'media.manage', 'access.manage', 'audit.view', 'audit.export', 'settings.manage', ...adminActionPermissions, ...adminPagePermissions]
};
const safeText = value => String(value || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 280);
const emailAddress = value => String(value || '').trim().toLowerCase();
const isEmailAddress = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const notificationEmailList = value => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[\n,;]/)).map(emailAddress).filter(isEmailAddress))].slice(0, 250);
const defaultNotificationSettings = () => ({ inAppEnabled:true, inAppDefaultEnabled:true, emailEnabled:false, emailDefaultEnabled:false, inboundEmailEnabled:false, inboundStartedAt:'', approvedGroups:[], defaultGroup:'', sender:notificationSender });
const notificationSettings = data => ({ ...defaultNotificationSettings(), ...(data.adminSettings?.notificationSettings || {}) });
const normaliseAnnouncementNotification = value => {
  const item = value && typeof value === 'object' ? value : {};
  return {
    audienceGroup:emailAddress(item.audienceGroup),
    inAppEnabled:item.inAppEnabled !== false && item.inAppEnabled !== 'false',
    inAppRecipients:notificationEmailList(item.inAppRecipients),
    emailEnabled:item.emailEnabled === true || item.emailEnabled === 'true',
    to:notificationEmailList(item.to),
    cc:notificationEmailList(item.cc),
    bcc:notificationEmailList(item.bcc),
    emailDeliveryState:['sent','failed','skipped'].includes(item.emailDeliveryState) ? item.emailDeliveryState : '',
    emailSentAt:item.emailSentAt ? String(item.emailSentAt) : '',
    emailError:item.emailError ? safeText(item.emailError).slice(0, 240) : ''
  };
};
let notificationGroupClientPromise;
async function notificationGroupClient() {
  if (!notificationGroupClientPromise) {
    const keyFile = String(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || '').trim();
    const subject = String(process.env.GOOGLE_SYNC_SUBJECT || '').trim();
    if (!keyFile || !isEmailAddress(subject)) throw new Error('Google Workspace group access is not configured.');
    notificationGroupClientPromise = createWorkspaceClient({ keyFile, subject }).catch(error => { notificationGroupClientPromise = null; throw error; });
  }
  return notificationGroupClientPromise;
}
async function audienceGroupMember(group, member) {
  const client = await notificationGroupClient();
  return client.hasGroupMember(group, member);
}
function publicAnnouncementNotification(value, data, audienceMember) {
  const notification = normaliseAnnouncementNotification(value);
  const settings = notificationSettings(data);
  const group = notification.audienceGroup;
  const enabled = settings.inAppEnabled !== false && notification.inAppEnabled && Array.isArray(settings.approvedGroups) && settings.approvedGroups.includes(group);
  return {
    inAppEnabled:enabled,
    inAppVisible:enabled && audienceMember
  };
};
async function notificationSecrets() {
  try { return JSON.parse(await readFile(notificationSecretsFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
function encryptNotificationSecret(value) {
  if (!notificationEncryptionKey) throw new Error('Set NOTIFICATION_SECRET_KEY on the server before saving the email app password.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', notificationEncryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return { iv:iv.toString('base64'), tag:cipher.getAuthTag().toString('base64'), ciphertext:ciphertext.toString('base64') };
}
function decryptNotificationSecret(record) {
  if (!notificationEncryptionKey || !record?.iv || !record?.tag || !record?.ciphertext) return '';
  const decipher = createDecipheriv('aes-256-gcm', notificationEncryptionKey, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
async function notificationStatus(data) {
  const secrets = await notificationSecrets();
  const settings = notificationSettings(data), state = await inboundEmailState().catch(() => ({}));
  const lastSuccessAt = inboundEmailStatus.lastSuccessAt || (state.startedAt === settings.inboundStartedAt ? state.lastCheckedAt : null);
  return { ...settings, appPasswordConfigured:Boolean(secrets.gmailAppPassword), encryptionReady:Boolean(notificationEncryptionKey), inboundStatus:{ ...inboundEmailStatus, lastSuccessAt } };
}
const inboundEmailStatus = { lastAttemptAt:null, lastSuccessAt:null, lastError:'', imported:0 };
let inboundEmailPromise;
async function inboundEmailClient() {
  const keyFile = String(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || '').trim();
  if (!keyFile) throw new Error('Configure the Google service account key before enabling group email import.');
  return createWorkspaceClient({ keyFile, subject:notificationSender });
}
async function inboundEmailState() {
  try { return JSON.parse(await readFile(inboundEmailStateFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
async function saveInboundEmailState(state) {
  const temporary = `${inboundEmailStateFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), { mode:0o600 });
  await rename(temporary, inboundEmailStateFile);
}
async function importGroupEmails() {
  if (inboundEmailPromise) return inboundEmailPromise;
  inboundEmailPromise = performGroupEmailImport();
  try { return await inboundEmailPromise; }
  finally { inboundEmailPromise = null; }
}
async function performGroupEmailImport() {
  try {
    const data = await dashboard();
    const settings = notificationSettings(data);
    if (!settings.inboundEmailEnabled || !settings.approvedGroups?.length) return inboundEmailStatus;
    const startedAt = Date.parse(settings.inboundStartedAt);
    if (!Number.isFinite(startedAt)) throw new Error('Group email import needs a valid start time. Disable and re-enable it in Notifications.');
    inboundEmailStatus.lastAttemptAt = new Date().toISOString();
    const state = await inboundEmailState();
    const scannedAt = state.startedAt === settings.inboundStartedAt ? Date.parse(state.lastCheckedAt) : Number.NaN;
    const afterMs = Number.isFinite(scannedAt) ? Math.max(startedAt - 1000, scannedAt - 10 * 60_000) : startedAt - 1000;
    const client = await inboundEmailClient();
    const ids = await client.gmailMessageIdsSince(Math.floor(afterMs / 1000), settings.approvedGroups);
    const existing = new Set((data.announcements || []).filter(item => item.source?.type === 'group-email').map(item => String(item.source.messageId)));
    const imported = [];
    for (const id of ids) {
      if (existing.has(String(id))) continue;
      const message = await client.gmailMessage(id);
      imported.push(...importedGroupAnnouncements(message, settings.approvedGroups, notificationSender, settings.inboundStartedAt));
    }
    let count = 0;
    if (imported.length) {
      // Re-read after the network calls so an editor's intervening changes are retained.
      const latest = await dashboard(), current = notificationSettings(latest);
      if (current.inboundEmailEnabled && current.inboundStartedAt === settings.inboundStartedAt) {
        const seen = new Set((latest.announcements || []).map(item => String(item.id)));
        const newItems = imported.filter(item => current.approvedGroups.includes(item.source.group) && !seen.has(item.id));
        if (newItems.length) {
          latest.announcements.unshift(...newItems);
          latest._version += 1;
          auditEvent(latest, null, { action:'announcements.email.imported', resource:'Google Group email', route:'/system/group-email-import', outcome:'success', changes:{ count:newItems.length, groups:[...new Set(newItems.map(item => item.source.group))] } });
          await save(latest);
          count = newItems.length;
        }
      }
    }
    await saveInboundEmailState({ startedAt:settings.inboundStartedAt, lastCheckedAt:new Date().toISOString() });
    inboundEmailStatus.lastSuccessAt = new Date().toISOString();
    inboundEmailStatus.lastError = '';
    inboundEmailStatus.imported = count;
    if (count) console.info(`Imported ${count} Google Group email announcement(s) for review.`);
  } catch (error) {
    inboundEmailStatus.lastError = error.message || 'Group email import failed.';
    console.error('Google Group email import failed:', inboundEmailStatus.lastError);
  }
  return inboundEmailStatus;
}
function announcementEmailHtml(announcement, origin) {
  const title = safeText(announcement.title || 'Company update');
  const content = String(announcement.bodyHtml || '').trim() || `<p>${safeText(announcement.body || announcement.message || announcement.description || '')}</p>`;
  const link = `${origin.replace(/\/$/, '')}/announcements.html?announcement=${encodeURIComponent(announcement.id)}`;
  return `<!doctype html><html><body style="margin:0;background:#f4f8fc;font-family:Arial,sans-serif;color:#12335f"><main style="max-width:680px;margin:24px auto;background:#fff;border:1px solid #d5e2f2;border-radius:14px;overflow:hidden"><header style="padding:24px 28px;background:#0758a9;color:#fff"><div style="font-size:13px;font-weight:700;letter-spacing:.04em">SI-WARE INTRANET</div><h1 style="margin:10px 0 0;font-size:26px">${title}</h1></header><section style="padding:28px;line-height:1.6">${content}<p style="margin:28px 0 0"><a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#0758a9;color:#fff;text-decoration:none;font-weight:700">Open announcement</a></p></section></main></body></html>`;
}
const smtpBase64 = value => Buffer.from(String(value || ''), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd();
async function sendGmailMessage({ password, to, cc, bcc, subject, text, html }) {
  const socket = tlsConnect({ host:'smtp.gmail.com', port:465, servername:'smtp.gmail.com' });
  let buffer = '', failure = null;
  const replies = [], waiters = [];
  const settle = (reply) => { const waiter = waiters.shift(); if (waiter) waiter.resolve(reply); else replies.push(reply); };
  socket.on('data', chunk => {
    buffer += chunk.toString('utf8');
    let at;
    while ((at = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 2);
      if (/^\d{3} /.test(line)) settle(line);
    }
  });
  socket.on('error', error => { failure = error; while (waiters.length) waiters.shift().reject(error); });
  socket.on('end', () => { if (!failure && waiters.length) { const error = new Error('The Gmail SMTP connection closed unexpectedly.'); while (waiters.length) waiters.shift().reject(error); } });
  const reply = () => {
    if (failure) return Promise.reject(failure);
    if (replies.length) return Promise.resolve(replies.shift());
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  };
  const command = async (line, expected) => {
    socket.write(`${line}\r\n`);
    const response = await reply();
    if (!expected.test(response)) throw new Error(`Gmail SMTP rejected the message (${response}).`);
  };
  try {
    const greeting = await reply();
    if (!/^220 /.test(greeting)) throw new Error(`Gmail SMTP is unavailable (${greeting}).`);
    await command('EHLO si-ware-intranet', /^250 /);
    await command('AUTH LOGIN', /^334 /);
    await command(Buffer.from(notificationSender).toString('base64'), /^334 /);
    await command(Buffer.from(password).toString('base64'), /^235 /);
    await command(`MAIL FROM:<${notificationSender}>`, /^250 /);
    const recipients = [...new Set([...to, ...cc, ...bcc])];
    for (const recipient of recipients) await command(`RCPT TO:<${recipient}>`, /^25[01] /);
    await command('DATA', /^354 /);
    const boundary = `siware-${randomUUID()}`;
    const headers = [
      `From: Si-Ware Intranet <${notificationSender}>`,
      `To: ${to.join(', ')}`,
      ...(cc.length ? [`Cc: ${cc.join(', ')}`] : []),
      `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', smtpBase64(text),
      `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', smtpBase64(html),
      `--${boundary}--`, '.', ''
    ].join('\r\n');
    socket.write(headers);
    const result = await reply();
    if (!/^250 /.test(result)) throw new Error(`Gmail SMTP rejected the message (${result}).`);
    await command('QUIT', /^221 /);
  } finally { socket.end(); }
}
async function deliverAnnouncementEmail(data, announcement) {
  const notification = normaliseAnnouncementNotification(announcement.notification);
  if (announcement.hidden === true || announcement.hidden === 'true' || !notification.emailEnabled || notification.emailDeliveryState) return false;
  const settings = notificationSettings(data);
  if (!settings.emailEnabled) { announcement.notification = { ...notification, emailDeliveryState:'skipped', emailError:'Email delivery was disabled when this announcement published.' }; return true; }
  const group = notification.audienceGroup;
  if (!group || !settings.approvedGroups?.includes(group) || notification.to.length !== 1 || notification.to[0] !== group) {
    announcement.notification = { ...notification, emailDeliveryState:'skipped', emailError:'Email delivery requires an approved Google Group as the sole To recipient.' };
    return true;
  }
  try {
    await audienceGroupMember(group, String(process.env.GOOGLE_SYNC_SUBJECT || '').trim().toLowerCase());
  } catch (error) {
    console.warn('Announcement group email was withheld:', error.message);
    announcement.notification = { ...notification, emailDeliveryState:'skipped', emailError:'The selected Google Group could not be verified.' };
    return true;
  }
  const secrets = await notificationSecrets();
  let password = '';
  try { password = decryptNotificationSecret(secrets.gmailAppPassword); }
  catch { password = ''; }
  if (!password) { announcement.notification = { ...notification, emailDeliveryState:'failed', emailError:'No usable Gmail app password is configured.' }; return true; }
  try {
    const origin = process.env.APP_ORIGIN || 'http://localhost:8080';
    await sendGmailMessage({ password, to:notification.to, cc:notification.cc, bcc:notification.bcc, subject:safeText(announcement.title || 'Company update'), text:`${safeText(announcement.body || announcement.message || announcement.description || '')}\n\nOpen announcement: ${origin.replace(/\/$/, '')}/announcements.html?announcement=${encodeURIComponent(announcement.id)}`, html:announcementEmailHtml(announcement, origin) });
    announcement.notification = { ...notification, emailDeliveryState:'sent', emailSentAt:new Date().toISOString(), emailError:'' };
  } catch (error) {
    console.error('Announcement email delivery failed:', error.message);
    announcement.notification = { ...notification, emailDeliveryState:'failed', emailError:'Delivery failed. Check the Notifications email settings and app password.' };
  }
  return true;
}
async function deliverQueuedAnnouncementEmails(data) {
  let changed = false;
  for (const announcement of data.announcements || []) if (await deliverAnnouncementEmail(data, announcement)) changed = true;
  return changed;
}
const adminDefaultKeys = ['apps','announcements','announcementSchedules','announcementTemplates','socialLinks','moments','momentsPageContent','sessions','knowledgePageContent','events','eventsPageContent','whistleblowerConfig','whistleblower2Config','newMembers','recentlyJoinedPageContent','policies','firstWeekChecklist','supportPortals','policyAcknowledgementContent','newSiPageContent','homePageContent','globalPageContent','settings','adminSettings'];
const contentChangeLabels = {
  whistleblower2Config: 'Whistleblower 2 Google Form',
  user: 'Intranet profile',
  apps: 'Main Apps · app links',
  announcements: 'Announcements',
  announcementSchedules: 'Announcements schedule',
  announcementTemplates: 'Announcement templates',
  socialLinks: 'Social Media · channels',
  moments: 'Moments · cards',
  momentsPageContent: 'Moments · page text',
  sessions: 'Knowledge Hub · sessions',
  knowledgePageContent: 'Knowledge Hub · page text',
  events: 'Events & key dates',
  eventsPageContent: 'Events & key dates · page text',
  whistleblowerConfig: 'Whistleblower · guidance',
  newMembers: 'Our Team · colleagues',
  recentlyJoinedPageContent: 'Our Team · page text',
  policies: 'New Si-Warians · policies',
  firstWeekChecklist: 'New Si-Warians · first-week checklist',
  supportPortals: 'New Si-Warians · support portals',
  policyAcknowledgementContent: 'New Si-Warians · acknowledgement',
  newSiPageContent: 'New Si-Warians · page text',
  globalPageContent: 'Global pages content',
  settings: 'Appearance'
};
const changedContentLabels = keys => [...new Set(keys.map(key => contentChangeLabels[key] || key))];

// Older seed content predates editable record IDs.  Administration addresses
// records by ID, so every editable collection must have a stable, persisted
// identifier before it is returned to the editor.
function ensureEditableRecordIds(data) {
  let changed = false;
  for (const key of ['apps', 'announcements', 'moments', 'sessions', 'events', 'newMembers', 'policies', 'firstWeekChecklist', 'supportPortals']) {
    if (!Array.isArray(data[key])) continue;
    const used = new Set();
    data[key] = data[key].map((item, index) => {
      const currentId = typeof item?.id === 'string' ? item.id.trim() : '';
      if (currentId && !used.has(currentId)) { used.add(currentId); return item; }
      let sequence = index + 1, id = `${key}-legacy-${sequence}`;
      while (used.has(id)) id = `${key}-legacy-${++sequence}`;
      used.add(id);
      changed = true;
      return { ...item, id };
    });
  }
  return changed;
}
const knowledgeSessionName = value => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
function duplicateKnowledgeSessionName(items) {
  if (!Array.isArray(items)) return 'Invalid session list';
  const names = new Set();
  for (const item of items) {
    const name = knowledgeSessionName(item?.title);
    if (!name) return 'A Knowledge Hub session needs a title';
    if (names.has(name)) return String(item.title).trim();
    names.add(name);
  }
  return '';
}
const configuredRoles = data => {
  const roles = { ...Object.fromEntries(Object.entries(rolePermissions).filter(([id]) => !data?.disabledDefaultRoles?.includes(id))), ...(data?.accessRoles || {}) };
  for (const [id, permissions] of Object.entries(roles)) {
    roles[id] = [...new Set((Array.isArray(permissions) ? permissions : []).filter(permission => permission !== 'action.edit_save'))];
  }
  if (roles.ADMIN) roles.ADMIN = [...new Set([...roles.ADMIN, 'admin.access', 'access.manage', 'page.users', 'page.roles'])];
  const priority = permission => permission === 'admin.access' ? 0 : permission.startsWith('intranet.') ? 2 : permission.startsWith('page.') ? 3 : 1;
  for (const permissions of Object.values(roles)) permissions.sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));
  return roles;
};
const storedUserFor = (data, email) => data.accessUsers.find(user => String(user.email || '').toLowerCase() === email);
const activeSessionForEmail = email => [...sessions.values()].some(session => session.expiresAt > Date.now() && String(session.actor?.email || '').toLowerCase() === email);
const directoryProfilePhotoFor = (data, email) => {
  const member = data.newMembers?.find(item => String(item.companyEmail || '').trim().toLowerCase() === String(email || '').trim().toLowerCase());
  return String(member?.profilePhotoUrl || member?.photoUrl || '').trim();
};
function directoryAccessUsers(data) {
  const users = new Map();
  for (const member of data.newMembers || []) {
    const email = String(member.companyEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    users.set(email, { id:member.id, email, name:member.name || email, role:'EMPLOYEE', authType:'google', active:true });
  }
  for (const user of data.accessUsers) {
    const email = String(user.email || '').toLowerCase();
    users.set(email, { ...users.get(email), ...user, email });
  }
  if (isLocalAdminConfigured()) {
    const override = storedUserFor(data, localAdminEmail);
    users.set(localAdminEmail, {
      id:'local-admin', email:localAdminEmail, name:localAdminName || 'Local Administrator',
      role:'ADMIN', authType:'local', source:'environment', active:override?.active !== false
    });
  }
  return [...users.values()].map(user => publicAccessUser({ ...user, avatarUrl:directoryProfilePhotoFor(data, user.email) || user.avatarUrl || '' }, activeSessionForEmail(user.email))).sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
}
const actorFor = (req, data) => {
  const session = sessionFor(req);
  if (session) {
    if (session.id === 'local-admin') return environmentLocalAdminActive(data) && configuredRoles(data).ADMIN ? session : null;
    const account = storedUserFor(data, String(session.email || '').toLowerCase());
    if (account?.active === false || (account && (account.authType === 'local') !== Boolean(session.local))) return null;
    if (session.local) {
      if (!account || account.active === false || account.authType !== 'local' || !account.passwordHash) return null;
      const profilePhotoUrl = directoryProfilePhotoFor(data, session.email);
      return configuredRoles(data)[account.role] ? { ...session, name:account.name, role:account.role, avatarUrl:profilePhotoUrl || session.avatarUrl || '' } : null;
    }
    const role = account?.role || session.role;
    const profilePhotoUrl = directoryProfilePhotoFor(data, session.email);
    return configuredRoles(data)[role] ? { ...session, role, name:account?.name || session.name, avatarUrl:profilePhotoUrl || account?.avatarUrl || session.avatarUrl || '' } : null;
  }
  // The demo identity is available only when no sign-in method was explicitly configured.
  if (!isAuthenticationConfigured()) return { id:'local-demo-user', name:data.user?.name || 'Local employee', email:data.user?.email || 'local.employee@si-ware.com', role:configuredRoles(data)[data.user?.role] ? data.user.role : 'EMPLOYEE', demo:true };
  return null;
};
const can = (data, actor, permission) => Boolean(actor && configuredRoles(data)[actor.role]?.includes(permission));
function allowedLanding(data, actor, requested = '/') {
  const permissions = configuredRoles(data)[actor?.role] || [], normalized = requested.toLowerCase(), required = intranetRoutePermissions[normalized];
  if ((required && !permissions.includes(required)) || (normalized === '/admin.html' && !canOpenAdmin(permissions))) {
    return firstAvailableIntranetPage(permissions)?.path || (canOpenAdmin(permissions) ? '/admin.html' : '/profile.html');
  }
  return requested;
}
function requirePermission(req, res, data, permission) {
  const actor = actorFor(req, data);
  if (!can(data, actor, permission)) { auditEvent(data, actor, { action:'access.denied', resource:permission, route:new URL(req.url, 'http://localhost').pathname, outcome:'denial' }); save(data).catch(() => {}); json(res, actor ? 403 : 401, { error: actor ? 'You do not have permission for this action.' : 'Sign in is required.' }); return null; }
  return actor;
}
function requireEveryPermission(req, res, data, permissions) {
  const actor = actorFor(req, data);
  const missing = permissions.find(permission => !can(data, actor, permission));
  if (missing) {
    auditEvent(data, actor, { action:'access.denied', resource:missing, route:new URL(req.url, 'http://localhost').pathname, outcome:'denial' });
    save(data).catch(() => {});
    json(res, actor ? 403 : 401, { error:actor ? `Permission required: ${missing}.` : 'Sign in is required.' });
    return null;
  }
  return actor;
}
const employeeDashboardKeys = new Set([
  'socialLinks','whistleblowerConfig','whistleblower2Config','policyAcknowledgementContent','newSiPageContent',
  'settings','supportPortals','firstWeekChecklist','newMembers','policies','people',
  'forms','faqs','serviceRequests','apps','announcements','sessions','feeds','moments',
  'events','eventsPageContent','homePageContent','knowledgePageContent','momentsPageContent','recentlyJoinedPageContent','globalPageContent','_version'
]);
const eventAudienceHash = email => createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex');
const publicEvents = events => (Array.isArray(events) ? events : []).filter(event => event.hidden !== true).map(({ privateAudienceHashes, privateDetails, hidden, ...event }) => event);
const calendarMeetingLinks = value => {
  const links = [], seen = new Set();
  for (const item of Array.isArray(value) ? value : []) {
    const url = String(item?.url || '');
    if (!/^https:\/\//i.test(url) || (/^https:\/\/www\.google\.com\/url\?/i.test(url) && /integration-gws\.zoom\.us/i.test(url))) continue;
    let host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch { continue; }
    const platform = /(^|\.)zoom\.us$/.test(host) ? 'Zoom' : host === 'meet.google.com' ? 'Google Meet' : (/(^|\.)teams\.microsoft\.com$/.test(host) || host === 'teams.live.com') ? 'Microsoft Teams' : /(^|\.)webex\.com$/.test(host) ? 'Webex' : '';
    const key = platform || url;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ label:platform === 'Google Meet' ? 'Join Google Meet' : platform ? `Join ${platform} Meeting` : safeText(item?.label).slice(0, 120) || 'Open meeting link', url });
    if (links.length === 5) break;
  }
  return links;
};
function eventPrivateDetails(data, actor, eventId) {
  const event = (data.events || []).find(item => String(item.id) === String(eventId));
  if (!event) return null;
  const roleAccess = can(data, actor, 'events.details.all');
  const authorised = roleAccess || Boolean(actor?.email && Array.isArray(event.privateAudienceHashes) && event.privateAudienceHashes.includes(eventAudienceHash(actor.email)));
  if (!authorised) return { authorised:false };
  const details = event.privateDetails && typeof event.privateDetails === 'object' ? event.privateDetails : {};
  const person = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value?.email || '')) ? { name:safeText(value.name).slice(0, 160) || safeText(value.email).slice(0, 200), email:safeText(value.email).slice(0, 200) } : null;
  const organizer = person(details.organizer), seenInvitees = new Set(organizer ? [organizer.email.toLowerCase()] : []);
  const invitees = (Array.isArray(details.invitees) ? details.invitees : []).map(person).filter(item => item && !seenInvitees.has(item.email.toLowerCase()) && (seenInvitees.add(item.email.toLowerCase()) || true)).slice(0, 50);
  return {
    authorised:true,
    access:roleAccess ? 'role' : 'invitee',
    description:safeText(details.description).slice(0, 4000),
    meetingLinks:calendarMeetingLinks(details.meetingLinks),
    attachments:(Array.isArray(details.attachments) ? details.attachments : []).filter(file => /^https:\/\//i.test(String(file?.url || ''))).slice(0, 20).map(file => ({ title:safeText(file.title).slice(0, 240) || 'Open attachment', url:String(file.url), mimeType:safeText(file.mimeType).slice(0, 120) })),
    organizer, invitees
  };
}
async function dashboardResponse(data, actor, admin = false) {
  // An Administration response must contain only the content this role can edit.
  // Employee dashboard data (notably redacted calendar events) is not a safe
  // round-trip payload for a limited editor: it can differ from stored data and
  // be mistaken for an unauthorized change when another page is saved.
  const keys = admin ? new Set(['_version', ...adminContentKeys.filter(key =>
    adminContentKeyPages[key]?.some(permission => can(data, actor, permission)))]) : employeeDashboardKeys;
  const visible = Object.fromEntries(Object.entries(data).filter(([key]) => keys.has(key)).map(([key, value]) => {
    const required = intranetContentPermissions[key];
    return [key, !admin && required && actor && !can(data, actor, required) ? (Array.isArray(value) ? [] : {}) : value];
  }));
  if (Object.hasOwn(visible, 'events') && (!admin || !can(data, actor, 'page.events'))) visible.events = publicEvents(visible.events);
  if (!admin && Array.isArray(visible.announcements)) {
    const checks = new Map();
    const membership = (group, email) => {
      const key = `${group}\0${email}`;
      if (!checks.has(key)) checks.set(key, audienceGroupMember(group, email).catch(error => { console.warn('Google Group notification lookup failed:', error.message); return false; }));
      return checks.get(key);
    };
    const settings = notificationSettings(data);
    visible.announcements = (await Promise.all(visible.announcements.map(async announcement => {
      if (announcement.hidden === true || announcement.hidden === 'true') return null;
      const notification = normaliseAnnouncementNotification(announcement.notification);
      const group = notification.audienceGroup;
      const email = emailAddress(actor?.email);
      if (!group && (notification.to.length || notification.inAppRecipients.length)) return null;
      if (group && (!settings.approvedGroups?.includes(group) || !email.endsWith(`@${googleWorkspaceDomain}`))) return null;
      const copiedRecipient = notification.cc.includes(email) || notification.bcc.includes(email);
      if (group && !copiedRecipient && !await membership(group, email)) return null;
      return { ...announcement, ...(announcement.source?.type === 'group-email' ? { source:{ type:'group-email', group:announcement.source.group, fromEmail:announcement.source.fromEmail, receivedAt:announcement.source.receivedAt } } : {}), notification:publicAnnouncementNotification(announcement.notification, data, Boolean(group)) };
    }))).filter(Boolean);
  }
  const notificationDefaults = admin ? (() => { const settings = notificationSettings(data); return { inAppEnabled:settings.inAppEnabled, inAppDefaultEnabled:settings.inAppDefaultEnabled, emailEnabled:settings.emailEnabled, emailDefaultEnabled:settings.emailDefaultEnabled, approvedGroups:settings.approvedGroups, defaultGroup:settings.defaultGroup }; })() : undefined;
  return { ...visible, ...(admin ? { notificationDefaults } : {}), user:actor ? { name:actor.name, email:actor.email, role:actor.role, avatarUrl:actor.avatarUrl || '', title:actor.role === 'ADMIN' ? 'Administrator' : actor.role.replace('_', ' ') } : data.user };
}
function dashboardMutationError(data, actor, next, operation = '') {
  const changedKeys = Object.keys(next).filter(key => adminContentKeyPages[key] && JSON.stringify(next[key]) !== JSON.stringify(data[key]));
  for (const key of changedKeys) {
    if (!adminContentKeyPages[key].some(permission => can(data, actor, permission))) return { error:`Page access required to change ${key}.`, status:403 };
  }
  if (changedKeys.includes('settings') && JSON.stringify(next.settings?.theme) !== JSON.stringify(data.settings?.theme) && !can(data, actor, 'page.appearance')) {
    return { error:'Appearance page access is required to change the shared theme.', status:403 };
  }
  if (changedKeys.some(key => key === 'announcements' || key === 'announcementSchedules') && !can(data, actor, 'content.publish')) return { error:'Publish content permission is required for announcements.', status:403 };
  if (changedKeys.some(key => key === 'whistleblowerConfig' || key === 'whistleblower2Config') && next.whistleblowerConfig?.enabled === next.whistleblower2Config?.enabled) return { error:'Select exactly one active Whistleblower reporting route for employees.', status:422 };
  if (removedContent(data, next, changedKeys) && !can(data, actor, 'action.delete')) return { error:'Delete permission is required to remove content.', status:403 };
  const action = { undo:'action.undo', redo:'action.redo', reset:'action.reset', import:'action.import', delete:'action.delete' }[operation];
  if (action && !can(data, actor, action)) return { error:`Permission required: ${action}.`, status:403 };
  return { changedKeys };
}
async function requireAuthenticatedEmployee(req, res, permission = '') {
  const data = await dashboard(), actor = actorFor(req, data);
  if (!hasEmployeeRole(actor, configuredRoles(data))) { json(res, 401, { error:'Sign in is required.' }); return null; }
  if (permission && !can(data, actor, permission)) { json(res, 403, { error:`Permission required: ${permission}.` }); return null; }
  return actor;
}
function redact(value) {
  if (Array.isArray(value)) return value.slice(0, 20).map(redact);
  if (!value || typeof value !== 'object') return typeof value === 'string' ? safeText(value) : value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/(password|token|cookie|secret|authorization|dataurl)/i.test(key)).slice(0, 20).map(([key, item]) => [key, redact(item)]));
}
function auditEvent(data, actor, event) {
  data.auditEvents ||= [];
  data.auditEvents.unshift({ id: randomUUID(), category:'audit', occurredAt:new Date().toISOString(), serverReceivedAt:new Date().toISOString(), actor: actor ? { id:actor.id, name:safeText(actor.name), email:safeText(actor.email), role:actor.role } : null, outcome:'success', ...redact(event) });
}
function activityEvent(data, actor, event, ip = '') {
  data.activityEvents ||= [];
  if (data.activityEvents.some(entry => entry.id === event.id)) return false;
  const route = safeText(event.route).split(/[?#]/)[0];
  if (/^\/(?:whistleblower(?:-2)?(?:\.html|\/|$)|login\.html$)/i.test(route)) return false;
  const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  const safeMetadata = Object.fromEntries(['page','control','destination','keyboard'].filter(key => Object.hasOwn(metadata, key)).map(key => [key, key === 'keyboard' ? Boolean(metadata[key]) : safeText(metadata[key])]));
  const clientTime = Date.parse(event.occurredAt), now = Date.now();
  data.activityEvents.unshift({ id:event.id, category:'activity', occurredAt:Number.isFinite(clientTime) && Math.abs(now - clientTime) < 86400000 ? new Date(clientTime).toISOString() : new Date(now).toISOString(), serverReceivedAt:new Date(now).toISOString(), actor:{ id:actor.id, name:safeText(actor.name), email:safeText(actor.email), role:actor.role }, action:safeText(event.action), component:safeText(event.component), route, metadata:safeMetadata, ip:safeText(ip).slice(0, 64) });
  return true;
}
function auditEventType(event) {
  if (event.category === 'activity') return /^(page\.|page$)/.test(event.action || '') ? 'page' : /click|activate/.test(event.action || '') ? 'click' : 'system';
  if (/^(content\.|presentation\.)/.test(event.action || '')) return 'change';
  if (/^(authentication\.|access\.)/.test(event.action || '')) return 'access';
  return 'system';
}
function auditEventSource(data, category = 'all') {
  const all = [...data.auditEvents, ...data.activityEvents];
  const source = category === 'audit' ? data.auditEvents : category === 'activity' ? data.activityEvents : category === 'all' ? all : all.filter(event => auditEventType(event) === category);
  return [...source].sort((a, b) => Date.parse(b.serverReceivedAt || b.occurredAt) - Date.parse(a.serverReceivedAt || a.occurredAt));
}
const decodeXml = value => String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const xmlValue = (entry, tag) => decodeXml((new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)).exec(entry)?.[1] || '').trim();
const isYouTubePayload = payload => Array.isArray(payload?.videos) && payload.videos.length > 0;
async function cachedYouTubeVideos() {
  try {
    const payload = JSON.parse(await readFile(youtubeCacheFile, 'utf8'));
    return isYouTubePayload(payload) ? payload : null;
  } catch {
    return null;
  }
}
async function latestYouTubeVideos() {
  if (youtubeCache.payload && Date.now() < youtubeCache.expiresAt) return youtubeCache.payload;
  try {
    const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`, { headers: { accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8', 'user-agent': 'Mozilla/5.0 (compatible; Si-Ware Intranet video feed)' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`YouTube feed returned ${response.status}`);
    const xml = await response.text();
    const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 3).map(([, entry]) => {
      const id = xmlValue(entry, 'yt:videoId');
      return { id, title: xmlValue(entry, 'title'), published: xmlValue(entry, 'published'), watchUrl: `https://www.youtube.com/watch?v=${id}`, thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` };
    }).filter(video => video.id && video.title);
    if (!videos.length) throw new Error('No videos in YouTube feed');
    const payload = { channelUrl: youtubeChannelUrl, videos, updatedAt: new Date().toISOString() };
    youtubeCache = { payload, expiresAt: Date.now() + 15 * 60 * 1000 };
    await writeFile(youtubeCacheFile, JSON.stringify(payload, null, 2));
    return payload;
  } catch {
    if (youtubeCache.payload) return youtubeCache.payload;
    const cached = await cachedYouTubeVideos();
    if (cached) {
      youtubeCache = { payload: cached, expiresAt: Date.now() + 60 * 1000 };
      return { ...cached, stale: true };
    }
    return { channelUrl: youtubeChannelUrl, videos: [], unavailable: true };
  }
}
const decodeHtml = value => String(value || '').replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16))).replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10))).replace(/&(amp|quot|apos|#39|lt|gt);/gi, (_, entity) => ({ amp:'&', quot:'"', apos:"'", '#39':"'", lt:'<', gt:'>' }[entity.toLowerCase()]));
const plainHtml = value => decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
const absoluteCompanyNewsUrl = value => new URL(decodeHtml(value), companyNewsUrl).href;
function parseCompanyNews(html) {
  const expression = /<img src="([^"]+)"[^>]*class="image-216 custom-size"[\s\S]*?<h3 class="link-4-copy">([\s\S]*?)<\/h3>[\s\S]*?<div class="text-size-small margin-top-small">([\s\S]*?)<\/div>[\s\S]*?<p class="paragraph-12 news_card-item-body margin-top-small">([\s\S]*?)<\/p>[\s\S]*?<a href="([^"]+)" class="arrow-link news_card_item-link w-inline-block"/g;
  const seen = new Set(), items = [];
  for (const match of html.matchAll(expression)) {
    const [imageUrl, title, date, summary, url] = match.slice(1).map(plainHtml);
    let articleUrl, coverUrl;
    try { articleUrl = absoluteCompanyNewsUrl(url); coverUrl = absoluteCompanyNewsUrl(imageUrl); } catch { continue; }
    if (new URL(articleUrl).hostname !== 'www.si-ware.com' || !articleUrl.includes('/our-news/') || !title || seen.has(articleUrl)) continue;
    const parsedDate = new Date(date), dateIso = Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString().slice(0, 10);
    items.push({ title, date, dateIso, summary, url:articleUrl, imageUrl:coverUrl }); seen.add(articleUrl);
    if (items.length === 12) break;
  }
  return items;
}
async function cachedCompanyNews() {
  try {
    const payload = JSON.parse(await readFile(companyNewsCacheFile, 'utf8'));
    return Array.isArray(payload?.items) && payload.items.length ? payload : null;
  } catch { return null; }
}
async function latestCompanyNews() {
  if (companyNewsCache.payload && Date.now() < companyNewsCache.expiresAt) return companyNewsCache.payload;
  if (companyNewsRefresh) return companyNewsRefresh;

  companyNewsRefresh = (async () => {
    try {
      const response = await fetch(companyNewsUrl, { headers:{ accept:'text/html,application/xhtml+xml', 'user-agent':'Mozilla/5.0 (compatible; Si-Ware Intranet news feed)' }, signal:AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Company news returned ${response.status}`);
      const items = parseCompanyNews(await response.text());
      if (!items.length) throw new Error('No company news items found');
      const payload = { sourceUrl:companyNewsUrl, items, updatedAt:new Date().toISOString() };
      companyNewsCache = { payload, expiresAt:Date.now() + 15 * 60 * 1000 };
      await writeFile(companyNewsCacheFile, JSON.stringify(payload, null, 2));
      return payload;
    } catch {
      const cached = companyNewsCache.payload || await cachedCompanyNews();
      if (cached) {
        companyNewsCache = { payload:cached, expiresAt:Date.now() + 60 * 1000 };
        return { ...cached, stale:true };
      }
      return { sourceUrl:companyNewsUrl, items:[], unavailable:true };
    }
  })().finally(() => { companyNewsRefresh = null; });

  return companyNewsRefresh;
}
const uploadMimeExtensions = {
  'application/pdf':'pdf',
  'application/vnd.ms-powerpoint':'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx',
  'application/msword':'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
  'application/vnd.ms-excel':'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
  'text/plain':'txt',
  'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif', 'image/x-icon':'ico', 'image/vnd.microsoft.icon':'ico',
  'video/mp4':'mp4', 'video/webm':'webm', 'video/quicktime':'mov'
};
const maxMomentMediaUploadBytes = 500 * 1024 * 1024;
async function saveAdminUpload(dataUrl, filename) {
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl || '');
  const extension = uploadMimeExtensions[match?.[1]?.toLowerCase()];
  if (!match || !extension) throw new Error('Upload a PDF, PowerPoint, PNG, JPEG, WebP, GIF, MP4, WebM or MOV file');
  const content = Buffer.from(match[2], 'base64');
  if (!content.length || content.length > 50 * 1024 * 1024) throw new Error('File must be no larger than 50 MB');
  const safeName = String(filename || 'upload').replace(/[^a-z0-9-_]/gi, '-').slice(0, 60) || 'upload';
  const stored = `${safeName}-${Date.now()}.${extension}`;
  await mkdir(uploadsDir, { recursive: true }); await writeFile(join(uploadsDir, stored), content);
  return `/uploads/${stored}`;
}
async function saveAdminBinaryUpload(req, filename, mimeType) {
  const extension = uploadMimeExtensions[String(mimeType || '').split(';')[0].trim().toLowerCase()];
  if (!extension) throw new Error('Upload a PDF, PowerPoint, PNG, JPEG, WebP, GIF, MP4, WebM or MOV file');
  const safeName = String(filename || 'upload').replace(/[^a-z0-9-_]/gi, '-').slice(0, 60) || 'upload';
  const stored = `${safeName}-${Date.now()}.${extension}`;
  const temporary = join(uploadsDir, `.${stored}.${randomUUID()}.upload`);
  const destination = join(uploadsDir, stored);
  await mkdir(uploadsDir, { recursive: true });
  let size = 0;
  try {
    await new Promise((resolve, reject) => {
      const output = createWriteStream(temporary, { flags: 'wx' });
      let settled = false;
      const finish = (handler, value) => { if (settled) return; settled = true; handler(value); };
      const fail = error => finish(reject, error);
      req.on('data', chunk => {
        size += chunk.length;
        if (size > maxMomentMediaUploadBytes) {
          const error = new Error('Moment media must be no larger than 500 MB.');
          error.statusCode = 413;
          output.destroy(error);
          req.destroy();
          return;
        }
        if (!output.write(chunk)) req.pause(), output.once('drain', () => req.resume());
      });
      req.on('error', fail);
      req.on('aborted', () => fail(new Error('Upload was interrupted. Please try again.')));
      req.on('end', () => output.end());
      output.on('error', fail);
      output.on('finish', () => finish(resolve));
    });
    if (!size) throw new Error('The uploaded file is empty.');
    await rename(temporary, destination);
    return `/uploads/${stored}`;
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
async function mediaInventory(data) {
  await mkdir(uploadsDir, { recursive:true });
  const payload = JSON.stringify(data);
  const files = await readdir(uploadsDir, { withFileTypes:true });
  return Promise.all(files.filter(entry => entry.isFile() && !entry.name.startsWith('.')).map(async entry => {
    const file = join(uploadsDir, entry.name), info = await stat(file), url = `/uploads/${entry.name}`;
    return { name:entry.name, url, size:info.size, modifiedAt:info.mtime.toISOString(), inUse:payload.includes(url) };
  }));
}
function uploadedPdfPath(url) {
  try { url = new URL(url, 'http://localhost').pathname; } catch { return null; }
  if (!/^\/uploads\/[a-z0-9._-]+\.pdf$/i.test(url || '')) return null;
  const file = normalize(join(uploadsDir, url.slice('/uploads/'.length)));
  return relative(uploadsDir, file).startsWith('..') ? null : file;
}
async function withPolicyModifiedDates(data) {
  const policies = await Promise.all((data.policies || []).map(async policy => {
    const file = uploadedPdfPath(policy.canonicalUrl);
    if (!file) return { ...policy, modifiedAt: policy.modifiedAt || '' };
    try { return { ...policy, modifiedAt: (await stat(file)).mtime.toISOString() }; }
    catch { return { ...policy, modifiedAt: policy.modifiedAt || '' }; }
  }));
  return { ...data, policies };
}
function highlightedSnippet(text, query) {
  const normalized = text.replace(/\s+/g, ' ').trim(), index = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return null;
  return `${index > 76 ? '…' : ''}${normalized.slice(Math.max(0, index - 76), index + query.length + 132)}${index + query.length + 132 < normalized.length ? '…' : ''}`;
}
function pdfWords(bbox) {
  const page = /<page width="([\d.]+)" height="([\d.]+)">/.exec(bbox);
  if (!page) return [];
  const [, width, height] = page.map(Number);
  return [...bbox.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)]
    .map(match => ({
      text: match[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
      left: Number(match[1]) / width,
      top: Number(match[2]) / height,
      width: (Number(match[3]) - Number(match[1])) / width,
      height: (Number(match[4]) - Number(match[2])) / height
    }));
}
function matchingPdfWords(words, query) {
  const term = query.trim().toLocaleLowerCase();
  return words.filter(word => word.text.toLocaleLowerCase().includes(term));
}
function wordSnippet(words, index) {
  const start = Math.max(0, index - 10), end = Math.min(words.length, index + 15);
  return `${start ? '…' : ''}${words.slice(start, end).map(word => word.text).join(' ')}${end < words.length ? '…' : ''}`;
}
async function findPolicyOccurrences(policies, query) {
  if (!query.trim()) return [];
  const results = [];
  for (const policy of policies) {
    const file = uploadedPdfPath(policy.canonicalUrl); if (!file) continue;
    try {
      const { stdout } = await execFileAsync('pdfinfo', [file], { maxBuffer: 1024 * 1024 });
      const pages = Math.min(Number(/Pages:\s+(\d+)/.exec(stdout)?.[1] || 0), 80);
      for (let page = 1; page <= pages; page += 1) {
        const { stdout: bbox } = await execFileAsync('pdftotext', ['-f', String(page), '-l', String(page), '-bbox', file, '-'], { maxBuffer: 3 * 1024 * 1024 });
        const words = pdfWords(bbox), matchingWords = matchingPdfWords(words, query);
        matchingWords.forEach((word, matchIndex) => {
          const wordIndex = words.indexOf(word);
          results.push({ title: policy.title, url: policy.canonicalUrl, page, matchIndex, snippet: wordSnippet(words, wordIndex), ...word });
        });
      }
    } catch { /* A damaged or restricted PDF simply remains searchable by its metadata. */ }
  }
  return results;
}
async function findInPolicyDocuments(policies, query) {
  if (!query || query.length < 2) return [];
  const results = [];
  for (const policy of policies) {
    const file = uploadedPdfPath(policy.canonicalUrl); if (!file) continue;
    try {
      const { stdout } = await execFileAsync('pdfinfo', [file], { maxBuffer: 1024 * 1024 });
      const pages = Math.min(Number(/Pages:\s+(\d+)/.exec(stdout)?.[1] || 0), 80);
      for (let page = 1; page <= pages && results.length < 30; page += 1) {
        const { stdout: text } = await execFileAsync('pdftotext', ['-f', String(page), '-l', String(page), '-layout', file, '-'], { maxBuffer: 2 * 1024 * 1024 });
        const snippet = highlightedSnippet(text, query); if (snippet) results.push({ title: policy.title, url: policy.canonicalUrl, page, snippet });
      }
    } catch { /* A damaged or restricted PDF simply remains searchable by its metadata. */ }
  }
  return results;
}
async function documentHighlights(url, page, query) {
  const file = uploadedPdfPath(url); if (!file || !query) return [];
  const { stdout } = await execFileAsync('pdftotext', ['-f', String(page), '-l', String(page), '-bbox', file, '-'], { maxBuffer: 3 * 1024 * 1024 });
  // Poppler reports PDF word positions from the top-left of the page. Keep that
  // coordinate system intact so the overlay matches the rendered page image.
  return matchingPdfWords(pdfWords(stdout), query).map((word, matchIndex) => ({ ...word, matchIndex }));
}
async function dashboard() {
  const seed = JSON.parse(await readFile(seedFile, 'utf8'));
  const adminDefaults = JSON.parse(await readFile(adminDefaultsFile, 'utf8'));
  let data;
  try {
    data = JSON.parse(await readFile(dataFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await copyFile(seedFile, dataFile);
    data = JSON.parse(await readFile(dataFile, 'utf8'));
  }
    let changed = false;
    for (const key of ['newMembers', 'policies', 'people', 'forms', 'faqs', 'serviceRequests', 'supportPortals', 'firstWeekChecklist', 'announcementSchedules', 'announcementTemplates']) {
      if (!Array.isArray(data[key])) { data[key] = seed[key] ?? adminDefaults[key] ?? []; changed = true; }
    }
    const socialLinks = { ...(seed.socialLinks || {}), ...(data.socialLinks || {}) };
    if (JSON.stringify(data.socialLinks || {}) !== JSON.stringify(socialLinks)) { data.socialLinks = socialLinks; changed = true; }
    const whistleblowerConfig = { ...(seed.whistleblowerConfig || {}), ...(data.whistleblowerConfig || {}) };
    if (JSON.stringify(data.whistleblowerConfig || {}) !== JSON.stringify(whistleblowerConfig)) { data.whistleblowerConfig = whistleblowerConfig; changed = true; }
    const whistleblower2Config = { ...(seed.whistleblower2Config || {}), ...(data.whistleblower2Config || {}) };
    if (JSON.stringify(data.whistleblower2Config || {}) !== JSON.stringify(whistleblower2Config)) { data.whistleblower2Config = whistleblower2Config; changed = true; }
    if (data.whistleblower2Config.enabled === true && data.whistleblowerConfig.enabled !== false) { data.whistleblowerConfig.enabled = false; changed = true; }
    if (data.whistleblowerConfig.enabled === false && data.whistleblower2Config.enabled === false) { data.whistleblowerConfig.enabled = true; changed = true; }
    const acknowledgementContent = data.policyAcknowledgementContent || {}, hydratedAcknowledgementContent = { ...acknowledgementContentDefault, ...acknowledgementContent };
    if (JSON.stringify(acknowledgementContent) !== JSON.stringify(hydratedAcknowledgementContent)) { data.policyAcknowledgementContent = hydratedAcknowledgementContent; changed = true; }
    const newSiPageContent = { ...(seed.newSiPageContent || {}), ...(adminDefaults.newSiPageContent || {}), ...(data.newSiPageContent || {}) };
    if (JSON.stringify(data.newSiPageContent || {}) !== JSON.stringify(newSiPageContent)) { data.newSiPageContent = newSiPageContent; changed = true; }
    const globalPageContent = normaliseGlobalPageContent(data.globalPageContent || seed.globalPageContent || adminDefaults.globalPageContent || defaultGlobalPageContent);
    if (JSON.stringify(data.globalPageContent || {}) !== JSON.stringify(globalPageContent)) { data.globalPageContent = globalPageContent; changed = true; }
    const seededMembers = new Map(seed.newMembers.map(member => [member.id, member]));
    const seededPolicies = new Map((seed.policies || []).map(policy => [policy.id, policy]));
    if (data.newMembers.some(member => !member.directManager || !member.employmentType || !member.department || !member.division)) {
      data.newMembers = data.newMembers.map(member => ({
        ...member,
        directManager: member.directManager || seededMembers.get(member.id)?.directManager || 'To be confirmed',
        employmentType: employmentTypes.includes(member.employmentType) ? member.employmentType : 'Full Time',
        department: member.department || member.team || 'To be confirmed',
        division: member.division || 'To be confirmed'
      }));
      changed = true;
    }
    if (data.policies.some(policy => !policy.department)) {
      data.policies = data.policies.map(policy => ({ ...policy, department:policy.department || seededPolicies.get(policy.id)?.department || policy.owner || 'All departments' }));
      changed = true;
    }
    const expectedLayout = seed.settings.layout;
    if (!data.settings) { data.settings = seed.settings; changed = true; }
    else if (data.settings.layout?.includes('actions')) { data.settings.layout = data.settings.layout.map(item => item === 'actions' ? 'new-members' : item); changed = true; }
    else if (!data.settings.layout?.includes('new-members')) { data.settings.layout = expectedLayout; changed = true; }
    if (!Number.isInteger(data._version)) { data._version = 1; changed = true; }
    if (!Array.isArray(data.auditEvents)) { data.auditEvents = []; changed = true; }
    if (!Array.isArray(data.activityEvents)) { data.activityEvents = []; changed = true; }
    if (!Array.isArray(data.accessUsers)) { data.accessUsers = []; changed = true; }
    localAccountsConfigured = data.accessUsers.some(user => user.authType === 'local' && user.passwordHash);
    if (!data.accessRoles || typeof data.accessRoles !== 'object' || Array.isArray(data.accessRoles)) { data.accessRoles = {}; changed = true; }
    if (!Array.isArray(data.disabledDefaultRoles)) { data.disabledDefaultRoles = []; changed = true; }
    if (!Number.isInteger(data.permissionsSchemaVersion) || data.permissionsSchemaVersion < 2) {
      data.accessRoles = Object.fromEntries(Object.entries(data.accessRoles).map(([id, permissions]) => {
        const existing = Array.isArray(permissions) ? permissions : [];
        const hadAdminView = existing.some(permission => permission.startsWith('page.'));
        return [id, [...new Set([...existing, ...intranetPagePermissions, ...(hadAdminView ? ['admin.access'] : [])])]];
      }));
      data.permissionsSchemaVersion = 2;
      changed = true;
    }
    if (data.permissionsSchemaVersion < 3) {
      if (Array.isArray(data.accessRoles.ADMIN) && !data.accessRoles.ADMIN.includes('events.details.all')) data.accessRoles.ADMIN.push('events.details.all');
      data.permissionsSchemaVersion = 3;
      changed = true;
    }
    data.adminSettings ||= { layoutHistory:[] };
    const currentNotificationSettings = notificationSettings(data);
    if (JSON.stringify(data.adminSettings.notificationSettings || {}) !== JSON.stringify(currentNotificationSettings)) { data.adminSettings.notificationSettings = currentNotificationSettings; changed = true; }
    if (!data.adminSettings.googleSync) { data.adminSettings.googleSync = defaultGoogleSyncSettings(); changed = true; }
    if (data.adminSettings.auditRetentionDays !== auditRetentionDays || data.adminSettings.activityRetentionDays !== auditRetentionDays) {
      data.adminSettings.auditRetentionDays = auditRetentionDays;
      data.adminSettings.activityRetentionDays = auditRetentionDays;
      changed = true;
    }
    if (!hasArchiveRunToday(data)) changed = true;
    if (ensureEditableRecordIds(data)) changed = true;
    for (const key of ['announcements', 'announcementSchedules', 'announcementTemplates']) {
      const normalised = data[key].map(item => ({ ...item, notification:normaliseAnnouncementNotification(item.notification) }));
      if (JSON.stringify(data[key]) !== JSON.stringify(normalised)) { data[key] = normalised; changed = true; }
    }
    if (publishDueAnnouncements(data)) changed = true;
    if (await deliverQueuedAnnouncementEmails(data)) changed = true;
    if (changed) await save(data);
    return withPolicyModifiedDates(data);
}
function cairoNowParts(now = new Date()) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23', weekday:'short' }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { ...values, date:`${values.year}-${values.month}-${values.day}`, time:`${values.hour}:${values.minute}` };
}
function announcementDateLabel(now) { return new Intl.DateTimeFormat('en', { timeZone:'Africa/Cairo', month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }).format(now); }
function publishDueAnnouncements(data, now = new Date()) {
  if (!Array.isArray(data.announcementSchedules)) return false;
  const parts = cairoNowParts(now), weekday = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }[parts.weekday];
  let changed = false;
  for (const schedule of data.announcementSchedules) {
    if (!schedule?.enabled || !['once','daily','weekly','monthly'].includes(schedule.frequency) || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(schedule.time || '') || parts.time < schedule.time || (schedule.scheduledDate && parts.date < schedule.scheduledDate)) continue;
    const monthlyDay = Math.min(Math.max(Number(schedule.dayOfMonth) || 1, 1), new Date(Date.UTC(Number(parts.year), Number(parts.month), 0)).getUTCDate());
    const due = (schedule.frequency === 'once' && parts.date === schedule.scheduledDate) || schedule.frequency === 'daily' || (schedule.frequency === 'weekly' && Number(schedule.dayOfWeek) === weekday) || (schedule.frequency === 'monthly' && Number(parts.day) === monthlyDay);
    if (!due || schedule.lastPublishedOccurrence === parts.date) continue;
    const { id, frequency, scheduledDate, time, dayOfWeek, dayOfMonth, enabled, lastPublishedOccurrence, ...template } = schedule;
    const notification = normaliseAnnouncementNotification(template.notification);
    data.announcements.unshift({ ...template, notification:{ ...notification, emailDeliveryState:'', emailSentAt:'', emailError:'' }, id:`a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, scheduleId:id, date:announcementDateLabel(now), publishedAt:now.toISOString(), postedBy:template.postedBy || data.user?.name || 'Intranet team' });
    schedule.lastPublishedOccurrence = parts.date;
    changed = true;
  }
  return changed;
}
function withAnnouncementAudit(data) {
  if (!Array.isArray(data.announcements)) return;
  const defaultAuthor = data.user?.name || 'Intranet team';
  data.announcements = data.announcements.map(item => {
    const idTimestamp = String(item.id || '').match(/(\d{11,})$/)?.[1];
    const publishedAt = item.publishedAt || (idTimestamp ? new Date(Number(idTimestamp)).toISOString() : new Date().toISOString());
    return { ...item, postedBy:item.postedBy || defaultAuthor, publishedAt };
  });
}
async function save(data) {
  if (!hasArchiveRunToday(data)) {
    const archive = await archiveExpiredEvents(data, dataFile);
    if (archive.archived) console.info(`Archived ${archive.archived} audit trail events in ${archive.files} file(s): ${archive.directory}`);
  }
  const temporary = `${dataFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(temporary, dataFile);
      return;
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 4) {
        await unlink(temporary).catch(() => {});
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}
function policyKey(policy) { return `${policy.id}:${policy.version}:${policy.canonicalUrl}`; }
function requiredPolicies(data) { return (data.policies || []).filter(policy => policy.requiresAcknowledgement !== false); }
function publishedPolicyUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw, 'http://localhost');
    return (raw.startsWith('/') || /^https?:\/\//i.test(raw)) && ['http:', 'https:'].includes(parsed.protocol);
  } catch { return false; }
}
function policyIdentity(req, data) {
  const session = actorFor(req, data);
  if (session) return session;
  if (isAuthenticationConfigured()) return null;
  const user = data.user || {};
  return { id:'local-demo-user', name:user.name || 'Local employee', email:user.email || 'local.employee@si-ware.com', role:user.role || 'EMPLOYEE', demo:true };
}
function acknowledgementStatus(data, employee) {
  const policies = requiredPolicies(data), unpublished = policies.filter(policy => !publishedPolicyUrl(policy.canonicalUrl));
  const key = employee.email.toLowerCase(), views = data.policyReviewViews?.[key] || {};
  const snapshot = policies.map(policy => ({ id:policy.id, title:policy.title, version:policy.version, key:policyKey(policy), documentReady:!unpublished.includes(policy), viewedAt:views[policyKey(policy)] || '' }));
  const acceptance = (data.policyAcknowledgements || []).find(record => record.employee.email.toLowerCase() === key && record.contentVersion === data.policyAcknowledgementContent.version && JSON.stringify(record.policies.map(item => item.key)) === JSON.stringify(snapshot.map(item => item.key)));
  return { employee:{ name:employee.name, email:employee.email, demo:Boolean(employee.demo) }, content:{ ...acknowledgementContentDefault, ...(data.policyAcknowledgementContent || {}) }, policies:snapshot, unpublished:unpublished.map(policy => policy.title), acceptance:acceptance || null };
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf', '.ppt':'application/vnd.ms-powerpoint', '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico':'image/x-icon', '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime' };

// Establish the sign-in boundary before serving the first request.
await dashboard();
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    const protectedDocument = url.pathname === '/' || /\/(?:index|admin|profile|new-hires|recently-joined|apps|announcements|social-media|moments|knowledge-hub|events|news|whistleblower(?:-2)?|employee-voice)\.html$/i.test(url.pathname);
    if (isAuthenticationConfigured() && !sessionFor(req) && ['GET','HEAD'].includes(req.method) && protectedDocument) { res.writeHead(302, { location:'/login.html?returnTo=' + encodeURIComponent(url.pathname) }); return res.end(); }
    const documentRoute = url.pathname.toLowerCase(), requiredPage = intranetRoutePermissions[documentRoute];
    if (['GET','HEAD'].includes(req.method) && (requiredPage || documentRoute === '/admin.html')) {
      const data = await dashboard(), actor = actorFor(req, data), permissions = configuredRoles(data)[actor?.role] || [];
      if (!actor) { res.writeHead(302, { location:'/login.html?returnTo=' + encodeURIComponent(url.pathname) }); return res.end(); }
      const permitted = documentRoute === '/admin.html' ? canOpenAdmin(permissions) : permissions.includes(requiredPage);
      if (!permitted) {
        auditEvent(data, actor, { action:'access.denied', resource:url.pathname, route:url.pathname, outcome:'denial' }); save(data).catch(() => {});
        const next = firstAvailableIntranetPage(permissions)?.path || (canOpenAdmin(permissions) ? '/admin.html' : '/profile.html');
        const denied = await readFile(join(publicDir, 'access-denied.html'), 'utf8');
        res.writeHead(403, { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store' });
        return res.end(req.method === 'HEAD' ? '' : denied.replaceAll('@@RETURN_PATH@@', next));
      }
      const whistleblowerRouteDisabled = (documentRoute === '/whistleblower.html' && data.whistleblowerConfig?.enabled === false) || (documentRoute === '/whistleblower-2.html' && data.whistleblower2Config?.enabled === false);
      if (whistleblowerRouteDisabled) return json(res, 404, { error:'This reporting route is not currently available.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/options') { const data = await dashboard(); return json(res, 200, { google:isGoogleConfigured(), local:localSignInAvailable(data) }); }
    if (req.method === 'GET' && url.pathname === '/api/global-page-content') {
      res.setHeader('cache-control', 'no-store, max-age=0');
      const data = await dashboard();
      return json(res, 200, normaliseGlobalPageContent(data.globalPageContent));
    }
    if (req.method === 'POST' && url.pathname === '/auth/local') {
      const current = await dashboard();
      if (!localSignInAvailable(current)) return json(res, 503, { error:'Local sign-in is disabled for this intranet.' });
      const attemptKey = req.socket.remoteAddress || 'unknown', now = Date.now();
      const prior = localLoginAttempts.get(attemptKey);
      const attempts = prior && now - prior.startedAt < loginWindowMs ? prior : { startedAt:now, count:0 };
      if (attempts.count >= maxLocalAttempts) return json(res, 429, { error:'Too many sign-in attempts. Try again in 15 minutes.' });
      const body = await readBody(req), email = String(body.email || '').trim().toLowerCase(), returnTo = safeReturnTo(body.returnTo);
      if (typeof body.password !== 'string' || Buffer.byteLength(body.password, 'utf8') > 512) return json(res, 401, { error:'The email or password is incorrect.' });
      const localUser = storedUserFor(current, email);
      const environmentAdmin = environmentLocalAdminActive(current) && email === localAdminEmail;
      const valid = environmentAdmin ? isValidLocalAdminPassword(body.password) : localUser?.authType === 'local' && localUser.active !== false && await verifyLocalPassword(body.password, localUser.passwordHash);
      if (!valid) {
        attempts.count += 1; localLoginAttempts.set(attemptKey, attempts);
        return json(res, 401, { error:'The email or password is incorrect.' });
      }
      localLoginAttempts.delete(attemptKey);
      const sessionId = randomUUID(), actor = environmentAdmin
        ? { id:'local-admin', name:localAdminName || 'Local Administrator', email:localAdminEmail, role:'ADMIN', local:true }
        : { id:localUser.id, name:localUser.name || email, email, role:localUser.role, local:true };
      if (!configuredRoles(current)[actor.role]) return json(res, 403, { error:'This account has no active intranet role.' });
      if (localUser && !environmentAdmin) {
        const signedInAt = new Date(now).toISOString();
        localUser.firstSignedInAt ||= signedInAt;
        localUser.lastLoginAt = signedInAt;
      }
      const landing = allowedLanding(current, actor, returnTo);
      sessions.set(sessionId, { actor, expiresAt:now + sessionLifetimeMs }); setCookie(res, sessionId); auditEvent(current, actor, { action:'authentication.login', resource:'local-session', route:landing, outcome:'success' }); await save(current);
      res.setHeader('cache-control', 'no-store');
      return json(res, 200, { ok:true, returnTo:landing });
    }
    if (req.method === 'GET' && url.pathname === '/auth/google') {
      if (!isGoogleConfigured()) return json(res, 503, { error:'Google Workspace SSO is not configured yet.' });
      const state = randomUUID(), origin = process.env.APP_ORIGIN || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
      oauthStates.set(state, { createdAt:Date.now(), returnTo });
      const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      target.search = new URLSearchParams({ client_id:googleClientId, redirect_uri:`${origin}/auth/google/callback`, response_type:'code', scope:'openid email profile', hd:googleWorkspaceDomain, state }).toString();
      res.writeHead(302, { location:target.toString() }); return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/auth/google/callback') {
      const state = url.searchParams.get('state'), stateRecord = oauthStates.get(state), code = url.searchParams.get('code'); oauthStates.delete(state);
      const fail = reason => { res.writeHead(302, { location:`/login.html?error=${reason}&returnTo=${encodeURIComponent(stateRecord?.returnTo || '/')}` }); return res.end(); };
      if (!stateRecord || Date.now() - stateRecord.createdAt > 10 * 60 * 1000) return fail('rejected');
      if (url.searchParams.get('error') === 'access_denied') return fail('cancelled');
      if (!code) return fail('rejected');
      const origin = process.env.APP_ORIGIN || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      let profile;
      try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{ 'content-type':'application/x-www-form-urlencoded' }, body:new URLSearchParams({ code, client_id:googleClientId, client_secret:googleClientSecret, redirect_uri:`${origin}/auth/google/callback`, grant_type:'authorization_code' }) });
        if (!tokenResponse.ok) return fail('rejected');
        const token = await tokenResponse.json(), userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers:{ authorization:`Bearer ${token.access_token}` } });
        if (!userResponse.ok) return fail('unavailable');
        profile = await userResponse.json();
      } catch { return fail('unavailable'); }
      const email = String(profile.email || '').toLowerCase();
      if (!profile.email_verified || !email.endsWith(`@${googleWorkspaceDomain}`)) return fail('account');
      const current = await dashboard();
      let assignedUser = storedUserFor(current, email);
      if (assignedUser?.active === false || assignedUser?.authType === 'local') return fail('account');
      const role = configuredRoles(current)[assignedUser?.role] ? assignedUser.role : (googleAdminEmails.has(email) ? 'ADMIN' : 'EMPLOYEE');
      const signedInAt = new Date().toISOString();
      const avatarUrl = googleProfilePhotoUrl(profile.picture);
      if (!assignedUser) {
        assignedUser = { id:randomUUID(), email, name:profile.name || email, role, avatarUrl, authType:'google', active:true, createdAt:signedInAt, firstSignedInAt:signedInAt, lastLoginAt:signedInAt };
        current.accessUsers.push(assignedUser);
      } else {
        assignedUser.avatarUrl = avatarUrl;
        assignedUser.firstSignedInAt ||= signedInAt;
        assignedUser.lastLoginAt = signedInAt;
      }
      const sessionId = randomUUID(), actor = { id:String(profile.sub), email, name:profile.name || email, role, avatarUrl };
      const landing = allowedLanding(current, actor, stateRecord.returnTo);
      sessions.set(sessionId, { actor, expiresAt:Date.now() + sessionLifetimeMs }); setCookie(res, sessionId); auditEvent(current, actor, { action:'authentication.login', resource:'session', route:landing, outcome:'success' }); await save(current); res.writeHead(302, { location:landing }); return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/auth/logout') {
      const actor = sessionFor(req), sessionId = cookiesFor(req).siware_session;
      if (sessionId) sessions.delete(sessionId);
      setCookie(res, '', 0);
      if (actor) {
        try {
          const data = await dashboard();
          auditEvent(data, actor, { action:'authentication.logout', resource:'session', route:'/', outcome:'success' });
          await save(data);
        } catch (error) { console.error('Could not record sign-out audit event:', error); }
      }
      return json(res, 200, { ok:true });
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      res.setHeader('cache-control', 'no-store');
      const data = await dashboard(), employee = actorFor(req, data);
      return employee ? json(res, 200, { ...employee, permissions:configuredRoles(data)[employee.role] || [] }) : json(res, 401, { error:'Sign in is required to continue.' });
    }
    if (req.method === 'PATCH' && url.pathname === '/api/profile/linkedin') {
      const data = await dashboard(), actor = actorFor(req, data);
      if (!actor) return json(res, 401, { error:'Sign in is required.' });
      const body = await readBody(req), linkedinUrl = linkedInProfileUrl(body.linkedinUrl);
      if (linkedinUrl === null) return json(res, 422, { error:'Use a valid linkedin.com profile URL, or leave the field blank.' });
      const email = String(actor.email || '').trim().toLowerCase();
      const member = data.newMembers.find(item => String(item.companyEmail || '').trim().toLowerCase() === email);
      if (!member) return json(res, 404, { error:'Your Our Team card is not available yet. Ask an administrator to add or sync your directory record.' });
      if (member.linkedinUrl === linkedinUrl) return json(res, 200, { linkedinUrl });
      member.linkedinUrl = linkedinUrl;
      member.intranetOverrides = { ...(member.intranetOverrides || {}), linkedinUrl:true };
      data._version += 1;
      auditEvent(data, actor, { action:'profile.linkedin.updated', resource:'LinkedIn profile', route:'/profile.html', outcome:'success', changes:{ fields:['linkedinUrl'] } });
      await save(data);
      return json(res, 200, { linkedinUrl });
    }
    if (req.method === 'PATCH' && url.pathname === '/api/profile/photo') {
      const data = await dashboard(), actor = actorFor(req, data);
      if (!actor) return json(res, 401, { error:'Sign in is required.' });
      const body = await readBody(req), upload = employeeProfilePhotoUpload(body.dataUrl, body.filename);
      const email = String(actor.email || '').trim().toLowerCase();
      const member = data.newMembers.find(item => String(item.companyEmail || '').trim().toLowerCase() === email);
      if (!member) return json(res, 404, { error:'Your Our Team card is not available yet. Ask an administrator to add or sync your directory record.' });
      const profilePhotoUrl = await saveAdminUpload(upload.dataUrl, `profile-${member.id}`);
      member.profilePhotoUrl = profilePhotoUrl;
      member.profilePhotoFilename = upload.filename;
      member.intranetOverrides = { ...(member.intranetOverrides || {}), profilePhotoUrl:true };
      data._version += 1;
      auditEvent(data, actor, { action:'profile.photo.updated', resource:'Profile photo', route:'/profile.html', outcome:'success', changes:{ fields:['profilePhotoUrl'] } });
      await save(data);
      return json(res, 200, { profilePhotoUrl });
    }
    if (isAuthenticationConfigured() && url.pathname.startsWith('/api/') && !sessionFor(req)) return json(res, 401, { error:'Sign in is required.' });
    if (url.pathname.startsWith('/api/admin/')) {
      const data = await dashboard(), actor = actorFor(req, data);
      if (!can(data, actor, 'admin.access')) return json(res, actor ? 403 : 401, { error:'Admin Panel access is required.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/notifications') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['settings.manage','page.notifications']); if (!actor) return;
      return json(res, 200, await notificationStatus(data));
    }
    if (req.method === 'PATCH' && url.pathname === '/api/admin/notifications') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['settings.manage','page.notifications']); if (!actor) return;
      const body = await readBody(req), appPassword = String(body.appPassword || '').replace(/\s+/g, '');
      if (appPassword && (appPassword.length < 12 || appPassword.length > 160)) return json(res, 422, { error:'Enter a valid Gmail app password.' });
      const secrets = await notificationSecrets();
      if (body.clearAppPassword === true && appPassword) return json(res, 422, { error:'Choose either a new app password or remove the saved one.' });
      if (appPassword && !notificationEncryptionKey) return json(res, 422, { error:'Set NOTIFICATION_SECRET_KEY on the server before saving an app password.' });
      const configured = Boolean(appPassword || (body.clearAppPassword !== true && secrets.gmailAppPassword));
      const emailEnabled = body.emailEnabled === true;
      if (emailEnabled && !notificationEncryptionKey) return json(res, 422, { error:'Set NOTIFICATION_SECRET_KEY on the server before enabling email delivery.' });
      if (emailEnabled && !configured) return json(res, 422, { error:'Save a Gmail app password before enabling email delivery.' });
      const current = notificationSettings(data);
      const rawGroups = Object.hasOwn(body, 'approvedGroups') ? (Array.isArray(body.approvedGroups) ? body.approvedGroups : String(body.approvedGroups || '').split(/[\n,;]/)) : current.approvedGroups;
      const approvedGroups = [...new Set(rawGroups.map(value => emailAddress(value)).filter(Boolean))];
      if (approvedGroups.length > 20 || approvedGroups.some(group => !isEmailAddress(group) || !group.endsWith(`@${googleWorkspaceDomain}`))) return json(res, 422, { error:`Enter up to 20 valid ${googleWorkspaceDomain} Google Group addresses.` });
      const defaultGroup = Object.hasOwn(body, 'defaultGroup') ? emailAddress(body.defaultGroup) : current.defaultGroup;
      if (approvedGroups.length && !defaultGroup) return json(res, 422, { error:'Choose a default Google Group for new announcements.' });
      if (defaultGroup && !approvedGroups.includes(defaultGroup)) return json(res, 422, { error:'The default audience must be one of the approved Google Groups.' });
      const inboundEmailEnabled = typeof body.inboundEmailEnabled === 'boolean' ? body.inboundEmailEnabled : current.inboundEmailEnabled;
      if (inboundEmailEnabled && !approvedGroups.length) return json(res, 422, { error:'Approve at least one Google Group before enabling email import.' });
      const inboundStartedAt = inboundEmailEnabled ? (current.inboundEmailEnabled ? current.inboundStartedAt : new Date().toISOString()) : current.inboundStartedAt;
      if (approvedGroups.length) {
        const subject = String(process.env.GOOGLE_SYNC_SUBJECT || '').trim().toLowerCase();
        if (!isEmailAddress(subject)) return json(res, 422, { error:'Configure the delegated Google Workspace administrator before saving notification groups.' });
        for (const group of approvedGroups) {
          try { await audienceGroupMember(group, subject); }
          catch (error) {
            console.warn(`Google Group validation failed for ${group}: ${error.message}`);
            let message = `Google Group access could not be verified for ${group}.`;
            if (error.service === 'Google authorization') message += ' Check the service account client ID, its domain-wide delegation scopes, and the delegated administrator.';
            else if (error.status === 404) message += ' Check that the group address exists in Google Admin.';
            else if (error.status === 403 || error.status === 401) message += ' Grant the service account the group.member.readonly delegation scope and ensure the delegated administrator can read Groups.';
            else if (error.status === 400) message += ' Check the group address and delegated administrator.';
            else if (error.name === 'TimeoutError' || error.name === 'AbortError') message += ' The Google lookup timed out; try again.';
            else message += ' Check Google Workspace access and try again.';
            return json(res, 422, { error:message });
          }
        }
      }
      if (inboundEmailEnabled) {
        try { await (await inboundEmailClient()).gmailMessageIdsSince(Math.floor(Date.now() / 1000), approvedGroups); }
        catch (error) {
          console.warn('Google Group email import access check failed:', error.message);
          return json(res, 422, { error:`Cannot read ${notificationSender}'s Gmail inbox. Enable the Gmail API, add the gmail.readonly domain-wide delegation scope to the existing service account client ID, and confirm this mailbox is an active Google Workspace account.${error.status ? ` Google returned HTTP ${error.status}.` : ''}` });
        }
      }
      if (body.clearAppPassword === true) { delete secrets.gmailAppPassword; await unlink(notificationSecretsFile).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      if (appPassword) { secrets.gmailAppPassword = encryptNotificationSecret(appPassword); await writeFile(notificationSecretsFile, JSON.stringify(secrets, null, 2), { mode:0o600 }); }
      const inAppEnabled = typeof body.inAppEnabled === 'boolean' ? body.inAppEnabled : current.inAppEnabled;
      const inAppDefaultEnabled = typeof body.inAppDefaultEnabled === 'boolean' ? body.inAppDefaultEnabled : current.inAppDefaultEnabled;
      const emailDefaultEnabled = typeof body.emailDefaultEnabled === 'boolean' ? body.emailDefaultEnabled : current.emailDefaultEnabled;
      data.adminSettings.notificationSettings = { ...current, inAppEnabled, inAppDefaultEnabled, emailEnabled, emailDefaultEnabled, inboundEmailEnabled, inboundStartedAt, approvedGroups, defaultGroup, sender:notificationSender, updatedAt:new Date().toISOString() };
      data._version += 1;
      auditEvent(data, actor, { action:'notifications.settings.updated', resource:'Notification delivery', route:'/admin.html', outcome:'success', changes:{ inAppEnabled, emailEnabled, inboundEmailEnabled, approvedGroups, defaultGroup, appPasswordUpdated:Boolean(appPassword), appPasswordRemoved:body.clearAppPassword === true } });
      await save(data);
      return json(res, 200, await notificationStatus(data));
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/notifications/import') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['settings.manage','page.notifications']); if (!actor) return;
      if (!notificationSettings(data).inboundEmailEnabled) return json(res, 409, { error:'Enable group email import in Notifications first.' });
      const status = await importGroupEmails();
      return json(res, status.lastError ? 502 : 200, status.lastError ? { error:status.lastError } : status);
    }
    if (req.method === 'POST' && url.pathname === '/api/si-voice/chat') {
      const data = await dashboard(), actor = actorFor(req, data);
      if (!actor) return json(res, 401, { error:'Sign in is required.' });
      if (!can(data, actor, 'intranet.whistleblower')) return json(res, 403, { error:'Employee Voice is not available for your account.' });
      if (data.whistleblowerConfig?.enabled === false) return json(res, 404, { error:'Employee Voice is not currently available.' });
      if (!siVoiceApiToken) return json(res, 503, { error:'Employee Voice is not configured on this server.' });
      const body = await readBody(req), message = safeText(body.message);
      if (!message) return json(res, 422, { error:'Enter a message before sending.' });
      try {
        const response = await fetch(siVoiceApiUrl, {
          method:'POST',
          headers:{ 'content-type':'application/json', authorization:`Bearer ${siVoiceApiToken}` },
          body:JSON.stringify({ model:siVoiceModel, messages:[{ role:'user', content:message }], stream:false }),
          signal:AbortSignal.timeout(20_000)
        });
        const responseBody = await response.json().catch(() => null);
        const reply = String(responseBody?.choices?.[0]?.message?.content || '').trim().slice(0, 8_000);
        if (!response.ok || !reply) return json(res, 502, { error:'Employee Voice could not respond right now. Please try again later.' });
        return json(res, 200, { reply });
      } catch {
        return json(res, 502, { error:'Employee Voice could not respond right now. Please try again later.' });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/activity') {
      const data = await dashboard(), actor = actorFor(req, data), body = await readBody(req);
      if (!actor) return json(res, 401, { error:'Sign in is required.' });
      const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
      const accepted = events.filter(event => /^[a-zA-Z0-9-]{16,80}$/.test(String(event.id || '')) && /^[a-z0-9._-]{2,80}$/i.test(String(event.action || '')) && /^[a-z0-9._-]{2,80}$/i.test(String(event.component || '')) && /^\/(?!\/)/.test(String(event.route || ''))).filter(event => activityEvent(data, actor, event, req.socket.remoteAddress || '')).length;
      if (accepted) await save(data);
      return json(res, 202, { accepted });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/summary') {
      const data = await dashboard(), actor = actorFor(req, data);
      if (!canOpenAdmin(configuredRoles(data)[actor?.role])) { auditEvent(data, actor, { action:'access.denied', resource:'admin.summary', route:'/admin.html', outcome:'denial' }); save(data).catch(() => {}); return json(res, actor ? 403 : 401, { error:actor ? 'You do not have permission for the administration workspace.' : 'Sign in is required.' }); }
      const canViewAudit = can(data, actor, 'audit.view') && can(data, actor, 'page.activity');
      const audit = canViewAudit ? data.auditEvents.slice(0, 8) : [], activity = canViewAudit ? data.activityEvents.slice(0, 8) : [];
      return json(res, 200, { version:data._version, counts:{ announcements:(data.announcements || []).filter(item => item.hidden !== true && item.hidden !== 'true').length, people:data.newMembers?.length || 0, apps:data.apps?.length || 0, media:(await mediaInventory(data)).length, audits:canViewAudit ? data.auditEvents.length : 0, activity:canViewAudit ? data.activityEvents.length : 0 }, audit, activity, settings:can(data, actor, 'settings.manage') && can(data, actor, 'page.settings') ? data.adminSettings : null, actor });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/dashboard') {
      const data = await dashboard(), actor = actorFor(req, data);
      if (!canOpenAdmin(configuredRoles(data)[actor?.role])) return json(res, actor ? 403 : 401, { error:actor ? 'Administration access is required.' : 'Sign in is required.' });
      return json(res, 200, await dashboardResponse(data, actor, true));
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/audit') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['audit.view','page.activity']); if (!actor) return;
      const source = auditEventSource(data, url.searchParams.get('category') || 'all');
      const query = safeText(url.searchParams.get('q')).toLowerCase(), outcome = safeText(url.searchParams.get('outcome'));
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1), limit = Math.min(100, Math.max(10, Number(url.searchParams.get('limit')) || 25));
      const filtered = source.filter(event => (!query || JSON.stringify(event).toLowerCase().includes(query)) && (!outcome || event.outcome === outcome));
      const counts = { all:data.auditEvents.length + data.activityEvents.length, page:0, click:0, change:0, access:0, system:0 };
      [...data.auditEvents, ...data.activityEvents].forEach(event => { counts[auditEventType(event)] += 1; });
      return json(res, 200, { records:filtered.slice((page - 1) * limit, page * limit), total:filtered.length, page, pages:Math.max(1, Math.ceil(filtered.length / limit)), counts });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/audit/export') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['audit.view','audit.export','page.activity']); if (!actor) return;
      const source = auditEventSource(data, url.searchParams.get('category') || 'all');
      const query = safeText(url.searchParams.get('q')).toLowerCase();
      const cell = value => { const text = String(value ?? ''); return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`; };
      const rows = source.filter(event => !query || JSON.stringify(event).toLowerCase().includes(query)).map(event => [event.id, event.serverReceivedAt || event.occurredAt, event.category, event.actor?.name || '', event.actor?.email || '', event.action || '', event.route || '', event.metadata?.page || '', event.metadata?.control || '', event.resource || '', JSON.stringify(event.changes?.details || []), event.ip || '', event.outcome || 'reported'].map(cell).join(',')).join('\n');
      auditEvent(data, actor, { action:'audit.export', resource:'audit-events', route:'/admin.html', outcome:'success' }); await save(data);
      res.writeHead(200, { 'content-type':'text/csv; charset=utf-8', 'content-disposition':'attachment; filename="siware-audit.csv"' }); return res.end(`id,when_received,category,user,user_email,action,route,page,control,resource,change_details,ip,outcome\n${rows}`);
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/media') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['media.manage','page.media']); if (!actor) return;
      return json(res, 200, await mediaInventory(data));
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/access') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'access.manage'); if (!actor) return;
      if (!can(data, actor, 'page.users') && !can(data, actor, 'page.roles')) return json(res, 403, { error:'Users or Roles page access is required.' });
      res.setHeader('cache-control', 'no-store');
      return json(res, 200, { users:can(data, actor, 'page.users') ? directoryAccessUsers(data) : data.accessUsers.map(user => ({ role:user.role })), roles:Object.entries(configuredRoles(data)).map(([id, permissions]) => ({ id, permissions })) });
    }
    if ((req.method === 'POST' || req.method === 'PATCH') && url.pathname === '/api/admin/roles') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['access.manage','page.roles']); if (!actor) return;
      const body = await readBody(req), id = String(body.id || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''), permissions = [...new Set(Array.isArray(body.permissions) ? body.permissions.filter(permission => permission !== 'action.edit_save') : [])];
      if (!/^[A-Z][A-Z0-9_]{1,40}$/.test(id) || permissions.some(permission => !Object.values(rolePermissions).flat().includes(permission))) return json(res, 422, { error:'Provide a role name and supported permissions.' });
      const invalidPermissions = rolePermissionError(permissions);
      if (invalidPermissions) return json(res, 422, { error:invalidPermissions });
      const roles = configuredRoles(data), exists = Object.hasOwn(roles, id);
      if (req.method === 'POST' && exists) return json(res, 409, { error:'A role with this name already exists.' });
      if (req.method === 'PATCH' && !exists) return json(res, 404, { error:'This role no longer exists.' });
      if (id === 'ADMIN' && ['admin.access','access.manage','page.users','page.roles'].some(permission => !permissions.includes(permission))) return json(res, 422, { error:'Administrator must retain Admin Panel, Manage users, Users page, and Roles page access.' });
      data.disabledDefaultRoles = data.disabledDefaultRoles.filter(roleId => roleId !== id); data.accessRoles[id] = permissions; data._version += 1; auditEvent(data, actor, { action:exists ? 'access.role.updated' : 'access.role.created', resource:id, route:'/admin.html', outcome:'success', changes:{ permissions } }); await save(data);
      return json(res, 200, { roles:Object.entries(configuredRoles(data)).map(([roleId, rolePermissions]) => ({ id:roleId, permissions:rolePermissions })) });
    }
    if (req.method === 'DELETE' && /^\/api\/admin\/roles\/[A-Z0-9_]+$/.test(url.pathname)) {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['access.manage','page.roles','action.delete']); if (!actor) return;
      const id = url.pathname.split('/').pop();
      if (id === 'ADMIN') return json(res, 422, { error:'Administrator cannot be removed.' });
      if (data.accessUsers.some(user => user.role === id)) return json(res, 422, { error:'Reassign users with this role before removing it.' });
      if (Object.hasOwn(data.accessRoles, id)) delete data.accessRoles[id]; else if (Object.hasOwn(rolePermissions, id)) data.disabledDefaultRoles.push(id); else return json(res, 404, { error:'This role no longer exists.' }); data._version += 1; auditEvent(data, actor, { action:'access.role.deleted', resource:id, route:'/admin.html', outcome:'success' }); await save(data);
      return json(res, 200, { roles:Object.entries(configuredRoles(data)).map(([roleId, rolePermissions]) => ({ id:roleId, permissions:rolePermissions })) });
    }
    if (req.method === 'PATCH' && url.pathname === '/api/admin/access') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['access.manage','page.users']); if (!actor) return;
      const body = await readBody(req), email = String(body.email || '').trim().toLowerCase(), role = String(body.role || ''), environmentAdmin = isLocalAdminConfigured() && email === localAdminEmail;
      if (body.operation === 'import' && !can(data, actor, 'action.import')) return json(res, 403, { error:'Import permission is required to import users.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (!environmentAdmin && !configuredRoles(data)[role])) return json(res, 422, { error:'Provide a valid email address and supported role.' });
      const current = storedUserFor(data, email), authType = environmentAdmin ? 'local' : current?.authType === 'local' ? 'local' : current ? 'google' : body.authType === 'local' ? 'local' : 'google';
      if (current && body.authType && body.authType !== authType) return json(res, 422, { error:'Authentication type cannot be changed after the account is created.' });
      if (environmentAdmin && ((body.role && body.role !== 'ADMIN') || (body.authType && body.authType !== 'local'))) return json(res, 409, { error:'The environment local administrator role and authentication are managed through server settings. You can only change its active status here.' });
      const password = typeof body.password === 'string' ? body.password : '';
      if (environmentAdmin && password) return json(res, 422, { error:'Change the environment local administrator password in the server environment, not here.' });
      if (!environmentAdmin && authType === 'local' && (!current || password)) {
        const passwordError = passwordPolicyError(password, email);
        if (passwordError) return json(res, 422, { error:passwordError });
        if (body.passwordConfirm !== password) return json(res, 422, { error:'The passwords do not match.' });
      }
      if (!environmentAdmin && authType === 'google' && password) return json(res, 422, { error:'Google accounts do not use an intranet password.' });
      const active = body.active !== false && body.active !== 'false';
      const effectiveRole = environmentAdmin ? 'ADMIN' : role;
      if (!isAuthenticationConfigured() && (!active || authType !== 'local' || effectiveRole !== 'ADMIN')) return json(res, 422, { error:'The first local account must be an active administrator so access is not lost.' });
      const accessAdmins = new Set(data.accessUsers.filter(user => user.role === 'ADMIN' && user.active !== false).map(user => user.email));
      googleAdminEmails.forEach(adminEmail => accessAdmins.add(adminEmail));
      if (environmentLocalAdminActive(data)) accessAdmins.add(localAdminEmail);
      const adminCount = accessAdmins.size;
      if ((environmentAdmin || current?.role === 'ADMIN') && (effectiveRole !== 'ADMIN' || !active) && adminCount <= 1) return json(res, 422, { error:'The last administrator cannot be removed, demoted, or deactivated.' });
      const now = new Date().toISOString(), name = environmentAdmin ? localAdminName || 'Local Administrator' : safeText(body.name).slice(0, 80) || current?.name || email;
      const record = current || { id:randomUUID(), email, createdAt:now };
      Object.assign(record, { name, role:effectiveRole, authType, active, updatedAt:now, ...(environmentAdmin ? { source:'environment' } : {}) });
      if (!environmentAdmin && authType === 'local' && password) record.passwordHash = await hashLocalPassword(password);
      if (!current) data.accessUsers.push(record);
      if (authType === 'local') localAccountsConfigured = true;
      if (!active || password) for (const [id, session] of sessions) if (String(session.actor?.email || '').toLowerCase() === email) sessions.delete(id);
      data._version += 1;
      auditEvent(data, actor, { action:current ? 'access.user.updated' : 'access.user.created', resource:email, route:'/admin.html', outcome:'success', changes:{ role:effectiveRole, authType, active, passwordChanged:Boolean(password) } });
      await save(data);
      res.setHeader('cache-control', 'no-store');
      return json(res, 200, { users:directoryAccessUsers(data) });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/defaults') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'content.edit'); if (!actor) return;
      const defaults = JSON.parse(await readFile(adminDefaultsFile, 'utf8'));
      if (Array.isArray(defaults.apps) && Array.isArray(defaults.appsOrder)) {
        const appsById = new Map(defaults.apps.map(app => [app.id, app]));
        defaults.apps = [...defaults.appsOrder.map(id => appsById.get(id)).filter(Boolean), ...defaults.apps.filter(app => !defaults.appsOrder.includes(app.id))];
      }
      return json(res, 200, { defaults:Object.fromEntries(adminDefaultKeys.filter(key => adminContentKeyPages[key]?.some(permission => can(data, actor, permission))).map(key => [key, defaults[key] ?? (key === 'globalPageContent' ? defaultGlobalPageContent : null)])) });
    }
    if (req.method === 'PATCH' && url.pathname === '/api/admin/dashboard') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'content.edit'); if (!actor) return;
      const body = await readBody(req), next = body.data;
      if (!next || typeof next !== 'object' || Array.isArray(next)) return json(res, 422, { error:'A dashboard payload is required.' });
      if (Number(body.version) !== data._version) return json(res, 409, { error:'This content changed elsewhere. Refresh before saving.', version:data._version });
      const permissionCheck = dashboardMutationError(data, actor, next, body.operation);
      if (permissionCheck.error) return json(res, permissionCheck.status, { error:permissionCheck.error });
      if (Object.hasOwn(next, 'sessions')) { const duplicate = duplicateKnowledgeSessionName(next.sessions); if (duplicate) return json(res, 422, { error:`Knowledge Hub session title already exists or is invalid: ${duplicate}. Use a unique title.` }); }
      const changedKeys = permissionCheck.changedKeys;
      const allowedGroups = notificationSettings(data).approvedGroups || [];
      for (const key of ['announcements', 'announcementSchedules', 'announcementTemplates']) {
        if (!changedKeys.includes(key)) continue;
        const previous = new Map((data[key] || []).map(item => [String(item.id), item]));
        for (const item of next[key] || []) {
          if (JSON.stringify(item) === JSON.stringify(previous.get(String(item.id)))) continue;
          if (key === 'announcements') {
            const original = previous.get(String(item.id));
            if (item.source?.type === 'group-email' && original?.source?.type !== 'group-email') return json(res, 422, { error:'Email announcements can only be created by the inbox import.' });
            if (original?.source?.type === 'group-email') {
              const group = original.source.group;
              if (!allowedGroups.includes(group)) return json(res, 422, { error:'Restore the imported email audience in Notifications before publishing it.' });
              item.source = original.source;
              item.notification = { ...normaliseAnnouncementNotification(item.notification), audienceGroup:group, inAppEnabled:true, inAppRecipients:[], emailEnabled:false, to:[group], cc:[], bcc:[], emailDeliveryState:'skipped', emailSentAt:'', emailError:'Original email was already delivered to the Google Group.' };
              if ((original.hidden === true || original.hidden === 'true') && item.hidden !== true && item.hidden !== 'true') {
                const publishedAt = new Date();
                item.publishedAt = publishedAt.toISOString();
                item.date = announcementDateLabel(publishedAt);
              }
            }
          }
          const notification = normaliseAnnouncementNotification(item.notification);
          const group = notification.audienceGroup;
          if (group && !allowedGroups.includes(group)) return json(res, 422, { error:'Choose an approved Google Group in Notifications before publishing this announcement.' });
          if (notification.emailEnabled && group && notificationSettings(data).emailEnabled) {
            if (notification.to.length !== 1 || notification.to[0] !== group) return json(res, 422, { error:'The email To recipient must be the selected Google Group only.' });
          }
        }
      }
      if (changedKeys.includes('newMembers')) {
        const existingById = new Map(data.newMembers.map(member => [String(member.id), member]));
        next.newMembers.forEach(member => {
          const existing = existingById.get(String(member.id));
          if (!existing || String(member.division || '').trim() === String(existing.division || '').trim()) return;
          member.intranetOverrides = { ...(existing.intranetOverrides || {}), ...(member.intranetOverrides || {}), division:true };
        });
      }
      const contentDetails = describeContentChanges(data, next, changedKeys);
      changedKeys.forEach(key => { data[key] = key === 'globalPageContent' ? normaliseGlobalPageContent(next[key]) : next[key]; });
      for (const key of ['announcements', 'announcementSchedules', 'announcementTemplates']) {
        if (changedKeys.includes(key)) data[key] = data[key].map(item => ({ ...item, notification:normaliseAnnouncementNotification(item.notification) }));
      }
      if (changedKeys.includes('settings')) { data.adminSettings.layoutHistory ||= []; data.adminSettings.layoutHistory.unshift({ at:new Date().toISOString(), by:actor.email, settings:data.settings }); data.adminSettings.layoutHistory = data.adminSettings.layoutHistory.slice(0, 12); }
      const changedContent = changedContentLabels(changedKeys);
      withAnnouncementAudit(data); await deliverQueuedAnnouncementEmails(data); data._version += 1; auditEvent(data, actor, { action:changedKeys.includes('settings') ? 'presentation.updated' : 'content.updated', resource:changedContent.join(' · ') || 'No content changes', route:'/admin.html', outcome:'success', changes:{ fields:changedKeys, pages:changedContent, details:contentDetails.details, truncated:contentDetails.truncated } }); await save(data);
      return json(res, 200, await dashboardResponse(await withPolicyModifiedDates(data), actor, true));
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/google-sync') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['settings.manage','page.settings']); if (!actor) return;
      const keyFile = String(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || '').trim(), subject = String(process.env.GOOGLE_SYNC_SUBJECT || '').trim();
      const resources = configuredCalendars(data.adminSettings.googleSync);
      if (!keyFile || !subject) return json(res, 200, { settings:data.adminSettings.googleSync, resources, availableOus:[], connected:false, message:'Set the delegated Google service-account key and GOOGLE_SYNC_SUBJECT on the server to load organizational units.', status:googleSyncStatus });
      try {
        const client = await createWorkspaceClient({ keyFile, subject });
        return json(res, 200, { settings:data.adminSettings.googleSync, resources, availableOus:await client.orgUnits(), connected:true, message:'', status:googleSyncStatus });
      } catch (error) { return json(res, 200, { settings:data.adminSettings.googleSync, resources, availableOus:[], connected:false, message:`Could not load Google organizational units: ${error.message}`, status:googleSyncStatus }); }
    }
    if (req.method === 'PATCH' && url.pathname === '/api/admin/google-sync') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['settings.manage','page.settings']); if (!actor) return;
      const body = await readBody(req), ouPaths = Array.isArray(body.ouPaths) ? [...new Set(body.ouPaths.map(value => String(value).trim()))] : null;
      const calendarIds = Array.isArray(body.calendarIds) ? [...new Set(body.calendarIds.map(value => String(value).trim()))] : null;
      const calendarSources = Array.isArray(body.calendarSources) ? [...new Map(body.calendarSources.map(calendarSource).filter(Boolean).map(calendar => [calendar.id, calendar])).values()] : null;
      if (!ouPaths || !calendarIds || !calendarSources || ouPaths.length > 100 || calendarSources.length > 20 || calendarIds.length > calendarSources.length || ouPaths.some(path => !eligibleEmployeeOu(path)) || calendarIds.some(id => !calendarSources.some(calendar => calendar.id === id))) return json(res, 422, { error:'Choose valid organizational units and calendar email addresses.' });
      const memberSchedule = normalizedSchedule(body.memberSchedule), calendarSchedule = normalizedSchedule(body.calendarSchedule);
      const enabled = memberSchedule.enabled || calendarSchedule.enabled;
      if ((memberSchedule.enabled && !ouPaths.length) || (calendarSchedule.enabled && !calendarIds.length)) return json(res, 422, { error:'Select at least one source for each enabled schedule.' });
      if (ouPaths.length || calendarSources.length) {
        const keyFile = String(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || '').trim(), subject = String(process.env.GOOGLE_SYNC_SUBJECT || '').trim();
        if (!keyFile || !subject) return json(res, 422, { error:'Configure the Google service-account key and delegated administrator email on the server first.' });
        try {
          const client = await createWorkspaceClient({ keyFile, subject });
          const available = new Set((await client.orgUnits()).map(unit => unit.path));
          if (ouPaths.some(path => !available.has(path))) return json(res, 422, { error:'An OU is no longer available. Refresh the list and try again.' });
          const verificationStart = new Date(), verificationEnd = new Date(verificationStart.getTime() + 60000);
          for (const calendar of calendarSources) await client.events(calendar.id, verificationStart, verificationEnd);
        } catch (error) { return json(res, 502, { error:`Could not verify the selected Google sources: ${error.message}` }); }
      }
      const next = { enabled, ouPaths, calendarIds, calendarSources, memberSchedule, calendarSchedule };
      if (JSON.stringify(data.adminSettings.googleSync) !== JSON.stringify(next)) {
        const priorEvents = Array.isArray(data.events) ? data.events.length : 0;
        if (Array.isArray(data.events)) data.events = data.events.filter(event => event.source !== 'google-calendar' || calendarIds.includes(event.sourceCalendarId));
        const removedEvents = priorEvents - (data.events?.length || 0);
        data.adminSettings.googleSync = next;
        data._version += 1;
        auditEvent(data, actor, { action:'workspace.sync.settings.updated', resource:'Google Workspace content sync', route:'/admin.html', changes:{ enabled, ouPaths, calendarIds, removedEvents }, outcome:'success' });
        await save(data);
      }
      if (enabled) { const refresh = setTimeout(() => runGoogleSync({ members:memberSchedule.enabled, calendars:calendarSchedule.enabled }), 1000); refresh.unref(); }
      return json(res, 200, { settings:data.adminSettings.googleSync, status:googleSyncStatus });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/google-sync/run') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['settings.manage','page.settings']); if (!actor) return;
      await runGoogleSync();
      return json(res, 200, { status:googleSyncStatus });
    }
    if (req.method === 'PATCH' && url.pathname === '/api/admin/settings') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['settings.manage','page.settings']); if (!actor) return;
      const body = await readBody(req), auditRetentionDays = Number(body.auditRetentionDays), activityRetentionDays = Number(body.activityRetentionDays);
      if (auditRetentionDays !== 90 || activityRetentionDays !== 90) return json(res, 422, { error:'Audit and activity retention are fixed at 90 days. Older records are archived automatically.' });
      return json(res, 200, data.adminSettings);
    }
    if (req.method === 'POST' && url.pathname === '/api/policy-acknowledgement/viewed') {
      const data = await dashboard(), employee = policyIdentity(req, data), body = await readBody(req); if (!employee) return json(res, 401, { error:'Sign in with Google Workspace to continue.' });
      if (!can(data, employee, 'intranet.newsi')) return json(res, 403, { error:'New Si-Warians page access is required.' });
      const policy = requiredPolicies(data).find(item => item.id === body.policyId && publishedPolicyUrl(item.canonicalUrl)); if (!policy) return json(res, 422, { error:'That policy document is not ready for acknowledgement.' });
      data.policyReviewViews ||= {}; const email = employee.email.toLowerCase(); data.policyReviewViews[email] ||= {}; data.policyReviewViews[email][policyKey(policy)] = new Date().toISOString(); await save(data); return json(res, 200, acknowledgementStatus(data, employee));
    }
    if (req.method === 'GET' && url.pathname === '/api/policy-acknowledgement') { const data = await dashboard(), employee = policyIdentity(req, data); return !employee ? json(res, 401, { error:'Sign in with Google Workspace to continue.' }) : !can(data, employee, 'intranet.newsi') ? json(res, 403, { error:'New Si-Warians page access is required.' }) : json(res, 200, acknowledgementStatus(data, employee)); }
    if (req.method === 'POST' && url.pathname === '/api/policy-acknowledgement') {
      const data = await dashboard(), employee = policyIdentity(req, data), body = await readBody(req); if (!employee) return json(res, 401, { error:'Sign in with Google Workspace to continue.' });
      if (!can(data, employee, 'intranet.newsi')) return json(res, 403, { error:'New Si-Warians page access is required.' });
      const status = acknowledgementStatus(data, employee), statement = status.content.confirmationLabel;
      if (body.statement !== statement) return json(res, 422, { error:'The required confirmation statement was not received.' });
      if (status.unpublished.length || status.policies.some(policy => !policy.viewedAt)) return json(res, 422, { error:'Open every required policy document before confirming.' });
      if (!status.acceptance) { data.policyAcknowledgements ||= []; data.policyAcknowledgements.unshift({ id:`ack-${Date.now()}`, employee:{ id:employee.id, name:employee.name, email:employee.email }, statement, contentVersion:data.policyAcknowledgementContent.version, acceptedAt:new Date().toISOString(), policies:status.policies.map(policy => ({ id:policy.id, title:policy.title, version:policy.version, key:policy.key, viewedAt:policy.viewedAt })) }); await save(data); }
      return json(res, 200, acknowledgementStatus(data, employee));
    }
    if (req.method === 'GET' && url.pathname === '/api/policy-acknowledgements') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['admin.access','audit.view','page.activity']);
      if (!actor) return;
      const query = String(url.searchParams.get('q') || '').trim().toLowerCase();
      const limit = Math.min(100, Math.max(10, Number(url.searchParams.get('limit')) || 25));
      const requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const matching = (data.policyAcknowledgements || []).filter(record => !query || `${record.employee.name} ${record.employee.email}`.toLowerCase().includes(query));
      const total = matching.length, pages = Math.max(1, Math.ceil(total / limit)), page = Math.min(requestedPage, pages);
      const records = matching.slice((page - 1) * limit, page * limit);
      return json(res, 200, { records, total, page, pages, limit });
    }
    if (req.method === 'POST' && url.pathname === '/api/security-awareness-acknowledgement') {
      const data = await dashboard(), employee = policyIdentity(req, data);
      if (!employee) return json(res, 401, { error:'Sign in with Google Workspace to continue.' });
      if (!can(data, employee, 'intranet.newsi')) return json(res, 403, { error:'New Si-Warians page access is required.' });
      data.securityAwarenessAcknowledgements ||= [];
      const email = employee.email.toLowerCase();
      let completion = data.securityAwarenessAcknowledgements.find(record => record.employee?.email?.toLowerCase() === email);
      if (!completion) {
        completion = { id:`security-awareness-${Date.now()}`, employee:{ id:employee.id, name:employee.name, email:employee.email }, completedAt:new Date().toISOString(), method:'Completed embedded Security Awareness Training video' };
        data.securityAwarenessAcknowledgements.unshift(completion);
        await save(data);
      }
      return json(res, 200, { recorded:true, completedAt:completion.completedAt });
    }
    if (req.method === 'GET' && url.pathname === '/api/security-awareness-acknowledgement') {
      const data = await dashboard(), employee = policyIdentity(req, data);
      if (!employee) return json(res, 401, { error:'Sign in to view your training status.' });
      if (!can(data, employee, 'intranet.newsi')) return json(res, 403, { error:'New Si-Warians page access is required.' });
      const email = employee.email.toLowerCase();
      const completion = (data.securityAwarenessAcknowledgements || []).find(record => record.employee?.email?.toLowerCase() === email);
      return json(res, 200, { recorded:Boolean(completion), completedAt:completion?.completedAt || null });
    }
    if (req.method === 'POST' && url.pathname === '/api/company-portal-training-acknowledgement') {
      const data = await dashboard(), employee = policyIdentity(req, data);
      if (!employee) return json(res, 401, { error:'Sign in with Google Workspace to continue.' });
      if (!can(data, employee, 'intranet.newsi')) return json(res, 403, { error:'New Si-Warians page access is required.' });
      data.companyPortalTrainingAcknowledgements ||= [];
      const email = employee.email.toLowerCase();
      let completion = data.companyPortalTrainingAcknowledgements.find(record => record.employee?.email?.toLowerCase() === email);
      if (!completion) {
        completion = { id:`company-portal-training-${Date.now()}`, employee:{ id:employee.id, name:employee.name, email:employee.email }, completedAt:new Date().toISOString(), method:'Started embedded Company Portal Training video or opened its official video link' };
        data.companyPortalTrainingAcknowledgements.unshift(completion);
        await save(data);
      }
      return json(res, 200, { recorded:true, completedAt:completion.completedAt });
    }
    if (req.method === 'GET' && url.pathname === '/api/company-portal-training-acknowledgement') {
      const data = await dashboard(), employee = policyIdentity(req, data);
      if (!employee) return json(res, 401, { error:'Sign in to view your training status.' });
      if (!can(data, employee, 'intranet.newsi')) return json(res, 403, { error:'New Si-Warians page access is required.' });
      const email = employee.email.toLowerCase();
      const completion = (data.companyPortalTrainingAcknowledgements || []).find(record => record.employee?.email?.toLowerCase() === email);
      return json(res, 200, { recorded:Boolean(completion), completedAt:completion?.completedAt || null });
    }
    if (req.method === 'GET' && url.pathname === '/api/compliance-acknowledgements') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['admin.access','audit.view','page.compliance']);
      if (!actor) return;
      const policy = [...(data.policyAcknowledgements || [])].sort((a, b) => Date.parse(b.acceptedAt) - Date.parse(a.acceptedAt));
      const security = [...(data.securityAwarenessAcknowledgements || [])].sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
      return json(res, 200, { policy, security });
    }
    if (req.method === 'GET' && url.pathname === '/api/events/details') {
      res.setHeader('cache-control', 'no-store');
      const data = await dashboard(), actor = actorFor(req, data);
      if (!actor) return json(res, 401, { error:'Sign in is required.' });
      const details = eventPrivateDetails(data, actor, url.searchParams.get('id'));
      if (!details) return json(res, 404, { error:'Event not found.' });
      auditEvent(data, actor, { action:'event.private_details.requested', resource:'Events & key dates', route:'/api/events/details', outcome:details.authorised ? 'success' : 'denial' });
      save(data).catch(() => {});
      return json(res, 200, details);
    }
    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      res.setHeader('cache-control', 'no-store, max-age=0');
      const data = await dashboard(), actor = actorFor(req, data);
      if (isAuthenticationConfigured() && !actor) return json(res, 401, { error:'Sign in is required.' });
      return json(res, 200, await dashboardResponse(data, actor));
    }
    if (req.method === 'GET' && /^\/api\/directory-photo\/[a-zA-Z0-9_-]{16,80}$/.test(url.pathname)) {
      const employee = await requireAuthenticatedEmployee(req, res, 'intranet.people'); if (!employee) return;
      const data = await dashboard(), memberId = url.pathname.split('/').pop();
      const member = data.newMembers?.find(item => String(item.id) === memberId && item.googleUserId);
      if (!member) return json(res, 404, { error:'Profile photo is unavailable.' });
      const keyFile = String(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || '').trim(), subject = String(process.env.GOOGLE_SYNC_SUBJECT || '').trim();
      if (!keyFile || !subject) return json(res, 503, { error:'Google Directory photo access is not configured.' });
      try {
        const photo = await (await createWorkspaceClient({ keyFile, subject })).photo(member.googleUserId);
        const mimeType = ['image/jpeg', 'image/png', 'image/webp'].includes(photo.mimeType) ? photo.mimeType : 'image/jpeg';
        const image = Buffer.from(String(photo.photoData || ''), 'base64');
        if (!image.length || image.length > 5 * 1024 * 1024) return json(res, 404, { error:'Profile photo is unavailable.' });
        res.writeHead(200, { 'content-type':mimeType, 'cache-control':'private, no-store', 'x-content-type-options':'nosniff' }); res.end(image);
      } catch { return json(res, 404, { error:'Profile photo is unavailable.' }); }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/youtube/latest') { if (!await requireAuthenticatedEmployee(req, res, 'intranet.social')) return; return json(res, 200, await latestYouTubeVideos()); }
    if (req.method === 'GET' && url.pathname === '/api/company-news') { if (!await requireAuthenticatedEmployee(req, res, 'intranet.news')) return; return json(res, 200, await latestCompanyNews()); }
    if (req.method === 'GET' && url.pathname === '/api/search') {
      const employee = await requireAuthenticatedEmployee(req, res); if (!employee) return;
      const term = (url.searchParams.get('q') || '').trim().toLowerCase();
      if (!term) return json(res, 200, []);
      const data = await dashboard();
      const sources = [
        ['intranet.newsi', 'Policy', 'policies', item => `${item.title} ${item.summary} ${item.owner} ${item.audience}`, item => item.canonicalUrl],
        ['intranet.home', 'Person', 'people', item => `${item.name} ${item.detail}`, item => item.url],
        ['intranet.home', 'Form', 'forms', item => `${item.title} ${item.detail}`, item => item.url],
        ['intranet.home', 'FAQ', 'faqs', item => `${item.title} ${item.detail}`, item => item.url],
        ['intranet.home', 'Service request', 'serviceRequests', item => `${item.title} ${item.detail}`, item => item.url],
        ['intranet.people', 'Colleague', 'newMembers', item => `${item.name} ${item.role} ${item.team} ${item.department} ${item.division} ${item.employmentType} ${item.directManager}`, () => '/recently-joined.html'],
        ['intranet.knowledge', 'Knowledge', 'sessions', item => `${item.title} ${item.presenter.name} ${item.category}`, () => '/knowledge-hub.html'],
        ['intranet.apps', 'App', 'apps', item => `${item.name} ${item.caption}`, item => item.url]
      ];
      const results = sources.filter(([permission]) => can(data, employee, permission)).flatMap(([, type, key, text, href]) => (data[key] || []).filter(item => text(item).toLowerCase().includes(term)).map(item => ({ id: item.id, type, title: item.title || item.name, detail: item.summary || item.detail || item.caption || item.category, href: href(item) }))).slice(0, 12);
      const documentMatches = can(data, employee, 'intranet.newsi') ? await findInPolicyDocuments(data.policies, term) : [];
      documentMatches.slice(0, Math.max(0, 12 - results.length)).forEach(match => results.push({ id:`${match.url}-${match.page}`, type:'Document', title:match.title, detail:`Page ${match.page}: ${match.snippet}`, href:`/new-hires.html#policies` }));
      return json(res, 200, results);
    }
    if (req.method === 'GET' && url.pathname === '/api/documents/search') {
      if (!await requireAuthenticatedEmployee(req, res, 'intranet.newsi')) return;
      const query = (url.searchParams.get('q') || '').trim();
      if (!query) return json(res, 200, []);
      const data = await dashboard(); return json(res, 200, await findPolicyOccurrences(data.policies, query));
    }
    if (req.method === 'GET' && url.pathname === '/api/documents/highlights') {
      if (!await requireAuthenticatedEmployee(req, res, 'intranet.newsi')) return;
      const page = Number(url.searchParams.get('page')); return json(res, 200, await documentHighlights(url.searchParams.get('url'), page, url.searchParams.get('q') || ''));
    }
    if (req.method === 'GET' && url.pathname === '/api/documents/info') {
      if (!await requireAuthenticatedEmployee(req, res, 'intranet.newsi')) return;
      const file = uploadedPdfPath(url.searchParams.get('url'));
      if (!file) return json(res, 404, { error: 'Document not found' });
      try {
        const { stdout } = await execFileAsync('pdfinfo', [file], { maxBuffer: 1024 * 1024 });
        return json(res, 200, { pages: Math.max(1, Math.min(Number(/Pages:\s+(\d+)/.exec(stdout)?.[1] || 1), 80)) });
      } catch { return json(res, 500, { error: 'Unable to read document information' }); }
    }
    if (req.method === 'GET' && url.pathname === '/api/documents/page') {
      if (!await requireAuthenticatedEmployee(req, res, 'intranet.newsi')) return;
      const file = uploadedPdfPath(url.searchParams.get('url')), page = Number(url.searchParams.get('page'));
      if (!file || !Number.isInteger(page) || page < 1) return json(res, 404, { error: 'Document page not found' });
      const output = join(uploadsDir, `.preview-${Date.now()}-${page}`), image = `${output}.png`;
      try { await execFileAsync('pdftoppm', ['-f', String(page), '-l', String(page), '-scale-to', '1800', '-png', '-singlefile', file, output]); const content = await readFile(image); res.writeHead(200, { 'content-type':'image/png', 'cache-control':'private, max-age=300' }); res.end(content); } finally { await unlink(image).catch(() => {}); }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/uploads') {
      const data = await dashboard(), actor = requireEveryPermission(req, res, data, ['admin.access','media.manage']); if (!actor) return;
      if (req.headers['x-upload-binary'] === '1') {
        const filename = decodeURIComponent(String(req.headers['x-upload-filename'] || 'upload'));
        const uploaded = await saveAdminBinaryUpload(req, filename, req.headers['content-type']); auditEvent(data, actor, { action:'media.uploaded', resource:uploaded, route:'/admin.html', outcome:'success' }); await save(data); return json(res, 201, { url: uploaded });
      }
      const item = await readBody(req);
      const uploaded = await saveAdminUpload(item.dataUrl, item.filename); auditEvent(data, actor, { action:'media.uploaded', resource:uploaded, route:'/admin.html', outcome:'success' }); await save(data); return json(res, 201, { url: uploaded });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    if (url.pathname.startsWith('/uploads/')) {
      if (isAuthenticationConfigured() && !actorFor(req, await dashboard())) return json(res, 401, { error:'Sign in is required.' });
      const uploadName = url.pathname.slice('/uploads/'.length);
      const uploadFile = normalize(join(uploadsDir, uploadName));
      if (relative(uploadsDir, uploadFile).startsWith('..')) return json(res, 403, { error: 'Forbidden' });
      const headers = { 'content-type': types[extname(uploadFile)] || 'application/octet-stream' };
      if (url.searchParams.get('download') === '1') headers['content-disposition'] = `attachment; filename="${uploadName.replace(/[^a-z0-9._-]/gi, '-') || 'download'}"`;
      await access(uploadFile); res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end(); createReadStream(uploadFile).pipe(res); return;
    }
    const requested = url.pathname === '/' ? '/index.html' : url.pathname === '/employee-voice.html' ? '/Si-Voice - Anonymous Employee Suggestion and Complaints Bot-.html' : url.pathname;
    const filename = normalize(join(publicDir, requested));
    if (!filename.startsWith(publicDir)) return json(res, 403, { error: 'Forbidden' });
    await access(filename); const contentType = types[extname(filename)] || 'application/octet-stream';
    if (req.method === 'HEAD') { res.writeHead(200, { 'content-type':contentType, 'cache-control':'no-store' }); return res.end(); }
    if (extname(filename) === '.html') {
      const document = await readFile(filename, 'utf8');
      const hasSharedDedicatedHeader = /<body\b[^>]*\bclass="[^"]*\b(?:destination-page|news-page-body|policy-page)\b/.test(document);
      const destinationStyles = hasSharedDedicatedHeader ? '<link rel="stylesheet" href="/dedicated-standard.css" /><link rel="stylesheet" href="/header-search.css?v=20261017-white-brand" /><link rel="stylesheet" href="/shared-footer.css" />' : '';
      const profileCompletionAssets = requested === '/index.html' ? '<link rel="stylesheet" href="/profile-completion.css?v=20261024-home-profile-quality" /><script type="module" src="/profile-completion.js"></script>' : '';
      const themeBootstrap = `<script>try{const theme=localStorage.getItem('siware-theme-preference')==='dark'?'dark':'light',root=document.documentElement;root.classList.toggle('dark',theme==='dark');root.dataset.theme=theme;root.style.colorScheme=theme}catch(_){}</script>${destinationStyles}${profileCompletionAssets}<script src="/activity.js" defer></script>`;
      res.writeHead(200, { 'content-type':contentType, 'cache-control':'no-store' }); return res.end(document.replace(/<head(\s[^>]*)?>/i, `$&${themeBootstrap}`));
    }
    res.writeHead(200, { 'content-type':contentType, 'cache-control':'no-store' }); createReadStream(filename).pipe(res);
  } catch (error) {
    if (error.code === 'ENOENT') return json(res, 404, { error: 'Not found' });
    console.error(error); return json(res, error.statusCode || 500, { error: error.message || 'Server error' });
  }
}).listen(port, () => console.log(`Si-Ware intranet is running at http://localhost:${port}`));

// Keep schedules independent from browser activity. `dashboard()` only writes when
// a schedule is actually due, and its occurrence marker prevents duplicates.
const announcementScheduleTimer = setInterval(() => { dashboard().catch(error => console.error('Announcement scheduler failed', error)); }, 60_000);
announcementScheduleTimer.unref();
const inboundEmailTimer = setInterval(() => { importGroupEmails().catch(error => console.error('Group email import timer failed', error)); }, 2 * 60_000);
inboundEmailTimer.unref();
const initialInboundEmailCheck = setTimeout(() => { importGroupEmails().catch(error => console.error('Initial group email import failed', error)); }, 15_000);
initialInboundEmailCheck.unref();

let googleSyncRunning = false;
runGoogleSync = async ({ members = true, calendars = true } = {}) => {
  if (googleSyncRunning) return googleSyncStatus;
  googleSyncRunning = true;
  try {
    await dashboard();
    const sourceSnapshot = await readFile(dataFile, 'utf8');
    const data = JSON.parse(sourceSnapshot), savedSettings = data.adminSettings?.googleSync || defaultGoogleSyncSettings();
    const settings = { ...savedSettings, memberSchedule:normalizedSchedule(savedSettings.memberSchedule || { enabled:savedSettings.enabled }), calendarSchedule:normalizedSchedule(savedSettings.calendarSchedule || { enabled:savedSettings.enabled }) };
    if (!settings.enabled || (!members && !calendars)) return googleSyncStatus;
    const syncBaseline = {
      newMembers: JSON.stringify(data.newMembers || []),
      events: JSON.stringify(data.events || []),
      settings: JSON.stringify(settings)
    };
    googleSyncStatus.lastAttemptAt = new Date().toISOString();
    const selectedCalendars = configuredCalendars(settings).filter(calendar => settings.calendarIds.includes(calendar.id));
    const config = workspaceSyncConfig({ ...process.env, GOOGLE_RECENTLY_JOINED_OU:'', GOOGLE_RECENTLY_JOINED_OUS:members ? settings.ouPaths.join(',') : '', GOOGLE_CALENDAR_RESOURCES:calendars ? selectedCalendars.map(calendar => `${calendar.label}|${calendar.id}`).join(',') : '' });
    const client = await createWorkspaceClient(config);
    const result = await syncWorkspaceContent(data, config, client);
    if (result.changed) {
      let target = data;
      if (await readFile(dataFile, 'utf8') !== sourceSnapshot) {
        const latest = JSON.parse(await readFile(dataFile, 'utf8'));
        const relevantContentChanged = JSON.stringify(latest.newMembers || []) !== syncBaseline.newMembers
          || JSON.stringify(latest.events || []) !== syncBaseline.events
          || JSON.stringify(latest.adminSettings?.googleSync || defaultGoogleSyncSettings()) !== syncBaseline.settings;
        if (relevantContentChanged) {
          googleSyncStatus.lastError = 'Recently Joined, Events, or sync settings changed during sync. The next run will retry safely.';
          console.info('Google Workspace sync deferred because relevant intranet content changed during the Google request.');
          return googleSyncStatus;
        }
        // Preserve audit/activity and unrelated page changes written while Google responded.
        latest.newMembers = data.newMembers;
        latest.events = data.events;
        target = latest;
      }
      target._version += 1;
      auditEvent(target, null, { action:'workspace.content.synced', resource:'Recently Joined / Events & key dates', route:'/system/google-workspace-sync', changes:{ members:result.members, calendars:result.calendars }, outcome:'success' });
      await save(target);
    }
    googleSyncStatus.membersCreated = result.members.created;
    googleSyncStatus.membersUpdated = result.members.updated;
    googleSyncStatus.membersRemoved = result.members.removed;
    googleSyncStatus.calendarEvents = result.calendars.reduce((sum, calendar) => sum + calendar.count, 0);
    googleSyncStatus.lastError = result.errors.join('; ');
    if (!result.errors.length) googleSyncStatus.lastSuccessAt = new Date().toISOString();
    if (result.errors.length) console.error('Google Workspace sync completed with errors:', googleSyncStatus.lastError);
    else console.info(`Google Workspace sync completed: ${result.members.created} new members, ${result.members.updated} updated members, ${result.members.removed} removed members, ${googleSyncStatus.calendarEvents} calendar events.`);
  } catch (error) {
    googleSyncStatus.lastError = error.message;
    console.error('Google Workspace sync failed:', error.message);
  } finally { googleSyncRunning = false; }
  return googleSyncStatus;
};
const initialGoogleSync = setTimeout(() => runGoogleSync(), 10_000);
initialGoogleSync.unref();
const googleSyncTimer = setInterval(async () => {
  const data = await dashboard(), settings = data.adminSettings?.googleSync || defaultGoogleSyncSettings();
  const memberSchedule = normalizedSchedule(settings.memberSchedule || { enabled:settings.enabled }), calendarSchedule = normalizedSchedule(settings.calendarSchedule || { enabled:settings.enabled });
  const members = syncDue(memberSchedule, 'members'), calendars = syncDue(calendarSchedule, 'calendars');
  if (members || calendars) await runGoogleSync({ members, calendars });
}, 60_000);
googleSyncTimer.unref();
