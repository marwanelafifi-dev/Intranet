import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const profileSource = readFileSync(new URL('../public/member-profile.js', import.meta.url), 'utf8');
const profileStyles = readFileSync(new URL('../public/member-profile.css', import.meta.url), 'utf8');

test('clicked colleague profile facts use the requested order and manager full row', () => {
  const employeeId = profileSource.indexOf("detail('Employee ID'");
  const employmentType = profileSource.indexOf("detail('Employment type'");
  const sector = profileSource.indexOf("detail('Sector'");
  const department = profileSource.indexOf("detail('Department'");
  const manager = profileSource.indexOf("detail('Direct manager', manager?.name, true, manager?.email)");
  const organizationUnit = profileSource.indexOf("detail('Organization unit'");
  const joined = profileSource.indexOf("detail('Joined'");

  assert.ok(employeeId < employmentType && employmentType < sector && sector < department);
  assert.ok(department < manager && manager < organizationUnit && organizationUnit < joined);
  assert.match(profileSource, /function directManagerDetails\(member, directory = \[\]\)/);
  assert.match(profileSource, /candidate\.companyEmail/);
  assert.match(profileStyles, /\.member-profile-facts \.member-profile-fact--full\{grid-column:1\/-1\}/);
  assert.match(profileStyles, /\.member-profile-facts dd small\{display:block/);
});
