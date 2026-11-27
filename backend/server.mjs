import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const web = path.resolve(process.env.PORTAL_WEB || fileURLToPath(new URL('../docs/', import.meta.url)));
const data = path.resolve(process.env.PORTAL_DATA || path.join(os.homedir(), '.viberp-portal'));
mkdirSync(data, {recursive:true, mode:0o700});
const db = new DatabaseSync(path.join(data, 'portal.sqlite'));
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS departments(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, department INTEGER NOT NULL REFERENCES departments(id), role TEXT NOT NULL CHECK(role IN ('employee','manager')));
CREATE TABLE IF NOT EXISTS invitations(token TEXT PRIMARY KEY, department INTEGER NOT NULL REFERENCES departments(id), role TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, account INTEGER NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY, author INTEGER NOT NULL REFERENCES accounts(id), department INTEGER NOT NULL REFERENCES departments(id), title TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT 'submitted', reviewer INTEGER REFERENCES accounts(id));
`);
db.exec(`CREATE TABLE IF NOT EXISTS profiles(account INTEGER PRIMARY KEY REFERENCES accounts(id), callsign TEXT NOT NULL DEFAULT '', position TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS decisions(id INTEGER PRIMARY KEY, document INTEGER NOT NULL REFERENCES documents(id), actor INTEGER NOT NULL REFERENCES accounts(id), status TEXT NOT NULL, note TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY, department INTEGER NOT NULL REFERENCES departments(id), author INTEGER NOT NULL REFERENCES accounts(id), message TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
const token = () => randomBytes(32).toString('hex');
const digest = value => createHash('sha256').update(value).digest('hex');
const port = Number(process.env.PORT || 18743);
const origin = new URL(process.env.PORTAL_ORIGIN || 'http://127.0.0.1:' + port).origin;
if (process.argv[2] === 'invite') {
  const [, , , unit, role] = process.argv;
  if (!unit?.trim() || !['employee','manager'].includes(role)) throw Error('invite <department> employee|manager');
  db.prepare('INSERT OR IGNORE INTO departments(name) VALUES (?)').run(unit);
  const secret = token();
  db.prepare('INSERT INTO invitations VALUES (?,(SELECT id FROM departments WHERE name=?),?,?)').run(digest(secret),unit,role,Date.now()+86400000);
  console.log(origin+'/office.html#invite='+secret);
  process.exit(0);
}
const derive = promisify(scrypt);
const dummy = '0'.repeat(32)+':'+ '0'.repeat(128);
const attempts = new Map();
function fail(code, message) { throw Object.assign(new Error(message), {code}); }
function field(value,min,max) {
  if(typeof value !== 'string' || value.length < min || value.length > max || !value.trim()) fail(400,'Проверьте заполнение полей.');
  return value;
}
const server = http.createServer(async (req,res) => {
  const send = (code,obj) => {res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
  try {
    const route = new URL(req.url,origin).pathname;
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');
    if (!route.startsWith('/api/')) {
      if(req.method!=='GET' || !/^\/(?:[a-z0-9-]+\.(?:html|css|js)|acts\/\d+\.html)?$/.test(route)) return send(404,{});
      const file = path.join(web, route==='/'?'index.html':route.slice(1));
      let content; try {content=readFileSync(file);} catch {return send(404,{});}
      res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript'})[path.extname(file)]+'; charset=utf-8');
      return res.end(content);
    }
    const session = digest(/(?:^|; *)vp_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1] || '');
    const user=db.prepare('SELECT a.id,a.name,a.department,a.role,d.name AS unit FROM sessions s JOIN accounts a ON a.id=s.account JOIN departments d ON d.id=a.department WHERE s.token=? AND s.expires>?').get(session,Date.now());
    if(req.method==='GET' && route==='/api/session') return send(200,{user:user||null});
    let input={};
    if(req.method==='POST'){
      if(req.headers.origin!==origin || req.headers['content-type']!=='application/json') fail(403,'Запрос отклонён.');
      let chunks=[],size=0;
      for await(const part of req){size+=part.length;if(size>65536)fail(413,'Слишком большой документ.');chunks.push(part);}
      try {input=JSON.parse(Buffer.concat(chunks).toString());} catch {fail(400,'Некорректный запрос.');}
      if(!input || typeof input!=='object') fail(400,'Некорректный запрос.');
    }
    const cookie=(value,age)=>res.setHeader('Set-Cookie','vp_session='+value+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+age+(origin.startsWith('https:')?'; Secure':''));
    if(req.method==='POST' && ['/api/login','/api/activate'].includes(route)){
      const ip=req.socket.remoteAddress;
      let rate=attempts.get(ip);
      if(!rate || rate.until<Date.now()){rate={until:Date.now()+600000,count:0};attempts.set(ip,rate);}
      if(++rate.count>30) fail(429,'Повторите попытку позже.');
      const login=field(input.login,3,64).trim().toLowerCase();
      if(!/^[a-z0-9_.-]{3,64}$/.test(login)) fail(400,'Логин: 3–64 латинские буквы, цифры, точки, дефисы или подчёркивания.');
      const password=field(input.password,12,256);
      let id;
      if(route==='/api/activate'){
        const key=digest(field(input.invite,64,64));
        const name=field(input.name,1,100).trim();
        if(!db.prepare('SELECT 1 FROM invitations WHERE token=? AND expires>?').get(key,Date.now())) fail(403,'Приглашение недействительно.');
        const salt=randomBytes(16).toString('hex');
        const hash=(await derive(password,salt,64)).toString('hex');
        db.exec('BEGIN IMMEDIATE');
        try {
          const invite=db.prepare('DELETE FROM invitations WHERE token=? AND expires>? RETURNING department,role').get(key,Date.now());
          if(!invite) fail(403,'Приглашение недействительно.');
          if(db.prepare('SELECT 1 FROM accounts WHERE login=?').get(login)) fail(409,'Логин занят.');
          id=db.prepare('INSERT INTO accounts(login,name,password,department,role) VALUES (?,?,?,?,?)').run(login,name,salt+':'+hash,invite.department,invite.role).lastInsertRowid;
          db.exec('COMMIT');
        } catch(e){db.exec('ROLLBACK');throw e;}
      } else {
        const account=db.prepare('SELECT id,password FROM accounts WHERE login=?').get(login);
        const [salt,hash]=(account?.password||dummy).split(':');
        const ok=timingSafeEqual(await derive(password,salt,64),Buffer.from(hash,'hex'));
        if(!ok||!account)fail(401,'Неверный логин или пароль.');
        id=account.id;
      }
      const secret=token();
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(secret),id,Date.now()+28800000);
      cookie(secret,28800);return send(200,{ok:true});
    }
    if(!user) fail(401,'Требуется вход.');
    if(req.method==='POST' && route==='/api/logout'){db.prepare('DELETE FROM sessions WHERE token=?').run(session);cookie('',0);return send(200,{});}
    if(route==='/api/department' && req.method==='GET') {
      const members=db.prepare("SELECT a.id,a.name,a.role,coalesce(p.position,'') position,coalesce(p.callsign,'') callsign FROM accounts a LEFT JOIN profiles p ON p.account=a.id WHERE a.department=? ORDER BY a.role DESC,a.name").all(user.department);
      const news=db.prepare('SELECT n.message,n.created,a.name FROM announcements n JOIN accounts a ON a.id=n.author WHERE n.department=? ORDER BY n.id DESC').all(user.department);
      return send(200,{members,news});
    }
    if(route==='/api/profile' && req.method==='POST') {
      const callsign=field(input.callsign,1,48).trim();
      db.prepare('INSERT INTO profiles(account,callsign) VALUES (?,?) ON CONFLICT(account) DO UPDATE SET callsign=excluded.callsign').run(user.id,callsign);
      return send(200,{});
    }
    if(req.method==='POST' && ['/api/invite','/api/position','/api/announce'].includes(route)){
      if(user.role!=='manager') fail(403,'Нужны права руководителя.');
      if(route==='/api/invite'){
        const secret=token();
        db.prepare("INSERT INTO invitations VALUES (?,?,'employee',?)").run(digest(secret),user.department,Date.now()+86400000);
        return send(201,{url:origin+'/office.html#invite='+secret});
      }
      if(route==='/api/announce'){
        db.prepare('INSERT INTO announcements(department,author,message) VALUES (?,?,?)').run(user.department,user.id,field(input.message,1,3000).trim());
      } else {
        if(!Number.isSafeInteger(input.id)||!db.prepare('SELECT id FROM accounts WHERE id=? AND department=?').get(input.id,user.department)) fail(404,'Сотрудник не найден.');
        db.prepare('INSERT INTO profiles(account,position) VALUES (?,?) ON CONFLICT(account) DO UPDATE SET position=excluded.position').run(input.id,field(input.position,1,80).trim());
      }
      return send(200,{});
    }
    if(route==='/api/history' && req.method==='GET'){
      return send(200,db.prepare("SELECT h.document,h.status,h.note,h.created,a.name FROM decisions h JOIN documents x ON x.id=h.document JOIN accounts a ON a.id=h.actor WHERE x.department=? AND (x.author=? OR ?='manager') ORDER BY h.id").all(user.department,user.id,user.role));
    }
    if(route==='/api/resubmit' && req.method==='POST'){
      const body=field(input.body,1,10000).trim();
      if(!Number.isSafeInteger(input.id))fail(400,'Неверный номер документа.');
      db.exec('BEGIN IMMEDIATE');
      try {
        const r=db.prepare("UPDATE documents SET body=?,status='submitted',reviewer=NULL WHERE id=? AND author=? AND department=? AND status='returned'").run(body,input.id,user.id,user.department);
        if(!r.changes)fail(409,'Документ недоступен для исправления.');
        db.prepare("INSERT INTO decisions(document,actor,status,note) VALUES (?,?,'submitted',?)").run(input.id,user.id,'Исправленная редакция');
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      return send(200,{});
    }
    if(route==='/api/documents'){
      if(req.method==='GET')return send(200,db.prepare("SELECT x.id,x.author AS authorId,x.title,x.body,x.status,x.created,a.name FROM documents x JOIN accounts a ON a.id=x.author WHERE x.department=? AND (x.author=? OR ?='manager') ORDER BY x.id DESC").all(user.department,user.id,user.role));
      if(req.method==='POST'){const result=db.prepare('INSERT INTO documents(author,department,title,body) VALUES (?,?,?,?)').run(user.id,user.department,field(input.title,1,160).trim(),field(input.body,1,10000).trim());return send(201,{id:result.lastInsertRowid});}
    }
    if(req.method==='POST' && route==='/api/review'){
      if(user.role!=='manager')fail(403,'Нужны права руководителя.');
      if(!['accepted','returned'].includes(input.status)||!Number.isSafeInteger(input.id))fail(400,'Некорректное решение.');
      const note=input.status==='returned'?field(input.note,1,2000).trim():String(input.note||'').slice(0,2000);
      db.exec('BEGIN IMMEDIATE');
      try {
      const result=db.prepare("UPDATE documents SET status=?,reviewer=? WHERE id=? AND department=? AND author<>? AND status='submitted'").run(input.status,user.id,input.id,user.department,user.id);
      if(!result.changes)fail(409,'Документ недоступен для рассмотрения.');
      db.prepare('INSERT INTO decisions(document,actor,status,note) VALUES (?,?,?,?)').run(input.id,user.id,input.status,note);
      db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      return send(200,{});
    }
    send(404,{});
  } catch(e){const known=Number.isInteger(e.code);send(known?e.code:500,{error:known?e.message:'Ошибка сервера.'});}
});
server.listen(port,'127.0.0.1',()=>console.log('Portal listening on '+port));
