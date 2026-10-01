import {initialState,migrateState,clone} from './legacy-model.js';

const legacyStorageKey = 'work-schedule-demo-v1';
const record = (value,index = 0) => ({active:true,version:1,sortOrder:index,metadata:{},...value});

function referencesFromLegacy(legacy) {
  const positions = legacy.positions.map((position,index) => record({
    ...position,id:`position-${index + 1}`,color:position.code === 'Бригадир' ? '#93c47d' : '#fce5cd',
    metadata:{description:position.description || '',paymentNote:position.terms || '',payroll:{
      kind:['Бригадир','1/2 Бригадир'].includes(position.code) ? 'brigadier' : position.code === 'Стажер' ? 'trainee' : position.code === 'Ученик' ? 'apprentice' : 'standard',
      ...(['Бригадир','1/2 Бригадир'].includes(position.code) ? {bonusAmount:0,bonusMultiplier:position.code === '1/2 Бригадир' ? .5 : 1,rounding:'half_up'} : {}),
    }},
  },index));
  const roles = [['admin','Администратор'],['office','Офис'],['field','Поле']].map(([code,label],index) => record({id:`role-${code}`,code,label,metadata:{systemRole:code}},index));
  const statuses = legacy.statuses.map((status,index) => {
    const participates = ['РД','ДЕЖ'].includes(status.code);
    return record({...status,id:`status-${index + 1}`,color:status.code === 'ОТП' ? '#fff2cc' : '#ffffff',metadata:{
      kind:status.code === 'РД' ? 'work' : status.code === 'ДЕЖ' ? 'duty' : status.code === 'ОТП' ? 'leave' : 'other',
      participates,payrollKind:participates ? 'work' : status.code === 'ОТП' ? 'leave' : 'none',
      rateStatusCode:status.code === 'ОТП' ? 'ОТП' : 'РД',allowZeroDay:true,
    }},index);
  });
  let previousHours = 0;
  const rates = legacy.rates.map((rate,index) => {
    const leave = rate.id === 'leave' || rate.label === 'ОТП';
    const minHours = leave ? 0 : previousHours;
    if (!leave && rate.maxHours !== null) previousHours = Number(rate.maxHours);
    return record({...rate,id:rate.id || `rate-${index + 1}`,fromDate:'2026-01-01',statusCode:leave ? 'ОТП' : 'РД',minHours},index);
  });
  return {
    employees:legacy.employees.map(employee => record({
      ...employee,name:employee.fullName || employee.name,shortName:employee.name,
      group:['Офис','office'].includes(employee.group) ? 'office' : 'field',
      positionId:positions.find(position => position.code === employee.position)?.id || '',
      roleId:`role-${['Офис','office'].includes(employee.group) ? 'office' : 'field'}`,training:{},
    })),
    brigades:legacy.brigades.map(record),positions,roles,statuses,rates,
    workTypes:legacy.workTypes.map((type,index) => record({...type,id:`type-${index + 1}`,color:'#ffffff',metadata:{isTravel:type.code === 'ПРЗД'}},index)),
    invoiceStates:legacy.invoiceStates.map((value,index) => {
      const status = typeof value === 'string' ? {code:value,label:value} : value;
      return record({...status,id:status.id || `invoice-${index + 1}`,color:({'ДА':'#d9ead3','ОК':'#b6d7a8','НЕТ':'#f4cccc'})[status.code] || '#ffffff'},index);
    }),
  };
}

export function convertLegacyDatabase(saved) {
  const legacy = saved ? migrateState(saved) : initialState();
  // Seeded B2 leaders must be selectable under the current position rules.
  // Existing browser edits retain their original reference records.
  if (!saved) for (const employee of legacy.employees) if (['e9','e10'].includes(employee.id)) employee.position = '1/2 Бригадир';
  const references = referencesFromLegacy(legacy);
  const schedules = {};
  const addMonth = (brigadeId,period,month) => {
    schedules[`${brigadeId}:${period}`] = {
      brigadeId,period,roster:[...month.roster],
      days:month.days.map(day => ({
        ...clone(day),id:`${brigadeId}:${day.date}`,brigadeId,version:1,
        adjustmentComment:day.adjustmentComment || '',employeeAdjustments:day.employeeAdjustments || [],
        rows:day.rows.map(row => ({objectExtra:'',notesExtra:'',tech2:'',...clone(row)})),
      })),
    };
  };
  const addBrigade = (brigadeId,schedule) => {
    for (const [period,month] of Object.entries(schedule.periods || {})) addMonth(brigadeId,period,month);
    addMonth(brigadeId,schedule.period,schedule);
  };
  for (const [brigadeId,schedule] of Object.entries(legacy.brigadeSchedules || {})) addBrigade(brigadeId,schedule);
  addBrigade(legacy.brigadeId,legacy);
  const years = [...new Set(Object.values(schedules).map(schedule => Number(schedule.period.slice(0,4))))].sort().map(year => ({year,closed:false,version:1}));
  const employeeId = references.employees.find(employee => employee.id === 'e4')?.id || references.employees.find(employee => employee.group === 'field')?.id || '';
  const fieldName = references.employees.find(employee => employee.id === employeeId)?.name || 'Сотрудник';
  const users = [
    {id:'demo-admin',login:'admin',password:'admin',name:'Администратор',role:'admin',employeeId:null},
    {id:'demo-office',login:'office',password:'office',name:'Елена Павлова',role:'office',employeeId:references.employees.find(employee => employee.group === 'office')?.id || null},
    {id:'demo-field',login:'field',password:'field',name:fieldName,role:'field',employeeId},
    {id:'demo-newcomer',login:'newcomer',password:'newcomer',name:fieldName,role:'field',employeeId,mustChangePassword:true},
  ].map(user => ({active:true,mustChangePassword:false,version:1,...user}));
  return {
    schema:1,references,years,users,schedules,vacations:[],audit:[],
    preferredPeriod:legacy.period,preferredBrigadeId:legacy.brigadeId,
    legacyObjects:clone(legacy.objects || []),
    settings:{
      shiftHelp:'Состав смены можно изменить. В работу подставляются сотрудники со статусами РД и ДЕЖ. В ячейке сотрудника можно убрать участие. Пустой расчетный итог возвращает автоматический расчет.',
      usageHelp:'Выберите период и бригаду. Для изменения графика нажмите «Начать редактирование». После работы нажмите «Завершить редактирование».\n\nКнопка «Заполнить» переносит выбранный состав только в пустые смены месяца. Разверните день, чтобы просмотреть и изменить работы. Время можно вводить вручную. Диапазон из Excel вставляется в соседние ячейки.\n\nПотяните границу любой ячейки, чтобы изменить ширину всей колонки. Дополнительные колонки включаются отдельно. В меню пользователя можно сменить пароль и выйти.\n\nАдминистратор управляет справочниками и пользователями; офис редактирует графики. Сотрудник видит только свои работы. Поиск, экспорт и журнал действий доступны администратору и офису.\n\nДемо сохраняет изменения только в этом браузере. Данные между устройствами не синхронизируются.',
    },
  };
}

export function createDemoDatabase() {
  const raw = globalThis.localStorage?.getItem(legacyStorageKey);
  if (!raw) return convertLegacyDatabase(null);
  try { return convertLegacyDatabase(JSON.parse(raw)); }
  catch { throw new Error('Не удалось перенести сохраненные данные старого демо. Исходные данные сохранены в браузере без изменений.'); }
}
