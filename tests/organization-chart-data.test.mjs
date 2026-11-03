import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrganizationChart, filterOrganizationChartMembers, visibleOrganizationNodeIds } from '../public/organization-chart-data.js';

const members = [
  { id:'amr', name:'Amr Mosallamy', companyEmail:'amr.mosallamy@si-ware.com' },
  { id:'sara', name:'Sara Zayan', companyEmail:'sara.zayan@si-ware.com', directManager:'amr.mosallamy@si-ware.com', role:'Engineer' },
  { id:'mohan', name:'Mohan Ogun', companyEmail:'mohan.ogun@si-ware.com', directManager:'sara.zayan@si-ware.com' },
  { id:'outside', name:'Independent colleague', companyEmail:'independent@si-ware.com', directManager:'outside-directory@si-ware.com' }
];

test('organization chart nests colleagues beneath their direct manager email', () => {
  const roots = buildOrganizationChart(members);
  assert.deepEqual(roots.map(node => node.member.name), ['Amr Mosallamy', 'Independent colleague']);
  assert.equal(roots[0].children[0].member.name, 'Sara Zayan');
  assert.equal(roots[0].children[0].children[0].member.name, 'Mohan Ogun');
});

test('organization chart search keeps matches, their managers, and direct reports visible', () => {
  const roots = buildOrganizationChart(members);
  const visible = visibleOrganizationNodeIds(roots, 'Sara');
  assert.deepEqual([...visible].sort(), ['amr', 'mohan', 'sara']);
});

test('organization chart can be limited to selected Organization Units without changing the directory', () => {
  const directory = [
    { id:'engineering', name:'Engineering colleague', organizationUnit:'/Egypt/Engineering' },
    { id:'intern', name:'Intern colleague', organizationUnit:'/Egypt/Interns' },
    { id:'unassigned', name:'Unassigned colleague', organizationUnit:'' }
  ];
  assert.deepEqual(filterOrganizationChartMembers(directory, ['/Egypt/Engineering']).map(member => member.id), ['engineering']);
  assert.equal(filterOrganizationChartMembers(directory).length, 3);
});
