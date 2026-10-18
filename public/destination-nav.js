const destinations = [
  ['/', 'Home'], ['/apps.html', 'Main Apps'], ['/announcements.html', 'Announcements'], ['/news.html', 'Company news'], ['/social-media.html', 'Social Media'], ['/moments.html', 'Moments'], ['/knowledge-hub.html', 'Knowledge Hub'], ['/events.html', 'Events & key dates'], ['/whistleblower.html', 'Whistleblower'], ['/recently-joined.html', 'Recently Joined'], ['/new-hires.html', 'New Si-Warians'],
];

const currentPath = location.pathname === '/index.html' ? '/' : location.pathname;
const routeSurface = document.querySelector('#main, #destination-root, .company-news-page, .policy-content');
if (routeSurface) routeSurface.setAttribute('data-route-content', '');
document.documentElement.dataset.routeMotion = 'ready';

const footerStyles = document.createElement('link');
footerStyles.rel = 'stylesheet';
footerStyles.href = '/shared-footer.css';
document.head.append(footerStyles);

let standardStylesReady = Promise.resolve();
let searchStylesReady = Promise.resolve();
if (currentPath !== '/') {
  const standardStyles = document.createElement('link');
  standardStyles.rel = 'stylesheet';
  standardStyles.href = '/dedicated-standard.css';
  standardStylesReady = new Promise(resolve => {
    standardStyles.addEventListener('load', resolve, { once:true });
    standardStyles.addEventListener('error', resolve, { once:true });
  });
  document.head.append(standardStyles);

  const searchStyles = document.createElement('link');
  searchStyles.rel = 'stylesheet';
  searchStyles.href = '/header-search.css?v=20261017-white-brand';
  searchStylesReady = new Promise(resolve => {
    searchStyles.addEventListener('load', resolve, { once:true });
    searchStyles.addEventListener('error', resolve, { once:true });
  });
  document.head.append(searchStyles);
}
const header = document.querySelector('.topbar, .news-page-topbar, .policy-topbar, .destination-page-header');
const existingNav = header?.querySelector('.nav, .news-page-nav');
const nav = existingNav || document.createElement('nav');

nav.classList.add('destination-nav-inline');
nav.setAttribute('aria-label', 'Intranet destinations');
nav.innerHTML = destinations.map(([href, label]) => `<a href="${href}"${href === currentPath ? ' aria-current="page"' : ''}>${label}</a>`).join('');

if (!existingNav && header) {
  const headerAction = header.querySelector('.policy-topbar-actions, .theme-toggle');
  header.insertBefore(nav, headerAction || null);
}

if (currentPath !== '/' && header) {
  const headerActions = header.querySelector('.policy-topbar-actions');
  const brand = header.querySelector(':scope > a:first-child');
  if (brand) {
    brand.classList.add('shared-brand');
    if (!brand.querySelector('span')) brand.insertAdjacentHTML('beforeend', '<span>Intranet</span>');
  }
  headerActions?.querySelector('.back-link')?.remove();
  header.querySelectorAll('.shared-header-search, .global-search').forEach(control => control.remove());

  const themeToggle = header.querySelector('[data-theme-toggle]');
  const tools = document.createElement('div');
  tools.className = 'standard-header-tools';
  tools.insertAdjacentHTML('beforeend', `
    <button class="header-search-toggle" data-intranet-search-trigger type="button" aria-expanded="false" aria-controls="intranet-search-results" aria-label="Search intranet">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg>
    </button>
  `);
  if (themeToggle) tools.append(themeToggle);
  tools.insertAdjacentHTML('beforeend', `
    <a class="header-cms-link" href="/admin.html" data-admin-panel hidden>Admin Panel</a>
    <button class="header-profile" type="button" aria-label="Marwan Elafifi, Full Access" aria-expanded="false" aria-controls="shared-profile-menu"><span class="avatar avatar-user has-photo" style="background-image:url('/uploads/b35626c7-5c7a-4ebf-b281-a4bb81c6754f-jpg-1792073896315.jpg')">ME</span><span class="profile-copy"><b>Marwan Elafifi</b><small>Full Access</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"></path></svg></button>
    <div class="shared-profile-menu" id="shared-profile-menu" hidden><b>Demo access</b><a href="/">Employee view</a><hr><a href="/">My profile</a><button type="button" data-close-profile>Sign out</button></div>
  `);
  headerActions?.remove();
  header.append(tools);

  const profileButton = tools.querySelector('.header-profile');
  const profileMenu = tools.querySelector('.shared-profile-menu');
  const adminPanelLink = tools.querySelector('[data-admin-panel]');
  fetch('/api/dashboard').then(response => response.ok ? response.json() : null).then(data => {
    const user = data?.user;
    if (!user) return;
    const accessLabel = user.title || (user.role === 'ADMIN' ? 'Full Access' : 'Employee Access');
    const avatar = profileButton.querySelector('.avatar-user');
    avatar.textContent = user.name.split(' ').map(part => part[0]).join('').slice(0, 2);
    avatar.classList.toggle('has-photo', Boolean(user.avatarUrl));
    avatar.style.backgroundImage = user.avatarUrl ? `url(${JSON.stringify(user.avatarUrl)})` : '';
    profileButton.querySelector('.profile-copy b').textContent = user.name;
    profileButton.querySelector('.profile-copy small').textContent = accessLabel;
    profileButton.setAttribute('aria-label', `${user.name}, ${accessLabel}`);
  }).catch(() => {});
  fetch('/api/auth/me').then(response => response.ok ? response.json() : null).then(identity => {
    const permissions = identity?.permissions;
    const canOpenAdminPanel = identity?.role !== 'EMPLOYEE' && Array.isArray(permissions) && permissions.some(permission => ['content.edit', 'audit.view'].includes(permission));
    adminPanelLink.hidden = !canOpenAdminPanel;
  }).catch(() => { adminPanelLink.hidden = true; });
  const closeProfileMenu = () => {
    profileMenu.hidden = true;
    profileButton.setAttribute('aria-expanded', 'false');
  };
  profileButton.addEventListener('click', () => {
    const isOpen = !profileMenu.hidden;
    profileMenu.hidden = isOpen;
    profileButton.setAttribute('aria-expanded', String(!isOpen));
  });
  profileMenu.addEventListener('click', event => {
    if (event.target.matches('[data-close-profile]')) closeProfileMenu();
  });
  document.addEventListener('click', event => {
    if (!tools.contains(event.target)) closeProfileMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeProfileMenu();
  });
}

