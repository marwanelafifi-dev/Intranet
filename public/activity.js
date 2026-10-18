(() => {
  if (location.pathname === '/whistleblower.html' || navigator.doNotTrack === '1') return;
  const queue = [], maxQueue = 40;
  let storeKey = 'siware-activity:anonymous', timer;
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const nameFor = target => target.closest('[data-activity],button,a,input,select,textarea')?.getAttribute('data-activity') || target.closest('button,a')?.id || target.closest('button,a')?.getAttribute('aria-label') || target.closest('button,a')?.textContent?.trim().slice(0, 70) || '';
  const componentFor = target => target.closest('[data-component]')?.getAttribute('data-component') || target.closest('[id]')?.id || target.tagName.toLowerCase();
  const record = (action, target, metadata = {}) => {
    const event = { id:id(), occurredAt:new Date().toISOString(), action, component:componentFor(target), route:location.pathname, metadata:{ control:nameFor(target), ...metadata } };
    queue.push(event); if (queue.length > maxQueue) queue.shift();
    try { sessionStorage.setItem(storeKey, JSON.stringify(queue)); } catch (_) {}
    clearTimeout(timer); timer = setTimeout(flush, 1800);
  };
  const flush = () => {
    if (!queue.length) return;
    const events = queue.splice(0, queue.length);
    try { sessionStorage.setItem(storeKey, JSON.stringify(queue)); } catch (_) {}
    fetch('/api/activity', { method:'POST', headers:{ 'content-type':'application/json' }, credentials:'same-origin', keepalive:true, body:JSON.stringify({ events }) }).catch(() => { queue.unshift(...events.slice(-maxQueue)); });
  };
  fetch('/api/auth/me', { credentials:'same-origin' }).then(response => response.ok ? response.json() : Promise.reject()).then(user => {
    storeKey = `siware-activity:${user.id}`;
    try { queue.push(...JSON.parse(sessionStorage.getItem(storeKey) || '[]').slice(-maxQueue)); } catch (_) {}
    record('page.navigation', document.body, { title:document.title.slice(0, 120) });
  }).catch(() => {});
  document.addEventListener('click', event => { if (!event.target.closest('a,button,[role="button"]')) return; record('interface.activate', event.target, { keyboard:false }); }, true);
  document.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('a,button,[role="button"]')) record('interface.activate', event.target, { keyboard:true }); }, true);
  document.addEventListener('change', event => { if (event.target.matches('select,input[type="checkbox"],input[type="radio"]')) record('interface.change', event.target); }, true);
  addEventListener('pagehide', flush);
})();
