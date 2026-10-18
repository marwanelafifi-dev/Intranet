const escapeHtml = (value = '') => String(value).replace(/[&<'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character]));
const arrowIcon = direction => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction === 'previous' ? 'm14.5 5-7 7 7 7' : 'm9.5 5 7 7-7 7'}"/></svg>`;
let companyNewsRequest;
const shifterControllers = new WeakMap();
const newsImageReadiness = new Map();
const disposeShifter = root => { shifterControllers.get(root)?.(); shifterControllers.delete(root); };

function preloadNewsImage(source) {
  if (!source) return Promise.resolve(false);
  if (newsImageReadiness.has(source)) return newsImageReadiness.get(source);

  const readiness = new Promise(resolve => {
    const image = new Image();
    let settled = false;
    const finish = loaded => {
      if (settled) return;
      settled = true;
      resolve(loaded);
    };
    image.decoding = 'async';
    image.onload = () => {
      const decoded = () => finish(image.naturalWidth > 0);
      if (typeof image.decode === 'function') image.decode().then(decoded, decoded);
      else decoded();
    };
    image.onerror = () => finish(false);
    image.src = source;
  }).then(loaded => {
    if (!loaded) newsImageReadiness.delete(source);
    return loaded;
  });
  newsImageReadiness.set(source, readiness);
  return readiness;
}

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
  return `<article class="news-shifter-slide is-image-pending" aria-roledescription="slide" aria-label="${index + 1} of ${total}">
    <div class="news-shifter-visual"><img class="news-shifter-cover" src="${escapeHtml(article.imageUrl)}" alt="" /></div>
    <div class="news-shifter-story"><time datetime="${escapeHtml(article.dateIso)}">${escapeHtml(article.date)}</time><h3><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.title)}</a></h3><p>${escapeHtml(article.summary)}</p><a class="news-shifter-read" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Read official news <span aria-hidden="true">→</span></a></div>
  </article>`;
}
function mountShifter(root, items, stale = false, { autoPlay = false, initialIndex = 0 } = {}) {
  disposeShifter(root);
  let activeIndex = initialIndex;
  const rotationDelay = 4500;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const canAutoPlay = autoPlay && items.length > 1 && !reducedMotion;
  let rotationTimer = 0, focusOutTimer = 0, inViewport = !('IntersectionObserver' in window), interactionPaused = false, disposed = false, observer;
  const eventController = new AbortController();
  const clearRotation = () => { if (rotationTimer) window.clearTimeout(rotationTimer); rotationTimer = 0; };
  const shouldRotate = () => canAutoPlay && inViewport && !interactionPaused && document.visibilityState === 'visible';
  const syncAutoplay = () => {
    if (disposed) return;
    clearRotation();
    const rotating = shouldRotate();
    root.querySelector('.news-shifter-frame')?.classList.toggle('is-autoplaying', rotating);
    if (rotating) rotationTimer = window.setTimeout(() => requestSlide((activeIndex + 1) % items.length), rotationDelay);
  };
  const setNavigationBusy = busy => {
    root.querySelector('.news-shifter-frame')?.setAttribute('aria-busy', String(busy));
    root.querySelectorAll('[data-news-shift]').forEach(button => { button.disabled = busy; });
  };
  let changingSlide = false;
  const requestSlide = async (requestedIndex, focusTarget = '', announce = false) => {
    if (disposed || changingSlide || requestedIndex === activeIndex) return;
    changingSlide = true;
    clearRotation();
    setNavigationBusy(true);
    const imageReady = await preloadNewsImage(items[requestedIndex].imageUrl);
    if (!disposed && imageReady && requestedIndex !== activeIndex) {
      activeIndex = requestedIndex;
      render(focusTarget, announce);
    }
    changingSlide = false;
    if (!disposed) {
      setNavigationBusy(false);
      syncAutoplay();
    }
  };
  const render = (focusTarget = '', announce = false) => {
    if (disposed) return;
    const article = items[activeIndex];
    root.innerHTML = `${stale ? '<p class="company-news-stale" role="status">Showing the last saved official news while the source reconnects.</p>' : ''}<div class="news-shifter-frame" aria-roledescription="carousel" aria-label="Latest Si-Ware company news"><div class="news-shifter-viewport">${slideMarkup(article, activeIndex, items.length)}</div><div class="news-shifter-controls"><div class="news-shifter-manual-nav" role="group" aria-label="Company news navigation"><button type="button" data-news-shift="previous" aria-label="Show previous company news">${arrowIcon('previous')}<span>Previous</span></button><span class="news-shifter-position" aria-live="${announce ? 'polite' : 'off'}" aria-label="Story ${activeIndex + 1} of ${items.length}">${String(activeIndex + 1).padStart(2, '0')} <i aria-hidden="true">of</i> ${String(items.length).padStart(2, '0')}</span><button type="button" data-news-shift="next" aria-label="Show next company news"><span>Next</span>${arrowIcon('next')}</button></div></div></div>`;
    const slide = root.querySelector('.news-shifter-slide'), image = root.querySelector('.news-shifter-cover'), revealImage = () => slide?.classList.remove('is-image-pending');
    if (image?.complete) { if (image.naturalWidth) revealImage(); } else image?.addEventListener('load', revealImage, { once:true });
    root.querySelectorAll('[data-news-shift]').forEach(button => button.addEventListener('click', () => {
      requestSlide(button.dataset.newsShift === 'next' ? (activeIndex + 1) % items.length : (activeIndex - 1 + items.length) % items.length, button.dataset.newsShift, true);
    }));
    if (focusTarget) root.querySelector(`[data-news-shift="${focusTarget}"]`)?.focus();
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
  root.innerHTML = '';
  try {
    const feed = await getCompanyNews();
    mountShifter(root, feed.items, feed.stale, { autoPlay:true });
  }
  catch { root.innerHTML = unavailableMarkup(); }
}
export async function renderNewsPage(root) {
  if (!root) return;
  root.innerHTML = `<section class="company-news-page-intro"><h1>Company news</h1><p>The latest official announcements, partnerships, and milestones from the Si-Ware Systems Website.</p></section><section class="company-news-feature" aria-labelledby="company-news-feature-title"><div class="company-news-section-heading"><h2 id="company-news-feature-title">Latest announcement</h2><a href="https://www.si-ware.com/company/news" target="_blank" rel="noopener noreferrer">Open company news <span aria-hidden="true">↗</span></a></div><div id="company-news-shifter">${loadingMarkup()}</div></section><section class="company-news-archive" aria-labelledby="company-news-archive-title"><h2 id="company-news-archive-title">More from Si-Ware</h2><div class="company-news-list" id="company-news-list">${loadingMarkup()}</div></section>`;
  const shifter = root.querySelector('#company-news-shifter'), archive = root.querySelector('#company-news-list');
  try {
    const feed = await getCompanyNews();
    mountShifter(shifter, feed.items, feed.stale);
    archive.innerHTML = feed.items.slice(1).map(article => `<article>${article.imageUrl ? `<img src="${escapeHtml(article.imageUrl)}" alt="" loading="lazy" />` : ''}<time datetime="${escapeHtml(article.dateIso)}">${escapeHtml(article.date)}</time><h3><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.title)}</a></h3><p>${escapeHtml(article.summary)}</p><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Read official news <span aria-hidden="true">→</span></a></article>`).join('');
  } catch { shifter.innerHTML = unavailableMarkup(); archive.innerHTML = unavailableMarkup(); }
}