if (header) {
  const searchRow = document.createElement('div');
  searchRow.className = 'intranet-search-row';
  searchRow.innerHTML = `<form class="intranet-search" role="search" aria-label="Search intranet">
    <div class="intranet-search-field">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 5 5"></path></svg>
      <input type="search" aria-label="Search intranet" placeholder="Search intranet..." autocomplete="off" spellcheck="false" minlength="2" />
    </div>
    <div class="intranet-search-results" id="intranet-search-results" role="region" aria-label="Search results" hidden></div>
    <span class="sr-only" role="status" aria-live="polite"></span>
  </form>`;
  header.insertAdjacentElement('afterend', searchRow);

  const form = searchRow.querySelector('form');
  const input = form.querySelector('input');
  const results = form.querySelector('.intranet-search-results');
  const status = form.querySelector('[role="status"]');
  const searchTrigger = header.querySelector('[data-intranet-search-trigger]');
  let searchTimer;
  let searchController;
  let loadedQuery = '';

  const setOpen = open => {
    results.hidden = !open;
  };
  const closeResults = () => {
    clearTimeout(searchTimer);
    searchController?.abort();
    setOpen(false);
  };
  const positionSearchPanel = () => {
    if (!searchTrigger) return;
    const triggerBounds = searchTrigger.getBoundingClientRect();
    searchRow.style.setProperty('--intranet-search-top', `${Math.max(8, Math.round(triggerBounds.top))}px`);
    searchRow.style.setProperty('--intranet-search-right', `${Math.max(8, Math.round(window.innerWidth - triggerBounds.left + 8))}px`);
  };
  const setSearchPanel = open => {
    if (open) positionSearchPanel();
    document.body.classList.toggle('intranet-search-open', open);
    searchTrigger?.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(() => input.focus());
  };
  searchTrigger?.addEventListener('click', () => {
    const open = !document.body.classList.contains('intranet-search-open');
    if (!open) closeResults();
    setSearchPanel(open);
  });
  window.addEventListener('resize', () => {
    if (document.body.classList.contains('intranet-search-open')) positionSearchPanel();
  });
  const showMessage = message => {
    const paragraph = document.createElement('p');
    paragraph.className = 'intranet-search-empty';
    paragraph.textContent = message;
    results.replaceChildren(paragraph);
    status.textContent = message;
    setOpen(true);
  };
  const safeHref = href => {
    if (!href || !String(href).trim()) return null;
    try {
      const url = new URL(String(href || ''), location.href);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };
  const runSearch = async query => {
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal:controller.signal });
      if (!response.ok) throw new Error('Search unavailable');
      const matches = await response.json();
      if (controller.signal.aborted || input.value.trim() !== query) return;
      const links = matches.map(item => {
        const href = safeHref(item.href);
        if (!href) return null;
        const link = document.createElement('a');
        link.className = 'intranet-search-result';
        link.href = href;
        const title = document.createElement('strong');
        title.textContent = item.title || 'Untitled result';
        const type = document.createElement('em');
        type.textContent = item.type || 'Result';
        link.append(title, type);
        if (item.detail) {
          const detail = document.createElement('small');
          detail.textContent = item.detail;
          link.append(detail);
        }
        return link;
      }).filter(Boolean);
      loadedQuery = query;
      if (!links.length) { showMessage('No results found. Try another search.'); return; }
      results.replaceChildren(...links);
      status.textContent = `${links.length} result${links.length === 1 ? '' : 's'} found.`;
      setOpen(true);
    } catch (error) {
      if (!controller.signal.aborted) showMessage('Search is unavailable. Please try again.');
    }
  };

  input.addEventListener('input', () => {
    closeResults();
    loadedQuery = '';
    const query = input.value.trim();
    if (query.length < 2) { setOpen(false); status.textContent = ''; return; }
    searchTimer = setTimeout(() => runSearch(query), 180);
  });
  input.addEventListener('focus', () => {
    if (loadedQuery === input.value.trim() && results.querySelector('a')) setOpen(true);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeResults(); setSearchPanel(false); searchTrigger?.focus(); }
    if (event.key === 'ArrowDown') {
      const first = results.querySelector('a');
      if (first && !results.hidden) { event.preventDefault(); first.focus(); }
    }
  });
  results.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeResults(); input.focus(); }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const query = input.value.trim();
    if (query.length < 2) return;
    clearTimeout(searchTimer);
    if (loadedQuery !== query) await runSearch(query);
    const first = results.querySelector('a');
    if (first && loadedQuery === query) location.assign(first.href);
  });
  document.addEventListener('pointerdown', event => {
    if (!searchRow.contains(event.target)) closeResults();
  });
  if (currentPath !== '/') searchStylesReady.then(() => { searchRow.style.visibility = ''; });
}

