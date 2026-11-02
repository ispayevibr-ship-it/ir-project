"use strict";
/*
 * Почта программы (раздел «Исходящие письма»): вход в почтовый ящик (Настройки → «Почта») и отправка письма с вложением
 * по SMTP — без пакетов, на node:net / node:tls. Пароль хранится на этом компьютере зашифрованным (safeStorage) и в окно
 * не возвращается. Файл userData/mail-settings.json: сервер, порт, шифрование, адрес, имя отправителя, бланк письма.
 * Почтовые службы с двухэтапным входом (Gmail, Mail.ru, Яндекс) принимают не обычный пароль, а «пароль приложения».
 */
const fs=require("node:fs"),path=require("node:path"),net=require("node:net"),tls=require("node:tls"),os=require("node:os"),crypto=require("node:crypto");
// Сервер по домену адреса: то, что программа подставляет сама.
const PRESETS=[
 {key:"gmail",name:"Gmail",host:"smtp.gmail.com",port:465,security:"ssl",domains:["gmail.com","googlemail.com"],help:"Gmail принимает только пароль приложения: myaccount.google.com → Безопасность → Двухэтапная аутентификация → Пароли приложений."},
 {key:"mailru",name:"Mail.ru",host:"smtp.mail.ru",port:465,security:"ssl",domains:["mail.ru","inbox.ru","list.ru","bk.ru","internet.ru","mail.kz"],help:"Mail.ru: Настройки → Безопасность → Пароли для внешних приложений → создать пароль (доступ «IMAP, SMTP, POP3»)."},
 {key:"yandex",name:"Яндекс Почта",host:"smtp.yandex.ru",port:465,security:"ssl",domains:["yandex.ru","ya.ru","yandex.kz","yandex.com","yandex.by"],help:"Яндекс: id.yandex.ru → Безопасность → Пароли приложений → Почта. В настройках почты включите «Почтовые программы»."},
 {key:"outlook",name:"Outlook / Office 365",host:"smtp.office365.com",port:587,security:"starttls",domains:["outlook.com","hotmail.com","live.com","office365.com"],help:"Outlook: вход по паролю для программ должен быть разрешён администратором почты (SMTP AUTH)."}
];
const presetOf=email=>{const d=String(email||"").split("@")[1]?.toLowerCase()||"";return PRESETS.find(p=>p.domains.includes(d))||null};
const EMAIL=/^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
// «a@b.kz; c@d.ru, Иван <e@f.kz>» → адреса.
function addresses(v){
 const list=Array.isArray(v)?v:String(v||"").split(/[;,\n]+/);const out=[];
 for(const x of list){const s=String(x||"").trim();if(!s)continue;const m=/<([^>]+)>/.exec(s),a=(m?m[1]:s).trim();
  if(!EMAIL.test(a))throw Error("Неверный адрес почты: «"+s+"»");if(!out.some(o=>o.toLowerCase()===a.toLowerCase()))out.push(a)}
 return out
}
// ---- письмо (RFC 5322 / MIME), всё в UTF-8 ----
const b64=v=>Buffer.from(v).toString("base64");
const wrap=(s,n=76)=>s.replace(new RegExp(`.{1,${n}}`,"g"),"$&\r\n");
// Заголовок с русскими буквами: =?UTF-8?B?…?= кусками не длиннее 45 байт (одна строка — до 76 знаков).
function word(text){
 const s=String(text||"");if(/^[\x20-\x7e]*$/.test(s))return s;
 const parts=[];let cur="";for(const ch of s){if(Buffer.byteLength(cur+ch)>45){parts.push(cur);cur=""}cur+=ch}if(cur)parts.push(cur);
 return parts.map(p=>"=?UTF-8?B?"+b64(p)+"?=").join("\r\n ")
}
const mailbox=(name,addr)=>name?`${/^[\x20-\x7e]*$/.test(name)?'"'+String(name).replace(/["\\]/g,"")+'"':word(name)} <${addr}>`:`<${addr}>`;
const MIME={pdf:"application/pdf",docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",doc:"application/msword",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",zip:"application/zip",txt:"text/plain"};
function message({from,fromName,to,cc=[],subject,text,html,attachments=[],date=new Date(),id}){
 const boundary="=_ir_"+crypto.randomBytes(12).toString("hex"),alt="=_ir_alt_"+crypto.randomBytes(12).toString("hex");
 const domain=String(from).split("@")[1]||"irproject.local";
 const head=[`From: ${mailbox(fromName,from)}`,`To: ${to.join(", ")}`,...(cc.length?[`Cc: ${cc.join(", ")}`]:[]),`Subject: ${word(subject||"")}`,
  `Date: ${date.toUTCString().replace("GMT","+0000")}`,`Message-ID: <${id||Date.now()+"."+crypto.randomBytes(6).toString("hex")}@${domain}>`,"MIME-Version: 1.0","X-Mailer: IR Project",
  `Content-Type: multipart/mixed; boundary="${boundary}"`];
 const body=[];
 const textPart=["Content-Type: text/plain; charset=UTF-8","Content-Transfer-Encoding: base64","",wrap(b64(String(text||"").replace(/\r?\n/g,"\r\n")))];
 if(html){body.push(`--${boundary}`,`Content-Type: multipart/alternative; boundary="${alt}"`,"",`--${alt}`,...textPart,`--${alt}`,"Content-Type: text/html; charset=UTF-8","Content-Transfer-Encoding: base64","",wrap(b64(String(html))),`--${alt}--`)}
 else body.push(`--${boundary}`,...textPart);
 for(const a of attachments){
  const name=String(a.name||"файл"),ext=path.extname(name).slice(1).toLowerCase(),data=Buffer.from(a.data||[]);
  const ascii=/^[\x20-\x7e]*$/.test(name)&&!/["\\]/.test(name);
  const star="UTF-8''"+encodeURIComponent(name).replace(/['()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());
  body.push(`--${boundary}`,`Content-Type: ${a.type||MIME[ext]||"application/octet-stream"}; name="${ascii?name:word(name).replace(/\r\n /g," ")}"`,"Content-Transfer-Encoding: base64",
   `Content-Disposition: attachment; ${ascii?`filename="${name}"`:`filename*=${star}`}`,"",wrap(b64(data)))
 }
 body.push(`--${boundary}--`,"");
 return head.join("\r\n")+"\r\n\r\n"+body.join("\r\n")
}
// ---- SMTP: один разговор с сервером ----
function smtpSession({host,port,security,timeout=45000,tlsOptions={}}){
 let socket=null,buffer="",waiting=null,closed=null;const lines=[];
 const fail=e=>{closed=e;if(waiting){const w=waiting;waiting=null;w.reject(e)}};
 const pump=()=>{
  if(!waiting)return;
  // Ответ сервера: строки «250-…» до строки «250 …».
  let end=-1;for(let i=0;i<lines.length;i++)if(/^\d{3}(?: |$)/.test(lines[i])){end=i;break}
  if(end<0)return;const got=lines.splice(0,end+1),code=Number(got[end].slice(0,3)),w=waiting;waiting=null;
  w.resolve({code,text:got.map(l=>l.slice(4)).join("\n")})
 };
 const attach=s=>{socket=s;s.setTimeout(timeout);
  s.on("data",d=>{buffer+=Buffer.isBuffer(d)?d.toString("utf8"):String(d);let i;while((i=buffer.indexOf("\n"))>=0){lines.push(buffer.slice(0,i).replace(/\r$/,""));buffer=buffer.slice(i+1)}pump()});
  s.on("timeout",()=>{fail(Error("Почтовый сервер не отвечает"));s.destroy()});
  s.on("error",e=>fail(e));s.on("close",()=>fail(closed||Error("Почтовый сервер закрыл соединение")))};
 const read=()=>new Promise((resolve,reject)=>{if(closed&&!lines.length)return reject(closed);waiting={resolve,reject};pump()});
 const opts={host,port,servername:net.isIP(host)?undefined:host,...tlsOptions};
 return{
  open:()=>new Promise((resolve,reject)=>{
   const s=security==="ssl"?tls.connect(opts):net.connect({host,port});
   attach(s);s.once(security==="ssl"?"secureConnect":"connect",()=>resolve());s.once("error",reject)}),
  async cmd(line,expect,secret){
   if(line!=null)socket.write(line+"\r\n");
   const r=await read();
   if(expect&&!expect.includes(r.code)){const e=Error(`${secret||String(line||"").split(" ")[0]||"Сервер"}: ${r.code} ${r.text}`);e.code=r.code;e.smtp=r.text;throw e}
   return r
  },
  write:data=>new Promise((resolve,reject)=>socket.write(data,e=>e?reject(e):resolve())),
  upgrade:()=>new Promise((resolve,reject)=>{
   socket.removeAllListeners("data");socket.removeAllListeners("timeout");socket.removeAllListeners("close");socket.removeAllListeners("error");
   const s=tls.connect({...opts,socket},()=>resolve());s.once("error",reject);attach(s)}),
  close:()=>{try{socket?.end();socket?.destroy()}catch{}}
 }
}
// Понятное инженеру объяснение ошибки сервера.
function explain(e,cfg){
 const m=String(e?.message||e),code=e?.code;
 if(code===535||code===534||/auth|authentication|535|534/i.test(m)&&/5\d\d/.test(m)){
  const p=presetOf(cfg?.user);return"Почта не приняла адрес или пароль."+(p?" "+p.help:" Если в ящике включён двухэтапный вход, нужен пароль приложения.")}
 if(/ENOTFOUND|EAI_AGAIN/.test(m))return"Сервер «"+(cfg?.host||"")+"» не найден. Проверьте адрес сервера и интернет.";
 if(/ECONNREFUSED|ETIMEDOUT|не отвечает/.test(m))return"Нет связи с сервером "+(cfg?.host||"")+":"+(cfg?.port||"")+". Проверьте порт и шифрование (465 — SSL, 587 — STARTTLS) или брандмауэр.";
 if(/certificate|self.signed|CERT/i.test(m))return"Сертификат почтового сервера не прошёл проверку: "+m;
 if(/wrong version number|ssl3_get_record|packet length/i.test(m))return"Шифрование не совпадает с портом: для 465 — SSL, для 587 — STARTTLS.";
 if(code===550||code===553||code===554)return"Сервер отказал в отправке: "+m;
 return m
}
async function deliver(cfg,{to,cc=[],raw,tlsOptions}){
 const s=smtpSession({host:cfg.host,port:Number(cfg.port)||465,security:cfg.security||"ssl",tlsOptions});
 try{
  await s.open();await s.cmd(null,[220]);
  const me=(os.hostname()||"irproject").replace(/[^A-Za-z0-9.-]/g,"")||"irproject";
  let ehlo=await s.cmd("EHLO "+me,[250]);
  if(cfg.security==="starttls"){
   if(!/STARTTLS/i.test(ehlo.text))throw Error("Сервер не поддерживает STARTTLS на порту "+cfg.port);
   await s.cmd("STARTTLS",[220]);await s.upgrade();ehlo=await s.cmd("EHLO "+me,[250])}
  if(cfg.password){
   const auth=(/^AUTH\b(.*)$/im.exec(ehlo.text)?.[1]||"").toUpperCase();
   if(/\bPLAIN\b/.test(auth)||!/\bLOGIN\b/.test(auth))await s.cmd("AUTH PLAIN "+b64("\0"+cfg.user+"\0"+cfg.password),[235],"Вход");
   else{await s.cmd("AUTH LOGIN",[334]);await s.cmd(b64(cfg.user),[334],"Вход");await s.cmd(b64(cfg.password),[235],"Вход")}
  }
  if(raw==null){await s.cmd("QUIT",null).catch(()=>{});return{ok:true}}
  await s.cmd(`MAIL FROM:<${cfg.user}>`,[250]);
  for(const a of[...to,...cc])await s.cmd(`RCPT TO:<${a}>`,[250,251]);
  await s.cmd("DATA",[354]);
  // Точка в начале строки удваивается; письмо кончается строкой из одной точки.
  await s.write(raw.replace(/\r?\n/g,"\r\n").replace(/^\./gm,"..")+"\r\n.\r\n");
  const done=await s.cmd(null,[250],"Отправка");
  await s.cmd("QUIT",null).catch(()=>{});
  return{ok:true,reply:done.text}
 }finally{s.close()}
}
function createMail({getUserDataPath,safeStorage}){
 const file=()=>path.join(getUserDataPath(),"mail-settings.json");
 const load=()=>{try{return JSON.parse(fs.readFileSync(file(),"utf8"))||{}}catch{return{}}};
 const store=v=>{fs.mkdirSync(path.dirname(file()),{recursive:true});fs.writeFileSync(file(),JSON.stringify(v,null,1),"utf8")};
 const secret=v=>{if(!v)return"";if(safeStorage?.isEncryptionAvailable?.())return"enc:"+safeStorage.encryptString(String(v)).toString("base64");return"b64:"+b64(v)};
 const reveal=v=>{const s=String(v||"");if(s.startsWith("enc:"))return safeStorage.decryptString(Buffer.from(s.slice(4),"base64"));if(s.startsWith("b64:"))return Buffer.from(s.slice(4),"base64").toString("utf8");return""};
 const config=()=>{const d=load();return{host:d.host||"",port:Number(d.port)||465,security:d.security||"ssl",user:d.user||"",fromName:d.fromName||"",password:d.password?reveal(d.password):""}};
 // То, что видит окно: без пароля.
 function info(){const d=load();return{host:d.host||"",port:Number(d.port)||465,security:d.security||"ssl",user:d.user||"",fromName:d.fromName||"",hasPassword:Boolean(d.password),ready:Boolean(d.host&&d.user&&d.password),checkedAt:d.checkedAt||"",letterhead:d.letterhead||{},copySelf:d.copySelf!==false,presets:PRESETS.map(({domains,...p})=>({...p,domains}))}}
 function set(v={}){
  const d=load(),next={...d};
  if(v.user!==undefined){const u=String(v.user||"").trim();if(u&&!EMAIL.test(u))throw Error("Неверный адрес почты");if(u!==d.user)next.checkedAt="";next.user=u;
   const p=presetOf(u);if(p&&!v.host&&!d.host){next.host=p.host;next.port=p.port;next.security=p.security}}
  if(v.host!==undefined)next.host=String(v.host||"").trim().replace(/^[a-z]+:\/\//i,"").replace(/\/.*$/,"");
  if(v.port!==undefined){const n=Number(v.port);if(!(n>0&&n<65536))throw Error("Неверный порт");next.port=n}
  if(v.security!==undefined)next.security=["ssl","starttls"].includes(v.security)?v.security:"ssl";
  if(v.fromName!==undefined)next.fromName=String(v.fromName||"").trim().slice(0,120);
  if(v.copySelf!==undefined)next.copySelf=v.copySelf!==false;
  if(v.letterhead!==undefined&&v.letterhead&&typeof v.letterhead==="object"){const l=v.letterhead,t=x=>String(x||"").slice(0,600);
   next.letterhead={org:t(l.org),details:t(l.details),signPosition:t(l.signPosition),signName:t(l.signName),executor:t(l.executor),prefix:t(l.prefix).slice(0,30)}}
  if(v.password!==undefined){next.password=v.password?secret(v.password):"";next.checkedAt=""}
  store(next);return info()
 }
 function clear(){const d=load();store({letterhead:d.letterhead||{}});return info()}
 async function test(){
  const c=config();if(!c.host||!c.user||!c.password)throw Error("Укажите адрес почты, пароль и сервер");
  try{await deliver(c,{})}catch(e){throw Error(explain(e,c))}
  const d=load();d.checkedAt=new Date().toISOString();store(d);return info()
 }
 // Письмо: кому, копия, тема, текст и вложения [{name, data: Uint8Array}]. Копия себе — если включена.
 async function send({to,cc,subject,text,attachments=[]}={}){
  const c=config();if(!c.host||!c.user||!c.password)throw Error("Почта не настроена: Настройки → «Почта»");
  const toList=addresses(to),ccList=addresses(cc);if(!toList.length)throw Error("Укажите адрес получателя");
  const files=(Array.isArray(attachments)?attachments:[]).filter(a=>a&&a.data&&a.data.length);
  const size=files.reduce((s,a)=>s+a.data.length,0);if(size>20e6)throw Error("Вложения больше 20 МБ — почта их не примет");
  const bcc=load().copySelf!==false&&!toList.concat(ccList).some(a=>a.toLowerCase()===c.user.toLowerCase())?[c.user]:[];
  const raw=message({from:c.user,fromName:c.fromName,to:toList,cc:ccList,subject,text,attachments:files});
  try{await deliver(c,{to:toList,cc:[...ccList,...bcc],raw})}catch(e){throw Error(explain(e,c))}
  return{ok:true,at:new Date().toISOString(),to:toList,cc:ccList,from:c.user}
 }
 return{info,set,clear,test,send}
}
module.exports={createMail,message,deliver,addresses,word,presetOf,PRESETS,explain};
