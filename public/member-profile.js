const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));

let profileCard;
let returnFocus;
let photoViewer;
let photoReturnFocus;

function safePhotoUrl(value) {
  if (!String(value || '').trim()) return '';
  try {
    const url = new URL(String(value || ''), location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function safeLinkedInUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) && /(^|\.)linkedin\.com$/i.test(url.hostname) ? url.href : '';
  } catch {
    return '';
  }
}

function detail(label, value) {
  const text = String(value || '').trim();
  return text ? `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text)}</dd></div>` : '';
}

function initialsAvatar(member) {
  const name = String(member.name || 'Colleague').trim();
  const initials = String(member.initials || name.split(/\s+/).map(part => part[0]).join('').slice(0, 2)).trim();
  const color = /^#[\da-f]{3,8}$/i.test(String(member.color || '')) ? member.color : '#dceeff';
  const avatar = document.createElement('span');
  avatar.className = 'member-profile-avatar';
  avatar.style.setProperty('--member-color', color);
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = initials;
  return avatar;
}

function profileMarkup(member) {
  const name = String(member.name || 'Colleague').trim();
  const initials = String(member.initials || name.split(/\s+/).map(part => part[0]).join('').slice(0, 2)).trim();
  const color = /^#[\da-f]{3,8}$/i.test(String(member.color || '')) ? member.color : '#dceeff';
  const photoUrl = safePhotoUrl(member.profilePhotoUrl || member.photoUrl);
  const avatar = photoUrl
    ? `<button class="member-profile-photo-button" type="button" data-member-photo-view aria-label="View photo of ${escapeHtml(name)}"><img class="member-profile-avatar member-profile-photo" src="${escapeHtml(photoUrl)}" alt="Photo of ${escapeHtml(name)}" /></button>`
    : `<span class="member-profile-avatar" style="--member-color:${color}" aria-hidden="true">${escapeHtml(initials)}</span>`;
  const facts = [
    detail('Department', member.department),
    detail('Division', member.division === 'To be confirmed' ? '' : member.division),
    member.team && ![member.department, member.division].includes(member.team) ? detail('Team', member.team) : '',
    detail('Direct manager', member.directManager),
    detail('Employment type', member.employmentType),
    detail('Organization unit', member.organizationUnit),
    detail('Employee ID', member.employeeId || 'Not assigned in Google Workspace'),
    detail('Joined', member.joined)
  ].join('');
  const email = String(member.companyEmail || '').trim();
  const phone = String(member.phone || '').trim();
  const telephone = phone.replace(/[^+\d().\-\s]/g, '');
  const linkedInUrl = safeLinkedInUrl(member.linkedinUrl);
  const contacts = [
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `<a href="mailto:${escapeHtml(email)}"><span>Email</span><b>${escapeHtml(email)}</b></a>` : '',
    telephone ? `<a href="tel:${escapeHtml(telephone)}"><span>Phone</span><b>${escapeHtml(phone)}</b></a>` : '',
    linkedInUrl ? `<a href="${escapeHtml(linkedInUrl)}" target="_blank" rel="noopener noreferrer"><span>LinkedIn</span><b>View profile ↗</b></a>` : ''
  ].filter(Boolean).join('');
  const welcomeNote = String(member.message || '').trim();

  return `<div class="member-profile-card">
    <header class="member-profile-heading">
      ${avatar}
      <div><h2 id="member-profile-title">${escapeHtml(name)}</h2>${member.role ? `<p>${escapeHtml(member.role)}</p>` : ''}</div>
      <button class="member-profile-close" type="button" data-member-profile-close aria-label="Close profile"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19" /></svg></button>
    </header>
    ${facts ? `<dl class="member-profile-facts">${facts}</dl>` : ''}
    ${welcomeNote ? `<section class="member-profile-note"><h3>Welcome note</h3><p>${escapeHtml(welcomeNote)}</p></section>` : ''}
    ${contacts ? `<nav class="member-profile-contacts" aria-label="Contact ${escapeHtml(name)}">${contacts}</nav>` : ''}
  </div>`;
}

