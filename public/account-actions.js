export async function signOut(button, status) {
  if (button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Signing out…';
  if (status) { status.hidden = true; status.textContent = ''; }
  try {
    const response = await fetch('/auth/logout', { method:'POST', credentials:'same-origin', cache:'no-store' });
    if (!response.ok) throw new Error('Sign-out failed');
    location.replace('/login.html');
  } catch {
    button.disabled = false;
    button.textContent = label;
    if (status) {
      status.textContent = 'Could not sign out. Check your connection and try again.';
      status.hidden = false;
    }
  }
}
