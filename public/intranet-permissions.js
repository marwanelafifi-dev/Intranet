export const intranetPages = Object.freeze([
  { permission:'intranet.home', path:'/', label:'Home' },
  { permission:'intranet.apps', path:'/apps.html', label:'Main Apps' },
  { permission:'intranet.announcements', path:'/announcements.html', label:'Announcements' },
  { permission:'intranet.news', path:'/news.html', label:'Company news' },
  { permission:'intranet.social', path:'/social-media.html', label:'Social Media' },
  { permission:'intranet.moments', path:'/moments.html', label:'Moments' },
  { permission:'intranet.knowledge', path:'/knowledge-hub.html', label:'Knowledge Hub' },
  { permission:'intranet.events', path:'/events.html', label:'Events & key dates' },
  { permission:'intranet.whistleblower', path:'/whistleblower.html', label:'Whistleblower', visibilityKey:'whistleblowerConfig' },
  { permission:'intranet.whistleblower', path:'/whistleblower-2.html', label:'Whistleblower 2', visibilityKey:'whistleblower2Config' },
  { permission:'intranet.people', path:'/recently-joined.html', label:'Our Team' },
  { permission:'intranet.newsi', path:'/new-hires.html', label:'New Si-Warians' }
]);

export const intranetPagePermissions = Object.freeze([...new Set(intranetPages.map(page => page.permission))]);
export const intranetRoutePermissions = Object.freeze(Object.fromEntries([
  ...intranetPages.map(page => [page.path, page.permission]),
  ['/employee-voice.html', 'intranet.whistleblower'],
  ['/index.html', 'intranet.home']
]));

export const intranetContentPermissions = Object.freeze({
  apps:'intranet.apps', announcements:'intranet.announcements',
  socialLinks:'intranet.social', moments:'intranet.moments', momentsPageContent:'intranet.moments',
  sessions:'intranet.knowledge', knowledgePageContent:'intranet.knowledge',
  events:'intranet.events', whistleblowerConfig:'intranet.whistleblower', whistleblower2Config:'intranet.whistleblower',
  newMembers:'intranet.people', recentlyJoinedPageContent:'intranet.people',
  policies:'intranet.newsi', firstWeekChecklist:'intranet.newsi', supportPortals:'intranet.newsi',
  policyAcknowledgementContent:'intranet.newsi', newSiPageContent:'intranet.newsi',
  homePageContent:'intranet.home', feeds:'intranet.home',
  people:'intranet.home', forms:'intranet.home', faqs:'intranet.home', serviceRequests:'intranet.home'
});

export function firstAvailableIntranetPage(permissions = []) {
  const granted = new Set(permissions);
  return intranetPages.find(page => granted.has(page.permission)) || null;
}
