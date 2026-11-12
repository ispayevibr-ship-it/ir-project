"use strict";
window.irAccess=(()=>{
 const KEYS=["reports","work-types","marks","deliveries","schedule","photos","scheme","ai-recognition","acted-days","penalties","finance"];
 const defaults=()=>Object.fromEntries(KEYS.map(k=>[k,true]));
 function load(){try{const saved=JSON.parse(localStorage.getItem("ir-access"))||{};const savedRole=localStorage.getItem("ir-active-role");return {role:["admin","engineer","guest"].includes(savedRole)?savedRole:"guest",engineer:{...defaults(),...(saved.engineer||{})}}}catch{return {role:"guest",engineer:defaults()}}}
 function savePermissions(s){localStorage.setItem("ir-access",JSON.stringify({engineer:s.engineer}));return s}
 function state(){const s=load();s.engineer={...defaults(),...(s.engineer||{})};return s}
 function role(){return state().role||"guest"}
 function setRole(role){const next=["admin","engineer","guest"].includes(role)?role:"guest";localStorage.setItem("ir-active-role",next);return next}
 function logout(){localStorage.setItem("ir-active-role","guest");setPerms(null);return "guest"}
 // Права роли с сервера (Панель администратора → «Роли и права», src/server-account.js): у каждого раздела
 // «edit» / «view» / «none» и действия create / delete / export. Без входа на сервер — как раньше (профиль компьютера).
 // Разделы окон → разделы прав: доп. работы — с отчётами, метизы — с ведомостью марок, ИИ — со схемой.
 const GROUP={"extra-works":"reports",fasteners:"marks","ai-recognition":"scheme","ai-scheme-draft":"scheme"};
 const OLD={"executive-docs":"reports",letters:"reports"};
 function perms(){try{const p=JSON.parse(localStorage.getItem("ir-role-perms")||"null");return p&&typeof p==="object"&&p.sections?p:null}catch{return null}}
 function setPerms(p){try{if(p&&p.sections)localStorage.setItem("ir-role-perms",JSON.stringify(p));else localStorage.removeItem("ir-role-perms")}catch{}}
 const levelOf=(p,section)=>{const k=GROUP[section]||section;return p.sections[k]||(OLD[k]&&p.sections[OLD[k]])||"view"};
 function canEdit(section){const s=state();if(s.role==="admin")return true;if(s.role==="guest")return false;const p=perms();if(p)return section?levelOf(p,section)==="edit":false;const k=OLD[section]||section;return k?Boolean(s.engineer[k]):false}
 function canView(section){const s=state();if(s.role==="admin"||!section)return true;const p=perms();return p?levelOf(p,section)!=="none":true}
 function can(action){const s=state();if(s.role==="admin")return true;const p=perms();if(p)return Boolean(p.actions?.[action]);
  return action==="export"?true:action==="delete"?s.role!=="guest":false}
 function setEngineer(section,enabled){if(!KEYS.includes(section))return;const s=state();s.engineer[section]=Boolean(enabled);savePermissions(s)}
 function engineer(){return state().engineer}
 return {KEYS,role,setRole,logout,canEdit,canView,can,perms,setPerms,setEngineer,engineer};
})();
