const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const cairoTime = value => value ? new Intl.DateTimeFormat('en', { dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Cairo' }).format(new Date(value)) : 'Not yet';

function statusText(status = {}) {
  if (status.lastError) return `Last check: ${cairoTime(status.lastAttemptAt)} · ${status.lastError}`;
  if (!status.lastSuccessAt) return 'No successful sync yet.';
  return `Last successful check: ${cairoTime(status.lastSuccessAt)} · ${status.membersCreated || 0} new colleagues · ${status.membersUpdated || 0} updated users · ${status.membersRemoved || 0} removed users · ${status.calendarEvents || 0} calendar events`;
}
const schedule = (value, enabled) => ({ enabled:value?.enabled ?? Boolean(enabled), frequency:['hourly','daily','weekly'].includes(value?.frequency) ? value.frequency : 'daily', time:/^\d\d:\d\d$/.test(value?.time || '') ? value.time : '08:00', day:Number.isInteger(value?.day) ? value.day : 1 });
const minuteOptions = selected => Array.from({ length:60 }, (_, minute) => String(minute).padStart(2, '0')).map(minute => `<option value="${minute}" ${Number(selected) === Number(minute) ? 'selected' : ''}>:${minute}</option>`).join('');
const scheduleMarkup = (name, title, value, description) => `<fieldset class="google-sync-schedule" data-google-schedule="${name}"><legend>${title}</legend><div class="google-sync-schedule-head"><p>${description}</p><label class="google-sync-switch"><input type="checkbox" name="${name}Enabled" ${value.enabled ? 'checked' : ''} /><span>Automatic sync</span></label></div><div class="google-sync-schedule-controls"><label>Frequency<select name="${name}Frequency"><option value="hourly" ${value.frequency === 'hourly' ? 'selected' : ''}>Hourly</option><option value="daily" ${value.frequency === 'daily' ? 'selected' : ''}>Daily</option><option value="weekly" ${value.frequency === 'weekly' ? 'selected' : ''}>Weekly</option></select></label><label data-schedule-time>Runs at<input type="time" name="${name}Time" value="${escapeHtml(value.time)}" /></label><label data-schedule-minute>Minute past the hour<select name="${name}Minute">${minuteOptions(value.time.slice(-2))}</select></label><label data-weekly-day>Day of week<select name="${name}Day">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day, index) => `<option value="${index}" ${value.day === index ? 'selected' : ''}>${day}</option>`).join('')}</select></label></div><p class="google-sync-schedule-summary" data-schedule-summary></p></fieldset>`;
const calendarOption = (resource, selected) => `<label class="google-sync-option google-sync-calendar-option" data-google-calendar-source data-calendar-id="${escapeHtml(resource.id)}" data-calendar-label="${escapeHtml(resource.label)}"><input type="checkbox" name="calendarId" value="${escapeHtml(resource.id)}" ${selected ? 'checked' : ''} /><span><b>${escapeHtml(resource.label)}</b><small>${escapeHtml(resource.id)}</small></span>${resource.custom ? '<button class="google-sync-remove-calendar" type="button" data-remove-calendar aria-label="Remove this calendar">Remove</button>' : ''}</label>`;

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
  settings.memberSchedule = schedule(settings.memberSchedule, settings.enabled); settings.calendarSchedule = schedule(settings.calendarSchedule, settings.enabled);
  const resources = data.resources || [];
  root.innerHTML = `<article class="panel google-sync-panel"><div class="google-sync-heading"><div><h2>Google Workspace content sync</h2><p>Choose who appears in Recently Joined and which resource events appear in Events &amp; key dates.</p></div><span class="google-sync-connection ${data.connected ? 'is-connected' : 'is-disconnected'}">${data.connected ? 'Google connected' : 'Setup needed'}</span></div>${data.message ? `<p class="notice warning google-sync-setup" role="status">${escapeHtml(data.message)} The service-account key and delegated administrator stay on the server.</p>` : ''}<form id="google-sync-form"><div class="google-sync-columns"><fieldset class="google-sync-group"><legend>Recently Joined</legend><p>New active users in selected OUs are published automatically. Guests, Consultants, and other OUs are excluded.</p><label class="google-sync-search-label" for="google-sync-ou-search">Find an employee or intern OU</label><input id="google-sync-ou-search" type="search" autocomplete="off" placeholder="Search OU name or path" ${data.connected ? '' : 'disabled'} /><div class="google-sync-ou-list" role="group" aria-label="Eligible Google organizational units">${ouChoices(data.availableOus, settings.ouPaths)}</div><small>Only direct members of checked OUs are included. Accounts older than the configured lookback are not backfilled. Existing cards remain when an OU is unchecked.</small></fieldset><fieldset class="google-sync-group"><legend>Events &amp; key dates</legend><p>Titles, dates, times, and rooms are visible to employees. Descriptions, meeting links, and attachments are released only after the server confirms that the signed-in user is invited.</p><div class="google-sync-resource-list">${resources.map(resource => `<label class="google-sync-option"><input type="checkbox" name="calendarId" value="${escapeHtml(resource.id)}" ${settings.calendarIds?.includes(resource.id) ? 'checked' : ''} /><span><b>${escapeHtml(resource.label)}</b><small>${escapeHtml(resource.id)}</small></span></label>`).join('')}</div><small>Unchecking a resource removes its imported events when you save. Manual events are kept.</small></fieldset></div><div class="google-sync-footer"><label class="google-sync-enable"><input type="checkbox" name="enabled" ${settings.enabled ? 'checked' : ''} ${data.connected ? '' : 'disabled'} /><span><b>Enable automatic sync</b><small>Checks every 15 minutes and publishes selected Google content to employees.</small></span></label><div class="google-sync-actions"><button class="action-button secondary" type="button" data-google-sync-now ${data.connected && settings.enabled ? '' : 'disabled'}>Sync now</button><button class="action-button primary" type="submit" ${data.connected ? '' : 'disabled'}>Save sync settings</button></div></div><p class="google-sync-feedback" role="status" aria-live="polite"></p><p class="google-sync-last" data-google-sync-status>${escapeHtml(statusText(data.status))}</p></form></article>`;
  const directoryGroup = root.querySelector('.google-sync-group');
  root.querySelector('.google-sync-heading p').textContent = 'Choose which colleagues appear in Our Team and which resource events appear in Events & key dates.';
  directoryGroup.querySelector('legend').textContent = 'Our Team directory';
  directoryGroup.querySelector('p').textContent = 'All active users in checked Google Workspace OUs are published to the employee directory.';
  directoryGroup.querySelector('label').textContent = 'Find an organizational unit';
  directoryGroup.querySelector('small').textContent = 'Any non-root organizational unit can be selected. Only direct members of each checked OU are included. The dashboard highlights the two newest accounts by Google Workspace creation date. Existing cards remain when an OU is unchecked.';
  const calendarList = root.querySelector('.google-sync-resource-list');
  calendarList.outerHTML = `<div class="google-sync-resource-list" data-google-calendar-list>${resources.map(resource => calendarOption(resource, settings.calendarIds?.includes(resource.id))).join('')}</div>`;
  root.querySelector('[data-google-calendar-list]').insertAdjacentHTML('afterend', `<div class="google-sync-add-calendar"><label for="google-calendar-email">Add calendar by email</label><div><input id="google-calendar-email" type="email" inputmode="email" autocomplete="off" placeholder="calendar@group.calendar.google.com" ${data.connected ? '' : 'disabled'} /><button class="action-button secondary" type="button" data-add-calendar ${data.connected ? '' : 'disabled'}>Add</button></div><small>It will be verified with Google when you save.</small></div>`);
  root.querySelector('.google-sync-enable').outerHTML = `<div class="google-sync-schedules">${scheduleMarkup('member', 'User directory sync', settings.memberSchedule, 'Publish selected organizational-unit users to the directory.')}${scheduleMarkup('calendar', 'Calendar sync', settings.calendarSchedule, 'Import selected resource-calendar events for employees.')}<small class="google-sync-timezone">All schedules use Africa/Cairo time. Each source can run independently.</small></div>`;
  const form = root.querySelector('#google-sync-form'), feedback = root.querySelector('.google-sync-feedback'), search = root.querySelector('#google-sync-ou-search');
  const addCalendar = () => {
    const emailInput = root.querySelector('#google-calendar-email'), email = emailInput.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { feedback.textContent = 'Enter a valid calendar email address.'; feedback.classList.add('is-error'); emailInput.focus(); return; }
    if (root.querySelector(`[data-google-calendar-source][data-calendar-id="${CSS.escape(email)}"]`)) { feedback.textContent = 'That calendar is already in the list.'; feedback.classList.add('is-error'); return; }
    root.querySelector('[data-google-calendar-list]').insertAdjacentHTML('beforeend', calendarOption({ id:email, label:email, custom:true }, true));
    emailInput.value = '';
    feedback.textContent = 'Calendar added. Save settings to verify it with Google.';
    feedback.classList.remove('is-error');
  };
  root.querySelector('[data-add-calendar]').addEventListener('click', addCalendar);
  root.querySelector('#google-calendar-email').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addCalendar(); } });
  root.querySelector('[data-google-calendar-list]').addEventListener('click', event => {
    const remove = event.target.closest('[data-remove-calendar]');
    if (!remove) return;
    remove.closest('[data-google-calendar-source]').remove();
  });
  const updateSchedule = scheduleRoot => {
    const frequency = scheduleRoot.querySelector('[name$="Frequency"]').value;
    const active = scheduleRoot.querySelector('[name$="Enabled"]').checked;
    const timeField = scheduleRoot.querySelector('[data-schedule-time]');
    const minuteField = scheduleRoot.querySelector('[data-schedule-minute]');
    const dayField = scheduleRoot.querySelector('[data-weekly-day]');
    timeField.hidden = frequency === 'hourly';
    minuteField.hidden = frequency !== 'hourly';
    dayField.hidden = frequency !== 'weekly';
    scheduleRoot.classList.toggle('is-disabled', !active);
    scheduleRoot.querySelectorAll('.google-sync-schedule-controls select, .google-sync-schedule-controls input').forEach(control => { control.disabled = !active; });
    const time = scheduleRoot.querySelector('[name$="Time"]').value || '08:00';
    const formattedTime = new Intl.DateTimeFormat('en', { hour:'numeric', minute:'2-digit' }).format(new Date(`2000-01-01T${time}:00`));
    const minute = scheduleRoot.querySelector('[name$="Minute"]').value;
    const day = scheduleRoot.querySelector('[name$="Day"] option:checked')?.textContent;
    scheduleRoot.querySelector('[data-schedule-summary]').textContent = !active ? 'Automatic sync is off for this source.' : frequency === 'hourly' ? `Runs every hour at ${minute} minutes past the hour.` : frequency === 'weekly' ? `Runs every ${day} at ${formattedTime}.` : `Runs every day at ${formattedTime}.`;
  };
  root.querySelectorAll('[data-google-schedule]').forEach(scheduleRoot => {
    updateSchedule(scheduleRoot);
    scheduleRoot.addEventListener('change', () => updateSchedule(scheduleRoot));
  });
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
      const readSchedule = name => {
        const frequency = form.elements[`${name}Frequency`].value;
        return { enabled:form.elements[`${name}Enabled`].checked, frequency, time:frequency === 'hourly' ? `00:${form.elements[`${name}Minute`].value}` : form.elements[`${name}Time`].value, day:Number(form.elements[`${name}Day`].value) };
      };
      const memberSchedule = readSchedule('member'), calendarSchedule = readSchedule('calendar');
      const calendarSources = [...form.querySelectorAll('[data-google-calendar-source]')].map(option => ({ id:option.dataset.calendarId, label:option.dataset.calendarLabel }));
      const body = { enabled:memberSchedule.enabled || calendarSchedule.enabled, memberSchedule, calendarSchedule, ouPaths:[...form.querySelectorAll('[name="ouPath"]:checked')].map(input => input.value), calendarIds:[...form.querySelectorAll('[name="calendarId"]:checked')].map(input => input.value), calendarSources };
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
