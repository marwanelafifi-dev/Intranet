import { pageDataKeys, editablePageViews, pageSnapshot, applyPageSnapshot, pageChanged } from './admin-page-tools.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let dashboard, summary, savedDashboard, activityPage = 1, auditCategory = 'audit', canEditContent = false, pageToolBusy = false;
const pageHistory = Object.fromEntries(editablePageViews.map(view => [view, { undo:[], redo:[] }]));
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const cairo = value => value ? new Intl.DateTimeFormat('en', { dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Cairo' }).format(new Date(value)) : '—';
async function api(path, options = {}) { const response = await fetch(path, { credentials:'same-origin', headers:{ 'content-type':'application/json', ...(options.headers || {}) }, ...options }); const type = response.headers.get('content-type') || ''; const payload = type.includes('json') ? await response.json() : await response.text(); if (!response.ok) throw new Error(payload.error || 'The request could not be completed.'); return payload; }
const appIconImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const announcementMediaTypes = [...appIconImageTypes, 'video/mp4', 'video/webm', 'video/quicktime'];
const announcementAttachmentTypes = ['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'];
const knowledgeDeckTypes = ['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
const knowledgeRecordingTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
const knowledgeMaterialTypes = [...announcementAttachmentTypes, ...appIconImageTypes];
const momentMediaTypes = [...appIconImageTypes, 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
function readImageFile(file) { if (!file?.name) return Promise.resolve(''); if (!appIconImageTypes.includes(file.type)) return Promise.reject(new Error('Choose a PNG, JPEG, WebP, or GIF image.')); if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error('App icon images must be 2 MB or smaller.')); return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The app icon image could not be read.')); reader.readAsDataURL(file); }); }
async function uploadAppIcon(file) { const dataUrl = await readImageFile(file); if (!dataUrl) return ''; return (await api('/api/uploads', { method:'POST', body:JSON.stringify({ dataUrl, filename:file.name }) })).url; }
function readAnnouncementFile(file, accepted, label) { if (!file?.name) return Promise.resolve(''); if (!accepted.includes(file.type)) return Promise.reject(new Error(`Choose a supported ${label} file.`)); if (file.size > 45 * 1024 * 1024) return Promise.reject(new Error(`${label} files must be 45 MB or smaller.`)); return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error(`The ${label.toLowerCase()} file could not be read.`)); reader.readAsDataURL(file); }); }
async function uploadAnnouncementFile(file, accepted, label) { const dataUrl = await readAnnouncementFile(file, accepted, label); if (!dataUrl) return ''; return (await api('/api/uploads', { method:'POST', body:JSON.stringify({ dataUrl, filename:file.name }) })).url; }
function normalisePolicyUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, location.origin);
    if (!['http:', 'https:'].includes(parsed.protocol) || (!raw.startsWith('/') && !/^https?:\/\//i.test(raw))) throw new Error();
    return raw.startsWith('/') ? `${parsed.pathname}${parsed.search}${parsed.hash}` : parsed.href;
  } catch { throw new Error('Enter a full HTTPS/HTTP policy URL or a site path beginning with /.'); }
}
function savedFilename(record) { return record.iconFilename || decodeURIComponent(String(record.iconUrl || '').split('/').pop() || 'image'); }
function existingAnnouncementAttachments(attachments) { return attachments.length ? `<div class="existing-attachment-list" data-existing-attachments>${attachments.map(file => `<div class="existing-attachment-item"><a href="${escapeHtml(file.url)}" target="_blank" rel="noopener">${escapeHtml(file.filename || savedFilename({ iconUrl:file.url }))}</a><button class="tool-button danger-link" type="button" data-remove-existing-attachment="${escapeHtml(file.url)}">Remove</button></div>`).join('')}</div>` : ''; }
function isLegacyAnnouncementTemplate(record) { return /<(?:html|head|body|table|style)\b/i.test(String(record.bodyHtml || '')); }
function editableAnnouncementHtml(record) { const html = String(record.bodyHtml || ''); if (!isLegacyAnnouncementTemplate(record)) return html || escapeHtml(record.body || ''); const templateBody = new DOMParser().parseFromString(html, 'text/html').body?.innerHTML; return templateBody || escapeHtml(record.body || ''); }
function flash(message, duration = 4500) { const status = $('#flash'); status.textContent = message; window.clearTimeout(flash.timeout); flash.timeout = window.setTimeout(() => { status.textContent = ''; }, duration); }
function editorLink(label = 'Open editor') { return `<button class="action-button" type="button" data-goto="content">${label}</button>`; }
function list(items, render) { return items?.length ? `<div class="list">${items.map(render).join('')}</div>` : '<p class="empty">No records yet.</p>'; }
function renderOverview() {
  const counts = summary.counts;
  $('#view-overview').innerHTML = `<p class="view-intro">A controlled workspace for the content, people, applications, presentation, and access rules employees rely on. Changes are saved centrally and reviewed through the audit trail.</p><div class="metrics"><article class="metric"><b>${counts.announcements}</b><span>Published announcements</span></article><article class="metric"><b>${counts.people}</b><span>Recently joined colleagues</span></article><article class="metric"><b>${counts.apps}</b><span>Quick-launch applications</span></article><article class="metric"><b>${counts.media}</b><span>Reusable media files</span></article></div><div class="section-grid"><article class="panel"><h2>Recent administrative changes</h2>${list(summary.audit, event => `<div class="list-row"><span><b>${escapeHtml(event.action || 'Administrative change')}</b><small>${escapeHtml(event.actor?.name || 'System')} · ${cairo(event.occurredAt)}</small></span><span class="record-tag">${escapeHtml(event.outcome || 'success')}</span></div>`)}</article><article class="panel"><h2>Work from the right place</h2><p>Use the focused editors to protect employee-facing records from accidental structural changes.</p><div class="list"><div class="list-row"><span><b>Editorial content</b><small>Announcements, knowledge, moments, policies</small></span>${editorLink()}</div><div class="list-row"><span><b>Presentation &amp; navigation</b><small>Section order and shared layout visibility</small></span>${editorLink()}</div><div class="list-row"><span><b>Governance</b><small>Permissions, audit history and retention</small></span><button class="action-button" data-goto="access">Review access</button></div></div></article></div>`;
}
function renderManage(id, title, description, rows) { $(id).innerHTML = `<p class="view-intro">${description}</p><article class="panel">${rows.map(row => `<div class="manage-row"><div><h2>${escapeHtml(row.title)}</h2><p>${escapeHtml(row.description)}</p></div>${editorLink(row.label || 'Manage')}</div>`).join('')}</article>`; }
const editableCollections = {
  announcements: { title:'Announcements', description:'Create, edit, archive, and publish employee updates.', fields:[['title','Title'],['tag','Category'],['department','Department'],['audience','Audience'],['date','Display date']] },
  sessions: { title:'Knowledge Hub sessions', description:'Keep session details, presenters, and learning resources current.', fields:[['title','Title'],['category','Category'],['date','Date'],['outline','Outline','textarea']] },
  moments: { title:'Moments', description:'Manage the moments displayed across the intranet.', fields:[['title','Title'],['kind','Label'],['color','Accent colour','color']] },
  events: { title:'Events & key dates', description:'Maintain the employee events calendar and important company dates.', fields:[['day','Day'],['month','Month'],['title','Title'],['time','Time'],['type','Type']] },
  policies: { title:'Policies', description:'Manage employee-facing policy metadata and ownership.', fields:[['title','Title'],['summary','Summary','textarea'],['owner','Owner'],['department','Department'],['audience','Audience'],['version','Version']] },
  newMembers: { title:'Recently Joined', description:'This is display content only and never grants authentication access.', fields:[['name','Name'],['role','Role'],['employmentType','Employment type'],['department','Department'],['division','Division'],['directManager','Direct manager'],['joined','Joined']] },
  firstWeekChecklist: { title:'New Si-Warians first-week checklist', description:'Manage the onboarding tasks shown on the New Si-Warians page.', fields:[['text','Task','textarea'],['resourceLabel','Resource label'],['resourceUrl','Resource link'],['attachmentLabel','Attachment label']] },
  apps: { title:'Quick Launch apps', description:'Manage employee application destinations and their descriptions.', fields:[['name','Name'],['caption','Description'],['url','URL'],['color','Accent colour','color']] },
  supportPortals: { title:'Support portals', description:'Manage approved employee support destinations.', fields:[['name','Name'],['description','Description','textarea'],['url','URL']] }
};
let editingRecord = {};
function recordLabel(key, record) { return record.title || record.name || record.text || record.id; }
function recordFields(key, record = {}) {
  const fields = editableCollections[key].fields.map(([name, label, type = 'text']) => `<label>${label}${type === 'textarea' ? `<textarea name="${name}" rows="3" maxlength="5000">${escapeHtml(record[name] || '')}</textarea>` : `<input name="${name}" ${type === 'color' ? 'type="color"' : ''} required value="${escapeHtml(record[name] || (type === 'color' ? '#0758a9' : ''))}" />`}</label>`).join('');
  if (key === 'apps' || key === 'supportPortals') { const label = key === 'apps' ? 'App icon image' : 'Portal icon image'; return `${fields}<label>${label}<input name="iconImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /><small>${record.iconUrl ? `Current image: <b>${escapeHtml(savedFilename(record))}</b> · <a href="${escapeHtml(record.iconUrl)}" target="_blank" rel="noopener">Open image</a>. Choose a new image to replace it.` : 'Optional PNG, JPEG, WebP, or GIF. Maximum 2 MB.'}</small></label>`; }
  if (key === 'policies') { const documentUrl = String(record.canonicalUrl || ''); const uploadedPdf = /^\/uploads\/.*\.pdf(?:$|\?)/i.test(documentUrl); return `${fields}<label>Policy document URL<input name="canonicalUrl" type="text" inputmode="url" value="${escapeHtml(documentUrl)}" placeholder="https://… or /uploads/policy.pdf" /><small>Paste the approved policy link, or upload a PDF below. An uploaded PDF takes priority over this URL.</small></label><label>Upload policy PDF<input name="policyDocument" type="file" accept=".pdf,application/pdf" /><small data-policy-document-status>${uploadedPdf ? `Current PDF: <b>${escapeHtml(savedFilename({ iconUrl:documentUrl }))}</b> · <a href="${escapeHtml(documentUrl)}" target="_blank" rel="noopener">Open</a> · <button class="tool-button danger-link" type="button" data-remove-policy-document>Remove current PDF</button>. Choose a new file to replace it.` : documentUrl ? `Current linked policy: <a href="${escapeHtml(documentUrl)}" target="_blank" rel="noopener">Open link</a>. Upload a PDF to replace it.` : 'Optional PDF upload. Maximum 45 MB.'}</small></label>`; }
  if (key !== 'announcements') return fields;
  const attachments = record.attachments || (record.attachmentUrl ? [{ url:record.attachmentUrl, filename:record.attachmentFilename || savedFilename({ iconUrl:record.attachmentUrl }) }] : []);
  return `${fields}<label>Announcement text<div class="rich-editor"><div class="rich-toolbar" role="toolbar" aria-label="Text formatting"><button type="button" data-rich-command="bold" title="Bold"><b>B</b></button><button type="button" data-rich-command="italic" title="Italic"><i>I</i></button><button type="button" data-rich-command="underline" title="Underline"><u>U</u></button><button type="button" data-rich-command="insertUnorderedList" title="Bulleted list">• List</button><button type="button" data-rich-command="insertOrderedList" title="Numbered list">1. List</button><select data-rich-command="formatBlock" aria-label="Text style"><option value="p">Paragraph</option><option value="h2">Heading</option><option value="h3">Subheading</option></select><select data-rich-command="fontName" aria-label="Font family"><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Trebuchet MS">Trebuchet</option></select><select data-rich-command="fontSize" aria-label="Text size"><option value="3">Normal</option><option value="4">Large</option><option value="5">Extra large</option></select><input data-rich-command="foreColor" type="color" aria-label="Text color" value="#173a78" /></div><div class="rich-editor-surface" contenteditable="true" data-rich-editor aria-label="Announcement text">${editableAnnouncementHtml(record)}</div></div><small>Use the toolbar to format text. Employee-facing formatting is limited to safe text styles.</small></label><label>Inline photo or video<input name="announcementMedia" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" /><small>${record.mediaUrl ? `Current media: <b>${escapeHtml(record.mediaFilename || savedFilename({ iconUrl:record.mediaUrl }))}</b>. Choose a new file to replace it.` : 'Optional image or video shown inside the full announcement. Maximum 45 MB.'}</small></label><label>Attachments<input name="announcementAttachment" type="file" multiple accept="application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" />${existingAnnouncementAttachments(attachments)}<small>${attachments.length ? 'Remove saved files individually below. New files are added when you save.' : 'Select one or more PDF, Office document, spreadsheet, or text files. Maximum 45 MB each.'}</small></label>`;
}
function renderCollection(key) {
  const config = editableCollections[key], selected = editingRecord[key], record = dashboard[key]?.find(item => item.id === selected);
  const isPeople = key === 'newMembers';
  const isSessions = key === 'sessions';
  const isApps = key === 'apps';
  const csvImport = isPeople ? { input:'new-members-csv', template:'/recently-joined-import-template.csv', filename:'recently-joined-import-template.csv', action:'data-import-new-members', label:'Import CSV' } : isSessions ? { input:'knowledge-sessions-csv', template:'/knowledge-hub-sessions-import-template.csv', filename:'knowledge-hub-sessions-import-template.csv', action:'data-import-knowledge-sessions', label:'Import CSV' } : null;
  const headingActions = '';
  const csvHelp = isPeople ? '<p class="csv-import-help">Import a CSV to add or update employee cards. Required: <b>Name</b>. Supported columns: Role, Employment Type, Department, Division, Direct Manager, Joined, Company Email, Phone, LinkedIn URL, Welcome Message, and Photo URL.</p>' : isSessions ? '<p class="csv-import-help">Import CSV or tab-separated text. Required: <b>Title and Date</b>. A blank Category becomes General; a blank Presenter is marked for review. Resource links work immediately. Filenames are retained and linked only when a matching resource is known—otherwise upload or add a URL in the session editor.</p>' : '';
  return `<article class="panel collection-panel${isApps ? ' collection-panel--apps' : ''}" data-collection="${key}"><div class="collection-heading"><div><h2>${config.title}</h2><p>${config.description}</p></div>${headingActions}</div>${csvHelp}<div class="collection-layout"><div class="list">${(dashboard[key] || []).map(item => { const details = key === 'policies' ? [item.category, item.department].filter(Boolean).join(' · ') : item.category || item.caption || item.role || item.audience || item.description || ''; const visual = isApps ? (item.iconUrl ? `<img class="app-icon-preview" src="${escapeHtml(item.iconUrl)}" alt="" />` : `<span class="app-list-mark" aria-hidden="true">${escapeHtml(String(item.name || '?').trim().slice(0, 1).toUpperCase())}</span>`) : ['apps','supportPortals'].includes(key) && item.iconUrl ? `<img class="app-icon-preview" src="${escapeHtml(item.iconUrl)}" alt="" />` : ''; return `<div class="list-row${isApps ? ' app-list-row' : ''}">${isApps ? `<span class="app-list-content">${visual}<span><b>${escapeHtml(recordLabel(key, item))}</b><small>${escapeHtml(details)}</small></span></span>` : `${visual}<span><b>${escapeHtml(recordLabel(key, item))}</b><small>${escapeHtml(details)}</small></span>`}<div class="row-actions"><button class="tool-button" type="button" data-edit-record="${key}:${item.id}">Edit</button><button class="tool-button danger-link" type="button" data-remove-record="${key}:${item.id}">Remove</button></div></div>`; }).join('') || '<p class="empty">No records yet.</p>'}</div><form class="inline-editor${isApps ? ' app-editor' : ''}" data-editor="${key}"><h3>${record ? `Edit ${escapeHtml(recordLabel(key, record))}` : isApps ? 'Create Quick Launch app' : `New ${config.title.slice(0, -1)}`}</h3>${recordFields(key, record)}<div class="form-actions"><button class="action-button danger" type="button" data-remove-record="${key}:${record?.id || ''}" ${record ? '' : 'hidden'}>Remove</button><button class="action-button primary">Save changes</button></div></form></div></article>`;
}
function parseCsv(text) {
  const rows = [], row = [], value = [];
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  const header = source.split(/\r?\n/, 1)[0];
  const delimiter = header.includes('\t') && header.split('\t').length > header.split(',').length ? '\t' : ',';
  const commitValue = () => { row.push(value.join('')); value.length = 0; };
  const commitRow = () => { commitValue(); if (row.some(cell => cell.trim())) rows.push(row.splice(0)); else row.length = 0; };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') { if (quoted && source[index + 1] === '"') { value.push('"'); index += 1; } else quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { commitValue(); continue; }
    if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && source[index + 1] === '\n') index += 1; commitRow(); continue; }
    value.push(char);
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  if (value.length || row.length) commitRow();
  return rows;
}
function csvKey(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function csvValue(row, columns, aliases) { const index = aliases.map(alias => columns.get(csvKey(alias))).find(value => value !== undefined); return index === undefined ? '' : String(row[index] || '').trim(); }
function csvMemberRecord(row, columns, existing, index) {
  const name = csvValue(row, columns, ['name', 'full name', 'employee name']);
  if (!name) throw new Error(`Row ${index + 2} needs a Name.`);
  const linkedinInput = csvValue(row, columns, ['linkedin url', 'linkedin', 'linkedin profile']);
  const linkedinUrl = linkedinInput ? safeLinkedInUrl(linkedinInput) : (existing?.linkedinUrl || '');
  if (linkedinUrl === null) throw new Error(`Row ${index + 2} has an invalid LinkedIn URL.`);
  const department = csvValue(row, columns, ['department']) || existing?.department || 'To be confirmed';
  const photoUrl = csvValue(row, columns, ['photo url', 'photo', 'image url']) || existing?.photoUrl || '';
  return {
    ...(existing || { id:`member-${Date.now()}-${index}`, color:'#dceeff' }),
    name,
    role:csvValue(row, columns, ['role', 'job title', 'title']) || existing?.role || 'To be confirmed',
    employmentType:csvValue(row, columns, ['employment type', 'employment', 'type']) || existing?.employmentType || 'Full Time',
    department,
    division:csvValue(row, columns, ['division']) || existing?.division || 'To be confirmed',
    directManager:csvValue(row, columns, ['direct manager', 'manager']) || existing?.directManager || 'To be confirmed',
    joined:csvValue(row, columns, ['joined', 'join date', 'start date']) || existing?.joined || 'To be confirmed',
    companyEmail:csvValue(row, columns, ['company email', 'work email', 'email']) || existing?.companyEmail || '',
    phone:csvValue(row, columns, ['phone', 'phone number', 'mobile']) || existing?.phone || '',
    linkedinUrl,
    message:csvValue(row, columns, ['welcome message', 'message', 'intro']) || existing?.message || '',
    photoUrl,
    photoFilename:csvValue(row, columns, ['photo filename', 'image filename']) || existing?.photoFilename || '',
    team:department,
    initials:name.split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase()
  };
}
async function importNewMembersCsv(file) {
  if (!file?.name) return;
  if (!/\.csv$/i.test(file.name) || file.size > 2 * 1024 * 1024) { flash('Choose a CSV file that is 2 MB or smaller.'); return; }
  const rows = parseCsv(await file.text());
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one employee.');
  if (rows.length > 501) throw new Error('Import up to 500 employees at a time.');
  const columns = new Map(rows[0].map((header, index) => [csvKey(header), index]));
  if (csvValue(rows[0], columns, ['name', 'full name', 'employee name']) === '' && !columns.has('name') && !columns.has('fullname') && !columns.has('employeename')) throw new Error('The CSV must include a Name column.');
  const known = [...dashboard.newMembers], created = [];
  let updated = 0;
  rows.slice(1).forEach((row, index) => {
    const email = csvValue(row, columns, ['company email', 'work email', 'email']).toLowerCase();
    const name = csvValue(row, columns, ['name', 'full name', 'employee name']).toLowerCase();
    const existing = known.find(member => (email && String(member.companyEmail || '').toLowerCase() === email) || (name && String(member.name || '').toLowerCase() === name));
    const member = csvMemberRecord(row, columns, existing, index);
    if (existing) { Object.assign(existing, member); updated += 1; } else { known.push(member); created.push(member); }
  });
  dashboard.newMembers.unshift(...created);
  await saveDashboard(`CSV imported: ${created.length} added and ${updated} updated.`);
}
function normaliseKnowledgeCsvDate(value) {
  const input = String(value || '').trim();
  const longDate = input.match(/^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  if (longDate) {
    const month = monthNames.indexOf(longDate[1].toLowerCase()) + 1;
    if (!month) return '';
    const year = Number(longDate[3]), day = Number(longDate[2]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [year, month, day] = input.split('-').map(Number), date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day ? input : '';
  }
  return '';
}
function knowledgeSessionName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
function duplicateKnowledgeSession(title, excludeId = '') {
  const name = knowledgeSessionName(title);
  return dashboard.sessions.find(session => session.id !== excludeId && knowledgeSessionName(session.title) === name);
}
function normaliseKnowledgeCsvRow(row, columns) {
  const categoryIndex = columns.get('category'), dateIndex = columns.get('date');
  if (categoryIndex === undefined || dateIndex === undefined) return row;
  if (!normaliseKnowledgeCsvDate(row[categoryIndex]) || normaliseKnowledgeCsvDate(row[dateIndex])) return row;
  const aligned = row.slice();
  aligned.splice(categoryIndex, 0, '');
  return aligned;
}
function csvKnowledgeResource(value, existingUrl, existingFilename, label, rowNumber, summary) {
  const source = String(value || '').trim();
  if (!source) return { url:existingUrl || '', filename:existingFilename || '' };
  const url = safeKnowledgeAdminLink(source);
  if (url !== null) return { url, filename:'' };
  if (/^(?:\/\/|[a-z][a-z0-9+.-]*:\/\/|(?:javascript|data|file|mailto):|[a-z]:\\)/i.test(source)) {
    throw new Error(`Row ${rowNumber}, ${label}: “${source.slice(0, 70)}” is not a supported link. Use an HTTPS URL, intranet path, or a filename.`);
  }
  summary.filenameReferences += 1;
  return { url:'', filename:source };
}
function csvSessionRecord(sourceRow, columns, existing, index, summary) {
  const row = normaliseKnowledgeCsvRow(sourceRow, columns);
  const title = csvValue(row, columns, ['title', 'session title']);
  const presenterInput = csvValue(row, columns, ['presenter', 'presenter name']);
  const dateInput = csvValue(row, columns, ['date', 'session date']);
  if (!title) throw new Error(`Row ${index + 2} needs a Title.`);
  const date = normaliseKnowledgeCsvDate(dateInput);
  if (!date) throw new Error(`Row ${index + 2}, Date: “${dateInput.slice(0, 70)}” is not a valid date. Use YYYY-MM-DD or a full month name.`);
  const presenterName = presenterInput || 'Presenter not specified';
  if (!presenterInput) summary.missingPresenters += 1;
  const presentation = csvKnowledgeResource(csvValue(row, columns, ['presentation deck url', 'presentation url', 'deck url']), existing?.presentationDeckUrl, existing?.presentationFilename, 'Presentation Deck URL', index + 2, summary);
  const recording = csvKnowledgeResource(csvValue(row, columns, ['recording url', 'session recording url']), existing?.recordingUrl, existing?.recordingFilename, 'Recording URL', index + 2, summary);
  const materials = csvKnowledgeResource(csvValue(row, columns, ['supporting materials url', 'materials url', 'resources url']), existing?.supportingMaterialsUrl, existing?.supportingMaterialsFilename, 'Supporting Materials URL', index + 2, summary);
  return {
    ...(existing || { id:`session-${Date.now()}-${index}` }),
    title,
    presenter:{ name:presenterName, initials:presenterName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() },
    category:csvValue(row, columns, ['category']) || existing?.category || 'General',
    date,
    outline:csvValue(row, columns, ['outline', 'description', 'summary']) || existing?.outline || '',
    presentationDeckUrl:presentation.url,
    presentationFilename:presentation.filename,
    recordingUrl:recording.url,
    recordingFilename:recording.filename,
    supportingMaterialsUrl:materials.url,
    supportingMaterialsFilename:materials.filename
  };
}
async function importKnowledgeSessionsCsv(file) {
  if (!file?.name) return;
  if (!/\.(csv|tsv|txt)$/i.test(file.name) || file.size > 2 * 1024 * 1024) { flash('Choose a CSV or tab-separated text file that is 2 MB or smaller.'); return; }
  const rows = parseCsv(await file.text());
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one session.');
  if (rows.length > 501) throw new Error('Import up to 500 sessions at a time.');
  const columns = new Map(rows[0].map((header, index) => [csvKey(header), index]));
  if (!columns.has('title') && !columns.has('sessiontitle')) throw new Error('The CSV must include a Title column.');
  const knownNames = new Set(dashboard.sessions.map(session => knowledgeSessionName(session.title))), created = [], summary = { filenameReferences:0, missingPresenters:0 };
  let skipped = 0;
  rows.slice(1).forEach((row, index) => {
    const title = csvValue(normaliseKnowledgeCsvRow(row, columns), columns, ['title', 'session title']);
    if (!title) throw new Error(`Row ${index + 2} needs a Title.`);
    const name = knowledgeSessionName(title);
    if (knownNames.has(name)) { skipped += 1; return; }
    const session = csvSessionRecord(row, columns, null, index, summary);
    knownNames.add(name);
    created.push(session);
  });
  const duplicateNote = `${skipped} duplicate${skipped === 1 ? '' : 's'} skipped (same session name).`;
  if (!created.length) { flash(`No sessions added. ${duplicateNote}`, 12000); return; }
  const previousSessions = dashboard.sessions;
  dashboard.sessions = [...created, ...dashboard.sessions];
  const notes = [summary.filenameReferences ? `${summary.filenameReferences} filename reference(s) retained; links appear only where a matching resource is known.` : '', summary.missingPresenters ? `${summary.missingPresenters} missing presenter(s) marked for review.` : ''].filter(Boolean).join(' ');
  const message = `Knowledge Hub imported: ${created.length} added. ${duplicateNote} ${notes}`;
  try { await saveDashboard(message, true); } catch (error) { dashboard.sessions = previousSessions; throw error; }
  flash(message, 12000);
}
const contentPages = [
  { view:'apps', key:'apps', title:'Main Apps', description:'Manage the applications employees launch from the intranet.' },
  { view:'announcements', key:'announcements', title:'Announcements', description:'Create and publish the employee updates displayed at the top of the intranet.' },
  { view:'social', key:'socialLinks', title:'Social Media', description:'Maintain the official channels employees can open from the Social Media page.' },
  { view:'moments', key:'moments', title:'Moments', description:'Curate the team moments and milestones shown in the employee gallery.' },
  { view:'knowledge', key:'sessions', title:'Knowledge Hub', description:'Maintain the sessions, learning resources, and practical know-how employees can explore.' },
  { view:'events', key:'events', title:'Events & key dates', description:'Publish company events, deadlines, and important dates.' },
  { view:'whistleblower', key:'whistleblowerConfig', title:'Whistleblower', description:'Maintain employee reporting guidance and the protected Employee Voice destination.' },
  { view:'people', key:'newMembers', title:'Recently Joined', description:'Manage the employee display cards for colleagues who recently joined.' },
  { view:'newsi', key:'policies', title:'New Si-Warians', description:'Manage the onboarding, policies, and acknowledgement content for new colleagues.' }
];
function renderContent() {
  $('#view-content').innerHTML = `<p class="view-intro">Choose the employee page you want to manage. Each editor is kept separate so changes stay focused, easier to review, and safer to publish.</p><div class="page-editor-grid">${contentPages.map(page => { const records = page.key === 'socialLinks' ? 4 : page.key === 'whistleblowerConfig' ? 1 : dashboard[page.key]?.length || 0; const noun = page.key === 'socialLinks' ? 'channel' : page.key === 'whistleblowerConfig' ? 'protected route' : 'record'; return `<article class="panel page-editor-card"><div><span class="page-editor-eyebrow">Employee page</span><h2>${page.title}</h2><p>${page.description}</p><small>${records} ${noun}${records === 1 ? '' : 's'} available</small></div><button class="action-button" type="button" data-goto="${page.view}">Manage ${page.title}</button></article>`; }).join('')}</div>`;
}
function employeePagePreview(title, href, sections = [], saveFormId = '', directKeys = []) {
  const previewSections = sections.length ? `<div class="employee-preview-sections" aria-label="Preview section">${sections.map(([id, label]) => `<button type="button" data-preview-anchor="${id}">${label}</button>`).join('')}</div>` : '';
  const actions = '';
  const note = href === '/social-media.html' ? 'Select a channel to edit its URL here, then save content to publish your changes.' : href === '/moments.html' ? 'Click the page heading or description to change the text, then select Save content. Select a card to edit a moment.' : href === '/knowledge-hub.html' ? 'Click the page or library heading and description to edit text, then select Save content. Select a session row to edit its details.' : href === '/recently-joined.html' ? 'Click highlighted page text to edit it, then select Save content. Select a colleague card to edit their details.' : directKeys.length ? 'Select any item to edit or remove it here. Use Add to create a new item in this employee-page preview.' : saveFormId ? 'Click a highlighted text area to edit it here, then save content to publish your changes.' : 'This is the published employee view. Save your changes, then refresh the preview.';
  return `<aside class="employee-page-preview"><div class="employee-page-preview-head"><div><h2>Employee page preview</h2><p>${title}</p></div>${actions ? `<div class="employee-page-preview-actions">${actions}</div>` : ''}</div>${previewSections}<div class="employee-page-preview-frame"><iframe src="${href}" data-preview-base="${href}" data-preview-auto-height title="${title} employee page preview"></iframe></div><p class="employee-page-preview-note">${note}</p></aside>`;
}
function fitEmployeePagePreview(frame) {
  try {
    const doc = frame.contentDocument, host = frame.parentElement; if (!doc || !host) return;
    const setHeight = () => { const height = Math.max(680, doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0, doc.documentElement.offsetHeight, doc.body?.offsetHeight || 0); host.style.height = `${height}px`; frame.style.height = `${height}px`; };
    frame._previewResizeObserver?.disconnect(); const observer = new ResizeObserver(setHeight); observer.observe(doc.documentElement); if (doc.body) observer.observe(doc.body); frame._previewResizeObserver = observer;
    setHeight(); window.setTimeout(setHeight, 300); window.setTimeout(setHeight, 1000);
  } catch (_) {}
}
function focusEmployeePagePreview(frame) {
  try {
    const doc = frame.contentDocument; if (!doc || doc.querySelector('#admin-preview-focus-style')) return;
    const style = doc.createElement('style'); style.id = 'admin-preview-focus-style'; style.textContent = '.policy-topbar,.destination-page-header,.destination-nav{display:none!important}.policy-shell{padding-top:0!important}.destination-shell{padding-top:0!important}.policy-hero{padding-top:34px!important}.destination-intro{padding-top:34px!important}'; doc.head.append(style);
    const theme = doc.createElement('link'); theme.rel = 'stylesheet'; theme.href = '/admin-preview-theme.css?v=20261018-preview-app-icon-upload'; doc.head.append(theme);
  } catch (_) {}
}
const whistlePreviewTargets = { heroTitle:'[data-whistle="heroTitle"]', heroText:'[data-whistle="heroText"]', safetyTitle:'[data-whistle="safetyTitle"]', safetyText:'[data-whistle="safetyText"]', navTitle:'.policy-nav>p', navHow:'.policy-nav a[href="#how-it-works"]', navPrepare:'.policy-nav a[href="#prepare"]', navPrivacy:'.policy-nav a[href="#privacy"]', navSupport:'.policy-nav a[href="#support"]', howTitle:'#how-it-works h2', howText:'#how-it-works>p', howOpenTitle:'#how-it-works .reporting-paths li:nth-child(1) b', howOpenText:'#how-it-works .reporting-paths li:nth-child(1) span', howDescribeTitle:'#how-it-works .reporting-paths li:nth-child(2) b', howDescribeText:'#how-it-works .reporting-paths li:nth-child(2) span', howFollowTitle:'#how-it-works .reporting-paths li:nth-child(3) b', howFollowText:'#how-it-works .reporting-paths li:nth-child(3) span', howReadyTitle:'#how-it-works .employee-voice-action b', howReadyText:'#how-it-works .employee-voice-action p', voiceButton:'#how-it-works [data-open-voice]', prepareTitle:'#prepare h2', prepareText:'#prepare>p', prepareItem1:'#prepare li:nth-child(1)', prepareItem2:'#prepare li:nth-child(2)', prepareItem3:'#prepare li:nth-child(3)', prepareItem4:'#prepare li:nth-child(4)', privacyTitle:'#privacy h2', privacyText1:'#privacy>p:nth-of-type(1)', privacyText2:'#privacy>p:nth-of-type(2)', supportTitle:'#support h2', supportText:'#support>p', footerLeft:'.policy-footer span:nth-child(1)', footerRight:'.policy-footer span:nth-child(2)' };
function enableWhistleblowerPreviewEditing(frame) {
  if (frame.dataset.previewBase !== '/whistleblower.html') return;
  try {
    const doc = frame.contentDocument, form = $('#whistleblower-config-form'); if (!doc || !form || doc.querySelector('#admin-preview-edit-style')) return;
    const style = doc.createElement('style'); style.id = 'admin-preview-edit-style'; style.textContent = '[data-admin-preview-editable]{outline:2px dashed transparent;outline-offset:6px;cursor:text;transition:outline-color .16s ease,background .16s ease}[data-admin-preview-editable]:hover{outline-color:#0b7aa7;background:rgb(204 244 248 / 45%)}[data-admin-preview-editable]:focus{outline:3px solid #0b7aa7;background:rgb(204 244 248 / 62%)}'; doc.head.append(style);
    Object.entries(whistlePreviewTargets).forEach(([key, selector]) => { const element = doc.querySelector(selector); if (!element) return; let input = form.elements.namedItem(key); if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) { input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = dashboard.whistleblowerConfig?.[key] || element.innerText.trim(); form.append(input); } element.contentEditable = 'true'; element.dataset.adminPreviewEditable = key; element.setAttribute('aria-label', `Edit ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`); element.addEventListener('input', () => { input.value = element.innerText.trim(); form.dataset.previewDirty = 'true'; fitEmployeePagePreview(frame); }); });
  } catch (_) {}
}
function enableMomentsPageCopyEditing(frame) {
  if (frame.dataset.previewBase !== '/moments.html') return;
  try {
    const doc = frame.contentDocument, form = $('#moments-page-copy-form');
    if (!doc || !form || doc.querySelector('#admin-preview-moments-copy-style')) return;
    const style = doc.createElement('style');
    style.id = 'admin-preview-moments-copy-style';
    style.textContent = '[data-admin-preview-moments-copy]{outline:2px dashed transparent;outline-offset:5px;cursor:text;transition:outline-color .16s ease,background .16s ease}[data-admin-preview-moments-copy]:hover{outline-color:#0b7aa7;background:rgb(204 244 248 / 45%)}[data-admin-preview-moments-copy]:focus{outline:3px solid #0b7aa7;background:rgb(204 244 248 / 62%)}';
    doc.head.append(style);
    [['title','.destination-intro h1','page heading'],['intro','.destination-intro p','page description']].forEach(([name, selector, label]) => {
      const element = doc.querySelector(selector), input = form.elements.namedItem(name);
      if (!element || !(input instanceof HTMLInputElement)) return;
      element.contentEditable = 'true';
      element.dataset.adminPreviewMomentsCopy = name;
      element.setAttribute('aria-label', `Edit Moments ${label}`);
      element.title = `Click to edit ${label}`;
      element.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
      element.addEventListener('input', () => { input.value = element.innerText.replace(/\s+/g, ' ').trim(); fitEmployeePagePreview(frame); });
    });
  } catch (_) {}
}
const knowledgePageCopyTargets = {
  title:'.destination-intro h1', intro:'.destination-intro p',
  libraryTitle:'.knowledge-register-heading h2', libraryText:'.knowledge-register-heading p'
};
function enableKnowledgePageCopyEditing(frame, attempts = 0) {
  if (frame.dataset.previewBase !== '/knowledge-hub.html') return;
  try {
    const doc = frame.contentDocument, form = $('#knowledge-page-copy-form');
    if (!doc || !form || doc.querySelector('#admin-preview-knowledge-copy-style')) return;
    if (doc.querySelector('#destination-root')?.dataset.dashboardReady !== 'true') { if (attempts < 20) window.setTimeout(() => enableKnowledgePageCopyEditing(frame, attempts + 1), 180); return; }
    const style = doc.createElement('style');
    style.id = 'admin-preview-knowledge-copy-style';
    style.textContent = '[data-admin-preview-knowledge-copy]{outline:2px dashed transparent;outline-offset:5px;cursor:text;transition:outline-color .16s ease,background .16s ease}[data-admin-preview-knowledge-copy]:hover{outline-color:#0b7aa7;background:rgb(204 244 248 / 45%)}[data-admin-preview-knowledge-copy]:focus{outline:3px solid #0b7aa7;background:rgb(204 244 248 / 62%)}';
    doc.head.append(style);
    Object.entries(knowledgePageCopyTargets).forEach(([name, selector]) => {
      const element = doc.querySelector(selector), input = form.elements.namedItem(name);
      if (!element || !(input instanceof HTMLInputElement)) return;
      if (!input.value) input.value = element.innerText.replace(/\s+/g, ' ').trim();
      element.contentEditable = 'true';
      element.dataset.adminPreviewKnowledgeCopy = name;
      element.setAttribute('aria-label', `Edit ${name.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
      element.title = 'Click to edit this text';
      element.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
      element.addEventListener('input', () => { input.value = element.innerText.replace(/\s+/g, ' ').trim(); fitEmployeePagePreview(frame); });
    });
  } catch (_) {}
}
const recentlyJoinedCopyTargets = {
  heroLead:'.policy-hero h1 span', heroAccent:'.policy-hero h1 em', heroText:'.policy-hero > div > p:last-child',
  asideTitle:'.policy-hero-aside b', asideText:'.policy-hero-aside p',
  navTitle:'.policy-nav > p', navJoined:'.policy-nav a[href="#recently-joined"]', navGuidance:'.policy-nav a[href="/new-hires.html"]',
  sectionTitle:'#recently-joined > h2', sectionText:'#recently-joined > p',
  footerLeft:'.policy-footer span', footerGuidance:'.policy-footer a'
};
function enableRecentlyJoinedPageCopyEditing(frame, attempts = 0) {
  if (frame.dataset.previewBase !== '/recently-joined.html') return;
  try {
    const doc = frame.contentDocument, form = $('#recently-joined-page-copy-form');
    if (!doc || !form || doc.querySelector('#admin-preview-recently-joined-copy-style')) return;
    if (doc.documentElement.dataset.recentlyJoinedReady !== 'true') { if (attempts < 20) window.setTimeout(() => enableRecentlyJoinedPageCopyEditing(frame, attempts + 1), 180); return; }
    const style = doc.createElement('style');
    style.id = 'admin-preview-recently-joined-copy-style';
    style.textContent = '[data-admin-preview-page-copy]{outline:2px dashed transparent;outline-offset:4px;cursor:text;transition:outline-color .16s ease,background .16s ease}[data-admin-preview-page-copy]:hover{outline-color:#0b7aa7;background:rgb(204 244 248 / 45%)}[data-admin-preview-page-copy]:focus{outline:3px solid #0b7aa7;background:rgb(204 244 248 / 62%)}';
    doc.head.append(style);
    Object.entries(recentlyJoinedCopyTargets).forEach(([name, selector]) => {
      const element = doc.querySelector(selector), input = form.elements.namedItem(name);
      if (!element || !(input instanceof HTMLInputElement)) return;
      if (!input.value) input.value = element.innerText.replace(/\s+/g, ' ').trim();
      element.contentEditable = 'true';
      element.dataset.adminPreviewPageCopy = name;
      element.setAttribute('aria-label', `Edit ${name.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
      element.title = 'Click to edit this text';
      if (element instanceof doc.defaultView.HTMLAnchorElement) element.addEventListener('click', event => event.preventDefault());
      element.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
      element.addEventListener('input', () => { input.value = element.innerText.replace(/\s+/g, ' ').trim(); fitEmployeePagePreview(frame); });
    });
  } catch (_) {}
}
function enableSocialPreviewEditing(frame, attempts = 0) {
  if (frame.dataset.previewBase !== '/social-media.html') return;
  try {
    const doc = frame.contentDocument, sourceForm = $('#social-links-form');
    const cards = [...(doc?.querySelectorAll('.social-link') || [])];
    if (!doc || !sourceForm || !cards.length) { if (attempts < 10) window.setTimeout(() => enableSocialPreviewEditing(frame, attempts + 1), 180); return; }
    if (!sourceForm.elements.namedItem('linkedinUrl')) return;
    if (doc.querySelector('#admin-preview-social-style')) return;
    const style = doc.createElement('style'); style.id = 'admin-preview-social-style'; style.textContent = '.social-link[data-admin-preview-social-key]{outline:2px dashed transparent;outline-offset:-6px;cursor:pointer;transition:outline-color .16s ease,background .16s ease}.social-link[data-admin-preview-social-key]:hover,.social-link[data-admin-preview-social-key]:focus-visible{outline-color:#0b7aa7;background:#f5fbff}.admin-preview-url-editor{position:fixed;z-index:2147483647;width:min(330px,calc(100vw - 32px));padding:14px;border:1px solid #b8cde5;border-radius:12px;background:#fff;box-shadow:0 16px 32px rgb(19 56 97 / 18%);font-family:inherit}.admin-preview-url-editor[hidden]{display:none}.admin-preview-url-editor label{display:grid;gap:6px;color:#193f6f;font-size:12px;font-weight:800}.admin-preview-url-editor input{width:100%;box-sizing:border-box;border:1px solid #99b9dc;border-radius:7px;padding:9px 10px;color:#102c52;font:600 12px inherit}.admin-preview-url-editor input:focus{outline:3px solid rgb(10 120 167 / 24%);border-color:#0b7aa7}.admin-preview-url-editor-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:10px}.admin-preview-url-editor button{border:1px solid #b8cde5;border-radius:7px;background:#fff;color:#154f91;padding:7px 9px;font:800 11px inherit;cursor:pointer}.admin-preview-url-editor button[type="submit"]{border-color:#145ea9;background:#145ea9;color:#fff}'; doc.head.append(style);
    const channels = [['.social-link--linkedin', 'linkedinUrl', 'LinkedIn URL'], ['.social-link--facebook', 'facebookUrl', 'Facebook URL'], ['.social-link--youtube', 'youtubeUrl', 'YouTube URL'], ['.social-link--website', 'websiteUrl', 'Si-Ware website URL']];
    const editor = doc.createElement('form'); editor.className = 'admin-preview-url-editor'; editor.hidden = true; editor.noValidate = true; editor.innerHTML = '<label><span data-preview-url-label>Channel URL</span><input name="url" type="url" required /></label><div class="admin-preview-url-editor-actions"><button type="button" data-preview-url-cancel>Cancel</button><button type="submit">Apply</button></div>'; doc.body.append(editor);
    let activeCard = null, activeKey = '';
    const close = () => { editor.hidden = true; activeCard?.removeAttribute('data-admin-preview-social-editing'); activeCard = null; activeKey = ''; };
    const open = (card, key, label) => { activeCard?.removeAttribute('data-admin-preview-social-editing'); activeCard = card; activeKey = key; card.dataset.adminPreviewSocialEditing = 'true'; const input = editor.elements.namedItem('url'); input.value = card.href; editor.querySelector('[data-preview-url-label]').textContent = label; editor.hidden = false; const rect = card.getBoundingClientRect(); editor.style.left = `${Math.max(16, Math.min(rect.left + 12, window.innerWidth - 346))}px`; editor.style.top = `${Math.max(16, Math.min(rect.top + 12, window.innerHeight - 170))}px`; input.focus(); input.select(); };
    channels.forEach(([selector, key, label]) => { const card = doc.querySelector(selector); if (!card) return; card.dataset.adminPreviewSocialKey = key; card.title = `Edit ${label}`; card.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); open(card, key, label); }); });
    editor.addEventListener('click', event => event.stopPropagation()); editor.addEventListener('submit', event => { event.preventDefault(); const input = editor.elements.namedItem('url'); if (!input.reportValidity() || !activeCard || !activeKey) return; sourceForm.elements.namedItem(activeKey).value = input.value.trim(); activeCard.href = input.value.trim(); sourceForm.dataset.previewDirty = 'true'; close(); });
    editor.querySelector('[data-preview-url-cancel]').addEventListener('click', close); doc.addEventListener('click', event => { if (!editor.hidden && !editor.contains(event.target)) close(); }); doc.addEventListener('keydown', event => { if (event.key === 'Escape' && !editor.hidden) { event.preventDefault(); close(); } });
  } catch (_) {}
}
const previewCollectionTargets = {
  apps:{ base:'/apps.html', selector:'.destination-app-item', records:items => items },
  moments:{ base:'/moments.html', selector:'.moment-page-card', records:items => items },
  sessions:{ base:'/knowledge-hub.html', selector:'.knowledge-register tbody tr', records:items => items.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))) },
  newMembers:{ base:'/recently-joined.html', selector:'.new-member-announcement', records:items => items },
  policies:{ base:'/new-hires.html', selector:'.policy-detail-card', records:items => items },
  firstWeekChecklist:{ base:'/new-hires.html', selector:'#first-week-checklist > li', records:items => items },
  supportPortals:{ base:'/new-hires.html', selector:'#company-portals > .company-portal-card', records:items => items }
};
function previewFieldsFor(key, record = {}) {
  const fields = editableCollections[key]?.fields || [];
  return key === 'sessions' ? [['title','Title'], ['presenterName','Presenter'], ...fields.filter(([name]) => name !== 'title')] : fields;
}
function previewValue(record, key, name) { return key === 'sessions' && name === 'presenterName' ? record.presenter?.name || '' : record[name] || ''; }
function previewRecordFromValues(key, values, record = {}) {
  const next = { ...record, ...values };
  if (key === 'sessions') { next.presenter = { name:String(values.presenterName || '').trim(), initials:String(values.presenterName || '').trim().split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0,2).toUpperCase() || 'SW' }; delete next.presenterName; }
  if (key === 'newMembers') { next.team = values.department; next.initials = String(values.name || '').trim().split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0,2).toUpperCase(); next.color ||= '#dceeff'; next.message ||= ''; }
  if (key === 'apps') next.icon ||= 'spark';
  if (key === 'moments') next.mediaUrl ||= '';
  if (key === 'firstWeekChecklist') { next.resourceUrl ||= ''; next.attachmentUrl ||= ''; }
  return next;
}
async function savePreviewCollectionRecord(key, values, existing) {
  const fields = previewFieldsFor(key), missing = fields.filter(([name,, type = 'text']) => type !== 'textarea' && !String(values[name] || '').trim()).map(([, label]) => label);
  if (missing.length) throw new Error(`Complete: ${missing.join(', ')}.`);
  if (key === 'sessions' && duplicateKnowledgeSession(values.title, existing?.id)) throw new Error('A Knowledge Hub session with this title already exists. Use a different title or edit the existing session.');
  const media = values.momentMedia, photo = values.memberPhoto, iconImage = values.iconImage, policyDocument = values.policyDocument, deck = values.knowledgeDeck, recording = values.knowledgeRecording, materials = values.knowledgeMaterials; delete values.momentMedia; delete values.memberPhoto; delete values.iconImage; delete values.policyDocument; delete values.knowledgeDeck; delete values.knowledgeRecording; delete values.knowledgeMaterials;
  const mediaUrl = key === 'moments' && media?.name ? await uploadAnnouncementFile(media, momentMediaTypes, 'moment media') : '';
  if (key === 'newMembers') { const linkedinUrl = safeLinkedInUrl(values.linkedinUrl); if (linkedinUrl === null) throw new Error('Use a valid linkedin.com profile URL, or leave this field empty.'); values.linkedinUrl = linkedinUrl; if (photo?.name && photo.size > 2 * 1024 * 1024) throw new Error('Employee photos must be 2 MB or smaller.'); }
  const photoUrl = key === 'newMembers' && photo?.name ? await uploadAnnouncementFile(photo, appIconImageTypes, 'employee photo') : '';
  const iconUrl = ['apps','supportPortals'].includes(key) && iconImage?.name ? await uploadAppIcon(iconImage) : '';
  const policyUrl = key === 'policies' ? normalisePolicyUrl(values.canonicalUrl) : '';
  const policyDocumentUrl = key === 'policies' && policyDocument?.name ? await uploadAnnouncementFile(policyDocument, ['application/pdf'], 'policy document') : '';
  const presentationDeckUrl = key === 'sessions' ? safeKnowledgeAdminLink(values.presentationDeckUrl) : '', recordingUrl = key === 'sessions' ? safeKnowledgeAdminLink(values.recordingUrl) : '', supportingMaterialsUrl = key === 'sessions' ? safeKnowledgeAdminLink(values.supportingMaterialsUrl) : '';
  if ([presentationDeckUrl, recordingUrl, supportingMaterialsUrl].includes(null)) throw new Error('Use an https:// link, an intranet path, or an anchor for learning resources.');
  const [deckUpload, recordingUpload, materialsUpload] = key === 'sessions' ? await Promise.all([uploadAnnouncementFile(deck, knowledgeDeckTypes, 'presentation deck'), uploadAnnouncementFile(recording, knowledgeRecordingTypes, 'session recording'), uploadAnnouncementFile(materials, knowledgeMaterialTypes, 'supporting materials')]) : ['', '', ''];
  const collection = dashboard[key] ||= [], record = previewRecordFromValues(key, values, existing || { id:`${key}-${Date.now()}` });
  if (mediaUrl) { record.mediaUrl = mediaUrl; record.mediaFilename = media.name; }
  if (photoUrl) { record.photoUrl = photoUrl; record.photoFilename = photo.name; }
  if (iconUrl) { record.iconUrl = iconUrl; record.iconFilename = iconImage.name; }
  if (key === 'policies') record.canonicalUrl = policyDocumentUrl || policyUrl || '';
  if (key === 'sessions') Object.assign(record, { presentationDeckUrl:deckUpload || presentationDeckUrl || existing?.presentationDeckUrl || '', presentationFilename:deckUpload ? deck.name : (presentationDeckUrl ? '' : existing?.presentationFilename || ''), recordingUrl:recordingUpload || recordingUrl || existing?.recordingUrl || '', recordingFilename:recordingUpload ? recording.name : (recordingUrl ? '' : existing?.recordingFilename || ''), supportingMaterialsUrl:materialsUpload || supportingMaterialsUrl || existing?.supportingMaterialsUrl || '', supportingMaterialsFilename:materialsUpload ? materials.name : (supportingMaterialsUrl ? '' : existing?.supportingMaterialsFilename || '') });
  if (existing) Object.assign(existing, record); else collection.push(record);
  await saveDashboard(mediaUrl ? 'Moment and featured media published.' : photoUrl ? 'Colleague and employee photo published.' : iconUrl ? `${key === 'supportPortals' ? 'Portal' : 'App'} icon uploaded and published.` : policyDocumentUrl ? 'Policy PDF uploaded and published.' : key === 'policies' && policyUrl ? 'Policy link saved and published.' : deckUpload || recordingUpload || materialsUpload ? 'Knowledge Hub resources updated and published.' : existing ? `${editableCollections[key].title} updated and published.` : `${editableCollections[key].title} added and published.`);
}
function openPreviewCollectionEditor(frame, key, record = null) {
  const doc = frame.contentDocument, target = previewCollectionTargets[key]; if (!doc || !target) return;
  const pageScrollY = window.scrollY;
  const visiblePreviewTop = Math.max(16, -frame.getBoundingClientRect().top + 16);
  let editor = doc.querySelector('#admin-preview-collection-editor');
  if (!editor) { editor = doc.createElement('form'); editor.id = 'admin-preview-collection-editor'; editor.className = 'admin-preview-collection-editor'; editor.noValidate = true; editor.innerHTML = '<div class="admin-preview-collection-editor-head"><b data-preview-editor-title></b><button type="button" data-preview-editor-close aria-label="Close editor">Close</button></div><div data-preview-editor-fields></div><p data-preview-editor-status role="status"></p><div class="admin-preview-collection-editor-actions"><button type="button" data-preview-editor-remove>Remove</button><button type="submit">Save changes</button></div>'; doc.body.append(editor); editor.querySelector('[data-preview-editor-close]').addEventListener('click', () => editor.hidden = true); doc.addEventListener('keydown', event => { if (event.key === 'Escape' && !editor.hidden) { event.preventDefault(); editor.hidden = true; } }); editor.addEventListener('submit', async event => { event.preventDefault(); const activeKey = editor.dataset.key, id = editor.dataset.id || '', values = Object.fromEntries(new FormData(editor)); const existing = dashboard[activeKey]?.find(item => item.id === id); const status = editor.querySelector('[data-preview-editor-status]'), save = editor.querySelector('button[type="submit"]'); try { save.disabled = true; status.textContent = 'Saving changes…'; await savePreviewCollectionRecord(activeKey, values, existing); } catch (error) { status.textContent = error.message || 'This item could not be saved.'; save.disabled = false; } }); editor.querySelector('[data-preview-editor-remove]').addEventListener('click', async () => { const activeKey = editor.dataset.key, id = editor.dataset.id; if (!id) return; const index = dashboard[activeKey]?.findIndex(item => item.id === id); if (index < 0 || !window.confirm('Remove this item from the employee page?')) return; dashboard[activeKey].splice(index, 1); await saveDashboard(`${editableCollections[activeKey].title} item removed.`); }); }
  const fields = previewFieldsFor(key, record || {}), fieldsRoot = editor.querySelector('[data-preview-editor-fields]'); editor.dataset.key = key; editor.dataset.id = record?.id || ''; editor.querySelector('[data-preview-editor-title]').textContent = record ? `Edit ${recordLabel(key, record)}` : `Add ${editableCollections[key].title.replace(/s$/, '')}`; fieldsRoot.replaceChildren(); fields.forEach(([name, label, type = 'text']) => { const wrap = doc.createElement('label'); wrap.textContent = label; const value = String(previewValue(record || {}, key, name) || (type === 'color' ? '#0758a9' : '')); if (type === 'color') { const control = doc.createElement('div'), picker = doc.createElement('input'), hex = doc.createElement('input'), palette = doc.createElement('div'); control.className = 'admin-preview-colour-control'; picker.name = name; picker.type = 'color'; picker.value = value; picker.required = true; hex.type = 'text'; hex.value = value; hex.maxLength = 7; hex.setAttribute('aria-label', `${label} hex value`); palette.className = 'admin-preview-colour-palette'; ['#0758a9','#00a99d','#ea4335','#f59e0b','#7c5cff','#334155','#111827'].forEach(colour => { const swatch = doc.createElement('button'); swatch.type = 'button'; swatch.style.background = colour; swatch.setAttribute('aria-label', `Use ${colour}`); swatch.addEventListener('click', () => { picker.value = colour; hex.value = colour; }); palette.append(swatch); }); picker.addEventListener('input', () => hex.value = picker.value); hex.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) picker.value = hex.value; }); control.append(picker, hex); wrap.append(control, palette); } else { const input = type === 'textarea' ? doc.createElement('textarea') : doc.createElement('input'); input.name = name; input.required = type !== 'textarea'; if (input instanceof HTMLInputElement && /URL|link/i.test(label)) input.type = 'url'; if (input instanceof HTMLInputElement && name === 'date') input.type = 'date'; input.value = value; if (type === 'textarea') input.rows = 3; wrap.append(input); } fieldsRoot.append(wrap); }); if (key === 'policies') { const group = doc.createElement('fieldset'), legend = doc.createElement('legend'), link = doc.createElement('label'), url = doc.createElement('input'), file = doc.createElement('label'), upload = doc.createElement('input'), help = doc.createElement('small'); legend.textContent = 'Policy document'; link.textContent = 'Policy URL (optional)'; url.name = 'canonicalUrl'; url.type = 'text'; url.inputMode = 'url'; url.value = record?.canonicalUrl || ''; url.placeholder = 'https://… or /uploads/policy.pdf'; link.append(url); file.textContent = 'Upload PDF (optional)'; upload.name = 'policyDocument'; upload.type = 'file'; upload.accept = '.pdf,application/pdf'; help.textContent = record?.canonicalUrl ? 'A PDF upload replaces the current link. To clear it, save with the URL empty.' : 'Add an approved link or upload an employee-facing PDF. Maximum 45 MB.'; file.append(upload, help); group.append(legend, link, file); fieldsRoot.append(group); } if (key === 'moments') { const upload = doc.createElement('label'), input = doc.createElement('input'), help = doc.createElement('small'); upload.textContent = 'Featured media'; input.name = 'momentMedia'; input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'; input.required = false; help.textContent = record?.mediaUrl ? 'Choose a file to replace the current featured media.' : 'Optional image, video, PDF, or presentation. Maximum 45 MB.'; upload.append(input, help); fieldsRoot.append(upload); } if (key === 'newMembers') { [['Company email','companyEmail','email'], ['Phone number','phone','tel'], ['LinkedIn profile','linkedinUrl','url']].forEach(([label, name, type]) => { const wrap = doc.createElement('label'), input = doc.createElement('input'); wrap.textContent = label; input.name = name; input.type = type; input.value = record?.[name] || ''; input.required = false; wrap.append(input); fieldsRoot.append(wrap); }); const upload = doc.createElement('label'), input = doc.createElement('input'), help = doc.createElement('small'); upload.textContent = 'Employee photo'; input.name = 'memberPhoto'; input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif'; input.required = false; help.textContent = record?.photoUrl ? 'Choose a new image to replace the current employee photo.' : 'Optional PNG, JPEG, WebP, or GIF. Maximum 2 MB.'; upload.append(input, help); fieldsRoot.append(upload); } if (key === 'sessions') { [['Presentation deck','presentationDeckUrl','knowledgeDeck','application/pdf,.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',record?.presentationDeckUrl], ['Session recording','recordingUrl','knowledgeRecording','video/mp4,video/webm,video/quicktime',record?.recordingUrl], ['Supporting materials','supportingMaterialsUrl','knowledgeMaterials','.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,image/png,image/jpeg,image/webp,image/gif',record?.supportingMaterialsUrl]].forEach(([label, urlName, fileName, accept, value]) => { const group = doc.createElement('fieldset'), legend = doc.createElement('legend'), link = doc.createElement('label'), url = doc.createElement('input'), file = doc.createElement('label'), upload = doc.createElement('input'), help = doc.createElement('small'); legend.textContent = label; link.textContent = 'URL (optional)'; url.name = urlName; url.type = 'url'; url.value = value || ''; url.placeholder = 'https://… or /uploaded-file'; link.append(url); file.textContent = 'Upload file (optional)'; upload.name = fileName; upload.type = 'file'; upload.accept = accept; help.textContent = value ? 'Choose a replacement file, or replace the URL.' : 'Add a link or choose a file to upload.'; file.append(upload, help); group.append(legend, link, file); fieldsRoot.append(group); }); } editor.querySelector('[data-preview-editor-status]').textContent = ''; editor.querySelector('[data-preview-editor-remove]').hidden = !record; editor.hidden = false; editor.querySelector('input,textarea')?.focus();
  if (key === 'policies') {
    const documentInput = fieldsRoot.querySelector('input[name="policyDocument"]');
    const documentHelp = documentInput?.parentElement?.querySelector('small');
    const documentUrl = String(record?.canonicalUrl || '');
    const isUploadedPdf = /^\/uploads\/.*\.pdf(?:$|\?)/i.test(documentUrl);
    const showDocumentStatus = (message, url = '') => {
      if (!documentHelp) return;
      documentHelp.replaceChildren(document.createTextNode(message));
      if (!url) return;
      const link = doc.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open PDF';
      documentHelp.append(document.createTextNode(' · '), link);
    };
    if (isUploadedPdf) showDocumentStatus(`Current PDF: ${savedFilename({ iconUrl:documentUrl })}. Choose a new PDF to replace it.`, documentUrl);
    else if (documentUrl) showDocumentStatus('Current policy link saved.', documentUrl);
    documentInput?.addEventListener('change', () => {
      const file = documentInput.files?.[0];
      if (file) showDocumentStatus(`Ready to upload: ${file.name}. Save changes to publish it.`);
      else if (isUploadedPdf) showDocumentStatus(`Current PDF: ${savedFilename({ iconUrl:documentUrl })}. Choose a new PDF to replace it.`, documentUrl);
      else if (documentUrl) showDocumentStatus('Current policy link saved.', documentUrl);
    });
  }
  if (['apps','supportPortals'].includes(key)) {
    const upload = doc.createElement('label');
    upload.className = 'admin-preview-icon-upload';
    upload.textContent = key === 'supportPortals' ? 'Portal icon image' : 'App icon image';
    const current = doc.createElement('span');
    current.className = 'admin-preview-icon-current';
    if (record?.iconUrl) {
      const image = doc.createElement('img');
      image.src = record.iconUrl;
      image.alt = '';
      const name = doc.createElement('span');
      name.textContent = `Current icon: ${savedFilename(record)}`;
      current.append(image, name);
      upload.append(current);
    }
    const input = doc.createElement('input');
    input.name = 'iconImage';
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    const help = doc.createElement('small');
    help.textContent = record?.iconUrl ? 'Choose a new image to replace it. PNG, JPEG, WebP, or GIF; maximum 2 MB.' : 'Optional PNG, JPEG, WebP, or GIF; maximum 2 MB.';
    upload.append(input, help);
    const colourField = fieldsRoot.querySelector('.admin-preview-colour-control')?.closest('label');
    fieldsRoot.insertBefore(upload, colourField || null);
  }
  // The preview iframe is expanded to the full employee page. A fixed editor would
  // stay at the iframe's top and disappear when a lower session is selected.
  const viewportHeight = window.innerHeight || 800;
  editor.style.position = 'absolute';
  editor.style.top = `${visiblePreviewTop}px`;
  editor.style.maxHeight = `${Math.max(240, viewportHeight - 32)}px`;
  fitEmployeePagePreview(frame);
  window.scrollTo({ top:pageScrollY, behavior:'instant' });
}
function enableCollectionPreviewEditing(frame, key, attempts = 0) {
  const target = previewCollectionTargets[key]; if (!target || frame.dataset.previewBase !== target.base) return;
  try {
    const doc = frame.contentDocument, records = target.records(dashboard[key] || []), cards = [...(doc?.querySelectorAll(target.selector) || [])];
    if (!doc || (key !== 'newMembers' && cards.length < records.length)) { if (attempts < 12) window.setTimeout(() => enableCollectionPreviewEditing(frame, key, attempts + 1), 180); return; }
    if (key === 'newMembers' && !doc.documentElement.dataset.adminMemberSearchBound) {
      doc.documentElement.dataset.adminMemberSearchBound = 'true';
      doc.addEventListener('recently-joined:rendered', () => enableCollectionPreviewEditing(frame, key));
    }
    if (!doc.querySelector('#admin-preview-collection-style')) { const style = doc.createElement('style'); style.id = 'admin-preview-collection-style'; style.textContent = '[data-admin-preview-record]{outline:2px dashed transparent;outline-offset:5px;cursor:pointer;transition:outline-color .16s ease,background .16s ease}[data-admin-preview-record]:hover,[data-admin-preview-record]:focus-visible{outline-color:#0b7aa7;background:#f4fbff}.admin-preview-collection-editor{position:fixed;z-index:2147483647;right:20px;top:20px;width:min(390px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;padding:17px;border:1px solid #b8cde5;border-radius:13px;background:#fff;box-shadow:0 18px 34px rgb(19 56 97 / 18%);font-family:inherit}.admin-preview-collection-editor[hidden]{display:none}.admin-preview-collection-editor-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:13px;color:#102c52}.admin-preview-collection-editor-head b{font-size:15px}.admin-preview-collection-editor-head button{border:0;background:transparent;color:#145ea9;font:800 12px inherit;cursor:pointer}.admin-preview-collection-editor label{display:grid;gap:5px;margin:9px 0;color:#35577d;font-size:12px;font-weight:800}.admin-preview-collection-editor input,.admin-preview-collection-editor textarea{box-sizing:border-box;width:100%;border:1px solid #a8c2df;border-radius:7px;padding:9px 10px;color:#102c52;font:600 13px inherit}.admin-preview-collection-editor textarea{resize:vertical}.admin-preview-collection-editor input:focus,.admin-preview-collection-editor textarea:focus{outline:3px solid rgb(10 120 167 / 24%);border-color:#0b7aa7}.admin-preview-icon-current{display:flex;align-items:center;gap:8px;padding:7px 8px;border:1px solid #d7e4f2;border-radius:8px;background:#f8fbff;color:#45698e;font-size:11px}.admin-preview-icon-current img{width:30px;height:30px;border-radius:7px;object-fit:cover}.admin-preview-colour-control{display:grid;grid-template-columns:48px 1fr;gap:8px}.admin-preview-collection-editor .admin-preview-colour-control input[type="color"]{width:48px;min-height:39px;padding:3px;cursor:pointer}.admin-preview-colour-palette{display:flex;flex-wrap:wrap;gap:7px}.admin-preview-colour-palette button{width:22px;height:22px;border:1px solid #9eb8d5;border-radius:50%;cursor:pointer}.admin-preview-colour-palette button:focus-visible{outline:3px solid rgb(10 120 167 / 28%);outline-offset:2px}.admin-preview-collection-editor-actions{display:flex;justify-content:space-between;gap:10px;margin-top:14px}.admin-preview-collection-editor-actions button{border:1px solid #b8cde5;border-radius:7px;background:#fff;color:#a4263d;padding:8px 10px;font:800 12px inherit;cursor:pointer}.admin-preview-collection-editor-actions button[type="submit"]{margin-left:auto;border-color:#145ea9;background:#145ea9;color:#fff}.admin-preview-collection-editor [data-preview-editor-status]{min-height:1.2em;margin:8px 0 0;color:#a4263d;font-size:12px;font-weight:700}'; doc.head.append(style); }
    cards.slice(0, records.length).forEach((card, index) => { const record = key === 'newMembers' ? records.find(item => String(item.id) === card.dataset.memberId) : records[index]; if (!record || card.dataset.adminPreviewRecord) return; card.dataset.adminPreviewRecord = record.id; card.tabIndex ||= 0; card.title = `Edit ${recordLabel(key, record)}`; card.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openPreviewCollectionEditor(frame, key, record); }); });
  } catch (_) {}
}
const newSiPageCopyTargets = [
  'heroEyebrow','heroLead','heroAccent','heroText','heroJourneyLabel','heroAction','asideTitle','asideText','asideAction',
  'navTitle','navChecklist','navPolicies','navTraining','navTools','navHelp','checklistTitle','checklistText','policiesTitle','policiesText',
  'trainingTitle','trainingText','securityEnglishTitle','securityArabicTitle','adminPortalTrainingTitle','securityEnglishUrl','securityArabicUrl','adminPortalTrainingUrl',
  'toolsTitle','toolsText','emailTitle','emailText','emailAction','knowledgeTitle','knowledgeText','knowledgeAction',
  'helpTitle','helpText','itTitle','peopleTitle','administrationTitle','financeTitle','portalsTitle','portalsText','footerLeft','footerRight'
];
function enableNewSiPageCopyEditing(frame, attempts = 0) {
  if (frame.dataset.previewBase !== '/new-hires.html') return;
  try {
    const doc = frame.contentDocument, form = $('#newsi-page-copy-form');
    if (!doc || !form) { if (attempts < 12) window.setTimeout(() => enableNewSiPageCopyEditing(frame, attempts + 1), 180); return; }
    if (!doc.querySelector('#admin-preview-newsi-page-copy-style')) {
      const style = doc.createElement('style');
      style.id = 'admin-preview-newsi-page-copy-style';
      style.textContent = '[data-newsi-copy][data-admin-preview-newsi-page-copy]{outline:2px dashed transparent;outline-offset:4px;cursor:text;transition:outline-color .16s ease,background .16s ease}[data-newsi-copy][data-admin-preview-newsi-page-copy]:hover{outline-color:#0b7aa7;background:rgb(204 244 248 / 45%)}[data-newsi-copy][data-admin-preview-newsi-page-copy]:focus{outline:3px solid #0b7aa7;background:rgb(204 244 248 / 62%)}';
      doc.head.append(style);
    }
    newSiPageCopyTargets.forEach(name => {
      const element = doc.querySelector(`[data-newsi-copy="${name}"]`), input = form.elements.namedItem(name);
      if (!element || !(input instanceof HTMLInputElement)) return;
      if (!input.value) input.value = element.innerText.replace(/\s+/g, ' ').trim();
      element.contentEditable = 'true';
      element.dataset.adminPreviewNewsiPageCopy = name;
      element.setAttribute('aria-label', `Edit ${name.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
      element.title = 'Click to edit this text';
      if (element instanceof doc.defaultView.HTMLAnchorElement) element.addEventListener('click', event => event.preventDefault());
      element.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
      element.addEventListener('input', () => { input.value = element.innerText.replace(/\s+/g, ' ').trim(); fitEmployeePagePreview(frame); });
    });
  } catch (_) {}
}
function enableNewSiAcknowledgementPreviewEditing(frame, attempts = 0) {
  if (frame.dataset.previewBase !== '/new-hires.html') return;
  try {
    const doc = frame.contentDocument, form = $('#ack-content-form'), panel = doc?.querySelector('#policy-acknowledgement');
    if (!doc || !form || !panel) { if (attempts < 12) window.setTimeout(() => enableNewSiAcknowledgementPreviewEditing(frame, attempts + 1), 180); return; }
    if (doc.querySelector('#admin-preview-newsi-copy-style')) return;
    const style = doc.createElement('style'); style.id = 'admin-preview-newsi-copy-style'; style.textContent = '[data-admin-preview-newsi-copy]{outline:2px dashed transparent;outline-offset:4px;cursor:text;transition:outline-color .16s ease,background .16s ease}[data-admin-preview-newsi-copy]:hover,[data-admin-preview-newsi-copy]:focus{outline-color:#0b7aa7;background:#f4fbff}'; doc.head.append(style);
    const fields = [['actionTitle','.policy-acknowledgement-head h3'], ['instructionText','.policy-acknowledgement-head p'], ['beforeHeading','.policy-acknowledgement-notice b'], ['beforeText','.policy-acknowledgement-notice p'], ['confirmationLabel','[data-confirm-policy]'], ['confirmationHelp','.policy-acknowledgement-actions small']];
    fields.forEach(([name, selector]) => { const element = panel.querySelector(selector), input = form.elements.namedItem(name); if (!element || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return; element.contentEditable = 'true'; element.dataset.adminPreviewNewsiCopy = name; element.addEventListener('input', () => { input.value = element.innerText.trim(); fitEmployeePagePreview(frame); }); });
  } catch (_) {}
}
document.addEventListener('load', event => { const frame = event.target; if (frame instanceof HTMLIFrameElement && frame.matches('[data-preview-auto-height]')) { focusEmployeePagePreview(frame); fitEmployeePagePreview(frame); enableWhistleblowerPreviewEditing(frame); enableMomentsPageCopyEditing(frame); enableKnowledgePageCopyEditing(frame); enableRecentlyJoinedPageCopyEditing(frame); enableSocialPreviewEditing(frame); enableNewSiPageCopyEditing(frame); enableNewSiAcknowledgementPreviewEditing(frame); Object.keys(previewCollectionTargets).forEach(key => enableCollectionPreviewEditing(frame, key)); } }, true);
const socialCardDefaults = links => [
  { id:'linkedin', title:'LinkedIn', url:links.linkedinUrl || 'https://www.linkedin.com/company/si-ware-systems/?locale=en_US', icon:'linkedin', actionLabel:'Visit channel' },
  { id:'facebook', title:'Facebook', url:links.facebookUrl || 'https://www.facebook.com/SiWareSystems/', icon:'facebook', actionLabel:'Visit channel' },
  { id:'youtube', title:'YouTube', url:links.youtubeUrl || 'https://www.youtube.com/@Si-Ware_Systems', icon:'youtube', actionLabel:'Visit channel' },
  { id:'website', title:'Si-Ware website', url:links.websiteUrl || 'https://www.si-ware.com', icon:'website', actionLabel:'Visit website' }
];
function socialCards() { const links = dashboard.socialLinks || {}; return Array.isArray(links.cards) && links.cards.length ? links.cards : socialCardDefaults(links); }
function renderSocial() {
  const cards = socialCards(), selected = cards.find(card => card.id === editingRecord.socialCard);
  $('#view-social').innerHTML = `<p class="view-intro">Maintain the official destinations shown on the employee Social Media page. Add a channel when a new approved destination is ready, then save to publish it.</p><article class="panel"><div class="collection-heading"><div><h2>Official channels</h2><p>Use complete HTTPS addresses and a familiar icon so every employee can recognise the approved destination.</p></div><a class="action-button secondary" href="/social-media.html" target="_blank" rel="noopener">View employee page ↗</a></div><div class="collection-layout"><div class="list">${cards.map(card => `<div class="list-row"><span><b>${escapeHtml(card.title)}</b><small>${escapeHtml(card.url)}</small></span><div class="row-actions"><button class="tool-button" type="button" data-edit-social-card="${escapeHtml(card.id)}">Edit</button></div></div>`).join('') || '<p class="empty">No social media cards yet.</p>'}</div><form id="social-links-form" class="inline-editor"><h3>${selected ? `Edit ${escapeHtml(selected.title)}` : 'Add social media card'}</h3><label>Card title<input name="title" required maxlength="60" value="${escapeHtml(selected?.title || '')}" placeholder="e.g. Instagram" /></label><label>Channel URL<input name="url" type="url" required maxlength="500" value="${escapeHtml(selected?.url || '')}" placeholder="https://…" /></label><label>Icon<select name="icon"><option value="linkedin" ${selected?.icon === 'linkedin' ? 'selected' : ''}>LinkedIn</option><option value="facebook" ${selected?.icon === 'facebook' ? 'selected' : ''}>Facebook</option><option value="youtube" ${selected?.icon === 'youtube' ? 'selected' : ''}>YouTube</option><option value="website" ${selected?.icon === 'website' ? 'selected' : ''}>Website</option><option value="instagram" ${selected?.icon === 'instagram' ? 'selected' : ''}>Instagram</option><option value="x" ${selected?.icon === 'x' ? 'selected' : ''}>X</option><option value="generic" ${selected?.icon === 'generic' ? 'selected' : ''}>Generic link</option></select></label><label>Link label<input name="actionLabel" required maxlength="40" value="${escapeHtml(selected?.actionLabel || 'Visit channel')}" placeholder="Visit channel" /></label>${selected ? '<label class="social-remove-confirmation">Type DELETE to remove this card<input name="deleteConfirmation" autocomplete="off" spellcheck="false" /></label>' : ''}<p class="form-status" role="status"></p><div class="form-actions"><button class="action-button danger" type="button" data-remove-social-card ${selected ? 'disabled' : 'hidden'}>Remove</button><button class="action-button primary">${selected ? 'Save changes' : 'Add card'}</button></div></form></div></article>`;
  const form = $('#social-links-form');
  form.addEventListener('submit', async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)), url = String(values.url || '').trim(); try { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error(); } catch { form.querySelector('.form-status').textContent = 'Enter a complete HTTPS or HTTP channel URL.'; return; } const next = socialCards().map(card => ({ ...card })); const record = { id:selected?.id || `social-${Date.now()}`, title:String(values.title || '').trim(), url, icon:String(values.icon || 'generic'), actionLabel:String(values.actionLabel || '').trim() || 'Visit channel' }; if (selected) next.splice(next.findIndex(card => card.id === selected.id), 1, record); else next.push(record); dashboard.socialLinks = { ...(dashboard.socialLinks || {}), cards:next }; editingRecord.socialCard = record.id; await saveDashboard(selected ? 'Social media card updated and published.' : 'Social media card added and published.'); });
  $('#view-social').querySelector('.list')?.addEventListener('click', event => { const button = event.target.closest('[data-edit-social-card]'); if (!button) return; editingRecord.socialCard = button.dataset.editSocialCard; renderSocial(); $('#social-links-form').scrollIntoView({ block:'nearest' }); });
  form.querySelector('[name="deleteConfirmation"]')?.addEventListener('input', event => { form.querySelector('[data-remove-social-card]').disabled = event.target.value !== 'DELETE'; });
  form.querySelector('[data-remove-social-card]')?.addEventListener('click', async () => { if (!selected || form.elements.deleteConfirmation?.value !== 'DELETE') return; dashboard.socialLinks = { ...(dashboard.socialLinks || {}), cards:socialCards().filter(card => card.id !== selected.id) }; editingRecord.socialCard = ''; await saveDashboard('Social media card removed from the employee page.'); });
  const editor = form.closest('.panel'), workspace = document.createElement('div');
  workspace.className = 'admin-editor-preview-layout'; editor.before(workspace); workspace.append(editor); workspace.insertAdjacentHTML('beforeend', employeePagePreview('Social Media', '/social-media.html', [], 'social-links-form'));
}
function renderWhistleblower() {
  const config = dashboard.whistleblowerConfig || {};
  $('#view-whistleblower').innerHTML = `<p class="view-intro">Maintain the employee guidance and approved reporting destination. This area never displays, exports, or changes confidential reports.</p><article class="panel"><div class="collection-heading"><div><h2>Employee Voice guidance</h2><p>Keep this content clear and review it with the appropriate policy owner before publishing.</p></div><a class="action-button secondary" href="/whistleblower.html" target="_blank" rel="noopener">View employee page ↗</a></div><form id="whistleblower-config-form" class="settings-form"><div class="form-grid"><label>Page title<input name="heroTitle" required maxlength="120" value="${escapeHtml(config.heroTitle || '')}" /></label><label>Safety note title<input name="safetyTitle" required maxlength="120" value="${escapeHtml(config.safetyTitle || '')}" /></label><label class="form-grid-full">Introduction<textarea name="heroText" required rows="4" maxlength="1200">${escapeHtml(config.heroText || '')}</textarea></label><label class="form-grid-full">Safety note<textarea name="safetyText" required rows="3" maxlength="800">${escapeHtml(config.safetyText || '')}</textarea></label><label class="form-grid-full">Employee Voice destination URL<input name="voiceUrl" type="url" required value="${escapeHtml(config.voiceUrl || '')}" placeholder="https://…" /><small>This is the protected route opened when an employee starts a confidential report.</small></label></div><p class="notice">Submitted reports remain outside Administration and are never available here.</p><div class="form-actions"><button class="action-button primary">Save guidance</button></div></form></article>`;
  const editor = $('#whistleblower-config-form').closest('.panel'), workspace = document.createElement('div');
  workspace.className = 'admin-editor-preview-layout'; editor.before(workspace); workspace.append(editor); editor.hidden = true; workspace.insertAdjacentHTML('beforeend', employeePagePreview('Whistleblower', '/whistleblower.html', [], 'whistleblower-config-form'));
  const voiceLabel = $('#whistleblower-config-form [name="voiceUrl"]')?.closest('label'); if (voiceLabel?.firstChild) voiceLabel.firstChild.textContent = 'Employee Voice URL';
  $('#whistleblower-config-form').addEventListener('submit', async event => { event.preventDefault(); dashboard.whistleblowerConfig = { ...dashboard.whistleblowerConfig, ...Object.fromEntries(new FormData(event.currentTarget)) }; await saveDashboard('Whistleblower guidance saved and published.'); });
}
function mountPreviewOnlyCollection(root, key, title, href) {
  const editor = root.querySelector('.collection-panel'); if (!editor) return;
  const workspace = document.createElement('div'); workspace.className = 'admin-editor-preview-layout'; editor.before(workspace); workspace.append(editor); editor.hidden = true;
  if (key === 'moments') {
    const copy = dashboard.momentsPageContent || {}, form = document.createElement('form');
    form.id = 'moments-page-copy-form'; form.hidden = true;
    form.innerHTML = `<input type="hidden" name="title" value="${escapeHtml(copy.title || 'Moments')}" /><input type="hidden" name="intro" value="${escapeHtml(copy.intro || 'Team outings, achievements and shared milestones worth celebrating.')}" />`;
    form.addEventListener('submit', event => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); if (!values.title.trim() || !values.intro.trim()) { flash('The Moments heading and description cannot be empty.'); return; } if (values.title.length > 120 || values.intro.length > 300) { flash('Keep the heading under 120 characters and the description under 300.'); return; } dashboard.momentsPageContent = values; saveDashboard('Moments page text saved and published.'); });
    workspace.append(form);
  }
  if (key === 'sessions') {
    const copy = dashboard.knowledgePageContent || {}, form = document.createElement('form');
    form.id = 'knowledge-page-copy-form'; form.hidden = true;
    Object.keys(knowledgePageCopyTargets).forEach(name => { const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = copy[name] || ''; form.append(input); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      if (Object.values(values).some(value => !String(value).trim())) { flash('The Knowledge Hub headings and descriptions cannot be empty.'); return; }
      if (values.title.length > 120 || values.libraryTitle.length > 120 || values.intro.length > 300 || values.libraryText.length > 300) { flash('Keep headings under 120 characters and descriptions under 300.'); return; }
      dashboard.knowledgePageContent = values;
      saveDashboard('Knowledge Hub page text saved and published.');
    });
    workspace.append(form);
  }
  if (key === 'newMembers') {
    const copy = dashboard.recentlyJoinedPageContent || {}, form = document.createElement('form');
    form.id = 'recently-joined-page-copy-form'; form.hidden = true;
    Object.keys(recentlyJoinedCopyTargets).forEach(name => { const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = copy[name] || ''; form.append(input); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const missing = Object.entries(values).find(([, value]) => !String(value).trim());
      if (missing) { flash('Page text cannot be empty. Restore or edit the highlighted text before saving.'); return; }
      const tooLong = Object.entries(values).find(([, value]) => String(value).length > 400);
      if (tooLong) { flash('Keep each text area under 400 characters.'); return; }
      dashboard.recentlyJoinedPageContent = values;
      saveDashboard('Recently Joined page text saved and published.');
    });
    workspace.append(form);
  }
  const saveFormId = key === 'moments' ? 'moments-page-copy-form' : key === 'sessions' ? 'knowledge-page-copy-form' : key === 'newMembers' ? 'recently-joined-page-copy-form' : '';
  workspace.insertAdjacentHTML('beforeend', employeePagePreview(title, href, [], saveFormId, [key]));
  editor.querySelector('.collection-actions')?.remove();
  if (key === 'sessions') {
    const dialog = document.createElement('dialog');
    dialog.className = 'knowledge-remove-dialog';
    dialog.innerHTML = `<form method="dialog"><h2>Remove all Knowledge Hub sessions?</h2><p>This permanently removes all ${dashboard.sessions.length} session records from the employee page. It cannot be undone here.</p><label>Type DELETE to confirm<input name="confirmation" autocomplete="off" spellcheck="false" required /></label><p class="knowledge-remove-error" role="alert"></p><div class="knowledge-remove-dialog-actions"><button type="button" class="action-button" data-cancel-remove>Cancel</button><button type="submit" class="action-button knowledge-remove-all">Remove all sessions</button></div></form>`;
    root.append(dialog);
    dialog.querySelector('[data-cancel-remove]').addEventListener('click', () => dialog.close());
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const confirmation = dialog.querySelector('[name="confirmation"]'), error = dialog.querySelector('.knowledge-remove-error'), submit = dialog.querySelector('[type="submit"]');
      if (confirmation.value !== 'DELETE') { error.textContent = 'Type DELETE exactly to remove every session.'; confirmation.focus(); return; }
      const previous = dashboard.sessions;
      submit.disabled = true;
      dialog.close();
      dashboard.sessions = [];
      try { await saveDashboard(`${previous.length} Knowledge Hub sessions removed.`, true); }
      catch (saveError) { dashboard.sessions = previous; error.textContent = saveError.message || 'Sessions were not removed. Try again.'; submit.disabled = false; dialog.showModal(); }
    });
  }
}
function renderContentPage(view) {
  const page = contentPages.find(entry => entry.view === view);
  if (!page) return;
  if (view === 'social') { renderSocial(); return; }
  if (view === 'whistleblower') { renderWhistleblower(); return; }
  if (view === 'newsi') { renderNewSi(); return; }
  if (page.key === 'events') dashboard.events.forEach((event, index) => { event.id ||= `event-seed-${index}`; });
  const root = $(`#view-${view}`);
  root.innerHTML = `<p class="view-intro">${page.description} Changes publish to the employee intranet after you save.</p>${renderCollection(page.key)}`;
  if (page.key === 'announcements') {
    const record = dashboard.announcements.find(item => item.id === editingRecord.announcements) || {};
    root.querySelector('.form-actions')?.insertAdjacentHTML('beforebegin', `<label class="announcement-visibility"><input type="hidden" name="hidden" value="false" /><input type="checkbox" name="hidden" value="true" ${record.hidden === true || record.hidden === 'true' ? 'checked' : ''} /><span><b>Hide from employees</b><small>Keep this announcement in Administration, but remove it from employee pages until you make it visible again.</small></span></label>`);
    root.querySelectorAll('.list-row').forEach((row, index) => { if (dashboard.announcements[index]?.hidden === true || dashboard.announcements[index]?.hidden === 'true') row.querySelector('span')?.insertAdjacentHTML('beforeend', '<small class="hidden-announcement-status">Hidden from employees</small>'); });
  }
  if (page.key === 'sessions') enhanceKnowledgeSessionEditor(root);
  if (page.key === 'moments') enhanceMomentEditor(root);
  if (page.key === 'newMembers') enhancePersonEditor(root);
  const previewPages = { apps:['Quick Launch apps','/apps.html'], moments:['Moments','/moments.html'], sessions:['Knowledge Hub','/knowledge-hub.html'], newMembers:['Recently Joined','/recently-joined.html'] };
  if (previewPages[page.key]) mountPreviewOnlyCollection(root, page.key, ...previewPages[page.key]);
}
function knowledgeResourceField(label, urlName, fileName, url, filename, accept, help) {
  const current = url ? `<small>Current file: <b>${escapeHtml(filename || decodeURIComponent(String(url).split('/').pop() || 'linked resource'))}</b> · <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open</a>. Add a link or choose a replacement file.</small>` : `<small>${help}</small>`;
  return `<label>${label} link (optional)<input name="${urlName}" inputmode="url" value="${escapeHtml(url || '')}" placeholder="https://… or /uploaded-file" /></label><label>${label} file (optional)<input name="${fileName}" type="file" accept="${accept}" />${current}</label>`;
}
function enhanceKnowledgeSessionEditor(root) {
  const form = root.querySelector('[data-editor="sessions"]');
  if (!form) return;
  const record = dashboard.sessions.find(item => item.id === editingRecord.sessions) || {};
  const title = form.querySelector('[name="title"]')?.closest('label');
  title?.insertAdjacentHTML('afterend', `<label>Presenter<input name="presenterName" required maxlength="80" value="${escapeHtml(record.presenter?.name || '')}" placeholder="Presenter name" /></label>`);
  const category = form.querySelector('[name="category"]');
  category?.setAttribute('list', 'knowledge-categories');
  category?.insertAdjacentHTML('afterend', '<datalist id="knowledge-categories"><option value="Photonics"></option><option value="Patents"></option><option value="MEMS"></option><option value="AI"></option><option value="General"></option></datalist>');
  form.querySelector('[name="date"]')?.setAttribute('type', 'date');
  const outline = form.querySelector('[name="outline"]')?.closest('label');
  outline?.insertAdjacentHTML('afterend', `<fieldset class="knowledge-resources"><legend>Learning resources</legend>${knowledgeResourceField('Presentation deck', 'presentationDeckUrl', 'knowledgeDeck', record.presentationDeckUrl, record.presentationFilename, '.pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Upload a PDF or PowerPoint deck, up to 45 MB.')}${knowledgeResourceField('Session recording', 'recordingUrl', 'knowledgeRecording', record.recordingUrl, record.recordingFilename, 'video/mp4,video/webm,video/quicktime', 'Upload an MP4, WebM, or MOV recording, up to 45 MB.')}${knowledgeResourceField('Supporting materials', 'supportingMaterialsUrl', 'knowledgeMaterials', record.supportingMaterialsUrl, record.supportingMaterialsFilename, '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,image/png,image/jpeg,image/webp,image/gif', 'Upload a PDF, Office file, image, or text resource, up to 45 MB.')}</fieldset><p class="knowledge-editor-status" role="status" aria-live="polite"></p>`);
}
function safeKnowledgeAdminLink(value) {
  let link = String(value || '').trim();
  if (!link) return '';
  if (/^(?:www\.|[\w-]+(?:\.[\w-]+)+\.(?:com|org|net|edu|gov|io|co)(?:\/|$))/i.test(link)) link = `https://${link}`;
  if (/^https?:\/\//i.test(link)) { try { const url = new URL(link); return url.hostname && !/\s/.test(link) ? link : null; } catch { return null; } }
  return /^\/(?!\/)/.test(link) || /^#/.test(link) ? link : null;
}
async function saveKnowledgeSession(event, form) {
  event.preventDefault();
  const formData = new FormData(form), existing = editingRecord.sessions && dashboard.sessions.find(item => item.id === editingRecord.sessions), status = form.querySelector('.knowledge-editor-status'), button = form.querySelector('.action-button.primary');
  const title = String(formData.get('title') || '').trim(), presenterName = String(formData.get('presenterName') || '').trim(), category = String(formData.get('category') || '').trim() || 'General', date = String(formData.get('date') || '').trim(), outline = String(formData.get('outline') || '').trim();
  const presentationDeckUrl = safeKnowledgeAdminLink(formData.get('presentationDeckUrl')), recordingUrl = safeKnowledgeAdminLink(formData.get('recordingUrl')), supportingMaterialsUrl = safeKnowledgeAdminLink(formData.get('supportingMaterialsUrl'));
  if (!title || !presenterName || !date) { status.textContent = 'Title, presenter, and date are required.'; return; }
  if (duplicateKnowledgeSession(title, existing?.id)) { status.textContent = 'A Knowledge Hub session with this title already exists. Use a different title or edit the existing session.'; return; }
  if ([presentationDeckUrl, recordingUrl, supportingMaterialsUrl].includes(null)) { status.textContent = 'Use an https:// link, an intranet path, or an anchor for learning resources.'; return; }
  try {
    button.disabled = true; button.textContent = 'Saving session…'; status.textContent = 'Uploading selected resources…';
    const deck = formData.get('knowledgeDeck'), recording = formData.get('knowledgeRecording'), materials = formData.get('knowledgeMaterials');
    const [deckUpload, recordingUpload, materialsUpload] = await Promise.all([
      uploadAnnouncementFile(deck, knowledgeDeckTypes, 'presentation deck'),
      uploadAnnouncementFile(recording, knowledgeRecordingTypes, 'session recording'),
      uploadAnnouncementFile(materials, knowledgeMaterialTypes, 'supporting materials')
    ]);
    const record = { ...(existing || { id:`session-${Date.now()}` }), title, presenter:{ name:presenterName, initials:presenterName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() }, category, date, outline,
      presentationDeckUrl:deckUpload || presentationDeckUrl || existing?.presentationDeckUrl || '', presentationFilename:deckUpload ? deck.name : (presentationDeckUrl ? '' : existing?.presentationFilename || ''),
      recordingUrl:recordingUpload || recordingUrl || existing?.recordingUrl || '', recordingFilename:recordingUpload ? recording.name : (recordingUrl ? '' : existing?.recordingFilename || ''),
      supportingMaterialsUrl:materialsUpload || supportingMaterialsUrl || existing?.supportingMaterialsUrl || '', supportingMaterialsFilename:materialsUpload ? materials.name : (supportingMaterialsUrl ? '' : existing?.supportingMaterialsFilename || '') };
    if (existing) Object.assign(existing, record); else dashboard.sessions.unshift(record);
    editingRecord.sessions = ''; await saveDashboard(existing ? 'Knowledge Hub session updated and published.' : 'Knowledge Hub session added and published.');
  } catch (error) { status.textContent = error.message || 'The Knowledge Hub session could not be saved.'; button.disabled = false; button.textContent = 'Save changes'; }
}
function momentMediaKind(url = '') { const path = String(url).split(/[?#]/)[0].toLowerCase(); if (/\.(png|jpe?g|webp|gif)$/.test(path)) return 'image'; if (/\.(mp4|webm|mov)$/.test(path)) return 'video'; if (/\.pdf$/.test(path)) return 'pdf'; if (/\.(ppt|pptx)$/.test(path)) return 'presentation'; return 'file'; }
function momentPreviewMarkup(url, filename, local = false) {
  if (!url) return '<div class="moment-media-empty">No media attached yet. Select a file, then save the moment to publish it.</div>';
  const label = escapeHtml(filename || decodeURIComponent(String(url).split('/').pop() || 'media file')), kind = momentMediaKind(filename || url), open = local ? '' : `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open file</a>`;
  if (kind === 'image') return `<div class="moment-media-preview image-preview"><img src="${escapeHtml(url)}" alt="Selected moment media" /><span><b>${label}</b>${open}</span></div>`;
  if (kind === 'video') return `<div class="moment-media-preview"><video controls preload="metadata"><source src="${escapeHtml(url)}" />Your browser cannot preview this video.</video><span><b>${label}</b>${open}</span></div>`;
  if (kind === 'pdf') return `<div class="moment-media-preview document-preview"><iframe src="${escapeHtml(url)}#view=FitH" title="${label}"></iframe><span><b>${label}</b>${open}</span></div>`;
  return `<div class="moment-media-preview file-preview"><span><b>${label}</b><small>PowerPoint presentation</small>${open || '<small>Preview ready after saving.</small>'}</span></div>`;
}
function enhanceMomentEditor(root) {
  const form = root.querySelector('[data-editor="moments"]');
  if (!form) return;
  const record = dashboard.moments.find(item => item.id === editingRecord.moments) || {};
  const colour = form.querySelector('[name="color"]')?.closest('label');
  colour?.insertAdjacentHTML('afterend', `<fieldset class="moment-media-editor"><legend>Featured media</legend><label>Photo, video, PDF, or presentation<input name="momentMedia" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,.ppt,.pptx" /><small>Choose one featured file. Save changes to publish it. Maximum 45 MB.</small></label><div class="moment-media-preview-area">${momentPreviewMarkup(record.mediaUrl, record.mediaFilename)}</div></fieldset><p class="moment-media-status" role="status" aria-live="polite"></p>`);
}
async function saveMoment(event, form) {
  event.preventDefault();
  const formData = new FormData(form), existing = editingRecord.moments && dashboard.moments.find(item => item.id === editingRecord.moments), status = form.querySelector('.moment-media-status'), button = form.querySelector('.action-button.primary');
  const title = String(formData.get('title') || '').trim(), kind = String(formData.get('kind') || '').trim(), color = String(formData.get('color') || '').trim() || '#dceeff', media = formData.get('momentMedia');
  if (!title || !kind) { status.textContent = 'Title and label are required.'; return; }
  try {
    button.disabled = true; button.textContent = media?.name ? 'Uploading media…' : 'Saving moment…'; status.textContent = media?.name ? `Uploading ${media.name}…` : 'Saving moment…';
    const mediaUrl = await uploadAnnouncementFile(media, momentMediaTypes, 'moment media');
    const record = { ...(existing || { id:`moment-${Date.now()}` }), title, kind, color, mediaUrl:mediaUrl || existing?.mediaUrl || '', mediaFilename:mediaUrl ? media.name : existing?.mediaFilename || '' };
    if (existing) Object.assign(existing, record); else dashboard.moments.unshift(record);
    editingRecord.moments = record.id; await saveDashboard(mediaUrl ? 'Moment and featured media published.' : 'Moment updated and published.');
  } catch (error) { status.textContent = error.message || 'The moment could not be saved.'; button.disabled = false; button.textContent = 'Save changes'; }
}
function memberPhotoPreview(url, name, initials = 'SW', local = false) {
  if (!url) return `<div class="member-photo-empty" aria-hidden="true">${escapeHtml(initials)}</div><small>No employee photo selected yet.</small>`;
  return `<div class="member-photo-preview"><img src="${escapeHtml(url)}" alt="Employee photo preview" /><span><b>${escapeHtml(name || 'Employee photo')}</b>${local ? '<small>Preview before saving</small>' : '<small>Saved employee photo</small>'}</span></div>`;
}
function enhancePersonEditor(root) {
  const form = root.querySelector('[data-editor="newMembers"]');
  if (!form) return;
  const record = dashboard.newMembers.find(item => item.id === editingRecord.newMembers) || {};
  const joined = form.querySelector('[name="joined"]')?.closest('label');
  const initials = record.initials || String(record.name || '').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'SW';
  joined?.insertAdjacentHTML('afterend', `<fieldset class="member-contact-editor"><legend>Contact details <small>(optional)</small></legend><label>Company email<input name="companyEmail" type="email" maxlength="120" value="${escapeHtml(record.companyEmail || '')}" placeholder="name@si-ware.com" /></label><label>Phone number<input name="phone" type="tel" maxlength="40" value="${escapeHtml(record.phone || '')}" placeholder="+20 …" /></label><label>LinkedIn profile<input name="linkedinUrl" type="url" maxlength="300" value="${escapeHtml(record.linkedinUrl || '')}" placeholder="https://www.linkedin.com/in/…" /></label></fieldset><fieldset class="member-photo-editor"><legend>Employee photo</legend><label>Photo upload<input name="memberPhoto" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /><small>Optional PNG, JPEG, WebP, or GIF. Maximum 2 MB.</small></label><div class="member-photo-preview-area">${memberPhotoPreview(record.photoUrl, record.photoFilename, initials)}</div></fieldset><p class="member-editor-status" role="status" aria-live="polite"></p>`);
}
function safeLinkedInUrl(value) { const raw = String(value || '').trim(); if (!raw) return ''; const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`; try { const url = new URL(candidate); return /(^|\.)linkedin\.com$/i.test(url.hostname) ? url.href : null; } catch { return null; } }
async function saveMember(event, form) {
  event.preventDefault();
  const formData = new FormData(form), existing = editingRecord.newMembers && dashboard.newMembers.find(item => item.id === editingRecord.newMembers), status = form.querySelector('.member-editor-status'), button = form.querySelector('.action-button.primary');
  const name = String(formData.get('name') || '').trim(), role = String(formData.get('role') || '').trim(), employmentType = String(formData.get('employmentType') || '').trim(), department = String(formData.get('department') || '').trim(), division = String(formData.get('division') || '').trim(), directManager = String(formData.get('directManager') || '').trim(), joined = String(formData.get('joined') || '').trim(), companyEmail = String(formData.get('companyEmail') || '').trim(), phone = String(formData.get('phone') || '').trim(), linkedinUrl = safeLinkedInUrl(formData.get('linkedinUrl')), photo = formData.get('memberPhoto');
  if (!name || !role || !employmentType || !department || !division || !directManager || !joined) { status.textContent = 'Complete the required employment details before saving.'; return; }
  if (linkedinUrl === null) { status.textContent = 'Use a valid linkedin.com profile URL, or leave this field empty.'; return; }
  if (photo?.name && photo.size > 2 * 1024 * 1024) { status.textContent = 'Employee photos must be 2 MB or smaller.'; return; }
  try {
    button.disabled = true; button.textContent = photo?.name ? 'Uploading photo…' : 'Saving colleague…'; status.textContent = photo?.name ? `Uploading ${photo.name}…` : 'Saving colleague…';
    const photoUrl = await uploadAnnouncementFile(photo, appIconImageTypes, 'employee photo');
    const record = { ...(existing || { id:`member-${Date.now()}`, color:'#dceeff', message:'' }), name, role, employmentType, department, division, directManager, joined, companyEmail, phone, linkedinUrl, team:department, initials:name.split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase(), photoUrl:photoUrl || existing?.photoUrl || '', photoFilename:photoUrl ? photo.name : existing?.photoFilename || '' };
    if (existing) Object.assign(existing, record); else dashboard.newMembers.unshift(record);
    editingRecord.newMembers = record.id; await saveDashboard(photoUrl ? 'Colleague and employee photo published.' : 'Colleague details published.');
  } catch (error) { status.textContent = error.message || 'The colleague could not be saved.'; button.disabled = false; button.textContent = 'Save changes'; }
}
function renderPeople() { renderContentPage('people'); }
function renderApps() { $('#view-apps').innerHTML = `<p class="view-intro">Control employee Quick Launch destinations from this workspace.</p>${renderCollection('apps')}`; }
function normaliseYouTubeVideoUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    const fromPath = url.pathname.split('/').filter(Boolean).pop() || '';
    const id = host === 'youtu.be' ? fromPath : url.searchParams.get('v') || (/^\/(?:embed|shorts)\//.test(url.pathname) ? fromPath : '');
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
  } catch { return null; }
}
function newSiTrainingVideosForm(copy) {
  const videos = [
    ['securityEnglishUrl', 'Security Awareness — English URL'],
    ['securityArabicUrl', 'Security Awareness — Arabic URL'],
    ['adminPortalTrainingUrl', 'Admin Portal Training Session URL']
  ];
  return `<article class="panel newsi-training-editor"><div class="collection-heading"><div><h2>Training video links</h2><p>Paste the approved YouTube links shown to new Si-Warians. The employee page uses privacy-enhanced YouTube embeds.</p></div></div><form id="newsi-training-videos-form" class="settings-form"><div class="form-grid">${videos.map(([name, label]) => `<label>${label}<input name="${name}" type="url" required value="${escapeHtml(copy[name] || '')}" placeholder="https://www.youtube.com/watch?v=…" /></label>`).join('')}</div><div class="form-actions"><button class="action-button primary">Save training videos</button></div></form></article>`;
}
function renderNewSi() {
  const acknowledgement = dashboard.policyAcknowledgementContent || {};
  $('#view-newsi').innerHTML = `<p class="view-intro">Everything employees see on the New Si-Warians page is managed here: policies, acknowledgement wording, first-week guidance, and help portals.</p><div class="manage-stack">${renderCollection('policies')}${renderCollection('firstWeekChecklist')}${renderCollection('supportPortals')}<article class="panel"><div class="collection-heading"><div><h2>Policy acknowledgement</h2><p>Control the exact employee-facing acknowledgement journey and confirmation statement.</p></div></div><form class="inline-editor acknowledgement-editor" id="ack-content-form"><label>Action heading<input required name="actionTitle" maxlength="120" value="${escapeHtml(acknowledgement.actionTitle || '')}" /></label><label>Instruction<textarea required name="instructionText" rows="3" maxlength="360">${escapeHtml(acknowledgement.instructionText || '')}</textarea></label><label>Context heading<input required name="beforeHeading" maxlength="80" value="${escapeHtml(acknowledgement.beforeHeading || '')}" /></label><label>Context text<textarea required name="beforeText" rows="5" maxlength="900">${escapeHtml(acknowledgement.beforeText || '')}</textarea></label><label>Confirmation statement<input required name="confirmationLabel" maxlength="160" value="${escapeHtml(acknowledgement.confirmationLabel || '')}" /></label><label>Confirmation help<input required name="confirmationHelp" maxlength="220" value="${escapeHtml(acknowledgement.confirmationHelp || '')}" /></label><label>Success heading<input required name="acceptedTitle" maxlength="100" value="${escapeHtml(acknowledgement.acceptedTitle || '')}" /></label><label>Success text<textarea required name="afterText" rows="3" maxlength="360">${escapeHtml(acknowledgement.afterText || '')}</textarea></label><div class="form-actions"><button class="action-button primary">Save acknowledgement content</button></div></form></article></div>`;
  const root = $('#view-newsi'), editors = root.querySelector('.manage-stack'), workspace = document.createElement('div');
  const copy = dashboard.newSiPageContent || {}, copyForm = document.createElement('form');
  copyForm.id = 'newsi-page-copy-form'; copyForm.hidden = true;
  newSiPageCopyTargets.forEach(name => { const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = copy[name] || ''; copyForm.append(input); });
  workspace.className = 'newsi-editor-preview-layout'; editors.before(workspace); workspace.append(editors, copyForm); editors.hidden = true; workspace.insertAdjacentHTML('beforeend', newSiTrainingVideosForm(copy)); workspace.insertAdjacentHTML('beforeend', employeePagePreview('New Si-Warians', '/new-hires.html', [['first-week','Checklist'], ['policies','Policies'], ['training','Training videos'], ['help','Support portals']], 'ack-content-form', ['policies', 'firstWeekChecklist', 'supportPortals']));
  $('#newsi-training-videos-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const videos = Object.fromEntries(Object.entries(values).map(([name, url]) => [name, normaliseYouTubeVideoUrl(url)]));
    if (Object.values(videos).some(url => !url)) { flash('Use a valid YouTube or youtu.be link for each training video.'); return; }
    dashboard.newSiPageContent = { ...dashboard.newSiPageContent, ...videos };
    await saveDashboard('New Si-Warians training videos saved and published.');
  });
  renderAcknowledgementRecords();
}
async function renderAcknowledgementRecords() {
  let root = $('#view-newsi'); if (!root) return; root = root.querySelector('.newsi-editor-preview-layout') || root;
  let panel = $('#acknowledgement-records');
  if (!panel) { root.insertAdjacentHTML('beforeend', '<article class="panel" id="acknowledgement-records"><h2>Acknowledgement records</h2><p>Loading employee confirmation records…</p></article>'); panel = $('#acknowledgement-records'); }
  try {
    const result = await api('/api/policy-acknowledgements?limit=25');
    panel.innerHTML = `<div class="collection-heading"><div><h2>Acknowledgement records</h2><p>${result.total} employee confirmation${result.total === 1 ? '' : 's'} recorded for current policy versions.</p></div></div>${result.records.length ? `<div class="list">${result.records.map(record => `<div class="list-row"><span><b>${escapeHtml(record.employee.name)}</b><small>${escapeHtml(record.employee.email)} · ${record.policies.length} policies · Confirmed ${cairo(record.acceptedAt)}</small></span><span class="record-tag">Confirmed</span></div>`).join('')}</div>` : '<p class="empty">No employee acknowledgements have been recorded yet.</p>'}`;
  } catch (error) { panel.innerHTML = `<h2>Acknowledgement records</h2><p class="notice warning">${escapeHtml(error.message)}</p>`; }
}
function renderAppearance() {
  const labels = { announcements:'Announcements', 'new-members':'Recently Joined', 'company-news':'Company news', social:'Company channels', news:'Industry pulse', moments:'Moments', knowledge:'Knowledge Hub', events:'Events & key dates', whistleblower:'Employee Voice' };
  const settings = dashboard.settings || { layout:[], hiddenWidgets:[] };
  $('#view-appearance').innerHTML = `<p class="view-intro">Control homepage section order and visibility. Shared brand files remain approved assets, while this workspace safely publishes layout changes.</p><article class="panel"><div class="collection-heading"><div><h2>Homepage sections</h2><p>Use the accessible move controls to set order. Hidden sections remain saved.</p></div><button class="action-button primary" id="save-appearance">Save layout</button></div><div class="layout-editor">${settings.layout.map((key, index) => `<div class="layout-admin-row" data-layout-key="${key}"><span><b>${escapeHtml(labels[key] || key)}</b><small>${settings.hiddenWidgets.includes(key) ? 'Hidden from employees' : 'Visible to employees'}</small></span><label class="visibility"><input type="checkbox" data-layout-visible="${key}" ${settings.hiddenWidgets.includes(key) ? '' : 'checked'} /> Visible</label><div><button type="button" class="tool-button" data-layout-move="${key}:-1" ${index === 0 ? 'disabled' : ''}>Move up</button><button type="button" class="tool-button" data-layout-move="${key}:1" ${index === settings.layout.length - 1 ? 'disabled' : ''}>Move down</button></div></div>`).join('')}</div></article>`;
}
async function saveDashboard(message, rethrow = false, recordHistory = true) {
  const previous = savedDashboard;
  try {
    dashboard = await api('/api/admin/dashboard', { method:'PATCH', body:JSON.stringify({ data:dashboard, version:dashboard._version }) });
    if (recordHistory && previous) for (const view of editablePageViews) {
      if (!pageChanged(previous, dashboard, view)) continue;
      const history = pageHistory[view];
      history.undo.push({ before:pageSnapshot(previous, view), after:pageSnapshot(dashboard, view) });
      if (history.undo.length > 20) history.undo.shift();
      history.redo.length = 0;
    }
    savedDashboard = structuredClone(dashboard);
    summary = await api('/api/admin/summary').catch(() => summary);
    flash(message);
    renderOverview(); renderContent(); contentPages.forEach(page => renderContentPage(page.view)); renderPeople(); renderNewSi(); renderApps(); renderAppearance(); updatePageTools();
  } catch (error) { flash(error.message); if (rethrow) throw error; }
}
function activeAdminView() { return document.querySelector('.admin-view.active')?.id.replace(/^view-/, '') || 'overview'; }
const pageCreateActions = {
  apps:{ key:'apps', label:'Add Quick Launch app' },
  announcements:{ key:'announcements', label:'Add announcement' },
  social:{ key:'social-card', label:'Add social card' },
  moments:{ key:'moments', label:'Add moment', preview:true },
  knowledge:{ key:'sessions', label:'Add session', preview:true },
  events:{ key:'events', label:'Add event' },
  people:{ key:'newMembers', label:'Add colleague', preview:true },
  newsi:[{ key:'policies', label:'Add policy', preview:true }, { key:'firstWeekChecklist', label:'Add checklist item', preview:true }, { key:'supportPortals', label:'Add support portal', preview:true }]
};
const pageSaveForms = { social:'social-links-form', whistleblower:'whistleblower-config-form', moments:'moments-page-copy-form', knowledge:'knowledge-page-copy-form', people:'recently-joined-page-copy-form', newsi:'ack-content-form' };
const pageImportTools = {
  knowledge:{ input:'knowledge-sessions-csv', accept:'.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain', template:'/knowledge-hub-sessions-import-template.csv', filename:'knowledge-hub-sessions-import-template.csv', action:'data-import-knowledge-sessions' },
  people:{ input:'new-members-csv', accept:'.csv,text/csv', template:'/recently-joined-import-template.csv', filename:'recently-joined-import-template.csv', action:'data-import-new-members' }
};
function pageToolbarMarkup(view, history) {
  const createActions = Array.isArray(pageCreateActions[view]) ? pageCreateActions[view] : [pageCreateActions[view]].filter(Boolean);
  const create = createActions.map(action => `<button type="button" class="admin-page-primary" ${action.preview ? `data-page-preview-add="${action.key}"` : `data-page-create="${action.key}"`}>${action.label}</button>`).join('');
  const saveForm = pageSaveForms[view];
  const hasPreview = Boolean(saveForm || createActions.some(action => action.preview));
  const importTool = pageImportTools[view];
  const editGroup = [create, saveForm ? `<button type="button" data-page-save-content="${saveForm}">Save content</button>` : '', hasPreview ? '<button type="button" data-page-preview-refresh>Refresh preview</button>' : ''].join('');
  const dataItems = `${importTool ? `<input id="${importTool.input}" type="file" accept="${importTool.accept}" hidden /><a href="${importTool.template}" download="${importTool.filename}">Download template</a><button type="button" ${importTool.action}>Import CSV</button>` : ''}<button type="button" data-page-export>Export JSON</button>`;
  const dataMenu = `<details class="admin-page-tools-menu"><summary>Data</summary><div class="admin-page-tools-menu-items" role="menu">${dataItems}</div></details>`;
  const historyGroup = `<div class="admin-page-tools-group"><button type="button" data-page-undo ${pageToolBusy || !history.undo.length ? 'disabled' : ''}>Undo</button><button type="button" data-page-redo ${pageToolBusy || !history.redo.length ? 'disabled' : ''}>Redo</button></div>`;
  const moreItems = `${view === 'knowledge' ? `<button type="button" class="admin-page-remove-all" data-page-remove-all-sessions ${dashboard.sessions?.length ? '' : 'disabled'}>Remove all sessions</button>` : ''}<button type="button" data-page-reset class="admin-page-reset" ${pageToolBusy ? 'disabled' : ''}>Reset to default</button>`;
  const moreMenu = `<details class="admin-page-tools-menu"><summary>More actions</summary><div class="admin-page-tools-menu-items" role="menu">${moreItems}</div></details>`;
  return `${editGroup ? `<div class="admin-page-tools-group">${editGroup}</div>` : ''}${historyGroup}<div class="admin-page-tools-group">${dataMenu}${moreMenu}</div>`;
}
function updatePageTools() {
  const tools = $('#admin-page-tools'), view = activeAdminView(), available = canEditContent && Boolean(pageDataKeys[view]);
  if (!tools) return;
  tools.hidden = !available;
  if (!available) return;
  const history = pageHistory[view];
  tools.querySelector('.admin-page-tools-actions').innerHTML = pageToolbarMarkup(view, history);
}
function exportPageData(view) {
  const label = $('#page-title').textContent;
  const payload = { format:'siware-admin-page-v1', page:view, label, exportedAt:new Date().toISOString(), data:pageSnapshot(savedDashboard || dashboard, view), note:'Uploaded files are referenced by URL; file binaries are not included.' };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = `siware-${view}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  flash(`${label} data exported. Uploaded files are referenced, not included.`);
}
async function stepPageHistory(view, direction) {
  const history = pageHistory[view], source = direction === 'undo' ? history.undo : history.redo, destination = direction === 'undo' ? history.redo : history.undo;
  if (pageToolBusy || !source?.length) return;
  pageToolBusy = true;
  const entry = source.pop(), previous = structuredClone(dashboard);
  applyPageSnapshot(dashboard, view, direction === 'undo' ? entry.before : entry.after);
  updatePageTools();
  try { await saveDashboard(`${direction === 'undo' ? 'Undid' : 'Redid'} the last ${$('#page-title').textContent} change.`, true, false); destination.push(entry); }
  catch { dashboard = previous; source.push(entry); }
  pageToolBusy = false;
  updatePageTools();
}
async function resetPageToDefault(view) {
  const previous = structuredClone(dashboard), label = $('#page-title').textContent;
  const response = await api('/api/admin/defaults');
  const defaults = pageSnapshot(response.defaults, view);
  if (JSON.stringify(pageSnapshot(dashboard, view)) === JSON.stringify(defaults)) { flash(`${label} already matches its default.`); return; }
  applyPageSnapshot(dashboard, view, defaults);
  try { await saveDashboard(`${label} restored to default. Use Undo to restore the previous version.`, true); }
  catch (error) { dashboard = previous; throw error; }
}
function setupPageTools() {
  const tools = $('#admin-page-tools');
  tools.addEventListener('click', event => {
    const view = activeAdminView(); if (!pageDataKeys[view]) return;
    if (event.target.closest('[data-page-export]')) exportPageData(view);
    if (event.target.closest('[data-page-undo]')) stepPageHistory(view, 'undo');
    if (event.target.closest('[data-page-redo]')) stepPageHistory(view, 'redo');
    if (event.target.closest('[data-page-reset]')) openPageResetDialog(view);
    const previewAdd = event.target.closest('[data-page-preview-add]');
    if (previewAdd) { const frame = $(`#view-${view} iframe[data-preview-auto-height]`); if (frame) openPreviewCollectionEditor(frame, previewAdd.dataset.pagePreviewAdd); }
    const saveContent = event.target.closest('[data-page-save-content]');
    if (saveContent) document.getElementById(saveContent.dataset.pageSaveContent)?.requestSubmit();
    if (event.target.closest('[data-page-preview-refresh]')) { const frame = $(`#view-${view} iframe[data-preview-auto-height]`); if (frame) frame.src = frame.src; }
    const create = event.target.closest('[data-page-create]');
    if (create) { if (create.dataset.pageCreate === 'social-card') { editingRecord.socialCard = ''; renderSocial(); } else { editingRecord[create.dataset.pageCreate] = ''; renderEditorArea(create.dataset.pageCreate); } updatePageTools(); }
    if (event.target.closest('[data-page-remove-all-sessions]')) openKnowledgeRemoveDialog();
  });
}
function openKnowledgeRemoveDialog() {
  const dialog = $('#view-knowledge .knowledge-remove-dialog');
  if (!dialog) return;
  dialog.querySelector('[name="confirmation"]').value = '';
  dialog.querySelector('.knowledge-remove-error').textContent = '';
  dialog.showModal();
  dialog.querySelector('[name="confirmation"]').focus();
}
function openPageResetDialog(view) {
  let dialog = $('#admin-reset-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog'); dialog.id = 'admin-reset-dialog'; dialog.className = 'knowledge-remove-dialog';
    dialog.innerHTML = '<form><h2 id="admin-reset-title">Reset page to default?</h2><p id="admin-reset-description"></p><label>Type RESET to confirm<input name="confirmation" autocomplete="off" spellcheck="false" required /></label><p class="knowledge-remove-error" role="alert"></p><div class="knowledge-remove-dialog-actions"><button type="button" class="action-button" data-reset-cancel>Cancel</button><button type="submit" class="action-button knowledge-remove-all">Reset page</button></div></form>';
    document.body.append(dialog);
    dialog.querySelector('[data-reset-cancel]').addEventListener('click', () => dialog.close());
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const input = dialog.querySelector('[name="confirmation"]'), error = dialog.querySelector('[role="alert"]'), button = dialog.querySelector('[type="submit"]');
      if (input.value !== 'RESET') { error.textContent = 'Type RESET exactly to restore the default.'; input.focus(); return; }
      button.disabled = true;
      try { await resetPageToDefault(dialog.dataset.view); dialog.close(); }
      catch (resetError) { error.textContent = resetError.message || 'The page could not be reset. Try again.'; }
      finally { button.disabled = false; }
    });
  }
  const label = $('#page-title').textContent;
  dialog.dataset.view = view;
  dialog.querySelector('#admin-reset-title').textContent = `Reset ${label} to default?`;
  dialog.querySelector('#admin-reset-description').textContent = view === 'knowledge'
    ? 'This replaces the saved Knowledge Hub content with the 17 sessions from your latest upload. Export a backup first if needed. You can undo the reset in this browser tab.'
    : 'This replaces the saved content on this page with its built-in starter content. Export a backup first if needed. You can undo the reset in this browser tab.';
  dialog.querySelector('[name="confirmation"]').value = '';
  dialog.querySelector('[role="alert"]').textContent = '';
  dialog.showModal();
  dialog.querySelector('[name="confirmation"]').focus();
}
function createRecord(key, form) { const record = Object.fromEntries(new FormData(form)); delete record.iconImage; delete record.policyDocument; delete record.announcementMedia; delete record.announcementAttachment; if (key === 'sessions') record.presenter = { name:'Intranet team', initials:'IT' }; if (key === 'newMembers') { record.initials = String(record.name || '').split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase(); record.team = record.department; record.message = ''; record.color = '#dceeff'; } if (key === 'firstWeekChecklist') { record.resourceUrl ||= ''; record.attachmentUrl = ''; } if (key === 'apps') record.icon = 'spark'; if (key === 'moments') record.mediaUrl = ''; return { id:`${key}-${Date.now()}`, ...record }; }
function renderEditorArea(key) { if (['policies','firstWeekChecklist','supportPortals'].includes(key)) return renderNewSi(); if (key === 'newMembers') return renderPeople(); if (key === 'apps') return renderApps(); const page = contentPages.find(entry => entry.key === key); if (page) return renderContentPage(page.view); return renderContent(); }
document.addEventListener('click', event => {
  const previewRefresh = event.target.closest('[data-preview-refresh]'), previewAnchor = event.target.closest('[data-preview-anchor]'), previewSave = event.target.closest('[data-preview-save-form]'), previewAdd = event.target.closest('[data-preview-add-key]');
  if (previewAdd) { const frame = previewAdd.closest('.employee-page-preview')?.querySelector('iframe'); if (frame) openPreviewCollectionEditor(frame, previewAdd.dataset.previewAddKey); return; }
  if (previewSave) { document.getElementById(previewSave.dataset.previewSaveForm)?.requestSubmit(); return; }
  if (previewRefresh) { const frame = previewRefresh.closest('.employee-page-preview')?.querySelector('iframe'); if (frame) frame.src = frame.src; return; }
  if (previewAnchor) { const frame = previewAnchor.closest('.employee-page-preview')?.querySelector('iframe'); if (frame) frame.src = `${frame.dataset.previewBase}#${previewAnchor.dataset.previewAnchor}`; return; }
  const edit = event.target.closest('[data-edit-record]'), add = event.target.closest('[data-new-record]'), remove = event.target.closest('[data-remove-record]'), move = event.target.closest('[data-layout-move]');
  if (edit) { const [key, id] = edit.dataset.editRecord.split(':'); editingRecord[key] = id; renderEditorArea(key); }
  if (add) { editingRecord[add.dataset.newRecord] = ''; renderEditorArea(add.dataset.newRecord); }
  if (remove && remove.dataset.removeRecord.split(':')[1] && confirm('Remove this record? This will immediately remove it from the employee intranet.')) { const [key, id] = remove.dataset.removeRecord.split(':'); dashboard[key] = dashboard[key].filter(item => item.id !== id); editingRecord[key] = ''; saveDashboard('Record removed.'); }
  if (move) { const [key, delta] = move.dataset.layoutMove.split(':'), index = dashboard.settings.layout.indexOf(key), next = index + Number(delta); if (next >= 0 && next < dashboard.settings.layout.length) [dashboard.settings.layout[index], dashboard.settings.layout[next]] = [dashboard.settings.layout[next], dashboard.settings.layout[index]]; renderAppearance(); }
  if (event.target.id === 'save-appearance') saveDashboard('Homepage layout saved.');
});
document.addEventListener('click', event => { const button = event.target.closest('[data-import-new-members]'); if (button) $('#new-members-csv')?.click(); });
document.addEventListener('change', async event => {
  const input = event.target.closest('#new-members-csv');
  if (!input) return;
  const button = document.querySelector('[data-import-new-members]'), file = input.files?.[0];
  try { if (button) { button.disabled = true; button.textContent = 'Importing…'; } await importNewMembersCsv(file); }
  catch (error) { flash(error.message || 'The employee CSV could not be imported.'); }
  finally { input.value = ''; if (button) { button.disabled = false; button.textContent = 'Import CSV'; } }
});
document.addEventListener('click', event => { const button = event.target.closest('[data-import-knowledge-sessions]'); if (button) $('#knowledge-sessions-csv')?.click(); });
document.addEventListener('change', async event => {
  const input = event.target.closest('#knowledge-sessions-csv');
  if (!input) return;
  const button = document.querySelector('[data-import-knowledge-sessions]'), file = input.files?.[0];
  try { if (button) { button.disabled = true; button.textContent = 'Importing…'; } await importKnowledgeSessionsCsv(file); }
  catch (error) { flash(error.message || 'The Knowledge Hub CSV could not be imported.', 12000); }
  finally { input.value = ''; if (button) { button.disabled = false; button.textContent = 'Import CSV'; } }
});
document.addEventListener('change', event => { if (!event.target.dataset.layoutVisible) return; const key = event.target.dataset.layoutVisible, hidden = new Set(dashboard.settings.hiddenWidgets || []); event.target.checked ? hidden.delete(key) : hidden.add(key); dashboard.settings.hiddenWidgets = [...hidden]; renderAppearance(); });
document.addEventListener('click', event => { const control = event.target.closest('[data-rich-command]'); if (!control || control.matches('select,input')) return; const editor = control.closest('form')?.querySelector('[data-rich-editor]'); if (!editor) return; editor.focus(); document.execCommand(control.dataset.richCommand, false, null); });
document.addEventListener('change', event => { const control = event.target.closest('[data-rich-command]'); if (!control || !control.matches('select,input')) return; const editor = control.closest('form')?.querySelector('[data-rich-editor]'); if (!editor) return; editor.focus(); const command = control.dataset.richCommand, value = command === 'formatBlock' ? `<${control.value}>` : control.value; document.execCommand(command, false, value); });
function renderAttachmentSelection(input) { const files = input._announcementFiles || []; let output = input.parentElement.querySelector('[data-attachment-selection]'); if (!output) { output = document.createElement('div'); output.className = 'attachment-selection'; output.dataset.attachmentSelection = ''; input.insertAdjacentElement('afterend', output); } output.innerHTML = files.length ? `<b>${files.length} file${files.length === 1 ? '' : 's'} ready to add</b>${files.map((file, index) => `<small>${escapeHtml(file.name)} · ${Math.ceil(file.size / 1024)} KB <button type="button" data-remove-selected-attachment="${index}">Remove</button></small>`).join('')}` : '<b>No new files selected</b><small>Select files together, or choose more files again to add another batch.</small>'; }
document.addEventListener('change', event => { const input = event.target.closest('input[name="announcementAttachment"]'); if (!input) return; const selected = Array.from(input.files || []), existing = input._announcementFiles || [], files = [...existing]; selected.forEach(file => { if (!files.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) files.push(file); }); input._announcementFiles = files; const transfer = new DataTransfer(); files.forEach(file => transfer.items.add(file)); input.files = transfer.files; renderAttachmentSelection(input); });
document.addEventListener('change', event => { const input = event.target.closest('input[name="momentMedia"]'), file = input?.files?.[0]; if (!input) return; if (input._previewUrl) URL.revokeObjectURL(input._previewUrl); input._previewUrl = file ? URL.createObjectURL(file) : ''; const area = input.closest('.moment-media-editor')?.querySelector('.moment-media-preview-area'); if (area) area.innerHTML = momentPreviewMarkup(input._previewUrl, file?.name || '', true); });
document.addEventListener('change', event => { const input = event.target.closest('input[name="memberPhoto"]'), file = input?.files?.[0]; if (!input) return; if (input._previewUrl) URL.revokeObjectURL(input._previewUrl); input._previewUrl = file ? URL.createObjectURL(file) : ''; const area = input.closest('.member-photo-editor')?.querySelector('.member-photo-preview-area'), initials = input.closest('form')?.querySelector('[name="name"]')?.value?.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'SW'; if (area) area.innerHTML = memberPhotoPreview(input._previewUrl, file?.name || '', initials, true); });
document.addEventListener('click', event => { const remove = event.target.closest('[data-remove-selected-attachment]'); if (!remove) return; const input = remove.closest('.attachment-selection')?.previousElementSibling; if (!(input instanceof HTMLInputElement)) return; input._announcementFiles.splice(Number(remove.dataset.removeSelectedAttachment), 1); const transfer = new DataTransfer(); input._announcementFiles.forEach(file => transfer.items.add(file)); input.files = transfer.files; renderAttachmentSelection(input); });
document.addEventListener('click', event => { const remove = event.target.closest('[data-remove-existing-attachment]'); if (!remove) return; const form = remove.closest('form'), input = form?.querySelector('input[name="announcementAttachment"]'); if (!(input instanceof HTMLInputElement)) return; input._removedAttachmentUrls ||= new Set(); input._removedAttachmentUrls.add(remove.dataset.removeExistingAttachment); remove.closest('.existing-attachment-item')?.remove(); const list = form.querySelector('[data-existing-attachments]'); if (list && !list.children.length) list.outerHTML = '<p class="attachment-removal-note">All saved attachments will be removed when you save.</p>'; });
document.addEventListener('click', event => { const remove = event.target.closest('[data-remove-policy-document]'); if (!remove) return; const form = remove.closest('form'), input = form?.querySelector('input[name="policyDocument"]'); if (!(input instanceof HTMLInputElement)) return; input._removeCurrentDocument = true; remove.closest('[data-policy-document-status]')?.replaceChildren(document.createTextNode('Current PDF will be removed from the employee page when you save.')); });
document.addEventListener('submit', event => { const form = event.target.closest('[data-editor="sessions"]'); if (!form) return; event.stopImmediatePropagation(); saveKnowledgeSession(event, form); }, true);
document.addEventListener('submit', event => { const form = event.target.closest('[data-editor="moments"]'); if (!form) return; event.stopImmediatePropagation(); saveMoment(event, form); }, true);
document.addEventListener('submit', event => { const form = event.target.closest('[data-editor="newMembers"]'); if (!form) return; event.stopImmediatePropagation(); saveMember(event, form); }, true);
document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-editor]');
  if (form) {
    event.preventDefault();
    const key = form.dataset.editor, id = editingRecord[key], record = id && dashboard[key].find(item => item.id === id), formData = new FormData(form), values = Object.fromEntries(formData), iconImage = formData.get('iconImage'), policyDocument = formData.get('policyDocument'), announcementMedia = formData.get('announcementMedia'), announcementAttachments = formData.getAll('announcementAttachment').filter(file => file?.name), attachmentInput = form.querySelector('input[name="announcementAttachment"]'), policyDocumentInput = form.querySelector('input[name="policyDocument"]'), richEditor = form.querySelector('[data-rich-editor]');
    delete values.iconImage; delete values.policyDocument; delete values.announcementMedia; delete values.announcementAttachment;
    if (richEditor) { const templateIsUnchanged = isLegacyAnnouncementTemplate(record || {}) && richEditor.innerHTML === editableAnnouncementHtml(record); if (!templateIsUnchanged) values.bodyHtml = richEditor.innerHTML; values.body = richEditor.innerText.trim(); }
    try {
      const iconUrl = ['apps','supportPortals'].includes(key) ? await uploadAppIcon(iconImage) : '';
      const policyDocumentUrl = key === 'policies' ? await uploadAnnouncementFile(policyDocument, ['application/pdf'], 'policy document') : '';
      const mediaUrl = key === 'announcements' ? await uploadAnnouncementFile(announcementMedia, announcementMediaTypes, 'photo or video') : '';
      const uploadedAttachments = key === 'announcements' ? await Promise.all(announcementAttachments.map(async file => ({ url:await uploadAnnouncementFile(file, announcementAttachmentTypes, 'attachment'), filename:file.name }))) : [];
      const iconData = iconUrl ? { iconUrl, iconFilename:iconImage.name } : {};
      const existingAttachments = record?.attachments || (record?.attachmentUrl ? [{ url:record.attachmentUrl, filename:record.attachmentFilename || savedFilename({ iconUrl:record.attachmentUrl }) }] : []);
      const removedAttachmentUrls = attachmentInput?._removedAttachmentUrls || new Set();
      const remainingAttachments = existingAttachments.filter(file => !removedAttachmentUrls.has(file.url));
      const attachmentsChanged = key === 'announcements' && (uploadedAttachments.length || removedAttachmentUrls.size);
      const announcementData = {
        ...(mediaUrl ? { mediaUrl, mediaFilename:announcementMedia.name } : {}),
        ...(attachmentsChanged ? { attachments:[...remainingAttachments, ...uploadedAttachments], attachmentUrl:'', attachmentFilename:'' } : {})
      };
      const policyUrl = key === 'policies' ? normalisePolicyUrl(values.canonicalUrl) : '';
      const policyData = key === 'policies' ? (policyDocumentUrl ? { canonicalUrl:policyDocumentUrl } : policyDocumentInput?._removeCurrentDocument ? { canonicalUrl:'' } : { canonicalUrl:policyUrl }) : {};
      if (record) Object.assign(record, values, iconData, announcementData, policyData); else { const created = createRecord(key, form); Object.assign(created, values, iconData, announcementData, policyData); dashboard[key].push(created); }
      editingRecord[key] = '';
      await saveDashboard(iconUrl ? `${key === 'supportPortals' ? 'Portal' : 'App'} icon uploaded and changes published.` : policyDocumentUrl ? 'Policy PDF uploaded and published.' : policyDocumentInput?._removeCurrentDocument ? 'Policy PDF removed from the employee page.' : key === 'policies' && policyUrl ? 'Policy link saved and published.' : mediaUrl || uploadedAttachments.length || removedAttachmentUrls.size ? 'Announcement attachments updated and published.' : 'Changes saved and published to the intranet.');
    } catch (error) { flash(error.message); }
    return;
  }
  if (event.target.id === 'ack-content-form') {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target)), copyForm = $('#newsi-page-copy-form'), pageCopy = copyForm ? Object.fromEntries(new FormData(copyForm)) : {};
    if (Object.entries(pageCopy).some(([, value]) => !String(value).trim())) { flash('Page text cannot be empty. Restore or edit the highlighted text before saving.'); return; }
    if (Object.entries(pageCopy).some(([, value]) => String(value).length > 600)) { flash('Keep each highlighted page text field under 600 characters.'); return; }
    dashboard.newSiPageContent = pageCopy;
    dashboard.policyAcknowledgementContent = { ...dashboard.policyAcknowledgementContent, ...values, version:(Number(dashboard.policyAcknowledgementContent?.version) || 1) + 1 };
    saveDashboard('New Si-Warians page content saved and published.');
  }
});
async function renderMedia() { const root = $('#view-media'); root.innerHTML = '<p class="view-intro">Loading reusable media inventory…</p>'; try { const files = await api('/api/admin/media'); root.innerHTML = `<p class="view-intro">Reusable uploads are checked for current usage before any removal. Direct destructive removal is intentionally unavailable here.</p><div class="media-grid">${files.map(file => `<article class="media-file"><b title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</b><small>${Math.ceil(file.size / 1024)} KB · ${cairo(file.modifiedAt)}</small><a class="tool-link" href="${encodeURI(file.url)}" target="_blank" rel="noopener">Open file ↗</a><span class="record-tag">${file.inUse ? 'In use' : 'Not referenced'}</span></article>`).join('') || '<p class="empty">No uploaded media yet.</p>'}</div>`; } catch (error) { root.innerHTML = `<p class="notice warning">${escapeHtml(error.message)}</p>`; } }
async function renderAccess() { const root = $('#view-access'); root.innerHTML = '<p class="view-intro">Loading roles…</p>'; try { const data = await api('/api/admin/access'); root.innerHTML = `<p class="view-intro">Roles are applied at sign-in. Content editing, publishing, access administration, audit viewing, and audit export are separated. The final administrator cannot be removed or demoted.</p><div class="section-grid"><article class="panel"><h2>Authorized access</h2>${list(data.users, user => `<div class="list-row"><span><b>${escapeHtml(user.name || user.email)}</b><small>${escapeHtml(user.email)}</small></span><span class="record-tag">${escapeHtml(user.role)}</span></div>`)}</article><article class="panel"><h2>Grant or update access</h2><form id="access-form"><div class="form-grid"><label>Name<input name="name" maxlength="80" placeholder="Employee name" /></label><label>Work email<input name="email" required type="email" placeholder="name@si-ware.com" /></label><label>Role<select name="role">${data.roles.map(role => `<option>${role}</option>`).join('')}</select></label></div><p class="notice">Only approved Google Workspace identities can sign in. This assigns an intranet role; it never changes Workspace access.</p><div class="form-actions"><button class="action-button primary">Save role</button></div></form></article></div>`; $('#access-form').addEventListener('submit', saveAccess); } catch (error) { root.innerHTML = `<p class="notice warning">${escapeHtml(error.message)}</p>`; } }
async function saveAccess(event) { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api('/api/admin/access', { method:'PATCH', body:JSON.stringify(Object.fromEntries(form)) }); flash('Access role saved. It takes effect on the person’s next sign-in.'); renderAccess(); } catch (error) { flash(error.message); } }
const auditContentLabels = { user:'Intranet profile', apps:'Main Apps · app links', announcements:'Announcements', socialLinks:'Social Media · channels', moments:'Moments · cards', momentsPageContent:'Moments · page text', sessions:'Knowledge Hub · sessions', knowledgePageContent:'Knowledge Hub · page text', events:'Events & key dates', whistleblowerConfig:'Whistleblower · guidance', newMembers:'Recently Joined · colleagues', recentlyJoinedPageContent:'Recently Joined · page text', policies:'New Si-Warians · policies', firstWeekChecklist:'New Si-Warians · first-week checklist', supportPortals:'New Si-Warians · support portals', policyAcknowledgementContent:'New Si-Warians · acknowledgement', newSiPageContent:'New Si-Warians · page text', settings:'Appearance' };
function auditChangedContent(event) { const listed = event.changes?.pages || event.changes?.fields?.map(field => auditContentLabels[field] || field); return listed?.length ? [...new Set(listed)].join(' · ') : event.resource || event.component || event.route || '—'; }
async function renderActivity() { const root = $('#view-activity'), query = root.querySelector('[name="q"]')?.value || ''; root.innerHTML = `<p class="view-intro">User activity records browser-reported navigation and controls. Audit records are authoritative server results. Anonymous whistleblower flows are deliberately excluded.</p><div class="filters"><label>Event type<select id="audit-category"><option value="audit" ${auditCategory === 'audit' ? 'selected' : ''}>Authoritative audit</option><option value="activity" ${auditCategory === 'activity' ? 'selected' : ''}>User activity</option></select></label><label class="filter-grow">Search<input id="audit-query" value="${escapeHtml(query)}" placeholder="User, action, resource…" /></label><button class="action-button" id="audit-filter">Filter</button>${auditCategory === 'audit' ? '<a class="action-button" href="/api/admin/audit/export">Export audit CSV</a>' : ''}</div><div id="audit-results"><p class="empty">Loading events…</p></div>`; try { const data = await api(`/api/admin/audit?category=${auditCategory}&q=${encodeURIComponent(query)}&page=${activityPage}`); $('#audit-results').innerHTML = `<table class="audit-table"><thead><tr><th>When (Cairo)</th><th>Actor</th><th>Action</th><th>Changed page content</th><th>Outcome</th></tr></thead><tbody>${data.records.map(event => `<tr><td>${cairo(event.serverReceivedAt || event.occurredAt)}</td><td>${escapeHtml(event.actor?.name || 'System')}</td><td>${escapeHtml(event.action || '—')}</td><td>${escapeHtml(auditChangedContent(event))}</td><td class="outcome-${escapeHtml(event.outcome || 'success')}">${escapeHtml(event.outcome || 'reported')}</td></tr>`).join('') || '<tr><td colspan="5">No matching events.</td></tr>'}</tbody></table><div class="pager"><button class="action-button" data-page="prev" ${data.page <= 1 ? 'disabled' : ''}>Previous</button><span>Page ${data.page} of ${data.pages} · ${data.total} events</span><button class="action-button" data-page="next" ${data.page >= data.pages ? 'disabled' : ''}>Next</button></div>`; } catch (error) { $('#audit-results').innerHTML = `<p class="notice warning">${escapeHtml(error.message)}</p>`; }
  $('#audit-category').addEventListener('change', event => { auditCategory = event.target.value; activityPage = 1; renderActivity(); }); $('#audit-filter').addEventListener('click', () => { activityPage = 1; renderActivity(); }); $('#audit-results').addEventListener('click', event => { const direction = event.target.dataset.page; if (!direction) return; activityPage += direction === 'next' ? 1 : -1; renderActivity(); }); }
