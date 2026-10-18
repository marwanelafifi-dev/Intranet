(() => {
  const button = document.querySelector('#google-sign-in'), status = document.querySelector('#login-status');
  const returnTo = new URLSearchParams(location.search).get('returnTo');
  if (returnTo && /^\/(?!\/)/.test(returnTo)) button.href = `/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  fetch('/api/auth/me').then(response => response.ok ? response.json() : Promise.reject()).then(() => { location.replace(returnTo && /^\/(?!\/)/.test(returnTo) ? returnTo : '/'); }).catch(() => fetch('/auth/google', { redirect:'manual' }).then(response => { if (response.status === 503) { button.setAttribute('aria-disabled','true'); status.textContent = 'Google Workspace SSO has not been configured for this environment. Ask an administrator to complete the required identity-provider setup.'; } }).catch(() => {}));
})();
