import { openMemberProfile } from './member-profile.js';
import { buildOrganizationChart, filterOrganizationChartMembers } from './organization-chart-data.js';
import { organizationDescriptor } from './employee-presentation.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
const select = selector => document.querySelector(selector);
let members = [];
let roots = [];
let focusedId = '';
const quickActionIcons = {
  email:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="m4.5 7 7.5 5.5L19.5 7"></path></svg>',
  phone:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.1 3.8h2.8l1.3 4-2 1.5c1.1 2.2 2.9 4 5.1 5.1l1.5-2 4 1.3v2.8c0 1-.8 1.7-1.8 1.7C11.6 18.2 5.8 12.4 5.8 5.6c0-1 .3-1.8 1.3-1.8Z"></path></svg>',
  linkedin:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="M8 10v6M8 7.5v.1M11.5 16v-3.3a2.2 2.2 0 0 1 4.4 0V16M11.5 10v6"></path></svg>'
};

function initials(member) {
  const name = String(member.name || 'Colleague').trim();
  return String(member.initials || name.split(/\s+/).map(part => part[0]).join('').slice(0, 2)).trim();
}

function avatarMarkup(member) {
  const photoUrl = String(member.profilePhotoUrl || member.photoUrl || '').trim();
  return photoUrl
    ? `<img class="org-chart-avatar" src="${escapeHtml(photoUrl)}" alt="" loading="lazy" /><span class="org-chart-avatar org-chart-initials" style="--member-color:${escapeHtml(member.color || '#dceeff')}" hidden aria-hidden="true">${escapeHtml(initials(member))}</span>`
    : `<span class="org-chart-avatar org-chart-initials" style="--member-color:${escapeHtml(member.color || '#dceeff')}" aria-hidden="true">${escapeHtml(initials(member))}</span>`;
}

function quickActions(member) {
  const name = String(member.name || 'colleague').trim();
  const email = String(member.companyEmail || '').trim();
  const phone = String(member.phone || '').trim();
  const telephone = phone.replace(/[^+\d().\-\s]/g, '');
  const linkedInUrl = String(member.linkedinUrl || '').trim();
  const actions = [];
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) actions.push(`<a href="mailto:${escapeHtml(email)}" aria-label="Email ${escapeHtml(name)}" title="Email ${escapeHtml(name)}">${quickActionIcons.email}<span class="sr-only">Email</span></a>`);
  if (telephone) actions.push(`<a href="tel:${escapeHtml(telephone)}" aria-label="Call ${escapeHtml(name)}" title="Call ${escapeHtml(name)}">${quickActionIcons.phone}<span class="sr-only">Call</span></a>`);
  if (/^https?:\/\/(?:[\w-]+\.)*linkedin\.com\//i.test(linkedInUrl)) actions.push(`<a href="${escapeHtml(linkedInUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(name)}'s LinkedIn profile" title="Open LinkedIn profile">${quickActionIcons.linkedin}<span class="sr-only">LinkedIn</span></a>`);
  return actions.length ? `<nav class="org-chart-quick-actions" aria-label="Contact ${escapeHtml(name)}">${actions.join('')}</nav>` : '';
}

function cardMarkup(node) {
  const { member, children } = node;
  const biographyAction = (member.bioEnabled === true || member.bioEnabled === 'true') && String(member.bio || '').trim() ? `<button class="org-chart-bio-action" type="button" data-org-profile="${node.index}">Read bio</button>` : '';
  const reportControl = children.length
    ? `<button class="org-chart-toggle" type="button" data-org-focus="${escapeHtml(node.id)}" aria-label="View ${escapeHtml(member.name || 'colleague')}'s direct reports"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg><span>View ${children.length} report${children.length === 1 ? '' : 's'}</span></button>`
    : '<span class="org-chart-no-reports">Individual contributor</span>';
  return `<article class="org-chart-person-shell"><button class="org-chart-person" type="button" data-org-profile="${node.index}" aria-label="View profile for ${escapeHtml(member.name || 'colleague')}"><span class="org-chart-person-name">${escapeHtml(member.name || 'Colleague')}</span><span class="org-chart-person-body">${avatarMarkup(member)}<span><b>${escapeHtml(member.role || 'Role not listed')}</b><small>${escapeHtml(organizationDescriptor(member))}</small></span></span></button><footer><div class="org-chart-card-actions">${quickActions(member)}${biographyAction}</div><div class="org-chart-report-control">${reportControl}</div></footer></article>`;
}

function flatten(nodes, items = []) {
  nodes.forEach(node => { items.push(node); flatten(node.children, items); });
  return items;
}

function findPath(nodes, id, ancestors = []) {
  for (const node of nodes) {
    const path = [...ancestors, node];
    if (node.id === id) return path;
    const childPath = findPath(node.children, id, path);
    if (childPath) return childPath;
  }
  return null;
}

