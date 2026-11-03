import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../public/recently-joined.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../public/recently-joined.css', import.meta.url), 'utf8');

test('directory cards put the resolved manager above their email and use the requested fact order', () => {
  assert.match(source, /function directManagerDetails\(member\)/);
  assert.match(source, /candidate\.companyEmail/);
  assert.match(source, /label:'Direct manager', value:manager\.name, email:manager\.email, fullWidth:true/);

  const manager = source.indexOf("label:'Direct manager'");
  const sector = source.indexOf("label:'Sector'");
  const department = source.indexOf("label:'Department'");
  const employment = source.indexOf("label:'Employment'");
  const joined = source.indexOf("label:'Joined'");
  assert.ok(manager < sector && sector < department && department < employment && employment < joined);
  assert.match(styles, /\.member-directory-facts \.member-directory-fact--manager\{grid-column:1\/-1\}/);
  assert.match(styles, /\.member-directory-facts dd small\{display:block/);
});
