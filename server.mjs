import { createServer } from 'node:http';
import { readFile, writeFile, access, copyFile, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize, relative } from 'node:path';

const port = Number(process.env.PORT || 8080);
const publicDir = join(process.cwd(), 'public');
const uploadsDir = join(process.cwd(), 'data', 'uploads');
const dataFile = process.env.DATA_FILE || join(process.cwd(), 'data', 'intranet.json');
const seedFile = join(process.cwd(), 'data', 'seed.json');
const youtubeChannelId = 'UCPx_Gys4B6hSLw_JY3CkU5w';
const youtubeChannelUrl = 'https://www.youtube.com/@Si-Ware_Systems';
const youtubeCacheFile = join(process.cwd(), 'data', 'youtube-latest.json');
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
async function dashboard() {
  const seed = JSON.parse(await readFile(seedFile, 'utf8'));
  try {
    const data = JSON.parse(await readFile(dataFile, 'utf8'));
    let changed = false;
    for (const key of ['newMembers', 'policies', 'people', 'forms', 'faqs', 'serviceRequests']) {
      if (!Array.isArray(data[key])) { data[key] = seed[key]; changed = true; }
    }
    const seededMembers = new Map(seed.newMembers.map(member => [member.id, member]));
    if (data.newMembers.some(member => !member.directManager)) { data.newMembers = data.newMembers.map(member => ({ ...member, directManager: member.directManager || seededMembers.get(member.id)?.directManager || 'To be confirmed' })); changed = true; }
    const expectedLayout = seed.settings.layout;
    if (!data.settings) { data.settings = seed.settings; changed = true; }
    else if (data.settings.layout?.includes('actions')) { data.settings.layout = data.settings.layout.map(item => item === 'actions' ? 'new-members' : item); changed = true; }
    else if (!data.settings.layout?.includes('new-members')) { data.settings.layout = expectedLayout; changed = true; }
    if (changed) await save(data);
    return data;
  } catch {
    await copyFile(seedFile, dataFile);
    return seed;
  }
}
async function save(data) { await writeFile(dataFile, JSON.stringify(data, null, 2)); }
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

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
        ['New member', 'newMembers', item => `${item.name} ${item.role} ${item.team} ${item.directManager}`, () => '/new-hires.html#new-members'],
        ['Knowledge', 'sessions', item => `${item.title} ${item.presenter.name} ${item.category}`, () => '/#knowledge'],
        ['App', 'apps', item => `${item.name} ${item.caption}`, item => item.url]
      ];
      const results = sources.flatMap(([type, key, text, href]) => data[key].filter(item => text(item).toLowerCase().includes(term)).map(item => ({ id: item.id, type, title: item.title || item.name, detail: item.summary || item.detail || item.caption || item.category, href: href(item) }))).slice(0, 12);
      return json(res, 200, results);
    }
    if (req.method === 'PATCH' && url.pathname === '/api/dashboard') {
      if (!isAdmin(req)) return json(res, 403, { error: 'Admin role required' });
      const data = await dashboard(), patch = await readBody(req);
      Object.assign(data, patch); await save(data); return json(res, 200, data);
    }
    if (req.method === 'POST' && url.pathname === '/api/new-members') {
      if (!isAdmin(req)) return json(res, 403, { error: 'Admin role required' });
      const item = await readBody(req), data = await dashboard();
      const required = ['name', 'role', 'team', 'directManager'];
      if (required.some(field => !item[field] || typeof item[field] !== 'string')) return json(res, 422, { error: 'Name, role, team and direct manager are required' });
      item.id = `member-${Date.now()}`;
      item.name = item.name.trim(); item.role = item.role.trim(); item.team = item.team.trim(); item.directManager = item.directManager.trim();
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
        const required = ['owner', 'reviewDate', 'audience', 'version'];
        if (required.some(field => !item[field])) return json(res, 422, { error: 'Policy owner, review date, audience and version are required' });
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
      await access(uploadFile); res.writeHead(200, { 'content-type': types[extname(uploadFile)] || 'application/octet-stream' });
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