function matchesSearch(member, query) {
  const term = String(query || '').trim().toLocaleLowerCase();
  return !term || [member.name, member.companyEmail, member.role, member.department, member.sector, member.directManager, member.organizationUnit]
    .some(value => String(value || '').toLocaleLowerCase().includes(term));
}

function leadershipMarkup() {
  return `<section class="org-chart-top-leadership" aria-labelledby="org-chart-top-leadership-title"><div><h2 id="org-chart-top-leadership-title">Top leadership</h2><p>Choose a leader to review their reporting line.</p></div><div class="org-chart-leadership-grid">${roots.map(cardMarkup).join('')}</div></section>`;
}

function breadcrumbMarkup(path) {
  return `<nav class="org-chart-breadcrumb" aria-label="Reporting path">${path.map((node, index) => `${index ? '<span aria-hidden="true">/</span>' : ''}<button type="button" data-org-focus="${escapeHtml(node.id)}" ${index === path.length - 1 ? 'aria-current="page"' : ''}>${escapeHtml(node.member.name || 'Colleague')}</button>`).join('')}</nav>`;
}

function renderExplorer() {
  const path = focusedId ? findPath(roots, focusedId) : null;
  if (!path) return `<section class="org-chart-explorer">${leadershipMarkup()}<p class="org-chart-explorer-guidance">Select <strong>View reports</strong> on a leadership card to explore that reporting line.</p></section>`;
  const leader = path.at(-1);
  const reports = leader.children || [];
  return `<section class="org-chart-explorer">${leadershipMarkup()}<section class="org-chart-reporting-line" aria-labelledby="org-chart-reporting-title">${breadcrumbMarkup(path)}<div class="org-chart-reporting-heading"><div><h2 id="org-chart-reporting-title">Reporting to ${escapeHtml(leader.member.name || 'this leader')}</h2><p>${reports.length ? `${reports.length} direct report${reports.length === 1 ? '' : 's'} in this reporting line.` : 'This colleague has no direct reports.'}</p></div>${path.length > 1 ? `<button class="org-chart-back" type="button" data-org-focus="${escapeHtml(path.at(-2).id)}">Back to manager</button>` : ''}</div>${reports.length ? `<div class="org-chart-report-grid">${reports.map(cardMarkup).join('')}</div>` : '<p class="org-chart-empty">No direct reports are listed for this colleague.</p>'}</section></section>`;
}

function renderSearch(query) {
  const matches = flatten(roots).filter(node => matchesSearch(node.member, query));
  return `<section class="org-chart-explorer"><section class="org-chart-search-results" aria-labelledby="org-chart-search-results-title"><div><h2 id="org-chart-search-results-title">Search results</h2><p>${matches.length} colleague${matches.length === 1 ? '' : 's'} match “${escapeHtml(query.trim())}”.</p></div>${matches.length ? `<div class="org-chart-search-grid">${matches.map(cardMarkup).join('')}</div>` : '<p class="org-chart-empty">No colleagues match this search.</p>'}</section></section>`;
}

function render() {
  const query = select('#org-chart-search').value;
  select('#organization-chart-tree').innerHTML = query.trim() ? renderSearch(query) : renderExplorer();
  select('#org-chart-result-count').textContent = query.trim() ? 'Search results' : `${members.length} colleagues in the organization chart`;
  select('.org-chart-workspace').querySelectorAll('.org-chart-avatar[src]').forEach(photo => {
    photo.addEventListener('error', () => { photo.hidden = true; photo.nextElementSibling.hidden = false; }, { once:true });
  });
}

async function loadChart() {
  try {
    const response = await fetch('/api/dashboard', { cache:'no-store' });
    if (!response.ok) throw new Error('The organization chart is unavailable');
    const data = await response.json();
    if (data.recentlyJoinedPageContent?.orgChartEnabled === false) throw new Error('The organization chart is not currently available');
    members = filterOrganizationChartMembers((data.newMembers || []).map(member => ({ ...member })), data.recentlyJoinedPageContent?.orgChartOrganizationUnits);
    roots = buildOrganizationChart(members);
    render();
  } catch (error) {
    select('#organization-chart-tree').innerHTML = `<p class="org-chart-empty" role="alert">${escapeHtml(error.message)}. Please contact People Operations.</p>`;
  } finally {
    document.documentElement.dataset.organizationChartReady = 'true';
  }
}

select('#org-chart-search').addEventListener('input', render);
select('[data-org-back-to-top]').addEventListener('click', () => { focusedId = ''; select('#org-chart-search').value = ''; render(); });
select('.org-chart-workspace').addEventListener('click', event => {
  const focus = event.target.closest('[data-org-focus]');
  if (focus) {
    focusedId = focus.dataset.orgFocus;
    select('#org-chart-search').value = '';
    render();
    select('#organization-chart-tree').scrollIntoView({ block:'start', behavior:'smooth' });
    return;
  }
  const profile = event.target.closest('[data-org-profile]');
  if (profile) {
    const member = members[Number(profile.dataset.orgProfile)];
    if (member) openMemberProfile(member, profile, members);
  }
});

loadChart();