function ensureProfileCard() {
  if (profileCard) return profileCard;
  profileCard = document.createElement('section');
  profileCard.className = 'member-profile-popover';
  profileCard.setAttribute('popover', 'auto');
  profileCard.setAttribute('role', 'dialog');
  profileCard.setAttribute('aria-labelledby', 'member-profile-title');
  document.body.append(profileCard);
  profileCard.addEventListener('click', event => {
    if (event.target.closest('[data-member-profile-close]')) profileCard.hidePopover();
  });
  profileCard.addEventListener('toggle', event => {
    if (event.newState === 'closed' && returnFocus?.isConnected) returnFocus.focus({ preventScroll:true });
  });
  return profileCard;
}

function ensurePhotoViewer() {
  if (photoViewer) return photoViewer;
  photoViewer = document.createElement('dialog');
  photoViewer.className = 'member-photo-viewer';
  photoViewer.addEventListener('click', event => {
    if (event.target === photoViewer || event.target.closest('[data-member-photo-close]')) photoViewer.close();
  });
  photoViewer.addEventListener('close', () => {
    if (photoReturnFocus?.isConnected) photoReturnFocus.focus({ preventScroll:true });
  });
  document.body.append(photoViewer);
  return photoViewer;
}

function openMemberPhoto(member, trigger) {
  const photoUrl = safePhotoUrl(member.profilePhotoUrl || member.photoUrl);
  if (!photoUrl) return;
  const hasOriginal = Boolean(safePhotoUrl(member.profilePhotoUrl));
  const viewer = ensurePhotoViewer();
  photoReturnFocus = trigger;
  viewer.innerHTML = `<div class="member-photo-viewer-content"><div class="member-photo-viewer-heading"><div><h2>${escapeHtml(member.name || 'Employee photo')}</h2><p>${hasOriginal ? 'Original profile photo' : 'Google Workspace photo · native resolution'}</p></div><button type="button" data-member-photo-close aria-label="Close photo viewer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19" /></svg></button></div><img src="${escapeHtml(photoUrl)}" alt="Profile photo of ${escapeHtml(member.name || 'employee')}" /></div>`;
  viewer.showModal();
  viewer.querySelector('img').addEventListener('error', () => viewer.close(), { once:true });
  viewer.querySelector('[data-member-photo-close]').focus({ preventScroll:true });
}

export function openMemberProfile(member, trigger) {
  if (!member || !trigger) return;
  const card = ensureProfileCard();
  if (card.matches(':popover-open')) card.hidePopover();
  returnFocus = trigger;
  card.innerHTML = profileMarkup(member);
  const photo = card.querySelector('.member-profile-photo');
  if (photo) photo.addEventListener('error', () => (photo.closest('[data-member-photo-view]') || photo).replaceWith(initialsAvatar(member)), { once:true });
  card.querySelector('[data-member-photo-view]')?.addEventListener('click', event => openMemberPhoto(member, event.currentTarget));
  const triggerBounds = trigger.getBoundingClientRect();
  const cardWidth = Math.min(480, innerWidth - 24);
  const left = Math.max(12, Math.min(triggerBounds.left, innerWidth - cardWidth - 12));
  card.style.left = `${left}px`;
  card.style.top = `${Math.max(12, triggerBounds.bottom + 10)}px`;
  card.showPopover();
  const cardHeight = card.getBoundingClientRect().height;
  const below = triggerBounds.bottom + 10;
  const above = triggerBounds.top - cardHeight - 10;
  const preferredTop = below + cardHeight <= innerHeight - 12 ? below : above >= 12 ? above : innerHeight - cardHeight - 12;
  card.style.top = `${Math.max(12, Math.min(preferredTop, innerHeight - cardHeight - 12))}px`;
  card.querySelector('[data-member-profile-close]').focus({ preventScroll:true });
}
