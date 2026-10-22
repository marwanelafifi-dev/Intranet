const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const cairoTime = value => value ? new Intl.DateTimeFormat('en', { dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Cairo' }).format(new Date(value)) : 'Not yet';

function statusText(status = {}) {
  if (status.lastError) return `Last check: ${cairoTime(status.lastAttemptAt)} · ${status.lastError}`;
  if (!status.lastSuccessAt) return 'No successful sync yet.';
  return `Last successful check: ${cairoTime(status.lastSuccessAt)} · ${status.membersCreated || 0} new colleagues · ${status.calendarEvents || 0} calendar events`;
}

function ouChoices(available = [], selected = []) {
  const groups = new Map(), known = new Set(available.map(unit => unit.path));
  for (const unit of available) {
    const parent = unit.parent || unit.path.slice(0, unit.path.lastIndexOf('/')) || '/';
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(unit);
  }
  const visible = [...groups].map(([parent, units]) => `<div class="google-sync-ou-group" data-google-ou-group><h4>${escapeHtml(parent === '/' ? 'Top-level OUs' : parent.slice(1))}</h4>${units.map(unit => `<label class="google-sync-option" data-google-ou-option><input type="checkbox" name="ouPath" value="${escapeHtml(unit.path)}" ${selected.includes(unit.path) ? 'checked' : ''} /><span><b>${escapeHtml(unit.name)}</b><small>${escapeHtml(unit.path)}</small></span></label>`).join('')}</div>`).join('');
  const stale = selected.filter(path => !known.has(path)).map(path => `<label class="google-sync-option google-sync-stale" data-google-ou-option><input type="checkbox" name="ouPath" value="${escapeHtml(path)}" checked /><span><b>${escapeHtml(path)}</b><small>No longer returned by Google. Uncheck it before saving.</small></span></label>`).join('');
  return visible + stale || '<p class="google-sync-empty">No eligible employee or intern OUs are available. Check the Google connection and delegated permissions.</p>';
}

export async function renderGoogleSyncSettings(root, api) {
  root.innerHTML = '<article class="panel google-sync-panel"><h2>Google Workspace content sync</h2><p class="google-sync-loading" role="status">Loading organizational units and resource calendars…</p></article>';
  let data;
  try { data = await api('/api/admin/google-sync'); }
  catch (error) { root.innerHTML = `<article class="panel google-sync-panel"><h2>Google Workspace content sync</h2><p class="notice warning" role="alert">${escapeHtml(error.message || 'The sync settings could not be loaded. Refresh the page to try again.')}</p></article>`; return; }
  const settings = data.settings || { enabled:false, ouPaths:[], calendarIds:[] };
  const resources = data.resources || [];
  root.innerHTML = `<article class="panel google-sync-panel"><div class="google-sync-heading"><div><h2>Google Workspace content sync</h2><p>Choose who appears in Recently Joined and which resource events appear in Events &amp; key dates.</p></div><span class="google-sync-connection ${data.connected ? 'is-connected' : 'is-disconnected'}">${data.connected ? 'Google connected' : 'Setup needed'}</span></div>${data.message ? `<p class="notice warning google-sync-setup" role="status">${escapeHtml(data.message)} The service-account key and delegated administrator stay on the server.</p>` : ''}<form id="google-sync-form"><div class="google-sync-columns"><fieldset class="google-sync-group"><legend>Recently Joined</legend><p>New active users in selected OUs are published automatically. Guests, Consultants, and other OUs are excluded.</p><label class="google-sync-search-label" for="google-sync-ou-search">Find an employee or intern OU</label><input id="google-sync-ou-search" type="search" autocomplete="off" placeholder="Search OU name or path" ${data.connected ? '' : 'disabled'} /><div class="google-sync-ou-list" role="group" aria-label="Eligible Google organizational units">${ouChoices(data.availableOus, settings.ouPaths)}</div><small>Only direct members of checked OUs are included. Accounts older than the configured lookback are not backfilled. Existing cards remain when an OU is unchecked.</small></fieldset><fieldset class="google-sync-group"><legend>Events &amp; key dates</legend><p>Only event titles and start times from checked resources are shown. Private events and attendee details stay out of the intranet.</p><div class="google-sync-resource-list">${resources.map(resource => `<label class="google-sync-option"><input type="checkbox" name="calendarId" value="${escapeHtml(resource.id)}" ${settings.calendarIds?.includes(resource.id) ? 'checked' : ''} /><span><b>${escapeHtml(resource.label)}</b><small>${escapeHtml(resource.id)}</small></span></label>`).join('')}</div><small>Unchecking a resource removes its imported events when you save. Manual events are kept.</small></fieldset></div><div class="google-sync-footer"><label class="google-sync-enable"><input type="checkbox" name="enabled" ${settings.enabled ? 'checked' : ''} ${data.connected ? '' : 'disabled'} /><span><b>Enable automatic sync</b><small>Checks every 15 minutes and publishes selected Google content to employees.</small></span></label><div class="google-sync-actions"><button class="action-button secondary" type="button" data-google-sync-now ${data.connected && settings.enabled ? '' : 'disabled'}>Sync now</button><button class="action-button primary" type="submit" ${data.connected ? '' : 'disabled'}>Save sync settings</button></div></div><p class="google-sync-feedback" role="status" aria-live="polite"></p><p class="google-sync-last" data-google-sync-status>${escapeHtml(statusText(data.status))}</p></form></article>`;
  const form = root.querySelector('#google-sync-form'), feedback = root.querySelector('.google-sync-feedback'), search = root.querySelector('#google-sync-ou-search');
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase();
    root.querySelectorAll('[data-google-ou-option]').forEach(option => { option.hidden = Boolean(query) && !option.textContent.toLocaleLowerCase().includes(query); });
    root.querySelectorAll('[data-google-ou-group]').forEach(group => { group.hidden = !group.querySelector('[data-google-ou-option]:not([hidden])'); });
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const save = form.querySelector('[type="submit"]');
    save.disabled = true;
    feedback.textContent = 'Saving selections…';
    feedback.classList.remove('is-error');
    try {
      const body = { enabled:form.elements.enabled.checked, ouPaths:[...form.querySelectorAll('[name="ouPath"]:checked')].map(input => input.value), calendarIds:[...form.querySelectorAll('[name="calendarId"]:checked')].map(input => input.value) };
      await api('/api/admin/google-sync', { method:'PATCH', body:JSON.stringify(body) });
      feedback.textContent = body.enabled ? 'Saved. Automatic sync will run shortly.' : 'Saved. Automatic sync is off.';
      form.querySelector('[data-google-sync-now]').disabled = !body.enabled;
    } catch (error) { feedback.textContent = error.message || 'Could not save sync settings.'; feedback.classList.add('is-error'); }
    finally { save.disabled = false; }
  });
  form.querySelector('[data-google-sync-now]').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    feedback.textContent = 'Checking Google Workspace…';
    feedback.classList.remove('is-error');
    try {
      const response = await api('/api/admin/google-sync/run', { method:'POST', body:'{}' });
      root.querySelector('[data-google-sync-status]').textContent = statusText(response.status);
      feedback.textContent = response.status?.lastError ? 'The check finished with an error. Review the status below.' : 'Google Workspace check completed.';
      feedback.classList.toggle('is-error', Boolean(response.status?.lastError));
    } catch (error) { feedback.textContent = error.message || 'Could not run sync.'; feedback.classList.add('is-error'); }
    finally { button.disabled = false; }
  });
}
