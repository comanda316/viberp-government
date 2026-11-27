const el = id => document.getElementById(id);
let invite = new URLSearchParams(location.hash.slice(1)).get('invite');
if (invite) history.replaceState(null, '', location.pathname);
const labels = {submitted:'На рассмотрении',accepted:'Принят',returned:'Возвращён'};
async function api(path, data) {
  const response = await fetch('api/' + path, data ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)} : {cache:'no-store'});
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('Служебный сервер по этому адресу ещё не подключён. Для входа откройте адрес служебного сервера.');
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Ошибка запроса.');
  return result;
}
async function refresh() {
  const {user} = await api('session');
  el('auth').hidden = Boolean(user);
  el('desk').hidden = !user;
  if (!user) {
    el('inviteOutput').textContent='';el('members').replaceChildren();el('news').replaceChildren();el('document').reset();
    el('nameLabel').hidden = !invite;
    el('auth').elements.name.required = Boolean(invite);
    el('auth').elements.password.autocomplete = invite ? 'new-password' : 'current-password';
    el('authTitle').textContent = invite ? 'Активация приглашения' : 'Вход сотрудника';
    el('authButton').textContent = invite ? 'Создать учётную запись' : 'Войти';
    el('notice').textContent = invite ? 'Придумайте логин и пароль длиной от 12 символов.' : 'Для первой регистрации получите приглашение у администратора.';
    return;
  }
  el('profile').textContent = [user.name,user.unit,user.role==='manager'?'Руководитель':'Сотрудник'].join(' · ');
  el('listTitle').textContent = user.role==='manager'?'Документы ведомства':'Мои документы';
  const [rows,history,department]=await Promise.all([api('documents'),api('history'),api('department')]);
  const manager=user.role==='manager';
  el('unitName').textContent=user.unit;
  el('management').hidden=!manager;
  el('personalForm').elements.callsign.value=department.members.find(m=>m.id===user.id)?.callsign||'';
  el('members').replaceChildren();
  for(const m of department.members){
    const line=document.createElement('p');
    line.textContent=[m.name,m.position,m.callsign,m.role==='manager'?'Руководитель':'Сотрудник'].filter(Boolean).join(' · ');
    el('members').append(line);
    if(manager) actionForm(el('members'),'Должность: '+m.name,'Назначить',80,value=>api('position',{id:m.id,position:value}));
  }
  el('news').replaceChildren();
  if(!department.news.length)el('news').textContent='Объявлений пока нет.';
  for(const n of department.news){
    const p=document.createElement('p');p.textContent=n.created+' UTC · '+n.name+' — '+n.message;el('news').append(p);
  }
  el('list').replaceChildren();
  if (!rows.length) el('list').textContent='Зарегистрированных документов пока нет.';
  for (const row of rows) {
    const item=document.createElement('details'), title=document.createElement('summary'), body=document.createElement('p'), author=document.createElement('small');
    title.textContent='#'+row.id+' · '+row.title+' · '+labels[row.status];
    author.textContent=row.name+' · '+row.created+' UTC';
    body.textContent=row.body; body.style.whiteSpace='pre-wrap';
    item.append(title,author,body);
    for(const h of history.filter(h=>h.document===row.id)){
      const entry=document.createElement('p');entry.textContent=[h.created+' UTC',h.name,labels[h.status],h.note].filter(Boolean).join(' · ');item.append(entry);
    }
    if(row.authorId===user.id && row.status==='returned')actionForm(item,'Исправленная редакция','Отправить повторно',10000,value=>api('resubmit',{id:row.id,body:value}),row.body);
    if(user.role==='manager' && row.status==='submitted' && row.authorId!==user.id) {
      actionForm(item,'Причина возврата','Вернуть на исправление',2000,value=>api('review',{id:row.id,status:'returned',note:value}));
      for(const [status,label] of [['accepted','Принять']]){
        const button=document.createElement('button');button.textContent=label;
        button.onclick=()=>run(button,async()=>{await api('review',{id:row.id,status});await refresh();});
        item.append(button);
      }
    }
    el('list').append(item);
  }
  el('notice').textContent='';
}
async function run(button, task) {
  if (button) button.disabled=true;
  try {await task();} catch(e){el('notice').textContent=e.message;} finally {if(button)button.disabled=false;}
}
el('auth').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{
  const data=Object.fromEntries(new FormData(e.target));
  await api(invite?'activate':'login',{...data,invite});invite=null;e.target.reset();await refresh();
});};
el('document').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{
  const result=await api('documents',Object.fromEntries(new FormData(e.target)));e.target.reset();await refresh();el('notice').textContent='Зарегистрирован документ №'+result.id;
});};
el('logout').onclick=()=>run(el('logout'),async()=>{await api('logout',{});el('list').replaceChildren();el('profile').textContent='';await refresh();});
function actionForm(parent,caption,action,maxLength,submit,initial=''){
  const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement(maxLength>100?'textarea':'input'),button=document.createElement('button');
  label.textContent=caption;input.required=true;input.maxLength=maxLength;input.value=initial;label.append(input);button.textContent=action;
  form.append(label,button);parent.append(form);form.onsubmit=e=>{e.preventDefault();run(button,async()=>{await submit(input.value);await refresh();});};
}
for(const [id,endpoint] of [['personalForm','profile'],['announce','announce']]){
  el(id).onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{await api(endpoint,Object.fromEntries(new FormData(e.target)));e.target.reset();await refresh();el('notice').textContent='Сохранено.';});};
}
el('inviteEmployee').onclick=()=>run(el('inviteEmployee'),async()=>{const {url}=await api('invite',{});el('inviteOutput').textContent='Одноразовая ссылка на 24 часа: '+url;});
run(null,refresh);
