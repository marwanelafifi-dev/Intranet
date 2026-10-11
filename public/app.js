const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const icon = { mail:'✉', check:'✓', folder:'▰', life:'⌁', people:'♙', phone:'⌕', tree:'⌘', clock:'◷', cube:'◇', chart:'◫', spark:'✦', bot:'◉' };
let state, activeTag = 'All', publishType = 'announcement';
function appIcon(name) {
  const paths = {
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    check: '<path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="9"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    life: '<path d="M12 21a9 9 0 1 0-9-9"/><path d="M3 12h5l2-4 3 8 2-4h6"/>',
    people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c.6-4 3-6 6-6s5.4 2 6 6M14 15c3.4 0 5.5 1.6 6 5"/>',
    phone: '<path d="M7 3h3l1 5-2 1c1 2.2 2.8 4 5 5l1-2 5 1v3c0 1.1-.9 2-2 2C10.8 18 6 13.2 6 7c0-1.1.9-2 1-4Z"/>',
    tree: '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M12 7v4M6 16v-2h12v2M12 11h6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
    chart: '<path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-6"/>',
    spark: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7Z"/><path d="m19 16 .6 1.4L21 18l-1.4.6L19 20l-.6-1.4L17 18l1.4-.6Z"/>',
    bot: '<rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 4v3M8 13h.01M16 13h.01M9 17h6"/>'
  };
  return `<svg class="portal-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.spark}</svg>`;
}
const policyIndex = [
  { title: 'New Si-Warians!: first-week checklist', detail: 'Five practical actions for your first days at Si-Ware.', href: '/new-hires.html#first-week' },
  { title: 'Code of Conduct', detail: 'How we work with integrity and respect.', href: '/new-hires.html#policies' },
  { title: 'Information Security policy', detail: 'Protecting people, research and customer information.', href: '/new-hires.html#policies' },
  { title: 'Attendance & Leave policy', detail: 'Time logging, leave requests and flexible work.', href: '/new-hires.html#policies' },
  { title: 'Health & Safety policy', detail: 'Safe workplaces, labs and ways of working.', href: '/new-hires.html#policies' }
];
const dashboardLayout = ['announcements', 'new-members', 'social', 'news', 'moments', 'knowledge', 'events', 'whistleblower'];
const dashboardLayoutVersion = 'structured-v4';
function normalizeState(data) {
  data.newMembers ??= [];
  data.policies ??= policyIndex.map((policy, index) => ({ id: `fallback-policy-${index}`, summary: policy.detail, canonicalUrl: policy.href, ...policy }));
  data.people ??= []; data.forms ??= []; data.faqs ??= []; data.serviceRequests ??= [];
  data.settings ??= { hiddenWidgets: [], layout: dashboardLayout };
  data.settings.hiddenWidgets ??= [];
  if (data.settings.layout?.includes('actions')) data.settings.layout = data.settings.layout.map(item => item === 'actions' ? 'new-members' : item);
  if (!data.settings.layout?.length || data.settings.layoutVersion !== dashboardLayoutVersion) {
    data.settings.layout = [...dashboardLayout];
    data.settings.layoutVersion = dashboardLayoutVersion;
  }
  if (!data.settings.layout.includes('new-members')) data.settings.layout = [...dashboardLayout];
  return data;
}

