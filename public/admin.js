import { pageDataKeys, editablePageViews, pageSnapshot, applyPageSnapshot, pageChanged } from './admin-page-tools.js';
import { adminViewPermissions, adminViewCapabilities, adminActionPermissions, canOpenAdmin, rolePermissionError } from './admin-permissions.js';
import { intranetPages, intranetPagePermissions, firstAvailableIntranetPage } from './intranet-permissions.js';
import { renderAuditTrail } from './audit-trail.js';
import { renderGoogleSyncSettings } from './google-sync-settings.js';
import { mountUsersPage } from './admin-users.js';
import { defaultGlobalPageContent, normaliseGlobalPageContent, applyGlobalPageContent, loadGlobalPageContent } from './global-page-content.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let dashboard, summary, savedDashboard, canEditContent = false, pageToolBusy = false;
let grantedPermissions = new Set();
const hasAdminPermission = permission => grantedPermissions.has(permission);
const canAccessAdminView = view => Boolean(adminViewPermissions[view] && hasAdminPermission(adminViewPermissions[view]) && (adminViewCapabilities[view] ? hasAdminPermission(adminViewCapabilities[view]) : canOpenAdmin(grantedPermissions)));
const actionControlPermissions = [
  ['[data-page-undo], [data-home-undo]', 'action.undo'],
  ['[data-page-redo], [data-home-redo]', 'action.redo'],
  ['[data-page-reset], [data-home-reset]', 'action.reset'],
  ['[data-page-export]', 'action.export'],
  ['[data-page-export-csv]', 'action.export_csv'],
  ['[data-import-new-members], [data-import-knowledge-sessions], label[for="users-csv-input"]', 'action.import'],
  ['[data-remove-record], [data-remove-announcement-template], [data-remove-announcement-schedule], [data-remove-social-card], [data-home-remove-section], [data-card-delete-role], [data-delete-role], [data-page-remove-all-sessions], [data-page-delete-all-people], [data-preview-editor-remove], [data-remove-existing-attachment], [data-remove-policy-document]', 'action.delete']
];
document.addEventListener('click', event => {
  const blocked = actionControlPermissions.find(([selector, permission]) => event.target.closest(selector) && !hasAdminPermission(permission));
  if (!blocked) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  flash(`You do not have ${blocked[1]} permission.`);
}, true);
const pageHistory = Object.fromEntries(editablePageViews.map(view => [view, { undo:[], redo:[] }]));
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const cairo = value => value ? new Intl.DateTimeFormat('en', { dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Cairo' }).format(new Date(value)) : '—';
async function api(path, options = {}) { const response = await fetch(path, { credentials:'same-origin', headers:{ 'content-type':'application/json', ...(options.headers || {}) }, ...options }); const type = response.headers.get('content-type') || ''; const payload = type.includes('json') ? await response.json() : await response.text(); if (!response.ok) throw new Error(payload.error || 'The request could not be completed.'); return payload; }
const appIconImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const employeeProfilePhotoTypes = ['image/png', 'image/jpeg', 'image/webp'];
const announcementMediaTypes = [...appIconImageTypes, 'video/mp4', 'video/webm', 'video/quicktime'];
const announcementAttachmentTypes = ['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'];
const knowledgeDeckTypes = ['application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
const knowledgeRecordingTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
const knowledgeMaterialTypes = [...announcementAttachmentTypes, ...appIconImageTypes];
const momentMediaTypes = [...appIconImageTypes, 'video/mp4', 'video/webm', 'video/quicktime', 'application/pdf', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
function readImageFile(file) { if (!file?.name) return Promise.resolve(''); if (!appIconImageTypes.includes(file.type)) return Promise.reject(new Error('Choose a PNG, JPEG, WebP, or GIF image.')); if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error('App icon images must be 2 MB or smaller.')); return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The app icon image could not be read.')); reader.readAsDataURL(file); }); }
async function uploadAppIcon(file) { const dataUrl = await readImageFile(file); if (!dataUrl) return ''; return (await api('/api/uploads', { method:'POST', body:JSON.stringify({ dataUrl, filename:file.name }) })).url; }
async function uploadEmployeeProfilePhoto(file) {
  if (!file?.name) return '';
  if (!employeeProfilePhotoTypes.includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP employee photo.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Employee photos must be 10 MB or smaller.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width:image.naturalWidth, height:image.naturalHeight });
      image.onerror = () => reject(new Error('The employee photo could not be read.'));
      image.src = objectUrl;
    });
    if (Math.min(dimensions.width, dimensions.height) < 600) throw new Error('Use an employee photo that is at least 600 × 600 pixels.');
  } finally { URL.revokeObjectURL(objectUrl); }
  return uploadAnnouncementFile(file, employeeProfilePhotoTypes, 'employee photo');
}
async function uploadGlobalImage(file) {
  if (!file) return '';
  const mime = file.type || (/\.ico$/i.test(file.name) ? 'image/x-icon' : '');
  if (!['image/png','image/jpeg','image/webp','image/gif','image/x-icon','image/vnd.microsoft.icon'].includes(mime)) throw new Error('Choose a PNG, JPEG, WebP, GIF, or ICO image.');
  if (file.size > 4 * 1024 * 1024) throw new Error('Brand images must be 4 MB or smaller.');
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The image could not be read.')); reader.readAsDataURL(file); });
  return (await api('/api/uploads', { method:'POST', body:JSON.stringify({ dataUrl:dataUrl.replace(/^data:[^;]*;base64,/, `data:${mime};base64,`), filename:file.name }) })).url;
}
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
function isEmailAnnouncementHtml(html) { return /<(?:html|head|body|table|style)\b|<(?:div|section|td|tr)[^>]*\b(?:style|bgcolor)=/i.test(String(html || '')); }
function isLegacyAnnouncementTemplate(record) { return isEmailAnnouncementHtml(record.bodyHtml); }
function editableAnnouncementHtml(record) {
  const html = String(record.bodyHtml || '') || escapeHtml(record.body || ''), document = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['P','H2','H3','STRONG','B','EM','I','U','UL','OL','LI','BR','A','BLOCKQUOTE']), blocked = new Set(['STYLE','LINK','SCRIPT','IFRAME','OBJECT','EMBED','PICTURE','IMG','VIDEO','AUDIO','SVG','CANVAS','FORM','BUTTON','INPUT','SELECT','TEXTAREA']);
  [...document.body.querySelectorAll('*')].reverse().forEach(element => {
    if (blocked.has(element.tagName)) { element.remove(); return; }
    if (!allowed.has(element.tagName)) { element.replaceWith(...element.childNodes); return; }
    const href = element.tagName === 'A' ? String(element.getAttribute('href') || '').trim() : '';
    [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
    if (element.tagName === 'A' && /^(https:\/\/|\/(?!\/)|#)/i.test(href)) element.setAttribute('href', href);
  });
  return document.body.innerHTML || escapeHtml(record.body || '');
}
const announcementTimestamp = value => new Intl.DateTimeFormat('en', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', timeZone:'Africa/Cairo' }).format(value);
function flash(message, duration = 4500) { const status = $('#flash'); status.textContent = message; window.clearTimeout(flash.timeout); flash.timeout = window.setTimeout(() => { status.textContent = ''; }, duration); }
function editorLink(label = 'Open editor') { return canAccessAdminView('content') ? `<button class="action-button" type="button" data-goto="content">${label}</button>` : '<span class="record-tag">Unavailable for this role</span>'; }
function list(items, render) { return items?.length ? `<div class="list">${items.map(render).join('')}</div>` : '<p class="empty">No records yet.</p>'; }
function renderOverview() {
  const counts = summary.counts;
  const governanceView = ['access','roles','activity','settings'].find(canAccessAdminView);
  $('#view-overview').innerHTML = `<p class="view-intro">A controlled workspace for the content, people, applications, presentation, and access rules employees rely on. Changes are saved centrally and reviewed through the audit trail.</p><div class="metrics"><article class="metric"><b>${counts.announcements}</b><span>Published announcements</span></article><article class="metric"><b>${counts.people}</b><span>Recently joined colleagues</span></article><article class="metric"><b>${counts.apps}</b><span>Quick-launch applications</span></article><article class="metric"><b>${counts.media}</b><span>Reusable media files</span></article></div><div class="section-grid"><article class="panel"><h2>Recent administrative changes</h2>${canAccessAdminView('activity') ? list(summary.audit, event => `<div class="list-row"><span><b>${escapeHtml(event.action || 'Administrative change')}</b><small>${escapeHtml(event.actor?.name || 'System')} · ${cairo(event.occurredAt)}</small></span><span class="record-tag">${escapeHtml(event.outcome || 'success')}</span></div>`) : '<p class="empty">Audit access is not assigned to this role.</p>'}</article><article class="panel"><h2>Work from the right place</h2><p>Use the focused editors to protect employee-facing records from accidental structural changes.</p><div class="list"><div class="list-row"><span><b>Editorial content</b><small>Announcements, knowledge, moments, policies</small></span>${editorLink()}</div><div class="list-row"><span><b>Presentation &amp; navigation</b><small>Section order and shared layout visibility</small></span>${editorLink()}</div><div class="list-row"><span><b>Governance</b><small>Permissions, audit history and retention</small></span>${governanceView ? `<button class="action-button" data-goto="${governanceView}">Review governance</button>` : '<span class="record-tag">Unavailable for this role</span>'}</div></div></article></div>`;
  $('#view-overview .metrics .metric:nth-child(2) span').textContent = 'Colleagues in Our Team';
}
function renderManage(id, title, description, rows) { $(id).innerHTML = `<p class="view-intro">${description}</p><article class="panel">${rows.map(row => `<div class="manage-row"><div><h2>${escapeHtml(row.title)}</h2><p>${escapeHtml(row.description)}</p></div>${editorLink(row.label || 'Manage')}</div>`).join('')}</article>`; }
const editableCollections = {
  announcements: { title:'Announcements', description:'Create, edit, archive, and publish employee updates.', fields:[['title','Title'],['tag','Category'],['department','Department'],['audience','Audience']] },
  sessions: { title:'Knowledge Hub sessions', description:'Keep session details, presenters, and learning resources current.', fields:[['title','Title'],['category','Category'],['date','Date'],['outline','Outline','textarea']] },
  moments: { title:'Moments', description:'Manage the moments displayed across the intranet.', fields:[['title','Title'],['kind','Label'],['color','Accent colour','color']] },
  events: { title:'Events & key dates', description:'Maintain the employee events calendar and important company dates.', fields:[['date','Date','date'],['title','Title'],['time','Time'],['type','Location']] },
  policies: { title:'Policies', description:'Manage employee-facing policy metadata and ownership.', fields:[['title','Link text shown to employees'],['summary','Summary','textarea'],['owner','Owner'],['department','Department'],['audience','Audience'],['version','Version']] },
  newMembers: { title:'Our Team', description:'Employee directory display content only; this never grants authentication access.', fields:[['name','Name'],['role','Role'],['employmentType','Employment type'],['department','Department'],['division','Division'],['directManager','Direct manager'],['employeeId','Employee ID','text',true],['joined','Joined']] },
  firstWeekChecklist: { title:'New Si-Warians first-week checklist', description:'Manage the onboarding tasks shown on the New Si-Warians page.', fields:[['text','Task','textarea'],['resourceLabel','Resource label','text',true],['resourceUrl','Resource link','text',true],['attachmentLabel','Attachment label','text',true]] },
  apps: { title:'Quick Launch apps', description:'Manage employee application destinations and their descriptions.', fields:[['name','Name'],['caption','Description'],['url','URL'],['color','Accent colour','color']] },
  supportPortals: { title:'Support portals', description:'Manage approved employee support destinations.', fields:[['name','Name'],['description','Description','textarea'],['url','URL']] }
};
let editingRecord = {};
function recordLabel(key, record) { return record.title || record.name || record.text || record.id; }
function recordFields(key, record = {}) {
  const fields = editableCollections[key].fields.map(([name, label, type = 'text', optional = false]) => `<label>${label}${type === 'textarea' ? `<textarea name="${name}" rows="3" maxlength="5000" ${key === 'firstWeekChecklist' && name === 'text' ? 'required' : ''}>${escapeHtml(record[name] || '')}</textarea>` : `<input name="${name}" ${type === 'color' ? 'type="color"' : ''} ${optional ? '' : 'required'} value="${escapeHtml(record[name] || (type === 'color' ? '#0758a9' : ''))}" />`}</label>`).join('');
  if (key === 'firstWeekChecklist') return `${fields}<input type="hidden" name="requiresResourceLinkClick" value="false" /><label><input name="requiresResourceLinkClick" type="checkbox" value="true" ${record.requiresResourceLinkClick === true || record.requiresResourceLinkClick === 'true' ? 'checked' : ''} /> Require opening the resource link before this task can be completed</label><input type="hidden" name="requiresPolicyAcknowledgement" value="false" /><label><input name="requiresPolicyAcknowledgement" type="checkbox" value="true" ${record.requiresPolicyAcknowledgement === true || record.requiresPolicyAcknowledgement === 'true' ? 'checked' : ''} /> Require policy confirmation before this task can be completed</label><input type="hidden" name="requiresSecurityAwarenessVideo" value="false" /><label><input name="requiresSecurityAwarenessVideo" type="checkbox" value="true" ${record.requiresSecurityAwarenessVideo === true || record.requiresSecurityAwarenessVideo === 'true' ? 'checked' : ''} /> Require one Security Awareness Training video before this task can be completed</label><input type="hidden" name="requiresAdminPortalTraining" value="false" /><label><input name="requiresAdminPortalTraining" type="checkbox" value="true" ${record.requiresAdminPortalTraining === true || record.requiresAdminPortalTraining === 'true' ? 'checked' : ''} /> Require Company Portal Training before this task can be completed</label><fieldset><legend>Attachment (optional)</legend><label>Attachment link<input name="attachmentUrl" type="url" value="${escapeHtml(record.attachmentUrl || '')}" placeholder="https://… or /uploaded-file" /></label><label>Upload attachment<input name="checklistAttachment" type="file" accept="application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,image/png,image/jpeg,image/webp,image/gif" /><small>${record.attachmentUrl ? 'Choose a replacement file, replace the link, or leave both blank to remove the attachment.' : 'Add a link or upload a file. Maximum 45 MB.'}</small></label></fieldset>`;
  if (key === 'apps' || key === 'supportPortals') { const label = key === 'apps' ? 'App icon image' : 'Portal icon image'; return `${fields}<label>${label}<input name="iconImage" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /><small>${record.iconUrl ? `Current image: <b>${escapeHtml(savedFilename(record))}</b> · <a href="${escapeHtml(record.iconUrl)}" target="_blank" rel="noopener">Open image</a>. Choose a new image to replace it.` : 'Optional PNG, JPEG, WebP, or GIF. Maximum 2 MB.'}</small></label>`; }
  if (key === 'newMembers') return `${fields}<label>Original profile photo<input name="memberProfilePhoto" type="file" accept="image/png,image/jpeg,image/webp" /><small>${record.profilePhotoUrl ? `Current original: <b>${escapeHtml(savedFilename({ iconUrl:record.profilePhotoUrl }))}</b> · <a href="${escapeHtml(record.profilePhotoUrl)}" target="_blank" rel="noopener">Open image</a>. Choose a replacement to update it.` : 'Upload the original JPEG, PNG, or WebP to enable a sharp full-photo view. Minimum 600 × 600 pixels; maximum 10 MB. Google Workspace thumbnails remain unchanged.'}</small></label>`;
  if (key === 'policies') { const documentUrl = String(record.canonicalUrl || ''); const uploadedPdf = /^\/uploads\/.*\.pdf(?:$|\?)/i.test(documentUrl); return `${fields}<label>External policy link (optional)<input name="canonicalUrl" type="text" inputmode="url" value="${escapeHtml(documentUrl)}" placeholder="https://…" /><small>Paste a web or document-repository URL. Employees will see the link text above and open this URL in a new tab.</small></label><label>Upload policy PDF (optional)<input name="policyDocument" type="file" accept=".pdf,application/pdf" /><small data-policy-document-status>${uploadedPdf ? `Current PDF: <b>${escapeHtml(savedFilename({ iconUrl:documentUrl }))}</b> · <a href="${escapeHtml(documentUrl)}" target="_blank" rel="noopener">Open</a> · <button class="tool-button danger-link" type="button" data-remove-policy-document>Remove current PDF</button>. Choose a new file to replace it.` : documentUrl ? `Current external link: <a href="${escapeHtml(documentUrl)}" target="_blank" rel="noopener">Open link</a>. Uploading a PDF replaces it and gives employees the in-app PDF viewer.` : 'Upload a PDF to give employees the in-app viewer. Maximum 45 MB.'}</small></label>`; }
  if (key !== 'announcements') return fields;
  const attachments = record.attachments || (record.attachmentUrl ? [{ url:record.attachmentUrl, filename:record.attachmentFilename || savedFilename({ iconUrl:record.attachmentUrl }) }] : []);
  if (isLegacyAnnouncementTemplate(record)) {
    const html = String(record.bodyHtml || ''), missingImages = /\bsrc\s*=\s*["'](?:cid:|image(?:["']|$)|["'])/i.test(html);
    return `${fields}<section class="announcement-email-preview"><div class="announcement-email-preview-head"><div><h4>Email preview</h4><p>This copied email keeps its original layout. Select Edit email to correct its text in place.</p></div><button class="tool-button" type="button" data-edit-email> Edit email</button></div><iframe title="Announcement email preview" sandbox="allow-same-origin" data-email-preview srcdoc="${escapeHtml(html)}"></iframe><input type="hidden" name="legacyEmailHtml" data-email-html />${missingImages ? '<small>Some email images were not included in the copied email. Upload replacements using Inline photo or video below.</small>' : ''}</section><label>Inline photo or video<input name="announcementMedia" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" /><small>${record.mediaUrl ? `Current media: <b>${escapeHtml(record.mediaFilename || savedFilename({ iconUrl:record.mediaUrl }))}</b>. Choose a new file to replace it.` : 'Optional image or video shown inside the full announcement. Maximum 45 MB.'}</small></label><label>Attachments<input name="announcementAttachment" type="file" multiple accept="application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" />${existingAnnouncementAttachments(attachments)}<small>${attachments.length ? 'Remove saved files individually below. New files are added when you save.' : 'Select one or more PDF, Office document, spreadsheet, or text files. Maximum 45 MB each.'}</small></label>`;
  }
  const hasContent = Boolean(record.bodyHtml || record.body);
  const omittedTemplateImages = isLegacyAnnouncementTemplate(record) && /<(?:picture|img)\b/i.test(String(record.bodyHtml || ''));
  return `${fields}<label>Announcement text<details class="announcement-content-disclosure" ${hasContent ? '' : 'open'}><summary>${hasContent ? 'Edit announcement content' : 'Write announcement content'}</summary><div class="rich-editor"><div class="rich-toolbar" role="toolbar" aria-label="Text formatting"><button type="button" data-rich-command="bold" title="Bold"><b>B</b></button><button type="button" data-rich-command="italic" title="Italic"><i>I</i></button><button type="button" data-rich-command="underline" title="Underline"><u>U</u></button><button type="button" data-rich-command="insertUnorderedList" title="Bulleted list">• List</button><button type="button" data-rich-command="insertOrderedList" title="Numbered list">1. List</button><select data-rich-command="formatBlock" aria-label="Text style"><option value="p">Paragraph</option><option value="h2">Heading</option><option value="h3">Subheading</option></select><select data-rich-command="fontName" aria-label="Font family"><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Trebuchet MS">Trebuchet</option></select><select data-rich-command="fontSize" aria-label="Text size"><option value="3">Normal</option><option value="4">Large</option><option value="5">Extra large</option></select><input data-rich-command="foreColor" type="color" aria-label="Text color" value="#173a78" /></div><div class="rich-editor-surface" contenteditable="true" data-rich-editor aria-label="Announcement text">${editableAnnouncementHtml(record)}</div></div></details><small>${omittedTemplateImages ? 'Unreliable pasted template images are omitted. Use Inline photo or video below to add an image that will work for employees.' : hasContent ? 'Content is collapsed to keep this editor focused. Open it only when you need to edit the full announcement.' : 'Use the toolbar to format text. Employee-facing formatting is limited to safe text styles.'}</small></label><label>Inline photo or video<input name="announcementMedia" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" /><small>${record.mediaUrl ? `Current media: <b>${escapeHtml(record.mediaFilename || savedFilename({ iconUrl:record.mediaUrl }))}</b>. Choose a new file to replace it.` : 'Optional image or video shown inside the full announcement. Maximum 45 MB.'}</small></label><label>Attachments<input name="announcementAttachment" type="file" multiple accept="application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" />${existingAnnouncementAttachments(attachments)}<small>${attachments.length ? 'Remove saved files individually below. New files are added when you save.' : 'Select one or more PDF, Office document, spreadsheet, or text files. Maximum 45 MB each.'}</small></label>`;
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
function announcementScheduleDescription(schedule) {
  const at = new Date(`2000-01-01T${schedule.time || '00:00'}:00`).toLocaleTimeString('en', { hour:'numeric', minute:'2-digit' });
  if (schedule.frequency === 'once') return `Once on ${schedule.scheduledDate || 'the selected date'} at ${at} Cairo time`;
  if (schedule.frequency === 'daily') return `Every day at ${at} Cairo time`;
  if (schedule.frequency === 'monthly') return `Monthly on day ${schedule.dayOfMonth || 1} at ${at} Cairo time`;
  return `Every ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Number(schedule.dayOfWeek) || 0]} at ${at} Cairo time`;
}
function announcementScheduleRows() {
  const schedules = (dashboard.announcementSchedules || []).map(schedule => `<div class="list-row"><span><b>${escapeHtml(schedule.title)}</b><small>Scheduled · ${escapeHtml(announcementScheduleDescription(schedule))}${schedule.enabled ? '' : ' · Paused'}</small></span><div class="row-actions"><button type="button" class="tool-button" data-toggle-announcement-schedule="${escapeHtml(schedule.id)}">${schedule.enabled ? 'Pause' : 'Resume'}</button><button type="button" class="tool-button danger-link" data-remove-announcement-schedule="${escapeHtml(schedule.id)}">Remove</button></div></div>`);
  const scheduledTemplates = (dashboard.announcementTemplates || []).filter(template => template.templatePublication?.deliveryMode === 'scheduled').map(template => `<div class="list-row"><span><b>${escapeHtml(template.title)}</b><small>Scheduled · ${escapeHtml(announcementScheduleDescription(template.templatePublication))}</small></span><div class="row-actions"><button type="button" class="tool-button" data-use-announcement-template="${escapeHtml(template.id)}">Use</button><button type="button" class="tool-button" data-edit-announcement-template="${escapeHtml(template.id)}">Edit</button><button type="button" class="tool-button danger-link" data-remove-announcement-template="${escapeHtml(template.id)}">Remove</button></div></div>`);
  return schedules.length || scheduledTemplates.length ? `<p class="announcement-list-label">Scheduled announcements</p>${[...schedules, ...scheduledTemplates].join('')}` : '';
}
function announcementTemplateRows() {
  const templates = (dashboard.announcementTemplates || []).filter(template => template.templatePublication?.deliveryMode !== 'scheduled');
  return templates.length ? `<p class="announcement-list-label">Saved templates</p>${templates.map(template => `<div class="list-row"><span><b>${escapeHtml(template.title)}</b><small>Saved template · ${escapeHtml(template.tag || 'Company update')}</small></span><div class="row-actions"><button type="button" class="tool-button" data-use-announcement-template="${escapeHtml(template.id)}">Use</button><button type="button" class="tool-button" data-edit-announcement-template="${escapeHtml(template.id)}">Edit</button><button type="button" class="tool-button danger-link" data-remove-announcement-template="${escapeHtml(template.id)}">Remove</button></div></div>`).join('')}` : '';
}
function announcementSchedulePanel() {
  const schedules = dashboard.announcementSchedules || [];
  return `<article class="panel collection-panel"><div class="collection-heading"><div><h2>Scheduled announcements</h2><p>Create a reusable announcement that publishes automatically in Cairo time. Each occurrence becomes a separate employee announcement.</p></div></div><div class="collection-layout"><div class="list">${schedules.map(schedule => `<div class="list-row"><span><b>${escapeHtml(schedule.title)}</b><small>${escapeHtml(announcementScheduleDescription(schedule))}${schedule.enabled ? '' : ' · Paused'}</small></span><div class="row-actions"><button type="button" class="tool-button" data-toggle-announcement-schedule="${escapeHtml(schedule.id)}">${schedule.enabled ? 'Pause' : 'Resume'}</button><button type="button" class="tool-button danger-link" data-remove-announcement-schedule="${escapeHtml(schedule.id)}">Remove</button></div></div>`).join('') || '<p class="empty">No scheduled announcements yet.</p>'}</div><form class="inline-editor" id="announcement-schedule-form"><h3>Schedule an announcement</h3><label>Title<input name="title" required maxlength="180" placeholder="Zest for Life" /></label><label>Category<input name="tag" maxlength="80" value="Company update" /></label><label>Announcement text<textarea name="body" rows="4" maxlength="5000" required placeholder="Share the update employees should see."></textarea></label><label>Repeat<select name="frequency"><option value="daily">Every day</option><option value="weekly" selected>Every week</option><option value="monthly">Every month</option></select></label><label data-schedule-weekday>Day of week<select name="dayOfWeek">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day, index) => `<option value="${index}" ${index === 2 ? 'selected' : ''}>${day}</option>`).join('')}</select></label><label data-schedule-monthday hidden>Day of month<input name="dayOfMonth" type="number" min="1" max="31" value="1" /></label><label>Publish time<input name="time" type="time" required value="11:00" /></label><label>Department<input name="department" maxlength="120" value="All departments" /></label><label>Audience<input name="audience" maxlength="120" value="All employees" /></label><div class="form-actions"><button class="action-button primary">Save schedule</button></div></form></div></article>`;
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
    employeeId:csvValue(row, columns, ['employee id', 'employee number', 'employee code']) || existing?.employeeId || '',
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
  await saveDashboard(`CSV imported: ${created.length} added and ${updated} updated.`, true, true, 'import');
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
  try { await saveDashboard(message, true, true, 'import'); } catch (error) { dashboard.sessions = previousSessions; throw error; }
  flash(message, 12000);
}
const contentPages = [
  { view:'apps', key:'apps', title:'Main Apps', description:'Manage the applications employees launch from the intranet.' },
  { view:'announcements', key:'announcements', title:'Announcements', description:'Create and publish the employee updates displayed at the top of the intranet.' },
  { view:'social', key:'socialLinks', title:'Social Media', description:'Maintain the official channels employees can open from the Social Media page.' },
  { view:'moments', key:'moments', title:'Moments', description:'Curate the team moments and milestones shown in the employee gallery.' },
  { view:'knowledge', key:'sessions', title:'Knowledge Hub', description:'Maintain the sessions, learning resources, and practical know-how employees can explore.' },
  { view:'events', key:'events', title:'Events & key dates', description:'Publish company events, deadlines, and important dates.' },
  { view:'whistleblower', key:'whistleblowerConfig', title:'Whistleblower', description:'Manage the Employee Voice and Google Form reporting routes, including which route employees can access.' },
  { view:'people', key:'newMembers', title:'Our Team', description:'Manage the employee directory and profile cards for all colleagues.' },
  { view:'newsi', key:'policies', title:'New Si-Warians', description:'Manage the onboarding, policies, and acknowledgement content for new colleagues.' }
];
function renderContent() {
  $('#view-content').innerHTML = `<p class="view-intro">Choose the employee page you want to manage. Each editor is kept separate so changes stay focused, easier to review, and safer to publish.</p><div class="page-editor-grid">${contentPages.filter(page => canAccessAdminView(page.view)).map(page => { const records = page.key === 'socialLinks' ? 4 : page.key === 'whistleblowerConfig' ? 1 : dashboard[page.key]?.length || 0; const noun = page.key === 'socialLinks' ? 'channel' : page.key === 'whistleblowerConfig' ? 'protected route' : 'record'; return `<article class="panel page-editor-card"><div><span class="page-editor-eyebrow">Employee page</span><h2>${page.title}</h2><p>${page.description}</p><small>${records} ${noun}${records === 1 ? '' : 's'} available</small></div><button class="action-button" type="button" data-goto="${page.view}">Manage ${page.title}</button></article>`; }).join('')}</div>`;
}
function employeePagePreview(title, href, sections = [], saveFormId = '', directKeys = []) {
  const previewSections = sections.length ? `<div class="employee-preview-sections" aria-label="Preview section">${sections.map(([id, label]) => `<button type="button" data-preview-anchor="${id}">${label}</button>`).join('')}</div>` : '';
  const actions = '';
  const note = href === '/' ? 'Click the hero text or a highlighted card to edit it. Choose a section position on the left to move it anywhere on Home.' : href === '/apps.html' ? 'Drag an app card to a new position, or use its move controls. Select the card itself to edit its details.' : href === '/social-media.html' ? 'Select a channel to update its link or upload an icon. Saving from that editor publishes the change immediately.' : href === '/moments.html' ? 'Click the page heading or description to change the text, then select Save content. Select a card to edit a moment.' : href === '/knowledge-hub.html' ? 'Click the page or library heading and description to edit text, then select Save content. Select a session row to edit their details.' : href === '/events.html' ? 'Select Add event to publish a date. Choose a calendar day and select an event to edit it. Click the page heading or description to edit them, then select Save content.' : href === '/recently-joined.html' ? 'Click highlighted page text to edit it, then select Save content. Select a colleague card to edit their details.' : href === '/new-hires.html' ? 'Edit highlighted text and use the Edit buttons inside the preview for messages and video links. Select Save content to publish.' : directKeys.length ? 'Select any item to edit or remove it here. Use Add to create a new item in this employee-page preview.' : saveFormId ? 'Click a highlighted text area to edit it here, then save content to publish your changes.' : 'This is the published employee view. Save your changes, then refresh the preview.';
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
const whistlePreviewTargets = { heroTitle:'[data-whistle="heroTitle"]', heroText:'[data-whistle="heroText"]', safetyTitle:'[data-whistle="safetyTitle"]', safetyText:'[data-whistle="safetyText"]', navTitle:'.policy-nav>p', navHow:'.policy-nav a[href="#how-it-works"]', navPrepare:'.policy-nav a[href="#prepare"]', navPrivacy:'.policy-nav a[href="#privacy"]', navSupport:'.policy-nav a[href="#support"]', howTitle:'#how-it-works h2', howText:'#how-it-works>p', howOpenTitle:'#how-it-works .reporting-paths li:nth-child(1) b', howOpenText:'#how-it-works .reporting-paths li:nth-child(1) span', howDescribeTitle:'#how-it-works .reporting-paths li:nth-child(2) b', howDescribeText:'#how-it-works .reporting-paths li:nth-child(2) span', howFollowTitle:'#how-it-works .reporting-paths li:nth-child(3) b', howFollowText:'#how-it-works .reporting-paths li:nth-child(3) span', howReadyTitle:'#how-it-works .employee-voice-action b', howReadyText:'#how-it-works .employee-voice-action p', voiceButton:'#how-it-works [data-open-voice]', prepareTitle:'#prepare h2', prepareText:'#prepare>p', prepareItem1:'#prepare li:nth-child(1)', prepareItem2:'#prepare li:nth-child(2)', prepareItem3:'#prepare li:nth-child(3)', prepareItem4:'#prepare li:nth-child(4)', privacyTitle:'#privacy h2', privacyText1:'#privacy>p:nth-of-type(1)', privacyText2:'#privacy>p:nth-of-type(2)', supportTitle:'#support h2', supportText:'#support>p' };
function enableWhistleblowerPreviewEditing(frame) {
  if (frame.dataset.previewBase !== '/whistleblower.html') return;
  try {
    const doc = frame.contentDocument, form = $('#whistleblower-config-form'); if (!doc || !form || doc.querySelector('#admin-preview-edit-style')) return;
    const style = doc.createElement('style'); style.id = 'admin-preview-edit-style'; style.textContent = '[data-admin-preview-editable]{outline:2px dashed transparent;outline-offset:6px;cursor:text;transition:outline-color .16s ease,background .16s ease}[data-admin-preview-editable]:hover{outline-color:#0b7aa7;background:rgb(204 244 248 / 45%)}[data-admin-preview-editable]:focus{outline:3px solid #0b7aa7;background:rgb(204 244 248 / 62%)}'; doc.head.append(style);
    Object.entries(whistlePreviewTargets).forEach(([key, selector]) => { const element = doc.querySelector(selector); if (!element) return; let input = form.elements.namedItem(key); if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) { input = document.createElement('input'); input.type = 'hidden'; input.name = key; input.value = dashboard.whistleblowerConfig?.[key] || element.innerText.trim(); form.append(input); } element.contentEditable = 'true'; element.dataset.adminPreviewEditable = key; element.setAttribute('aria-label', `Edit ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`); element.addEventListener('input', () => { input.value = element.innerText.trim(); form.dataset.previewDirty = 'true'; fitEmployeePagePreview(frame); }); });
  } catch (_) {}
}
const whistleblower2PreviewTargets = { heroTitle:'[data-whistle2="heroTitle"]', heroText:'[data-whistle2="heroText"]', safetyTitle:'[data-whistle2="safetyTitle"]', safetyText:'[data-whistle2="safetyText"]', formTitle:'[data-whistle2="formTitle"]', formText:'[data-whistle2="formText"]' };
function enableWhistleblower2PreviewEditing(frame) {
  if (frame.dataset.previewBase !== '/whistleblower-2.html') return;
  try {
    const doc = frame.contentDocument, form = $('#whistleblower2-config-form'); if (!doc || !form || doc.querySelector('#admin-preview-whistleblower2-style')) return;
    const style = doc.createElement('style'); style.id = 'admin-preview-whistleblower2-style'; style.textContent = '[data-admin-preview-editable]{outline:2px dashed transparent;outline-offset:6px;cursor:text;transition:outline-color .16s ease,background .16s ease}[data-admin-preview-editable]:hover{outline-color:#0b7aa7;background:rgb(204 244 248 / 45%)}[data-admin-preview-editable]:focus{outline:3px solid #0b7aa7;background:rgb(204 244 248 / 62%)}.admin-preview-route-control{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;margin:16px 0;padding:12px;border:1px solid #9fc2ec;border-radius:9px;background:#edf7ff;color:#143d6c;font-family:Manrope,Arial,sans-serif}.admin-preview-route-control label{display:grid;gap:5px;font-size:11px;font-weight:800}.admin-preview-route-control input{box-sizing:border-box;width:100%;min-height:36px;border:1px solid #9fc2ec;border-radius:7px;background:#fff;color:#102c52;padding:8px 9px;font:600 12px inherit}.admin-preview-route-control button{min-height:36px;border:1px solid #1458b6;border-radius:7px;background:#1458b6;color:#fff;padding:8px 10px;font:800 11px inherit;cursor:pointer}.admin-preview-route-control small{grid-column:1/-1;color:#426486;font-size:10px;line-height:1.4}@media(max-width:620px){.admin-preview-route-control{grid-template-columns:1fr}.admin-preview-route-control button{justify-self:start}}'; doc.head.append(style);
    Object.entries(whistleblower2PreviewTargets).forEach(([key, selector]) => { const element = doc.querySelector(selector), input = form.elements.namedItem(key); if (!element || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return; element.contentEditable = 'true'; element.dataset.adminPreviewEditable = key; element.setAttribute('aria-label', `Edit ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`); element.title = 'Click to edit this text'; element.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); }); element.addEventListener('input', () => { input.value = element.innerText.replace(/\s+/g, ' ').trim(); form.dataset.previewDirty = 'true'; fitEmployeePagePreview(frame); }); });
    const formUrl = form.elements.namedItem('formUrl'), report = doc.querySelector('#report');
    if (report && formUrl instanceof HTMLInputElement && !doc.querySelector('.admin-preview-route-control')) {
      const control = doc.createElement('section');
      control.className = 'admin-preview-route-control';
      control.innerHTML = '<label>Google Form link<input type="url" inputmode="url" aria-label="Google Form link" /></label><button type="button">Save form link</button><small>This secure link is used for the embedded form and the Open in Google Forms action.</small>';
      const input = control.querySelector('input'), save = control.querySelector('button');
      input.value = formUrl.value;
      input.addEventListener('input', () => { formUrl.value = input.value.trim(); form.dataset.previewDirty = 'true'; });
      save.addEventListener('click', () => form.requestSubmit());
      report.querySelector('.whistleblower-form-heading')?.insertAdjacentElement('afterend', control);
    }
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
  sectionTitle:'#recently-joined > h2', sectionText:'#recently-joined > p'
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
      input.value = element.innerText.replace(/\s+/g, ' ').trim();
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
  apps:{ base:'/apps.html', selector:'.app-directory-card, .destination-app-item', records:items => items },
  moments:{ base:'/moments.html', selector:'.moment-page-card', records:items => items },
  sessions:{ base:'/knowledge-hub.html', selector:'.knowledge-register tbody tr', records:items => items.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))) },
  events:{ base:'/events.html', selector:'.event-page-open', records:items => items },
  newMembers:{ base:'/recently-joined.html', selector:'.new-member-announcement', records:items => items },
  policies:{ base:'/new-hires.html', selector:'.policy-detail-card', records:items => items },
  firstWeekChecklist:{ base:'/new-hires.html', selector:'#first-week-checklist > li', records:items => items },
  supportPortals:{ base:'/new-hires.html', selector:'#company-portals > .company-portal-card', records:items => items }
};
function previewFieldsFor(key, record = {}) {
  const fields = editableCollections[key]?.fields || [];
  return key === 'sessions' ? [['title','Title'], ['presenterName','Presenter'], ...fields.filter(([name]) => name !== 'title')] : fields;
}
function previewValue(record, key, name) {
  if (key === 'sessions' && name === 'presenterName') return record.presenter?.name || '';
  if (key === 'events' && name === 'date') {
    const date = record.startsAt ? new Date(record.startsAt) : null;
    if (date && !Number.isNaN(date.valueOf())) {
      const parts = new Intl.DateTimeFormat('en', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
      const part = type => parts.find(item => item.type === type)?.value;
      return `${part('year')}-${part('month')}-${part('day')}`;
    }
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].findIndex(item => item.toLowerCase() === String(record.month || '').slice(0, 3).toLowerCase());
    return month >= 0 && Number(record.day) > 0 ? `${new Date().getFullYear()}-${String(month + 1).padStart(2, '0')}-${String(record.day).padStart(2, '0')}` : '';
  }
  return record[name] || '';
}
function previewRecordFromValues(key, values, record = {}) {
  const next = { ...record, ...values };
  if (key === 'events') { const date = values.date; next.startsAt = `${date}T12:00:00Z`; next.day = String(Number(date.slice(8, 10))); next.month = new Intl.DateTimeFormat('en', { month:'short', timeZone:'UTC' }).format(new Date(`${date}T12:00:00Z`)); delete next.date; }
  if (key === 'sessions') { next.presenter = { name:String(values.presenterName || '').trim(), initials:String(values.presenterName || '').trim().split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0,2).toUpperCase() || 'SW' }; delete next.presenterName; }
  if (key === 'newMembers') { next.team = values.department; next.initials = String(values.name || '').trim().split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0,2).toUpperCase(); next.color ||= '#dceeff'; next.message ||= ''; }
  if (key === 'apps') next.icon ||= 'spark';
  if (key === 'moments') next.mediaUrl ||= '';
  if (key === 'firstWeekChecklist') { next.resourceUrl ||= ''; next.attachmentUrl ||= ''; }
  return next;
}
async function savePreviewCollectionRecord(key, values, existing) {
  const fields = previewFieldsFor(key), missing = fields.filter(([name,, type = 'text', optional = false]) => !optional && !String(values[name] || '').trim()).map(([, label]) => label);
  if (missing.length) throw new Error(`Complete: ${missing.join(', ')}.`);
  if (key === 'events') {
    const date = String(values.date || ''), parsed = new Date(`${date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Choose a valid event date.');
  }
  if (key === 'sessions' && duplicateKnowledgeSession(values.title, existing?.id)) throw new Error('A Knowledge Hub session with this title already exists. Use a different title or edit the existing session.');
  if (key === 'firstWeekChecklist' && values.requiresResourceLinkClick === 'true' && !String(values.resourceUrl || '').trim()) throw new Error('Add a resource link before requiring employees to open it.');
  const media = values.momentMedia, photo = values.memberPhoto, iconImage = values.iconImage, policyDocument = values.policyDocument, checklistAttachment = values.checklistAttachment, deck = values.knowledgeDeck, recording = values.knowledgeRecording, materials = values.knowledgeMaterials; delete values.momentMedia; delete values.memberPhoto; delete values.iconImage; delete values.policyDocument; delete values.checklistAttachment; delete values.knowledgeDeck; delete values.knowledgeRecording; delete values.knowledgeMaterials;
  const mediaUrl = key === 'moments' && media?.name ? await uploadAnnouncementFile(media, momentMediaTypes, 'moment media') : '';
  if (key === 'newMembers') { const linkedinUrl = safeLinkedInUrl(values.linkedinUrl); if (linkedinUrl === null) throw new Error('Use a valid linkedin.com profile URL, or leave this field blank.'); values.linkedinUrl = linkedinUrl; }
  const profilePhotoUrl = key === 'newMembers' ? await uploadEmployeeProfilePhoto(photo) : '';
  const iconUrl = ['apps','supportPortals'].includes(key) && iconImage?.name ? await uploadAppIcon(iconImage) : '';
  const policyUrl = key === 'policies' ? normalisePolicyUrl(values.canonicalUrl) : '';
  const policyDocumentUrl = key === 'policies' && policyDocument?.name ? await uploadAnnouncementFile(policyDocument, ['application/pdf'], 'policy document') : '';
  const checklistAttachmentUrl = key === 'firstWeekChecklist' && checklistAttachment?.name ? await uploadAnnouncementFile(checklistAttachment, knowledgeMaterialTypes, 'checklist attachment') : '';
  const presentationDeckUrl = key === 'sessions' ? safeKnowledgeAdminLink(values.presentationDeckUrl) : '', recordingUrl = key === 'sessions' ? safeKnowledgeAdminLink(values.recordingUrl) : '', supportingMaterialsUrl = key === 'sessions' ? safeKnowledgeAdminLink(values.supportingMaterialsUrl) : '';
  if ([presentationDeckUrl, recordingUrl, supportingMaterialsUrl].includes(null)) throw new Error('Use an https:// link, an intranet path, or an anchor for learning resources.');
  const [deckUpload, recordingUpload, materialsUpload] = key === 'sessions' ? await Promise.all([uploadAnnouncementFile(deck, knowledgeDeckTypes, 'presentation deck'), uploadAnnouncementFile(recording, knowledgeRecordingTypes, 'session recording'), uploadAnnouncementFile(materials, knowledgeMaterialTypes, 'supporting materials')]) : ['', '', ''];
  const collection = dashboard[key] ||= [], record = previewRecordFromValues(key, values, existing || { id:`${key}-${Date.now()}` });
  if (mediaUrl) { record.mediaUrl = mediaUrl; record.mediaFilename = media.name; }
  if (profilePhotoUrl) { record.profilePhotoUrl = profilePhotoUrl; record.profilePhotoFilename = photo.name; record.intranetOverrides = { ...(record.intranetOverrides || {}), profilePhotoUrl:true }; }
  if (iconUrl) { record.iconUrl = iconUrl; record.iconFilename = iconImage.name; }
  if (key === 'policies') record.canonicalUrl = policyDocumentUrl || policyUrl || '';
  if (key === 'firstWeekChecklist' && checklistAttachmentUrl) record.attachmentUrl = checklistAttachmentUrl;
  if (key === 'sessions') Object.assign(record, { presentationDeckUrl:deckUpload || presentationDeckUrl || existing?.presentationDeckUrl || '', presentationFilename:deckUpload ? deck.name : (presentationDeckUrl ? '' : existing?.presentationFilename || ''), recordingUrl:recordingUpload || recordingUrl || existing?.recordingUrl || '', recordingFilename:recordingUpload ? recording.name : (recordingUrl ? '' : existing?.recordingFilename || ''), supportingMaterialsUrl:materialsUpload || supportingMaterialsUrl || existing?.supportingMaterialsUrl || '', supportingMaterialsFilename:materialsUpload ? materials.name : (supportingMaterialsUrl ? '' : existing?.supportingMaterialsFilename || '') });
  if (existing) Object.assign(existing, record); else collection.push(record);
  await saveDashboard(mediaUrl ? 'Moment and featured media published.' : profilePhotoUrl ? 'Original employee photo uploaded and published.' : iconUrl ? `${key === 'supportPortals' ? 'Portal' : 'App'} icon uploaded and published.` : policyDocumentUrl ? 'Policy PDF uploaded and published.' : key === 'policies' && policyUrl ? 'Policy link saved and published.' : deckUpload || recordingUpload || materialsUpload ? 'Knowledge Hub resources updated and published.' : existing ? `${editableCollections[key].title} updated and published.` : `${editableCollections[key].title} added and published.`, true);
  window.dispatchEvent(new CustomEvent('admin:preview-collection-saved', { detail:{ key } }));
}
window.addEventListener('admin:preview-collection-saved', event => {
  const view = ({ policies:'newsi', firstWeekChecklist:'newsi', supportPortals:'newsi', sessions:'knowledge', events:'events', newMembers:'people', apps:'apps', moments:'moments' })[event.detail?.key];
  const frame = view && document.querySelector(`#view-${view} iframe[data-preview-auto-height]`);
  if (frame) {
    const previewUrl = new URL(frame.dataset.previewBase || frame.src, window.location.origin);
    previewUrl.searchParams.set('adminPreview', String(Date.now()));
    frame.src = previewUrl.href;
  }
});
function openPreviewCollectionEditor(frame, key, record = null) {
  const doc = frame.contentDocument, target = previewCollectionTargets[key]; if (!doc || !target) return;
  const pageScrollY = window.scrollY;
  const visiblePreviewTop = Math.max(16, -frame.getBoundingClientRect().top + 16);
  let editor = doc.querySelector('#admin-preview-collection-editor');
  if (!editor) { editor = doc.createElement('form'); editor.id = 'admin-preview-collection-editor'; editor.className = 'admin-preview-collection-editor'; editor.noValidate = true; editor.innerHTML = '<div class="admin-preview-collection-editor-head"><b data-preview-editor-title></b><button type="button" data-preview-editor-close aria-label="Close editor">Close</button></div><div data-preview-editor-fields></div><p data-preview-editor-status role="status"></p><div class="admin-preview-collection-editor-actions"><button type="button" data-preview-editor-remove>Remove</button><button type="submit">Save changes</button></div>'; doc.body.append(editor); editor.querySelector('[data-preview-editor-close]').addEventListener('click', () => editor.hidden = true); doc.addEventListener('keydown', event => { if (event.key === 'Escape' && !editor.hidden) { event.preventDefault(); editor.hidden = true; } }); editor.addEventListener('submit', async event => { event.preventDefault(); const activeKey = editor.dataset.key, id = editor.dataset.id || '', values = Object.fromEntries(new FormData(editor)); const existing = dashboard[activeKey]?.find(item => item.id === id); const status = editor.querySelector('[data-preview-editor-status]'), save = editor.querySelector('button[type="submit"]'); try { save.disabled = true; status.textContent = 'Saving changes…'; await savePreviewCollectionRecord(activeKey, values, existing); } catch (error) { status.textContent = error.message || 'This item could not be saved.'; save.disabled = false; } }); editor.querySelector('[data-preview-editor-remove]').addEventListener('click', async () => { const activeKey = editor.dataset.key, id = editor.dataset.id; if (!id) return; const index = dashboard[activeKey]?.findIndex(item => item.id === id); if (index < 0 || !window.confirm('Remove this item from the employee page?')) return; dashboard[activeKey].splice(index, 1); await saveDashboard(`${editableCollections[activeKey].title} item removed.`); }); }
  const fields = previewFieldsFor(key, record || {}), fieldsRoot = editor.querySelector('[data-preview-editor-fields]'); editor.dataset.key = key; editor.dataset.id = record?.id || ''; editor.querySelector('[data-preview-editor-title]').textContent = record ? `Edit ${recordLabel(key, record)}` : `Add ${editableCollections[key].title.replace(/s$/, '')}`; fieldsRoot.replaceChildren(); fields.forEach(([name, label, type = 'text', optional = false]) => { const wrap = doc.createElement('label'); wrap.textContent = label; const value = String(previewValue(record || {}, key, name) || (type === 'color' ? '#0758a9' : '')); if (type === 'color') { const control = doc.createElement('div'), picker = doc.createElement('input'), hex = doc.createElement('input'), palette = doc.createElement('div'); control.className = 'admin-preview-colour-control'; picker.name = name; picker.type = 'color'; picker.value = value; picker.required = true; hex.type = 'text'; hex.value = value; hex.maxLength = 7; hex.setAttribute('aria-label', `${label} hex value`); palette.className = 'admin-preview-colour-palette'; ['#0758a9','#00a99d','#ea4335','#f59e0b','#7c5cff','#334155','#111827'].forEach(colour => { const swatch = doc.createElement('button'); swatch.type = 'button'; swatch.style.background = colour; swatch.setAttribute('aria-label', `Use ${colour}`); swatch.addEventListener('click', () => { picker.value = colour; hex.value = colour; }); palette.append(swatch); }); picker.addEventListener('input', () => hex.value = picker.value); hex.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) picker.value = hex.value; }); control.append(picker, hex); wrap.append(control, palette); } else { const input = type === 'textarea' ? doc.createElement('textarea') : doc.createElement('input'); input.name = name; input.required = type !== 'textarea' && !optional; if (input instanceof HTMLInputElement && /URL|link/i.test(label)) input.type = 'url'; if (input instanceof HTMLInputElement && name === 'date') input.type = 'date'; input.value = value; if (type === 'textarea') input.rows = 3; wrap.append(input); } fieldsRoot.append(wrap); }); if (key === 'policies') { const group = doc.createElement('fieldset'), legend = doc.createElement('legend'), link = doc.createElement('label'), url = doc.createElement('input'), file = doc.createElement('label'), upload = doc.createElement('input'), help = doc.createElement('small'); legend.textContent = 'Policy document'; link.textContent = 'Policy URL (optional)'; url.name = 'canonicalUrl'; url.type = 'text'; url.inputMode = 'url'; url.value = record?.canonicalUrl || ''; url.placeholder = 'https://… or /uploads/policy.pdf'; link.append(url); file.textContent = 'Upload PDF (optional)'; upload.name = 'policyDocument'; upload.type = 'file'; upload.accept = '.pdf,application/pdf'; help.textContent = record?.canonicalUrl ? 'A PDF upload replaces the current link. To clear it, save with the URL empty.' : 'Add an approved link or upload an employee-facing PDF. Maximum 45 MB.'; file.append(upload, help); group.append(legend, link, file); fieldsRoot.append(group); } if (key === 'moments') { const upload = doc.createElement('label'), input = doc.createElement('input'), help = doc.createElement('small'); upload.textContent = 'Featured media'; input.name = 'momentMedia'; input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'; input.required = false; help.textContent = record?.mediaUrl ? 'Choose a file to replace the current featured media.' : 'Optional image, video, PDF, or presentation. Maximum 45 MB.'; upload.append(input, help); fieldsRoot.append(upload); } if (key === 'newMembers') { [['Company email','companyEmail','email'], ['Phone number','phone','tel'], ['LinkedIn profile','linkedinUrl','url']].forEach(([label, name, type]) => { const wrap = doc.createElement('label'), input = doc.createElement('input'); wrap.textContent = label; input.name = name; input.type = type; input.value = record?.[name] || ''; input.required = false; wrap.append(input); fieldsRoot.append(wrap); }); const upload = doc.createElement('label'), input = doc.createElement('input'), help = doc.createElement('small'); upload.textContent = 'Employee photo'; input.name = 'memberPhoto'; input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/gif'; input.required = false; help.textContent = record?.photoUrl ? 'Choose a new image to replace the current employee photo.' : 'Optional PNG, JPEG, WebP, or GIF. Maximum 2 MB.'; upload.append(input, help); fieldsRoot.append(upload); } if (key === 'sessions') { [['Presentation deck','presentationDeckUrl','knowledgeDeck','application/pdf,.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',record?.presentationDeckUrl], ['Session recording','recordingUrl','knowledgeRecording','video/mp4,video/webm,video/quicktime',record?.recordingUrl], ['Supporting materials','supportingMaterialsUrl','knowledgeMaterials','.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,image/png,image/jpeg,image/webp,image/gif',record?.supportingMaterialsUrl]].forEach(([label, urlName, fileName, accept, value]) => { const group = doc.createElement('fieldset'), legend = doc.createElement('legend'), link = doc.createElement('label'), url = doc.createElement('input'), file = doc.createElement('label'), upload = doc.createElement('input'), help = doc.createElement('small'); legend.textContent = label; link.textContent = 'URL (optional)'; url.name = urlName; url.type = 'url'; url.value = value || ''; url.placeholder = 'https://… or /uploaded-file'; link.append(url); file.textContent = 'Upload file (optional)'; upload.name = fileName; upload.type = 'file'; upload.accept = accept; help.textContent = value ? 'Choose a replacement file, or replace the URL.' : 'Add a link or choose a file to upload.'; file.append(upload, help); group.append(legend, link, file); fieldsRoot.append(group); }); } editor.querySelector('[data-preview-editor-status]').textContent = ''; editor.querySelector('[data-preview-editor-remove]').hidden = !record; editor.hidden = false; editor.querySelector('input,textarea')?.focus();
  if (key === 'firstWeekChecklist') {
    const resourceGate = doc.createElement('label'), fallback = doc.createElement('input'), checkbox = doc.createElement('input');
    resourceGate.textContent = 'Require opening the resource link before this task can be completed';
    fallback.type = 'hidden'; fallback.name = 'requiresResourceLinkClick'; fallback.value = 'false';
    checkbox.type = 'checkbox'; checkbox.name = 'requiresResourceLinkClick'; checkbox.value = 'true';
    checkbox.checked = record?.requiresResourceLinkClick === true || record?.requiresResourceLinkClick === 'true';
    resourceGate.prepend(fallback, checkbox);
    fieldsRoot.append(resourceGate);
  }
  if (!editor.dataset.previewSaveClickBound) {
    editor.dataset.previewSaveClickBound = 'true';
    editor.querySelector('button[type="submit"]')?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      editor.dispatchEvent(new doc.defaultView.Event('submit', { bubbles:true, cancelable:true }));
    }, true);
  }
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
  if (key === 'events') {
    editor.querySelector('[data-preview-editor-title]').textContent = record ? `Edit ${record.title}` : 'Add event';
    if (!record) {
      const parts = new Intl.DateTimeFormat('en', { timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date());
      const part = type => parts.find(item => item.type === type)?.value;
      fieldsRoot.querySelector('[name="date"]').value = doc.querySelector('#events-page-calendar-input')?.value || `${part('year')}-${part('month')}-${part('day')}`;
    }
    if (record?.source === 'google-calendar') {
      const notice = doc.createElement('p'); notice.className = 'admin-preview-event-source-note';
      notice.textContent = 'This event is synced from Google Calendar. Changes here may be replaced at the next sync; update the source calendar for lasting changes.';
      fieldsRoot.prepend(notice);
    }
  }
  if (key === 'newMembers') editor.querySelector('[data-preview-editor-remove]').textContent = 'Delete colleague';
  // The preview iframe is expanded to the full employee page. A fixed editor would
  // stay at the iframe's top and disappear when a lower session is selected.
  const viewportHeight = window.innerHeight || 800;
  editor.style.position = 'absolute';
  editor.style.top = `${visiblePreviewTop}px`;
  editor.style.maxHeight = `${Math.max(240, viewportHeight - 32)}px`;
  fitEmployeePagePreview(frame);
  window.scrollTo({ top:pageScrollY, behavior:'instant' });
}
function addPreviewChecklistAttachmentFields(frame, key, record = null) {
  if (key !== 'firstWeekChecklist') return;
  const doc = frame.contentDocument, fieldsRoot = doc?.querySelector('#admin-preview-collection-editor [data-preview-editor-fields]');
  if (!doc || !fieldsRoot || fieldsRoot.querySelector('[data-preview-checklist-attachment]')) return;
  const group = doc.createElement('fieldset'), legend = doc.createElement('legend'), gate = doc.createElement('label'), gateFallback = doc.createElement('input'), gateInput = doc.createElement('input'), videoGate = doc.createElement('label'), videoGateFallback = doc.createElement('input'), videoGateInput = doc.createElement('input'), adminPortalGate = doc.createElement('label'), adminPortalGateFallback = doc.createElement('input'), adminPortalGateInput = doc.createElement('input'), link = doc.createElement('label'), url = doc.createElement('input'), file = doc.createElement('label'), upload = doc.createElement('input'), help = doc.createElement('small');
  group.dataset.previewChecklistAttachment = '';
  gateFallback.name = 'requiresPolicyAcknowledgement';
  gateFallback.type = 'hidden';
  gateFallback.value = 'false';
  gateInput.name = 'requiresPolicyAcknowledgement';
  gateInput.type = 'checkbox';
  gateInput.value = 'true';
  gateInput.checked = record?.requiresPolicyAcknowledgement === true || record?.requiresPolicyAcknowledgement === 'true';
  gate.append(gateFallback, gateInput, doc.createTextNode(' Require policy confirmation before this task can be completed'));
  videoGateFallback.name = 'requiresSecurityAwarenessVideo';
  videoGateFallback.type = 'hidden';
  videoGateFallback.value = 'false';
  videoGateInput.name = 'requiresSecurityAwarenessVideo';
  videoGateInput.type = 'checkbox';
  videoGateInput.value = 'true';
  videoGateInput.checked = record?.requiresSecurityAwarenessVideo === true || record?.requiresSecurityAwarenessVideo === 'true';
  videoGate.append(videoGateFallback, videoGateInput, doc.createTextNode(' Require one Security Awareness Training video before this task can be completed'));
  adminPortalGateFallback.name = 'requiresAdminPortalTraining';
  adminPortalGateFallback.type = 'hidden';
  adminPortalGateFallback.value = 'false';
  adminPortalGateInput.name = 'requiresAdminPortalTraining';
  adminPortalGateInput.type = 'checkbox';
  adminPortalGateInput.value = 'true';
  adminPortalGateInput.checked = record?.requiresAdminPortalTraining === true || record?.requiresAdminPortalTraining === 'true';
  adminPortalGate.append(adminPortalGateFallback, adminPortalGateInput, doc.createTextNode(' Require Company Portal Training before this task can be completed'));
  legend.textContent = 'Attachment (optional)';
  link.textContent = 'Attachment link';
  url.name = 'attachmentUrl';
  url.type = 'url';
  url.value = record?.attachmentUrl || '';
  url.placeholder = 'https://… or /uploaded-file';
  link.append(url);
  file.textContent = 'Upload attachment';
  upload.name = 'checklistAttachment';
  upload.type = 'file';
  upload.accept = 'application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,image/png,image/jpeg,image/webp,image/gif';
  help.textContent = record?.attachmentUrl ? 'Choose a replacement file, replace the link, or leave both blank to remove the attachment.' : 'Add a link or upload a file. Maximum 45 MB.';
  file.append(upload, help);
  group.append(legend, link, file);
  fieldsRoot.append(gate, videoGate, adminPortalGate, group);
}
const baseOpenPreviewCollectionEditor = openPreviewCollectionEditor;
openPreviewCollectionEditor = (frame, key, record = null) => {
  baseOpenPreviewCollectionEditor(frame, key, record);
  addPreviewChecklistAttachmentFields(frame, key, record);
};
async function savePreviewAppOrder(appId, targetIndex) {
  const currentIndex = dashboard.apps.findIndex(app => app.id === appId);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= dashboard.apps.length || currentIndex === targetIndex) return;
  const reordered = [...dashboard.apps];
  const [app] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, app);
  dashboard.apps = reordered;
  await saveDashboard(`Main Apps order updated: ${app.name} is now position ${targetIndex + 1}.`, true);
}
function enableAppPreviewOrdering(frame, cards, records) {
  const doc = frame.contentDocument;
  if (!doc || !cards.length) return;
  if (!doc.querySelector('#admin-preview-app-order-style')) {
    const style = doc.createElement('style');
    style.id = 'admin-preview-app-order-style';
    style.textContent = '.app-directory-card[data-admin-preview-record]{position:relative;cursor:grab}.app-directory-card[data-admin-app-dragging="true"]{opacity:.42;transform:scale(.985)}.app-directory-card[data-admin-app-drop-target="true"]{outline:3px solid #0b7aa7;outline-offset:4px}.admin-preview-app-order{position:absolute;z-index:3;right:13px;bottom:12px;display:flex;align-items:center;gap:4px;padding:4px;border:1px solid #b8cde5;border-radius:8px;background:#fff;color:#35577d;font:800 10px Manrope,Arial,sans-serif}.admin-preview-app-order span{padding-inline:4px}.admin-preview-app-order button{display:grid;width:25px;height:25px;place-items:center;border:0;border-radius:5px;background:#edf5ff;color:#1458b6;cursor:pointer}.admin-preview-app-order button:hover{background:#dcecff}.admin-preview-app-order button:focus-visible{outline:2px solid #0b7aa7;outline-offset:2px}.admin-preview-app-order button:disabled{opacity:.42;cursor:not-allowed}.admin-preview-app-order svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:2}';
    doc.head.append(style);
  }
  let draggedId = '';
  const clearDropTargets = () => cards.forEach(card => { card.removeAttribute('data-admin-app-drop-target'); card.removeAttribute('data-admin-app-dragging'); });
  cards.forEach((card, index) => {
    const record = records[index];
    if (!record || card.dataset.adminAppOrderBound) return;
    card.dataset.adminAppOrderBound = 'true';
    card.draggable = true;
    const controls = doc.createElement('div');
    controls.className = 'admin-preview-app-order';
    controls.dataset.adminAppOrder = '';
    controls.setAttribute('aria-label', `Move ${record.name}`);
    controls.innerHTML = `<span>Move</span><button type="button" data-move-app="earlier" aria-label="Move ${escapeHtml(record.name)} earlier" ${index === 0 ? 'disabled' : ''}><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M13 8H4M7.5 3.5 3 8l4.5 4.5"/></svg></button><button type="button" data-move-app="later" aria-label="Move ${escapeHtml(record.name)} later" ${index === records.length - 1 ? 'disabled' : ''}><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5"/></svg></button>`;
    controls.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const direction = event.target.closest('[data-move-app]')?.dataset.moveApp;
      if (!direction) return;
      const from = dashboard.apps.findIndex(app => app.id === record.id);
      try { await savePreviewAppOrder(record.id, from + (direction === 'earlier' ? -1 : 1)); }
      catch (error) { flash(error.message || 'The app order could not be updated.'); }
    }, true);
    card.append(controls);
    card.addEventListener('dragstart', event => {
      if (event.target.closest('[data-admin-app-order]')) { event.preventDefault(); return; }
      draggedId = record.id;
      card.dataset.adminAppDragging = 'true';
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', record.id);
    });
    card.addEventListener('dragover', event => {
      if (!draggedId || draggedId === record.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      card.dataset.adminAppDropTarget = 'true';
    });
    card.addEventListener('dragleave', () => card.removeAttribute('data-admin-app-drop-target'));
    card.addEventListener('dragend', clearDropTargets);
    card.addEventListener('drop', async event => {
      event.preventDefault();
      const sourceId = draggedId || event.dataTransfer.getData('text/plain');
      clearDropTargets();
      if (!sourceId || sourceId === record.id) return;
      try { await savePreviewAppOrder(sourceId, dashboard.apps.findIndex(app => app.id === record.id)); }
      catch (error) { flash(error.message || 'The app order could not be updated.'); }
    });
  });
}
let eventsPreviewSelectedDate = '';
function enableEventsPreviewEditing(frame, attempts = 0) {
  const doc = frame.contentDocument, root = doc?.querySelector('#destination-root');
  if (!root || root.dataset.dashboardReady !== 'true') {
    if (attempts < 20) window.setTimeout(() => enableEventsPreviewEditing(frame, attempts + 1), 180);
    return;
  }
  if (doc.documentElement.dataset.adminEventsPreviewReady) return;
  doc.documentElement.dataset.adminEventsPreviewReady = 'true';
  const style = doc.createElement('style');
  style.textContent = '[data-admin-events-copy]{outline:2px dashed transparent;outline-offset:5px;cursor:text;transition:outline-color .16s ease,background-color .16s ease}[data-admin-events-copy]:hover,[data-admin-events-copy]:focus-visible{outline-color:#0b7aa7;background:rgb(204 244 248 / 38%)}.admin-preview-events-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.admin-preview-events-actions button{border:1px solid #1458b6;border-radius:7px;padding:9px 13px;background:#1458b6;color:#fff;font:800 12px Manrope,Arial,sans-serif;cursor:pointer}.admin-preview-events-actions button+button{background:#fff;color:#1458b6}.admin-preview-events-actions button:hover{filter:brightness(.92)}.admin-preview-events-actions button:focus-visible{outline:3px solid #0b7aa7;outline-offset:3px}.admin-preview-event-source-note{margin:0 0 10px;padding:9px;border-radius:7px;background:#fff5e8;color:#72420a;font-size:11px;line-height:1.5}';
  doc.head.append(style);
  const form = $('#events-page-copy-form');
  [['title','.destination-intro h1'],['intro','.destination-intro p']].forEach(([name, selector]) => {
    const element = doc.querySelector(selector), input = form?.elements.namedItem(name);
    if (!element || !input) return;
    element.contentEditable = 'true'; element.tabIndex = 0; element.dataset.adminEventsCopy = name;
    element.setAttribute('role', 'textbox'); element.setAttribute('aria-label', `Edit events page ${name === 'title' ? 'heading' : 'description'}`);
    element.title = 'Click to edit this page text';
    element.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
    element.addEventListener('input', () => { input.value = element.innerText.replace(/\s+/g, ' ').trim(); fitEmployeePagePreview(frame); });
  });
  const actions = doc.createElement('div'); actions.className = 'admin-preview-events-actions';
  actions.innerHTML = '<button type="button" data-admin-add-event>Add event</button><button type="button" data-admin-save-events-copy>Save page text</button>';
  doc.querySelector('.destination-intro')?.append(actions);
  actions.querySelector('[data-admin-add-event]').addEventListener('click', () => openPreviewCollectionEditor(frame, 'events'));
  actions.querySelector('[data-admin-save-events-copy]').addEventListener('click', () => form?.requestSubmit());
  const list = doc.querySelector('#events-page-list');
  const picker = doc.querySelector('#events-page-calendar-input');
  if (picker && eventsPreviewSelectedDate) { picker.value = eventsPreviewSelectedDate; picker.dispatchEvent(new doc.defaultView.Event('change', { bubbles:true })); }
  const bindCards = () => {
    if (picker?.value) eventsPreviewSelectedDate = picker.value;
    list?.querySelectorAll('.event-page-open').forEach(card => {
      if (card.dataset.adminPreviewRecord) return;
      const record = (dashboard.events || []).find(item => String(item.id) === card.dataset.eventId);
      if (!record) return;
      card.dataset.adminPreviewRecord = record.id;
      card.title = `Edit ${record.title}`;
      card.setAttribute('aria-label', `Edit ${record.title}`);
      const open = event => { event.preventDefault(); event.stopImmediatePropagation(); openPreviewCollectionEditor(frame, 'events', record); };
      card.addEventListener('click', open, true);
      card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(event); }, true);
    });
    fitEmployeePagePreview(frame);
  };
  bindCards();
  frame._eventsPreviewObserver?.disconnect();
  if (list) { frame._eventsPreviewObserver = new MutationObserver(bindCards); frame._eventsPreviewObserver.observe(list, { childList:true, subtree:true }); }
}
function enableCollectionPreviewEditing(frame, key, attempts = 0) {
  const target = previewCollectionTargets[key]; if (!target || frame.dataset.previewBase !== target.base) return;
  if (key === 'events') return enableEventsPreviewEditing(frame, attempts);
  try {
    const doc = frame.contentDocument, records = target.records(dashboard[key] || []), cards = [...(doc?.querySelectorAll(target.selector) || [])];
    if (!doc || (key !== 'newMembers' && cards.length < records.length)) { if (attempts < 12) window.setTimeout(() => enableCollectionPreviewEditing(frame, key, attempts + 1), 180); return; }
    if (key === 'newMembers' && !doc.documentElement.dataset.adminMemberSearchBound) {
      doc.documentElement.dataset.adminMemberSearchBound = 'true';
      doc.addEventListener('recently-joined:rendered', () => enableCollectionPreviewEditing(frame, key));
    }
    if (key === 'firstWeekChecklist' && !doc.querySelector('[data-admin-add-checklist-task]')) {
      const addTask = doc.createElement('button');
      addTask.type = 'button';
      addTask.className = 'admin-preview-add-checklist-task';
      addTask.dataset.adminAddChecklistTask = '';
      addTask.textContent = 'Add checklist task';
      addTask.addEventListener('click', () => openPreviewCollectionEditor(frame, key));
      doc.querySelector('#first-week-checklist')?.insertAdjacentElement('afterend', addTask);
    }
    if (key === 'firstWeekChecklist' && !doc.documentElement.dataset.adminChecklistEditorBound) {
      doc.documentElement.dataset.adminChecklistEditorBound = 'true';
      doc.addEventListener('click', event => {
        const card = event.target.closest('#first-week-checklist > li[data-admin-preview-record]');
        if (!card) return;
        const record = (dashboard.firstWeekChecklist || []).find(item => String(item.id) === card.dataset.adminPreviewRecord);
        if (!record) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        openPreviewCollectionEditor(frame, 'firstWeekChecklist', record);
      }, true);
    }
    if (!doc.querySelector('#admin-preview-collection-style')) { const style = doc.createElement('style'); style.id = 'admin-preview-collection-style'; style.textContent = '[data-admin-preview-record]{outline:2px dashed transparent;outline-offset:5px;cursor:pointer;transition:outline-color .16s ease,background .16s ease}[data-admin-preview-record]:hover,[data-admin-preview-record]:focus-visible{outline-color:#0b7aa7;background:#f4fbff}.admin-preview-collection-editor{position:fixed;z-index:2147483647;right:20px;top:20px;width:min(390px,calc(100vw - 40px));max-height:calc(100vh - 40px);overflow:auto;padding:17px;border:1px solid #b8cde5;border-radius:13px;background:#fff;box-shadow:0 18px 34px rgb(19 56 97 / 18%);font-family:inherit}.admin-preview-collection-editor[hidden]{display:none}.admin-preview-collection-editor-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:13px;color:#102c52}.admin-preview-collection-editor-head b{font-size:15px}.admin-preview-collection-editor-head button{border:0;background:transparent;color:#145ea9;font:800 12px inherit;cursor:pointer}.admin-preview-collection-editor label{display:grid;gap:5px;margin:9px 0;color:#35577d;font-size:12px;font-weight:800}.admin-preview-collection-editor input,.admin-preview-collection-editor textarea{box-sizing:border-box;width:100%;border:1px solid #a8c2df;border-radius:7px;padding:9px 10px;color:#102c52;font:600 13px inherit}.admin-preview-collection-editor textarea{resize:vertical}.admin-preview-collection-editor input:focus,.admin-preview-collection-editor textarea:focus{outline:3px solid rgb(10 120 167 / 24%);border-color:#0b7aa7}.admin-preview-icon-current{display:flex;align-items:center;gap:8px;padding:7px 8px;border:1px solid #d7e4f2;border-radius:8px;background:#f8fbff;color:#45698e;font-size:11px}.admin-preview-icon-current img{width:30px;height:30px;border-radius:7px;object-fit:cover}.admin-preview-colour-control{display:grid;grid-template-columns:48px 1fr;gap:8px}.admin-preview-collection-editor .admin-preview-colour-control input[type="color"]{width:48px;min-height:39px;padding:3px;cursor:pointer}.admin-preview-colour-palette{display:flex;flex-wrap:wrap;gap:7px}.admin-preview-colour-palette button{width:22px;height:22px;border:1px solid #9eb8d5;border-radius:50%;cursor:pointer}.admin-preview-colour-palette button:focus-visible{outline:3px solid rgb(10 120 167 / 28%);outline-offset:2px}.admin-preview-collection-editor-actions{display:flex;justify-content:space-between;gap:10px;margin-top:14px}.admin-preview-collection-editor-actions button{border:1px solid #b8cde5;border-radius:7px;background:#fff;color:#a4263d;padding:8px 10px;font:800 12px inherit;cursor:pointer}.admin-preview-collection-editor-actions button[type="submit"]{margin-left:auto;border-color:#145ea9;background:#145ea9;color:#fff}.admin-preview-collection-editor [data-preview-editor-status]{min-height:1.2em;margin:8px 0 0;color:#a4263d;font-size:12px;font-weight:700}'; doc.head.append(style); }
    cards.slice(0, records.length).forEach((card, index) => { const record = key === 'newMembers' ? records.find(item => String(item.id) === card.dataset.memberId) : records[index]; if (!record || card.dataset.adminPreviewRecord) return; card.dataset.adminPreviewRecord = record.id; card.tabIndex ||= 0; card.title = `Edit ${recordLabel(key, record)}`; card.addEventListener('click', event => { if (event.target.closest('[data-admin-app-order]')) return; event.preventDefault(); event.stopImmediatePropagation(); openPreviewCollectionEditor(frame, key, record); }, true); card.addEventListener('keydown', event => { if (event.target.closest('[data-admin-app-order]')) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopImmediatePropagation(); openPreviewCollectionEditor(frame, key, record); } }, true); });
    if (key === 'apps') enableAppPreviewOrdering(frame, cards.slice(0, records.length), records);
  } catch (_) {}
}
const newSiPageCopyTargets = [
  'heroEyebrow','heroLead','heroAccent','heroText','heroJourneyLabel','heroAction','asideTitle','asideText','asideAction',
  'navTitle','navChecklist','navPolicies','navTraining','navTools','navHelp','checklistTitle','checklistText',
  'checklistCompleteTitle','checklistCompleteText','checklistEmptyText','checklistInProgressText','checklistNextStepText','checklistReopenText','heroCompleteText',
  'policiesTitle','policiesText','trainingTitle','trainingText','securityEnglishTitle','securityArabicTitle','adminPortalTrainingTitle','trainingWatchAction','securityEnglishUrl','securityArabicUrl','adminPortalTrainingUrl',
  'toolsTitle','toolsText','emailTitle','emailText','emailAction','knowledgeTitle','knowledgeText','knowledgeAction',
  'helpTitle','helpText','itTitle','itIntro','itPortalLabel','itContactIntro','itEmailLabel',
  'peopleTitle','peopleIntro','peopleMohrLabel','peopleMiddle','peoplePortalLabel','peopleContactIntro','peopleEmailLabel',
  'administrationTitle','administrationIntro','administrationPortalLabel','administrationOutro',
  'financeTitle','financeIntro','financePortalLabel','financeOutro','portalsTitle','portalsText',
  'welcomeThanks','welcomeRecorded','welcomeBody','welcomeAction'
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
      const elements = [...doc.querySelectorAll(`[data-newsi-copy="${name}"]`)], input = form.elements.namedItem(name);
      if (!(input instanceof HTMLInputElement)) return;
      elements.forEach(element => {
        if (element.dataset.adminPreviewNewsiPageCopy === name) return;
        if (!input.value) input.value = element.innerText.replace(/\s+/g, ' ').trim();
        element.contentEditable = 'true';
        if (!element.matches('a,button')) element.tabIndex = 0;
        element.dataset.adminPreviewNewsiPageCopy = name;
        element.setAttribute('aria-label', `Edit ${name.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
        element.setAttribute('role', 'textbox');
        element.setAttribute('aria-multiline', 'false');
        element.title = 'Click to edit this text';
        if (element.closest('a,button')) element.addEventListener('click', event => event.preventDefault());
        element.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
        element.addEventListener('input', () => {
          input.value = element.innerText.replace(/\s+/g, ' ').trim();
          input.dataset.previewTouched = 'true';
          elements.forEach(other => { if (other !== element) other.textContent = input.value; });
          fitEmployeePagePreview(frame);
        });
      });
    });
  } catch (_) {}
}
function enableNewSiAcknowledgementPreviewEditing(frame, attempts = 0) {
  if (frame.dataset.previewBase !== '/new-hires.html') return;
  try {
    const doc = frame.contentDocument, form = $('#ack-content-form'), panel = doc?.querySelector('#policy-acknowledgement');
    if (!doc || !form || !panel) { if (attempts < 12) window.setTimeout(() => enableNewSiAcknowledgementPreviewEditing(frame, attempts + 1), 180); return; }
    if (!doc.querySelector('#admin-preview-newsi-copy-style')) { const style = doc.createElement('style'); style.id = 'admin-preview-newsi-copy-style'; style.textContent = '[data-admin-preview-newsi-copy]{outline:2px dashed transparent;outline-offset:4px;cursor:text;transition:outline-color .16s ease,background .16s ease}[data-admin-preview-newsi-copy]:hover,[data-admin-preview-newsi-copy]:focus{outline-color:#0b7aa7;background:#f4fbff}.admin-preview-ack-state-title{margin:20px 0 0;color:#24547d;font-size:14px;font-weight:800}.admin-preview-ack-state-title small{color:#516d89;font-size:11px;font-weight:600}.admin-preview-ack-state-title+.policy-acknowledgement{margin-top:8px}.admin-preview-ack-button{display:inline-block;border-radius:8px;background:var(--blue);color:#fff;padding:10px 14px;font:800 12px Manrope}.admin-preview-ack-button:focus-visible{outline:2px solid var(--focus);outline-offset:3px}'; doc.head.append(style); }
    doc.querySelectorAll('[data-admin-preview-ack-state]').forEach(element => element.remove());
    const value = name => escapeHtml(form.elements.namedItem(name)?.value || '');
    const accepted = Boolean(panel.querySelector('.policy-acknowledgement-head--accepted'));
    const label = (title, note) => { const heading = doc.createElement('h3'); heading.className = 'admin-preview-ack-state-title'; heading.dataset.adminPreviewAckState = 'label'; heading.innerHTML = `${title} <small>${note}</small>`; return heading; };
    const sample = doc.createElement('section'); sample.className = 'policy-acknowledgement'; sample.dataset.adminPreviewAckState = accepted ? 'before' : 'after';
    if (accepted) {
      const policies = (dashboard?.policies || []).filter(policy => policy.requiresAcknowledgement !== false);
      sample.innerHTML = `<div class="policy-acknowledgement-head"><div><h3 data-admin-preview-ack-field="actionTitle">${value('actionTitle')}</h3><p data-admin-preview-ack-field="instructionText">${value('instructionText')}</p></div></div><div class="policy-acknowledgement-notice"><b data-admin-preview-ack-field="beforeHeading">${value('beforeHeading')}</b><p data-admin-preview-ack-field="beforeText">${value('beforeText')}</p></div><ul class="policy-acknowledgement-list">${policies.map(policy => `<li>${escapeHtml(policy.title || '')}${policy.version ? ` · ${escapeHtml(policy.version)}` : ''}</li>`).join('')}</ul><div class="policy-acknowledgement-actions"><span class="admin-preview-ack-button" data-admin-preview-ack-field="confirmationLabel">${value('confirmationLabel')}</span><small data-admin-preview-ack-field="confirmationHelp">${value('confirmationHelp')}</small></div>`;
      panel.before(label('Before confirmation', 'preview'), sample, label('After confirmation', 'current view'));
    } else {
      sample.innerHTML = `<div class="policy-acknowledgement-notice"><b data-admin-preview-ack-field="beforeHeading">${value('beforeHeading')}</b><p data-admin-preview-ack-field="beforeText">${value('beforeText')}</p></div><div class="policy-acknowledgement-head policy-acknowledgement-head--accepted"><div><h3 data-admin-preview-ack-field="acceptedTitle">${value('acceptedTitle')}</h3><p class="policy-acknowledged" data-admin-preview-ack-field="afterText">${value('afterText')}</p></div></div>`;
      panel.before(label('Before confirmation', 'current view'));
      panel.after(label('After confirmation', 'preview'), sample);
    }
    Object.entries(newSiAcknowledgementPreviewSelectors).forEach(([name, selector]) => {
      const input = form.elements.namedItem(name);
      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
      const elements = [...doc.querySelectorAll(`#policy-acknowledgement ${selector}, [data-admin-preview-ack-field="${name}"]`)];
      elements.forEach(element => {
        if (element.dataset.adminPreviewNewsiCopy === name) return;
        element.contentEditable = 'true'; element.tabIndex = 0; element.dataset.adminPreviewNewsiCopy = name;
        element.setAttribute('aria-label', `Edit ${name.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
        if (element instanceof doc.defaultView.HTMLButtonElement) element.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
        element.addEventListener('input', () => { input.value = element.innerText.trim(); elements.forEach(other => { if (other !== element) other.textContent = input.value; }); fitEmployeePagePreview(frame); });
      });
    });
    fitEmployeePagePreview(frame);
  } catch (_) {}
}
const newSiPreviewGroups = {
  checklist:{ section:'#first-week', action:'Edit checklist messages', title:'Checklist messages', fields:[['checklistCompleteTitle','Completion heading'],['checklistCompleteText','Completion description'],['checklistEmptyText','Before any task is complete'],['checklistInProgressText','While tasks remain'],['checklistNextStepText','Next-step hint'],['checklistReopenText','All-done hint'],['heroCompleteText','Hero completion message']] },
  training:{ section:'#training', action:'Edit video links', title:'Training video links', fields:[['securityEnglishUrl','Security Awareness — English URL'],['securityArabicUrl','Security Awareness — Arabic URL'],['adminPortalTrainingUrl','Company Portal Training URL']] },
  policy:{ section:'#policies', action:'Edit policy & welcome messages', title:'Policy & welcome messages', fields:[['actionTitle','Action heading','ack'],['instructionText','Instruction','ack'],['beforeHeading','Context heading','ack'],['beforeText','Context text','ack'],['confirmationLabel','Confirmation statement','ack'],['confirmationHelp','Confirmation help','ack'],['acceptedTitle','Success heading','ack'],['afterText','Success text','ack'],['welcomeThanks','Welcome heading'],['welcomeRecorded','Confirmation message'],['welcomeBody','Welcome message'],['welcomeAction','Continue button']] }
};
const newSiAcknowledgementPreviewSelectors = { actionTitle:'.policy-acknowledgement-head:not(.policy-acknowledgement-head--accepted) h3', instructionText:'.policy-acknowledgement-head:not(.policy-acknowledgement-head--accepted) p', beforeHeading:'.policy-acknowledgement-notice b', beforeText:'.policy-acknowledgement-notice p', confirmationLabel:'[data-confirm-policy]', confirmationHelp:'.policy-acknowledgement-actions small', acceptedTitle:'.policy-acknowledgement-head--accepted h3', afterText:'.policy-acknowledgement-head--accepted .policy-acknowledged' };
function enableNewSiPreviewTools(frame) {
  if (frame.dataset.previewBase !== '/new-hires.html') return;
  try {
    const doc = frame.contentDocument, copyForm = $('#newsi-page-copy-form'), acknowledgementForm = $('#ack-content-form');
    if (!doc || !copyForm || !acknowledgementForm || doc.querySelector('#admin-preview-newsi-tools')) return;
    const style = doc.createElement('style');
    style.id = 'admin-preview-newsi-tools';
    style.textContent = '.admin-preview-newsi-tool-row{display:flex;justify-content:flex-end;margin:-4px 0 12px}.admin-preview-newsi-tool{border:1px solid #b8cde5;border-radius:8px;background:#f7fbff;color:#14528e;padding:7px 10px;font:700 12px inherit;cursor:pointer}.admin-preview-newsi-tool:hover,.admin-preview-newsi-tool:focus-visible{border-color:#0b7aa7;background:#ebf8fd;outline:2px solid transparent}.admin-preview-newsi-editor{position:absolute;z-index:2147483646;right:16px;width:min(390px,calc(100% - 32px));max-height:560px;overflow:auto;padding:16px;border:1px solid #b8cde5;border-radius:12px;background:#fff;color:#193f6f;box-shadow:0 18px 34px rgb(19 56 97 / 18%);font-family:inherit}.admin-preview-newsi-editor[hidden]{display:none}.admin-preview-newsi-editor-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.admin-preview-newsi-editor-head b{font-size:16px}.admin-preview-newsi-editor-head button{border:0;background:none;color:#14528e;font:700 12px inherit;cursor:pointer}.admin-preview-newsi-editor-group{margin:18px 0 8px;padding-top:14px;border-top:1px solid #d5e1ee;color:#193f6f;font-size:13px}.admin-preview-newsi-editor label{display:grid;gap:5px;margin:9px 0;color:#35577d;font-size:12px;font-weight:700}.admin-preview-newsi-editor input,.admin-preview-newsi-editor textarea{box-sizing:border-box;width:100%;border:1px solid #a8c2df;border-radius:7px;padding:9px 10px;color:#102c52;background:#fff;font:600 13px inherit}.admin-preview-newsi-editor textarea{min-height:66px;resize:vertical}.admin-preview-newsi-editor input:focus-visible,.admin-preview-newsi-editor textarea:focus-visible{outline:3px solid rgb(10 120 167 / 24%);border-color:#0b7aa7}.admin-preview-newsi-editor-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.admin-preview-newsi-editor-actions button{border:1px solid #b8cde5;border-radius:7px;background:#fff;color:#14528e;padding:8px 10px;font:700 12px inherit;cursor:pointer}.admin-preview-newsi-editor-actions button[type=submit]{background:#145ea9;border-color:#145ea9;color:#fff}.admin-preview-newsi-editor-status{min-height:1em;color:#a4263d;font-size:12px}';
    doc.head.append(style);
    const editor = doc.createElement('form'); editor.className = 'admin-preview-newsi-editor'; editor.hidden = true; editor.noValidate = true; doc.body.append(editor);
    const close = () => { editor.hidden = true; editor.replaceChildren(); };
    const open = (key, trigger) => {
      const group = newSiPreviewGroups[key]; if (!group) return;
      editor.dataset.group = key;
      const policyHeadings = { actionTitle:'Before confirmation', acceptedTitle:'After confirmation', welcomeThanks:'Welcome message' };
      editor.innerHTML = `<div class="admin-preview-newsi-editor-head"><b>${escapeHtml(group.title)}</b><button type="button" data-preview-newsi-close aria-label="Close ${escapeHtml(group.title)} editor">Close</button></div>${group.fields.map(([name, label, source]) => { const input = (source === 'ack' ? acknowledgementForm : copyForm).elements.namedItem(name), value = input?.value || newSiCopyDefaults[name] || ''; const control = key === 'training' ? `<input name="${name}" type="url" required maxlength="500" value="${escapeHtml(value)}" />` : /Text$|instructionText|beforeText|afterText|welcomeBody/.test(name) ? `<textarea name="${name}" required maxlength="600">${escapeHtml(value)}</textarea>` : `<input name="${name}" required maxlength="600" value="${escapeHtml(value)}" />`; return `${key === 'policy' && policyHeadings[name] ? `<h3 class="admin-preview-newsi-editor-group">${policyHeadings[name]}</h3>` : ''}<label>${escapeHtml(label)}${control}</label>`; }).join('')}<p class="admin-preview-newsi-editor-status" role="alert"></p><div class="admin-preview-newsi-editor-actions"><button type="button" data-preview-newsi-close>Cancel</button><button type="submit">Publish changes</button></div>`;
      editor.hidden = false;
      editor.style.top = `${Math.max(16, trigger.getBoundingClientRect().top + doc.defaultView.scrollY + trigger.offsetHeight + 8)}px`;
      editor.style.maxHeight = `${Math.max(280, Math.min(560, window.innerHeight - 32))}px`;
      editor.querySelector('input,textarea')?.focus(); fitEmployeePagePreview(frame);
    };
    Object.entries(newSiPreviewGroups).forEach(([key, group]) => {
      const section = doc.querySelector(group.section), intro = section?.querySelector(':scope > p'); if (!section || !intro) return;
      const row = doc.createElement('div'), trigger = doc.createElement('button'); row.className = 'admin-preview-newsi-tool-row'; trigger.className = 'admin-preview-newsi-tool'; trigger.type = 'button'; trigger.textContent = group.action; row.append(trigger); intro.after(row);
      trigger.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); open(key, trigger); });
    });
    editor.addEventListener('click', event => { if (event.target.closest('[data-preview-newsi-close]')) close(); });
    editor.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
    editor.addEventListener('submit', event => {
      event.preventDefault();
      const group = newSiPreviewGroups[editor.dataset.group], values = Object.fromEntries([...new FormData(editor)].map(([name, value]) => [name, String(value).trim()])), error = editor.querySelector('.admin-preview-newsi-editor-status');
      if (Object.values(values).some(value => !value)) { error.textContent = 'Complete every field before publishing.'; return; }
      if (editor.dataset.group === 'training') for (const [name, value] of Object.entries(values)) { const url = normaliseYouTubeVideoUrl(value); if (!url) { error.textContent = 'Use a valid YouTube or youtu.be link for each video.'; return; } values[name] = url; }
      const copyUpdates = {};
      group.fields.forEach(([name,,source]) => {
        const value = values[name], target = (source === 'ack' ? acknowledgementForm : copyForm).elements.namedItem(name);
        if (target) { target.value = value; if (source !== 'ack') target.dataset.previewTouched = 'true'; }
        if (source === 'ack') doc.querySelectorAll(`#policy-acknowledgement ${newSiAcknowledgementPreviewSelectors[name]}, [data-admin-preview-ack-field="${name}"]`).forEach(element => element.textContent = value);
        else { copyUpdates[name] = value; doc.querySelectorAll(`[data-newsi-copy="${name}"]`).forEach(element => element.textContent = value); }
      });
      if (editor.dataset.group === 'training') Object.entries(values).forEach(([name, value]) => { const id = new URL(value).searchParams.get('v'); const video = doc.querySelector(`[data-newsi-video="${name}"]`), link = doc.querySelector(`[data-newsi-video-open="${name}"]`); if (video && id) video.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0`; if (link) link.href = value; });
      if (Object.keys(copyUpdates).length) doc.dispatchEvent(new doc.defaultView.CustomEvent('newsi-copy:preview-updated', { detail:copyUpdates }));
      close(); acknowledgementForm.requestSubmit();
    });
  } catch (_) {}
}
function applyHomePreviewLayout(frame) {
  try {
    const doc = frame.contentDocument, page = doc?.querySelector('.dashboard');
    if (!page) return;
    const layout = dashboard.settings?.layout || [];
    const defaultLayout = ['apps', 'announcements', 'new-members', 'company-news', 'social', 'news', 'moments', 'knowledge', 'events', 'whistleblower'];
    const sizes = dashboard.settings?.widgetSizes || {}, customSizes = Object.entries(sizes).some(([key, size]) => size && size !== (defaultHomeWidgetSizes[key] || 'standard'));
    page.classList.toggle('layout-custom', layout.join(',') !== defaultLayout.join(',') || customSizes);
    doc.querySelectorAll('[data-widget]').forEach(widget => {
      const position = layout.indexOf(widget.dataset.widget);
      widget.hidden = position < 0 || (dashboard.settings?.hiddenWidgets || []).includes(widget.dataset.widget);
      widget.style.order = position < 0 ? '99' : String(position);
      widget.dataset.widgetSize = sizes[widget.dataset.widget] || defaultHomeWidgetSizes[widget.dataset.widget] || 'standard';
    });
  } catch (_) {}
}
function enableHomePreviewEditing(frame, attempts = 0) {
  if (frame.dataset.previewBase !== '/') return;
  try {
    const doc = frame.contentDocument;
    if (!doc || !$('#home-hero-form')) return;
    if (!doc.querySelector('#app-grid .app-link') && attempts < 20) { window.setTimeout(() => enableHomePreviewEditing(frame, attempts + 1), 180); return; }
    applyHomePreviewLayout(frame);
    if (doc.querySelector('#admin-home-preview-style')) return;
    const style = doc.createElement('style'); style.id = 'admin-home-preview-style'; style.textContent = '[data-admin-home-editable]{outline:2px dashed transparent;outline-offset:4px;cursor:pointer;transition:outline-color .16s ease,background .16s ease}[data-admin-home-editable]:hover,[data-admin-home-editable]:focus-visible{outline-color:#0b7aa7;background:rgb(204 244 248 / 25%)}.hero-copy[data-admin-home-editable]:hover{background:transparent}@media(max-width:1050px){.dashboard:not(.layout-custom){grid-template-columns:repeat(4,minmax(0,1fr))!important;grid-template-areas:"apps apps apps apps" "hero hero hero new-members" "company-news company-news company-news company-news" "linkedin facebook youtube news" "moments moments moments moments" "knowledge knowledge knowledge knowledge" "events events events events" "whistleblower whistleblower whistleblower whistleblower"!important}.dashboard:not(.layout-custom) .app-dock{grid-area:apps}.dashboard:not(.layout-custom) .hero{grid-area:hero}.dashboard:not(.layout-custom) .new-members-widget{grid-area:new-members}}'; doc.head.append(style);
    const mark = (selector, label, action) => doc.querySelectorAll(selector).forEach((element, index) => { element.dataset.adminHomeEditable = label; element.tabIndex = 0; element.title = `Edit ${label}`; const open = event => { event.preventDefault(); event.stopPropagation(); action(index); }; element.addEventListener('click', open); element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') open(event); }); });
    mark('.hero-copy', 'hero text', () => { $('#home-hero-title')?.focus(); });
    mark('#app-grid .app-link', 'app card', index => { const record = dashboard.apps?.[index]; if (record) openPreviewCollectionEditor(frame, 'apps', record); });
    mark('#new-member-list .new-member', 'employee card', index => { const record = dashboard.newMembers?.slice(0, 2)[index]; if (record) openPreviewCollectionEditor(frame, 'newMembers', record); });
    mark('#moments-grid .moment-card', 'moment card', index => { const record = dashboard.moments?.[index]; if (record) openPreviewCollectionEditor(frame, 'moments', record); });
    [['.priority-announcement', 'announcements'], ['#event-list .event', 'events'], ['#session-list tr', 'knowledge'], ['.widget-whistleblower', 'whistleblower']].forEach(([selector, view]) => mark(selector, `${view} content`, () => showView(view)));
    if (attempts < 3) window.setTimeout(() => enableHomePreviewEditing(frame, attempts + 1), 220);
  } catch (_) {}
}
document.addEventListener('load', event => { const frame = event.target; if (frame instanceof HTMLIFrameElement && frame.matches('[data-preview-auto-height]')) { focusEmployeePagePreview(frame); fitEmployeePagePreview(frame); enableHomePreviewEditing(frame); enableWhistleblowerPreviewEditing(frame); enableWhistleblower2PreviewEditing(frame); enableMomentsPageCopyEditing(frame); enableKnowledgePageCopyEditing(frame); enableRecentlyJoinedPageCopyEditing(frame); enableSocialCardPreviewEditing(frame); enableNewSiPageCopyEditing(frame); enableNewSiPreviewTools(frame); frame.contentDocument?.addEventListener('first-week-checklist:rendered', () => enableNewSiPageCopyEditing(frame)); frame.contentDocument?.addEventListener('policy-acknowledgement:rendered', () => enableNewSiAcknowledgementPreviewEditing(frame)); enableNewSiAcknowledgementPreviewEditing(frame); Object.keys(previewCollectionTargets).forEach(key => enableCollectionPreviewEditing(frame, key)); } }, true);
const socialCardDefaults = links => [
  { id:'linkedin', title:'LinkedIn', url:links.linkedinUrl || 'https://www.linkedin.com/company/si-ware-systems/?locale=en_US', icon:'linkedin', actionLabel:'Visit channel' },
  { id:'facebook', title:'Facebook', url:links.facebookUrl || 'https://www.facebook.com/SiWareSystems/', icon:'facebook', actionLabel:'Visit channel' },
  { id:'youtube', title:'YouTube', url:links.youtubeUrl || 'https://www.youtube.com/@Si-Ware_Systems', icon:'youtube', actionLabel:'Visit channel' },
  { id:'website', title:'Si-Ware website', url:links.websiteUrl || 'https://www.si-ware.com', icon:'website', actionLabel:'Visit website' }
];
function socialCards() { const links = dashboard.socialLinks || {}; return Array.isArray(links.cards) && links.cards.length ? links.cards : socialCardDefaults(links); }
function enableSocialCardPreviewEditing(frame, attempts = 0) {
  if (frame.dataset.previewBase !== '/social-media.html') return;
  try {
    const doc = frame.contentDocument, cards = [...(doc?.querySelectorAll('.social-link') || [])];
    if (!doc || !cards.length) { if (attempts < 12) window.setTimeout(() => enableSocialCardPreviewEditing(frame, attempts + 1), 180); return; }
    if (doc.querySelector('#admin-preview-social-card-style')) return;
    const style = doc.createElement('style');
    style.id = 'admin-preview-social-card-style';
    style.textContent = '.social-link[data-admin-preview-social-card]{outline:2px dashed transparent;outline-offset:5px;cursor:pointer}.social-link[data-admin-preview-social-card]:hover,.social-link[data-admin-preview-social-card]:focus-visible{outline-color:#0b7aa7;background:#f5fbff}.admin-preview-social-card-editor{position:fixed;z-index:2147483647;box-sizing:border-box;width:min(356px,calc(100vw - 32px));padding:16px;border:1px solid #b8cde5;border-radius:12px;background:#fff;box-shadow:0 16px 32px rgb(19 56 97 / 18%);color:#102c52;font-family:inherit}.admin-preview-social-card-editor[hidden]{display:none}.admin-preview-social-card-editor header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:13px}.admin-preview-social-card-editor h2{margin:0;color:#173a78;font-size:15px;line-height:1.3}.admin-preview-social-card-editor label{display:grid;gap:6px;margin-top:11px;color:#193f6f;font-size:12px;font-weight:800}.admin-preview-social-card-editor input{width:100%;box-sizing:border-box;border:1px solid #99b9dc;border-radius:7px;padding:9px 10px;color:#102c52;font:600 12px inherit}.admin-preview-social-card-editor input:focus{outline:3px solid rgb(10 120 167 / 24%);border-color:#0b7aa7}.admin-preview-social-card-editor small{color:#526a87;font-size:10px;font-weight:600;line-height:1.45}.admin-preview-social-card-editor-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}.admin-preview-social-card-editor button{border:1px solid #b8cde5;border-radius:7px;background:#fff;color:#154f91;padding:8px 10px;font:800 11px inherit;cursor:pointer}.admin-preview-social-card-editor button[type="submit"]{border-color:#145ea9;background:#145ea9;color:#fff}.admin-preview-social-card-editor [data-social-editor-status]{min-height:16px;margin:10px 0 0;color:#b42318;font-size:11px;font-weight:700}';
    doc.head.append(style);
    const editor = doc.createElement('form');
    editor.id = 'admin-preview-social-card-editor'; editor.className = 'admin-preview-social-card-editor'; editor.hidden = true; editor.noValidate = true;
    editor.innerHTML = '<header><h2 data-social-editor-title>Edit channel</h2><button type="button" data-social-editor-close>Close</button></header><label>Channel link<input name="url" type="url" required maxlength="500" placeholder="https://…" /></label><label>Upload icon <input name="iconFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /><small data-social-editor-icon-note>Leave empty to keep the current icon.</small></label><p data-social-editor-status role="status"></p><div class="admin-preview-social-card-editor-actions"><button type="button" data-social-editor-cancel>Cancel</button><button type="submit">Save changes</button></div>';
    doc.body.append(editor);
    let activeId = '', activeCard = null;
    const close = () => { editor.hidden = true; activeCard?.removeAttribute('data-admin-preview-social-editing'); activeCard = null; activeId = ''; };
    const open = (card, record) => {
      activeCard?.removeAttribute('data-admin-preview-social-editing'); activeCard = card; activeId = record.id; card.dataset.adminPreviewSocialEditing = 'true';
      editor.querySelector('[data-social-editor-title]').textContent = `Edit ${record.title}`;
      editor.querySelector('[name="url"]').value = record.url || '';
      editor.querySelector('[name="iconFile"]').value = '';
      editor.querySelector('[data-social-editor-icon-note]').textContent = record.iconUrl ? 'A custom icon is in use. Upload another image to replace it.' : 'Leave empty to keep the current standard icon.';
      editor.querySelector('[data-social-editor-status]').textContent = '';
      editor.hidden = false;
      const rect = card.getBoundingClientRect(), view = doc.defaultView || window, editorWidth = Math.min(356, Math.max(0, view.innerWidth - 32));
      editor.style.left = `${Math.max(16, Math.min(rect.left + 12, view.innerWidth - editorWidth - 16))}px`; editor.style.top = `${Math.max(16, Math.min(rect.top + 12, view.innerHeight - 290))}px`;
      editor.querySelector('[name="url"]').focus();
    };
    const records = socialCards();
    cards.forEach((card, index) => {
      const record = records[index]; if (!record) return;
      card.dataset.adminPreviewSocialCard = record.id; card.tabIndex = 0; card.title = `Edit ${record.title}`;
      const activate = event => { event.preventDefault(); event.stopPropagation(); open(card, record); };
      card.addEventListener('click', activate);
      card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') activate(event); });
    });
    editor.addEventListener('submit', async event => {
      event.preventDefault(); const urlInput = editor.querySelector('[name="url"]'), fileInput = editor.querySelector('[name="iconFile"]'), status = editor.querySelector('[data-social-editor-status]');
      const url = urlInput.value.trim();
      try { const parsed = new URL(url); if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error(); } catch { status.textContent = 'Enter a complete HTTPS or HTTP channel link.'; urlInput.focus(); return; }
      const record = socialCards().find(item => item.id === activeId); if (!record) { close(); return; }
      const submit = editor.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'Saving…'; status.textContent = '';
      try {
        const file = fileInput.files?.[0], iconUrl = file ? await uploadAppIcon(file) : '';
        const next = socialCards().map(item => item.id === record.id ? { ...item, url, ...(iconUrl ? { iconUrl } : {}) } : item);
        dashboard.socialLinks = { ...(dashboard.socialLinks || {}), cards:next };
        await saveDashboard(`${record.title} updated and published.`, true);
        close(); frame.src = frame.src;
      } catch (error) { status.textContent = error?.message || 'The channel could not be saved. Please try again.'; }
      finally { submit.disabled = false; submit.textContent = 'Save changes'; }
    });
    editor.querySelectorAll('[data-social-editor-close],[data-social-editor-cancel]').forEach(button => button.addEventListener('click', close));
    doc.addEventListener('click', event => { if (!editor.hidden && !editor.contains(event.target)) close(); });
    doc.addEventListener('keydown', event => { if (event.key === 'Escape' && !editor.hidden) { event.preventDefault(); close(); } });
  } catch (_) {}
}
function renderSocial() {
  const root = $('#view-social');
  root.innerHTML = `<p class="view-intro">Select a channel in the employee-page preview to update its approved link or upload a replacement icon. Changes save and publish immediately.</p>${employeePagePreview('Social Media', '/social-media.html')}`;
  return;
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
function renderWhistleblowerLegacy() {
  const config = dashboard.whistleblowerConfig || {};
  $('#view-whistleblower').innerHTML = `<p class="view-intro">Maintain the employee guidance and approved reporting destination. This area never displays, exports, or changes confidential reports.</p><article class="panel"><div class="collection-heading"><div><h2>Employee Voice guidance</h2><p>Keep this content clear and review it with the appropriate policy owner before publishing.</p></div><a class="action-button secondary" href="/whistleblower.html" target="_blank" rel="noopener">View employee page ↗</a></div><form id="whistleblower-config-form" class="settings-form"><div class="form-grid"><label>Page title<input name="heroTitle" required maxlength="120" value="${escapeHtml(config.heroTitle || '')}" /></label><label>Safety note title<input name="safetyTitle" required maxlength="120" value="${escapeHtml(config.safetyTitle || '')}" /></label><label class="form-grid-full">Introduction<textarea name="heroText" required rows="4" maxlength="1200">${escapeHtml(config.heroText || '')}</textarea></label><label class="form-grid-full">Safety note<textarea name="safetyText" required rows="3" maxlength="800">${escapeHtml(config.safetyText || '')}</textarea></label><label class="form-grid-full">Employee Voice destination<input name="voiceUrl" type="text" required maxlength="500" value="${escapeHtml(config.voiceUrl || '')}" placeholder="/employee-voice.html or https://…" /><small>Use an intranet HTML path or an approved HTTPS route. This opens when an employee starts a confidential report.</small></label></div><p class="notice">Submitted reports remain outside Administration and are never available here.</p><div class="form-actions"><button class="action-button primary">Save guidance</button></div></form></article>`;
  const editor = $('#whistleblower-config-form').closest('.panel'), workspace = document.createElement('div');
  workspace.className = 'admin-editor-preview-layout'; editor.before(workspace); workspace.append(editor); editor.hidden = true; workspace.insertAdjacentHTML('beforeend', employeePagePreview('Whistleblower', '/whistleblower.html', [], 'whistleblower-config-form'));
  const voiceLabel = $('#whistleblower-config-form [name="voiceUrl"]')?.closest('label'); if (voiceLabel?.firstChild) voiceLabel.firstChild.textContent = 'Employee Voice URL';
  $('#whistleblower-config-form').addEventListener('submit', async event => { event.preventDefault(); dashboard.whistleblowerConfig = { ...dashboard.whistleblowerConfig, ...Object.fromEntries(new FormData(event.currentTarget)) }; await saveDashboard('Whistleblower guidance saved and published.'); });
}
function renderWhistleblower() {
  const voice = dashboard.whistleblowerConfig || {}, form = dashboard.whistleblower2Config || {};
  const activeGoogleFormRoute = form.enabled === true;
  const activeKey = activeGoogleFormRoute ? 'whistleblower2Config' : 'whistleblowerConfig';
  const activeRoute = activeGoogleFormRoute ? form : voice;
  const inactiveKey = activeGoogleFormRoute ? 'whistleblowerConfig' : 'whistleblower2Config';
  const inactiveRoute = activeGoogleFormRoute ? voice : form;
  const activeTitle = activeGoogleFormRoute ? 'Google Form' : 'Si-Bot Employee Voice Agent';
  const switchTitle = activeGoogleFormRoute ? 'Si-Bot Employee Voice Agent' : 'Google Form';
  const routePath = activeGoogleFormRoute ? '/whistleblower-2.html' : '/whistleblower.html';
  const hiddenFields = (config, fields) => fields.map(name => `<input type="hidden" name="${name}" value="${escapeHtml(config[name] || '')}" />`).join('');
  const voiceFields = ['heroTitle','heroText','safetyTitle','safetyText','voiceUrl'];
  const formFields = ['heroTitle','heroText','safetyTitle','safetyText','formTitle','formText','formUrl'];
  $('#view-whistleblower').innerHTML = `<p class="view-intro">Manage the active employee reporting route from its page preview. The route switch is exclusive: when one route is published, the other is unavailable to employees.</p><article class="panel whistleblower-route-switcher"><div class="collection-heading"><div><h2>${activeTitle} is live</h2><p>${activeGoogleFormRoute ? 'Employees use the embedded Google Form route.' : 'Employees use the confidential Employee Voice route.'}</p></div><div class="row-actions"><span class="record-tag">Published to employees</span><button type="button" class="action-button secondary" data-switch-whistleblower-route>Switch to ${switchTitle}</button><a class="action-button secondary" href="${routePath}" target="_blank" rel="noopener">View page</a></div></div></article><form id="whistleblower-config-form" hidden>${hiddenFields(voice, voiceFields)}</form><form id="whistleblower2-config-form" hidden>${hiddenFields(form, formFields)}</form><div class="whistleblower-route-preview">${employeePagePreview(`Whistleblower: ${activeTitle}`, routePath, [], activeGoogleFormRoute ? 'whistleblower2-config-form' : 'whistleblower-config-form')}</div>`;
  const activeForm = $(`#${activeGoogleFormRoute ? 'whistleblower2-config-form' : 'whistleblower-config-form'}`);
  activeForm.addEventListener('submit', async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(activeForm));
    if (activeGoogleFormRoute) {
      try { const url = new URL(String(values.formUrl || '').trim()); if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !/^\/forms\/d\//.test(url.pathname)) throw new Error(); }
      catch { flash('Enter a shareable HTTPS Google Forms URL from docs.google.com/forms.'); return; }
    }
    dashboard[activeKey] = { ...activeRoute, ...values, enabled:true };
    dashboard[inactiveKey] = { ...inactiveRoute, enabled:false };
    await saveDashboard(`${activeTitle} reporting route updated and published.`);
  });
  $('[data-switch-whistleblower-route]').addEventListener('click', async () => {
    dashboard[activeKey] = { ...activeRoute, enabled:false };
    dashboard[inactiveKey] = { ...inactiveRoute, enabled:true };
    await saveDashboard(`Employees now access the ${switchTitle} reporting route.`);
  });
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
      saveDashboard('Our Team page text saved and published.');
    });
    workspace.append(form);
  }
  if (key === 'events') {
    const copy = dashboard.eventsPageContent || {}, form = document.createElement('form');
    form.id = 'events-page-copy-form'; form.hidden = true;
    form.innerHTML = `<input type="hidden" name="title" value="${escapeHtml(copy.title || 'Events & key dates')}" /><input type="hidden" name="intro" value="${escapeHtml(copy.intro || 'Important dates, sessions and company moments to plan around.')}" />`;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      if (!values.title.trim() || !values.intro.trim()) { flash('The Events heading and description cannot be empty.'); return; }
      if (values.title.length > 120 || values.intro.length > 300) { flash('Keep the heading under 120 characters and the description under 300.'); return; }
      dashboard.eventsPageContent = values;
      await saveDashboard('Events page text saved and published.');
    });
    workspace.append(form);
  }
  const saveFormId = key === 'moments' ? 'moments-page-copy-form' : key === 'sessions' ? 'knowledge-page-copy-form' : key === 'events' ? 'events-page-copy-form' : key === 'newMembers' ? 'recently-joined-page-copy-form' : '';
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
      try { await saveDashboard(`${previous.length} Knowledge Hub sessions removed.`, true, true, 'delete'); }
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
    root.querySelector('.collection-layout > .list')?.insertAdjacentHTML('beforeend', `${announcementScheduleRows()}${announcementTemplateRows()}`);
    root.querySelector('.form-actions')?.insertAdjacentHTML('beforebegin', `<fieldset class="announcement-visibility"><legend>Publication</legend><label><input type="radio" name="deliveryMode" value="now" checked /> Send now</label><label><input type="radio" name="deliveryMode" value="scheduled" /> Schedule</label><div data-announcement-schedule-options hidden><label>Publish date<input name="scheduleDate" type="date" /></label><label>Publish time<input name="scheduleTime" type="time" value="11:00" /></label><label><input name="repeatAnnouncement" type="checkbox" value="true" /> Repeat this announcement</label><div data-announcement-repeat-options hidden><label>Repeat<select name="scheduleFrequency"><option value="weekly" selected>Every week</option><option value="monthly">Every month</option></select></label><label data-schedule-weekday>Day of week<select name="scheduleDayOfWeek">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day, index) => `<option value="${index}" ${index === 2 ? 'selected' : ''}>${day}</option>`).join('')}</select></label><label data-schedule-monthday hidden>Day of month<input name="scheduleDayOfMonth" type="number" min="1" max="31" value="1" /></label></div><small>Choose a date from the calendar. Turn on repeat for a weekly or monthly announcement in Cairo time.</small></div></fieldset><label class="announcement-visibility"><input type="hidden" name="hidden" value="false" /><input type="checkbox" name="hidden" value="true" ${record.hidden === true || record.hidden === 'true' ? 'checked' : ''} /><span><b>Hide from employees</b><small>Keep this announcement in Administration, but remove it from employee pages until you make it visible again.</small></span></label>`);
    root.querySelector('.form-actions')?.insertAdjacentHTML('afterbegin', '<button class="action-button secondary" type="button" data-save-announcement-template>Save as template</button>');
    root.querySelectorAll('.list-row').forEach((row, index) => { if (dashboard.announcements[index]?.hidden === true || dashboard.announcements[index]?.hidden === 'true') row.querySelector('span')?.insertAdjacentHTML('beforeend', '<small class="hidden-announcement-status">Hidden from employees</small>'); });
  }
  if (page.key === 'sessions') enhanceKnowledgeSessionEditor(root);
  if (page.key === 'moments') enhanceMomentEditor(root);
  if (page.key === 'newMembers') enhancePersonEditor(root);
  const previewPages = { apps:['Quick Launch apps','/apps.html'], moments:['Moments','/moments.html'], sessions:['Knowledge Hub','/knowledge-hub.html'], events:['Events & key dates','/events.html'], newMembers:['Our Team','/recently-joined.html'] };
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
  joined?.insertAdjacentHTML('afterend', `<fieldset class="member-contact-editor"><legend>Contact details <small>(optional)</small></legend><label>Company email<input name="companyEmail" type="email" maxlength="120" value="${escapeHtml(record.companyEmail || '')}" placeholder="name@si-ware.com" /></label><label>Phone number<input name="phone" type="tel" maxlength="40" value="${escapeHtml(record.phone || '')}" placeholder="+20 …" /></label><label>LinkedIn profile<input name="linkedinUrl" type="url" maxlength="300" value="${escapeHtml(record.linkedinUrl || '')}" placeholder="https://www.linkedin.com/in/…" /></label></fieldset><fieldset class="member-photo-editor"><legend>Employee photo</legend><label>Photo upload<input name="memberProfilePhoto" type="file" accept="image/png,image/jpeg,image/webp" /><small>JPEG, PNG, or WebP; minimum 600 × 600 pixels and maximum 10 MB.</small></label><div class="member-photo-preview-area">${memberPhotoPreview(record.profilePhotoUrl || record.photoUrl, record.profilePhotoFilename || record.photoFilename, initials)}</div></fieldset><p class="member-editor-status" role="status" aria-live="polite"></p>`);
}
function safeLinkedInUrl(value) { const raw = String(value || '').trim(); if (!raw) return ''; const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`; try { const url = new URL(candidate); return /(^|\.)linkedin\.com$/i.test(url.hostname) ? url.href : null; } catch { return null; } }
async function saveMember(event, form) {
  event.preventDefault();
  const formData = new FormData(form), existing = editingRecord.newMembers && dashboard.newMembers.find(item => item.id === editingRecord.newMembers), status = form.querySelector('.member-editor-status'), button = form.querySelector('.action-button.primary');
  const name = String(formData.get('name') || '').trim(), role = String(formData.get('role') || '').trim(), employmentType = String(formData.get('employmentType') || '').trim(), department = String(formData.get('department') || '').trim(), division = String(formData.get('division') || '').trim(), directManager = String(formData.get('directManager') || '').trim(), employeeId = String(formData.get('employeeId') || '').trim(), joined = String(formData.get('joined') || '').trim(), companyEmail = String(formData.get('companyEmail') || '').trim(), phone = String(formData.get('phone') || '').trim(), linkedinUrl = safeLinkedInUrl(formData.get('linkedinUrl')), photo = formData.get('memberProfilePhoto');
  if (!name || !role || !employmentType || !department || !division || !directManager || !joined) { status.textContent = 'Complete the required employment details before saving.'; return; }
  if (linkedinUrl === null) { status.textContent = 'Use a valid linkedin.com profile URL, or leave this field empty.'; return; }
  try {
    button.disabled = true; button.textContent = photo?.name ? 'Uploading photo…' : 'Saving colleague…'; status.textContent = photo?.name ? `Uploading ${photo.name}…` : 'Saving colleague…';
    const profilePhotoUrl = await uploadEmployeeProfilePhoto(photo);
    const record = { ...(existing || { id:`member-${Date.now()}`, color:'#dceeff', message:'' }), name, role, employmentType, department, division, directManager, employeeId, joined, companyEmail, phone, linkedinUrl, team:department, initials:name.split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase(), profilePhotoUrl:profilePhotoUrl || existing?.profilePhotoUrl || '', profilePhotoFilename:profilePhotoUrl ? photo.name : existing?.profilePhotoFilename || '', intranetOverrides:profilePhotoUrl ? { ...(existing?.intranetOverrides || {}), profilePhotoUrl:true } : existing?.intranetOverrides };
    if (existing) Object.assign(existing, record); else dashboard.newMembers.unshift(record);
    editingRecord.newMembers = record.id; await saveDashboard(profilePhotoUrl ? 'Original employee photo uploaded and published.' : 'Colleague details published.');
  } catch (error) { status.textContent = error.message || 'The colleague could not be saved.'; button.disabled = false; button.textContent = 'Save changes'; }
}
function renderPeople() { renderContentPage('people'); }
function renderApps() { renderContentPage('apps'); }
function normaliseYouTubeVideoUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    const fromPath = url.pathname.split('/').filter(Boolean).pop() || '';
    const id = host === 'youtu.be' ? fromPath : url.searchParams.get('v') || (/^\/(?:embed|shorts)\//.test(url.pathname) ? fromPath : '');
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
  } catch { return null; }
}
const newSiCopyDefaults = {
  checklistCompleteTitle:'First week complete',
  checklistCompleteText:'Excellent work. Your first-week essentials are complete.',
  checklistEmptyText:'Choose one task to begin. You can change a task later.',
  checklistInProgressText:'Keep your momentum going.',
  checklistNextStepText:'Start with the task that gives you access.',
  checklistReopenText:'You can reopen any task.',
  heroCompleteText:'First-week essentials complete',
  trainingWatchAction:'Watch on YouTube',
  welcomeThanks:'Thank you,',
  welcomeRecorded:'Your policy acknowledgement has been recorded.',
  welcomeBody:'Welcome to Si-Ware Systems - we are glad to have you with us.',
  welcomeAction:'Continue your first week'
};
function renderNewSi() {
  const acknowledgement = dashboard.policyAcknowledgementContent || {};
  $('#view-newsi').innerHTML = `<p class="view-intro">Everything employees see on the New Si-Warians page is managed here: policies, acknowledgement wording, first-week guidance, and help portals.</p><div class="manage-stack">${renderCollection('policies')}${renderCollection('firstWeekChecklist')}${renderCollection('supportPortals')}<article class="panel"><div class="collection-heading"><div><h2>Policy acknowledgement</h2><p>Control the exact employee-facing acknowledgement journey and confirmation statement.</p></div></div><form class="inline-editor acknowledgement-editor" id="ack-content-form"><label>Action heading<input required name="actionTitle" maxlength="120" value="${escapeHtml(acknowledgement.actionTitle || '')}" /></label><label>Instruction<textarea required name="instructionText" rows="3" maxlength="360">${escapeHtml(acknowledgement.instructionText || '')}</textarea></label><label>Context heading<input required name="beforeHeading" maxlength="80" value="${escapeHtml(acknowledgement.beforeHeading || '')}" /></label><label>Context text<textarea required name="beforeText" rows="5" maxlength="900">${escapeHtml(acknowledgement.beforeText || '')}</textarea></label><label>Confirmation statement<input required name="confirmationLabel" maxlength="160" value="${escapeHtml(acknowledgement.confirmationLabel || '')}" /></label><label>Confirmation help<input required name="confirmationHelp" maxlength="220" value="${escapeHtml(acknowledgement.confirmationHelp || '')}" /></label><label>Success heading<input required name="acceptedTitle" maxlength="100" value="${escapeHtml(acknowledgement.acceptedTitle || '')}" /></label><label>Success text<textarea required name="afterText" rows="3" maxlength="360">${escapeHtml(acknowledgement.afterText || '')}</textarea></label><div class="form-actions"><button class="action-button primary">Save acknowledgement content</button></div></form></article></div>`;
  const root = $('#view-newsi'), editors = root.querySelector('.manage-stack'), workspace = document.createElement('div');
  const copy = dashboard.newSiPageContent || {}, copyForm = document.createElement('form');
  copyForm.id = 'newsi-page-copy-form'; copyForm.hidden = true;
  newSiPageCopyTargets.forEach(name => { const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = copy[name] || newSiCopyDefaults[name] || ''; copyForm.append(input); });
  workspace.className = 'newsi-editor-preview-layout'; editors.before(workspace); workspace.append(editors, copyForm); editors.hidden = true; workspace.insertAdjacentHTML('beforeend', employeePagePreview('New Si-Warians', '/new-hires.html', [['first-week','Checklist'], ['policies','Policies'], ['training','Training videos'], ['help','Support portals']], 'ack-content-form', ['policies', 'firstWeekChecklist', 'supportPortals']));
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
async function renderComplianceAcknowledgements() {
  const panel = $('#view-compliance');
  if (!panel) return;
  panel.innerHTML = '<p class="view-intro">Review employee confirmations required by Si-Ware’s information-security and policy governance programme.</p><article class="panel"><h2>Loading compliance acknowledgements…</h2></article>';
  try {
    const result = await api('/api/compliance-acknowledgements');
    const policyRows = result.policy.length ? `<div class="list">${result.policy.map(record => `<div class="list-row"><span><b>${escapeHtml(record.employee.name)}</b><small>${escapeHtml(record.employee.email)} · ${record.policies.length} policies · Confirmed ${cairo(record.acceptedAt)}</small></span><span class="record-tag">Confirmed</span></div>`).join('')}</div>` : '<p class="empty">No Essential Policies acknowledgements have been recorded yet.</p>';
    const securityRows = result.security.length ? `<div class="list">${result.security.map(record => `<div class="list-row"><span><b>${escapeHtml(record.employee.name)}</b><small>${escapeHtml(record.employee.email)} · ${escapeHtml(record.method || 'Completed training')} · Completed ${cairo(record.completedAt)}</small></span><span class="record-tag">Completed</span></div>`).join('')}</div>` : '<p class="empty">No Security Awareness Training completions have been recorded yet.</p>';
    panel.innerHTML = `<p class="view-intro">Review employee confirmations required by Si-Ware’s information-security and policy governance programme.</p><div class="manage-stack"><article class="panel"><div class="collection-heading"><div><h2>Essential Policies acknowledgements</h2><p>${result.policy.length} employee confirmation${result.policy.length === 1 ? '' : 's'} recorded.</p></div></div>${policyRows}</article><article class="panel"><div class="collection-heading"><div><h2>Security Awareness Training acknowledgements</h2><p>${result.security.length} employee completion${result.security.length === 1 ? '' : 's'} recorded.</p></div></div>${securityRows}</article></div>`;
  } catch (error) { panel.innerHTML = `<h2>Compliance acknowledgements</h2><p class="notice warning">${escapeHtml(error.message)}</p>`; }
}
function renderAppearance() {
  const labels = { apps:'Main Apps', announcements:'Announcements', 'new-members':'Recently Joined', 'company-news':'Company news', social:'Company channels', news:'Industry pulse', moments:'Moments', knowledge:'Knowledge Hub', events:'Events & key dates', whistleblower:'Employee Voice' };
  const settings = dashboard.settings || { layout:[], hiddenWidgets:[] };
  $('#view-appearance').innerHTML = `<p class="view-intro">Control homepage section order and visibility. Shared brand files remain approved assets, while this workspace safely publishes layout changes.</p><article class="panel"><div class="collection-heading"><div><h2>Homepage sections</h2><p>Use the accessible move controls to set order. Hidden sections remain saved.</p></div><button class="action-button primary" id="save-appearance">Save layout</button></div><div class="layout-editor">${settings.layout.map((key, index) => `<div class="layout-admin-row" data-layout-key="${key}"><span><b>${escapeHtml(labels[key] || key)}</b><small>${settings.hiddenWidgets.includes(key) ? 'Hidden from employees' : 'Visible to employees'}</small></span><label class="visibility"><input type="checkbox" data-layout-visible="${key}" ${settings.hiddenWidgets.includes(key) ? '' : 'checked'} /> Visible</label><div><button type="button" class="tool-button" data-layout-move="${key}:-1" ${index === 0 ? 'disabled' : ''}>Move up</button><button type="button" class="tool-button" data-layout-move="${key}:1" ${index === settings.layout.length - 1 ? 'disabled' : ''}>Move down</button></div></div>`).join('')}</div></article>`;
}
const defaultHomeWidgetSizes = { apps:'full', announcements:'wide', 'new-members':'compact', 'company-news':'full' };
const defaultHomeLayout = ['apps', 'announcements', 'new-members', 'company-news', 'social', 'news', 'moments', 'knowledge', 'events', 'whistleblower'];
const homeHistory = { undo:[], redo:[] };
function homeSnapshot(source = dashboard) {
  const settings = source?.settings || {};
  return structuredClone({ homePageContent:source?.homePageContent || {}, settings:{ layout:settings.layout || [], hiddenWidgets:settings.hiddenWidgets || [], widgetSizes:settings.widgetSizes || {}, removedWidgets:settings.removedWidgets || [], layoutSizingVersion:settings.layoutSizingVersion || 'home-grid-v3' } });
}
function applyHomeSnapshot(snapshot) {
  dashboard.homePageContent = structuredClone(snapshot.homePageContent || {});
  dashboard.settings = { ...dashboard.settings, ...structuredClone(snapshot.settings || {}) };
}
function recordHomeChange(before) {
  const after = homeSnapshot();
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  homeHistory.undo.push({ before, after });
  if (homeHistory.undo.length > 20) homeHistory.undo.shift();
  homeHistory.redo = [];
}
function changeHome(mutator) { const before = homeSnapshot(); mutator(); recordHomeChange(before); renderHomeEditor(); }
async function stepHomeHistory(direction) {
  const source = direction === 'undo' ? homeHistory.undo : homeHistory.redo, destination = direction === 'undo' ? homeHistory.redo : homeHistory.undo;
  if (pageToolBusy || !source.length) return;
  pageToolBusy = true;
  const entry = source.pop(), previous = homeSnapshot();
  applyHomeSnapshot(direction === 'undo' ? entry.before : entry.after);
  try { await saveDashboard(`${direction === 'undo' ? 'Undid' : 'Redid'} the last Home change.`, true, false, direction); destination.push(entry); }
  catch (error) { applyHomeSnapshot(previous); source.push(entry); flash(error.message); renderHomeEditor(); }
  finally { pageToolBusy = false; }
}
async function resetHomeToDefaults() {
  if (!confirm('Reset the Home page layout and hero copy to the saved default baseline? You can undo this change.')) return;
  const before = homeSnapshot();
  const response = await api('/api/admin/defaults');
  const defaults = response.defaults || {}, defaultSettings = defaults.settings || {};
  dashboard.homePageContent = structuredClone(defaults.homePageContent || {});
  dashboard.settings = {
    ...dashboard.settings,
    layout:structuredClone(defaultSettings.layout || defaultHomeLayout),
    hiddenWidgets:structuredClone(defaultSettings.hiddenWidgets || []),
    widgetSizes:structuredClone(defaultSettings.widgetSizes || {}),
    removedWidgets:structuredClone(defaultSettings.removedWidgets || []),
    layoutSizingVersion:defaultSettings.layoutSizingVersion || 'home-grid-v3'
  };
  recordHomeChange(before);
  try { await saveDashboard('Home page restored to the saved default baseline. Use Undo to restore your previous layout.', true, false, 'reset'); }
  catch (error) { applyHomeSnapshot(before); homeHistory.undo.pop(); throw error; }
}
function homeWidgetSize(key) { return dashboard.settings?.widgetSizes?.[key] || defaultHomeWidgetSizes[key] || 'standard'; }
const globalLoginPreviewTargets = {
  loginEyebrow:['[data-global-login-eyebrow]','Sign-in label'],
  loginTitle:['#sign-in-heading','Welcome heading'],
  loginLead:['.login-lead','Welcome description'],
  loginTopline:['[data-global-login-topline]','Introduction label'],
  loginIntroTitle:['.login-intro .intro-copy h2','Introduction heading'],
  loginIntroAccent:['.login-intro .intro-copy h2 span','Highlighted heading'],
  loginIntroDescription:['.login-intro .intro-copy p','Introduction description'],
  loginPreviewTitle:['.login-intro .preview-heading b','Workspace heading'],
  loginPreviewDescription:['.login-intro .preview-heading small','Workspace description'],
  loginPreviewAudience:['.login-intro .preview-audience','Workspace audience'],
  ...Object.fromEntries(['News','People','Tools','Onboarding','Policies'].flatMap((item, index) => [
    [`loginPreview${item}Title`,[`.login-intro .preview-item:nth-child(${index + 1}) strong`,`${item} card title`]],
    [`loginPreview${item}Description`,[`.login-intro .preview-item:nth-child(${index + 1}) small`,`${item} card description`]]
  ]))
};
function enableGlobalLoginPreviewEditing(frame) {
  const doc = frame.contentDocument;
  if (!doc?.body || doc.querySelector('#global-login-preview-editor')) return;
  applyGlobalPageContent(dashboard.globalPageContent || defaultGlobalPageContent, doc);
  doc.querySelector('#login-status')?.setAttribute('hidden', '');
  doc.querySelector('#login-content')?.setAttribute('aria-busy', 'false');
  doc.querySelector('.preview-card')?.removeAttribute('aria-hidden');
  const style = doc.createElement('style');
  style.textContent = `[data-global-edit-key]{cursor:pointer;outline:2px dashed transparent;outline-offset:4px;transition:outline-color .16s ease,background-color .16s ease}[data-global-edit-key]:hover,[data-global-edit-key]:focus-visible{outline-color:#00a7c9;background:rgb(0 167 201 / 14%)}.global-login-preview-editor{position:fixed;z-index:1000;top:18px;right:18px;width:min(360px,calc(100vw - 36px));padding:17px;border:1px solid #b8cde5;border-radius:13px;background:#fff;box-shadow:0 18px 34px rgb(19 56 97 / 18%);color:#102b50;font:500 13px/1.5 Manrope,Arial,sans-serif}.global-login-preview-editor[hidden]{display:none}.global-login-preview-editor header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.global-login-preview-editor header b{font-size:15px}.global-login-preview-editor label{display:grid;gap:7px;font-size:12px;font-weight:800}.global-login-preview-editor input,.global-login-preview-editor textarea{width:100%;border:1px solid #aac3df;border-radius:7px;padding:10px;color:#102b50;background:#fff;font:600 13px/1.5 Manrope,Arial,sans-serif}.global-login-preview-editor textarea{resize:vertical;min-height:88px}.global-login-preview-editor input:focus,.global-login-preview-editor textarea:focus{outline:3px solid rgb(0 167 201 / 24%);border-color:#0759aa}.global-login-preview-editor .editor-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}.global-login-preview-editor button{border:1px solid #aac3df;border-radius:7px;padding:8px 11px;background:#fff;color:#0759aa;font:800 12px Manrope,Arial,sans-serif;cursor:pointer}.global-login-preview-editor button[type=submit]{border-color:#0759aa;background:#0759aa;color:#fff}.global-login-preview-editor button:disabled{opacity:.6;cursor:wait}.global-login-preview-editor [role=status]{min-height:1.2em;margin:9px 0 0;color:#a4263d;font-size:12px;font-weight:700}`;
  doc.head.append(style);
  for (const [key, [selector, label]] of Object.entries(globalLoginPreviewTargets)) {
    const node = doc.querySelector(selector);
    if (!node) continue;
    node.dataset.globalEditKey = key;
    node.tabIndex = 0;
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', `Edit ${label.toLowerCase()}`);
    node.title = `Edit ${label.toLowerCase()}`;
  }
  const editor = doc.createElement('form');
  editor.id = 'global-login-preview-editor';
  editor.className = 'global-login-preview-editor';
  editor.hidden = true;
  editor.innerHTML = '<header><b>Edit login text</b><button type="button" data-close>Close</button></header><label><span data-field-label></span><input data-value required maxlength="400" /></label><p role="status" aria-live="polite"></p><div class="editor-actions"><button type="button" data-cancel>Cancel</button><button type="submit">Save changes</button></div>';
  doc.body.append(editor);
  const close = () => { editor.hidden = true; doc.querySelector(`[data-global-edit-key="${editor.dataset.key}"]`)?.focus(); };
  editor.querySelector('[data-close]').addEventListener('click', close);
  editor.querySelector('[data-cancel]').addEventListener('click', close);
  const open = key => {
    const target = globalLoginPreviewTargets[key]; if (!target) return;
    const current = normaliseGlobalPageContent(dashboard.globalPageContent);
    editor.dataset.key = key;
    editor.querySelector('[data-field-label]').textContent = target[1];
    const old = editor.querySelector('[data-value]');
    const multiline = key === 'loginLead' || key === 'loginIntroDescription';
    const input = doc.createElement(multiline ? 'textarea' : 'input');
    input.dataset.value = '';
    input.required = true;
    input.maxLength = multiline ? 400 : 180;
    input.value = current[key];
    if (multiline) input.rows = 3;
    old.replaceWith(input);
    editor.querySelector('[role=status]').textContent = '';
    editor.hidden = false;
    input.focus(); input.select();
  };
  doc.addEventListener('click', event => {
    if (event.target.closest('a')) event.preventDefault();
    if (event.target.closest('#global-login-preview-editor')) return;
    const target = event.target.closest('[data-global-edit-key]');
    if (target) open(target.dataset.globalEditKey);
  });
  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !editor.hidden) { event.preventDefault(); close(); return; }
    if (!['Enter',' '].includes(event.key) || !editor.hidden) return;
    const target = event.target.closest('[data-global-edit-key]');
    if (target) { event.preventDefault(); open(target.dataset.globalEditKey); }
  });
  editor.addEventListener('submit', async event => {
    event.preventDefault();
    const key = editor.dataset.key, value = editor.querySelector('[data-value]').value.trim();
    const status = editor.querySelector('[role=status]'), button = editor.querySelector('button[type=submit]');
    if (!value) { status.textContent = 'Enter text before saving.'; return; }
    button.disabled = true; status.textContent = 'Saving changes…';
    try {
      dashboard.globalPageContent = normaliseGlobalPageContent({ ...dashboard.globalPageContent, [key]:value });
      await saveDashboard('Login page text saved and published.', true);
    } catch (error) { status.textContent = error.message || 'Could not save this text. Try again.'; button.disabled = false; }
  });
  frame.style.height = `${Math.max(820, doc.documentElement.scrollHeight, doc.body.scrollHeight)}px`;
}
function renderGlobalPages() {
  const content = normaliseGlobalPageContent(dashboard.globalPageContent || defaultGlobalPageContent);
  const imageFields = [
    ['headerLogoUrl','Header and page logo','Shown in the intranet header and shared brand locations.'],
    ['loginLogoUrl','Login page logo','Shown above the sign-in form.'],
    ['footerLogoUrl','Footer and brand mark','Shown in the standard footer and small Si-Ware marks.'],
    ['faviconUrl','Browser favicon','Shown in browser tabs and bookmarks.']
  ];
  const textField = (name, label, options = {}) => `<label class="global-field"><span>${label}</span>${options.multiline ? `<textarea name="${name}" rows="3" maxlength="400" required>${escapeHtml(content[name])}</textarea>` : `<input name="${name}" type="${options.type || 'text'}" ${options.type === 'url' ? 'pattern="https://.*" title="Use a complete HTTPS address"' : ''} maxlength="${options.type === 'url' ? 500 : 200}" value="${escapeHtml(content[name])}" required />`}</label>`;
  const imageField = ([name, label, help]) => `<label class="global-image-field"><span class="global-image-sample"><img src="${escapeHtml(content[name])}" alt="Current ${escapeHtml(label.toLowerCase())}" /></span><span class="global-image-copy"><b>${label}</b><small>${help}</small><small>Current file: ${escapeHtml(content[name])}</small><input name="${name}File" type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.ico,image/png,image/jpeg,image/webp,image/gif,image/x-icon" aria-label="Upload ${escapeHtml(label.toLowerCase())}" /></span></label>`;
  $('#view-global').innerHTML = `<p class="view-intro">Manage the shared identity and page copy from one place. Publish changes here to update every intranet page without editing its code.</p>
    <nav class="global-page-nav" aria-label="Global content sections"><a href="#global-branding">Branding</a><a href="#global-login">Login page</a><a href="#global-footer">Footer</a></nav>
    <form id="global-pages-form" class="global-pages-form">
      <section id="global-branding" class="panel global-pages-section"><div class="global-section-heading"><div><h2>Shared branding</h2><p>Upload a replacement only where you want to change the current image. PNG is recommended for logos; ICO or PNG works for the favicon.</p></div><a class="tool-link" href="/" target="_blank" rel="noopener">View intranet ↗</a></div><div class="global-image-grid">${imageFields.map(imageField).join('')}</div><div class="global-field-grid">${textField('headerWordmark','Header label')}</div></section>
      <section id="global-login" class="panel global-pages-section"><div class="global-section-heading"><div><h2>Login page</h2><p>Select highlighted text in the page preview to edit and publish it. Sign-in controls and security messages remain system-managed.</p></div><a class="tool-link" href="/login.html" target="_blank" rel="noopener">View login ↗</a></div><div class="global-login-preview"><div class="global-login-preview-head"><b>Login page preview</b><span>Click highlighted copy to edit</span></div><iframe src="/login.html" sandbox="allow-same-origin" data-global-login-preview title="Editable login page preview"></iframe></div></section>
      <section id="global-footer" class="panel global-pages-section"><div class="global-section-heading"><div><h2>Standard footer</h2><p>These details appear in the shared footer across employee pages and on the login page.</p></div></div><div class="global-field-grid">${textField('footerLegal','Copyright line')}${textField('footerSupportText','Support prompt')}${textField('footerSupportEmail','Support email',{type:'email'})}${textField('footerLinkedinUrl','LinkedIn URL',{type:'url'})}${textField('footerFacebookUrl','Facebook URL',{type:'url'})}${textField('footerYoutubeUrl','YouTube URL',{type:'url'})}${textField('footerWebsiteUrl','Website URL',{type:'url'})}</div></section>
      <div class="global-save-bar"><span>Changes publish to the employee intranet when saved.</span><button class="action-button primary" type="submit">Publish global content</button></div>
    </form>`;
  const loginFrame = $('#global-login iframe[data-global-login-preview]');
  loginFrame.addEventListener('load', () => enableGlobalLoginPreviewEditing(loginFrame));
  $('#global-pages-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
    if (!form.reportValidity()) return;
    try {
      button.disabled = true; button.textContent = 'Publishing…';
      const values = Object.fromEntries(new FormData(form));
      const next = { ...content };
      for (const key of Object.keys(defaultGlobalPageContent)) if (Object.hasOwn(values, key) && !imageFields.some(([imageKey]) => imageKey === key)) next[key] = String(values[key] || '').trim();
      for (const [key] of imageFields) { const file = form.elements.namedItem(`${key}File`)?.files?.[0]; if (file) next[key] = await uploadGlobalImage(file); }
      dashboard.globalPageContent = normaliseGlobalPageContent(next);
      await saveDashboard('Global page content published across the intranet.', true);
    } catch (error) { flash(error.message || 'Global content could not be published.'); button.disabled = false; button.textContent = 'Publish global content'; }
  });
}
function renderHomeEditor() {
  const labels = { apps:'Main Apps', announcements:'Hero & announcements', 'new-members':'Recently Joined', 'company-news':'Company news', social:'Company channels', news:'Industry pulse', moments:'Moments', knowledge:'Knowledge Hub', events:'Events & key dates', whistleblower:'Employee Voice' };
  const destinations = { apps:'apps', announcements:'announcements', 'new-members':'people', social:'social', moments:'moments', knowledge:'knowledge', events:'events', whistleblower:'whistleblower' };
  dashboard.settings ||= { layout:[], hiddenWidgets:[], widgetSizes:{}, removedWidgets:[] };
  dashboard.settings.layout ||= [];
  dashboard.settings.hiddenWidgets ||= [];
  dashboard.settings.widgetSizes ||= {};
  dashboard.settings.removedWidgets ||= [];
  if (dashboard.settings.layoutSizingVersion !== 'home-grid-v3') { dashboard.settings.widgetSizes = {}; dashboard.settings.layoutSizingVersion = 'home-grid-v3'; }
  // Older saved layouts used this onboarding-era key for the Company News card.
  // Normalize it here as well as on the employee page so administration stays accurate.
  dashboard.settings.layout = dashboard.settings.layout.map(key => key === 'new-warians' ? 'company-news' : key);
  if (!dashboard.settings.layout.includes('apps') && !dashboard.settings.removedWidgets.includes('apps')) dashboard.settings.layout.unshift('apps');
  dashboard.homePageContent ||= {};
  const copy = { heroTitle:'Make room for what’s next.', heroDescription:'One place to find your people, sharpen your craft, and keep the work moving with purpose.', heroAction:'Explore what’s happening', heroActionUrl:'#knowledge', ...dashboard.homePageContent };
  const layout = dashboard.settings.layout;
  const storedWidgetSizes = dashboard.settings.widgetSizes;
  dashboard.settings.widgetSizes = { ...defaultHomeWidgetSizes, ...storedWidgetSizes };
  $('#view-home').innerHTML = `<p class="view-intro">Select text or a card in the employee preview to edit it. Use the destination picker to place any Home section exactly where you want it, then publish the order.</p><div class="home-editor-layout"><div class="home-editor-controls"><article class="panel"><div class="collection-heading"><div><span class="page-editor-eyebrow">Home hero</span><h2>Welcome message</h2><p>These fields control the introduction and action at the top of the employee Home page.</p></div></div><form id="home-hero-form" class="home-hero-form"><label>Heading<input id="home-hero-title" name="heroTitle" maxlength="90" required value="${escapeHtml(copy.heroTitle)}" /></label><label>Description<textarea name="heroDescription" maxlength="240" required rows="4">${escapeHtml(copy.heroDescription)}</textarea></label><label>Button label<input name="heroAction" maxlength="50" required value="${escapeHtml(copy.heroAction)}" /></label><label>Button link<input name="heroActionUrl" maxlength="500" required value="${escapeHtml(copy.heroActionUrl)}" placeholder="#knowledge, /recently-joined.html, or https://…" /><small>Use a Home anchor, an intranet path, or a secure HTTPS link.</small></label><div class="form-actions"><button class="action-button primary">Publish hero copy</button></div></form></article><article class="panel home-layout-panel"><div class="collection-heading"><div><span class="page-editor-eyebrow">Home layout</span><h2>Section order</h2><p>Choose a destination for a section to place it anywhere on the employee Home page.</p></div><button type="button" class="action-button primary" id="save-home-layout">Publish order</button></div><div class="home-layout-editor">${layout.map((key, index) => `<div class="home-layout-row"><span class="home-layout-number">${index + 1}</span><span><b>${escapeHtml(labels[key] || key)}</b><small>${dashboard.settings.hiddenWidgets?.includes(key) ? 'Hidden from employees' : 'Visible to employees'}</small></span><select aria-label="Move ${escapeHtml(labels[key] || key)} to position" data-home-layout-position="${key}">${layout.map((_, targetIndex) => `<option value="${targetIndex}" ${targetIndex === index ? 'selected' : ''}>Position ${targetIndex + 1}</option>`).join('')}</select>${destinations[key] ? `<button type="button" class="tool-button" data-home-edit-view="${destinations[key]}">Edit content</button>` : '<span></span>'}</div>`).join('')}</div></article></div>${employeePagePreview('Home page', '/', [['top','Hero'], ['knowledge','Knowledge Hub'], ['events','Events']], '', [])}</div>`;
  const homeActions = `<div class="home-editor-commandbar" aria-label="Home editing actions">${hasAdminPermission('action.undo') ? `<button type="button" class="action-button secondary" data-home-undo ${homeHistory.undo.length ? '' : 'disabled'}>Undo</button>` : ''}${hasAdminPermission('action.redo') ? `<button type="button" class="action-button secondary" data-home-redo ${homeHistory.redo.length ? '' : 'disabled'}>Redo</button>` : ''}${hasAdminPermission('action.reset') ? '<button type="button" class="action-button danger" data-home-reset>Reset to defaults</button>' : ''}</div>`;
  $('#view-home').innerHTML = `<p class="view-intro">Select text or a card in the employee preview to edit it. Use the destination picker to place any Home section exactly where you want it, then publish the order.</p>${homeActions}<div class="home-editor-layout"><div class="home-editor-controls"><article class="panel"><div class="collection-heading"><div><span class="page-editor-eyebrow">Home hero</span><h2>Welcome message</h2><p>These fields control the introduction and action at the top of the employee Home page.</p></div></div><form id="home-hero-form" class="home-hero-form"><label>Heading<input id="home-hero-title" name="heroTitle" maxlength="90" required value="${escapeHtml(copy.heroTitle)}" /></label><label>Description<textarea name="heroDescription" maxlength="240" required rows="4">${escapeHtml(copy.heroDescription)}</textarea></label><label>Button label<input name="heroAction" maxlength="50" required value="${escapeHtml(copy.heroAction)}" /></label><label>Button link<input name="heroActionUrl" maxlength="500" required value="${escapeHtml(copy.heroActionUrl)}" placeholder="#knowledge, /recently-joined.html, or https://…" /><small>Use a Home anchor, an intranet path, or a secure HTTPS link.</small></label><div class="form-actions"><button class="action-button primary">Publish hero copy</button></div></form></article><article class="panel home-layout-panel"><div class="collection-heading"><div><span class="page-editor-eyebrow">Home layout</span><h2>Section order</h2><p>Set placement, visibility, and size for each Home section. Removed sections can be added back before publishing.</p></div><button type="button" class="action-button primary" id="save-home-layout">Publish layout</button></div><div class="home-layout-editor">${layout.map((key, index) => `<div class="home-layout-row"><span class="home-layout-number">${index + 1}</span><span><b>${escapeHtml(labels[key] || key)}</b><small>${dashboard.settings.hiddenWidgets.includes(key) ? 'Hidden from employees' : 'Visible to employees'}</small></span><select aria-label="Move ${escapeHtml(labels[key] || key)} to position" data-home-layout-position="${key}">${layout.map((_, targetIndex) => `<option value="${targetIndex}" ${targetIndex === index ? 'selected' : ''}>Position ${targetIndex + 1}</option>`).join('')}</select>${destinations[key] ? `<button type="button" class="tool-button" data-home-edit-view="${destinations[key]}">Edit content</button>` : '<span></span>'}<div class="home-layout-controls"><label><input type="checkbox" data-home-layout-visible="${key}" ${dashboard.settings.hiddenWidgets.includes(key) ? '' : 'checked'} /> Visible</label><label>Size<select data-home-layout-size="${key}"><option value="compact" ${dashboard.settings.widgetSizes[key] === 'compact' ? 'selected' : ''}>Compact</option><option value="standard" ${!dashboard.settings.widgetSizes[key] || dashboard.settings.widgetSizes[key] === 'standard' ? 'selected' : ''}>Standard</option><option value="wide" ${dashboard.settings.widgetSizes[key] === 'wide' ? 'selected' : ''}>Wide</option><option value="full" ${dashboard.settings.widgetSizes[key] === 'full' ? 'selected' : ''}>Full width</option></select></label><button type="button" class="tool-button danger-link" data-home-remove-section="${key}">Remove from Home</button></div></div>`).join('')}</div>${(() => { const missing = Object.keys(labels).filter(key => !layout.includes(key)); return missing.length ? `<div class="home-layout-add"><label>Add a removed section<select id="add-home-section">${missing.map(key => `<option value="${key}">${escapeHtml(labels[key])}</option>`).join('')}</select></label><button class="action-button secondary" type="button" id="add-home-section-button">Add section</button></div>` : ''; })()}</article></div>${employeePagePreview('Home page', '/', [['top','Hero'], ['knowledge','Knowledge Hub'], ['events','Events']], '', [])}</div>`;
  dashboard.settings.widgetSizes = storedWidgetSizes;
  $('#home-hero-form').addEventListener('submit', async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)), link = String(values.heroActionUrl || '').trim(); if (!/^(#[A-Za-z][\w-]*|\/(?!\/)[^\s]*|https:\/\/[^\s]+)$/i.test(link)) { flash('Use a Home anchor, an intranet path beginning with /, or an HTTPS link for the button.'); return; } const before = homeSnapshot(); dashboard.homePageContent = { ...dashboard.homePageContent, ...values, heroActionUrl:link }; recordHomeChange(before); await saveDashboard('Home hero copy and button link published.', false, false); });
}
async function saveDashboard(message, rethrow = false, recordHistory = true, operation = '') {
  const previous = savedDashboard;
  try {
    dashboard = await api('/api/admin/dashboard', { method:'PATCH', body:JSON.stringify({ data:dashboard, version:dashboard._version, operation }) });
    if (recordHistory && previous) for (const view of editablePageViews) {
      if (!pageChanged(previous, dashboard, view)) continue;
      const history = pageHistory[view];
      history.undo.push({ before:pageSnapshot(previous, view), after:pageSnapshot(dashboard, view) });
      if (history.undo.length > 20) history.undo.shift();
      history.redo.length = 0;
    }
    savedDashboard = structuredClone(dashboard);
    applyGlobalPageContent(dashboard.globalPageContent);
    summary = await api('/api/admin/summary').catch(() => summary);
    flash(message);
    renderAllowedAdminViews(); updatePageTools();
  } catch (error) {
    if (previous) dashboard = structuredClone(previous);
    flash(error.message);
    if (rethrow) throw error;
  }
}
function activeAdminView() { return document.querySelector('.admin-view.active')?.id.replace(/^view-/, '') || 'overview'; }
const pageCreateActions = {
  apps:{ key:'apps', label:'Add Quick Launch app', preview:true },
  announcements:{ key:'announcements', label:'Add announcement' },
  moments:{ key:'moments', label:'Add moment', preview:true },
  knowledge:{ key:'sessions', label:'Add session', preview:true },
  events:{ key:'events', label:'Add event', preview:true },
  people:{ key:'newMembers', label:'Add colleague', preview:true },
  newsi:[{ key:'policies', label:'Add policy', preview:true }, { key:'firstWeekChecklist', label:'Add checklist item', preview:true }, { key:'supportPortals', label:'Add support portal', preview:true }]
};
const pageSaveForms = { whistleblower:'whistleblower-config-form', moments:'moments-page-copy-form', knowledge:'knowledge-page-copy-form', events:'events-page-copy-form', people:'recently-joined-page-copy-form', newsi:'ack-content-form' };
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
  const dataItems = `${importTool && hasAdminPermission('action.import') ? `<input id="${importTool.input}" type="file" accept="${importTool.accept}" hidden /><a href="${importTool.template}" download="${importTool.filename}">Download template</a><button type="button" ${importTool.action}>Import CSV</button>` : ''}${hasAdminPermission('action.export_csv') ? '<button type="button" data-page-export-csv>Export CSV</button>' : ''}${hasAdminPermission('action.export') ? '<button type="button" data-page-export>Export JSON</button>' : ''}`;
  const dataMenu = dataItems ? `<details class="admin-page-tools-menu"><summary>Data</summary><div class="admin-page-tools-menu-items" role="menu">${dataItems}</div></details>` : '';
  const historyItems = `${hasAdminPermission('action.undo') ? `<button type="button" data-page-undo ${pageToolBusy || !history.undo.length ? 'disabled' : ''}>Undo</button>` : ''}${hasAdminPermission('action.redo') ? `<button type="button" data-page-redo ${pageToolBusy || !history.redo.length ? 'disabled' : ''}>Redo</button>` : ''}`;
  const historyGroup = historyItems ? `<div class="admin-page-tools-group">${historyItems}</div>` : '';
  const moreItems = `${view === 'knowledge' && hasAdminPermission('action.delete') ? `<button type="button" class="admin-page-remove-all" data-page-remove-all-sessions ${dashboard.sessions?.length ? '' : 'disabled'}>Remove all sessions</button>` : ''}${view === 'people' && hasAdminPermission('action.delete') ? `<button type="button" class="admin-page-remove-all" data-page-delete-all-people ${dashboard.newMembers?.length ? '' : 'disabled'}>Delete all colleagues</button>` : ''}${hasAdminPermission('action.reset') ? `<button type="button" data-page-reset class="admin-page-reset" ${pageToolBusy ? 'disabled' : ''}>Reset to default</button>` : ''}`;
  const moreMenu = moreItems ? `<details class="admin-page-tools-menu"><summary>More actions</summary><div class="admin-page-tools-menu-items" role="menu">${moreItems}</div></details>` : '';
  return `${editGroup ? `<div class="admin-page-tools-group">${editGroup}</div>` : ''}${historyGroup}${dataMenu || moreMenu ? `<div class="admin-page-tools-group">${dataMenu}${moreMenu}</div>` : ''}`;
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
function csvEscape(value) { const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value); return `"${text.replace(/"/g, '""')}"`; }
function csvRecordsForPage(view) {
  const snapshot = pageSnapshot(savedDashboard || dashboard, view);
  const primary = { apps:'apps', announcements:'announcements', moments:'moments', knowledge:'sessions', events:'events', people:'newMembers', newsi:'policies' }[view];
  if (primary && Array.isArray(snapshot[primary])) return snapshot[primary];
  return Object.entries(snapshot).flatMap(([section, value]) => Array.isArray(value) ? value.map(record => ({ section, ...record })) : value && typeof value === 'object' ? [{ section, ...value }] : [{ section, value }]);
}
function exportPageCsv(view) {
  const label = $('#page-title').textContent, records = csvRecordsForPage(view), columns = [...new Set(records.flatMap(record => Object.keys(record)))];
  if (!columns.length) { flash(`There is no ${label} data to export.`); return; }
  const csv = `\uFEFF${columns.map(csvEscape).join(',')}\r\n${records.map(record => columns.map(column => csvEscape(record[column])).join(',')).join('\r\n')}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })), link = document.createElement('a');
  link.href = url; link.download = `siware-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  flash(`${label} exported as CSV.`);
}
async function stepPageHistory(view, direction) {
  const history = pageHistory[view], source = direction === 'undo' ? history.undo : history.redo, destination = direction === 'undo' ? history.redo : history.undo;
  if (pageToolBusy || !source?.length) return;
  pageToolBusy = true;
  const entry = source.pop(), previous = structuredClone(dashboard);
  applyPageSnapshot(dashboard, view, direction === 'undo' ? entry.before : entry.after);
  updatePageTools();
  try { await saveDashboard(`${direction === 'undo' ? 'Undid' : 'Redid'} the last ${$('#page-title').textContent} change.`, true, false, direction); destination.push(entry); }
  catch { dashboard = previous; source.push(entry); }
  pageToolBusy = false;
  updatePageTools();
}
async function resetPageToDefault(view) {
  const previous = structuredClone(dashboard), label = $('#page-title').textContent;
  const response = await api('/api/admin/defaults');
  const defaults = pageSnapshot(response.defaults, view);
  if (view === 'announcements') Object.assign(defaults, { announcements:[], announcementSchedules:[], announcementTemplates:[] });
  if (JSON.stringify(pageSnapshot(dashboard, view)) === JSON.stringify(defaults)) { flash(`${label} already matches its default.`); return; }
  applyPageSnapshot(dashboard, view, defaults);
  try { await saveDashboard(`${label} restored to default. Use Undo to restore the previous version.`, true, true, 'reset'); }
  catch (error) { dashboard = previous; throw error; }
}
function setupPageTools() {
  const tools = $('#admin-page-tools');
  tools.addEventListener('click', event => {
    const view = activeAdminView(); if (!pageDataKeys[view]) return;
    if (event.target.closest('[data-page-export]')) exportPageData(view);
    if (event.target.closest('[data-page-export-csv]')) exportPageCsv(view);
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
    if (event.target.closest('[data-page-delete-all-people]')) openPeopleDeleteAllDialog();
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
function openPeopleDeleteAllDialog() {
  if (!dashboard.newMembers?.length) return;
  let dialog = $('#people-delete-all-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'people-delete-all-dialog';
    dialog.className = 'knowledge-remove-dialog';
    dialog.innerHTML = '<form><h2>Delete all Our Team directory entries?</h2><p data-people-delete-description></p><label>Type DELETE to confirm<input name="confirmation" autocomplete="off" spellcheck="false" required /></label><p class="knowledge-remove-error" role="alert"></p><div class="knowledge-remove-dialog-actions"><button type="button" class="action-button" data-people-delete-cancel>Cancel</button><button type="submit" class="action-button knowledge-remove-all">Delete all colleagues</button></div></form>';
    document.body.append(dialog);
    dialog.querySelector('[data-people-delete-cancel]').addEventListener('click', () => dialog.close());
    dialog.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const input = dialog.querySelector('[name="confirmation"]'), error = dialog.querySelector('[role="alert"]'), submit = dialog.querySelector('[type="submit"]');
      if (input.value !== 'DELETE') { error.textContent = 'Type DELETE exactly to remove every colleague.'; input.focus(); return; }
      const previous = dashboard.newMembers;
      submit.disabled = true;
      dashboard.newMembers = [];
      editingRecord.newMembers = '';
      try { await saveDashboard(`${previous.length} Our Team colleague${previous.length === 1 ? '' : 's'} deleted. Use Undo to restore them in this browser tab.`, true, true, 'delete'); dialog.close(); }
      catch (saveError) { dashboard.newMembers = previous; error.textContent = saveError.message || 'Colleagues were not deleted. Try again.'; submit.disabled = false; }
    });
  }
  const count = dashboard.newMembers.length;
  dialog.querySelector('[data-people-delete-description]').textContent = `This removes all ${count} colleague${count === 1 ? '' : 's'} from the Our Team directory, including Google-synced cards. It does not delete Google Workspace accounts. You can use Undo in this browser tab after a successful deletion.`;
  dialog.querySelector('[name="confirmation"]').value = '';
  dialog.querySelector('[role="alert"]').textContent = '';
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
    : view === 'settings'
      ? 'This restores the approved Google Workspace sync configuration: selected organisational units and calendars, daily directory sync at 08:00, and hourly calendar sync. You can undo the reset in this browser tab.'
    : 'This replaces the saved content on this page with the saved default baseline. Export a backup first if needed. You can undo the reset in this browser tab.';
  dialog.querySelector('[name="confirmation"]').value = '';
  dialog.querySelector('[role="alert"]').textContent = '';
  dialog.showModal();
  dialog.querySelector('[name="confirmation"]').focus();
}
function createRecord(key, form) { const record = Object.fromEntries(new FormData(form)); delete record.iconImage; delete record.policyDocument; delete record.checklistAttachment; delete record.announcementMedia; delete record.announcementAttachment; if (key === 'sessions') record.presenter = { name:'Intranet team', initials:'IT' }; if (key === 'newMembers') { record.initials = String(record.name || '').split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase(); record.team = record.department; record.message = ''; record.color = '#dceeff'; } if (key === 'firstWeekChecklist') { record.resourceUrl ||= ''; record.attachmentUrl ||= ''; } if (key === 'apps') record.icon = 'spark'; if (key === 'moments') record.mediaUrl = ''; return { id:`${key}-${Date.now()}`, ...record }; }
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
document.addEventListener('click', event => {
  if (event.target.closest('[data-home-undo]')) { stepHomeHistory('undo'); return; }
  if (event.target.closest('[data-home-redo]')) { stepHomeHistory('redo'); return; }
  if (event.target.closest('[data-home-reset]')) { resetHomeToDefaults().catch(error => flash(error.message)); return; }
  const edit = event.target.closest('[data-home-edit-view]');
  if (edit) { showView(edit.dataset.homeEditView); return; }
  const remove = event.target.closest('[data-home-remove-section]');
  if (remove) {
    const key = remove.dataset.homeRemoveSection;
    if (!confirm(`Remove ${key === 'apps' ? 'Main Apps' : key.replace(/-/g, ' ')} from the Home page? Its content will be kept and you can add the section back later.`)) return;
    changeHome(() => {
      dashboard.settings.layout = dashboard.settings.layout.filter(item => item !== key);
      dashboard.settings.hiddenWidgets = dashboard.settings.hiddenWidgets.filter(item => item !== key);
      dashboard.settings.removedWidgets = [...new Set([...(dashboard.settings.removedWidgets || []), key])];
    }); return;
  }
  if (event.target.id === 'add-home-section-button') {
    const key = $('#add-home-section')?.value;
    if (!key) return;
    changeHome(() => {
      dashboard.settings.layout.push(key);
      dashboard.settings.removedWidgets = (dashboard.settings.removedWidgets || []).filter(item => item !== key);
    }); return;
  }
  if (event.target.id === 'save-home-layout') saveDashboard('Home section order published.');
});
document.addEventListener('change', event => {
  const select = event.target.closest('[data-home-layout-position]');
  if (select) {
    const layout = dashboard.settings?.layout || [], from = layout.indexOf(select.dataset.homeLayoutPosition), to = Number(select.value);
    if (from < 0 || !Number.isInteger(to) || to < 0 || to >= layout.length) return;
    changeHome(() => { const [section] = layout.splice(from, 1); layout.splice(to, 0, section); }); return;
  }
  const visible = event.target.closest('[data-home-layout-visible]');
  if (visible) {
    const hidden = new Set(dashboard.settings.hiddenWidgets || []), key = visible.dataset.homeLayoutVisible;
    changeHome(() => { visible.checked ? hidden.delete(key) : hidden.add(key); dashboard.settings.hiddenWidgets = [...hidden]; }); return;
  }
  const size = event.target.closest('[data-home-layout-size]');
  if (size) { const key = size.dataset.homeLayoutSize; changeHome(() => { if (size.value === (defaultHomeWidgetSizes[key] || 'standard')) delete dashboard.settings.widgetSizes[key]; else dashboard.settings.widgetSizes[key] = size.value; }); }
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
document.addEventListener('click', event => {
  const button = event.target.closest('[data-edit-email]'); if (!button) return;
  const preview = button.closest('.announcement-email-preview'), frame = preview?.querySelector('[data-email-preview]'), value = preview?.querySelector('[data-email-html]'), document = frame?.contentDocument;
  if (!preview || !frame || !value || !document?.body) return;
  const editing = !preview.classList.contains('is-editing');
  preview.classList.toggle('is-editing', editing); document.body.contentEditable = String(editing); document.body.spellcheck = editing;
  frame.title = editing ? 'Editable announcement email' : 'Announcement email preview'; button.textContent = editing ? 'Finish editing' : 'Edit email';
  const capture = () => { value.value = `<!doctype html>${document.documentElement.outerHTML}`; };
  if (editing) { frame.addEventListener('load', capture, { once:true }); document.addEventListener('input', capture); document.body.focus(); }
  capture();
});
document.addEventListener('paste', event => {
  const editor = event.target.closest('[data-rich-editor]'), form = editor?.closest('[data-editor="announcements"]'), html = event.clipboardData?.getData('text/html');
  if (!editor || !form || !isEmailAnnouncementHtml(html)) return;
  event.preventDefault(); form.dataset.emailClipboardHtml = html;
  const missingImages = /\bsrc\s*=\s*["'](?:cid:|image(?:["']|$)|["'])/i.test(html), richEditor = editor.closest('.rich-editor');
  richEditor.outerHTML = `<section class="announcement-email-preview"><div class="announcement-email-preview-head"><div><h4>Email preview</h4><p>Original email layout captured. Select Edit email to change its text before saving.</p></div><button class="tool-button" type="button" data-edit-email>Edit email</button></div><iframe title="Announcement email preview" sandbox="allow-same-origin" data-email-preview srcdoc="${escapeHtml(html)}"></iframe><input type="hidden" name="legacyEmailHtml" data-email-html value="${escapeHtml(html)}" />${missingImages ? '<small>Some email images were not included in the copied email. Upload replacements using Inline photo or video below.</small>' : ''}</section>`;
});
document.addEventListener('click', event => { const control = event.target.closest('[data-rich-command]'); if (!control || control.matches('select,input')) return; const editor = control.closest('form')?.querySelector('[data-rich-editor]'); if (!editor) return; editor.focus(); document.execCommand(control.dataset.richCommand, false, null); });
document.addEventListener('change', event => { const control = event.target.closest('[data-rich-command]'); if (!control || !control.matches('select,input')) return; const editor = control.closest('form')?.querySelector('[data-rich-editor]'); if (!editor) return; editor.focus(); const command = control.dataset.richCommand, value = command === 'formatBlock' ? `<${control.value}>` : control.value; document.execCommand(command, false, value); });
function renderAttachmentSelection(input) { const files = input._announcementFiles || []; let output = input.parentElement.querySelector('[data-attachment-selection]'); if (!output) { output = document.createElement('div'); output.className = 'attachment-selection'; output.dataset.attachmentSelection = ''; input.insertAdjacentElement('afterend', output); } output.innerHTML = files.length ? `<b>${files.length} file${files.length === 1 ? '' : 's'} ready to add</b>${files.map((file, index) => `<small>${escapeHtml(file.name)} · ${Math.ceil(file.size / 1024)} KB <button type="button" data-remove-selected-attachment="${index}">Remove</button></small>`).join('')}` : '<b>No new files selected</b><small>Select files together, or choose more files again to add another batch.</small>'; }
document.addEventListener('change', event => { const input = event.target.closest('input[name="announcementAttachment"]'); if (!input) return; const selected = Array.from(input.files || []), existing = input._announcementFiles || [], files = [...existing]; selected.forEach(file => { if (!files.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) files.push(file); }); input._announcementFiles = files; const transfer = new DataTransfer(); files.forEach(file => transfer.items.add(file)); input.files = transfer.files; renderAttachmentSelection(input); });
document.addEventListener('change', event => { const input = event.target.closest('input[name="momentMedia"]'), file = input?.files?.[0]; if (!input) return; if (input._previewUrl) URL.revokeObjectURL(input._previewUrl); input._previewUrl = file ? URL.createObjectURL(file) : ''; const area = input.closest('.moment-media-editor')?.querySelector('.moment-media-preview-area'); if (area) area.innerHTML = momentPreviewMarkup(input._previewUrl, file?.name || '', true); });
document.addEventListener('change', event => { const input = event.target.closest('input[name="memberPhoto"], input[name="memberProfilePhoto"]'), file = input?.files?.[0]; if (!input) return; if (input._previewUrl) URL.revokeObjectURL(input._previewUrl); input._previewUrl = file ? URL.createObjectURL(file) : ''; const area = input.closest('.member-photo-editor')?.querySelector('.member-photo-preview-area'), initials = input.closest('form')?.querySelector('[name="name"]')?.value?.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'SW'; if (area) area.innerHTML = memberPhotoPreview(input._previewUrl, file?.name || '', initials, true); });
document.addEventListener('click', event => { const remove = event.target.closest('[data-remove-selected-attachment]'); if (!remove) return; const input = remove.closest('.attachment-selection')?.previousElementSibling; if (!(input instanceof HTMLInputElement)) return; input._announcementFiles.splice(Number(remove.dataset.removeSelectedAttachment), 1); const transfer = new DataTransfer(); input._announcementFiles.forEach(file => transfer.items.add(file)); input.files = transfer.files; renderAttachmentSelection(input); });
document.addEventListener('click', event => { const remove = event.target.closest('[data-remove-existing-attachment]'); if (!remove) return; const form = remove.closest('form'), input = form?.querySelector('input[name="announcementAttachment"]'); if (!(input instanceof HTMLInputElement)) return; input._removedAttachmentUrls ||= new Set(); input._removedAttachmentUrls.add(remove.dataset.removeExistingAttachment); remove.closest('.existing-attachment-item')?.remove(); const list = form.querySelector('[data-existing-attachments]'); if (list && !list.children.length) list.outerHTML = '<p class="attachment-removal-note">All saved attachments will be removed when you save.</p>'; });
document.addEventListener('click', event => { const remove = event.target.closest('[data-remove-policy-document]'); if (!remove) return; const form = remove.closest('form'), input = form?.querySelector('input[name="policyDocument"]'); if (!(input instanceof HTMLInputElement)) return; input._removeCurrentDocument = true; remove.closest('[data-policy-document-status]')?.replaceChildren(document.createTextNode('Current PDF will be removed from the employee page when you save.')); });
document.addEventListener('submit', event => { const form = event.target.closest('[data-editor="sessions"]'); if (!form) return; event.stopImmediatePropagation(); saveKnowledgeSession(event, form); }, true);
document.addEventListener('submit', event => { const form = event.target.closest('[data-editor="moments"]'); if (!form) return; event.stopImmediatePropagation(); saveMoment(event, form); }, true);
document.addEventListener('submit', event => { const form = event.target.closest('[data-editor="newMembers"]'); if (!form) return; event.stopImmediatePropagation(); saveMember(event, form); }, true);
function syncAnnouncementRepeatOptions(form) {
  const mode = form.querySelector('[name="deliveryMode"]:checked')?.value, scheduled = mode === 'scheduled', repeat = form.querySelector('[name="repeatAnnouncement"]')?.checked, options = form.querySelector('[data-announcement-schedule-options]'), repeatOptions = form.querySelector('[data-announcement-repeat-options]'), scheduleDate = form.querySelector('[name="scheduleDate"]'), time = form.querySelector('[name="scheduleTime"]'), frequency = form.querySelector('[name="scheduleFrequency"]'), weekday = form.querySelector('[name="scheduleDayOfWeek"]'), monthday = form.querySelector('[name="scheduleDayOfMonth"]');
  if (options) options.hidden = !scheduled;
  if (repeatOptions) repeatOptions.hidden = !scheduled || !repeat;
  if (time) time.required = scheduled;
  if (scheduleDate) scheduleDate.required = scheduled;
  const weekly = frequency?.value === 'weekly';
  form.querySelector('[data-schedule-weekday]').hidden = !weekly;
  form.querySelector('[data-schedule-monthday]').hidden = frequency?.value !== 'monthly';
  if (!scheduleDate?.value) return;
  const selected = new Date(`${scheduleDate.value}T12:00:00`);
  if (weekly && weekday && weekday.dataset.userSelected !== 'true') weekday.value = String(selected.getDay());
  if (frequency?.value === 'monthly' && monthday) monthday.value = String(selected.getDate());
}
function applyTemplatePublicationSettings(form, template) {
  const publication = template?.templatePublication;
  if (!form || !publication) return syncAnnouncementRepeatOptions(form);
  const scheduled = publication.deliveryMode === 'scheduled';
  const mode = form.querySelector(`[name="deliveryMode"][value="${scheduled ? 'scheduled' : 'now'}"]`);
  if (mode) mode.checked = true;
  const setValue = (name, value) => {
    const field = form.elements.namedItem(name);
    if (field && value !== undefined && value !== null && value !== '') field.value = String(value);
  };
  setValue('scheduleDate', publication.scheduledDate);
  setValue('scheduleTime', publication.time);
  setValue('scheduleFrequency', publication.frequency === 'monthly' ? 'monthly' : 'weekly');
  setValue('scheduleDayOfWeek', publication.dayOfWeek);
  setValue('scheduleDayOfMonth', publication.dayOfMonth);
  const repeat = form.querySelector('[name="repeatAnnouncement"]');
  if (repeat) repeat.checked = scheduled && publication.frequency !== 'once';
  syncAnnouncementRepeatOptions(form);
}
document.addEventListener('click', event => {
  const action = event.target.closest('[data-use-announcement-template], [data-edit-announcement-template]');
  if (!action) return;
  const id = action.dataset.useAnnouncementTemplate || action.dataset.editAnnouncementTemplate;
  const template = dashboard.announcementTemplates?.find(item => item.id === id);
  const form = document.querySelector('[data-editor="announcements"]');
  if (!template || !form) return;
  window.setTimeout(() => applyTemplatePublicationSettings(form, template), 0);
}, true);
document.addEventListener('change', event => { const form = event.target.closest('[data-editor="announcements"]'); if (!form) return; if (event.target.matches('[name="scheduleDayOfWeek"]')) event.target.dataset.userSelected = 'true'; syncAnnouncementRepeatOptions(form); });
document.addEventListener('click', async event => { const action = event.target.closest('[data-toggle-announcement-schedule], [data-remove-announcement-schedule]'); if (!action) return; const id = action.dataset.toggleAnnouncementSchedule || action.dataset.removeAnnouncementSchedule, schedule = dashboard.announcementSchedules?.find(item => item.id === id); if (!schedule) return; if (action.dataset.removeAnnouncementSchedule) { dashboard.announcementSchedules = dashboard.announcementSchedules.filter(item => item.id !== id); await saveDashboard('Announcement schedule removed.'); } else { schedule.enabled = !schedule.enabled; await saveDashboard(`Announcement schedule ${schedule.enabled ? 'resumed' : 'paused'}.`); } });
document.addEventListener('click', async event => { const use = event.target.closest('[data-use-announcement-template]'), remove = event.target.closest('[data-remove-announcement-template]'); if (!use && !remove) return; const id = (use || remove).dataset.useAnnouncementTemplate || (use || remove).dataset.removeAnnouncementTemplate, template = dashboard.announcementTemplates?.find(item => item.id === id); if (!template) return; if (remove) { dashboard.announcementTemplates = dashboard.announcementTemplates.filter(item => item.id !== id); await saveDashboard('Announcement template removed.'); return; } const form = document.querySelector('[data-editor="announcements"]'); if (!form) return; delete form.dataset.editAnnouncementTemplate; ['title','tag','department','audience'].forEach(name => { const input = form.elements.namedItem(name); if (input) input.value = template[name] || ''; }); const editor = form.querySelector('[data-rich-editor]'); if (isLegacyAnnouncementTemplate(template) && editor) { const html = String(template.bodyHtml || ''), missingImages = /\bsrc\s*=\s*["'](?:cid:|image(?:["']|$)|["'])/i.test(html); editor.closest('.rich-editor').outerHTML = `<section class="announcement-email-preview"><div class="announcement-email-preview-head"><div><h4>Email preview</h4><p>This template keeps its original email layout. Select Edit email to change its text.</p></div><button class="tool-button" type="button" data-edit-email>Edit email</button></div><iframe title="Announcement email preview" sandbox="allow-same-origin" data-email-preview srcdoc="${escapeHtml(html)}"></iframe><input type="hidden" name="legacyEmailHtml" data-email-html value="${escapeHtml(html)}" />${missingImages ? '<small>Some email images were not included in the copied email. Upload replacements using Inline photo or video below.</small>' : ''}</section>`; } else if (editor) editor.innerHTML = editableAnnouncementHtml(template); form.querySelector('.announcement-content-disclosure')?.removeAttribute('open'); form._announcementTemplate = template; flash(`Template “${template.title}” loaded. Choose Send now, Schedule, or save an updated template.`); });
document.addEventListener('click', event => { const action = event.target.closest('[data-edit-announcement-template]'); if (!action) return; const template = dashboard.announcementTemplates?.find(item => item.id === action.dataset.editAnnouncementTemplate), form = document.querySelector('[data-editor="announcements"]'); if (!template || !form) return; ['title','tag','department','audience'].forEach(name => { const input = form.elements.namedItem(name); if (input) input.value = template[name] || ''; }); const editor = form.querySelector('[data-rich-editor]'); if (isLegacyAnnouncementTemplate(template) && editor) { const html = String(template.bodyHtml || ''); editor.closest('.rich-editor').outerHTML = `<section class="announcement-email-preview"><div class="announcement-email-preview-head"><div><h4>Email template</h4><p>Edit the original email layout, then select Save changes to update this template.</p></div><button class="tool-button" type="button" data-edit-email>Edit email</button></div><iframe title="Editable announcement email template" sandbox="allow-same-origin" data-email-preview srcdoc="${escapeHtml(html)}"></iframe><input type="hidden" name="legacyEmailHtml" data-email-html value="${escapeHtml(html)}" /></section>`; } else if (editor) editor.innerHTML = editableAnnouncementHtml(template); form.querySelector('.announcement-content-disclosure')?.removeAttribute('open'); form._announcementTemplate = template; form.dataset.editAnnouncementTemplate = template.id; form.querySelector('.form-actions .action-button.primary')?.replaceChildren(document.createTextNode('Update template')); flash(`Editing template “${template.title}”. Save changes updates this template only.`); });
document.addEventListener('click', event => { const button = event.target.closest('[data-save-announcement-template]'); if (!button) return; const form = button.closest('form'); if (!form) return; form.dataset.saveAsTemplate = 'true'; form.noValidate = true; form.requestSubmit(); });
document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-editor]');
  if (form) {
    event.preventDefault();
    const key = form.dataset.editor, id = editingRecord[key], record = id && dashboard[key].find(item => item.id === id), formData = new FormData(form), values = Object.fromEntries(formData), iconImage = formData.get('iconImage'), memberProfilePhoto = formData.get('memberProfilePhoto'), policyDocument = formData.get('policyDocument'), checklistAttachment = formData.get('checklistAttachment'), announcementMedia = formData.get('announcementMedia'), announcementAttachments = formData.getAll('announcementAttachment').filter(file => file?.name), attachmentInput = form.querySelector('input[name="announcementAttachment"]'), policyDocumentInput = form.querySelector('input[name="policyDocument"]'), richEditor = form.querySelector('[data-rich-editor]');
    const editedTemplateId = form.dataset.editAnnouncementTemplate || '', deliveryMode = form.dataset.saveAsTemplate === 'true' || editedTemplateId ? 'template' : values.deliveryMode, schedule = { frequency:values.repeatAnnouncement === 'true' ? values.scheduleFrequency : 'once', scheduledDate:values.scheduleDate, time:values.scheduleTime, dayOfWeek:Number(values.scheduleDayOfWeek), dayOfMonth:Number(values.scheduleDayOfMonth) };
    delete form.dataset.saveAsTemplate;
    delete form.dataset.editAnnouncementTemplate;
    form.noValidate = false;
    delete values.iconImage; delete values.memberProfilePhoto; delete values.policyDocument; delete values.checklistAttachment; delete values.announcementMedia; delete values.announcementAttachment; delete values.deliveryMode; delete values.repeatAnnouncement; delete values.scheduleDate; delete values.scheduleFrequency; delete values.scheduleTime; delete values.scheduleDayOfWeek; delete values.scheduleDayOfMonth;
    const capturedEmailHtml = String(values.legacyEmailHtml || form.dataset.emailClipboardHtml || ''); delete values.legacyEmailHtml; delete form.dataset.emailClipboardHtml;
    if (key === 'firstWeekChecklist' && values.requiresResourceLinkClick === 'true' && !String(values.resourceUrl || '').trim()) { flash('Add a resource link before requiring employees to open it.'); return; }
    if (key === 'announcements' && capturedEmailHtml) { values.bodyHtml = capturedEmailHtml; values.body = new DOMParser().parseFromString(capturedEmailHtml, 'text/html').body.innerText.trim(); }
    else if (richEditor) {
      const sourceHtml = richEditor.innerHTML;
      if (key === 'announcements' && isLegacyAnnouncementTemplate({ bodyHtml:sourceHtml })) { values.bodyHtml = sourceHtml; values.body = new DOMParser().parseFromString(sourceHtml, 'text/html').body.innerText.trim(); }
      else { const cleanHtml = editableAnnouncementHtml({ bodyHtml:sourceHtml }), templateIsUnchanged = cleanHtml === editableAnnouncementHtml(record || {}); if (!templateIsUnchanged) values.bodyHtml = cleanHtml; values.body = new DOMParser().parseFromString(cleanHtml, 'text/html').body.innerText.trim(); }
    }
    else if (key === 'announcements' && isLegacyAnnouncementTemplate(record || {})) {
      values.bodyHtml = record.bodyHtml;
      values.body = new DOMParser().parseFromString(values.bodyHtml, 'text/html').body.innerText.trim() || record.body || '';
    }
    try {
      const iconUrl = ['apps','supportPortals'].includes(key) ? await uploadAppIcon(iconImage) : '';
      const memberProfilePhotoUrl = key === 'newMembers' ? await uploadEmployeeProfilePhoto(memberProfilePhoto) : '';
      const policyDocumentUrl = key === 'policies' ? await uploadAnnouncementFile(policyDocument, ['application/pdf'], 'policy document') : '';
      const checklistAttachmentUrl = key === 'firstWeekChecklist' && checklistAttachment?.name ? await uploadAnnouncementFile(checklistAttachment, knowledgeMaterialTypes, 'checklist attachment') : '';
      const mediaUrl = key === 'announcements' ? await uploadAnnouncementFile(announcementMedia, announcementMediaTypes, 'photo or video') : '';
      const uploadedAttachments = key === 'announcements' ? await Promise.all(announcementAttachments.map(async file => ({ url:await uploadAnnouncementFile(file, announcementAttachmentTypes, 'attachment'), filename:file.name }))) : [];
      const iconData = iconUrl ? { iconUrl, iconFilename:iconImage.name } : {};
      const memberProfilePhotoData = memberProfilePhotoUrl ? { profilePhotoUrl:memberProfilePhotoUrl, profilePhotoFilename:memberProfilePhoto.name } : {};
      const templateSource = key === 'announcements' ? form._announcementTemplate : null;
      const existingAttachments = record?.attachments || templateSource?.attachments || (record?.attachmentUrl ? [{ url:record.attachmentUrl, filename:record.attachmentFilename || savedFilename({ iconUrl:record.attachmentUrl }) }] : []);
      const removedAttachmentUrls = attachmentInput?._removedAttachmentUrls || new Set();
      const remainingAttachments = existingAttachments.filter(file => !removedAttachmentUrls.has(file.url));
      const attachmentsChanged = key === 'announcements' && (uploadedAttachments.length || removedAttachmentUrls.size);
      const announcementData = {
        ...(templateSource?.mediaUrl ? { mediaUrl:templateSource.mediaUrl, mediaFilename:templateSource.mediaFilename || '' } : {}),
        ...(templateSource?.attachments?.length ? { attachments:templateSource.attachments, attachmentUrl:'', attachmentFilename:'' } : {}),
        ...(mediaUrl ? { mediaUrl, mediaFilename:announcementMedia.name } : {}),
        ...(attachmentsChanged ? { attachments:[...remainingAttachments, ...uploadedAttachments], attachmentUrl:'', attachmentFilename:'' } : {})
      };
      if (key === 'announcements' && deliveryMode === 'now' && !record) { const publishedAt = new Date(); values.date = announcementTimestamp(publishedAt); values.publishedAt = publishedAt.toISOString(); }
      const policyUrl = key === 'policies' ? normalisePolicyUrl(values.canonicalUrl) : '';
      const policyData = key === 'policies' ? (policyDocumentUrl ? { canonicalUrl:policyDocumentUrl } : policyDocumentInput?._removeCurrentDocument ? { canonicalUrl:'' } : { canonicalUrl:policyUrl }) : {};
      const checklistData = checklistAttachmentUrl ? { attachmentUrl:checklistAttachmentUrl } : {};
      if (key === 'announcements' && deliveryMode === 'scheduled') { dashboard.announcementSchedules ||= []; dashboard.announcementSchedules.push({ id:`announcement-schedule-${Date.now()}`, ...values, ...schedule, ...announcementData, enabled:true }); }
      else if (key === 'announcements' && deliveryMode === 'template') { dashboard.announcementTemplates ||= []; const template = editedTemplateId && dashboard.announcementTemplates.find(item => item.id === editedTemplateId), templatePublication = { deliveryMode:values.deliveryMode === 'scheduled' ? 'scheduled' : 'now', ...schedule }; if (template) Object.assign(template, values, announcementData, { templatePublication }); else dashboard.announcementTemplates.push({ id:`announcement-template-${Date.now()}`, ...values, ...announcementData, templatePublication }); }
      else if (record) Object.assign(record, values, iconData, memberProfilePhotoData, announcementData, policyData, checklistData); else { const created = createRecord(key, form); Object.assign(created, values, iconData, memberProfilePhotoData, announcementData, policyData, checklistData); dashboard[key].push(created); }
      editingRecord[key] = '';
      await saveDashboard(deliveryMode === 'scheduled' ? 'Announcement scheduled. It will publish automatically in Cairo time.' : deliveryMode === 'template' ? editedTemplateId ? 'Announcement template updated.' : 'Announcement template saved. Use it any time from this list.' : memberProfilePhotoUrl ? 'Original employee photo uploaded and published.' : iconUrl ? `${key === 'supportPortals' ? 'Portal' : 'App'} icon uploaded and changes published.` : policyDocumentUrl ? 'Policy PDF uploaded and published.' : policyDocumentInput?._removeCurrentDocument ? 'Policy PDF removed from the employee page.' : key === 'policies' && policyUrl ? 'Policy link saved and published.' : mediaUrl || uploadedAttachments.length || removedAttachmentUrls.size ? 'Announcement attachments updated and published.' : 'Changes saved and published to the intranet.');
    } catch (error) { flash(error.message); }
    return;
  }
  if (event.target.id === 'ack-content-form') {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target)), copyForm = $('#newsi-page-copy-form'), pageCopy = copyForm ? Object.fromEntries([...new FormData(copyForm)].filter(([, value]) => String(value).trim())) : {};
    if ([...(copyForm?.elements || [])].some(input => input.dataset.previewTouched === 'true' && !input.value.trim())) { flash('Page text cannot be empty. Restore or edit the highlighted text before saving.'); return; }
    if (Object.entries(pageCopy).some(([, value]) => String(value).length > 600)) { flash('Keep each highlighted page text field under 600 characters.'); return; }
    dashboard.newSiPageContent = { ...dashboard.newSiPageContent, ...pageCopy };
    const acknowledgement = dashboard.policyAcknowledgementContent || {};
    const acknowledgementChanged = Object.entries(values).some(([name, value]) => String(acknowledgement[name] || '') !== String(value));
    if (acknowledgementChanged) dashboard.policyAcknowledgementContent = { ...acknowledgement, ...values, version:(Number(acknowledgement.version) || 1) + 1 };
    saveDashboard('New Si-Warians page content saved and published.');
  }
});
async function renderMedia() { const root = $('#view-media'); root.innerHTML = '<p class="view-intro">Loading reusable media inventory…</p>'; try { const files = await api('/api/admin/media'); root.innerHTML = `<p class="view-intro">Reusable uploads are checked for current usage before any removal. Direct destructive removal is intentionally unavailable here.</p><div class="media-grid">${files.map(file => `<article class="media-file"><b title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</b><small>${Math.ceil(file.size / 1024)} KB · ${cairo(file.modifiedAt)}</small><a class="tool-link" href="${encodeURI(file.url)}" target="_blank" rel="noopener">Open file ↗</a><span class="record-tag">${file.inUse ? 'In use' : 'Not referenced'}</span></article>`).join('') || '<p class="empty">No uploaded media yet.</p>'}</div>`; } catch (error) { root.innerHTML = `<p class="notice warning">${escapeHtml(error.message)}</p>`; } }
let accessDirectory = null;
const roleLabel = role => String(role || '').split('_').map(part => part[0] + part.slice(1).toLowerCase()).join(' ');
const permissionLabel = permission => ({ 'admin.access':'Admin Panel access', 'events.details.all':'View all calendar event details', 'content.edit':'Edit content', 'content.publish':'Publish announcements', 'media.manage':'Manage media', 'access.manage':'Manage users', 'audit.view':'View audit trail', 'audit.export':'Export audit trail', 'settings.manage':'Manage settings', 'action.export_csv':'Export CSV' }[permission] || intranetPages.find(page => page.permission === permission)?.label || (pagePermissionNames[permission] ? `Admin · ${pagePermissionNames[permission]}` : permission));
const initialsForUser = user => String(user.name || user.email || 'U').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const pagePermissionOptions = Object.values(adminViewPermissions);
const globalActionPermissions = adminActionPermissions;
async function loadAccessDirectory() { accessDirectory = await api('/api/admin/access'); }
function usersRoleOptions(roles) { return roles.map(role => `<option value="${escapeHtml(role.id)}">${escapeHtml(roleLabel(role.id))}</option>`).join(''); }
function renderAccessUsers() { mountUsersPage($('#view-access'), accessDirectory, { onSave:saveAccess, onImport:importAccessCsv, onTemplate:downloadUsersTemplate }); }
function downloadUsersTemplate() { const url = URL.createObjectURL(new Blob(['Name,Work Email,Role\nExample User,example@si-ware.com,EMPLOYEE\n'], { type:'text/csv' })), link = document.createElement('a'); link.href = url; link.download = 'siware-users-import-template.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
async function importAccessCsv(file) { if (!file) return; if (!hasAdminPermission('action.import')) return flash('Import permission is required.'); if (!/\.csv$/i.test(file.name) || file.size > 1024 * 1024) return flash('Choose a CSV file of 1 MB or smaller.'); try { const rows = (await file.text()).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map(row => row.split(',').map(value => value.trim())), [header, ...records] = rows, fields = header.map(value => value.toLowerCase().replace(/[^a-z]/g, '')), nameAt = fields.indexOf('name'), emailAt = fields.findIndex(value => ['workemail','email'].includes(value)), roleAt = fields.indexOf('role'); if (nameAt < 0 || emailAt < 0 || roleAt < 0) throw new Error('CSV needs Name, Work Email, and Role columns.'); for (const row of records) await api('/api/admin/access', { method:'PATCH', body:JSON.stringify({ name:row[nameAt], email:row[emailAt], role:row[roleAt], operation:'import' }) }); flash(`${records.length} user${records.length === 1 ? '' : 's'} imported.`); await loadAccessDirectory(); renderAccessUsers(); } catch (error) { flash(error.message || 'The CSV could not be imported.'); } }
async function saveAccess(event) { event.preventDefault(); const form = event.currentTarget, submit = form.querySelector('[type="submit"]'), errorField = form.querySelector('[data-user-form-error]'); errorField.textContent = ''; if (!form.reportValidity()) return; const values = Object.fromEntries(new FormData(form)); values.active = form.elements.active.checked; if (values.authType === 'local' || form.elements.authType.value === 'local') { if (values.password !== values.passwordConfirm) { errorField.textContent = 'The passwords do not match.'; return; } } else { delete values.password; delete values.passwordConfirm; } submit.disabled = true; try { await api('/api/admin/access', { method:'PATCH', body:JSON.stringify(values) }); $('#access-user-dialog')?.close(); flash('User saved. Access changes take effect at the next sign-in.'); await loadAccessDirectory(); renderAccessUsers(); if (activeAdminView() === 'roles') renderRolesCards(); } catch (error) { errorField.textContent = error.message || 'The user could not be saved.'; flash(errorField.textContent); } finally { submit.disabled = false; } }
async function renderAccess() { const root = $('#view-access'); root.innerHTML = '<p class="view-intro">Loading users…</p>'; try { await loadAccessDirectory(); renderAccessUsers(); } catch (error) { root.innerHTML = `<p class="notice warning">${escapeHtml(error.message)}</p>`; } }
async function renderRoles() { const root = $('#view-roles'); root.innerHTML = '<p class="view-intro">Loading roles…</p>'; try { if (!accessDirectory) await loadAccessDirectory(); const roles = accessDirectory.roles || [], users = accessDirectory.users || [], permissions = [...new Set(roles.flatMap(role => role.permissions))]; root.innerHTML = `<div class="access-page-heading"><div><h1>Roles</h1><p>Review the permissions that each intranet role grants.</p></div></div><div class="roles-summary"><article><b>${roles.length}</b><span>Configured roles</span></article><article><b>${permissions.length}</b><span>Permission types</span></article><article><b>${users.length}</b><span>Assigned users</span></article></div><article class="roles-workspace"><div class="roles-workspace-head"><h2>Role permissions</h2><p>Roles are fixed safeguards in this local prototype. Assign them from the Users page.</p></div><div class="roles-table-wrap"><table class="roles-table"><thead><tr><th>Permission</th>${roles.map(role => `<th>${escapeHtml(roleLabel(role.id))}<small>${users.filter(user => user.role === role.id).length} users</small></th>`).join('')}</tr></thead><tbody>${permissions.map(permission => `<tr><th>${escapeHtml(permissionLabel(permission))}<small>${escapeHtml(permission)}</small></th>${roles.map(role => `<td>${role.permissions.includes(permission) ? '<span class="permission-granted" aria-label="Granted">✓</span>' : '<span class="permission-none" aria-label="Not granted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></article>`; } catch (error) { root.innerHTML = `<p class="notice warning">${escapeHtml(error.message)}</p>`; } }
function renderActivity() { return renderAuditTrail($('#view-activity'), hasAdminPermission('audit.export')); }
function renderSettings() { $('#view-settings').innerHTML = `<p class="view-intro">Manage Google content sources and review the environment safeguards for this intranet.</p><div id="google-sync-settings"></div><div class="section-grid"><article class="panel"><h2>Audit archive</h2><p>Audit and browser activity older than 90 days are archived automatically at the next daily run, then removed from the active trail.</p><p class="notice">Archive files are saved on the Docker host under <code>data/audit trail archive/</code>. They are not included in Audit Trail search or CSV export and are not deleted automatically. Include this folder in your backups.</p></article><article class="panel"><h2>Environment security</h2><p>Google Workspace SSO and administrator-created local accounts are supported. Local account passwords are stored as salted hashes. Configure <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>APP_ORIGIN</code>, <code>GOOGLE_WORKSPACE_DOMAIN</code>, <code>GOOGLE_ADMIN_EMAILS</code>, and <code>SECURE_COOKIES=true</code> outside this UI.</p><p class="notice warning">This local prototype uses JSON storage and memory-backed sessions. Use a transactional database and shared session store before production deployment.</p></article></div>`; renderGoogleSyncSettings($('#google-sync-settings'), api); }
function renderAdminView(name) {
  if (name === 'overview') return renderOverview();
  if (name === 'content') return renderContent();
  if (contentPages.some(page => page.view === name)) return renderContentPage(name);
  if (name === 'appearance') return renderAppearance();
  if (name === 'home') return renderHomeEditor();
  if (name === 'global') return renderGlobalPages();
  if (name === 'media') return renderMedia();
  if (name === 'access') return renderAccess();
  if (name === 'roles') return renderRolesCards();
  if (name === 'activity') return renderActivity();
  if (name === 'compliance') return renderComplianceAcknowledgements();
  if (name === 'settings') return renderSettings();
}
function renderAllowedAdminViews() {
  const activeView = activeAdminView();
  if (canAccessAdminView(activeView)) renderAdminView(activeView);
}
async function refreshAdminPermissions() {
  const me = await api('/api/auth/me');
  grantedPermissions = new Set(me.permissions || []);
  if (!canOpenAdmin(grantedPermissions)) { location.replace(firstAvailableIntranetPage(grantedPermissions)?.path || '/profile.html'); return; }
  updateIntranetExitLinks();
  dashboard = await api('/api/admin/dashboard');
  savedDashboard = structuredClone(dashboard);
  summary = await api('/api/admin/summary');
  canEditContent = hasAdminPermission('content.edit');
  $$('.admin-sidebar button[data-view]').forEach(button => { button.hidden = !canAccessAdminView(button.dataset.view); });
  document.body.dataset.canDelete = String(hasAdminPermission('action.delete'));
  document.body.dataset.canImport = String(hasAdminPermission('action.import'));
  renderAllowedAdminViews();
  if (!canAccessAdminView(activeAdminView())) {
    const first = Object.keys(adminViewPermissions).find(canAccessAdminView);
    if (first) showView(first);
  }
  updatePageTools();
}
function showView(name) {
  if (!canAccessAdminView(name)) { flash('You do not have access to this Administration page.'); return; }
  $$('.admin-sidebar button[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  $$('.admin-view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  const titles = { home:'Home', global:'Global pages content', apps:'Apps', access:'Users', roles:'Roles', activity:'Audit Trail', compliance:'Compliance acknowledgements', newsi:'New Si-Warians', announcements:'Announcements', social:'Social Media', whistleblower:'Whistleblower', moments:'Moments' };
  $('#page-title').textContent = titles[name] || name[0].toUpperCase() + name.slice(1);
  window.dispatchEvent(new CustomEvent('siware:page-view', { detail:{ title:`Administration · ${$('#page-title').textContent}` } }));
  renderAdminView(name);
  updatePageTools();
}
function updateIntranetExitLinks() {
  const destination = firstAvailableIntranetPage(grantedPermissions)?.path || '/profile.html';
  document.querySelectorAll('.admin-global-brand, .sidebar-footer a').forEach(link => { link.href = destination; });
}
async function start() {
  try {
    const me = await api('/api/auth/me');
    grantedPermissions = new Set(me.permissions || []);
    if (!canOpenAdmin(me.permissions)) { location.replace(firstAvailableIntranetPage(me.permissions)?.path || '/profile.html'); return; }
    updateIntranetExitLinks();
    dashboard = await api('/api/admin/dashboard');
    savedDashboard = structuredClone(dashboard);
    canEditContent = hasAdminPermission('content.edit');
    summary = await api('/api/admin/summary');
    $('#admin-user').textContent = me.name;
    $('#admin-role').textContent = me.role.replace('_', ' ');
    const avatar = $('#admin-avatar');
    avatar.textContent = me.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AD';
    avatar.classList.toggle('has-photo', Boolean(me.avatarUrl));
    avatar.style.backgroundImage = me.avatarUrl ? `url(${JSON.stringify(me.avatarUrl)})` : '';
    $('#admin-account-toggle').setAttribute('aria-label', `${me.name}, ${me.role.replace('_', ' ')}. Account menu`);
    $$('.admin-sidebar button[data-view]').forEach(button => { button.hidden = !canAccessAdminView(button.dataset.view); });
    document.body.dataset.canDelete = String(hasAdminPermission('action.delete'));
    document.body.dataset.canImport = String(hasAdminPermission('action.import'));
    renderAllowedAdminViews();
    setupPageTools(); updatePageTools();
    $$('.admin-sidebar button[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
    document.addEventListener('click', event => { const target = event.target.closest('[data-goto]'); if (target) showView(target.dataset.goto); });
    const requestedView = new URLSearchParams(location.search).get('view');
    const initialView = canAccessAdminView(requestedView) ? requestedView : Object.keys(adminViewPermissions).find(view => canAccessAdminView(view));
    if (initialView) showView(initialView);
    document.body.classList.remove('admin-loading');
    document.body.removeAttribute('aria-busy');
    const signOut = async () => { await api('/auth/logout', { method:'POST' }); location.assign('/login.html'); };
    $('#sign-out').addEventListener('click', signOut);
    $('#mobile-sign-out').addEventListener('click', signOut);
    $('#header-sign-out').addEventListener('click', signOut);
  } catch (error) {
    if (error.message === 'Sign in is required to continue.') {
      location.replace('/login.html?returnTo=/admin.html');
      return;
    }
    console.error('Administration failed to load:', error);
    document.body.innerHTML = '<main style="max-width:560px;margin:12vh auto;padding:24px;font-family:Manrope,Arial,sans-serif"><h1>Administration unavailable</h1><p>The administration area could not load. Please try again.</p><button type="button" onclick="location.reload()">Try again</button></main>';
  }
}
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
function setupSidebarToggle() { const shell = document.querySelector('.admin-shell'); const toggle = $('#sidebar-toggle'); if (!shell || !toggle) return; const shortLabels = { overview:'OV', home:'HM', content:'CT', apps:'AP', announcements:'AN', social:'SM', moments:'MO', knowledge:'KH', events:'EV', whistleblower:'WB', people:'RJ', newsi:'NS', appearance:'AR', media:'MD', access:'UA', activity:'AA', compliance:'CA', settings:'ST' }; $$('.admin-sidebar button[data-view]').forEach(button => { const label = button.textContent.trim(); button.setAttribute('aria-label', label); button.dataset.shortLabel = shortLabels[button.dataset.view] || label.slice(0, 2).toUpperCase(); }); const setCollapsed = collapsed => { shell.classList.toggle('sidebar-collapsed', collapsed); toggle.setAttribute('aria-expanded', String(!shell.classList.contains('sidebar-collapsed'))); toggle.title = collapsed ? 'Expand navigation' : 'Collapse navigation'; toggle.querySelector('span').textContent = collapsed ? 'Expand' : 'Collapse'; try { localStorage.setItem('siware-admin-sidebar-collapsed', String(collapsed)); } catch (_) {} }; let collapsed = false; try { collapsed = localStorage.getItem('siware-admin-sidebar-collapsed') === 'true'; } catch (_) {} setCollapsed(collapsed); toggle.addEventListener('click', () => setCollapsed(!shell.classList.contains('sidebar-collapsed'))); }
function setupSidebarIcons() {
  const iconShapes = {
    overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    home:'<path d="m3 11 9-8 9 8v10H3V11Z"/><path d="M9 21v-6h6v6"/>',
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
    roles:'<path d="M12 3 4 7v5c0 4.5 3.1 7.9 8 9 4.9-1.1 8-4.5 8-9V7l-8-4Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
    activity:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    compliance:'<path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6l-7-3Z"/><path d="m8.5 12 2.3 2.3 4.8-5"/>',
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

function roleEditorMarkup(permissions) { return permissions.map(permission => `<label class="role-permission-option"><input type="checkbox" name="permissions" value="${escapeHtml(permission)}" /><span><b>${escapeHtml(permissionLabel(permission))}</b><small>${escapeHtml(permission)}</small></span></label>`).join(''); }
async function renderRolesEditable() { const root = $('#view-roles'); root.innerHTML = '<p class="view-intro">Loading roles…</p>'; try { await loadAccessDirectory(); const roles = accessDirectory.roles || [], users = accessDirectory.users || [], permissions = [...new Set(roles.flatMap(role => role.permissions))]; root.innerHTML = `<div class="access-page-heading"><div><h1>Roles</h1><p>Create roles and choose the exact permissions each role grants.</p></div><div class="access-actions"><button class="action-button primary" type="button" data-add-role>Add role</button></div></div><div class="roles-summary"><article><b>${roles.length}</b><span>Configured roles</span></article><article><b>${permissions.length}</b><span>Permission types</span></article><article><b>${users.length}</b><span>Assigned users</span></article></div><article class="roles-workspace"><div class="roles-workspace-head"><h2>Role permissions</h2><p>Select a role to change its permissions. Administrator always retains user-management access.</p></div><div class="roles-table-wrap"><table class="roles-table"><thead><tr><th>Permission</th>${roles.map(role => `<th>${escapeHtml(roleLabel(role.id))}<small>${users.filter(user => user.role === role.id).length} users</small><button type="button" class="role-edit-button" data-edit-role="${escapeHtml(role.id)}">Edit</button></th>`).join('')}</tr></thead><tbody>${permissions.map(permission => `<tr><th>${escapeHtml(permissionLabel(permission))}<small>${escapeHtml(permission)}</small></th>${roles.map(role => `<td>${role.permissions.includes(permission) ? '<span class="permission-granted" aria-label="Granted">✓</span>' : '<span class="permission-none" aria-label="Not granted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></article><dialog class="access-user-dialog role-editor-dialog" id="role-editor-dialog"><form id="role-editor-form"><div class="dialog-heading"><div><h2>Add role</h2><p>Give the role a clear name, then select its permissions.</p></div><button type="button" class="dialog-close" data-close-role-dialog aria-label="Close">×</button></div><input type="hidden" name="mode" value="create" /><input type="hidden" name="id" /><label class="role-name-field">Role name<input name="name" required maxlength="41" placeholder="e.g. Department editor" /><small>Use a role name people will recognize. It is saved as an internal uppercase ID.</small></label><fieldset class="role-permission-list"><legend>Permissions</legend>${roleEditorMarkup(permissions)}</fieldset><p class="role-editor-error" role="alert"></p><div class="form-actions"><button class="action-button" type="button" data-close-role-dialog>Cancel</button><button class="action-button primary">Save role</button></div></form></dialog>`; const dialog = $('#role-editor-dialog'), form = $('#role-editor-form'), open = role => { form.reset(); form.elements.mode.value = role ? 'edit' : 'create'; form.elements.id.value = role?.id || ''; form.elements.name.value = role ? roleLabel(role.id) : ''; form.elements.name.readOnly = Boolean(role); form.querySelector('h2').textContent = role ? `Edit ${roleLabel(role.id)}` : 'Add role'; form.querySelector('.role-editor-error').textContent = ''; form.querySelectorAll('[name="permissions"]').forEach(input => { input.checked = role?.permissions.includes(input.value) || false; input.disabled = role?.id === 'ADMIN' && input.value === 'access.manage'; }); dialog.showModal(); }; root.querySelector('[data-add-role]').addEventListener('click', () => open(null)); root.querySelectorAll('[data-edit-role]').forEach(button => button.addEventListener('click', () => open(roles.find(role => role.id === button.dataset.editRole)))); root.querySelectorAll('[data-close-role-dialog]').forEach(button => button.addEventListener('click', () => dialog.close())); form.addEventListener('submit', saveRole); } catch (error) { root.innerHTML = `<p class="notice warning">${escapeHtml(error.message)}</p>`; } }
async function saveRole(event) { event.preventDefault(); const form = event.currentTarget, mode = form.elements.mode.value, id = form.elements.id.value || form.elements.name.value, permissions = [...form.querySelectorAll('[name="permissions"]:checked')].map(input => input.value), error = form.querySelector('.role-editor-error'); if (!permissions.length) { error.textContent = 'Choose at least one permission for this role.'; return; } try { await api('/api/admin/roles', { method:mode === 'create' ? 'POST' : 'PATCH', body:JSON.stringify({ id, permissions }) }); $('#role-editor-dialog').close(); flash(mode === 'create' ? 'Role created.' : 'Role permissions updated.'); renderRolesCards(); } catch (reason) { error.textContent = reason.message || 'This role could not be saved.'; } }


document.addEventListener('click', event => { const edit = event.target.closest('[data-edit-role]'); if (!edit) return; window.setTimeout(() => { const form = $('#role-editor-form'), roleId = form?.elements.id?.value; if (!form || !roleId || ['EMPLOYEE','CONTENT_EDITOR','AUDIT_VIEWER','ADMIN'].includes(roleId) || form.querySelector('[data-delete-role]')) return; form.querySelector('.form-actions')?.insertAdjacentHTML('afterbegin', '<button class="action-button danger" type="button" data-delete-role>Remove role</button>'); }, 0); });
document.addEventListener('click', async event => { const button = event.target.closest('[data-delete-role]'); if (!button) return; const form = $('#role-editor-form'), roleId = form?.elements.id?.value; if (!roleId || !confirm(`Remove ${roleLabel(roleId)}? This cannot be undone.`)) return; try { button.disabled = true; await api(`/api/admin/roles/${encodeURIComponent(roleId)}`, { method:'DELETE' }); $('#role-editor-dialog').close(); flash('Role removed.'); renderRolesEditable(); } catch (error) { form.querySelector('.role-editor-error').textContent = error.message || 'This role could not be removed.'; button.disabled = false; } });
async function renderRolesCards() { const root = $('#view-roles'); root.innerHTML = '<p class="view-intro">Loading roles…</p>'; try { await loadAccessDirectory(); const roles = accessDirectory.roles || [], users = accessDirectory.users || []; root.innerHTML = `<div class="access-page-heading"><div><h1>Roles</h1><p>Define roles and manage access permissions for Si-Ware Systems.</p></div><div class="access-actions"><button class="action-button primary" type="button" data-add-role>Add role</button></div></div><div class="role-cards">${roles.map(role => `<article class="role-card"><div class="role-card-head"><span class="role-card-mark"><svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.4 2.8 8.3 7 10 4.2-1.7 7-5.6 7-10V6l-7-3Z"/></svg></span><div class="role-card-title"><h2>${escapeHtml(roleLabel(role.id))}</h2><p>${users.filter(user => user.role === role.id).length} assigned users · ${role.permissions.length} permissions</p></div><div class="role-card-actions"><button class="role-card-action" type="button" data-card-edit-role="${escapeHtml(role.id)}" aria-label="Edit ${escapeHtml(roleLabel(role.id))}"><svg viewBox="0 0 24 24"><path d="m4 20 4.2-1 10-10a2.2 2.2 0 0 0-3.1-3.1l-10 10L4 20Z"/><path d="m13.5 7.5 3 3"/></svg></button>${role.id === 'ADMIN' ? '' : `<button class="role-card-action danger" type="button" data-card-delete-role="${escapeHtml(role.id)}" aria-label="Remove ${escapeHtml(roleLabel(role.id))}"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M9 7l1-3h4l1 3M6 7l1 14h10l1-14"/></svg></button>`}</div></div><div class="role-card-permissions">${role.permissions.map(permission => `<span>${escapeHtml(permissionLabel(permission))}</span>`).join('')}</div>${role.id === 'ADMIN' ? '<p class="role-card-note">Administrator is protected from removal.</p>' : ''}</article>`).join('')}</div>`; root.querySelector('[data-add-role]').addEventListener('click', () => { renderRolesEditable(); setTimeout(() => $('#role-editor-dialog')?.showModal(), 0); }); root.addEventListener('click', async event => { const edit = event.target.closest('[data-card-edit-role]'); if (edit) { const id = edit.dataset.cardEditRole; renderRolesEditable(); setTimeout(() => document.querySelector(`[data-edit-role="${id}"]`)?.click(), 0); return; } const remove = event.target.closest('[data-card-delete-role]'); if (!remove || !confirm(`Remove ${roleLabel(remove.dataset.cardDeleteRole)}? This cannot be undone.`)) return; try { await api(`/api/admin/roles/${encodeURIComponent(remove.dataset.cardDeleteRole)}`, { method:'DELETE' }); flash('Role removed.'); renderRolesCards(); } catch (error) { flash(error.message || 'This role could not be removed.'); } }); } catch (error) { root.innerHTML = `<p class="notice warning">${escapeHtml(error.message)}</p>`; } }
function openCardRoleEditor(id) { const role = accessDirectory?.roles?.find(item => item.id === id); if (!role) return; let dialog = $('#role-card-editor-dialog'); if (!dialog) { dialog = document.createElement('dialog'); dialog.id = 'role-card-editor-dialog'; dialog.className = 'access-user-dialog role-editor-dialog'; document.body.append(dialog); } const permissions = [...new Set(accessDirectory.roles.flatMap(item => item.permissions))]; dialog.innerHTML = `<form id="role-card-editor-form"><div class="dialog-heading"><div><h2>Edit ${escapeHtml(roleLabel(role.id))}</h2><p>Choose the permissions this role can use.</p></div><button type="button" class="dialog-close" data-card-editor-close aria-label="Close">×</button></div><fieldset class="role-permission-list"><legend>Permissions</legend>${permissions.map(permission => `<label class="role-permission-option"><input type="checkbox" name="permissions" value="${escapeHtml(permission)}" ${role.permissions.includes(permission) ? 'checked' : ''} ${role.id === 'ADMIN' && permission === 'access.manage' ? 'disabled' : ''}/><span><b>${escapeHtml(permissionLabel(permission))}</b><small>${escapeHtml(permission)}</small></span></label>`).join('')}</fieldset><p class="role-editor-error" role="alert"></p><div class="form-actions"><button class="action-button" type="button" data-card-editor-close>Cancel</button><button class="action-button primary">Save role</button></div></form>`; dialog.querySelectorAll('[data-card-editor-close]').forEach(button => button.addEventListener('click', () => dialog.close())); dialog.querySelector('form').addEventListener('submit', async event => { event.preventDefault(); const selected = [...dialog.querySelectorAll('[name="permissions"]:checked')].map(input => input.value), error = dialog.querySelector('.role-editor-error'); if (!selected.length) { error.textContent = 'Choose at least one permission.'; return; } try { await api('/api/admin/roles', { method:'PATCH', body:JSON.stringify({ id:role.id, permissions:selected }) }); dialog.close(); flash('Role permissions updated.'); renderRolesCards(); } catch (reason) { error.textContent = reason.message || 'This role could not be saved.'; } }); dialog.showModal(); }
const pagePermissionNames = { 'page.overview':'Overview', 'page.home':'Home', 'page.content':'Content', 'page.apps':'Main Apps', 'page.announcements':'Announcements', 'page.social':'Social Media', 'page.moments':'Moments', 'page.knowledge':'Knowledge Hub', 'page.events':'Events & key dates', 'page.whistleblower':'Whistleblower', 'page.people':'Our Team', 'page.newsi':'New Si-Warians', 'page.appearance':'Appearance', 'page.media':'Media', 'page.users':'Users', 'page.roles':'Roles', 'page.activity':'Activity & audit', 'page.compliance':'Compliance acknowledgements', 'page.settings':'Settings' };
function openGroupedRoleEditor(id) {
  const role = id ? accessDirectory?.roles?.find(item => item.id === id) : null;
  if (id && !role) return;
  let dialog = $('#role-card-editor-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'role-card-editor-dialog';
    dialog.className = 'access-user-dialog role-editor-dialog';
    document.body.append(dialog);
  }
  const selected = new Set(role?.permissions || ['intranet.home']);
  const capabilities = ['content.edit','content.publish','media.manage','audit.view','access.manage','audit.export','settings.manage'];
  const known = new Set(['admin.access', ...intranetPagePermissions, ...capabilities, ...pagePermissionOptions, ...globalActionPermissions]);
  const other = (role?.permissions || []).filter(permission => !known.has(permission));
  const intranetNames = Object.fromEntries(intranetPages.map(page => [page.permission, page.label]));
  const actionNames = { 'action.undo':'Undo changes', 'action.redo':'Redo changes', 'action.reset':'Reset to default', 'action.import':'Import content', 'action.export':'Export JSON', 'action.export_csv':'Export CSV', 'action.delete':'Delete content' };
  const protectedForAdmin = new Set(['admin.access','access.manage','page.users','page.roles']);
  const option = permission => `<label class="role-permission-option"><input type="checkbox" name="permissions" value="${escapeHtml(permission)}" ${selected.has(permission) ? 'checked' : ''} ${role?.id === 'ADMIN' && protectedForAdmin.has(permission) ? 'disabled' : ''}/><span><b>${escapeHtml(intranetNames[permission] || pagePermissionNames[permission] || actionNames[permission] || permissionLabel(permission))}</b></span></label>`;
  const group = (title, items, note = '') => `<section class="role-group"><div class="role-group-head"><h3>${title}</h3><span><button type="button" data-select-group>Select all</button><button type="button" data-deselect-group>Clear</button></span></div>${note ? `<p class="role-group-note">${note}</p>` : ''}<div class="role-group-grid">${items.map(option).join('')}</div></section>`;
  dialog.innerHTML = `<form><div class="dialog-heading"><div><h2>${role ? `Edit ${escapeHtml(roleLabel(role.id))}` : 'Add role'}</h2><p>Choose what this role can see in the intranet and what it can manage in Administration.</p></div><button type="button" class="dialog-close" data-card-editor-close aria-label="Close">×</button></div>${role ? '' : '<label class="role-name-field">Role name<input name="name" required maxlength="41" placeholder="e.g. Department editor" /><small>Use a name your team will recognize.</small></label>'}${group('Intranet pages access', intranetPagePermissions, 'Controls the employee-facing pages and their content. My profile stays available to every signed-in user.')}<section class="role-admin-section"><div class="role-admin-section-head"><div><h3>Admin Panel (Edit Content)</h3><p>Separate access to Administration from the pages employees can view.</p></div><label class="role-admin-switch"><input type="checkbox" name="permissions" value="admin.access" ${selected.has('admin.access') ? 'checked' : ''} ${role?.id === 'ADMIN' ? 'disabled' : ''}/><span>Allow Admin Panel</span></label></div><div class="role-admin-scope">${group('Administration capabilities', capabilities, 'Choose the work this role can perform.')}${group('Administration page access', pagePermissionOptions, 'Choose the pages visible in the Administration sidebar.')}${group('Administration actions', globalActionPermissions, 'These actions apply only to Administration pages this role can access.')}</div></section>${other.length ? group('Other permissions', other) : ''}<p class="role-editor-error" role="alert"></p><div class="form-actions"><button class="action-button" type="button" data-card-editor-close>Cancel</button><button class="action-button primary">${role ? 'Update role' : 'Create role'}</button></div></form>`;
  const calendarDetailGroup = [...dialog.querySelectorAll('.role-group')].find(group => group.querySelector('[value="events.details.all"]'));
  if (calendarDetailGroup) {
    calendarDetailGroup.querySelector('h3').textContent = 'Calendar detail access';
    const note = document.createElement('p');
    note.className = 'role-group-note';
    note.textContent = 'Allows this role to view descriptions, meeting links, and attachments for every calendar event. Without it, those details stay limited to invited guests.';
    calendarDetailGroup.querySelector('.role-group-head').insertAdjacentElement('afterend', note);
  }
  dialog.querySelectorAll('[data-card-editor-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  const inputFor = permission => [...dialog.querySelectorAll('[name="permissions"]')].find(input => input.value === permission);
  const adminToggle = inputFor('admin.access'), adminScope = dialog.querySelector('.role-admin-scope');
  const syncAdminScope = () => { adminScope.hidden = !adminToggle.checked; };
  const ensureDependencies = () => {
    adminScope.querySelectorAll('[name="permissions"]:checked').forEach(input => {
      if (!input.value.startsWith('page.')) return;
      const view = Object.keys(adminViewPermissions).find(key => adminViewPermissions[key] === input.value);
      const dependency = adminViewCapabilities[view];
      if (dependency) inputFor(dependency).checked = true;
    });
    if (inputFor('content.publish').checked) ['content.edit','page.announcements'].forEach(permission => { inputFor(permission).checked = true; });
    if (inputFor('audit.export').checked) ['audit.view','page.activity'].forEach(permission => { inputFor(permission).checked = true; });
  };
  syncAdminScope();
  dialog.querySelectorAll('[data-select-group], [data-deselect-group]').forEach(button => button.addEventListener('click', () => {
    const checked = button.hasAttribute('data-select-group');
    button.closest('.role-group').querySelectorAll('[name="permissions"]').forEach(input => {
      if (!input.disabled) input.checked = checked;
    });
    if (checked && button.closest('.role-admin-scope')) adminToggle.checked = true;
    if (checked) ensureDependencies();
    syncAdminScope();
  }));
  dialog.querySelector('form').addEventListener('change', event => {
    const input = event.target;
    if (input.name !== 'permissions') return;
    if (input === adminToggle && !input.checked) adminScope.querySelectorAll('[name="permissions"]').forEach(item => { if (!item.disabled) item.checked = false; });
    if (input !== adminToggle && input.checked && adminScope.contains(input)) {
      adminToggle.checked = true;
      const primaryPage = { 'content.edit':'page.content', 'media.manage':'page.media', 'audit.view':'page.activity', 'access.manage':'page.users', 'settings.manage':'page.settings' }[input.value];
      if (primaryPage) inputFor(primaryPage).checked = true;
      ensureDependencies();
    }
    if (input !== adminToggle && !input.checked && adminScope.contains(input)) {
      if (['content.edit','media.manage','audit.view','access.manage','settings.manage'].includes(input.value)) {
        Object.entries(adminViewPermissions).forEach(([view, permission]) => {
          if (adminViewCapabilities[view] === input.value && !inputFor(permission).disabled) inputFor(permission).checked = false;
        });
      }
      if (input.value === 'content.edit' || input.value === 'page.announcements') inputFor('content.publish').checked = false;
      if (input.value === 'audit.view' || input.value === 'page.activity') inputFor('audit.export').checked = false;
    }
    syncAdminScope();
    dialog.querySelector('.role-editor-error').textContent = '';
  });
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const permissions = [...dialog.querySelectorAll('[name="permissions"]:checked')].map(input => input.value);
    if (role?.id === 'ADMIN') for (const required of protectedForAdmin) if (!permissions.includes(required)) permissions.push(required);
    const error = dialog.querySelector('.role-editor-error');
    if (!permissions.length) { error.textContent = 'Choose at least one intranet page or Administration permission.'; return; }
    const invalidPermissions = rolePermissionError(permissions);
    if (invalidPermissions) { error.textContent = invalidPermissions; return; }
    try {
      const name = role?.id || dialog.querySelector('[name="name"]')?.value.trim();
      if (!name) { error.textContent = 'Enter a role name.'; return; }
      await api('/api/admin/roles', { method:role ? 'PATCH' : 'POST', body:JSON.stringify({ id:name, permissions }) });
      dialog.close();
      flash(role ? 'Role permissions updated.' : 'Role created.');
      await refreshAdminPermissions();
      if (canAccessAdminView('roles')) await renderRolesCards();
    } catch (reason) {
      error.textContent = reason.message || 'This role could not be saved.';
    }
  });
  dialog.showModal();
}
document.addEventListener('click', event => { const button = event.target.closest('[data-card-edit-role]'); if (!button) return; event.stopImmediatePropagation(); event.preventDefault(); openGroupedRoleEditor(button.dataset.cardEditRole); }, true);
document.addEventListener('click', event => { const button = event.target.closest('[data-add-role]'); if (!button) return; event.stopImmediatePropagation(); event.preventDefault(); openGroupedRoleEditor(null); }, true);
loadGlobalPageContent();
api('/api/auth/me').then(me => { const pagePermissions = me.permissions?.filter(permission => permission.startsWith('page.')) || []; if (!pagePermissions.length) return; const views = { overview:'page.overview', home:'page.home', global:'page.home', content:'page.content', apps:'page.apps', announcements:'page.announcements', social:'page.social', moments:'page.moments', knowledge:'page.knowledge', events:'page.events', whistleblower:'page.whistleblower', people:'page.people', newsi:'page.newsi', appearance:'page.appearance', media:'page.media', access:'page.users', roles:'page.roles', activity:'page.activity', compliance:'page.compliance', settings:'page.settings' }; Object.entries(views).forEach(([view, permission]) => { const button = document.querySelector(`[data-view="${view}"]`); if (button && !pagePermissions.includes(permission)) button.hidden = true; }); }).catch(() => {});
