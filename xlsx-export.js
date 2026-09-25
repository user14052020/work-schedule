import { employeeName, employeeHours, participantAt, dayHours, dayPay, monthHours, typeTotals } from './model.js';

const COLORS = {
  month: 'FF9FC5E8', lead: 'FF93C47D', partner: 'FFB4A7D6', extra: 'FFF9CB9C',
  alternate: 'FFAFE9CA', hours: 'FFD9EAD3', white: 'FFFFFFFF', ink: 'FF253A2D',
  line: 'FFCDD8CF', muted: 'FF65776A', red: 'FFB4232D', blue: 'FF245DC1', header: 'FFEAF1EB'
};
const ROLE_COLORS = [COLORS.lead, COLORS.partner, COLORS.extra, COLORS.extra];
const ROLE_LABELS = ['БРИГАДИР', 'ОСН. НАПАРНИК', 'ДОП. №1 НАПАРНИК', 'ДОП. №2 НАПАРНИК'];
const SCHEDULE_HEADERS = ['СЧЁТ', 'ЗП ЗА СМЕНУ, ₽', 'ШТРАФЫ / ПРЕМИИ, ₽', 'ЧАСОВ ЗА СМЕНУ', '№ ОБЪЕКТА', 'ВИД', 'ЧАСОВ НА БРИГАДУ', 'ОБЪЕКТ', 'ТЕЛЕФОН РАБОТ', 'ПРИМЕЧАНИЯ ПО ОБЪЕКТУ', 'ТЗ НА РАБОТЫ', 'ПРИМЕЧАНИЯ ПО РАБОТАМ / ДОП. ТЗ', 'ТЕХБАЗА'];
const THIN_BORDER = { top: {style: 'thin', color: {argb: COLORS.line}}, left: {style: 'thin', color: {argb: COLORS.line}}, bottom: {style: 'thin', color: {argb: COLORS.line}}, right: {style: 'thin', color: {argb: COLORS.line}} };
const PAY_NOTE = 'Базовая зарплата предварительная. Доплаты бригадиру, правила обучения и распределение премий в демо не рассчитываются.';

function cellStyle(cell, options = {}) {
  cell.font = {name: 'Calibri', size: options.size || 10, color: {argb: options.color || COLORS.ink}, bold: Boolean(options.bold)};
  cell.alignment = {vertical: 'middle', horizontal: options.align || 'left', wrapText: true};
  cell.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: options.fill || COLORS.white}};
  cell.border = THIN_BORDER;
  if (options.numFmt) cell.numFmt = options.numFmt;
  return cell;
}

function write(sheet, row, column, value, options = {}) {
  const cell = cellStyle(sheet.getCell(row,column), options);
  // Plain strings stay strings, including leading '=', '+', '-' and '@'.
  // Formula values are never constructed from user input.
  cell.value = value === undefined ? null : value;
  return cell;
}

function merge(sheet, startRow, startColumn, endRow, endColumn, value, options = {}) {
  if (startRow !== endRow || startColumn !== endColumn) sheet.mergeCells(startRow,startColumn,endRow,endColumn);
  return write(sheet,startRow,startColumn,value,options);
}

function utcDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) throw Error('В графике найдена некорректная дата.');
  const date = new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));
  if (date.toISOString().slice(0,10) !== value) throw Error('В графике найдена некорректная дата.');
  return date;
}

function periodDate(state, fallbackDate) {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(state.period || '')) return utcDate(`${state.period}-01`);
  return state.days.length ? utcDate(state.days[0].date) : fallbackDate;
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roleValues(state, roster) {
  return [0,1,2].map(index=>employeeName(state,roster[index])).concat([3,4].map(index=>employeeName(state,roster[index])).filter(Boolean).join('\n'));
}

function roleStatuses(day) {
  return [0,1,2].map(index=>day.statuses[index] || '').concat([3,4].filter(index=>day.roster[index]).map(index=>day.statuses[index] || '—').join('\n'));
}

