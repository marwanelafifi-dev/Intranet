(() => {
  if (/^\/(?:whistleblower(?:-2)?(?:\.html|\/|$)|login\.html$)/i.test(location.pathname) || navigator.doNotTrack === '1') return;

  const queue = [], maxQueue = 200;
  let storeKey = '', timer, sending = false, authenticated = false;
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pageName = () => document.querySelector('#page-title, main h1, [aria-current="page"]')?.textContent?.trim().slice(0, 120) || document.title.slice(0, 120);
  const controlFor = target => target.closest('button,a,[role="button"],select,input[type="checkbox"],input[type="radio"]');
  const nameFor = control => (control?.getAttribute('data-activity') || control?.getAttribute('aria-label') || control?.getAttribute('title') || control?.textContent?.trim() || control?.id || control?.getAttribute('name') || 'Unlabelled control').replace(/\s+/g, ' ').slice(0, 120);
  const componentFor = control => (control?.id || control?.getAttribute('data-view') || control?.getAttribute('data-activity') || control?.getAttribute('name') || control?.tagName?.toLowerCase() || 'page').slice(0, 80);
  const destinationFor = control => {
    if (control?.tagName !== 'A') return '';
    try { const url = new URL(control.href, location.href); return url.origin === location.origin ? url.pathname : url.origin; } catch { return ''; }
  };
  const persist = () => { if (storeKey) try { sessionStorage.setItem(storeKey, JSON.stringify(queue)); } catch (_) {} };
  const record = (action, control, metadata = {}) => {
    queue.push({ id:id(), occurredAt:new Date().toISOString(), action, component:componentFor(control), route:location.pathname, metadata:{ page:pageName(), ...(control ? { control:nameFor(control) } : {}), ...metadata } });
    if (queue.length > maxQueue) queue.splice(0, queue.length - maxQueue);
    persist();
    clearTimeout(timer);
    timer = setTimeout(flush, 900);
  };
  const flush = () => {
    if (!authenticated || !queue.length || sending) return;
    const events = queue.slice(0, 40), sentIds = new Set(events.map(event => event.id));
    sending = true;
    fetch('/api/activity', { method:'POST', headers:{ 'content-type':'application/json' }, credentials:'same-origin', keepalive:true, body:JSON.stringify({ events }) })
      .then(response => { if (!response.ok) throw new Error('Activity upload failed'); queue.splice(0, queue.length, ...queue.filter(event => !sentIds.has(event.id))); persist(); })
      .catch(() => {})
      .finally(() => { sending = false; if (queue.length) timer = setTimeout(flush, 3000); });
  };

  fetch('/api/auth/me', { credentials:'same-origin' }).then(response => response.ok ? response.json() : Promise.reject()).then(user => {
    authenticated = true;
    storeKey = `siware-activity:${user.id}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storeKey) || '[]');
      const existing = new Set(queue.map(event => event.id));
      queue.unshift(...saved.filter(event => !existing.has(event.id)).slice(-maxQueue));
    } catch (_) {}
    record('page.open', null);
  }).catch(() => { queue.length = 0; });

  document.addEventListener('click', event => {
    const control = controlFor(event.target);
    if (!control) return;
    const destination = destinationFor(control);
    record(control.tagName === 'A' ? 'link.click' : 'button.click', control, { keyboard:event.detail === 0, ...(destination ? { destination } : {}) });
  }, true);
  document.addEventListener('change', event => {
    const control = controlFor(event.target);
    if (control?.matches('select,input[type="checkbox"],input[type="radio"]')) record('control.change', control);
  }, true);
  addEventListener('siware:page-view', event => record('page.open', null, { page:String(event.detail?.title || '').slice(0, 120) }));
  addEventListener('pagehide', flush);
})();
