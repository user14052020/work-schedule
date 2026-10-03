import {clone,yearRecord,today} from './database.js';

const round = value => Math.round((value + Number.EPSILON)*100)/100;
const amount = value => value === null || value === undefined || value === '' ? null : Number(value);
const byId = (rows,id) => rows?.find(row => row.id === id || row.code === id);
export function statusRule(references,code) {
  const row = byId(references.statuses,code) || {code}, meta = row.metadata || {};
  const kind = meta.kind || ({'РД':'work','ДЕЖ':'duty','ОТП':'leave'}[row.code] || 'other');
  return {code:row.code,kind,participates:meta.participates ?? ['work','duty'].includes(kind),
    payrollKind:meta.payrollKind || ({work:'work',leave:'leave'}[kind] || 'pending'),
    rateStatusCode:meta.rateStatusCode || row.code,allowZeroDay:Boolean(meta.allowZeroDay)};
}
export function participants(day,row,references) {
  return Array.from({length:5},(_,index) => !row.type ? '' : row.people?.[index] ??
    (statusRule(references,day.statuses[index]).participates ? day.roster[index] || '' : ''));
}
function rateFor(references,date,rule,hours) {
  const matches = references.rates.filter(rate => {
    if (rate.active === false || !rate.fromDate || rate.fromDate > date) return false;
    const status = byId(references.statuses,rate.statusCode)?.code || rate.statusCode || '';
    const codes = rule.payrollKind === 'leave' ? [rule.rateStatusCode,rule.code,'leave'] : ['',rule.rateStatusCode,rule.code,'work'];
    if (!codes.includes(status)) return false;
    if (rule.payrollKind === 'leave') return true;
    const min = Number(rate.minHours || 0), max = amount(rate.maxHours);
    const minInclusive = rate.minInclusive ?? rate.metadata?.minInclusive ?? false;
    const maxInclusive = rate.maxInclusive ?? rate.metadata?.maxInclusive ?? true;
    return min === 0 && max === 0 ? hours === 0 : (minInclusive ? hours >= min : hours > min) && (max === null || (maxInclusive ? hours <= max : hours < max));
  }).sort((a,b) => b.fromDate.localeCompare(a.fromDate));
  if (!matches.length) throw Error('Нет подходящей ставки на дату смены и количество часов.');
  if (matches.length > 1 && matches[0].fromDate === matches[1].fromDate) throw Error('Подходящие интервалы ставок пересекаются.');
  return matches[0];
}
function positionPay(employee,base,totalHours,date,references,transfers) {
  const position = byId(references.positions,employee.positionId);
  if (!position) throw Error('Не указана должность сотрудника.');
  const rules = position.metadata?.payroll || {};
  const kind = rules.kind || ({'Бригадир':'brigadier','1/2 Бригадир':'brigadier','Стажер':'trainee','Стажёр':'trainee','Ученик':'apprentice'}[position.code] || 'standard');
  const rounding = value => rules.rounding === 'down' ? Math.floor(value*100)/100 : round(value);
  if (kind === 'brigadier') {
    if (amount(rules.bonusAmount) === null && amount(rules.bonusPercent) === null) throw Error('Не заданы размер и основание бригадирской надбавки.');
    if (position.code === '1/2 Бригадир' && amount(rules.bonusMultiplier) === null) throw Error('Не задана доля бригадирской надбавки.');
    return rounding(base + (amount(rules.bonusAmount) ?? base*Number(rules.bonusPercent)/100)*(amount(rules.bonusMultiplier) ?? 1));
  }
  if (['trainee','apprentice'].includes(kind)) {
    const training = employee.training || {};
    if (!training.phase || !training.from || !training.to || date < training.from || date > training.to) throw Error('На дату смены не определен действующий этап обучения.');
    if (rules.maxBrigadeHours != null && totalHours > Number(rules.maxBrigadeHours)) throw Error('Превышена предельная нагрузка бригады для стажера.');
    if (training.phase === 'trial' && amount(training.trialDailyAmount) !== null) return Number(training.trialDailyAmount);
    if (training.phase === 'training') {
      if (training.trainingPayKind === 'fixed' && amount(training.trainingDailyAmount) !== null) return Number(training.trainingDailyAmount);
      if (training.trainingPayKind === 'base') return base;
    }
    if (training.phase === 'internship' && amount(rules.deductionPercent) !== null && byId(references.employees,training.teacherId) && training.teacherId !== employee.id) {
      const deduction = rounding(base*Number(rules.deductionPercent)/100);
      if (deduction > base) throw Error('Удержание превышает начисление стажера.');
      transfers.push({employeeId:training.teacherId,amount:deduction}); return rounding(base-deduction);
    }
    throw Error('Не настроены условия оплаты обучения.');
  }
  if (kind !== 'standard') throw Error('Не настроены условия оплаты должности.');
  return base;
}
export function calculate(day,references) {
  const hours = {},counts = {},missing = new Set(),participationByJob = {},warnings = [],statuses = {},transfers = [];
  let total = 0,incomplete = false;
  for (const row of day.rows) {
    total += Number(row.hours || 0);
    const people = participants(day,row,references); participationByJob[row.id] = people;
    for (const id of new Set(people.filter(Boolean))) { hours[id] = (hours[id] || 0)+Number(row.hours || 0); counts[id] = (counts[id] || 0)+1; if (amount(row.hours) === null) missing.add(id); }
    if (row.type && amount(row.hours) === null) { incomplete = true; warnings.push('Для работы не заполнены часы.'); }
    if (!row.type && ['time','objectId','object','objectExtra','phone','objectNotes','task','notes','notesExtra','tech','tech2','hours'].some(key => row[key] !== '' && row[key] != null)) { incomplete = true; warnings.push('Для заполненной работы не выбран вид; автоматическое участие не назначено.'); }
  }
  total = round(total);
  day.roster.forEach((id,index) => { if (id) statuses[id] = day.statuses[index] || ''; });
  Object.keys(hours).forEach(id => { if (!statusRule(references,statuses[id]).participates) statuses[id] = references.statuses.find(row => row.metadata?.kind === 'work' || row.code === 'РД')?.code || 'РД'; });
  const adjustments = {};
  for (const entry of day.employeeAdjustments || []) { adjustments[entry.employeeId] = round((adjustments[entry.employeeId] || 0)+Number(entry.amount)); statuses[entry.employeeId] ??= ''; }
  const employees = Object.entries(statuses).map(([id,status]) => {
    const employee = byId(references.employees,id), rule = statusRule(references,status), ownHours = round(hours[id] || 0);
    let basePay = 0,pay = 0,rateId = null; const ownWarnings = [];
    try {
      if (!employee) throw Error('Сотрудник отсутствует в справочнике.');
      if (missing.has(id)) throw Error('Не заполнены часы назначенной работы.');
      if (!status && !counts[id] || rule.payrollKind === 'none' || rule.payrollKind === 'work' && !counts[id]) { /* Empty templates have no earnings. */ }
      else if (!['work','leave'].includes(rule.payrollKind)) throw Error(`Не настроена оплата статуса «${status}».`);
      else {
        if (rule.payrollKind === 'work' && ownHours === 0 && !rule.allowZeroDay) throw Error('Не настроена оплата нулевой смены.');
        const rate = rateFor(references,day.date,rule,ownHours); rateId = rate.id;
        basePay = amount(rate[employee.driver ? 'driver' : 'nonDriver']);
        if (basePay === null) throw Error('Не заполнена сумма ставки.');
        pay = rule.payrollKind === 'work' ? positionPay(employee,basePay,total,day.date,references,transfers) : basePay;
      }
    } catch(error) { pay = null; ownWarnings.push(error.message); }
    if (pay !== null) pay = round(pay+(adjustments[id] || 0));
    ownWarnings.forEach(message => warnings.push(`${employee?.shortName || employee?.name || 'Сотрудник'}: ${message}`));
    return {employeeId:id,hours:ownHours,basePay,pay,adjustment:adjustments[id] || 0,pending:pay === null,warnings:ownWarnings,rateId,driver:Boolean(employee?.driver),status};
  });
  for (const transfer of transfers) {
    let entry = employees.find(employee => employee.employeeId === transfer.employeeId);
    if (!entry) { entry = {employeeId:transfer.employeeId,hours:0,basePay:0,pay:0,adjustment:0,pending:false,warnings:[],teachingOnly:true}; employees.push(entry); }
    if (entry.pay !== null) entry.pay = round(entry.pay+transfer.amount);
    entry.teachingPay = round((entry.teachingPay || 0)+transfer.amount);
  }
  let pending = incomplete || employees.some(employee => employee.pending),allocationPending = false;
  const allocated = round(Object.values(adjustments).reduce((sum,value) => sum+value,0));
  const adjustment = amount(day.adjustment) ?? allocated;
  if (adjustment !== allocated) { pending = allocationPending = true; warnings.push('Корректировка смены не распределена по сотрудникам: укажите получателей и суммы.'); }
  const totalPay = round(employees.reduce((sum,employee) => sum+Number(employee.pay || 0),0));
  const manual = amount(day.pay) !== null;
  if (manual && (pending || Number(day.pay) !== totalPay)) { pending = allocationPending = true; warnings.push('Ручная зарплата смены не совпадает с индивидуальными начислениями.'); }
  return {hours:amount(day.hoursOverride) ?? total,calculatedHours:total,basePay:pending ? null : round(employees.reduce((sum,entry) => sum+Number(entry.basePay || 0),0)),
    pay:manual ? Number(day.pay) : pending ? null : totalPay,appliedPay:manual ? Number(day.pay) : pending ? null : totalPay,
    adjustment,manual,employees,warnings:[...new Set(warnings)],pending,allocationPending,participationByJob};
}
export function decorate(db,source) {
  const day = clone(source),year = yearRecord(db,day.date);
  const references = db.payrollSnapshots?.[day.payrollSnapshotId] || db.references;
  day.closed = Boolean(year?.closed); day.everClosed = Boolean(year?.everClosed);
  day.calculated = day.frozenCalculation || calculate(day,references);
  for (const row of day.rows) row.resolvedPeople = day.calculated.participationByJob[row.id] || participants(day,row,references);
  delete day.frozenCalculation; delete day.payrollSnapshotId;
  return day;
}
export function personalDay(db,source,employeeId) {
  const day = decorate(db,source),slot = day.roster.indexOf(employeeId),ownStatus = slot < 0 ? '' : day.statuses[slot];
  const rows = day.rows.filter(row => row.resolvedPeople.includes(employeeId));
  const ownPay = day.calculated.employees.find(entry => entry.employeeId === employeeId);
  if (!rows.length && !ownStatus && !ownPay?.teachingOnly) return null;
  const names = ids => ids.map(id => { const employee = byId(db.references.employees,id); return employee?.shortName || employee?.name || ''; });
  const colleague = slot === 0 ? 1 : 0,financeVisible = db.settings.showEmployeePayImmediately === true || Date.parse(`${today()}T00:00:00Z`) >= Date.parse(`${day.date}T00:00:00Z`)+3*86400000;
  const result = {...day,rows:rows.map(({invoice,...row}) => ({...row,people:row.resolvedPeople,peopleNames:names(row.resolvedPeople)})),
    ownRosterSlot:slot < 0 ? null : slot,shiftColleagueId:day.roster[colleague],shiftColleagueName:names(day.roster)[colleague],shiftColleagueStatus:day.statuses[colleague],
    shiftLeadId:day.roster[0],shiftLeadName:names(day.roster)[0],rosterNames:names(day.roster),hours:round(rows.reduce((sum,row) => sum+Number(row.hours || 0),0)),financeVisible};
  delete result.pay; delete result.adjustment; delete result.calculated; delete result.employeeAdjustments;
  if (financeVisible) {
    const entry = ownPay || {employeeId,hours:result.hours,basePay:null,pay:null,adjustment:0,pending:true,warnings:['Индивидуальное начисление не рассчитано.']};
    if (day.calculated.allocationPending) { entry.pay = null; entry.pending = true; }
    result.pay = entry.pay; result.adjustment = entry.adjustment;
    result.calculated = {hours:result.hours,calculatedHours:result.hours,basePay:entry.basePay,pay:entry.pay,appliedPay:entry.pay,adjustment:entry.adjustment,employees:[entry],pending:entry.pending,warnings:entry.warnings};
    result.employeeAdjustments = (day.employeeAdjustments || []).filter(entry => entry.employeeId === employeeId);
  }
  return result;
}
