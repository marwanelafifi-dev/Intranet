import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../public/organization-chart.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/organization-chart.css', import.meta.url), 'utf8');
const profileScript = readFileSync(new URL('../public/member-profile.js', import.meta.url), 'utf8');
const presentationScript = readFileSync(new URL('../public/employee-presentation.js', import.meta.url), 'utf8');

test('organization chart presents email, phone, and LinkedIn quick actions when available', () => {
  assert.match(script, /function quickActions\(member\)/);
  assert.match(script, /mailto:/);
  assert.match(script, /tel:/);
  assert.match(script, /linkedin/);
  assert.match(script, /org-chart-quick-actions/);
  assert.match(script, /org-chart-bio-action/);
  assert.match(script, /org-chart-report-control/);
  assert.match(script, /data-org-focus/);
  assert.match(script, /org-chart-report-grid/);
  assert.match(script, /org-chart-top-leadership/);
  assert.match(script, /Back to manager/);
  assert.doesNotMatch(script, /Individual contributor/);
  assert.match(script, /filterOrganizationChartMembers/);
  assert.match(styles, /\.org-chart-quick-actions a\{display:grid/);
  assert.match(styles, /\.org-chart-bio-action\{display:inline-flex/);
  assert.match(styles, /\.org-chart-canvas\{overflow:auto/);
  assert.match(styles, /\.org-chart-person-shell\{display:grid/);
});

test('organization chart keeps a consistent card footprint when profile details are missing', () => {
  assert.match(script, /organizationDescriptor/);
  assert.match(presentationScript, /Organization details not listed/);
  assert.match(styles, /\.org-chart-person-shell\{height:214px;grid-template-rows:minmax\(0,1fr\) 66px\}/);
  assert.match(styles, /\.org-chart-person\{min-height:0;grid-template-rows:37px minmax\(0,1fr\)\}/);
  assert.match(styles, /\.org-chart-person-shell footer\{min-height:66px;padding:5px 9px;grid-template-rows:26px 26px;gap:4px\}/);
  assert.match(styles, /\.org-chart-canvas\{min-height:0;padding-block:22px 24px\}/);
  assert.match(styles, /\.org-chart-explorer\{display:grid;gap:30px\}/);
  assert.match(styles, /\.org-chart-canvas\{overflow:visible\}/);
});

test('enabled professional biographies are rendered inside the colleague profile', () => {
  assert.match(profileScript, /member\.bioEnabled/);
  assert.match(profileScript, /Professional biography/);
  assert.match(profileScript, /member-profile-bio/);
});
