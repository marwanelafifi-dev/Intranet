import { openMemberProfile } from './member-profile.js';
import { buildOrganizationChart, visibleOrganizationNodeIds } from './organization-chart-data.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
const select = selector => document.querySelector(selector);
let members = [];
let roots = [];
const expanded = new Set();
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
  if (/^https?:\/\/(?:[\w-]+\.)*linkedin\.com\//i.test(linkedInUrl)) actions.push(`<a href="${escapeHtml(linkedInUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(name)}’s LinkedIn profile" title="Open LinkedIn profile">${quickActionIcons.linkedin}<span class="sr-only">LinkedIn</span></a>`);
  return actions.length ? `<nav class="org-chart-quick-actions" aria-label="Contact ${escapeHtml(name)}">${actions.join('')}</nav>` : '';
}

function nodeMarkup(node, visible, searchActive) {
  if (visible && !visible.has(node.id)) return '';
  const { member, children } = node;
  const hasChildren = children.length > 0;
  const isOpen = searchActive || expanded.has(node.id);
  const avatar = avatarMarkup(member);
  const structure = [member.sector, member.department].filter(value => value && value !== 'To be confirmed').join(' · ');
  const childrenMarkup = hasChildren ? `<ul class="org-chart-children" ${isOpen ? '' : 'hidden'}>${children.map(child => nodeMarkup(child, visible, searchActive)).join('')}</ul>` : '';
  return `<li class="org-chart-node"><article class="org-chart-person-shell"><button class="org-chart-person" type="button" data-org-profile="${node.index}" aria-label="View profile for ${escapeHtml(member.name || 'colleague')}"><span class="org-chart-person-name">${escapeHtml(member.name || 'Colleague')}</span><span class="org-chart-person-body">${avatar}<span><b>${escapeHtml(member.role || 'Role not listed')}</b>${structure ? `<small>${escapeHtml(structure)}</small>` : ''}</span></span></button><footer>${quickActions(member)}${hasChildren ? `<button class="org-chart-toggle" type="button" data-org-toggle="${escapeHtml(node.id)}" aria-expanded="${isOpen}" aria-label="${isOpen ? 'Collapse' : 'Expand'} ${escapeHtml(member.name || 'colleague')}’s direct reports"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg><span>${children.length} direct report${children.length === 1 ? '' : 's'}</span></button>` : '<span class="org-chart-no-reports">Individual contributor</span>'}</footer></article>${childrenMarkup}</li>`;
}

function render() {
  const query = select('#org-chart-search').value;
  const visible = visibleOrganizationNodeIds(roots, query);
  const markup = roots.map(root => nodeMarkup(root, visible, Boolean(query.trim()))).join('');
  select('#organization-chart-tree').innerHTML = markup || '<p class="org-chart-empty">No colleagues match this search.</p>';
  select('#org-chart-result-count').textContent = query.trim() ? `${visible?.size || 0} colleagues shown in the matching hierarchy` : `${members.length} colleagues in the organization chart`;
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
    members = (data.newMembers || []).map(member => ({ ...member }));
    roots = buildOrganizationChart(members);
    roots.forEach(root => expanded.add(root.id));
    render();
  } catch (error) {
    select('#organization-chart-tree').innerHTML = `<p class="org-chart-empty" role="alert">${escapeHtml(error.message)}. Please contact People Operations.</p>`;
  } finally {
    document.documentElement.dataset.organizationChartReady = 'true';
  }
}

select('#org-chart-search').addEventListener('input', render);
select('[data-org-expand-all]').addEventListener('click', () => { const add = nodes => nodes.forEach(node => { expanded.add(node.id); add(node.children); }); add(roots); render(); });
select('[data-org-collapse-all]').addEventListener('click', () => { expanded.clear(); roots.forEach(root => expanded.add(root.id)); render(); });
select('.org-chart-workspace').addEventListener('click', event => {
  const toggle = event.target.closest('[data-org-toggle]');
  if (toggle) {
    const id = toggle.dataset.orgToggle;
    if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
    render();
    return;
  }
  const profile = event.target.closest('[data-org-profile]');
  if (profile) {
    const member = members[Number(profile.dataset.orgProfile)];
    if (member) openMemberProfile(member, profile, members);
  }
});

loadChart();
