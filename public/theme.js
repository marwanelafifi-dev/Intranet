(() => {
  const preferenceKey = 'siware-theme-preference';
  const root = document.documentElement;
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
    apply(readPreference());
    document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => apply(root.classList.contains('dark') ? 'light' : 'dark', true)));
  });
})();
