import { openMemberProfile } from './member-profile.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const employmentTypes = ['Full Time', 'Part Time', 'Summer Intern', 'Graduate Intern', 'To be confirmed'];
const select = id => document.querySelector(id);
let members = [];
function memberContactIcon(type) {
  const icons = {
    email: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="m4.5 7 7.5 5.5L19.5 7"></path></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.1 3.8h2.8l1.3 4-2 1.5c1.1 2.2 2.9 4 5.1 5.1l1.5-2 4 1.3v2.8c0 1-.8 1.7-1.8 1.7C11.6 18.2 5.8 12.4 5.8 5.6c0-1 .3-1.8 1.3-1.8Z"></path></svg>',
    linkedin: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 10v6M8 7.5v.1M11.5 16v-3.3a2.2 2.2 0 0 1 4.4 0V16M11.5 10v6"></path></svg>'
  };
  return icons[type] || '';
}

function memberContactLinks(member) {
  const links = [];
  const name = escapeHtml(member.name);
  if (member.companyEmail) links.push(`<a class="member-contact-icon" href="mailto:${escapeHtml(member.companyEmail)}" aria-label="Email ${name}" title="Email ${name}">${memberContactIcon('email')}<span class="sr-only">Email</span></a>`);
  if (member.phone) links.push(`<a class="member-contact-icon" href="tel:${escapeHtml(String(member.phone).replace(/[^+\d().\-\s]/g, ''))}" aria-label="Call ${name}" title="Call ${name}">${memberContactIcon('phone')}<span class="sr-only">Phone</span></a>`);
  if (/^https?:\/\/(?:[\w-]+\.)*linkedin\.com\//i.test(String(member.linkedinUrl || ''))) links.push(`<a class="member-contact-icon" href="${escapeHtml(member.linkedinUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${name}'s LinkedIn profile" title="Open LinkedIn profile">${memberContactIcon('linkedin')}<span class="sr-only">LinkedIn</span></a>`);
  return links.length ? `<nav class="member-contact-links" aria-label="Contact ${escapeHtml(member.name)}">${links.join('')}</nav>` : '';
}

function renderMembers() {
  const search = select('#member-search').value.trim().toLocaleLowerCase();
  const type = select('#member-type-filter').value;
  const department = select('#member-department-filter').value;
  const division = select('#member-division-filter').value;
  const filtered = members.filter(member => {
    const details = [member.name, member.role, member.department, member.division, member.directManager, member.team].filter(Boolean).join(' ').toLocaleLowerCase();
    return (!search || details.includes(search)) && (!type || member.employmentType === type) && (!department || member.department === department) && (!division || member.division === division);
  });
  const container = select('#all-new-members');
  container.innerHTML = filtered.length ? filtered.map(member => `<article class="new-member-announcement"><div class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}" aria-hidden="true">${escapeHtml(member.initials || member.name.split(' ').map(part => part[0]).join('').slice(0, 2))}</div><div><div class="new-member-announcement-head"><div><b>${escapeHtml(member.name)}</b><span>${escapeHtml(member.role)} · ${escapeHtml(member.department || member.team)}</span></div><time>${escapeHtml(member.employmentType || 'Full Time')} · ${escapeHtml(member.joined)}</time></div><p>${escapeHtml(member.message)}</p><span class="new-member-manager">Department: ${escapeHtml(member.department || 'To be confirmed')} · Division: ${escapeHtml(member.division || 'To be confirmed')} · Direct Manager: ${escapeHtml(member.directManager || 'To be confirmed')}</span></div></article>`).join('') : '<p class="empty-state">No colleagues match these filters.</p>';
  container.innerHTML = filtered.length ? filtered.map(member => `<article class="new-member-announcement"><div class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}" aria-hidden="true">${escapeHtml(member.initials || member.name.split(' ').map(part => part[0]).join('').slice(0, 2))}</div><div><header class="new-member-announcement-head"><b>${escapeHtml(member.name)}</b><span>${escapeHtml(member.role)} · ${escapeHtml(member.department || member.team)}</span></header><dl class="member-directory-facts"><div><dt>Department</dt><dd>${escapeHtml(member.department || 'To be confirmed')}</dd></div><div><dt>Division</dt><dd>${escapeHtml(member.division || 'To be confirmed')}</dd></div><div><dt>Direct manager</dt><dd>${escapeHtml(member.directManager || 'To be confirmed')}</dd></div><div><dt>Employment type</dt><dd>${escapeHtml(member.employmentType || 'Full Time')}</dd></div><div><dt>Joined</dt><dd>${escapeHtml(member.joined || 'To be confirmed')}</dd></div></dl>${member.message ? `<div class="member-welcome-note"><b>Welcome note</b><p>${escapeHtml(member.message)}</p></div>` : ''}</div></article>`).join('') : '<p class="empty-state">No colleagues match these filters.</p>';
  container.querySelectorAll('.new-member-announcement-head span').forEach((title, index) => { title.textContent = filtered[index]?.role || ''; });
  filtered.forEach((member, index) => {
    const card = container.children[index], initialsAvatar = card?.querySelector('.new-member-avatar');
    if (card) {
      card.dataset.memberId = member.id || '';
      const trigger = document.createElement('button');
      trigger.className = 'member-row-open';
      trigger.type = 'button';
      trigger.dataset.memberProfile = member.id || '';
      trigger.setAttribute('aria-label', `View ${member.name}'s profile`);
      card.append(trigger);
    }
    if (member.photoUrl && initialsAvatar) {
      const photo = document.createElement('img');
      photo.className = 'new-member-avatar new-member-photo';
      photo.src = member.photoUrl;
      photo.alt = `Photo of ${member.name}`;
      photo.onerror = () => photo.replaceWith(initialsAvatar);
      initialsAvatar.replaceWith(photo);
    }
    const details = card?.querySelector('.member-directory-facts'), contacts = memberContactLinks(member);
    if (details && contacts) details.insertAdjacentHTML('afterend', contacts);
  });
  select('#member-result-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'colleague' : 'colleagues'}`;
  document.dispatchEvent(new CustomEvent('recently-joined:rendered'));
}

function populateFilters() {
  const options = (values, label) => `<option value="">All ${label}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
  select('#member-type-filter').innerHTML = options(employmentTypes, 'employment types');
  select('#member-department-filter').innerHTML = options([...new Set(members.map(member => member.department || member.team).filter(Boolean))].sort(), 'departments');
  select('#member-division-filter').innerHTML = options([...new Set(members.map(member => member.division || member.team).filter(Boolean))].sort(), 'divisions');
}

function applyPageCopy(copy = {}) {
  const targets = {
    heroLead:'.policy-hero h1 span', heroAccent:'.policy-hero h1 em', heroText:'.policy-hero > div > p:last-child',
    asideTitle:'.policy-hero-aside b', asideText:'.policy-hero-aside p',
    navTitle:'.policy-nav > p', navJoined:'.policy-nav a[href="#recently-joined"]', navGuidance:'.policy-nav a[href="/new-hires.html"]',
    sectionTitle:'#recently-joined > h2', sectionText:'#recently-joined > p',
    footerLeft:'.policy-footer span', footerGuidance:'.policy-footer a'
  };
  Object.entries(targets).forEach(([name, selector]) => {
    if (typeof copy[name] !== 'string' || !copy[name].trim()) return;
    const element = select(selector);
    if (element) element.textContent = copy[name].trim();
  });
}

async function loadRecentlyJoined() {
  try {
    const response = await fetch('/api/dashboard');
    if (!response.ok) throw new Error('Recently joined colleagues are unavailable');
    const data = await response.json();
    applyPageCopy(data.recentlyJoinedPageContent);
    members = (data.newMembers || []).map(member => ({ ...member, employmentType: employmentTypes.includes(member.employmentType) ? member.employmentType : 'Full Time', department: member.department || member.team || 'To be confirmed', division: member.division || member.team || 'To be confirmed' }));
    populateFilters();
    renderMembers();
    document.documentElement.dataset.recentlyJoinedReady = 'true';
  } catch (error) {
    select('#all-new-members').innerHTML = `<p class="empty-state">${escapeHtml(error.message)}. Please try again or contact People Operations.</p>`;
    document.documentElement.dataset.recentlyJoinedReady = 'true';
  }
}

['#member-type-filter', '#member-department-filter', '#member-division-filter'].forEach(id => select(id).addEventListener('change', renderMembers));
select('#member-search').addEventListener('input', renderMembers);
select('#all-new-members').addEventListener('click', event => {
  const trigger = event.target.closest('[data-member-profile]');
  if (!trigger) return;
  const member = members.find(item => String(item.id) === trigger.dataset.memberProfile);
  if (member) openMemberProfile(member, trigger);
});
loadRecentlyJoined();