function estimatedHeight(values, widths, minimum = 30, maximum = 240) {
  let lines = 1;
  values.forEach((value,index)=>{
    const width = Math.max(6,(widths[index] || 18)-2);
    const count = String(value ?? '').split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/width)),0);
    lines = Math.max(lines,count);
  });
  return Math.min(maximum,Math.max(minimum,lines*13 + 10));
}

function baseSheet(workbook, name, widths, color = COLORS.month) {
  const sheet = workbook.addWorksheet(name, {properties: {tabColor: {argb: color}, defaultRowHeight: 22}, views: [{showGridLines: false}]});
  sheet.columns = widths.map(width=>({width}));
  sheet.pageSetup = {paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: {left: .25, right: .25, top: .35, bottom: .35, header: .15, footer: .15}};
  sheet.headerFooter.oddFooter = '&LГрафик бригады&C&P / &N';
  return sheet;
}

function addSchedule(workbook, state, exportedAt) {
  const widths = [5,10,17,17,17,21,10,14,16,12,12,11,12,31,27,41,49,39,33];
  const sheet = baseSheet(workbook,'Б1 + Бригадир + Осн Напарник',widths);
  sheet.views = [{state: 'frozen', xSplit: 2, ySplit: 2, topLeftCell: 'C3', activeCell: 'C3', showGridLines: false, zoomScale: 85}];
  sheet.properties.outlineLevelRow = 1;
  sheet.properties.outlineProperties = {summaryBelow: false, summaryRight: false};
  sheet.pageSetup.printTitlesRow = '1:2';
  const firstDate = periodDate(state, exportedAt);
  const month = new Intl.DateTimeFormat('ru-RU',{month:'long',timeZone:'UTC'}).format(firstDate).toLocaleUpperCase('ru-RU');
  const period = new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(firstDate);
  const headerStyle = {fill: COLORS.month, bold: true, align: 'center'};
  merge(sheet,1,1,2,2,month,headerStyle);
  ROLE_LABELS.forEach((label,index)=>write(sheet,1,index+3,label,{fill:ROLE_COLORS[index],bold:true,align:'center'}));
  roleValues(state,state.roster).forEach((name,index)=>write(sheet,2,index+3,name,{fill:ROLE_COLORS[index],align:'center'}));
  merge(sheet,1,7,2,9,'Бригада: часов за месяц',headerStyle);
  merge(sheet,1,10,2,10,numeric(monthHours(state)),{...headerStyle,size:13,numFmt:'0.00'});
  merge(sheet,1,11,1,19,`Б1 · ${period}`,{...headerStyle,size:14});
  const timestamp = new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(exportedAt);
  merge(sheet,2,11,2,19,`Снимок данных на ${timestamp}. Значения сохраняются без формул. ${PAY_NOTE}`,{fill:COLORS.month,size:10});
  sheet.getRow(1).height = 30;
  sheet.getRow(2).height = 43;
  let cursor = 3;
  const collapsed = new Set(state.collapsedDays || []);
  state.days.forEach((day,dayIndex)=>{
    const count = Math.max(1,day.rows.length);
    const dateRow = cursor, weekdayRow = cursor+1, rosterRow = cursor+2, statusRow = cursor+3;
    const firstJob = cursor+4, lastJob = firstJob+count-1;
    const dayFill = dayIndex%2 ? COLORS.alternate : COLORS.white;
    for (let row = dateRow; row <= lastJob; row++) for (let col = 1; col <= 19; col++) cellStyle(sheet.getCell(row,col),{fill:dayFill});
    const monthCell = merge(sheet,dateRow,1,lastJob,1,month,{fill:dayFill,align:'center',size:12});
    monthCell.alignment = {...monthCell.alignment,textRotation:90};
    write(sheet,dateRow,2,'ДАТА',{fill:dayFill,bold:true,align:'right',size:9});
    merge(sheet,dateRow,3,dateRow,6,utcDate(day.date),{fill:dayFill,bold:true,align:'center',numFmt:'dd.mm.yyyy'});
    merge(sheet,dateRow,7,dateRow,19,`Б1 · ${new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(utcDate(day.date))}`,{fill:dayFill,bold:true,size:11});
    write(sheet,weekdayRow,2,'ДЕНЬ',{bold:true,align:'right',size:9});
    merge(sheet,weekdayRow,3,weekdayRow,6,new Intl.DateTimeFormat('ru-RU',{weekday:'long',timeZone:'UTC'}).format(utcDate(day.date)).toLocaleUpperCase('ru-RU'),{bold:true,align:'center'});
    write(sheet,rosterRow,2,'СМЕНА',{bold:true,align:'right',size:9});
    roleValues(state,day.roster).forEach((name,index)=>write(sheet,rosterRow,index+3,name,{fill:ROLE_COLORS[index],align:'center'}));
    write(sheet,statusRow,2,'СТАТУС',{bold:true,align:'right',size:9});
    roleStatuses(day).forEach((status,index)=>write(sheet,statusRow,index+3,status,{bold:true,align:'center'}));
    SCHEDULE_HEADERS.forEach((label,index)=>merge(sheet,weekdayRow,index+7,statusRow,index+7,label,{fill:COLORS.header,bold:true,align:'center',size:9}));
    sheet.getRow(dateRow).height = 25;
    sheet.getRow(weekdayRow).height = 22;
    sheet.getRow(rosterRow).height = 34;
    sheet.getRow(statusRow).height = day.roster[4] ? 32 : 22;
    for (let index = 0; index < count; index++) {
      const job = day.rows[index] || {time:'',people:[null,null,null,null,null],invoice:'',type:'',hours:null,objectId:'',object:'',phone:'',objectNotes:'',task:'',notes:'',tech:''};
      const rowNumber = firstJob+index;
      const rowFill = (dayIndex+index)%2 ? COLORS.alternate : COLORS.white;
      const names = [0,1,2].map(role=>employeeName(state,participantAt(day,job,role)));
      names.push([3,4].map(role=>employeeName(state,participantAt(day,job,role))).filter(Boolean).join('\n'));
      const values = [job.time,...names,job.invoice,null,null,null,job.objectId,job.type,numeric(job.hours),job.object,job.phone,job.objectNotes,job.task,job.notes,job.tech];
      values.forEach((value,offset)=>{
        const column = offset+2;
        if ([8,9,10].includes(column)) return;
        const fill = column >= 3 && column <= 6 ? ROLE_COLORS[column-3] : rowFill;
        const options = {fill,align:column < 14 ? 'center' : 'left',color:column === 18 ? COLORS.red : column === 19 ? COLORS.blue : COLORS.ink};
        if (column === 13) options.numFmt = '0.00';
        write(sheet,rowNumber,column,value,options);
      });
      if (job.objectNotes) sheet.getCell(rowNumber,16).font = {...sheet.getCell(rowNumber,16).font,color:{argb:COLORS.blue}};
      const row = sheet.getRow(rowNumber);
      row.height = estimatedHeight(values,widths.slice(1),32);
      row.outlineLevel = 1;
      row.hidden = Boolean(state.monthCollapsed || collapsed.has(day.date));
    }
    const pay = merge(sheet,firstJob,8,lastJob,8,numeric(dayPay(state,day)),{align:'center',numFmt:'#,##0.00',fill:dayFill});
    pay.note = day.pay !== null && day.pay !== undefined ? `Значение введено вручную. ${PAY_NOTE}` : PAY_NOTE;
    const adjustment = merge(sheet,firstJob,9,lastJob,9,numeric(day.adjustment),{align:'center',numFmt:'#,##0.00',color:COLORS.red,fill:dayFill});
    if (day.adjustment !== null && day.adjustment !== undefined) adjustment.note = 'Корректировка введена вручную.';
    const hours = merge(sheet,firstJob,10,lastJob,10,numeric(dayHours(day)),{align:'center',bold:true,numFmt:'0.00',fill:COLORS.hours});
    if (day.hoursOverride !== null && day.hoursOverride !== undefined) hours.note = 'Итог часов смены введён вручную. Он может отличаться от суммы часов заданий.';
    cursor = lastJob+1;
  });
  cursor++;
  merge(sheet,cursor,1,cursor,19,'Часы за месяц по видам работ',{fill:COLORS.month,bold:true,size:12});
  cursor++;
  write(sheet,cursor,12,'ВИД',{fill:COLORS.month,bold:true});
  write(sheet,cursor,13,'ЧАСЫ',{fill:COLORS.month,bold:true,align:'right'});
  merge(sheet,cursor,14,cursor,19,'Примечание',{fill:COLORS.month,bold:true});
  for (const [code,hours] of typeTotals(state)) {
    cursor++;
    write(sheet,cursor,12,code);
    write(sheet,cursor,13,numeric(hours),{numFmt:'0.00',align:'right'});
    merge(sheet,cursor,14,cursor,19,state.workTypes.find(type=>type.code === code)?.label || '');
  }
  cursor += 2;
  merge(sheet,cursor,1,cursor,19,'Статистика по видам рассчитана по заданиям. Месячный итог учитывает ручные корректировки часов смен.',{color:COLORS.muted,size:10});
  sheet.getRow(cursor).height = 28;
  sheet.pageSetup.printArea = `A1:S${cursor}`;
  return sheet;
}

