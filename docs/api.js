import {serviceOrigin} from './hosting.js';

const onPages = location.hostname.endsWith('.github.io');
const sessionKey = 'viberp.' + new URL('.', import.meta.url).pathname + '.session';
export async function api(path,data) {
  if (onPages && !serviceOrigin) throw Error('Служебный сервер ещё не подключён. Правовая библиотека доступна в меню.');
  const base = serviceOrigin || location.origin;
  const remote = base !== location.origin;
  if (remote && new URL(base).protocol !== 'https:') throw Error('Для служебного сервера требуется HTTPS.');
  const headers = {};
  if (data) headers['Content-Type']='application/json';
  const token = remote && sessionStorage.getItem(sessionKey);
  if (token) headers.Authorization='Bearer '+token;
  const response = await fetch(new URL('/api/'+path,base), {
    method:data?'POST':'GET',headers,credentials:remote?'omit':'same-origin',
    cache:'no-store',body:data?JSON.stringify(data):undefined
  });
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('Служебный сервер недоступен.');
  const value=await response.json();
  if(response.status===401 && remote)sessionStorage.removeItem(sessionKey);
  if(!response.ok)throw Error(value.error||'Ошибка запроса.');
  if(remote && value.sessionToken)sessionStorage.setItem(sessionKey,value.sessionToken);
  if(remote && path==='logout')sessionStorage.removeItem(sessionKey);
  return value;
}
