const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const initials = user => String(user.name || user.email || 'U').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const roleLabel = role => String(role || '').split('_').map(part => part[0] + part.slice(1).toLowerCase()).join(' ');
const dateLabel = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en', { dateStyle:'medium', timeStyle:'short', timeZone:'Africa/Cairo' }).format(date);
};
const icon = {
  download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3" /></svg>',
  import:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V4h9l5 5v11H5Zm9-16v5h5M12 17v-7m-3 3 3-3 3 3" /></svg>',
  add:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M18 10v8m-4-4h8"/></svg>',
  search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>',
  more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>'
};

export function mountUsersPage(root, directory, { onSave, onImport, onTemplate }) {
  const users = directory.users || [], roles = directory.roles || [];
  const activeCount = users.filter(user => user.active !== false).length;
  const sessionCount = users.filter(user => user.sessionActive && user.active !== false).length;
  const roleOptions = roles.map(role => `<option value="${escapeHtml(role.id)}">${escapeHtml(roleLabel(role.id))}</option>`).join('');
  root.innerHTML = `<div class="access-page-heading"><div><h1>Users</h1><p>Manage who can access the intranet and how they sign in.</p></div><div class="access-actions"><button class="action-button secondary" type="button" data-users-template>${icon.download} CSV template</button><label class="action-button secondary" for="users-csv-input">${icon.import} Import CSV</label><input id="users-csv-input" type="file" accept=".csv,text/csv" hidden /><button class="action-button primary" type="button" data-add-user>${icon.add} Add user</button></div></div>
    <div class="user-metrics" aria-label="User account summary"><article><span>Total users</span><b>${users.length}</b></article><article><span>Active</span><b>${activeCount}</b></article><article><span>Inactive</span><b>${users.length - activeCount}</b></article><article class="user-metric-online"><span><i></i>Active sessions</span><b>${sessionCount}</b></article><article><span>No session</span><b>${users.length - sessionCount}</b></article></div>
    <article class="users-workspace"><div class="users-workspace-head"><h2>All users <small>(${users.length})</small></h2><div class="users-filters"><label class="user-search"><span class="sr-only">Search users</span>${icon.search}<input id="users-search" type="search" placeholder="Search users..." autocomplete="off" /></label><label><span class="sr-only">Filter by role</span><select id="users-role-filter"><option value="">All roles</option>${roleOptions}</select></label><label><span class="sr-only">Filter by session</span><select id="users-session-filter"><option value="">All sessions</option><option value="active">Active session</option><option value="none">No session</option></select></label></div></div><div class="users-table-wrap"><table class="users-table"><thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Auth type</th><th scope="col">Status</th><th scope="col">Session</th><th scope="col">Intranet joined</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody id="users-table-body"></tbody></table></div></article>
    <dialog class="access-user-dialog" id="access-user-dialog"><form id="access-form" autocomplete="off"><div class="dialog-heading"><div><h2>Add user</h2><p data-user-dialog-description>Create an account or assign access to a Google Workspace identity.</p></div><button type="button" class="dialog-close" data-close-user-dialog aria-label="Close dialog">×</button></div><div class="form-grid"><label>Name<input name="name" maxlength="80" placeholder="Employee name" required autocomplete="name" /></label><label>Work email<input name="email" required type="email" placeholder="name@si-ware.com" autocomplete="email" /></label><label class="form-grid-full">Authentication type<select name="authType"><option value="local">Local account · password</option><option value="google">Google Workspace</option></select></label><label class="form-grid-full">Role<select name="role" required>${roleOptions}</select></label><div class="form-grid-full local-password-fields" data-local-password-fields><label data-password-label>Password<input name="password" type="password" autocomplete="new-password" minlength="15" maxlength="128" /></label><label>Confirm password<input name="passwordConfirm" type="password" autocomplete="new-password" minlength="15" maxlength="128" /></label><small>Use at least 15 characters. A passphrase or password manager is recommended.</small></div><label class="form-grid-full user-active-field"><input name="active" type="checkbox" value="true" checked /><span>Account active</span></label></div><p class="notice" data-user-auth-note>Local accounts sign in with their work email and password. Passwords cannot be viewed after saving.</p><p class="user-form-error" data-user-form-error role="alert" aria-live="polite"></p><div class="form-actions"><button class="action-button secondary" type="button" data-close-user-dialog>Cancel</button><button class="action-button primary" type="submit">Save user</button></div></form></dialog>`;

  if (users.some(user => user.source === 'environment')) {
    root.querySelector('.users-workspace').insertAdjacentHTML('beforeend', '<p class="users-managed-note">The local administrator is configured in the server environment. To change its email or password, update the server settings and restart the intranet.</p>');
  }

  const dialog = root.querySelector('#access-user-dialog'), form = root.querySelector('#access-form');
  const authType = form.elements.authType, passwordFields = root.querySelector('[data-local-password-fields]');
  const setPasswordVisibility = edit => {
    const local = authType.value === 'local';
    passwordFields.hidden = !local;
    form.elements.password.required = local && !edit;
    form.elements.passwordConfirm.required = local && !edit;
    form.querySelector('[data-password-label]').firstChild.textContent = edit ? 'New password (optional)' : 'Password';
    root.querySelector('[data-user-auth-note]').textContent = local
      ? edit ? 'Leave the password fields empty to keep the current password. Saving a new password signs out existing sessions.' : 'Local accounts sign in with their work email and password. Passwords cannot be viewed after saving.'
      : 'Google Workspace manages this account’s password. The intranet role takes effect at the next sign-in.';
  };
  const openDialog = user => {
    form.reset();
    form.elements.name.value = user?.name || '';
    form.elements.email.value = user?.email || '';
    form.elements.email.readOnly = Boolean(user);
    authType.value = user?.authType === 'local' ? 'local' : user ? 'google' : 'local';
    authType.disabled = Boolean(user);
    form.elements.role.value = user?.role || (roles.find(role => role.id === 'EMPLOYEE')?.id || roles[0]?.id || '');
    form.elements.active.checked = user?.active !== false;
    form.querySelector('h2').textContent = user ? 'Edit user' : 'Add user';
    form.querySelector('[data-user-dialog-description]').textContent = user ? 'Update access or reset a local account password.' : 'Create an account or assign access to a Google Workspace identity.';
    root.querySelector('[data-user-form-error]').textContent = '';
    setPasswordVisibility(Boolean(user));
    dialog.showModal();
    form.elements.name.focus();
  };
  authType.addEventListener('change', () => setPasswordVisibility(false));
  root.querySelector('[data-add-user]').addEventListener('click', () => openDialog(null));
  root.querySelectorAll('[data-close-user-dialog]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  form.addEventListener('submit', onSave);
  root.querySelector('[data-users-template]').addEventListener('click', onTemplate);
  root.querySelector('#users-csv-input').addEventListener('change', event => onImport(event.target.files[0]));

  const paint = () => {
    const search = root.querySelector('#users-search').value.trim().toLocaleLowerCase();
    const role = root.querySelector('#users-role-filter').value;
    const session = root.querySelector('#users-session-filter').value;
    const filtered = users.filter(user => (!role || user.role === role) && (!session || (session === 'active') === Boolean(user.sessionActive && user.active !== false)) && (!search || `${user.name || ''} ${user.email || ''} ${roleLabel(user.role)}`.toLocaleLowerCase().includes(search)));
    const tableBody = root.querySelector('#users-table-body');
    tableBody.innerHTML = filtered.map(user => { const userInitials = initials(user), avatar = user.avatarUrl ? `<img class="user-avatar user-avatar-photo" src="${escapeHtml(user.avatarUrl)}" alt="" data-user-initials="${escapeHtml(userInitials)}" />` : `<span class="user-avatar" aria-hidden="true">${escapeHtml(userInitials)}</span>`; return `<tr><td><span class="user-identity">${avatar}<span><b>${escapeHtml(user.name || user.email)}</b><small>${escapeHtml(user.email)}</small></span></span></td><td><span class="role-chip role-${escapeHtml(String(user.role || '').toLowerCase())}">${escapeHtml(roleLabel(user.role))}</span></td><td><span class="auth-chip auth-${user.authType === 'local' ? 'local' : 'google'}">${user.source === 'environment' ? 'Local / server' : user.authType === 'local' ? 'Local' : 'Google'}</span></td><td><span class="user-state ${user.active === false ? 'is-inactive' : 'is-active'}"><i></i>${user.active === false ? 'Inactive' : 'Active'}</span></td><td><span class="user-state ${user.sessionActive && user.active !== false ? 'is-active' : 'is-offline'}"><i></i>${user.sessionActive && user.active !== false ? 'Active session' : 'No session'}</span></td><td class="user-joined">${user.source === 'environment' ? 'Server-managed' : user.intranetJoinedAt ? escapeHtml(dateLabel(user.intranetJoinedAt)) : 'Not signed in yet'}</td><td>${user.source === 'environment' ? '<span class="user-readonly" title="Managed through server settings">Server-managed</span>' : `<button class="user-row-action" type="button" data-edit-user="${escapeHtml(user.email)}" aria-label="Edit ${escapeHtml(user.name || user.email)}" title="Edit user">${icon.more}</button>`}</td></tr>`; }).join('') || '<tr><td colspan="7" class="users-empty">No users match these filters. Try another search or filter.</td></tr>';
    tableBody.querySelectorAll('.user-avatar-photo').forEach(photo => photo.addEventListener('error', () => { const fallback = document.createElement('span'); fallback.className = 'user-avatar'; fallback.setAttribute('aria-hidden', 'true'); fallback.textContent = photo.dataset.userInitials || 'U'; photo.replaceWith(fallback); }, { once:true }));
  };
  paint();
  ['#users-search','#users-role-filter','#users-session-filter'].forEach(selector => root.querySelector(selector).addEventListener(selector === '#users-search' ? 'input' : 'change', paint));
  root.querySelector('#users-table-body').addEventListener('click', event => {
    const button = event.target.closest('[data-edit-user]');
    if (button) openDialog(users.find(user => user.email === button.dataset.editUser));
  });
}
