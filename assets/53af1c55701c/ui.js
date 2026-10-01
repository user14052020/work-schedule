export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const selected = (value, current) => String(value ?? '') === String(current ?? '') ? ' selected' : '';
export const option = (value, label, current) => `<option value="${escape(value)}"${selected(value,current)}>${escape(label)}</option>`;
export function options(rows, current, {empty = '—', value = 'id', label = 'label'} = {}) {
  return (empty === null ? '' : option('',empty,current)) + (rows || []).map(row => option(row[value],row[label] || row.name || row.code || row.id,current)).join('');
}
let toastTimer;
export function toast(message, error = false) {
  const element = document.querySelector('#toast');
  element.textContent = message; element.classList.toggle('error-toast', error); element.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => element.hidden = true, error ? 9000 : 4500);
}
export function showError(error) { toast(error.message || 'Не удалось выполнить действие.', true); }
export function loading(container, message = 'Загрузка…') { container.innerHTML = `<div class="loading">${escape(message)}</div>`; }
export function failure(container, error, retry) {
  container.innerHTML = `<div class="error-panel"><h2>Не удалось загрузить данные</h2><p>${escape(error.message)}</p><button class="button" data-retry>Повторить</button></div>`;
  container.querySelector('[data-retry]').onclick = retry;
}
export function openDialog(title, content, onSubmit, {submit = 'Сохранить', wide = false, mandatory = false} = {}) {
  const dialog = document.querySelector('#dialog');
  let saving = false;
  dialog.classList.toggle('wide',wide);
  dialog.innerHTML = `<form id="modal-form"><div class="dialog-heading"><h2>${escape(title)}</h2>${mandatory ? '' : '<button type="button" class="icon-button" data-close aria-label="Закрыть">×</button>'}</div>${content}<p class="error" data-error role="alert" hidden></p><div class="dialog-actions">${mandatory ? '' : '<button type="button" class="button" data-close>Закрыть</button>'}${onSubmit ? `<button type="submit" class="primary">${escape(submit)}</button>` : ''}</div></form>`;
  dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = () => { if (!saving) dialog.close(); });
  dialog.oncancel = event => { if (mandatory || saving) event.preventDefault(); };
  if (onSubmit) dialog.querySelector('form').onsubmit = async event => {
    event.preventDefault(); if (saving) return;
    const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); const data = new FormData(form);
    saving = true; form.inert = true; button.disabled = true; form.querySelector('[data-error]').hidden = true;
    try { const result = await onSubmit(data, form); if (result !== false && form.isConnected) dialog.close(); }
    catch (error) { const element = form.querySelector('[data-error]'); if (element?.isConnected) { element.hidden = false; element.textContent = error.message; } }
    finally { saving = false; form.inert = false; button.disabled = false; }
  };
  if (!dialog.open) dialog.showModal();
  return dialog;
}
export function autoHeight(container) {
  const roots = container?.nodeType ? [container] : [...(container || [])];
  const inputs = [...new Set(roots.flatMap(root => root.matches?.('textarea.cell-input') ? [root] : [...root.querySelectorAll('textarea.cell-input')]))].filter(input => input.isConnected);
  // Keep all style writes before layout reads, then apply the measured heights together.
  inputs.forEach(input => { input.style.height = 'auto'; });
  const heights = inputs.map(input => Math.max(input.scrollHeight,32));
  inputs.forEach((input,index) => { input.style.height = `${heights[index]}px`; });
}
export function safeColor(value, fallback = '#eef3ef') { return /^#[0-9a-f]{3,8}$/i.test(value || '') ? value : fallback; }
export function safeLink(value) { try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
export function pageHeading(title, subtitle = '', actions = '') {
  return `<div class="page-heading"><div><h1>${escape(title)}</h1>${subtitle ? `<p class="muted">${escape(subtitle)}</p>` : ''}</div><div class="heading-actions">${actions}</div></div>`;
}
