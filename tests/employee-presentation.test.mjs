import assert from 'node:assert/strict';
import test from 'node:test';
import { organizationDescriptor, visibleSector } from '../public/employee-presentation.js';

test('suppresses Sector only when it is the same as Department', () => {
  const duplicate = { sector:'Inertial Sensing Technology', department:' inertial   sensing technology ' };
  const distinct = { sector:'Support Functions', department:'People Team' };
  assert.equal(visibleSector(duplicate), '');
  assert.equal(organizationDescriptor(duplicate), 'inertial   sensing technology');
  assert.equal(visibleSector(distinct), 'Support Functions');
  assert.equal(organizationDescriptor(distinct), 'Support Functions · People Team');
});
