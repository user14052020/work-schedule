// Browser counterpart of the production XLSX layout; only explicit formulas execute.
export const MONTHS = ['ЯНВАРЬ','ФЕВРАЛЬ','МАРТ','АПРЕЛЬ','МАЙ','ИЮНЬ','ИЮЛЬ','АВГУСТ','СЕНТЯБРЬ','ОКТЯБРЬ','НОЯБРЬ','ДЕКАБРЬ'];
export const column = index => {
  let name = '';
  for (index++; index > 0; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name;
  return name;
};
export const round = value => Math.round(value * 10000) / 10000;
export const numeric = value => typeof value === 'number' && Number.isFinite(value);
const color = value => ({argb:`FF${String(value || '#000000').replace('#','')}`});
export function excelStyle(definition = {}) {
  const result = {
    font:{name:definition.font || 'Arial',size:definition.size || 10,bold:!!definition.bold,italic:!!definition.italic,color:color(definition.color)},
    alignment:{vertical:definition.vertical === 'center' ? 'middle' : definition.vertical || 'top',wrapText:!!definition.wrap,textRotation:definition.rotation || 0},
  };
  if (definition.horizontal && definition.horizontal !== 'general') result.alignment.horizontal = definition.horizontal;
  if (definition.fill) result.fill = {type:'pattern',pattern:'solid',fgColor:color(definition.fill)};
  if (definition.border) result.border = Object.fromEntries(Object.entries(definition.border).map(([edge,value]) => [edge,{style:value.style,color:color(value.color)}]));
  if (typeof definition.numberFormat === 'string') result.numFmt = definition.numberFormat;
  else if (definition.numberFormat === 2) result.numFmt = '0.00';
  else if (definition.numberFormat === 4) result.numFmt = '#,##0.00';
  return result;
}
export class WorkbookLayout {
  constructor(workbook,template) { this.workbook = workbook; this.template = template; }
  sheet(name,kind) {
    const layout = this.template.sheets[kind], options = layout.options || {};
    const sheet = this.workbook.addWorksheet(name.slice(0,31),{
      properties:{defaultRowHeight:options.defaultRowHeight || 15.75,outlineLevelRow:1,outlineProperties:{summaryBelow:false,summaryRight:false}},
      views:[{showGridLines:options.showGridLines !== false,...(options.freeze === 'A2' ? {state:'frozen',ySplit:1} : {})}],
      pageSetup:{...options.pageSetup,margins:options.margins},
    });
    sheet.columns = layout.columns.map(entry => ({width:entry.width,outlineLevel:entry.outline || 0,hidden:!!entry.hidden}));
    return sheet;
  }
  style(kind,row,col,overrides = {}) {
    return excelStyle({...this.template.styles[this.template.sheets[kind].styleGrid[row - 1]?.[col - 1] ?? 259],...overrides});
  }
  write(sheet,row,col,value,style) {
    const cell = sheet.getCell(row,col);
    if (style) cell.style = structuredClone(style);
    cell.value = value ?? null;
    return cell;
  }
  prototype(sheet,row,source,kind = 'schedule') {
    const styles = this.template.sheets[kind].styleGrid[source - 1] || [];
    styles.forEach((id,index) => this.write(sheet,row,index + 1,null,excelStyle(this.template.styles[id])));
  }
  formula(cell,formula,value) { cell.value = {formula,result:value ?? ''}; }
  fill(cell,value) { if (/^#[0-9a-f]{6}$/i.test(value || '')) cell.fill = {type:'pattern',pattern:'solid',fgColor:color(value)}; }
  merge(sheet,range) { (sheet.pendingLayoutMerges ||= []).push(range); }
  finish(sheet) { for (const range of sheet.pendingLayoutMerges || []) sheet.mergeCellsWithoutStyle(range); delete sheet.pendingLayoutMerges; }
  annotated(cell,main = '',extra = '',ink) {
    cell.font = {...cell.font,color:color('#000000')};
    cell.value = extra ? {richText:[{text:main,font:{name:'Arial',size:7,color:color('#000000')}},{text:(main ? '\n' : '') + extra,font:{name:'Arial',size:7,color:color(ink)}}]} : main;
  }
}
export function textHeight(value,width,size = 7) {
  const capacity = Math.max(1,Math.floor((width * 7 - 5) / (size * 0.62)));
  return String(value ?? '').split(/\r\n|\r|\n/).reduce((sum,line) => sum + Math.max(1,Math.ceil([...line].length / capacity)),0) * size * 1.35 + 6;
}
