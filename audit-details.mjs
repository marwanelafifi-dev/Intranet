const privateField = /password|secret|token|cookie|authorization|dataurl|base64/i;
const plainText = value => String(value)
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, entity => ({ '&nbsp;':' ', '&amp;':'&', '&lt;':'<', '&gt;':'>', '&quot;':'"', '&#39;':"'" }[entity.toLowerCase()] || ' '))
  .replace(/\s+/g, ' ').trim();

function preview(value, field = '') {
  if (value === undefined || value === null || value === '') return 'Empty';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.every(item => typeof item !== 'object')) return plainText(value.slice(0, 8).join(', ')).slice(0, 240) || 'Empty';
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (typeof value === 'object') return `${Object.keys(value).length} fields`;
  const raw = String(value);
  if (/^data:/i.test(raw)) return '[embedded media]';
  if (/(url|href|src|link)$/i.test(field)) return raw.split(/[?#]/)[0].slice(0, 240);
  const text = plainText(raw);
  const imageCount = (raw.match(/<img\b/gi) || []).length;
  const summary = [text, imageCount ? `${imageCount} image${imageCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  return summary.length > 240 ? `${summary.slice(0, 237)}… (${summary.length} characters)` : summary || 'Empty';
}

const recordKey = (record, index) => String(record?.id ?? record?.email ?? record?.key ?? `index-${index}`);
const recordName = (record, key) => preview(record?.title || record?.name || record?.label || record?.email || record?.text || record?.id || key).slice(0, 100);

export function describeContentChanges(previous, next, changedKeys, limit = 20) {
  const details = [];
  let truncated = false;
  const add = (section, record, change, field, before, after) => {
    if (details.length >= limit) { truncated = true; return; }
    const beforePreview = preview(before, field), afterPreview = preview(after, field);
    const formattingOnly = beforePreview === afterPreview && typeof before === 'string' && typeof after === 'string' && /<[^>]+>/.test(before + after);
    details.push({ section, record, change, field, before:beforePreview, after:formattingOnly ? `${afterPreview} (formatting or media changed)` : afterPreview });
  };
  const compare = (section, record, before, after, change = 'updated', path = '', depth = 0) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const beforeObject = before && typeof before === 'object' && !Array.isArray(before);
    const afterObject = after && typeof after === 'object' && !Array.isArray(after);
    if ((beforeObject || before == null) && (afterObject || after == null) && (beforeObject || afterObject) && depth < 3) {
      for (const field of new Set([...Object.keys(beforeObject ? before : {}), ...Object.keys(afterObject ? after : {})])) {
        if (privateField.test(field) || field === 'id') continue;
        compare(section, record, beforeObject ? before[field] : undefined, afterObject ? after[field] : undefined, change, path ? `${path}.${field}` : field, depth + 1);
      }
      return;
    }
    add(section, record, change, path || section, before, after);
  };
  for (const section of changedKeys) {
    const before = previous[section], after = next[section];
    if (Array.isArray(before) && Array.isArray(after) && [...before, ...after].every(item => item && typeof item === 'object' && !Array.isArray(item))) {
      const oldRecords = new Map(before.map((record, index) => [recordKey(record, index), record]));
      const newRecords = new Map(after.map((record, index) => [recordKey(record, index), record]));
      for (const key of new Set([...oldRecords.keys(), ...newRecords.keys()])) {
        const oldRecord = oldRecords.get(key), newRecord = newRecords.get(key);
        compare(section, recordName(newRecord || oldRecord, key), oldRecord || {}, newRecord || {}, !oldRecord ? 'added' : !newRecord ? 'removed' : 'updated');
      }
    } else {
      compare(section, section, before, after);
    }
  }
  return { details, truncated };
}
