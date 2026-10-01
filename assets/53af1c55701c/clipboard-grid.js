const MAX_HTML_ROWS = 2000;
const MAX_HTML_COLUMNS = 256;
const MAX_HTML_CELLS = 100000;

function quotedCell(text, start) {
  if (text[start] !== '"') return null;
  let value = '';
  for (let index = start + 1; index < text.length; index++) {
    const character = text[index];
    if (character !== '"') { value += character; continue; }
    if (text[index + 1] === '"') { value += '"'; index++; continue; }
    if (index + 1 === text.length || text[index + 1] === '\t' || text[index + 1] === '\n') return {value,end:index + 1};
    // Quotes in ordinary, unquoted prose are literal characters.
    return null;
  }
  return {malformed:true};
}

/** Spreadsheet TSV: newlines inside quoted cells do not start another work row. */
export function parseTabularText(raw) {
  const text = String(raw ?? '').replace(/\r\n?/g,'\n');
  const rows = [];
  let row = [];
  let index = 0;
  while (true) {
    const quoted = quotedCell(text,index);
    if (quoted?.malformed) throw Error('Не удалось разобрать скопированный диапазон: незакрытая кавычка. Скопируйте ячейки заново из таблицы.');
    if (quoted) { row.push(quoted.value); index = quoted.end; }
    else {
      const start = index;
      while (index < text.length && text[index] !== '\t' && text[index] !== '\n') index++;
      row.push(text.slice(start,index));
    }
    if (index === text.length) { rows.push(row); break; }
    const separator = text[index++];
    if (separator === '\n') {
      rows.push(row); row = [];
      // A final row separator ends the preceding row, rather than adding a new one.
      if (index === text.length) break;
    }
  }
  return rows;
}

function cellText(cell) {
  let value = '';
  let trailingBlockBreak = false;
  const blockTags = new Set(['P','DIV','LI','UL','OL','SECTION','ARTICLE','BLOCKQUOTE','PRE']);
  const ensureBreak = () => {
    if (value && !value.endsWith('\n')) { value += '\n'; trailingBlockBreak = true; }
  };
  const visit = node => {
    if (node.nodeType === 3) {
      const text = node.nodeValue.replace(/\r\n?/g,'\n');
      if (text) { value += text; trailingBlockBreak = false; }
      return;
    }
    if (node.nodeType !== 1 || ['SCRIPT','STYLE','TEMPLATE','NOSCRIPT','IFRAME','OBJECT'].includes(node.tagName)) return;
    if (node.tagName === 'BR') { value += '\n'; trailingBlockBreak = false; return; }
    const block = blockTags.has(node.tagName);
    if (block) ensureBreak();
    for (const child of node.childNodes) visit(child);
    if (block) ensureBreak();
  };
  for (const node of cell.childNodes) visit(node);
  const result = trailingBlockBreak ? value.slice(0,-1) : value;
  return result.trim() === '' ? '' : result;
}

function htmlGrid(html) {
  if (!html) return null;
  let container;
  if (globalThis.document?.createElement) {
    // Template content is inert: copied scripts, images and frames never enter the live document.
    const template = document.createElement('template');
    template.innerHTML = html;
    container = template.content;
  } else if (typeof DOMParser !== 'undefined') {
    container = new DOMParser().parseFromString(html,'text/html');
  } else return null;
  const table = container.querySelector('table');
  if (!table) return null;
  const sourceRows = [...table.querySelectorAll('tr')].filter(row => row.closest('table') === table);
  if (!sourceRows.length) return null;
  const tooLarge = () => { throw Error('Слишком большой диапазон для вставки. Скопируйте меньше строк или столбцов.'); };
  if (sourceRows.length > MAX_HTML_ROWS) tooLarge();
  const matrix = [];
  let width = 0;
  let cellCount = 0;
  let foundCell = false;
  const span = (cell,attribute,limit) => {
    const value = Number(cell.getAttribute(attribute) || 1);
    if (!Number.isInteger(value) || value < 1) return 1;
    if (value > limit) tooLarge();
    return value;
  };
  for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex++) {
    const row = matrix[rowIndex] ||= [];
    let columnIndex = 0;
    for (const cell of sourceRows[rowIndex].children) {
      if (!['TD','TH'].includes(cell.tagName)) continue;
      foundCell = true;
      while (row[columnIndex] !== undefined) columnIndex++;
      const rowSpan = span(cell,'rowspan',MAX_HTML_ROWS);
      const columnSpan = span(cell,'colspan',MAX_HTML_COLUMNS);
      if (rowIndex + rowSpan > MAX_HTML_ROWS || columnIndex + columnSpan > MAX_HTML_COLUMNS || cellCount + rowSpan * columnSpan > MAX_HTML_CELLS) tooLarge();
      cellCount += rowSpan * columnSpan;
      for (let vertical = 0; vertical < rowSpan; vertical++) {
        const target = matrix[rowIndex + vertical] ||= [];
        for (let horizontal = 0; horizontal < columnSpan; horizontal++) target[columnIndex + horizontal] = '';
      }
      row[columnIndex] = cellText(cell);
      columnIndex += columnSpan;
      width = Math.max(width,columnIndex);
    }
  }
  if (!foundCell) return null;
  if (matrix.length * width > MAX_HTML_CELLS) tooLarge();
  return Array.from({length:matrix.length},(_,row) => Array.from({length:width},(_,column) => matrix[row]?.[column] ?? ''));
}

/** Null leaves ordinary prose to native textarea paste, including its in-cell line breaks. */
export function readClipboardGrid({text = '',html = ''}, {splitPlainRows = false} = {}) {
  const normalized = String(text).replace(/\r\n?/g,'\n');
  // TSV is the spreadsheet's exact cell text; HTML may add indentation or nonbreaking-space placeholders.
  if (normalized.includes('\t')) return parseTabularText(normalized);
  const structured = htmlGrid(html);
  if (structured) return structured;
  if (splitPlainRows) return parseTabularText(normalized);
  const quoted = quotedCell(normalized,0);
  const spreadsheetQuoting = normalized.includes('\n') || (quoted?.end && normalized.slice(1,quoted.end - 1).includes('""'));
  if (quoted && !quoted.malformed && spreadsheetQuoting && (quoted.end === normalized.length || normalized.slice(quoted.end) === '\n')) return [[quoted.value]];
  return null;
}
