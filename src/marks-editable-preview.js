"use strict";
(()=>{
 const patch=()=>{
  document.querySelectorAll("#marksImportForm").forEach(form=>{
   if(form.dataset.editablePreview==="1")return;
   const preview=form.querySelector("#marksImportPreview"),wrap=form.querySelector("#marksImportPreviewWrap"),status=form.querySelector("#marksExcelStatus"),manual=form.querySelector('textarea[name="rows"]'),submit=form.querySelector('button[type="submit"]');
   if(!preview||!wrap||!manual||!submit)return;
   form.dataset.editablePreview="1";
   preview.removeAttribute("readonly");
   preview.spellcheck=false;
   submit.textContent="Сохранить ведомость";
   const hint=document.createElement("div");hint.className="marks-import-edit-hint";wrap.appendChild(hint);
   const syncMode=()=>{const excelReady=!!status?.classList.contains("ready");preview.readOnly=excelReady;hint.textContent=excelReady?"Предпросмотр Excel. Для изменения данных исправьте Excel или вставьте строки вручную выше.":"Можно редактировать уже загруженную ведомость прямо здесь. Заголовок можно оставить."};
   if(status)new MutationObserver(syncMode).observe(status,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
   syncMode();
   const originalSubmit=form.onsubmit;
   form.onsubmit=async e=>{const editingCurrent=!wrap.hidden&&!status?.classList.contains("ready");if(editingCurrent&&!manual.value.trim()&&preview.value.trim())manual.value=preview.value;return originalSubmit?originalSubmit.call(form,e):undefined};
  });
 };
 new MutationObserver(patch).observe(document.documentElement,{childList:true,subtree:true});
 patch();
})();