function sectionTable(sheet,start,title,headers,records,options = {}) {
  const width = headers.length;
  merge(sheet,start,1,start,width,title,{fill:COLORS.month,bold:true,size:12});
  sheet.getRow(start).height = 27;
  headers.forEach((header,index)=>write(sheet,start+1,index+1,header,{fill:COLORS.header,bold:true,size:10}));
  sheet.getRow(start+1).height = 30;
  records.forEach((record,index)=>{
    const rowNumber = start+2+index;
    record.forEach((value,column)=>write(sheet,rowNumber,column+1,value,{fill:index%2 ? 'FFF5F8F4' : COLORS.white, numFmt: options.numberColumns?.includes(column+1) ? '0.00' : undefined,align:typeof value === 'number' ? 'right' : 'left'}));
    sheet.getRow(rowNumber).height = estimatedHeight(record,headers.map((_,index)=>sheet.getColumn(index+1).width),27);
  });
  return start+records.length+3;
}

function addEmployees(workbook,state) {
  const sheet = baseSheet(workbook,'Сотрудники',[7,31,23,14,23,13,13,20],COLORS.lead);
  sheet.views = [{state:'frozen',xSplit:2,ySplit:4,topLeftCell:'C5',showGridLines:false}];
  merge(sheet,1,1,1,8,'Сотрудники',{fill:COLORS.month,bold:true,size:16});
  merge(sheet,2,1,2,8,'Снимок сотрудников и их часов по участию в заданиях за выбранный месяц. Отключённые сотрудники сохраняются в истории.',{color:COLORS.muted,size:10});
  sheet.getRow(1).height = 29;
  sheet.getRow(2).height = 32;
  const headers = ['№','ФИ','Имя Ф.','Группа','Должность','Водитель','Активен','Часы за период'];
  headers.forEach((header,index)=>write(sheet,4,index+1,header,{fill:COLORS.header,bold:true}));
  state.employees.forEach((employee,index)=>{
    const values = [index+1,employee.fullName || '',employee.name,employee.group,employee.position || '',employee.driver ? 'ДА' : 'НЕТ',employee.active ? 'ДА' : 'НЕТ',numeric(employeeHours(state,employee.id))];
    values.forEach((value,column)=>write(sheet,index+5,column+1,value,{fill:index%2 ? 'FFF5F8F4' : COLORS.white, numFmt:column === 7 ? '0.00' : undefined,align:[0,5,6,7].includes(column) ? 'center' : 'left',color:employee.active ? COLORS.ink : COLORS.muted}));
    sheet.getRow(index+5).height = estimatedHeight(values,sheet.columns.map(column=>column.width),27);
  });
  sheet.autoFilter = {from:'A4',to:`H${Math.max(4,state.employees.length+4)}`};
  sheet.pageSetup.printTitlesRow = '1:4';
  sheet.pageSetup.printArea = `A1:H${Math.max(4,state.employees.length+4)}`;
}

