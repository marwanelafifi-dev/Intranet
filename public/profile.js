import { signOut } from './account-actions.js';

const $ = selector => document.querySelector(selector);
const labels = { ADMIN:'Administrator', CONTENT_EDITOR:'Content editor', AUDIT_VIEWER:'Audit viewer', EMPLOYEE:'Employee' };
let directoryMember;

function renderProfileCompletionPrompt(member) {
  const prompt = $('#profile-completion-prompt');
  const needsLinkedIn = !String(member?.linkedinUrl || '').trim();
  const hasOriginalPhoto = Boolean(String(member?.profilePhotoUrl || '').trim());
  const shouldShow = new URLSearchParams(location.search).get('complete') === 'profile' && (needsLinkedIn || !hasOriginalPhoto);
  prompt.hidden = !shouldShow;
  if (!shouldShow) return;
  const hasGooglePhoto = Boolean(String(member?.photoUrl || '').trim());
  const copy = needsLinkedIn && !hasOriginalPhoto
    ? ['Complete your profile', 'Add your LinkedIn profile and an original photo so colleagues can recognise and connect with you.']
    : needsLinkedIn
      ? ['Add your LinkedIn profile', 'Help colleagues connect with you from your Our Team card.']
      : hasGooglePhoto
        ? ['Upgrade your profile photo', 'Your Google Workspace photo is shown. Upload your original photo for a sharper Our Team profile.']
        : ['Add your profile photo', 'Upload an original photo so colleagues can recognise you on Our Team.'];
  prompt.querySelector('b').textContent = copy[0];
  prompt.querySelector('span').textContent = copy[1];
}

async function readProfilePhoto(file) {
  if (!file?.name) throw new Error('Choose a profile photo to upload.');
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP profile photo.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Profile photos must be 10 MB or smaller.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width:image.naturalWidth, height:image.naturalHeight });
      image.onerror = () => reject(new Error('The profile photo could not be read.'));
      image.src = objectUrl;
    });
    if (Math.min(dimensions.width, dimensions.height) < 600) throw new Error('Use a profile photo that is at least 600 × 600 pixels.');
  } finally { URL.revokeObjectURL(objectUrl); }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The profile photo could not be read.'));
    reader.readAsDataURL(file);
  });
}

function addDirectoryFact(root, label, value) {
  const text = String(value || '').trim();
  if (!text || text === 'To be confirmed') return;
  const item = document.createElement('div'), term = document.createElement('dt'), detail = document.createElement('dd');
  term.textContent = label;
  detail.textContent = text;
  item.append(term, detail);
  root.append(item);
}

function renderDirectoryDetails(member) {
  if (!member) return;
  const section = $('#profile-directory'), facts = $('#profile-directory-facts'), contacts = $('#profile-directory-contacts');
  directoryMember = member;
  facts.replaceChildren();
  [
    ['Job title', member.role],
    ['Department', member.department || member.team],
    ['Division', member.division],
    ['Team', member.team && member.team !== member.department ? member.team : ''],
    ['Direct manager', member.directManager],
    ['Employment type', member.employmentType],
    ['Organization unit', member.organizationUnit],
    ['Employee ID', member.employeeId],
    ['Joined', member.joined]
  ].forEach(([label, value]) => addDirectoryFact(facts, label, value));
  contacts.replaceChildren();
  const phone = String(member.phone || '').trim();
  if (phone) {
    const phoneLink = document.createElement('a');
    phoneLink.href = `tel:${phone.replace(/[^+\d().\-\s]/g, '')}`;
    phoneLink.textContent = `Phone: ${phone}`;
    contacts.append(phoneLink);
  }
  try {
    const linkedIn = new URL(String(member.linkedinUrl || ''));
    if (linkedIn.protocol === 'https:' && /(^|\.)linkedin\.com$/i.test(linkedIn.hostname)) {
      const linkedInLink = document.createElement('a');
      linkedInLink.href = linkedIn.href;
      linkedInLink.target = '_blank';
      linkedInLink.rel = 'noopener noreferrer';
      linkedInLink.textContent = 'LinkedIn profile';
      contacts.append(linkedInLink);
    }
  } catch { /* The directory field is optional. */ }
  contacts.hidden = !contacts.childElementCount;
  section.hidden = !facts.childElementCount;
  const linkedInForm = $('#profile-linkedin-form');
  linkedInForm.hidden = section.hidden;
  linkedInForm.elements.linkedinUrl.value = member.linkedinUrl || '';
  $('#profile-photo-form').hidden = section.hidden;
  $('#profile-photo-help').textContent = member.profilePhotoUrl
    ? 'Your original profile photo is in use. You can upload a replacement at any time.'
    : member.photoUrl
      ? 'Your Google Workspace photo is currently shown. Upload an original JPEG, PNG, or WebP photo (at least 600 × 600 pixels) for a sharper full-profile view.'
      : 'Use an original JPEG, PNG, or WebP photo that is at least 600 × 600 pixels. It will appear on your Our Team card and open in full quality.';
  if (member.profilePhotoUrl) {
    const avatar = $('#account-avatar');
    avatar.classList.add('has-photo');
    avatar.style.backgroundImage = `url(${JSON.stringify(member.profilePhotoUrl)})`;
  }
  renderProfileCompletionPrompt(member);
  $('#profile-linkedin-status').textContent = '';
}

