import {MONTHS,column,textHeight} from './export-layout.js';

export class ReferenceExport {
  constructor(writer,references) { this.writer = writer; this.references = references; this.employees = new Map((references.employees || []).map(record => [record.id,record.shortName || record.name])); }
  put(sheet,row,col,values,kind,sourceRow,sourceCol = col) {
    values.forEach((value,index) => {
      this.writer.write(sheet,row,col + index,value,this.writer.style(kind,sourceRow,sourceCol + index,{wrap:true}));
      const width = this.writer.template.sheets[kind].columns[col + index - 1]?.width || 12.63;
      sheet.getRow(row).height = Math.min(409.5,Math.max(sheet.getRow(row).height || 22.5,textHeight(value,width,10)));
    });
  }
  employeesSheet() {
    const sheet = this.writer.sheet('Сотрудники','employees'), layout = this.writer.template.sheets.employees;
    const positions = new Map((this.references.positions || []).map(record => [record.id,record]));
    this.put(sheet,1,1,layout.headers,'employees',1);
    (this.references.employees || []).forEach((person,index) => { const position = positions.get(person.positionId); this.put(sheet,index + 2,1,[index + 1,person.name || '',person.shortName || '',person.group || '',position?.code || position?.label || '',person.driver ? 'ДА' : 'НЕТ'],'employees',2); });
    return sheet;
  }
  description(record) { return [...new Set([record.label !== record.code ? record.label : '',record.metadata?.description,record.metadata?.paymentNote].filter(value => typeof value === 'string' && value.trim()))].join('\n'); }
  payment(record) {
    const metadata = record.metadata || {}, payroll = metadata.payroll || {}, values = [metadata.paymentNote].filter(Boolean);
    for (const [key,label,unit] of [['bonusAmount','Надбавка',' ₽'],['bonusPercent','Надбавка','%'],['bonusMultiplier','Доля надбавки',''],['deductionPercent','Удержание на обучение','%'],['maxBrigadeHours','Предельная нагрузка бригады',' ч']]) if (payroll[key] != null) values.push(`${label}: ${payroll[key]}${unit}`);
    if (['base','gross'].includes(payroll.deductionBase)) values.push(`База удержания: ${payroll.deductionBase === 'base' ? 'базовая ставка' : 'начисление'}`);
    return values.join('\n');
  }
  referencesSheet() {
    const sheet = this.writer.sheet('Справочники','references'), layout = this.writer.template.sheets.references;
    for (const kind of ['positions','workTypes','statuses']) {
      const section = layout.sections[kind]; this.put(sheet,2,section.column,section.headers,'references',2);
      (this.references[kind] || []).forEach((record,index) => { const values = kind === 'positions' ? [index + 1,record.code || '',record.metadata?.description || '',this.payment(record)] : [index + 1,record.code || '',this.description(record)]; this.put(sheet,index + 3,section.column,values,'references',3); this.writer.fill(sheet.getCell(index + 3,section.column + 1),record.color); });
    }
    const invoiceRow = Math.max(14,(this.references.positions || []).length + 5);
    this.put(sheet,invoiceRow,1,layout.sections.invoiceStates.headers,'references',14);
    (this.references.invoiceStates || []).forEach((record,index) => { this.put(sheet,invoiceRow + index + 1,1,[index + 1,record.code || ''],'references',15); this.writer.fill(sheet.getCell(invoiceRow + index + 1,2),record.color); });
    let row = Math.max(19,5 + (this.references.workTypes || []).length,5 + (this.references.statuses || []).length), previous;
    const rates = [...(this.references.rates || [])].sort((a,b) => (a.fromDate || '').localeCompare(b.fromDate || '') || (a.statusCode || '').localeCompare(b.statusCode || '') || (a.minHours ?? -1) - (b.minHours ?? -1) || (a.maxHours ?? Infinity) - (b.maxHours ?? Infinity));
    if (!rates.length) this.put(sheet,row++,8,layout.sections.rates.headers,'references',19);
    for (const rate of rates) {
      if (previous !== rate.fromDate) {
        if (previous !== undefined) row++;
        this.put(sheet,row,8,[`Ставки с ${rate.fromDate?.split('-').reverse().join('.') || 'неуказанной даты'}`,'',''],'references',19); this.writer.merge(sheet,`H${row}:J${row}`); row++;
        this.put(sheet,row++,8,layout.sections.rates.headers,'references',19); previous = rate.fromDate;
      }
      const min = rate.minHours, max = rate.maxHours;
      let band = rate.statusCode || '';
      if (min != null || max != null) band += min === 0 && max === 0 ? '\n0 ч' : `\n${min == null ? '' : `${min}${(rate.minInclusive ?? rate.metadata?.minInclusive) ? ' ≤ ' : ' < '}`}часы${max == null ? '' : `${(rate.maxInclusive ?? rate.metadata?.maxInclusive ?? true) ? ' ≤ ' : ' < '}${max}`}`;
      this.put(sheet,row++,8,[band,rate.nonDriver ?? null,rate.driver ?? null],'references',20);
    }
    row = sheet.rowCount + 3;
    this.put(sheet,row,1,['№','Бригада','Название','Доступна'],'references',2,1); this.put(sheet,row,6,['№','Роль','Название','Доступна'],'references',2,1);
    for (const [kind,col] of [['brigades',1],['roles',6]]) (this.references[kind] || []).forEach((record,index) => { this.put(sheet,row + index + 1,col,[index + 1,record.code || '',record.label || '',record.active === false ? 'НЕТ' : 'ДА'],'references',3,1); this.writer.fill(sheet.getCell(row + index + 1,col + 1),record.color); });
    this.writer.finish(sheet); return sheet;
  }
  vacationsSheet(vacations,year) {
    const sheet = this.writer.sheet('ОТПУСКА','vacations'); let row = 1;
    const sorted = [...vacations].sort((a,b) => a.from.localeCompare(b.from) || (this.employees.get(a.employeeId) || '').localeCompare(this.employees.get(b.employeeId) || ''));
    for (let month = 1; month <= 12; month++) {
      const first = `${year}-${String(month).padStart(2,'0')}-01`, count = new Date(year,month,0).getDate(), last = `${first.slice(0,8)}${count}`;
      this.put(sheet,row,1,[`${MONTHS[month - 1]} ${year}`],'vacations',1); this.writer.merge(sheet,`A${row}:AE${row}`); sheet.getRow(row++).height = 22.5;
      this.put(sheet,row++,1,Array.from({length:count},(_,index) => index + 1),'vacations',2);
      for (const vacation of sorted) {
        if (!vacation.from || !vacation.to || vacation.from > last || vacation.to < first) continue;
        const start = Number((vacation.from > first ? vacation.from : first).slice(8)), end = Number((vacation.to < last ? vacation.to : last).slice(8)), name = this.employees.get(vacation.employeeId) || 'Сотрудник не найден';
        for (let col = start; col <= end; col++) this.writer.write(sheet,row,col,col === start ? name : '',this.writer.style('vacations',5,6,{wrap:true}));
        if (start < end) this.writer.merge(sheet,`${column(start - 1)}${row}:${column(end - 1)}${row}`);
        sheet.getRow(row++).height = Math.min(409.5,Math.max(22.5,textHeight(name,2.5 * (end - start + 1),10)));
      }
    }
    this.writer.finish(sheet); return sheet;
  }
}
