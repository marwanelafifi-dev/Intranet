const homePaths = new Set(['/', '/index.html']);

if (homePaths.has(location.pathname)) {
  Promise.all([
    fetch('/api/auth/me', { credentials:'same-origin', cache:'no-store' }).then(response => response.ok ? response.json() : null),
    fetch('/api/dashboard', { credentials:'same-origin', cache:'no-store' }).then(response => response.ok ? response.json() : null)
  ]).then(([user, dashboard]) => {
    const email = String(user?.email || '').trim().toLowerCase();
    const member = dashboard?.newMembers?.find(item => String(item.companyEmail || '').trim().toLowerCase() === email);
    const needsLinkedIn = !String(member?.linkedinUrl || '').trim();
    const hasOriginalPhoto = Boolean(String(member?.profilePhotoUrl || '').trim());
    if (!member || (!needsLinkedIn && hasOriginalPhoto)) return;
    const header = document.querySelector('.topbar');
    if (!header) return;
    const hasGooglePhoto = Boolean(String(member.photoUrl || '').trim());
    const reminderCopy = needsLinkedIn && !hasOriginalPhoto
      ? { title:'Complete your profile', detail:'Add your LinkedIn profile and an original photo so colleagues can recognise and connect with you.' }
      : needsLinkedIn
        ? { title:'Add your LinkedIn profile', detail:'Help colleagues connect with you from your Our Team card.' }
        : hasGooglePhoto
          ? { title:'Upgrade your profile photo', detail:'Your Google Workspace photo is shown. Upload your original photo for a sharper Our Team profile.' }
          : { title:'Add your profile photo', detail:'Upload an original photo so colleagues can recognise you on Our Team.' };
    const reminder = document.createElement('aside');
    reminder.className = 'profile-completion-reminder';
    reminder.setAttribute('aria-label', 'Profile completion reminder');
    reminder.innerHTML = `<div><b>${reminderCopy.title}</b><span>${reminderCopy.detail}</span></div><a href="/profile.html?complete=profile">Update profile</a>`;
    header.classList.add('has-profile-completion');
    header.append(reminder);
  }).catch(() => {});
}
