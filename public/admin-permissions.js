export const adminViewPermissions = Object.freeze({
  overview:'page.overview', home:'page.home', content:'page.content', apps:'page.apps',
  announcements:'page.announcements', social:'page.social', moments:'page.moments',
  knowledge:'page.knowledge', events:'page.events', whistleblower:'page.whistleblower',
  people:'page.people', newsi:'page.newsi', appearance:'page.appearance', media:'page.media',
  access:'page.users', roles:'page.roles', activity:'page.activity', settings:'page.settings'
});

export const adminViewCapabilities = Object.freeze({
  content:'content.edit', home:'content.edit', appearance:'content.edit', apps:'content.edit',
  announcements:'content.edit', social:'content.edit', moments:'content.edit',
  knowledge:'content.edit', events:'content.edit', whistleblower:'content.edit',
  people:'content.edit', newsi:'content.edit', appearance:'content.edit',
  media:'media.manage', access:'access.manage', roles:'access.manage',
  activity:'audit.view', settings:'settings.manage'
});

export const adminActionPermissions = Object.freeze([
  'action.undo', 'action.redo', 'action.reset', 'action.import', 'action.export', 'action.delete'
]);

export const adminContentKeyPages = Object.freeze({
  apps:['page.apps'], announcements:['page.announcements'],
  announcementSchedules:['page.announcements'], announcementTemplates:['page.announcements'],
  socialLinks:['page.social'], moments:['page.moments'], momentsPageContent:['page.moments'],
  sessions:['page.knowledge'], knowledgePageContent:['page.knowledge'], events:['page.events'],
  whistleblowerConfig:['page.whistleblower'], newMembers:['page.people'],
  recentlyJoinedPageContent:['page.people'], policies:['page.newsi'],
  firstWeekChecklist:['page.newsi'], supportPortals:['page.newsi'],
  policyAcknowledgementContent:['page.newsi'], newSiPageContent:['page.newsi'],
  homePageContent:['page.home'], settings:['page.home','page.appearance']
});

export const adminContentKeys = Object.freeze(Object.keys(adminContentKeyPages));

export function canOpenAdmin(permissions) {
  const granted = new Set(permissions || []);
  return granted.has('admin.access') && Object.entries(adminViewPermissions).some(([view, permission]) => granted.has(permission) &&
    (adminViewCapabilities[view] ? granted.has(adminViewCapabilities[view]) :
      ['content.edit','audit.view','access.manage','settings.manage','media.manage'].some(capability => granted.has(capability))));
}

export function rolePermissionError(permissions) {
  const granted = new Set(permissions || []);
  const adminPermissions = ['content.edit','content.publish','media.manage','access.manage','audit.view','audit.export','settings.manage', ...Object.values(adminViewPermissions), ...adminActionPermissions];
  if (!granted.has('admin.access') && adminPermissions.some(permission => granted.has(permission))) {
    return 'Turn on Admin Panel access to grant Administration permissions.';
  }
  if (granted.has('page.overview') && !['content.edit','audit.view','access.manage','settings.manage','media.manage'].some(permission => granted.has(permission))) {
    return 'Overview requires at least one Administration capability.';
  }
  for (const [view, capability] of Object.entries(adminViewCapabilities)) {
    if (granted.has(adminViewPermissions[view]) && !granted.has(capability)) {
      return `${adminViewPermissions[view]} requires ${capability}.`;
    }
  }
  if (granted.has('content.publish') && (!granted.has('content.edit') || !granted.has('page.announcements'))) {
    return 'Publish announcements requires Edit content and the Announcements page.';
  }
  if (granted.has('audit.export') && (!granted.has('audit.view') || !granted.has('page.activity'))) {
    return 'Export audit trail requires View audit trail and the Activity & audit page.';
  }
  if (['action.undo','action.redo','action.reset','action.export'].some(permission => granted.has(permission)) && !granted.has('content.edit')) {
    return 'Content history, reset, and export actions require Edit content.';
  }
  if (['action.import','action.delete'].some(permission => granted.has(permission)) && !granted.has('content.edit') && !granted.has('access.manage')) {
    return 'Import and Delete actions require Edit content or Manage users.';
  }
  if (granted.has('admin.access') && !canOpenAdmin(permissions)) {
    return 'Admin Panel access needs at least one permitted Administration page and its matching capability.';
  }
  return '';
}

function removedFromStructure(previous, current) {
  if (Array.isArray(previous) && Array.isArray(current)) {
    if (current.length < previous.length) return true;
    const identity = item => item && typeof item === 'object' && (item.id || item.url);
    const keyed = previous.filter(identity);
    if (keyed.length) {
      const currentById = new Map(current.filter(identity).map(item => [identity(item), item]));
      return keyed.some(item => !currentById.has(identity(item)) || removedFromStructure(item, currentById.get(identity(item))));
    }
    return false;
  }
  if (previous && current && typeof previous === 'object' && typeof current === 'object') {
    return Object.keys(previous).some(key =>
      !Object.hasOwn(current, key) || removedFromStructure(previous[key], current[key]));
  }
  return false;
}

export function removedContent(before, after, keys) {
  return keys.some(key => {
    if (key === 'settings') {
      const oldRemoved = new Set(before.settings?.removedWidgets || []);
      return (after.settings?.removedWidgets || []).some(widget => !oldRemoved.has(widget)) ||
        (after.settings?.layout?.length || 0) < (before.settings?.layout?.length || 0);
    }
    return removedFromStructure(before[key], after[key]);
  });
}
