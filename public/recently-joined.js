const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const employmentTypes = ['Full Time', 'Part Time', 'Summer Intern', 'Graduate Intern'];
const select = id => document.querySelector(id);
let members = [];

function renderMembers() {
  const type = select('#member-type-filter').value;
  const department = select('#member-department-filter').value;
  const division = select('#member-division-filter').value;
  const filtered = members.filter(member => (!type || member.employmentType === type) && (!department || member.department === department) && (!division || member.division === division));
  const container = select('#all-new-members');
  container.innerHTML = filtered.length ? filtered.map(member => `<article class="new-member-announcement"><div class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}" aria-hidden="true">${escapeHtml(member.initials || member.name.split(' ').map(part => part[0]).join('').slice(0, 2))}</div><div><div class="new-member-announcement-head"><div><b>${escapeHtml(member.name)}</b><span>${escapeHtml(member.role)} · ${escapeHtml(member.department || member.team)}</span></div><time>${escapeHtml(member.employmentType || 'Full Time')} · ${escapeHtml(member.joined)}</time></div><p>${escapeHtml(member.message)}</p><span class="new-member-manager">Department: ${escapeHtml(member.department || 'To be confirmed')} · Division: ${escapeHtml(member.division || 'To be confirmed')} · Direct Manager: ${escapeHtml(member.directManager || 'To be confirmed')}</span></div></article>`).join('') : '<p class="empty-state">No colleagues match these filters.</p>';
  filtered.forEach((member, index) => {
    if (!member.photoUrl) return;
    const initialsAvatar = container.children[index]?.querySelector('.new-member-avatar');
    if (!initialsAvatar) return;
    const photo = document.createElement('img');
    photo.className = 'new-member-avatar new-member-photo';
    photo.src = member.photoUrl;
    photo.alt = `Photo of ${member.name}`;
    photo.onerror = () => photo.replaceWith(initialsAvatar);
    initialsAvatar.replaceWith(photo);
  });
  select('#member-result-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'colleague' : 'colleagues'}`;
}

function populateFilters() {
  const options = (values, label) => `<option value="">All ${label}</option>${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
  select('#member-type-filter').innerHTML = options(employmentTypes, 'employment types');
  select('#member-department-filter').innerHTML = options([...new Set(members.map(member => member.department || member.team).filter(Boolean))].sort(), 'departments');
  select('#member-division-filter').innerHTML = options([...new Set(members.map(member => member.division || member.team).filter(Boolean))].sort(), 'divisions');
}

async function loadRecentlyJoined() {
  try {
    const response = await fetch('/api/dashboard');
    if (!response.ok) throw new Error('Recently joined colleagues are unavailable');
    const data = await response.json();
    members = (data.newMembers || []).map(member => ({ ...member, employmentType: employmentTypes.includes(member.employmentType) ? member.employmentType : 'Full Time', department: member.department || member.team || 'To be confirmed', division: member.division || member.team || 'To be confirmed' }));
    populateFilters();
    renderMembers();
  } catch (error) {
    select('#all-new-members').innerHTML = `<p class="empty-state">${escapeHtml(error.message)}. Please try again or contact People Operations.</p>`;
  }
}

['#member-type-filter', '#member-department-filter', '#member-division-filter'].forEach(id => select(id).addEventListener('change', renderMembers));
loadRecentlyJoined();
