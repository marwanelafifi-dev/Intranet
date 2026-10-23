(() => {
  const content = document.querySelector('#login-content');
  const googleButton = document.querySelector('#google-sign-in');
  const localForm = document.querySelector('#local-sign-in');
  const localToggle = document.querySelector('#local-toggle');
  const divider = document.querySelector('#sign-in-divider');
  const status = document.querySelector('#login-status');
  const retry = document.querySelector('#login-retry');
  const privacy = document.querySelector('#login-privacy');
  const params = new URLSearchParams(location.search);
  const requested = params.get('returnTo');
  const returnTo = requested && /^\/(?!\/)/.test(requested) && !/[\\\r\n]/.test(requested) ? requested : '/';
  const oauthErrors = {
    cancelled: 'Google sign-in was cancelled. Try again when you are ready.',
    rejected: 'Google could not complete sign-in. Please try again.',
    account: 'Use an approved Si-Ware Google Workspace account.',
    unavailable: 'Google sign-in is temporarily unavailable. Please try again.'
  };
  const setStatus = (message = '', state = '') => {
    status.textContent = message;
    status.dataset.state = state;
    status.hidden = !message;
  };

  async function loadMethods() {
    content.setAttribute('aria-busy', 'true');
    retry.hidden = true;
    setStatus('Checking sign-in options…');
    try {
      const current = await fetch('/api/auth/me', { cache: 'no-store' });
      if (current.ok) { location.replace(returnTo); return; }
      const response = await fetch('/api/auth/options', { cache: 'no-store' });
      if (!response.ok) throw new Error('Sign-in options are unavailable. Check your connection and try again.');
      const options = await response.json();
      googleButton.href = `/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
      googleButton.dataset.configured = String(Boolean(options.google));
      googleButton.setAttribute('aria-disabled', String(!options.google));
      divider.hidden = !options.local;
      localToggle.hidden = !options.local;
      localForm.hidden = true;
      localToggle.setAttribute('aria-expanded', 'false');
      localToggle.textContent = 'Sign in with a local account';
      privacy.textContent = options.local && !options.google
        ? 'Use the local account provided by your intranet administrator.'
        : 'Access is limited to approved Si-Ware accounts.';
      const error = oauthErrors[params.get('error')];
      if (error) setStatus(error, 'error');
      else if (!options.google && !options.local) setStatus('Sign-in is not configured. Contact your intranet administrator.', 'error');
      else setStatus();
    } catch (error) {
      setStatus(error.message || 'Sign-in options are unavailable. Try again.', 'error');
      retry.hidden = false;
    } finally {
      content.setAttribute('aria-busy', 'false');
    }
  }

  localToggle.addEventListener('click', () => {
    localForm.hidden = !localForm.hidden;
    const open = !localForm.hidden;
    localToggle.setAttribute('aria-expanded', String(open));
    localToggle.textContent = open ? 'Hide local sign-in' : 'Sign in with a local account';
    if (open) localForm.elements.email.focus();
  });
  googleButton.addEventListener('click', event => {
    if (googleButton.dataset.configured !== 'true') {
      event.preventDefault();
      setStatus('Google Workspace sign-in is not configured yet. Add the Google client credentials, then restart the intranet.', 'error');
    }
  });
  retry.addEventListener('click', loadMethods);
  localForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!localForm.reportValidity()) return;
    const button = localForm.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(localForm));
    button.disabled = true;
    setStatus('Signing in…');
    try {
      const response = await fetch('/auth/local', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...values, returnTo })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Sign-in could not be completed. Try again.');
      location.assign(payload.returnTo || returnTo);
    } catch (error) {
      localForm.elements.password.value = '';
      setStatus(error.message || 'Sign-in could not be completed. Try again.', 'error');
      button.disabled = false;
      localForm.elements.password.focus();
    }
  });
  loadMethods();
})();
