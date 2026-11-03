import assert from 'node:assert/strict';
import test from 'node:test';
import { csvKey, csvMemberRecord, findExistingCsvMember, hasMemberIdentifierColumn, planMemberCsvImport } from '../public/team-csv.js';

test('bulk Sector import updates matching rows and reports missing colleagues without creating cards', () => {
  const original = [{ id:'active-1', name:'Active Colleague', companyEmail:'active@si-ware.com', sector:'', source:'google-directory' }];
  const result = planMemberCsvImport([
    ['Sector', 'Company Email'],
    ['Commercial', 'active@si-ware.com'],
    ['Commercial', 'former@si-ware.com']
  ], original);
  assert.equal(result.updated, 1);
  assert.equal(result.created, 0);
  assert.deepEqual(result.unmatched, [{ row:3, identifier:'former@si-ware.com' }]);
  assert.deepEqual(result.members, [{ ...original[0], sector:'Commercial' }]);
  assert.equal(original[0].sector, '');
});

test('a malformed row is written to the log while valid rows remain available to save', () => {
  const original = [{ id:'active-1', name:'Active Colleague', companyEmail:'active@si-ware.com', sector:'' }];
  const result = planMemberCsvImport([
    ['Sector', 'Company Email'],
    ['Commercial', 'active@si-ware.com'],
    ['Commercial', '']
  ], original);
  assert.equal(result.updated, 1);
  assert.deepEqual(result.rowLog, [
    { row:2, companyEmail:'active@si-ware.com', employeeId:'', outcome:'Updated', detail:'Existing colleague matched.' },
    { row:3, companyEmail:'', employeeId:'', outcome:'Not imported', detail:'Row 3 needs a Company Email or Employee ID to identify the colleague.' }
  ]);
  assert.equal(original[0].sector, '');
});

test('the row log contains every source row with an outcome', () => {
  const result = planMemberCsvImport([
    ['Name', 'Company Email', 'Sector'],
    ['Active Colleague', 'active@si-ware.com', 'Commercial'],
    ['New Colleague', 'new@si-ware.com', 'Research'],
    ['', 'missing@si-ware.com', 'Energy']
  ], [{ id:'active-1', name:'Active Colleague', companyEmail:'active@si-ware.com', sector:'' }]);
  assert.deepEqual(result.rowLog.map(item => [item.row, item.outcome]), [[2, 'Updated'], [3, 'Added'], [4, 'Not imported']]);
  assert.equal(result.rowLog.length, 3);
});

test('bulk import accepts a reduced template with either identifier column', () => {
  const columns = headings => new Map(headings.map((heading, index) => [csvKey(heading), index]));
  assert.equal(hasMemberIdentifierColumn(columns(['Name', 'Sector'])), false);
  assert.equal(hasMemberIdentifierColumn(columns(['Company Email', 'Sector'])), true);
  assert.equal(hasMemberIdentifierColumn(columns(['Employee ID', 'Sector'])), true);
});

test('Sector-only CSV update matches by email and preserves the rest of the colleague record', () => {
  const existing = {
    id:'google-member-1', name:'Ayman Ahmed', companyEmail:'ayman.ahmed@si-ware.com',
    role:'Engineer', department:'Research', division:'Legacy division', team:'Specialist team',
    profilePhotoUrl:'/uploads/ayman.jpg', linkedinUrl:'https://www.linkedin.com/in/ayman/',
    intranetOverrides:{ profilePhotoUrl:true }, googleUserId:'google-1', initials:'AA'
  };
  const columns = new Map(['Company Email', 'Sector'].map((heading, index) => [csvKey(heading), index]));
  const row = ['AYMAN.AHMED@si-ware.com', 'Energy'];
  const matched = findExistingCsvMember([existing], { email:row[0] }, 0);
  assert.equal(matched, existing);
  assert.deepEqual(csvMemberRecord(row, columns, matched, 0), { ...existing, sector:'Energy' });
});

