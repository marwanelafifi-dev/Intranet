export const defaultGlobalPageContent = Object.freeze({
  headerLogoUrl:'/siware-logo.png', loginLogoUrl:'/siware-logo.png', footerLogoUrl:'/Icon.png', faviconUrl:'/Icon.png',
  headerWordmark:'INTRANET',
  loginEyebrow:'Employee access', loginTitle:'Welcome back',
  loginLead:'Sign in for company updates, new-hire guidance, and required policy acknowledgements.',
  loginTopline:'One place for everyone at Si-Ware Systems',
  loginIntroTitle:'Stay connected.', loginIntroAccent:'Move forward.',
  loginIntroDescription:'Company updates, colleagues, everyday tools, and a clear path through first-week essentials and required policies.',
  loginPreviewTitle:'Inside your workspace', loginPreviewDescription:'A preview of the resources available after sign-in', loginPreviewAudience:'For every employee',
  loginPreviewNewsTitle:'Company news', loginPreviewNewsDescription:"What's happening",
  loginPreviewPeopleTitle:'People & moments', loginPreviewPeopleDescription:'Who we are',
  loginPreviewToolsTitle:'Tools & knowledge', loginPreviewToolsDescription:'Everything in reach',
  loginPreviewOnboardingTitle:'New-hire essentials', loginPreviewOnboardingDescription:'First-week checklist',
  loginPreviewPoliciesTitle:'Required actions', loginPreviewPoliciesDescription:'Policy acknowledgement',
  footerLegal:'© 2026 Si-Ware Systems · Internal use only',
  footerSupportText:'For technical support, contact', footerSupportEmail:'ithelpdesk@si-ware.com',
  footerLinkedinUrl:'https://www.linkedin.com/company/si-ware-systems/?locale=en_US',
  footerFacebookUrl:'https://www.facebook.com/SiWareSystems/',
  footerYoutubeUrl:'https://www.youtube.com/@Si-Ware_Systems',
  footerWebsiteUrl:'https://www.si-ware.com'
});

const imagePath = value => /^\/(?:uploads\/[a-z0-9._-]+|[a-z0-9._-]+)$/i.test(String(value || '')) ? value : '';
const secureUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } };
export function normaliseGlobalPageContent(value) {
  const content = { ...defaultGlobalPageContent };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return content;
  for (const key of Object.keys(content)) {
    const candidate = String(value[key] ?? '').trim();
    if (key.endsWith('LogoUrl') || key === 'faviconUrl') content[key] = imagePath(candidate) || content[key];
    else if (key.endsWith('Url')) content[key] = secureUrl(candidate) || content[key];
    else if (key === 'footerSupportEmail') content[key] = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(candidate) ? candidate.slice(0, 200) : content[key];
    else if (candidate) content[key] = candidate.slice(0, key === 'loginLead' || key === 'loginIntroDescription' ? 400 : 180);
  }
  return content;
}

export function applyGlobalPageContent(value, root = document) {
  const content = normaliseGlobalPageContent(value);
  const setText = (selector, text) => root.querySelectorAll(selector).forEach(node => { node.textContent = text; });
  root.querySelectorAll('img[src="/siware-logo.png"], img[data-global-header-logo]').forEach(image => { image.dataset.globalHeaderLogo = ''; image.src = image.closest('.page-header') ? content.loginLogoUrl : content.headerLogoUrl; });
  root.querySelectorAll('img[src="/Icon.png"], img[data-global-footer-logo]').forEach(image => { image.dataset.globalFooterLogo = ''; image.src = content.footerLogoUrl; });
  root.querySelectorAll('link[rel~="icon"]').forEach(icon => { icon.href = content.faviconUrl; icon.removeAttribute('type'); });
  if (!root.querySelector('link[rel~="icon"]')) { const icon = root.createElement('link'); icon.rel = 'icon'; icon.href = content.faviconUrl; root.head.append(icon); }
  setText('.shared-brand > span, .admin-global-brand > span, .page-header .brand > span, .global-access-header > span', content.headerWordmark);
  setText('.intranet-footer-brand small', content.footerLegal);
  root.querySelectorAll('.intranet-footer-support').forEach(node => {
    node.replaceChildren(document.createTextNode(`${content.footerSupportText} `));
    const link = document.createElement('a'); link.href = `mailto:${content.footerSupportEmail}`; link.textContent = content.footerSupportEmail; node.append(link);
  });
  const social = ['footerLinkedinUrl','footerFacebookUrl','footerYoutubeUrl','footerWebsiteUrl'];
  root.querySelectorAll('.intranet-footer-social').forEach(nav => [...nav.querySelectorAll('a')].forEach((link, index) => { if (social[index]) link.href = content[social[index]]; }));
  setText('[data-global-login-eyebrow]', content.loginEyebrow);
  const loginTitle = root.querySelector('#sign-in-heading');
  if (loginTitle) { loginTitle.replaceChildren(document.createTextNode(content.loginTitle)); const period = document.createElement('span'); period.className = 'heading-period'; period.textContent = /[.!?]$/.test(content.loginTitle) ? '' : '.'; loginTitle.append(period); }
  setText('.login-lead', content.loginLead);
  setText('[data-global-login-topline]', content.loginTopline);
  setText('.login-intro .intro-copy h2', content.loginIntroTitle);
  const introTitle = root.querySelector('.login-intro .intro-copy h2');
  if (introTitle) { introTitle.append(document.createElement('br')); const accent = document.createElement('span'); accent.textContent = content.loginIntroAccent; introTitle.append(accent); }
  setText('.login-intro .intro-copy p', content.loginIntroDescription);
  setText('.login-intro .preview-heading b', content.loginPreviewTitle);
  setText('.login-intro .preview-heading small', content.loginPreviewDescription);
  setText('.login-intro .preview-audience', content.loginPreviewAudience);
  ['News','People','Tools','Onboarding','Policies'].forEach((item, index) => {
    const row = root.querySelectorAll('.login-intro .preview-item')[index];
    if (!row) return;
    const title = row.querySelector('strong'), description = row.querySelector('small');
    if (title) title.textContent = content[`loginPreview${item}Title`];
    if (description) description.textContent = content[`loginPreview${item}Description`];
  });
  return content;
}

export async function loadGlobalPageContent(root = document) {
  try {
    const response = await fetch('/api/global-page-content', { cache:'no-store' });
    if (!response.ok) throw new Error('Global content unavailable');
    return applyGlobalPageContent(await response.json(), root);
  } catch { return applyGlobalPageContent(defaultGlobalPageContent, root); }
}
