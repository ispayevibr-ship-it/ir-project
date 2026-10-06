"use strict";
window.irAccess=(()=>{
 const KEYS=["reports","work-types","marks","deliveries","schedule","photos","scheme","acted-days","penalties","finance"];
 const defaults=()=>Object.fromEntries(KEYS.map(k=>[k,true]));
 function load(){try{const saved=JSON.parse(localStorage.getItem("ir-access"))||{};const savedRole=localStorage.getItem("ir-active-role");return {role:["admin","engineer","guest"].includes(savedRole)?savedRole:"guest",engineer:{...defaults(),...(saved.engineer||{})}}}catch{return {role:"guest",engineer:defaults()}}}
 function savePermissions(s){localStorage.setItem("ir-access",JSON.stringify({engineer:s.engineer}));return s}
 function state(){const s=load();s.engineer={...defaults(),...(s.engineer||{})};return s}
 function role(){return state().role||"guest"}
 function setRole(role){const next=["admin","engineer","guest"].includes(role)?role:"guest";localStorage.setItem("ir-active-role",next);return next}
 function logout(){localStorage.setItem("ir-active-role","guest");return "guest"}
 function canEdit(section){const s=state();if(s.role==="admin")return true;if(s.role==="guest")return false;return section?Boolean(s.engineer[section]):false}
 function canView(){return true}
 function setEngineer(section,enabled){if(!KEYS.includes(section))return;const s=state();s.engineer[section]=Boolean(enabled);savePermissions(s)}
 function engineer(){return state().engineer}
 return {KEYS,role,setRole,logout,canEdit,canView,setEngineer,engineer};
})();
