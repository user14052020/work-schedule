export const MAX_WORK_ROWS = 501;
export const extraTextFields = {
  object:{field:'objectExtra',className:'object-extra',label:'Дополнительная строка объекта'},
  notes:{field:'notesExtra',className:'notes-extra',label:'Дополнительная строка примечаний по работам'}
};
export const emptyJob = () => ({id:crypto.randomUUID(),time:'',people:[null,null,null,null,null],invoice:'',type:'',hours:null,objectId:'',object:'',objectExtra:'',phone:'',objectNotes:'',task:'',notes:'',notesExtra:'',tech:'',tech2:''});

export function normalizeDay(day) {
  day.rows ||= []; day.roster ||= ['', '', '', '', '']; day.statuses ||= ['', '', '', '', '']; day.version ||= 0;
  return day;
}
export function prepareEditableRows(days) {
  for (const day of days) while (day.rows.length < 5) day.rows.push(emptyJob());
}
export function addWorkRows(day, count = 2) {
  const available = Math.min(count,Math.max(0,MAX_WORK_ROWS - day.rows.length));
  for (let index = 0; index < available; index++) day.rows.push(emptyJob());
  return available;
}
export function hasWorkContent(row) {
  return Object.entries(row).some(([key,value]) => {
    if (['id','resolvedPeople','peopleNames'].includes(key)) return false;
    if (key === 'people') return (value || []).some(item => item !== null && item !== undefined);
    return value !== null && value !== undefined && value !== '';
  });
}
export function removeWorkRow(day, id) {
  const index = day.rows.findIndex(row => row.id === id);
  if (index < 0) return false;
  day.rows.splice(index,1);
  if (!day.rows.length) day.rows.push(emptyJob());
  return true;
}
export function payrollFingerprint(shift) {
  return JSON.stringify({date:shift.date,brigadeId:shift.brigadeId,roster:shift.roster,statuses:shift.statuses,
    pay:shift.pay ?? null,hoursOverride:shift.hoursOverride ?? null,adjustment:shift.adjustment ?? null,
    rows:(shift.rows || []).filter(row => row.type || row.hours != null || row.people?.some(Boolean))
      .map(row => ({id:row.id,type:row.type || '',hours:row.hours ?? null,people:row.people})).sort((left,right) => String(left.id).localeCompare(String(right.id))),
    employeeAdjustments:(shift.employeeAdjustments || []).map(item => ({employeeId:item.employeeId,amount:item.amount}))
      .sort((left,right) => String(left.employeeId).localeCompare(String(right.employeeId)))});
}

/** Header selections are drafts until Fill succeeds; rendering never changes them. */
export class RosterDraft {
  constructor() { this.resource = ''; this.values = ['', '', '', '', '']; this.saved = [...this.values]; }
  get dirty() { return this.values.some((value,index) => value !== this.saved[index]); }
  accept(resource, values) {
    if (resource === this.resource && this.dirty) return;
    this.resource = resource;
    this.commit(values);
  }
  set(slot,value) { if (Number.isInteger(slot) && slot >= 0 && slot < 5) this.values[slot] = value; }
  commit(values) { this.values = Array.from({length:5},(_,index) => values?.[index] || ''); this.saved = [...this.values]; }
}
