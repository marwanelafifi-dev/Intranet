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
    sector:['sector'], employeeGrade:['employee grade', 'grade'], birthday:['birthday', 'birth date', 'birthdate'], directManager:['direct manager', 'manager'],
    employeeId:['employee id', 'employee number', 'employee code'], joined:['joined', 'join date', 'start date'],
    companyEmail:['company email', 'work email', 'email'], phone:['phone', 'phone number', 'mobile'],
    linkedinUrl:['linkedin url', 'linkedin', 'linkedin profile'], message:['welcome message', 'message', 'intro'],
    bioEnabled:['biography enabled', 'bio enabled', 'show bio'], bio:['biography', 'bio', 'professional biography'],
    photoUrl:['photo url', 'photo', 'image url'], photoFilename:['photo filename', 'image filename']
  };
  const values = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, csvValue(row, columns, names)]));
  if (!values.name && !existing?.name) throw new Error(`Row ${index + 2} did not match an existing colleague. Add a Name to create a new record, or correct the Company Email or Employee ID.`);
  if (values.linkedinUrl) {
    values.linkedinUrl = safeLinkedInUrl(values.linkedinUrl);
    if (values.linkedinUrl === null) throw new Error(`Row ${index + 2} has an invalid LinkedIn URL.`);
  }
  if (values.bioEnabled) {
    const enabled = String(values.bioEnabled).trim().toLowerCase();
    if (['true', 'yes', '1'].includes(enabled)) values.bioEnabled = true;
    else if (['false', 'no', '0'].includes(enabled)) values.bioEnabled = false;
    else throw new Error(`Row ${index + 2} Biography Enabled must be Yes or No.`);
  }
  if (values.bio.length > 6000) throw new Error(`Row ${index + 2} Biography must be 6,000 characters or fewer.`);
  const record = { ...(existing || { id:`member-${Date.now()}-${index}`, color:'#dceeff' }) };
  for (const [field, value] of Object.entries(values)) {
    if (!value) continue;
    if (field === 'companyEmail' && existing && String(existing.companyEmail || '').toLowerCase() === value.toLowerCase()) continue;
    if (field === 'employeeId' && existing && String(existing.employeeId || '').trim().toLowerCase() === value.toLowerCase()) continue;
    record[field] = value;
  }
  if (values.bioEnabled !== '') record.bioEnabled = values.bioEnabled;
  if (values.name || !existing) record.initials = record.name.split(/\s+/).map(part => part[0]).join('').slice(0,2).toUpperCase();
  if (values.department || !existing) record.team = record.department || 'To be confirmed';
  if (!existing) Object.assign(record, {
    role:record.role || 'To be confirmed', employmentType:record.employmentType || 'Full Time',
    department:record.department || 'To be confirmed', sector:record.sector || '',
    employeeGrade:record.employeeGrade || '', birthday:record.birthday || '', directManager:record.directManager || 'To be confirmed',
    employeeId:record.employeeId || '', joined:record.joined || 'To be confirmed',
    companyEmail:record.companyEmail || '', phone:record.phone || '', linkedinUrl:record.linkedinUrl || '',
    message:record.message || '', bio:record.bio || '', bioEnabled:record.bioEnabled === true,
    photoUrl:record.photoUrl || '', photoFilename:record.photoFilename || ''
  });
  return record;
}

export function planMemberCsvImport(rows, members) {
  if (rows.length < 2) throw new Error('The CSV needs a header row and at least one employee.');
  if (rows.length > 501) throw new Error('Import up to 500 employees at a time.');
  const columns = new Map(rows[0].map((header, index) => [csvKey(header), index]));
  if (!hasMemberIdentifierColumn(columns)) throw new Error('The CSV must include Company Email or Employee ID to identify colleagues.');
  const known = members.map(member => ({ ...member })), originalCount = known.length, created = [], unmatched = [], rowLog = [];
  let updated = 0;
  rows.slice(1).forEach((row, index) => {
    const email = csvValue(row, columns, ['company email', 'work email', 'email']);
    const employeeId = csvValue(row, columns, ['employee id', 'employee number', 'employee code']);
    const rowNumber = index + 2;
    let existing;
    try { existing = findExistingCsvMember(known, { email, employeeId }, index); }
    catch (error) {
      rowLog.push({ row:rowNumber, companyEmail:email, employeeId, outcome:'Not imported', detail:error.message });
      return;
    }
    if (!existing && !csvValue(row, columns, ['name', 'full name', 'employee name'])) {
      const detail = 'No matching colleague was found. No directory card was created.';
      unmatched.push({ row:rowNumber, identifier:email || employeeId });
      rowLog.push({ row:rowNumber, companyEmail:email, employeeId, outcome:'Not imported', detail });
      return;
    }
    try {
      const member = csvMemberRecord(row, columns, existing, index);
      if (existing) {
        Object.assign(existing, member); updated += 1;
        rowLog.push({ row:rowNumber, companyEmail:email || existing.companyEmail || '', employeeId:employeeId || existing.employeeId || '', outcome:'Updated', detail:'Existing colleague matched.' });
      } else {
        known.push(member); created.push(member);
        rowLog.push({ row:rowNumber, companyEmail:email || member.companyEmail || '', employeeId:employeeId || member.employeeId || '', outcome:'Added', detail:'New colleague created.' });
      }
    } catch (error) {
      rowLog.push({ row:rowNumber, companyEmail:email, employeeId, outcome:'Not imported', detail:error.message });
    }
  });
  return { members:[...created, ...known.slice(0, originalCount)], created:created.length, updated, unmatched, rowLog };
}
