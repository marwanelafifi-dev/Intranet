import assert from 'node:assert/strict';
import test from 'node:test';
import { csvKey, csvMemberRecord, findExistingCsvMember } from '../public/team-csv.js';

test('Sector-only CSV update matches by email and preserves the rest of the colleague record', () => {
  const existing = {
    id:'google-member-1', name:'Ayman Ahmed', companyEmail:'ayman.ahmed@si-ware.com',
    role:'Engineer', department:'Research', division:'Legacy division', team:'Specialist team',
    profilePhotoUrl:'/uploads/ayman.jpg', linkedinUrl:'https://www.linkedin.com/in/ayman/',
    intranetOverrides:{ profilePhotoUrl:true }, googleUserId:'google-1', initials:'AA'
  };
  const columns = new Map(['Company Email', 'Sector'].map((heading, index) => [csvKey(heading), index]));
  const row = ['AYMAN.AHMED@si-ware.com', 'Energy'];
  const matched = findExistingCsvMember([existing], row[0].toLowerCase(), '');
  assert.equal(matched, existing);
  assert.deepEqual(csvMemberRecord(row, columns, matched, 0), { ...existing, sector:'Energy' });
});

test('a supplied email does not match a different colleague with the same name', () => {
  const colleague = { name:'Alex Smith', companyEmail:'alex.one@si-ware.com' };
  assert.equal(findExistingCsvMember([colleague], 'alex.two@si-ware.com', 'alex smith'), undefined);
});

test('new colleagues require a Name and start with an empty Sector', () => {
  const columns = new Map(['Name', 'Company Email'].map((heading, index) => [csvKey(heading), index]));
  assert.throws(() => csvMemberRecord(['', 'new@si-ware.com'], columns, undefined, 0), /needs a Name/);
  const created = csvMemberRecord(['New Colleague', 'new@si-ware.com'], columns, undefined, 0);
  assert.equal(created.sector, '');
  assert.equal(created.companyEmail, 'new@si-ware.com');
});
