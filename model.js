export const SCHEMA = 2;
export const ROLE_NAMES = ['Бригадир', 'Основной напарник', 'Доп. №1', 'Доп. №2', 'Доп. №2 — второй сотрудник'];
export const JOB_FIELDS = ['time','person0','person1','person2','person3','invoice','pay','adjustment','shiftHours','objectId','type','hours','object','phone','objectNotes','task','notes','tech'];
export const clone = value => JSON.parse(JSON.stringify(value));
export const uid = () => globalThis.crypto?.randomUUID?.() || `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function blankRow() { return {id:uid(),time:'',people:[null,null,null,null,null],invoice:'',type:'',hours:null,objectId:'',object:'',phone:'',objectNotes:'',task:'',notes:'',tech:''}; }
function originalState() {
  const employees = [
    {id:'e1',name:'Алексей С.',group:'Поля',driver:true,active:true},
    {id:'e2',name:'Дмитрий К.',group:'Поля',driver:false,active:true},
    {id:'e3',name:'Андрей М.',group:'Поля',driver:false,active:true},
    {id:'e4',name:'Михаил Р.',group:'Поля',driver:true,active:true},
    {id:'e5',name:'Сергей В.',group:'Поля',driver:false,active:true},
    {id:'e6',name:'Виктор Л.',group:'Поля',driver:false,active:true},
    {id:'e7',name:'Елена П.',group:'Офис',driver:false,active:true},
    {id:'e8',name:'Павел Н.',group:'Поля',driver:true,active:true},
    {id:'e9',name:'Игорь Т.',group:'Поля',driver:true,active:true},
    {id:'e10',name:'Роман Е.',group:'Поля',driver:true,active:true},
    {id:'e11',name:'Олег Ф.',group:'Поля',driver:true,active:true},
    {id:'e12',name:'Анна Д.',group:'Офис',driver:false,active:true},
    {id:'e13',name:'Мария И.',group:'Офис',driver:false,active:true}
  ];
  const fullNames=['Алексей Соколов','Дмитрий Крылов','Андрей Морозов','Михаил Романов','Сергей Волков','Виктор Лебедев','Елена Павлова','Павел Никитин','Игорь Тихонов','Роман Егоров','Олег Фомин','Анна Демина','Мария Ильина'];
  employees.forEach((e,i)=>{e.fullName=fullNames[i];e.position=e.group==='Офис'?'':i<3?'Бригадир':[3,7].includes(i)?'1/2 Бригадир':'Техник';});
  const objects = [
    {id:'101',name:'Ресторан «Север» · ТЦ «Город»',phone:'+7 (000) 000-00-01 · администратор',notes:'Работы после 22:00. Вход через зону разгрузки.',task:'Откачать жироуловитель. Промыть емкость и проверить соединения.',tech:''},
    {id:'102',name:'Кафе «Маяк» · деловой центр',phone:'+7 (000) 000-00-02 · инженер',notes:'Въезд согласовать за час до начала. Пропуск на посту охраны.',task:'Очистить зонты и фильтры. Собрать загрязнения, убрать рабочую зону.',tech:''},
    {id:'103',name:'Кухня «Парк» · торговый квартал',phone:'+7 (000) 000-00-03 · управляющий',notes:'Выход на кровлю через инженера. Использовать парковку у въезда.',task:'Очистить 4 зонта, воздуховоды и вентилятор. Проверить крыльчатку. Убрать рабочую зону.',tech:''},
    {id:'104',name:'Столовая «Линия» · бизнес-парк',phone:'+7 (000) 000-00-04 · ответственный',notes:'Осмотр до открытия. Согласовать доступ в техническое помещение.',task:'Осмотр вентиляции, фотофиксация и перечень необходимых работ.',tech:''},
    {id:'105',name:'Пекарня «Колос» · квартал «Южный»',phone:'+7 (000) 000-00-05 · старший смены',notes:'Вход со двора. Закончить работы до утренней выпечки.',task:'Очистить вытяжной зонт и фильтры производственной зоны.',tech:''},
    {id:'106',name:'Фуд-холл «Площадь» · центральная галерея',phone:'+7 (000) 000-00-06 · дежурный инженер',notes:'Разгрузка у служебного входа. Согласовать отключение оборудования.',task:'Проверить и обслужить вентиляцию кухонного блока.',tech:''},
    {id:'107',name:'Фитнес-клуб «Ритм» · комплекс «Восток»',phone:'+7 (000) 000-00-07 · администратор',notes:'Технический вход у парковки. Работа по согласованию с инженером.',task:'Очистить кондиционеры и проверить отвод конденсата.',tech:''},
    {id:'108',name:'Кафе «Сад» · павильон у набережной',phone:'+7 (000) 000-00-08 · управляющий',notes:'Проезд через въезд № 2. Инструмент заносить со стороны кухни.',task:'Обслужить жироуловитель и промыть соединения.',tech:''}
  ];
  const workTypes = [
    ['ПРЗД','Переезд'],['ПХД','ПХД'],['ОСМ','Осмотр'],['ПЖУ','Производство ЖУ'],['ЧК','Чистка канализации'],['ЧКНД','Чистка кондиционеров'],['ЧХЛД','Чистка холодильников'],['ЧВ','Чистка вентиляции'],['ЖУ','ТО жироуловителей'],['ЧВ+ЖУ','Чистка вентиляции + 1-2 ЖУ']
  ].map(([code,label])=>({code,label}));
  const statuses = [['РД','Рабочий день'],['ВЫХ','Выходной'],['ДЕЖ','Дежурство'],['ОТП','Отпуск'],['БЛН','Больничный'],['ОТГ','Отгул'],...['Б1','Б2','Б3','Б4'].map(x=>[x,`Работа в бригаде ${x.slice(1)}`])].map(([code,label])=>({code,label}));
  const roster=['e1','e2','','',''];
  const days=Array.from({length:30},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,roster:[...roster],statuses:['РД','РД','','',''],pay:null,adjustment:null,hoursOverride:null,rows:Array.from({length:5},blankRow)}));
  const positions=[{code:'Бригадир',label:'Бригадир',description:'',terms:''},{code:'1/2 Бригадир',label:'1/2 Бригадир',description:'Бригадир на стажировке или 2 бригадира в одной бригаде',terms:'50% от бригадирских'},{code:'Техник',label:'Техник',description:'',terms:''},{code:'Стажер',label:'Стажер',description:'Обучившийся ученик. Статус на месяц; график с нагрузкой бригады не более 8 часов.',terms:'−10% от ставки в пользу учителя'},{code:'Ученик',label:'Ученик',description:'Пробные 1–3 дня, затем обучение 2–4 недели.',terms:'Пробные дни — 3 000 ₽'}];
  const rates=[['leave','ОТП',null,1500,1500],['zero','0 часов',0,1500,1500],['h3','До 3 часов',3,2500,2500],['h5','Свыше 3 до 5 часов',5,3300,3700],['h7','Свыше 5 до 7 часов',7,4500,5000],['h9','Свыше 7 до 9 часов',9,6400,7000],['h10','Свыше 9 до 10 часов',10,7500,8300],['h11','Свыше 10 до 11 часов',11,8500,9500],['more','Свыше 11 часов',null,10400,11500]].map(([id,label,maxHours,nonDriver,driver])=>({id,label,maxHours,nonDriver,driver}));
  const state={schema:SCHEMA,revision:'',employees,objects,workTypes,statuses,positions,rates,invoiceStates:['ДА','ОК','НЕТ'],groups:['Поля','Офис'],roster,days,collapsedDays:[],monthCollapsed:false};
  function example(type,hours,objectId,time='') { const row=blankRow();row.type=type;row.hours=hours;row.time=time;row.invoice=type==='ПРЗД'?'':'НЕТ';if(objectId) applyObject(state,row,objectId);return row; }
  days[0].roster=['e1','e2','e3','e4','e5'];days[0].statuses=['РД','РД','РД','РД','РД'];
  days[0].rows=[example('ЖУ',.5,'101','22:00'),example('ПРЗД',.5),example('ЖУ',.5,'102'),example('ПРЗД',1),example('ЧВ',8,'103'),example('ЖУ',.25,'103'),example('ОСМ',.25,'104')];
  days[0].rows[4].people[2]='';days[0].rows[5].people[2]='';days[0].rows[6].people[1]='';days[0].rows[6].people[2]='';
  days[1].roster=['e1','e2','e6','',''];days[1].statuses=['РД','ОТГ','РД','',''];
  days[1].rows=[example('ЖУ',.5,'101','22:00'),example('ПРЗД',.5),example('ЖУ',.5,'102'),example('ПРЗД',1),example('ЧВ',8,'103')];
  days[2].statuses=['ОТП','Б2','','',''];
  return state;
}

const PERIOD_FIELDS = ['roster','days','collapsedDays','monthCollapsed'];
const emptyRoster = () => ['', '', '', '', ''];

function periodParts(key) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(key));
  if (!match || Number(match[1]) < 1900) throw Error('Укажите корректный месяц в формате ГГГГ-ММ (год от 1900).');
  return {year:Number(match[1]),month:Number(match[2])};
}

function periodCalendar(key, roster = emptyRoster()) {
  const {year,month} = periodParts(key);
  const length = new Date(Date.UTC(year,month,0)).getUTCDate();
  return {
    roster:[...roster],
    days:Array.from({length},(_,index)=>({date:`${key}-${String(index+1).padStart(2,'0')}`,roster:[...roster],statuses:roster.map(id=>id?'РД':''),pay:null,adjustment:null,hoursOverride:null,rows:Array.from({length:5},blankRow)})),
    collapsedDays:[],monthCollapsed:false
  };
}

function periodSnapshot(state) { return Object.fromEntries(PERIOD_FIELDS.map(field=>[field,state[field]])); }

export function switchPeriod(state,key) {
  periodParts(key);
  if (state.period === key) return state;
  const next = state.periods?.[key] || periodCalendar(key);
  if (!state.periods) state.periods = {};
  state.periods[state.period] = periodSnapshot(state);
  delete state.periods[key];
  Object.assign(state,next,{period:key});
  return state;
}

export function allDays(state) {
  return [...(state.days || []),...Object.entries(state.periods || {}).filter(([key])=>key !== state.period).flatMap(([,period])=>period.days || [])];
}

function demoRoster(state, wanted) {
  const eligible = eligibleEmployees(state).map(employee=>employee.id), used = new Set();
  return wanted.map(id=>{
    if (!id) return '';
    const selected = eligible.includes(id) && !used.has(id) ? id : eligible.find(candidate=>!used.has(candidate)) || '';
    if (selected) used.add(selected);
    return selected;
  });
}

function seedDay(state,date) {
  const august = date.startsWith('2026-08'), number = Number(date.slice(-2));
  const extra = number%2 ? 'e3' : 'e6';
  const wanted = august ? ['e8','e6',number%3 === 0?'e10':'e4','',''] : ['e1','e2',extra,'',''];
  if (number%7 === 0) wanted.splice(0,3,...(august ? ['e1','e3','e5'] : ['e8','e6','e10']));
  if (date === '2026-09-03') wanted.splice(0,5,'e1','e2','e3','e4','');
  const roster = demoRoster(state,wanted);
  const day = {date,roster,statuses:roster.map(id=>id?'РД':''),pay:null,adjustment:null,hoursOverride:null,rows:[]};
  if (date === '2026-09-03') { if (roster[0] === 'e1') day.statuses[0]='ОТП'; if (roster[1] === 'e2') day.statuses[1]='Б2'; }
  const choices = ['ЖУ','ЧВ','ОСМ','ЧК','ЧКНД','ЧХЛД','ЧВ+ЖУ'].filter(code=>state.workTypes.some(type=>type.code === code));
  if (!choices.length) choices.push(...state.workTypes.filter(type=>type.code !== 'ПРЗД').map(type=>type.code));
  const tasks = {
    ЖУ:'Очистить жироуловитель, промыть ёмкость и проверить герметичность соединений.',
    ЧВ:'Очистить зонты, фильтры и доступный участок воздуховода. Проверить работу вентилятора.',
    ОСМ:'Осмотреть оборудование, измерить тягу и составить перечень необходимых работ.',
    ЧК:'Промыть участок канализации и проверить свободный проход воды.',
    ЧКНД:'Очистить кондиционеры, фильтры и дренажные поддоны. Проверить отвод конденсата.',
    ЧХЛД:'Очистить холодильное оборудование и конденсатор. Проверить температурный режим.',
    'ЧВ+ЖУ':'Очистить вентиляцию кухонного блока и обслужить жироуловитель.'
  };
  const invoice = state.invoiceStates.includes('НЕТ') ? 'НЕТ' : state.invoiceStates[0] || '';
  for (let index=0;index<5;index++) {
    const row=blankRow(), travel=index%2 === 1;
    const type=travel && state.workTypes.some(type=>type.code === 'ПРЗД') ? 'ПРЗД' : choices[(number+index+(august?2:0))%Math.max(1,choices.length)] || '';
    row.type=type;
    row.hours=travel ? (index===1?.5:.25) : type==='ОСМ'?.75:type==='ЖУ'?1:type==='ЧВ+ЖУ'?3.5:1.5+((number+index)%3)*.5;
    row.invoice=type==='ПРЗД'?'':invoice;
    if (!travel) {
      const object=state.objects[(number+index+(august?3:0))%Math.max(1,state.objects.length)];
      if (object) applyObject(state,row,object.id);
      row.task=tasks[type] || state.workTypes.find(entry=>entry.code===type)?.label || 'Плановое обслуживание оборудования.';
      row.time=['18:00','', '21:00','', '23:30'][index];
      row.notes=`Плановый выезд ${date.slice(8)}.${date.slice(5,7)}. ${index===0?'Согласовать прибытие с ответственным.':index===2?'Подготовить рабочую зону до начала обслуживания.':'После работ передать оборудование ответственному.'}`;
    } else {
      row.objectNotes=index===1?'Переезд ко второму объекту смены.':'Переезд к заключительному объекту.';
    }
    day.rows.push(row);
  }
  return day;
}

function seededAugust(state) {
  const period=periodCalendar('2026-08',demoRoster(state,['e8','e6','','','']));
  period.days=period.days.map(day=>seedDay(state,day.date));
  return period;
}

export function initialState() {
  const state=originalState();
  state.period='2026-09';
  state.days=state.days.map((day,index)=>index<2?day:seedDay(state,day.date));
  state.periods={'2026-08':seededAugust(state)};
  return state;
}

function normalizePeriod(snapshot,key) {
  if (!snapshot || !Array.isArray(snapshot.days) || !Array.isArray(snapshot.roster) || snapshot.roster.length !== 5) throw Error('Сохранённый график имеет неверную структуру.');
  const calendar=periodCalendar(key,snapshot.roster);
  const validDates=new Set(calendar.days.map(day=>day.date)), seen=new Set();
  for (const day of snapshot.days) {
    if (!validDates.has(day.date) || seen.has(day.date) || !Array.isArray(day.roster) || day.roster.length!==5 || !Array.isArray(day.statuses) || day.statuses.length!==5 || !Array.isArray(day.rows)) throw Error('В сохранённом графике неверные или повторяющиеся даты.');
    if (day.rows.some(row=>!row || !Array.isArray(row.people) || row.people.length!==5)) throw Error('Сохранённые работы имеют неверную структуру.');
    seen.add(day.date);
  }
  const saved=new Map(snapshot.days.map(day=>[day.date,day]));
  calendar.days=calendar.days.map(day=>saved.get(day.date) || day);
  calendar.collapsedDays=[...new Set((snapshot.collapsedDays || []).filter(date=>validDates.has(date)))];
  calendar.monthCollapsed=Boolean(snapshot.monthCollapsed);
  return calendar;
}

function originalBlankDay(day,baseline) {
  if (!baseline || baseline.rows.some(rowActive) || day.rows.length !== baseline.rows.length) return false;
  const comparable=value=>JSON.stringify({...value,rows:value.rows.map(({id,...row})=>row)});
  return comparable(day) === comparable(baseline);
}

export function migrateState(saved) {
  if (saved === null || saved === undefined) return initialState();
  if (!saved || ![1,SCHEMA].includes(saved.schema)) throw Error('Версия сохранённых данных не поддерживается.');
  const state=clone(saved), baseline=originalState();
  for (const key of ['employees','objects','workTypes','statuses','positions','rates','invoiceStates','groups']) {
    if (state[key] === undefined && ['positions','rates','invoiceStates','groups'].includes(key)) state[key]=clone(baseline[key]);
    if (!Array.isArray(state[key])) throw Error('Сохранённые справочники имеют неверную структуру.');
  }
  const legacy=state.schema===1;
  const key=legacy?'2026-09':state.period;
  periodParts(key);
  const active=normalizePeriod(state,key);
  if (legacy) active.days=active.days.map(day=>originalBlankDay(day,baseline.days.find(original=>original.date===day.date))?seedDay(state,day.date):day);
  const periods={};
  if (state.periods && (typeof state.periods !== 'object' || Array.isArray(state.periods))) throw Error('Сохранённые месяцы имеют неверную структуру.');
  for (const [period,snapshot] of Object.entries(state.periods || {})) {
    periodParts(period);
    if (period!==key) periods[period]=normalizePeriod(snapshot,period);
  }
  if (legacy && !periods['2026-08']) periods['2026-08']=seededAugust(state);
  Object.assign(state,active,{schema:SCHEMA,period:key,periods});
  return state;
}
export function employeeName(state,id) { return state.employees.find(e=>e.id===id)?.name || ''; }
export function eligibleEmployees(state) { return state.employees.filter(e=>e.active && e.group==='Поля'); }
export function participants(day,row) { return row.people.map((person,index)=>person===null ? (row.type && ['РД','ДЕЖ'].includes(day.statuses[index]) ? day.roster[index] : '') : person).filter(Boolean); }
export function participantAt(day,row,index) { return row.people[index]===null ? (row.type && ['РД','ДЕЖ'].includes(day.statuses[index]) ? day.roster[index] : '') : row.people[index]; }
export function rowHasData(row) { return Boolean(row.time||row.objectId||row.object||row.phone||row.task||row.notes||row.objectNotes||row.tech||row.invoice||row.hours!==null||row.people.some(x=>x)); }
export function rowActive(row) { return Boolean(row.type||rowHasData(row)); }
export function calculatedHours(day) { return day.rows.reduce((sum,r)=>sum+(Number(r.hours)||0),0); }
export function dayHours(day) { return day.hoursOverride===null ? calculatedHours(day) : day.hoursOverride; }
export function monthHours(state) { return state.days.reduce((sum,d)=>sum+dayHours(d),0); }
export function typeTotals(state) { const totals={};for(const d of state.days)for(const r of d.rows)if(r.type)totals[r.type]=(totals[r.type]||0)+(Number(r.hours)||0);return Object.entries(totals).filter(([,h])=>h!==0).sort((a,b)=>b[1]-a[1]); }
export function employeeHours(state,id) { return state.days.reduce((sum,d)=>sum+d.rows.reduce((n,r)=>n+(participants(d,r).includes(id)?Number(r.hours)||0:0),0),0); }
export function basicPay(state,day) { let sum=0;const roster=new Set(day.roster.filter(Boolean));for(const id of roster){const employee=state.employees.find(e=>e.id===id);const index=day.roster.indexOf(id);const status=day.statuses[index];if(!employee)continue;let rate;if(status==='ОТП')rate=state.rates.find(r=>r.id==='leave');else if(['РД','ДЕЖ'].includes(status)){const hours=day.rows.reduce((n,r)=>n+(participants(day,r).includes(id)?Number(r.hours)||0:0),0);rate=state.rates.find(r=>r.id!=='leave'&&r.maxHours!==null&&hours<=r.maxHours)||state.rates.find(r=>r.id==='more');}else continue;if(rate)sum+=Number(employee.driver?rate.driver:rate.nonDriver)||0;}return sum; }
export function dayPay(state,day) { return day.pay===null?basicPay(state,day):day.pay; }
export function applyObject(state,row,id) { const obj=state.objects.find(o=>o.id===id);if(!obj)throw Error('Выберите объект из справочника.');row.objectId=id;row.object=obj.name;row.phone=obj.phone;row.objectNotes=obj.notes;row.task=obj.task;row.tech=obj.tech; }
function numeric(value,label,min,max) { if(String(value).trim()==='')return null;const n=Number(String(value).replace(',','.'));if(!Number.isFinite(n)||n<min||n>max)throw Error(`${label}: допустимо число от ${min} до ${max}.`);return n; }
export function validateRoster(state,roster) { if(!Array.isArray(roster)||roster.length!==5)throw Error('В составе должно быть пять позиций.');const ids=roster.filter(Boolean);if(new Set(ids).size!==ids.length)throw Error('Один сотрудник не может занимать две роли в одной смене.');if(ids.some(id=>!eligibleEmployees(state).some(e=>e.id===id)))throw Error('Выберите действующих сотрудников группы «Поля».'); }
export function applyRoster(state,roster,from,to) { const dates=new Set(state.days.map(day=>day.date));if(typeof from!=='string'||typeof to!=='string'||from>to||!dates.has(from)||!dates.has(to))throw Error('Укажите корректный период внутри выбранного месяца.');validateRoster(state,roster);let count=0;state.roster=[...roster];for(const day of state.days){if(day.date<from||day.date>to)continue;const changed=roster.map((id,i)=>id!==day.roster[i]);day.statuses=roster.map((id,i)=>!id?'':changed[i]?'РД':day.statuses[i]||'РД');day.roster=[...roster];for(const row of day.rows)changed.forEach((v,i)=>{if(v)row.people[i]=null;});count++;}return count; }
export function setJobField(state,day,row,field,value) {
  if(field==='hours'){row.hours=numeric(value,'Часы',0,24);return;}
  if(field==='pay'||field==='adjustment'||field==='shiftHours'){const key={pay:'pay',adjustment:'adjustment',shiftHours:'hoursOverride'}[field];day[key]=numeric(value,'Значение',field==='adjustment'?-10000000:0,field==='shiftHours'?1000:10000000);return;}
  if(field==='type'){if(value&&!state.workTypes.some(t=>t.code===value))throw Error('Вид работы должен быть из справочника.');row.type=value;if(value==='ПРЗД')row.invoice='';else if(value&&!row.invoice)row.invoice='НЕТ';return;}
  if(field==='invoice'){if(value&&!state.invoiceStates.includes(value))throw Error('Выберите счет из справочника.');row.invoice=value;return;}
  if(field==='objectId'){if(!value){row.objectId='';return;}applyObject(state,row,value);return;}
  if(field.startsWith('person')){const index=Number(field.slice(6));if(!Number.isInteger(index)||index<0||index>4)throw Error('Неизвестная роль.');const id=value==='__auto'?null:value;if(id&&id!==day.roster[index])throw Error('Замена сотрудника выполняется в составе смены. В задании можно убрать или вернуть его участие.');const before=row.people[index];row.people[index]=id;const ids=participants(day,row);if(new Set(ids).size!==ids.length){row.people[index]=before;throw Error('Сотрудник уже указан в этой работе.');}return;}
  if(field==='time'&&value&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error('Время должно быть в формате ЧЧ:ММ.');
  if(field==='tech'&&value&&!/^https?:\/\//i.test(value))throw Error('Ссылка должна начинаться с https:// или http://.');
  if(!['time','object','phone','objectNotes','task','notes','tech'].includes(field))throw Error('Неизвестное поле.');
  if(value.length>5000)throw Error('В одной ячейке допускается до 5000 символов.');row[field]=value;
}
export function parseTsv(text) {
  const rows=[];let row=[],cell='',quoted=false;
  text=text.replace(/\r\n/g,'\n');
  for(let i=0;i<text.length;i++) { const c=text[i];if(c==='"'&&(quoted||cell==='')){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c==='\t'||c==='\n')){row.push(cell);cell='';if(c==='\n'){rows.push(row);row=[];}}else cell+=c; }
  if(quoted)throw Error('Незакрытые кавычки в скопированном диапазоне.');
  if(cell!==''||row.length){row.push(cell);rows.push(row);}return rows;
}
export function applyPaste(state,date,rowIndex,column,text) {
  const day=state.days.find(d=>d.date===date);if(!day)throw Error('Смена не найдена.');
  const lines=parseTsv(text);
  if(lines.length>100||lines.some(line=>line.length+column>JOB_FIELDS.length))throw Error('Диапазон выходит за границы таблицы (не более 100 строк).');
  while(day.rows.length<rowIndex+lines.length)day.rows.push(blankRow(),blankRow());
  const mergedValues={};
  lines.forEach((cells,r)=>cells.forEach((value,c)=>{const field=JOB_FIELDS[column+c];let v=value.trim();
    if(['pay','adjustment','shiftHours'].includes(field)){if(r>0&&!v)return;if(field in mergedValues&&mergedValues[field]!==v)throw Error('В диапазоне указаны разные итоги одной смены.');mergedValues[field]=v;}
    if(field==='person3'){const names=v?v.split(',').map(n=>n.trim()).filter(Boolean):[];if(names.length>2)throw Error('В Доп. №2 можно указать до двух сотрудников.');const ids=names.map(name=>{const employee=state.employees.find(e=>e.name===name);if(!employee)throw Error(`Сотрудник «${name}» отсутствует в справочнике.`);if(!day.roster.slice(3,5).includes(employee.id))throw Error('Сотрудник должен входить в Доп. №2 состава смены.');return employee.id;});if(new Set(ids).size!==ids.length)throw Error('Сотрудник указан дважды.');for(let i=3;i<5;i++)setJobField(state,day,day.rows[rowIndex+r],`person${i}`,ids.includes(day.roster[i])?day.roster[i]:'');return;}
    if(field.startsWith('person')){const employee=state.employees.find(e=>e.name===v);if(v&&!employee)throw Error(`Сотрудник «${v}» отсутствует в справочнике.`);v=employee?.id||'';}
    if(field==='time')v=v.replace('.',':').replace(/^(\d):/,'0$1:');setJobField(state,day,day.rows[rowIndex+r],field,v);
  }));
}
