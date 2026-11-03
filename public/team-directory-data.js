export function matchesMemberSearch(member, query) {
  const search = String(query || '').trim().toLocaleLowerCase();
  if (!search) return true;
  return [member.name, member.companyEmail, member.role, member.department, member.sector, member.directManager, member.team, member.organizationUnit]
    .some(value => String(value || '').toLocaleLowerCase().includes(search));
}
