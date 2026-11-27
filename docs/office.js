const form = document.querySelector('form');
const statusLine = form.querySelector('[role=status]');
const key = 'viberp.report.v1';
try {
  const draft = JSON.parse(localStorage.getItem(key) || '{}');
  for (const field of form.querySelectorAll('[name]')) field.value = draft[field.name] || '';
} catch {}
form.addEventListener('input', () => {
  try {
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(new FormData(form))));
    statusLine.textContent = 'Черновик сохранён на устройстве.';
  } catch { statusLine.textContent = 'Хранилище браузера недоступно. Скачайте готовый рапорт.'; }
});
form.addEventListener('submit', event => {
  event.preventDefault();
  const d = Object.fromEntries(new FormData(form));
  const report = ['СЛУЖЕБНЫЙ РАПОРТ', d.subject, '', 'Дата: ' + new Date().toLocaleDateString('ru'), 'Сотрудник: ' + d.officer, 'Подразделение: ' + d.unit, '', d.body].join('\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', report], {type:'text/plain;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = 'VibeRP-report.txt'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
