import { openMemberProfile } from './member-profile.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
const select = selector => document.querySelector(selector);
const membersPerPage = 24;
let members = [];
let currentPage = 1;

function joinedTimestamp(member) {
  const joined = Date.parse(String(member.joined || ''));
  const created = Date.parse(String(member.googleCreatedAt || ''));
  return Number.isFinite(joined) ? joined : Number.isFinite(created) ? created : 0;
}

const contactIcons = {
  email:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="m4.5 7 7.5 5.5L19.5 7"></path></svg>',
  phone:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.1 3.8h2.8l1.3 4-2 1.5c1.1 2.2 2.9 4 5.1 5.1l1.5-2 4 1.3v2.8c0 1-.8 1.7-1.8 1.7C11.6 18.2 5.8 12.4 5.8 5.6c0-1 .3-1.8 1.3-1.8Z"></path></svg>',
  linkedin:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 10v6M8 7.5v.1M11.5 16v-3.3a2.2 2.2 0 0 1 4.4 0V16M11.5 10v6"></path></svg>'
};
const copyIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="11" height="11" rx="1.5"></rect><path d="M16 8V5.8A1.8 1.8 0 0 0 14.2 4H5.8A1.8 1.8 0 0 0 4 5.8v8.4A1.8 1.8 0 0 0 5.8 16H8"></path></svg>';

function contactItem({ type, value, href, label, name }) {
  const safeValue = escapeHtml(value);
  return `<span class="member-contact-item"><a class="member-contact-icon" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)} ${escapeHtml(name)}" title="${escapeHtml(label)} ${escapeHtml(name)}">${contactIcons[type]}<span class="sr-only">${escapeHtml(label)}</span></a><span class="member-contact-popover" role="tooltip"><span class="member-contact-value">${safeValue}</span><button type="button" class="member-contact-copy" data-copy-contact="${safeValue}" aria-label="Copy ${escapeHtml(label.toLowerCase())} for ${escapeHtml(name)}">${copyIcon}<span>Copy</span></button></span></span>`;
}

function contactLinks(member) {
  const name = String(member.name || 'this colleague');
  const links = [];
  if (member.companyEmail) links.push(contactItem({ type:'email', value:member.companyEmail, href:`mailto:${member.companyEmail}`, label:'Email', name }));
  if (member.phone) links.push(contactItem({ type:'phone', value:member.phone, href:`tel:${String(member.phone).replace(/[^+\d().\-\s]/g, '')}`, label:'Call', name }));
  if (/^https?:\/\/(?:[\w-]+\.)*linkedin\.com\//i.test(String(member.linkedinUrl || ''))) {
    links.push(`<a class="member-contact-icon" href="${escapeHtml(member.linkedinUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(name)}'s LinkedIn profile" title="Open LinkedIn profile">${contactIcons.linkedin}<span class="sr-only">LinkedIn</span></a>`);
  }
  return links.length ? `<nav class="member-contact-links" aria-label="Contact ${escapeHtml(name)}">${links.join('')}</nav>` : '';
}

function memberCard(member) {
  const name = String(member.name || 'Colleague');
  const initials = String(member.initials || name.split(/\s+/).map(part => part[0]).join('').slice(0, 2));
  const photoUrl = member.profilePhotoUrl || member.photoUrl;
  const avatar = photoUrl
    ? `<img class="new-member-avatar new-member-photo" src="${escapeHtml(photoUrl)}" alt="" loading="lazy" /><span class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}" hidden aria-hidden="true">${escapeHtml(initials)}</span>`
    : `<span class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}" aria-hidden="true">${escapeHtml(initials)}</span>`;
  const facts = [
    ['Department', member.department || member.team],
    ['Direct manager', member.directManager],
    ['Employment', member.employmentType],
    ['Joined', member.joined]
  ].filter(([, value]) => value && value !== 'To be confirmed');
  return `<article class="new-member-announcement" data-member-id="${escapeHtml(member.id || '')}"><div class="member-card-main">${avatar}<div class="member-card-identity"><h3>${escapeHtml(name)}</h3><p>${escapeHtml(member.role || 'Role not listed')}</p></div></div><dl class="member-directory-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl><div class="member-card-footer">${contactLinks(member)}<span class="member-profile-cue" aria-hidden="true">View profile <svg viewBox="0 0 24 24" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></span></div><button class="member-row-open" type="button" data-member-profile="${members.indexOf(member)}" aria-label="View ${escapeHtml(name)}'s full profile"></button></article>`;
}

