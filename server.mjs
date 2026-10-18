import { createServer } from 'node:http';
import { readFile, writeFile, access, copyFile, mkdir, unlink, stat, rename, readdir } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { extname, join, normalize, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 8080);
const publicDir = join(process.cwd(), 'public');
const uploadsDir = join(process.cwd(), 'data', 'uploads');
const dataFile = process.env.DATA_FILE || join(process.cwd(), 'data', 'intranet.json');
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
const sessions = new Map(), oauthStates = new Map();
const acknowledgementContentDefault = { version:1, actionTitle:'Action required: acknowledge Si-Ware Policies', instructionText:'Before continuing, carefully review the mandatory policies below and record your acknowledgement in place of the former email reply.', beforeHeading:'Why this matters', beforeText:'Please read the mandatory Si-Ware Information Security Policy carefully. It covers information-handling policies including Computer Acceptable Use, Password, PDA/Smartphone and Remote Access, together with security awareness for your laptop, PC and mobile devices, physical security, virus protection, spyware/malware and social engineering/phishing. All Si-Ware users must know and adhere to these requirements. Confirmation is mandatory under Si-Ware security regulations.', confirmationLabel:'I confirm that I have read and accepted Si-Ware Policies.', confirmationHelp:'This records the current policy versions and confirmation time.', acceptedTitle:'Policies acknowledged', afterText:'Your acknowledgement has been recorded for the current policy versions.' };
const employmentTypes = ['Full Time', 'Part Time', 'Summer Intern', 'Graduate Intern'];
const execFileAsync = promisify(execFile);
let youtubeCache = { expiresAt: 0, payload: null }, companyNewsCache = { expiresAt: 0, payload: null }, companyNewsRefresh = null;
const json = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
const readBody = req => new Promise((resolve, reject) => { let value = '', size = 0, finished = false; req.on('data', chunk => { size += chunk.length; if (size > 70 * 1024 * 1024) { finished = true; reject(new Error('Request body is too large')); req.destroy(); return; } if (!finished) value += chunk; }); req.on('end', () => { if (finished) return; try { resolve(JSON.parse(value || '{}')); } catch { reject(new Error('Invalid JSON')); } }); });
const cookiesFor = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(value => value.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
const sessionFor = req => sessions.get(cookiesFor(req).siware_session);
const isGoogleConfigured = () => Boolean(googleClientId && googleClientSecret);
const isAdmin = req => sessionFor(req)?.role === 'ADMIN' || (!isGoogleConfigured() && req.headers['x-demo-role'] === 'ADMIN');
const setCookie = (res, value, maxAge = 28800) => res.setHeader('set-cookie', `siware_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.SECURE_COOKIES === 'true' ? '; Secure' : ''}`);
const rolePermissions = {
  EMPLOYEE: [],
  CONTENT_EDITOR: ['content.edit', 'content.publish', 'media.manage'],
  AUDIT_VIEWER: ['audit.view'],
  ADMIN: ['content.edit', 'content.publish', 'media.manage', 'access.manage', 'audit.view', 'audit.export', 'settings.manage']
};
const safeText = value => String(value || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 280);
const adminDefaultKeys = ['apps','announcements','socialLinks','moments','momentsPageContent','sessions','knowledgePageContent','events','whistleblowerConfig','newMembers','recentlyJoinedPageContent','policies','firstWeekChecklist','supportPortals','policyAcknowledgementContent','newSiPageContent','settings'];
const contentChangeLabels = {
  user: 'Intranet profile',
  apps: 'Main Apps · app links',
  announcements: 'Announcements',
  socialLinks: 'Social Media · channels',
  moments: 'Moments · cards',
  momentsPageContent: 'Moments · page text',
  sessions: 'Knowledge Hub · sessions',
  knowledgePageContent: 'Knowledge Hub · page text',
  events: 'Events & key dates',
  whistleblowerConfig: 'Whistleblower · guidance',
  newMembers: 'Recently Joined · colleagues',
  recentlyJoinedPageContent: 'Recently Joined · page text',
  policies: 'New Si-Warians · policies',
  firstWeekChecklist: 'New Si-Warians · first-week checklist',
  supportPortals: 'New Si-Warians · support portals',
  policyAcknowledgementContent: 'New Si-Warians · acknowledgement',
  newSiPageContent: 'New Si-Warians · page text',
  settings: 'Appearance'
};
const changedContentLabels = keys => [...new Set(keys.map(key => contentChangeLabels[key] || key))];
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
const actorFor = (req, data) => {
  const session = sessionFor(req);
  if (session) return session;
  // Local development remains available only when no identity provider has been configured.
  if (!isGoogleConfigured() && req.headers['x-demo-role'] === 'ADMIN') return { id:'local-admin', name:data.user?.name || 'Local administrator', email:'local.admin@si-ware.com', role:'ADMIN', demo:true };
  if (!isGoogleConfigured()) return { id:'local-demo-user', name:data.user?.name || 'Local employee', email:data.user?.email || 'local.employee@si-ware.com', role:rolePermissions[data.user?.role] ? data.user.role : 'EMPLOYEE', demo:true };
  return null;
};
const can = (actor, permission) => Boolean(actor && rolePermissions[actor.role]?.includes(permission));
function requirePermission(req, res, data, permission) {
  const actor = actorFor(req, data);
  if (!can(actor, permission)) { auditEvent(data, actor, { action:'access.denied', resource:permission, route:new URL(req.url, 'http://localhost').pathname, outcome:'denial' }); save(data).catch(() => {}); json(res, actor ? 403 : 401, { error: actor ? 'You do not have permission for this action.' : 'Sign in is required.' }); return null; }
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
  data.auditEvents = data.auditEvents.slice(0, 20000);
}
function activityEvent(data, actor, event) {
  data.activityEvents ||= [];
  if (data.activityEvents.some(entry => entry.id === event.id)) return false;
  data.activityEvents.unshift({ id:event.id, category:'activity', occurredAt:event.occurredAt, serverReceivedAt:new Date().toISOString(), actor:{ id:actor.id, name:safeText(actor.name), role:actor.role }, action:safeText(event.action), component:safeText(event.component), route:safeText(event.route).replace(/\?.*/, ''), metadata:redact(event.metadata || {}) });
  data.activityEvents = data.activityEvents.slice(0, 20000);
  return true;
}
const initialsFor = name => String(name || '').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
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
async function saveMemberPhoto(dataUrl, id) {
  if (!dataUrl) return '';
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new Error('Upload a PNG, JPEG, WebP or GIF image');
  const content = Buffer.from(match[2], 'base64');
  if (!content.length || content.length > 2 * 1024 * 1024) throw new Error('Photo must be no larger than 2 MB');
  const extension = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' }[match[1]];
  const filename = `member-${id}.${extension}`;
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(join(uploadsDir, filename), content);
  return `/uploads/${filename}`;
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
  'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif',
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
  try {
    const data = JSON.parse(await readFile(dataFile, 'utf8'));
    let changed = false;
    for (const key of ['newMembers', 'policies', 'people', 'forms', 'faqs', 'serviceRequests', 'supportPortals', 'firstWeekChecklist']) {
      if (!Array.isArray(data[key])) { data[key] = seed[key]; changed = true; }
    }
    const socialLinks = { ...(seed.socialLinks || {}), ...(data.socialLinks || {}) };
    if (JSON.stringify(data.socialLinks || {}) !== JSON.stringify(socialLinks)) { data.socialLinks = socialLinks; changed = true; }
    const whistleblowerConfig = { ...(seed.whistleblowerConfig || {}), ...(data.whistleblowerConfig || {}) };
    if (JSON.stringify(data.whistleblowerConfig || {}) !== JSON.stringify(whistleblowerConfig)) { data.whistleblowerConfig = whistleblowerConfig; changed = true; }
    const acknowledgementContent = data.policyAcknowledgementContent || {}, hydratedAcknowledgementContent = { ...acknowledgementContentDefault, ...acknowledgementContent };
    if (JSON.stringify(acknowledgementContent) !== JSON.stringify(hydratedAcknowledgementContent)) { data.policyAcknowledgementContent = hydratedAcknowledgementContent; changed = true; }
    const newSiPageContent = { ...(seed.newSiPageContent || {}), ...(adminDefaults.newSiPageContent || {}), ...(data.newSiPageContent || {}) };
    if (JSON.stringify(data.newSiPageContent || {}) !== JSON.stringify(newSiPageContent)) { data.newSiPageContent = newSiPageContent; changed = true; }
    const seededMembers = new Map(seed.newMembers.map(member => [member.id, member]));
    const seededPolicies = new Map((seed.policies || []).map(policy => [policy.id, policy]));
    if (data.newMembers.some(member => !member.directManager || !member.employmentType || !member.department || !member.division)) {
      data.newMembers = data.newMembers.map(member => ({
        ...member,
        directManager: member.directManager || seededMembers.get(member.id)?.directManager || 'To be confirmed',
        employmentType: employmentTypes.includes(member.employmentType) ? member.employmentType : 'Full Time',
        department: member.department || member.team || 'To be confirmed',
        division: member.division || member.team || 'To be confirmed'
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
    data.adminSettings ||= { auditRetentionDays:365, activityRetentionDays:90, layoutHistory:[] };
    if (changed) await save(data);
    return withPolicyModifiedDates(data);
  } catch {
    await copyFile(seedFile, dataFile);
    return withPolicyModifiedDates(seed);
  }
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
  const temporary = `${dataFile}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2));
  await rename(temporary, dataFile);
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
  const session = sessionFor(req);
  if (session) return session;
  if (isGoogleConfigured()) return null;
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
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf', '.ppt':'application/vnd.ms-powerpoint', '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4':'video/mp4', '.webm':'video/webm', '.mov':'video/quicktime' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    const protectedDocument = url.pathname === '/' || /\/(?:index|admin|new-hires|recently-joined|apps|announcements|social-media|moments|knowledge-hub|events|news|whistleblower)\.html$/i.test(url.pathname);
    if (isGoogleConfigured() && !sessionFor(req) && req.method === 'GET' && protectedDocument) { res.writeHead(302, { location:'/login.html?returnTo=' + encodeURIComponent(url.pathname) }); return res.end(); }
    if (req.method === 'GET' && url.pathname === '/auth/google') {
      if (!isGoogleConfigured()) return json(res, 503, { error:'Google Workspace SSO is not configured yet.' });
      const state = randomUUID(), origin = process.env.APP_ORIGIN || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      const returnTo = String(url.searchParams.get('returnTo') || '/');
      oauthStates.set(state, { createdAt:Date.now(), returnTo:/^\/(?!\/)/.test(returnTo) ? returnTo : '/' });
      const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      target.search = new URLSearchParams({ client_id:googleClientId, redirect_uri:`${origin}/auth/google/callback`, response_type:'code', scope:'openid email profile', hd:googleWorkspaceDomain, state }).toString();
      res.writeHead(302, { location:target.toString() }); return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/auth/google/callback') {
      const state = url.searchParams.get('state'), stateRecord = oauthStates.get(state), code = url.searchParams.get('code'); oauthStates.delete(state);
      if (!stateRecord || Date.now() - stateRecord.createdAt > 10 * 60 * 1000 || !code) return json(res, 400, { error:'Google sign-in could not be verified.' });
      const origin = process.env.APP_ORIGIN || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{ 'content-type':'application/x-www-form-urlencoded' }, body:new URLSearchParams({ code, client_id:googleClientId, client_secret:googleClientSecret, redirect_uri:`${origin}/auth/google/callback`, grant_type:'authorization_code' }) });
      if (!tokenResponse.ok) return json(res, 401, { error:'Google sign-in was rejected.' });
      const token = await tokenResponse.json(), userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers:{ authorization:`Bearer ${token.access_token}` } });
      const profile = await userResponse.json(), email = String(profile.email || '').toLowerCase();
      if (!userResponse.ok || !profile.email_verified || !email.endsWith(`@${googleWorkspaceDomain}`)) return json(res, 403, { error:'Use your approved Si-Ware Google Workspace account.' });
      const current = await dashboard();
      const assigned = current.accessUsers.find(user => String(user.email || '').toLowerCase() === email)?.role;
      const sessionId = randomUUID(); sessions.set(sessionId, { id:String(profile.sub), email, name:profile.name || email, role:assigned || (googleAdminEmails.has(email) ? 'ADMIN' : 'EMPLOYEE') }); setCookie(res, sessionId); auditEvent(current, sessions.get(sessionId), { action:'authentication.login', resource:'session', route:stateRecord.returnTo, outcome:'success' }); await save(current); res.writeHead(302, { location:stateRecord.returnTo }); return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/auth/logout') {
      const data = await dashboard(), actor = actorFor(req, data), sessionId = cookiesFor(req).siware_session;
      if (sessionId) sessions.delete(sessionId);
      setCookie(res, '', 0);
      if (actor) { auditEvent(data, actor, { action:'authentication.logout', resource:'session', route:'/', outcome:'success' }); await save(data); }
      return json(res, 200, { ok:true });
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/me') { const data = await dashboard(), employee = actorFor(req, data); return employee ? json(res, 200, { ...employee, permissions:rolePermissions[employee.role] || [] }) : json(res, 401, { error:'Sign in with Google Workspace to continue.' }); }
    if (req.method === 'POST' && url.pathname === '/api/activity') {
      const data = await dashboard(), actor = actorFor(req, data), body = await readBody(req);
      if (!actor) return json(res, 401, { error:'Sign in is required.' });
      const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
      const accepted = events.filter(event => /^[a-zA-Z0-9-]{16,80}$/.test(String(event.id || '')) && /^[a-z0-9._-]{2,80}$/i.test(String(event.action || '')) && /^[a-z0-9._-]{2,80}$/i.test(String(event.component || '')) && /^\//.test(String(event.route || ''))).filter(event => activityEvent(data, actor, event)).length;
      if (accepted) await save(data);
      return json(res, 202, { accepted });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/summary') {
      const data = await dashboard(), actor = actorFor(req, data);
      if (!can(actor, 'audit.view') && !can(actor, 'content.edit')) { auditEvent(data, actor, { action:'access.denied', resource:'admin.summary', route:'/admin.html', outcome:'denial' }); save(data).catch(() => {}); return json(res, actor ? 403 : 401, { error:actor ? 'You do not have permission for the administration workspace.' : 'Sign in is required.' }); }
      const audit = can(actor, 'audit.view') ? data.auditEvents.slice(0, 8) : [], activity = can(actor, 'audit.view') ? data.activityEvents.slice(0, 8) : [];
      return json(res, 200, { version:data._version, counts:{ announcements:data.announcements?.length || 0, people:data.newMembers?.length || 0, apps:data.apps?.length || 0, media:(await mediaInventory(data)).length, audits:data.auditEvents.length, activity:data.activityEvents.length }, audit, activity, settings:data.adminSettings, actor });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/audit') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'audit.view'); if (!actor) return;
      const source = url.searchParams.get('category') === 'activity' ? data.activityEvents : data.auditEvents;
      const query = safeText(url.searchParams.get('q')).toLowerCase(), outcome = safeText(url.searchParams.get('outcome'));
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1), limit = Math.min(100, Math.max(10, Number(url.searchParams.get('limit')) || 25));
      const filtered = source.filter(event => (!query || JSON.stringify(event).toLowerCase().includes(query)) && (!outcome || event.outcome === outcome));
      return json(res, 200, { records:filtered.slice((page - 1) * limit, page * limit), total:filtered.length, page, pages:Math.max(1, Math.ceil(filtered.length / limit)) });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/audit/export') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'audit.export'); if (!actor) return;
      const rows = data.auditEvents.map(event => [event.id, event.occurredAt, event.category, event.actor?.email || '', event.action || '', event.resource || '', event.outcome || ''].map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
      auditEvent(data, actor, { action:'audit.export', resource:'audit-events', route:'/admin.html', outcome:'success' }); await save(data);
      res.writeHead(200, { 'content-type':'text/csv; charset=utf-8', 'content-disposition':'attachment; filename="siware-audit.csv"' }); return res.end(`id,occurred_at,category,actor,action,resource,outcome\n${rows}`);
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/media') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'media.manage'); if (!actor) return;
      return json(res, 200, await mediaInventory(data));
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/access') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'access.manage'); if (!actor) return;
      return json(res, 200, { users:data.accessUsers, roles:Object.keys(rolePermissions) });
    }
    if (req.method === 'PATCH' && url.pathname === '/api/admin/access') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'access.manage'); if (!actor) return;
      const body = await readBody(req), email = String(body.email || '').trim().toLowerCase(), role = String(body.role || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !rolePermissions[role]) return json(res, 422, { error:'Provide a valid email address and supported role.' });
      const current = data.accessUsers.find(user => user.email === email);
      const accessAdmins = new Set(data.accessUsers.filter(user => user.role === 'ADMIN').map(user => user.email));
      googleAdminEmails.forEach(adminEmail => accessAdmins.add(adminEmail));
      const adminCount = accessAdmins.size;
      if (current?.role === 'ADMIN' && role !== 'ADMIN' && adminCount <= 1) return json(res, 422, { error:'The last administrator cannot be removed or demoted.' });
      if (current) current.role = role; else data.accessUsers.push({ id:randomUUID(), email, name:safeText(body.name) || email, role });
      data._version += 1; auditEvent(data, actor, { action:'access.role.updated', resource:email, route:'/admin.html', outcome:'success', changes:{ role } }); await save(data);
      return json(res, 200, { users:data.accessUsers });
    }
    if (req.method === 'GET' && url.pathname === '/api/admin/defaults') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'content.edit'); if (!actor) return;
      const defaults = JSON.parse(await readFile(adminDefaultsFile, 'utf8'));
      return json(res, 200, { defaults:Object.fromEntries(adminDefaultKeys.map(key => [key, defaults[key] ?? null])) });
    }
    if (req.method === 'PATCH' && url.pathname === '/api/admin/dashboard') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'content.edit'); if (!actor) return;
      const body = await readBody(req), next = body.data;
      if (!next || typeof next !== 'object' || Array.isArray(next)) return json(res, 422, { error:'A dashboard payload is required.' });
      if (Number(body.version) !== data._version) return json(res, 409, { error:'This content changed elsewhere. Refresh before saving.', version:data._version });
      if (Object.hasOwn(next, 'sessions')) { const duplicate = duplicateKnowledgeSessionName(next.sessions); if (duplicate) return json(res, 422, { error:`Knowledge Hub session title already exists or is invalid: ${duplicate}. Use a unique title.` }); }
      const protectedKeys = new Set(['auditEvents', 'activityEvents', 'accessUsers', 'adminSettings', '_version']);
      const changedKeys = Object.keys(next).filter(key => !protectedKeys.has(key) && JSON.stringify(next[key]) !== JSON.stringify(data[key]));
      changedKeys.forEach(key => { data[key] = next[key]; });
      if (changedKeys.includes('settings')) { data.adminSettings.layoutHistory ||= []; data.adminSettings.layoutHistory.unshift({ at:new Date().toISOString(), by:actor.email, settings:data.settings }); data.adminSettings.layoutHistory = data.adminSettings.layoutHistory.slice(0, 12); }
      const changedContent = changedContentLabels(changedKeys);
      withAnnouncementAudit(data); data._version += 1; auditEvent(data, actor, { action:changedKeys.includes('settings') ? 'presentation.updated' : 'content.updated', resource:changedContent.join(' · ') || 'No content changes', route:'/admin.html', outcome:'success', changes:{ fields:changedKeys, pages:changedContent } }); await save(data);
      return json(res, 200, await withPolicyModifiedDates(data));
    }
    if (req.method === 'PATCH' && url.pathname === '/api/admin/settings') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'settings.manage'); if (!actor) return;
      const body = await readBody(req), auditRetentionDays = Number(body.auditRetentionDays), activityRetentionDays = Number(body.activityRetentionDays);
      if (!Number.isInteger(auditRetentionDays) || !Number.isInteger(activityRetentionDays) || auditRetentionDays < 30 || activityRetentionDays < 7 || auditRetentionDays > 3650 || activityRetentionDays > 3650) return json(res, 422, { error:'Choose retention periods within the supported limits.' });
      data.adminSettings.auditRetentionDays = auditRetentionDays; data.adminSettings.activityRetentionDays = activityRetentionDays;
      const now = Date.now(), auditCutoff = now - auditRetentionDays * 86400000, activityCutoff = now - activityRetentionDays * 86400000;
      data.auditEvents = data.auditEvents.filter(event => new Date(event.occurredAt).getTime() >= auditCutoff);
      data.activityEvents = data.activityEvents.filter(event => new Date(event.occurredAt).getTime() >= activityCutoff);
      data._version += 1; auditEvent(data, actor, { action:'audit.retention.updated', resource:'retention-policy', route:'/admin.html', outcome:'success', changes:{ auditRetentionDays, activityRetentionDays } }); await save(data);
      return json(res, 200, data.adminSettings);
    }
    if (req.method === 'POST' && url.pathname === '/api/policy-acknowledgement/viewed') {
      const data = await dashboard(), employee = policyIdentity(req, data), body = await readBody(req); if (!employee) return json(res, 401, { error:'Sign in with Google Workspace to continue.' });
      const policy = requiredPolicies(data).find(item => item.id === body.policyId && publishedPolicyUrl(item.canonicalUrl)); if (!policy) return json(res, 422, { error:'That policy document is not ready for acknowledgement.' });
      data.policyReviewViews ||= {}; const email = employee.email.toLowerCase(); data.policyReviewViews[email] ||= {}; data.policyReviewViews[email][policyKey(policy)] = new Date().toISOString(); await save(data); return json(res, 200, acknowledgementStatus(data, employee));
    }
    if (req.method === 'GET' && url.pathname === '/api/policy-acknowledgement') { const data = await dashboard(), employee = policyIdentity(req, data); return employee ? json(res, 200, acknowledgementStatus(data, employee)) : json(res, 401, { error:'Sign in with Google Workspace to continue.' }); }
    if (req.method === 'POST' && url.pathname === '/api/policy-acknowledgement') {
      const data = await dashboard(), employee = policyIdentity(req, data), body = await readBody(req); if (!employee) return json(res, 401, { error:'Sign in with Google Workspace to continue.' });
      const status = acknowledgementStatus(data, employee), statement = status.content.confirmationLabel;
      if (body.statement !== statement) return json(res, 422, { error:'The required confirmation statement was not received.' });
      if (status.unpublished.length || status.policies.some(policy => !policy.viewedAt)) return json(res, 422, { error:'Open every required policy document before confirming.' });
      if (!status.acceptance) { data.policyAcknowledgements ||= []; data.policyAcknowledgements.unshift({ id:`ack-${Date.now()}`, employee:{ id:employee.id, name:employee.name, email:employee.email }, statement, contentVersion:data.policyAcknowledgementContent.version, acceptedAt:new Date().toISOString(), policies:status.policies.map(policy => ({ id:policy.id, title:policy.title, version:policy.version, key:policy.key, viewedAt:policy.viewedAt })) }); await save(data); }
      return json(res, 200, acknowledgementStatus(data, employee));
    }
    if (req.method === 'GET' && url.pathname === '/api/policy-acknowledgements') { if (!isAdmin(req)) return json(res, 403, { error:'Admin role required' }); const data = await dashboard(), query = String(url.searchParams.get('q') || '').trim().toLowerCase(), limit = Math.min(100, Math.max(10, Number(url.searchParams.get('limit')) || 25)), requestedPage = Math.max(1, Number(url.searchParams.get('page')) || 1), matching = (data.policyAcknowledgements || []).filter(record => !query || `${record.employee.name} ${record.employee.email}`.toLowerCase().includes(query)), total = matching.length, pages = Math.max(1, Math.ceil(total / limit)), page = Math.min(requestedPage, pages), records = matching.slice((page - 1) * limit, page * limit); return json(res, 200, { records, total, page, pages, limit }); }
    if (req.method === 'GET' && url.pathname === '/api/dashboard') {
      const data = await dashboard(), actor = actorFor(req, data);
      if (isGoogleConfigured() && !actor) return json(res, 401, { error:'Sign in is required.' });
      return json(res, 200, { ...data, user:actor ? { name:actor.name, email:actor.email, role:actor.role, title:actor.role === 'ADMIN' ? 'Administrator' : actor.role.replace('_', ' ') } : data.user });
    }
    if (req.method === 'GET' && url.pathname === '/api/youtube/latest') return json(res, 200, await latestYouTubeVideos());
    if (req.method === 'GET' && url.pathname === '/api/company-news') return json(res, 200, await latestCompanyNews());
    if (req.method === 'GET' && url.pathname === '/api/search') {
      const term = (url.searchParams.get('q') || '').trim().toLowerCase();
      if (!term) return json(res, 200, []);
      const data = await dashboard();
      const sources = [
        ['Policy', 'policies', item => `${item.title} ${item.summary} ${item.owner} ${item.audience}`, item => item.canonicalUrl],
        ['Person', 'people', item => `${item.name} ${item.detail}`, item => item.url],
        ['Form', 'forms', item => `${item.title} ${item.detail}`, item => item.url],
        ['FAQ', 'faqs', item => `${item.title} ${item.detail}`, item => item.url],
        ['Service request', 'serviceRequests', item => `${item.title} ${item.detail}`, item => item.url],
        ['New member', 'newMembers', item => `${item.name} ${item.role} ${item.team} ${item.department} ${item.division} ${item.employmentType} ${item.directManager}`, () => '/recently-joined.html'],
        ['Knowledge', 'sessions', item => `${item.title} ${item.presenter.name} ${item.category}`, () => '/#knowledge'],
        ['App', 'apps', item => `${item.name} ${item.caption}`, item => item.url]
      ];
      const results = sources.flatMap(([type, key, text, href]) => data[key].filter(item => text(item).toLowerCase().includes(term)).map(item => ({ id: item.id, type, title: item.title || item.name, detail: item.summary || item.detail || item.caption || item.category, href: href(item) }))).slice(0, 12);
      const documentMatches = await findInPolicyDocuments(data.policies, term);
      documentMatches.slice(0, Math.max(0, 12 - results.length)).forEach(match => results.push({ id:`${match.url}-${match.page}`, type:'Document', title:match.title, detail:`Page ${match.page}: ${match.snippet}`, href:`/new-hires.html#policies` }));
      return json(res, 200, results);
    }
    if (req.method === 'GET' && url.pathname === '/api/documents/search') {
      const query = (url.searchParams.get('q') || '').trim();
      if (!query) return json(res, 200, []);
      const data = await dashboard(); return json(res, 200, await findPolicyOccurrences(data.policies, query));
    }
    if (req.method === 'GET' && url.pathname === '/api/documents/highlights') {
      const page = Number(url.searchParams.get('page')); return json(res, 200, await documentHighlights(url.searchParams.get('url'), page, url.searchParams.get('q') || ''));
    }
    if (req.method === 'GET' && url.pathname === '/api/documents/info') {
      const file = uploadedPdfPath(url.searchParams.get('url'));
      if (!file) return json(res, 404, { error: 'Document not found' });
      try {
        const { stdout } = await execFileAsync('pdfinfo', [file], { maxBuffer: 1024 * 1024 });
        return json(res, 200, { pages: Math.max(1, Math.min(Number(/Pages:\s+(\d+)/.exec(stdout)?.[1] || 1), 80)) });
      } catch { return json(res, 500, { error: 'Unable to read document information' }); }
    }
    if (req.method === 'GET' && url.pathname === '/api/documents/page') {
      const file = uploadedPdfPath(url.searchParams.get('url')), page = Number(url.searchParams.get('page'));
      if (!file || !Number.isInteger(page) || page < 1) return json(res, 404, { error: 'Document page not found' });
      const output = join(uploadsDir, `.preview-${Date.now()}-${page}`), image = `${output}.png`;
      try { await execFileAsync('pdftoppm', ['-f', String(page), '-l', String(page), '-scale-to', '1800', '-png', '-singlefile', file, output]); const content = await readFile(image); res.writeHead(200, { 'content-type':'image/png', 'cache-control':'private, max-age=300' }); res.end(content); } finally { await unlink(image).catch(() => {}); }
      return;
    }
    if (req.method === 'PATCH' && url.pathname === '/api/dashboard') {
      if (!isAdmin(req)) return json(res, 403, { error: 'Admin role required' });
      const data = await dashboard(), patch = await readBody(req), actor = actorFor(req, data);
      if (Object.hasOwn(patch, 'sessions')) { const duplicate = duplicateKnowledgeSessionName(patch.sessions); if (duplicate) return json(res, 422, { error:`Knowledge Hub session title already exists or is invalid: ${duplicate}. Use a unique title.` }); }
      Object.assign(data, patch); withAnnouncementAudit(data); data._version += 1; auditEvent(data, actor, { action:'content.updated.legacy', resource:'dashboard', route:'/', outcome:'success' }); await save(data); return json(res, 200, await withPolicyModifiedDates(data));
    }
    if (req.method === 'POST' && url.pathname === '/api/uploads') {
      const data = await dashboard(), actor = requirePermission(req, res, data, 'media.manage'); if (!actor) return;
      if (req.headers['x-upload-binary'] === '1') {
        const filename = decodeURIComponent(String(req.headers['x-upload-filename'] || 'upload'));
        const uploaded = await saveAdminBinaryUpload(req, filename, req.headers['content-type']); auditEvent(data, actor, { action:'media.uploaded', resource:uploaded, route:'/admin.html', outcome:'success' }); await save(data); return json(res, 201, { url: uploaded });
      }
      const item = await readBody(req);
      const uploaded = await saveAdminUpload(item.dataUrl, item.filename); auditEvent(data, actor, { action:'media.uploaded', resource:uploaded, route:'/admin.html', outcome:'success' }); await save(data); return json(res, 201, { url: uploaded });
    }
    if (req.method === 'POST' && url.pathname === '/api/new-members') {
      if (!isAdmin(req)) return json(res, 403, { error: 'Admin role required' });
      const item = await readBody(req), data = await dashboard();
      const required = ['name', 'role', 'team', 'directManager', 'department', 'division'];
      if (required.some(field => !item[field] || typeof item[field] !== 'string')) return json(res, 422, { error: 'Name, role, team, department, division and direct manager are required' });
      if (item.employmentType && !employmentTypes.includes(item.employmentType)) return json(res, 422, { error: 'Choose a valid employment type' });
      item.id = `member-${Date.now()}`;
      item.name = item.name.trim(); item.role = item.role.trim(); item.team = item.team.trim(); item.directManager = item.directManager.trim(); item.department = item.department.trim(); item.division = item.division.trim(); item.employmentType = employmentTypes.includes(item.employmentType) ? item.employmentType : 'Full Time';
      item.initials ||= initialsFor(item.name); item.joined ||= new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date());
      item.message ||= `Please welcome ${item.name} to ${item.team}.`; item.color ||= '#e7f0ff'; item.photoUrl = await saveMemberPhoto(item.photoData, item.id); delete item.photoData;
      data.newMembers.unshift(item); await save(data); return json(res, 201, item);
    }
    if (req.method === 'POST' && ['/api/sessions', '/api/announcements', '/api/policies'].includes(url.pathname)) {
      if (!isAdmin(req)) return json(res, 403, { error: 'Admin role required' });
      const item = await readBody(req), data = await dashboard();
      if (!item.title || typeof item.title !== 'string') return json(res, 422, { error: 'A title is required' });
      const key = url.pathname.includes('sessions') ? 'sessions' : url.pathname.includes('policies') ? 'policies' : 'announcements';
      if (key === 'sessions' && data.sessions.some(session => knowledgeSessionName(session.title) === knowledgeSessionName(item.title))) return json(res, 409, { error:'A Knowledge Hub session with this title already exists. Use a different title or edit the existing session.' });
      if (key === 'policies') {
        const required = ['owner', 'audience', 'version'];
        if (required.some(field => !item[field])) return json(res, 422, { error: 'Policy owner, audience and version are required' });
        item.canonicalUrl ||= '/new-hires.html#policies';
      }
      item.id = `${key === 'sessions' ? 'skh' : key === 'policies' ? 'pol' : 'a'}-${Date.now()}`;
      data[key].unshift(item); await save(data); return json(res, 201, item);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    if (url.pathname.startsWith('/uploads/')) {
      if (isGoogleConfigured() && !sessionFor(req)) return json(res, 401, { error:'Sign in is required.' });
      const uploadName = url.pathname.slice('/uploads/'.length);
      const uploadFile = normalize(join(uploadsDir, uploadName));
      if (relative(uploadsDir, uploadFile).startsWith('..')) return json(res, 403, { error: 'Forbidden' });
      const headers = { 'content-type': types[extname(uploadFile)] || 'application/octet-stream' };
      if (url.searchParams.get('download') === '1') headers['content-disposition'] = `attachment; filename="${uploadName.replace(/[^a-z0-9._-]/gi, '-') || 'download'}"`;
      await access(uploadFile); res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end(); createReadStream(uploadFile).pipe(res); return;
    }
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const filename = normalize(join(publicDir, requested));
    if (!filename.startsWith(publicDir)) return json(res, 403, { error: 'Forbidden' });
    await access(filename); const contentType = types[extname(filename)] || 'application/octet-stream';
    if (req.method === 'HEAD') { res.writeHead(200, { 'content-type':contentType }); return res.end(); }
    if (extname(filename) === '.html') {
      const themeBootstrap = `<script>try{const theme=localStorage.getItem('siware-theme-preference')==='dark'?'dark':'light',root=document.documentElement;root.classList.toggle('dark',theme==='dark');root.dataset.theme=theme;root.style.colorScheme=theme}catch(_){}</script><link rel="stylesheet" href="/page-transition.css" /><script src="/activity.js" defer></script>`;
      const document = await readFile(filename, 'utf8'); res.writeHead(200, { 'content-type':contentType }); return res.end(document.replace(/<head(\s[^>]*)?>/i, `$&${themeBootstrap}`));
    }
    res.writeHead(200, { 'content-type':contentType }); createReadStream(filename).pipe(res);
  } catch (error) {
    if (error.code === 'ENOENT') return json(res, 404, { error: 'Not found' });
    console.error(error); return json(res, error.statusCode || 500, { error: error.message || 'Server error' });
  }
}).listen(port, () => console.log(`Si-Ware intranet is running at http://localhost:${port}`));
