import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const script = readFileSync(new URL('../public/organization-chart.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/organization-chart.css', import.meta.url), 'utf8');

test('organization chart presents email, phone, and LinkedIn quick actions when available', () => {
  assert.match(script, /function quickActions\(member\)/);
  assert.match(script, /mailto:/);
  assert.match(script, /tel:/);
  assert.match(script, /linkedin/);
  assert.match(script, /org-chart-quick-actions/);
  assert.match(styles, /\.org-chart-quick-actions a\{display:grid/);
  assert.match(styles, /\.org-chart-person-shell\{display:flex/);
});