test('Employee ID alone matches a colleague and can update Sector without changing other fields', () => {
  const existing = { id:'member-1', name:'Ayman Ahmed', employeeId:491, companyEmail:'ayman@si-ware.com', role:'Engineer', sector:'' };
  const columns = new Map(['Employee ID', 'Sector'].map((heading, index) => [csvKey(heading), index]));
  const row = ['491', 'Energy'];
  const matched = findExistingCsvMember([existing], { employeeId:row[0] }, 0);
  assert.equal(matched, existing);
  assert.deepEqual(csvMemberRecord(row, columns, matched, 0), { ...existing, sector:'Energy' });
});

test('Biography columns can publish or hide a professional biography without changing other profile fields', () => {
  const existing = { id:'member-3', name:'Executive', companyEmail:'executive@si-ware.com', role:'CEO', bio:'Existing biography', bioEnabled:true };
  const columns = new Map(['Company Email', 'Biography Enabled', 'Biography'].map((heading, index) => [csvKey(heading), index]));
  assert.deepEqual(csvMemberRecord(['executive@si-ware.com', 'No', ''], columns, existing, 0), { ...existing, bioEnabled:false });
  assert.deepEqual(csvMemberRecord(['executive@si-ware.com', 'Yes', 'Formal leadership biography'], columns, existing, 0), { ...existing, bioEnabled:true, bio:'Formal leadership biography' });
  assert.throws(() => csvMemberRecord(['executive@si-ware.com', 'Maybe', ''], columns, existing, 0), /Biography Enabled must be Yes or No/);
});

test('a sparse CSV can update another field while blank columns remain unchanged', () => {
  const existing = { id:'member-2', name:'Taylor Lee', employeeId:'492', role:'Engineer', department:'Research', sector:'Energy' };
  const columns = new Map(['Employee ID', 'Role', 'Department'].map((heading, index) => [csvKey(heading), index]));
  const row = ['492', 'Senior Engineer', ''];
  const matched = findExistingCsvMember([existing], { employeeId:row[0] }, 0);
  assert.deepEqual(csvMemberRecord(row, columns, matched, 0), { ...existing, role:'Senior Engineer' });
});

test('a supplied email does not match a different colleague with the same name', () => {
  const colleague = { name:'Alex Smith', companyEmail:'alex.one@si-ware.com' };
  assert.equal(findExistingCsvMember([colleague], { email:'alex.two@si-ware.com' }, 0), undefined);
});

test('missing identifiers and conflicting matches reject the whole row', () => {
  const members = [
    { name:'Alex Smith', companyEmail:'alex@si-ware.com', employeeId:'101' },
    { name:'Taylor Lee', companyEmail:'taylor@si-ware.com', employeeId:'102' }
  ];
  assert.throws(() => findExistingCsvMember(members, {}, 0), /needs a Company Email or Employee ID/);
  assert.throws(() => findExistingCsvMember(members, { email:'invalid-email' }, 0), /invalid Company Email/);
  assert.throws(() => findExistingCsvMember(members, { email:'alex@si-ware.com', employeeId:'102' }, 1), /different colleagues/);
  assert.equal(findExistingCsvMember(members, { email:'alex@si-ware.com', employeeId:'101' }, 2), members[0]);
});

test('duplicate Employee IDs are rejected instead of updating an arbitrary colleague', () => {
  const members = [{ employeeId:'491' }, { employeeId:'491' }];
  assert.throws(() => findExistingCsvMember(members, { employeeId:'491' }, 0), /more than one colleague/);
});

test('new colleagues require a Name and an identifier, and start with an empty Sector', () => {
  const columns = new Map(['Name', 'Company Email'].map((heading, index) => [csvKey(heading), index]));
  assert.equal(findExistingCsvMember([], { email:'new@si-ware.com' }, 0), undefined);
  assert.throws(() => csvMemberRecord(['', 'new@si-ware.com'], columns, undefined, 0), /Add a Name/);
  const created = csvMemberRecord(['New Colleague', 'new@si-ware.com'], columns, undefined, 0);
  assert.equal(created.sector, '');
  assert.equal(created.companyEmail, 'new@si-ware.com');
});
