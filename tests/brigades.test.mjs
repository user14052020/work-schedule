import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA,initialState,clone,blankRow,switchPeriod,switchBrigade,brigadeName,migrateState,allDays,monthHours,employeeHours,participants,validateRoster,rowActive} from '../public/model.js';

const monthSnapshot = state => clone(Object.fromEntries(['period','days','roster','collapsedDays','monthCollapsed'].map(key=>[key,state[key]])));
const scheduleSnapshot = state => ({...monthSnapshot(state),periods:clone(state.periods)});
const assertMonth = (state,expected) => assert.deepEqual(monthSnapshot(state),expected);
const asSchema2 = state => {
  const saved=clone(state);
  saved.schema=2;
  for (const key of ['brigades','brigadeId','brigadeSchedules']) delete saved[key];
  return saved;
};

test('initial data includes four brigades and complete independent August/September schedules for B2',()=>{
  const state=initialState();
  assert.equal(SCHEMA,3);
  assert.equal(state.schema,3);
  assert.equal(state.brigadeId,'b1');
  assert.equal(brigadeName(state),'Б1');
  assert.deepEqual(state.brigades.map(({id,code,label})=>({id,code,label})),[
    {id:'b1',code:'Б1',label:'Бригада 1'},
    {id:'b2',code:'Б2',label:'Бригада 2'},
    {id:'b3',code:'Б3',label:'Бригада 3'},
    {id:'b4',code:'Б4',label:'Бригада 4'}
  ]);
  const b1={september:monthSnapshot(state),august:clone(state.periods['2026-08'])};
  assert.equal(monthHours(state),204,'the existing B1 September example is preserved');
  assert.equal(allDays(state).length,182);
  const ids=allDays(state).flatMap(day=>day.rows.map(row=>row.id));
  assert.equal(new Set(ids).size,ids.length,'every job ID is unique across brigades and months');
  const eligible=new Set(state.employees.filter(employee=>employee.active && employee.group==='Поля').map(employee=>employee.id));

  switchBrigade(state,'b2');
  assert.equal(state.period,'2026-09');
  assert.equal(brigadeName(state),'Б2');
  for (const [period,length,reference] of [['2026-09',30,b1.september],['2026-08',31,b1.august]]) {
    switchPeriod(state,period);
    assert.equal(state.days.length,length);
    assert.notDeepEqual(state.days.map(day=>day.roster),reference.days.map(day=>day.roster),'B2 uses its own crew');
    assert.notEqual(monthHours(state),reference.days.reduce((sum,day)=>sum+(day.hoursOverride ?? day.rows.reduce((hours,row)=>hours+(row.hours || 0),0)),0),'B2 has different hours');
    assert.notDeepEqual(state.days.map(day=>day.rows.map(row=>row.time)),reference.days.map(day=>day.rows.map(row=>row.time)),'B2 has different times');
    assert.notDeepEqual(state.days.map(day=>day.rows.map(row=>row.task)),reference.days.map(day=>day.rows.map(row=>row.task)),'B2 has different assignments');
    for (const day of state.days) {
      validateRoster(state,day.roster);
      assert(day.roster.filter(Boolean).every(id=>eligible.has(id)));
      assert(day.rows.some(row=>row.type && row.hours>0),`${period}: ${day.date} has jobs`);
      for (const row of day.rows.filter(rowActive)) {
        assert(state.workTypes.some(type=>type.code===row.type));
        assert(!row.objectId || state.objects.some(object=>object.id===row.objectId));
        const people=participants(day,row);
        assert(people.length>0,`${day.date}: ${row.type} has participants`);
        assert.equal(new Set(people).size,people.length);
        assert(people.every(id=>eligible.has(id)));
      }
    }
  }
  switchBrigade(state,'b1');
  assert.equal(state.period,'2026-08');
  assert.equal(monthHours(state),196.5,'the existing B1 August example is preserved');
  assert.equal(allDays(state).length,182,'switching cached schedules does not duplicate calendars');
});

test('brigade and month selections preserve each independent schedule, manual values and collapsed state',()=>{
  const state=initialState();
  const edit=(label,amount)=>{
    state.days[0].rows[0].task=label;
    state.days[0].rows[0].people[0]='';
    state.days[0].pay=amount;
    state.days[0].adjustment=-amount;
    state.days[0].hoursOverride=amount/100;
    state.roster=amount%2 ? ['e1','e3','','',''] : ['e8','e6','','',''];
    state.collapsedDays=[state.days[1].date];
    state.monthCollapsed=Boolean(amount%2);
    return monthSnapshot(state);
  };
  const b1September=edit('Б1 · сентябрь: ручное задание',501);
  switchPeriod(state,'2026-08');
  const b1August=edit('Б1 · август: ручное задание',602);
  assert.equal(switchBrigade(state,'b2'),state);
  assert.equal(state.period,'2026-08','brigade selection preserves the selected month');
  assert(!('b2' in state.brigadeSchedules));
  const b2August=edit('Б2 · август: ручное задание',703);
  switchPeriod(state,'2026-09');
  const b2September=edit('Б2 · сентябрь: ручное задание',804);
  switchBrigade(state,'b1');
  assertMonth(state,b1September);
  assert(!('b1' in state.brigadeSchedules));
  switchPeriod(state,'2026-08');
  assertMonth(state,b1August);
  switchBrigade(state,'b2');
  assertMonth(state,b2August);
  switchPeriod(state,'2026-09');
  assertMonth(state,b2September);
  assert.equal(allDays(state).length,182);
});

