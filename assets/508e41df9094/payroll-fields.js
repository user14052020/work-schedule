import {state} from './state.js';
import {escape,option,options} from './ui.js';

function select(name,label,values,current,empty = 'Не задано') {
  return `<label>${label}<select name="${name}">${option('',empty,current)}${values.map(([key,text]) => option(key,text,current)).join('')}</select></label>`;
}
function amount(name,label,value) { return `<label>${label}<input type="number" name="${name}" step="any" min="0" value="${escape(value ?? '')}"></label>`; }
const numeric = value => value === '' || value === null ? null : Number(value);

function positionPaymentKind(record) {
  return record.metadata?.payroll?.kind || ({'Бригадир':'brigadier','1/2 Бригадир':'brigadier','Стажер':'trainee','Стажёр':'trainee','Ученик':'apprentice'}[record.code] ?? 'standard');
}

function positionPaymentFields(record) {
  const value = record.metadata?.payroll || {};
  const kind = positionPaymentKind(record);
  const rounding = select('rounding','Округление до копеек',[['half_up','Математическое'],['down','В меньшую сторону']],value.rounding);
  if (kind === 'brigadier') {
    return amount('bonusAmount','Фиксированная надбавка, ₽',value.bonusAmount)
      + amount('bonusPercent','Надбавка, %',value.bonusPercent)
      + ((record.code === '1/2 Бригадир' || value.bonusMultiplier != null) ? amount('bonusMultiplier','Доля бригадирской надбавки (0,5 = половина)',value.bonusMultiplier) : '')
      + rounding;
  }
  if (['trainee','apprentice'].includes(kind)) {
    return amount('deductionPercent','Удержание на обучение, %',value.deductionPercent)
      + select('deductionBase','База удержания',[['base','Базовая ставка'],['gross','Начисление с надбавками']],value.deductionBase)
      + amount('maxBrigadeHours','Предельная нагрузка бригады, ч',value.maxBrigadeHours)
      + rounding;
  }
  return '<p class="muted small">Оплата по справочнику «Ставки оплаты» с учетом часов работы и признака водителя.</p>';
}

export function payrollFields(kind,record) {
  const metadata = record.metadata || {};
  if (kind === 'statuses') {
    return `<details class="calculation-settings"><summary>Правила статуса</summary><div class="form-grid">${select('statusKind','Назначение статуса',[['work','Рабочий день'],['duty','Дежурство'],['leave','Отпуск'],['other','Другой']],metadata.kind)}${select('payrollKind','Оплата статуса',[['work','По часам и ставкам'],['leave','Отпускная ставка'],['none','Без оплаты'],['pending','Требует настройки']],metadata.payrollKind)}<label>Статус ставки<select name="rateStatusCode">${options(state.references.statuses,metadata.rateStatusCode,{value:'code',label:'code'})}</select></label></div><label class="check-label"><input name="participates" type="checkbox" ${(metadata.participates ?? ['РД','ДЕЖ'].includes(record.code)) ? 'checked' : ''}>Участвует в работах</label><label class="check-label"><input name="allowZeroDay" type="checkbox" ${metadata.allowZeroDay ? 'checked' : ''}>Разрешен расчет ставки для нулевой смены</label></details>`;
  }
  if (kind === 'positions') {
    return `<label>Описание должности<textarea name="positionDescription" rows="3">${escape(metadata.description)}</textarea></label><label>Пояснение к оплате<textarea name="paymentNote" rows="3">${escape(metadata.paymentNote)}</textarea></label><details class="calculation-settings"><summary>Параметры расчета зарплаты</summary><p class="muted small">Параметры применяются к сотрудникам этой должности. Пустое значение означает, что параметр не определен.</p><div class="form-grid" data-position-payment-fields>${positionPaymentFields(record)}</div></details>`;
  }
  if (kind === 'employees') {
    const value = record.training || {};
    return `<details class="calculation-settings"><summary>Обучение сотрудника</summary><div class="form-grid">${select('trainingPhase','Этап',[['trial','Пробный период'],['training','Обучение'],['internship','Стажировка']],value.phase)}<label>Учитель<select name="teacherId">${options(state.references.employees?.filter(employee => employee.id !== record.id),value.teacherId,{label:'name'})}</select></label><label>Начало этапа<input name="trainingFrom" type="date" value="${escape(value.from)}"></label><label>Окончание этапа<input name="trainingTo" type="date" value="${escape(value.to)}"></label>${amount('trialDailyAmount','Оплата пробного дня, ₽',value.trialDailyAmount)}${select('trainingPayKind','Оплата обучения',[['base','По базовой ставке'],['fixed','Фиксированная сумма']],value.trainingPayKind)}${amount('trainingDailyAmount','Оплата дня обучения, ₽',value.trainingDailyAmount)}</div></details>`;
  }
  if (kind === 'workTypes') return `<label class="check-label"><input name="isTravel" type="checkbox" ${metadata.isTravel ? 'checked' : ''}>Переезд / проезд</label>`;
  return '';
}

export function bindPositionPaymentFields(form,record) {
  if (record.id) return;
  form.querySelector('[name="code"]')?.addEventListener('change',event => {
    form.querySelector('[data-position-payment-fields]').innerHTML = positionPaymentFields({...record,code:event.target.value.trim()});
  });
}

export function readPayrollFields(kind,record,data) {
  if (kind === 'statuses') {
    const metadata = {...record.metadata,participates:data.has('participates'),allowZeroDay:data.has('allowZeroDay')};
    for (const [field,name] of [['kind','statusKind'],['payrollKind','payrollKind'],['rateStatusCode','rateStatusCode']]) { const value = data.get(name); if (value) metadata[field] = value; else delete metadata[field]; }
    return {metadata};
  }
  if (kind === 'positions') {
    const payroll = {...record.metadata?.payroll};
    payroll.kind ??= positionPaymentKind(record.id ? record : {...record,code:String(data.get('code') || '').trim()});
    for (const field of ['bonusAmount','bonusPercent','bonusMultiplier','deductionPercent','maxBrigadeHours']) {
      if (data.has(field)) payroll[field] = numeric(data.get(field));
    }
    for (const field of ['deductionBase','rounding']) {
      if (!data.has(field)) continue;
      const value = data.get(field); if (value) payroll[field] = value; else delete payroll[field];
    }
    if (payroll.bonusAmount != null && payroll.bonusPercent != null) throw Error('Выберите один способ надбавки: фиксированную сумму или процент.');
    return {metadata:{...record.metadata,payroll,description:String(data.get('positionDescription') || ''),paymentNote:String(data.get('paymentNote') || '')}};
  }
  if (kind === 'employees') {
    const training = {...record.training};
    for (const field of ['trialDailyAmount','trainingDailyAmount']) training[field] = numeric(data.get(field));
    for (const [field,name] of [['phase','trainingPhase'],['teacherId','teacherId'],['from','trainingFrom'],['to','trainingTo'],['trainingPayKind','trainingPayKind']]) { const value = data.get(name); if (value) training[field] = value; else delete training[field]; }
    return {training};
  }
  if (kind === 'workTypes') return {metadata:{...record.metadata,isTravel:data.has('isTravel')}};
  return {};
}