async function request(path, options = {}) {
  const headers = { 'content-type': 'application/json', 'x-demo-role': state?.user?.role || 'EMPLOYEE', ...options.headers };
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) throw new Error((await response.json()).error || 'Something went wrong');
  return response.json();
}
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char])); }
function dateLabel(value) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`)); }
function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2800); }
function acknowledgeContentChange(element) {
  if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  element.classList.remove('is-updating'); void element.offsetWidth; element.classList.add('is-updating');
  window.setTimeout(() => element.classList.remove('is-updating'), 460);
}

function renderApps() {
  $('#app-grid').innerHTML = state.apps.map(app => `<a class="app-link" href="${escapeHtml(app.url)}" ${app.url.startsWith('http') ? 'target="_blank" rel="noreferrer"' : ''} title="${escapeHtml(app.caption)}" style="--app-color:${app.color}"><span class="app-icon">${icon[app.icon] || '◈'}</span><b>${escapeHtml(app.name)}</b><small>${escapeHtml(app.caption)}</small></a>`).join('');
}
function renderAnnouncement() {
  const item = state.announcements[0];
  $('#announcement-spotlight').innerHTML = `<h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.body)}</p><small>${escapeHtml(item.date)}</small>`;
}
function renderVectorIcons() {
  $$('#app-grid .app-icon').forEach((element, index) => { element.innerHTML = appIcon(state.apps[index]?.icon); });
  $$('#app-manager .manager-row .app-icon').forEach((element, index) => { element.innerHTML = appIcon(state.apps[index]?.icon); });
}
function renderNews() {
  const selector = $('#feed-selector');
  if (!selector.options.length) selector.innerHTML = state.feeds.map(feed => `<option value="${feed.id}">${escapeHtml(feed.label)}</option>`).join('');
  const feed = state.feeds.find(item => item.id === selector.value) || state.feeds[0];
  selector.value = feed.id;
  $('#news-list').innerHTML = feed.items.map(item => `<article class="news-item"><div><small class="news-tag">${escapeHtml(item.type)}</small><small>${escapeHtml(item.age)}</small></div><b>${escapeHtml(item.title)}</b></article>`).join('');
  $('#feed-link').setAttribute('aria-label', `Open ${feed.source}`);
}
function renderSessions() {
  const term = $('#session-search').value.trim().toLowerCase();
  const result = state.sessions.filter(session => activeTag === 'All' || session.category === activeTag).filter(session => [session.title, session.presenter.name, session.category].join(' ').toLowerCase().includes(term));
  $('#session-list').innerHTML = result.map(session => `<tr><td>${escapeHtml(session.title)}</td><td><span class="speaker"><span class="avatar">${escapeHtml(session.presenter.initials || session.presenter.name.split(' ').map(x => x[0]).join('').slice(0,2))}</span>${escapeHtml(session.presenter.name)}</span></td><td><span class="topic">${escapeHtml(session.category)}</span></td><td>${dateLabel(session.date)}</td><td><span class="session-actions"><button data-action="watch" data-id="${session.id}">Watch</button><button data-action="deck" data-id="${session.id}">Deck ↗</button></span></td></tr>`).join('');
  $('#session-empty').hidden = Boolean(result.length);
}
function renderTags() {
  const tags = ['All', ...new Set(state.sessions.map(item => item.category))];
  $('#tag-filters').innerHTML = tags.map(tag => `<button class="${tag === activeTag ? 'active' : ''}" data-tag="${tag}">${tag}</button>`).join('');
}
function renderMoments() { $('#moments-grid').innerHTML = state.moments.map(item => `<article class="moment" style="--moment:${item.color}"><span>${item.kind}</span><small>${escapeHtml(item.title)}</small></article>`).join(''); }
function displayYouTubeDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date); }
async function renderYouTubeVideos() {
  const container = $('#youtube-videos');
  if (!container) return;
  try {
    const response = await fetch('/api/youtube/latest');
    if (!response.ok) throw new Error('Latest videos are unavailable');
    const { videos = [], unavailable } = await response.json();
    if (unavailable || !videos.length) throw new Error('Latest videos are unavailable');
    container.innerHTML = videos.map(video => `<a class="youtube-video" href="${escapeHtml(video.watchUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${escapeHtml(video.title)}" title="${escapeHtml(video.title)}"><img src="${escapeHtml(video.thumbnailUrl)}" alt="Thumbnail for ${escapeHtml(video.title)}" loading="lazy" /><span><b>${escapeHtml(video.title)}</b><small>${escapeHtml(displayYouTubeDate(video.published))}</small></span></a>`).join('');
  } catch {
    container.innerHTML = '<p class="youtube-feed-status">Latest videos are temporarily unavailable. Visit the channel to watch Si-Ware’s newest uploads.</p>';
  }
}
function renderEvents() { $('#event-list').innerHTML = state.events.map(item => `<article class="event"><div class="date-block"><b>${item.day}</b><small>${item.month}</small></div><div><p>${escapeHtml(item.title)}</p><span>${escapeHtml(item.time)} · ${escapeHtml(item.type)}</span></div></article>`).join(''); }
function renderNewMembers() {
  const members = state.newMembers.slice(0, 2);
  $('#new-member-list').innerHTML = members.length ? members.map(member => `<article class="new-member">${member.photoUrl ? `<img class="new-member-avatar new-member-photo" src="${escapeHtml(member.photoUrl)}" alt="Photo of ${escapeHtml(member.name)}" />` : `<span class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}">${escapeHtml(member.initials || member.name.split(' ').map(part => part[0]).join('').slice(0, 2))}</span>`}<div><b>${escapeHtml(member.name)}</b><small>${escapeHtml(member.role)}</small><span>${escapeHtml(member.team)} · Joined ${escapeHtml(member.joined)}</span><span class="direct-manager">Direct Manager: ${escapeHtml(member.directManager || 'To be confirmed')}</span></div></article>`).join('') : '<p class="empty-state">No new member announcements are available right now.</p>';
}
function renderProfile() {
  $('#profile-name').textContent = state.user.name.split(' ')[0]; $('#profile-role').textContent = state.user.title;
  $('.avatar-user').textContent = state.user.name.split(' ').map(part => part[0]).join('').slice(0,2);
  const canAdmin = state.user.role === 'ADMIN'; $('#cms-toggle').hidden = !canAdmin; if (!canAdmin) closeCMS();
}
function searchResults(query) {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  const includes = value => String(value || '').toLowerCase().includes(term);
  const collect = (items, type, title, detail, href) => items.filter(item => includes(`${title(item)} ${detail(item)}`)).map(item => ({ title: title(item), detail: detail(item), href: href(item), type, icon: 'search', external: String(href(item)).startsWith('http') }));
  return [
    ...collect(state.policies, 'Policy', item => item.title, item => `${item.summary} ${item.owner} ${item.audience} ${item.version}`, item => item.canonicalUrl),
    ...collect(state.people, 'Person', item => item.name, item => item.detail, item => item.url),
    ...collect(state.forms, 'Form', item => item.title, item => item.detail, item => item.url),
    ...collect(state.faqs, 'FAQ', item => item.title, item => item.detail, item => item.url),
    ...collect(state.serviceRequests, 'Service request', item => item.title, item => item.detail, item => item.url),
    ...collect(state.newMembers, 'New member', item => item.name, item => `${item.role} ${item.team} ${item.directManager}`, () => '/new-hires.html#new-members'),
    ...collect(state.sessions, 'Knowledge', item => item.title, item => `${item.category} ${item.presenter.name}`, () => '/#knowledge'),
    ...collect(state.apps, 'App', item => item.name, item => item.caption, item => item.url)
  ].slice(0, 10);
}
function renderGlobalResults() {
  const input = $('#global-search'), container = $('#global-results'), results = searchResults(input.value);
  container.hidden = !input.value.trim();
  container.innerHTML = results.length ? results.map(item => `<a class="search-result" href="${escapeHtml(item.href)}" ${item.external ? 'target="_blank" rel="noreferrer"' : ''} role="option"><span class="search-result-icon">${item.icon}</span><span class="search-result-copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></span><span class="search-result-type">${item.type}</span></a>`).join('') : '<p class="search-empty">No results yet. Try a policy, person, session or app name.</p>';
}
function renderLayoutList() {
  const labels = { announcements:'Hero & announcements', 'new-members':'New Si-Warians!', news:'Industry pulse', knowledge:'Knowledge Hub sessions', whistleblower:'Whistleblower', moments:'Moments gallery', social:'Company channels', events:'Calendar & key dates' };
  $('#layout-list').innerHTML = state.settings.layout.map(key => `<div class="layout-row" draggable="true" data-widget-key="${key}"><span class="drag" title="Drag to reorder">⠿</span><b>${labels[key]}</b><label><input type="checkbox" ${!state.settings.hiddenWidgets.includes(key) ? 'checked' : ''}> Visible</label></div>`).join('');
  installLayoutDrag();
}
function renderAppManager() { $('#app-manager').innerHTML = state.apps.map(app => `<div class="manager-row"><span class="app-icon" style="--app-color:${app.color}">${icon[app.icon] || '◈'}</span><b>${escapeHtml(app.name)}</b><button title="Remove ${escapeHtml(app.name)}" data-app-id="${app.id}">×</button></div>`).join(''); }
function applyLayout() {
  const defaultLayout = dashboardLayout.join(',');
  const dashboard = $('.dashboard');
  dashboard.classList.toggle('layout-custom', state.settings.layout.join(',') !== defaultLayout);
  $$('.widget').forEach(widget => {
    const position = state.settings.layout.indexOf(widget.dataset.widget);
    widget.hidden = state.settings.hiddenWidgets.includes(widget.dataset.widget);
    widget.style.order = position < 0 ? 99 : position;
  });
}
function renderAll() { renderApps(); renderAnnouncement(); renderNewMembers(); renderNews(); renderTags(); renderSessions(); renderMoments(); renderEvents(); renderProfile(); renderLayoutList(); renderAppManager(); renderVectorIcons(); applyLayout(); }

