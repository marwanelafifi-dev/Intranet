import { renderNewsShifter } from './news-shifter.js?v=20261017-current-administration';

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const icon = { mail:'✉', check:'✓', folder:'▰', life:'⌁', people:'♙', phone:'⌕', tree:'⌘', clock:'◷', cube:'◇', chart:'◫', spark:'✦', bot:'◉' };
let state, activeTag = 'All', knowledgePage = 1, publishType = 'announcement', activeContentType = 'announcement', editingContentId = null, editingMemberId = null, editingAppId = null, editingPortalId = null, editingNewSiPolicyId = null, editingChecklistItemId = null, acknowledgementPage = 1, acknowledgementQuery = '';
const knowledgePageSize = 10;
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
const dashboardLayout = ['announcements', 'new-members', 'company-news', 'social', 'news', 'moments', 'knowledge', 'events', 'whistleblower'];
const newsFirstDashboardLayout = ['company-news', 'announcements', 'new-members', 'social', 'news', 'moments', 'knowledge', 'events', 'whistleblower'];
const dashboardLayoutVersion = 'company-news-v1';
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
  data.policyAcknowledgementContent = { version:1, actionTitle:'Action required: acknowledge Si-Ware Policies', instructionText:'Before continuing, carefully review the mandatory policies below and record your acknowledgement in place of the former email reply.', beforeHeading:'Why this matters', beforeText:'Please read the mandatory Si-Ware Information Security Policy carefully. It covers information-handling policies including Computer Acceptable Use, Password, PDA/Smartphone and Remote Access, together with security awareness for your laptop, PC and mobile devices, physical security, virus protection, spyware/malware and social engineering/phishing. All Si-Ware users must know and adhere to these requirements. Confirmation is mandatory under Si-Ware security regulations.', confirmationLabel:'I confirm that I have read and accepted Si-Ware Policies.', confirmationHelp:'This records the current policy versions and confirmation time.', acceptedTitle:'Policies acknowledged', afterText:'Your acknowledgement has been recorded for the current policy versions.', ...(data.policyAcknowledgementContent || {}) };
  data.firstWeekChecklist ??= [
    { id:'systems', text:'Sign in to Gmail, ClickUp, Document Drive and the Time Tracker.' },
    { id:'hr-profile', text:'Complete your HR profile and emergency-contact information in MOHR.' },
    { id:'manager', text:'Meet your manager to agree your 30-day priorities and team rhythm.' },
    { id:'orientation', text:'Book your orientation, information-security and workplace-safety sessions.' },
    { id:'knowledge', text:'Save this page and explore the Knowledge Hub for your role.' }
  ];
  data.people ??= []; data.forms ??= []; data.faqs ??= []; data.serviceRequests ??= [];
  data.moments ??= [];
  data.moments = data.moments.map((moment, index) => ({ ...moment, id:moment.id || `moment-${index + 1}` }));
  data.supportPortals ??= supportPortalDefaults.map(portal => ({ ...portal }));
  data.settings ??= { hiddenWidgets: [], layout: dashboardLayout };
  data.settings.hiddenWidgets ??= [];
  if (data.settings.layout?.includes('actions')) data.settings.layout = data.settings.layout.map(item => item === 'actions' ? 'new-members' : item);
  if (data.settings.layout?.includes('new-warians')) data.settings.layout = data.settings.layout.map(item => item === 'new-warians' ? 'company-news' : item);
  if (!data.settings.layout?.length || data.settings.layout.join(',') === newsFirstDashboardLayout.join(',')) {
    data.settings.layout = [...dashboardLayout];
  }
  data.settings.layoutVersion = dashboardLayoutVersion;
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

