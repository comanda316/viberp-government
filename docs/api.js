export async function api(path,data){
const response=await fetch('api/'+path,data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{cache:'no-store'});
if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Приёмная доступна на служебном сервере. На этой версии сайта открыт правовой справочник.');
const value=await response.json();if(!response.ok)throw Error(value.error||'Ошибка запроса.');return value;
}
