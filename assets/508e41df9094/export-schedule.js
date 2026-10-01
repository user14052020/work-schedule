import {MONTHS,column,round,numeric,excelStyle,textHeight} from './export-layout.js';

const WEEKDAYS = ['ВОСКРЕСЕНЬЕ','ПОНЕДЕЛЬНИК','ВТОРНИК','СРЕДА','ЧЕТВЕРГ','ПЯТНИЦА','СУББОТА'];
const HEADERS = ['СЧЕТ','ЗП за\nСМЕНУ','ШТРАФЫ\nПРЕМИИ','ЧАСОВ\nза\nСМЕНУ','№','ВИД','ЧАСОВ\nна\nБРИГАДУ','ОБЪЕКТ','ТЕЛЕФОН РАБОТ','ПРИМЕЧАНИЯ по объекту','ТЗ НА РАБОТЫ','ПРИМЕЧАНИЯ ПО РАБОТАМ\nДОП ТЗ','ТЕХ БАЗА'];
const quoted = value => `"${String(value).replaceAll('"','""')}"`;

export class ScheduleExport {
  constructor(layout,references,today) {
    this.writer = layout; this.layout = layout.template.sheets.schedule; this.references = references; this.today = today;
    this.employees = new Map((references.employees || []).map(person => [person.id,person.shortName || person.name]));
    this.statusColors = new Map((references.statuses || []).map(record => [record.code,record.color]));
    this.invoiceColors = new Map((references.invoiceStates || []).map(record => [record.code,record.color]));
    this.participating = [...new Set(['РД','ДЕЖ',...(references.statuses || []).flatMap(record => typeof record === 'string' ? [record] : [record.code,record.id,...(record.aliases || [])])])].filter(value => value && this.participates(value));
    this.workTypes = [...new Set((references.workTypes || []).map(type => typeof type === 'string' ? type : type.code).filter(Boolean))];
  }
  participates(value) {
    const record = (this.references.statuses || []).find(status => typeof status === 'object' && [status.code,status.id,...(status.aliases || [])].includes(value));
    return record?.metadata?.participates ?? ['work','duty'].includes(record?.metadata?.kind || ({РД:'work',ДЕЖ:'duty'}[record?.code || value]));
  }
  people(ids = []) {
    const names = Array.from({length:5},(_,slot) => this.employees.get(ids[slot]) || '');
    return [names[0],names[1],names[2],[names[3],names[4]].filter(Boolean).join('\n')];
  }
  resolved(day,job) {
    return job.resolvedPeople || Array.from({length:5},(_,slot) => !job.type ? '' : job.people?.[slot] ?? (this.participates(day.statuses?.[slot]) ? day.roster?.[slot] || '' : ''));
  }
  crewHeight(names) { return Math.max(...names.map(name => textHeight(name,14.63,10)),0); }
  jobHeight(day,job) {
    let height = Math.max(38.25,this.crewHeight(this.people(this.resolved(day,job))));
    const values = [[13,[job.object,job.objectExtra].filter(Boolean).join('\n')],[14,job.phone],[15,job.objectNotes],[16,job.task],[17,[job.notes,job.notesExtra].filter(Boolean).join('\n')]];
    for (const [col,value] of values) height = Math.max(height,textHeight(value,this.layout.columns[col].width));
    let tech = textHeight(job.tech,this.layout.columns[18].width);
    if (job.tech2) tech = 2 * Math.max(tech,textHeight(job.tech2,this.layout.columns[18].width));
    return Math.max(height,tech);
  }
  comment(day) {
    return [day.adjustmentComment,...(day.employeeAdjustments || []).map(value => {
      let line = `${this.employees.get(value.employeeId) || ''}${value.amount == null ? '' : `: ${value.amount > 0 ? '+' : ''}${value.amount} ₽`}`.trim();
      if (value.comment) line += `${line ? ' — ' : ''}${value.comment}`;
      return line;
    })].filter(Boolean).join('\n\n');
  }
  prepare(day,start) {
    const rows = [...(day.rows || [])]; while (rows.length < 5) rows.push({});
    const jobs = rows.map(job => {
      const height = this.jobHeight(day,job);
      let parts = Math.max(1,Math.ceil(height / 400));
      if (job.tech2) parts = Math.max(2,Math.ceil(parts / 2) * 2);
      return {job,parts,height:Math.max(19.125,height / parts)};
    });
    const comment = this.comment(day);
    if (comment) {
      const available = jobs.reduce((sum,item) => sum + item.height * item.parts,0) - jobs[0].height;
      const required = textHeight(comment,this.layout.columns[8].width);
      if (required > available) {
        const entry = jobs.at(-1), height = entry.height * entry.parts + required - available;
        entry.parts = Math.max(entry.parts,Math.ceil(height / 400));
        if (entry.job.tech2) entry.parts = Math.ceil(entry.parts / 2) * 2;
        entry.height = height / entry.parts;
      }
    }
    const count = jobs.reduce((sum,item) => sum + item.parts,0);
    return {day,jobs,comment,start,jobStart:start + 4,end:start + 3 + count};
  }
  firstRoster(days) {
    return Array.from({length:5},(_,slot) => days.find(day => day.roster?.[slot])?.roster[slot] || '');
  }
  write(name,months) {
    const sheet = this.writer.sheet(name,'schedule'); let row = 1;
    for (const month of months) row = this.month(sheet,month,row);
    this.writer.finish(sheet);
    return sheet;
  }
  month(sheet,month,row) {
    const days = month.days || [], monthName = MONTHS[Number(month.period.slice(5,7)) - 1];
    const roster = month.roster?.some(Boolean) ? month.roster : this.firstRoster(days), rosterRow = row + 1;
    let next = row + 2, hours = null;
    const plans = days.map(day => { const plan = this.prepare(day,next); next = plan.end + 1; const value = day.hoursOverride ?? day.calculated?.hours; if (numeric(value)) hours = (hours ?? 0) + value; return plan; });
    if (hours !== null) hours = round(hours);
    this.writer.prototype(sheet,row,1);
    const cell = (r,c) => sheet.getCell(r,c);
    cell(row,1).value = monthName;
    ['БРИГАДИР','ОСН\nНАПАРНИК','ДОП №1\nНАПАРНИК','ДОП №2\nНАПАРНИК'].forEach((value,index) => { cell(row,index + 3).value = value; });
    cell(row,7).value = 'Бригада часов за месяц'; cell(row,11).value = monthName;
    const anchors = plans.map(plan => `J${plan.jobStart}`).join(',');
    if (anchors) this.writer.formula(cell(row,10),hours === null ? `IF(COUNT(${anchors})=0,"",SUM(${anchors}))` : `SUM(${anchors})`,hours);
    else cell(row,10).value = hours;
    sheet.getRow(row).height = 32.25;
    [`A${row}:B${row + 1}`,`G${row}:I${row + 1}`,`J${row}:J${row + 1}`,`K${row}:S${row + 1}`].forEach(range => this.writer.merge(sheet,range));
    this.writer.prototype(sheet,row + 1,2);
    this.people(roster).forEach((name,index) => { cell(row + 1,index + 3).value = name; });
    sheet.getRow(row + 1).height = Math.max(29.25,this.crewHeight(this.people(roster)));
    plans.forEach((plan,index) => this.day(sheet,plan,monthName,index === 0,index % 2 === 1,roster,rosterRow));
    return plans.length ? this.statistics(sheet,days,plans[0].jobStart,next - 1,next) : next;
  }
  day(sheet,plan,monthName,first,even,monthRoster,monthRosterRow) {
    const {day,start,jobStart,end,jobs,comment} = plan, date = new Date(`${day.date}T12:00:00`), collapsed = day.date !== this.today;
    const source = first ? 3 : even ? 14 : 23, cell = (r,c) => sheet.getCell(r,c);
    for (let offset = 0; offset < 4; offset++) { this.writer.prototype(sheet,start + offset,source + offset); sheet.getRow(start + offset).height = 22.5; }
    cell(start,1).value = monthName; cell(start,2).value = 'ЧИСЛО'; cell(start,3).value = date.getDate(); cell(start,7).value = '-'.repeat(410);
    [`A${start}:A${end}`,`C${start}:F${start}`,`G${start}:S${start}`,`C${start + 1}:F${start + 1}`].forEach(range => this.writer.merge(sheet,range));
    cell(start + 1,2).value = 'ДЕНЬ'; cell(start + 1,3).value = WEEKDAYS[date.getDay()]; cell(start + 1,3).font = {...cell(start + 1,3).font,bold:true,size:11};
    HEADERS.forEach((label,index) => { if (first) cell(start + 1,index + 7).value = label; this.writer.merge(sheet,`${column(index + 6)}${start + 1}:${column(index + 6)}${start + 3}`); });
    cell(start + 2,2).value = 'СМЕНА';
    const names = this.people(day.roster);
    names.forEach((name,index) => {
      const target = cell(start + 2,index + 3); target.value = name;
      if ((day.roster?.[index] || '') === (monthRoster[index] || '') && (index !== 3 || (day.roster?.[4] || '') === (monthRoster[4] || ''))) {
        const reference = `$${column(index + 2)}$${monthRosterRow}`; this.writer.formula(target,`IF(${reference}="","",${reference})`,name);
      }
    });
    sheet.getRow(start + 2).height = Math.max(38.25,this.crewHeight(names));
    cell(start + 3,2).value = 'СТАТУС';
    [0,1,2,3].forEach(slot => { const value = slot === 3 && day.roster?.[4] ? [day.statuses?.[3],day.statuses?.[4]].filter(Boolean).join('\n') : day.statuses?.[slot] || ''; cell(start + 3,slot + 3).value = value; this.writer.fill(cell(start + 3,slot + 3),this.statusColors.get(value)); });
    let row = jobStart;
    for (const [index,entry] of jobs.entries()) {
      const {job,parts,height} = entry, partStart = row, partEnd = row + parts - 1, resolved = this.resolved(day,job);
      for (let part = 0; part < parts; part++,row++) {
        const prototype = even ? (index === 0 ? 18 : index === jobs.length - 1 ? 22 : 19) : index === 0 ? 7 : index === jobs.length - 1 ? 13 : 8;
        this.writer.prototype(sheet,row,prototype); sheet.getRow(row).height = height; sheet.getRow(row).outlineLevel = 1; sheet.getRow(row).hidden = collapsed;
        for (const col of [2,11,12,13,14,15,16,17,18,19]) this.writer.fill(cell(row,col),(index % 2 === 1) !== even ? '#AFE9CA' : '#FFFFFF');
        if (!part) {
          cell(row,2).value = job.time || '';
          this.people(resolved).forEach((name,slot) => { const target = cell(row,slot + 3); target.value = name; const formula = this.participationFormula(day,job,resolved,slot,start,row); if (formula) this.writer.formula(target,formula,name); });
          cell(row,7).value = job.invoice || ''; this.writer.fill(cell(row,7),this.invoiceColors.get(job.invoice));
          [job.objectId || '',job.type || '',job.hours ?? null,job.object || '',job.phone || '',job.objectNotes || '',job.task || '',job.notes || ''].forEach((value,index) => { cell(row,index + 11).value = value; });
          this.writer.annotated(cell(row,14),job.object,job.objectExtra,'#0000FF'); this.writer.annotated(cell(row,18),job.notes,job.notesExtra,'#FF0000'); cell(row,16).font = {...cell(row,16).font,color:{argb:'FF000000'}};
          if (parts > 1) for (const col of [2,3,4,5,6,7,11,12,13,14,15,16,17,18]) this.writer.merge(sheet,`${column(col - 1)}${partStart}:${column(col - 1)}${partEnd}`);
        }
        const split = job.tech2 ? parts / 2 : parts;
        if (!part || (job.tech2 && part === split)) {
          const value = String(job[part === 0 ? 'tech' : 'tech2'] || ''); cell(row,19).value = /^https?:\/\/[^\s]+$/iu.test(value.trim()) ? {text:value,hyperlink:value.trim()} : value;
          const last = part === 0 ? partStart + split - 1 : partEnd; if (last > row) this.writer.merge(sheet,`S${row}:S${last}`);
        }
        if (row === jobStart) {
          const adjustment = day.adjustment ?? day.calculated?.adjustment ?? null, hours = day.hoursOverride ?? day.calculated?.hours ?? null;
          cell(row,8).value = day.pay ?? day.calculated?.pay ?? null; cell(row,9).value = adjustment; cell(row,9).font = {...cell(row,9).font,size:10,bold:true,color:{argb:adjustment < 0 ? 'FFFF0000' : adjustment > 0 ? 'FF008000' : 'FF000000'}}; cell(row,9).numFmt = '#,##0.##'; cell(row,10).value = hours;
          const total = jobs.reduce((sum,item) => sum + (numeric(item.job.hours) ? item.job.hours : 0),0);
          if (day.hoursOverride == null && numeric(hours) && round(hours) === round(total)) this.writer.formula(cell(row,10),`SUM(M${jobStart}:M${end})`,hours);
          for (const col of ['H','J',...(!comment ? ['I'] : [])]) this.writer.merge(sheet,`${col}${jobStart}:${col}${end}`);
        }
        if (comment && row === jobStart + 1) {
          cell(row,9).value = comment; cell(row,9).font = {name:'Arial',size:7,color:{argb:'FF000000'}}; cell(row,9).alignment = {horizontal:'left',vertical:'top',wrapText:true}; if (end > row) this.writer.merge(sheet,`I${row}:I${end}`);
        }
      }
    }
  }
  participationFormula(day,job,resolved,slot,start,row) {
    const expected = !job.type ? '' : job.people?.[slot] ?? (this.participates(day.statuses?.[slot]) ? day.roster?.[slot] || '' : '');
    if (job.people?.[slot] != null || (resolved[slot] || '') !== expected) return null;
    if (slot === 3 && (day.roster?.[4] || resolved[4] || job.people?.[4] != null)) return null;
    const col = column(slot + 2), crew = `${col}$${start + 2}`, status = `${col}$${start + 3}`;
    const rule = this.participating.length ? `OR(${this.participating.map(value => `EXACT(${status},${quoted(value)})`).join(',')})` : 'FALSE()';
    return `IF(AND($L${row}<>"",${crew}<>"",${rule}),${crew},"")`;
  }
  statistics(sheet,days,first,last,row) {
    const definition = this.layout.statistics, codes = [...this.workTypes], totals = new Map();
    for (const day of days) for (const job of day.rows || []) { const code = job.type || ''; if ((code || numeric(job.hours) && job.hours !== 0) && !codes.includes(code)) codes.push(code); if (numeric(job.hours)) totals.set(code,(totals.get(code) || 0) + job.hours); }
    row += definition.spacerRows;
    definition.headers.forEach((value,index) => this.writer.write(sheet,row,definition.startColumn + index,value,excelStyle(this.writer.template.styles[definition.headerStyles[index]]))); sheet.getRow(row++).height = definition.rowHeight;
    for (const code of codes) {
      const reference = `${column(definition.startColumn)}${row}`, criterion = `"="&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${reference},"~","~~"),"*","~*"),"?","~?")`;
      const target = this.writer.write(sheet,row,definition.startColumn,null,excelStyle(this.writer.template.styles[definition.rowStyles[0]])); this.writer.formula(target,`SUMIF($L$${first}:$L$${last},${criterion},$M$${first}:$M$${last})`,round(totals.get(code) || 0));
      this.writer.write(sheet,row,definition.startColumn + 1,code,excelStyle(this.writer.template.styles[definition.rowStyles[1]])); sheet.getRow(row++).height = Math.max(definition.rowHeight,textHeight(code,this.layout.columns[definition.startColumn].width,10));
    }
    return row;
  }
}
