import { createHash } from 'node:crypto';

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const addresses = value => [...new Set(String(value || '').match(emailPattern)?.map(email => email.toLowerCase()) || [])];
const header = (message, name) => (message?.payload?.headers || []).find(item => String(item.name).toLowerCase() === name.toLowerCase())?.value || '';
const decodeBody = data => data ? Buffer.from(data, 'base64url').toString('utf8') : '';

function findPart(part, type) {
  if (!part) return null;
  if (part.mimeType === type && part.body?.data) return part;
  for (const child of part.parts || []) {
    const found = findPart(child, type);
    if (found) return found;
  }
  return null;
}
function mimeText(part) {
  const plain = findPart(part, 'text/plain');
  if (plain) return decodeBody(plain.body.data);
  const html = findPart(part, 'text/html');
  if (html) {
    return decodeBody(html.body.data)
      .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/\s*(?:script|style)\s*>/gi, '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
  }
  return '';
}
const hasAttachments = part => Boolean(part?.filename || (part?.body?.attachmentId && !String(part.mimeType || '').startsWith('text/')) || (part?.parts || []).some(hasAttachments));

function mimeHeader(value) {
  return String(value || '').replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_, charset, encoding, content) => {
    try {
      const bytes = encoding.toLowerCase() === 'b' ? Buffer.from(content, 'base64') : Buffer.from(content.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))), 'latin1');
      return new TextDecoder(charset).decode(bytes);
    } catch { return ''; }
  });
}

export function importedGroupAnnouncements(message, approvedGroups, mailbox, startedAt) {
  const receivedAt = new Date(Number(message?.internalDate));
  if (!message?.id || Number.isNaN(receivedAt.valueOf()) || receivedAt.valueOf() < Date.parse(startedAt || '')) return [];
  const sender = addresses(header(message, 'From'))[0];
  if (!sender || sender === mailbox.toLowerCase()) return [];
  const recipients = new Set([...addresses(header(message, 'To')), ...addresses(header(message, 'Cc')), ...addresses(header(message, 'X-Original-To'))]);
  const groups = approvedGroups.filter(group => recipients.has(group.toLowerCase()));
  if (!groups.length) return [];
  const title = mimeHeader(header(message, 'Subject')).replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 180) || 'Email update';
  const body = mimeText(message.payload).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, 20_000) || String(message.snippet || '').trim().slice(0, 500);
  return groups.map(group => ({
    id:`group-email-${createHash('sha256').update(`${group}\0${message.id}`).digest('hex').slice(0, 24)}`,
    title,
    body,
    tag:'Email update',
    department:'All departments',
    audience:group,
    hidden:true,
    date:receivedAt.toISOString(),
    postedBy:'Sent from Email Account',
    source:{ type:'group-email', group, fromEmail:sender, receivedAt:receivedAt.toISOString(), messageId:String(message.id), hasAttachments:hasAttachments(message.payload) },
    notification:{ audienceGroup:group, inAppEnabled:true, inAppRecipients:[], emailEnabled:false, to:[group], cc:[], bcc:[], emailDeliveryState:'skipped', emailError:'Original email was already delivered to the Google Group.' }
  }));
}