test('invalid brigade selections are atomic and selecting the current brigade is a no-op',()=>{
  const state=initialState();
  switchPeriod(state,'2026-08');
  state.days[0].rows[0].notes='Сохранить текущую правку';
  const before=clone(state), days=state.days;
  assert.equal(switchBrigade(state,'b1'),state);
  assert.equal(state.days,days);
  assert.deepEqual(state,before);
  for (const id of ['b5','Б1','',null,undefined,1,{}]) {
    assert.throws(()=>switchBrigade(state,id));
    assert.deepEqual(state,before,`invalid selection ${String(id)} must not change state`);
  }
});

test('B3 and B4 start blank and newly selected months remain independent real calendars',()=>{
  const state=initialState();
  for (const id of ['b3','b4']) {
    switchBrigade(state,id);
    assert.equal(state.period,'2026-09');
    assert.equal(state.days.length,30);
    assert.equal(monthHours(state),0);
    assert.deepEqual(state.roster,['','','','','']);
    assert(state.days.every(day=>day.roster.every(value=>!value) && day.statuses.every(value=>!value) && day.rows.every(row=>!rowActive(row))));
    assert.equal(employeeHours(state,'e1'),0);
  }
  switchPeriod(state,'2028-02');
  assert.equal(state.days.length,29);
  assert.equal(state.days.at(-1).date,'2028-02-29');
  state.days[28].rows[0].notes='Только Б4, високосный день';
  const b4February=monthSnapshot(state);
  switchBrigade(state,'b3');
  assert.equal(state.period,'2028-02');
  assert.equal(state.days.length,29);
  assert(state.days.every(day=>day.rows.every(row=>!rowActive(row))));
  state.days[0].rows[0].notes='Только Б3';
  switchBrigade(state,'b4');
  assertMonth(state,b4February);
  assert.equal(allDays(state).length,240);
  const ids=allDays(state).flatMap(day=>day.rows.map(row=>row.id));
  assert.equal(new Set(ids).size,ids.length);
});

test('renaming a brigade preserves its schedule through stable IDs',()=>{
  const state=initialState();
  state.days[0].rows[0].task='График сохраняется после переименования';
  const original=scheduleSnapshot(state);
  state.brigades.find(brigade=>brigade.id==='b1').code='Б9';
  state.brigades.find(brigade=>brigade.id==='b1').label='Северная бригада';
  assert.equal(brigadeName(state),'Б9');
  switchBrigade(state,'b2');
  assert.equal(brigadeName(state),'Б2');
  switchBrigade(state,'b1');
  assert.equal(brigadeName(state),'Б9');
  assert.deepEqual(scheduleSnapshot(state),original);
  const before=clone(state);
  assert.throws(()=>switchBrigade(state,'Б9'),'display codes are not storage IDs');
  assert.deepEqual(state,before);
});

test('schema-2 migration preserves B1 active and inactive edits regardless of selected month',()=>{
  for (const selected of ['2026-08','2027-02']) {
    const state=initialState();
    state.days[3].rows=Array.from({length:5},blankRow);
    state.days[0].pay=0;
    state.days[1].rows[0].task='Старое сентябрьское задание';
    switchPeriod(state,'2026-08');
    state.days[0].rows[0].task='Старое августовское задание';
    state.collapsedDays=['2026-08-03'];
    state.monthCollapsed=true;
    switchPeriod(state,'2027-02');
    state.days[27].rows[0].notes='Будущая заявка';
    state.days[27].pay=4321;
    state.roster=['e1','e3','','',''];
    switchPeriod(state,selected);
    state.employees[0].name='Имя клиента';
    state.objects[0].notes='Личная заметка об объекте';
    const saved=asSchema2(state), before=clone(saved);
    const migrated=migrateState(saved);
    assert.deepEqual(saved,before,'migration does not mutate the source');
    assert.equal(migrated.schema,3);
    assert.equal(migrated.brigadeId,'b1');
    assert.equal(migrated.period,selected);
    assert.deepEqual(scheduleSnapshot(migrated),scheduleSnapshot(before),'all old B1 schedules are retained');
    for (const key of ['employees','objects','workTypes','statuses','positions','rates','invoiceStates','groups']) assert.deepEqual(migrated[key],before[key]);
    switchBrigade(migrated,'b2');
    assert.equal(migrated.period,selected,'migration keeps the selected month when changing brigade');
    for (const period of ['2026-08','2026-09']) {
      switchPeriod(migrated,period);
      assert(migrated.days.every(day=>day.rows.some(row=>row.type && row.hours>0)),'B2 receives demo data');
    }
    switchBrigade(migrated,'b1');
    assert(migrated.days[3].rows.every(row=>!rowActive(row)),'a deliberately cleared B1 September day stays clear');
    switchPeriod(migrated,selected);
    assert.deepEqual(scheduleSnapshot(migrated),scheduleSnapshot(before));
  }
});

