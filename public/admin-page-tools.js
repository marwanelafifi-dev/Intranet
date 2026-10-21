export const pageDataKeys = Object.freeze({
  apps:['apps'],
  announcements:['announcements','announcementSchedules','announcementTemplates'],
  social:['socialLinks'],
  moments:['moments','momentsPageContent'],
  knowledge:['sessions','knowledgePageContent'],
  events:['events'],
  whistleblower:['whistleblowerConfig'],
  people:['newMembers','recentlyJoinedPageContent'],
  newsi:['policies','firstWeekChecklist','supportPortals','policyAcknowledgementContent','newSiPageContent'],
  appearance:['settings']
});

export const editablePageViews = Object.keys(pageDataKeys);

export function pageSnapshot(data, view) {
  const keys = pageDataKeys[view] || [];
  return Object.fromEntries(keys.map(key => [key, structuredClone(data[key] ?? null)]));
}

export function applyPageSnapshot(data, view, snapshot) {
  for (const key of pageDataKeys[view] || []) data[key] = structuredClone(snapshot[key] ?? null);
}

export function pageChanged(before, after, view) {
  return JSON.stringify(pageSnapshot(before, view)) !== JSON.stringify(pageSnapshot(after, view));
}