function addDictionaries(workbook,state) {
  const sheet = baseSheet(workbook,'Справочники',[16,36,39,50,53,42],COLORS.partner);
  sheet.views = [{state:'frozen',ySplit:2,topLeftCell:'A3',showGridLines:false}];
  merge(sheet,1,1,1,6,'Справочники',{fill:COLORS.month,bold:true,size:16});
  merge(sheet,2,1,2,6,`Снимок общих данных. ${PAY_NOTE}`,{color:COLORS.muted,size:10});
  sheet.getRow(1).height = 29;
  sheet.getRow(2).height = 32;
  let cursor = 4;
  cursor = sectionTable(sheet,cursor,'Виды работ',['№','ВИД','ПРИМЕЧАНИЕ'],state.workTypes.map((type,index)=>[index+1,type.code,type.label]));
  cursor = sectionTable(sheet,cursor,'Статусы',['№','СТАТУС','Пояснения'],state.statuses.map((status,index)=>[index+1,status.code,status.label]));
  cursor = sectionTable(sheet,cursor,'Счёт',['№','СЧЁТ'],state.invoiceStates.map((invoice,index)=>[index+1,invoice]));
  cursor = sectionTable(sheet,cursor,'Должности',['№','Должность','Описание','Условия'],state.positions.map((position,index)=>[index+1,position.label || position.code,position.description || '',position.terms || '']));
  cursor = sectionTable(sheet,cursor,'Ставки за смену',['ID','ЧАСЫ РАБОТЫ','До, ч','НЕ Водитель, ₽','Водитель, ₽'],state.rates.map(rate=>[rate.id,rate.label,numeric(rate.maxHours),numeric(rate.nonDriver),numeric(rate.driver)]),{numberColumns:[3,4,5]});
  cursor = sectionTable(sheet,cursor,'Объекты',['№ объекта','ОБЪЕКТ','ТЕЛЕФОН РАБОТ','ПРИМЕЧАНИЯ ПО ОБЪЕКТУ','ТЗ НА РАБОТЫ','ТЕХБАЗА'],state.objects.map(object=>[object.id,object.name,object.phone,object.notes,object.task,object.tech]));
  sheet.pageSetup.printTitlesRow = '1:2';
  sheet.pageSetup.printArea = `A1:F${cursor-2}`;
}

export function buildWorkbook(state, ExcelJS) {
  if (!ExcelJS || typeof ExcelJS.Workbook !== 'function') throw Error('Модуль экспорта XLSX не загрузился. Обновите страницу и повторите.');
  if (!state || !Array.isArray(state.days)) throw Error('Нет графика для экспорта.');
  const exportedAt = new Date();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'График бригады';
  const period = new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(periodDate(state,exportedAt));
  workbook.title = `График бригады — ${period}`;
  workbook.subject = 'График, сотрудники и справочники';
  workbook.description = 'Снимок значений из демонстрационной учётной системы. Базовая зарплата предварительная.';
  workbook.created = exportedAt;
  workbook.modified = exportedAt;
  addSchedule(workbook,state,exportedAt);
  addEmployees(workbook,state);
  addDictionaries(workbook,state);
  return workbook;
}
