const transliteration = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',
  к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',
  х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'
};
const loginAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const passwordGroups = ['abcdefghjkmnpqrstuvwxyz','ABCDEFGHJKMNPQRSTUVWXYZ','23456789','!@#$%&*+-=?'];

/** Rejection sampling avoids the bias of taking a random integer modulo size. */
function randomIndex(size) {
  const limit = Math.floor(0x100000000 / size) * size;
  const sample = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(sample); } while (sample[0] >= limit);
  return sample[0] % size;
}

function randomText(alphabet,length) {
  return Array.from({length},() => alphabet[randomIndex(alphabet.length)]).join('');
}

function latin(part) {
  return Array.from(part.toLowerCase(),letter => transliteration[letter] ?? letter).join('').replace(/[^a-z]/g,'');
}

export function generateLogin(fullName,existingLogins = []) {
  const name = String(fullName ?? '').trim();
  if (!name) return '';
  const parts = name.split(/\s+/u).map(latin);
  let prefix;
  if (parts.length >= 3) prefix = parts.at(-1).slice(0,4) + parts[1].slice(0,1) + parts[0].slice(0,1);
  else if (parts.length === 2) prefix = parts[0].slice(0,4) + parts[1].slice(0,1);
  else prefix = parts[0].slice(0,6);
  prefix ||= 'user';
  const occupied = new Set(existingLogins.map(value => String(value).trim().toLowerCase()));
  for (let attempt = 0; attempt < 48; attempt++) {
    const candidate = prefix + randomText(loginAlphabet,4 + Math.floor(attempt / 8));
    if (!occupied.has(candidate)) return candidate;
  }
  throw Error('Не удалось подобрать свободный логин. Повторите генерацию.');
}

export function generatePassword() {
  const alphabet = passwordGroups.join('');
  const characters = passwordGroups.map(group => group[randomIndex(group.length)]);
  while (characters.length < 16) characters.push(alphabet[randomIndex(alphabet.length)]);
  for (let index = characters.length - 1; index > 0; index--) {
    const other = randomIndex(index + 1);
    [characters[index],characters[other]] = [characters[other],characters[index]];
  }
  return characters.join('');
}
