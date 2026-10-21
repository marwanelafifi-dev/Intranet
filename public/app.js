import { renderNewsShifter } from './news-shifter.js?v=20261017-current-administration';
import { openMemberProfile } from './member-profile.js';
import { signOut } from './account-actions.js';
import { canOpenAdmin } from './admin-permissions.js';

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const icon = { mail:'✉', check:'✓', folder:'▰', life:'⌁', people:'♙', phone:'⌕', tree:'⌘', clock:'◷', cube:'◇', chart:'◫', spark:'✦', bot:'◉' };
let state, activeTag = 'All', knowledgePage = 1;
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
  { id: 'portal-company', name: 'Company Portal', description: 'Administration, Finance & People Team', url: '', icon: 'building' },
  { id: 'portal-service-desk', name: 'SolarWinds Service Desk', description: 'IT Support', url: '', icon: 'support' },
  { id: 'portal-mohr', name: 'MOHR', description: 'Payslips & HR topics', url: '', icon: 'payroll' }
];
const displayTimestamp = value => value ? new Intl.DateTimeFormat('en', { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'Africa/Cairo' }).format(new Date(value)) : 'No file uploaded';
function normalizeState(data) {
  data.homePageContent = { heroTitle:'Make room for what’s next.', heroDescription:'One place to find your people, sharpen your craft, and keep the work moving with purpose.', heroAction:'Explore what’s happening', heroActionUrl:'#knowledge', ...(data.homePageContent || {}) };
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
  $('#new-member-list').innerHTML = members.length ? members.map(member => `<article class="new-member">${member.photoUrl ? `<img class="new-member-avatar new-member-photo" src="${escapeHtml(member.photoUrl)}" alt="Photo of ${escapeHtml(member.name)}" />` : `<span class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}">${escapeHtml(member.initials || member.name.split(' ').map(part => part[0]).join('').slice(0, 2))}</span>`}<div><div class="member-name-line"><b>${escapeHtml(member.name)}</b>${compactMemberContacts(member)}</div><small>${escapeHtml(member.role)} · ${escapeHtml(member.division || member.team || 'To be confirmed')}</small><span class="direct-manager">Direct Manager: ${escapeHtml(member.directManager || 'To be confirmed')}</span><span>${escapeHtml(member.employmentType || 'Full Time')} · Joined ${escapeHtml(member.joined)}</span></div><button class="member-row-open" type="button" data-member-profile="${escapeHtml(member.id)}" aria-label="View ${escapeHtml(member.name)}'s profile"></button></article>`).join('') : '<p class="empty-state">No new member announcements are available right now.</p>';
}
function renderHomePageContent() {
  const content = state.homePageContent || {};
  const title = $('#hero-title'), description = $('.hero-copy > p:not(.eyebrow)'), action = $('#hero-action');
  if (title && content.heroTitle) title.textContent = content.heroTitle;
  if (description && content.heroDescription) description.textContent = content.heroDescription;
  if (action && content.heroAction) action.innerHTML = `${escapeHtml(content.heroAction)} <span>→</span>`;
}
function simplifyNewMemberSubtitles() {
  $$('#new-member-list .new-member small').forEach((subtitle, index) => {
    subtitle.textContent = state.newMembers.slice(0, 2)[index]?.role || '';
  });
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
  const widgetPermissions = { apps:'intranet.apps', announcements:'intranet.announcements', 'new-members':'intranet.people', 'company-news':'intranet.news', knowledge:'intranet.knowledge', whistleblower:'intranet.whistleblower', moments:'intranet.moments', social:'intranet.social', events:'intranet.events' };
  $$('[data-widget]').forEach(widget => {
    const position = state.settings.layout.indexOf(widget.dataset.widget);
    widget.hidden = state.settings.hiddenWidgets.includes(widget.dataset.widget) || Boolean(widgetPermissions[widget.dataset.widget] && !state.user.permissions?.includes(widgetPermissions[widget.dataset.widget]));
    widget.style.display = widget.hidden ? 'none' : '';
    widget.style.order = position < 0 ? 99 : position;
  });
}
function renderAll() { renderHomePageContent(); renderApps(); renderAnnouncement(); renderNewMembers(); simplifyNewMemberSubtitles(); renderNews(); renderCompanyNews(); renderTags(); renderSessions(); renderMoments(); renderEvents(); renderProfile(); renderVectorIcons(); applyLayout(); }
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
  const profile = $('#profile-button'), topbar = $('.topbar'), searchTrigger = $('[data-intranet-search-trigger]'), adminLink = $('#admin-panel-link');
  if (!profile || !topbar) return;
  let tools = $('.dashboard-header-tools');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'dashboard-header-tools';
    const themeToggle = topbar.querySelector('[data-theme-toggle]');
    if (themeToggle) tools.append(themeToggle);
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
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { const nudge = $('#explore-nudge'); if (nudge && !nudge.hidden) { nudge.hidden = true; sessionStorage.setItem('siware-explore-nudge-v2-dismissed', 'true'); } } });
  $('#hero-action').addEventListener('click', () => {
    const destination = String(state.homePageContent?.heroActionUrl || '#knowledge').trim();
    if (destination.startsWith('#')) { document.querySelector(destination)?.scrollIntoView({ behavior:'smooth' }); return; }
    if (/^\/(?!\/)/.test(destination) || /^https:\/\//i.test(destination)) location.assign(destination);
  });
  $('#view-all-sessions').addEventListener('click', () => { activeTag = 'All'; knowledgePage = 1; $('#session-search').value = ''; renderTags(); renderSessions(); });
  $('#calendar-button').addEventListener('click', event => { event.preventDefault(); showToast('Calendar integration coming soon'); });
}
async function initialize() { if (location.hash === '#admin') { location.replace('/admin.html'); return; } try { state = normalizeState(await request('/api/dashboard')); const identity = await request('/api/auth/me').catch(() => null); state.user.permissions = Array.isArray(identity?.permissions) ? identity.permissions : []; state.user.demo = Boolean(identity?.demo); placeHeaderTools(); renderAll(); [['#facebook-link', 'Facebook'], ['#linkedin-link', 'LinkedIn']].forEach(([selector, network]) => { const link = $(selector); if (link) { link.innerHTML = 'Visit Page <span>↗</span>'; link.setAttribute('aria-label', `Visit Si-Ware ${network} page`); } }); setupEvents(); if (state.user.permissions.includes('intranet.social')) renderYouTubeVideos(); } catch (error) { document.body.innerHTML = `<main style="max-width:600px;margin:10vh auto;font-family:system-ui"><h1>Intranet unavailable</h1><p>${escapeHtml(error.message)}</p><button type="button" onclick="location.reload()">Try again</button><p>Start the local container with <code>docker compose up --build</code>.</p></main>`; } }
document.addEventListener('click', event => { const card = event.target.closest('[data-open-announcement]'); if (card) location.assign(`/announcements.html?announcement=${encodeURIComponent(card.dataset.openAnnouncement)}`); });
document.addEventListener('keydown', event => { const card = event.target.closest?.('[data-open-announcement]'); if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); location.assign(`/announcements.html?announcement=${encodeURIComponent(card.dataset.openAnnouncement)}`); } });
initialize();
