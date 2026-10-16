const escapeHtml = (value = '') => String(value).replace(/[&<'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
const arrowIcon = direction => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction === 'previous' ? 'm14.5 5-7 7 7 7' : 'm9.5 5 7 7-7 7'}"/></svg>`;
const autoplayIcon = paused => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paused ? 'm9 5 10 7-10 7z' : 'M8 5v14M16 5v14'}"/></svg>`;
let companyNewsRequest;
const shifterControllers = new WeakMap();
const disposeShifter = root => { shifterControllers.get(root)?.(); shifterControllers.delete(root); };

async function getCompanyNews() {
  companyNewsRequest ||= fetch('/api/company-news').then(async response => {
    if (!response.ok) throw new Error('Official company news is unavailable.');
    const payload = await response.json();
    if (payload.unavailable || !payload.items?.length) throw new Error('Official company news is unavailable.');
    return payload;
  });
  try {
    return await companyNewsRequest;
  } catch (error) {
    companyNewsRequest = undefined;
    throw error;
  }
}
function loadingMarkup() { return '<p class="company-news-status" aria-live="polite">Loading the latest company news…</p>'; }
function unavailableMarkup() { return '<p class="company-news-status" role="status">Company news is temporarily unavailable. <a href="https://www.si-ware.com/company/news" target="_blank" rel="noopener noreferrer">Open the official news page</a>.</p>'; }
function slideMarkup(article, index, total) {
  return `<article class="news-shifter-slide" aria-roledescription="slide" aria-label="${index + 1} of ${total}">
    <div class="news-shifter-visual"><img class="news-shifter-cover" src="${escapeHtml(article.imageUrl)}" alt="" /><img class="news-shifter-logo" src="/siware-logo.png" alt="Si-Ware Systems" /><span>${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span></div>
    <div class="news-shifter-story"><time datetime="${escapeHtml(article.dateIso)}">${escapeHtml(article.date)}</time><h3><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.title)}</a></h3><p>${escapeHtml(article.summary)}</p><a class="news-shifter-read" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Read official news <span aria-hidden="true">→</span></a></div>
  </article>`;
}
function mountShifter(root, items, stale = false, { autoPlay = false } = {}) {
  disposeShifter(root);
  let activeIndex = 0;
  const rotationDelay = 7000;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const canAutoPlay = autoPlay && items.length > 1 && !reducedMotion;
  let rotationTimer = 0, focusOutTimer = 0, inViewport = !('IntersectionObserver' in window), interactionPaused = false, manuallyPaused = false, disposed = false, observer;
  const eventController = new AbortController();
  const clearRotation = () => { if (rotationTimer) window.clearTimeout(rotationTimer); rotationTimer = 0; };
  const shouldRotate = () => canAutoPlay && inViewport && !interactionPaused && !manuallyPaused && document.visibilityState === 'visible';
  const syncAutoplay = () => {
    if (disposed) return;
    clearRotation();
    const rotating = shouldRotate();
    root.querySelector('.news-shifter-frame')?.classList.toggle('is-autoplaying', rotating);
    if (rotating) rotationTimer = window.setTimeout(() => { activeIndex = (activeIndex + 1) % items.length; render(); }, rotationDelay);
  };
  const render = (focusTarget = '', announce = false) => {
    if (disposed) return;
    const article = items[activeIndex];
    root.innerHTML = `${stale ? '<p class="company-news-stale" role="status">Showing the last saved official news while the source reconnects.</p>' : ''}<div class="news-shifter-frame" aria-roledescription="carousel" aria-label="Latest Si-Ware company news"><div class="news-shifter-viewport">${slideMarkup(article, activeIndex, items.length)}</div><div class="news-shifter-controls"><button type="button" data-news-shift="previous" aria-label="Show previous company news">${arrowIcon('previous')}</button><span aria-live="${announce ? 'polite' : 'off'}">${activeIndex + 1} of ${items.length}</span><button type="button" data-news-shift="next" aria-label="Show next company news">${arrowIcon('next')}</button>${canAutoPlay ? `<button class="news-shifter-autoplay-toggle" type="button" data-news-autoplay aria-label="${manuallyPaused ? 'Resume' : 'Pause'} automatic news rotation">${autoplayIcon(manuallyPaused)}</button>` : ''}</div></div>`;
    root.querySelectorAll('[data-news-shift]').forEach(button => button.addEventListener('click', () => {
      activeIndex = button.dataset.newsShift === 'next' ? (activeIndex + 1) % items.length : (activeIndex - 1 + items.length) % items.length;
      render(button.dataset.newsShift, true);
    }));
    root.querySelector('[data-news-autoplay]')?.addEventListener('click', () => { manuallyPaused = !manuallyPaused; render('autoplay'); });
    if (focusTarget === 'autoplay') root.querySelector('[data-news-autoplay]')?.focus();
    else if (focusTarget) root.querySelector(`[data-news-shift="${focusTarget}"]`)?.focus();
    syncAutoplay();
  };
  const dispose = () => {
    disposed = true;
    clearRotation();
    if (focusOutTimer) window.clearTimeout(focusOutTimer);
    observer?.disconnect();
    eventController.abort();
  };
  shifterControllers.set(root, dispose);
  if (canAutoPlay) {
    root.addEventListener('mouseenter', () => { interactionPaused = true; syncAutoplay(); }, { signal:eventController.signal });
    root.addEventListener('mouseleave', () => { interactionPaused = false; syncAutoplay(); }, { signal:eventController.signal });
    root.addEventListener('focusin', () => { interactionPaused = true; syncAutoplay(); }, { signal:eventController.signal });
    root.addEventListener('focusout', () => { focusOutTimer = window.setTimeout(() => { if (!root.contains(document.activeElement)) { interactionPaused = false; syncAutoplay(); } }, 0); }, { signal:eventController.signal });
    document.addEventListener('visibilitychange', syncAutoplay, { signal:eventController.signal });
    if ('IntersectionObserver' in window) { observer = new IntersectionObserver(([entry]) => { inViewport = entry.isIntersecting; syncAutoplay(); }, { threshold: 0.25 }); observer.observe(root); }
  }
  render();
}

