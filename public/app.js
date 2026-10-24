import { renderNewsShifter } from './news-shifter.js?v=20261017-current-administration';
import { openMemberProfile } from './member-profile.js';
import { signOut } from './account-actions.js';
import { canOpenAdmin } from './admin-permissions.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const icon = { mail:'✉', check:'✓', folder:'▰', life:'⌁', people:'♙', phone:'⌕', tree:'⌘', clock:'◷', cube:'◇', chart:'◫', spark:'✦', bot:'◉' };
let state, activeTag = 'All', knowledgePage = 1;
let calendarSelectedDate = cairoDateKey(new Date());
let calendarVisibleMonth = calendarSelectedDate.slice(0, 7);
let knownAnnouncementIds = new Set();
let notificationRefreshTimer;
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
const dashboardLayout = ['apps', 'announcements', 'new-members', 'company-news', 'social', 'news', 'moments', 'knowledge', 'events', 'whistleblower'];
const newsFirstDashboardLayout = ['company-news', 'announcements', 'new-members', 'social', 'news', 'moments', 'knowledge', 'events', 'whistleblower'];
const dashboardLayoutVersion = 'company-news-v1';
const defaultHomeWidgetSizes = { apps:'full', announcements:'wide', 'new-members':'compact', 'company-news':'full' };
const memberEmploymentTypes = ['Full Time', 'Part Time', 'Summer Intern', 'Graduate Intern'];
const supportPortalDefaults = [
  { id: 'portal-company', name: 'Company Portal', description: 'Submit and track Administration, Finance & People Team requests', url: '', icon: 'building' },
  { id: 'portal-service-desk', name: 'SolarWinds Service Desk', description: 'IT Support', url: '', icon: 'support' },
  { id: 'portal-mohr', name: 'MOHR', description: 'Payslips & HR topics', url: '', icon: 'payroll' }
];
const industryFeeds = [
  {
    id:'nature-optical-spectroscopy', label:'Nature · Optical spectroscopy', source:'Nature Portfolio', url:'https://www.nature.com/subjects/optical-spectroscopy',
    items:[
      { type:'Research', date:'Oct 23, 2026', title:'Machine learning for high-throughput spatially resolved ARPES measurements', summary:'A study of faster spatially resolved spectroscopy while retaining reliable domain classification.', url:'https://www.nature.com/articles/s41598-026-75986-z' },
      { type:'Research', date:'Oct 16, 2026', title:'Diffuse reflectance spectroscopy for tumour-border detection', summary:'Optical spectroscopy is evaluated for real-time support during colorectal cancer surgery.', url:'https://www.nature.com/subjects/optical-spectroscopy' },
      { type:'Research', date:'Oct 3, 2026', title:'Hyperspectral reflectance imaging for microalgae phenotyping', summary:'A non-invasive approach uses reflectance data to identify useful physiological and biochemical markers.', url:'https://www.nature.com/subjects/optical-spectroscopy' }
    ]
  },
  {
    id:'semiconductor-digest', label:'Semiconductor Digest', source:'Semiconductor Digest', url:'https://www.semiconductor-digest.com/',
    items:[
      { type:'Industry briefing', date:'Source coverage', title:'Semiconductor, packaging and MEMS coverage', summary:'Follow the publication’s reporting on devices, manufacturing, packaging and MEMS developments.', url:'https://www.semiconductor-digest.com/' },
      { type:'Technology', date:'Source coverage', title:'Design and manufacturing developments', summary:'Explore current coverage from the Semiconductor Digest newsroom and specialist categories.', url:'https://www.semiconductor-digest.com/' }
    ]
  },
  {
    id:'dairyland-laboratories', label:'Dairyland Laboratories', source:'Dairyland Laboratories', url:'https://dairylandlabs.com/',
    items:[
      { type:'Applied NIR', date:'Field resource', title:'Portable NIR for feed quality and process control', summary:'Dairyland highlights NIR tools for on-site moisture measurement, quality assurance and process decisions.', url:'https://dairylandlabs.com/dairyland-portable-nir' },
      { type:'Quality assurance', date:'Field resource', title:'Mill quality assurance with NIR calibration', summary:'Explore feed-quality monitoring, trend reporting and laboratory-backed quality assurance practices.', url:'https://dairylandlabs.com/mill-quality-assurance' },
      { type:'Research & development', date:'Field resource', title:'Testing services for feed, forage, water and mycotoxins', summary:'Dairyland’s laboratory resources cover agricultural analysis and next-generation calibration work.', url:'https://dairylandlabs.com/' }
    ]
  },
  {
    id:'mdpi-agriculture', label:'MDPI · Agriculture', source:'MDPI Agriculture', url:'https://www.mdpi.com/journal/agriculture',
    items:[
      { type:'Research', date:'Oct 22, 2026', title:'Rice seedling leaf-age recognition using imaging and YOLO-PFL', summary:'Research into automated leaf-age recognition for agricultural decision-making and transplant timing.', url:'https://www.mdpi.com/2077-0472/16/21/2311' },
      { type:'Research', date:'Oct 22, 2026', title:'Soil quality shapes yield gains from improved management', summary:'An analysis of how soil conditions influence yield improvements in cereal production systems.', url:'https://www.mdpi.com/2077-0472/16/21/2309' },
      { type:'Review', date:'Oct 19, 2026', title:'From crop-row perception to autonomous row following', summary:'A review of perception, navigation and control approaches for agricultural robotics.', url:'https://www.mdpi.com/2077-0472/16/20/2275' }
    ]
  },
  {
    id:'jnirs', label:'Journal of Near Infrared Spectroscopy', source:'SAGE Journals', url:'https://journals.sagepub.com/home/jns',
    items:[
      { type:'Research', date:'Sep 30, 2026', title:'Portable SpectroChip-integrated MEMS spectrometer for silica determination', summary:'A compact MEMS spectroscopy approach for rapid colorimetric measurement in ultrapure water.', url:'https://journals.sagepub.com/toc/JNS/0/0' },
      { type:'Research', date:'Sep 3, 2026', title:'NIR prediction models for high-throughput Larix phenotyping', summary:'Near-infrared spectroscopy supports rapid phenotyping for tree-breeding programmes.', url:'https://journals.sagepub.com/toc/JNS/0/0' },
      { type:'Research', date:'Apr 22, 2026', title:'Multimodal near-infrared spectroscopy for biosensing applications', summary:'An overview of NIR sensing approaches for biosensing and related instrumentation.', url:'https://journals.sagepub.com/toc/jns/current' }
    ]
  }
];
const displayTimestamp = value => value ? new Intl.DateTimeFormat('en', { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'Africa/Cairo' }).format(new Date(value)) : 'No file uploaded';
function normalizeState(data) {
  data.homePageContent = { heroTitle:'Make room for what’s next.', heroDescription:'One place to find your people, sharpen your craft, and keep the work moving with purpose.', heroAction:'Explore what’s happening', heroActionUrl:'#knowledge', ...(data.homePageContent || {}) };
  data.newMembers ??= [];
  data.newMembers = data.newMembers.map(member => ({ ...member, employmentType: memberEmploymentTypes.includes(member.employmentType) ? member.employmentType : 'Full Time', department: member.department || member.team || 'To be confirmed', division: member.division || 'To be confirmed' }));
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
  data.events ??= [];
  data.moments ??= [];
  data.moments = data.moments.map((moment, index) => ({ ...moment, id:moment.id || `moment-${index + 1}` }));
  data.supportPortals ??= supportPortalDefaults.map(portal => ({ ...portal }));
  data.settings ??= { hiddenWidgets: [], layout: dashboardLayout };
  data.settings.hiddenWidgets ??= [];
  data.settings.widgetSizes ??= {};
  data.settings.removedWidgets ??= [];
  if (data.settings.layoutSizingVersion !== 'home-grid-v3') { data.settings.widgetSizes = {}; data.settings.layoutSizingVersion = 'home-grid-v3'; }
  if (data.settings.layout?.includes('actions')) data.settings.layout = data.settings.layout.map(item => item === 'actions' ? 'new-members' : item);
  if (data.settings.layout?.includes('new-warians')) data.settings.layout = data.settings.layout.map(item => item === 'new-warians' ? 'company-news' : item);
  if (!data.settings.layout?.includes('apps') && !data.settings.removedWidgets.includes('apps')) data.settings.layout = ['apps', ...(data.settings.layout || dashboardLayout.filter(key => key !== 'apps'))];
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
function visibleAnnouncements() {
  return (state.announcements || [])
    .filter(item => item.hidden !== true && item.hidden !== 'true')
    .slice()
    .sort((first, second) => new Date(second.publishedAt || second.date || 0) - new Date(first.publishedAt || first.date || 0));
}
function notificationStorageKey() {
  return `siware-announcement-notifications:${String(state?.user?.email || state?.user?.id || state?.user?.name || 'employee').trim().toLowerCase()}`;
}
function readNotificationIds() {
  try { return new Set(JSON.parse(localStorage.getItem(notificationStorageKey()) || '[]').map(String)); } catch { return new Set(); }
}
function saveNotificationIds(ids) {
  try { localStorage.setItem(notificationStorageKey(), JSON.stringify([...ids].slice(-160))); } catch {}
}
function notificationTime(item) {
  const value = item.publishedAt || item.date;
  const time = value ? new Date(value) : null;
  return time && !Number.isNaN(time.getTime()) ? new Intl.DateTimeFormat('en', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'Africa/Cairo' }).format(time) : (item.date || 'New');
}
function renderNotifications() {
  const panel = $('#notification-panel'), button = $('#notification-button'), badge = $('#notification-badge');
  if (!panel || !button || !badge) return;
  const items = visibleAnnouncements().slice(0, 12), readIds = readNotificationIds();
  const unread = items.filter(item => !readIds.has(String(item.id)));
  badge.hidden = !unread.length;
  badge.textContent = unread.length > 9 ? '9+' : String(unread.length);
  button.setAttribute('aria-label', unread.length ? `Announcements, ${unread.length} unread` : 'Announcements, all read');
  panel.innerHTML = `<header class="notification-panel-head"><div><h2>Announcements</h2><p>${unread.length ? `${unread.length} unread` : 'You’re all caught up'}</p></div>${unread.length ? '<button type="button" data-notification-mark-all>Mark all read</button>' : ''}</header><div class="notification-list">${items.length ? items.map(item => { const unreadItem = !readIds.has(String(item.id)); return `<button class="notification-item${unreadItem ? ' is-unread' : ''}" type="button" data-notification-id="${escapeHtml(item.id)}"><span class="notification-item-dot" aria-hidden="true"></span><span class="notification-item-copy"><span class="notification-item-meta">${escapeHtml(item.tag || 'Company update')} · ${escapeHtml(notificationTime(item))}</span><strong>${escapeHtml(item.title || 'Untitled announcement')}</strong><small>${escapeHtml(announcementPreview(item.body || item.message || item.description || item.bodyHtml, item.title) || 'Open announcement')}</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>`; }).join('') : '<p class="notification-empty">No published announcements yet.</p>'}</div><footer class="notification-panel-foot"><a href="/announcements.html">View all announcements <span aria-hidden="true">→</span></a></footer>`;
}
function setNotificationPanel(open) {
  const panel = $('#notification-panel'), button = $('#notification-button');
  if (!panel || !button) return;
  panel.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  if (open) panel.querySelector('.notification-item, .notification-panel-foot a')?.focus();
}
function markAnnouncementRead(id) {
  const readIds = readNotificationIds();
  readIds.add(String(id));
  saveNotificationIds(readIds);
  renderNotifications();
}
function markAllAnnouncementsRead() {
  const readIds = readNotificationIds();
  visibleAnnouncements().forEach(item => readIds.add(String(item.id)));
  saveNotificationIds(readIds);
  renderNotifications();
}
async function refreshAnnouncementNotifications() {
  if (document.hidden) return;
  try {
    const dashboard = await request('/api/dashboard');
    const announcements = Array.isArray(dashboard.announcements) ? dashboard.announcements : [];
    const newItems = announcements.filter(item => item.hidden !== true && item.hidden !== 'true' && !knownAnnouncementIds.has(String(item.id)));
    state.announcements = announcements;
    announcements.forEach(item => knownAnnouncementIds.add(String(item.id)));
    renderAnnouncement();
    renderNotifications();
    if (newItems.length) showToast(newItems.length === 1 ? `New announcement: ${newItems[0].title || 'Company update'}` : `${newItems.length} new announcements are ready.`);
  } catch {}
}
function startAnnouncementNotifications() {
  knownAnnouncementIds = new Set((state.announcements || []).map(item => String(item.id)));
  window.clearInterval(notificationRefreshTimer);
  notificationRefreshTimer = window.setInterval(refreshAnnouncementNotifications, 60_000);
}
function renderVectorIcons() {
  $$('#app-grid .app-icon').forEach((element, index) => { if (!state.apps[index]?.iconUrl) element.innerHTML = appIcon(state.apps[index]?.icon); });
  $$('#app-manager .manager-row .app-icon').forEach((element, index) => { element.innerHTML = appIcon(state.apps[index]?.icon); });
  $$('#portal-manager .manager-row .app-icon').forEach((element, index) => { element.innerHTML = appIcon(state.supportPortals[index]?.icon); });
}
function renderNews() {
  const selector = $('#feed-selector');
  if (!selector.options.length) selector.innerHTML = industryFeeds.map(feed => `<option value="${feed.id}">${escapeHtml(feed.label)}</option>`).join('');
  const feed = industryFeeds.find(item => item.id === selector.value) || industryFeeds[0];
  selector.value = feed.id;
  $('#news-list').innerHTML = feed.items.map(item => `<article class="network-post industry-post"><div class="network-post-meta"><span>${escapeHtml(feed.source)}</span><span aria-hidden="true">·</span><span>${escapeHtml(item.date)}</span></div><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.summary)}</p><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Read from ${escapeHtml(feed.source)} <span aria-hidden="true">↗</span></a></article>`).join('');
  $('#news-list').classList.add('social-feed-scroll', 'industry-feed-scroll');
  const sourceLink = $('#feed-link');
  sourceLink.href = feed.url;
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
  sourceLink.innerHTML = `Visit ${escapeHtml(feed.source)} <span aria-hidden="true">↗</span>`;
  sourceLink.setAttribute('aria-label', `Visit ${feed.source}`);
}
function renderCompanyNews() { if (state.user.permissions?.includes('intranet.news')) renderNewsShifter($('#dashboard-news-shifter')); }
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
    const caption = `<span class="moment-kind">${escapeHtml(item.kind)}</span><small class="moment-title">${escapeHtml(item.title)}${mediaLabel ? `<em>${mediaLabel}</em>` : ''}</small>`;
    const className = `moment${item.mediaUrl ? ' has-media' : ''}${expanded ? ' gallery-moment' : ''}`;
    if (expanded) return item.mediaUrl ? `<a class="${className}" href="${escapeHtml(item.mediaUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(mediaLabel)}: ${escapeHtml(item.title)}" style="--moment:${escapeHtml(item.color)}">${visual}<span>${escapeHtml(item.kind)}</span><small>${escapeHtml(item.title)}${mediaLabel ? `<em>${mediaLabel}</em>` : ''}</small></a>` : `<article class="${className}" style="--moment:${escapeHtml(item.color)}"><span>${escapeHtml(item.kind)}</span><small>${escapeHtml(item.title)}</small></article>`;
    return item.mediaUrl ? `<a class="moment-entry" href="${escapeHtml(item.mediaUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(mediaLabel)}: ${escapeHtml(item.title)}"><span class="${className}" style="--moment:${escapeHtml(item.color)}">${visual}</span><span class="moment-caption">${caption}</span></a>` : `<article class="moment-entry"><span class="${className}" style="--moment:${escapeHtml(item.color)}"></span><span class="moment-caption">${caption}</span></article>`;
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
function cairoDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(value);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function calendarDateFromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
function calendarMonthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en', { month:'long', year:'numeric' }).format(new Date(year, month - 1, 1, 12));
}
function calendarDateLabel(dateKey) {
  return new Intl.DateTimeFormat('en', { weekday:'short', month:'short', day:'numeric', year:'numeric' }).format(calendarDateFromKey(dateKey));
}
function eventDateKey(item) {
  if (item.startsAt) {
    const date = new Date(item.startsAt);
    if (!Number.isNaN(date.valueOf())) return cairoDateKey(date);
  }
  const monthIndex = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(String(item.month || '').slice(0, 3).toUpperCase());
  const day = Number(item.day);
  if (monthIndex >= 0 && Number.isInteger(day) && day > 0) return `${calendarSelectedDate.slice(0, 4)}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return '';
}
function renderDashboardCalendar() {
  const selectedDate = calendarDateFromKey(calendarSelectedDate);
  const [year, month] = calendarVisibleMonth.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1, 12);
  const gridStart = new Date(year, month - 1, 1 - firstDay.getDay(), 12);
  const today = cairoDateKey(new Date());
  const eventDays = new Set((state.events || []).map(eventDateKey));
  $('#dashboard-calendar-title').textContent = calendarDateLabel(calendarSelectedDate);
  $('#dashboard-calendar-month').textContent = calendarMonthLabel(calendarVisibleMonth);
  $('#dashboard-calendar-date').value = calendarSelectedDate;
  $('#dashboard-calendar-days').innerHTML = Array.from({ length:42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index, 12);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const classes = ['calendar-day'];
    if (key.slice(0, 7) !== calendarVisibleMonth) classes.push('is-outside-month');
    if (key === today) classes.push('is-today');
    if (key === calendarSelectedDate) classes.push('is-selected');
    if (eventDays.has(key)) classes.push('has-events');
    const count = (state.events || []).filter(item => eventDateKey(item) === key).length;
    return `<button class="${classes.join(' ')}" type="button" data-calendar-date="${key}" role="gridcell" aria-label="${escapeHtml(calendarDateLabel(key))}${count ? `, ${count} event${count === 1 ? '' : 's'}` : ''}"${key === calendarSelectedDate ? ' aria-selected="true"' : ''}>${date.getDate()}</button>`;
  }).join('');
  const selectedEvents = (state.events || []).filter(item => eventDateKey(item) === calendarSelectedDate);
  $('#calendar-event-summary').textContent = selectedEvents.length ? `${selectedEvents.length} event${selectedEvents.length === 1 ? '' : 's'} on this date` : 'No events on this date';
}
function renderEvents() {
  const selectedEvents = (state.events || []).filter(item => eventDateKey(item) === calendarSelectedDate);
  const heading = `<div class="events-day-heading"><b>Events on ${escapeHtml(calendarDateLabel(calendarSelectedDate))}</b><span>${selectedEvents.length ? `${selectedEvents.length} scheduled` : 'No events scheduled'}</span></div>`;
  const eventMarkup = item => `<article class="event event-open" data-event-index="${state.events.indexOf(item)}" tabindex="0" role="button" aria-label="View details for ${escapeHtml(item.title)}"><div class="date-block"><b>${escapeHtml(item.day)}</b><small>${escapeHtml(item.month)}</small></div><div><p>${escapeHtml(item.title)}</p><span>${escapeHtml(item.time)} · ${escapeHtml(item.type)}</span></div></article>`;
  const primaryLocations = ['3rd Floor Meeting Room', 'Recreational Area Space'];
  const sameLocation = (item, location) => String(item.type || '').trim().toLowerCase() === location.toLowerCase();
  const locationGroups = primaryLocations.map(location => ({ location, events:selectedEvents.filter(item => sameLocation(item, location)) })).filter(group => group.events.length);
  const otherEvents = selectedEvents.filter(item => !primaryLocations.some(location => sameLocation(item, location)));
  if (otherEvents.length) locationGroups.push({ location:'Other locations', events:otherEvents });
  const groupedEvents = locationGroups.map(group => `<section class="event-location-group" aria-label="${escapeHtml(group.location)} events"><header><b>${escapeHtml(group.location)}</b><span>${group.events.length} scheduled</span></header><div class="event-location-list">${group.events.map(eventMarkup).join('')}</div></section>`).join('');
  $('#event-list').innerHTML = heading + (selectedEvents.length
    ? `<div class="event-location-groups">${groupedEvents}</div>`
    : '<p class="events-empty-state">There are no events scheduled for this date. Choose another date or month to review the calendar.</p>');
  renderDashboardCalendar();
}
function renderPrivateEventDetails(details) {
  const section = $('#event-private-details'), description = $('#event-detail-description'), links = $('#event-detail-links'), attachments = $('#event-detail-attachments'), participants = $('#event-detail-participants'), note = $('#event-detail-access-note');
  section.hidden = !details?.authorised;
  links.replaceChildren(); attachments.replaceChildren(); participants.replaceChildren(); description.textContent = '';
  if (!details?.authorised) { note.textContent = 'Private meeting details are available only to invited guests.'; return; }
  note.textContent = details.access === 'role' ? 'Private details are visible through your calendar-detail access.' : 'Private details are visible because you are invited to this event.';
  const appendLinkedText = (container, value) => {
    const source = String(value || ''), matcher = /https:\/\/[^\s<>"']+/gi;
    let cursor = 0, match;
    while ((match = matcher.exec(source))) {
      container.append(document.createTextNode(source.slice(cursor, match.index)));
      const link = document.createElement('a'); link.href = match[0]; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'event-description-link'; link.textContent = match[0]; container.append(link);
      cursor = match.index + match[0].length;
    }
    container.append(document.createTextNode(source.slice(cursor)));
  };
  appendLinkedText(description, details.description);
  const appendLinks = (container, items, title) => {
    if (!items?.length) return;
    const heading = document.createElement('h4'); heading.textContent = title; container.append(heading);
    const list = document.createElement('div'); list.className = `event-private-link-list${title === 'Join meeting' ? ' event-meeting-link-list' : ''}`;
    items.forEach(item => { const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = item.label || item.title || 'Open'; list.append(link); });
    container.append(list);
  };
  appendLinks(links, details.meetingLinks, 'Join meeting');
  appendLinks(attachments, details.attachments, 'Attachments');
  if (details.organizer || details.invitees?.length) {
    const heading = document.createElement('h4'); heading.textContent = 'Meeting participants'; participants.append(heading);
    const list = document.createElement('div'); list.className = 'event-participant-list';
    const appendPerson = (label, person) => { const row = document.createElement('p'), labelNode = document.createElement('b'), value = document.createElement('span'); labelNode.textContent = label; value.textContent = person.name === person.email ? person.email : `${person.name} · ${person.email}`; row.append(labelNode, value); list.append(row); };
    if (details.organizer) appendPerson('Organizer', details.organizer);
    details.invitees?.forEach(person => appendPerson('Guest', person));
    participants.append(list);
  }
}
async function openEventDetails(item) {
  if (!item) return;
  $('#event-detail-title').textContent = item.title || 'Calendar event';
  $('#event-detail-date').textContent = calendarDateLabel(eventDateKey(item) || calendarSelectedDate);
  $('#event-detail-time').textContent = item.time || 'Time to be confirmed';
  $('#event-detail-location').textContent = item.type || 'Location to be confirmed';
  renderPrivateEventDetails(null);
  $('#event-detail-dialog').showModal();
  if (!item.id) return;
  try { renderPrivateEventDetails(await request(`/api/events/details?id=${encodeURIComponent(item.id)}`)); }
  catch { $('#event-detail-access-note').textContent = 'Private meeting details are temporarily unavailable. Please try again.'; }
}
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
function latestDirectoryMembers() {
  return [...state.newMembers].sort((a, b) => (Date.parse(b.googleCreatedAt) || 0) - (Date.parse(a.googleCreatedAt) || 0) || String(a.name || '').localeCompare(String(b.name || ''))).slice(0, 2);
}
function renderNewMembers() {
  $('#new-members-title').textContent = 'Recently Joined';
  $('.new-members-widget .widget-intro').textContent = 'Meet the newest colleagues who recently joined our company.';
  $('.new-members-widget .plain-button').setAttribute('href', '/recently-joined.html');
  const members = latestDirectoryMembers();
  $('#new-member-list').innerHTML = members.length ? members.map(member => `<article class="new-member">${member.profilePhotoUrl || member.photoUrl ? `<img class="new-member-avatar new-member-photo" data-member-photo="${escapeHtml(member.id)}" src="${escapeHtml(member.profilePhotoUrl || member.photoUrl)}" alt="Photo of ${escapeHtml(member.name)}" />` : `<span class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}">${escapeHtml(member.initials || member.name.split(' ').map(part => part[0]).join('').slice(0, 2))}</span>`}<div class="new-member-summary"><div class="member-name-line"><b>${escapeHtml(member.name)}</b>${compactMemberContacts(member)}</div><small class="member-title">${escapeHtml(member.role || 'Title to be confirmed')}</small><span class="member-department">Department: ${escapeHtml(member.department || member.team || 'To be confirmed')}</span><span class="direct-manager">Direct manager: ${escapeHtml(member.directManager || 'To be confirmed')}</span><span class="member-tenure">${escapeHtml(member.employmentType || 'Employment type to be confirmed')} · Joined ${escapeHtml(member.joined || 'date to be confirmed')}</span></div><button class="member-row-open" type="button" data-member-profile="${escapeHtml(member.id)}" aria-label="View all details for ${escapeHtml(member.name)}"></button></article>`).join('') : '<p class="empty-state">No new member announcements are available right now.</p>';
  const memberById = new Map(members.map(member => [String(member.id), member]));
  $$('#new-member-list .new-member-photo').forEach(photo => photo.addEventListener('error', () => {
    const member = memberById.get(photo.dataset.memberPhoto);
    if (!member) return;
    const fallback = document.createElement('span');
    fallback.className = 'new-member-avatar';
    fallback.style.setProperty('--member-color', member.color || '#e7f0ff');
    fallback.textContent = member.initials || String(member.name || '').split(/\s+/).map(part => part[0]).join('').slice(0, 2);
    photo.replaceWith(fallback);
  }, { once:true }));
}
function renderHomePageContent() {
  const content = state.homePageContent || {};
  const title = $('#hero-title'), description = $('.hero-copy > p:not(.eyebrow)'), action = $('#hero-action');
  if (title && content.heroTitle) title.textContent = content.heroTitle;
  if (description && content.heroDescription) description.textContent = content.heroDescription;
  if (action && content.heroAction) action.innerHTML = `${escapeHtml(content.heroAction)} <span>→</span>`;
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
  const showAdminPanel = hasAdminPanelAccess(state.user);
  $('#admin-panel-link').hidden = !showAdminPanel;
  $('#home-sign-out').hidden = Boolean(state.user.demo);
}
function hasAdminPanelAccess(user) {
  return canOpenAdmin(user?.permissions);
}
function applyLayout() {
  const defaultLayout = dashboardLayout.join(',');
  const dashboard = $('.dashboard');
  dashboard.classList.toggle('layout-custom', state.settings.layout.join(',') !== defaultLayout);
  const employeeVoiceAvailable = state.whistleblowerConfig?.enabled !== false;
  const googleFormAvailable = state.whistleblower2Config?.enabled === true;
  const whistleblowerLink = $('.whistleblower-link');
  if (whistleblowerLink && googleFormAvailable) {
    whistleblowerLink.href = '/whistleblower-2.html';
    whistleblowerLink.textContent = 'Open reporting form';
  }
  const widgetPermissions = { apps:'intranet.apps', announcements:'intranet.announcements', 'new-members':'intranet.people', 'company-news':'intranet.news', knowledge:'intranet.knowledge', whistleblower:'intranet.whistleblower', moments:'intranet.moments', social:'intranet.social', events:'intranet.events' };
  $$('[data-widget]').forEach(widget => {
    const position = state.settings.layout.indexOf(widget.dataset.widget);
    widget.hidden = state.settings.hiddenWidgets.includes(widget.dataset.widget) || Boolean(widgetPermissions[widget.dataset.widget] && !state.user.permissions?.includes(widgetPermissions[widget.dataset.widget])) || (widget.dataset.widget === 'whistleblower' && !employeeVoiceAvailable && !googleFormAvailable);
    widget.style.display = widget.hidden ? 'none' : '';
    widget.style.order = position < 0 ? 99 : position;
  });
}
function renderAll() { renderHomePageContent(); renderApps(); renderAnnouncement(); renderNewMembers(); renderNews(); renderCompanyNews(); renderTags(); renderSessions(); renderMoments(); renderEvents(); renderProfile(); renderNotifications(); renderVectorIcons(); applyLayout(); }
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
function placeHeaderTools() {
  const profile = $('#profile-button'), topbar = $('.topbar'), searchTrigger = $('[data-intranet-search-trigger]'), adminLink = $('#admin-panel-link'), notifications = $('#notification-button');
  if (!profile || !topbar) return;
  let tools = $('.dashboard-header-tools');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'dashboard-header-tools';
    const themeToggle = topbar.querySelector('[data-theme-toggle]');
    if (themeToggle) tools.append(themeToggle);
    if (notifications) tools.append(notifications);
    if (adminLink) tools.append(adminLink);
    tools.append(profile);
    topbar.append(tools);
  }
  if (searchTrigger && !tools.contains(searchTrigger)) tools.prepend(searchTrigger);
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
function attachmentFilename(url) { const file = String(url || '').split('/').pop() || ''; return decodeURIComponent(file).replace(/-\d{10,}(\.[^.]+)$/i, '$1'); }
function setupEvents() {
  $('#new-member-list').addEventListener('click', event => {
    const trigger = event.target.closest('[data-member-profile]');
    if (!trigger) return;
    const member = state.newMembers.find(item => String(item.id) === trigger.dataset.memberProfile);
    if (member) openMemberProfile(member, trigger);
  });
  $('#profile-button').addEventListener('click', () => { const menu = $('#profile-menu'); menu.hidden = !menu.hidden; $('#profile-button').setAttribute('aria-expanded', String(!menu.hidden)); });
  $('#notification-button').addEventListener('click', () => setNotificationPanel($('#notification-panel').hidden));
  $('#notification-panel').addEventListener('click', event => {
    if (event.target.closest('[data-notification-mark-all]')) { markAllAnnouncementsRead(); return; }
    const notification = event.target.closest('[data-notification-id]');
    if (!notification) return;
    markAnnouncementRead(notification.dataset.notificationId);
    location.assign(`/announcements.html?announcement=${encodeURIComponent(notification.dataset.notificationId)}`);
  });
  document.addEventListener('click', event => {
    const panel = $('#notification-panel');
    if (!panel.hidden && !event.target.closest('#notification-panel, #notification-button')) setNotificationPanel(false);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAnnouncementNotifications(); });
  $('#home-sign-out').addEventListener('click', () => signOut($('#home-sign-out'), $('#home-sign-out-status')));
  $('#feed-selector').addEventListener('change', () => { renderNews(); acknowledgeContentChange($('#news-list')); });
  $('#session-search').addEventListener('input', () => { knowledgePage = 1; renderSessions(); });
  $('#tag-filters').addEventListener('click', event => { if (!event.target.dataset.tag) return; activeTag = event.target.dataset.tag; knowledgePage = 1; renderTags(); renderSessions(); acknowledgeContentChange($('.session-table-wrap')); });
  $('#session-list').addEventListener('click', event => { const button = event.target.closest('button'); if (!button) return; const session = state.sessions.find(item => item.id === button.dataset.id); openMedia(session, button.dataset.action); });
  $('#session-pagination').addEventListener('click', event => { const direction = event.target.dataset.sessionPage; if (!direction) return; knowledgePage += direction === 'next' ? 1 : -1; renderSessions(); acknowledgeContentChange($('.session-table-wrap')); });
  $('#modal-close').addEventListener('click', () => $('#media-modal').close());
  $('#media-modal').addEventListener('click', event => { if (event.target === $('#media-modal')) $('#media-modal').close(); });
  $('#media-modal').addEventListener('cancel', event => { event.preventDefault(); $('#media-modal').close(); });
  $('#media-modal').addEventListener('close', () => { $('#media-modal video')?.pause(); });
  document.addEventListener('click', event => { const attachment = event.target.closest('a[href^="/uploads/"]'); if (attachment && !attachment.closest('#media-modal') && !attachment.href.includes('download=1') && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); openAttachmentPreview(attachment.getAttribute('href'), attachment.textContent.trim()); } });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { setNotificationPanel(false); const nudge = $('#explore-nudge'); if (nudge && !nudge.hidden) { nudge.hidden = true; sessionStorage.setItem('siware-explore-nudge-v2-dismissed', 'true'); } } });
  $('#hero-action').addEventListener('click', () => {
    const destination = String(state.homePageContent?.heroActionUrl || '#knowledge').trim();
    if (destination.startsWith('#')) { document.querySelector(destination)?.scrollIntoView({ behavior:'smooth' }); return; }
    if (/^\/(?!\/)/.test(destination) || /^https:\/\//i.test(destination)) location.assign(destination);
  });
  $('#view-all-sessions').addEventListener('click', () => { activeTag = 'All'; knowledgePage = 1; $('#session-search').value = ''; renderTags(); renderSessions(); });
  const selectCalendarDate = dateKey => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
    calendarSelectedDate = dateKey;
    calendarVisibleMonth = dateKey.slice(0, 7);
    renderEvents();
  };
  $('#calendar-button').addEventListener('click', () => selectCalendarDate(cairoDateKey(new Date())));
  $('#event-list').addEventListener('click', event => {
    const trigger = event.target.closest('[data-event-index]');
    if (trigger) openEventDetails(state.events[Number(trigger.dataset.eventIndex)]);
  });
  $('#event-list').addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const trigger = event.target.closest('[data-event-index]');
    if (!trigger) return;
    event.preventDefault();
    openEventDetails(state.events[Number(trigger.dataset.eventIndex)]);
  });
  $('#event-detail-close').addEventListener('click', () => $('#event-detail-dialog').close());
  $('#event-detail-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  $('#dashboard-calendar').addEventListener('click', event => {
    const dateButton = event.target.closest('[data-calendar-date]');
    if (dateButton) { selectCalendarDate(dateButton.dataset.calendarDate); return; }
    if (event.target.closest('[data-calendar-today]')) { selectCalendarDate(cairoDateKey(new Date())); return; }
    const [year, month] = calendarVisibleMonth.split('-').map(Number);
    if (event.target.closest('[data-calendar-previous]')) {
      const previous = new Date(year, month - 2, 1, 12);
      calendarVisibleMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
      renderDashboardCalendar();
    }
    if (event.target.closest('[data-calendar-next]')) {
      const next = new Date(year, month, 1, 12);
      calendarVisibleMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
      renderDashboardCalendar();
    }
  });
  $('#dashboard-calendar-date').addEventListener('change', event => selectCalendarDate(event.target.value));
}
async function initialize() { if (location.hash === '#admin') { location.replace('/admin.html'); return; } try { state = normalizeState(await request('/api/dashboard')); const identity = await request('/api/auth/me').catch(() => null); state.user.permissions = Array.isArray(identity?.permissions) ? identity.permissions : []; state.user.demo = Boolean(identity?.demo); state.user.email = identity?.email || state.user.email || ''; placeHeaderTools(); renderAll(); [['#facebook-link', 'Facebook'], ['#linkedin-link', 'LinkedIn']].forEach(([selector, network]) => { const link = $(selector); if (link) { link.innerHTML = 'Visit Page <span>↗</span>'; link.setAttribute('aria-label', `Visit Si-Ware ${network} page`); } }); setupEvents(); startAnnouncementNotifications(); if (state.user.permissions.includes('intranet.social')) renderYouTubeVideos(); } catch (error) { document.body.innerHTML = `<main style="max-width:600px;margin:10vh auto;font-family:system-ui"><h1>Intranet unavailable</h1><p>${escapeHtml(error.message)}</p><button type="button" onclick="location.reload()">Try again</button><p>Start the local container with <code>docker compose up --build</code>.</p></main>`; } }
document.addEventListener('click', event => { const card = event.target.closest('[data-open-announcement]'); if (card) location.assign(`/announcements.html?announcement=${encodeURIComponent(card.dataset.openAnnouncement)}`); });
document.addEventListener('keydown', event => { const card = event.target.closest?.('[data-open-announcement]'); if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); location.assign(`/announcements.html?announcement=${encodeURIComponent(card.dataset.openAnnouncement)}`); } });
initialize();
