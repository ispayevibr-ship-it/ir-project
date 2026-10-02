"use strict";
window.irAccess=(()=>{
 const KEYS=["reports","work-types","marks","schedule","photos","scheme","acted-days","penalties","finance"];
 const defaults=()=>Object.fromEntries(KEYS.map(k=>[k,true]));
 function load(){try{return JSON.parse(localStorage.getItem("ir-access"))||{role:"admin",engineer:defaults()}}catch{return {role:"admin",engineer:defaults()}}}
 function save(s){localStorage.setItem("ir-access",JSON.stringify(s));return s}
 function state(){const s=load();s.engineer={...defaults(),...(s.engineer||{})};return s}
 function role(){return state().role||"admin"}
 function setRole(role){const s=state();s.role=["admin","engineer","guest"].includes(role)?role:"guest";save(s)}
 function canEdit(section){const s=state();if(s.role==="admin")return true;if(s.role==="guest")return false;return section?Boolean(s.engineer[section]):false}
 function canView(){return true}
 function setEngineer(section,enabled){if(!KEYS.includes(section))return;const s=state();s.engineer[section]=Boolean(enabled);save(s)}
 function engineer(){return state().engineer}
 return {KEYS,role,setRole,canEdit,canView,setEngineer,engineer};
})();