test('schema-3 round-trip preserves all brigades, historical months and deliberately cleared jobs',()=>{
  const state=initialState();
  state.brigades[1].code='СМ2';
  state.brigades[1].label='Вторая смена';
  state.days[0].rows[0].task='Б1 — собственное ТЗ';
  switchBrigade(state,'b2');
  switchPeriod(state,'2026-08');
  state.days[4].rows=Array.from({length:5},blankRow);
  state.days[4].pay=0;
  state.collapsedDays=['2026-08-05'];state.monthCollapsed=true;
  const b2August=monthSnapshot(state);
  switchBrigade(state,'b3');
  state.days[0].rows[0].notes='Новая заявка Б3';
  switchPeriod(state,'2027-01');
  state.days[0].rows[0].notes='Будущий год Б3';
  switchBrigade(state,'b4');
  state.days[0].rows[0].notes='Будущий год Б4';
  const before=clone(state), restored=migrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored,before);
  assert.deepEqual(state,before);
  assert.deepEqual(migrateState(restored),restored,'schema-3 migration is idempotent');
  switchPeriod(restored,'2026-08');
  switchBrigade(restored,'b2');
  assert.equal(brigadeName(restored),'СМ2');
  assertMonth(restored,b2August);
  assert(restored.days[4].rows.every(row=>!rowActive(row)));
  const invalid=clone(before);invalid.brigadeId='unknown';
  assert.throws(()=>migrateState(invalid));
  assert.deepEqual(invalid,{...before,brigadeId:'unknown'});
});

test('schema-1 migration assigns the existing sheet to B1 and initializes other brigades',()=>{
  const saved=asSchema2(initialState());
  saved.schema=1;
  delete saved.period;delete saved.periods;
  saved.days[0].rows=[blankRow()];
  saved.days[1].rows[0].task='Правка в первой версии';
  saved.days[1].hoursOverride=12.5;
  saved.collapsedDays=['2026-09-02'];saved.monthCollapsed=true;
  const before=clone(saved), migrated=migrateState(saved);
  assert.deepEqual(saved,before);
  assert.equal(migrated.schema,3);
  assert.equal(migrated.brigadeId,'b1');
  assert.equal(migrated.period,'2026-09');
  assert.deepEqual(migrated.days[0],before.days[0]);
  assert.deepEqual(migrated.days[1],before.days[1]);
  assert.deepEqual(migrated.collapsedDays,before.collapsedDays);
  assert.equal(migrated.monthCollapsed,true);
  assert.equal(allDays(migrated).length,182);
  switchBrigade(migrated,'b2');
  assert(migrated.days.every(day=>day.rows.some(row=>row.type && row.hours>0)));
  switchPeriod(migrated,'2026-08');
  assert.equal(migrated.days.length,31);
  assert(migrated.days.every(day=>day.rows.some(row=>row.type && row.hours>0)));
  switchPeriod(migrated,'2026-09');
  switchBrigade(migrated,'b3');
  assert.equal(monthHours(migrated),0);
  assert(migrated.days.every(day=>day.rows.every(row=>!rowActive(row))));
});

test('a newly added brigade creates its first blank schedule lazily and retains later edits',()=>{
  const state=initialState();
  switchPeriod(state,'2028-02');
  state.days[28].rows[0].notes='Заявка Б1';
  const original=monthSnapshot(state);
  state.brigades.push({id:'brigade-custom',code:'Б5',label:'Выездная бригада'});
  assert(!('brigade-custom' in state.brigadeSchedules));
  switchBrigade(state,'brigade-custom');
  assert.equal(state.period,'2028-02');
  assert.equal(brigadeName(state),'Б5');
  assert.equal(state.days.length,29);
  assert.equal(monthHours(state),0);
  assert.deepEqual(state.roster,['','','','','']);
  assert(state.days.every(day=>day.rows.every(row=>!rowActive(row))));
  state.days[28].rows[0].notes='Собственная заявка Б5';
  const custom=monthSnapshot(state);
  switchBrigade(state,'b1');
  assertMonth(state,original);
  const restored=migrateState(state);
  switchBrigade(restored,'brigade-custom');
  assertMonth(restored,custom);
});
