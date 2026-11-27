const query = document.querySelector('#q');
const kind = document.querySelector('#kind');
const rows = Array.from(document.querySelectorAll('#laws li'));
function filterLaws() {
  const term = query.value.trim().toLocaleLowerCase('ru');
  let count = 0;
  rows.forEach((row, index) => {
    const link = row.querySelector('a');
    const titleMatch = link.textContent.toLocaleLowerCase('ru').includes(term);
    const passage = term && !titleMatch ? lawIndex[index].findIndex(line => line.includes(term)) : -1;
    row.hidden = Boolean(kind.value && kind.value !== row.dataset.kind) || !(titleMatch || passage >= 0);
    link.href = 'acts/' + (index + 1) + '.html' + (passage >= 0 ? '#s' + passage : '');
    if (!row.hidden) count++;
  });
  document.querySelector('#status').textContent = count ? 'Документов: ' + count : 'Совпадений нет';
}
query.addEventListener('input', filterLaws);
kind.addEventListener('change', filterLaws);
