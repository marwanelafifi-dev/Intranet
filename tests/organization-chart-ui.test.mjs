import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../public/organization-chart.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/organization-chart.css', import.meta.url), 'utf8');
const profileScript = readFileSync(new URL('../public/member-profile.js', import.meta.url), 'utf8');

test('organization chart presents email, phone, and LinkedIn quick actions when available', () => {
  assert.match(script, /function quickActions\(member\)/);
  assert.match(script, /mailto:/);
  assert.match(script, /tel:/);
  assert.match(script, /linkedin/);
  assert.match(script, /org-chart-quick-actions/);
  assert.match(script, /org-chart-bio-action/);
  assert.match(script, /org-chart-report-control/);
  assert.match(styles, /\.org-chart-quick-actions a\{display:grid/);
  assert.match(styles, /\.org-chart-bio-action\{display:inline-flex/);
  assert.match(styles, /\.org-chart-canvas\{overflow:auto/);
  assert.match(styles, /\.org-chart-person-shell\{display:grid/);
});

test('enabled professional biographies are rendered inside the colleague profile', () => {
  assert.match(profileScript, /member\.bioEnabled/);
  assert.match(profileScript, /Professional biography/);
  assert.match(profileScript, /member-profile-bio/);
});
