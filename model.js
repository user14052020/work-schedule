export const SCHEMA = 1;
export const ROLE_NAMES = ['Бригадир', 'Основной напарник', 'Доп. №1', 'Доп. №2', 'Доп. №2 — второй сотрудник'];
export const JOB_FIELDS = ['time','person0','person1','person2','person3','invoice','pay','adjustment','shiftHours','objectId','type','hours','object','phone','objectNotes','task','notes','tech'];
export const clone = value => JSON.parse(JSON.stringify(value));
export const uid = () => globalThis.crypto?.randomUUID?.() || `r-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function blankRow() { return {id:uid(),time:'',people:[null,null,null,null,null],invoice:'',type:'',hours:null,objectId:'',object:'',phone:'',objectNotes:'',task:'',notes:'',tech:''}; }
export function initialState() {
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
    {id:'104',name:'Столовая «Линия» · бизнес-парк',phone:'+7 (000) 000-00-04 · ответственный',notes:'Осмотр до открытия. Согласовать доступ в техническое помещение.',task:'Осмотр вентиляции, фотофиксация и перечень необходимых работ.',tech:''}
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
export function validateRoster(state,roster) { const ids=roster.filter(Boolean);if(new Set(ids).size!==ids.length)throw Error('Один сотрудник не может занимать две роли в одной смене.');if(ids.some(id=>!eligibleEmployees(state).some(e=>e.id===id)))throw Error('Выберите действующих сотрудников группы «Поля».'); }
export function applyRoster(state,roster,from,to) { if(!/^2026-09-\d{2}$/.test(from)||!/^2026-09-\d{2}$/.test(to)||from>to||from<'2026-09-01'||to>'2026-09-30')throw Error('Укажите корректный период в сентябре 2026 года.');validateRoster(state,roster);let count=0;state.roster=[...roster];for(const day of state.days){if(day.date<from||day.date>to)continue;const changed=roster.map((id,i)=>id!==day.roster[i]);day.statuses=roster.map((id,i)=>!id?'':changed[i]?'РД':day.statuses[i]||'РД');day.roster=[...roster];for(const row of day.rows)changed.forEach((v,i)=>{if(v)row.people[i]=null;});count++;}return count; }
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
export function toCsv(state) {
  const columns=['Дата','Время','Бригадир','Осн. напарник','Доп. №1','Доп. №2','Счет','ЗП за смену','Штрафы/премии','Часов за смену','№ объекта','Вид','Часов на бригаду','Объект','Телефон работ','Примечания по объекту','ТЗ','Примечания по работам','Техбаза',...ROLE_NAMES.flatMap(role=>[`${role} смены`,`Статус: ${role}`])];
  const rows=[columns];
  for(const day of state.days){
    let first=true;const active=day.rows.filter(rowActive);
    for(const r of active.length?active:[day.rows[0]]){
      const names=[0,1,2].map(i=>employeeName(state,participantAt(day,r,i)));
      names.push([3,4].map(i=>employeeName(state,participantAt(day,r,i))).filter(Boolean).join(', '));
      rows.push([day.date,r.time,...names,r.invoice,first?dayPay(state,day):'',first?day.adjustment:'',first?dayHours(day):'',r.objectId,r.type,r.hours,r.object,r.phone,r.objectNotes,r.task,r.notes,r.tech,...day.roster.flatMap((id,i)=>[employeeName(state,id),day.statuses[i]])]);first=false;
    }
  }
  const cell=value=>{let str=String(value??'');if(typeof value==='string'&&/^[\s]*[=+\-@]/.test(str))str="'"+str;return '"'+str.replace(/"/g,'""')+'"';};
  return '\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n');
}