function openMedia(session, kind) {
  $('#modal-title').textContent = session.title; $('#modal-type').textContent = kind === 'watch' ? 'KNOWLEDGE HUB · RECORDING' : 'KNOWLEDGE HUB · PRESENTATION DECK';
  $('#modal-content').innerHTML = kind === 'watch' ? `<video class="modal-video" controls autoplay preload="metadata"><source src="${escapeHtml(session.recordingUrl)}" type="video/mp4">Your browser does not support video playback.</video>` : `<iframe class="pdf-viewer" src="${escapeHtml(session.presentationDeckUrl)}#view=FitH" title="${escapeHtml(session.title)} presentation deck"><p class="modal-note">The deck preview is not available locally. <a href="${escapeHtml(session.presentationDeckUrl)}">Open the PDF</a>.</p></iframe>`;
  $('#media-modal').showModal();
}
function closeCMS() { $('#cms-panel').classList.remove('open'); $('#cms-panel').setAttribute('aria-hidden', 'true'); }
function openCMS() { $('#cms-panel').classList.add('open'); $('#cms-panel').setAttribute('aria-hidden', 'false'); }
function placeCmsToggleInHeader() {
  const toggle = $('#cms-toggle'), profile = $('#profile-button');
  if (!toggle || !profile || toggle.classList.contains('header-cms-toggle')) return;
  toggle.classList.add('header-cms-toggle');
  profile.before(toggle);
}
function setupExploreNudge() {
  if ($('#explore-nudge')) return;
  const nudge = document.createElement('aside');
  nudge.id = 'explore-nudge';
  nudge.className = 'explore-nudge';
  nudge.setAttribute('aria-label', 'Explore more intranet content');
  nudge.innerHTML = `<div class="explore-nudge-head"><b>More to explore</b><button class="explore-nudge-dismiss" type="button">Dismiss</button></div><p>Four sections are waiting below: Moments, Knowledge Hub, Events &amp; key dates, and Employee Voice.</p><div class="explore-nudge-actions"><button class="explore-destination" type="button" data-explore-target="moments">Explore below</button></div>`;
  document.body.append(nudge);
  if (sessionStorage.getItem('siware-explore-nudge-v2-dismissed') === 'true') nudge.hidden = true;
  nudge.addEventListener('click', event => {
    const target = event.target.closest('[data-explore-target]');
    if (target) {
      const destinations = { moments: $('.moments-widget'), knowledge: $('#knowledge'), events: $('#events'), whistleblower: $('.whistleblower-widget') };
      const destination = destinations[target.dataset.exploreTarget];
      destination?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
    if (target || event.target.closest('.explore-nudge-dismiss')) {
      nudge.hidden = true;
      sessionStorage.setItem('siware-explore-nudge-v2-dismissed', 'true');
    }
  });
}
function switchCmsTab(tab) { $$('.cms-tabs button').forEach(button => button.classList.toggle('active', button.dataset.tab === tab)); $$('.cms-tab').forEach(panel => panel.classList.toggle('active', panel.id === `tab-${tab}`)); }
function installLayoutDrag() {
  let dragged;
  $$('#layout-list .layout-row').forEach(row => {
    row.addEventListener('dragstart', () => { dragged = row; row.style.opacity = '.45'; });
    row.addEventListener('dragend', () => { row.style.opacity = ''; });
    row.addEventListener('dragover', event => { event.preventDefault(); const box = row.getBoundingClientRect(); if (event.clientY < box.top + box.height / 2) row.before(dragged); else row.after(dragged); });
  });
}
async function saveDashboard(message) { state = await request('/api/dashboard', { method:'PATCH', body:JSON.stringify(state) }); renderAll(); showToast(message); }

function readMemberPhoto(file) {
  if (!file) return Promise.resolve('');
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) return Promise.reject(new Error('Choose a PNG, JPEG, WebP or GIF image.'));
  if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error('Photo must be no larger than 2 MB.'));
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The photo could not be read.')); reader.readAsDataURL(file); });
}
function setupNewMemberAdmin() {
  if ($('#tab-new-members')) return;
  const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = '/member-admin.css'; document.head.append(stylesheet);
  const tab = document.createElement('button'); tab.dataset.tab = 'new-members'; tab.textContent = 'New members'; $('.cms-tabs').append(tab);
  const panel = document.createElement('section'); panel.className = 'cms-tab'; panel.id = 'tab-new-members';
  panel.innerHTML = `<p class="member-admin-intro">Publish a welcome announcement for a colleague who recently joined Si-Ware.</p><form id="new-member-form" class="member-admin-form"><label>Full name<input name="name" required maxlength="80" placeholder="Employee name" /></label><label>Role<input name="role" required maxlength="100" placeholder="Job title" /></label><label>Team<input name="team" required maxlength="80" placeholder="Department or team" /></label><label>Direct Manager<input name="directManager" required maxlength="80" placeholder="Manager name" /></label><label>Joined<input name="joined" required maxlength="30" placeholder="e.g. October 2026" /></label><label>Welcome message<textarea name="message" rows="3" maxlength="240" placeholder="Optional welcome note"></textarea></label><div class="photo-upload-row"><img class="member-photo-preview" id="member-photo-preview" src="/Icon.png" alt="Photo preview" hidden /><label>Employee photo<input name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /><small class="upload-help">Optional. PNG, JPEG, WebP or GIF, up to 2 MB.</small></label></div><button class="primary-button full" type="submit">Publish welcome</button><p class="form-status" id="new-member-status" role="status"></p></form>`;
  $('.cms-body').append(panel);
  const form = $('#new-member-form'), photoInput = form.elements.photo, preview = $('#member-photo-preview'), status = $('#new-member-status');
  photoInput.addEventListener('change', async () => { try { const photoData = await readMemberPhoto(photoInput.files[0]); preview.src = photoData; preview.hidden = !photoData; status.textContent = ''; } catch (error) { photoInput.value = ''; preview.hidden = true; status.textContent = error.message; } });
  form.addEventListener('submit', async event => { event.preventDefault(); const formData = new FormData(form), submit = $('button[type="submit"]', form); status.textContent = ''; submit.disabled = true; try { const entry = await request('/api/new-members', { method:'POST', body:JSON.stringify({ name:formData.get('name'), role:formData.get('role'), team:formData.get('team'), directManager:formData.get('directManager'), joined:formData.get('joined'), message:formData.get('message'), photoData:await readMemberPhoto(photoInput.files[0]) }) }); state.newMembers.unshift(entry); form.reset(); preview.hidden = true; renderAll(); status.textContent = 'Welcome announcement published.'; showToast('New member published'); } catch (error) { status.textContent = error.message; } finally { submit.disabled = false; } });
}

