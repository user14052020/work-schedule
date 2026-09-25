import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, clone, brigadeName, switchBrigade, switchPeriod, applyObject } from '../public/model.js';
import { handleMenuChange, handleMenuAction, renderMenu } from '../public/menus.js';

const change = (state,kind,id,field,value) => handleMenuChange(state,{
  dataset:{menuKind:kind,menuId:id,menuField:field},value,
});
const addBrigade = state => handleMenuAction(state,{dataset:{menuAction:'add-brigade'}});

test('brigade rename retains stable identity and every saved schedule', () => {
  const state=initialState();
  state.days[0].rows[0].notes='Первая бригада';
  switchBrigade(state,'b2');
  state.days[0].rows[0].notes='Вторая бригада';
  const days=clone(state.days), inactive=clone(state.brigadeSchedules);
  change(state,'brigades','b2','code','  ВЫЕЗД-2  ');
  change(state,'brigades','b2','label','Вторая выездная бригада');
  assert.equal(state.brigadeId,'b2');
  assert.equal(brigadeName(state),'ВЫЕЗД-2');
  assert.deepEqual(state.days,days);
  assert.deepEqual(state.brigadeSchedules,inactive);
  switchBrigade(state,'b1');
  assert.equal(state.days[0].rows[0].notes,'Первая бригада');
  switchBrigade(state,'b2');
  assert.deepEqual(state.days,days);
  assert.equal(brigadeName(state),'ВЫЕЗД-2');
});

test('brigade validation rejects blank/duplicate codes and id changes without partial edits', () => {
  const state=initialState(), before=clone(state);
  for (const [field,value] of [['code',''],['code','   '],['code',' б2 '],['code','A'.repeat(51)],['label',''],['label','Я'.repeat(151)],['id','new-id']]) {
    assert.throws(()=>change(state,'brigades','b1',field,value));
    assert.deepEqual(state,before);
  }
});

test('added brigades get distinct stable ids and unused codes with independent blank graphs', () => {
  const state=initialState();
  change(state,'brigades','b4','code','Б5');
  const oldIds=state.brigades.map(brigade=>brigade.id);
  assert.equal(addBrigade(state),true);
  assert.equal(addBrigade(state),true);
  const added=state.brigades.filter(brigade=>!oldIds.includes(brigade.id));
  assert.equal(added.length,2);
  assert.deepEqual(added.map(brigade=>brigade.code),['Б4','Б6']);
  assert.equal(new Set(state.brigades.map(brigade=>brigade.id)).size,state.brigades.length);
  switchPeriod(state,'2028-02');
  switchBrigade(state,added[0].id);
  assert.equal(state.period,'2028-02');
  assert.equal(state.days.length,29);
  assert.ok(state.days.every(day=>day.rows.every(row=>!row.type && row.hours === null)));
  state.days[0].rows[0].notes='Новая бригада';
  switchBrigade(state,added[1].id);
  assert.ok(state.days.every(day=>day.rows.every(row=>row.notes !== 'Новая бригада')));
});

test('brigade directory escapes names and employees hours identify the selected brigade/month', () => {
  const state=initialState();
  change(state,'brigades','b1','code','<Б1>');
  change(state,'brigades','b1','label','<img src=x onerror=alert(1)>');
  const dictionary=renderMenu(state,'dictionaries');
  assert.ok(dictionary.includes('data-menu-kind="brigades"'));
  assert.ok(dictionary.includes('data-menu-id="b1"'));
  assert.ok(dictionary.includes('data-menu-action="add-brigade"'));
  assert.ok(dictionary.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!dictionary.includes('<img src=x'));
  const employees=renderMenu(state,'employees');
  assert.ok(employees.includes('Часы бригады «&lt;Б1&gt;»'));
  assert.ok(employees.includes('2026'));
});

for (const storedMonth of [false,true]) {
  test(`employee group cannot change when assigned only in another brigade's ${storedMonth?'stored-month':'current-month'} header`, () => {
    const state=initialState();
    state.employees.push({id:'header-only',name:'Только состав',group:'Поля',active:true,driver:false});
    switchBrigade(state,'b2');
    switchPeriod(state,'2027-01');
    state.roster=['header-only','','','',''];
    if (storedMonth) switchPeriod(state,'2027-02');
    switchBrigade(state,'b1');
    const before=clone(state);
    assert.throws(()=>change(state,'employees','header-only','group','Офис'),/назначен/);
    assert.deepEqual(state,before);
  });
}

test('dictionary references and inherited object edits reach inactive brigade history', () => {
  const state=initialState();
  state.workTypes.push({code:'ТОЛЬКО-Б2',label:'Работа второй бригады'});
  state.objects.push({id:'test-object',name:'Только для второй',phone:'',notes:'',task:'Исходное ТЗ',tech:''});
  switchBrigade(state,'b2');
  switchPeriod(state,'2027-03');
  const row=state.days[0].rows[0];
  row.type='ТОЛЬКО-Б2';
  applyObject(state,row,'test-object');
  switchPeriod(state,'2027-04');
  switchBrigade(state,'b1');
  assert.throws(()=>change(state,'workTypes','ТОЛЬКО-Б2','code','НОВЫЙ'),/используется/);
  assert.throws(()=>change(state,'objects','test-object','id','replacement'),/используется/);
  change(state,'objects','test-object','task','Обновлённое ТЗ');
  switchBrigade(state,'b2');
  switchPeriod(state,'2027-03');
  assert.equal(state.days[0].rows[0].task,'Обновлённое ТЗ');
});
