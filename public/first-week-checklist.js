(() => {
  const storageKey = 'siware-first-week-checklist-v1';
  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
  const list = document.querySelector('#first-week-checklist');
  if (!list) return;
  const label = document.querySelector('#checklist-progress-label');
  const description = document.querySelector('#checklist-progress-description');
  const heroProgress = document.querySelector('#onboarding-hero-progress');
  const bar = document.querySelector('#checklist-progress-bar');
  const attachmentViewer = document.querySelector('#attachment-viewer');
  const attachmentTitle = document.querySelector('#attachment-viewer-title');
  const attachmentContent = document.querySelector('#attachment-viewer-content');
  const attachmentClose = document.querySelector('#attachment-viewer-close');
  const attachmentOpen = document.querySelector('#attachment-viewer-open');
  const attachmentDownload = document.querySelector('#attachment-viewer-download');
  let completed = new Set();
  let currentItems = [];
  try { completed = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch {}
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify([...completed])); } catch {} };
  const updateProgress = total => { const count = completed.size, complete = count === total && total; label.textContent = complete ? 'First week complete' : `${count} of ${total} complete`; if (description) description.textContent = complete ? 'Excellent work. Your first-week essentials are complete.' : count ? `${total - count} action${total - count === 1 ? '' : 's'} left. Keep your momentum going.` : 'Choose one task to begin. Each confirmed task is recorded once.'; if (heroProgress) heroProgress.textContent = complete ? 'First-week essentials complete' : count ? `${count} of ${total} actions complete` : `${total} essential actions ahead`; bar.style.width = `${total ? (count / total) * 100 : 0}%`; };
  const render = items => {
    currentItems = items;
    const validIds = new Set(items.map(item => item.id));
    completed = new Set([...completed].filter(id => validIds.has(id)));
    const nextItemId = items.find(item => !completed.has(item.id))?.id;
    list.innerHTML = items.map(item => {
      const link = String(item.resourceUrl || ''), attachment = String(item.attachmentUrl || (link.startsWith('/uploads/') ? link : ''));
      const makeLink = (url, itemLabel, isAttachment = false) => { const attributes = isAttachment ? 'data-attachment-preview' : /^https?:\/\//i.test(url) ? 'target="_blank" rel="noreferrer"' : ''; return /^(https?:\/\/|\/|#)/i.test(url) ? `<a class="checklist-resource" href="${escapeHtml(url)}" ${attributes}>${escapeHtml(itemLabel)}</a>` : ''; };
      const resources = `${!link.startsWith('/uploads/') ? makeLink(link, item.resourceLabel || 'Open resource') : ''}${makeLink(attachment, item.attachmentLabel || 'Open attachment', true)}`;
      const resourceMarkup = resources ? `<div class="checklist-resources">${resources}</div>` : '';
      const isNext = item.id === nextItemId;
      return `<li><div class="checklist-entry${isNext ? ' is-next-step' : ''}"><label class="checklist-item"><input type="checkbox" data-checklist-item="${escapeHtml(item.id)}" ${completed.has(item.id) ? 'checked disabled' : ''} /><span>${escapeHtml(item.text)}</span></label>${isNext ? '<span class="checklist-next-badge">Next up</span>' : ''}${resourceMarkup}</div></li>`;
    }).join('');
    list.querySelectorAll('.checklist-item').forEach(label => label.classList.toggle('is-complete', label.querySelector('input').checked));
    updateProgress(items.length);
    save();
  };
  list.addEventListener('change', event => { const input = event.target.closest('[data-checklist-item]'); if (!input || !input.checked) return; completed.add(input.dataset.checklistItem); save(); render(currentItems); });
  list.addEventListener('click', event => {
    const link = event.target.closest('[data-attachment-preview]');
    if (!link || !attachmentViewer || !attachmentContent) return;
    event.preventDefault();
    const url = link.href, isImage = /\.(png|jpe?g|webp|gif)(?:$|[?#])/i.test(url), isVideo = /\.(mp4|webm|mov)(?:$|[?#])/i.test(url), isPdf = /\.pdf(?:$|[?#])/i.test(url);
    attachmentTitle.textContent = link.textContent.trim() || 'Attachment preview';
    attachmentOpen.href = url;
    attachmentDownload.href = `${url}${url.includes('?') ? '&' : '?'}download=1`;
    const showFallback = () => { attachmentContent.innerHTML = `<div class="attachment-fallback"><b>Preview unavailable</b><p>Use Open file or Download to view this attachment.</p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open file</a></div>`; };
    if (isImage) attachmentContent.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(attachmentTitle.textContent)}" />`;
    else if (isVideo) attachmentContent.innerHTML = `<video controls autoplay preload="metadata"><source src="${escapeHtml(url)}">Your browser does not support video playback.</video>`;
    else if (isPdf) {
      const previewUrl = new URL('/api/documents/page', window.location.origin);
      previewUrl.searchParams.set('url', new URL(url).pathname);
      previewUrl.searchParams.set('page', '1');
      attachmentContent.innerHTML = `<img class="attachment-pdf-page" src="${escapeHtml(previewUrl.href)}" alt="First page of ${escapeHtml(attachmentTitle.textContent)}" />`;
      attachmentContent.querySelector('img')?.addEventListener('error', showFallback, { once:true });
    } else showFallback();
    attachmentViewer.showModal();
    attachmentClose?.focus();
  });
  attachmentClose?.addEventListener('click', () => attachmentViewer?.close());
  attachmentViewer?.addEventListener('click', event => { if (event.target === attachmentViewer) attachmentViewer.close(); });
  attachmentViewer?.addEventListener('cancel', event => { event.preventDefault(); attachmentViewer.close(); });
  attachmentViewer?.addEventListener('close', () => { attachmentContent.querySelector('video')?.pause(); attachmentContent.innerHTML = ''; });
  const navLinks = [...document.querySelectorAll('[data-onboarding-nav]')];
  const updateActiveNav = id => navLinks.forEach(link => { if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
  const navigationSections = [...document.querySelectorAll('.policy-card[id]')];
  const syncActiveNavigation = () => {
    const readingLine = window.innerHeight * 0.28;
    const current = navigationSections.reduce((active, section) => section.getBoundingClientRect().top <= readingLine ? section : active, navigationSections[0]);
    if (current) updateActiveNav(current.id);
  };
  window.addEventListener('scroll', syncActiveNavigation, { passive:true });
  window.addEventListener('resize', syncActiveNavigation);
  syncActiveNavigation();
  fetch('/api/dashboard').then(response => response.ok ? response.json() : Promise.reject()).then(data => render(Array.isArray(data.firstWeekChecklist) ? data.firstWeekChecklist : [])).catch(() => render([]));
})();
