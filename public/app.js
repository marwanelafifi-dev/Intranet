const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const icon = { mail:'✉', check:'✓', folder:'▰', life:'⌁', people:'♙', phone:'⌕', tree:'⌘', clock:'◷', cube:'◇', chart:'◫', spark:'✦', bot:'◉' };
let state, activeTag = 'All', publishType = 'announcement', activeContentType = 'announcement', editingContentId = null, editingMemberId = null, editingAppId = null, editingPortalId = null;
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
    bot: '<rect x="4" y="7" width="16" height="12" rx="4"/><path d="M12 4v3M8 13h.01M16 13h.01M9 17h6"/>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M2 21h20M8 7h2M12 7h2M8 11h2M12 11h2M8 15h2M12 15h2M17 9h3v12M17 13h3"/>',
    support: '<path d="M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v5H5a1 1 0 0 1-1-1v-4ZM20 13h-3v5h2a1 1 0 0 0 1-1v-4ZM17 20c-1 1-2.7 1.5-5 1.5"/>',
    payroll: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4M15 15h2"/>'
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
const dashboardLayout = ['announcements', 'new-members', 'new-warians', 'social', 'news', 'moments', 'knowledge', 'events', 'whistleblower'];
const dashboardLayoutVersion = 'structured-v5';
const memberEmploymentTypes = ['Full Time', 'Part Time', 'Summer Intern', 'Graduate Intern'];
const supportPortalDefaults = [
  { id: 'portal-company', name: 'Company Portal', description: 'Administration, Finance & People Team', url: '', icon: 'building' },
  { id: 'portal-service-desk', name: 'SolarWinds Service Desk', description: 'IT Support', url: '', icon: 'support' },
  { id: 'portal-mohr', name: 'MOHR', description: 'Payslips & HR topics', url: '', icon: 'payroll' }
];
const displayTimestamp = value => value ? new Intl.DateTimeFormat('en', { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'Africa/Cairo' }).format(new Date(value)) : 'No file uploaded';
function normalizeState(data) {
  data.newMembers ??= [];
  data.newMembers = data.newMembers.map(member => ({ ...member, employmentType: memberEmploymentTypes.includes(member.employmentType) ? member.employmentType : 'Full Time', department: member.department || member.team || 'To be confirmed', division: member.division || member.team || 'To be confirmed' }));
  data.policies ??= policyIndex.map((policy, index) => ({ id: `fallback-policy-${index}`, summary: policy.detail, canonicalUrl: policy.href, ...policy }));
  data.people ??= []; data.forms ??= []; data.faqs ??= []; data.serviceRequests ??= [];
  data.supportPortals ??= supportPortalDefaults.map(portal => ({ ...portal }));
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
  $$('#portal-manager .manager-row .app-icon').forEach((element, index) => { element.innerHTML = appIcon(state.supportPortals[index]?.icon); });
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
    const { videos = [], unavailable, stale } = await response.json();
    if (unavailable || !videos.length) throw new Error('Latest videos are unavailable');
    container.innerHTML = `${videos.slice(0, 3).map(video => `<a class="youtube-video" href="${escapeHtml(video.watchUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${escapeHtml(video.title)}" title="${escapeHtml(video.title)}"><img src="${escapeHtml(video.thumbnailUrl)}" alt="Thumbnail for ${escapeHtml(video.title)}" loading="lazy" /><span><b>${escapeHtml(video.title)}</b><small>${escapeHtml(displayYouTubeDate(video.published))}</small></span></a>`).join('')}${stale ? '<p class="youtube-feed-status">Showing the last saved channel updates while YouTube reconnects.</p>' : ''}`;
  } catch {
    container.innerHTML = '<p class="youtube-feed-status">Latest videos are temporarily unavailable. Visit the channel to watch Si-Ware’s newest uploads.</p>';
  }
}
function renderEvents() { $('#event-list').innerHTML = state.events.map(item => `<article class="event"><div class="date-block"><b>${item.day}</b><small>${item.month}</small></div><div><p>${escapeHtml(item.title)}</p><span>${escapeHtml(item.time)} · ${escapeHtml(item.type)}</span></div></article>`).join(''); }
function renderNewMembers() {
  $('#new-members-title').textContent = 'Recently Joined';
  $('.new-members-widget .widget-intro').textContent = 'Meet the newest colleagues who recently joined our company.';
  $('.new-members-widget .plain-button').setAttribute('href', '/recently-joined.html');
  const members = state.newMembers.slice(0, 2);
  $('#new-member-list').innerHTML = members.length ? members.map(member => `<article class="new-member">${member.photoUrl ? `<img class="new-member-avatar new-member-photo" src="${escapeHtml(member.photoUrl)}" alt="Photo of ${escapeHtml(member.name)}" />` : `<span class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}">${escapeHtml(member.initials || member.name.split(' ').map(part => part[0]).join('').slice(0, 2))}</span>`}<div><b>${escapeHtml(member.name)}</b><small>${escapeHtml(member.role)}</small><span>${escapeHtml(member.employmentType || 'Full Time')} · Joined ${escapeHtml(member.joined)}</span><span class="member-org">${escapeHtml(member.department || member.team)} · ${escapeHtml(member.division || member.team)}</span><span class="direct-manager">Direct Manager: ${escapeHtml(member.directManager || 'To be confirmed')}</span></div></article>`).join('') : '<p class="empty-state">No new member announcements are available right now.</p>';
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
    ...collect(state.newMembers, 'New member', item => item.name, item => `${item.role} ${item.team} ${item.department} ${item.division} ${item.employmentType} ${item.directManager}`, () => '/recently-joined.html'),
    ...collect(state.sessions, 'Knowledge', item => item.title, item => `${item.category} ${item.presenter.name}`, () => '/#knowledge'),
    ...collect(state.supportPortals, 'Company portal', item => item.name, item => item.description, item => item.url || '/new-hires.html#help'),
    ...collect(state.apps, 'App', item => item.name, item => item.caption, item => item.url)
  ].slice(0, 10);
}
async function renderGlobalResults() {
  const input = $('#global-search'), container = $('#global-results'), query = input.value, results = searchResults(query);
  container.hidden = !input.value.trim();
  if (query.trim().length >= 2) try { const remote = await request(`/api/search?q=${encodeURIComponent(query)}`); if (input.value !== query) return; remote.filter(item => item.type === 'Document').forEach(item => results.push({ ...item, icon:'search', external:false })); } catch { /* Local search remains available if document indexing is unavailable. */ }
  container.innerHTML = results.length ? results.map(item => `<a class="search-result" href="${escapeHtml(item.href)}" ${item.external ? 'target="_blank" rel="noreferrer"' : ''} role="option"><span class="search-result-icon">${item.icon}</span><span class="search-result-copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></span><span class="search-result-type">${item.type}</span></a>`).join('') : '<p class="search-empty">No results yet. Try a policy, person, session or app name.</p>';
}
function renderLayoutList() {
  const labels = { announcements:'Hero & announcements', 'new-members':'Recently Joined', 'new-warians':'New Si-Warians!', news:'Industry pulse', knowledge:'Knowledge Hub sessions', whistleblower:'Whistleblower', moments:'Moments gallery', social:'Company channels', events:'Calendar & key dates' };
  $('#layout-list').innerHTML = state.settings.layout.map(key => `<div class="layout-row" draggable="true" data-widget-key="${key}"><span class="drag" title="Drag to reorder">⠿</span><b>${labels[key]}</b><label><input type="checkbox" ${!state.settings.hiddenWidgets.includes(key) ? 'checked' : ''}> Visible</label></div>`).join('');
  installLayoutDrag();
}
function renderAppManager() { $('#app-manager').innerHTML = state.apps.map(app => `<article class="manager-row"><span class="app-icon" style="--app-color:${app.color}">${icon[app.icon] || '◈'}</span><span><b>${escapeHtml(app.name)}</b><small>${escapeHtml(app.caption)}</small></span><div class="record-actions"><button type="button" data-edit-app="${app.id}">Edit</button><button type="button" class="danger-action" data-remove-app="${app.id}">Remove</button></div></article>`).join(''); }
function ensurePortalAdmin() {
  const appsTab = $('#tab-apps');
  if (!appsTab || $('#portal-manager')) return;
  appsTab.insertAdjacentHTML('beforeend', '<h3 class="admin-subhead">Company portals</h3><p class="cms-intro">Set each portal’s link, supporting description, and icon for the New Si-Warians! help page.</p><div id="portal-manager" class="app-manager"></div><form id="portal-form" class="admin-form"></form>');
}
function renderPortalManager() {
  const manager = $('#portal-manager');
  if (!manager) return;
  manager.innerHTML = state.supportPortals.map(portal => `<article class="manager-row"><span class="app-icon">${appIcon(portal.icon)}</span><span><b>${escapeHtml(portal.name)}</b><small>${escapeHtml(portal.url || 'Link not configured')}</small></span><div class="record-actions"><button type="button" data-edit-portal="${portal.id}">Edit</button></div></article>`).join('');
}
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
function renderAll() { ensurePortalAdmin(); renderApps(); renderAnnouncement(); renderNewMembers(); renderNews(); renderTags(); renderSessions(); renderMoments(); renderEvents(); renderProfile(); renderLayoutList(); renderAppManager(); renderPortalManager(); setupNewMemberAdmin(); renderVectorIcons(); applyLayout(); }

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
  if (!file || !file.name) return Promise.resolve('');
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) return Promise.reject(new Error('Choose a PNG, JPEG, WebP or GIF image.'));
  if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error('Photo must be no larger than 2 MB.'));
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The photo could not be read.')); reader.readAsDataURL(file); });
}
function readAdminFile(file, accepted, maxSize = 10 * 1024 * 1024) {
  if (!file || !file.name) return Promise.resolve('');
  if (!accepted.includes(file.type)) return Promise.reject(new Error('Choose a supported file type.'));
  if (file.size > maxSize) return Promise.reject(new Error('File must be no larger than 10 MB.'));
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The file could not be read.')); reader.readAsDataURL(file); });
}
async function uploadAdminFile(file, accepted, maxSize) {
  if (!file || !file.name) return '';
  const dataUrl = await readAdminFile(file, accepted, maxSize);
  return (await request('/api/uploads', { method:'POST', body:JSON.stringify({ dataUrl, filename:file.name }) })).url;
}
function renderAdminOverview() {
  const visible = state.settings.layout.filter(key => !state.settings.hiddenWidgets.includes(key)).length;
  $('#admin-overview').innerHTML = `<div class="admin-summary"><h3>Everything in one place</h3><p>Changes are saved immediately to the employee experience.</p><dl><div><dt>${state.announcements.length}</dt><dd>announcements</dd></div><div><dt>${state.newMembers.length}</dt><dd>recent joins</dd></div><div><dt>${visible}</dt><dd>visible sections</dd></div></dl></div><div class="admin-quick-actions"><button type="button" data-go-admin="content">Manage content</button><button type="button" data-go-admin="people">Update people</button><button type="button" data-go-admin="layout">Arrange dashboard</button><button type="button" data-go-admin="apps">Manage apps</button></div>`;
}
function renderContentManager() {
  const config = activeContentType === 'announcement' ? { list:state.announcements, title:x => x.title, detail:x => x.date || 'No date' } : activeContentType === 'session' ? { list:state.sessions, title:x => x.title, detail:x => `${x.presenter?.name || 'Si-Ware team'} · ${x.category || 'General'}` } : { list:state.policies, title:x => x.title, detail:x => `${x.owner || 'No owner'} · ${x.version || 'Draft'}` };
  $('#content-manager').innerHTML = config.list.length ? config.list.map(item => `<article class="record-row"><span><b>${escapeHtml(config.title(item))}</b><small>${escapeHtml(config.detail(item))}</small></span><div class="record-actions"><button type="button" data-edit-content="${item.id}">Edit</button><button type="button" class="danger-action" data-remove-content="${item.id}">Remove</button></div></article>`).join('') : '<p class="admin-empty">Nothing here yet. Use the form below to add the first record.</p>';
  const item = editingContentId && config.list.find(entry => entry.id === editingContentId);
  const button = item ? 'Save changes' : `Add ${activeContentType === 'session' ? 'session' : activeContentType}`;
  const common = `<label>Title<input name="title" required maxlength="120" value="${escapeHtml(item?.title || '')}" placeholder="Clear, employee-facing title" /></label>`;
  const fields = activeContentType === 'announcement' ? `${common}<label>Message<textarea name="body" rows="3" required maxlength="360" placeholder="What should employees know?">${escapeHtml(item?.body || '')}</textarea></label><label>Label<input name="tag" maxlength="40" value="${escapeHtml(item?.tag || 'Company update')}" /></label>` : activeContentType === 'session' ? `${common}<label>Presenter<input name="presenter" required maxlength="80" value="${escapeHtml(item?.presenter?.name || '')}" /></label><label>Category<select name="category">${['Photonics','Patents','MEMS','AI'].map(value => `<option ${item?.category === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Date<input name="date" type="date" value="${escapeHtml(item?.date || new Date().toISOString().slice(0,10))}" /></label><label>Summary<textarea name="outline" rows="3" maxlength="360">${escapeHtml(item?.outline || '')}</textarea></label><label>Presentation deck (PDF)<input name="attachment" type="file" accept="application/pdf" /><small>${item?.presentationDeckUrl ? 'A deck is already attached. Choose a new file to replace it.' : 'Optional PDF, up to 10 MB.'}</small></label>` : `${common}<label>Summary<textarea name="summary" rows="3" required maxlength="360">${escapeHtml(item?.summary || '')}</textarea></label><label>Owner<input name="owner" required maxlength="80" value="${escapeHtml(item?.owner || '')}" /></label><label>Audience<input name="audience" maxlength="120" value="${escapeHtml(item?.audience || 'All employees')}" /></label><label>Version<input name="version" maxlength="20" value="${escapeHtml(item?.version || 'v1.0')}" /></label><label>Modified timestamp<input value="${escapeHtml(displayTimestamp(item?.modifiedAt))}" readonly /><small>Set automatically when the policy PDF is uploaded or replaced.</small></label><label>Policy document (PDF)<input name="attachment" type="file" accept="application/pdf" /><small>${item?.canonicalUrl?.startsWith('/uploads/') ? 'A document is already attached. Choose a new file to replace it.' : 'Upload a PDF to make it available to employees, up to 10 MB.'}</small></label>`;
  $('#content-form').innerHTML = `<h3>${item ? 'Edit record' : 'Add record'}</h3>${fields}<div class="admin-actions"><button type="button" class="secondary-button" data-cancel-content ${item ? '' : 'hidden'}>Cancel</button><button class="primary-button" type="submit">${button}</button></div><p class="form-status" role="status"></p>`;
}
function renderMemberManager() {
  $('#member-manager').innerHTML = state.newMembers.length ? state.newMembers.map(member => `<article class="record-row"><span><b>${escapeHtml(member.name)}</b><small>${escapeHtml(member.role)} · ${escapeHtml(member.employmentType)}</small></span><div class="record-actions"><button type="button" data-edit-member="${member.id}">Edit</button><button type="button" class="danger-action" data-remove-member="${member.id}">Remove</button></div></article>`).join('') : '<p class="admin-empty">No recently joined colleagues yet.</p>';
  const member = editingMemberId && state.newMembers.find(entry => entry.id === editingMemberId);
  const text = (name, label, placeholder = '') => `<label>${label}<input name="${name}" required maxlength="100" value="${escapeHtml(member?.[name] || '')}" placeholder="${placeholder}" /></label>`;
  $('#new-member-form').innerHTML = `<h3>${member ? 'Edit colleague' : 'Add colleague'}</h3><div class="admin-form-grid">${text('name','Full name','Employee name')}${text('role','Role','Job title')}<label>Employment type<select name="employmentType">${memberEmploymentTypes.map(value => `<option ${member?.employmentType === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>${text('team','Team','Team or squad')}${text('department','Department','Department')}${text('division','Division','Division')}${text('directManager','Direct manager','Manager name')}${text('joined','Joined','e.g. October 2026')}</div><label>Welcome message<textarea name="message" rows="3" maxlength="240" placeholder="Optional welcome note">${escapeHtml(member?.message || '')}</textarea></label><label>Employee photo<input name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /><small>${member?.photoUrl ? 'A photo is already attached. Choose a new image to replace it.' : 'Optional PNG, JPEG, WebP or GIF, up to 2 MB.'}</small></label><div class="admin-actions"><button type="button" class="secondary-button" data-cancel-member ${member ? '' : 'hidden'}>Cancel</button><button class="primary-button" type="submit">${member ? 'Save colleague' : 'Add colleague'}</button></div><p class="form-status" role="status"></p>`;
}
function renderAppForm() {
  const app = editingAppId && state.apps.find(entry => entry.id === editingAppId);
  $('#app-form').innerHTML = `<h3>${app ? 'Edit shortcut' : 'Add shortcut'}</h3><label>Name<input name="name" required maxlength="40" value="${escapeHtml(app?.name || '')}" placeholder="Shortcut name" /></label><label>Description<input name="caption" required maxlength="80" value="${escapeHtml(app?.caption || '')}" placeholder="What it helps employees do" /></label><label>Destination<input name="url" required value="${escapeHtml(app?.url || '')}" placeholder="https:// or /internal-page" /></label><label>Accent colour<input name="color" type="color" value="${escapeHtml(app?.color || '#5964db')}" /></label><div class="admin-actions"><button type="button" class="secondary-button" data-cancel-app ${app ? '' : 'hidden'}>Cancel</button><button class="primary-button" type="submit">${app ? 'Save shortcut' : 'Add shortcut'}</button></div><p class="form-status" role="status"></p>`;
}
function renderPortalForm() {
  const portal = editingPortalId && state.supportPortals.find(entry => entry.id === editingPortalId);
  const form = $('#portal-form');
  if (!form) return;
  const iconOptions = [['building', 'Company portal'], ['support', 'IT Support'], ['payroll', 'Payslips & HR']];
  form.innerHTML = portal ? `<h3>Edit company portal</h3><div class="admin-form-grid"><label>Name<input name="name" required maxlength="60" value="${escapeHtml(portal.name)}" /></label><label>Icon<select name="icon">${iconOptions.map(([value, label]) => `<option value="${value}" ${portal.icon === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label>Description<input name="description" required maxlength="100" value="${escapeHtml(portal.description)}" placeholder="What employees can do here" /></label><label>Destination link<input name="url" inputmode="url" value="${escapeHtml(portal.url || '')}" placeholder="https://portal.example.com" /><small>Use https:// for an external portal or /page for an intranet route. Leave blank while the destination is being prepared.</small></label><div class="admin-actions"><button type="button" class="secondary-button" data-cancel-portal>Cancel</button><button class="primary-button" type="submit">Save portal</button></div><p class="form-status" role="status"></p>` : '<p class="form-status">Select a company portal above to configure its destination and icon.</p>';
}
function setupNewMemberAdmin() { renderAdminOverview(); renderContentManager(); renderMemberManager(); renderAppForm(); renderPortalForm(); }

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
  $('#layout-list').addEventListener('change', event => { const row = event.target.closest('.layout-row'); const key = row.dataset.widgetKey; state.settings.hiddenWidgets = event.target.checked ? state.settings.hiddenWidgets.filter(x => x !== key) : [...new Set([...state.settings.hiddenWidgets, key])]; applyLayout(); });
  $('#save-layout').addEventListener('click', async () => { state.settings.layout = $$('#layout-list .layout-row').map(row => row.dataset.widgetKey); await saveDashboard('Dashboard layout saved'); });
  $('#reset-layout').addEventListener('click', () => { state.settings.layout = [...dashboardLayout]; state.settings.hiddenWidgets = []; renderLayoutList(); applyLayout(); showToast('Default layout restored. Save to publish it.'); });
  $('#admin-overview').addEventListener('click', event => { const tab = event.target.dataset.goAdmin; if (tab) switchCmsTab(tab); });
  $('.content-type-switch').addEventListener('click', event => { const type = event.target.dataset.contentType; if (!type) return; activeContentType = type; editingContentId = null; $$('.content-type-switch button').forEach(button => button.classList.toggle('active', button.dataset.contentType === type)); renderContentManager(); });
  $('#content-manager').addEventListener('click', async event => { const edit = event.target.dataset.editContent, remove = event.target.dataset.removeContent; const key = activeContentType === 'announcement' ? 'announcements' : activeContentType === 'session' ? 'sessions' : 'policies'; if (edit) { editingContentId = edit; renderContentManager(); return; } if (remove && window.confirm('Remove this record? This cannot be undone from the administration panel.')) { state[key] = state[key].filter(item => item.id !== remove); await saveDashboard('Content removed'); } });
  $('#content-form').addEventListener('click', event => { if (event.target.dataset.cancelContent !== undefined) { editingContentId = null; renderContentManager(); } });
  $('#content-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget), key = activeContentType === 'announcement' ? 'announcements' : activeContentType === 'session' ? 'sessions' : 'policies'; const existing = editingContentId && state[key].find(item => item.id === editingContentId); const attachment = form.get('attachment'); let record; if (activeContentType === 'announcement') record = { ...(existing || { id:`announcement-${Date.now()}`, date:'Just now', priority:'normal' }), title:form.get('title'), body:form.get('body'), tag:form.get('tag') || 'Company update' }; else if (activeContentType === 'session') { const presenter = form.get('presenter'), deckUrl = await uploadAdminFile(attachment, ['application/pdf']); record = { ...(existing || { id:`session-${Date.now()}`, presentationDeckUrl:'/docs/new-session.pdf', recordingUrl:'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' }), title:form.get('title'), presenter:{ name:presenter, initials:presenter.split(' ').map(part => part[0]).join('').slice(0,2) }, category:form.get('category'), date:form.get('date'), outline:form.get('outline'), ...(deckUrl ? { presentationDeckUrl:deckUrl } : {}) }; } else { const policyUrl = await uploadAdminFile(attachment, ['application/pdf']); record = { ...(existing || { id:`policy-${Date.now()}`, canonicalUrl:'/new-hires.html#policies', category:'General' }), title:form.get('title'), summary:form.get('summary'), owner:form.get('owner'), audience:form.get('audience'), version:form.get('version'), ...(policyUrl ? { canonicalUrl:policyUrl } : {}) }; } if (existing) Object.assign(existing, record); else state[key].unshift(record); editingContentId = null; await saveDashboard(existing ? 'Content updated' : 'Content added'); });
  $('#member-manager').addEventListener('click', async event => { const edit = event.target.dataset.editMember, remove = event.target.dataset.removeMember; if (edit) { editingMemberId = edit; renderMemberManager(); return; } if (remove && window.confirm('Remove this colleague from Recently Joined?')) { state.newMembers = state.newMembers.filter(member => member.id !== remove); await saveDashboard('Recently joined colleague removed'); } });
  $('#new-member-form').addEventListener('click', event => { if (event.target.dataset.cancelMember !== undefined) { editingMemberId = null; renderMemberManager(); } });
  $('#new-member-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget), existing = editingMemberId && state.newMembers.find(member => member.id === editingMemberId); const name = form.get('name'), photoUrl = await uploadAdminFile(form.get('photo'), ['image/png','image/jpeg','image/webp','image/gif'], 2 * 1024 * 1024); const record = { ...(existing || { id:`member-${Date.now()}`, initials:name.split(' ').map(part => part[0]).join('').slice(0,2), color:'#dceeff' }), name, role:form.get('role'), employmentType:form.get('employmentType'), team:form.get('team'), department:form.get('department'), division:form.get('division'), directManager:form.get('directManager'), joined:form.get('joined'), message:form.get('message'), ...(photoUrl ? { photoUrl } : {}) }; if (existing) Object.assign(existing, record); else state.newMembers.unshift(record); editingMemberId = null; await saveDashboard(existing ? 'Colleague updated' : 'Recently joined colleague added'); });
  $('#app-manager').addEventListener('click', async event => { const edit = event.target.dataset.editApp, remove = event.target.dataset.removeApp; if (edit) { editingAppId = edit; renderAppForm(); return; } if (remove && window.confirm('Remove this Quick Launch shortcut?')) { state.apps = state.apps.filter(app => app.id !== remove); await saveDashboard('Shortcut removed'); } });
  $('#app-form').addEventListener('click', event => { if (event.target.dataset.cancelApp !== undefined) { editingAppId = null; renderAppForm(); } });
  $('#app-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget), existing = editingAppId && state.apps.find(app => app.id === editingAppId); const record = { ...(existing || { id:`custom-${Date.now()}`, icon:'spark' }), name:form.get('name'), caption:form.get('caption'), url:form.get('url'), color:form.get('color') }; if (existing) Object.assign(existing, record); else state.apps.push(record); editingAppId = null; await saveDashboard(existing ? 'Shortcut updated' : 'Shortcut added'); });
  $('#portal-manager').addEventListener('click', event => { const edit = event.target.dataset.editPortal; if (!edit) return; editingPortalId = edit; renderPortalForm(); document.querySelector('#portal-form')?.scrollIntoView({ behavior:'smooth', block:'nearest' }); });
  $('#portal-form').addEventListener('click', event => { if (event.target.dataset.cancelPortal !== undefined) { editingPortalId = null; renderPortalForm(); } });
  $('#portal-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget), portal = state.supportPortals.find(entry => entry.id === editingPortalId), url = String(form.get('url')).trim(); if (!portal) return; if (url && !/^(https?:\/\/|\/|#)/i.test(url)) { event.currentTarget.querySelector('.form-status').textContent = 'Use an https:// link or an intranet path beginning with / or #.'; return; } Object.assign(portal, { name:String(form.get('name')).trim(), description:String(form.get('description')).trim(), url, icon:String(form.get('icon')) }); editingPortalId = null; await saveDashboard('Company portal updated'); });
  $('#global-search').addEventListener('input', renderGlobalResults);
  $('#global-search').addEventListener('keydown', event => { if (event.key === 'Enter') { const first = $('#global-results .search-result'); if (first) { window.location.assign(first.href); return; } $('#session-search').value = event.target.value; $('#knowledge').scrollIntoView(); renderSessions(); } });
  document.addEventListener('click', event => { if (!event.target.closest('.global-search-wrap')) $('#global-results').hidden = true; });
  document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#global-search').focus(); } if (event.key === 'Escape') { closeCMS(); const nudge = $('#explore-nudge'); if (nudge && !nudge.hidden) { nudge.hidden = true; sessionStorage.setItem('siware-explore-nudge-v2-dismissed', 'true'); } } });
  $('#hero-action').addEventListener('click', () => $('#knowledge').scrollIntoView());
  $('#view-all-sessions').addEventListener('click', () => { activeTag = 'All'; $('#session-search').value = ''; renderTags(); renderSessions(); });
  $('#gallery-next').addEventListener('click', () => { state.moments.push(state.moments.shift()); renderMoments(); acknowledgeContentChange($('#moments-grid')); });
  [['#view-gallery','Gallery opening soon'],['#calendar-button','Calendar integration coming soon']].forEach(([selector, message]) => $(selector).addEventListener('click', event => { event.preventDefault(); showToast(message); }));
}
async function initialize() { try { state = normalizeState(await request('/api/dashboard')); placeCmsToggleInHeader(); renderAll(); [['#facebook-link', 'Facebook'], ['#linkedin-link', 'LinkedIn']].forEach(([selector, network]) => { const link = $(selector); if (link) { link.innerHTML = 'Visit Page <span>↗</span>'; link.setAttribute('aria-label', `Visit Si-Ware ${network} page`); } }); setupEvents(); setupExploreNudge(); renderYouTubeVideos(); } catch (error) { document.body.innerHTML = `<main style="max-width:600px;margin:10vh auto;font-family:system-ui"><h1>Intranet unavailable</h1><p>${escapeHtml(error.message)}</p><button type="button" onclick="location.reload()">Try again</button><p>Start the local container with <code>docker compose up --build</code>.</p></main>`; } }
initialize();
