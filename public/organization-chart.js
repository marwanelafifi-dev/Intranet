import { openMemberProfile } from './member-profile.js';
import { buildOrganizationChart, filterOrganizationChartMembers, visibleOrganizationNodeIds } from './organization-chart-data.js';
import { organizationDescriptor } from './employee-presentation.js';

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
  if (/^https?:\/\/(?:[\w-]+\.)*linkedin\.com\//i.test(linkedInUrl)) actions.push(`<a href="${escapeHtml(linkedInUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(name)}'s LinkedIn profile" title="Open LinkedIn profile">${quickActionIcons.linkedin}<span class="sr-only">LinkedIn</span></a>`);
  return actions.length ? `<nav class="org-chart-quick-actions" aria-label="Contact ${escapeHtml(name)}">${actions.join('')}</nav>` : '';
}

function allReportsCount(node) {
  return node.children.reduce((count, child) => count + 1 + allReportsCount(child), 0);
}

function nodeMarkup(node, visible, searchActive) {
  if (visible && !visible.has(node.id)) return '';
  const { member, children } = node;
  const hasChildren = children.length > 0;
  const isOpen = searchActive || expanded.has(node.id);
  const biographyAction = (member.bioEnabled === true || member.bioEnabled === 'true') && String(member.bio || '').trim()
    ? `<button class="org-chart-bio-action" type="button" data-org-profile="${node.index}">Read bio</button>`
    : '';
  const reportControl = hasChildren
    ? `<div class="org-chart-report-actions"><button class="org-chart-toggle" type="button" data-org-toggle="${escapeHtml(node.id)}" aria-expanded="${isOpen}" aria-label="${isOpen ? 'Collapse' : 'Expand'} ${escapeHtml(member.name || 'colleague')} direct reports"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg><span>Direct reports <b>${children.length}</b></span></button><button class="org-chart-expand-reports" type="button" data-org-expand-reports="${escapeHtml(node.id)}" aria-label="Expand all ${allReportsCount(node)} reports below ${escapeHtml(member.name || 'colleague')}"><span>All reports <b>${allReportsCount(node)}</b></span></button></div>`
    : '<span class="org-chart-no-reports" aria-hidden="true"></span>';
  const childrenMarkup = hasChildren
    ? `<ul class="org-chart-children" ${isOpen ? '' : 'hidden'}>${children.map(child => nodeMarkup(child, visible, searchActive)).join('')}</ul>`
    : '';
  return `<li class="org-chart-node"><article class="org-chart-person-shell"><button class="org-chart-person" type="button" data-org-profile="${node.index}" aria-label="View profile for ${escapeHtml(member.name || 'colleague')}"><span class="org-chart-person-name">${escapeHtml(member.name || 'Colleague')}</span><span class="org-chart-person-body">${avatarMarkup(member)}<span><b>${escapeHtml(member.role || 'Role not listed')}</b><small>${escapeHtml(organizationDescriptor(member))}</small></span></span></button><footer><div class="org-chart-card-actions">${quickActions(member)}${biographyAction}</div><div class="org-chart-report-control">${reportControl}</div></footer></article>${childrenMarkup}</li>`;
}

function render() {
  const query = select('#org-chart-search').value;
  const searchActive = Boolean(query.trim());
  const visible = visibleOrganizationNodeIds(roots, query);
  const markup = roots.map(root => nodeMarkup(root, visible, searchActive)).join('');
  select('#organization-chart-tree').innerHTML = markup || '<li class="org-chart-empty">No colleagues match this search.</li>';
  select('#org-chart-result-count').textContent = searchActive
    ? `${visible?.size || 0} colleagues shown in the matching hierarchy`
    : `${members.length} colleagues in the organization chart`;
  select('.org-chart-workspace').querySelectorAll('.org-chart-avatar[src]').forEach(photo => {
    photo.addEventListener('error', () => { photo.hidden = true; photo.nextElementSibling.hidden = false; }, { once:true });
  });
}

function setAllExpanded(nodes, isExpanded) {
  nodes.forEach(node => {
    if (isExpanded) expanded.add(node.id);
    else expanded.delete(node.id);
    setAllExpanded(node.children, isExpanded);
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
    roots.forEach(root => expanded.add(root.id));
    render();
  } catch (error) {
    select('#organization-chart-tree').innerHTML = `<li class="org-chart-empty" role="alert">${escapeHtml(error.message)}. Please contact People Operations.</li>`;
  } finally {
    document.documentElement.dataset.organizationChartReady = 'true';
  }
}

select('#org-chart-search').addEventListener('input', render);
select('[data-org-expand-all]').addEventListener('click', () => { setAllExpanded(roots, true); render(); });
select('[data-org-collapse-all]').addEventListener('click', () => { setAllExpanded(roots, false); roots.forEach(root => expanded.add(root.id)); render(); });
select('.org-chart-workspace').addEventListener('click', event => {
  const expandReports = event.target.closest('[data-org-expand-reports]');
  if (expandReports) {
    const nodeId = expandReports.dataset.orgExpandReports;
    const findNode = nodes => nodes.find(node => node.id === nodeId) || nodes.map(node => findNode(node.children)).find(Boolean);
    const node = findNode(roots);
    if (node) {
      expanded.add(node.id);
      setAllExpanded(node.children, true);
      render();
    }
    return;
  }
  const toggle = event.target.closest('[data-org-toggle]');
  if (toggle) {
    const { orgToggle: id } = toggle.dataset;
    if (expanded.has(id)) expanded.delete(id);
    else expanded.add(id);
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
