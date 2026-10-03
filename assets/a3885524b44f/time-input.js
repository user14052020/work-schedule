/** Format a manual 24-hour time without turning an unfinished entry into saved data. */
export function formatTimeInput(raw, caret = String(raw).length, deleting = false) {
  const original = String(raw);
  let value = original.trim().replace('.', ':');
  // Typing the separator explicitly must also work after the mask inserted it.
  if (/^\d{1,2}::\d{0,2}$/.test(value)) value = value.replace('::',':');
  if (/^\d{0,4}$/.test(value)) {
    if (/^[3-9]/.test(value) && value.length <= 3) value = `0${value}`;
    if (value.length > 2 || (value.length === 2 && !deleting)) value = `${value.slice(0,2)}:${value.slice(2)}`;
  } else if (/^\d{1,2}:\d{0,2}$/.test(value)) {
    const [hours, minutes] = value.split(':');
    value = `${hours.padStart(2,'0')}:${minutes}`;
  }
  // Keep the caret next to the same digit when a separator or leading zero is inserted.
  if (caret >= original.length) return {value, caret:value.length};
  let digits = original.slice(0,caret).replace(/\D/g,'').length;
  if (value.startsWith('0') && !original.startsWith('0') && value.replace(/\D/g,'').length > original.replace(/\D/g,'').length) digits++;
  let position = 0;
  while (position < value.length && digits > 0) {
    if (/\d/.test(value[position])) digits--;
    position++;
  }
  if (value[position] === ':') position++;
  return {value, caret:position};
}

/** Null means incomplete or invalid; an empty string is an intentional cleared cell. */
export function completeTime(value) {
  const formatted = formatTimeInput(value).value;
  return formatted === '' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(formatted) ? formatted : null;
}
