"use strict";
(()=>{
 const base=window.irReportsPage;
 if(typeof base!=="function")return;
 window.irReportsPage=async function(oid,route={}){
  if((!route||!route.mode)&&/\/objects\/object\/\d+\/reports\/new$/.test(location.hash.slice(1))){
   route={...(route||{}),mode:"new"};
  }
  return base(oid,route);
 };
})();