import { signOut } from './account-actions.js';

const $ = selector => document.querySelector(selector);
const labels = { ADMIN:'Administrator', CONTENT_EDITOR:'Content editor', AUDIT_VIEWER:'Audit viewer', EMPLOYEE:'Employee' };

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
    $('#account-avatar').textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
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