function renderSettings() { $('#view-settings').innerHTML = `<p class="view-intro">Retention controls are deliberately limited to governance data. Credentials, SSO settings, and secrets remain environment configuration, not content-management fields.</p><div class="section-grid"><article class="panel"><h2>Retention policy</h2><form class="settings-form" id="settings-form"><div class="form-grid"><label>Audit retention (days)<input required name="auditRetentionDays" type="number" min="30" max="3650" value="${summary.settings?.auditRetentionDays || 365}" /></label><label>Activity retention (days)<input required name="activityRetentionDays" type="number" min="7" max="3650" value="${summary.settings?.activityRetentionDays || 90}" /></label></div><p class="notice">Changes are recorded in the authoritative audit trail. Cleanup applies only to aged records, never selective individual-event deletion.</p><div class="form-actions"><button class="action-button primary">Save retention policy</button></div></form></article><article class="panel"><h2>Environment security</h2><p>Google Workspace SSO is the supported authentication path. Configure <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>APP_ORIGIN</code>, <code>GOOGLE_WORKSPACE_DOMAIN</code>, <code>GOOGLE_ADMIN_EMAILS</code>, and <code>SECURE_COOKIES=true</code> outside this UI.</p><p class="notice warning">This local prototype uses JSON storage and memory-backed sessions. Use a transactional database and shared session store before production deployment.</p></article></div>`; $('#settings-form').addEventListener('submit', saveSettings); }
async function saveSettings(event) { event.preventDefault(); try { summary.settings = await api('/api/admin/settings', { method:'PATCH', body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); flash('Retention policy saved.'); renderSettings(); } catch (error) { flash(error.message); } }
function showView(name) { $$('.admin-sidebar button[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name)); $$('.admin-view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`)); const titles = { apps:'Apps', access:'Users & access', activity:'Activity & audit', newsi:'New Si-Warians', announcements:'Announcements', social:'Social Media', whistleblower:'Whistleblower', moments:'Moments' }; $('#page-title').textContent = titles[name] || name[0].toUpperCase() + name.slice(1); if (contentPages.some(page => page.view === name)) renderContentPage(name); if (name === 'newsi') renderNewSi(); if (name === 'media') renderMedia(); if (name === 'access') renderAccess(); if (name === 'activity') renderActivity(); updatePageTools(); }
async function start() { try { const me = await api('/api/auth/me'); if (!me.permissions?.some(permission => ['audit.view', 'content.edit'].includes(permission))) { location.replace('/'); return; } dashboard = await api('/api/dashboard'); savedDashboard = structuredClone(dashboard); canEditContent = me.permissions.includes('content.edit'); summary = await api('/api/admin/summary'); $('#admin-user').textContent = me.name; $('#admin-role').textContent = me.role.replace('_', ' '); $('#admin-avatar').textContent = me.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AD'; $('#admin-account-toggle').setAttribute('aria-label', `${me.name}, ${me.role.replace('_', ' ')}. Account menu`); if (!me.permissions.includes('access.manage')) $('[data-view="access"]').hidden = true; if (!me.permissions.includes('audit.view')) $('[data-view="activity"]').hidden = true; if (!me.permissions.includes('settings.manage')) $('[data-view="settings"]').hidden = true; renderOverview(); renderContent(); renderPeople(); renderApps(); renderAppearance(); renderSettings(); setupPageTools(); updatePageTools(); $$('.admin-sidebar button[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view))); document.addEventListener('click', event => { const target = event.target.closest('[data-goto]'); if (target) showView(target.dataset.goto); }); const signOut = async () => { await api('/auth/logout', { method:'POST' }); location.assign('/login.html'); }; $('#sign-out').addEventListener('click', signOut); $('#mobile-sign-out').addEventListener('click', signOut); $('#header-sign-out').addEventListener('click', signOut); } catch (_) { location.replace('/login.html?returnTo=/admin.html'); } }
function setupAdminHeader() {
  const accountButton = $('#admin-account-toggle'), accountMenu = $('#admin-account-menu');
  const searchButton = $('#admin-header-search'), searchPanel = $('#admin-header-search-panel');
  const searchInput = $('#admin-header-search-input'), searchResults = $('#admin-header-search-results');
  const closeAccount = () => { accountMenu.hidden = true; accountButton.setAttribute('aria-expanded', 'false'); };
  const closeSearch = () => { searchPanel.hidden = true; searchButton.setAttribute('aria-expanded', 'false'); };
  function updateResults() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const matches = $$('.admin-sidebar button[data-view]').filter(button => !button.hidden && button.textContent.toLocaleLowerCase().includes(query));
    searchResults.innerHTML = matches.length ? matches.map(button => `<button type="button" data-admin-search-view="${button.dataset.view}">${escapeHtml(button.textContent.trim())}</button>`).join('') : '<span class="admin-search-empty">No matching section</span>';
  }
  accountButton.addEventListener('click', () => { const opening = accountMenu.hidden; closeSearch(); accountMenu.hidden = !opening; accountButton.setAttribute('aria-expanded', String(opening)); });
  searchButton.addEventListener('click', () => { const opening = searchPanel.hidden; closeAccount(); searchPanel.hidden = !opening; searchButton.setAttribute('aria-expanded', String(opening)); if (opening) { updateResults(); searchInput.focus(); } });
  searchInput.addEventListener('input', updateResults);
  searchResults.addEventListener('click', event => { const button = event.target.closest('[data-admin-search-view]'); if (!button) return; showView(button.dataset.adminSearchView); closeSearch(); $('#page-title').scrollIntoView({ block:'start' }); });
  document.addEventListener('click', event => { if (!event.target.closest('.admin-account')) closeAccount(); if (!event.target.closest('.admin-header-search-panel, .admin-header-search')) closeSearch(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeAccount(); closeSearch(); } });
}
function setupSidebarToggle() { const shell = document.querySelector('.admin-shell'); const toggle = $('#sidebar-toggle'); if (!shell || !toggle) return; const shortLabels = { overview:'OV', content:'CT', apps:'AP', announcements:'AN', social:'SM', moments:'MO', knowledge:'KH', events:'EV', whistleblower:'WB', people:'RJ', newsi:'NS', appearance:'AR', media:'MD', access:'UA', activity:'AA', settings:'ST' }; $$('.admin-sidebar button[data-view]').forEach(button => { const label = button.textContent.trim(); button.setAttribute('aria-label', label); button.dataset.shortLabel = shortLabels[button.dataset.view] || label.slice(0, 2).toUpperCase(); }); const setCollapsed = collapsed => { shell.classList.toggle('sidebar-collapsed', collapsed); toggle.setAttribute('aria-expanded', String(!collapsed)); toggle.title = collapsed ? 'Expand navigation' : 'Collapse navigation'; toggle.querySelector('span').textContent = collapsed ? 'Expand' : 'Collapse'; try { localStorage.setItem('siware-admin-sidebar-collapsed', String(collapsed)); } catch (_) {} }; let collapsed = false; try { collapsed = localStorage.getItem('siware-admin-sidebar-collapsed') === 'true'; } catch (_) {} setCollapsed(collapsed); toggle.addEventListener('click', () => setCollapsed(!shell.classList.contains('sidebar-collapsed'))); }
function setupSidebarIcons() {
  const iconShapes = {
    overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    content:'<path d="M8 3h8l4 4v14H4V3h4Z"/><path d="M16 3v5h4M8 12h8M8 16h8"/>',
    apps:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14v7M14 17.5h7"/>',
    announcements:'<path d="M3 10h5l10-5v14L8 14H3zM8 14l1 6h4l-2-5M21 9v6"/>',
    social:'<circle cx="6" cy="12" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="m8 11 8-5M8 13l8 5"/>',
    moments:'<rect x="3" y="6" width="18" height="15" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="m7 6 1-3h8l1 3"/>',
    knowledge:'<path d="M12 6c-2-2-5-2-9-2v15c4 0 7 0 9 2 2-2 5-2 9-2V4c-4 0-7 0-9 2ZM12 6v15"/>',
    events:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 15h3M14 15h3"/>',
    whistleblower:'<path d="M12 2 4 5v6c0 5 3 9 8 11 5-2 8-6 8-11V5l-8-3Z"/><path d="M12 7v6M12 17h.01"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2c0-3 2.5-5 6-5s6 2 6 5v2H3ZM17 5a3 3 0 0 1 0 6M17 14c2.5.3 4 2 4 4v2h-3"/>',
    newsi:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2c0-3 2.5-5 6-5s6 2 6 5v2H3ZM18 7v8M14 11h8"/>',
    appearance:'<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.7-3c-.5-.8 0-2 1.1-2H18a3 3 0 0 0 3-3c0-5.5-4-10-9-10Z"/><circle cx="7.5" cy="11" r=".7"/><circle cx="10" cy="7" r=".7"/><circle cx="15" cy="7.5" r=".7"/>',
    media:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m4 18 5-5 3 3 3-4 5 6"/>',
    access:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    activity:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M10 2h4l.5 2.3 1.7.7 2-1.2 2.8 2.8-1.2 2 .7 1.7L23 11v4l-2.5.5-.7 1.7 1.2 2-2.8 2.8-2-1.2-1.7.7L14 24h-4l-.5-2.5-1.7-.7-2 1.2L3 19.2l1.2-2-.7-1.7L1 15v-4l2.5-.5.7-1.7-1.2-2L5.8 4l2 1.2 1.7-.7L10 2Z" transform="translate(1 0) scale(.92)"/>',
    open:'<path d="M13 4h7v7M20 4 10 14"/><path d="M20 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/>',
    signout:'<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10"/>'
  };
  const svg = shape => `<svg class="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shape}</svg>`;
  $$('.admin-sidebar button[data-view]').forEach(button => {
    const shape = iconShapes[button.dataset.view];
    if (!shape) return;
    button.insertAdjacentHTML('afterbegin', svg(shape));
    button.title = button.getAttribute('aria-label') || button.textContent.trim();
  });
  const footerLink = document.querySelector('.sidebar-footer a');
  const signOut = $('#sign-out');
  footerLink.insertAdjacentHTML('afterbegin', svg(iconShapes.open));
  footerLink.title = 'View intranet';
  signOut.insertAdjacentHTML('afterbegin', svg(iconShapes.signout));
  signOut.title = 'Sign out';
}
setupSidebarToggle();
setupSidebarIcons();
setupAdminHeader();
start();
