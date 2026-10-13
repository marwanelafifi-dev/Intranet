const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const displayTimestamp = value => new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Cairo' }).format(new Date(value));
const isPdf = url => /^\/uploads\/.*\.pdf(?:$|[?#])/i.test(url || '');
let policySearchMatches = [], policySearchIndex = -1;
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
    const content = `<span class="company-portal-icon">${companyPortalIcon(portal.icon)}</span><span class="company-portal-copy"><b>${escapeHtml(portal.name)}</b><small>${escapeHtml(portal.description)}</small>${url ? '<span class="company-portal-action">Open portal <span aria-hidden="true">→</span></span>' : '<span class="company-portal-pending">Link coming soon</span>'}</span>`;
    return url ? `<a class="company-portal-card" href="${escapeHtml(url)}" ${external ? 'target="_blank" rel="noreferrer"' : ''}>${content}</a>` : `<article class="company-portal-card company-portal-card-pending">${content}</article>`;
  }).join('') : '<p class="company-portals-empty">Company portal links will appear here once configured.</p>';
}
function policySearchCount() { let count = document.querySelector('#policy-search-count'); if (!count) { count = document.createElement('span'); count.id = 'policy-search-count'; count.className = 'policy-search-count'; document.querySelector('#policy-viewer-find').after(count); } return count; }
async function renderPolicyPage(url, page, query = '', activeMatchIndex = -1) {
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
  document.querySelector('#policy-search-results').hidden = true;
  policySearchCount().textContent = `${policySearchIndex + 1}/${policySearchMatches.length}`;
  renderPolicyPage(url, match.page, document.querySelector('#policy-viewer-find').value.trim(), match.matchIndex);
}
function openPolicyViewer(title, url) {
  const viewer = document.querySelector('#policy-viewer');
  if (!viewer || !isPdf(url)) return false;
  document.querySelector('#policy-viewer-title').textContent = title;
  renderPolicyPage(url, 1);
  document.querySelector('#policy-viewer-open').href = url;
  const search = document.querySelector('#policy-viewer-find'); search.value = ''; document.querySelector('#policy-search-results').hidden = true; policySearchCount().textContent = ''; policySearchMatches = []; policySearchIndex = -1;
  viewer.showModal();
  return true;
}
function wirePolicyViewer() {
  document.querySelector('#policy-viewer-close')?.addEventListener('click', () => document.querySelector('#policy-viewer').close());
  document.querySelector('#policy-viewer')?.addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
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
  document.addEventListener('click', event => { const action = event.target.closest('[data-policy-view],[data-policy-download]'); if (!action) return; const card = action.closest('[data-policy-title][data-policy-url]'); if (!card) return; if (action.dataset.policyDownload !== undefined) window.location.assign(`${card.dataset.policyUrl}?download=1`); else openPolicyViewer(card.dataset.policyTitle, card.dataset.policyUrl); });
}
async function showPolicyRegister() {
  try {
    const response = await fetch('/api/dashboard');
    if (!response.ok) throw new Error('Policy register is unavailable');
    const { policies = [], newMembers = [], supportPortals = [] } = await response.json();
    const announcements = document.querySelector('#all-new-members');
    if (announcements) announcements.innerHTML = newMembers.length ? newMembers.map(member => `<article class="new-member-announcement">${member.photoUrl ? `<img class="new-member-avatar new-member-photo" src="${escapeHtml(member.photoUrl)}" alt="Photo of ${escapeHtml(member.name)}" />` : `<span class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}">${escapeHtml(member.initials || member.name.split(' ').map(part => part[0]).join('').slice(0, 2))}</span>`}<div><div class="new-member-announcement-head"><div><b>${escapeHtml(member.name)}</b><span>${escapeHtml(member.role)} · ${escapeHtml(member.team)}</span></div><time>Recently joined · ${escapeHtml(member.joined)}</time></div><p>${escapeHtml(member.message)}</p><span class="new-member-manager">Direct Manager: ${escapeHtml(member.directManager || 'To be confirmed')}</span></div></article>`).join('') : '<p class="empty-state">No new member announcements are available right now.</p>';
    renderCompanyPortals(supportPortals);
    if (!policies.length) return;
    document.querySelectorAll('#policies .policy-link-card').forEach((card, index) => {
      const policy = policies[index];
      if (policy) { card.dataset.policyTitle = policy.title; card.dataset.policyUrl = policy.canonicalUrl; const existing = card.querySelector('.policy-card-actions'); if (isPdf(policy.canonicalUrl) && !existing) card.insertAdjacentHTML('beforeend', '<div class="policy-card-actions"><button type="button" data-policy-view>View PDF</button><button type="button" data-policy-download>Download PDF</button></div>'); }
    });
    const register = `<article class="policy-card policy-register" id="policy-register"><div class="policy-register-head"><div><h2>Policy register</h2><p>Every policy has one official location and a named owner. Use this register to confirm you have the current version.</p></div><span class="policy-status">${policies.length} current policies</span></div><div class="policy-register-list">${policies.map(policy => `<article class="policy-record"><span class="policy-record-main"><b>${escapeHtml(policy.title)}</b><small>${escapeHtml(policy.summary)}</small></span><span class="policy-record-meta"><span><i>Owner</i>${escapeHtml(policy.owner)}</span><span><i>Audience</i>${escapeHtml(policy.audience)}</span><span><i>Version</i>${escapeHtml(policy.version)}</span><span><i>Modified</i>${policy.modifiedAt ? displayTimestamp(policy.modifiedAt) : 'No file uploaded'}</span></span></article>`).join('')}</div></article>`;
    document.querySelector('#policies').insertAdjacentHTML('afterend', register);
  } catch (error) {
    const note = document.createElement('p'); note.className = 'policy-register-error'; note.textContent = 'The policy register could not be loaded. Please try again or contact People Operations.';
    document.querySelector('#policies').append(note);
  }
}
wirePolicyViewer();
showPolicyRegister();
