const text = value => String(value || '').trim();
const email = value => text(value).toLocaleLowerCase();

function monthDay(value) {
  const raw = text(value);
  const iso = raw.match(/^\d{4}-(\d{2})-(\d{2})$/);
  const flexible = raw.match(/^(?:\d{4}[/-])?(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?$/);
  const match = iso || flexible;
  if (!match) return '';
  const month = Number(match[1]), day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cairoCalendarDay(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Africa/Cairo', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(now instanceof Date ? now : new Date(now));
  const pick = type => parts.find(part => part.type === type)?.value || '';
  return { year:pick('year'), month:pick('month'), day:pick('day') };
}

function notificationId(dateKey, people) {
  const peopleKey = people.map(person => email(person.email || person.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).join('.');
  return `birthday-${dateKey}-${peopleKey || 'colleagues'}`;
}

export function birthdayNotificationFor(members, actorEmail, enabled, now = new Date()) {
  if (!enabled || !email(actorEmail)) return null;
  const { year, month, day } = cairoCalendarDay(now);
  const today = `${month}-${day}`;
  const birthdayPeople = (Array.isArray(members) ? members : [])
    .filter(member => monthDay(member?.birthday) === today)
    .map(member => ({ name:text(member?.name), email:text(member?.companyEmail) }))
    .filter(person => person.name && person.email)
    .sort((first, second) => first.name.localeCompare(second.name));
  if (!birthdayPeople.length || birthdayPeople.some(person => email(person.email) === email(actorEmail))) return null;
  const names = birthdayPeople.map(person => person.name);
  const peopleLabel = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
  const dateKey = `${year}-${month}-${day}`;
  return {
    id:notificationId(dateKey, birthdayPeople),
    type:'birthday',
    tag:'People moment',
    dateKey,
    title:names.length === 1 ? `It’s ${names[0]}'s birthday` : `Today we celebrate ${peopleLabel}`,
    body:names.length === 1 ? `Take a moment to send ${names[0]} your best wishes today.` : `Take a moment to send ${peopleLabel} your best wishes today.`,
    people:birthdayPeople
  };
}

export { monthDay as birthdayMonthDay };
