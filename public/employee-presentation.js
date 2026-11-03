const value = input => String(input || '').trim();
const comparable = input => value(input).normalize('NFKC').replace(/\s+/g, ' ').toLocaleLowerCase();

export function visibleSector(member = {}) {
  const sector = value(member.sector);
  const department = value(member.department || member.team);
  if (!sector || comparable(sector) === 'to be confirmed') return '';
  return department && comparable(department) !== 'to be confirmed' && comparable(sector) === comparable(department) ? '' : sector;
}

export function organizationDescriptor(member = {}) {
  return [visibleSector(member), value(member.department || member.team)]
    .filter(item => item && comparable(item) !== 'to be confirmed')
    .join(' · ') || 'Organization details not listed';
}