export async function renderNewsShifter(root) {
  if (!root) return;
  disposeShifter(root);
  root.innerHTML = loadingMarkup();
  try { const feed = await getCompanyNews(); mountShifter(root, feed.items, feed.stale, { autoPlay:true }); }
  catch { root.innerHTML = unavailableMarkup(); }
}
export async function renderNewsPage(root) {
  if (!root) return;
  root.innerHTML = `<section class="company-news-page-intro"><h1>Company news</h1><p>The latest official announcements, partnerships, and milestones from Si-Ware Systems.</p></section><section class="company-news-feature" aria-labelledby="company-news-feature-title"><div class="company-news-section-heading"><h2 id="company-news-feature-title">Latest announcement</h2><a href="https://www.si-ware.com/company/news" target="_blank" rel="noopener noreferrer">Open company news <span aria-hidden="true">↗</span></a></div><div id="company-news-shifter">${loadingMarkup()}</div></section><section class="company-news-archive" aria-labelledby="company-news-archive-title"><h2 id="company-news-archive-title">More from Si-Ware</h2><div class="company-news-list" id="company-news-list">${loadingMarkup()}</div></section>`;
  const shifter = root.querySelector('#company-news-shifter'), archive = root.querySelector('#company-news-list');
  try {
    const feed = await getCompanyNews();
    mountShifter(shifter, feed.items, feed.stale);
    archive.innerHTML = feed.items.slice(1).map(article => `<article>${article.imageUrl ? `<img src="${escapeHtml(article.imageUrl)}" alt="" loading="lazy" />` : ''}<time datetime="${escapeHtml(article.dateIso)}">${escapeHtml(article.date)}</time><h3><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.title)}</a></h3><p>${escapeHtml(article.summary)}</p><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Read official news <span aria-hidden="true">→</span></a></article>`).join('');
  } catch { shifter.innerHTML = unavailableMarkup(); archive.innerHTML = unavailableMarkup(); }
}
