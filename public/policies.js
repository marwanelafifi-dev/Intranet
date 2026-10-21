const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const displayTimestamp = value => new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' }).format(new Date(value));
const isPdf = url => /^\/uploads\/.*\.pdf(?:$|[?#])/i.test(url || '');
const isPolicyLink = url => /^(https?:\/\/|\/)/i.test(String(url || '').trim());
function youtubeVideoId(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    const fromPath = url.pathname.split('/').filter(Boolean).pop() || '';
    const id = host === 'youtu.be' ? fromPath : url.searchParams.get('v') || (/^\/(?:embed|shorts)\//.test(url.pathname) ? fromPath : '');
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
  } catch { return ''; }
}
function renderNewSiTrainingVideos(content = {}) {
  document.querySelectorAll('[data-newsi-video]').forEach(frame => {
    const id = youtubeVideoId(content[frame.dataset.newsiVideo]);
    if (id) frame.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
  });
  document.querySelectorAll('[data-newsi-video-open]').forEach(link => {
    const id = youtubeVideoId(content[link.dataset.newsiVideoOpen]);
    if (id) link.href = `https://www.youtube.com/watch?v=${id}`;
  });
}
let policySearchMatches = [], policySearchIndex = -1, policyViewerPage = 1, policyViewerPageCount = 1, policyViewerUrl = '', policyPageObserver, policyAcknowledgement;
function companyPortalIcon(name) {
  const paths = {
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M2 21h20M8 7h2M12 7h2M8 11h2M12 11h2M8 15h2M12 15h2M17 9h3v12M17 13h3"/>',
    support: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M4 13h3v5H5a1 1 0 0 1-1-1v-4ZM20 13h-3v5h2a1 1 0 0 0 1-1v-4ZM17 20c-1 1-2.7 1.5-5 1.5"/>',
    payroll: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4M15 15h2"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.building}</svg>`;
}
function renderCompanyPortals(portals = []) {
  const container = document.querySelector('#company-portals');
  if (!container) return;
  container.innerHTML = portals.length ? portals.map(portal => {
    const rawUrl = String(portal.url || '').trim();
    const url = /^(https?:\/\/|\/|#)/i.test(rawUrl) ? rawUrl : '';
    const external = /^https?:\/\//i.test(url);
    const portalIcon = portal.iconUrl ? `<img src="${escapeHtml(portal.iconUrl)}" alt="" />` : companyPortalIcon(portal.icon);
    const content = `<span class="company-portal-icon">${portalIcon}</span><span class="company-portal-copy"><b>${escapeHtml(portal.name)}</b><small>${escapeHtml(portal.description)}</small>${url ? '<span class="company-portal-action">Open portal <span aria-hidden="true">→</span></span>' : '<span class="company-portal-pending">Link coming soon</span>'}</span>`;
    return url ? `<a class="company-portal-card" href="${escapeHtml(url)}" ${external ? 'target="_blank" rel="noreferrer"' : ''}>${content}</a>` : `<article class="company-portal-card company-portal-card-pending">${content}</article>`;
  }).join('') : '<p class="company-portals-empty">Company portal links will appear here once configured.</p>';
}
function policySearchCount() { let count = document.querySelector('#policy-search-count'); if (!count) { count = document.createElement('span'); count.id = 'policy-search-count'; count.className = 'policy-search-count'; document.querySelector('#policy-viewer-find').after(count); } return count; }
function updatePolicyPager() {
  const previous = document.querySelector('#policy-viewer-previous'), next = document.querySelector('#policy-viewer-next');
  document.querySelector('#policy-viewer-page').textContent = `Page ${policyViewerPage} of ${policyViewerPageCount}`;
  previous.disabled = policyViewerPage <= 1;
  next.disabled = policyViewerPage >= policyViewerPageCount;
}
async function loadPolicyPageCount(url) {
  try {
    const response = await fetch(`/api/documents/info?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error('Unable to load document information');
    const { pages } = await response.json();
    if (policyViewerUrl !== url) return;
    policyViewerPageCount = Math.max(1, Number(pages) || 1);
    policyViewerPage = Math.min(policyViewerPage, policyViewerPageCount);
    updatePolicyPager();
    renderPolicyDocument(url, policyViewerPage);
  } catch { updatePolicyPager(); }
}
function scrollToPolicyPage(page, behavior = 'smooth') {
  policyViewerPage = Math.min(Math.max(1, page), policyViewerPageCount);
  updatePolicyPager();
  document.querySelector(`#policy-viewer-frame [data-policy-page="${policyViewerPage}"]`)?.scrollIntoView({ block:'start', behavior });
}
async function renderPolicyDocument(url, page, query = '', activeMatchIndex = -1) {
  policyViewerUrl = url;
  policyViewerPage = Math.min(Math.max(1, page), policyViewerPageCount);
  updatePolicyPager();
  const frame = document.querySelector('#policy-viewer-frame');
  frame.innerHTML = '<p class="policy-page-loading">Loading document…</p>';
  let highlights = [];
  try {
    const response = await fetch(`/api/documents/highlights?url=${encodeURIComponent(url)}&page=${page}&q=${encodeURIComponent(query)}`);
    if (response.ok) highlights = await response.json();
  } catch {}
  frame.innerHTML = '';
  for (let pageNumber = 1; pageNumber <= policyViewerPageCount; pageNumber += 1) {
    const canvas = document.createElement('section');
    canvas.className = 'policy-page-canvas';
    canvas.dataset.policyPage = String(pageNumber);
    canvas.setAttribute('aria-label', `Page ${pageNumber} of ${policyViewerPageCount}`);
    const image = document.createElement('img');
    image.alt = `Policy page ${pageNumber}`;
    image.src = `/api/documents/page?url=${encodeURIComponent(url)}&page=${pageNumber}`;
    image.onload = () => {
      if (pageNumber !== page) return;
      highlights.forEach(box => {
        const mark = document.createElement('i');
        mark.className = box.matchIndex === activeMatchIndex ? 'policy-page-highlight policy-page-highlight-active' : 'policy-page-highlight';
        mark.style.cssText = `left:${box.left * 100}%;top:${box.top * 100}%;width:${box.width * 100}%;height:${box.height * 100}%`;
        canvas.append(mark);
      });
      const active = canvas.querySelector('.policy-page-highlight-active');
      if (active) requestAnimationFrame(() => {
        const targetTop = canvas.offsetTop + (active.offsetTop - frame.clientHeight * 0.34);
        frame.scrollTo({ top: Math.max(0, targetTop), behavior:'smooth' });
      });
    };
    image.onerror = () => { if (pageNumber === page) canvas.innerHTML = '<p class="policy-page-error">This page could not be rendered. Use Open in a new tab to view the PDF.</p>'; };
    canvas.append(image);
    frame.append(canvas);
  }
  policyPageObserver?.disconnect();
  policyPageObserver = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    policyViewerPage = Number(visible.target.dataset.policyPage);
    updatePolicyPager();
  }, { root:frame, threshold:[0.45, 0.7] });
  frame.querySelectorAll('[data-policy-page]').forEach(canvas => policyPageObserver.observe(canvas));
  requestAnimationFrame(() => scrollToPolicyPage(page, 'auto'));
}
async function renderPolicyPage(url, page, query = '', activeMatchIndex = -1) {
  policyViewerUrl = url;
  policyViewerPage = Math.min(Math.max(1, page), policyViewerPageCount);
  updatePolicyPager();
  const frame = document.querySelector('#policy-viewer-frame');
  frame.innerHTML = '<p class="policy-page-loading">Loading page…</p>';

  let highlights = [];
  try {
    const response = await fetch(`/api/documents/highlights?url=${encodeURIComponent(url)}&page=${page}&q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Unable to load document highlights');
    highlights = await response.json();
  } catch {
    // A document remains readable even if its searchable text layer is unavailable.
  }

  const canvas = document.createElement('div');
  canvas.className = 'policy-page-canvas';
  const image = document.createElement('img');
  image.alt = `Policy page ${page}`;
  image.src = `/api/documents/page?url=${encodeURIComponent(url)}&page=${page}`;
  image.onload = () => {
    frame.innerHTML = '';
    canvas.append(image);
    highlights.forEach(box => {
      const mark = document.createElement('i');
      mark.className = box.matchIndex === activeMatchIndex ? 'policy-page-highlight policy-page-highlight-active' : 'policy-page-highlight';
      mark.style.cssText = `left:${box.left * 100}%;top:${box.top * 100}%;width:${box.width * 100}%;height:${box.height * 100}%`;
      canvas.append(mark);
    });
    frame.append(canvas);
  };
  image.onerror = () => { frame.innerHTML = '<p class="policy-page-error">This page could not be rendered. Use “Open in a new tab” to view the PDF.</p>'; };
}
function goToPolicyMatch(index) {
  if (!policySearchMatches.length) return;
  policySearchIndex = (index + policySearchMatches.length) % policySearchMatches.length;
  const match = policySearchMatches[policySearchIndex], url = document.querySelector('#policy-viewer-open').href;
  policySearchCount().textContent = `${policySearchIndex + 1}/${policySearchMatches.length}`;
  renderPolicyDocument(url, match.page, document.querySelector('#policy-viewer-find').value.trim(), match.matchIndex);
}
function openPolicyViewer(title, url) {
  const viewer = document.querySelector('#policy-viewer');
  if (!viewer || !isPdf(url)) return false;
  document.querySelector('#policy-viewer-title').textContent = title;
  document.documentElement.classList.add('policy-viewer-active');
  document.body.classList.add('policy-viewer-active');
  policyViewerUrl = url; policyViewerPage = 1; policyViewerPageCount = 1; updatePolicyPager();
  renderPolicyDocument(url, 1); loadPolicyPageCount(url);
  document.querySelector('#policy-viewer-open').href = url;
  const search = document.querySelector('#policy-viewer-find'); search.value = ''; document.querySelector('#policy-search-results').hidden = true; policySearchCount().textContent = ''; policySearchMatches = []; policySearchIndex = -1;
  viewer.showModal();
  return true;
}
function wirePolicyViewer() {
  const viewer = document.querySelector('#policy-viewer');
  viewer?.addEventListener('close', () => { document.documentElement.classList.remove('policy-viewer-active'); document.body.classList.remove('policy-viewer-active'); policyPageObserver?.disconnect(); });
  document.querySelector('#policy-viewer-close')?.addEventListener('click', () => viewer?.close());
  viewer?.addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
  document.querySelector('#policy-viewer-previous')?.addEventListener('click', () => scrollToPolicyPage(policyViewerPage - 1));
  document.querySelector('#policy-viewer-next')?.addEventListener('click', () => scrollToPolicyPage(policyViewerPage + 1));
  document.querySelector('#policy-viewer-find')?.addEventListener('input', event => {
    clearTimeout(wirePolicyViewer.searchTimer);
    const query = event.target.value.trim(), results = document.querySelector('#policy-search-results');
    const searchId = (wirePolicyViewer.searchId || 0) + 1;
    wirePolicyViewer.searchId = searchId;
    policySearchMatches = [];
    policySearchIndex = -1;
    policySearchCount().textContent = '';
    results.hidden = true;
    if (!query) return;

    wirePolicyViewer.searchTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/documents/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Document search failed');
        const matches = await response.json();
        if (wirePolicyViewer.searchId !== searchId) return;
        const activeUrl = document.querySelector('#policy-viewer-open').href;
        policySearchMatches = matches.filter(match => new URL(match.url, location.origin).href === activeUrl);
        if (!policySearchMatches.length) {
          policySearchCount().textContent = '0/0';
          results.innerHTML = '<p>No matches in this document.</p>';
          return;
        }
        results.innerHTML = policySearchMatches.map((match, index) => `<button type="button" data-document-match="${index}"><b>Page ${match.page} · ${escapeHtml(match.text)}</b><span>${escapeHtml(match.snippet)}</span></button>`).join('');
        results.hidden = false;
        goToPolicyMatch(0);
      } catch {
        if (wirePolicyViewer.searchId !== searchId) return;
        policySearchCount().textContent = '';
        results.innerHTML = '<p>Document search is temporarily unavailable.</p>';
      }
    }, 220);
  });
  document.querySelector('#policy-viewer-find')?.addEventListener('keydown', event => { if (event.key !== 'Enter') return; event.preventDefault(); const advance = attempts => { if (policySearchMatches.length) return goToPolicyMatch(policySearchIndex + 1); if (attempts) setTimeout(() => advance(attempts - 1), 120); }; advance(12); });
  document.querySelector('#policy-search-results')?.addEventListener('click', event => { const button = event.target.closest('[data-document-match]'); if (button) goToPolicyMatch(Number(button.dataset.documentMatch)); });
  document.addEventListener('click', event => { const action = event.target.closest('[data-policy-view],[data-policy-download],[data-policy-open]'); if (!action) return; const card = action.closest('[data-policy-title][data-policy-url]'); if (!card) return; if (action.dataset.policyDownload !== undefined) window.location.assign(`${card.dataset.policyUrl}?download=1`); else if (action.dataset.policyOpen !== undefined) recordPolicyViewed(card.dataset.policyId); else { openPolicyViewer(card.dataset.policyTitle, card.dataset.policyUrl); recordPolicyViewed(card.dataset.policyId); } });
}
function renderAcknowledgement(status) {
  const panel = document.querySelector('#policy-acknowledgement'); if (!panel) return; panel.hidden = false; policyAcknowledgement = status;
  if (status.acceptance) {
    const recordedFor = status.employee.demo ? 'Recorded in local demo mode' : `Recorded for ${escapeHtml(status.employee.email)}`;
    panel.innerHTML = `<div class="policy-acknowledgement-notice"><b>${escapeHtml(status.content.beforeHeading)}</b><p>${escapeHtml(status.content.beforeText)}</p></div><div class="policy-acknowledgement-head policy-acknowledgement-head--accepted"><div><h3>${escapeHtml(status.content.acceptedTitle)}</h3><p class="policy-acknowledged">${escapeHtml(status.content.afterText)}</p><p class="policy-acknowledgement-meta"><span>Confirmed on <time datetime="${escapeHtml(status.acceptance.acceptedAt)}">${escapeHtml(displayTimestamp(status.acceptance.acceptedAt))}</time></span><span>${recordedFor}</span></p><p class="policy-acknowledgement-detail">A policy version change will require a new acknowledgement.</p><button class="policy-acknowledgement-welcome-button" type="button" data-show-policy-welcome>View welcome message</button></div></div>`;
    document.dispatchEvent(new Event('policy-acknowledgement:rendered'));
    return;
  }
  const blocked = status.unpublished.length > 0, ready = !blocked && status.policies.length > 0 && status.policies.every(policy => policy.viewedAt);
  const list = status.policies.map(policy => `<li class="${policy.viewedAt ? 'is-viewed' : ''}">${escapeHtml(policy.title)} · ${escapeHtml(policy.version)}${policy.documentReady ? policy.viewedAt ? ' — reviewed' : ' — open the PDF below' : ' — document not published'}</li>`).join('');
  panel.innerHTML = `<div class="policy-acknowledgement-head"><div><h3>${escapeHtml(status.content.actionTitle)}</h3><p>${escapeHtml(status.content.instructionText)}</p>${status.employee.demo ? '<small>Local test mode: this will be linked to your Google Workspace account after SSO is enabled.</small>' : ''}</div></div><div class="policy-acknowledgement-notice"><b>${escapeHtml(status.content.beforeHeading)}</b><p>${escapeHtml(status.content.beforeText)}</p></div><ul class="policy-acknowledgement-list">${list}</ul>${blocked ? `<p class="policy-acknowledgement-error">The following mandatory documents must be published before acknowledgement: ${escapeHtml(status.unpublished.join(', '))}.</p>` : ''}<div class="policy-acknowledgement-actions"><button type="button" data-confirm-policy ${ready ? '' : 'disabled'}>${escapeHtml(status.content.confirmationLabel)}</button><small>${ready ? escapeHtml(status.content.confirmationHelp) : 'Review every published mandatory policy to enable confirmation.'}</small></div>`;
  document.dispatchEvent(new Event('policy-acknowledgement:rendered'));
}
async function refreshAcknowledgement() { try { const response = await fetch('/api/policy-acknowledgement'); if (response.ok) renderAcknowledgement(await response.json()); } catch {} }
async function recordPolicyViewed(policyId) { if (!policyId || policyAcknowledgement?.acceptance) return; try { const response = await fetch('/api/policy-acknowledgement/viewed', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ policyId }) }); if (response.ok) renderAcknowledgement(await response.json()); } catch {} }
function isFirstWeekComplete() { const tasks = [...document.querySelectorAll('[data-checklist-item]')]; return tasks.length > 0 && tasks.every(task => task.checked); }
function showAcknowledgementWelcome(status) { const dialog = document.querySelector('#policy-acknowledgement-welcome'); if (!dialog || dialog.open) return; const name = document.querySelector('#policy-acknowledgement-welcome-name'), continueButton = document.querySelector('#policy-acknowledgement-welcome-continue'), complete = isFirstWeekComplete(); if (name) name.textContent = status.employee?.name || 'colleague'; if (continueButton) continueButton.hidden = complete; dialog.showModal(); (complete ? document.querySelector('#policy-acknowledgement-welcome-close') : continueButton)?.focus(); }
document.querySelector('#policy-acknowledgement-welcome-close')?.addEventListener('click', () => document.querySelector('#policy-acknowledgement-welcome')?.close());
document.querySelector('#policy-acknowledgement-welcome-continue')?.addEventListener('click', () => { document.querySelector('#policy-acknowledgement-welcome')?.close(); document.querySelector('#first-week')?.scrollIntoView({ behavior:'smooth', block:'start' }); });
document.querySelector('#policy-acknowledgement-welcome')?.addEventListener('click', event => { if (event.target.id === 'policy-acknowledgement-welcome') event.currentTarget.close(); });
document.addEventListener('click', async event => { if (event.target.closest('[data-show-policy-welcome]')) { showAcknowledgementWelcome(policyAcknowledgement); return; } if (!event.target.closest('[data-confirm-policy]')) return; const response = await fetch('/api/policy-acknowledgement', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ statement:policyAcknowledgement?.content?.confirmationLabel || '' }) }); if (response.ok) { const status = await response.json(); renderAcknowledgement(status); showAcknowledgementWelcome(status); } else { const result = await response.json().catch(() => ({})); const panel = document.querySelector('#policy-acknowledgement'); const note = document.createElement('p'); note.className = 'policy-acknowledgement-error'; note.textContent = result.error || 'The acknowledgement could not be saved.'; panel?.append(note); } });
async function showPolicyRegister() {
  try {
    const response = await fetch('/api/dashboard');
    if (!response.ok) throw new Error('Policy register is unavailable');
    const { policies = [], newMembers = [], supportPortals = [], newSiPageContent = {} } = await response.json();
    document.querySelectorAll('[data-newsi-copy]').forEach(element => {
      const value = newSiPageContent?.[element.dataset.newsiCopy];
      if (typeof value === 'string' && value.trim()) element.textContent = value;
    });
    renderNewSiTrainingVideos(newSiPageContent);
    const announcements = document.querySelector('#all-new-members');
    if (announcements) announcements.innerHTML = newMembers.length ? newMembers.map(member => `<article class="new-member-announcement">${member.photoUrl ? `<img class="new-member-avatar new-member-photo" src="${escapeHtml(member.photoUrl)}" alt="Photo of ${escapeHtml(member.name)}" />` : `<span class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}">${escapeHtml(member.initials || member.name.split(' ').map(part => part[0]).join('').slice(0, 2))}</span>`}<div><div class="new-member-announcement-head"><div><b>${escapeHtml(member.name)}</b><span>${escapeHtml(member.role)} · ${escapeHtml(member.team)}</span></div><time>Recently joined · ${escapeHtml(member.joined)}</time></div><p>${escapeHtml(member.message)}</p><span class="new-member-manager">Direct Manager: ${escapeHtml(member.directManager || 'To be confirmed')}</span></div></article>`).join('') : '<p class="empty-state">No new member announcements are available right now.</p>';
    renderCompanyPortals(supportPortals);
    if (!policies.length) return;
    const grid = document.querySelector('#policies .policy-grid');
    grid.innerHTML = policies.map(policy => `<article class="policy-link-card policy-detail-card" data-policy-id="${escapeHtml(policy.id)}" data-policy-title="${escapeHtml(policy.title)}" data-policy-url="${escapeHtml(policy.canonicalUrl)}"><b>${escapeHtml(policy.title)}</b><small>${escapeHtml(policy.summary)}</small><dl class="policy-card-meta"><div><dt>Owner</dt><dd>${escapeHtml(policy.owner)}</dd></div><div><dt>Audience</dt><dd>${escapeHtml(policy.audience)}</dd></div><div><dt>Version</dt><dd>${escapeHtml(policy.version)}</dd></div><div><dt>Updated</dt><dd>${policy.modifiedAt ? escapeHtml(displayTimestamp(policy.modifiedAt)) : 'Linked policy'}</dd></div></dl>${isPdf(policy.canonicalUrl) ? '<div class="policy-card-actions"><button type="button" data-policy-view>View PDF</button><button type="button" data-policy-download>Download PDF</button></div>' : isPolicyLink(policy.canonicalUrl) ? `<div class="policy-card-actions"><a href="${escapeHtml(policy.canonicalUrl)}" target="_blank" rel="noopener noreferrer" data-policy-open>Open policy</a></div>` : '<p class="policy-card-pending">Document link coming soon</p>'}</article>`).join('');
    refreshAcknowledgement();
  } catch (error) {
    const note = document.createElement('p'); note.className = 'policy-register-error'; note.textContent = 'The policy register could not be loaded. Please try again or contact People Operations.';
    document.querySelector('#policies').append(note);
  }
}
wirePolicyViewer();
showPolicyRegister();