function renderMembers(resetPage = false) {
  const search = select('#member-search').value.trim().toLocaleLowerCase();
  const type = select('#member-type-filter').value;
  const department = select('#member-department-filter').value;
  const division = select('#member-division-filter').value;
  const organizationUnit = select('#member-ou-filter').value;
  const sort = select('#member-sort').value;
  const filtered = members.filter(member => {
    const details = [member.name, member.role, member.department, member.division, member.directManager, member.team, member.organizationUnit].filter(Boolean).join(' ').toLocaleLowerCase();
    return (!search || details.includes(search)) && (!type || member.employmentType === type) && (!department || member.department === department) && (!division || member.division === division) && (!organizationUnit || member.organizationUnit === organizationUnit);
  }).sort(sort === 'newest'
    ? (left, right) => joinedTimestamp(right) - joinedTimestamp(left) || String(left.name || '').localeCompare(String(right.name || ''))
    : (left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  if (resetPage) currentPage = 1;
  const pageCount = Math.max(1, Math.ceil(filtered.length / membersPerPage));
  currentPage = Math.min(currentPage, pageCount);
  const first = filtered.length ? (currentPage - 1) * membersPerPage + 1 : 0;
  const last = Math.min(currentPage * membersPerPage, filtered.length);
  const pageMembers = filtered.slice(first ? first - 1 : 0, last);
  select('#all-new-members').innerHTML = pageMembers.length
    ? pageMembers.map(memberCard).join('')
    : `<div class="member-empty-state"><h3>${members.length ? 'No colleagues found' : 'No colleagues to show yet'}</h3><p>${members.length ? 'Try another search or change the filters.' : 'The directory will appear here when employee records are available.'}</p>${members.length ? '<button type="button" data-clear-member-filters>Clear filters</button>' : ''}</div>`;
  select('#all-new-members').querySelectorAll('.new-member-photo').forEach(photo => {
    photo.addEventListener('error', () => { photo.hidden = true; photo.nextElementSibling.hidden = false; }, { once:true });
  });
  const pager = select('#member-pagination');
  pager.hidden = filtered.length <= membersPerPage;
  pager.querySelector('[data-member-page-status]').textContent = filtered.length ? `Showing ${first}–${last} of ${filtered.length} colleagues` : 'No colleagues found';
  pager.querySelector('[data-member-page-number]').textContent = `Page ${currentPage} of ${pageCount}`;
  pager.querySelector('[data-member-previous]').disabled = currentPage === 1;
  pager.querySelector('[data-member-next]').disabled = currentPage === pageCount;
  select('#member-result-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'colleague' : 'colleagues'}${filtered.length ? ` · Showing ${first}–${last}` : ''}`;
  document.dispatchEvent(new CustomEvent('recently-joined:rendered'));
}

function populateFilters() {
  const options = (values, label) => `<option value="">All ${label}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
  select('#member-type-filter').innerHTML = options([...new Set(members.map(member => member.employmentType).filter(value => value && value !== 'To be confirmed'))].sort(), 'employment types');
  select('#member-department-filter').innerHTML = options([...new Set(members.map(member => member.department).filter(value => value && value !== 'To be confirmed'))].sort(), 'departments');
  select('#member-division-filter').innerHTML = options([...new Set(members.map(member => member.division).filter(value => value && value !== 'To be confirmed'))].sort(), 'divisions');
  select('#member-ou-filter').innerHTML = options([...new Set(members.map(member => member.organizationUnit).filter(Boolean))].sort(), 'organization units');
}

const formerDefaultCopy = {
  heroLead:'Recently', heroAccent:'joined.',
  heroText:'Meet the newest colleagues bringing fresh energy and expertise to Si-Ware. Welcome them, find their teams and see who to connect with.',
  asideTitle:'Make a connection.',
  asideText:'Say hello, learn what each teammate is working on and help them feel at home from day one.',
  navJoined:'Recently joined', navGuidance:'New Si-Warians guidance',
  sectionTitle:'Recently Joined', sectionText:'Meet the colleagues who recently joined our company.'
};
function applyPageCopy(copy = {}) {
  const targets = {
    heroLead:'.policy-hero h1 span', heroAccent:'.policy-hero h1 em', heroText:'.policy-hero > div > p:last-child',
    asideTitle:'.policy-hero-aside b', asideText:'.policy-hero-aside p',
    navTitle:'.policy-nav > p', navJoined:'.policy-nav a[href="#recently-joined"]', navGuidance:'.policy-nav a[href="/new-hires.html"]',
    sectionTitle:'#recently-joined > h2', sectionText:'#recently-joined > p'
  };
  Object.entries(targets).forEach(([name, selector]) => {
    if (typeof copy?.[name] !== 'string' || !copy[name].trim() || copy[name].trim() === formerDefaultCopy[name]) return;
    const element = select(selector);
    if (element) element.textContent = copy[name].trim();
  });
}

async function loadTeam() {
  try {
    const response = await fetch('/api/dashboard', { cache:'no-store' });
    if (!response.ok) throw new Error('The team directory is unavailable');
    const data = await response.json();
    applyPageCopy(data.recentlyJoinedPageContent);
    members = (data.newMembers || []).map(member => ({
      ...member,
      employmentType:String(member.employmentType || '').trim() || 'To be confirmed',
      department:member.department || member.team || 'To be confirmed',
      division:member.division || 'To be confirmed',
      organizationUnit:String(member.organizationUnit || '').trim()
    }));
    populateFilters();
    renderMembers();
  } catch (error) {
    select('#all-new-members').innerHTML = `<div class="member-empty-state" role="alert"><h3>Directory unavailable</h3><p>${escapeHtml(error.message)}. Please refresh this page or contact People Operations.</p></div>`;
  } finally {
    document.documentElement.dataset.recentlyJoinedReady = 'true';
  }
}

['#member-type-filter', '#member-department-filter', '#member-division-filter', '#member-ou-filter', '#member-sort'].forEach(selector => select(selector).addEventListener('change', () => renderMembers(true)));
select('#member-search').addEventListener('input', () => renderMembers(true));
select('[data-member-previous]').addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; renderMembers(); } });
select('[data-member-next]').addEventListener('click', () => { currentPage += 1; renderMembers(); });
select('#all-new-members').addEventListener('click', event => {
  if (event.target.closest('[data-clear-member-filters]')) {
    select('#member-search').value = '';
    ['#member-type-filter', '#member-department-filter', '#member-division-filter', '#member-ou-filter'].forEach(selector => { select(selector).value = ''; });
    renderMembers(true);
    select('#member-search').focus();
    return;
  }
  const copy = event.target.closest('[data-copy-contact]');
  if (copy) {
    event.preventDefault();
    const value = copy.dataset.copyContact || '';
    const fallback = () => { const input = document.createElement('textarea'); input.value = value; input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select(); document.execCommand('copy'); input.remove(); };
    Promise.resolve(navigator.clipboard?.writeText ? navigator.clipboard.writeText(value) : fallback()).catch(fallback).finally(() => {
      const label = copy.querySelector('span');
      if (label) { label.textContent = 'Copied'; setTimeout(() => { label.textContent = 'Copy'; }, 1400); }
    });
    return;
  }
  const trigger = event.target.closest('[data-member-profile]');
  if (trigger) {
    const member = members[Number(trigger.dataset.memberProfile)];
    if (member) openMemberProfile(member, trigger);
  }
});

loadTeam();
