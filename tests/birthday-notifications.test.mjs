import assert from 'node:assert/strict';
import test from 'node:test';
import { birthdayMonthDay, birthdayNotificationFor } from '../birthday-notifications.mjs';

test('normalises Google birthday values without exposing a birth year', () => {
  assert.equal(birthdayMonthDay('1989-05-14'), '05-14');
  assert.equal(birthdayMonthDay('05/14'), '05-14');
  assert.equal(birthdayMonthDay('not a date'), '');
});

test('sends one birthday celebration to colleagues but never to a celebrant', () => {
  const members = [
    { id:'a', name:'Amina Nader', companyEmail:'amina@si-ware.com', birthday:'1989-05-14' },
    { id:'b', name:'Bassem Ali', companyEmail:'bassem@si-ware.com', birthday:'05/14' },
    { id:'c', name:'Chris Doe', companyEmail:'chris@si-ware.com', birthday:'1981-01-01' }
  ];
  const notification = birthdayNotificationFor(members, 'chris@si-ware.com', true, new Date('2026-05-14T10:00:00.000Z'));
  assert.equal(notification.type, 'birthday');
  assert.equal(notification.people.length, 2);
  assert.equal(notification.people.some(person => 'birthday' in person), false);
  assert.match(notification.title, /Amina Nader/);
  assert.equal(birthdayNotificationFor(members, 'amina@si-ware.com', true, new Date('2026-05-14T10:00:00.000Z')), null);
  assert.equal(birthdayNotificationFor(members, 'chris@si-ware.com', false, new Date('2026-05-14T10:00:00.000Z')), null);
});