if (currentPath !== '/') Promise.all([standardStylesReady, searchStylesReady]).then(() => document.body.classList.add('shared-header-ready'));

const footerSocial = `<nav class="intranet-footer-social" aria-label="Si-Ware social channels"><a href="https://www.linkedin.com/company/si-ware-systems/?locale=en_US" target="_blank" rel="noreferrer" aria-label="Si-Ware on LinkedIn" title="LinkedIn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 3.5A2.2 2.2 0 1 1 5.2 8a2.2 2.2 0 0 1 0-4.5ZM3.3 9.8h3.8V21H3.3V9.8Zm6.2 0h3.6v1.5h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6.1V21h-3.8v-5c0-1.2 0-2.9-1.8-2.9s-2.1 1.4-2.1 2.8V21H9.5V9.8Z"/></svg></a><a href="https://www.facebook.com/SiWareSystems/" target="_blank" rel="noreferrer" aria-label="Si-Ware on Facebook" title="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.8 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5H17V3.9c-.4-.1-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1V10H8v3h2.6v8h3.2Z"/></svg></a><a href="https://www.youtube.com/@Si-Ware_Systems" target="_blank" rel="noreferrer" aria-label="Si-Ware on YouTube" title="YouTube"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.6 7.1a3 3 0 0 0-2.1-2.1C17.7 4.5 12 4.5 12 4.5S6.3 4.5 4.5 5a3 3 0 0 0-2.1 2.1C2 8.9 2 12 2 12s0 3.1.4 4.9a3 3 0 0 0 2.1 2.1c1.8.5 7.5.5 7.5.5s5.7 0 7.5-.5a3 3 0 0 0 2.1-2.1c.4-1.8.4-4.9.4-4.9s0-3.1-.4-4.9ZM10.2 15.1V8.9l5.4 3.1-5.4 3.1Z"/></svg></a><a href="https://www.si-ware.com" target="_blank" rel="noreferrer" aria-label="Si-Ware website" title="Si-Ware website"><img class="intranet-footer-mark" src="/Icon.png" alt="" /></a></nav>`;
const footerSupport = `<span class="intranet-footer-support">For technical support, contact <a href="mailto:ithelpdesk@si-ware.com">ithelpdesk@si-ware.com</a></span>`;
const existingFooter = document.querySelector('.policy-footer');
if (existingFooter) {
  const existingDetails = existingFooter.innerHTML;
  existingFooter.classList.add('intranet-footer');
  existingFooter.innerHTML = `<span class="intranet-footer-details">${existingDetails}</span>${footerSupport}${footerSocial}`;
} else {
  const footerHost = document.querySelector('.destination-shell, .news-page-shell, .shell');
  if (footerHost && !footerHost.querySelector('.intranet-footer')) footerHost.insertAdjacentHTML('beforeend', `<footer class="intranet-footer"><span class="intranet-footer-brand"><img src="/Icon.png" alt="" /><small>© 2026 Si-Ware Systems · Internal use only</small></span>${footerSupport}${footerSocial}</footer>`);
}