function appIconMarkup(app) { return app.iconUrl ? `<img src="${escapeHtml(app.iconUrl)}" alt="" />` : (icon[app.icon] || '◈'); }
function renderApps() {
  $('#app-grid').innerHTML = state.apps.map(app => `<a class="app-link" href="${escapeHtml(app.url)}" ${app.url.startsWith('http') ? 'target="_blank" rel="noreferrer"' : ''} style="--app-color:${app.color}"><span class="app-icon">${appIconMarkup(app)}</span><b>${escapeHtml(app.name)}</b><small>${escapeHtml(app.caption)}</small></a>`).join('');
  setupAppCarousel();
}
function setupAppCarousel() {
  const grid = $('#app-grid'), previous = $('#app-carousel-prev'), next = $('#app-carousel-next'), status = $('#app-carousel-status');
  if (!grid || !previous || !next || !status) return;
  const itemLeft = item => item.getBoundingClientRect().left - grid.getBoundingClientRect().left + grid.scrollLeft;
  const update = () => {
    const items = $$('#app-grid .app-link');
    const first = items.findIndex(item => itemLeft(item) + item.offsetWidth > grid.scrollLeft + 2);
    const last = items.findLastIndex(item => itemLeft(item) < grid.scrollLeft + grid.clientWidth - 2);
    previous.disabled = grid.scrollLeft <= 2;
    next.disabled = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 2;
    status.textContent = items.length ? `Showing applications ${Math.max(1, first + 1)} to ${Math.max(1, last + 1)} of ${items.length}` : 'No applications are available.';
  };
  if (!grid.dataset.carouselReady) {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let autoplayId, resumeId;
    const step = () => {
      const items = $$('#app-grid .app-link');
      const current = items.reduce((closest, item, index) => Math.abs(itemLeft(item) - grid.scrollLeft) < Math.abs(itemLeft(items[closest]) - grid.scrollLeft) ? index : closest, 0);
      return items[Math.max(0, Math.min(items.length - 1, current))];
    };
    const move = direction => {
      const items = $$('#app-grid .app-link'), current = step();
      const currentIndex = items.indexOf(current), nextIndex = Math.max(0, Math.min(items.length - 1, currentIndex + direction));
      if (items[nextIndex]) grid.scrollTo({ left: itemLeft(items[nextIndex]), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    };
    const stopAutoplay = () => { window.clearInterval(autoplayId); autoplayId = undefined; };
    const startAutoplay = () => {
      stopAutoplay();
      if (reducedMotion.matches || grid.scrollWidth <= grid.clientWidth + 2 || document.hidden) return;
      autoplayId = window.setInterval(() => {
        if (document.hidden || grid.matches(':hover') || grid.contains(document.activeElement)) return;
        const atEnd = grid.scrollLeft + grid.clientWidth >= grid.scrollWidth - 2;
        if (atEnd) grid.scrollTo({ left: 0, behavior: 'auto' }); else move(1);
      }, 5200);
    };
    const pauseForInteraction = () => {
      stopAutoplay();
      window.clearTimeout(resumeId);
      resumeId = window.setTimeout(startAutoplay, 8000);
    };
    previous.addEventListener('click', () => { pauseForInteraction(); move(-1); });
    next.addEventListener('click', () => { pauseForInteraction(); move(1); });
    grid.addEventListener('scroll', update, { passive:true });
    grid.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault(); pauseForInteraction(); move(event.key === 'ArrowLeft' ? -1 : 1);
    });
    grid.addEventListener('pointerdown', pauseForInteraction, { passive:true });
    grid.addEventListener('mouseenter', stopAutoplay);
    grid.addEventListener('mouseleave', startAutoplay);
    grid.addEventListener('focusin', stopAutoplay);
    grid.addEventListener('focusout', () => window.setTimeout(startAutoplay, 0));
    document.addEventListener('visibilitychange', () => document.hidden ? stopAutoplay() : startAutoplay());
    window.addEventListener('resize', update);
    grid.dataset.carouselReady = 'true';
    startAutoplay();
  }
  requestAnimationFrame(update);
}
function announcementPreview(value, title = '') {
  const paragraphs = String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .split(/\n{2,}|\r\n{2,}/)
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const normalizedTitle = String(title || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const text = paragraphs.find(part => part.length > 45 && part.toLowerCase() !== normalizedTitle && !/^dear\b/i.test(part)) || paragraphs.find(part => part.toLowerCase() !== normalizedTitle) || '';
  return text.length > 86 ? `${text.slice(0, 83).trimEnd()}…` : text;
}
function renderAnnouncement() {
  const items = state.announcements.filter(item => item.hidden !== true && item.hidden !== 'true').slice(0, 4);
  $('#announcement-spotlight').innerHTML = items.length ? items.map(item => `<article class="priority-announcement" data-open-announcement="${escapeHtml(item.id)}" tabindex="0" role="link" aria-label="View full announcement: ${escapeHtml(item.title)}"><div><span>${escapeHtml(item.tag || 'Company update')}</span><time>${escapeHtml(item.date || 'Just now')}</time></div><h3>${escapeHtml(item.title)}</h3><small class="priority-targeting">${escapeHtml(item.department || 'All departments')} · ${escapeHtml(item.audience || 'All employees')}</small><small class="priority-preview">${escapeHtml(announcementPreview(item.body || item.message || item.description || item.bodyHtml, item.title))}</small><div class="priority-footer"><span class="priority-open">View full announcement <b aria-hidden="true">→</b></span><small class="priority-author">Posted by ${escapeHtml(item.postedBy || 'Intranet team')}</small></div></article>`).join('') : '<p class="priority-empty">No announcements have been published yet.</p>';
}
function renderVectorIcons() {
  $$('#app-grid .app-icon').forEach((element, index) => { if (!state.apps[index]?.iconUrl) element.innerHTML = appIcon(state.apps[index]?.icon); });
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
function renderCompanyNews() { renderNewsShifter($('#dashboard-news-shifter')); }
function sessionResourceLink(url, filename, label, sessionTitle = '', resourceType = '') {
  const resolvedUrl = url
    || knowledgeResourceLinks[knowledgeResourceKey(filename)]
    || (resourceType === 'materials' && (knowledgeMaterialLinks[knowledgeResourceKey(filename)] || knowledgeMaterialLinks[knowledgeResourceKey(sessionTitle)]));
  if (resolvedUrl) return `<a class="session-resource" href="${escapeHtml(resolvedUrl)}" target="_blank" rel="noreferrer">${label}</a>`;
  return filename ? `<span class="session-resource-pending" title="${escapeHtml(filename)}">${escapeHtml(filename)}</span>` : '<span class="session-resource-empty">—</span>';
}
function renderSessions() {
  const term = $('#session-search').value.trim().toLowerCase();
  const result = state.sessions
    .filter(session => activeTag === 'All' || session.category === activeTag)
    .filter(session => [session.title, session.presenter.name, session.category].join(' ').toLowerCase().includes(term))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const totalPages = Math.max(1, Math.ceil(result.length / knowledgePageSize));
  knowledgePage = Math.min(Math.max(knowledgePage, 1), totalPages);
  const start = (knowledgePage - 1) * knowledgePageSize;
  const visibleSessions = result.slice(start, start + knowledgePageSize);
  $('#session-list').innerHTML = visibleSessions.map(session => `<tr><td>${escapeHtml(session.title)}</td><td><span class="speaker"><span class="avatar">${escapeHtml(session.presenter.initials || session.presenter.name.split(' ').map(x => x[0]).join('').slice(0,2))}</span>${escapeHtml(session.presenter.name)}</span></td><td>${dateLabel(session.date)}</td><td><span class="session-outline" title="${escapeHtml(session.outline || '')}">${escapeHtml(session.outline || '—')}</span></td><td>${sessionResourceLink(session.recordingUrl, session.recordingFilename, 'Watch', session.title, 'recording')}</td><td>${sessionResourceLink(session.presentationDeckUrl, session.presentationFilename, 'Open', session.title, 'presentation')}</td><td>${sessionResourceLink(session.supportingMaterialsUrl, session.supportingMaterialsFilename, 'Open', session.title, 'materials')}</td></tr>`).join('');
  $('#session-empty').hidden = Boolean(result.length);
  const pagination = $('#session-pagination');
  pagination.hidden = result.length <= knowledgePageSize;
  pagination.innerHTML = result.length ? `<span class="session-count" aria-live="polite">Showing ${start + 1}–${Math.min(start + knowledgePageSize, result.length)} of ${result.length} sessions</span><div class="session-page-actions"><button type="button" class="session-page-button" data-session-page="previous" ${knowledgePage === 1 ? 'disabled' : ''}>Previous</button><span class="session-page-current">Page ${knowledgePage} of ${totalPages}</span><button type="button" class="session-page-button" data-session-page="next" ${knowledgePage === totalPages ? 'disabled' : ''}>Next</button></div>` : '';
}
function renderTags() {
  const tags = ['All', ...new Set(state.sessions.map(item => item.category))];
  $('#tag-filters').innerHTML = tags.map(tag => `<button class="${tag === activeTag ? 'active' : ''}" data-tag="${tag}">${tag}</button>`).join('');
}
function momentMediaKind(url) {
  const pathname = String(url || '').split(/[?#]/)[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif)$/.test(pathname)) return 'photo';
  if (/\.(mp4|webm|mov)$/.test(pathname)) return 'video';
  if (/\.pdf$/.test(pathname)) return 'pdf';
  if (/\.(ppt|pptx)$/.test(pathname)) return 'presentation';
  return '';
}
let galleryOpen = false;
function renderMoment(item, expanded = false) {
    const mediaKind = momentMediaKind(item.mediaUrl), mediaLabel = { photo:'Open photo', video:'Watch video', pdf:'Open PDF', presentation:'Open presentation' }[mediaKind] || '';
    const visual = mediaKind === 'photo' ? `<img class="moment-photo" src="${escapeHtml(item.mediaUrl)}" alt="" />` : mediaKind === 'video' ? `<video class="moment-video" src="${escapeHtml(item.mediaUrl)}" muted autoplay loop playsinline preload="metadata" aria-hidden="true"></video>` : '';
    const contents = `${visual}<span>${escapeHtml(item.kind)}</span><small>${escapeHtml(item.title)}${mediaLabel ? `<em>${mediaLabel}</em>` : ''}</small>`;
    const className = `moment${item.mediaUrl ? ' has-media' : ''}${expanded ? ' gallery-moment' : ''}`;
    return item.mediaUrl ? `<a class="${className}" href="${escapeHtml(item.mediaUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(mediaLabel)}: ${escapeHtml(item.title)}" style="--moment:${escapeHtml(item.color)}">${contents}</a>` : `<article class="${className}" style="--moment:${escapeHtml(item.color)}">${contents}</article>`;
}
function renderMoments() {
  const highlights = $('#moments-grid'), gallery = $('#moments-gallery'), toggle = $('#view-gallery'), next = $('#gallery-next');
  highlights.innerHTML = state.moments.map(item => renderMoment(item)).join('');
  if (!gallery || !toggle) return;
  highlights.hidden = galleryOpen;
  gallery.hidden = !galleryOpen;
  if (next) next.hidden = galleryOpen;
  gallery.innerHTML = state.moments.map(item => renderMoment(item, true)).join('');
  toggle.setAttribute('aria-expanded', String(galleryOpen));
  toggle.innerHTML = galleryOpen ? 'Back to highlights <span>↑</span>' : 'View gallery <span>→</span>';
}
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
function memberContactIcon(type) {
  const icons = {
    email: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="m4.5 7 7.5 5.5L19.5 7"></path></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.1 3.8h2.8l1.3 4-2 1.5c1.1 2.2 2.9 4 5.1 5.1l1.5-2 4 1.3v2.8c0 1-.8 1.7-1.8 1.7C11.6 18.2 5.8 12.4 5.8 5.6c0-1 .3-1.8 1.3-1.8Z"></path></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 10v6M8 7.5v.1M11.5 16v-3.3a2.2 2.2 0 0 1 4.4 0V16M11.5 10v6"></path></svg>'
  };
  return icons[type] || '';
}
function compactMemberContacts(member) {
  const links = [], name = escapeHtml(member.name);
  if (member.companyEmail) links.push(`<a class="member-contact-icon" href="mailto:${escapeHtml(member.companyEmail)}" aria-label="Email ${name}">${memberContactIcon('email')}<span class="sr-only">Email</span></a>`);
  if (member.phone) links.push(`<a class="member-contact-icon" href="tel:${escapeHtml(String(member.phone).replace(/[^+\d().\-\s]/g, ''))}" aria-label="Call ${name}">${memberContactIcon('phone')}<span class="sr-only">Phone</span></a>`);
  if (/^https?:\/\/(?:[\w-]+\.)*linkedin\.com\//i.test(String(member.linkedinUrl || ''))) links.push(`<a class="member-contact-icon" href="${escapeHtml(member.linkedinUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${name}'s LinkedIn profile">${memberContactIcon('linkedin')}<span class="sr-only">LinkedIn</span></a>`);
  return links.length ? `<nav class="member-contact-links member-contact-links-compact" aria-label="Contact ${name}">${links.join('')}</nav>` : '';
}
function renderNewMembers() {
  $('#new-members-title').textContent = 'Recently Joined';
  $('.new-members-widget .widget-intro').textContent = 'Meet the newest colleagues who recently joined our company.';
  $('.new-members-widget .plain-button').setAttribute('href', '/recently-joined.html');
  const members = state.newMembers.slice(0, 2);
  $('#new-member-list').innerHTML = members.length ? members.map(member => `<article class="new-member">${member.photoUrl ? `<img class="new-member-avatar new-member-photo" src="${escapeHtml(member.photoUrl)}" alt="Photo of ${escapeHtml(member.name)}" />` : `<span class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}">${escapeHtml(member.initials || member.name.split(' ').map(part => part[0]).join('').slice(0, 2))}</span>`}<div><div class="member-name-line"><b>${escapeHtml(member.name)}</b>${compactMemberContacts(member)}</div><small>${escapeHtml(member.role)} · ${escapeHtml(member.division || member.team || 'To be confirmed')}</small><span class="direct-manager">Direct Manager: ${escapeHtml(member.directManager || 'To be confirmed')}</span><span>${escapeHtml(member.employmentType || 'Full Time')} · Joined ${escapeHtml(member.joined)}</span></div></article>`).join('') : '<p class="empty-state">No new member announcements are available right now.</p>';
}
function renderProfile() {
  const accessLabel = state.user.title || (state.user.role === 'ADMIN' ? 'Full Access' : 'Employee Access');
  const initials = state.user.name.split(' ').map(part => part[0]).join('').slice(0,2);
  $('#profile-name').textContent = state.user.name; $('#profile-role').textContent = accessLabel;
  const avatar = $('.avatar-user');
  avatar.textContent = initials;
  avatar.classList.toggle('has-photo', Boolean(state.user.avatarUrl));
  avatar.style.backgroundImage = state.user.avatarUrl ? `url(${JSON.stringify(state.user.avatarUrl)})` : '';
  $('#profile-button').setAttribute('aria-label', `${state.user.name}, ${accessLabel}`);
  const canOpenAdminPanel = hasAdminPanelAccess(state.user); $('#cms-toggle').hidden = !canOpenAdminPanel; if (!canOpenAdminPanel) closeCMS();
}
function hasAdminPanelAccess(user) {
  if (!user || user.role === 'EMPLOYEE') return false;
  return Array.isArray(user.permissions) && user.permissions.some(permission => ['content.edit', 'audit.view'].includes(permission));
}
function renderLayoutList() {
  const labels = { announcements:'Hero & announcements', 'new-members':'Recently Joined', 'company-news':'Company news', news:'Industry pulse', knowledge:'Knowledge Hub sessions', whistleblower:'Whistleblower', moments:'Moments gallery', social:'Company channels', events:'Calendar & key dates' };
  $('#layout-list').innerHTML = state.settings.layout.map(key => `<div class="layout-row" draggable="true" data-widget-key="${key}"><span class="drag" title="Drag to reorder">⠿</span><b>${labels[key]}</b><label><input type="checkbox" ${!state.settings.hiddenWidgets.includes(key) ? 'checked' : ''}> Visible</label></div>`).join('');
  installLayoutDrag();
}
function renderAppManager() { $('#app-manager').innerHTML = state.apps.map(app => `<article class="manager-row${editingAppId === app.id ? ' is-selected' : ''}"><span class="app-icon" style="--app-color:${app.color}">${icon[app.icon] || '◈'}</span><span><b>${escapeHtml(app.name)}</b><small>${escapeHtml(app.caption)}</small></span><div class="record-actions"><button type="button" data-edit-app="${app.id}">Edit</button><button type="button" class="danger-action" data-remove-app="${app.id}">Remove</button></div></article>`).join(''); }
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
function configureNewSiWariansWorkspace() {
  const peopleTab = document.querySelector('[data-tab="people"]'), portalTab = document.querySelector('[data-tab="portals"]'), panel = $('#tab-portals');
  if (peopleTab) peopleTab.textContent = 'Recently Joined';
  if (portalTab) portalTab.textContent = 'New Si-Warians';
  const policyMode = document.querySelector('[data-content-type="policy"]'), contentIntro = $('#tab-content .cms-intro');
  policyMode?.remove();
  if (contentIntro) contentIntro.textContent = 'Create, update, or remove dashboard announcements, Knowledge Hub sessions, and Moments.';
  if (activeContentType === 'policy') activeContentType = 'announcement';
  if (!panel || $('#newsi-policy-manager')) return;
  panel.innerHTML = '<p class="cms-intro">Manage the policies, first-week checklist, support routes, and policy acknowledgements shown on the New Si-Warians page.</p><div class="content-type-switch newsi-switch" role="group" aria-label="New Si-Warians content"><button class="active" data-newsi-view="checklist">Checklists</button><button data-newsi-view="policies">Policies</button><button data-newsi-view="acknowledgements">Acknowledgements</button><button data-newsi-view="portals">Support Portals</button></div><div class="newsi-view" id="newsi-policies"><div id="newsi-policy-manager" class="record-manager"></div><form id="newsi-policy-form" class="admin-form"></form></div><div class="newsi-view active" id="newsi-checklist"><div id="newsi-checklist-manager" class="record-manager"></div><form id="newsi-checklist-form" class="admin-form"></form></div><div class="newsi-view" id="newsi-portals"><div id="portal-manager" class="app-manager"></div><form id="portal-form" class="admin-form"></form></div><div class="newsi-view" id="newsi-acknowledgements"><div id="newsi-acknowledgement-manager" class="record-manager"></div><form id="newsi-acknowledgement-form" class="admin-form"></form></div>';
}
function renderAll() { configureNewSiWariansWorkspace(); renderApps(); renderAnnouncement(); renderNewMembers(); renderNews(); renderCompanyNews(); renderTags(); renderSessions(); renderMoments(); renderEvents(); renderProfile(); renderLayoutList(); renderAppManager(); renderPortalManager(); setupNewMemberAdmin(); renderVectorIcons(); applyLayout(); }

function attachmentPreviewKind(url) {
  const pathname = String(url || '').split(/[?#]/)[0].toLowerCase();
  if (/\.(png|jpe?g|webp|gif)$/.test(pathname)) return 'photo';
  if (/\.(mp4|webm|mov|ogg)$/.test(pathname)) return 'video';
  if (/\.pdf$/.test(pathname)) return 'pdf';
  if (/\.(ppt|pptx)$/.test(pathname)) return 'presentation';
  return 'file';
}
function openAttachmentPreview(url, title = '') {
  const kind = attachmentPreviewKind(url), label = title || attachmentFilename(url), modal = $('#media-modal');
  $('#modal-title').textContent = label;
  $('#modal-type').textContent = `ATTACHMENT · ${kind === 'photo' ? 'PHOTO' : kind === 'video' ? 'VIDEO' : kind === 'pdf' ? 'PDF' : kind === 'presentation' ? 'PRESENTATION' : 'FILE'}`;
  const downloadUrl = /^\/uploads\//i.test(url) ? `${url}${url.includes('?') ? '&' : '?'}download=1` : url;
  $('#modal-content').innerHTML = kind === 'photo' ? `<img class="modal-image" src="${escapeHtml(url)}" alt="${escapeHtml(label)}" />` : kind === 'video' ? `<video class="modal-video" controls autoplay preload="metadata"><source src="${escapeHtml(url)}">Your browser does not support video playback.</video>` : kind === 'pdf' ? `<iframe class="pdf-viewer" src="${escapeHtml(url)}#view=FitH" title="${escapeHtml(label)}"><p class="modal-note">The PDF preview is unavailable. <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open the file</a>.</p></iframe>` : `<div class="modal-document"><p>This ${kind === 'presentation' ? 'PowerPoint presentation' : 'file'} is ready to open or download.</p><div><a class="primary-button" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open file</a><a class="secondary-button" href="${escapeHtml(downloadUrl)}">Download</a></div></div>`;
  if (!modal.open) modal.showModal();
}
function openMedia(session, kind) {
  const url = kind === 'watch' ? session.recordingUrl : kind === 'deck' ? session.presentationDeckUrl : session.supportingMaterialsUrl;
  if (!url) return;
  openAttachmentPreview(url, session.title);
}
function closeCMS() { $('#cms-panel').classList.remove('open'); $('#cms-panel').setAttribute('aria-hidden', 'true'); }
function openCMS() { $('#cms-panel').classList.add('open'); $('#cms-panel').setAttribute('aria-hidden', 'false'); }
function placeCmsToggleInHeader() {
  const toggle = $('#cms-toggle'), profile = $('#profile-button'), topbar = $('.topbar'), searchTrigger = $('[data-intranet-search-trigger]');
  if (!toggle || !profile || !topbar) return;
  let tools = $('.dashboard-header-tools');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'dashboard-header-tools';
    const themeToggle = topbar.querySelector('[data-theme-toggle]');
    if (themeToggle) tools.append(themeToggle);
    tools.append(profile);
    topbar.append(tools);
  }
  if (searchTrigger && !tools.contains(searchTrigger)) tools.prepend(searchTrigger);
  if (toggle.classList.contains('header-cms-toggle')) return;
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
  const dismissNudge = () => {
    if (nudge.hidden || nudge.classList.contains('is-leaving')) return;
    nudge.classList.add('is-leaving');
    window.setTimeout(() => { nudge.hidden = true; }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650);
    sessionStorage.setItem('siware-explore-nudge-v2-dismissed', 'true');
  };
  const knowledgeHub = $('#knowledge');
  if (knowledgeHub && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      dismissNudge();
      observer.disconnect();
    }, { threshold: 0.12 });
    observer.observe(knowledgeHub);
  }
  nudge.addEventListener('click', event => {
    const target = event.target.closest('[data-explore-target]');
    if (target) {
      const destinations = { moments: $('.moments-widget'), knowledge: $('#knowledge'), events: $('#events'), whistleblower: $('.whistleblower-widget') };
      const destination = destinations[target.dataset.exploreTarget];
      destination?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
    if (target || event.target.closest('.explore-nudge-dismiss')) {
      dismissNudge();
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
async function saveDashboard(message) {
  try {
    state = await request('/api/admin/dashboard', { method:'PATCH', body:JSON.stringify({ data:state, version:state._version }) });
    renderAll(); showToast(message);
  } catch (error) {
    if (/changed elsewhere/i.test(error.message)) { showToast('Someone else changed this content. Refresh the page before saving again.'); return; }
    showToast(error.message || 'The change could not be saved.');
  }
}

function readMemberPhoto(file) {
  if (!file || !file.name) return Promise.resolve('');
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) return Promise.reject(new Error('Choose a PNG, JPEG, WebP or GIF image.'));
  if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error('Photo must be no larger than 2 MB.'));
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The photo could not be read.')); reader.readAsDataURL(file); });
}
function readAdminFile(file, accepted, maxSize = 10 * 1024 * 1024) {
  if (!file || !file.name) return Promise.resolve('');
  if (!accepted.includes(file.type)) return Promise.reject(new Error('Choose a supported file type.'));
  if (file.size > maxSize) return Promise.reject(new Error(`File must be no larger than ${Math.round(maxSize / (1024 * 1024))} MB.`));
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The file could not be read.')); reader.readAsDataURL(file); });
}
async function uploadAdminFile(file, accepted, maxSize) {
  if (!file || !file.name) return '';
  const dataUrl = await readAdminFile(file, accepted, maxSize);
  return (await request('/api/uploads', { method:'POST', body:JSON.stringify({ dataUrl, filename:file.name }) })).url;
}
const momentMediaMimeTypes = ['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime','application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'];
const momentMediaMaxBytes = 500 * 1024 * 1024;
async function uploadMomentMedia(file) {
  if (!file || !file.name) return '';
  if (!momentMediaMimeTypes.includes(file.type)) throw new Error('Choose an MP4, WebM, MOV, PDF, PowerPoint, PNG, JPEG, WebP or GIF file.');
  if (file.size > momentMediaMaxBytes) throw new Error('Moment media must be no larger than 500 MB.');
  const response = await fetch('/api/uploads', { method:'POST', headers:{ 'x-demo-role':state?.user?.role || 'EMPLOYEE', 'x-upload-binary':'1', 'x-upload-filename':encodeURIComponent(file.name), 'content-type':file.type }, body:file });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The media could not be uploaded. Please try again.');
  return payload.url;
}
function attachmentFilename(url) { const file = String(url || '').split('/').pop() || ''; return decodeURIComponent(file).replace(/-\d{10,}(\.[^.]+)$/i, '$1'); }
function parseCsv(text) {
  const rows = [], row = []; let cell = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index], next = text[index + 1];
    if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && next === '\n') index += 1; row.push(cell); if (row.some(value => value.trim())) rows.push(row.splice(0)); cell = ''; }
    else cell += character;
  }
  row.push(cell); if (row.some(value => value.trim())) rows.push(row);
  if (quoted) throw new Error('The CSV has an unclosed quoted value.');
  return rows;
}
function csvHeader(value) { return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function normaliseCsvDate(value) {
  const input = String(value || '').trim();
  let match = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) { const localDate = input.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/); if (localDate) match = [null, localDate[3], localDate[2].padStart(2, '0'), localDate[1].padStart(2, '0')]; }
  if (!match) { const parsed = new Date(input); if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`; }
  if (!match) return '';
  const [, year, month, day] = match, date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day) ? `${year}-${month}-${day}` : '';
}
function safeKnowledgeLink(value) { const link = String(value || '').trim(); return !link || /^(https?:\/\/|\/|#)/i.test(link) ? link : null; }
function knowledgeResourceKey(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
const knowledgeResourceLinks = Object.freeze({
  'si-ware knowledge hub (skh) overview_2025-02-26_v1.pdf':'https://drive.google.com/file/d/1S2Chzd3KcSIN9nN2l3A-dorxFTSdHUuA/view?usp=sharing',
  'gmt20250226-081430_recording_1920x1080.mp4':'https://drive.google.com/file/d/1SNLOgskGzw2YVC2QY40h_tvJroQR_Qa9/view?usp=sharing',
  'photonics west & cra-w visit highlights_2025-02-26_v3.pdf':'https://drive.google.com/file/d/1uQDF4fqFrOJZa3Eu0f1XLESeSjkKmBwC/view?usp=sharing',
  'gmt20250226-082053_recording_1920x1080.mp4':'https://drive.google.com/file/d/1Cf1SNd9ln08u8jUF0AGzWc2WBoAHKiX6/view?usp=sharing',
  'fundamentals of patenting & si-ware patents portfolio.pptx':'https://docs.google.com/presentation/d/1tYWgSQvmbzVwR2Qh6OFQL3QERLf3igx1/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'part 1.mp4':'https://drive.google.com/file/d/14FUDVIxVY3jairU1VIR2lHYsYKglliJB/view?usp=sharing',
  'part 2.mp4':'https://drive.google.com/file/d/179RKkHz-scXEN-nmfpp4FNTTXknx5TFs/view?usp=sharing',
  'gsa overview and research trends in optical spectrometers':'https://docs.google.com/presentation/d/1DDqH9zjnu5mAJT1TxdlAMPwDWW1bZuJpIN6KeAlnfXs/edit?usp=sharing',
  'part1: gsa overview.mp4':'https://drive.google.com/file/d/1IdWKenv7vAUeGN2lCN6XLwBFrnG01KDv/view?usp=sharing',
  'part2: research trends in optical spectrometers.mp4':'https://drive.google.com/file/d/1tQ4s-R8DBk4zS5ORWA1oBSea-KUBVQU7/view?usp=sharing',
  'phd research presentation.pptx':'https://docs.google.com/presentation/d/1sZv26y3AIN6XdnXn-tTQGABkG_j-m8cW/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20250525-065510_recording_3840x2400.mp4':'https://drive.google.com/file/d/1bMPYhA7q1JhnA0j0RrQQI_Gg9oR0k4rg/view?usp=sharing',
  '(skh) project management essentials � knowledge areas and processes':'https://docs.google.com/presentation/d/1zdI1G7CLSoKh5xEKRzKO1A4AzXkAtb1SW9Tdy7te5lw/edit?usp=sharing',
  'gmt20250618-065545_recording_1920x1080.mp4':'https://drive.google.com/file/d/1qqDPYsdw3A1_h1JIOGq_ZHCt4yyZGe_-/view?usp=sharing',
  'gmt20250625-071407_recording_1920x1080.mp4':'https://drive.google.com/file/d/1NGmM_7j_vyV2kKjjNQjgAqza2uqZGsUl/view?usp=sharing',
  'smarter workflows with excel & google sheets part 1.pptx':'https://docs.google.com/presentation/d/1EBmXqwMG0a3n9zZg5_ZEHiQZl8T9sxL3/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20250827-065952_recording_1920x1200.mp4':'https://drive.google.com/file/d/1XpS7qTzc5e8AGGD32L7pVXhEL2ddQ7hS/view?usp=sharing',
  'smarter workflows with excel & google sheets.pptx':'https://docs.google.com/presentation/d/10Fi_7Nc1jaBOajik6ltmaoZfqPVYPa2T/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'nir-rome highlights 2025.pptx':'https://docs.google.com/presentation/d/1F_97Ba-aPiPwsK0bhiZIp0cHG1GgHL0t/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20250910-071259_recording_1920x1080.mp4':'https://drive.google.com/file/d/1uTrK2aQWnBr17kKGEJWZ3S0WQBpp1eo5/view?usp=sharing',
  'erasmus auc.pdf':'https://drive.google.com/file/d/1DumXyieIMTzAc69HN4QIWmAbRD56Jlj5/view?usp=sharing',
  'gmt20251016-065607_recording_1920x1080.mp4':'https://drive.google.com/file/d/1WSaHwNfxKqoLckQ2ehuisAGpLRFd49mF/view?usp=sharing',
  'incabin event summary.pptx':'https://docs.google.com/presentation/d/18gtnmrIttmDLDQk_ajy5rj1xGRmKPw5T/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20251029-065629_recording_3840x2160.mp4':'https://drive.google.com/file/d/10Bl_v5GNJBGUYIL6_umo7ltqd118Ezic/view?usp=sharing',
  'mems_function_session_skh_17_dec_2025.pptx':'https://docs.google.com/presentation/d/1EO1jfe_SM88MFc1a6Z8g5jE_YeJZig-p/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20251217-080519_recording_3840x2160.mp4':'https://drive.google.com/file/d/1KLIsqTQskC3HSyVPvvg529sPaOp2O5Ou/view?usp=sharing',
  'smart robotic solutions for industrial inspection and healthcare monitoring.pdf':'https://drive.google.com/file/d/163LGv_XL9AA5-AcfJMubj9WNtSkV8Tej/view?usp=sharing',
  'gmt20251223-120832_recording_1920x1080.mp4':'https://drive.google.com/file/d/1hYsPpYTIjP_hFQFdV5R2CEvRP7yZv5CV/view?usp=sharing',
  'electronics_function_session_skh_11_feb_2026.pptx':'https://docs.google.com/presentation/d/1c6IKWUmj5VCuYc_TRw2oI95bT91W-eJ7/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20260211-081020_recording_1920x1200.mp4':'https://drive.google.com/file/d/16w-NN5UfrIaRHyxiZH5sZ9gBOspMLDew/view?usp=sharing'
});
const knowledgeMaterialLinks = Object.freeze({
  'gsa':'https://drive.google.com/drive/folders/17wgt-atu2YA2H_n2zHb_ZGfn3iHrhJ2r?usp=sharing',
  'smarter workflows with excel & google sheets - part 2':'https://drive.google.com/drive/folders/1RvoLICtRAVx-2dqSBPYB9TYo3fTxXCiU?usp=sharing',
  'nir rome conference highlights':'https://drive.google.com/drive/folders/1fZPJusSeWcUa6T4ihqOKJvvYCVvnESfA?usp=drive_link',
  'smart robotic solutions for industrial inspection and healthcare monitoring':'https://drive.google.com/file/d/11EBGJjbt7nTjAe4tp9z3zUcO4f6K3g3S/view?usp=sharing'
});
function csvKnowledgeResource(value) { const source = String(value || '').trim(), url = safeKnowledgeLink(source) || knowledgeResourceLinks[knowledgeResourceKey(source)] || ''; return { url, filename:url || !source ? '' : source }; }
function importKnowledgeCsv(text) {
  const rows = parseCsv(text); if (!rows.length) throw new Error('The CSV is empty.');
  const columns = Object.fromEntries(rows[0].map((header, index) => [csvHeader(header), index]));
  const required = ['title', 'presenter', 'date'];
  if (required.some(header => columns[header] === undefined)) throw new Error('Use the required headers: Title, Presenter, and Date.');
  const read = (row, header) => columns[header] === undefined ? '' : String(row[columns[header]] || '').trim();
  const sessions = [], skipped = []; let pendingResources = 0;
  rows.slice(1).forEach((row, index) => {
    const title = read(row, 'title'), presenter = read(row, 'presenter'), date = normaliseCsvDate(read(row, 'date'));
    const outline = read(row, 'outline'), presentation = csvKnowledgeResource(read(row, 'presentationlink')),
      recording = csvKnowledgeResource(read(row, 'recordinglink')), materials = csvKnowledgeResource(read(row, 'supportingmaterials'));
    if (!title || !presenter || !date) { skipped.push(index + 2); return; }
    if (!materials.url) {
      const knownMaterialUrl = knowledgeMaterialLinks[knowledgeResourceKey(materials.filename)] || knowledgeMaterialLinks[knowledgeResourceKey(title)];
      if (knownMaterialUrl) { materials.url = knownMaterialUrl; materials.filename = ''; }
    }
    pendingResources += [presentation.filename, recording.filename, materials.filename].filter(Boolean).length;
    sessions.push({ title:title.slice(0, 120), presenter:{ name:presenter.slice(0, 80), initials:presenter.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() }, category:'General', date, outline:outline.slice(0, 360), presentationDeckUrl:presentation.url, recordingUrl:recording.url, supportingMaterialsUrl:materials.url, presentationFilename:presentation.filename, recordingFilename:recording.filename, supportingMaterialsFilename:materials.filename });
  });
  return { sessions, skipped, pendingResources };
}
function renderAdminOverview() {
  const visible = state.settings.layout.filter(key => !state.settings.hiddenWidgets.includes(key)).length;
  $('#admin-overview').innerHTML = `<div class="admin-summary"><h3>Everything in one place</h3><p>Changes are saved immediately to the employee experience.</p><dl><div><dt>${state.announcements.length}</dt><dd>announcements</dd></div><div><dt>${state.newMembers.length}</dt><dd>recent joins</dd></div><div><dt>${visible}</dt><dd>visible sections</dd></div></dl></div><div class="admin-quick-actions"><button type="button" data-go-admin="content">Manage content</button><button type="button" data-go-admin="people">Update people</button><button type="button" data-go-admin="layout">Arrange dashboard</button><button type="button" data-go-admin="apps">Manage apps</button></div>`;
}
function renderContentManager() {
  const config = activeContentType === 'announcement' ? { list:state.announcements, title:x => x.title, detail:x => x.date || 'No date' } : activeContentType === 'session' ? { list:state.sessions, title:x => x.title, detail:x => `${x.presenter?.name || 'Si-Ware team'} · ${x.category || 'General'}` } : activeContentType === 'moment' ? { list:state.moments, title:x => x.title, detail:x => x.kind || 'Moment' } : { list:state.policies, title:x => x.title, detail:x => `${x.owner || 'No owner'} · ${x.version || 'Draft'}` };
  const importer = activeContentType === 'session' ? '<form class="knowledge-csv-import" id="knowledge-csv-import"><label>Import Knowledge Hub CSV<input name="knowledgeCsv" type="file" accept=".csv,text/csv" required /></label><small>Headers: Title, Presenter, Date, Outline, Presentation Link, Recording Link, Supporting Materials. Dates may use Excel’s long-date format. Web links publish immediately; file names are retained so you can link or upload them later.</small><button class="secondary-button" type="submit">Import CSV</button><p class="form-status" role="status"></p></form>' : '';
  $('#content-manager').innerHTML = `${importer}${config.list.length ? config.list.map(item => `<article class="record-row"><span><b>${escapeHtml(config.title(item))}</b><small>${escapeHtml(config.detail(item))}</small></span><div class="record-actions"><button type="button" data-edit-content="${item.id}">Edit</button><button type="button" class="danger-action" data-remove-content="${item.id}">Remove</button></div></article>`).join('') : '<p class="admin-empty">Nothing here yet. Use the form below to add the first record.</p>'}`;
  const item = editingContentId && config.list.find(entry => entry.id === editingContentId);
  const button = item ? 'Save changes' : `Add ${activeContentType === 'session' ? 'session' : activeContentType}`;
  const common = `<label>Title<input name="title" required maxlength="120" value="${escapeHtml(item?.title || '')}" placeholder="Clear, employee-facing title" /></label>`;
  const fields = activeContentType === 'announcement' ? `${common}<label>Message<textarea name="body" rows="3" required maxlength="360" placeholder="What should employees know?">${escapeHtml(item?.body || '')}</textarea></label><label>Label<input name="tag" maxlength="40" value="${escapeHtml(item?.tag || 'Company update')}" /></label>` : activeContentType === 'session' ? `${common}<label>Presenter<input name="presenter" required maxlength="80" value="${escapeHtml(item?.presenter?.name || '')}" /></label><label>Category<select name="category">${['Photonics','Patents','MEMS','AI','General'].map(value => `<option ${item?.category === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label>Date<input name="date" type="date" value="${escapeHtml(item?.date || new Date().toISOString().slice(0,10))}" /></label><label>Summary<textarea name="outline" rows="3" maxlength="360">${escapeHtml(item?.outline || '')}</textarea></label><label>Presentation link (optional)<input name="presentationDeckUrl" inputmode="url" value="${escapeHtml(item?.presentationDeckUrl || '')}" placeholder="https://… or /document.pdf" /></label><label>Recording link (optional)<input name="recordingUrl" inputmode="url" value="${escapeHtml(item?.recordingUrl || '')}" placeholder="https://…" /></label><label>Supporting materials link (optional)<input name="supportingMaterialsUrl" inputmode="url" value="${escapeHtml(item?.supportingMaterialsUrl || '')}" placeholder="https://… or /resource" /></label><label>Presentation deck (PDF)<input name="attachment" type="file" accept="application/pdf" /><small>${item?.presentationDeckUrl ? 'A deck is already attached. Choose a new file to replace it.' : 'Optional PDF, up to 10 MB.'}</small></label>` : activeContentType === 'moment' ? `${common}<label>Category label<input name="kind" required maxlength="40" value="${escapeHtml(item?.kind || '')}" placeholder="People, Lab, Sun…" /></label><label>Card colour<input name="color" type="color" value="${escapeHtml(item?.color || '#dceeff')}" /><small>Choose the card’s background colour on the employee dashboard.</small></label><label>Moment media (optional)<input name="media" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,.ppt,.pptx" /><small>${item?.mediaUrl ? `Attached: <b>${escapeHtml(item.mediaFilename || attachmentFilename(item.mediaUrl))}</b> · <a href="${escapeHtml(item.mediaUrl)}" target="_blank" rel="noreferrer">Open attached file</a> · Choose a new file to replace it.` : 'Photos, MP4/WebM/MOV video, PDF, PPT or PPTX up to 500 MB.'}</small></label>` : `${common}<label>Summary<textarea name="summary" rows="3" required maxlength="360">${escapeHtml(item?.summary || '')}</textarea></label><label>Owner<input name="owner" required maxlength="80" value="${escapeHtml(item?.owner || '')}" /></label><label>Audience<input name="audience" maxlength="120" value="${escapeHtml(item?.audience || 'All employees')}" /></label><label>Version<input name="version" maxlength="20" value="${escapeHtml(item?.version || 'v1.0')}" /></label><label>Modified timestamp<input value="${escapeHtml(displayTimestamp(item?.modifiedAt))}" readonly /><small>Set automatically when the policy PDF is uploaded or replaced.</small></label><label>Policy document (PDF)<input name="attachment" type="file" accept="application/pdf" /><small>${item?.canonicalUrl?.startsWith('/uploads/') ? 'A document is already attached. Choose a new file to replace it.' : 'Upload a PDF to make it available to employees, up to 10 MB.'}</small></label>`;
  const formHeading = item ? `Edit ${activeContentType === 'session' ? 'session' : activeContentType}` : `Add ${activeContentType === 'session' ? 'session' : activeContentType}`;
  $('#content-form').innerHTML = `<h3>${formHeading}</h3>${fields}<div class="admin-actions"><button type="button" class="secondary-button" data-cancel-content ${item ? '' : 'hidden'}>Cancel</button><button class="primary-button" type="submit">${button}</button></div><p class="form-status" role="status"></p>`;
}
function renderMemberManager() {
  $('#member-manager').innerHTML = state.newMembers.length ? state.newMembers.map(member => `<article class="record-row"><span><b>${escapeHtml(member.name)}</b><small>${escapeHtml(member.role)} · ${escapeHtml(member.employmentType)}</small></span><div class="record-actions"><button type="button" data-edit-member="${member.id}">Edit</button><button type="button" class="danger-action" data-remove-member="${member.id}">Remove</button></div></article>`).join('') : '<p class="admin-empty">No recently joined colleagues yet.</p>';
  const member = editingMemberId && state.newMembers.find(entry => entry.id === editingMemberId);
  const text = (name, label, placeholder = '') => `<label>${label}<input name="${name}" required maxlength="100" value="${escapeHtml(member?.[name] || '')}" placeholder="${placeholder}" /></label>`;
  $('#new-member-form').innerHTML = `<h3>${member ? 'Edit colleague' : 'Add colleague'}</h3><div class="admin-form-grid">${text('name','Full name','Employee name')}${text('role','Role','Job title')}<label>Employment type<select name="employmentType">${memberEmploymentTypes.map(value => `<option ${member?.employmentType === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>${text('department','Department','Department')}${text('division','Division','Division')}${text('directManager','Direct manager','Manager name')}${text('joined','Joined','e.g. October 2026')}</div><label>Welcome message<textarea name="message" rows="3" maxlength="240" placeholder="Optional welcome note">${escapeHtml(member?.message || '')}</textarea></label><label>Employee photo<input name="photo" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /><small>${member?.photoUrl ? 'A photo is already attached. Choose a new image to replace it.' : 'Optional PNG, JPEG, WebP or GIF, up to 2 MB.'}</small></label><div class="admin-actions"><button type="button" class="secondary-button" data-cancel-member ${member ? '' : 'hidden'}>Cancel</button><button class="primary-button" type="submit">${member ? 'Save colleague' : 'Add colleague'}</button></div><p class="form-status" role="status"></p>`;
}
function renderAppForm() {
  const app = editingAppId && state.apps.find(entry => entry.id === editingAppId);
  $('#app-form').innerHTML = `<h3>${app ? 'Edit shortcut' : 'Add shortcut'}</h3><label>Name<input name="name" required maxlength="40" value="${escapeHtml(app?.name || '')}" placeholder="Shortcut name" /></label><label>Description<input name="caption" required maxlength="80" value="${escapeHtml(app?.caption || '')}" placeholder="What it helps employees do" /></label><label>URL<input name="url" required value="${escapeHtml(app?.url || '')}" placeholder="https:// or /internal-page" /></label><label>Accent colour<input name="color" type="color" value="${escapeHtml(app?.color || '#5964db')}" /></label><div class="admin-actions"><button type="button" class="secondary-button" data-cancel-app ${app ? '' : 'hidden'}>Cancel</button><button class="primary-button" type="submit">${app ? 'Save shortcut' : 'Add shortcut'}</button></div><p class="form-status" role="status"></p>`;
}
function renderPortalForm() {
  const portal = editingPortalId && state.supportPortals.find(entry => entry.id === editingPortalId);
  const form = $('#portal-form');
  if (!form) return;
  const iconOptions = [['building', 'Company portal'], ['support', 'IT Support'], ['payroll', 'Payslips & HR']];
  form.innerHTML = portal ? `<h3>Edit company portal</h3><div class="admin-form-grid"><label>Name<input name="name" required maxlength="60" value="${escapeHtml(portal.name)}" /></label><label>Icon<select name="icon">${iconOptions.map(([value, label]) => `<option value="${value}" ${portal.icon === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label>Description<input name="description" required maxlength="100" value="${escapeHtml(portal.description)}" placeholder="What employees can do here" /></label><label>URL<input name="url" inputmode="url" value="${escapeHtml(portal.url || '')}" placeholder="https://portal.example.com" /><small>Use https:// for an external portal or /page for an intranet route. Leave blank while the destination is being prepared.</small></label><div class="admin-actions"><button type="button" class="secondary-button" data-cancel-portal>Cancel</button><button class="primary-button" type="submit">Save portal</button></div><p class="form-status" role="status"></p>` : '<p class="form-status">Select a company portal above to configure its destination and icon.</p>';
}
function renderNewSiPolicies() {
  const manager = $('#newsi-policy-manager'), form = $('#newsi-policy-form'); if (!manager || !form) return;
  manager.innerHTML = state.policies.map(policy => `<article class="record-row"><span><b>${escapeHtml(policy.title)}</b><small>${escapeHtml(policy.owner)} · ${escapeHtml(policy.version)}</small></span><div class="record-actions"><button type="button" data-edit-newsi-policy="${policy.id}">Edit</button><button type="button" class="danger-action" data-remove-newsi-policy="${policy.id}">Remove</button></div></article>`).join('');
  const policy = editingNewSiPolicyId && state.policies.find(item => item.id === editingNewSiPolicyId);
  form.innerHTML = `<h3>${policy ? 'Edit policy' : 'Add policy'}</h3><label>Title<input name="title" required maxlength="120" value="${escapeHtml(policy?.title || '')}" /></label><label>Summary<textarea name="summary" rows="3" required maxlength="360">${escapeHtml(policy?.summary || '')}</textarea></label><label>Owner<input name="owner" required maxlength="80" value="${escapeHtml(policy?.owner || '')}" /></label><label>Audience<input name="audience" required maxlength="120" value="${escapeHtml(policy?.audience || 'All employees')}" /></label><label>Version<input name="version" required maxlength="20" value="${escapeHtml(policy?.version || 'v1.0')}" /></label><label>Policy document (PDF)<input name="attachment" type="file" accept="application/pdf" /></label><div class="admin-actions"><button type="button" class="secondary-button" data-cancel-newsi-policy ${policy ? '' : 'hidden'}>Cancel</button><button class="primary-button" type="submit">${policy ? 'Save policy' : 'Add policy'}</button></div><p class="form-status" role="status"></p>`;
}
function renderNewSiChecklist() {
  const manager = $('#newsi-checklist-manager'), form = $('#newsi-checklist-form'); if (!manager || !form) return;
  manager.innerHTML = state.firstWeekChecklist.map((item, index) => `<article class="record-row"><span><b>${index + 1}. ${escapeHtml(item.text)}</b><small>Employees can confirm this item once.</small></span><div class="record-actions"><button type="button" data-edit-checklist-item="${item.id}">Edit</button><button type="button" class="danger-action" data-remove-checklist-item="${item.id}">Remove</button></div></article>`).join('') || '<p class="admin-empty">No checklist items yet. Add the first task for new colleagues.</p>';
  const item = editingChecklistItemId && state.firstWeekChecklist.find(entry => entry.id === editingChecklistItemId);
  const existingAttachment = item?.attachmentUrl || (item?.resourceUrl?.startsWith('/uploads/') ? item.resourceUrl : '');
  const existingAttachmentName = item?.attachmentFilename || attachmentFilename(existingAttachment);
  form.innerHTML = `<h3>${item ? 'Edit checklist item' : 'Add checklist item'}</h3><label>Task<textarea name="text" rows="3" required maxlength="220" placeholder="Clear first-week action for employees">${escapeHtml(item?.text || '')}</textarea></label><label>Resource link (optional)<input name="resourceUrl" inputmode="url" value="${escapeHtml(item?.resourceUrl?.startsWith('/uploads/') ? '' : item?.resourceUrl || '')}" placeholder="https://example.com or /document.pdf" /><small>Employees can open this link before confirming the task.</small></label><label>Link label (optional)<input name="resourceLabel" maxlength="60" value="${escapeHtml(item?.resourceLabel || '')}" placeholder="Open instructions" /></label><label>Supporting file (optional)<input name="attachment" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" /><small>${existingAttachment ? `Attached: <b>${escapeHtml(existingAttachmentName)}</b> · <a href="${escapeHtml(existingAttachment)}" target="_blank" rel="noreferrer">Open attached file</a> · Choose a new file to replace it.` : 'PDF or image, up to 10 MB.'}</small></label><label>Attachment label (optional)<input name="attachmentLabel" maxlength="60" value="${escapeHtml(item?.attachmentLabel || '')}" placeholder="Open attachment" /></label><div class="admin-actions"><button type="button" class="secondary-button" data-cancel-checklist-item ${item ? '' : 'hidden'}>Cancel</button><button class="primary-button" type="submit">${item ? 'Save item' : 'Add item'}</button></div><p class="form-status" role="status"></p>`;
}
async function renderPolicyAcknowledgements() { const manager = $('#newsi-acknowledgement-manager'), form = $('#newsi-acknowledgement-form'), content = state.policyAcknowledgementContent; if (!manager || !form) return; form.innerHTML = `<h3>Employee-facing acknowledgement text</h3><label>Action heading<input name="actionTitle" required maxlength="120" value="${escapeHtml(content.actionTitle)}" /><small>Shown when acknowledgement is required.</small></label><label>Instruction before review<textarea name="instructionText" rows="3" required maxlength="360">${escapeHtml(content.instructionText)}</textarea></label><label>Context heading<input name="beforeHeading" required maxlength="80" value="${escapeHtml(content.beforeHeading)}" /></label><label>Text before confirmation<textarea name="beforeText" rows="6" maxlength="900" required>${escapeHtml(content.beforeText)}</textarea><small>Shown above the mandatory policy list.</small></label><label>Confirmation button label<input name="confirmationLabel" required maxlength="160" value="${escapeHtml(content.confirmationLabel)}" /><small>This exact statement is stored with every employee acknowledgement.</small></label><label>Confirmation help text<input name="confirmationHelp" required maxlength="220" value="${escapeHtml(content.confirmationHelp)}" /></label><label>Heading after confirmation<input name="acceptedTitle" required maxlength="100" value="${escapeHtml(content.acceptedTitle)}" /></label><label>Text after confirmation<textarea name="afterText" rows="3" maxlength="360" required>${escapeHtml(content.afterText)}</textarea><small>Shown after an employee has accepted the current policy versions.</small></label><div class="admin-actions"><button class="primary-button" type="submit">Save acknowledgement text</button></div><p class="form-status" role="status"></p>`; manager.innerHTML = '<p class="admin-empty">Loading acknowledgement records…</p>'; try { const result = await request(`/api/policy-acknowledgements?q=${encodeURIComponent(acknowledgementQuery)}&page=${acknowledgementPage}&limit=25`); acknowledgementPage = result.page; const records = result.records; manager.innerHTML = `<div class="acknowledgement-toolbar"><label><span class="sr-only">Search acknowledgements</span><input data-acknowledgement-search value="${escapeHtml(acknowledgementQuery)}" placeholder="Search employee or email" /></label><small>${result.total} acknowledgement${result.total === 1 ? '' : 's'}</small></div>${records.length ? records.map(record => `<article class="record-row"><span><b>${escapeHtml(record.employee.name)}</b><small>${escapeHtml(record.employee.email)} · Accepted ${escapeHtml(displayTimestamp(record.acceptedAt))} · ${record.policies.length} current policies</small></span></article>`).join('') : '<p class="admin-empty">No acknowledgements match this search.</p>'}<div class="acknowledgement-pagination"><button type="button" data-acknowledgement-page="${result.page - 1}" ${result.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${result.page} of ${result.pages}</span><button type="button" data-acknowledgement-page="${result.page + 1}" ${result.page >= result.pages ? 'disabled' : ''}>Next</button></div>`; } catch { manager.innerHTML = '<p class="admin-empty">Acknowledgements are available to administrators after sign-in.</p>'; } }
function setupNewMemberAdmin() { renderAdminOverview(); renderContentManager(); renderMemberManager(); renderAppForm(); renderPortalForm(); renderNewSiPolicies(); renderNewSiChecklist(); renderPolicyAcknowledgements(); }

function setupEvents() {
  $('#profile-button').addEventListener('click', () => { const menu = $('#profile-menu'); menu.hidden = !menu.hidden; $('#profile-button').setAttribute('aria-expanded', String(!menu.hidden)); });
  $('#profile-menu').addEventListener('click', event => { const role = event.target.dataset.role; if (!role) return; state.user.role = role; state.user.title = role === 'ADMIN' ? 'Full Access' : 'Employee Access'; $('#profile-menu').hidden = true; renderProfile(); showToast(`Switched to ${role === 'ADMIN' ? 'Admin' : 'Employee'} view`); });
  $('#feed-selector').addEventListener('change', () => { renderNews(); acknowledgeContentChange($('#news-list')); });
  $('#session-search').addEventListener('input', () => { knowledgePage = 1; renderSessions(); });
  $('#tag-filters').addEventListener('click', event => { if (!event.target.dataset.tag) return; activeTag = event.target.dataset.tag; knowledgePage = 1; renderTags(); renderSessions(); acknowledgeContentChange($('.session-table-wrap')); });
  $('#session-list').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; const session = state.sessions.find(item => item.id === button.dataset.id); openMedia(session, button.dataset.action); });
  $('#session-pagination').addEventListener('click', event => { const direction = event.target.dataset.sessionPage; if (!direction) return; knowledgePage += direction === 'next' ? 1 : -1; renderSessions(); acknowledgeContentChange($('.session-table-wrap')); });
  $('#modal-close').addEventListener('click', () => $('#media-modal').close());
  $('#media-modal').addEventListener('click', event => { if (event.target === $('#media-modal')) $('#media-modal').close(); });
  $('#media-modal').addEventListener('cancel', event => { event.preventDefault(); $('#media-modal').close(); });
  $('#media-modal').addEventListener('close', () => { $('#media-modal video')?.pause(); });
  $('#cms-toggle').addEventListener('click', () => { location.href = '/admin.html'; }); $('#cms-close').addEventListener('click', closeCMS);
  $('.cms-tabs').addEventListener('click', event => { if (event.target.dataset.tab) switchCmsTab(event.target.dataset.tab); });
  $('#layout-list').addEventListener('change', event => { const row = event.target.closest('.layout-row'); const key = row.dataset.widgetKey; state.settings.hiddenWidgets = event.target.checked ? state.settings.hiddenWidgets.filter(x => x !== key) : [...new Set([...state.settings.hiddenWidgets, key])]; applyLayout(); });
  $('#save-layout').addEventListener('click', async () => { state.settings.layout = $$('#layout-list .layout-row').map(row => row.dataset.widgetKey); await saveDashboard('Dashboard layout saved'); });
  $('#reset-layout').addEventListener('click', () => { state.settings.layout = [...dashboardLayout]; state.settings.hiddenWidgets = []; renderLayoutList(); applyLayout(); showToast('Default layout restored. Save to publish it.'); });
  $('#admin-overview').addEventListener('click', event => { const tab = event.target.dataset.goAdmin; if (tab) switchCmsTab(tab); });
  $('#tab-content .content-type-switch').addEventListener('click', event => { const type = event.target.dataset.contentType; if (!type) return; activeContentType = type; editingContentId = null; $$('#tab-content .content-type-switch button').forEach(button => button.classList.toggle('active', button.dataset.contentType === type)); renderContentManager(); });
  $('.newsi-switch').addEventListener('click', event => { const view = event.target.dataset.newsiView; if (!view) return; $$('.newsi-switch button').forEach(button => button.classList.toggle('active', button.dataset.newsiView === view)); $$('.newsi-view').forEach(panel => panel.classList.toggle('active', panel.id === `newsi-${view}`)); });
  $('#content-manager').addEventListener('click', async event => { const edit = event.target.dataset.editContent, remove = event.target.dataset.removeContent; const key = activeContentType === 'announcement' ? 'announcements' : activeContentType === 'session' ? 'sessions' : activeContentType === 'moment' ? 'moments' : 'policies'; if (edit) { editingContentId = edit; renderContentManager(); return; } if (remove && window.confirm('Remove this record? This cannot be undone from the administration panel.')) { state[key] = state[key].filter(item => item.id !== remove); await saveDashboard('Content removed'); } });
  $('#content-manager').addEventListener('submit', async event => { const form = event.target.closest('#knowledge-csv-import'); if (!form) return; event.preventDefault(); const file = form.elements.knowledgeCsv.files[0], status = form.querySelector('.form-status'), button = form.querySelector('button[type="submit"]'); if (!file) { status.textContent = 'Choose a CSV file to import.'; return; } if (file.size > 5 * 1024 * 1024) { status.textContent = 'CSV files must be 5 MB or smaller.'; return; } button.disabled = true; status.textContent = 'Checking CSV rows…'; try { const { sessions, skipped, pendingResources } = importKnowledgeCsv(await file.text()); if (!sessions.length) throw new Error(`No valid session rows were found${skipped.length ? `; ${skipped.length} row${skipped.length === 1 ? '' : 's'} need attention.` : '.'}`); const keyFor = item => `${item.title}\u0000${item.presenter?.name || ''}\u0000${item.date}`.toLowerCase(), existingByKey = new Map(state.sessions.map(item => [keyFor(item, state.user?.name || 'Intranet team'), item])); let added = 0, updated = 0; sessions.forEach((session, index) => { const key = keyFor(session), existing = existingByKey.get(key); if (existing) { Object.assign(existing, session); updated += 1; } else { const imported = { ...session, id:`session-import-${Date.now()}-${index}` }; state.sessions.unshift(imported); existingByKey.set(key, imported); added += 1; } }); await saveDashboard(`CSV import complete: ${added} added, ${updated} updated${skipped.length ? `, ${skipped.length} skipped` : ''}${pendingResources ? `; ${pendingResources} file reference${pendingResources === 1 ? '' : 's'} retained for linking` : ''}.`); } catch (error) { status.textContent = error.message || 'The CSV import could not be completed.'; button.disabled = false; } });
  $('#content-form').addEventListener('click', event => { if (event.target.dataset.cancelContent !== undefined) { editingContentId = null; renderContentManager(); } });
  $('#content-form').addEventListener('submit', async event => { event.preventDefault(); const formElement = event.currentTarget, form = new FormData(formElement), key = activeContentType === 'announcement' ? 'announcements' : activeContentType === 'session' ? 'sessions' : activeContentType === 'moment' ? 'moments' : 'policies'; const existing = editingContentId && state[key].find(item => item.id === editingContentId); const attachment = form.get('attachment'); let record; if (activeContentType === 'announcement') record = { ...(existing || { id:`announcement-${Date.now()}`, date:'Just now', priority:'normal' }), title:form.get('title'), body:form.get('body'), tag:form.get('tag') || 'Company update' }; else if (activeContentType === 'session') { const presenter = String(form.get('presenter')).trim(), deckUrl = await uploadAdminFile(attachment, ['application/pdf']), presentationDeckUrl = safeKnowledgeLink(form.get('presentationDeckUrl')), recordingUrl = safeKnowledgeLink(form.get('recordingUrl')), supportingMaterialsUrl = safeKnowledgeLink(form.get('supportingMaterialsUrl')); if ([presentationDeckUrl, recordingUrl, supportingMaterialsUrl].includes(null)) { formElement.querySelector('.form-status').textContent = 'Use https://, /intranet-path, or #anchor links for session resources.'; return; } record = { ...(existing || { id:`session-${Date.now()}` }), title:form.get('title'), presenter:{ name:presenter, initials:presenter.split(' ').map(part => part[0]).join('').slice(0,2) }, category:form.get('category'), date:form.get('date'), outline:form.get('outline'), presentationDeckUrl:deckUrl || presentationDeckUrl || existing?.presentationDeckUrl || '', recordingUrl:recordingUrl || '', supportingMaterialsUrl:supportingMaterialsUrl || '' }; } else if (activeContentType === 'moment') { const media = form.get('media'), status = formElement.querySelector('.form-status'), button = formElement.querySelector('button[type="submit"]'); try { if (media?.name) { button.disabled = true; button.textContent = 'Uploading media…'; status.textContent = `Uploading ${media.name}…`; } const mediaUrl = await uploadMomentMedia(media); record = { ...(existing || { id:`moment-${Date.now()}` }), title:String(form.get('title')).trim(), kind:String(form.get('kind')).trim(), color:String(form.get('color')).trim() || '#dceeff', mediaUrl:mediaUrl || existing?.mediaUrl || '', mediaFilename:media?.name || existing?.mediaFilename || attachmentFilename(mediaUrl || existing?.mediaUrl) }; } catch (error) { status.textContent = error.message || 'The media could not be uploaded. Please try again.'; button.disabled = false; button.textContent = existing ? 'Save changes' : 'Add moment'; return; } } else { const policyUrl = await uploadAdminFile(attachment, ['application/pdf']); record = { ...(existing || { id:`policy-${Date.now()}`, canonicalUrl:'/new-hires.html#policies', category:'General' }), title:form.get('title'), summary:form.get('summary'), owner:form.get('owner'), audience:form.get('audience'), version:form.get('version'), ...(policyUrl ? { canonicalUrl:policyUrl } : {}) }; } if (existing) Object.assign(existing, record); else state[key].unshift(record); editingContentId = null; await saveDashboard(existing ? 'Content updated' : 'Content added'); });
  $('#member-manager').addEventListener('click', async event => { const edit = event.target.dataset.editMember, remove = event.target.dataset.removeMember; if (edit) { editingMemberId = edit; renderMemberManager(); return; } if (remove && window.confirm('Remove this colleague from Recently Joined?')) { state.newMembers = state.newMembers.filter(member => member.id !== remove); await saveDashboard('Recently joined colleague removed'); } });
  $('#new-member-form').addEventListener('click', event => { if (event.target.dataset.cancelMember !== undefined) { editingMemberId = null; renderMemberManager(); } });
  $('#new-member-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget), existing = editingMemberId && state.newMembers.find(member => member.id === editingMemberId); const name = form.get('name'), photoUrl = await uploadAdminFile(form.get('photo'), ['image/png','image/jpeg','image/webp','image/gif'], 2 * 1024 * 1024); const record = { ...(existing || { id:`member-${Date.now()}`, initials:name.split(' ').map(part => part[0]).join('').slice(0,2), color:'#dceeff' }), name, role:form.get('role'), employmentType:form.get('employmentType'), department:form.get('department'), division:form.get('division'), directManager:form.get('directManager'), joined:form.get('joined'), message:form.get('message'), ...(photoUrl ? { photoUrl } : {}) }; if (existing) Object.assign(existing, record); else state.newMembers.unshift(record); editingMemberId = null; await saveDashboard(existing ? 'Colleague updated' : 'Recently joined colleague added'); });
  $('#app-manager').addEventListener('click', async event => { const edit = event.target.dataset.editApp, remove = event.target.dataset.removeApp; if (edit) { editingAppId = edit; renderAppManager(); renderAppForm(); return; } if (remove && window.confirm('Remove this Quick Launch shortcut?')) { state.apps = state.apps.filter(app => app.id !== remove); await saveDashboard('Shortcut removed'); } });
  $('#app-form').addEventListener('click', event => { if (event.target.dataset.cancelApp !== undefined) { editingAppId = null; renderAppForm(); } });
  $('#app-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget), existing = editingAppId && state.apps.find(app => app.id === editingAppId); const record = { ...(existing || { id:`custom-${Date.now()}`, icon:'spark' }), name:form.get('name'), caption:form.get('caption'), url:form.get('url'), color:form.get('color') }; if (existing) Object.assign(existing, record); else state.apps.push(record); editingAppId = null; await saveDashboard(existing ? 'Shortcut updated' : 'Shortcut added'); });
  $('#portal-manager').addEventListener('click', event => { const edit = event.target.dataset.editPortal; if (!edit) return; editingPortalId = edit; renderPortalForm(); });
  $('#portal-form').addEventListener('click', event => { if (event.target.dataset.cancelPortal !== undefined) { editingPortalId = null; renderPortalForm(); } });
  $('#portal-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget), portal = state.supportPortals.find(entry => entry.id === editingPortalId), url = String(form.get('url')).trim(); if (!portal) return; if (url && !/^(https?:\/\/|\/|#)/i.test(url)) { event.currentTarget.querySelector('.form-status').textContent = 'Use an https:// link or an intranet path beginning with / or #.'; return; } Object.assign(portal, { name:String(form.get('name')).trim(), description:String(form.get('description')).trim(), url, icon:String(form.get('icon')) }); editingPortalId = null; await saveDashboard('Company portal updated'); });
  $('#newsi-policy-manager').addEventListener('click', async event => { const edit = event.target.dataset.editNewsiPolicy, remove = event.target.dataset.removeNewsiPolicy; if (edit) { editingNewSiPolicyId = edit; renderNewSiPolicies(); return; } if (remove && window.confirm('Remove this policy?')) { state.policies = state.policies.filter(policy => policy.id !== remove); await saveDashboard('Policy removed'); } });
  $('#newsi-policy-form').addEventListener('click', event => { if (event.target.dataset.cancelNewsiPolicy !== undefined) { editingNewSiPolicyId = null; renderNewSiPolicies(); } });
  $('#newsi-policy-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget), existing = editingNewSiPolicyId && state.policies.find(policy => policy.id === editingNewSiPolicyId), url = await uploadAdminFile(form.get('attachment'), ['application/pdf']); const record = { ...(existing || { id:`policy-${Date.now()}`, canonicalUrl:'/new-hires.html#policies', category:'General' }), title:form.get('title'), summary:form.get('summary'), owner:form.get('owner'), audience:form.get('audience'), version:form.get('version'), ...(url ? { canonicalUrl:url } : {}) }; if (existing) Object.assign(existing, record); else state.policies.unshift(record); editingNewSiPolicyId = null; await saveDashboard(existing ? 'Policy updated' : 'Policy added'); });
  $('#newsi-checklist-manager').addEventListener('click', async event => { const edit = event.target.dataset.editChecklistItem, remove = event.target.dataset.removeChecklistItem; if (edit) { editingChecklistItemId = edit; renderNewSiChecklist(); return; } if (remove && window.confirm('Remove this checklist item?')) { state.firstWeekChecklist = state.firstWeekChecklist.filter(item => item.id !== remove); await saveDashboard('Checklist item removed'); } });
  $('#newsi-acknowledgement-manager').addEventListener('input', event => { if (event.target.dataset.acknowledgementSearch === undefined) return; acknowledgementQuery = event.target.value; acknowledgementPage = 1; clearTimeout(setupEvents.acknowledgementSearchTimer); setupEvents.acknowledgementSearchTimer = setTimeout(renderPolicyAcknowledgements, 180); });
  $('#newsi-acknowledgement-manager').addEventListener('click', event => { const page = event.target.dataset.acknowledgementPage; if (page === undefined) return; acknowledgementPage = Number(page); renderPolicyAcknowledgements(); });
  $('#newsi-checklist-form').addEventListener('click', event => { if (event.target.dataset.cancelChecklistItem !== undefined) { editingChecklistItemId = null; renderNewSiChecklist(); } });
  $('#newsi-acknowledgement-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget), fields = ['actionTitle','instructionText','beforeHeading','beforeText','confirmationLabel','confirmationHelp','acceptedTitle','afterText'], content = Object.fromEntries(fields.map(field => [field, String(form.get(field)).trim()])); if (fields.some(field => !content[field])) return; state.policyAcknowledgementContent = { ...content, version:(Number(state.policyAcknowledgementContent.version) || 1) + 1 }; await saveDashboard('Acknowledgement text updated; employees must confirm the revised acknowledgement.'); });
  $('#newsi-checklist-form').addEventListener('submit', async event => { event.preventDefault(); const form = new FormData(event.currentTarget), existing = editingChecklistItemId && state.firstWeekChecklist.find(item => item.id === editingChecklistItemId), text = String(form.get('text')).trim(), typedUrl = String(form.get('resourceUrl')).trim(), attachment = form.get('attachment'); if (!text) return; if (typedUrl && !/^(https?:\/\/|\/|#)/i.test(typedUrl)) { event.currentTarget.querySelector('.form-status').textContent = 'Use an https:// link or an intranet path beginning with / or #.'; return; } const attachmentUrl = await uploadAdminFile(attachment, ['application/pdf','image/png','image/jpeg','image/webp','image/gif']), legacyAttachment = existing?.resourceUrl?.startsWith('/uploads/') ? existing.resourceUrl : '', savedAttachment = attachmentUrl || existing?.attachmentUrl || legacyAttachment; const record = { ...(existing || { id:`checklist-${Date.now()}` }), text, resourceLabel:String(form.get('resourceLabel')).trim(), resourceUrl:typedUrl || (existing?.resourceUrl?.startsWith('/uploads/') ? '' : existing?.resourceUrl || ''), attachmentUrl:savedAttachment, attachmentFilename:attachment?.name || existing?.attachmentFilename || attachmentFilename(savedAttachment), attachmentLabel:String(form.get('attachmentLabel')).trim() }; if (existing) Object.assign(existing, record); else state.firstWeekChecklist.push(record); editingChecklistItemId = null; await saveDashboard(existing ? 'Checklist item updated' : 'Checklist item added'); });
  document.addEventListener('click', event => { const attachment = event.target.closest('a[href^="/uploads/"]'); if (attachment && !attachment.closest('#media-modal') && !attachment.href.includes('download=1') && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); openAttachmentPreview(attachment.getAttribute('href'), attachment.textContent.trim()); } });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeCMS(); const nudge = $('#explore-nudge'); if (nudge && !nudge.hidden) { nudge.hidden = true; sessionStorage.setItem('siware-explore-nudge-v2-dismissed', 'true'); } } });
  $('#hero-action').addEventListener('click', () => $('#knowledge').scrollIntoView());
  $('#view-all-sessions').addEventListener('click', () => { activeTag = 'All'; knowledgePage = 1; $('#session-search').value = ''; renderTags(); renderSessions(); });
  $('#calendar-button').addEventListener('click', event => { event.preventDefault(); showToast('Calendar integration coming soon'); });
}
async function initialize() { if (location.hash === '#admin') { location.replace('/admin.html'); return; } try { state = normalizeState(await request('/api/dashboard')); const identity = await request('/api/auth/me').catch(() => null); state.user.permissions = Array.isArray(identity?.permissions) ? identity.permissions : []; placeCmsToggleInHeader(); renderAll(); [['#facebook-link', 'Facebook'], ['#linkedin-link', 'LinkedIn']].forEach(([selector, network]) => { const link = $(selector); if (link) { link.innerHTML = 'Visit Page <span>↗</span>'; link.setAttribute('aria-label', `Visit Si-Ware ${network} page`); } }); setupEvents(); renderYouTubeVideos(); } catch (error) { document.body.innerHTML = `<main style="max-width:600px;margin:10vh auto;font-family:system-ui"><h1>Intranet unavailable</h1><p>${escapeHtml(error.message)}</p><button type="button" onclick="location.reload()">Try again</button><p>Start the local container with <code>docker compose up --build</code>.</p></main>`; } }
document.addEventListener('click', event => { const card = event.target.closest('[data-open-announcement]'); if (card) location.assign(`/announcements.html?announcement=${encodeURIComponent(card.dataset.openAnnouncement)}`); });
document.addEventListener('keydown', event => { const card = event.target.closest?.('[data-open-announcement]'); if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); location.assign(`/announcements.html?announcement=${encodeURIComponent(card.dataset.openAnnouncement)}`); } });
initialize();
