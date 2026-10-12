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
   const syncMode=()=>{const excelReady=!!status?.classList.contains("ready"),hasManual=!!manual.value.trim();preview.readOnly=excelReady||hasManual;hint.textContent=hasManual?"Ниже показано, как программа разобрала новую строку. Для записи нажмите «Сохранить ведомость».":excelReady?"Предпросмотр Excel. Для изменения данных исправьте Excel или вставьте строки вручную выше.":"Это ранее сохранённая ведомость. Её можно исправить здесь либо ввести новые строки выше."};
   if(status)new MutationObserver(syncMode).observe(status,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});
   syncMode();
   manual.addEventListener("input",syncMode);
   const originalSubmit=form.onsubmit;
   form.onsubmit=async e=>{const editingCurrent=!wrap.hidden&&!status?.classList.contains("ready");if(editingCurrent&&!manual.value.trim()&&preview.value.trim())manual.value=preview.value;return originalSubmit?originalSubmit.call(form,e):undefined};
  });
 };
 new MutationObserver(patch).observe(document.documentElement,{childList:true,subtree:true});
 patch();
})();
