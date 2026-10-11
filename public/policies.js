const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const displayDate = value => new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
async function showPolicyRegister() {
  try {
    const response = await fetch('/api/dashboard');
    if (!response.ok) throw new Error('Policy register is unavailable');
    const { policies = [], newMembers = [] } = await response.json();
    const announcements = document.querySelector('#all-new-members');
    if (announcements) announcements.innerHTML = newMembers.length ? newMembers.map(member => `<article class="new-member-announcement">${member.photoUrl ? `<img class="new-member-avatar new-member-photo" src="${escapeHtml(member.photoUrl)}" alt="Photo of ${escapeHtml(member.name)}" />` : `<span class="new-member-avatar" style="--member-color:${escapeHtml(member.color || '#e7f0ff')}">${escapeHtml(member.initials || member.name.split(' ').map(part => part[0]).join('').slice(0, 2))}</span>`}<div><div class="new-member-announcement-head"><div><b>${escapeHtml(member.name)}</b><span>${escapeHtml(member.role)} · ${escapeHtml(member.team)}</span></div><time>Recently joined · ${escapeHtml(member.joined)}</time></div><p>${escapeHtml(member.message)}</p><span class="new-member-manager">Direct Manager: ${escapeHtml(member.directManager || 'To be confirmed')}</span></div></article>`).join('') : '<p class="empty-state">No new member announcements are available right now.</p>';
    if (!policies.length) return;
    document.querySelectorAll('#policies .policy-link-card').forEach((card, index) => {
      const policy = policies[index];
      if (policy) card.href = policy.canonicalUrl;
    });
    const register = `<article class="policy-card policy-register" id="policy-register"><div class="policy-register-head"><div><h2>Policy register</h2><p>Every policy has one official location and a named owner. Use this register to confirm you have the current version.</p></div><span class="policy-status">${policies.length} current policies</span></div><div class="policy-register-list">${policies.map(policy => `<a class="policy-record" href="${escapeHtml(policy.canonicalUrl)}"><span class="policy-record-main"><b>${escapeHtml(policy.title)}</b><small>${escapeHtml(policy.summary)}</small></span><span class="policy-record-meta"><span><i>Owner</i>${escapeHtml(policy.owner)}</span><span><i>Audience</i>${escapeHtml(policy.audience)}</span><span><i>Version</i>${escapeHtml(policy.version)}</span><span><i>Review</i>${displayDate(policy.reviewDate)}</span></span><span class="policy-record-link">Open policy</span></a>`).join('')}</div></article>`;
    document.querySelector('#policies').insertAdjacentHTML('afterend', register);
  } catch (error) {
    const note = document.createElement('p'); note.className = 'policy-register-error'; note.textContent = 'The policy register could not be loaded. Please try again or contact People Operations.';
    document.querySelector('#policies').append(note);
  }
}
showPolicyRegister();
