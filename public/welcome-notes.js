import { openMemberProfile } from './member-profile.js';

const select = selector => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
let members = [];

function noteTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Intl.DateTimeFormat('en', { dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Cairo' }).format(new Date(parsed)) : '';
}

function noteCard(member, index) {
  const name = String(member.name || 'Colleague');
  const initials = String(member.initials || name.split(/\s+/).map(part => part[0]).join('').slice(0, 2));
  const photoUrl = member.profilePhotoUrl || member.photoUrl;
  const fallbackAvatar = `<span class="welcome-note-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}" aria-hidden="true">${escapeHtml(initials)}</span>`;
  const avatar = photoUrl ? `<img class="welcome-note-avatar" src="${escapeHtml(photoUrl)}" alt="" loading="lazy" />${fallbackAvatar.replace('class="welcome-note-avatar"', 'class="welcome-note-avatar" hidden')}` : fallbackAvatar;
  const timestamp = noteTimestamp(member.welcomeNoteAt);
  return `<article class="welcome-note-directory-entry"><div class="welcome-note-directory-head">${avatar}<div><h3>${escapeHtml(name)}</h3><p>${escapeHtml(member.role || 'Colleague')}</p></div>${timestamp ? `<time datetime="${escapeHtml(member.welcomeNoteAt)}">${escapeHtml(timestamp)}</time>` : ''}</div><p class="welcome-note-directory-message">${escapeHtml(String(member.message || '').trim())}</p><span class="welcome-note-directory-open" aria-hidden="true">View profile <span>→</span></span><button class="welcome-note-directory-action" type="button" data-welcome-note-profile="${index}" aria-label="View ${escapeHtml(name)}'s profile and welcome note"></button></article>`;
}

async function loadWelcomeNotes() {
  const list = select('#welcome-notes-list');
  try {
    const response = await fetch('/api/dashboard', { cache:'no-store' });
    if (!response.ok) throw new Error('Welcome Notes are unavailable');
    const data = await response.json();
    members = (data.newMembers || []).filter(member => String(member.message || '').trim()).sort((left, right) => (Date.parse(right.welcomeNoteAt) || 0) - (Date.parse(left.welcomeNoteAt) || 0) || String(left.name || '').localeCompare(String(right.name || '')));
    list.innerHTML = members.length ? members.map(noteCard).join('') : '<div class="welcome-notes-empty"><h2>No Welcome Notes yet</h2><p>New colleague welcomes will appear here.</p></div>';
    list.querySelectorAll('.welcome-note-avatar[src]').forEach(photo => photo.addEventListener('error', () => { photo.hidden = true; photo.nextElementSibling?.removeAttribute('hidden'); }, { once:true }));
  } catch (error) {
    list.innerHTML = `<div class="welcome-notes-empty" role="alert"><h2>Welcome Notes unavailable</h2><p>${escapeHtml(error.message)}. Please refresh this page or contact People Operations.</p></div>`;
  }
}

select('#welcome-notes-list').addEventListener('click', event => {
  const trigger = event.target.closest('[data-welcome-note-profile]');
  if (!trigger) return;
  const member = members[Number(trigger.dataset.welcomeNoteProfile)];
  if (member) openMemberProfile(member, trigger, members);
});

loadWelcomeNotes();
