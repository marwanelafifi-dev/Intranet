import { openMemberProfile } from './member-profile.js';
import { buildOrganizationChart, visibleOrganizationNodeIds } from './organization-chart-data.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
const select = selector => document.querySelector(selector);
let members = [];
let roots = [];
const expanded = new Set();

function initials(member) {
  const name = String(member.name || 'Colleague').trim();
  return String(member.initials || name.split(/\s+/).map(part => part[0]).join('').slice(0, 2)).trim();
}

function nodeMarkup(node, visible, searchActive) {
  if (visible && !visible.has(node.id)) return '';
  const { member, children } = node;
  const hasChildren = children.length > 0;
  const isOpen = searchActive || expanded.has(node.id);
  const photoUrl = String(member.profilePhotoUrl || member.photoUrl || '').trim();
  const avatar = photoUrl
    ? `<img class="org-chart-avatar" src="${escapeHtml(photoUrl)}" alt="" loading="lazy" /><span class="org-chart-avatar org-chart-initials" style="--member-color:${escapeHtml(member.color || '#dceeff')}" hidden aria-hidden="true">${escapeHtml(initials(member))}</span>`
    : `<span class="org-chart-avatar org-chart-initials" style="--member-color:${escapeHtml(member.color || '#dceeff')}" aria-hidden="true">${escapeHtml(initials(member))}</span>`;
  const childrenMarkup = hasChildren ? `<ul class="org-chart-children" ${isOpen ? '' : 'hidden'}>${children.map(child => nodeMarkup(child, visible, searchActive)).join('')}</ul>` : '';
  return `<li class="org-chart-node"><div class="org-chart-node-row">${hasChildren ? `<button class="org-chart-toggle" type="button" data-org-toggle="${escapeHtml(node.id)}" aria-expanded="${isOpen}" aria-label="${isOpen ? 'Collapse' : 'Expand'} ${escapeHtml(member.name || 'colleague')}’s team"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg></button>` : '<span class="org-chart-branch-end" aria-hidden="true"></span>'}<button class="org-chart-person" type="button" data-org-profile="${node.index}" aria-label="View profile for ${escapeHtml(member.name || 'colleague')}">${avatar}<span><b>${escapeHtml(member.name || 'Colleague')}</b><small>${escapeHtml(member.role || 'Role not listed')}</small>${hasChildren ? `<em>${children.length} direct report${children.length === 1 ? '' : 's'}</em>` : ''}</span></button></div>${childrenMarkup}</li>`;
}

function render() {
  const query = select('#org-chart-search').value;
  const visible = visibleOrganizationNodeIds(roots, query);
  const markup = roots.map(root => nodeMarkup(root, visible, Boolean(query.trim()))).join('');
  select('#organization-chart-tree').innerHTML = markup || '<p class="org-chart-empty">No colleagues match this search.</p>';
  select('#org-chart-result-count').textContent = query.trim() ? `${visible?.size || 0} colleagues shown in the matching hierarchy` : `${members.length} colleagues in the organization chart`;
  select('#organization-chart-tree').querySelectorAll('.org-chart-avatar[src]').forEach(photo => {
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
select('#organization-chart-tree').addEventListener('click', event => {
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
