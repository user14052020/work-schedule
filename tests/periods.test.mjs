import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA,initialState,clone,blankRow,switchPeriod,migrateState,allDays,monthHours,employeeHours,participants,validateRoster,applyRoster,rowActive} from '../public/model.js';
import {handleMenuChange} from '../public/menus.js';

const change = (state,kind,id,field,value) => handleMenuChange(state,{dataset:{menuKind:kind,menuId:id,menuField:field},value});

function legacyState() {
  const state=initialState();
  state.schema=1;
  delete state.period;
  delete state.periods;
  delete state.brigades;
  delete state.brigadeId;
  delete state.brigadeSchedules;
  state.objects=state.objects.slice(0,4);
  for (let index=2;index<state.days.length;index++) {
    state.days[index]={date:`2026-09-${String(index+1).padStart(2,'0')}`,roster:['e1','e2','','',''],statuses:['РД','РД','','',''],pay:null,adjustment:null,hoursOverride:null,rows:Array.from({length:5},blankRow)};
  }
  state.days[2].statuses=['ОТП','Б2','','',''];
  return state;
}

test('August and September contain complete distinct fictional schedules with valid assignments',()=>{
  const state=initialState();
  assert.equal(state.schema,SCHEMA);
  assert.equal(state.period,'2026-09');
  assert.equal(state.days.length,30);
  assert.equal(state.periods['2026-08'].days.length,31);
  const ids=[];
  for (const day of [...state.days,...state.periods['2026-08'].days]) {
    assert(day.rows.some(row=>row.type && row.hours>0),day.date);
    validateRoster(state,day.roster);
    assert.equal(day.statuses.length,5);
    for (const row of day.rows) {
      ids.push(row.id);
      assert(state.workTypes.some(type=>type.code===row.type));
      assert(!row.objectId || state.objects.some(object=>object.id===row.objectId));
      const people=participants(day,row);
      assert.equal(new Set(people).size,people.length);
      assert(people.length>0,`${day.date}: ${row.type}`);
    }
  }
  assert.equal(new Set(ids).size,ids.length);
  assert.equal(monthHours(state),204);
  assert.equal(allDays(state).length,182);
  const sept=clone(state.days);
  switchPeriod(state,'2026-08');
  assert.equal(monthHours(state),196.5);
  assert.notDeepEqual(state.days[0].rows,sept[0].rows);
});

test('switching stores and restores independent edited periods, roster and collapsed state',()=>{
  const state=initialState();
  state.days[0].rows[0].task='Сентябрь: ручное ТЗ';
  state.days[0].pay=123;
  state.days[0].hoursOverride=4;
  state.roster=['e1','e3','','',''];
  state.collapsedDays=['2026-09-02'];state.monthCollapsed=true;
  const september=clone({days:state.days,roster:state.roster,collapsedDays:state.collapsedDays,monthCollapsed:state.monthCollapsed});
  const septemberHours=monthHours(state);
  assert.equal(switchPeriod(state,'2026-08'),state);
  assert(!('2026-08' in state.periods));
  state.days[0].rows[0].task='Август: другое ТЗ';
  state.collapsedDays=['2026-08-10'];state.monthCollapsed=false;
  const august=clone(state.days);
  assert.notEqual(monthHours(state),septemberHours);
  switchPeriod(state,'2026-09');
  for (const key of ['days','roster','collapsedDays','monthCollapsed']) assert.deepEqual(state[key],september[key]);
  assert(!('2026-09' in state.periods));
  assert.deepEqual(state.periods['2026-08'].days,august);
  assert.equal(allDays(state).length,182);
  const before=clone(state);
  switchPeriod(state,'2026-09');
  assert.deepEqual(state,before);
});

test('new selected months use real leap-year calendars and do not inherit other month data',()=>{
  const state=initialState();
  for (const [key,length] of [['2025-02',28],['2026-04',30],['2027-01',31],['2024-02',29],['2028-02',29],['2100-02',28],['2000-02',29]]) {
    switchPeriod(state,key);
    assert.equal(state.days.length,length,key);
    assert.equal(state.days[0].date,`${key}-01`);
    assert.equal(state.days.at(-1).date,`${key}-${length}`);
    assert.equal(monthHours(state),0);
    assert.equal(employeeHours(state,'e1'),0);
    assert.deepEqual(state.roster,['','','','','']);
    assert(state.days.every(day=>day.rows.length===5 && day.rows.every(row=>!rowActive(row))));
  }
  const before=clone(state);
  for (const key of ['2026-00','2026-13','2026-8','2026-09-01','0000-01','not-a-month',null,undefined]) assert.throws(()=>switchPeriod(state,key));
  assert.deepEqual(state,before);
});

