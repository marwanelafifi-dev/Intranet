const escapeHtml = value => String(value || '').replace(/[&<'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const pages = {
  apps:{ title:'Main Apps', intro:'Open the everyday systems that keep work moving across Si-Ware.' },
  announcements:{ title:'Announcements', intro:'Your central source for internal announcements and operational updates for all Si-Ware employees.' },
  moments:{ title:'Moments', intro:'Team outings, achievements and shared milestones worth celebrating.' },
  knowledge:{ title:'Si-Ware Knowledge Hub', intro:'Sessions, field notes and practical know-how from across the company.' },
  events:{ title:'Events & key dates', intro:'Important dates, sessions and company moments to plan around.' },
  social:{ title:'Social Media', intro:'Follow Si-Ware stories, research and product news across our official channels.' },
};
const root = document.querySelector('#destination-root');
const key = document.body.dataset.destinationPage;
const config = pages[key];
const knowledgeResourceKey = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const knowledgeResourceLinks = Object.freeze({
  'si-ware knowledge hub (skh) overview_2025-02-26_v1.pdf':'https://drive.google.com/file/d/1S2Chzd3KcSIN9nN2l3A-dorxFTSdHUuA/view?usp=sharing',
  'gmt20250226-081430_recording_1920x1080.mp4':'https://drive.google.com/file/d/1SNLOgskGzw2YVC2QY40h_tvJroQR_Qa9/view?usp=sharing',
  'photonics west & cra-w visit highlights_2025-02-26_v3.pdf':'https://drive.google.com/file/d/1uQDF4fqFrOJZa3Eu0f1XLESeSjkKmBwC/view?usp=sharing',
  'gmt20250226-082053_recording_1920x1080.mp4':'https://drive.google.com/file/d/1Cf1SNd9ln08u8jUF0AGzWc2WBoAHKiX6/view?usp=sharing',
  'fundamentals of patenting & si-ware patents portfolio.pptx':'https://docs.google.com/presentation/d/1tYWgSQvmbzVwR2Qh6OFQL3QERLf3igx1/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'part 1.mp4':'https://drive.google.com/file/d/14FUDVIxVY3jairU1VIR2lHYsYKglliJB/view?usp=sharing',
  'part 2.mp4':'https://drive.google.com/file/d/179RKkHz-scXEN-nmfpp4FNTTXknx5TFs/view?usp=sharing',
  'gsa overview and research trends in optical spectrometers':'https://docs.google.com/presentation/d/1DDqH9zjnu5mAJT1TxdlAMPwDWW1bZuJpIN6KeAlnfXs/edit?usp=sharing',
  'part1: gsa overview.mp4':'https://drive.google.com/file/d/1IdWKenv7vAUeGN2lCN6XLwBFrnG01KDv/view?usp=sharing',
  'part2: research trends in optical spectrometers.mp4':'https://drive.google.com/file/d/1tQ4s-R8DBk4zS5ORWA1oBSea-KUBVQU7/view?usp=sharing',
  'phd research presentation.pptx':'https://docs.google.com/presentation/d/1sZv26y3AIN6XdnXn-tTQGABkG_j-m8cW/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20250525-065510_recording_3840x2400.mp4':'https://drive.google.com/file/d/1bMPYhA7q1JhnA0j0RrQQI_Gg9oR0k4rg/view?usp=sharing',
  '(skh) project management essentials � knowledge areas and processes':'https://docs.google.com/presentation/d/1zdI1G7CLSoKh5xEKRzKO1A4AzXkAtb1SW9Tdy7te5lw/edit?usp=sharing',
  'gmt20250618-065545_recording_1920x1080.mp4':'https://drive.google.com/file/d/1qqDPYsdw3A1_h1JIOGq_ZHCt4yyZGe_-/view?usp=sharing',
  'gmt20250625-071407_recording_1920x1080.mp4':'https://drive.google.com/file/d/1NGmM_7j_vyV2kKjjNQjgAqza2uqZGsUl/view?usp=sharing',
  'smarter workflows with excel & google sheets part 1.pptx':'https://docs.google.com/presentation/d/1EBmXqwMG0a3n9zZg5_ZEHiQZl8T9sxL3/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20250827-065952_recording_1920x1200.mp4':'https://drive.google.com/file/d/1XpS7qTzc5e8AGGD32L7pVXhEL2ddQ7hS/view?usp=sharing',
  'smarter workflows with excel & google sheets.pptx':'https://docs.google.com/presentation/d/10Fi_7Nc1jaBOajik6ltmaoZfqPVYPa2T/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'nir-rome highlights 2025.pptx':'https://docs.google.com/presentation/d/1F_97Ba-aPiPwsK0bhiZIp0cHG1GgHL0t/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20250910-071259_recording_1920x1080.mp4':'https://drive.google.com/file/d/1uTrK2aQWnBr17kKGEJWZ3S0WQBpp1eo5/view?usp=sharing',
  'erasmus auc.pdf':'https://drive.google.com/file/d/1DumXyieIMTzAc69HN4QIWmAbRD56Jlj5/view?usp=sharing',
  'gmt20251016-065607_recording_1920x1080.mp4':'https://drive.google.com/file/d/1WSaHwNfxKqoLckQ2ehuisAGpLRFd49mF/view?usp=sharing',
  'incabin event summary.pptx':'https://docs.google.com/presentation/d/18gtnmrIttmDLDQk_ajy5rj1xGRmKPw5T/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20251029-065629_recording_3840x2160.mp4':'https://drive.google.com/file/d/10Bl_v5GNJBGUYIL6_umo7ltqd118Ezic/view?usp=sharing',
  'mems_function_session_skh_17_dec_2025.pptx':'https://docs.google.com/presentation/d/1EO1jfe_SM88MFc1a6Z8g5jE_YeJZig-p/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20251217-080519_recording_3840x2160.mp4':'https://drive.google.com/file/d/1KLIsqTQskC3HSyVPvvg529sPaOp2O5Ou/view?usp=sharing',
  'smart robotic solutions for industrial inspection and healthcare monitoring.pdf':'https://drive.google.com/file/d/163LGv_XL9AA5-AcfJMubj9WNtSkV8Tej/view?usp=sharing',
  'gmt20251223-120832_recording_1920x1080.mp4':'https://drive.google.com/file/d/1hYsPpYTIjP_hFQFdV5R2CEvRP7yZv5CV/view?usp=sharing',
  'electronics_function_session_skh_11_feb_2026.pptx':'https://docs.google.com/presentation/d/1c6IKWUmj5VCuYc_TRw2oI95bT91W-eJ7/edit?usp=sharing&ouid=117968421319716326544&rtpof=true&sd=true',
  'gmt20260211-081020_recording_1920x1200.mp4':'https://drive.google.com/file/d/16w-NN5UfrIaRHyxiZH5sZ9gBOspMLDew/view?usp=sharing'
});
const knowledgeMaterialLinks = Object.freeze({
  'gsa':'https://drive.google.com/drive/folders/17wgt-atu2YA2H_n2zHb_ZGfn3iHrhJ2r?usp=sharing',
  'smarter workflows with excel & google sheets - part 2':'https://drive.google.com/drive/folders/1RvoLICtRAVx-2dqSBPYB9TYo3fTxXCiU?usp=sharing',
  'nir rome conference highlights':'https://drive.google.com/drive/folders/1fZPJusSeWcUa6T4ihqOKJvvYCVvnESfA?usp=drive_link',
  'smart robotic solutions for industrial inspection and healthcare monitoring':'https://drive.google.com/file/d/11EBGJjbt7nTjAe4tp9z3zUcO4f6K3g3S/view?usp=sharing'
});
const resolvedKnowledgeResource = (url, filename, sessionTitle, materials = false) => String(url || '').trim() || knowledgeResourceLinks[knowledgeResourceKey(filename)] || (materials ? knowledgeMaterialLinks[knowledgeResourceKey(filename)] || knowledgeMaterialLinks[knowledgeResourceKey(sessionTitle)] || '' : '');
if (key === 'knowledge') {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = '/knowledge-hub.css?v=20261017-speaker-filter';
  document.head.append(style);
}
const dateLabel = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en', { month:'short', day:'numeric', year:'numeric' }).format(date); };
const announcementTimestamp = item => {
  if (String(item.date || '').trim()) return { label:String(item.date).trim(), iso:'' };
  const explicit = item.publishedAt || item.createdAt;
  const idTimestamp = String(item.id || '').match(/(\d{11,})$/)?.[1];
  const date = new Date(explicit || (idTimestamp ? Number(idTimestamp) : NaN));
  if (Number.isNaN(date.getTime())) return { label:item.date || 'Timestamp unavailable', iso:'' };
  return {
    label:new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }).format(date),
    iso:date.toISOString(),
  };
};
const announcementBodyHtml = item => { const html = String(item.bodyHtml || ''), legacy = /<(?:html|head|body|table|style)\b|<(?:div|section|td|tr)[^>]*\b(?:style|bgcolor)=/i.test(html); return legacy ? `<iframe class="announcement-template-frame" title="Announcement template" sandbox="" srcdoc="${escapeHtml(html)}"></iframe>` : (html || escapeHtml(item.body || 'No announcement details were provided.')); };
function intro() { return `<section class="destination-intro${key === 'announcements' ? ' destination-intro--announcements' : ''}"><h1>${config.title}</h1><p>${config.intro}</p></section>`; }
function appPage(data) {
  const apps = Array.isArray(data.apps) ? data.apps : [];
  const initials = value => String(value || 'App').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return apps.length ? `<section class="apps-directory" aria-label="Application directory"><div class="apps-directory-grid">${apps.map(app => {
    const caption = app.caption || 'Company application';
    const applicationIcon = app.iconUrl
      ? `<img src="${escapeHtml(app.iconUrl)}" alt="" />`
      : `<span aria-hidden="true">${escapeHtml(initials(app.name))}</span>`;
    return `<article class="app-directory-card"><a href="${escapeHtml(app.url)}"${String(app.url).startsWith('http') ? ' target="_blank" rel="noreferrer"' : ''}><div class="app-directory-card-top"><span class="app-directory-icon">${applicationIcon}</span><span class="app-directory-launch">Open <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5"/></svg></span></div><div class="app-directory-card-copy"><p>${escapeHtml(caption)}</p><h2>${escapeHtml(app.name)}</h2></div></a></article>`;
  }).join('')}</div></section>` : '<p class="destination-empty">No applications are available yet.</p>';
}
const announcementPreview = value => { const text = String(value || ''); return text.length > 190 ? `${text.slice(0, 187).trimEnd()}…` : text; };
function announcementsPage(data) {
  const items = data.announcements || [];
  return items.length ? `<div class="destination-grid">${items.map((item, index) => {
    const timestamp = announcementTimestamp(item), author = item.postedBy || data.user?.name || 'Intranet team', department = item.department || 'All departments', audience = item.audience || 'All employees';
    const provenance = item.source?.type === 'group-email' ? `Sent from Email Account: <b>${escapeHtml(item.source.fromEmail)}</b>` : `Posted by <b>${escapeHtml(author)}</b>`;
    return `<article class="destination-item announcement-item"><div class="destination-meta"><span>${escapeHtml(item.tag || 'Company update')}</span><time${timestamp.iso ? ` datetime="${timestamp.iso}"` : ''}>${escapeHtml(timestamp.label)}</time></div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(announcementPreview(item.body))}</p><dl class="announcement-targeting"><div><dt>Department</dt><dd>${escapeHtml(department)}</dd></div><div><dt>Audience</dt><dd>${escapeHtml(audience)}</dd></div></dl><button class="announcement-details-button" type="button" data-announcement-details="${index}" aria-haspopup="dialog">View details</button><footer class="announcement-provenance"><span>${provenance}</span></footer></article>`;
  }).join('')}</div><dialog class="announcement-details-dialog" id="announcement-details-dialog" aria-labelledby="announcement-details-title"><div class="announcement-dialog-top"><div><p id="announcement-details-tag"></p><h2 id="announcement-details-title"></h2><time id="announcement-details-time"></time></div><button type="button" data-close-announcement-details aria-label="Close announcement details">×</button></div><div id="announcement-details-body"></div><p id="announcement-details-author"></p></dialog>` : '<p class="destination-empty">No announcements have been published yet.</p>';
}
function momentsPage(data) { return data.moments.length ? `<div class="destination-grid moment-page-grid">${data.moments.map(item => `${item.mediaUrl ? `<a class="moment-page-card" href="${escapeHtml(item.mediaUrl)}" target="_blank" rel="noreferrer" style="--moment:${escapeHtml(item.color)}"><img src="${escapeHtml(item.mediaUrl)}" alt="" />` : `<article class="moment-page-card" style="--moment:${escapeHtml(item.color)}">`}<b>${escapeHtml(item.kind)}</b><small>${escapeHtml(item.title)}</small>${item.mediaUrl ? '</a>' : '</article>'}`).join('')}</div>` : '<p class="destination-empty">No Moments have been shared yet.</p>'; }
function knowledgePage(data) { return `<div class="destination-grid">${data.sessions.slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(item => `<article class="destination-item"><div class="destination-meta"><span>${escapeHtml(item.category)}</span><span>${escapeHtml(item.date)}</span></div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.outline || 'Session details will be shared soon.')}</p><a class="destination-action" href="/#knowledge">Open in Knowledge Hub →</a></article>`).join('')}</div>`; }
function resourceLink(url, label) { const href = String(url || '').trim(); return /^(https?:\/\/|\/(?!\/)|#)/i.test(href) ? `<a class="knowledge-resource-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>` : '<span class="knowledge-resource-empty">—</span>'; }
function knowledgeTablePage(data) {
  const sessions = data.sessions.slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(session => ({ ...session, recordingUrl:resolvedKnowledgeResource(session.recordingUrl, session.recordingFilename, session.title), presentationDeckUrl:resolvedKnowledgeResource(session.presentationDeckUrl, session.presentationFilename, session.title), supportingMaterialsUrl:resolvedKnowledgeResource(session.supportingMaterialsUrl, session.supportingMaterialsFilename, session.title, true) }));
  const copy = data.knowledgePageContent || {};
  if (!sessions.length) return `<section class="knowledge-register" aria-labelledby="knowledge-register-title"><div class="knowledge-register-heading"><div><h2 id="knowledge-register-title">${escapeHtml(copy.libraryTitle || 'Session library')}</h2><p>${escapeHtml(copy.libraryText || 'Browse recordings, presentation decks and reference materials from Si-Ware experts.')}</p></div><span>0 sessions</span></div><p class="destination-empty">No knowledge sessions have been published yet.</p></section>`;
  return `<section class="knowledge-register" aria-labelledby="knowledge-register-title"><div class="knowledge-register-heading"><div><h2 id="knowledge-register-title">${escapeHtml(copy.libraryTitle || 'Session library')}</h2><p>${escapeHtml(copy.libraryText || 'Browse recordings, presentation decks and reference materials from Si-Ware experts.')}</p></div><span>${sessions.length} sessions</span></div><div class="knowledge-register-scroll"><table><thead><tr><th scope="col">Session</th><th scope="col">Speaker</th><th scope="col">Date</th><th scope="col">Outline</th><th scope="col">Recording</th><th scope="col">Presentation</th><th scope="col">Supporting materials</th></tr></thead><tbody>${sessions.map(item => { const presenter = item.presenter || {}; const initials = presenter.initials || String(presenter.name || '').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0,2).toUpperCase() || 'SW'; return `<tr><td><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category || 'General')}</small></td><td><span class="knowledge-speaker"><span aria-hidden="true">${escapeHtml(initials)}</span><span class="knowledge-speaker-name">${escapeHtml(presenter.name || 'Si-Ware team')}</span></span></td><td><time datetime="${escapeHtml(item.date)}">${escapeHtml(dateLabel(item.date))}</time></td><td><p title="${escapeHtml(item.outline || '')}">${escapeHtml(item.outline || '—')}</p></td><td>${resourceLink(item.recordingUrl, 'Watch')}</td><td>${resourceLink(item.presentationDeckUrl, 'Open')}</td><td>${resourceLink(item.supportingMaterialsUrl, 'Open')}</td></tr>`; }).join('')}</tbody></table></div></section>`;
}
function eventsPage(data) {
  if (!(data.events || []).length) return '<p class="destination-empty">No events have been published yet.</p>';
  return `<section class="events-standard" aria-label="Events calendar"><div class="events-standard-list" id="events-page-list" aria-live="polite"></div><aside class="events-standard-calendar" aria-label="Choose an events date"><div class="events-standard-calendar-head"><div><span>Selected date</span><b id="events-page-calendar-title"></b></div><button type="button" data-events-calendar-today>Today</button></div><div class="events-standard-month"><button type="button" data-events-calendar-previous aria-label="Previous month">‹</button><strong id="events-page-calendar-month"></strong><button type="button" data-events-calendar-next aria-label="Next month">›</button></div><label class="events-standard-picker">Choose date<input id="events-page-calendar-input" type="text" inputmode="numeric" autocomplete="off" placeholder="YYYY-MM-DD" pattern="\d{4}-\d{2}-\d{2}" aria-describedby="events-page-calendar-input-help" /><small id="events-page-calendar-input-help">Type YYYY-MM-DD</small></label><div class="events-standard-weekdays" aria-hidden="true"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div class="events-standard-days" id="events-page-calendar-days" role="grid" aria-label="Calendar"></div><p id="events-page-calendar-summary"></p></aside></section><dialog class="event-page-dialog" id="event-page-dialog" aria-labelledby="event-page-title"><div class="event-page-dialog-header"><div><p>Calendar event</p><h2 id="event-page-title"></h2></div><button class="icon-button" type="button" data-close-event-details aria-label="Close event details">×</button></div><dl class="event-page-detail-list"><div><dt>Date</dt><dd id="event-page-date"></dd></div><div><dt>Time</dt><dd id="event-page-time"></dd></div><div><dt>Location</dt><dd id="event-page-location"></dd></div></dl><section class="event-page-private-details" id="event-page-private-details" hidden><h3>Meeting details</h3><p id="event-page-description"></p><div id="event-page-links"></div><div id="event-page-attachments"></div></section><p id="event-page-access-note">Private meeting details are available only to invited guests.</p></dialog>`;
}
const cairoDateKey = value => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(value);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const calendarDate = key => { const [year, month, day] = String(key).split('-').map(Number); return new Date(year, month - 1, day, 12); };
const calendarDateLabel = key => new Intl.DateTimeFormat('en', { weekday:'short', month:'short', day:'numeric', year:'numeric' }).format(calendarDate(key));
const calendarMonthLabel = key => { const [year, month] = key.split('-').map(Number); return new Intl.DateTimeFormat('en', { month:'long', year:'numeric' }).format(new Date(year, month - 1, 1, 12)); };
const eventDateKey = (item, year) => {
  if (item.startsAt) { const date = new Date(item.startsAt); if (!Number.isNaN(date.valueOf())) return cairoDateKey(date); }
  const month = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(String(item.month || '').slice(0, 3).toUpperCase()), day = Number(item.day);
  return month >= 0 && day > 0 ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
};
function setupEventsCalendar(data) {
  const calendar = root?.querySelector('.events-standard-calendar'), list = root?.querySelector('#events-page-list');
  if (!calendar || !list) return;
  const events = data.events || [], today = cairoDateKey(new Date());
  let selected = today, month = selected.slice(0, 7);
  const matching = key => events.filter(item => eventDateKey(item, key.slice(0, 4)) === key);
  const select = key => { if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return; selected = key; month = key.slice(0, 7); render(); };
  const render = () => {
    const selectedEvents = matching(selected), primary = ['3rd Floor Meeting Room', 'Recreational Area Space'];
    const equalLocation = (item, location) => String(item.type || '').trim().toLowerCase() === location.toLowerCase();
    const groups = primary.map(location => ({ location, items:selectedEvents.filter(item => equalLocation(item, location)) })).filter(group => group.items.length);
    const other = selectedEvents.filter(item => !primary.some(location => equalLocation(item, location)));
    if (other.length) groups.push({ location:'Other locations', items:other });
    const eventCard = item => `<article class="events-standard-event event-page-open" data-event-index="${events.indexOf(item)}" data-event-id="${escapeHtml(item.id || '')}" tabindex="0" role="button" aria-label="View details for ${escapeHtml(item.title)}"><div><b>${escapeHtml(item.day)}</b><small>${escapeHtml(item.month)}</small></div><p><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.time)} · ${escapeHtml(item.type)}</span></p></article>`;
    list.innerHTML = `<header class="events-standard-day-heading"><b>Events on ${escapeHtml(calendarDateLabel(selected))}</b><span>${selectedEvents.length ? `${selectedEvents.length} scheduled` : 'No events scheduled'}</span></header>${groups.length ? groups.map(group => `<section class="events-standard-room"><header><b>${escapeHtml(group.location)}</b><span>${group.items.length} scheduled</span></header><div>${group.items.map(eventCard).join('')}</div></section>`).join('') : '<p class="events-standard-empty">There are no events scheduled for this date. Choose another date or month to review the calendar.</p>'}`;
    const [year, monthNumber] = month.split('-').map(Number), first = new Date(year, monthNumber - 1, 1, 12), start = new Date(year, monthNumber - 1, 1 - first.getDay(), 12), eventDays = new Set(events.map(item => eventDateKey(item, String(year))));
    calendar.querySelector('#events-page-calendar-title').textContent = calendarDateLabel(selected);
    calendar.querySelector('#events-page-calendar-month').textContent = calendarMonthLabel(month);
    calendar.querySelector('#events-page-calendar-input').value = selected;
    calendar.querySelector('#events-page-calendar-summary').textContent = selectedEvents.length ? `${selectedEvents.length} event${selectedEvents.length === 1 ? '' : 's'} on this date` : 'No events on this date';
    calendar.querySelector('#events-page-calendar-days').innerHTML = Array.from({ length:42 }, (_, index) => { const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12), key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, classes = [key.slice(0, 7) !== month ? 'is-outside' : '', key === today ? 'is-today' : '', key === selected ? 'is-selected' : '', eventDays.has(key) ? 'has-events' : ''].filter(Boolean); return `<button type="button" class="${classes.join(' ')}" data-events-calendar-date="${key}" aria-label="${escapeHtml(calendarDateLabel(key))}"${key === selected ? ' aria-selected="true"' : ''}>${date.getDate()}</button>`; }).join('');
  };
  calendar.addEventListener('click', event => { const date = event.target.closest('[data-events-calendar-date]'); if (date) return select(date.dataset.eventsCalendarDate); if (event.target.closest('[data-events-calendar-today]')) return select(today); const shift = event.target.closest('[data-events-calendar-previous]') ? -1 : event.target.closest('[data-events-calendar-next]') ? 1 : 0; if (shift) { const [year, currentMonth] = month.split('-').map(Number), next = new Date(year, currentMonth - 1 + shift, 1, 12); month = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`; render(); } });
  calendar.querySelector('#events-page-calendar-input').addEventListener('change', event => select(event.target.value));
  render();
}
function setupEventDetails(data) {
  const dialog = root?.querySelector('#event-page-dialog');
  if (!dialog) return;
  let participantContainer = dialog.querySelector('#event-page-participants');
  if (!participantContainer) { participantContainer = document.createElement('div'); participantContainer.id = 'event-page-participants'; dialog.querySelector('#event-page-attachments').after(participantContainer); }
  const events = data.events || [];
  const renderPrivate = details => {
    const section = dialog.querySelector('#event-page-private-details'), description = dialog.querySelector('#event-page-description'), links = dialog.querySelector('#event-page-links'), attachments = dialog.querySelector('#event-page-attachments'), note = dialog.querySelector('#event-page-access-note');
    section.hidden = !details?.authorised; description.textContent = ''; links.replaceChildren(); attachments.replaceChildren(); participantContainer.replaceChildren();
    if (!details?.authorised) { note.textContent = 'Private meeting details are available only to invited guests.'; return; }
    note.textContent = details.access === 'role' ? 'Private details are visible through your calendar-detail access.' : 'Private details are visible because you are invited to this event.';
    const appendLinkedText = (container, value) => {
      const source = String(value || ''), matcher = /https:\/\/[^\s<>"']+/gi;
      let cursor = 0, match;
      while ((match = matcher.exec(source))) {
        container.append(document.createTextNode(source.slice(cursor, match.index)));
        const link = document.createElement('a'); link.href = match[0]; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.className = 'event-page-description-link'; link.textContent = match[0]; container.append(link);
        cursor = match.index + match[0].length;
      }
      container.append(document.createTextNode(source.slice(cursor)));
    };
    appendLinkedText(description, details.description);
    const appendLinks = (container, items, title) => {
      if (!items?.length) return;
      const heading = document.createElement('h4'); heading.textContent = title; container.append(heading);
      const list = document.createElement('div'); list.className = `event-page-private-link-list${title === 'Join meeting' ? ' event-page-meeting-link-list' : ''}`;
      items.forEach(item => { const link = document.createElement('a'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = item.label || item.title || 'Open'; list.append(link); });
      container.append(list);
    };
    appendLinks(links, details.meetingLinks, 'Join meeting'); appendLinks(attachments, details.attachments, 'Attachments');
    if (details.organizer || details.invitees?.length) {
      const heading = document.createElement('h4'); heading.textContent = 'Meeting participants'; participantContainer.append(heading);
      const list = document.createElement('div'); list.className = 'event-page-participant-list';
      const appendPerson = (label, person) => { const row = document.createElement('p'), labelNode = document.createElement('b'), value = document.createElement('span'); labelNode.textContent = label; value.textContent = person.name === person.email ? person.email : `${person.name} · ${person.email}`; row.append(labelNode, value); list.append(row); };
      if (details.organizer) appendPerson('Organizer', details.organizer);
      details.invitees?.forEach(person => appendPerson('Guest', person));
      participantContainer.append(list);
    }
  };
  const show = async event => {
    const item = events[Number(event.currentTarget.dataset.eventIndex)];
    if (!item) return;
    const startsAt = item.startsAt ? new Date(item.startsAt) : null;
    const date = startsAt && !Number.isNaN(startsAt.valueOf()) ? new Intl.DateTimeFormat('en', { weekday:'long', month:'long', day:'numeric', year:'numeric', timeZone:'Africa/Cairo' }).format(startsAt) : `${item.month || ''} ${item.day || ''}`.trim() || 'Date to be confirmed';
    dialog.querySelector('#event-page-title').textContent = item.title || 'Calendar event';
    dialog.querySelector('#event-page-date').textContent = date;
    dialog.querySelector('#event-page-time').textContent = item.time || 'Time to be confirmed';
    dialog.querySelector('#event-page-location').textContent = item.type || 'Location to be confirmed';
    renderPrivate(null);
    dialog.showModal();
    if (!item.id) return;
    try { renderPrivate(await (await fetch(`/api/events/details?id=${encodeURIComponent(item.id)}`)).json()); }
    catch { dialog.querySelector('#event-page-access-note').textContent = 'Private meeting details are temporarily unavailable. Please try again.'; }
  };
  root.addEventListener('click', event => { const trigger = event.target.closest('[data-event-index]'); if (trigger) show({ currentTarget:trigger }); });
  root.addEventListener('keydown', event => { const trigger = event.target.closest('[data-event-index]'); if (trigger && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); show({ currentTarget:trigger }); } });
  dialog.querySelector('[data-close-event-details]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
const socialCardDefaults = links => [
  { id:'linkedin', title:'LinkedIn', url:links.linkedinUrl || 'https://www.linkedin.com/company/si-ware-systems/?locale=en_US', icon:'linkedin', actionLabel:'Visit channel' },
  { id:'facebook', title:'Facebook', url:links.facebookUrl || 'https://www.facebook.com/SiWareSystems/', icon:'facebook', actionLabel:'Visit channel' },
  { id:'youtube', title:'YouTube', url:links.youtubeUrl || 'https://www.youtube.com/@Si-Ware_Systems', icon:'youtube', actionLabel:'Visit channel' },
  { id:'website', title:'Si-Ware website', url:links.websiteUrl || 'https://www.si-ware.com', icon:'website', actionLabel:'Visit website' }
];
const socialIconMarkup = icon => ({
  linkedin:'<path d="M5.2 3.5A2.2 2.2 0 1 1 5.2 8a2.2 2.2 0 0 1 0-4.5ZM3.3 9.8h3.8V21H3.3V9.8Zm6.2 0h3.6v1.5h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6.1V21h-3.8v-5c0-1.2 0-2.9-1.8-2.9s-2.1 1.4-2.1 2.8V21H9.5V9.8Z"/>',
  facebook:'<path d="M13.8 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.6-1.5H17V3.9c-.4-.1-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1V10H8v3h2.6v8h3.2Z"/>',
  youtube:'<path d="M21.6 7.1a3 3 0 0 0-2.1-2.1C17.7 4.5 12 4.5 12 4.5S6.3 4.5 4.5 5a3 3 0 0 0-2.1 2.1C2 8.9 2 12 2 12s0 3.1.4 4.9a3 3 0 0 0 2.1 2.1c1.8.5 7.5.5 7.5.5s5.7 0 7.5-.5a3 3 0 0 0 2.1-2.1c.4-1.8.4-4.9.4-4.9s0-3.1-.4-4.9ZM10.2 15.1V8.9l5.4 3.1-5.4 3.1Z"/>',
  instagram:'<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
  x:'<path d="M5 4l14 16M19 4 5 20"/>',
  website:'<circle cx="12" cy="12" r="8.5"/><path d="M3.8 12h16.4M12 3.5c2.1 2.3 3.2 5.1 3.2 8.5S14.1 18.2 12 20.5c-2.1-2.3-3.2-5.1-3.2-8.5S9.9 5.8 12 3.5Z"/>',
  generic:'<path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 1 0 5 5l1-1"/>'
}[icon] || '<path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"/><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 1 0 5 5l1-1"/>');
function socialPage(data) { const links = data.socialLinks || {}, cards = Array.isArray(links.cards) && links.cards.length ? links.cards : socialCardDefaults(links); return `<div class="social-page-grid">${cards.map(card => { const icon = ['linkedin','facebook','youtube','website','instagram','x','generic'].includes(card.icon) ? card.icon : 'generic', href = safeSocialUrl(card.url, '#'), title = String(card.title || 'Social channel'), action = String(card.actionLabel || 'Visit channel'), iconMarkup = card.iconUrl ? `<img src="${escapeHtml(card.iconUrl)}" alt="" />` : `<svg viewBox="0 0 24 24">${socialIconMarkup(icon)}</svg>`; return `<a class="social-link social-link--${icon}" href="${escapeHtml(href)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(title)}"><span class="social-link-icon" aria-hidden="true">${iconMarkup}</span><b>${escapeHtml(title)}</b><strong>${escapeHtml(action)} <span aria-hidden="true">→</span></strong></a>`; }).join('')}<section class="youtube-latest" aria-labelledby="youtube-latest-title"><h2 id="youtube-latest-title">Latest from YouTube</h2><div id="youtube-page-list" class="youtube-list"><p class="destination-empty">Loading latest videos…</p></div></section></div>`; }
async function loadYouTube() { const list = document.querySelector('#youtube-page-list'); if (!list) return; try { const response = await fetch('/api/youtube/latest'); const data = await response.json(); if (!response.ok || data.unavailable || !data.videos?.length) throw new Error(); list.innerHTML = data.videos.slice(0,3).map(video => `<a href="${escapeHtml(video.watchUrl)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(video.thumbnailUrl)}" alt="" loading="lazy" /><span><b>${escapeHtml(video.title)}</b><small>${dateLabel(video.published)}</small></span></a>`).join(''); } catch { list.innerHTML = '<p class="destination-empty">Latest videos are temporarily unavailable. Visit the YouTube channel to watch new uploads.</p>'; } }
function setupAnnouncementDetails(data) {
  const dialog = root?.querySelector('#announcement-details-dialog');
  if (!dialog) return;
  const announcements = data.announcements || [], buttons = [...root.querySelectorAll('[data-announcement-details]')];
  const time = dialog.querySelector('#announcement-details-time'), authorLine = dialog.querySelector('#announcement-details-author');
  buttons.forEach(button => button.addEventListener('click', () => {
    const item = announcements[Number(button.dataset.announcementDetails)];
    if (!item) return;
    const timestamp = announcementTimestamp(item), author = item.postedBy || data.user?.name || 'Intranet team', body = dialog.querySelector('#announcement-details-body'), isVideo = /\.(mp4|webm|mov)(?:$|\?)/i.test(item.mediaUrl || ''), attachments = item.attachments || (item.attachmentUrl ? [{ url:item.attachmentUrl, filename:item.attachmentFilename || 'download file' }] : []);
    dialog.querySelector('#announcement-details-tag').textContent = `${item.tag || 'Company update'} · Department: ${item.department || 'All departments'} · Audience: ${item.audience || 'All employees'}`;
    dialog.querySelector('#announcement-details-title').textContent = item.title || 'Announcement';
    time.textContent = timestamp.label;
    authorLine.innerHTML = `<span>${item.source?.type === 'group-email' ? `Sent from Email Account: ${escapeHtml(item.source.fromEmail)}` : `Posted by ${escapeHtml(author)}`}</span>${attachments.length ? `<button class="announcement-attachment-indicator" type="button">${attachments.length} attachment${attachments.length === 1 ? '' : 's'} · View files ↓</button>` : ''}`;
    body.innerHTML = announcementBodyHtml(item);
    if (item.mediaUrl) body.insertAdjacentHTML('beforeend', isVideo ? `<video class="announcement-inline-media" controls preload="metadata" src="${escapeHtml(item.mediaUrl)}"></video>` : `<img class="announcement-inline-media" src="${escapeHtml(item.mediaUrl)}" alt="Announcement media" />`);
    if (attachments.length) body.insertAdjacentHTML('beforeend', `<div class="announcement-attachments">${attachments.map(file => `<a class="announcement-attachment" href="${escapeHtml(file.url)}" target="_blank" rel="noopener">Open attachment: ${escapeHtml(file.filename || 'download file')}</a>`).join('')}</div>`);
    authorLine.querySelector('.announcement-attachment-indicator')?.addEventListener('click', () => {
      const attachmentList = body.querySelector('.announcement-attachments');
      if (attachmentList) body.scrollTo({ top:Math.max(0, attachmentList.offsetTop - 12), behavior:'smooth' });
    });
    dialog.showModal();
  }));
  const requestedId = new URLSearchParams(location.search).get('announcement'), requestedIndex = announcements.findIndex(item => String(item.id) === requestedId);
  if (requestedIndex >= 0) buttons[requestedIndex]?.click();
  dialog.querySelector('[data-close-announcement-details]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
function safeSocialUrl(value, fallback) { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : fallback; } catch { return fallback; } }
function applySocialLinks(data) { const links = { linkedinUrl:'https://www.linkedin.com/company/si-ware-systems/?locale=en_US', facebookUrl:'https://www.facebook.com/SiWareSystems/', youtubeUrl:'https://www.youtube.com/@Si-Ware_Systems', websiteUrl:'https://www.si-ware.com', ...(data.socialLinks || {}) }; const targets = [['.social-link--linkedin', links.linkedinUrl, 'https://www.linkedin.com/company/si-ware-systems/?locale=en_US'], ['.social-link--facebook', links.facebookUrl, 'https://www.facebook.com/SiWareSystems/'], ['.social-link--youtube', links.youtubeUrl, 'https://www.youtube.com/@Si-Ware_Systems'], ['.social-link--website', links.websiteUrl, 'https://www.si-ware.com']]; targets.forEach(([selector, value, fallback]) => { const link = root?.querySelector(selector); if (link) link.href = safeSocialUrl(value, fallback); }); }
async function render() { if (!root || !config) return; root.innerHTML = `${intro()}<section class="destination-content" aria-live="polite"><p class="destination-empty">Loading…</p></section>`; try { const response = await fetch('/api/dashboard'); if (!response.ok) throw new Error(); const data = await response.json(); if (key === 'moments' || key === 'knowledge' || key === 'events') { const copy = key === 'moments' ? data.momentsPageContent || {} : key === 'knowledge' ? data.knowledgePageContent || {} : data.eventsPageContent || {}; root.querySelector('.destination-intro h1').textContent = copy.title || config.title; root.querySelector('.destination-intro p').textContent = copy.intro || config.intro; } const content = key === 'apps' ? appPage(data) : key === 'announcements' ? announcementsPage(data) : key === 'moments' ? momentsPage(data) : key === 'knowledge' ? knowledgePage(data) : key === 'events' ? eventsPage(data) : socialPage(data); root.querySelector('.destination-content').innerHTML = content; root.dataset.dashboardReady = 'true'; if (key === 'announcements') setupAnnouncementDetails(data); if (key === 'events') { setupEventsCalendar(data); setupEventDetails(data); } if (key === 'social') loadYouTube(); } catch { root.querySelector('.destination-content').innerHTML = '<p class="destination-empty">This page is temporarily unavailable. Refresh to try again.</p>'; } }
function setupKnowledgeFilters() {
  const register = root?.querySelector('.knowledge-register'), body = register?.querySelector('tbody');
  if (!register || !body) return;
  const pageSize = 10;
  let currentPage = 1;
  const rows = Array.from(body.rows).map(row => ({ row, title:row.cells[0]?.querySelector('strong')?.textContent.trim() || '', speaker:row.cells[1]?.querySelector('.knowledge-speaker-name')?.textContent.trim() || '', date:row.cells[2]?.querySelector('time')?.dateTime || '' }));
  const optionList = (values, label) => [`<option value="">All ${label}</option>`, ...values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)].join('');
  const sessions = [...new Set(rows.map(item => item.title))], speakers = [...new Set(rows.map(item => item.speaker))].sort((a,b) => a.localeCompare(b));
  register.querySelector('.knowledge-register-heading').insertAdjacentHTML('afterend', `<form class="knowledge-filter-bar" aria-label="Find knowledge sessions"><label class="knowledge-filter-search"><span>Search</span><input type="search" data-knowledge-search placeholder="Search sessions, speakers or subjects" autocomplete="off" /></label><label><span>Session</span><select data-knowledge-session>${optionList(sessions, 'sessions')}</select></label><label><span>Speaker</span><select data-knowledge-speaker>${optionList(speakers, 'speakers')}</select></label><label><span>Sort by date</span><select data-knowledge-sort><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><button type="button" data-knowledge-clear>Clear filters</button><output data-knowledge-count>${rows.length} sessions</output></form>`);
  register.querySelector('.knowledge-register-scroll').insertAdjacentHTML('afterend', `<nav class="knowledge-pagination" aria-label="Knowledge session pages"><output data-knowledge-page-status></output><span><button type="button" data-knowledge-previous>Previous</button><span data-knowledge-page-number></span><button type="button" data-knowledge-next>Next</button></span></nav>`);
  const controls = { search:register.querySelector('[data-knowledge-search]'), session:register.querySelector('[data-knowledge-session]'), speaker:register.querySelector('[data-knowledge-speaker]'), sort:register.querySelector('[data-knowledge-sort]'), count:register.querySelector('[data-knowledge-count]'), pagination:register.querySelector('.knowledge-pagination'), pageStatus:register.querySelector('[data-knowledge-page-status]'), pageNumber:register.querySelector('[data-knowledge-page-number]'), previous:register.querySelector('[data-knowledge-previous]'), next:register.querySelector('[data-knowledge-next]') };
  const matchingRows = () => { const term = controls.search.value.trim().toLowerCase(); return rows.filter(item => { const haystack = `${item.title} ${item.speaker} ${item.date}`.toLowerCase(); return (!term || haystack.includes(term)) && (!controls.session.value || item.title === controls.session.value) && (!controls.speaker.value || item.speaker === controls.speaker.value); }); };
  const sortedRows = rowsToSort => rowsToSort.slice().sort((a,b) => controls.sort.value === 'oldest' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const apply = (resetPage = false) => { const matching = sortedRows(matchingRows()); if (resetPage) currentPage = 1; const pageCount = Math.max(1, Math.ceil(matching.length / pageSize)); currentPage = Math.min(currentPage, pageCount); matching.forEach(item => body.append(item.row)); const visibleRows = new Set(matching.slice((currentPage - 1) * pageSize, currentPage * pageSize)); rows.forEach(item => { item.row.hidden = !visibleRows.has(item); }); const first = matching.length ? (currentPage - 1) * pageSize + 1 : 0, last = Math.min(currentPage * pageSize, matching.length); controls.count.textContent = `${matching.length} ${matching.length === 1 ? 'session' : 'sessions'}`; controls.pagination.hidden = matching.length <= pageSize; controls.pageStatus.textContent = matching.length ? `Showing ${first}–${last} of ${matching.length} sessions` : 'No sessions found'; controls.pageNumber.textContent = `Page ${currentPage} of ${pageCount}`; controls.previous.disabled = currentPage === 1; controls.next.disabled = currentPage === pageCount; };
  [controls.search, controls.session, controls.speaker, controls.sort].forEach(control => control.addEventListener(control === controls.search ? 'input' : 'change', () => apply(true)));
  controls.previous.addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; apply(); } });
  controls.next.addEventListener('click', () => { const total = matchingRows().length; if (currentPage < Math.ceil(total / pageSize)) { currentPage += 1; apply(); } });
  register.querySelector('[data-knowledge-clear]').addEventListener('click', () => { controls.search.value = ''; controls.session.value = ''; controls.speaker.value = ''; apply(true); controls.search.focus(); });
  apply(true);
}
if (key === 'knowledge') knowledgePage = knowledgeTablePage;
const employeeAnnouncementPage = announcementsPage;
announcementsPage = data => { data.announcements = (data.announcements || []).filter(item => item.hidden !== true && item.hidden !== 'true'); return employeeAnnouncementPage(data); };
render().then(() => { if (key === 'knowledge') setupKnowledgeFilters(); });
