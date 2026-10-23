(() => {
  const storageKey = 'siware-first-week-checklist-v1';
  const resourceVisitStorageKey = 'siware-first-week-resource-visits-v3';
  const lockIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>';
  const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
  const resourceVisitKey = item => `${String(item?.id || '')}:${String(item?.resourceUrl || '').trim()}`;
  const list = document.querySelector('#first-week-checklist');
  if (!list) return;
  const label = document.querySelector('#checklist-progress-label');
  const description = document.querySelector('#checklist-progress-description');
  const nextStep = document.querySelector('.checklist-next-step');
  const heroProgress = document.querySelector('#onboarding-hero-progress');
  const bar = document.querySelector('#checklist-progress-bar');
  const attachmentViewer = document.querySelector('#attachment-viewer');
  const attachmentTitle = document.querySelector('#attachment-viewer-title');
  const attachmentContent = document.querySelector('#attachment-viewer-content');
  const attachmentClose = document.querySelector('#attachment-viewer-close');
  const attachmentOpen = document.querySelector('#attachment-viewer-open');
  const attachmentDownload = document.querySelector('#attachment-viewer-download');
  const lockGuidance = document.querySelector('#checklist-lock-guidance');
  const lockGuidanceTitle = document.querySelector('#checklist-lock-guidance-title');
  const lockGuidanceMessage = document.querySelector('#checklist-lock-guidance-message');
  const lockGuidanceClose = document.querySelector('#checklist-lock-guidance-close');
  let completed = new Set();
  let currentItems = [];
  let policyAcknowledged = false;
  let securityAwarenessViewed = false;
  let adminPortalTrainingViewed = false;
  let visitedResourceTasks = new Set();
  let pageCopy = {
    checklistCompleteTitle:'First week complete',
    checklistCompleteText:'Excellent work. Your first-week essentials are complete.',
    checklistEmptyText:'Choose one task to begin. You can change a task later.',
    checklistInProgressText:'Keep your momentum going.',
    checklistNextStepText:'Start with the task that gives you access.',
    checklistReopenText:'You can reopen any task.',
    heroCompleteText:'First-week essentials complete'
  };
  try { completed = new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch {}
  try { visitedResourceTasks = new Set(JSON.parse(localStorage.getItem(resourceVisitStorageKey) || '[]')); } catch {}
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify([...completed])); } catch {} };
  const loadTrainingStatus = async endpoint => {
    try {
      const response = await fetch(endpoint, { credentials:'same-origin' });
      if (!response.ok) return false;
      return (await response.json()).recorded === true;
    } catch { return false; }
  };
  const editableStatus = (element, key) => {
    if (!element) return;
    if (element.dataset.newsiCopy !== key) {
      element.removeAttribute('contenteditable');
      element.removeAttribute('data-admin-preview-newsi-page-copy');
      element.removeAttribute('role');
      element.removeAttribute('aria-multiline');
      element.removeAttribute('aria-label');
      element.removeAttribute('tabindex');
      element.removeAttribute('title');
    }
    if (key) element.dataset.newsiCopy = key;
    else element.removeAttribute('data-newsi-copy');
  };
  const updateProgress = total => {
    const count = completed.size, complete = Boolean(total && count === total);
    const descriptionKey = complete ? 'checklistCompleteText' : count ? 'checklistInProgressText' : 'checklistEmptyText';
    const nextStepKey = complete ? 'checklistReopenText' : 'checklistNextStepText';
    label.textContent = complete ? pageCopy.checklistCompleteTitle : `${count} of ${total} complete`;
    editableStatus(label, complete ? 'checklistCompleteTitle' : '');
    if (description) { description.textContent = pageCopy[descriptionKey]; editableStatus(description, descriptionKey); }
    if (nextStep) { nextStep.textContent = pageCopy[nextStepKey]; editableStatus(nextStep, nextStepKey); }
    if (heroProgress) { heroProgress.textContent = complete ? pageCopy.heroCompleteText : count ? `${count} of ${total} actions complete` : `${total} essential actions ahead`; editableStatus(heroProgress, complete ? 'heroCompleteText' : ''); }
    bar.style.width = `${total ? (count / total) * 100 : 0}%`;
  };
  const render = items => {
    currentItems = items;
    const validIds = new Set(items.map(item => item.id));
    completed = new Set([...completed].filter(id => validIds.has(id)));
    const nextItemId = items.find(item => !completed.has(item.id))?.id;
    list.innerHTML = items.map(item => {
      const link = String(item.resourceUrl || ''), attachment = String(item.attachmentUrl || (link.startsWith('/uploads/') ? link : ''));
      const visitKey = resourceVisitKey(item);
      const makeLink = (url, itemLabel, isAttachment = false) => { const attributes = isAttachment ? 'data-attachment-preview' : `${/^https?:\/\//i.test(url) ? 'target="_blank" rel="noreferrer" ' : ''}data-checklist-resource="${escapeHtml(visitKey)}"`; return /^(https?:\/\/|\/|#)/i.test(url) ? `<a class="checklist-resource" href="${escapeHtml(url)}" ${attributes}>${escapeHtml(itemLabel)}</a>` : ''; };
      const resources = `${!link.startsWith('/uploads/') ? makeLink(link, item.resourceLabel || 'Open resource') : ''}${makeLink(attachment, item.attachmentLabel || 'Open attachment', true)}`;
      const resourceMarkup = resources ? `<div class="checklist-resources">${resources}</div>` : '';
      const isNext = item.id === nextItemId;
      const configuredPolicyGate = item.requiresPolicyAcknowledgement;
      const requiresPolicyAcknowledgement = configuredPolicyGate === true || configuredPolicyGate === 'true'
        ? true
        : configuredPolicyGate === false || configuredPolicyGate === 'false'
          ? false
          : /read\s+(?:the\s+)?essential\s+policies.*confirm|essential\s+policies.*confirm/i.test(String(item.text || ''));
      const configuredVideoGate = item.requiresSecurityAwarenessVideo;
      const requiresSecurityAwarenessVideo = configuredVideoGate === true || configuredVideoGate === 'true'
        ? true
        : configuredVideoGate === false || configuredVideoGate === 'false'
          ? false
          : /security\s+awareness.*(?:video|training)|(?:video|training).*security\s+awareness/i.test(String(item.text || ''));
      const configuredAdminPortalGate = item.requiresAdminPortalTraining;
      const requiresAdminPortalTraining = configuredAdminPortalGate === true || configuredAdminPortalGate === 'true'
        ? true
        : configuredAdminPortalGate === false || configuredAdminPortalGate === 'false'
          ? false
          : /admin\s+portal\s+training/i.test(String(item.text || ''));
      const requiresResourceLinkClick = item.requiresResourceLinkClick === true || item.requiresResourceLinkClick === 'true';
      const policyLocked = requiresPolicyAcknowledgement && !policyAcknowledged;
      const videoLocked = requiresSecurityAwarenessVideo && !securityAwarenessViewed;
      const adminPortalLocked = requiresAdminPortalTraining && !adminPortalTrainingViewed;
      const resourceLocked = requiresResourceLinkClick && !visitedResourceTasks.has(visitKey);
      const locked = policyLocked || videoLocked || adminPortalLocked || resourceLocked;
      const lockMessageId = `checklist-lock-${escapeHtml(item.id)}`;
      const lockMessage = locked ? `<p class="checklist-lock-message" id="${lockMessageId}">${policyLocked ? 'Confirm that you have read the Essential Policies before completing this task. ' : ''}${videoLocked ? 'Watch the full Security Awareness Training video in either English or Arabic before completing this task. ' : ''}${adminPortalLocked ? 'Start the Company Portal Training Session before completing this task. ' : ''}${resourceLocked ? 'Open the required link before completing this task.' : ''}</p>` : '';
      const guidanceTarget = policyLocked ? 'policies' : (videoLocked || adminPortalLocked ? 'training' : 'first-week');
      const guidanceTitle = policyLocked ? 'Policy acknowledgement required' : videoLocked ? 'Security Awareness Training required' : adminPortalLocked ? 'Company Portal Training required' : 'Required action needed';
      const guidanceMessage = policyLocked ? 'Review the Essential Policies and submit your acknowledgement before marking this task complete.' : videoLocked ? 'To support Si-Ware’s ISO/IEC 27001-certified information-security management system, watch the full Security Awareness Training video in either English or Arabic before marking this task complete.' : adminPortalLocked ? 'Start playback of the Company Portal Training Session before marking this task complete.' : 'Open the required link for this task before marking it complete.';
      const lockIndicator = locked ? `<span class="checklist-lock-indicator" title="${escapeHtml(guidanceTitle)}">${lockIcon}<span>Locked</span></span>` : '';
      return `<li><div class="checklist-entry${isNext ? ' is-next-step' : ''}${locked ? ' is-locked' : ''}"${locked ? ` data-lock-target="${guidanceTarget}" data-lock-title="${escapeHtml(guidanceTitle)}" data-lock-message="${escapeHtml(guidanceMessage)}"` : ''}><label class="checklist-item"><input type="checkbox" data-checklist-item="${escapeHtml(item.id)}" ${completed.has(item.id) ? 'checked' : ''} ${locked ? `disabled aria-disabled="true" aria-describedby="${lockMessageId}"` : ''} /><span>${escapeHtml(item.text)}</span></label><div class="checklist-entry-status">${isNext ? '<span class="checklist-next-badge">Next up</span>' : ''}${lockIndicator}</div>${lockMessage}${resourceMarkup}</div></li>`;
    }).join('');
    list.querySelectorAll('.checklist-item').forEach(label => label.classList.toggle('is-complete', label.querySelector('input').checked));
    updateProgress(items.length);
    save();
    document.dispatchEvent(new Event('first-week-checklist:rendered'));
  };
  const showLockGuidance = (title, message) => {
    if (!lockGuidance || lockGuidance.open) return;
    if (lockGuidanceTitle) lockGuidanceTitle.textContent = title || 'Required action needed';
    if (lockGuidanceMessage) lockGuidanceMessage.textContent = message || 'Complete the required action before marking this task complete.';
    lockGuidance.showModal();
  };
  list.addEventListener('change', event => {
    const input = event.target.closest('[data-checklist-item]');
    if (!input) return;
    if (input.disabled || input.getAttribute?.('aria-disabled') === 'true') return;
    if (input.checked) completed.add(input.dataset.checklistItem);
    else completed.delete(input.dataset.checklistItem);
    render(currentItems);
  });
  list.addEventListener('click', event => {
    const link = event.target.closest('[data-checklist-resource]');
    if (!link) return;
    visitedResourceTasks.add(String(link.dataset.checklistResource));
    try { localStorage.setItem(resourceVisitStorageKey, JSON.stringify([...visitedResourceTasks])); } catch {}
    window.setTimeout(() => render(currentItems), 0);
  });
  list.addEventListener('click', event => {
    if (event.target.closest('a')) return;
    const lockedEntry = event.target.closest('.checklist-entry.is-locked');
    if (!lockedEntry) return;
    event.preventDefault();
    const target = document.querySelector(`#${lockedEntry.dataset.lockTarget || 'first-week'}`);
    target?.scrollIntoView({ behavior:'smooth', block:'start' });
    showLockGuidance(lockedEntry.dataset.lockTitle, lockedEntry.dataset.lockMessage);
  });
  lockGuidanceClose?.addEventListener('click', () => lockGuidance?.close());
  lockGuidance?.addEventListener('click', event => { if (event.target === lockGuidance) lockGuidance.close(); });
  document.addEventListener('newsi-copy:preview-updated', event => {
    pageCopy = { ...pageCopy, ...event.detail };
    updateProgress(currentItems.length);
    document.dispatchEvent(new Event('first-week-checklist:rendered'));
  });
  document.addEventListener('policy-acknowledgement:rendered', event => {
    policyAcknowledged = Boolean(event.detail?.accepted);
    if (currentItems.length) render(currentItems);
  });
  document.addEventListener('security-awareness:watched', event => {
    if (event.detail?.recorded !== true) return;
    securityAwarenessViewed = true;
    if (currentItems.length) render(currentItems);
  });
  document.addEventListener('admin-portal-training:watched', event => {
    if (event.detail?.recorded !== true) return;
    adminPortalTrainingViewed = true;
    if (currentItems.length) render(currentItems);
  });
  list.addEventListener('click', event => {
    const link = event.target.closest('[data-attachment-preview]');
    if (!link || !attachmentViewer || !attachmentContent) return;
    event.preventDefault();
    const url = link.href, isImage = /\.(png|jpe?g|webp|gif)(?:$|[?#])/i.test(url), isVideo = /\.(mp4|webm|mov)(?:$|[?#])/i.test(url), isPdf = /\.pdf(?:$|[?#])/i.test(url);
    attachmentTitle.textContent = link.textContent.trim() || 'Attachment preview';
    attachmentOpen.href = url;
    attachmentDownload.href = `${url}${url.includes('?') ? '&' : '?'}download=1`;
    const showFallback = () => { attachmentContent.innerHTML = `<div class="attachment-fallback"><b>Preview unavailable</b><p>Use Open file or Download to view this attachment.</p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open file</a></div>`; };
    if (isImage) attachmentContent.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(attachmentTitle.textContent)}" />`;
    else if (isVideo) attachmentContent.innerHTML = `<video controls autoplay preload="metadata"><source src="${escapeHtml(url)}">Your browser does not support video playback.</video>`;
    else if (isPdf) {
      const previewUrl = new URL('/api/documents/page', window.location.origin);
      previewUrl.searchParams.set('url', new URL(url).pathname);
      previewUrl.searchParams.set('page', '1');
      attachmentContent.innerHTML = `<img class="attachment-pdf-page" src="${escapeHtml(previewUrl.href)}" alt="First page of ${escapeHtml(attachmentTitle.textContent)}" />`;
      attachmentContent.querySelector('img')?.addEventListener('error', showFallback, { once:true });
    } else showFallback();
    attachmentViewer.showModal();
    attachmentClose?.focus();
  });
  attachmentClose?.addEventListener('click', () => attachmentViewer?.close());
  attachmentViewer?.addEventListener('click', event => { if (event.target === attachmentViewer) attachmentViewer.close(); });
  attachmentViewer?.addEventListener('cancel', event => { event.preventDefault(); attachmentViewer.close(); });
  attachmentViewer?.addEventListener('close', () => { attachmentContent.querySelector('video')?.pause(); attachmentContent.innerHTML = ''; });
  const navLinks = [...document.querySelectorAll('[data-onboarding-nav]')];
  const updateActiveNav = id => navLinks.forEach(link => { if (link.getAttribute('href') === `#${id}`) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
  const navigationSections = [...document.querySelectorAll('.policy-card[id]')];
  const syncActiveNavigation = () => {
    const readingLine = window.innerHeight * 0.28;
    const current = navigationSections.reduce((active, section) => section.getBoundingClientRect().top <= readingLine ? section : active, navigationSections[0]);
    if (current) updateActiveNav(current.id);
  };
  window.addEventListener('scroll', syncActiveNavigation, { passive:true });
  window.addEventListener('resize', syncActiveNavigation);
  syncActiveNavigation();
  Promise.all([
    fetch('/api/dashboard').then(response => response.ok ? response.json() : Promise.reject()),
    loadTrainingStatus('/api/security-awareness-acknowledgement'),
    loadTrainingStatus('/api/company-portal-training-acknowledgement')
  ]).then(([data, securityAwarenessRecorded, companyPortalTrainingRecorded]) => {
    securityAwarenessViewed = securityAwarenessRecorded;
    adminPortalTrainingViewed = companyPortalTrainingRecorded;
    pageCopy = Object.fromEntries(Object.entries(pageCopy).map(([name, fallback]) => [name, String(data.newSiPageContent?.[name] || fallback)]));
    render(Array.isArray(data.firstWeekChecklist) ? data.firstWeekChecklist : []);
  }).catch(() => render([]));
})();