$('#profile-linkedin-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!directoryMember) return;
  const form = event.currentTarget, input = form.elements.linkedinUrl, button = form.querySelector('button'), status = $('#profile-linkedin-status');
  button.disabled = true;
  status.textContent = 'Saving LinkedIn profile…';
  try {
    const response = await fetch('/api/profile/linkedin', { method:'PATCH', credentials:'same-origin', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ linkedinUrl:input.value }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'LinkedIn profile could not be saved.');
    directoryMember.linkedinUrl = payload.linkedinUrl;
    renderDirectoryDetails(directoryMember);
    status.textContent = 'LinkedIn profile saved.';
  } catch (error) {
    status.textContent = error.message || 'LinkedIn profile could not be saved.';
  } finally {
    button.disabled = false;
  }
});

$('#profile-photo-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!directoryMember) return;
  const form = event.currentTarget, input = form.elements.photo, button = form.querySelector('button'), status = $('#profile-photo-status');
  button.disabled = true;
  status.textContent = 'Uploading profile photo…';
  try {
    const dataUrl = await readProfilePhoto(input.files?.[0]);
    const response = await fetch('/api/profile/photo', { method:'PATCH', credentials:'same-origin', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ dataUrl, filename:input.files[0].name }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Profile photo could not be uploaded.');
    directoryMember.profilePhotoUrl = payload.profilePhotoUrl;
    renderDirectoryDetails(directoryMember);
    const avatar = $('#account-avatar');
    avatar.classList.add('has-photo');
    avatar.style.backgroundImage = `url(${JSON.stringify(payload.profilePhotoUrl)})`;
    input.value = '';
    status.textContent = 'Profile photo updated.';
  } catch (error) {
    status.textContent = error.message || 'Profile photo could not be uploaded.';
  } finally {
    button.disabled = false;
  }
});

async function loadProfile() {
  const card = $('#account-card'), feedback = $('#account-feedback'), message = $('#account-message'), retry = $('#account-retry');
  card.setAttribute('aria-busy', 'true');
  feedback.hidden = false;
  retry.hidden = true;
  message.textContent = 'Loading your account…';
  try {
    const response = await fetch('/api/auth/me', { credentials:'same-origin', cache:'no-store' });
    if (response.status === 401) { location.replace('/login.html?returnTo=/profile.html'); return; }
    if (!response.ok) throw new Error('Account details are unavailable. Check your connection and try again.');
    const user = await response.json();
    const name = String(user.name || user.email || 'Si-Ware colleague');
    const access = labels[user.role] || 'Employee';
    const avatar = $('#account-avatar');
    avatar.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    avatar.classList.toggle('has-photo', Boolean(user.avatarUrl));
    avatar.style.backgroundImage = user.avatarUrl ? `url(${JSON.stringify(user.avatarUrl)})` : '';
    $('#account-name').textContent = name;
    $('#account-role').textContent = access;
    $('#account-email').textContent = user.email || 'Not available';
    $('#account-access').textContent = access;
    $('#account-method').textContent = user.demo ? 'Local demo' : user.local ? 'Local administrator' : 'Google Workspace';
    $('#account-note').textContent = user.demo
      ? 'This is a local demo account. Sign-out is available when an authentication method is configured.'
      : 'Your name and email are managed by your sign-in account. Contact your intranet administrator if they need to be corrected.';
    $('#account-sign-out').hidden = Boolean(user.demo);
    $('#account-details').hidden = false;
    feedback.hidden = true;
    fetch('/api/dashboard', { credentials:'same-origin', cache:'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        const email = String(user.email || '').trim().toLowerCase();
        const member = data?.newMembers?.find(item => String(item.companyEmail || '').trim().toLowerCase() === email);
        if (member && directoryMember?.linkedinUrl) member.linkedinUrl = directoryMember.linkedinUrl;
        renderDirectoryDetails(member);
      })
      .catch(() => {});
  } catch (error) {
    message.textContent = error.message || 'Account details are unavailable. Try again.';
    retry.hidden = false;
  } finally {
    card.setAttribute('aria-busy', 'false');
  }
}

$('#account-retry').addEventListener('click', loadProfile);
$('#account-sign-out').addEventListener('click', () => signOut($('#account-sign-out'), $('#account-sign-out-status')));
loadProfile();
