const destinations = [
  ['/', 'Home'], ['/apps.html', 'Main Apps'], ['/announcements.html', 'Announcements'], ['/recently-joined.html', 'Recently Joined'], ['/news.html', 'Company news'], ['/social-media.html', 'Social Media'], ['/moments.html', 'Moments'], ['/knowledge-hub.html', 'Knowledge Hub'], ['/events.html', 'Events & key dates'], ['/whistleblower.html', 'Whistleblower'], ['/new-hires.html', 'New Si-Warians'],
];
const currentPath = location.pathname === '/index.html' ? '/' : location.pathname;
const nav = document.createElement('nav');
nav.className = 'destination-nav';
nav.setAttribute('aria-label', 'Intranet destinations');
nav.innerHTML = `<div>${destinations.map(([href, label]) => `<a href="${href}"${href === currentPath ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</div>`;
const header = document.querySelector('.topbar, .news-page-topbar, .policy-topbar, .destination-page-header');
header?.insertAdjacentElement('afterend', nav);
