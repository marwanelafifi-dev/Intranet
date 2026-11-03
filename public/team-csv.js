export function csvKey(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

export function csvValue(row, columns, aliases) {
  const index = aliases.map(alias => columns.get(csvKey(alias))).find(value => value !== undefined);
  return index === undefined ? '' : String(row[index] || '').trim();
}

export function hasMemberIdentifierColumn(columns) {
  return ['companyemail', 'workemail', 'email', 'employeeid', 'employeenumber', 'employeecode'].some(key => columns.has(key));
}

export function safeLinkedInUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return /(^|\.)linkedin\.com$/i.test(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function findExistingCsvMember(members, { email = '', employeeId = '' }, index) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedId = String(employeeId).trim().toLowerCase();
  if (!normalizedEmail && !normalizedId) throw new Error(`Row ${index + 2} needs a Company Email or Employee ID to identify the colleague.`);
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error(`Row ${index + 2} has an invalid Company Email.`);
  const byEmail = normalizedEmail ? members.filter(member => String(member.companyEmail || '').trim().toLowerCase() === normalizedEmail) : [];
  const byId = normalizedId ? members.filter(member => String(member.employeeId || '').trim().toLowerCase() === normalizedId) : [];
  if (byEmail.length > 1 || byId.length > 1) throw new Error(`Row ${index + 2} matches more than one colleague. Correct the duplicate Company Email or Employee ID before importing.`);
  if (byEmail[0] && byId[0] && byEmail[0] !== byId[0]) throw new Error(`Row ${index + 2} has a Company Email and Employee ID belonging to different colleagues.`);
  return byEmail[0] || byId[0];
}

export function csvMemberRecord(row, columns, existing, index) {
  const aliases = {
    name:['name', 'full name', 'employee name'], role:['role', 'job title', 'title'],
    employmentType:['employment type', 'employment', 'type'], department:['department'],
    sector:['sector'], division:['division'], directManager:['direct manager', 'manager'],
    employeeId:['employee id', 'employee number', 'employee code'], joined:['joined', 'join date', 'start date'],
    companyEmail:['company email', 'work email', 'email'], phone:['phone', 'phone number', 'mobile'],
    linkedinUrl:['linkedin url', 'linkedin', 'linkedin profile'], message:['welcome message', 'message', 'intro'],
    photoUrl:['photo url', 'photo', 'image url'], photoFilename:['photo filename', 'image filename']
  };
  const values = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, csvValue(row, columns, names)]));
  if (!values.name && !existing?.name) throw new Error(`Row ${index + 2} did not match an existing colleague. Add a Name to create a new record, or correct the Company Email or Employee ID.`);
  if (values.linkedinUrl) {
    values.linkedinUrl = safeLinkedInUrl(values.linkedinUrl);
    if (values.linkedinUrl === null) throw new Error(`Row ${index + 2} has an invalid LinkedIn URL.`);
  }
  const record = { ...(existing || { id:`member-${Date.now()}-${index}`, color:'#dceeff' }) };
  for (const [field, value] of Object.entries(values)) {
    if (!value) continue;
    if (field === 'companyEmail' && existing && String(existing.companyEmail || '').toLowerCase() === value.toLowerCase()) continue;
    if (field === 'employeeId' && existing && String(existing.employeeId || '').trim().toLowerCase() === value.toLowerCase()) continue;
    record[field] = value;
  }
  if (values.name || !existing) record.initials = record.name.split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase();
  if (values.department || !existing) record.team = record.department || 'To be confirmed';
  if (!existing) Object.assign(record, {
    role:record.role || 'To be confirmed', employmentType:record.employmentType || 'Full Time',
    department:record.department || 'To be confirmed', sector:record.sector || '',
    division:record.division || 'To be confirmed', directManager:record.directManager || 'To be confirmed',
    employeeId:record.employeeId || '', joined:record.joined || 'To be confirmed',
    companyEmail:record.companyEmail || '', phone:record.phone || '', linkedinUrl:record.linkedinUrl || '',
    message:record.message || '', photoUrl:record.photoUrl || '', photoFilename:record.photoFilename || ''
  });
  return record;
}
