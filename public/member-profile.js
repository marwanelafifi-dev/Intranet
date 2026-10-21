const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));

let profileCard;
let returnFocus;

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

function profileMarkup(member) {
  const name = String(member.name || 'Colleague').trim();
  const initials = String(member.initials || name.split(/\s+/).map(part => part[0]).join('').slice(0, 2)).trim();
  const color = /^#[\da-f]{3,8}$/i.test(String(member.color || '')) ? member.color : '#dceeff';
  const photoUrl = safePhotoUrl(member.photoUrl);
  const avatar = photoUrl
    ? `<img class="member-profile-avatar member-profile-photo" src="${escapeHtml(photoUrl)}" alt="" />`
    : `<span class="member-profile-avatar" style="--member-color:${color}" aria-hidden="true">${escapeHtml(initials)}</span>`;
  const facts = [
    detail('Department', member.department),
    detail('Division', member.division),
    member.team && ![member.department, member.division].includes(member.team) ? detail('Team', member.team) : '',
    detail('Direct manager', member.directManager),
    detail('Employment type', member.employmentType),
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

export function openMemberProfile(member, trigger) {
  if (!member || !trigger) return;
  const card = ensureProfileCard();
  if (card.matches(':popover-open')) card.hidePopover();
  returnFocus = trigger;
  card.innerHTML = profileMarkup(member);
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
