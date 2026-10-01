const localPreferences = () => {
  try { return JSON.parse(localStorage.getItem('work-schedule-demo.display') || '{}'); } catch { return {}; }
};

export const state = {
  user: null, references: {}, settings: {}, years: [], currentDate: '', period: '', brigadeId: '', view: 'schedule',
  preferences: localPreferences(),
  initialize(data) {
    this.user = data.user; this.references = data.references || {}; this.settings = data.settings || {};
    this.years = data.years || []; this.currentDate = data.currentDate || new Date().toISOString().slice(0,10);
    this.period ||= data.preferredPeriod || this.currentDate.slice(0,7);
    this.brigadeId ||= data.preferredBrigadeId || this.references.brigades?.find(row => row.active !== false)?.id || '';
  },
  preference(key, value) {
    if (value === undefined) return this.preferences[key];
    this.preferences[key] = value;
    try { localStorage.setItem('work-schedule-demo.display', JSON.stringify(this.preferences)); } catch { /* Storage is optional for display preferences. */ }
    return value;
  },
  get editable() { return ['admin', 'office'].includes(this.user?.role); },
  get admin() { return this.user?.role === 'admin'; },
  employee(id) { return (this.references.employees || []).find(row => String(row.id) === String(id)); },
  employeeName(id) { const employee = this.employee(id); return employee?.shortName || employee?.name || (id ? 'Сотрудник' : '—'); },
  brigadeName(id) { const brigade = (this.references.brigades || []).find(row => String(row.id) === String(id)); return brigade?.code || brigade?.label || id || '—'; }
};

export const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
export function periodBounds(period) {
  const [year,month] = period.split('-').map(Number);
  return {from:`${period}-01`, to:`${period}-${new Date(year,month,0).getDate()}`};
}
export function formatDate(date) {
  if (!date) return '—';
  return new Date(`${date.slice(0,10)}T12:00:00`).toLocaleDateString('ru-RU');
}
export const number = value => value === null || value === undefined || value === '' ? '—' : Number(value).toLocaleString('ru-RU', {maximumFractionDigits:2});
