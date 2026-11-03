import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesMemberSearch } from '../public/team-directory-data.js';

test('Our Team search finds a colleague by full or partial company email and Sector', () => {
  const member = { name:'Ayman Ahmed', companyEmail:'ayman.ahmed@si-ware.com', role:'Engineer', sector:'Energy' };
  assert.equal(matchesMemberSearch(member, 'AYMAN.AHMED@SI-WARE.COM'), true);
  assert.equal(matchesMemberSearch(member, 'ahmed@si-ware'), true);
  assert.equal(matchesMemberSearch(member, 'energy'), true);
  assert.equal(matchesMemberSearch(member, 'unknown@si-ware.com'), false);
});