test('roster range uses the selected month including final August and leap days',()=>{
  const state=initialState(), september=clone(state.days);
  switchPeriod(state,'2026-08');
  assert.equal(applyRoster(state,['e1','e3','','',''],'2026-08-30','2026-08-31'),2);
  assert.deepEqual(state.days[30].roster,['e1','e3','','','']);
  assert.deepEqual(state.periods['2026-09'].days,september);
  const before=clone(state);
  for (const [from,to] of [['2026-08-31','2026-09-01'],['2026-08-30','2026-08-32'],['2026-08-31','2026-08-30']]) assert.throws(()=>applyRoster(state,state.roster,from,to));
  assert.deepEqual(state,before);
  switchPeriod(state,'2028-02');
  assert.equal(applyRoster(state,['e1','e2','','',''],'2028-02-01','2028-02-29'),29);
});

test('legacy migration fills only untouched template days and preserves all user changes',()=>{
  const legacy=legacyState();
  legacy.days[0].rows=[blankRow()]; // Previously filled source day deliberately cleared.
  legacy.days[1].rows[0].task='Индивидуальная правка';
  legacy.days[4].pay=0;
  legacy.days[5].roster=['e1','e6','','',''];
  legacy.days[6].rows[0].notes='Запланировать позже';
  legacy.days[7].rows.push(blankRow(),blankRow());
  legacy.days[8].statuses[0]='ОТП';
  legacy.days[9].rows[0].people[0]='';
  legacy.workTypes[0].label='Переезд: своё описание';
  legacy.employees[0].name='Новое короткое имя';
  legacy.collapsedDays=['2026-09-01'];legacy.monthCollapsed=true;
  const before=clone(legacy), migrated=migrateState(legacy);
  assert.deepEqual(legacy,before,'migration must not mutate the saved source');
  assert.equal(migrated.schema,SCHEMA);assert.equal(migrated.period,'2026-09');
  for (const index of [0,1,4,5,6,7,8,9]) assert.deepEqual(migrated.days[index],before.days[index],`preserve September ${index+1}`);
  for (const index of [2,3,10,29]) assert(migrated.days[index].rows.some(row=>row.type && row.hours>0));
  assert.equal(migrated.employees[0].name,'Новое короткое имя');
  assert.equal(migrated.workTypes[0].label,'Переезд: своё описание');
  assert.deepEqual(migrated.objects,before.objects,'shared dictionaries are not overwritten or expanded');
  assert.deepEqual(migrated.collapsedDays,before.collapsedDays);assert.equal(migrated.monthCollapsed,true);
  assert.equal(migrated.periods['2026-08'].days.length,31);
  assert(allDays(migrated).every(day=>day.rows.every(row=>!row.objectId || migrated.objects.some(object=>object.id===row.objectId))));
});

test('current-schema migration and reload preserve intentionally cleared seed data and inactive edits',()=>{
  const state=initialState();
  state.days[3].rows=Array.from({length:5},blankRow);
  switchPeriod(state,'2026-08');
  state.days[1].rows[0].hours=9;
  state.days[2].pay=0;
  const before=clone(state), migrated=migrateState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(migrated,before);
  switchPeriod(migrated,'2026-09');
  assert(migrated.days[3].rows.every(row=>!rowActive(row)));
  assert.deepEqual(migrateState(migrated),migrated);
  assert.throws(()=>migrateState({...state,schema:999}));
  const invalid=clone(state);invalid.days[0].date='2026-08-32';
  assert.throws(()=>migrateState(invalid));
});

test('dictionary reference guards and inherited object updates include inactive months',()=>{
  const state=initialState();
  state.workTypes.push({code:'АВГ',label:'Только в августе'});
  state.statuses.push({code:'АВГУСТ',label:'Особый статус'});
  state.invoiceStates.push('АВГУСТ-СЧЁТ');
  const august=state.periods['2026-08'];
  august.days[0].rows[0].type='АВГ';
  august.days[0].rows[0].invoice='АВГУСТ-СЧЁТ';
  august.days[0].statuses[0]='АВГУСТ';
  const object=state.objects[0];
  const inherited=august.days.flatMap(day=>day.rows).find(row=>row.objectId===object.id);
  assert(inherited);
  inherited.task=object.task;
  const overridden=august.days.flatMap(day=>day.rows).find(row=>row.objectId===object.id && row!==inherited);
  overridden.task='Не менять ручное задание';
  assert.throws(()=>change(state,'workTypes','АВГ','code','ПЕРЕИМЕНОВАН'));
  assert.throws(()=>change(state,'statuses','АВГУСТ','code','СТАТУС-2'));
  assert.throws(()=>change(state,'invoices',String(state.invoiceStates.length-1),'code','ДРУГОЙ'));
  change(state,'objects',object.id,'task','Обновлённое типовое ТЗ');
  assert.equal(inherited.task,'Обновлённое типовое ТЗ');
  assert.equal(overridden.task,'Не менять ручное задание');
  switchPeriod(state,'2025-01');
  assert.equal(employeeHours(state,'e1'),0);
  assert.throws(()=>change(state,'employees','e1','group','Офис'));
});
