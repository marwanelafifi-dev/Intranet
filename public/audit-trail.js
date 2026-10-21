let category = 'all', page = 1, query = '';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const cairo = value => value ? new Intl.DateTimeFormat('en', { dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Cairo' }).format(new Date(value)) : '—';
const kindLabels = { all:'All events', page:'Page opens', click:'Clicks', change:'Content changes', access:'Access', system:'Other' };
const kindIcons = {
  all:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  page:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/>',
  click:'<path d="m5 3 13 9-6 1-2 7-5-17Z"/><path d="m12 13 4 6"/>',
  change:'<path d="M4 20h16M6 16l10-10 2 2-10 10-3 1 1-3Z"/>',
  access:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  system:'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M8 15h.01M12 15h4"/>'
};
const icon = kind => `<svg viewBox="0 0 24 24" aria-hidden="true">${kindIcons[kind] || kindIcons.system}</svg>`;

function kindFor(event) {
  if (event.category === 'activity') return /^(page\.|page$)/.test(event.action || '') ? 'page' : /click|activate/.test(event.action || '') ? 'click' : 'system';
  if (/^(content\.|presentation\.)/.test(event.action || '')) return 'change';
  if (/^(authentication\.|access\.)/.test(event.action || '')) return 'access';
  return 'system';
}

function actionLabel(event) {
  const labels = {
    'page.open':'Page opened', 'page.navigation':'Page opened',
    'button.click':'Button clicked', 'link.click':'Link clicked', 'interface.activate':'Control clicked',
    'control.change':'Control changed', 'interface.change':'Control changed',
    'content.updated':'Content updated', 'presentation.updated':'Appearance updated',
    'authentication.login':'Signed in', 'authentication.logout':'Signed out'
  };
  return labels[event.action] || String(event.action || 'Event recorded').replace(/[._-]/g, ' ');
}

function targetFor(event) {
  const pages = event.changes?.pages;
  return Array.isArray(pages) && pages.length ? [...new Set(pages)].join(' · ') : event.resource || event.metadata?.page || event.route || '—';
}

function descriptionFor(event) {
  const control = event.metadata?.control;
  if (event.category === 'activity') {
    if (kindFor(event) === 'page') return `Opened ${event.metadata?.page || event.route || 'page'}`;
    if (kindFor(event) === 'click') return `Clicked “${control || event.component || 'control'}”${event.metadata?.destination ? ` → ${event.metadata.destination}` : ''}`;
    return control ? `Changed “${control}”` : 'Control changed';
  }
  return targetFor(event);
}

function changesMarkup(event) {
  const details = Array.isArray(event.changes?.details) ? event.changes.details : [];
  if (!details.length) return '';
  return `<details class="audit-change-details"><summary>View ${details.length} field change${details.length === 1 ? '' : 's'}${event.changes.truncated ? ' (more not shown)' : ''}</summary><ul class="audit-change-list">${details.map(detail => `<li><b>${escapeHtml(detail.record || detail.section)} · ${escapeHtml(detail.field)} <small>(${escapeHtml(detail.change)})</small></b><div class="audit-change-values"><span><small>Before</small><em>${escapeHtml(detail.before)}</em></span><span><small>After</small><strong>${escapeHtml(detail.after)}</strong></span></div></li>`).join('')}</ul></details>`;
}

function eventMarkup(event) {
  const kind = kindFor(event), moment = event.serverReceivedAt || event.occurredAt;
  const foot = [event.category === 'activity' ? 'Browser-reported' : 'Verified server result', event.actor?.email, event.ip ? `IP ${event.ip}` : ''].filter(Boolean).join(' · ');
  return `<li class="audit-event" data-kind="${kind}"><span class="audit-event-icon">${icon(kind)}</span><div class="audit-event-main"><div class="audit-event-title"><b>${escapeHtml(event.actor?.name || 'System')}</b><span>${escapeHtml(actionLabel(event))}</span></div><p class="audit-event-route">ON: ${escapeHtml(event.route || '—')}${event.metadata?.page ? ` · ${escapeHtml(event.metadata.page)}` : ''}</p><p class="audit-event-description">${escapeHtml(descriptionFor(event))}</p>${changesMarkup(event)}<p class="audit-event-foot">${escapeHtml(foot)}</p></div><div class="audit-event-side"><span class="audit-event-kind">${escapeHtml(kindLabels[kind])}</span><time datetime="${escapeHtml(moment)}">${escapeHtml(cairo(moment))}</time></div></li>`;
}

function statsMarkup(counts = {}) {
  return Object.entries(kindLabels).map(([kind, label]) => `<div class="audit-stat" data-kind="${kind}"><span class="audit-stat-icon">${icon(kind)}</span><div><span>${escapeHtml(label)}</span><b>${Number(counts[kind] || 0).toLocaleString('en')}</b></div></div>`).join('');
}

export async function renderAuditTrail(root, canExport = false) {
  if (!root) return;
  root.innerHTML = `<div class="audit-trail-heading"><h2>Audit Trail</h2><p>Recent page opens, controls, access events, and content changes. Records older than 90 days are archived daily on the server; Whistleblower activity is excluded.</p></div><div class="audit-stats" id="audit-stats" aria-label="Event counts">${statsMarkup()}</div><section class="audit-trail-shell" aria-label="Audit events"><div class="audit-trail-toolbar"><form class="audit-trail-search" id="audit-search-form" role="search"><label class="sr-only" for="audit-query">Search audit events</label><input id="audit-query" type="search" value="${escapeHtml(query)}" placeholder="Search user, page, control, or change" /></form><div class="audit-trail-filters" role="group" aria-label="Filter events">${Object.entries(kindLabels).map(([kind, label]) => `<button type="button" class="audit-filter-chip" data-audit-kind="${kind}" aria-pressed="${kind === category}">${escapeHtml(label)}</button>`).join('')}</div><div class="audit-trail-actions"><button class="action-button" type="button" data-audit-refresh>Refresh</button>${canExport ? `<a class="action-button" href="/api/admin/audit/export?category=${encodeURIComponent(category)}&q=${encodeURIComponent(query)}">Export CSV</a>` : ''}</div></div><div id="audit-results" aria-live="polite"><p class="audit-trail-empty">Loading events…</p></div></section>`;
  const results = root.querySelector('#audit-results');
  root.querySelector('#audit-search-form').addEventListener('submit', event => { event.preventDefault(); query = root.querySelector('#audit-query').value.trim(); page = 1; renderAuditTrail(root, canExport); });
  root.querySelector('#audit-query').addEventListener('search', event => { query = event.target.value.trim(); page = 1; renderAuditTrail(root, canExport); });
  root.querySelectorAll('[data-audit-kind]').forEach(button => button.addEventListener('click', () => { query = root.querySelector('#audit-query').value.trim(); category = button.dataset.auditKind; page = 1; renderAuditTrail(root, canExport); }));
  root.querySelector('[data-audit-refresh]').addEventListener('click', () => { query = root.querySelector('#audit-query').value.trim(); renderAuditTrail(root, canExport); });
  results.addEventListener('click', event => {
    const direction = event.target.closest('[data-audit-page]')?.dataset.auditPage;
    if (!direction) return;
    page += direction === 'next' ? 1 : -1;
    renderAuditTrail(root, canExport);
  });
  try {
    const response = await fetch(`/api/admin/audit?category=${encodeURIComponent(category)}&q=${encodeURIComponent(query)}&page=${page}`, { credentials:'same-origin' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load audit events.');
    if (!root.contains(results)) return;
    root.querySelector('#audit-stats').innerHTML = statsMarkup(data.counts);
    results.innerHTML = `${data.records.length ? `<ol class="audit-events">${data.records.map(eventMarkup).join('')}</ol>` : '<p class="audit-trail-empty">No events match this filter. Try another category or search.</p>'}<div class="pager"><button class="action-button" type="button" data-audit-page="prev" ${data.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${data.page} of ${data.pages} · ${data.total} events</span><button class="action-button" type="button" data-audit-page="next" ${data.page >= data.pages ? 'disabled' : ''}>Next</button></div>`;
  } catch (error) {
    if (root.contains(results)) results.innerHTML = `<p class="audit-trail-empty" role="alert">${escapeHtml(error.message)} <button class="action-button" type="button" data-audit-retry>Try again</button></p>`;
    results.querySelector('[data-audit-retry]')?.addEventListener('click', () => renderAuditTrail(root, canExport));
  }
}
