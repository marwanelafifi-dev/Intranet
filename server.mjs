import { createServer } from 'node:http';
import { readFile, writeFile, access, copyFile, mkdir, unlink, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const port = Number(process.env.PORT || 8080);
const publicDir = join(process.cwd(), 'public');
const uploadsDir = join(process.cwd(), 'data', 'uploads');
const dataFile = process.env.DATA_FILE || join(process.cwd(), 'data', 'intranet.json');
const seedFile = join(process.cwd(), 'data', 'seed.json');
const youtubeChannelId = 'UCPx_Gys4B6hSLw_JY3CkU5w';
const youtubeChannelUrl = 'https://www.youtube.com/@Si-Ware_Systems';
const youtubeCacheFile = join(process.cwd(), 'data', 'youtube-latest.json');
const employmentTypes = ['Full Time', 'Part Time', 'Summer Intern', 'Graduate Intern'];
const execFileAsync = promisify(execFile);
let youtubeCache = { expiresAt: 0, payload: null };
const json = (res, status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
const readBody = req => new Promise((resolve, reject) => { let value = '', size = 0, finished = false; req.on('data', chunk => { size += chunk.length; if (size > 3 * 1024 * 1024) { finished = true; reject(new Error('Request body is too large')); req.destroy(); return; } if (!finished) value += chunk; }); req.on('end', () => { if (finished) return; try { resolve(JSON.parse(value || '{}')); } catch { reject(new Error('Invalid JSON')); } }); });
const isAdmin = req => req.headers['x-demo-role'] === 'ADMIN';
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
async function saveAdminUpload(dataUrl, filename) {
  const match = /^data:(application\/pdf|image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Upload a PDF, PNG, JPEG, WebP or GIF file');
  const content = Buffer.from(match[2], 'base64');
  if (!content.length || content.length > 10 * 1024 * 1024) throw new Error('File must be no larger than 10 MB');
  const extension = match[1] === 'application/pdf' ? 'pdf' : { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif' }[match[1]];
  const safeName = String(filename || 'upload').replace(/[^a-z0-9-_]/gi, '-').slice(0, 60) || 'upload';
  const stored = `${safeName}-${Date.now()}.${extension}`;
  await mkdir(uploadsDir, { recursive: true }); await writeFile(join(uploadsDir, stored), content);
  return `/uploads/${stored}`;
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
  try {
    const data = JSON.parse(await readFile(dataFile, 'utf8'));
    let changed = false;
    for (const key of ['newMembers', 'policies', 'people', 'forms', 'faqs', 'serviceRequests', 'supportPortals']) {
      if (!Array.isArray(data[key])) { data[key] = seed[key]; changed = true; }
    }
    const seededMembers = new Map(seed.newMembers.map(member => [member.id, member]));
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
    const expectedLayout = seed.settings.layout;
    if (!data.settings) { data.settings = seed.settings; changed = true; }
    else if (data.settings.layout?.includes('actions')) { data.settings.layout = data.settings.layout.map(item => item === 'actions' ? 'new-members' : item); changed = true; }
    else if (!data.settings.layout?.includes('new-members')) { data.settings.layout = expectedLayout; changed = true; }
    if (changed) await save(data);
    return withPolicyModifiedDates(data);
  } catch {
    await copyFile(seedFile, dataFile);
    return withPolicyModifiedDates(seed);
  }
}
async function save(data) { await writeFile(dataFile, JSON.stringify(data, null, 2)); }
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/dashboard') return json(res, 200, await dashboard());
    if (req.method === 'GET' && url.pathname === '/api/youtube/latest') return json(res, 200, await latestYouTubeVideos());
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
    if (req.method === 'GET' && url.pathname === '/api/documents/page') {
      const file = uploadedPdfPath(url.searchParams.get('url')), page = Number(url.searchParams.get('page'));
      if (!file || !Number.isInteger(page) || page < 1) return json(res, 404, { error: 'Document page not found' });
      const output = join(uploadsDir, `.preview-${Date.now()}-${page}`), image = `${output}.png`;
      try { await execFileAsync('pdftoppm', ['-f', String(page), '-l', String(page), '-scale-to', '1800', '-png', '-singlefile', file, output]); const content = await readFile(image); res.writeHead(200, { 'content-type':'image/png', 'cache-control':'private, max-age=300' }); res.end(content); } finally { await unlink(image).catch(() => {}); }
      return;
    }
    if (req.method === 'PATCH' && url.pathname === '/api/dashboard') {
      if (!isAdmin(req)) return json(res, 403, { error: 'Admin role required' });
      const data = await dashboard(), patch = await readBody(req);
      Object.assign(data, patch); await save(data); return json(res, 200, await withPolicyModifiedDates(data));
    }
    if (req.method === 'POST' && url.pathname === '/api/uploads') {
      if (!isAdmin(req)) return json(res, 403, { error: 'Admin role required' });
      const item = await readBody(req);
      return json(res, 201, { url: await saveAdminUpload(item.dataUrl, item.filename) });
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
    await access(filename); res.writeHead(200, { 'content-type': types[extname(filename)] || 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end(); createReadStream(filename).pipe(res);
  } catch (error) {
    if (error.code === 'ENOENT') return json(res, 404, { error: 'Not found' });
    console.error(error); return json(res, 500, { error: 'Server error' });
  }
}).listen(port, () => console.log(`Si-Ware intranet is running at http://localhost:${port}`));