function setupEvents() {
  $('#profile-button').addEventListener('click', () => { const menu = $('#profile-menu'); menu.hidden = !menu.hidden; $('#profile-button').setAttribute('aria-expanded', String(!menu.hidden)); });
  $('#profile-menu').addEventListener('click', event => { const role = event.target.dataset.role; if (!role) return; state.user.role = role; state.user.title = role === 'ADMIN' ? 'Product Operations' : 'Employee'; $('#profile-menu').hidden = true; renderProfile(); showToast(`Switched to ${role === 'ADMIN' ? 'Admin' : 'Employee'} view`); });
  $('#feed-selector').addEventListener('change', () => { renderNews(); acknowledgeContentChange($('#news-list')); });
  $('#session-search').addEventListener('input', renderSessions);
  $('#tag-filters').addEventListener('click', event => { if (!event.target.dataset.tag) return; activeTag = event.target.dataset.tag; renderTags(); renderSessions(); acknowledgeContentChange($('.session-table-wrap')); });
  $('#session-list').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; const session = state.sessions.find(item => item.id === button.dataset.id); openMedia(session, button.dataset.action); });
  $('#modal-close').addEventListener('click', () => $('#media-modal').close());
  $('#media-modal').addEventListener('click', event => { if (event.target === $('#media-modal')) $('#media-modal').close(); });
  $('#cms-toggle').addEventListener('click', openCMS); $('#cms-close').addEventListener('click', closeCMS);
  $('.cms-tabs').addEventListener('click', event => { if (event.target.dataset.tab) switchCmsTab(event.target.dataset.tab); });
  setupNewMemberAdmin();
  $('#layout-list').addEventListener('change', event => { const row = event.target.closest('.layout-row'); const key = row.dataset.widgetKey; state.settings.hiddenWidgets = event.target.checked ? state.settings.hiddenWidgets.filter(x => x !== key) : [...new Set([...state.settings.hiddenWidgets, key])]; applyLayout(); });
  $('#save-layout').addEventListener('click', async () => { state.settings.layout = $$('#layout-list .layout-row').map(row => row.dataset.widgetKey); await saveDashboard('Dashboard layout saved'); });
  $('#app-manager').addEventListener('click', async event => { const button = event.target.closest('button'); if (!button) return; state.apps = state.apps.filter(app => app.id !== button.dataset.appId); await saveDashboard('Shortcut removed'); });
  $('#add-app').addEventListener('click', async () => { const name = window.prompt('Shortcut name'); const url = name && window.prompt('Target URL', 'https://'); if (!name || !url) return; state.apps.push({ id:`custom-${Date.now()}`, name, caption:'Custom shortcut', url, icon:'spark', color:'#5964db' }); await saveDashboard('Shortcut added'); });
  $$('.publish-switch button').forEach(button => button.addEventListener('click', () => { publishType = button.dataset.publish; $$('.publish-switch button').forEach(x => x.classList.toggle('active', x === button)); $$('.announce-only').forEach(el => el.hidden = publishType !== 'announcement'); $$('.session-only').forEach(el => el.hidden = publishType !== 'session'); }));
  $('#publisher-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget); const title = form.get('title'); const status = $('#form-status'); try { if (publishType === 'announcement') { const entry = await request('/api/announcements', { method:'POST', body:JSON.stringify({ title, body: form.get('body') || 'A new update is available.', tag:'Company update', date:'Just now', priority:'normal' }) }); state.announcements.unshift(entry); renderAnnouncement(); } else { const name = form.get('presenter') || 'Si-Ware team'; const entry = await request('/api/sessions', { method:'POST', body:JSON.stringify({ title, presenter:{name, initials:name.split(' ').map(x=>x[0]).join('').slice(0,2)}, category:form.get('category'), date:new Date().toISOString().slice(0,10), outline:'Newly published knowledge session.', presentationDeckUrl:'/docs/new-session.pdf', recordingUrl:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' }) }); state.sessions.unshift(entry); renderTags(); renderSessions(); } event.currentTarget.reset(); status.textContent = 'Published and saved locally.'; showToast('Content published'); } catch (error) { status.textContent = error.message; } });
  $('#global-search').addEventListener('input', renderGlobalResults);
  $('#global-search').addEventListener('keydown', event => { if (event.key === 'Enter') { const first = $('#global-results .search-result'); if (first) { window.location.assign(first.href); return; } $('#session-search').value = event.target.value; $('#knowledge').scrollIntoView(); renderSessions(); } });
  document.addEventListener('click', event => { if (!event.target.closest('.global-search-wrap')) $('#global-results').hidden = true; });
  document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#global-search').focus(); } if (event.key === 'Escape') { closeCMS(); const nudge = $('#explore-nudge'); if (nudge && !nudge.hidden) { nudge.hidden = true; sessionStorage.setItem('siware-explore-nudge-v2-dismissed', 'true'); } } });
  $('#hero-action').addEventListener('click', () => $('#knowledge').scrollIntoView());
  $('#view-all-sessions').addEventListener('click', () => { activeTag = 'All'; $('#session-search').value = ''; renderTags(); renderSessions(); });
  $('#gallery-next').addEventListener('click', () => { state.moments.push(state.moments.shift()); renderMoments(); acknowledgeContentChange($('#moments-grid')); });
  [['#view-gallery','Gallery opening soon'],['#calendar-button','Calendar integration coming soon']].forEach(([selector, message]) => $(selector).addEventListener('click', event => { event.preventDefault(); showToast(message); }));
}
async function initialize() { try { state = normalizeState(await request('/api/dashboard')); placeCmsToggleInHeader(); renderAll(); setupEvents(); setupExploreNudge(); renderYouTubeVideos(); } catch (error) { document.body.innerHTML = `<main style="max-width:600px;margin:10vh auto;font-family:system-ui"><h1>Intranet unavailable</h1><p>${escapeHtml(error.message)}</p><button type="button" onclick="location.reload()">Try again</button><p>Start the local container with <code>docker compose up --build</code>.</p></main>`; } }
initialize();
