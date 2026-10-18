(() => {
  const preferenceKey = 'siware-theme-preference';
  const root = document.documentElement;
  const themeIcon = '<svg class="theme-toggle-icon" viewBox="0 0 24 24" aria-hidden="true"><path class="theme-moon" d="M20 15.4A8.4 8.4 0 0 1 8.6 4 8.4 8.4 0 1 0 20 15.4Z" /><circle class="theme-sun" cx="12" cy="12" r="3.5" /><path class="theme-rays" d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" /></svg><span class="theme-toggle-label">Dark mode</span>';
  const ensureThemeIcons = () => document.querySelectorAll('[data-theme-toggle]').forEach(button => { button.innerHTML = themeIcon; });
  const readPreference = () => { try { return localStorage.getItem(preferenceKey) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } };
  const apply = (theme, persist = false) => {
    const dark = theme === 'dark';
    root.classList.toggle('dark', dark);
    root.dataset.theme = theme;
    root.style.colorScheme = dark ? 'dark' : 'light';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Enable light mode' : 'Enable dark mode');
      button.title = dark ? 'Enable light mode' : 'Enable dark mode';
      const label = button.querySelector('.theme-toggle-label');
      if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';
    });
    if (persist) { try { localStorage.setItem(preferenceKey, theme); } catch {} }
  };
  apply(readPreference());
  document.addEventListener('DOMContentLoaded', () => {
    ensureThemeIcons();
    apply(readPreference());
    document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => apply(root.classList.contains('dark') ? 'light' : 'dark', true)));
  });
  window.addEventListener('storage', event => {
    if (event.key === preferenceKey) apply(readPreference());
  });
})();
