"use strict";
/*
 * IR Project montage scheme: the only view, Three.js 3D. The page owns the data, filters, cuts and the details
 * panel; this viewer draws the members, labels, grid dimensions and colour legend, and places new members
 * by clicking grid nodes or existing members. Every write goes through the page (quota and bounds checks).
 */
window.irThreeSchemeView=(function(){
 var token=0,active=null,loadPromise=null,cameraMemory={};
 // Bundled with the app (works offline); the CDN is only a fallback for an incomplete hot update.
 var sources=[
  ["./vendor/three/three.min.js","https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"],
  ["./vendor/three/OrbitControls.js","https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"]
 ];
 function include(urls,index){
  index=index||0;
  return new Promise(function(resolve,reject){
   var node=document.createElement("script");node.src=urls[index];node.async=true;
   node.onload=function(){resolve()};
   node.onerror=function(){
    node.remove();
    if(index+1<urls.length)include(urls,index+1).then(resolve,reject);
    else reject(new Error("Не удалось загрузить Three.js."))
   };
   document.head.appendChild(node)
  })
 }
 function ensure(){
  // Three.js may be on the page already (an exported scheme): the sortament tables are still needed.
  if(window.THREE&&window.THREE.OrbitControls)return loadSections();
  if(!loadPromise)loadPromise=Promise.resolve().then(function(){
   return window.THREE?null:include(sources[0])
  }).then(function(){
   return window.THREE&&window.THREE.OrbitControls?null:include(sources[1])
  }).then(function(){
   if(!window.THREE||!window.THREE.OrbitControls)throw new Error("Three.js или управление камерой недоступны.");
   return loadSections()
  }).catch(function(e){loadPromise=null;throw e});
  return loadPromise
 }
 function escapeHtml(value){
  return String(value==null?"":value).replace(/[&<>"']/g,function(ch){
   return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]
  })
 }
 var groups={
  columns:["Колонны",0x2563eb],fahwerk:["Фахверки",0x8b40de],girders:["Ригели",0xf07818],
  beams:["Балки",0x008c86],purlins:["Прогоны",0x009fce],ties:["Связи",0xdd9b13],
  spacers:["Распорки",0xcf5b32],posts:["Стойки",0x87951e],trusses:["Фермы",0x994bdb],
  stairs:["Лестницы",0x526dbe],tanks:["Резервуар",0x7f9bb8],bottom:["Днище",0x6b7f95],roof:["Крыша",0x008c86],nozzles:["Патрубки, люки",0xc0392b],guards:["Ограждения",0x7590a8],platforms:["Площадки",0x8c99b8],other:["Прочее",0x586e84]
 };
 // Every group of the catalog of structure types has its colour and name in the legend.
 (window.irStructureTypes?.GROUPS||[]).forEach(function(g){if(!groups[g.key])groups[g.key]=[g.label,g.color]});
 // Not mounted — steel as it is, silver (the engineer, 27.10.2026: «не смонтированные металлоконструкции сделай цветом
 // металла, серебристый такой, чтобы не сливался с фоном»; the light grey #B7BDC4 of the report of 25.10.2026 merged
 // with the light backgrounds): darker than any light background, with the sheen of metal (plannedMetal below).
 var statusColors={mounted:[0x159b65,"Смонтировано"],partial:[0xe09b00,"Частично"],planned:[0x9ea8b4,"Не смонтировано"]};
 // How fully the reading of the drawings determined an element (src/ai-montage.js). The preliminary ones (not confirmed
 // or computed) are drawn pale in every colouring: placed all the same, to be edited by the engineer.
 var instanceColors={confirmed:[0x159b65,"Подтверждено"],computed:[0x2f6fd6,"Вычислено"],partial:[0xe09b00,"Частично"],ambiguous:[0x8b40de,"Неоднозначно"],
  conflict:[0xd03a2f,"Конфликт данных"],not_found:[0x7a8796,"Нет в новом анализе"],none:[0x586e84,"Без оценки"]};
 function instanceKey(c){return instanceColors[c.instance_status]&&c.instance_status!=="none"?c.instance_status:"none"}

 // RAL in sRGB (knowledge/global/colors-ral.json; the test checks they agree): Classic «7047» with its Russian name and
 // Effect «110-M» by the tables, Design System+ «210 50 15» by its code — the code is the colour itself in CIE LCh (hue,
 // lightness, chroma), turned to sRGB (D65). The АР gives them to its panels, trims, doors and gates («ПЭ-RAL7047»,
 // «(RAL 2008)»). Coloured by kinds, an element with its RAL is drawn in that colour, and the legend names it (the
 // engineer, 25.10.2026: «сэндвич панель (если есть цвет, то и цвет тоже)»; 26.10.2026: «изучи все RAL»).
 var RAL={},RAL_NAMES={},RAL_EFFECT={};"1000:cdba88:Зелёно-бежевый|1001:d0b084:Бежевый|1002:d2aa6d:Песочно-жёлтый|1003:f9a800:Сигнальный жёлтый|1004:e49e00:Золотисто-жёлтый|1005:cb8e00:Медово-жёлтый|1006:e29000:Кукурузно-жёлтый|1007:e88c00:Жёлтый нарцисс|1011:af804f:Коричнево-бежевый|1012:ddaf27:Лимонно-жёлтый|1013:e3d9c6:Жемчужно-белый|1014:ddc49a:Слоновая кость|1015:e6d2b5:Светлая слоновая кость|1016:f1dd38:Жёлтая сера|1017:f6a950:Шафраново-жёлтый|1018:faca30:Цинково-жёлтый|1019:a48f7a:Серо-бежевый|1020:a08f65:Оливково-жёлтый|1021:f6b600:Рапсово-жёлтый|1023:f7b500:Транспортный жёлтый|1024:ba8f4c:Охра жёлтая|1026:ffff00:Люминесцентный жёлтый|1027:a77f0e:Карри|1028:ff9b00:Дынно-жёлтый|1032:e2a300:Жёлтый ракитник|1033:f99a1c:Георгиново-жёлтый|1034:eb9c52:Пастельно-жёлтый|1035:908370:Перламутрово-бежевый|1036:80643f:Перламутрово-золотой|1037:f09200:Солнечно-жёлтый|2000:dd7907:Жёлто-оранжевый|2001:be4e20:Красно-оранжевый|2002:c63927:Алый|2003:fa842b:Пастельно-оранжевый|2004:e75b12:Чистый оранжевый|2005:ff2300:Люминесцентный оранжевый|2007:ffa421:Люминесцентный ярко-оранжевый|2008:f3752c:Ярко-красно-оранжевый|2009:e15501:Транспортный оранжевый|2010:d4652f:Сигнальный оранжевый|2011:ec7c25:Насыщенный оранжевый|2012:db6a50:Лососёво-оранжевый|2013:954527:Перламутрово-оранжевый|2017:fa4402:Оранжевый RAL|3000:ab2524:Огненно-красный|3001:a02128:Сигнальный красный|3002:a1232b:Карминно-красный|3003:8d1d2c:Рубиново-красный|3004:701f29:Пурпурно-красный|3005:5e2028:Винно-красный|3007:402225:Чёрно-красный|3009:703731:Оксид красный|3011:7e292c:Коричнево-красный|3012:cb8d73:Бежево-красный|3013:9c322e:Томатно-красный|3014:d47479:Старый розовый|3015:e1a6ad:Светло-розовый|3016:ac4034:Кораллово-красный|3017:d3545f:Розовый|3018:d14152:Клубнично-красный|3020:c1121c:Транспортный красный|3022:d56d56:Лососёво-красный|3024:f70000:Люминесцентный красный|3026:ff0000:Люминесцентный ярко-красный|3027:b42041:Малиново-красный|3028:e72512:Чистый красный|3031:ac323b:Восточный красный|3032:711521:Перламутрово-рубиновый|3033:b24c43:Перламутрово-розовый|4001:8a5a83:Красно-сиреневый|4002:933d50:Красно-фиолетовый|4003:d15b8f:Вересково-фиолетовый|4004:691639:Бордово-фиолетовый|4005:83639d:Сине-сиреневый|4006:992572:Транспортный пурпурный|4007:4a203b:Пурпурно-фиолетовый|4008:904684:Сигнальный фиолетовый|4009:a38995:Пастельно-фиолетовый|4010:c63678:Телемагента|4011:8773a1:Перламутрово-фиолетовый|4012:6b6880:Перламутрово-ежевичный|5000:384c70:Фиолетово-синий|5001:1f4764:Зелёно-синий|5002:2b2c7c:Ультрамариново-синий|5003:2a3756:Сапфирово-синий|5004:1d1f2a:Чёрно-синий|5005:154889:Сигнальный синий|5007:41678d:Бриллиантово-синий|5008:313c48:Серо-синий|5009:2e5978:Лазурно-синий|5010:13447c:Горечавково-синий|5011:232c3f:Стальной синий|5012:3481b8:Голубой|5013:232d53:Кобальтово-синий|5014:6c7c98:Голубино-синий|5015:2874b2:Небесно-синий|5017:0e518d:Транспортный синий|5018:21888f:Бирюзово-синий|5019:1a5784:Синий капри|5020:0b4151:Океанская синь|5021:07737a:Водная синь|5022:2f2a5a:Ночной синий|5023:4d668e:Отдалённо-синий|5024:6a93b0:Пастельно-синий|5025:296478:Перламутровый горечавково-синий|5026:102c54:Перламутровый ночной синий|6000:327662:Патиново-зелёный|6001:28713e:Изумрудно-зелёный|6002:276235:Лиственно-зелёный|6003:4b573e:Оливково-зелёный|6004:0e4243:Сине-зелёный|6005:0f4336:Зелёный мох|6006:40433b:Серо-оливковый|6007:283424:Бутылочно-зелёный|6008:35382e:Коричнево-зелёный|6009:26392f:Пихтовый зелёный|6010:3e753b:Травяной зелёный|6011:68825b:Резедово-зелёный|6012:31403d:Чёрно-зелёный|6013:797c5a:Тростниково-зелёный|6014:444337:Жёлто-оливковый|6015:3d403a:Чёрно-оливковый|6016:026a52:Бирюзово-зелёный|6017:468641:Майский зелёный|6018:48a43f:Жёлто-зелёный|6019:b7d9b1:Пастельно-зелёный|6020:354733:Хромовый зелёный|6021:86a47c:Бледно-зелёный|6022:3e3c32:Коричнево-оливковый|6024:008754:Транспортный зелёный|6025:53753c:Папоротниково-зелёный|6026:005d52:Опаловый зелёный|6027:81c0bb:Светло-зелёный|6028:2d5546:Сосновый зелёный|6029:007243:Мятно-зелёный|6032:0f8558:Сигнальный зелёный|6033:478a84:Мятно-бирюзовый|6034:7fb0b2:Пастельно-бирюзовый|6035:1b542c:Перламутрово-зелёный|6036:005d4c:Перламутровый опаловый зелёный|6037:25e712:Чистый зелёный|6038:00f700:Люминесцентный зелёный|6039:b3c43e:Волокнисто-зелёный|7000:7e8b92:Серая белка|7001:8f999f:Серебристо-серый|7002:817f68:Оливково-серый|7003:7a7b6d:Серый мох|7004:9ea0a1:Сигнальный серый|7005:6b716f:Мышино-серый|7006:756f61:Бежево-серый|7008:746643:Серое хаки|7009:5b6259:Зелёно-серый|7010:575d57:Брезентово-серый|7011:555d61:Железно-серый|7012:596163:Базальтово-серый|7013:555548:Коричнево-серый|7015:51565c:Сланцево-серый|7016:373f43:Антрацитово-серый|7021:2e3234:Чёрно-серый|7022:4b4d46:Серая умбра|7023:818479:Серый бетон|7024:474a50:Графитовый серый|7026:374447:Гранитовый серый|7030:939388:Каменно-серый|7031:5d6970:Сине-серый|7032:b9b9a8:Галечный серый|7033:818979:Цементно-серый|7034:939176:Жёлто-серый|7035:cbd0cc:Светло-серый|7036:9a9697:Платиново-серый|7037:7c7f7e:Пыльно-серый|7038:b4b8b0:Агатовый серый|7039:6b695f:Кварцевый серый|7040:9da3a6:Серое окно|7042:8f9695:Транспортный серый A|7043:4e5451:Транспортный серый B|7044:bdbdb2:Серый шёлк|7045:91969a:Телегрей 1|7046:82898e:Телегрей 2|7047:cfd0cf:Телегрей 4|7048:888175:Перламутровый мышино-серый|8000:887142:Зелёно-коричневый|8001:9c6b30:Охра коричневая|8002:7b5141:Сигнальный коричневый|8003:80542f:Глиняный коричневый|8004:8f4e35:Медно-коричневый|8007:6f4a2f:Палево-коричневый|8008:6f4f28:Оливково-коричневый|8011:5a3a29:Орехово-коричневый|8012:673831:Красно-коричневый|8014:49392d:Сепия коричневая|8015:633a34:Каштаново-коричневый|8016:4c2f26:Махагон коричневый|8017:44322d:Шоколадно-коричневый|8019:3f3a3a:Серо-коричневый|8022:211f20:Чёрно-коричневый|8023:a65e2f:Оранжево-коричневый|8024:79553c:Бежево-коричневый|8025:755c49:Бледно-коричневый|8028:4e3b2b:Терракотовый|8029:773c27:Перламутровый медный|9001:efebdc:Кремово-белый|9002:ddded4:Серо-белый|9003:f4f8f4:Сигнальный белый|9004:2e3032:Сигнальный чёрный|9005:0a0a0d:Глубокий чёрный|9006:a5a8a6:Бело-алюминиевый|9007:8f8f8c:Серо-алюминиевый|9010:f7f9ef:Чистый белый|9011:292c2f:Графитно-чёрный|9012:fffde6:Белый для чистых помещений|9016:f7fbf5:Транспортный белый|9017:2a2d2f:Транспортный чёрный|9018:cfd3cd:Папирусно-белый|9022:9c9c9c:Перламутровый светло-серый|9023:7e8182:Перламутровый тёмно-серый".split("|").forEach(function(p){var q=p.split(":");RAL[q[0]]=parseInt(q[1],16);RAL_NAMES[q[0]]=q[2]});
 "110-1:e6e7e6,110-2:deddd5,110-3:c8c6be,110-4:c6c7c4,110-5:c9ccc6,110-6:c8c8c7,110-M:a0a2a4,120-1:ededea,120-2:f2f1ec,120-3:f0eee5,120-4:e9e1d4,120-5:e2d9c6,120-6:eae1ce,120-M:8f8d87,130-1:f2edbb,130-2:f1eec3,130-3:f0eecd,130-4:f8f0cf,130-5:ede4bc,130-6:fbe5b0,130-M:abab90,140-1:fad3a9,140-2:fedaa6,140-3:fee3c1,140-4:fddfbe,140-5:f8e4c8,140-6:e5d2b6,140-M:b09e7e,150-1:f7efe9,150-2:f9ebe3,150-3:eee1d7,150-4:fbe3d4,150-5:fae8dc,150-6:f8dfd7,150-M:ab978a,160-1:e3e1ec,160-2:e7e2e8,160-3:ede8e8,160-4:eee1e2,160-5:efe4e0,160-6:ece4e9,160-M:ada6b5,170-1:c7c9d0,170-2:a6adbd,170-3:bac8da,170-4:cedbec,170-5:c3c6d6,170-6:c6c5d6,170-M:a7a8b9,180-1:aebcc6,180-2:b9cddd,180-3:c7dbeb,180-4:c9e1ec,180-5:c7dde1,180-6:dbe9eb,180-M:96a4a9,190-1:a5dadf,190-2:b9e6f2,190-3:c0dee1,190-4:bddad7,190-5:d4e5e7,190-6:a3c1bf,190-M:92b4b2,210-1:cfc6b2,210-2:ece7d2,210-3:e3e4d9,210-4:d6e6e3,210-5:d8e8e0,210-6:d8e9d6,210-M:a5a99b,220-1:66b872,220-2:339a51,220-3:006f3c,220-4:7fff7f,220-5:00ff00,220-6:008000,220-M:007f3e,230-1:bbdb9a,230-2:96c86c,230-3:7db344,230-4:5f973a,230-5:396938,230-6:365c30,230-M:62a74e,240-1:dcd691,240-2:aaaf66,240-3:939755,240-4:7e7e42,240-5:5d6d3c,240-6:4f6d35,240-M:627439,250-1:eee6a5,250-2:e8de6f,250-3:bfb700,250-4:a4a541,250-5:919138,250-6:69652c,250-M:aea73b,260-1:f3e9b4,260-2:f1e483,260-3:f3d446,260-4:e8c01f,260-5:deb02d,260-6:efb416,260-M:b8944f,270-1:ffde83,270-2:facc39,270-3:f4bd16,270-4:ebb100,270-5:f6b600,270-6:fec43f,270-M:cb9437,280-1:fde193,280-2:f0d391,280-3:e1be78,280-4:d6ae5f,280-5:dca140,280-6:d0973c,280-M:b28740,290-1:d89b50,290-2:bf853b,290-3:d8a960,290-4:cc921b,290-5:e6b03e,290-6:fcab04,290-M:b87e32,310-1:f5d6b4,310-2:ebc297,310-3:dfab73,310-4:d09355,310-5:ba7c43,310-6:8e5b2d,310-M:b87d4f,320-1:d2a96c,320-2:ae8151,320-3:b9864c,320-4:a06735,320-5:7f4e2e,320-6:6e4428,320-M:b9731e,330-1:a86859,330-2:8e4b35,330-3:794e3e,330-4:5c3b2d,330-5:50312a,330-6:46322e,330-M:8b5943,340-1:bea4a9,340-2:a48c92,340-3:7f5452,340-4:683d40,340-5:4f2a2d,340-6:4f2b31,340-M:53353b,350-1:9d311f,350-2:a73f32,350-3:a24733,350-4:813021,350-5:783122,350-6:66322b,350-M:582f2a,360-1:e07d29,360-2:d9751e,360-3:c66217,360-4:b75629,360-5:9a4f2c,360-6:915033,360-M:a45633,370-1:ffae47,370-2:ff9b38,370-3:ff901d,370-4:e68316,370-5:d4781f,370-6:cd6c10,370-M:b47a3c,380-1:ff9b29,380-2:ff9204,380-3:fa841a,380-4:e27121,380-5:f2782f,380-6:ea6a24,380-M:a7552a,390-1:eb773f,390-2:e36125,390-3:de5411,390-4:d8511c,390-5:d8480f,390-6:cd5e2a,390-M:bf633b,410-1:ed8165,410-2:ea734f,410-3:e46440,410-4:dc5d38,410-5:d25535,410-6:d05d42,410-M:ab4924,420-1:edae9a,420-2:f29d86,420-3:e98a6c,420-4:e46443,420-5:cc5738,420-6:bf502e,420-M:9d4b32,430-1:f2c2b6,430-2:ec998b,430-3:e48074,430-4:dd5a4c,430-5:d5433c,430-6:be3a24,430-M:a84c45,440-1:ca383c,440-2:d34c49,440-3:ba3c3e,440-4:9b2929,440-5:a63129,440-6:b93525,440-M:9b252c,450-1:f4c7ca,450-2:eda5aa,450-3:e07a81,450-4:c85862,450-5:b2312f,450-6:bb201d,450-M:a71616,460-1:efa3a7,460-2:e37f89,460-3:df6368,460-4:d35254,460-5:a8373b,460-6:8b1b28,460-M:ae363b,470-1:f0b3c1,470-2:e68b9d,470-3:de7383,470-4:ca4d67,470-5:ac2d4c,470-6:9c223f,470-M:b14f5d,480-1:f5cac9,480-2:f5c0be,480-3:eebabc,480-4:eea5b1,480-5:e9909e,480-6:da6c82,480-M:a87579,490-1:f3cfd0,490-2:f7cac3,490-3:e89a92,490-4:c37b77,490-5:be7f8c,490-6:d29ea8,490-M:a77d88,510-1:ecc8dc,510-2:e0a5cb,510-3:d584b1,510-4:c4638d,510-5:ba4877,510-6:9a3b6a,510-M:8c3d71,520-1:efd2df,520-2:e8bad2,520-3:dca5c0,520-4:ba7293,520-5:a04e6f,520-6:92526e,520-M:9e588b,530-1:98444d,530-2:8f3f4e,530-3:793644,530-4:7c2f4b,530-5:66253d,530-6:61294a,530-M:5c2d3a,540-1:d4c1d7,540-2:bea1c1,540-3:805f83,540-4:966b98,540-5:81537a,540-6:562c51,540-M:562f4e,550-1:e0d1d9,550-2:d0bbc9,550-3:b292a8,550-4:9c7488,550-5:8d6177,550-6:784c5e,550-M:a78890,560-1:ccbcc7,560-2:b09cad,560-3:8c6f80,560-4:775460,560-5:85727f,560-6:7d6e7f,560-M:a592a4,570-1:d1cee8,570-2:c3bfe1,570-3:adaddd,570-4:9b9acf,570-5:8078b3,570-6:79689b,570-M:6b589a,580-1:c2cfe6,580-2:bcc7e0,580-3:a7b2d1,580-4:69749a,580-5:41506e,580-6:243154,580-M:636c86,590-1:666d9b,590-2:424276,590-3:2a366b,590-4:272f5b,590-5:142d58,590-6:093b7a,590-M:293862,610-1:6e8fab,610-2:617a94,610-3:6d95b9,610-4:89b2d8,610-5:4777ae,610-6:436999,610-M:7897b5,620-1:34688a,620-2:6092ac,620-3:64818f,620-4:3a5a6a,620-5:14354b,620-6:1e2d3f,620-M:093246,630-1:51a3d3,630-2:446b8e,630-3:2e4e6f,630-4:2d4a6e,630-5:1f3454,630-6:193654,630-M:16304c,640-1:49a0c5,640-2:0087b5,640-3:007bae,640-4:005c8c,640-5:00548a,640-6:004f7d,640-M:004e87,650-1:64b5d6,650-2:0077a0,650-3:006c97,650-4:005577,650-5:1d5b78,650-6:0a4962,650-M:00719d,660-1:0094b0,660-2:0b8da8,660-3:51a5b8,660-4:3fb8cf,660-5:6cc3d4,660-6:8ac8d5,660-M:5597a9,670-1:8ad3ea,670-2:97daef,670-3:8fc5d6,670-4:69bbd3,670-5:5bb9d5,670-6:4ec2e6,670-M:74a7b8,680-1:72aaba,680-2:338fa4,680-3:177185,680-4:26768d,680-5:006a85,680-6:005b74,680-M:0e455c,690-1:3fbfcb,690-2:00a2ad,690-3:00838e,690-4:006c7b,690-5:00535f,690-6:005160,690-M:006773,710-1:78d1cd,710-2:00aaa7,710-3:058a8b,710-4:007476,710-5:005c60,710-6:0c4746,710-M:00686b,720-1:c2e3de,720-2:a4e2db,720-3:86d3d4,720-4:58bec1,720-5:3393a0,720-6:197c86,720-M:1a949a,730-1:cbe7e2,730-2:98d3d3,730-3:7db8ba,730-4:7bb9b4,730-5:79acac,730-6:46877f,730-M:62a293,740-1:c5dcce,740-2:b3d6c9,740-3:95c3b2,740-4:498574,740-5:006f5b,740-6:005d4e,740-M:3a6f5f,750-1:bfd7c9,750-2:8fb4a0,750-3:3d7461,750-4:164234,750-5:335449,750-6:2e3c3b,750-M:17372d,760-1:d5e3ca,760-2:b8cdaa,760-3:b0be9b,760-4:8b9b7a,760-5:6d7e5c,760-6:4a6448,760-M:334b2e,770-1:989d84,770-2:a9a88f,770-3:7a755a,770-4:817a66,770-5:b4af9f,770-6:7e8273,770-M:8d8864,780-1:e9decc,780-2:e7d6b9,780-3:ddc49a,780-4:d1b186,780-5:a38e79,780-6:74695c,780-M:b2a074,790-1:3e4849,790-2:3b4147,790-3:313538,790-4:302f32,790-5:212224,790-6:21232d,790-M:221f1d,810-1:979da2,810-2:8a9499,810-3:79888e,810-4:5e6b73,810-5:51595d,810-6:394146,810-M:404649,820-1:c5c8ca,820-2:a9aeb2,820-3:8d9395,820-4:7d8589,820-5:50555c,820-6:444951,820-M:929191,830-1:babcba,830-2:a4a7a5,830-3:8d9291,830-4:6c706d,830-5:515554,830-6:575e60,830-M:82817f,840-1:e7e3d8,840-2:d7d5cc,840-3:b8b4a8,840-4:808077,840-5:5a5d54,840-6:474135,840-M:494440,850-1:c3c2b9,850-2:b1b1aa,850-3:a6a6a0,850-4:918d85,850-5:6b6760,850-6:4c4b46,850-M:625e59,860-1:d8dadb,860-2:cfd2d5,860-3:c1c2c4,860-4:9a9a9b,860-5:7a7a79,860-6:5b5f5f,860-M:a4a09f,870-1:d3d0d0,870-2:969392,870-3:636164,870-4:514d4e,870-5:4a4747,870-6:3d3737,870-M:4d4747".split(",").forEach(function(p){var q=p.split(":");RAL_EFFECT[q[0]]=parseInt(q[1],16)});
 function ralDesign(code){
  var m=/^(\d{3}) (\d{2}) (\d{2})$/.exec(code);if(!m||+m[1]>360)return undefined;
  var L=+m[2],C=+m[3],h=+m[1]*Math.PI/180,fy=(L+16)/116,fx=fy+C*Math.cos(h)/500,fz=fy-C*Math.sin(h)/200;
  var f=function(t){return t*t*t>216/24389?t*t*t:(116*t-16)/(24389/27)},X=.95047*f(fx),Y=L>8?fy*fy*fy:L/(24389/27),Z=1.08883*f(fz);
  return[3.2404542*X-1.5371385*Y-.4985314*Z,-.969266*X+1.8760108*Y+.041556*Z,.0556434*X-.2040259*Y+1.0572252*Z].reduce(function(n,c){
   c=Math.max(0,Math.min(1,c));return n*256+Math.round(255*(c<=.0031308?12.92*c:1.055*Math.pow(c,1/2.4)-.055))},0)
 }
 function ralColor(r){return RAL[r]!==undefined?RAL[r]:RAL_EFFECT[r]!==undefined?RAL_EFFECT[r]:ralDesign(r)}
 function ralOf(c){var r=c&&c.lay&&String(c.lay.ral||"");return r&&ralColor(r)!==undefined?r:""}
 // A colour named by a word in the finish of the facade («Окна | Профиль ПВХ | Белый»): the nearest shade of RAL Classic
 // (white of PVC profiles — 9016, anthracite — 7016, graphite — 7024).
 var COLOUR_WORDS=[[/^бел/i,"Белый",0xf1f0ea],[/^сер[её]бр/i,"Серебристый",0xa5a9ad],[/^сер/i,"Серый",0x8f9499],[/^ч[её]рн/i,"Чёрный",0x26282b],[/^коричн/i,"Коричневый",0x5b3a29],[/^графит/i,"Графит",0x474a51],[/^антрацит/i,"Антрацит",0x383e42]];
 function colourWord(c){var w=c&&c.lay&&String(c.lay.colour||"");if(!w)return null;for(var i=0;i<COLOUR_WORDS.length;i++)if(COLOUR_WORDS[i][0].test(w))return COLOUR_WORDS[i];return null}
 function colorKey(c){
  var r=ralOf(c);
  if(!r){var w=colourWord(c);if(!w)return kind(c);var kw="colour:"+w[1];if(!groups[kw])groups[kw]=[w[1],w[2]];return kw}
  var k="ral:"+r;if(!groups[k])groups[k]=["RAL "+r+(RAL_NAMES[r]?" "+RAL_NAMES[r]:""),ralColor(r)];return k
 }
 var COLOR_MODES=["status","type","mark","confidence"];
 var backgrounds={standard:0xdfe8f3,white:0xffffff,gray:0xd9dde2,blue:0xd6e6f6,sand:0xefe6d6,dark:0x1d2733};
 var kindNames={column:"колонна",beam:"балка",bent:"ломаная балка",brace:"связь",truss:"ферма",shell:"стенка резервуара",plate:"днище / площадка"};
 function kind(member){
  var key=String(member.scheme_group||member.schemeGroup||"").toLowerCase();
  return groups[key]?key:(member.geometryType==="column"?"columns":member.geometryType==="brace"?"ties":"beams")
 }
 function number(v){var n=Number(v);return Number.isFinite(n)?n:0}
 function fmt(v){return Math.round(number(v)).toLocaleString("ru-RU")}
 function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)}
 function hsvMark(T,key){
  var h=2166136261;for(var ch of String(key)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)}
  return new T.Color().setHSL(((h>>>0)*.6180339887)%1,.82,.40).getHex()
 }
 // Rolled sections from the global knowledge base (knowledge/global, confirmed rows only): a member whose profile is
 // found is drawn by its real section; the rest keep a conventional one and are counted as such.
 var sections=new Map(),sectionsPromise=null;
 var CATALOGS=["profiles-ibeams","profiles-ibeams-parallel","profiles-ibeams-26020","profiles-ibeams-19425","profiles-channels","profiles-channels-19425",
  "profiles-channels-bent-8278","profiles-channels-bent-8281","profiles-angles","profiles-angles-unequal","profiles-angles-bent-19771","profiles-angles-bent-19772","profiles-box-30245","pipes",
  "profiles-pipes-square-8639","profiles-pipes-rect-8645","profiles-pipes-32931","profiles-lipped-8282","profiles-hat-8283","profiles-z-13229","bars"];
 function loadSections(){
  // An exported scheme carries the rows it needs (a file opened from the disk cannot fetch the tables).
  if(!sectionsPromise&&Array.isArray(window.irSchemeSections)){window.irSchemeSections.forEach(function(r){if(r&&r.id)sections.set(r.id,r)});sectionsPromise=Promise.resolve()}
  if(!sectionsPromise)sectionsPromise=Promise.all(CATALOGS.map(function(name){
   return fetch("../knowledge/global/"+name+".json").then(function(r){return r.ok?r.json():{records:[]}}).catch(function(){return{records:[]}})
  })).then(function(list){
   list.forEach(function(d){(d.records||[]).forEach(function(r){if(r.status==="confirmed")sections.set(r.id,r)})})
  });
  return Promise.all([sectionsPromise,loadFasteners(),loadJointKb()])
 }
 // The catalog of mounting joints (knowledge/global/joints.json, connections.json; src/ai-joint-catalog.js): the type of a
 // node of the scheme, its parts and rules by the norms, the state of the family and its sources. An exported scheme
 // carries the families (window.irSchemeJointKb).
 var jointKb=null,jointKbData=null,jointKbPromise=null;
 function loadJointKb(){
  if(jointKbPromise)return jointKbPromise;
  var lib=window.irJointCatalog;if(!lib)return jointKbPromise=Promise.resolve();
  var use=function(d){jointKbData=d;jointKb=d&&d.families&&d.families.length?lib.create(d):null};
  if(window.irSchemeJointKb&&window.irSchemeJointKb.families){use(window.irSchemeJointKb);return jointKbPromise=Promise.resolve()}
  var get=function(name){return fetch("../knowledge/global/"+name+".json").then(function(r){return r.ok?r.json():null}).catch(function(){return null})};
  return jointKbPromise=Promise.all([get("connections"),get("joints")]).then(function(r){use(lib.slim(r[0]||{records:[]},r[1]||{}))})
 }
 function jointKbRows(){return loadJointKb().then(function(){return jointKbData||{families:[],groups:[]}})}
 // Bolts, nuts and washers of the joints by their standards (knowledge/global/fasteners.json, confirmed rows only):
 // bolt ГОСТ 7798 (S, k), nut ГОСТ 5915 (S, m), washer ГОСТ 11371 (d2, s), thread pitch from the bolt rows that give it.
 var fasteners=new Map(),fastenersPromise=null;
 function fastenerKey(r){
  if(r.kind==="bolt"&&r.standard==="ГОСТ 7798-70")return"bolt:"+r.d_mm;
  if(r.kind==="nut"&&r.standard==="ГОСТ 5915-70")return"nut:"+r.d_mm;
  if(r.kind==="washer"&&r.standard==="ГОСТ 11371-78")return"washer:"+r.d_mm;
  if(r.kind==="bolt"&&r.pitch_mm>0)return"pitch:"+r.d_mm;
  return""
 }
 function loadFasteners(){
  if(!fastenersPromise&&Array.isArray(window.irSchemeFasteners)){window.irSchemeFasteners.forEach(function(r){var k=r&&fastenerKey(r);if(k&&!fasteners.has(k))fasteners.set(k,r)});fastenersPromise=Promise.resolve()}
  if(!fastenersPromise)fastenersPromise=fetch("../knowledge/global/fasteners.json").then(function(r){return r.ok?r.json():{records:[]}}).catch(function(){return{records:[]}}).then(function(d){
   // The thread pitch is the standard's own (ГОСТ 24705) even in a row whose other sizes are still to be checked.
   (d.records||[]).forEach(function(r){var k=fastenerKey(r);if(k&&(r.status==="confirmed"||k.indexOf("pitch:")===0)&&!fasteners.has(k))fasteners.set(k,r)})
  });
  return fastenersPromise
 }
 // The rows for an exported scheme.
 function fastenerRows(){
  return loadFasteners().then(function(){var out=[];fasteners.forEach(function(r){var o={};
   ["id","kind","standard","d_mm","S_mm","k_mm","m_mm","d2_mm","s_mm","pitch_mm","status"].forEach(function(k){if(r[k]!=null)o[k]=r[k]});out.push(o)});return out})
 }
 // How drawings write a section → {shape, h, b, s, t (mm), std}; null when it is not known. `standard` — the one the
 // sheet cites: «30Ш2» of ГОСТ 26020-83 is not «30Ш2» of ГОСТ Р 57837, so only that one; without it 57837 first, then
 // 26020 (ДБ, ДШ, 100Б).
 function sectionOf(text,standard){
  var t=String(text||"").replace(/\s+/g,"").replace(/[хХ×*]/g,"x").replace(/,/g,"."),m,r;
  // The box sign of a font read as a letter: «Тр.r140х4», «Трубаr140х4» are «Тр.□140х4» (src/ai-sheet-extract.js profileWords);
  // read as «3» before three digits too: «Тр.3120х5» is «Тр.□120х5» (no tube is 3120 across — it was drawn so, through the walls).
  t=t.replace(/^(Тр\.?|Гн\.?|Труба(?:профильная)?)(?:[rгзо0](?=\d{2,3}x)|3(?=\d{3}x))/i,function(s,a){return(/^Труба/i.test(a)?"Тр.":a)+"□"});
  // A welded section from the «Ведомость элементов»: «Сварной −20×380, −25×290» — the flange plate first, the web
  // second (thickness × width). A web far taller than the flange is not read as an I (the parts are not that).
  // A strip «−150×4» (the toe board of a railing), «−20×380»: a solid bar standing on its edge, the wider side upright.
  if((m=/^(?:[−-]|Полоса|Пол\.?)(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(t))){var pw=Math.max(+m[1],+m[2]),pt=Math.min(+m[1],+m[2]);return{shape:"plate",h:pw,b:pt,s:pt,t:pt,std:"полоса по обозначению"}}
  // Three plates «Сварной −16×450, −12×2292, −12×280» (the crane girder Бкр1 of the «Ведомость элементов», its parts 1–3):
  // the thinnest is the web (of equal ones the middle), the other two the flanges, the one written first on top — an I
  // with flanges of two widths (b, t on top; b1, t1 at the bottom).
  if((m=/^Сварной[−-](\d+)x(\d+)\.[−-](\d+)x(\d+)\.[−-](\d+)x(\d+)(?!\.?[−-]\d)/.exec(t))){
   var pl=[[+m[1],+m[2]],[+m[3],+m[4]],[+m[5],+m[6]]],wi=[0,2].reduce(function(a,i){return pl[i][0]<pl[a][0]?i:a},1);
   var web=pl[wi],fls=pl.filter(function(q,i){return i!==wi}),hh=web[1]+fls[0][0]+fls[1][0];
   if(web[0]<Math.min(fls[0][1],fls[1][1])/3&&hh<=8*Math.max(fls[0][1],fls[1][1]))return{shape:"ibeam",h:hh,b:fls[0][1],t:fls[0][0],b1:fls[1][1],t1:fls[1][0],s:web[0],std:"сварное сечение по ведомости элементов"};
   return null
  }
  if((m=/^Сварной[−-](\d+)x(\d+)\.[−-](\d+)x(\d+)/.exec(t))){
   var tf=+m[1],bf=+m[2],tw=+m[3],hw=+m[4];
   if(hw+2*tf<=4*bf&&tw<bf/3)return{shape:"ibeam",h:hw+2*tf,b:bf,s:tw,t:tf,std:"сварное сечение по ведомости элементов"};
   return null
  }
  // A welded copy of a rolled I «Св.I40КС2», «Св.I50ШС2» (the sheet's note: «св. I 40КС2 … вместо прокатного I 40К2»): drawn
  // by the rolled one of the same number, and the card says so.
  // Its «I» may be written as «1» («СВ 145ШС1» is Св.I45ШС1).
  if((m=/^(?:Св\.?|Сварной)(?:I|І|1(?=\d{2}(?:ДБ|ДШ|[БШК]))|двутавр)?(\d{2,3}(?:ДБ|ДШ|[БШК]))[СC]?(\d+)$/i.exec(t))){
   var wd=sectionOf(m[1]+m[2],standard);
   if(wd&&wd.shape==="ibeam")return Object.assign({},wd,{std:"сварной, по размерам прокатного "+m[1]+m[2]+" ("+wd.std+")"});
   return null
  }
  // «10У» in a «Сечение» column is a channel; «2L80х6» is drawn by one angle of the pair.
  if(/^\d+(?:\.5)?а?[УПЭЛ]$/.test(t))t="["+t;
  if((m=/^2([L∟\[].+)$/.exec(t)))t=m[1];
  // «Балка 20 К1», «Балка 24 М» — as a price list or a specification writes them; a bare «Балка 20» under ГОСТ 26020/57837 is not ГОСТ 8239.
  if((m=/^(?:I|І|Двутавр|Дв\.?|Балка)(\d{2})$/i.exec(t))&&!(/^Балка/i.test(t)&&/26020|57837/.test(standard||""))&&(r=sections.get("ibeam-8239-"+m[1])))return{shape:"ibeam",h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.t_mm,r:root(r),std:r.standard,kgm:r.mass_kg_m};
  if((m=/^(?:I|І|Двутавр|Дв\.?|Балка)?(\d{2,3})(ДБ|ДШ|[БШКбшкKk])(\d+(?:\.5)?)$/.exec(t))){
   var key=m[1]+({K:"К",k:"К",б:"Б",ш:"Ш",к:"К"}[m[2]]||m[2])+m[3],order=/26020/.test(standard||"")?["26020"]:/57837/.test(standard||"")?["57837"]:["57837","26020"];
   for(var i=0;i<order.length&&!r;i++)r=sections.get("ibeam-"+order[i]+"-"+key);
   if(r)return{shape:"ibeam",h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.t_mm,r:root(r),std:r.standard,kgm:r.mass_kg_m}
  }
  // An I-beam М of ГОСТ 19425-74 (monorail, hoist track): «24М», «I30М».
  if((m=/^(?:I|І|Двутавр|Дв\.?|Балка)?(\d{2})[МM]$/.exec(t))&&(r=sections.get("ibeam-19425-"+m[1]+"М")))return{shape:"ibeam",h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.t_mm,r:root(r),std:r.standard,kgm:r.mass_kg_m};
  // A special channel С of ГОСТ 19425-74: «18С», «[20С».
  if((m=/^(?:\[|Швеллер|Шв\.?)?(\d{2})[СC]([аa]?)$/.exec(t))&&(r=sections.get("channel-19425-"+m[1]+"С"+(m[2]?"а":""))))return{shape:"channel",h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.t_mm,r:root(r),std:r.standard,kgm:r.mass_kg_m};
  // Bent sections drawn by their bend: the wall all round, the outer corner rounded by R + s, the inner by R (the radius of
  // the table). A bent channel «[160×60×4», «гн.[160×80×5» (ГОСТ 8278-83, table 1, else table 2; a size in neither — by
  // designation, square corners), an unequal one «[160×80×50×5» (ГОСТ 8281-80), a bent angle «Уголок гнутый 80×4» (ГОСТ
  // 19771/19772-93).
  if((m=/^(?:(?:гн\.?)?\[|Швеллер(?:гнутый)?(?:неравнополочный)?|Шв\.?(?:гн\.?)?)(\d{2,3})x(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)$/i.exec(t))){
   var k4=+m[1]+"x"+Math.max(+m[2],+m[3])+"x"+Math.min(+m[2],+m[3])+"x"+Number(m[4]);r=sections.get("channel-8281-"+k4)||sections.get("channel-8281-"+k4+"-t2");
   if(r)return{shape:"channel",bent:true,h:r.h_mm,b:r.b_mm,b1:r.b1_mm,s:r.s_mm,t:r.s_mm,r:number(r.R_mm),std:r.standard,kgm:r.mass_kg_m}
  }
  if((m=/^(?:(?:гн\.?)?\[|Швеллер(?:гнутый)?|Шв\.?(?:гн\.?)?)(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)$/i.exec(t))&&+m[3]<+m[2]/2){
   var k3="channel-8278-"+(+m[1])+"x"+(+m[2])+"x"+Number(m[3]);r=sections.get(k3)||sections.get(k3+"-t2");
   if(r)return{shape:"channel",bent:true,h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.s_mm,r:number(r.R_mm),std:r.standard,kgm:r.mass_kg_m};
   return{shape:"channel",h:+m[1],b:+m[2],s:+m[3],t:+m[3],r:0,std:"ГОСТ 8278-83 по обозначению"}
  }
  if(/гн|гнут/i.test(t)&&(m=/^(?:L|∟|Уголок|Уг\.?)(?:гнутый|гн\.?)?(\d+)x(\d+)(?:x(\d+(?:\.\d+)?))?(?:гн\.?)?$/i.exec(t))){
   r=m[3]&&m[1]!==m[2]?sections.get("angle-19772-"+Math.max(+m[1],+m[2])+"x"+Math.min(+m[1],+m[2])+"x"+Number(m[3])):sections.get("angle-19771-"+Number(m[1])+"x"+Number(m[3]||m[2]));
   if(r)return{shape:"angle",bent:true,h:r.B_mm||r.b_mm,b:r.b_mm,s:r.t_mm,t:r.t_mm,r:number(r.R_mm),std:r.standard,kgm:r.mass_kg_m};
   return null
  }
  if((m=/^(?:\[|Швеллер|Шв\.?)(\d+(?:\.5)?а?)([УПЭЛ])$/i.exec(t))&&(r=sections.get("channel-"+m[1].toLowerCase()+m[2].toUpperCase())))return{shape:"channel",h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.t_mm,r:root(r),std:r.standard,kgm:r.mass_kg_m};
  // «[20», «Швеллер 16» without the letter of the series (as ГОСТ 8240-89 wrote them): the rows У and П of ГОСТ 8240-97 have
  // the same h, b, s, t and mass (they differ by the slope of the flanges), so it is drawn by them; where they differ — not.
  if((m=/^(?:\[|Швеллер|Шв\.?)(\d+(?:\.5)?а?)$/i.exec(t))){
   var cu=sections.get("channel-"+m[1].toLowerCase()+"У"),cp=sections.get("channel-"+m[1].toLowerCase()+"П");
   if(cu&&cp&&["h_mm","b_mm","s_mm","t_mm","mass_kg_m"].every(function(k){return cu[k]===cp[k]}))return{shape:"channel",h:cu.h_mm,b:cu.b_mm,s:cu.s_mm,t:cu.t_mm,r:root(cu),std:cu.standard+" (серия не указана: У и П одинаковы по размерам и массе)",kgm:cu.mass_kg_m};
   return null
  }
  if((m=/^(?:L|∟|Уголок|Уг\.?)(\d+)x(\d+)(?:x(\d+(?:\.\d)?))?$/i.exec(t))&&(!m[3]||m[1]===m[2])&&(r=sections.get("angle-"+m[1]+"x"+Number(m[3]||m[2]))))return{shape:"angle",h:r.b_mm,b:r.b_mm,s:r.t_mm,t:r.t_mm,r:root(r),std:r.standard,kgm:r.mass_kg_m};
  // Unequal legs «L63x40x5»: h — the long leg, b — the short one.
  if((m=/^(?:L|∟|Уголок|Уг\.?)(\d+)x(\d+)x(\d+(?:\.\d)?)$/i.exec(t))&&(r=sections.get("angle-"+Number(m[1])+"x"+Number(m[2])+"x"+Number(m[3]))))return{shape:"angle",h:r.B_mm,b:r.b_mm,s:r.t_mm,t:r.t_mm,r:root(r),std:r.standard,kgm:r.mass_kg_m};
  // A C-shaped bent section with lips «С-образный 160×60×32×4» (ГОСТ 8282-83), a hat «Профиль корытный 80×60×32×3» (ГОСТ
  // 8283-93: the web h, the walls b, the flanges a turned out), a Z «Профиль Z 200×60×5» (ГОСТ 13229-78) — by their tables.
  if((m=/^(?:Профиль)?(?:гнутый)?(С-?образный|корытный|C|С)?(?:профиль)?(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(t))&&(m[1]||/8282|8283/.test(standard||""))){
   var k4b=+m[2]+"x"+(+m[3])+"x"+Number(m[4])+"x"+Number(m[5]),hat=/корыт/i.test(m[1]||"")||!m[1]&&/8283/.test(standard||"");
   r=hat?sections.get("hat-8283-"+k4b)||sections.get("hat-8283-"+k4b+"-t2"):sections.get("lipped-8282-"+k4b);
   return r?{shape:hat?"hat":"lipped",bent:true,h:r.h_mm,b:r.b_mm,a:r.a_mm,s:r.s_mm,t:r.s_mm,r:number(r.R_mm),std:r.standard,kgm:r.mass_kg_m}:null
  }
  if((m=/^(?:Профиль)?(?:гнутый)?(Z-?образный|зетовый|Z|Зет)?(?:профиль)?(\d{2,3})x(\d{2,3})x(\d+(?:\.\d+)?)$/i.exec(t))&&(m[1]||/13229/.test(standard||""))){
   var kz="z-13229-"+(+m[2])+"x"+(+m[3])+"x"+Number(m[4]);r=sections.get(kz)||sections.get(kz+"-t2");
   return r?{shape:"zed",bent:true,h:r.h_mm,b:r.b_mm,s:r.s_mm,t:r.s_mm,r:number(r.R_mm),std:r.standard,kgm:r.mass_kg_m}:null
  }
  // A hexagon bar «Шестигранник 22», «S22» (ГОСТ 2879-2006, across flats), a reinforcing bar «Ø12А500С», «12А400» (ГОСТ 34028).
  if((m=/^(?:Шестигранник|Шестигр\.?|S|⬡)(\d+(?:\.\d+)?)$/i.exec(t))){r=sections.get("bar-std-2879");
   return{shape:"hex",h:+m[1],b:+m[1],s:+m[1],t:+m[1],solid:true,std:r&&r.sizes_mm.indexOf(+m[1])>=0?r.standard:"шестигранник по обозначению"}}
  if((m=/^(?:Арматура|Арм\.?)?(?:Ø|ø|∅)?(\d+(?:\.\d+)?)([АA]п?\d{3,4})([СCНHЕEКKУР]*)$/.exec(t))){r=sections.get("bar-std-34028");
   return{shape:"round",h:+m[1],b:+m[1],s:+m[1]/2,t:+m[1]/2,solid:true,std:r&&r.rows.some(function(x){return x.d_mm===+m[1]})?r.standard:"арматура по обозначению"}}
  // The old classes of ГОСТ 5781-82: «Ø12 А-III», «20-А-II», «Ø10 Ас-II».
  if((m=/^(?:Арматура|Арм\.?)?(?:Ø|ø|∅)?(\d+(?:\.\d+)?)-?[АA][сc]?-?[IІV]{1,3}(?:ГОСТ.*)?$/.exec(t))){r=sections.get("bar-std-5781");
   return{shape:"round",h:+m[1],b:+m[1],s:+m[1]/2,t:+m[1]/2,solid:true,std:r&&r.rows.some(function(x){return x.d_mm===+m[1]})?r.standard:"арматура по обозначению"}}
  // A round bar (tie rod, rung): «∅16», «Ø20», «Круг 20» without a wall thickness (ГОСТ 2590-2006), wire rod «Катанка 6,5» (ГОСТ 30136-95).
  var listed=function(id,d,label){var x=sections.get(id);return x&&x.sizes_mm.indexOf(d)>=0?x.standard:label};
  if((m=/^(?:∅|Ø|ø|Круг)(\d{1,3}(?:\.\d)?)$/i.exec(t)))return{shape:"round",h:+m[1],b:+m[1],s:+m[1]/2,t:+m[1]/2,solid:true,std:listed("bar-std-2590",+m[1],"круг по обозначению")};
  if((m=/^Катанка(?:[АБВA-C]-)?(\d+(?:\.\d+)?)(?:-|$)/i.exec(t)))return{shape:"round",h:+m[1],b:+m[1],s:+m[1]/2,t:+m[1]/2,solid:true,std:listed("bar-std-30136",+m[1],"катанка по обозначению")};
  // A solid square bar «□20», «Квадрат 20» (no wall thickness: a box always has one), ГОСТ 2591-2006.
  if((m=/^(?:□|Квадрат|Кв\.)(\d{1,3})$/i.exec(t)))return{shape:"plate",h:+m[1],b:+m[1],s:+m[1],t:+m[1],std:listed("bar-std-2591",+m[1],"квадрат по обозначению")};
  // A tube is its own designation: «Труба 159x6», «Ø273х8» (round), «Гн.□100х4», «□120х80х5» (box). «Труба 160х5», «Тр.140х4»
  // is a square tube 160×160×5 when a table of square ones has that size (the engineer, 25.10.2026: «если труба указана как
  // 160х5, то это 160х160х5»; the masses of the sheet agree), or the sheet cites a standard of square tubes; «Ø», «ВГП» and a
  // standard of round tubes cited keep it round.
  if((m=/^(?:Тр\.?|Труба)(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(t))&&squareTube(+m[1],Number(m[2]),standard))t="Тр.кв."+m[1]+"x"+m[2];
  if((m=/^(?:Тр\.?|Труба|Ø|ø)(ВГП)?((?:[ЦРМНДП]-)*)(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(t))){
   // A water-gas pipe (ГОСТ 3262-75) is written by its conditional pass: «Труба 20×2,8» of the sheet citing 3262, «Труба
   // ВГП Ц-20х2,8» — Ду 20, D = 26,8.
   if(m[1]||m[2]||/3262/.test(standard||"")){
    var vgp=null;["pipe-std-3262","pipe-std-3262-t2"].forEach(function(id){var x=sections.get(id);(x&&x.rows||[]).forEach(function(row){
     if(!vgp&&(row.DN===+m[3]||row.D_mm===+m[3])&&["light","light_alt","ordinary","reinforced"].some(function(k){return row[k]&&row[k][0]===+m[4]}))vgp=row})});
    if(vgp)return{shape:"round",h:vgp.D_mm,b:vgp.D_mm,s:+m[4],t:+m[4],std:"ГОСТ 3262-75"}
   }
   // The sortament whose lists hold both sizes (the one the sheet cites first): ГОСТ 10704-91, ГОСТ 8732-78, ГОСТ 8734-75.
   var pipeStd=["pipe-std-8732","pipe-std-10704","pipe-std-8734"].map(function(id){return sections.get(id)}).filter(function(x){
    return x&&x.diameters_mm.indexOf(+m[3])>=0&&x.thicknesses_mm.indexOf(+m[4])>=0}).sort(function(a,b){
    return (String(standard||"").indexOf(a.standard.slice(5,9))>=0?0:1)-(String(standard||"").indexOf(b.standard.slice(5,9))>=0?0:1)})[0];
   return{shape:"round",h:+m[3],b:+m[3],s:+m[4],t:+m[4],std:pipeStd?pipeStd.standard:"по обозначению"}
  }
  // A box: a bent closed one of ГОСТ 30245-2003 «Гн.□100х4», «□120х80х5», «Профиль 120х80х5», a square or rectangular tube of
  // ГОСТ 8639-82, 8645-68, 32931-2015 «Труба 100х100х6», «Тр.кв.100х6», «Труба прямоугольная 120х80х5». The table of the cited
  // standard (a «Труба» — the tubes first, the rest — the boxes first) gives the corner; a size the cited standard has not — the
  // row of another table; ГОСТ 32931-2015 out of its table — by its rule (1,5s up to 2,5; 2s; 2,5s; 3s); a size in no table — by
  // designation, square corners.
  if((m=/^(Гн\.?|Профиль(?:гнутый)?(?:замкнутый)?|Труба(?:профильная)?(?:квадратная|прямоугольная)?|Тр\.?(?:проф\.?)?(?:кв\.?|пр\.?)?)?(□)?(\d+)(?:x(\d+))?x(\d+(?:\.\d+)?)$/i.exec(t))&&
   (m[2]||/Гн|Профиль/i.test(m[1]||"")||/^Тр/i.test(t)&&(m[4]||/кв|квадрат|прям|проф/i.test(m[1])))){
   var bh=+m[3],bb=+(m[4]||m[3]),bs=Number(m[5]),hbs=Math.max(bh,bb)+"x"+Math.min(bh,bb)+"x"+bs,std=String(standard||"");
   var tube=function(){return bh===bb?sections.get("pipe-sq-8639-"+bh+"x"+bs):sections.get("pipe-rect-8645-"+hbs)},box=function(){return sections.get("box-30245-"+hbs)};
   var tube32931=function(){return sections.get("pipe-32931-"+hbs)};
   if(/32931/.test(std)){r=tube32931();return{shape:"box",h:bh,b:bb,s:bs,t:bs,r:r?number(r.R_mm):bs<=2.5?1.5*bs:bs<=6?2*bs:bs<=10?2.5*bs:3*bs,std:r?r.standard:"ГОСТ 32931-2015 по обозначению",kgm:r?r.mass_kg_m:undefined}}
   var order=/30245/.test(std)?[box]:/8639|8645/.test(std)?[tube]:/^Тр/i.test(t)?[tube,tube32931,box]:[box,tube32931,tube];
   r=null;for(var bi=0;bi<order.length&&!r;bi++)r=order[bi]();
   if(r)return{shape:"box",h:bh,b:bb,s:bs,t:bs,r:number(r.R_mm),std:r.standard,kgm:r.mass_kg_m};
   // A price list writes every profile tube «ГОСТ 8639-82»: the size it has not is drawn by the table that has it.
   order=[tube,tube32931,box];for(bi=0;bi<order.length&&!r;bi++)r=order[bi]();
   return{shape:"box",h:bh,b:bb,s:bs,t:bs,r:r?number(r.R_mm):0,std:r?r.standard+(std?" (размера нет в "+std+")":""):"по обозначению",kgm:r?r.mass_kg_m:undefined}
  }
  return null
 }

 // Kilograms in a metre of a section as the drawings write it (the parts of a mark in its card): of its row of the
 // sortament, else by its sizes — a plate or a bar solid, a welded or a bent section by its walls, a tube by its wall —
 // × 7850 kg/m³; null when the section is not known.
 function massPerMetre(text,standard){
  var s=sectionOf(text,standard);if(!s)return null;if(s.kgm>0)return s.kgm;
  var h=number(s.h),b=number(s.b),w=number(s.s),t=number(s.t),A=0;
  if(s.solid)A=s.shape==="hex"?Math.sqrt(3)/2*h*h:Math.PI*h*h/4;
  else if(s.shape==="plate")A=h*b;
  else if(s.shape==="round")A=Math.PI*(h-t)*t;
  else if(s.shape==="box")A=2*(h+b-2*t)*t;
  else if(s.shape==="ibeam"||s.shape==="channel"){var b1=s.b1?number(s.b1):b,t1=s.t1?number(s.t1):t;A=b*t+b1*t1+(h-t-t1)*w}
  else if(s.shape==="angle")A=(h+b-t)*t;
  else if(s.shape==="lipped"||s.shape==="hat")A=(h+2*b+2*number(s.a)-4*t)*t;
  else if(s.shape==="zed")A=(h+2*b-2*t)*t;
  return A>0?Math.round(A*7.85e-3*1000)/1000:null
 }
 function squareTube(a,s,standard){
  var std=String(standard||"");if(/10704|8732|8734|3262|20295/.test(std))return false;if(/30245|8639|8645|32931/.test(std))return true;
  return Boolean(sections.get("pipe-sq-8639-"+a+"x"+s)||sections.get("box-30245-"+a+"x"+a+"x"+s)||sections.get("pipe-32931-"+a+"x"+a+"x"+s))
 }
 // Root fillet of a rolled section (R of ГОСТ 8239, 8240, 8509; r of ГОСТ 26020 and 57837): 0 when the table has none.
 function root(r){return number(r.R_mm!=null?r.R_mm:r.r_mm)}
 function materialProfile(member){
  var source=String(member.profile_name||member.profileName||""),
   match=source.match(/(\d{2,3})\s*[КБKБШ]/i);
  var h=match?Math.max(.18,Math.min(.7,number(match[1])/100)):.32;
  var category=kind(member);
  if(category==="columns")h=Math.max(h,.36);
  if(category==="purlins")h=Math.min(h,.20);
  return [h,h*(category==="columns"?.62:.48),Math.max(.009,h*.037),Math.max(.013,h*.07)]
 }
 // The section as drawn by the sortament: root fillets between the web and the flanges (rounded box corners), so
 // that a member reads as rolled steel close up.
 // Distance from the heel of an angle to its centre along the leg drawn upright (sec.h; the other leg sec.b, thickness
 // sec.t), by the areas of the two legs: ∟140×10 — 38.7 mm.
 function angleAxis(sec){
  var h=number(sec.h),b=number(sec.b),t=number(sec.t);
  return h>0&&b>0&&t>0&&h+b>t?(h*h+(b-t)*t)/(2*(h+b-t)):0
 }
 // Nodes of a truss given by the axes of its members (local mm: x along the span, z up). Every end of a lattice member
 // (diagonal, post) on a chord is a node on a gusset (КМ: «фасонки подстропильных и стропильных ферм»): the member stops
 // 40 mm short of the inner edge of the chord — it is welded to the gusset, not to the chord; the gusset covers its welded
 // end (1,6 of its leg, 120–260 mm) and goes along the chord 30 mm past it, 10 mm under the back of the chord.
 // Conventional, not by the КМД. Returns the members cut so and the outlines of the gussets.
 function trussNodes(members,secOf){
  var EPS=6,GAP=40;
  var info=members.map(function(m){
   var pr=String(m[5]||""),sec=pr?secOf(/^\d/.test(pr)?"∟"+pr:pr):null,angle=Boolean(sec&&sec.shape==="angle");
   return{x0:number(m[0]),z0:number(m[1]),x1:number(m[2]),z1:number(m[3]),role:m[4],h:angle?number(sec.h):0,c:angle?angleAxis(sec):0,chord:m[4]==="top"||m[4]==="bottom"}
  });
  var nodes=new Map(),cut=info.map(function(){return[0,0]}),gussets=[];
  info.forEach(function(w,i){if(w.chord)return;[[w.x0,w.z0,0],[w.x1,w.z1,1]].forEach(function(p){
   var key=Math.round(p[0])+","+Math.round(p[1]);if(!nodes.has(key))nodes.set(key,{x:p[0],z:p[1],webs:[]});nodes.get(key).webs.push({i:i,end:p[2]})})});
  nodes.forEach(function(n){
   // The chords through the node: their ways from it, the inside of the truss (nx, nz), the faces of the chord.
   var arms=[];
   info.forEach(function(w){
    if(!w.chord||!(w.h>0))return;var dx=w.x1-w.x0,dz=w.z1-w.z0,L=Math.hypot(dx,dz);if(L<1)return;var ux=dx/L,uz=dz/L;
    var t=(n.x-w.x0)*ux+(n.z-w.z0)*uz,off=Math.abs((n.x-w.x0)*uz-(n.z-w.z0)*ux);if(off>EPS||t<-EPS||t>L+EPS)return;
    var nx=-uz,nz=ux;if((w.role==="top")===(nz>0)){nx=-nx;nz=-nz}
    if(t>EPS)arms.push({ux:-ux,uz:-uz,nx:nx,nz:nz,inner:w.h-w.c,outer:w.c});
    if(t<L-EPS)arms.push({ux:ux,uz:uz,nx:nx,nz:nz,inner:w.h-w.c,outer:w.c})
   });
   if(!arms.length)return;
   var pts=[];
   n.webs.forEach(function(e){
    var w=info[e.i];if(!(w.h>0))return;
    var fx=e.end?w.x0:w.x1,fz=e.end?w.z0:w.z1,L=Math.hypot(fx-n.x,fz-n.z);if(L<1)return;
    var dx=(fx-n.x)/L,dz=(fz-n.z)/L;
    // Its upright leg in the plane, as drawMembers lays it: up less the run of the member; a post — along the span.
    var yx=-dx*dz,yz=1-dz*dz,yl=Math.hypot(yx,yz);if(yl<1e-6){yx=1;yz=0}else{yx/=yl;yz/=yl}
    var lo=-w.c,hi=w.h-w.c,s=0;
    arms.forEach(function(a){var sin=dx*a.nx+dz*a.nz;if(sin<.15)return;var k=yx*a.nx+yz*a.nz;s=Math.max(s,(a.inner+GAP-Math.min(lo*k,hi*k))/sin)});
    if(!(s>0))return;
    s=Math.min(s,L*.4);cut[e.i][e.end]=s;
    var lw=Math.max(120,Math.min(260,1.6*w.h));
    [s,s+lw].forEach(function(q){[lo-15,hi+15].forEach(function(o){pts.push([n.x+dx*q+yx*o,n.z+dz*q+yz*o])})})
   });
   if(!pts.length)return;
   var web=pts.slice();
   arms.forEach(function(a){
    var far=60;web.forEach(function(p){far=Math.max(far,(p[0]-n.x)*a.ux+(p[1]-n.z)*a.uz+30)});
    var b=Math.max(0,a.outer-10);
    pts.push([n.x-a.nx*b,n.z-a.nz*b],[n.x+a.ux*far-a.nx*b,n.z+a.uz*far-a.nz*b])
   });
   gussets.push(hull(pts))
  });
  var out=members.map(function(m,i){
   var w=info[i],c=cut[i];if(!c[0]&&!c[1])return m;
   var L=Math.hypot(w.x1-w.x0,w.z1-w.z0),ux=(w.x1-w.x0)/L,uz=(w.z1-w.z0)/L,q=m.slice();
   q[0]=w.x0+ux*c[0];q[1]=w.z0+uz*c[0];q[2]=w.x1-ux*c[1];q[3]=w.z1-uz*c[1];return q
  });
  return{members:out,gussets:gussets}
 }
 // The height of a chord of a truss (local mm) at x along its span; null where the chord does not reach.
 function chordAt(members,role,x){
  var z=null;
  members.forEach(function(m){
   if(m[4]!==role||z!==null)return;var x0=number(m[0]),x1=number(m[2]);if(x0===x1||x<Math.min(x0,x1)-1||x>Math.max(x0,x1)+1)return;
   z=number(m[1])+(number(m[3])-number(m[1]))*(x-x0)/(x1-x0)
  });
  return z
 }
 // A truss between lo and hi along its span (local mm) — its ends at the faces of the columns it is bolted to sideways
 // (КМ: «фермы к колоннам примыкают сбоку и крепятся болтами»): the chords cut at the line; a post or a brace ending past
 // it is moved onto the line at its chord (the end post becomes the post at the flange, the support brace starts at the
 // bottom chord there). Nothing passes the line — drawn from axis to axis the angles went through the column.
 function clipTruss(members,lo,hi){
  var out=[];
  members.forEach(function(m){
   var p=[[number(m[0]),number(m[1])],[number(m[2]),number(m[3])]],chord=m[4]==="top"||m[4]==="bottom",ok=true;
   for(var e=0;e<2&&ok;e++){
    var q=p[e],o=p[1-e],line=q[0]<lo?lo:q[0]>hi?hi:null;if(line===null)continue;
    var role=chord?"":["top","bottom"].filter(function(r){var z=chordAt(members,r,q[0]);return z!==null&&Math.abs(z-q[1])<=40})[0];
    if(role)p[e]=[line,chordAt(members,role,line)];
    else if((o[0]-line)*(q[0]-line)<0)p[e]=[line,q[1]+(o[1]-q[1])*(line-q[0])/(o[0]-q[0])];
    else ok=false
   }
   if(ok&&Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1])>=30)out.push([p[0][0],p[0][1],p[1][0],p[1][1]].concat(m.slice(4)))
  });
  return out
 }
 // The convex outline of points [x, z] (anticlockwise).
 function hull(pts){
  var p=pts.slice().sort(function(a,b){return a[0]-b[0]||a[1]-b[1]}),cross=function(o,a,b){return(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])};
  var lower=[],upper=[];
  p.forEach(function(q){while(lower.length>1&&cross(lower[lower.length-2],lower[lower.length-1],q)<=0)lower.pop();lower.push(q)});
  for(var i=p.length-1;i>=0;i--){var q=p[i];while(upper.length>1&&cross(upper[upper.length-2],upper[upper.length-1],q)<=0)upper.pop();upper.push(q)}
  return lower.slice(0,-1).concat(upper.slice(0,-1))
 }
 function realGeometry(T,cache,sec){
  var key="real:"+sec.shape+(sec.solid?"s":"")+(sec.bent?"g"+(sec.b1||""):"")+":"+sec.h+":"+sec.b+":"+sec.s+":"+sec.t+":"+(sec.r||0)+(sec.a?":"+sec.a:"")+(sec.t1?":"+sec.b1+"/"+sec.t1:"");
  if(cache.has(key))return cache.get(key);
  var h=sec.h/2000,b=sec.b/2000,w=sec.s/2000,fl=sec.t/1000,geo,shape=new T.Shape(),rf=Math.max(0,number(sec.r)/1000),cw=true;
  if(sec.shape==="plate"){
   shape.moveTo(-b,-h);shape.lineTo(b,-h);shape.lineTo(b,h);shape.lineTo(-b,h);shape.closePath()
  }else if(sec.shape==="round"){
   var outer=sec.h/2000,hole=new T.Path();
   shape.absarc(0,0,outer,0,Math.PI*2,false);
   // A solid bar (tie rod «∅16») has no hole.
   if(!sec.solid){hole.absarc(0,0,Math.max(.001,outer-sec.s/1000),0,Math.PI*2,true);shape.holes.push(hole)}
  }else if(sec.shape==="box"){
   var hole2=new T.Path(),ws=sec.s/1000,ro=Math.min(rf,b,h),ri=Math.max(0,ro-ws);
   var rounded=function(path,x0,y0,x1,y1,r,ccw){
    var pts=ccw?[[x1,y0,-Math.PI/2,0],[x1,y1,0,Math.PI/2],[x0,y1,Math.PI/2,Math.PI],[x0,y0,Math.PI,Math.PI*1.5]]:
     [[x0,y0,Math.PI*1.5,Math.PI],[x0,y1,Math.PI,Math.PI/2],[x1,y1,Math.PI/2,0],[x1,y0,0,-Math.PI/2]];
    path.moveTo(x0+r,y0);
    pts.forEach(function(q){var cx=q[0]+(q[0]===x0?r:-r),cy=q[1]+(q[1]===y0?r:-r);if(r>0)path.absarc(cx,cy,r,q[2],q[3],!ccw);else path.lineTo(q[0],q[1])})
   };
   rounded(shape,-b,-h,b,h,ro,true);rounded(hole2,-b+ws,-h+ws,b-ws,h-ws,ri,false);shape.holes.push(hole2)
  }else if(sec.shape==="channel"&&sec.bent){
   // A bent channel: web on the left, the top flange b, the bottom one b1 (= b for an equal one); bends round.
   var H=sec.h/2000,bt=sec.b/1000,bb=(sec.b1||sec.b)/1000,st=sec.s/1000,x0=-Math.max(bt,bb)/2,ri=Math.max(0,number(sec.r)/1000),ro=ri+st;
   shape.moveTo(x0+bt,H);shape.lineTo(x0+ro,H);shape.absarc(x0+ro,H-ro,ro,Math.PI/2,Math.PI,false);shape.lineTo(x0,-H+ro);
   shape.absarc(x0+ro,-H+ro,ro,Math.PI,Math.PI*1.5,false);shape.lineTo(x0+bb,-H);shape.lineTo(x0+bb,-H+st);shape.lineTo(x0+ro,-H+st);
   if(ri>0)shape.absarc(x0+ro,-H+ro,ri,Math.PI*1.5,Math.PI,true);else shape.lineTo(x0+st,-H+st);
   shape.lineTo(x0+st,H-ro);if(ri>0)shape.absarc(x0+ro,H-ro,ri,Math.PI,Math.PI/2,true);else shape.lineTo(x0+st,H-st);
   shape.lineTo(x0+bt,H-st);shape.closePath()
  }else if(sec.shape==="lipped"||sec.shape==="hat"||sec.shape==="zed"){
   // Along the middle line: runs between the bends k = R + s from the outer faces, bends of radius R + s/2.
   var Sm=sec.s/1000,k=number(sec.r)/1000+Sm,rm=k-Sm/2,Hh=sec.h/1000,Bb=sec.b/1000,Aa=number(sec.a)/1000;
   if(sec.shape==="lipped")stripShape(shape,[Bb/2-Sm/2,Hh/2-Aa,Math.PI/2],[["L",Aa-k],["A",rm,1],["L",Bb-2*k],["A",rm,1],["L",Hh-2*k],["A",rm,1],["L",Bb-2*k],["A",rm,1],["L",Aa-k]],Sm);
   else if(sec.shape==="hat")stripShape(shape,[Bb/2-Sm/2,Hh/2+Aa-Sm,-Math.PI/2],[["L",Aa-k],["A",rm,-1],["L",Bb-2*k],["A",rm,1],["L",Hh-2*k],["A",rm,1],["L",Bb-2*k],["A",rm,-1],["L",Aa-k]],Sm);
   else stripShape(shape,[Bb-Sm/2,Hh/2-Sm/2,Math.PI],[["L",Bb-k],["A",rm,1],["L",Hh-2*k],["A",rm,-1],["L",Bb-k]],Sm)
  }else if(sec.shape==="hex"){
   // Across flats d: the flats up and down.
   var hr=sec.h/1000/Math.sqrt(3);for(var hi=0;hi<6;hi++){var ha=hi*Math.PI/3;hi?shape.lineTo(hr*Math.cos(ha),hr*Math.sin(ha)):shape.moveTo(hr,0)}shape.closePath()
  }else if(sec.shape==="angle"&&sec.bent){
   // A bent angle: the heel rounded outside by R + t and inside by R.
   var lg=sec.h/1000,lg2=sec.b/1000,tb=sec.t/1000,rib=Math.max(0,number(sec.r)/1000),rob=rib+tb;
   shape.moveTo(rob,0);shape.lineTo(lg2,0);shape.lineTo(lg2,tb);shape.lineTo(rob,tb);
   if(rib>0)shape.absarc(rob,rob,rib,Math.PI*1.5,Math.PI,true);else shape.lineTo(tb,tb);
   shape.lineTo(tb,lg);shape.lineTo(0,lg);shape.lineTo(0,rob);shape.absarc(rob,rob,rob,Math.PI,Math.PI*1.5,false);shape.closePath()
  }else if(sec.shape==="channel"){
   // Web on the left, flanges to the right.
   var wx=-b+2*w,rc=Math.min(rf,b-2*w,h-fl);
   shape.moveTo(-b,-h);shape.lineTo(b,-h);shape.lineTo(b,-h+fl);shape.lineTo(wx+rc,-h+fl);
   shape.absarc(wx+rc,-h+fl+rc,rc,Math.PI*1.5,Math.PI,cw);shape.lineTo(wx,h-fl-rc);
   shape.absarc(wx+rc,h-fl-rc,rc,Math.PI,Math.PI/2,cw);shape.lineTo(b,h-fl);shape.lineTo(b,h);shape.lineTo(-b,h);shape.closePath()
  }else if(sec.shape==="angle"){
   var leg=sec.h/1000,leg2=sec.b/1000,th=sec.t/1000,ra=Math.min(rf,leg2-th,leg-th);
   shape.moveTo(0,0);shape.lineTo(leg2,0);shape.lineTo(leg2,th);shape.lineTo(th+ra,th);
   shape.absarc(th+ra,th+ra,ra,Math.PI*1.5,Math.PI,cw);shape.lineTo(th,leg);shape.lineTo(0,leg);shape.closePath()
  }else{
   // An I; a welded one may have its bottom flange of another width and thickness (b1, t1).
   var bb2=number(sec.b1||sec.b)/2000,fb=number(sec.t1||sec.t)/1000,ri2=Math.min(rf,Math.min(b,bb2)-w,h-Math.max(fl,fb));
   shape.moveTo(-bb2,-h);shape.lineTo(bb2,-h);shape.lineTo(bb2,-h+fb);shape.lineTo(w+ri2,-h+fb);
   shape.absarc(w+ri2,-h+fb+ri2,ri2,Math.PI*1.5,Math.PI,cw);shape.lineTo(w,h-fl-ri2);
   shape.absarc(w+ri2,h-fl-ri2,ri2,Math.PI,Math.PI/2,cw);shape.lineTo(b,h-fl);
   shape.lineTo(b,h);shape.lineTo(-b,h);shape.lineTo(-b,h-fl);shape.lineTo(-w-ri2,h-fl);
   shape.absarc(-w-ri2,h-fl-ri2,ri2,Math.PI/2,0,cw);shape.lineTo(-w,-h+fb+ri2);
   shape.absarc(-w-ri2,-h+fb+ri2,ri2,0,-Math.PI/2,cw);shape.lineTo(-bb2,-h+fb);shape.closePath()
  }
  geo=new T.ExtrudeGeometry(shape,{depth:1,steps:1,bevelEnabled:false,curveSegments:sec.shape==="round"?16:rf>0?5:1});
  geo.computeVertexNormals();cache.set(key,geo);return geo
 }
 // A bent open section by its middle line: from the start [x, y, heading] straight runs ["L", length] and 90° bends
 // ["A", radius of the middle, +1 left / −1 right]; the wall s on both sides of the line.
 function stripShape(shape,start,segs,s){
  var x=start[0],y=start[1],a=start[2],pts=[[x,y,a]];
  segs.forEach(function(g){
   if(g[0]==="L"){x+=Math.cos(a)*Math.max(0,g[1]);y+=Math.sin(a)*Math.max(0,g[1]);pts.push([x,y,a]);return}
   var r=g[1],turn=g[2],cx=x+Math.cos(a+turn*Math.PI/2)*r,cy=y+Math.sin(a+turn*Math.PI/2)*r,a0=Math.atan2(y-cy,x-cx);
   for(var i=1;i<=6;i++){var q=a0+turn*Math.PI/2*i/6;pts.push([cx+r*Math.cos(q),cy+r*Math.sin(q),a+turn*Math.PI/2*i/6])}
   a+=turn*Math.PI/2;x=pts[pts.length-1][0];y=pts[pts.length-1][1]
  });
  var out=pts.map(function(p){return[p[0]-Math.sin(p[2])*s/2,p[1]+Math.cos(p[2])*s/2]}).concat(pts.map(function(p){return[p[0]+Math.sin(p[2])*s/2,p[1]-Math.cos(p[2])*s/2]}).reverse());
  shape.moveTo(out[0][0],out[0][1]);for(var j=1;j<out.length;j++)shape.lineTo(out[j][0],out[j][1]);shape.closePath()
 }
 function addGeometry(T,cache,member){
  var sec=sectionOf(member.profile_name||member.profileName,member.profile_standard);
  if(sec)return realGeometry(T,cache,sec);
  var section=String(member.section_type||"").toLowerCase(),category=kind(member);
  var style=section==="round"||category==="ties"&&String(member.profile_name||"").match(/труб|ø|Ø/i)?"round":
   section==="square"||section==="box"?"box":"ibeam";
  var dimensions=materialProfile(member),key=style+":"+category+":"+dimensions[0].toFixed(2);
  if(cache.has(key))return cache.get(key);
  var geo;
  if(style==="round"){
   geo=new T.CylinderGeometry(Math.max(.025,dimensions[0]/6),Math.max(.025,dimensions[0]/6),1,10);
   geo.rotateX(Math.PI/2);geo.translate(0,0,.5)
  }else if(style==="box"){
   geo=new T.BoxGeometry(dimensions[1],dimensions[0],1);geo.translate(0,0,.5)
  }else{
   var h=dimensions[0]/2,b=dimensions[1]/2,w=dimensions[2]/2,fl=dimensions[3],
    shape=new T.Shape();
   shape.moveTo(-b,-h);shape.lineTo(b,-h);shape.lineTo(b,-h+fl);
   shape.lineTo(w,-h+fl);shape.lineTo(w,h-fl);shape.lineTo(b,h-fl);
   shape.lineTo(b,h);shape.lineTo(-b,h);shape.lineTo(-b,h-fl);
   shape.lineTo(-w,h-fl);shape.lineTo(-w,-h+fl);shape.lineTo(-b,-h+fl);shape.closePath();
   geo=new T.ExtrudeGeometry(shape,{depth:1,steps:1,bevelEnabled:false,curveSegments:1})
  }
  geo.computeVertexNormals();cache.set(key,geo);return geo
 }
 function gridKey(props){
  return JSON.stringify([props.objectId,props.axesX,props.axesY,props.gridX,props.gridY,props.spanX,props.spanY,props.gridDirX,props.gridDirY])
 }
 function dispose(){
  token++;
  if(active){active.dispose();active=null}
 }
 // Same grid on the same host: only the members and annotations change, the camera stays where it is.
 function render(host,props){
  var key=gridKey(props);
  if(active&&active.host===host&&active.key===key&&host.isConnected){active.update(props);return}
  // The page redrew itself and gave a new box for the same scheme: the built model moves there (no rebuild, no new WebGL).
  if(active&&active.key===key&&active.host!==host&&!active.host.isConnected&&host.isConnected&&active.root){
   host.innerHTML="";host.appendChild(active.root);active.host=host;active.update(props);return
  }
  dispose();
  var myToken=token;
  host.innerHTML='<div class="ir-three-loading" role="status"><strong>Подготавливаем 3D…</strong><span>Строим модель монтажной схемы</span></div>';
  ensure().then(function(){
   if(myToken!==token||!host.isConnected)return;
   active=createViewer(host,props,key);
   if(myToken!==token){active.dispose();active=null}
  }).catch(function(error){
   if(myToken!==token||!host.isConnected)return;
   host.innerHTML='<div class="ir-three-loading ir-three-error" role="alert"><strong>3D не загрузился</strong><span>'+
    escapeHtml(error.message||error)+'</span><small>Переустановите программу или проверьте обновление.</small></div>';
   props.onFirstPaint&&props.onFirstPaint()
  })
 }
 function call(name){
  var args=Array.prototype.slice.call(arguments,1);
  return active&&active[name]?active[name].apply(null,args):undefined
 }
 function softwareGl(){
  try{var c=document.createElement("canvas"),gl=c.getContext("webgl");if(!gl)return true;var x=gl.getExtension("WEBGL_debug_renderer_info");
   var name=String(gl.getParameter(x?x.UNMASKED_RENDERER_WEBGL:gl.RENDERER)||"");var lose=gl.getExtension("WEBGL_lose_context");lose&&lose.loseContext();
   return/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)}catch(e){return false}
 }
 function createViewer(host,props,key){
  var T=window.THREE,P=props;
  var spanX=number(P.spanX),spanY=number(P.spanY),X=spanX/1000,Y=spanY/1000;
  var axesX=P.axesX||[],axesY=P.axesY||[],gridX=P.gridX||{},gridY=P.gridY||{};
  var dirX=P.gridDirX==="rtl"?"rtl":"ltr",dirY=P.gridDirY==="ttb"?"ttb":"btt";
  var elems=[],selected=String(P.selected||""),colorMode=COLOR_MODES.indexOf(P.colorMode)>=0?P.colorMode:"type";
  var showGrid=true,showAxes=true,hover="",alive=true,raf=0,firstPaint=false,copySource="",copyBusy=false,placing=null;
  var memoryKey=String(P.objectId||"")+"|"+key;
  // Drawing millimetres (X right, Y up the grid) ↔ world metres (x, height, z towards the viewer).
  function toWorld(x,y,z){
   return new T.Vector3((dirX==="rtl"?spanX-number(x):number(x))/1000,number(z)/1000,(dirY==="btt"?spanY-number(y):number(y))/1000)
  }
  function fromWorld(v){
   return{x:dirX==="rtl"?spanX-v.x*1000:v.x*1000,y:dirY==="btt"?spanY-v.z*1000:v.z*1000,z:v.y*1000}
  }
  function memberPoints(m){
   var hd=hangDrop&&hangDrop.get(String(m.id||""))||[0,0];
   var start=toWorld(m.x,m.y,number(m.z0)-hd[0]);
   var end=m.geometryType==="column"?toWorld(m.x,m.y,topOf(m)):m.geometryType==="shell"||m.geometryType==="plate"?toWorld(m.x,m.y,m.z2):toWorld(m.x2,m.y2,number(m.z2)-hd[1]);
   return m.geometryType==="bent"?[start,toWorld(m.mx,m.my,m.mz),end]:[start,end]
  }
  host.innerHTML='<div class="ir-three-root">'+
   '<div class="ir-three-toolbar">'+
   '<div class="ir-three-views">'+
   '<button data-three-view="iso" class="active">3D</button><button data-three-view="top">Сверху</button>'+
   '<button data-three-view="front">Фасад</button><button data-three-view="side">Сбоку</button></div>'+
   '<button id="irThreeReset" title="Вернуть исходный ракурс">⟲ Ракурс</button>'+
   '<select id="irThreeColors" data-native-select="1" aria-label="Раскраска конструкции">'+
   '<option value="type">Цвет: виды</option><option value="status">Цвет: монтаж</option><option value="mark">Цвет: марки</option><option value="confidence">Цвет: достоверность</option></select>'+
   '<label class="ir-three-check"><input type="checkbox" id="irThreeGrid" checked> Сетка</label>'+
   '<label class="ir-three-check"><input type="checkbox" id="irThreeAxes" checked> Оси</label>'+
   '<select id="irThreeNodes" data-native-select="1" aria-label="Узлы" title="Маркеры узлов: опоры колонн, оголовки, концы балок"><option value="sel">Узлы: у выбранного</option><option value="all">Узлы: все</option><option value="open">Узлы: не готовые</option><option value="off">Узлы: скрыть</option></select>'+
   '<label class="ir-three-check" title="Опорные плиты, анкеры и оголовки вблизи, краны на путях — условно, не по КМД"><input type="checkbox" id="irThreeDetails" checked> Детали</label>'+
   '<span class="ir-three-count" id="irThreeCount"></span><span class="ir-three-count" id="irThreeLight" hidden title="Окно рисует 3D без видеокарты (процессором): сечения и болты показаны только вблизи, края без сглаживания. Включите видеокарту для программы в настройках Windows («Графика» → высокая производительность) или обновите её драйвер.">· упрощённый показ: видеокарта не используется</span>'+
   (P.canEdit?'<button class="ir-three-add" id="irThreeAdd">＋ Добавить элемент</button>':"")+'</div>'+
   '<div id="irThreeCopyHint" class="ir-three-copy-hint" hidden>Щёлкните новое начало конструкции на плоскости X/Y. <button id="irThreeCancelCopy" type="button">Отмена</button></div>'+
   '<div class="ir-three-viewport" id="irThreeViewport" role="img" aria-label="Интерактивная 3D модель металлического каркаса"></div>'+
   '<div class="ir-three-axis-layer" id="irThreeAxisLayer" aria-hidden="true"></div>'+
   '<div class="ir-three-label-layer" id="irThreeLabelLayer" aria-hidden="true"></div>'+
   '<div class="ir-three-cursor" id="irThreeCursor" hidden></div>'+
   '<div class="ir-three-legend" id="irThreeLegend"></div>'+
   '<aside class="ir-three-place" id="irThreePlace" hidden></aside>'+
   '<aside class="ir-three-place ir-three-node" id="irThreeNode" hidden></aside>'+
   '<div class="ir-three-footer">ЛКМ — вращение · ПКМ или нажатое колесо — сдвиг · колесо — к точке под курсором · двойной щелчок — центр вращения · W A S D / стрелки — движение, Q E — вниз и вверх, Shift — быстрее · Esc — отмена</div></div>';
  var root=host.querySelector(".ir-three-root"),viewport=root.querySelector("#irThreeViewport"),
   axisLayer=root.querySelector("#irThreeAxisLayer"),labelLayer=root.querySelector("#irThreeLabelLayer"),
   cursor=root.querySelector("#irThreeCursor"),legend=root.querySelector("#irThreeLegend"),placePanel=root.querySelector("#irThreePlace");
  nodePanel=root.querySelector("#irThreeNode");
  var scene=new T.Scene();
  var camera=new T.PerspectiveCamera(42,1,.08,3000);
  // Without the graphics card (Windows draws WebGL by the processor: SwiftShader, «Basic Render») the picture is made
  // lighter: no smoothing of edges, fewer pixels, the sections and bolts nearer the camera only. A picture that takes
  // longer than 0.4 s three times running switches to it too.
  var light=softwareGl();
  var renderer=new T.WebGLRenderer({antialias:!light,powerPreference:"high-performance"});renderer.localClippingEnabled=true;
  renderer.setPixelRatio(light?.75:Math.min(window.devicePixelRatio||1,1.5));renderer.outputEncoding=T.sRGBEncoding;
  viewport.appendChild(renderer.domElement);
  scene.add(new T.HemisphereLight(0xffffff,0x7a94b3,.95));
  var sun=new T.DirectionalLight(0xffffff,1.05);sun.position.set(-35,72,48);scene.add(sun);
  var fill=new T.DirectionalLight(0xc8dfff,.35);fill.position.set(45,26,-38);scene.add(fill);
  // The members are kept apart from the scene (`steel`) for picking and highlighting; the screen draws them merged into one
  // mesh per material (`batches`) — thousands of separate draws stalled the window. The selected and hovered member are
  // drawn once more over the batch (`overlay`), the base and cap details near the camera in their own group.
  var steel=new T.Group(),batches=new T.Group(),overlay=new T.Group(),detailGroup=new T.Group(),equipment=new T.Group();scene.add(batches,overlay,detailGroup,equipment);
  var ground=new T.Group();scene.add(ground);
  var dims=new T.Group();scene.add(dims);
  var helpers=new T.Group();scene.add(helpers);
  var floorMaterial=new T.MeshStandardMaterial({color:0xd0dfec,roughness:1});
  // (colours of materials are shown brighter than written — linear values: 0x030507 shows as #18212b)
  var darkFloorMaterial=new T.MeshBasicMaterial({color:0x030507});
  var floor=new T.Mesh(new T.PlaneGeometry(Math.max(X+16,24),Math.max(Y+16,24)),floorMaterial);
  floor.rotation.x=-Math.PI/2;floor.position.set(X/2,-.26,Y/2);ground.add(floor);
  // The floor grid follows the background: light lines on a light floor, dim ones on a dark floor.
  var grid=null;
  function floorGrid(dark){
   if(grid){ground.remove(grid);grid.geometry.dispose();grid.material.dispose()}
   grid=new T.GridHelper(Math.max(X,Y)+12,Math.min(80,Math.max(8,Math.ceil(Math.max(X,Y)/2))),dark?0x0c1420:0x6487a5,dark?0x05080d:0xa8bfd3);
   grid.position.set(X/2,-.23,Y/2);ground.add(grid)
  }
  floorGrid(false);
  var axisMaterial=new T.LineDashedMaterial({color:0x8fa6bb,dashSize:1.6,gapSize:.35,transparent:true,opacity:.55});
  var dimMaterial=new T.LineBasicMaterial({color:0x35556f});
  var screenTags=[];
  function addLine(group,a,b,material){
   var geo=new T.BufferGeometry().setFromPoints([a,b]),line=new T.Line(geo,material);
   if(material.isLineDashedMaterial)line.computeLineDistances();group.add(line);return line
  }
  function tag(layer,cls,text,pos,group){
   var el=document.createElement("span");el.className=cls;el.textContent=text;layer.appendChild(el);
   var t={el:el,pos:pos,group:group};screenTags.push(t);return t
  }
  // Grid lines with axis bubbles at both ends.
  var wx=function(name){return toWorld(number(gridX[name]),0,0).x},wz=function(name){return toWorld(0,number(gridY[name]),0).z};
  axesX.forEach(function(name){
   var x=wx(name);addLine(ground,new T.Vector3(x,-.19,0),new T.Vector3(x,-.19,Y),axisMaterial);
   tag(axisLayer,"ir-three-axis-label",name,new T.Vector3(x,.1,-2.4),"axes");tag(axisLayer,"ir-three-axis-label",name,new T.Vector3(x,.1,Y+4.6),"axes")
  });
  axesY.forEach(function(name){
   var z=wz(name);addLine(ground,new T.Vector3(0,-.19,z),new T.Vector3(X,-.19,z),axisMaterial);
   tag(axisLayer,"ir-three-axis-label",name,new T.Vector3(-4.6,.1,z),"axes");tag(axisLayer,"ir-three-axis-label",name,new T.Vector3(X+2.4,.1,z),"axes")
  });
  // Bay dimensions along the near X side and the left Y side, totals further out.
  function dimensionChain(points,fixed,along){
   var at=function(v,off){return along==="x"?new T.Vector3(v,-.15,fixed+off):new T.Vector3(fixed-off,-.15,v)};
   var sorted=points.slice().sort(function(a,b){return a.w-b.w});
   for(var i=0;i<sorted.length;i++){
    addLine(dims,at(sorted[i].w,-.4),at(sorted[i].w,.4),dimMaterial);
    if(i){
     addLine(dims,at(sorted[i-1].w,0),at(sorted[i].w,0),dimMaterial);
     tag(axisLayer,"ir-three-dim-label",fmt(Math.abs(sorted[i].mm-sorted[i-1].mm)),at((sorted[i-1].w+sorted[i].w)/2,.55),"dims")
    }
   }
   if(sorted.length>1){
    var a=sorted[0],b=sorted[sorted.length-1];
    addLine(dims,at(a.w,1.5),at(b.w,1.5),dimMaterial);addLine(dims,at(a.w,1.1),at(a.w,1.9),dimMaterial);addLine(dims,at(b.w,1.1),at(b.w,1.9),dimMaterial);
    tag(axisLayer,"ir-three-dim-label total",fmt(Math.abs(b.mm-a.mm))+" мм",at((a.w+b.w)/2,2.05),"dims")
   }
  }
  dimensionChain(axesX.map(function(n){return{w:wx(n),mm:number(gridX[n])}}),Y+1.6,"x");
  dimensionChain(axesY.map(function(n){return{w:wz(n),mm:number(gridY[n])}}),-1.6,"z");
  // A tank: its diameter on the floor in front of it and the height of its wall beside it, always shown (the engineer,
  // 27.10.2026: «если это резервуар показывай высоту на монтажной схеме и диаметр»). The wall is the courses of one centre:
  // the largest radius, from the bottom of the first course to the top of the last.
  var tankDims=new T.Group(),tankTags=[],tankMaterial=new T.LineBasicMaterial({color:0x173f5b});scene.add(tankDims);
  function buildTankDims(){
   tankDims.children.slice().forEach(function(l){tankDims.remove(l);l.geometry.dispose()});
   tankTags.forEach(function(t){t.el.remove();var i=screenTags.indexOf(t);if(i>=0)screenTags.splice(i,1)});tankTags=[];
   var tanks=[];
   elems.forEach(function(c){
    if(c.geometryType!=="shell"||c.ft||!(number(c.r)>0)||(number(c.ri)>0&&number(c.ri)!==number(c.r)))return;
    if(String(c.type_key||"")!=="tank_wall"&&String(c.scheme_group||c.schemeGroup||"")!=="tanks")return;
    var x=number(c.x),y=number(c.y),k=tanks.find(function(t){return Math.hypot(t.x-x,t.y-y)<300});
    if(!k){k={x:x,y:y,r:0,z0:Infinity,z1:-Infinity};tanks.push(k)}
    k.r=Math.max(k.r,number(c.r));k.z0=Math.min(k.z0,number(c.z0));k.z1=Math.max(k.z1,number(c.z2))
   });
   tanks.forEach(function(k){
    var H=k.z1-k.z0;if(!(H>=500))return;
    var c0=toWorld(k.x,k.y,k.z0),c1=toWorld(k.x,k.y,k.z1),r=k.r/1000,y0=c0.y+.02,f=c0.z+r+1.2;
    var v=function(x,y,z){return new T.Vector3(x,y,z)},line=function(a,b){addLine(tankDims,a,b,tankMaterial)};
    // The height stands at a front corner, right or left — where fewer members stand (a shaft stair is on one side).
    var fz=c0.z+r,near=function(sx){var n=0;elems.forEach(function(c){if(c.geometryType==="shell"||c.geometryType==="plate")return;
     [[c.x,c.y],[c.x2,c.y2]].forEach(function(q){if(q[0]===undefined)return;var w=toWorld(number(q[0]),number(q[1]),0);if(Math.abs(w.x-sx)<3&&Math.abs(w.z-fz)<3)n++})});return n};
    var s=near(c0.x-r-1.2)<near(c0.x+r+1.2)?c0.x-r-1.2:c0.x+r+1.2,d=v(s-c0.x,0,fz-c0.z).normalize();
    // Ø on the floor in front of the tank, with extension lines from the wall and ticks.
    line(v(c0.x-r,y0,f),v(c0.x+r,y0,f));
    [-1,1].forEach(function(i){var x=c0.x+i*r;line(v(x,y0,c0.z),v(x,y0,f+.3));line(v(x-.25,y0,f+.25),v(x+.25,y0,f-.25))});
    tankTags.push(tag(axisLayer,"ir-three-dim-label total tank","Ø "+fmt(2*k.r)+" мм",v(c0.x,y0,f),"tank"));
    // The wall height upright beside it.
    line(v(s,c0.y,fz),v(s,c1.y,fz));
    [c0.y,c1.y].forEach(function(y){line(v(c0.x+d.x*r,y,c0.z+d.z*r),v(s+d.x*.3,y,fz+d.z*.3));line(v(s-d.x*.25,y-.25,fz-d.z*.25),v(s+d.x*.25,y+.25,fz+d.z*.25))});
    tankTags.push(tag(axisLayer,"ir-three-dim-label total tank","Высота стенки "+fmt(H)+" мм",v(s,(c0.y+c1.y)/2,fz),"tank"))
   })
  }
  var meshGeo=new Map(),mats=new Map(),allMeshes=[],rayTargets=[],dataById=new Map(),meshesById=new Map(),labels=[];
  var selectedMat=new T.MeshStandardMaterial({color:0x1668ea,emissive:0x07396d,emissiveIntensity:.15,metalness:.25,roughness:.42,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4});
  var hoverMat=new T.MeshStandardMaterial({color:0xffad1c,emissive:0x59410e,emissiveIntensity:.10,metalness:.22,roughness:.45,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4});
  var zAxis=new T.Vector3(0,0,1),failures=0,conventional=new Set();
  function baseColor(c){
   if(colorMode==="status")return(statusColors[c.status]||statusColors.planned)[0];
   if(colorMode==="confidence")return instanceColors[instanceKey(c)][0];
   if(colorMode==="mark")return hsvMark(T,c.mark||c.mark_name||c.id);
   return(groups[colorKey(c)]||groups.other)[1]
  }
  function pale(c){return Boolean(c&&c.preliminary===true)}
  // The light of a bright hall for the steel not yet mounted: a light ceiling, a grey horizon, a dark floor, two
  // windows — what polished steel reflects. Once per view; without it (an old video card) the steel is matt.
  var metalEnv=null;
  function metalMap(){
   if(metalEnv!==null)return metalEnv||null;
   metalEnv=false;
   try{
    var room=new T.Scene(),geo=new T.SphereGeometry(10,32,16),pos=geo.attributes.position,cols=[],col=new T.Color();
    for(var i=0;i<pos.count;i++){
     var h=pos.getY(i)/10;
     col.setHex(h>.15?0xf7f9fb:h>-.08?0x9aa3ad:0x4d555e);if(h>.15&&h<.35)col.lerp(new T.Color(0xc9d0d8),(.35-h)/.2);
     cols.push(col.r,col.g,col.b)
    }
    geo.setAttribute("color",new T.Float32BufferAttribute(cols,3));
    room.add(new T.Mesh(geo,new T.MeshBasicMaterial({vertexColors:true,side:T.BackSide})));
    [[6,4,-6],[-7,3,5]].forEach(function(p){var w=new T.Mesh(new T.PlaneGeometry(5,3),new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide}));w.position.set(p[0],p[1],p[2]);w.lookAt(0,0,0);room.add(w)});
    var pm=new T.PMREMGenerator(renderer),rt=pm.fromScene(room,.02);pm.dispose();
    room.traverse(function(o){if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()});
    metalEnv=rt
   }catch(e){metalEnv=false}
   return metalEnv?metalEnv.texture:null
  }
  function plannedMetal(c){return colorMode==="status"&&!pale(c)&&!(c&&(c.status==="mounted"||c.status==="partial"))}
  function baseMaterial(c){
   var color=baseColor(c),metal=plannedMetal(c),key=metal?"metal":pale(c)?"p"+color:color;
   if(!mats.has(key)){
    var env=metal?metalMap():null;
    mats.set(key,metal?new T.MeshStandardMaterial(env?{color:color,metalness:.85,roughness:.3,envMap:env,envMapIntensity:1.15,side:T.DoubleSide}:{color:color,metalness:.35,roughness:.42,side:T.DoubleSide}):
     pale(c)?new T.MeshStandardMaterial({color:color,metalness:.05,roughness:.8,side:T.DoubleSide,transparent:true,opacity:.36,depthWrite:false}):
     new T.MeshStandardMaterial({color:color,metalness:.13,roughness:.64,side:T.DoubleSide}))
   }
   return mats.get(key)
  }
  var shellMats=new Map();
  function shellMaterial(c){
   var color=baseColor(c),key=pale(c)?"p"+color:color;
   if(!shellMats.has(key))shellMats.set(key,new T.MeshStandardMaterial({color:color,metalness:.1,roughness:.7,side:T.DoubleSide,transparent:true,opacity:pale(c)?.2:.42,depthWrite:false}));
   return shellMats.get(key)
  }
  // A roof shield is nearly solid: a see-through roof over a see-through wall was not seen at all.
  var roofMats=new Map();
  function roofMaterial(c){
   var color=baseColor(c),key=pale(c)?"p"+color:color;
   if(!roofMats.has(key))roofMats.set(key,new T.MeshStandardMaterial({color:color,metalness:.12,roughness:.6,side:T.DoubleSide,transparent:true,opacity:pale(c)?.36:.82,depthWrite:!pale(c)}));
   return roofMats.get(key)
  }
  // Joints of the sheets drawn on a wall course or a bottom (c.lay from the reading: sheet length, height, the shift
  // of the vertical joints of a course; sheet width and length of the bottom rows) and, in the layer of welds, the welds
  // themselves: vertical and ring seams of the wall, the seams of the bottom, the corner weld of the wall to the bottom.
  var jointMat=new T.MeshStandardMaterial({color:0x3b4552,metalness:.1,roughness:.8});
  // The glass of windows of the АР: see-through, its frame and sashes in the colour of the window.
  var openingGlass=new T.MeshStandardMaterial({color:0x9ccbe8,metalness:.1,roughness:.08,transparent:true,opacity:.42,depthWrite:false,side:T.DoubleSide});
  // The hinges, handles and thresholds of doors and gates (dark steel; the handles of a PVC door silver); the sill and the
  // board of a window in their own colours. They keep them in every colouring (fixed).
  var hardwareMat=new T.MeshStandardMaterial({color:0x3a3f46,metalness:.55,roughness:.4}),silverMat=new T.MeshStandardMaterial({color:0xc9ced3,metalness:.6,roughness:.3});
  var fixedMats=new Map();
  function fixedMaterial(color){if(!fixedMats.has(color))fixedMats.set(color,new T.MeshStandardMaterial({color:color,metalness:.2,roughness:.55,side:T.DoubleSide}));return fixedMats.get(color)}
  // The joints of a wall panel of a layout: a strip 5 mm wide inside each of its two edges, 3 mm proud of both faces, from
  // its foot there (feet: at its start and end — along the slope of a lower roof) to its top, less the holes that reach
  // that edge. [along it, from, to] in metres.
  function wallSeams(len,h,feet,holes){
   var out=[];[[.0025,feet[0]],[len-.0025,feet[1]]].forEach(function(e){
    var z=Math.max(0,e[1]),cut=holes.filter(function(o){return o[0]<=e[0]+1e-3&&o[1]>=e[0]-1e-3}).map(function(o){return[Math.max(0,o[2]),Math.min(h,o[3])]}).sort(function(a,b){return a[0]-b[0]});
    cut.forEach(function(o){if(o[0]>z+.01)out.push([e[0],z,o[0]]);z=Math.max(z,o[1])});if(h>z+.01)out.push([e[0],z,h])
   });
   return out
  }
  // A rectangle of a wall panel less its holes ([from, to along it, from, to over its foot]) in pieces, rectangles too.
  function wallPieces(s0,s1,h,holes){
   var xs=[s0,s1];holes.forEach(function(o){[o[0],o[1]].forEach(function(v){if(v>s0+1e-4&&v<s1-1e-4)xs.push(v)})});
   xs.sort(function(a,b){return a-b});var out=[];
   for(var i=0;i+1<xs.length;i++){
    var a=xs[i],b=xs[i+1];if(b-a<1e-4)continue;
    var cut=holes.filter(function(o){return o[0]<=a+1e-4&&o[1]>=b-1e-4}).map(function(o){return[Math.max(0,o[2]),Math.min(h,o[3])]}).sort(function(p,q){return p[0]-q[0]});
    var z=0;cut.forEach(function(o){if(o[0]>z+1e-4)out.push([a,b,z,o[0]]);z=Math.max(z,o[1])});if(z<h-1e-4)out.push([a,b,z,h])
   }
   // Pieces side by side of one height as one.
   out.sort(function(p,q){return p[2]-q[2]||p[3]-q[3]||p[0]-q[0]});
   return out.reduce(function(m,r){var l=m[m.length-1];if(l&&Math.abs(l[2]-r[2])<1e-4&&Math.abs(l[3]-r[3])<1e-4&&Math.abs(l[1]-r[0])<1e-4)l[1]=r[1];else m.push(r.slice());return m},[])
  }
  // Shared geometries: a bar of a section t×t along +Z from 0 to 1 (stretched by scale.z), any other by its key.
  function shared(key,make){var g=meshGeo.get(key);if(!g){g=make();meshGeo.set(key,g)}return g}
  function barGeo(t){return shared("bar:"+t,function(){var g=new T.BoxGeometry(t,t,1);g.translate(0,0,.5);return g})}
  function drawJoints(c,id,weld){
   var L=c.lay||{},rr=number(c.r),z0=number(c.z0),z1=number(c.z1),t=weld?.035:.014,mat=weld?baseMaterial(c):jointMat,parts=[];
   var P=function(deg,r,z){var a=deg*Math.PI/180;return toWorld(number(c.x)+Math.cos(a)*r,number(c.y)+Math.sin(a)*r,z)};
   var bar=function(a,b){var v=b.clone().sub(a),len=v.length();if(len<.005)return;
    var m=new T.Mesh(barGeo(t),mat);m.position.copy(a);m.scale.z=len;m.quaternion.setFromUnitVectors(zAxis,v.normalize());parts.push(m)};
   var ring=function(z,r){var pts=[];for(var i=0;i<96;i++)pts.push(P(i*360/96,r,z));parts.push(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts,true),96,t/2,4,true),mat))};
   if(L.kind==="wall"||L.kind==="wall_welds"){
    var circ=2*Math.PI*rr,len=number(L.sheet_len_mm)||6000,n=Math.max(1,Math.ceil(circ/len)),off=weld?10:5;
    for(var j=0;j<n;j++){var deg=((number(L.shift_mm)+j*len)%circ)/circ*360;bar(P(deg,rr+off,z0),P(deg,rr+off,z1))}
    if(weld)ring(z1,rr+off)
   }else if(L.kind==="ring")ring(z0,rr+10);
   else if(L.kind==="bottom"||L.kind==="bottom_welds"){
    var w=number(L.sheet_w_mm)||1500,ln=number(L.sheet_len_mm)||6000,sh=number(L.shift_mm)||ln/2,zz=z1+(weld?8:4),cx=number(c.x),cy=number(c.y),cone=number(c.cr);
    // On a conical bottom (уклон 1:100) the joints lie on its cone: up by the rise at the centre, nothing at the edge;
    // a long joint goes in short pieces along it.
    var Q=function(x,y){return toWorld(cx+x,cy+y,zz+(cone?cone*(1-Math.min(1,Math.sqrt(x*x+y*y)/rr)):0))};
    var line=function(x0,y0,x1,y1){var n=cone?Math.max(1,Math.ceil(Math.sqrt((x1-x0)*(x1-x0)+(y1-y0)*(y1-y0))/400)):1;
     for(var i=0;i<n;i++)bar(Q(x0+(x1-x0)*i/n,y0+(y1-y0)*i/n),Q(x0+(x1-x0)*(i+1)/n,y0+(y1-y0)*(i+1)/n))};
    if(Array.isArray(L.rows)&&L.rows.length){
     // The rows of the layout as the sheet of the bottom draws them (РВС-700, КМ-05): the joints between rows across the
     // whole circle, the joints inside a row from one row joint to the next (or to the edge); the positions of the
     // sheets written in their cells.
     L.rows.forEach(function(r,i){
      var y0=number(r.y0),y1=number(r.y1),js=(r.joints||[]).map(number);
      if(i){var hx=Math.sqrt(Math.max(0,rr*rr-y0*y0));line(-hx,y0,hx,y0)}
      js.forEach(function(x){var lim=Math.sqrt(Math.max(0,rr*rr-x*x)),a=Math.max(y1,-lim),b=Math.min(y0,lim);if(b>a)line(x,a,x,b)});
      if(weld||!Array.isArray(r.pieces))return;
      var ym=(y0+y1)/2,edges=[-rr].concat(js,[rr]);
      r.pieces.forEach(function(n,k){if(n===null||n===undefined||k+1>=edges.length)return;
       var lim=Math.sqrt(Math.max(0,rr*rr-ym*ym)),xa=Math.max(edges[k],-lim),xb=Math.min(edges[k+1],lim);if(xb<=xa)return;
       var pe=document.createElement("span");pe.className="ir-three-member-label";pe.textContent="поз. "+n;labelLayer.appendChild(pe);
       var at=Q((xa+xb)/2,ym);at.y+=.05;labels.push({el:pe,pos:at,id:id})})
     })
    }else{
     // Rows of sheets across the bottom: their long joints, then the end joints of each row, staggered row by row.
     for(var y=-rr+w;y<rr;y+=w){var hx=Math.sqrt(rr*rr-y*y);line(-hx,y,hx,y)}
     for(var y0=-rr,row=0;y0<rr;y0+=w,row++){var y1=Math.min(rr,y0+w);
      for(var x=-rr+(row%2?sh:0)+ln;x<rr;x+=ln){var lim=Math.sqrt(Math.max(0,rr*rr-x*x)),a=Math.max(y0,-lim),b=Math.min(y1,lim);if(b>a)line(x,a,x,b)}}
    }
   }
   parts.forEach(function(m){m.userData.memberId=id;steel.add(m);allMeshes.push(m);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(m)});
   return parts.length
  }
  // Plan angle (counter-clockwise from X) → angle of the cylinder geometry (x = sin θ, z = cos θ) in this view's axes.
  function planTheta(deg){var a=deg*Math.PI/180,w=toWorld(Math.cos(a),Math.sin(a),0).sub(toWorld(0,0,0));return Math.atan2(w.x,w.z)}
  // ---- Joints: members are given by their centre lines, so a member coming to another (a beam or a brace to a column, a
  // beam framing into a beam, a strut to the chord of a truss, a landing beam to a stringer) would run into it up to its
  // axis. Its end is cut back to the face of the body it comes into, 10 mm short (an end with a plate bears on it); a
  // brace ends on a gusset plate (фасонка, drawn conventionally) welded to that face. The bodies are the straight pieces
  // of every member as it is drawn — columns, beams at any slope, braces, the members of trusses and of two-branch columns
  // — each the box of its section along it (the engineer, 27.10.2026: «если у металлоконструкций есть узел, то они не
  // должны проходить сквозь друг друга, а должен показываться узел»). Where the end comes near an end of the other too (a
  // corner, two members meeting there) only the lower in rank (jointRank) stops at the face of the other; braces meeting
  // at a point share a gusset (trimSegment).
  // A column's section stands with its height along world z (the minimal turn of +Z to +Y), a horizontal beam's upright.
  function halfSection(c){
   var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);
   if(sec)return{h:sec.h/2000,b:(sec.shape==="round"?sec.h:Math.max(sec.b,number(sec.b1)))/2000};
   var d=materialProfile(c);return{h:d[0]/2,b:d[1]/2}
  }
  // A column before a beam; a main beam (of the roof, a crane girder, a truss) before a secondary one (a purlin, a strut, a
  // member of the framing, of a platform, of a stair); these before a brace, a railing last; of two alike the deeper
  // section, then the longer member.
  function jointRank(c){
   var g=kind(c),hs=halfSection(c),p=memberPoints(c),L=p.length>1?p[0].distanceTo(p[p.length-1]):0;
   var r=g==="guards"||slight(c)?0:g==="ties"?1:c.geometryType==="column"||g==="columns"?4:/^(beams|girders|roof|crane|trusses)$/.test(g)||c.truss?3:2;
   return r*1e6+Math.min(9999,Math.round(Math.max(hs.h,hs.b)*2000))*100+Math.min(99,Math.round(L))
  }
  // The plane of the gussets of each brace: of the braces it crosses or meets at a point — a bracing in the slope of a roof
  // lies in the slope (Сгф1 along sloped bottom chords, 2 m over 7 m: drawn upright, its pairs of angles went into each
  // other at the crossing).
  var bracePlane=new Map();
  function bracePlanes(list){
   bracePlane.clear();var lines=[],ends=new Map(),cells=new Map(),C=3,Q=function(v){return Math.round(v.x*20)+","+Math.round(v.y*20)+","+Math.round(v.z*20)};
   list.forEach(function(c){
    if(!c.id||c.ft||c.truss||c.cross||!(c.geometryType==="brace"||kind(c)==="ties")||slight(c))return;
    var p=memberPoints(c);if(p.length!==2)return;var u=p[1].clone().sub(p[0]),L=u.length();if(L<.5)return;u.divideScalar(L);
    var it={id:String(c.id),a:p[0],u:u,L:L};lines.push(it);
    [[p[0],u],[p[1],u.clone().negate()]].forEach(function(e){var k=Q(e[0]);(ends.get(k)||ends.set(k,[]).get(k)).push({id:it.id,d:e[1]})});
    for(var i=Math.floor(Math.min(p[0].x,p[1].x)/C);i<=Math.floor(Math.max(p[0].x,p[1].x)/C);i++)for(var j=Math.floor(Math.min(p[0].z,p[1].z)/C);j<=Math.floor(Math.max(p[0].z,p[1].z)/C);j++){
     var k=i+","+j;(cells.get(k)||cells.set(k,[]).get(k)).push(it)}
   });
   var set=function(id,n){if(!bracePlane.has(id))bracePlane.set(id,n)};
   cells.forEach(function(g){for(var i=0;i<g.length;i++)for(var j=i+1;j<g.length;j++){
    var A=g[i],B=g[j];if(A.id===B.id)continue;var b=A.u.dot(B.u),den=1-b*b;if(den<.06)continue;
    var w=A.a.clone().sub(B.a),d=A.u.dot(w),e=B.u.dot(w),s=(b*e-d)/den,t=(e-b*d)/den;if(s<0||s>A.L||t<0||t>B.L)continue;
    if(A.a.clone().add(A.u.clone().multiplyScalar(s)).distanceTo(B.a.clone().add(B.u.clone().multiplyScalar(t)))>.05)continue;
    var n=A.u.clone().cross(B.u).normalize();if(n.y<0)n.negate();set(A.id,n);set(B.id,n)}});
   ends.forEach(function(l){if(l.length<2)return;var n=null;l.forEach(function(m){if(!n){var x=l[0].d.clone().cross(m.d);if(x.lengthSq()>.04)n=x.normalize()}});
    if(n){if(n.y<0)n.negate();l.forEach(function(m){set(m.id,n)})}})
  }
  // The normal of the gussets of a brace along d: upright in its plane when it rises, lying flat under a flat one.
  function gussetNormal(d){var up=new T.Vector3(0,1,0);if(Math.abs(d.y)<.25)return up;var s=d.clone().cross(up);return s.lengthSq()<1e-6?new T.Vector3(1,0,0):s.normalize()}
  // An angle of a brace or a strut on its gussets (single «L100×8», a pair «2L125×10»): the leg along the gusset lies on its
  // face and the other stands off it — a pair back to back with the gusset between them —, the centre of gravity of the
  // angle on the line across it. Drawn by its heel on the line, the angle went through its gussets (the engineer,
  // 27.10.2026: «если в узле фасонная часть, она не должна выходить сквозь металлоконструкции»). (X, Y, along) as drawn.
  function braceAngle(c,u){
   var pr=String(c.profile_name||c.profileName||"").replace(/\s/g,""),sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);
   if(!sec||sec.shape!=="angle"||sec.bent||slight(c)||!(c.geometryType==="brace"||kind(c)==="ties"))return null;
   // (upright gussets: the legs up from the heel; a flat one: a single angle under it, its leg down)
   var n=bracePlane.get(String(c.id))||gussetNormal(u);n=n.clone().sub(u.clone().multiplyScalar(n.dot(u)));if(n.lengthSq()<1e-4)n=gussetNormal(u);n.normalize();
   var y=u.clone().cross(n);if(y.lengthSq()<1e-6)return null;y.normalize();
   if(n.y>.9?y.clone().cross(u).y>0:y.y<-1e-6||Math.abs(y.y)<=1e-6&&y.x+y.z<0)y.negate();
   return{sec:sec,X:y.clone().cross(u).normalize(),Y:y,pair:/^2/.test(pr),gap:gussetT(c),lift:-angleAxis(sec)/1000}
  }
  // The box of a straight piece a → b of a member as it is drawn: its line (U), the axes across it (X, Y) as the section is
  // turned, and the extent of the section along them from the line.
  function pieceBox(c,a,b){
   var u=b.clone().sub(a),L=u.length();if(L<.3)return null;u.divideScalar(L);
   var ang=braceAngle(c,u),out={o:a.clone(),U:u,s0:0,s1:L};
   if(ang){var lb=ang.sec.b/1000,g=ang.gap/2;Object.assign(out,{X:ang.X,Y:ang.Y,x0:ang.pair?-g-lb:g,x1:g+lb,y0:ang.lift,y1:ang.lift+ang.sec.h/1000});return out}
   var q=new T.Quaternion().setFromUnitVectors(zAxis,u),sec=sectionOf(c.profile_name||c.profileName,c.profile_standard),hs=halfSection(c);
   out.X=new T.Vector3(1,0,0).applyQuaternion(q);out.Y=new T.Vector3(0,1,0).applyQuaternion(q);
   if(sec&&sec.shape==="angle"&&!sec.bent)Object.assign(out,{x0:0,x1:sec.b/1000,y0:0,y1:sec.h/1000});else Object.assign(out,{x0:-hs.b,x1:hs.b,y0:-hs.h,y1:hs.h});
   return out
  }
  // A member coming to an I or a channel from its open side (through the edges of its flanges) goes on between them to
  // its web, 10 mm short, as in a detailed model of the КМД (the engineer, 27.10.2026, the report of 21.10: «там все
  // конструкции четко примыкают к друг другу»; stopped at the edges of the flanges, it hung clear of the web — «обрывов
  // нет»). x — where the end is across the body, dx — how fast the member leaves it across, t — where it leaves it. The
  // web face, the axis across the flanges and the room between them.
  function webOf(h,x,dx,t){
   if(!h.web||Math.abs(dx)<1e-6)return null;var w=((dx>0?h.web[1]:h.web[0])-x)/dx;
   return w<t-.005?{web:w,Y:h.Y,o:h.o,lo:h.y0+h.tf,hi:h.y1-h.tf}:null
  }
  // Where a member from E along d leaves a body (null when its line misses it): t, the face, and the web as webOf gives it.
  function exitOf(h,E,d){
   var o=E.clone().sub(h.o),t=Infinity,side=-1,miss=false,x=o.dot(h.X);
   [[x,d.dot(h.X),h.x0,h.x1],[o.dot(h.Y),d.dot(h.Y),h.y0,h.y1],[o.dot(h.U),d.dot(h.U),h.s0,h.s1]].forEach(function(q,i){
    if(Math.abs(q[1])<1e-6){if(q[0]<q[2]||q[0]>q[3])miss=true;return}
    var b=Math.max((q[2]-q[0])/q[1],(q[3]-q[0])/q[1]);if(b<t){t=b;side=i}});
   if(miss||!(t>0&&t<5))return null;
   return Object.assign({t:t},side===0?webOf(h,x,d.dot(h.X),t):null)
  }
  function jointHosts(list){
   var cells=new Map(),C=3,meta=new Map(),bodies=[];
   var add=function(h){
    var x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
    [h.x0,h.x1].forEach(function(x){[h.y0,h.y1].forEach(function(y){[h.s0,h.s1].forEach(function(s){
     var p=h.o.clone().add(h.X.clone().multiplyScalar(x)).add(h.Y.clone().multiplyScalar(y)).add(h.U.clone().multiplyScalar(s));
     x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,p.z);z1=Math.max(z1,p.z)})})});
    for(var i=Math.floor((x0-.05)/C);i<=Math.floor((x1+.05)/C);i++)for(var j=Math.floor((z0-.05)/C);j<=Math.floor((z1+.05)/C);j++){
     var k=i+","+j;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(h)}
   };
   list.forEach(function(c){
    if(!c.id)return;var id=String(c.id),col=c.geometryType==="column"||Boolean(c.column&&Array.isArray(c.column.members)&&c.column.members.length);
    meta.set(id,{rank:jointRank(c),brace:c.geometryType==="brace"||kind(c)==="ties",col:col});
    if(c.ft||c.truss||c.cross||c.column&&Array.isArray(c.column.members)&&c.column.members.length||slight(c)||!/^(column|beam|brace|bent)$/.test(c.geometryType||""))return;
    var p=memberPoints(c);if(c.geometryType==="column"&&p[1].y-p[0].y<.3)return;
    var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard),gus=p.length===2?sheetGussets(c,p):null;
    // (the web of an I or a channel across X: a member coming in from the open side goes on to it)
    var web=sec&&!braceAngle(c,p[p.length-1].clone().sub(p[0]).normalize())?sec.shape==="ibeam"?[-sec.s/2000,sec.s/2000]:sec.shape==="channel"?[-Math.max(sec.b,sec.b1||0)/2000,-Math.max(sec.b,sec.b1||0)/2000+sec.s/1000]:null:null;
    for(var i=0;i+1<p.length;i++){var h=pieceBox(c,p[i],p[i+1]);if(!h)continue;
     Object.assign(h,{id:id,c:c,m:meta.get(id),tf:sec&&sec.t?sec.t/1000:.01,gus:gus,web:web});add(h);bodies.push(h)}
   });
   var find=function(id,E,d){
    var me=meta.get(id)||{rank:0},best=null;
    (cells.get(Math.floor(E.x/C)+","+Math.floor(E.z/C))||[]).forEach(function(h){
     if(h.id===id)return;var o=E.clone().sub(h.o),r={x:o.dot(h.X),y:o.dot(h.Y),s:o.dot(h.U)},du=d.dot(h.U);
     if(Math.abs(du)>.9||r.s<h.s0-.12||r.s>h.s1+.12)return;
     // (the member from its end along itself through the body: in it at its end — or within 20 mm of its side, 100 mm of
     // its end (a truss cut short at a column) —, out of it at t by the face n, outward)
     var tin=-Infinity,t=Infinity,n=null,miss=false,side=-1;
     [[r.x,d.dot(h.X),h.x0,h.x1,h.X,.02],[r.y,d.dot(h.Y),h.y0,h.y1,h.Y,.02],[r.s,du,h.s0,h.s1,h.U,.1]].forEach(function(q,i){
      if(Math.abs(q[1])<1e-6){if(q[0]<q[2]-q[5]||q[0]>q[3]+q[5])miss=true;return}
      var a=(q[2]-q[0])/q[1],b=(q[3]-q[0])/q[1];if(a>b){var w=a;a=b;b=w}
      if(a>tin)tin=a;if(b<t){t=b;n=q[4].clone().multiplyScalar(q[1]>0?1:-1);side=i}});
     if(miss||!(t>0)||t===Infinity||tin>=t||tin>(Math.abs(du)>.3?.1/Math.abs(du):.02))return;
     // (near an end of the other: a corner — only the lower in rank stops; two braces there share their gusset)
     var hw=Math.max(h.x1-h.x0,h.y1-h.y0)/2,inner=r.s>=h.s0+hw+.1&&r.s<=h.s1-hw-.1;
     if(!inner&&(h.m.brace&&me.brace||h.m.rank<me.rank||h.m.rank===me.rank&&h.id<id))return;
     var flat=!h.m.col&&Math.abs(h.U.y)<.03&&Math.abs(h.Y.y)>.99,ya=h.o.y+h.Y.y*h.y0,yb=h.o.y+h.Y.y*h.y1;
     // (the gussets its sheet draws there: within 150 mm of the end)
     if(!best||t>best.t)best=Object.assign({t:t,body:h,col:h.m.col,n:n,top:flat?Math.max(ya,yb):undefined,bot:flat?Math.min(ya,yb):undefined,tf:h.tf,
      gus:(h.gus||[]).filter(function(g){return r.s>=g.s0-.15&&r.s<=g.s1+.15})},side===0?webOf(h,r.x,d.dot(h.X),t):null)
    });
    return best
   };
   // The members of a truss and the branches and the lattice of a two-branch column as they are drawn (drawn before the
   // members that come to them).
   find.parts=function(c,parts){
    var id=String(c.id||""),m=meta.get(id);if(!m)return;
    (parts||[]).forEach(function(p){
     if(p.userData.gusset||p.userData.plate||p.userData.small||!p.geometry)return;
     var g=p.geometry;if(!g.boundingBox)g.computeBoundingBox();var bb=g.boundingBox,sc=p.scale,q=p.quaternion;
     var span=function(a,b,s){return s<0?[b*s,a*s]:[a*s,b*s]},rx=span(bb.min.x,bb.max.x,sc.x),ry=span(bb.min.y,bb.max.y,sc.y),rs=span(bb.min.z,bb.max.z,sc.z);
     if(rs[1]-rs[0]<.3)return;
     add({o:p.position.clone(),X:new T.Vector3(1,0,0).applyQuaternion(q),Y:new T.Vector3(0,1,0).applyQuaternion(q),U:new T.Vector3(0,0,1).applyQuaternion(q),
      x0:rx[0],x1:rx[1],y0:ry[0],y1:ry[1],s0:rs[0],s1:rs[1],id:id,m:m,tf:.01,gus:null})
    })
   };
   // Ends of the linear members by point (5 cm cells): where braces end together with others and nothing runs
   // through, the joint is a gusset of its own.
   var ends=new Map(),Q=function(v){return Math.round(v.x*20)+","+Math.round(v.y*20)+","+Math.round(v.z*20)};
   list.forEach(function(c){
    if(!c.id||c.ft||c.truss||c.geometryType==="column"||c.geometryType==="shell"||c.geometryType==="plate")return;
    var p=memberPoints(c);if(p.length<2)return;
    // (half the width of the member over the plane of its gusset, and 30 mm: an angle from its heel to the end of its leg)
    var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard),hs=halfSection(c),za=sec&&sec.shape==="angle"?angleAxis(sec)/1000:0;
    var w=(sec&&sec.shape==="angle"?Math.max(za,sec.h/1000-za):Math.max(hs.h,hs.b))+.03;
    [[p[0],p[1]],[p[p.length-1],p[p.length-2]]].forEach(function(e){var v=e[1].clone().sub(e[0]);if(v.lengthSq()<1e-6)return;
     var k=Q(e[0]);if(!ends.has(k))ends.set(k,[]);ends.get(k).push({id:String(c.id),d:v.normalize(),brace:c.geometryType==="brace"||kind(c)==="ties",w:w})})
   });
   find.node=function(E){var k=Q(E),list=ends.get(k);return list&&list.length>=2?{key:k,list:list}:null};
   // A point on the top (up 1) or the bottom (−1) of a horizontal beam, within its width.
   find.onFace=function(E){
    var out=null;(cells.get(Math.floor(E.x/C)+","+Math.floor(E.z/C))||[]).forEach(function(h){
     if(out||h.m.col||h.m.brace||Math.abs(h.U.y)>=.03||Math.abs(h.Y.y)<=.99)return;var r=E.clone().sub(h.o),s=r.dot(h.U),x=r.dot(h.X);
     if(s<h.s0-.05||s>h.s1+.05||x<h.x0-.03||x>h.x1+.03)return;
     var ya=h.o.y+h.Y.y*h.y0,yb=h.o.y+h.Y.y*h.y1,top=Math.max(ya,yb),bot=Math.min(ya,yb);
     if(Math.abs(E.y-top)<=.04)out={y:top,up:1};else if(Math.abs(E.y-bot)<=.04)out={y:bot,up:-1}
    });
    return out
   };
   // Whether P is within the body of another member (5 mm in).
   find.inside=function(id,P,skip){
    return(cells.get(Math.floor(P.x/C)+","+Math.floor(P.z/C))||[]).some(function(h){if(h.id===id||h===skip)return false;var o=P.clone().sub(h.o),x=o.dot(h.X),y=o.dot(h.Y),s=o.dot(h.U);
     return x>h.x0+.005&&x<h.x1-.005&&y>h.y0+.005&&y<h.y1-.005&&s>h.s0+.005&&s<h.s1-.005})
   };
   find.made=new Set();find.bodies=bodies;
   return find
  }
  // Bolts of a joint as its sheet gives them (c.joint.bolt «М24», class «8.8»), each as a set by the standards: a hex
  // head (ГОСТ 7798: S, k), a washer under it (ГОСТ 11371: d2, s), the shank through the package, two nuts (ГОСТ 5915:
  // S, m) and the end of the thread two pitches out. The spring washer under the nut (ГОСТ 6402) is not drawn: its sizes
  // are not confirmed in the base. Class 8.8 dark, 5.8 light. Number and places of the bolts are of the КМД (two on a
  // gusset, four through an end plate), not of the scheme. The sets are not separate meshes: they go straight into the
  // merged picture of their cell (thousands of bolts × five parts as objects took the memory).
  var boltMats={"8.8":new T.MeshStandardMaterial({color:0x2a2e35,metalness:.45,roughness:.45}),"5.8":new T.MeshStandardMaterial({color:0x8d949c,metalness:.55,roughness:.4})};
  var boltList=[];
  // (a member with its holes from its sheet has its bolts in them, not the conventional ones)
  function boltDia(c){var m=/(\d{2})/.exec(String(c.joint&&c.joint.bolt||""));return m&&!slight(c)&&!drillOf(c)?number(m[1])/1000:0}
  function boltSet(dmm){
   var b=fasteners.get("bolt:"+dmm),n=fasteners.get("nut:"+dmm),w=fasteners.get("washer:"+dmm),p=fasteners.get("pitch:"+dmm);
   return b&&n&&w&&b.S_mm&&b.k_mm&&n.S_mm&&n.m_mm&&w.d2_mm&&w.s_mm?{S:b.S_mm/1000,k:b.k_mm/1000,nS:n.S_mm/1000,m:n.m_mm/1000,d2:w.d2_mm/1000,s:w.s_mm/1000,p:p&&p.pitch_mm?p.pitch_mm/1000:0}:null
  }
  // `at` — the middle of the package, `axis` — toward the head, `grip` — the package thickness.
  function addBolt(c,at,axis,dia,grip){
   var cls=String(c.joint&&c.joint.cls||"")==="8.8"||/^(?:8\.8|10\.9|12\.9)$/.test(String(c.joint&&c.joint.cls||""))?"8.8":"5.8";
   boltList.push({id:String(c.id||""),at:at.clone(),axis:axis.clone().normalize(),d:dia,grip:grip,cls:cls})
  }
  var boltY=new T.Vector3(0,1,0);
  function boltParts(b){
   var q=new T.Quaternion().setFromUnitVectors(boltY,b.axis),set=boltSet(Math.round(b.d*1000)),out=[],u=b.axis,g=b.grip;
   var part=function(geo,along,r,h){var m=new T.Matrix4().compose(b.at.clone().add(u.clone().multiplyScalar(along)),q,new T.Vector3(r,h,r));out.push({geometry:geo,matrixWorld:m})};
   var hex=shared("bolt:hex",function(){return new T.CylinderGeometry(1,1,1,6)}),rnd=shared("bolt:round",function(){return new T.CylinderGeometry(1,1,1,12)}),rod=shared("bolt:rod",function(){return new T.CylinderGeometry(1,1,1,8)});
   if(!set){part(hex,0,b.d*.95,g+b.d*1.6);return out}
   var tail=2*(set.p||b.d*.15),nuts=2*set.m;
   part(rnd,g/2+set.s/2,set.d2/2,set.s);
   part(hex,g/2+set.s+set.k/2,set.S/Math.sqrt(3),set.k);
   part(rod,(set.s-nuts-tail)/2,b.d/2,g+set.s+nuts+tail);
   part(hex,-g/2-set.m/2,set.nS/Math.sqrt(3),set.m*.98);
   part(hex,-g/2-set.m*1.5,set.nS/Math.sqrt(3),set.m*.98);
   return out
  }
  function legT(c){var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);return sec&&sec.t?sec.t/1000:.008}
  // The gusset as thick as the notes of the sheet say («Толщину фасонок принять 10 мм»), else 12 mm (conventional).
  function gussetT(c){var g=number(c.joint&&c.joint.gusset_mm);return g>=6&&g<=40?g/1000:.012}
  // The gussets of a truss: as its sheet gives them (truss.gusset_mm), else as the notes, else 12 mm (conventional).
  function trussGussetT(c){var g=number(c.truss&&c.truss.gusset_mm);return g>=6&&g<=40?g/1000:gussetT(c)}
  // Bolts of a brace end on its gusset by the least distances of СП 16.13330 (табл. 40): the first 2,5d from the end of
  // the brace (not less than 2d along the force), the next 3d further (not less than 2,5d) — until the КМД gives its own.
  function boltRow(dia){return[2.5*dia,5.5*dia]}
  // Holes of a member as its assembly sheet draws them (c.drill: views of the КМД, each hole along the member from the
  // start of the view and off its axis, src/ai-holes-extract.js; the engineer, 25.10.2026: «каждое отверстие»). A view
  // as wide as the section is high is its side: the holes go through the web; as wide as its flange — its plan: through
  // the upper flange. The length of the sheet is centred on the member placed. A bolt of the sheet's list (the hole 1–4 mm
  // wider) goes in each hole through the member and a gusset on it. The holes in a gusset beside it go through that
  // gusset as its sheet draws it (addGussets).
  var holeMat=new T.MeshStandardMaterial({color:0x101317,roughness:.9}),drillCache=new Map();
  function boltSizes(c){var j=c.joint||{},out=[];[j.bolt].concat(j.fasteners||[]).forEach(function(t){var m=/[МM](\d{2})/.exec(String(t||""));if(m&&out.indexOf(+m[1])<0)out.push(+m[1])});return out}
  function drillOf(c){
   var id=String(c.id||"");if(drillCache.has(id))return drillCache.get(id);
   var out=null,views=Array.isArray(c.drill)?c.drill:[],p=views.length?memberPoints(c):[],sec=views.length?sectionOf(c.profile_name||c.profileName,c.profile_standard):null;
   if(p.length===2&&sec&&(sec.shape==="ibeam"||sec.shape==="channel")&&!slight(c)){
    var d=p[1].clone().sub(p[0]),L=d.length();
    if(L>.3){
     d.divideScalar(L);var q=new T.Quaternion().setFromUnitVectors(zAxis,d),X=new T.Vector3(1,0,0).applyQuaternion(q),Y=new T.Vector3(0,1,0).applyQuaternion(q),mid=p[0].clone().add(p[1]).multiplyScalar(.5);
     var webX=sec.shape==="channel"?(sec.s/2-sec.b/2)/1000:0,bolts=boltSizes(c);
     views.forEach(function(v){
      var band=number(v&&v.band_mm),len=number(v&&v.length_mm),side=Math.abs(band-sec.h)<=Math.max(15,sec.h*.12),plan=!side&&Math.abs(band-sec.b)<=Math.max(15,sec.b*.12);
      if(!(side||plan)||!(len>0)||!Array.isArray(v.holes))return;
      // (a column drawn upright: from its top)
      // (a mark of a group drawing: its plates off its axes unequally, its middle off theirs — center_mm)
      var fromTop=v.dir==="по вертикали"&&c.geometryType==="column",ctr=number(v.center_mm)||0;
      v.holes.forEach(function(h){
       if(!Array.isArray(h)||number(h[3]))return;var at=number(h[0]),off=number(h[1]),dm=number(h[2]),sa=fromTop?len/2-at-ctr:at-len/2+ctr;
       if(Math.abs(at-len/2)>len/2+5)return;
       var pos=mid.clone().add(d.clone().multiplyScalar(sa/1000)),axis,thick;
       if(side){pos.add(X.clone().multiplyScalar(webX)).add(Y.clone().multiplyScalar(-off/1000));axis=X;thick=sec.s/1000}
       else{pos.add(X.clone().multiplyScalar(off/1000)).add(Y.clone().multiplyScalar((sec.h/2-sec.t/2)/1000));axis=Y;thick=sec.t/1000}
       (out||(out=[])).push({at:pos,axis:axis.clone(),d:dm>0?dm/1000:0,t:thick,bolt:boltFor(bolts,dm)})
      })
     })
    }
   }
   drillCache.set(id,out);return out
  }
  function boltFor(bolts,dm){return bolts.filter(function(b){return dm-b>=1&&dm-b<=4}).sort(function(a,b){return b-a})[0]||0}
  function putHole(c,parts,h){
   var r=(h.d||.022)/2,m=new T.Mesh(shared("hole",function(){return new T.CylinderGeometry(1,1,1,14)}),holeMat);
   m.quaternion.setFromUnitVectors(boltY,h.axis);m.scale.set(r,h.t+.004,r);m.position.copy(h.at);m.userData.hole=true;parts.push(m);
   if(h.bolt){var gt=gussetT(c);addBolt(c,h.at.clone().add(h.axis.clone().multiplyScalar(gt/2)),h.axis,h.bolt/1000,h.t+gt)}
  }
  function addDrill(c,parts){
   var list=drillOf(c);if(!list)return;
   list.forEach(function(h){putHole(c,parts,h)})
  }
  // The plates the sheet draws apart in a cut at an end of the mark (c.cuts.rows, src/ai-holes-extract.js sheetHoles
  // sections; ГПЭС Ф15 «8-8»: □320 under the post, 4 holes Ø19): the base plate of a column (baseSize) and the end plate
  // of a beam or the cap of a column — across it at that end, as large as drawn, its holes from its middle as drawn, a
  // bolt of the sheet's list in each. A cut within 5% of the length of its view (250 mm at least) from an end is at that
  // end; an upright view of a column starts at its top, one lying from its foot (as drillOf). The plate covers the
  // section (the profile drawn in the cut is not read); as thick as its row of the specification, else conditionally
  // 20 mm.
  var cutsCache=new Map();
  function endCuts(c){
   var id=String(c.id||"");if(cutsCache.has(id))return cutsCache.get(id);
   var rows=c.cuts&&Array.isArray(c.cuts.rows)?c.cuts.rows:[],sec=rows.length?sectionOf(c.profile_name||c.profileName,c.profile_standard):null,out=[];
   if(sec&&!slight(c)&&!c.cross&&memberPoints(c).length===2)rows.forEach(function(r){
    var p=Array.isArray(r.plate)?r.plate.map(number):[],at=number(r.at),of=number(r.of);
    if(p.length<2||!(p[0]>0&&p[1]>0)||r.at===undefined||r.at===null||!(of>0))return;
    var edge=Math.max(250,of*.05),first=at<=edge,last=at>=of-edge;if(first===last)return;
    var end=c.geometryType==="column"&&r.on_dir==="по вертикали"?(last?0:1):(first?0:1);if(out.some(function(e){return e.end===end}))return;
    // (as drawn: across the sheet and down it, from the middle; turned a quarter when only so it covers the section, or
    // when both ways its longer side would lie across the longer side of the section; a plate inside the section — a
    // rib between the flanges, К60 «6 - 6» 320×360 in 40К1 — is not an end plate)
    var flat=r.dir!=="по вертикали",w=flat?p[0]:p[1],h=flat?p[1]:p[0],fits=function(x,y){return x>=sec.b-5&&y>=sec.h-5},straight=fits(w,h);
    if(!straight&&!fits(h,w))return;
    var turn=!straight||fits(h,w)&&(w>h+5&&sec.h>sec.b+5||h>w+5&&sec.b>sec.h+5);
    var holes=(Array.isArray(r.holes)?r.holes:[]).filter(Array.isArray).map(function(e){var a=number(e[0])-p[0]/2,o=number(e[1]),x=flat?a:o,y=flat?o:a;return{x:turn?y:x,y:turn?x:-y,d:number(e[2])}});
    out.push({end:end,x:turn?h:w,y:turn?w:h,t:number(r.t)>0?number(r.t):20,holes:holes,pos:r.pos})
   });
   cutsCache.set(id,out);return out
  }
  // `ends` — the ends of the member as drawn (a beam cut short at the face it meets): the plate inside each, within the
  // length of the member (the length of an assembly mark is over its plates) — outside, it went into the column or the
  // beam the end bears on, and two plates of members in line went into each other (the engineer, 27.10.2026: «если у
  // металлоконструкций есть узел, то они не должны проходить сквозь друг друга»).
  function addCuts(c,parts,ends){
   var list=endCuts(c);if(!list.length)return;
   var p=memberPoints(c),d=p[1].clone().sub(p[0]),L=d.length();if(L<=.3)return;d.divideScalar(L);
   var q=new T.Quaternion().setFromUnitVectors(zAxis,d),X=new T.Vector3(1,0,0).applyQuaternion(q),Y=new T.Vector3(0,1,0).applyQuaternion(q),bolts=boltSizes(c);
   list.forEach(function(e){
    if(e.end===0&&basePlated(c))return;
    var out=e.end?d.clone():d.clone().negate(),t=e.t/1000,at=ends[e.end].clone().sub(out.clone().multiplyScalar(t/2));
    var m=new T.Mesh(shared("plate:box",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(c));
    m.quaternion.copy(q);m.scale.set(e.x/1000,e.y/1000,t);m.position.copy(at);m.userData.plate=true;m.userData.pos=e.pos;parts.push(m);
    e.holes.forEach(function(h){putHole(c,parts,{at:at.clone().add(X.clone().multiplyScalar(h.x/1000)).add(Y.clone().multiplyScalar(h.y/1000)),axis:out.clone(),d:h.d>0?h.d/1000:0,t:t,bolt:boltFor(bolts,h.d)})})
   })
  }
  // The plates across a member (ribs, connection plates) as its assembly sheet draws them (c.plates.rows,
  // src/ai-holes-extract.js sheetPlates): along it from the start of its view as the holes, as thick as drawn; its height
  // from the view of the web (from the axis, + down), else by the specification, else between the flanges; its side and
  // width from the plan (from the axis, as the holes in the flange), else both sides of the web out to the flange's edge.
  function addPlates(c,parts){
   var rows=c.plates&&Array.isArray(c.plates.rows)?c.plates.rows:[],len=number(c.plates&&c.plates.length_mm);if(!rows.length||!(len>0))return;
   var p=memberPoints(c),sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);
   if(p.length!==2||!sec||!(sec.shape==="ibeam"||sec.shape==="channel")||slight(c))return;
   var d=p[1].clone().sub(p[0]),L=d.length();if(L<=.3)return;d.divideScalar(L);
   var q=new T.Quaternion().setFromUnitVectors(zAxis,d),X=new T.Vector3(1,0,0).applyQuaternion(q),Y=new T.Vector3(0,1,0).applyQuaternion(q),mid=p[0].clone().add(p[1]).multiplyScalar(.5);
   var fromTop=c.geometryType==="column"&&c.plates.dir==="по вертикали";
   var inner=sec.h/2-sec.t,web=sec.s/2,edge=sec.b/2,webX=sec.shape==="channel"?(sec.s/2-sec.b/2):0;
   rows.forEach(function(r){
    var at=Array.isArray(r.at)?r.at.map(number):null;if(!at||!(at[1]>at[0]))return;
    var sa=(at[0]+at[1])/2,along=fromTop?len/2-sa:sa-len/2;if(Math.abs(along)>len/2+5)return;
    // (across the view of the web: + down; by the specification or between the flanges, centred)
    var z=Array.isArray(r.z)?[number(r.z[0]),number(r.z[1])]:null,hh=number(r.h_mm)>0?Math.min(number(r.h_mm),2*inner):2*inner;
    var y0=z?-z[1]:-hh/2,y1=z?-z[0]:hh/2;
    var xs=Array.isArray(r.x)?[[number(r.x[0]),number(r.x[1])]]:[[web,edge],[-edge,-web]];
    xs.forEach(function(x){
     var w=x[1]-x[0];if(!(w>0)||!(y1>y0))return;
     var m=new T.Mesh(shared("plate:box",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(c));
     m.quaternion.copy(q);m.scale.set(w/1000,(y1-y0)/1000,(at[1]-at[0])/1000);
     m.position.copy(mid).add(d.clone().multiplyScalar(along/1000)).add(X.clone().multiplyScalar((webX+(x[0]+x[1])/2)/1000)).add(Y.clone().multiplyScalar((y0+y1)/2000));
     m.userData.plate=true;m.userData.pos=r.pos;parts.push(m)
    })
   })
  }
  // The gussets of a member as its assembly sheet draws them (c.plates.gussets, src/ai-holes-extract.js sheetPlates): the
  // outline (along it from the start of its view as the holes, out from its axis), as thick as it is drawn edge-on in the
  // other view — an outline of the plan parallel to the flanges at its depth from the top or the bottom (В46 «−260×8», 59
  // under the top), one of the view of the web parallel to it (in its plane when not seen apart). Its holes (g.holes, as
  // the member's: along, across, Ø) through it, a bolt of the sheet's list in each (В46: two Ø19 in each «−260×8»).
  function addGussets(c,parts){
   var list=c.plates&&Array.isArray(c.plates.gussets)?c.plates.gussets:[],len=number(c.plates&&c.plates.length_mm);if(!list.length||!(len>0))return;
   var p=memberPoints(c),sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);
   if(p.length!==2||!sec||!(sec.shape==="ibeam"||sec.shape==="channel")||slight(c))return;
   var d=p[1].clone().sub(p[0]),L=d.length();if(L<=.3)return;d.divideScalar(L);
   var q=new T.Quaternion().setFromUnitVectors(zAxis,d),X=new T.Vector3(1,0,0).applyQuaternion(q),Y=new T.Vector3(0,1,0).applyQuaternion(q),mid=p[0].clone().add(p[1]).multiplyScalar(.5);
   var fromTop=c.geometryType==="column"&&c.plates.dir==="по вертикали";
   list.forEach(function(g){
    var poly=Array.isArray(g.poly)?g.poly.map(function(e){return[number(e[0]),number(e[1])]}):[],t=number(g.t);if(poly.length<3||!(t>0))return;
    var sh=new T.Shape();poly.forEach(function(e,i){var sa=(fromTop?len/2-e[0]:e[0]-len/2)/1000,o=e[1]/1000;if(i)sh.lineTo(sa,o);else sh.moveTo(sa,o)});sh.closePath();
    var m=new T.Mesh(new T.ExtrudeGeometry(sh,{depth:t/1000,steps:1,bevelEnabled:false,curveSegments:1}),baseMaterial(c)),basis=new T.Matrix4(),pos=mid.clone();
    if(g.plane==="план"){
     // (along it, across it as the plan, its thickness up from its lower face)
     var dd=Array.isArray(g.depth)?[number(g.depth[0]),number(g.depth[1])]:[sec.t,sec.t+t];
     basis.makeBasis(d,X,Y);pos.add(Y.clone().multiplyScalar((number(g.edge)>0?-sec.h/2+dd[0]:sec.h/2-dd[1])/1000))
    }else{
     // (along it, down across the view of the web, its thickness across it)
     var x=Array.isArray(g.x)?[number(g.x[0]),number(g.x[1])]:[-t/2,t/2];
     basis.makeBasis(d,Y.clone().negate(),X);pos.add(X.clone().multiplyScalar(x[0]/1000))
    }
    m.quaternion.setFromRotationMatrix(basis);m.position.copy(pos);m.userData.plate=true;m.userData.gusset=true;m.userData.pos=g.pos;parts.push(m);
    var plan=g.plane==="план",across=plan?X:Y.clone().negate(),axis=plan?Y:X,bolts=boltSizes(c);
    (Array.isArray(g.holes)?g.holes:[]).forEach(function(h){
     if(!Array.isArray(h))return;var sa=(fromTop?len/2-number(h[0]):number(h[0])-len/2)/1000,dm=number(h[2]);
     putHole(c,parts,{at:pos.clone().add(d.clone().multiplyScalar(sa)).add(across.clone().multiplyScalar(number(h[1])/1000)).add(axis.clone().multiplyScalar(t/2000)),axis:axis.clone(),d:dm>0?dm/1000:0,t:t/1000,bolt:boltFor(bolts,dm)})
    })
   })
  }
  // The gussets the sheet draws on a member, as addGussets draws them: where along it from its first point (m), and whether
  // their holes carry bolts — a brace ending there is joined by one of them, not by a conventional gusset (trimSegment).
  function sheetGussets(c,p){
   var list=c.plates&&Array.isArray(c.plates.gussets)?c.plates.gussets:[],len=number(c.plates&&c.plates.length_mm);if(!list.length||!(len>0)||p.length!==2)return null;
   var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);if(!sec||!(sec.shape==="ibeam"||sec.shape==="channel")||slight(c))return null;
   var L=p[1].distanceTo(p[0]),fromTop=c.geometryType==="column"&&c.plates.dir==="по вертикали",bolts=boltSizes(c);
   return list.filter(function(g){return Array.isArray(g.poly)&&g.poly.length>=3&&number(g.t)>0}).map(function(g){
    var s=(Array.isArray(g.at)?g.at:[0,0]).map(function(a){return L/2+(fromTop?len/2-number(a):number(a)-len/2)/1000});
    return{s0:Math.min(s[0],s[1]),s1:Math.max(s[0],s[1]),bolts:Array.isArray(g.holes)&&g.holes.some(function(h){return boltFor(bolts,number(h&&h[2]))>0})}})
  }
  // Railings, treads and thin bars (Ø up to 60, strips) are welded: no nodes, end plates or bolts on them — a base
  // plate and a marker on every railing post hid the landings.
  function slight(c){var t=String(c.mark_name||c.title||""),sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);
   return kind(c)==="guards"||/огражд|поручен|перекладин|ступен/i.test(t)||Boolean(sec&&(sec.shape==="round"&&sec.h<=60||sec.shape==="plate"))}
  // The convex outline of points [x, y] (counter-clockwise).
  function hull2(pts){
   if(pts.length<3)return[];var p=pts.slice().sort(function(a,b){return a[0]-b[0]||a[1]-b[1]}),cr=function(o,a,b){return(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])};
   var lo=[],up=[];
   p.forEach(function(q){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=1e-9)lo.pop();lo.push(q)});
   p.slice().reverse().forEach(function(q){while(up.length>=2&&cr(up[up.length-2],up[up.length-1],q)<=1e-9)up.pop();up.push(q)});
   return lo.slice(0,-1).concat(up.slice(0,-1))
  }
  // The end of a member at the web of an I or a channel it comes to from the open side (hit: find's, with webOf's), from E
  // along d (into the member); u — the member's line as drawn. Whole between the flanges when it has room there, it goes
  // to 10 mm off the web; else (an I, a channel) its flanges stop at the edges of the other's and its web goes on —
  // the flanges cut back, «подрезка полок». A plate welded to the web along the member's web (10 mm, 0.7 of its height,
  // past the edges of the flanges), its bolts through both — as the КМД draws a beam to a beam, to the web of a column.
  // The distance from E the member is drawn from; null — it stays at the edges of the flanges (an angle, a pipe without
  // room).
  function webJoint(c,E,d,u,hit,parts){
   var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard),hs=halfSection(c),q=new T.Quaternion().setFromUnitVectors(zAxis,u);
   var X=new T.Vector3(1,0,0).applyQuaternion(q),Y=new T.Vector3(0,1,0).applyQuaternion(q),yc=E.clone().sub(hit.o).dot(hit.Y);
   var room=roomAt(c,E,u,hit),at=hit.web+.01,open=sec&&(sec.shape==="ibeam"||sec.shape==="channel")&&!sec.bent;
   if(!open)return room?at:null;
   var tf=sec.t/1000,tw=sec.s/1000,xw=sec.shape==="channel"?-sec.b/2000+tw/2:0,cw=Math.max(.04,2*hs.h-2*tf),y0=-cw/2,y1=cw/2,dy=Y.dot(hit.Y);
   var mat=baseMaterial(c),box=shared("plate:box",function(){return new T.BoxGeometry(1,1,1)}),basis=new T.Matrix4().makeBasis(X,Y,d);
   var put=function(x,y,s0,s1,w,h){var m=new T.Mesh(box,mat);m.quaternion.setFromRotationMatrix(basis);m.scale.set(w,h,s1-s0);
    m.position.copy(E).add(d.clone().multiplyScalar((s0+s1)/2)).add(X.clone().multiplyScalar(x)).add(Y.clone().multiplyScalar(y));m.userData.plate=true;parts.push(m)};
   if(!room){
    // (its web between the other's flanges: as high as there is room when it stands across them)
    if(Math.abs(dy)>.7){var ya=(hit.lo+.005-yc)/dy,yb=(hit.hi-.005-yc)/dy;y0=Math.max(y0,Math.min(ya,yb));y1=Math.min(y1,Math.max(ya,yb))}
    if(y1-y0<.04)return null;
    put(xw,(y0+y1)/2,at,hit.t,tw,y1-y0)
   }
   var dia=boltDia(c),hp=Math.max(.06,Math.min(y1-y0,.7*cw)),ym=(y0+y1)/2,s1=Math.max(hit.t,at)+Math.max(.07,3*(dia||.02)),side=sec.shape==="channel"?-1:1;
   put(xw+side*(tw/2+.005),ym,hit.web,s1,.01,hp);
   if(dia){var n=Math.max(2,Math.min(6,Math.floor((hp-.06)/(3*dia))+1)),pitch=n>1?Math.min(3*dia,(hp-.06)/(n-1)):0,sb=s1-Math.max(.035,1.5*dia);
    for(var i=0;i<n;i++)addBolt(c,E.clone().add(d.clone().multiplyScalar(sb)).add(X.clone().multiplyScalar(xw+side*.005)).add(Y.clone().multiplyScalar(ym+(i-(n-1)/2)*pitch)),X.clone().multiplyScalar(side),dia,tw+.01)}
   return room?at:hit.t
  }
  // Whether the section of the member at E (its line u) is within the room between the flanges of the body it comes to.
  function roomAt(c,E,u,hit){
   var hs=halfSection(c),q=new T.Quaternion().setFromUnitVectors(zAxis,u),yc=E.clone().sub(hit.o).dot(hit.Y);
   var ey=Math.abs(new T.Vector3(1,0,0).applyQuaternion(q).dot(hit.Y))*hs.b+Math.abs(new T.Vector3(0,1,0).applyQuaternion(q).dot(hit.Y))*hs.h;
   return yc-ey>=hit.lo-.002&&yc+ey<=hit.hi+.002
  }
  // `outer` — which ends of the piece are ends of the member (a bent member's middle point is not).
  function trimSegment(c,id,a,b,host,parts,outer){
   var v=b.clone().sub(a),L=v.length();if(L<.3)return[a,b];v.divideScalar(L);
   var brace=c.geometryType==="brace"||kind(c)==="ties",ends=[[a,v],[b,v.clone().negate()]],out=[a.clone(),b.clone()];
   // (the section about P — its line and its corners — in another member's body but skip's)
   var q0=new T.Quaternion().setFromUnitVectors(zAxis,v),hs0=halfSection(c),X0=new T.Vector3(1,0,0).applyQuaternion(q0),Y0=new T.Vector3(0,1,0).applyQuaternion(q0);
   var blocked=function(P,skip){return[[0,0],[-.9,-.9],[-.9,.9],[.9,-.9],[.9,.9]].some(function(k){return host.inside(id,P.clone().add(X0.clone().multiplyScalar(k[0]*hs0.b)).add(Y0.clone().multiplyScalar(k[1]*hs0.h)),skip)})};
   ends.forEach(function(e,k){
    if(outer&&!outer[k])return;
    var hit=host(id,e[0],e[1]),E0=e[0];
    // An end short of the body ahead of it (up to 250 mm) is drawn on to it: as mounted, it bears on it; a gap was a
    // break in the node (the engineer, 27.10.2026, «обрывов нет»). Drawn only: the scheme keeps its coordinates.
    // (not where it meets other members at its end point, nor through another member lying on its line)
    if(!hit&&!host.node(e[0]))for(var r=.03;r<=.25&&!hit;r+=.03){var P=e[0].clone().sub(e[1].clone().multiplyScalar(r));if(blocked(P))break;hit=host(id,P,e[1]);if(hit)E0=P}
    if(!hit){
     // Braces meeting at a point with nothing through it: one gusset there, the braces 120 mm short of the point.
     var node=brace&&host.node(e[0]);if(!node)return;
     // (each back from the point clear of the others there — as far as their widths meet at the angle between them, 120 mm
     // at least: two pairs of angles at a right angle 120 mm back went into each other)
     var backOf=function(me){var b=.12;node.list.forEach(function(m){if(m===me)return;var th=Math.acos(Math.max(-1,Math.min(1,me.d.dot(m.d))));
      if(th<2.6)b=Math.max(b,Math.min(.45,(me.w+m.w-.04)/2/Math.tan(Math.max(th,.35)/2)))});return b};
     var mine=node.list.filter(function(m){return m.id===id})[0],c0=Math.min(mine?backOf(mine):.12,L*.3);
     out[k]=e[0].clone().add(e[1].clone().multiplyScalar(c0));
     // (the bolts of each brace there; the gusset once)
     var a=node.list[0].d,n=null;node.list.forEach(function(m){if(!n){var x=a.clone().cross(m.d);if(x.lengthSq()>.04)n=x.normalize()}});
     if(!n||node.list.every(function(m){return Math.abs(m.d.y)<.25}))n=new T.Vector3(0,1,0);
     var gt=gussetT(c),dn=boltDia(c);
     if(dn)boltRow(dn).forEach(function(s){addBolt(c,e[0].clone().add(e[1].clone().multiplyScalar(c0+s)),n,dn,gt+legT(c))});
     if(host.made.has(node.key))return;host.made.add(node.key);
     var ax=a.clone().sub(n.clone().multiplyScalar(a.dot(n))).normalize(),by=n.clone().cross(ax);
     var plate=new T.Mesh(shared("gusset",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(c));
     // (on the top of a beam — the lower node of a vertical bracing on the brake beam, Свк2 on Тб1: the plate upright, on
     // the flange; under its bottom — hanging from it; centred on the point it went through the beam)
     var seat=Math.abs(n.y)<.3&&host.onFace?host.onFace(e[0]):null,pos=e[0].clone();
     if(seat){by=new T.Vector3(0,1,0);ax=by.clone().cross(n).normalize();pos.y=seat.y+seat.up*.25}
     plate.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(ax,by,n));plate.scale.set(.5,.5,gt);plate.position.copy(pos);
     // Elsewhere the plate is the outline round the ends of the members there — out along each past its bolts, as wide as
     // its legs: a square centred on the point stood out of the node where no member comes, through a column or a wall
     // beside it (the engineer, 27.10.2026: «если в узле фасонная часть, она не должна выходить сквозь металлоконструкции»).
     var pts=[];
     if(!seat)node.list.forEach(function(m){var dx=m.d.dot(ax),dy=m.d.dot(by),l=Math.hypot(dx,dy),w=m.w||.08,reach=backOf(m)+Math.max(.18,7.5*dn);if(l<.2)return;dx/=l;dy/=l;
      [[0,w],[0,-w],[reach,w],[reach,-w]].forEach(function(q){pts.push([dx*q[0]-dy*q[1],dy*q[0]+dx*q[1]])})});
     var hull=hull2(pts);
     if(hull.length>=3){var sh=new T.Shape();hull.forEach(function(q,i){i?sh.lineTo(q[0],q[1]):sh.moveTo(q[0],q[1])});sh.closePath();
      var hg=new T.ExtrudeGeometry(sh,{depth:gt,bevelEnabled:false,curveSegments:1});hg.translate(0,0,-gt/2);plate.geometry=hg;plate.scale.set(1,1,1)}
     plate.userData.gusset=true;parts.push(plate);
     return
    }
    // (an end bears on the face it comes to — a brace stops 100 mm short, on its gusset; at the web of an I from its open
    // side, webJoint)
    var dia=boltDia(c),sheetPlate=!brace&&endCuts(c).some(function(q){return q.end===k});
    var face=Math.min(hit.t,L*.4),cut=Math.min(face+(brace?.1:0),L*.45);
    // (its sheet's end plate goes to the web when the member has room between the flanges)
    // (nor through another member standing between the flanges)
    var clear=function(){return[.01,.5,1].every(function(f){return!blocked(E0.clone().add(e[1].clone().multiplyScalar(hit.web+.01+(hit.t-hit.web-.01)*f)),hit.body)})};
    if(!brace&&hit.web!==undefined&&clear()){var wj=sheetPlate?roomAt(c,E0,v,hit)?hit.web:null:webJoint(c,E0,e[1],v,hit,parts);
     if(wj!==null){out[k]=E0.clone().add(e[1].clone().multiplyScalar(wj));return}}
    out[k]=E0.clone().add(e[1].clone().multiplyScalar(cut));
    if(!brace){
     // A beam at a face: an end plate there, its bolts through it into the face — none where its sheet draws its own (addCuts).
     if(!dia||endCuts(c).some(function(q){return q.end===k}))return;var hs=halfSection(c),d0=e[1],side0=Math.abs(d0.y)>.9?new T.Vector3(1,0,0):new T.Vector3(0,1,0).cross(d0).normalize(),up0=d0.clone().cross(side0).normalize();
     // ((side, up, along) right-handed: the left-handed one turned the plate edge-on across the beam's end)
     var at0=E0.clone().add(d0.clone().multiplyScalar(face+.008));
     var ep=new T.Mesh(shared("gusset",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(c));
     ep.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(side0,up0,d0));ep.scale.set(hs.b*2+.02,hs.h*2+.04,.016);ep.position.copy(at0);parts.push(ep);
     // The package: the end plate (16) and the flange behind it, taken as thick as the plate.
     var mid0=at0.clone().sub(d0.clone().multiplyScalar(.008));
     [-1,1].forEach(function(i){[-1,1].forEach(function(j){addBolt(c,mid0.clone().add(side0.clone().multiplyScalar(i*Math.max(.04,hs.b-.035))).add(up0.clone().multiplyScalar(j*Math.max(.05,hs.h-.05))),d0,dia,.032)})});
     return
    }
    // The gusset (12 mm): in a vertical brace's plane with one edge upright along the face it is welded to; under a
    // horizontal brace, lying flat, 400 × 400. A brace nearly upright gets none. Where the sheet of the member it ends
    // on draws a gusset (sheetGussets: В46 «−260×8» at both ends) that one joins it: no conventional one, and no
    // conventional bolts when its holes carry bolts of their own.
    var d=e[1],up=new T.Vector3(0,1,0),hl=Math.hypot(d.x,d.z),g=new T.Mesh(shared("gusset",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(c));
    if(hl<.2)return;
    var real=hit.gus&&hit.gus.length?hit.gus:null,ownBolts=real&&real.some(function(q){return q.bolts});
    var hd=new T.Vector3(d.x/hl,0,d.z/hl),flat=Math.abs(d.y)<.25,side=hd.clone().cross(up);
    g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(hd,up,side));g.userData.gusset=true;if(!real)parts.push(g);
    var gt=gussetT(c);
    if(flat){
     // At the side of a member: along its face, out of it only, 400 × 300 (a plate square to the brace, centred on it,
     // crossed the member and came out of its other side: Сгк1 of a brake truss through the brake beam Тб1, the engineer
     // 27.10.2026 «почему связь сквозь балки тормозной выходит?»). At a beam, the end in its upper or lower 200 mm: in the
     // plane of that flange, welded to its edge (КМ: фасонка t10 к полке тормозной балки и подкрановой балки), the bolts
     // through it and the leg of the brace under (over) it.
     var nn=hit.n&&Math.abs(hit.n.y)<.5?hit.n.clone().setY(0).normalize():null;
     if(nn){
      var fp=E0.clone().add(d.clone().multiplyScalar(face)),lvl=fp.y,lt=legT(c);
      if(!hit.col&&hit.top!==undefined){if(fp.y>=hit.top-.2)lvl=hit.top-hit.tf/2;else if(fp.y<=hit.bot+.2)lvl=hit.bot+hit.tf/2}
      g.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(nn,up,nn.clone().cross(up)));g.scale.set(.3,gt,.4);
      g.position.copy(fp).add(nn.clone().multiplyScalar(.15));g.position.y=lvl;
      var by0=lvl===fp.y?null:lvl>fp.y?lvl-lt/2:lvl+lt/2;
      if(dia&&!ownBolts)boltRow(dia).forEach(function(s){var q=E0.clone().add(d.clone().multiplyScalar(cut+s));if(by0!==null)q.y=by0;addBolt(c,q,up,dia,gt+lt)});
      return
     }
     g.scale.set(.4,gt,.4);g.position.copy(E0).add(d.clone().multiplyScalar(face+.2/hl));
     if(dia&&!ownBolts)boltRow(dia).forEach(function(s){addBolt(c,E0.clone().add(d.clone().multiplyScalar(cut+s)),up,dia,gt+legT(c))});
     return
    }
    // A steep brace (a portal leg, a brace of a tall bay) ends 60 mm off the face, inside its gusset: the plate runs from
    // the face past 400 mm of the brace — a gusset placed by its middle left the end of a steep leg hanging below it.
    var end=Math.min(face+.06/hl,L*.45),run=.4,h0=face*hl,h1=Math.max(h0+.3,(end+run)*hl+.05),dy=Math.abs(d.y);
    out[k]=E0.clone().add(d.clone().multiplyScalar(end));
    g.scale.set(h1-h0,Math.max(.3,run*dy+.15),gt);
    g.position.copy(E0).add(hd.clone().multiplyScalar((h0+h1)/2));g.position.y=E0.y+d.y*(end+run/2);
    if(dia&&!ownBolts)boltRow(dia).forEach(function(s){addBolt(c,E0.clone().add(d.clone().multiplyScalar(end+s)),side,dia,gt+legT(c))})
   });
   return out
  }
  // ---- Braces and struts in the plane of a roof (горизонтальные связи Сг, распорки Рс) are given at the top of the
  // roof beams — the level of the scheme of the roof, where the purlins lie too. On the КМ they are bolted to gussets
  // welded to the beam under its top flange (по КМ: узлы связей покрытия на фасонках): drawn so — the top of the brace 10 mm
  // under the top flange of the beam it ends on; drawn at the top they went through the purlins. Only at a beam that
  // carries something (a purlin, a beam lying on its top); the ends meeting at one point go down together.
  var hangDrop=new Map();
  // The top chord of a truss holds the purlins on its horizontal legs (drawn by axis, see drawMembers): the struts and
  // braces «по верхним поясам» ending at its level are bolted to the gussets under them, like those under a roof beam.
  function chordHosts(c){
   var t=c.truss,a={x:number(c.x),y:number(c.y)},b={x:number(c.x2),y:number(c.y2)};if(t.flip){var q=a;a=b;b=q}
   var L=Math.hypot(b.x-a.x,b.y-a.y),span=number(t.span_mm)||L;if(L<500)return[];
   var ux=(b.x-a.x)/L,uy=(b.y-a.y)/L,k=L/span,base=number(t.base_mm),out=[];
   t.members.forEach(function(m){
    if(m[4]!=="top")return;var pr=String(m[5]||""),sec=pr?sectionOf(/^\d/.test(pr)?"∟"+pr:pr):null;if(!sec||sec.shape!=="angle")return;
    var x0=number(m[0])*k,x1=number(m[2])*k,ax=a.x+ux*x0,ay=a.y+uy*x0,bx=a.x+ux*x1,by=a.y+uy*x1,M=Math.hypot(bx-ax,by-ay);if(M<300)return;
    out.push({c:c,chord:true,ax:ax,ay:ay,bx:bx,by:by,az:base+number(m[1]),bz:base+number(m[3]),L:M,ux:(bx-ax)/M,uy:(by-ay)/M,sec:sec,top:angleAxis(sec)})
   });
   return out
  }
  function hangTies(list){
   hangDrop.clear();
   var hosts=[],ties=[],C=3000,cells=new Map();
   var add=function(it){
    for(var i=Math.floor((Math.min(it.ax,it.bx)-400)/C);i<=Math.floor((Math.max(it.ax,it.bx)+400)/C);i++)for(var j=Math.floor((Math.min(it.ay,it.by)-400)/C);j<=Math.floor((Math.max(it.ay,it.by)+400)/C);j++){
     var k=i+","+j;(cells.get(k)||cells.set(k,[]).get(k)).push(it)}
   };
   list.forEach(function(c){
    if(c.id&&c.truss&&Array.isArray(c.truss.members)){chordHosts(c).forEach(function(it){hosts.push(it);add(it)});return}
    if(!c.id||c.ft||c.truss||c.cross||["column","shell","plate","bent"].indexOf(c.geometryType)>=0)return;
    var ax=number(c.x),ay=number(c.y),bx=number(c.x2),by=number(c.y2),L=Math.hypot(bx-ax,by-ay),az=number(c.z0),bz=number(c.z2);
    if(L<500||Math.abs(bz-az)/L>.2)return;
    var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard),rolled=sec&&(sec.shape==="ibeam"||sec.shape==="channel");
    var it={c:c,ax:ax,ay:ay,bx:bx,by:by,az:az,bz:bz,L:L,ux:(bx-ax)/L,uy:(by-ay)/L,sec:sec};
    if(kind(c)==="ties"&&!(rolled&&sec.h>=200))ties.push(it);
    else if(rolled&&sec.h>=120){hosts.push(it);add(it)}
   });
   if(!ties.length||!hosts.length)return;
   var topAt=function(h,t){return h.az+(h.bz-h.az)*t+(h.chord?h.top:h.sec.h/2)};
   // Something lies on the beam: another rolled member crossing it in plan with its bottom at the beam's top.
   var carries=new Map();
   var carrying=function(h){
    if(carries.has(h))return carries.get(h);var yes=false,seen=new Set();
    for(var i=Math.floor((Math.min(h.ax,h.bx)-400)/C);i<=Math.floor((Math.max(h.ax,h.bx)+400)/C)&&!yes;i++)for(var j=Math.floor((Math.min(h.ay,h.by)-400)/C);j<=Math.floor((Math.max(h.ay,h.by)+400)/C)&&!yes;j++)(cells.get(i+","+j)||[]).forEach(function(p){
     if(yes||p===h||p.chord||seen.has(p))return;seen.add(p);
     var den=h.ux*p.uy-h.uy*p.ux;if(Math.abs(den)<.2)return;
     var rx=p.ax-h.ax,ry=p.ay-h.ay,t=(rx*p.uy-ry*p.ux)/den,s=(rx*h.uy-ry*h.ux)/den;
     if(t<-200||t>h.L+200||s<-200||s>p.L+200)return;
     var bottom=p.az+(p.bz-p.az)*Math.max(0,Math.min(1,s/p.L))-p.sec.h/2;
     if(Math.abs(bottom-topAt(h,Math.max(0,Math.min(1,t/h.L))))<=60)yes=true
    });
    carries.set(h,yes);return yes
   };
   var ends=[],groups=new Map();
   ties.forEach(function(it){
    // (the top over the line: of an angle on its gussets (braceAngle) — a pair, the leg up off the gusset; a single
    // one hangs under it)
    var ang=it.sec&&it.sec.shape==="angle"&&!it.sec.bent&&!slight(it.c),g=gussetT(it.c)*1000;
    var up=ang?(/^2/.test(String(it.c.profile_name||it.c.profileName||"").replace(/\s/g,""))?it.sec.b+g/2:g/2):halfSection(it.c).h*1000;
    [[it.ax,it.ay,it.az],[it.bx,it.by,it.bz]].forEach(function(e,k){
     var best=null;
     (cells.get(Math.floor(e[0]/C)+","+Math.floor(e[1]/C))||[]).forEach(function(h){
      var rx=e[0]-h.ax,ry=e[1]-h.ay,along=rx*h.ux+ry*h.uy,off=Math.abs(rx*h.uy-ry*h.ux);
      if(along<-300||along>h.L+300||off>h.sec.b/2+250)return;
      var top=topAt(h,Math.max(0,Math.min(1,along/h.L))),d=Math.abs(e[2]-top);
      if(d<=100&&(!best||d<best.d))best={d:d,h:h,top:top}
     });
     if(!best||!carrying(best.h))return;
     var z=best.top-best.h.sec.t-10-up;if(z>=e[2])return;
     var key=Math.round(e[0]/50)+","+Math.round(e[1]/50)+","+Math.round(e[2]/50);
     groups.set(key,Math.min(groups.has(key)?groups.get(key):Infinity,z));
     ends.push({id:String(it.c.id),k:k,z0:e[2],key:key})
    })
   });
   ends.forEach(function(e){var d=hangDrop.get(e.id)||[0,0];d[e.k]=e.z0-groups.get(e.key);hangDrop.set(e.id,d)})
  }
  // ---- A beam on a column top (опирание сверху). A column whose top is under a beam — not up past the middle of the
  // beam's depth — ends under it: at the bottom of the beam less the cap plate (20 mm), so the beam lies on the plate
  // instead of going into the column (members are given by their centre lines; a beam at the level of the column top
  // went half into it). The bottom flange is bolted to the plate (the bolts of the beam's sheet), a pair of bearing ribs
  // stands in the beam over the support. Ends meeting over one column: in line — 20 mm apart; across — the second
  // stops at the side of the first; alone — flush with the far face of the column. Conventional, not by the КМД.
  var seatTop=new Map(),seatEnd=new Map(),seats=[];
  function topOf(c){var id=String(c.id||"");return seatTop.has(id)?seatTop.get(id):c.z2}
  function seatOnTops(list){
   seatTop.clear();seatEnd.clear();seats=[];
   var C=2000,cells=new Map(),byCol=new Map();
   list.forEach(function(c){
    if(c.geometryType!=="column"||!c.id||c.ft||number(c.r)>0||c.column&&Array.isArray(c.column.members)&&c.column.members.length||slight(c))return;
    var k=Math.floor(number(c.x)/C)+","+Math.floor(number(c.y)/C);(cells.get(k)||cells.set(k,[]).get(k)).push(c)
   });
   list.forEach(function(b){
    if(b.geometryType!=="beam"||!b.id||b.ft||b.truss||slight(b))return;
    var ax=number(b.x),ay=number(b.y),bx=number(b.x2),by=number(b.y2),L=Math.hypot(bx-ax,by-ay),az=number(b.z0),bz=number(b.z2);
    if(L<300||Math.abs(bz-az)/L>.1)return;
    var ux=(bx-ax)/L,uy=(by-ay)/L,hb=halfSection(b).h*1000,seen=new Set();
    for(var i=Math.floor((Math.min(ax,bx)-600)/C);i<=Math.floor((Math.max(ax,bx)+600)/C);i++)for(var j=Math.floor((Math.min(ay,by)-600)/C);j<=Math.floor((Math.max(ay,by)+600)/C);j++)(cells.get(i+","+j)||[]).forEach(function(c){
     if(seen.has(c))return;seen.add(c);
     var cx=number(c.x),cy=number(c.y),along=(cx-ax)*ux+(cy-ay)*uy,off=Math.abs((cx-ax)*uy-(cy-ay)*ux),hs=halfSection(c),reach=Math.max(hs.b,hs.h)*1000;
     if(off>Math.min(150,Math.max(60,reach))||along<-reach||along>L+reach)return;
     var zb=az+(bz-az)*Math.max(0,Math.min(1,along/L)),top=number(c.z2),bottom=zb-hb,seat=bottom-20;
     if(top>=zb+hb/2||top<bottom-250||seat<number(c.z0)+300)return;
     var id=String(c.id),k=byCol.get(id);if(!k)byCol.set(id,k={c:c,seat:seat,beams:[]});
     k.seat=Math.min(k.seat,seat);
     var end=along<reach+50?0:along>L-reach-50?1:-1;
     k.beams.push({b:b,end:end,d:end===1?{x:-ux,y:-uy}:{x:ux,y:uy},zb:zb,hb:hb})
    })
   });
   byCol.forEach(function(k,id){
    seatTop.set(id,k.seat);seats.push(k);
    var hs=halfSection(k.c),cx=number(k.c.x),cy=number(k.c.y),ends=k.beams.filter(function(e){return e.end>=0}),through=k.beams.filter(function(e){return e.end<0});
    ends.forEach(function(e,i){
     var dot=function(o){return o.d.x*e.d.x+o.d.y*e.d.y};
     var first=through.concat(ends.filter(function(o,j){return j<i&&Math.abs(dot(o))<.3}))[0];
     var t=first?halfSection(first.b).b*1000+10:ends.some(function(o){return o!==e&&dot(o)<-.9})?10:-(Math.abs(e.d.x)*hs.b+Math.abs(e.d.y)*hs.h)*1000;
     e.at={x:cx+e.d.x*t,y:cy+e.d.y*t};e.bolts=first||t===10?{x:cx+e.d.x*(t+60),y:cy+e.d.y*(t+60)}:{x:cx,y:cy};
     var bid=String(e.b.id),arr=seatEnd.get(bid)||[null,null];arr[e.end]=e.at;seatEnd.set(bid,arr)
    });
    through.forEach(function(e){e.bolts={x:cx,y:cy}})
   })
  }
  // The bolts through the bottom flange into the cap plate and the bearing ribs of a seated beam (I sections only).
  function seatParts(k,e,parts){
   var b=e.b,sec=sectionOf(b.profile_name||b.profileName,b.profile_standard);if(!sec||sec.shape!=="ibeam")return;
   var h=sec.h/1000,w=sec.b/1000,tf=sec.t/1000,tw=sec.s/1000,at=toWorld(e.bolts.x,e.bolts.y,e.zb),dir=toWorld(e.bolts.x+e.d.x,e.bolts.y+e.d.y,e.zb).sub(at).normalize(),up=new T.Vector3(0,1,0),side=dir.clone().cross(up).normalize();
   var dia=boltDia(b)||boltDia(k.c),bottom=at.y-h/2;
   if(dia&&w>=.1){var g=Math.max(.035,w/2-.035),mid=new T.Vector3(at.x,bottom+(tf-.02)/2,at.z);
    [-1,1].forEach(function(q){addBolt(b,mid.clone().add(side.clone().multiplyScalar(q*g)),up,dia,tf+.02)})}
   var rw=Math.max(.02,(w-tw)/2-.005),rh=Math.max(.05,h-2*tf);
   [-1,1].forEach(function(q){
    var rib=new T.Mesh(shared("gusset",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(b));
    rib.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(dir,up,side));rib.scale.set(.01,rh,rw);
    rib.position.copy(at).add(side.clone().multiplyScalar(q*(tw/2+rw/2)));rib.userData.small=true;parts.push(rib)
   })
  }
  // ---- Steel through a wall of panels (АР). A member whose axis crosses the plane of a wall panel within it — a beam of
  // a lower roof through the end wall of a higher part, a girder past a corner — goes through a hole cut round its
  // section and 20 mm more, as a panel is cut on site round the steel it lets through; whole, the panel showed the member
  // coming out of it (the engineer, 27.10.2026 «металлоконструкции некоторые выходят сквозь сэндвич-панели»). A member
  // lying along the wall (at less than 17° to it) is not cut through. Holes as lay.holes: [along it from its start, to,
  // from its foot, to], metres.
  // ---- A deck round a column through it: the grating is cut round each column standing up through it (its section and
  // 10 mm more), as it is on site; whole, it showed the column coming through it (the engineer, 27.10.2026: «не должны
  // проходить сквозь друг друга»). Holes as those of a wall: [along it from its start, to, across it from its edge, to], m.
  var deckHoles=new Map();
  function deckCuts(list){
   deckHoles.clear();var cols=[];
   list.forEach(function(c){
    if(!c.id||c.ft||c.geometryType!=="column"||slight(c)||c.column&&Array.isArray(c.column.members)&&c.column.members.length)return;
    var p=memberPoints(c),hs=halfSection(c);cols.push({x:p[0].x,z:p[0].z,y0:p[0].y,y1:p[1].y,hx:hs.b,hz:hs.h})
   });
   if(cols.length)list.forEach(function(c){
    if(c.ft!=="deck"||!c.id||c.lay&&number(c.lay.arc_r_mm)>0)return;
    var p=memberPoints(c),a=p[0],b=p[p.length-1],d=new T.Vector3(b.x-a.x,0,b.z-a.z),len=a.distanceTo(b);if(d.length()<.1)return;d.normalize();
    var w=Math.max(.3,(number(c.fd)||1000)/1000),side=new T.Vector3(d.z,0,-d.x),y=(a.y+b.y)/2,out=[];
    cols.forEach(function(k){
     if(y<k.y0||k.y1<y+.05)return;var us=[],vs=[];
     [-1,1].forEach(function(i){[-1,1].forEach(function(j){var px=k.x+i*k.hx-a.x,pz=k.z+j*k.hz-a.z;us.push(px*d.x+pz*d.z);vs.push(px*side.x+pz*side.z)})});
     var u0=Math.min.apply(null,us)-.01,u1=Math.max.apply(null,us)+.01,v0=Math.min.apply(null,vs)-.01+w/2,v1=Math.max.apply(null,vs)+.01+w/2;
     if(u1>0&&u0<len&&v1>0&&v0<w)out.push([u0,u1,v0,v1])
    });
    if(out.length)deckHoles.set(String(c.id),out)
   })
  }
  // ---- Walls of panels (АР) meeting at a corner were both drawn past the corner point and went into each other there;
  // one runs on to the outer face of the other, the other stops at its inner face, as sandwich panels meet at a corner
  // under its flashing (the engineer, 27.10.2026: «там не должно быть просветов», «не должны проходить сквозь друг друга»).
  // A wall ending at the side of another stops at its face. The wall more along X runs on. By the panels' ends (m): [at the
  // start, at the end], + longer.
  var panelExt=new Map();
  function panelCorners(list){
   panelExt.clear();var walls=[],cells=new Map(),C=3000;
   list.forEach(function(c){
    if(c.ft!=="panel"||!c.id||!c.lay||c.lay.panel!=="wall")return;
    var a={x:number(c.x),y:number(c.y)},b={x:number(c.x2),y:number(c.y2)},L=Math.hypot(b.x-a.x,b.y-a.y);if(L<100)return;
    var w={id:String(c.id),a:a,b:b,L:L,u:{x:(b.x-a.x)/L,y:(b.y-a.y)/L},t:Math.max(40,number(c.lay.thickness_mm)||120),z0:number(c.z0),z1:number(c.z0)+Math.max(300,number(c.fd)||1000)};
    walls.push(w);[a,b].forEach(function(e){var k=Math.floor(e.x/C)+","+Math.floor(e.y/C);(cells.get(k)||cells.set(k,[]).get(k)).push(w)})
   });
   walls.forEach(function(w){
    var ext=[0,0];
    [[w.a,{x:-w.u.x,y:-w.u.y}],[w.b,w.u]].forEach(function(e,k){
     var E=e[0],out=e[1],best=null,seen=new Set();
     for(var i=Math.floor(E.x/C)-1;i<=Math.floor(E.x/C)+1;i++)for(var j=Math.floor(E.y/C)-1;j<=Math.floor(E.y/C)+1;j++)(cells.get(i+","+j)||[]).forEach(function(v){
      if(v===w||seen.has(v))return;seen.add(v);
      var cr=w.u.x*v.u.y-w.u.y*v.u.x;if(Math.abs(cr)<.87||Math.min(w.z1,v.z1)-Math.max(w.z0,v.z0)<100)return;
      var off=Math.abs((E.x-v.a.x)*v.u.y-(E.y-v.a.y)*v.u.x),s=(E.x-v.a.x)*v.u.x+(E.y-v.a.y)*v.u.y;
      if(off>v.t/2+w.t+30||s<-w.t-30||s>v.L+w.t+30)return;
      // (the corner point: where the two lines cross)
      var t=((v.a.x-w.a.x)*v.u.y-(v.a.y-w.a.y)*v.u.x)/cr,P={x:w.a.x+w.u.x*t,y:w.a.y+w.u.y*t},to=(P.x-E.x)*out.x+(P.y-E.y)*out.y;
      var corner=Math.min(Math.abs(s),Math.abs(s-v.L))<=w.t+30,runs=corner&&Math.abs(w.u.x)>Math.abs(v.u.x)+.01;
      var x=runs?to+v.t/2:to-v.t/2;if(Math.abs(x)<=500&&(!best||Math.abs(x)<Math.abs(best)))best=x
     });
     if(best!==null&&Math.abs(best)>=1)ext[k]=best/1000
    });
    if(ext[0]||ext[1])panelExt.set(w.id,ext)
   })
  }
  var wallHoles=new Map();
  function wallCuts(list){
   wallHoles.clear();
   var C=3,cells=new Map(),walls=[];
   list.forEach(function(c){
    if(c.ft!=="panel"||!c.lay||c.lay.panel!=="wall"||!c.id)return;
    var p=memberPoints(c),v=p[1].clone().sub(p[0]),L=v.length();if(L<.1)return;v.divideScalar(L);
    var w={id:String(c.id),a:p[0],u:v,n:new T.Vector3(-v.z,0,v.x).normalize(),L:L,h:Math.max(.3,(number(c.fd)||1000)/1000),t:Math.max(.04,(number(c.lay.thickness_mm)||120)/1000)};
    walls.push(w);
    for(var i=Math.floor(Math.min(p[0].x,p[1].x)/C);i<=Math.floor(Math.max(p[0].x,p[1].x)/C);i++)for(var j=Math.floor(Math.min(p[0].z,p[1].z)/C);j<=Math.floor(Math.max(p[0].z,p[1].z)/C);j++){
     var k=i+","+j;(cells.get(k)||cells.set(k,[]).get(k)).push(w)}
   });
   if(!walls.length)return;
   list.forEach(function(c){
    if(!c.id||c.ft||c.truss||["beam","brace","column","bent"].indexOf(c.geometryType)<0)return;
    var p=memberPoints(c),hs=halfSection(c);
    for(var q=0;q+1<p.length;q++){
     var a=p[q],b=p[q+1],d=b.clone().sub(a),M=d.length();if(M<.05)continue;d.divideScalar(M);var seen=new Set();
     for(var i=Math.floor(Math.min(a.x,b.x)/C);i<=Math.floor(Math.max(a.x,b.x)/C);i++)for(var j=Math.floor(Math.min(a.z,b.z)/C);j<=Math.floor(Math.max(a.z,b.z)/C);j++)(cells.get(i+","+j)||[]).forEach(function(w){
      if(seen.has(w))return;seen.add(w);
      var da=a.clone().sub(w.a).dot(w.n),db=b.clone().sub(w.a).dot(w.n),sn=Math.abs(d.dot(w.n));
      if(da*db>0||sn<.3)return;
      var X=a.clone().add(d.clone().multiplyScalar(M*da/(da-db))),u=X.clone().sub(w.a).dot(w.u),z=X.y-w.a.y;
      // (the box of the section's outline on the plane: across a horizontal member — its width and depth; else round)
      var hu,hz;
      if(Math.abs(d.y)<.3){hu=hs.b/sn;hz=hs.h}
      else{var r=Math.max(hs.h,hs.b),cu=d.dot(w.u),cz=d.y,cl=Math.hypot(cu,cz)||1;cu/=cl;cz/=cl;hu=Math.hypot(r/sn*cu,r*cz);hz=Math.hypot(r/sn*cz,r*cu)}
      hu+=.02;hz+=.02;if(u+hu<=0||u-hu>=w.L||z+hz<=0||z-hz>=w.h)return;
      (wallHoles.get(w.id)||wallHoles.set(w.id,[]).get(w.id)).push([u-hu,u+hu,z-hz,z+hz])
     })
    }
   })
  }
  // ---- Two braces crossing in their plane (an X of a bay, a cross of ties). On the КМ (узел пересечения связей) one of
  // them runs through with a gusset welded across it, the other is cut at the crossing and both its halves are bolted to
  // that gusset; drawn whole they went one through the other. Which of the two runs through is of the КМД: here the one
  // rising toward the larger axis (toward the larger Y when flat). Bolts, their class and the gusset as the drawing gives
  // them for the crossing (joint.crossing: {bolt, cls, gusset_mm}), else as for the ends of the brace.
  var crossCut=new Map(),crossPlates=[];
  function riseScore(c){
   var dx=number(c.x2)-number(c.x),dy=number(c.y2)-number(c.y),dz=number(c.z2)-number(c.z0);
   if(dz<-50||Math.abs(dz)<=50&&(dx<-1||Math.abs(dx)<=1&&dy<0)){dx=-dx;dy=-dy}
   return(dx+dy)/(Math.hypot(dx,dy)||1)
  }
  function findCrossings(list,host){
   crossCut.clear();crossPlates=[];
   var C=3,cells=new Map(),seen=new Set();
   list.forEach(function(c){
    if(!c.id||c.ft||c.truss||c.cross||c.geometryType!=="brace"||slight(c))return;
    var p=memberPoints(c);if(p.length!==2)return;var v=p[1].clone().sub(p[0]),L=v.length();if(L<1)return;
    var it={c:c,id:String(c.id),a:p[0],u:v.divideScalar(L),L:L};
    for(var i=Math.floor(Math.min(p[0].x,p[1].x)/C);i<=Math.floor(Math.max(p[0].x,p[1].x)/C);i++)for(var j=Math.floor(Math.min(p[0].z,p[1].z)/C);j<=Math.floor(Math.max(p[0].z,p[1].z)/C);j++){
     var k=i+","+j;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(it)}
   });
   cells.forEach(function(group){
    for(var i=0;i<group.length;i++)for(var j=i+1;j<group.length;j++){
     var A=group[i],B=group[j],key=A.id<B.id?A.id+"|"+B.id:B.id+"|"+A.id;if(A.id===B.id||seen.has(key))continue;seen.add(key);
     var b=A.u.dot(B.u),den=1-b*b;if(den<.06)continue;
     var w=A.a.clone().sub(B.a),d=A.u.dot(w),e=B.u.dot(w),s=(b*e-d)/den,t=(e-b*d)/den;
     if(s<A.L*.12||s>A.L*.88||t<B.L*.12||t>B.L*.88)continue;
     var P=A.a.clone().add(A.u.clone().multiplyScalar(s)),Q=B.a.clone().add(B.u.clone().multiplyScalar(t));if(P.distanceTo(Q)>.05)continue;
     var ra=riseScore(A.c),rb=riseScore(B.c),thr=Math.abs(ra-rb)>.01?(ra>rb?A:B):(A.id<B.id?A:B),cut=thr===A?B:A;
     if(!crossCut.has(cut.id))crossCut.set(cut.id,[]);
     crossCut.get(cut.id).push(crossing(thr.c,P.add(Q).multiplyScalar(.5),cut.u.clone().cross(thr.u).normalize(),Math.sqrt(den),cut.c))
    }
   });
   // Other members crossing within each other's bodies away from their ends — two beams of a floor at one level, a beam
   // past a column, a strut through a beam: the lower in rank (jointRank) is cut at the faces of the other, 10 mm short,
   // and joined to it (the engineer, 27.10.2026: «не должны проходить сквозь друг друга, а должен показываться узел»).
   // A column runs on; crane rails and girders and their stops are not cut, nor do they cut.
   var bodies=(host&&host.bodies||[]).filter(function(h){return kind(h.c)!=="crane"}),cells2=new Map(),seen2=new Set();
   bodies.forEach(function(h){
    var a=h.o,b=h.o.clone().add(h.U.clone().multiplyScalar(h.s1)),r=Math.max(h.x1-h.x0,h.y1-h.y0);
    for(var i=Math.floor((Math.min(a.x,b.x)-r)/C);i<=Math.floor((Math.max(a.x,b.x)+r)/C);i++)for(var j=Math.floor((Math.min(a.z,b.z)-r)/C);j<=Math.floor((Math.max(a.z,b.z)+r)/C);j++){
     var k=i+","+j;if(!cells2.has(k))cells2.set(k,[]);cells2.get(k).push(h)}
   });
   cells2.forEach(function(group){
    for(var i=0;i<group.length;i++)for(var j=i+1;j<group.length;j++){
     var A=group[i],B=group[j];if(A.id===B.id||A.m.brace&&B.m.brace)continue;
     var key=A.id<B.id?A.id+"|"+B.id+"|"+A.o.x+"|"+B.o.x:B.id+"|"+A.id+"|"+B.o.x+"|"+A.o.x;if(seen2.has(key))continue;seen2.add(key);
     var thr=A.m.rank>B.m.rank||A.m.rank===B.m.rank&&A.id>B.id?A:B,cut=thr===A?B:A;if(cut.m.col)continue;
     var b=cut.U.dot(thr.U),den=1-b*b;if(den<.06)continue;
     var w=cut.o.clone().sub(thr.o),d=cut.U.dot(w),e=thr.U.dot(w),s=(b*e-d)/den,t=(e-b*d)/den;
     if(t<thr.s0||t>thr.s1||s<.1||s>cut.s1-.1)continue;
     var P=cut.o.clone().add(cut.U.clone().multiplyScalar(s)),rel=P.clone().sub(thr.o),x=rel.dot(thr.X),y=rel.dot(thr.Y);
     if(x<thr.x0+.005||x>thr.x1-.005||y<thr.y0+.005||y>thr.y1-.005)continue;
     // (out of the body each way along the cut member)
     var fw=Infinity,bw=Infinity;[[x,cut.U.dot(thr.X),thr.x0,thr.x1],[y,cut.U.dot(thr.Y),thr.y0,thr.y1],[t,b,thr.s0,thr.s1]].forEach(function(q){
      if(Math.abs(q[1])<1e-6)return;var hi=Math.abs((q[3]-q[0])/q[1]),lo=Math.abs((q[2]-q[0])/q[1]);
      fw=Math.min(fw,q[1]>0?hi:lo);bw=Math.min(bw,q[1]>0?lo:hi)});
     var g=Math.max(fw,bw);if(!(g<5)||s<g+.05||s>cut.s1-g-.05)continue;
     if(!crossCut.has(cut.id))crossCut.set(cut.id,[]);
     crossCut.get(cut.id).push({at:P,n:cut.U.clone().cross(thr.U).normalize(),g:g,through:thr.c,plain:true,body:thr,host:host})
    }
   })
  }
  // The cut halves stop clear of the member running through (its section turned any way) and 30 mm more.
  // (an angle on its gusset is as wide in the plane as its leg off its centre of gravity; the halves clear the one running
  // through and each other's edges: w/sin + w'/tan)
  function planeWidth(c){var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard),h=halfSection(c);
   if(sec&&sec.shape==="angle"&&!sec.bent){var za=angleAxis(sec)/1000;return Math.max(za,sec.h/1000-za)}return Math.max(h.h,h.b)}
  function crossing(through,at,n,sin,cut){var cs=Math.sqrt(Math.max(0,1-sin*sin));
   return{at:at,n:n,g:Math.max(halfSection(through).h,halfSection(through).b,planeWidth(through))/sin+(cut?planeWidth(cut)*cs/sin:0)+.03,through:through}}
  // The gusset in the plane of the two, along the cut brace over both bolt rows of each half; welded to the one running
  // through (its part, picked with it). The bolts go with the cut brace.
  function crossNode(c,cr,u){
   var j=c.joint&&c.joint.crossing&&typeof c.joint.crossing==="object"?c.joint.crossing:c.joint||{},gm=number(j.gusset_mm);
   var gt=gm>=6&&gm<=40?gm/1000:gussetT(c),m=/(\d{2})/.exec(String(j.bolt||"")),dia=m?number(m[1])/1000:0;
   var row=dia?boltRow(dia):[.06,.14],hs=halfSection(c),by=cr.n.clone().cross(u).normalize();
   var plate=new T.Mesh(shared("gusset",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(cr.through));
   plate.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(u,by,cr.n));
   plate.scale.set(2*(cr.g+row[row.length-1]+(dia?2*dia:.05)),Math.max(.2,2*Math.min(hs.h,hs.b)+.06),gt);plate.position.copy(cr.at);
   plate.userData.gusset=true;crossPlates.push({id:String(cr.through.id),mesh:plate});
   if(dia){var bc={id:c.id,joint:{cls:j.cls||c.joint&&c.joint.cls}};
    [-1,1].forEach(function(sg){row.forEach(function(s){addBolt(bc,cr.at.clone().add(u.clone().multiplyScalar(sg*(cr.g+s))),cr.n,dia,gt+legT(c))})})}
  }
  // A plain crossing (findCrossings): each half bears on the face of the one running through, or goes on to its web
  // from its open side (webJoint) — joined to it, not 10 mm off it with nothing between (the engineer, 27.10.2026,
  // «обрывов нет»).
  function cutAtCrossings(c,segments,cuts,parts){
   cuts.forEach(function(cr){
    var out=[];
    segments.forEach(function(sg,k){
     var v=sg[1].clone().sub(sg[0]),L=v.length(),u=v.divideScalar(L||1),s=cr.at.clone().sub(sg[0]).dot(u);
     if(cr.only!=null&&cr.only!==k||L<.01||s<cr.g+.05||s>L-cr.g-.05||sg[0].clone().add(u.clone().multiplyScalar(s)).distanceTo(cr.at)>.06){out.push(sg);return}
     var g0=cr.g,g1=cr.g;
     if(cr.body)[-1,1].forEach(function(i){var d=u.clone().multiplyScalar(i),x=exitOf(cr.body,cr.at,d);if(!x)return;
      var free=x.web!==undefined&&cr.host&&[.01,.5,1].every(function(f){return!cr.host.inside(String(c.id),cr.at.clone().add(d.clone().multiplyScalar(x.web+.01+(x.t-x.web-.01)*f)),cr.body)});
      var w=free?webJoint(c,cr.at,d,u,x,parts||[]):null,g=w!==null?w:x.t;if(i<0)g0=g;else g1=g});
     out.push([sg[0],cr.at.clone().sub(u.clone().multiplyScalar(g0))],[cr.at.clone().add(u.clone().multiplyScalar(g1)),sg[1]]);
     if(!cr.done&&!cr.plain){cr.done=true;crossNode(c,cr,u)}
    });
    segments=out
   });
   return segments
  }
  // The central ring of a shield roof (c.lay.kind "central_ring", src/ai-tank-extract.js; КМ «Покрытие. Центральное
  // кольцо»): its box section — the outer wall, the inner shell, the top flange and the bottom plate out to the bearing
  // of the shields —, the ribs the shields are bolted to (one bolt each) and the central shield over it, a cone of sheets
  // with its seams. Before (1.10.37) a flat ring with a hole: the engineer, 27.10.2026, «там просто отверстие в центре и
  // все?».
  function centralRing(c,id,base){
   var L=c.lay,mm=function(v){return number(v)/1000},mat=baseMaterial(c),parts=[];
   var pr=mm(c.r),wr=mm(L.wall_r_mm)||Math.max(mm(c.ri)+.08,pr*.8),sr=mm(L.shell_r_mm)||mm(c.ri)||wr-.08,H=mm(L.height_mm)||.2,t=mm(L.plate_mm)||.008;
   var put=function(m){m.userData.memberId=id;parts.push(m);return m};
   var annulus=function(r0,r1,h,y){
    var sh=new T.Shape();sh.absarc(0,0,r1,0,2*Math.PI,false);var hole=new T.Path();hole.absarc(0,0,r0,0,2*Math.PI,true);sh.holes.push(hole);
    var g=new T.ExtrudeGeometry(sh,{depth:h,bevelEnabled:false,curveSegments:72});g.rotateX(-Math.PI/2);
    var m=put(new T.Mesh(g,mat));m.position.copy(base);m.position.y+=y;return m};
   annulus(sr,pr,t,0);annulus(wr-t/2,wr+t/2,H,t);annulus(sr,sr+.006,H,t);annulus(sr,wr+(mm(L.top_out_mm)||.02),t,t+H);
   // The ribs: a plate on edge from the wall outwards, its top along the roof, its outer end cut; the bolt of the shield.
   var n=Math.round(number(L.lugs)),lug=Array.isArray(L.lug_mm)?L.lug_mm:[],len=mm(lug[0])||.39,lh=mm(lug[1])||.18,bm=/(\d{2})/.exec(String(L.bolt||"")),bd=bm?number(bm[1])/1000:0;
   if(n>0&&n<=72){
    var sh=new T.Shape();sh.moveTo(0,0);sh.lineTo(len,0);sh.lineTo(len*.74,lh-len*.074);sh.lineTo(0,lh);sh.lineTo(0,0);
    var lg=new T.ExtrudeGeometry(sh,{depth:t,bevelEnabled:false});lg.translate(0,0,-t/2);
    for(var k=0;k<n;k++){
     var th=planTheta(number(L.lug_start_deg)+360/n*k),d=new T.Vector3(Math.sin(th),0,Math.cos(th));
     var rib=put(new T.Mesh(lg,mat));rib.rotation.y=th-Math.PI/2;rib.position.copy(base).add(d.clone().multiplyScalar(wr+t/2));
     if(bd)addBolt({id:id,joint:{}},base.clone().add(d.clone().multiplyScalar(wr+len*.51)).add(new T.Vector3(0,.08,0)),new T.Vector3(d.z,0,-d.x),bd,t+.009)
    }
   }
   // The central shield: a cone from the bearing on the shields up to the middle, its seams along three diameters.
   var cap=L.cap&&typeof L.cap==="object"?L.cap:null,cr=cap?mm(cap.r_mm):0,rise=cap?mm(cap.rise_mm):0,cy=cap?mm(cap.base_mm):0;
   if(cr>pr){
    var cone=put(new T.Mesh(new T.CylinderGeometry(.002,cr,Math.max(rise,.005),72,1,true),roofMaterial(c)));cone.position.copy(base);cone.position.y+=cy+Math.max(rise,.005)/2;cone.userData.shell=true;cone.userData.roof=true;
    var apex=base.clone().add(new T.Vector3(0,cy+rise+.004,0));
    [0,45,90,180,225,270].forEach(function(a){var tt=planTheta(a),e=base.clone().add(new T.Vector3(Math.sin(tt)*cr,cy+.004,Math.cos(tt)*cr)),v=e.clone().sub(apex);
     var m=put(new T.Mesh(barGeo(.012),jointMat));m.position.copy(apex);m.scale.z=v.length();m.quaternion.setFromUnitVectors(zAxis,v.normalize())})
   }
   parts.forEach(function(m){steel.add(m);allMeshes.push(m);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(m)});
   var lp=base.clone();lp.y+=Math.max(H+2*t,cy+rise)+.35;
   var le=document.createElement("span");le.className="ir-three-member-label";le.textContent=c.mark||c.title||"";
   labelLayer.appendChild(le);labels.push({el:le,pos:lp,id:id});
   return true
  }
  function buildMembers(list){
   var cached=new Set(meshGeo.values()),gone=new Set();
   allMeshes.forEach(function(m){steel.remove(m);if(!cached.has(m.geometry))gone.add(m.geometry)});gone.forEach(function(g){g.dispose()});
   allMeshes=[];boltList=[];dataById.clear();meshesById.clear();failures=0;conventional.clear();drillCache.clear();
   labels.forEach(function(l){l.el.remove()});labels=[];
   elems=Array.isArray(list)?list:[];
   seatOnTops(elems);hangTies(elems);wallCuts(elems);deckCuts(elems);panelCorners(elems);bracePlanes(elems);
   var host=jointHosts(elems);findCrossings(elems,host);
   // (trusses and two-branch columns first: the members coming to them stop at their chords and branches)
   var lattice=function(c){return Boolean(c.truss&&Array.isArray(c.truss.members)&&c.truss.members.length||c.column&&Array.isArray(c.column.members)&&c.column.members.length)};
   elems.filter(lattice).concat(elems.filter(function(c){return!lattice(c)})).forEach(function(c){
    var id=String(c.id||"");if(!id)return;
    dataById.set(id,c);
    var p=memberPoints(c),segments=[],seated=seatEnd.get(id);
    if(seated)[0,1].forEach(function(k){var q=seated[k];if(q)p[k?p.length-1:0]=toWorld(q.x,q.y,k?c.z2:c.z0)});
    // Welds — a layer of their own on the scheme.
    if(c.ft==="weld"&&number(c.r)>0){
     if(!drawJoints(c,id,true)){failures++;return}
     var wl=toWorld(number(c.x)+number(c.r),number(c.y),number(c.z1));wl.y+=.2;
     var we=document.createElement("span");we.className="ir-three-member-label";we.textContent=c.mark||c.title||"";
     labelLayer.appendChild(we);labels.push({el:we,pos:wl,id:id});
     return
    }
    // A round plate: a tank bottom (a disc) or a ring platform (an annulus) lying flat at its level. A plate of an
    // annular ring (sector_deg) is its sector, with its two radial joints; a conical bottom rises to its centre by
    // cone_rise_mm (falls when negative: «уклон к центру»).
    if(c.lay&&c.lay.kind==="central_ring"&&number(c.r)>0&&centralRing(c,id,p[0]))return;
    if(c.geometryType==="plate"&&number(c.r)>0){
     if(c.lay)drawJoints(c,id,false);
     var ro=number(c.r)/1000,ri=Math.max(0,Math.min(number(c.ri)/1000,ro-.05)),rise=number(c.cr)/1000;
     var ps=number(c.sw)>0&&number(c.sw)<360,p0=0,pw=2*Math.PI;
     if(ps){var pa=planTheta(number(c.sa)),pb=planTheta(number(c.sa)+number(c.sw));pw=((pb-pa)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);p0=pa;
      if(pw>Math.PI&&number(c.sw)<180){p0=pb;pw=2*Math.PI-pw}}
     // The ring lies in the plane of its geometry: its angle φ there is the plan angle θ less a quarter turn.
     var pg=ri>0||ps?new T.RingGeometry(ri,ro,ps?Math.max(4,Math.ceil(96*pw/(2*Math.PI))):96,rise?8:1,p0-Math.PI/2,pw):new T.CircleGeometry(ro,96);
     if(rise){var pp=pg.attributes.position;for(var q=0;q<pp.count;q++){var d=Math.hypot(pp.getX(q),pp.getY(q));pp.setZ(q,rise*(1-d/ro))}pp.needsUpdate=true;pg.computeVertexNormals()}
     var plate=new T.Mesh(pg,shellMaterial(c));
     plate.rotation.x=-Math.PI/2;plate.position.copy(p[0]);plate.position.y+=.005;
     plate.userData.memberId=id;plate.userData.shell=true;steel.add(plate);allMeshes.push(plate);
     if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(plate);
     if(ps)[p0,p0+pw].forEach(function(t){var a=p[0].clone().add(new T.Vector3(Math.sin(t)*Math.max(ri,.01),.006,Math.cos(t)*Math.max(ri,.01))),b=p[0].clone().add(new T.Vector3(Math.sin(t)*ro,.006,Math.cos(t)*ro));
      var v=b.clone().sub(a),m=new T.Mesh(barGeo(.02),jointMat);m.position.copy(a);m.scale.z=v.length();m.quaternion.setFromUnitVectors(zAxis,v.normalize());
      m.userData.memberId=id;steel.add(m);allMeshes.push(m);meshesById.get(id).push(m)});
     var pl=p[0].clone(),pm=p0+pw/2;if(ps){pl.x+=Math.sin(pm)*(ri+ro)/2;pl.z+=Math.cos(pm)*(ri+ro)/2}else pl.x+=ri>0?(ri+ro)/2:0;pl.y+=.35+(ri>0||ps?0:Math.max(0,rise));
     var pe=document.createElement("span");pe.className="ir-three-member-label";pe.textContent=c.mark||c.title||"";
     labelLayer.appendChild(pe);labels.push({el:pe,pos:pl,id:id});
     return
    }
    // A tank wall: an open cylinder with its bottom, see-through so that the roof and the nozzles stay visible.
    // A railing round the roof is the same cylinder without a bottom.
    // A railing round a platform (ГОСТ 31385): posts at their step, the handrail at the top, two intermediate rails
    // and a toe board — one record, drawn piece by piece.
    if(c.geometryType==="shell"&&c.ft==="railing"&&number(c.r)>0){
     var rr=number(c.r),hh=dist(p[0],p[1]);if(hh<=.005){failures++;return}
     // Round the plan centre, over the whole circle or over its sector (an opening for a bridge or a stair).
     var a0=number(c.sw)>0&&number(c.sw)<360?number(c.sa):0,aw=number(c.sw)>0&&number(c.sw)<360?number(c.sw):360;
     var onArc=function(deg,z){var a=deg*Math.PI/180;return toWorld(number(c.x)+Math.cos(a)*rr,number(c.y)+Math.sin(a)*rr,z)};
     var stepM=Math.max(.5,(number(c.fd)||1000)/1000),span=2*Math.PI*rr/1000*aw/360,posts=Math.max(aw<360?2:8,Math.round(span/stepM)+(aw<360?1:0)),parts=[],mat=baseMaterial(c);
     var postGeo=new T.BoxGeometry(.05,hh,.05),z0=number(c.z0),zz=function(f){return z0+hh*1000*f};
     for(var k=0;k<posts;k++){var post=new T.Mesh(postGeo,mat);post.position.copy(onArc(a0+aw*k/(aw<360?posts-1:posts),z0));post.position.y+=hh/2;parts.push(post)}
     var segs=Math.max(24,Math.round(aw/3));
     var ring=function(f,t){var pts=[];for(var i=0;i<=segs;i++)pts.push(onArc(a0+aw*i/segs,zz(f)));
      parts.push(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts,aw>=360),segs,t,6,aw>=360),mat))};
     ring(1,.025);ring(.712,.015);ring(.424,.015);ring(.06,.012);
     parts.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);
      if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
     var rl=onArc(a0+aw/2,zz(1));rl.y+=.2;
     var rlab=document.createElement("span");rlab.className="ir-three-member-label";rlab.textContent=c.mark||c.title||"";
     labelLayer.appendChild(rlab);labels.push({el:rlab,pos:rl,id:id});
     return
    }
    // A roof of a tank (a shield of it): a cone from the wall down to the inner radius at its top, a sector of it
    // (the cone of a vessel bottom is the other way: narrow below, wide at the top — inner radius larger)
    // when the shield gives one (sector_start_deg on the plan, counter-clockwise, sector_deg wide).
    if(c.geometryType==="shell"&&number(c.r)>0&&number(c.ri)>0&&number(c.ri)!==number(c.r)){
     var cr=number(c.r)/1000,ci=number(c.ri)/1000,ch=p[1].y-p[0].y;if(Math.abs(ch)<=.005){failures++;return}
     // Plan angle → angle of the cylinder geometry (x = sin θ, z = cos θ) in this view's mirrored axes.
     var theta=planTheta;
     var t0=0,tl=2*Math.PI;
     if(number(c.sw)>0&&number(c.sw)<360){var ta=theta(number(c.sa)),tb=theta(number(c.sa)+number(c.sw));tl=((tb-ta)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);t0=ta;
      if(tl>Math.PI){t0=tb;tl=2*Math.PI-tl}}
     var cone=new T.Mesh(new T.CylinderGeometry(ci,cr,Math.abs(ch),48,1,true,t0,tl),roofMaterial(c));
     cone.position.copy(p[0]);cone.position.y+=ch/2;if(ch<0)cone.rotation.x=Math.PI;
     cone.userData.memberId=id;cone.userData.shell=true;cone.userData.roof=true;steel.add(cone);allMeshes.push(cone);
     if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(cone);
     // The joints of a shield (its two radial edges) as thin bars, so that the shields read apart.
     if(tl<2*Math.PI-.01)[t0,t0+tl].forEach(function(t){var a=p[0].clone().add(new T.Vector3(Math.sin(t)*cr,0,Math.cos(t)*cr)),b=p[0].clone().add(new T.Vector3(Math.sin(t)*ci,ch,Math.cos(t)*ci));
      var v=b.clone().sub(a),m=new T.Mesh(barGeo(.04),baseMaterial(c));m.position.copy(a);m.scale.z=v.length();
      m.quaternion.setFromUnitVectors(zAxis,v.normalize());m.userData.memberId=id;steel.add(m);allMeshes.push(m);meshesById.get(id).push(m)});
     var cm=t0+tl/2,cl=p[0].clone().add(new T.Vector3(Math.sin(cm)*(cr+ci)/2,ch/2+.3,Math.cos(cm)*(cr+ci)/2));
     var ce=document.createElement("span");ce.className="ir-three-member-label";ce.textContent=c.mark||c.title||"";
     labelLayer.appendChild(ce);labels.push({el:ce,pos:cl,id:id});
     return
    }
    if(c.geometryType==="shell"&&number(c.r)>0){
     var r=number(c.r)/1000,h=dist(p[0],p[1]);if(h<=.005){failures++;return}
     // One sheet of a course (sheet-by-sheet assembly): its sector of the course, with its two vertical joints.
     var ws=number(c.sw)>0&&number(c.sw)<360,w0=0,wl=2*Math.PI;
     if(ws){var wa=planTheta(number(c.sa)),wb=planTheta(number(c.sa)+number(c.sw));wl=((wb-wa)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);w0=wa;
      if(wl>Math.PI&&number(c.sw)<180){w0=wb;wl=2*Math.PI-wl}}
     var wall=new T.Mesh(new T.CylinderGeometry(r,r,h,ws?Math.max(4,Math.ceil(64*wl/(2*Math.PI))):64,1,true,w0,wl),shellMaterial(c));
     wall.position.copy(p[0]).add(p[1]).multiplyScalar(.5);
     var parts=[wall];
     // The seam at the top of a course (and the wall top) as a thin ring: courses read apart in 3D.
     var seam=new T.Mesh(ws?new T.TorusGeometry(r,.02,4,Math.max(4,Math.ceil(96*wl/(2*Math.PI))),wl):new T.TorusGeometry(r,.02,4,96),baseMaterial(c));seam.rotation.x=Math.PI/2;
     if(ws)seam.rotation.z=w0-Math.PI/2;
     seam.position.copy(p[1]);parts.push(seam);
     if(ws)[w0,w0+wl].forEach(function(t){var j=new T.Mesh(new T.BoxGeometry(.03,h,.03),jointMat);j.position.set(p[0].x+Math.sin(t)*(r+.006),(p[0].y+p[1].y)/2,p[0].z+Math.cos(t)*(r+.006));parts.push(j)});
     if(c.lay)drawJoints(c,id,false);
     if(!c.open){var bottom=new T.Mesh(new T.CircleGeometry(r,64),shellMaterial(c));bottom.rotation.x=-Math.PI/2;bottom.position.copy(p[0]);bottom.position.y+=.01;parts.push(bottom)}
     parts.forEach(function(mesh){mesh.userData.memberId=id;mesh.userData.shell=true;steel.add(mesh);allMeshes.push(mesh);
      if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
     var top=p[1].clone();top.y+=.35;
     var tl=document.createElement("span");tl.className="ir-three-member-label";tl.textContent=c.mark||c.title||"";
     labelLayer.appendChild(tl);labels.push({el:tl,pos:top,id:id});
     return
    }
    // Tank fittings are drawn as what they are: a pipe of their own diameter with a flange, a hatch with a cover,
    // a valve body, a foam generator, a lightning rod.
    if(c.ft&&c.ft!=="ring"&&p.length===2&&dist(p[0],p[1])>.005){addFitting(c,id,p[0],p[1]);return}
    if(c.truss&&Array.isArray(c.truss.members)&&c.truss.members.length&&addTruss(c,id)){host.parts(c,meshesById.get(id));return}
    if(c.column&&Array.isArray(c.column.members)&&c.column.members.length&&addColumnLattice(c,id)){host.parts(c,meshesById.get(id));return}
    for(var i=0;i<p.length-1;i++)if(dist(p[i],p[i+1])>.005)segments.push([p[i],p[i+1]]);
    // A vertical brace drawn as a cross: the second diagonal from the top of the first end to the foot of the second.
    if(c.cross&&p.length===2&&segments.length){var q0=p[0].clone(),q1=p[1].clone();q0.y=p[1].y;q1.y=p[0].y;segments.push([q0,q1])}
    if(!segments.length){failures++;return}
    var extra=[];
    if(c.geometryType!=="column")segments=segments.map(function(sg,i){
     var whole=segments.length===1||c.cross,t=trimSegment(c,id,sg[0],sg[1],host,extra,[whole||i===0,whole||i===segments.length-1]);
     // A bent member keeps its middle point: only its outer ends are cut.
     return segments.length>1&&!c.cross?[i?sg[0]:t[0],i===segments.length-1?t[1]:sg[1]]:t
    });
    // The second diagonal of a cross of one record is cut where it crosses the first; braces crossing others likewise.
    var cuts=crossCut.get(id)||[];
    if(c.cross&&segments.length===2){
     var a0=segments[0][0],ua=segments[0][1].clone().sub(a0).normalize(),b0=segments[1][0],ub=segments[1][1].clone().sub(b0).normalize(),cb=ua.dot(ub),cd=1-cb*cb;
     if(cd>.06){var cw=a0.clone().sub(b0),cs=(cb*ub.dot(cw)-ua.dot(cw))/cd,cx=crossing(c,a0.clone().add(ua.clone().multiplyScalar(cs)),ub.clone().cross(ua).normalize(),Math.sqrt(cd),c);cx.only=1;cuts=[cx]}
    }
    if(cuts.length)segments=cutAtCrossings(c,segments,cuts,extra);
    addDrill(c,extra);addPlates(c,extra);addGussets(c,extra);addCuts(c,extra,[segments[0][0],segments[segments.length-1][1]]);
    extra.forEach(function(m){m.userData.memberId=id;steel.add(m);allMeshes.push(m);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(m)});
    segments.forEach(function(points){
     if(!sectionOf(c.profile_name||c.profileName,c.profile_standard))conventional.add(id);
     var dir=points[1].clone().sub(points[0]).normalize(),ang=braceAngle(c,dir);
     if(ang){
      [1].concat(ang.pair?[-1]:[]).forEach(function(side){
       var am=new T.Mesh(realGeometry(T,meshGeo,ang.sec),baseMaterial(c));am.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(ang.X,ang.Y,dir));
       am.position.copy(points[0]).add(ang.X.clone().multiplyScalar(side*ang.gap/2)).add(ang.Y.clone().multiplyScalar(ang.lift));am.scale.set(side,1,dist(points[0],points[1]));
       am.userData.memberId=id;am.userData.body=true;steel.add(am);allMeshes.push(am);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(am)});
      return
     }
     var mesh=new T.Mesh(addGeometry(T,meshGeo,c),baseMaterial(c));
     mesh.position.copy(points[0]);mesh.scale.z=dist(points[0],points[1]);
     mesh.quaternion.setFromUnitVectors(zAxis,points[1].clone().sub(points[0]).normalize());
     mesh.userData.memberId=id;mesh.userData.body=true;steel.add(mesh);allMeshes.push(mesh);
     if(!meshesById.has(id))meshesById.set(id,[]);
     meshesById.get(id).push(mesh)
    });
    // Mark label above the top of a column, over the middle of a beam.
    var anchor=c.geometryType==="column"?p[p.length-1].clone():p[0].clone().add(p[p.length-1]).multiplyScalar(.5);
    anchor.y+=.35;
    var el=document.createElement("span");el.className="ir-three-member-label";el.textContent=c.mark||c.title||"";
    labelLayer.appendChild(el);labels.push({el:el,pos:anchor,id:id})
   });
   seats.forEach(function(k){k.beams.forEach(function(e){
    var id=String(e.b.id);if(!dataById.has(id))return;var parts=[];seatParts(k,e,parts);
    parts.forEach(function(m){m.userData.memberId=id;steel.add(m);allMeshes.push(m);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(m)})
   })});
   crossPlates.forEach(function(e){if(!dataById.has(e.id))return;var m=e.mesh;
    m.userData.memberId=e.id;steel.add(m);allMeshes.push(m);if(!meshesById.has(e.id))meshesById.set(e.id,[]);meshesById.get(e.id).push(m)});
   pedestals=[];
   elems.forEach(function(c){if(dataById.has(String(c.id))&&basePlated(c))baseParts(c)});
   elems.forEach(function(c){if(c.geometryType==="column"&&dataById.has(String(c.id))&&footPlateSize(c.base))footPlate(c)});
   girderBrackets()
  }
  // The brackets (столики) the wall girders of the framing lie on beside the columns (a КМ1, л.29, 30, узлы 1–8,
  // разрез 3-3: the girder □180×5 outside the column, its bottom on a horizontal plate t14 welded to the column, a
  // triangular rib t10 under it, two bolts М16 through the plate and the bottom of each girder end, 90 mm from the axis
  // of the column, 60 mm apart across): a horizontal girder of the framing ending beside a column, outside its body (its
  // near face 0–1,2 m from the face of the column, its end within the width of the column), at a level of the column.
  // The plate reaches from the face of the column to the outer face of the girder, 300 wide; the rib 300 out, 200 deep;
  // one bracket carries the girders of both spans. Sizes from joint.bracket of the sheet ({plate_mm:[t, along, out],
  // rib_mm:[t, out, depth], cap_mm}), else as that node. The plate and the rib are of the column, the bolts and the end
  // caps of the girder.
  function girderBrackets(){
   var made=new Set(),up=new T.Vector3(0,1,0);
   elems.forEach(function(g){
    var gid=String(g.id||"");
    if(g.geometryType!=="beam"||!gid||g.ft||g.truss||!dataById.has(gid)||kind(g)!=="fahwerk"||Math.abs(number(g.z2)-number(g.z0))>30)return;
    var z=number(g.z0),a=toWorld(g.x,g.y,z),b=toWorld(g.x2,g.y2,z),au=b.clone().sub(a),L=au.length();if(L<.5)return;au.divideScalar(L);
    var hs=halfSection(g),gw=hs.b,gh=hs.h,br=g.joint&&g.joint.bracket&&typeof g.joint.bracket==="object"?g.joint.bracket:{};
    var mm=function(v,i,d){var x=Array.isArray(v)?number(v[i]):0;return(x>0?x:d)/1000};
    var tP=mm(br.plate_mm,0,14),wP=mm(br.plate_mm,1,300),tR=mm(br.rib_mm,0,10),oR=mm(br.rib_mm,1,300),dR=mm(br.rib_mm,2,200),cap=number(br.cap_mm)/1000;
    var gsec=sectionOf(g.profile_name||g.profileName,g.profile_standard),tw=gsec&&gsec.t?gsec.t/1000:.005,d=boltMm(br.bolt,g)/1000;
    [[a,au],[b,au.clone().negate()]].forEach(function(E){
     var best=null;
     elems.forEach(function(k){
      if(k.geometryType!=="column"||k.ft||!k.id||!dataById.has(String(k.id))||k.column&&Array.isArray(k.column.members)&&k.column.members.length)return;
      if(z<number(k.z0)+300||z>number(topOf(k)))return;
      var C=toWorld(k.x,k.y,z),rel=E[0].clone().sub(C),along=rel.dot(au),ov=rel.clone().sub(au.clone().multiplyScalar(along));ov.y=0;
      var dOut=ov.length(),ks=halfSection(k),hAlong=Math.abs(au.x)*ks.b+Math.abs(au.z)*ks.h,hOut=Math.abs(au.z)*ks.b+Math.abs(au.x)*ks.h,gap=dOut-gw-hOut;
      if(dOut<1e-3||Math.abs(along)>hAlong+.06||gap<-.005||gap>1.2)return;
      if(!best||gap<best.gap)best={k:k,C:C,along:along,out:ov.divideScalar(dOut),dOut:dOut,hAlong:hAlong,hOut:hOut,gap:gap}
     });
     if(!best)return;
     var k=best.k,cid=String(k.id),out=best.out,side=out.clone().cross(up).normalize(),bot=z/1000-gh;
     var mid=best.C.clone().add(au.clone().multiplyScalar(Math.max(-best.hAlong,Math.min(best.hAlong,best.along)))),ext=best.dOut+gw-best.hOut;
     var key=cid+":"+Math.round(mid.x*20)+":"+Math.round(mid.z*20)+":"+Math.round(bot*20)+":"+Math.round(out.x*2)+":"+Math.round(out.z*2);
     if(!made.has(key)){
      made.add(key);
      var face=mid.clone().add(out.clone().multiplyScalar(best.hOut));face.y=bot-tP;
      keepPart(plateBox(k,face.clone().add(out.clone().multiplyScalar(ext/2)).add(up.clone().multiplyScalar(tP/2)),out,up,side,ext,tP,wP),cid);
      var w=Math.min(oR,ext),rib=new T.Mesh(shared("rib:"+w.toFixed(3)+":"+dR.toFixed(3)+":"+tR.toFixed(3),function(){
       var sh=new T.Shape();sh.moveTo(0,0);sh.lineTo(w,0);sh.lineTo(0,-dR);sh.closePath();var geo=new T.ExtrudeGeometry(sh,{depth:tR,bevelEnabled:false});geo.translate(0,0,-tR/2);return geo}),baseMaterial(k));
      rib.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(out,up,side));rib.position.copy(face);keepPart(rib,cid)
     }
     // Two bolts of the girder end through its bottom and the plate (heads below), its end cap.
     var at=E[0].clone();at.y=bot;
     if(d)[-1,1].forEach(function(j){addBolt(g,at.clone().add(E[1].clone().multiplyScalar(.09)).add(out.clone().multiplyScalar(j*gw/3)).add(up.clone().multiplyScalar((tw-tP)/2)),up.clone().negate(),d,tw+tP)});
     if(cap>0&&cap<.03)keepPart(plateBox(g,E[0].clone().add(E[1].clone().multiplyScalar(cap/2)),E[1],up,E[1].clone().cross(up).normalize(),cap,2*gh,2*gw),gid)
    })
   })
  }
  // A post on a plate of its own given by the drawing (the roof guard of a КМ: «−4×320×550» lying on the roof sandwich
  // panel, fixed to it with self-tapping screws): {plate:"−t×w×l", toward_mm:[dx,dy,dz]} — the plate from the foot of
  // the post along toward_mm (inward, on the slope), the post 25 mm from its outer end. The covering under it is of the
  // АР and is not drawn without it: the plate shows what the post stands on.
  function footPlateSize(b){
   var m=/(\d+(?:[.,]\d+)?)\s*[×xх*]\s*(\d+)\s*[×xх*]\s*(\d+)/.exec(String(b&&b.plate||"")),v=b&&b.toward_mm;
   if(!m||!Array.isArray(v)||v.length<3)return null;
   var t=number(String(m[1]).replace(",","."))/1000,w=number(m[2])/1000,l=number(m[3])/1000,d=Math.hypot(number(v[0]),number(v[1]),number(v[2]));
   return t>0&&t<.05&&w>.05&&l>.05&&w<2&&l<2&&d>1?{t:t,w:w,l:l,dx:number(v[0])/d,dy:number(v[1])/d,dz:number(v[2])/d}:null
  }
  function footPlate(c){
   var f=footPlateSize(c.base),id=String(c.id),x=number(c.x),y=number(c.y),z=number(c.z0);
   var a=toWorld(x,y,z),d=toWorld(x+f.dx*1000,y+f.dy*1000,z+f.dz*1000).sub(a);if(d.lengthSq()<1e-9)return;d.normalize();
   var side=new T.Vector3(0,1,0).cross(d);if(side.lengthSq()<1e-9)return;side.normalize();var up=d.clone().cross(side).normalize();
   var plate=new T.Mesh(shared("foot:"+f.w.toFixed(3)+":"+f.t.toFixed(3)+":"+f.l.toFixed(3),function(){return new T.BoxGeometry(f.w,f.t,f.l)}),baseMaterial(c));
   plate.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(side,up,d));
   plate.position.copy(a).add(d.clone().multiplyScalar(f.l/2-.025)).add(up.clone().multiplyScalar(f.t/2));
   plate.userData.memberId=id;steel.add(plate);allMeshes.push(plate);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(plate)
  }
  // The base plate of a column under its foot (with the frame, seen from any distance: without it a column stood in the
  // air) and, under a base at the ground (up to +0.300), a conditional concrete footing — the footings are of the КЖ, not
  // of the КМ: their size is not known here, only that the column stands on one. Hidden with the details.
  var concreteMat=new T.MeshStandardMaterial({color:0xaeb3b8,roughness:.95}),pedestals=[];
  function basePlated(c){return c.geometryType==="column"&&!c.ft&&!(number(c.r)>0)&&!slight(c)&&!(c.column&&Array.isArray(c.column.members)&&c.column.members.length)}
  // The base plate its sheet draws in a cut at the foot (endCuts): as large and thick as drawn, an anchor in each of its
  // holes — as thick as the base sheet says, else a bolt of the sheet's list fitting its least hole, else conditional,
  // 3 mm less than that hole.
  function baseSize(c){
   var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard),bw=sec?sec.b/1000:.36,hh=sec?sec.h/1000:.4;
   var an=c.base&&c.base.anchors||null,cnt=an&&number(an.count)>0?Math.min(24,number(an.count)):4,dia=an&&number(an.d_mm)>0?number(an.d_mm)/1000:.03;
   var side=Math.ceil(cnt/2),step=Math.max(.1,dia*4),cut=endCuts(c).filter(function(e){return e.end===0})[0];
   if(cut){
    // (by the least hole: the anchor goes through the washer's, ГПЭС Ф2-1 «1-1»: Ø40 in the plate, Ø27 in the washer)
    var hd=cut.holes.reduce(function(m,h){return h.d>0&&(!m||h.d<m)?h.d:m},0),fit=boltFor(boltSizes(c),hd),own=an&&number(an.d_mm)>0;
    if(!own&&fit)dia=fit/1000;else if(!own&&hd>3)dia=Math.min(dia,(hd-3)/1000);
    return{cnt:cut.holes.length,dia:dia,side:Math.ceil(cut.holes.length/2),step:step,pw:cut.x/1000,pd:cut.y/1000,pt:cut.t/1000,
     holes:cut.holes.map(function(h){return{x:h.x/1000,z:-h.y/1000,d:h.d/1000}})}
   }
   return{cnt:cnt,dia:dia,side:side,step:step,pw:Math.max(bw+.2,(side-1)*step+.1),pd:hh+.2+dia*2,pt:.03}
  }
  function baseParts(c){
   var id=String(c.id),bs=baseSize(c),at=toWorld(number(c.x),number(c.y),number(c.z0));
   var plate=new T.Mesh(shared("plate:"+bs.pw.toFixed(3)+":"+bs.pd.toFixed(3)+":"+bs.pt.toFixed(3),function(){return new T.BoxGeometry(bs.pw,bs.pt,bs.pd)}),baseMaterial(c));
   plate.position.copy(at);plate.position.y-=bs.pt/2;plate.userData.memberId=id;steel.add(plate);allMeshes.push(plate);
   if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(plate);
   var hp=[];(bs.holes||[]).forEach(function(h){putHole(c,hp,{at:plate.position.clone().add(new T.Vector3(h.x,0,h.z)),axis:boltY,d:h.d,t:bs.pt,bolt:0})});
   hp.forEach(function(m){m.userData.memberId=id;steel.add(m);allMeshes.push(m);meshesById.get(id).push(m)});
   if(number(c.z0)>300)return;
   var fw=bs.pw+.3,fd=bs.pd+.3,fh=1;
   var foot=new T.Mesh(shared("footing:"+fw.toFixed(3)+":"+fd.toFixed(3),function(){return new T.BoxGeometry(fw,fh,fd)}),concreteMat);
   foot.position.copy(at);foot.position.y-=bs.pt+fh/2;foot.visible=showDetails;
   foot.userData.memberId=id;foot.userData.fixed=true;foot.userData.footing=true;steel.add(foot);allMeshes.push(foot);pedestals.push(foot)
  }
  // ---- Cranes on their runways, drawn conventionally (the crane is equipment, not in the КМ): an overhead crane on a
  // pair of rails (or crane girders without rails) — end carriages, two girders of the bridge and a trolley with its hook;
  // a suspended crane under a pair of runway beams («Путь подвесного крана») — carriages on the bottom flanges, a single
  // girder with cantilevers and a hoist; a monorail — a hoist under it. The pair: parallel at one level, 3–40 m apart,
  // overlapping by half; the crane stands at a third of the common length. Shown with the details, in orange (amber
  // was the colour of the braces: among them the engineer did not find the cranes); the legend counts them and a click
  // on it shows them one by one.
  var craneMat=new T.MeshStandardMaterial({color:0xff6a00,metalness:.2,roughness:.55}),hoistMat=new T.MeshStandardMaterial({color:0x3a4048,metalness:.3,roughness:.5}),
   wheelMat=new T.MeshStandardMaterial({color:0x1f2328,metalness:.6,roughness:.35}),
   glassMat=new T.MeshStandardMaterial({color:0x9ccbe8,metalness:.1,roughness:.08,transparent:true,opacity:.45,depthWrite:false});
  // Only the member's own name makes it a runway: a type «Кран-балка, монорельс» given to a beam by its letters (a beam of
  // a crane service platform, an opening) put cranes and hoists all over the frame. A pair of «путь подвесного крана»
  // carries a suspended crane, a «монорельс» a hoist, a «рельс» (or a rail profile Р43) and a «подкрановая балка» an
  // overhead crane. The name is mark_name: the title of a record in the program is its position («PDF-…»), so read
  // first it left only the rails of profile Р43 (a suspended crane on its runways was not drawn).
  // Every part of a crane knows its crane and its name: the engineer took the grey cabin (a plain box under the bridge)
  // for something of the frame and asked «это что за квадрат?» (25.10.2026). The cabin is drawn as a cab — hangers to the
  // girder, a frame, panels below and glass above; a click on any part of a crane opens its card (what it is, that it
  // is conventional, on which runways) and does not choose the member behind it.
  var cranes=[],craneTurn=0,craneNo=-1,partName="";
  var craneKinds={overhead:"Мостовой кран",hung:"Подвесной кран",hoist:"Таль на монорельсе"};
  function runwayKind(c){
   var n=String(c.mark_name||c.title||""),pr=String(c.profile_name||c.profileName||"");
   if(/площадк|лестниц|ограждени|обрамлени|проём|проем|упор/i.test(n))return"";
   if(/(^|[^о])рельс/i.test(n)||/^(?:Р|КР)\d{2,3}$/.test(pr))return"rail";
   if(/монорельс/i.test(n))return"mono";
   if(/подвесн\S*\s+(?:кран|пут)|пут[ьи]\s+подвесн|кран[\s-]*балк/i.test(n))return"hung";
   if(/подкранов\S*\s+балк|балк\S*\s+подкранов/i.test(n))return"girder";
   return""
  }
  // A welded I of plates «−16×200, −10×494»: the web is the thinner plate, the height is it and two flanges.
  function weldedHeight(p){
   var pl=[],re=/[−-]\s*(\d+(?:[.,]\d+)?)\s*[×xх]\s*(\d+)/g,m;while((m=re.exec(String(p||""))))pl.push({t:number(m[1].replace(",",".")),w:number(m[2])});
   if(pl.length<2)return 0;pl.sort(function(a,b){return a.t-b.t});return pl[0].w+2*pl[pl.length-1].t
  }
  function buildCranes(){
   equipment.children.slice().forEach(function(m){equipment.remove(m);m.geometry.dispose()});
   cranes=[];craneTurn=0;
   var ways=[];
   elems.forEach(function(c){
    if(c.geometryType!=="beam"||c.ft)return;var k=runwayKind(c);if(!k)return;
    var a={x:number(c.x),y:number(c.y)},b={x:number(c.x2),y:number(c.y2)},L=Math.hypot(b.x-a.x,b.y-a.y);if(L<3000||Math.abs(number(c.z0)-number(c.z2))>50)return;
    var sec=sectionOf(c.profile_name||c.profileName,c.profile_standard);ways.push({c:c,kind:k,a:a,b:b,L:L,u:{x:(b.x-a.x)/L,y:(b.y-a.y)/L},z:number(c.z0),h:sec?sec.h:weldedHeight(c.profile_name||c.profileName),fb:sec&&sec.b?sec.b:200})
   });
   // Rails decide where there are any; crane girders carry a crane only where no rail lies on them.
   var rails=ways.filter(function(w){return w.kind==="rail"});
   var pairs=[],used=new Set(),list=function(kind){return ways.filter(function(w){return w.kind===kind})};
   var pairUp=function(group){
    group.forEach(function(w){
     if(used.has(w))return;var best=null;
     group.forEach(function(o){
      if(o===w||used.has(o)||Math.abs(o.z-w.z)>300||Math.abs(w.u.x*o.u.y-w.u.y*o.u.x)>.02)return;
      var d=Math.abs((o.a.x-w.a.x)*-w.u.y+(o.a.y-w.a.y)*w.u.x);if(d<3000||d>40000)return;
      var p=function(q){return(q.x-w.a.x)*w.u.x+(q.y-w.a.y)*w.u.y},lo=Math.max(0,Math.min(p(o.a),p(o.b))),hi=Math.min(w.L,Math.max(p(o.a),p(o.b)));
      if(hi-lo<Math.min(w.L,o.L)*.5)return;
      if(!best||d<best.d)best={o:o,d:d,lo:lo,hi:hi}
     });
     if(best){used.add(w);used.add(best.o);pairs.push({w:w,o:best.o,lo:best.lo,hi:best.hi})}
    })
   };
   // Several runway pieces in one line (girders of a span each) make one line: the longest stands for it.
   var lines=function(group){var out=[];group.slice().sort(function(p,q){return q.L-p.L}).forEach(function(w){
    if(!out.some(function(o){return Math.abs(o.z-w.z)<=300&&Math.abs(o.u.x*w.u.y-o.u.y*w.u.x)<=.02&&Math.abs((w.a.x-o.a.x)*-o.u.y+(w.a.y-o.a.y)*o.u.x)<300}))out.push(w)});return out};
   if(rails.length)pairUp(lines(rails));else pairUp(lines(list("girder")));
   var hung=lines(list("hung"));pairUp(hung);
   // Parts in a frame of the crane: X — across (the span), Z — along the runway, Y — up.
   var UP=new T.Vector3(0,1,0);
   var place=function(geo,mat,at,X,Y,Z){var m=new T.Mesh(geo,mat);m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(X,Y,Z));m.position.copy(at);m.userData.crane=craneNo;m.userData.part=partName;equipment.add(m);return m};
   var box=function(w,h,d,mat,at,X,Z){return place(new T.BoxGeometry(w,h,d),mat,at,X,UP,Z)};
   var cyl=function(r,len,mat,at,dir,seg){var d=dir.clone().normalize(),x=Math.abs(d.y)>.9?new T.Vector3(1,0,0):new T.Vector3().crossVectors(UP,d).normalize();
    return place(new T.CylinderGeometry(r,r,len,seg||14),mat,at,x,d,new T.Vector3().crossVectors(x,d))};
   // An I of three plates along `dir`: height h, flange b, web tw, flange tf; `at` — the middle of its top.
   var ibeam=function(len,h,b,tw,tf,mat,at,dir,side){
    box(b,tf,len,mat,at.clone().add(new T.Vector3(0,-tf/2,0)),side,dir);box(tw,h-2*tf,len,mat,at.clone().add(new T.Vector3(0,-h/2,0)),side,dir);box(b,tf,len,mat,at.clone().add(new T.Vector3(0,-h+tf/2,0)),side,dir)
   };
   // The hook block under the ropes and its hook.
   var hookBlock=function(at,X,Z,k){
    partName="крюковая подвеска";box(.22*k,.3*k,.14*k,craneMat,at,X,Z);cyl(.1*k,.16*k,wheelMat,at.clone().add(new T.Vector3(0,.04*k,0)),Z,16);
    cyl(.022*k,.16*k,wheelMat,at.clone().add(new T.Vector3(0,-.23*k,0)),UP,10);
    var hook=place(new T.TorusGeometry(.075*k,.022*k,8,18,Math.PI*1.45),wheelMat,at.clone().add(new T.Vector3(0,-.37*k,0)),X,UP,Z);hook.rotateZ(Math.PI*.78)
   };
   // An electric hoist under a flange (`at` — the underside of the flange, `dir` — along the beam): trolley plates and
   // wheels on the flange, the drum with the rope, the motor and the gearbox at its ends, the control box, the pendant.
   var hoist=function(at,dir,drop){
    var Z=dir.clone().setY(0).normalize(),X=new T.Vector3().crossVectors(UP,Z).normalize();partName="электроталь";
    [-1,1].forEach(function(i){box(.012,.36,.5,hoistMat,at.clone().add(X.clone().multiplyScalar(i*.14)).add(new T.Vector3(0,-.06,0)),X,Z);
     [-1,1].forEach(function(j){cyl(.055,.035,wheelMat,at.clone().add(X.clone().multiplyScalar(i*.09)).add(Z.clone().multiplyScalar(j*.16)).add(new T.Vector3(0,.075,0)),X,16)})});
    var drum=at.clone().add(new T.Vector3(0,-.42,0));cyl(.15,.56,hoistMat,drum,Z,18);
    cyl(.115,.34,hoistMat,drum.clone().add(Z.clone().multiplyScalar(.45)),Z,16);box(.3,.32,.16,hoistMat,drum.clone().add(Z.clone().multiplyScalar(-.36)),X,Z);
    box(.14,.24,.3,craneMat,drum.clone().add(X.clone().multiplyScalar(.24)),X,Z);
    var low=drum.clone().add(new T.Vector3(0,-.15-drop,0));
    [-1,1].forEach(function(i){var r=drum.clone().add(Z.clone().multiplyScalar(i*.06)).add(new T.Vector3(0,-.15-drop/2,0));cyl(.007,drop,wheelMat,r,UP,6)});
    hookBlock(low.clone().add(new T.Vector3(0,-.15,0)),X,Z,1);partName="пульт управления";
    var pend=drum.clone().add(X.clone().multiplyScalar(.28)).add(new T.Vector3(0,-1.2,0));cyl(.005,2.1,wheelMat,pend.clone().add(new T.Vector3(0,.15,0)),UP,5);box(.08,.24,.07,craneMat,pend.clone().add(new T.Vector3(0,-.95,0)),X,Z)
   };
   // The operator's cab under the bridge girder (`top` — the middle of the girder's underside): two hangers, the roof, the
   // floor, posts at the corners, panels below, glass above on three sides, the back closed (the door to the bridge).
   var cabin=function(top,X,Z){
    partName="кабина крановщика";var W=1.6,D=1.6,H=1.9,roof=top.clone().add(new T.Vector3(0,-.3,0)),y0=roof.y-H,lo=.85,gh=H-lo-.07;
    var at=function(x,y,z){return roof.clone().add(X.clone().multiplyScalar(x)).add(Z.clone().multiplyScalar(z)).setY(y)};
    [-1,1].forEach(function(i){box(.1,.3,.1,hoistMat,at(i*.5,top.y-.15,0),X,Z)});
    box(W+.14,.07,D+.14,hoistMat,at(0,roof.y-.035,0),X,Z);box(W,.07,D,hoistMat,at(0,y0+.035,0),X,Z);
    [-1,1].forEach(function(i){[-1,1].forEach(function(j){box(.06,H,.06,hoistMat,at(i*(W/2-.03),y0+H/2,j*(D/2-.03)),X,Z)})});
    [-1,1].forEach(function(i){box(W,lo,.03,craneMat,at(0,y0+lo/2,i*D/2),X,Z);box(.03,lo,D,craneMat,at(i*W/2,y0+lo/2,0),X,Z)});
    var gy=y0+lo+gh/2;[-1,1].forEach(function(i){box(W-.12,gh,.02,glassMat,at(0,gy,i*D/2),X,Z)});
    box(.02,gh,D-.12,glassMat,at(W/2,gy,0),X,Z);box(.03,gh,D,craneMat,at(-W/2,gy,0),X,Z)
   };
   pairs.forEach(function(p){
    var w=p.w,o=p.o,s=p.lo+(p.hi-p.lo)/3,A={x:w.a.x+w.u.x*s,y:w.a.y+w.u.y*s},t=((A.x-o.a.x)*o.u.x+(A.y-o.a.y)*o.u.y),B={x:o.a.x+o.u.x*t,y:o.a.y+o.u.y*t};
    var pa=toWorld(A.x,A.y,0),pb=toWorld(B.x,B.y,0),span=Math.hypot(pb.x-pa.x,pb.z-pa.z),mid=pa.clone().add(pb).multiplyScalar(.5);
    var along=toWorld(A.x+w.u.x*1000,A.y+w.u.y*1000,0).sub(pa).normalize(),S=pb.clone().sub(pa).setY(0).normalize(),AL=along.clone().setY(0).normalize();
    craneNo=cranes.length;var info={kind:w.kind==="hung"?"hung":"overhead",span:Math.round(span*1000),runs:[w.c,o.c]};
    if(w.kind==="hung"){
     // A suspended crane: on each runway a carriage — two pairs of wheels on the bottom flange either side of the web,
     // its side plates and the end beam below; the girder (I) hung under the end beams with cantilevers; the hoist on
     // the girder's bottom flange.
     var bottom=(Math.min(w.z,o.z)-(w.h||400)/2)/1000;info.on="Низ пути";info.z=Math.round(bottom*1000);
     [pa,pb].forEach(function(q){
      // The wheels on the flange halves either side of the web, the side plates just outside the flange edges.
      var c0=q.clone(),fb=(q===pa?w.fb:o.fb)/1000;c0.y=bottom;partName="тележка на пути";
      [-1,1].forEach(function(i){[-1,1].forEach(function(j){cyl(.065,.04,wheelMat,c0.clone().add(S.clone().multiplyScalar(i*fb/4)).add(AL.clone().multiplyScalar(j*.32)).add(new T.Vector3(0,.08,0)),S,16)});
       box(.012,.36,.85,craneMat,c0.clone().add(S.clone().multiplyScalar(i*(fb/2+.025))).add(new T.Vector3(0,-.02,0)),S,AL);
       cyl(.02,fb+.06,wheelMat,c0.clone().add(AL.clone().multiplyScalar(i*.32)).add(new T.Vector3(0,.08,0)),S,8)});
      partName="концевая балка";box(.26,.3,1.5,craneMat,c0.clone().add(new T.Vector3(0,-.38,0)),S,AL)
     });
     partName="балка крана";var gTop=bottom-.53,gLen=span+1.6;ibeam(gLen,.45,.2,.012,.018,craneMat,mid.clone().setY(gTop),S,AL);cranes.push(Object.assign(info,{at:mid.clone().setY(gTop),size:span,along:AL.clone()}));
     hoist(pa.clone().lerp(pb,.35).setY(gTop-.45),S,Math.max(1.2,Math.min(3.5,gTop-1.5-1)))
    }else{
     // An overhead crane on rails: end trucks with two wheels on each rail, the bridge of two box girders, the trolley
     // on the girders with its drum, motor and gearbox, four falls of rope to the hook block, the cabin under the bridge.
     var top=(Math.max(w.z,o.z)+(w.kind==="rail"?(w.h||140)/2:(w.h||1000)/2))/1000;info.on=w.kind==="rail"?"Головка рельса":"Верх пути";info.z=Math.round(top*1000);
     [pa,pb].forEach(function(q){
      var c0=q.clone();c0.y=top;partName="колесо на рельсе";
      [-1,1].forEach(function(j){cyl(.25,.12,wheelMat,c0.clone().add(AL.clone().multiplyScalar(j*1.5)).add(new T.Vector3(0,.25,0)),S,20)});
      partName="концевая балка";box(.42,.55,4,craneMat,c0.clone().add(new T.Vector3(0,.62,0)),S,AL)
     });
     partName="главная балка моста";var gB=top+.9;[-1,1].forEach(function(k){box(span+.5,1.2,.5,craneMat,mid.clone().add(AL.clone().multiplyScalar(k*1.1)).setY(gB+.6),S,AL)});cranes.push(Object.assign(info,{at:mid.clone().setY(gB),size:span,along:AL.clone()}));
     var tr=pa.clone().lerp(pb,.4).setY(gB+1.2);partName="грузовая тележка";
     box(2.0,.3,2.8,hoistMat,tr.clone().add(new T.Vector3(0,.15,0)),S,AL);
     [-1,1].forEach(function(i){[-1,1].forEach(function(j){cyl(.16,.08,wheelMat,tr.clone().add(S.clone().multiplyScalar(i*.8)).add(AL.clone().multiplyScalar(j*1.1)).add(new T.Vector3(0,.0,0)),S,16)})});
     var dr=tr.clone().add(new T.Vector3(0,.68,0));partName="лебёдка тележки";cyl(.34,1.5,hoistMat,dr,AL,20);cyl(.2,.6,hoistMat,dr.clone().add(AL.clone().multiplyScalar(1.1)).add(S.clone().multiplyScalar(.5)),AL,16);
     box(.6,.55,.5,hoistMat,dr.clone().add(AL.clone().multiplyScalar(-1.05)),S,AL);
     var drop=Math.max(2,Math.min(6,gB-2)),hb=tr.clone().add(new T.Vector3(0,-drop,0));partName="канаты";
     [-.25,-.08,.08,.25].forEach(function(z){cyl(.011,drop+.3,wheelMat,tr.clone().add(AL.clone().multiplyScalar(z)).add(new T.Vector3(0,-drop/2+.15,0)),UP,6)});
     hookBlock(hb,S,AL,2);
     cabin(pa.clone().lerp(pb,.12).add(AL.clone().multiplyScalar(-1.1)).setY(gB),S,AL)
    }
   });
   list("mono").concat(hung.filter(function(w){return!used.has(w)})).forEach(function(w){
    var s=w.L/3,at=toWorld(w.a.x+w.u.x*s,w.a.y+w.u.y*s,w.z-(w.h||300)/2),dir=toWorld(w.a.x+w.u.x*(s+1000),w.a.y+w.u.y*(s+1000),0).sub(toWorld(w.a.x+w.u.x*s,w.a.y+w.u.y*s,0));
    craneNo=cranes.length;hoist(at,dir,1.6);cranes.push({at:at.clone(),size:4,kind:"hoist",runs:[w.c],on:"Низ пути",z:Math.round(w.z-(w.h||300)/2)})
   });
   equipment.visible=showDetails
  }
  // ---- Nodes: where members meet — column bases and tops, beam ends at a column or on another beam, joints of
  // members. A marker per node coloured by montage (all mounted, part, none); a click opens the node: its members,
  // their status, what is still missing. Base plates, anchors and cap plates near the camera are drawn schematically
  // (not by the КМД), only to read the node.
  var nodeColors={mounted:0x1f9e89,partial:0xf25c05,planned:0x9aa3ad};
  var nodeKinds={base:"База колонны",top:"Оголовок колонны",side:"Примыкание к колонне",beam:"Опирание на балку",joint:"Стык элементов"};
  var nodes=[],nodeMeshes=[],nodeMats=new Map(),nodeMode="sel",showDetails=true,selectedNode=null,details=[];
  var boltMat=new T.MeshStandardMaterial({color:0x30363d,metalness:.35,roughness:.5});
  var plateMat=new T.MeshStandardMaterial({color:0x7d8793,metalness:.25,roughness:.55});
  function nodeMaterial(status){
   if(!nodeMats.has(status))nodeMats.set(status,new T.MeshBasicMaterial({color:nodeColors[status]||nodeColors.planned,depthTest:false,transparent:true,opacity:.92}));
   return nodeMats.get(status)
  }
  function statusOf(list){
   var st=list.map(function(m){return m.c.status==="mounted"?"mounted":m.c.status==="partial"?"partial":"planned"});
   return st.every(function(x){return x==="mounted"})?"mounted":st.some(function(x){return x!=="planned"})?"partial":"planned"
  }
  function computeNodes(){
   var list=[],plain=function(c){return !c.ft&&!(number(c.r)>0)&&!slight(c)};
   var cols=elems.filter(function(c){return c.geometryType==="column"&&plain(c)&&dataById.has(String(c.id))});
   var lines=elems.filter(function(c){return(c.geometryType==="beam"||c.geometryType==="brace"||c.geometryType==="bent")&&plain(c)&&dataById.has(String(c.id))});
   // Plan cells of 1 m: a node, a column or a member line is looked for in its own cells only (thousands of members
   // compared each with each took seconds).
   var CELL=1000,cellOf=function(v){return Math.floor(v/CELL)},key=function(i,j){return i+":"+j};
   var near=function(index,x,y,r,fn){for(var i=cellOf(x-r);i<=cellOf(x+r);i++)for(var j=cellOf(y-r);j<=cellOf(y+r);j++){var l=index.get(key(i,j));if(l)l.forEach(fn)}};
   var into=function(index,x0,y0,x1,y1,item){for(var i=cellOf(Math.min(x0,x1));i<=cellOf(Math.max(x0,x1));i++)for(var j=cellOf(Math.min(y0,y1));j<=cellOf(Math.max(y0,y1));j++){var k=key(i,j);(index.get(k)||index.set(k,[]).get(k)).push(item)}};
   var nodeCells=new Map(),colCells=new Map(),lineCells=new Map();
   cols.forEach(function(k){into(colCells,number(k.x),number(k.y),number(k.x),number(k.y),k)});
   lines.forEach(function(o){var ax=number(o.x),ay=number(o.y),bx=number(o.x2),by=number(o.y2);if(Math.hypot(bx-ax,by-ay)<=60000)into(lineCells,ax-350,ay-350,bx+350,by+350,o);else lineCells.set("long",(lineCells.get("long")||[]).concat([o]))});
   var put=function(kind,x,y,z,c,role,tol){
    tol=tol||450;var best=null;
    near(nodeCells,x,y,tol,function(n){var d=Math.hypot(n.x-x,n.y-y,n.z-z);if(d<=tol&&(!best||d<best.d))best={d:d,n:n}});
    var n=best?best.n:null;
    if(!n){n={kind:kind,x:x,y:y,z:z,members:[]};list.push(n);into(nodeCells,x,y,x,y,n)}
    else if(kind==="base"||kind==="top"&&n.kind!=="base"||kind==="side"&&(n.kind==="beam"||n.kind==="joint"))n.kind=kind;
    if(!n.members.some(function(m){return m.c===c&&m.role===role}))n.members.push({c:c,role:role});
    return n
   };
   cols.forEach(function(c){put("base",number(c.x),number(c.y),number(c.z0),c,"низ",250);put("top",number(c.x),number(c.y),number(topOf(c)),c,"верх",250)});
   var onLine=function(x,y,z,self){
    var best=null,seen=new Set();
    var test=function(o){
     if(o===self||seen.has(o))return;seen.add(o);
     var a={x:number(o.x),y:number(o.y),z:number(o.z0)},b={x:number(o.x2),y:number(o.y2),z:number(o.z2)},ab={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},L=ab.x*ab.x+ab.y*ab.y+ab.z*ab.z;if(L<1)return;
     var t=((x-a.x)*ab.x+(y-a.y)*ab.y+(z-a.z)*ab.z)/L;if(t<.02||t>.98)return;
     var q={x:a.x+ab.x*t,y:a.y+ab.y*t,z:a.z+ab.z*t},d=Math.hypot(q.x-x,q.y-y,q.z-z);
     if(d<=350&&(!best||d<best.d))best={d:d,q:q,o:o}
    };
    near(lineCells,x,y,0,test);(lineCells.get("long")||[]).forEach(test);
    return best
   };
   lines.forEach(function(c){
    [[number(c.x),number(c.y),number(c.z0),"начало"],[number(c.x2),number(c.y2),number(c.z2),"конец"]].forEach(function(e){
     var x=e[0],y=e[1],z=e[2],col=null;
     near(colCells,x,y,800,function(k){var d=Math.hypot(number(k.x)-x,number(k.y)-y);if(d<=800&&z>=number(k.z0)-300&&z<=number(topOf(k))+600&&(!col||d<col.d))col={d:d,k:k}});
     if(col){
      var k=col.k,kt=number(topOf(k)),top=Math.abs(z-kt)<=450||seatTop.has(String(k.id))&&z>kt&&z-kt<=650;
      put(top?"top":"side",number(k.x),number(k.y),top?kt:z,c,e[3],top?500:450);
      if(!top)put("side",number(k.x),number(k.y),z,k,"примыкание",450);
      return
     }
     var on=onLine(x,y,z,c);
     if(on){put("beam",on.q.x,on.q.y,on.q.z,c,e[3]);put("beam",on.q.x,on.q.y,on.q.z,on.o,"опора",450);return}
     put("joint",x,y,z,c,e[3])
    })
   });
   // A joint of one member's own end alone is not a node.
   return list.filter(function(n){return n.kind==="base"||n.kind==="top"||n.members.length>1}).map(function(n,i){n.id="У-"+String(i+1).padStart(4,"0");n.status=statusOf(n.members);return n})
  }
  function clearNodes(){
   clearExplode();
   nodeMeshes.forEach(function(m){helpers.remove(m)});nodeMeshes=[];
   details.forEach(function(d){detailGroup.remove(d.group)});details=[]
  }
  var nodeGeo=new T.OctahedronGeometry(.1,0);
  function buildNodes(){
   clearNodes();nodes=computeNodes();
   nodes.forEach(function(n){
    var mesh=new T.Mesh(nodeGeo,nodeMaterial(n.status));
    mesh.position.copy(toWorld(n.x,n.y,n.z));mesh.renderOrder=6;mesh.userData.node=n;
    helpers.add(mesh);nodeMeshes.push(mesh);n.mesh=mesh;
    var d=nodeDetail(n);if(d){detailGroup.add(d);details.push({group:d,node:n})}
   });
   if(selectedNode)selectedNode=nodes.find(function(n){return Math.hypot(n.x-selectedNode.x,n.y-selectedNode.y,n.z-selectedNode.z)<300})||null;
   paintNode()
  }
  function nodeDetail(n){
   if(n.kind!=="base"&&n.kind!=="top")return null;
   var col=n.members.find(function(m){return m.c.geometryType==="column"});if(!col)return null;
   var sec=sectionOf(col.c.profile_name||col.c.profileName,col.c.profile_standard),bw=sec?sec.b/1000:.36,hh=sec?sec.h/1000:.4,g=new T.Group();
   var at=toWorld(n.x,n.y,n.z);g.position.copy(at);
   if(n.kind==="base"){
    // Anchors as the base sheet gives them (number and diameter); without it four conditional ones. The plate itself is
    // drawn with the frame (seen from any distance), see baseParts.
    var bs=baseSize(col.c),cnt=bs.cnt,dia=bs.dia,side=bs.side,step=bs.step,pd=bs.pd;
    for(var i=0;i<cnt;i++){
     var row=i<side?-1:1,k=row<0?i:i-side,inRow=row<0?side:cnt-side,ax=inRow>1?-(inRow-1)*step/2+k*step:0,az=row*(pd/2-Math.max(.05,dia*1.5));
     // (in the holes of the plate its sheet draws)
     if(bs.holes){ax=bs.holes[i].x;az=bs.holes[i].z}
     var rod=new T.Mesh(shared("rod:"+dia,function(){return new T.CylinderGeometry(dia/2,dia/2,.1+dia*2,10)}),boltMat);rod.position.set(ax,(.1+dia*2)/2-.02,az);rod.userData.anchor="rod";g.add(rod);
     var nut=new T.Mesh(shared("nut:"+dia,function(){return new T.CylinderGeometry(dia*.92,dia*.92,dia*.8,6)}),boltMat);nut.position.set(ax,dia*.4,az);nut.userData.anchor="nut";g.add(nut)
    }
    // Ribs of the base on both flanges.
    [-1,1].forEach(function(q){var rib=new T.Mesh(shared("rib",function(){return new T.BoxGeometry(.012,.22,.14)}),plateMat);rib.position.set(0,.11,q*(hh/2+.07));g.add(rib)})
   }else{
    // The cap plate: wider than the column under a beam lying on it; flush with the section where beams come to the
    // sides at the top (an overhang went into their ends).
    // (none where its sheet draws its own in a cut at the top, addCuts)
    var ov=seatTop.has(String(col.c.id))?.04:0;
    if(!endCuts(col.c).some(function(e){return e.end===1})){var cap=new T.Mesh(shared("cap:"+bw+":"+hh+":"+ov,function(){return new T.BoxGeometry(bw+ov,.02,hh+ov)}),plateMat);cap.position.y=.01;g.add(cap)}
   }
   g.userData.detail=true;g.children.forEach(function(m){m.userData.memberId=String(col.c.id)});
   return g
  }
  // By default only the nodes of the selected member are marked (all of them at once hid the frame behind markers).
  function nodeVisible(n,cam){
   if(nodeMode==="off")return false;
   if(nodeMode==="sel")return Boolean(selected)&&n.members.some(function(m){return String(m.c.id)===selected});
   if(nodeMode==="open"&&n.status==="mounted")return false;
   return n.kind==="base"||n.kind==="top"||n.mesh.position.distanceTo(cam)<60
  }
  function paintNodesFrame(){
   var cam=camera.position;
   // Markers keep about the same size on the screen: small close up, still seen from afar.
   nodeMeshes.forEach(function(m){var n=m.userData.node;m.visible=!explode&&(nodeVisible(n,cam)||n===selectedNode);
    if(m.visible){var k=Math.max(.35,Math.min(6,m.position.distanceTo(cam)*.045))*(n===selectedNode?1.6:1)*Math.min(1.5,.85+n.members.length*.08);m.scale.set(k,k,k)}});
   details.forEach(function(d){d.group.visible=showDetails&&d.group.position.distanceTo(cam)<45})
  }
  function hitNode(){
   var hits=raycaster.intersectObjects(nodeMeshes.filter(function(m){return m.visible}),false);
   return hits[0]?hits[0].object.userData.node:null
  }
  var nodePanel;
  function axisOf(x,y){var ax=nearestAxis(axesX,gridX,x),ay=nearestAxis(axesY,gridY,y),dx=Math.round(x-number(gridX[ax])),dy=Math.round(y-number(gridY[ay]));
   return ax+"/"+ay+(dx||dy?" ("+(dx>0?"+":"")+fmt(dx)+"; "+(dy>0?"+":"")+fmt(dy)+")":"")}
  function level(z){var v=number(z)/1000;return(v>0?"+":v<0?"−":"")+Math.abs(v).toFixed(3).replace(".",",")}
  function paintNode(){
   if(!nodePanel)return;
   var n=selectedNode;if(explode&&explode.node!==n)clearExplode();nodePanel.hidden=!n;if(!n)return;
   var st={mounted:"смонтирован",partial:"частично",planned:"не смонтирован"},missing=n.members.filter(function(m){return m.c.status!=="mounted"});
   var names=n.members.filter(function(m){return m.c.geometryType==="column"}).map(function(m){return m.c.mark}).filter(Boolean);
   nodePanel.innerHTML='<div class="ir-three-place-head"><b>'+escapeHtml(n.id+" · "+nodeKinds[n.kind]+(names.length?" "+names[0]:""))+'</b><button type="button" data-node="close" title="Закрыть">×</button></div>'+
    '<div class="ir-three-node-meta"><span>Оси <b>'+escapeHtml(axisOf(n.x,n.y))+'</b></span><span>Отм. <b>'+level(n.z)+'</b></span><span class="st '+n.status+'">'+st[n.status]+'</span></div>'+
    '<label class="ir-three-node-explode" title="Элементы узла расходятся с того, на чём держатся; болты и гайки — в зазоре по своей оси; остальная схема бледнеет. Схема при этом не меняется.">Разбор узла'+
    '<input type="range" min="0" max="100" step="1" value="'+Math.round((explode&&explode.node===n?explode.s:0)*100)+'" data-node="explode" aria-label="Разбор узла"></label>'+
    '<div class="ir-three-node-list">'+n.members.map(function(m){
     var ms=m.c.status==="mounted"?"mounted":m.c.status==="partial"?"partial":"planned";
     return '<button type="button" data-node-member="'+escapeHtml(m.c.id)+'"><i class="'+ms+'"></i><b>'+escapeHtml(m.c.mark||m.c.title||"—")+'</b><span>'+escapeHtml((m.c.type_name||kindNames[m.c.geometryType]||"")+" · "+m.role)+'</span><small>'+escapeHtml(m.c.profile_name||"")+'</small></button>'
    }).join("")+'</div>'+
    jointHtml(n)+typeHtml(n)+
    (missing.length?'<p class="ir-three-node-wait">Ждёт монтажа: <b>'+escapeHtml([...new Set(missing.map(function(m){return m.c.mark||"—"}))].join(", "))+'</b></p>':'<p class="ir-three-node-ok">Все элементы узла смонтированы.</p>')+
    baseHtml(n)+
    (n.kind==="base"||n.kind==="top"?'<p class="ir-three-place-note">'+(n.kind==="top"?(n.members.some(function(m){return m.c.geometryType==="column"&&seatTop.has(String(m.c.id))})?
     "Опирание сверху: балка лежит на плите оголовка колонны, нижний пояс на болтах к плите, над опорой — пара опорных рёбер. Плита (t=20), рёбра и места болтов показаны условно — по узлам КМД.":
     "Плита оголовка показана условно — размеры не из КМД."):
     (baseOf(n)&&baseOf(n).anchors?"Число и диаметр анкеров — с листа базы; плита и рёбра показаны условно.":"Плита и анкеры на модели показаны условно — размеры не из КМД.")+
     (n.z<=300?" Фундамент под базой — условно, по КЖ.":""))+'</p>':"");
   nodePanel.querySelector('[data-node="close"]').onclick=function(){selectedNode=null;paintNode()};
   nodePanel.querySelectorAll("[data-node-member]").forEach(function(b){b.onclick=function(){choose(b.dataset.nodeMember)}});
   var range=nodePanel.querySelector('[data-node="explode"]');range.oninput=function(){setExplode(n,number(range.value)/100)}
  }
  // How the members of the node are joined, as the notes of their sheets say (bolts, their class, mounting welds).
  function jointHtml(n){
   var seen=new Map();n.members.forEach(function(m){var j=m.c.joint;if(j&&j.text){var k=j.text+"|"+(j.sheet||"");if(!seen.has(k))seen.set(k,{j:j,marks:[]});seen.get(k).marks.push(m.c.mark||"—")}});
   if(!seen.size)return'<p class="ir-three-place-note">Соединение: на листах элементов болты не указаны — смотрите узлы КМД.</p>';
   return'<div class="ir-three-node-base"><b>Соединение</b>'+[...seen.values()].map(function(x){
    return'<span>'+escapeHtml([...new Set(x.marks)].join(", ")+": "+x.j.text)+'</span>'+(x.j.sheet?'<small>'+escapeHtml("по указаниям "+x.j.sheet)+'</small>':"")+boltHtml(x.j)}).join("")+
    '<em>Число и места болтов на модели условные — по узлам КМД; комплект болта — по ГОСТ. Болты связей на фасонках стоят по наименьшим расстояниям СП 16.13330 (табл. 40): от торца 2,5d, шаг 3d.'+
    (n.members.some(function(m){return m.c.joint&&m.c.joint.gusset_mm})?"":" Фасонки показаны толщиной 12 мм условно — на листах толщина фасонок не указана.")+'</em></div>'
  }
  // The type of the node by the catalog of 1000 joints: chosen by what meets there (a column base, a beam end at a
  // column or on a beam, a joint of members), the nodes the sheets name first. Only a hint: the scheme is not changed.
  function nodeQuery(n){
   var named=[],seen=new Set(),bolted=false,hsb=false;
   n.members.forEach(function(m){var j=m.c.joint;if(!j)return;if(j.bolt)bolted=true;if(/высокопр|фрикц/i.test(j.text||""))hsb=true;
    (j.named||[]).forEach(function(x){var k=x.label+"|"+x.title;if(!seen.has(k)){seen.add(k);named.push(x)}})});
   var b=n.kind==="base"?baseOf(n):null;
   return{kind:n.kind,anchors:b&&b.anchors&&number(b.anchors.count)||0,named:named,bolted:bolted,hsb:hsb,
    members:n.members.map(function(m){return{geometry:m.c.geometryType,group:m.c.scheme_group||m.c.schemeGroup||"",name:m.c.mark_name||m.c.type_name||"",mark:m.c.mark||"",role:m.role}})}
  }
  function typeHtml(n){
   if(!jointKb)return"";
   var q=nodeQuery(n),k=jointKb.card(q);if(!k)return"";
   var cut=function(t,len){t=String(t||"");return t.length>len?t.slice(0,len-1)+"…":t};
   var list=function(title,items,max){items=(items||[]).filter(Boolean).slice(0,max);return items.length?'<small>'+escapeHtml(title+": "+items.map(function(x){return cut(x,200)}).join("; "))+'</small>':""};
   var named=q.named.filter(function(x){return x.group===k.group||(x.joints||[]).some(function(j){return j.group===k.group})});
   return'<div class="ir-three-node-base ir-three-node-type"><b>Тип узла по справочнику</b>'+
    '<span>'+escapeHtml(k.group+" · "+k.group_name)+': <b>'+escapeHtml(k.name)+'</b></span>'+
    (k.rows.length?'<small>'+escapeHtml("Ближайшие по перечню: "+k.rows.map(function(r){return r.code+" «"+cut(r.name,90)+"»"}).join("; "))+'</small>':"")+
    '<small>'+escapeHtml("Способ: "+k.method+"; работа узла: "+k.behaviour)+' · <i class="kb-st '+escapeHtml(k.status)+'">'+escapeHtml(k.status_text)+'</i></small>'+
    list("Состав",k.parts,4)+(k.drawing?'<small>'+escapeHtml("На чертеже: "+cut(k.drawing,220))+'</small>':"")+
    (k.placement?'<small>'+escapeHtml("Расстановка: "+cut(k.placement,220))+'</small>':"")+list("Правила",k.rules,3)+list("Нормы",k.norms,3)+
    (k.note?'<small>'+escapeHtml("Замечание: "+cut(k.note,220))+'</small>':"")+
    (named.length?'<small>'+escapeHtml("На листе: "+named.slice(0,3).map(function(x){var j=(x.joints||[])[0];return x.label+(x.title?" «"+x.title+"»":"")+(j?" — похоже на "+j.code+" «"+cut(j.name,80)+"»":"")}).join("; "))+'</small>':"")+
    (k.others.length?'<small>'+escapeHtml("Может быть и: "+k.others.slice(0,3).map(function(o){return o.name+" ("+o.status_text+")"}).join("; "))+'</small>':"")+
    '<em>Тип выбран по тому, какие элементы сходятся в узле; проверьте по узлу КМД. Справочник ничего не меняет в схеме.</em></div>'
  }
  // The bolt set drawn, with the sizes from the standards.
  function boltHtml(j){
   var m=/(\d{2})/.exec(String(j.bolt||""));if(!m)return"";var d=number(m[1]),set=boltSet(d),mm=function(v){return String(Math.round(v*10000)/10).replace(".",",")};
   if(!set)return'<small>'+escapeHtml("Размеров болта М"+d+" нет в базе — болт показан условно.")+'</small>';
   return'<small>'+escapeHtml("Болт М"+d+(j.cls?" кл. "+j.cls:"")+" ГОСТ 7798-70: головка S"+mm(set.S)+", высота "+mm(set.k)+"; шайба ГОСТ 11371-78 Ø"+mm(set.d2)+"×"+mm(set.s)+" под головку; 2 гайки ГОСТ 5915-70 S"+mm(set.nS)+"×"+mm(set.m)+
    ". Пружинная шайба ГОСТ 6402-70 под гайку не показана: её размеры в базе не подтверждены.")+'</small>'
  }
  function baseOf(n){var col=n.members.find(function(m){return m.c.geometryType==="column"&&m.c.base});return col?col.c.base:null}
  // The base of the column as the drawings give it: its mark on the base scheme, the anchors and the plate hole.
  function baseHtml(n){
   var b=n.kind==="base"?baseOf(n):null;if(!b)return"";
   var a=b.anchors||{},size=a.d_mm?"М"+a.d_mm+(a.length_mm?"×"+a.length_mm:""):"";
   return '<div class="ir-three-node-base"><b>База '+escapeHtml(b.mark||"")+'</b>'+
    (b.anchors?'<span>Анкерные болты: '+escapeHtml([a.count?a.count+" шт.":"",size,a.steel||""].filter(Boolean).join(" · "))+'</span>'+(a.designation?'<small>'+escapeHtml(a.designation)+'</small>':""):'<span>Лист базы не найден — анкеры не указаны</span>')+
    (b.plate_hole_mm?'<span>Отверстия в опорной плите ∅'+escapeHtml(b.plate_hole_mm)+' мм</span>':"")+
    (b.note?'<em>'+escapeHtml(b.note)+'</em>':"")+
    '<small>'+escapeHtml([b.scheme?"схема баз: "+b.scheme:"",b.sheet?"лист базы: "+b.sheet:""].filter(Boolean).join("; "))+'</small></div>'
  }
  // A crane's card: what the part is, that the crane is drawn conventionally, the runways it stands on.
  function hitCrane(){
   if(!equipment.visible||!equipment.children.length)return null;
   var h=raycaster.intersectObjects(equipment.children,false)[0];
   return h&&cranes[h.object.userData.crane]?{k:cranes[h.object.userData.crane],part:h.object.userData.part,d:h.distance}:null
  }
  function showCrane(hit){
   selectedNode=null;clearExplode();var k=hit.k,runs=k.runs.filter(Boolean);
   nodePanel.hidden=false;
   nodePanel.innerHTML='<div class="ir-three-place-head"><b>'+escapeHtml(craneKinds[k.kind]+" (условно)")+'</b><button type="button" data-node="close" title="Закрыть">×</button></div>'+
    '<div class="ir-three-node-meta">'+(hit.part?'<span>Часть: <b>'+escapeHtml(hit.part)+'</b></span>':"")+(k.kind!=="hoist"?'<span>Пролёт <b>'+(k.span/1000).toFixed(1).replace(".",",")+' м</b></span>':"")+'<span>'+k.on+' <b>'+level(k.z)+'</b></span></div>'+
    '<p class="ir-three-place-note">Крана в чертежах КМ нет — это оборудование. Программа рисует его условно на подкрановых путях, чтобы при монтаже был виден его габарит; размеры — не по паспорту крана. Скрыть краны — снимите «Детали».</p>'+
    (runs.length?'<div class="ir-three-node-list">'+runs.map(function(c){
     var ms=c.status==="mounted"?"mounted":c.status==="partial"?"partial":"planned";
     return '<button type="button" data-node-member="'+escapeHtml(c.id)+'"><i class="'+ms+'"></i><b>'+escapeHtml(c.mark||c.title||"—")+'</b><span>'+escapeHtml(c.mark_name||c.type_name||"путь крана")+'</span><small>'+escapeHtml(c.profile_name||c.profileName||"")+'</small></button>'
    }).join("")+'</div>':"");
   nodePanel.querySelector('[data-node="close"]').onclick=function(){nodePanel.hidden=true};
   nodePanel.querySelectorAll("[data-node-member]").forEach(function(b){b.onclick=function(){choose(b.dataset.nodeMember)}});
   paintNodesFrame();invalidate()
  }
  function chooseNode(n){
   selectedNode=n;paintNode();
   if(n){var c=toWorld(n.x,n.y,n.z),dir=camera.position.clone().sub(controls.target).normalize(),d=Math.min(camera.position.distanceTo(controls.target),14);
    flight={from:controls.target.clone(),to:c,camFrom:camera.position.clone(),camTo:c.clone().add(dir.multiplyScalar(d)),t:0,ms:850,st:performance.now()}}
  }
  // ---- Разбор узла (the engineer chose it from the report of 21.10.2026): the slider of the node's card moves the members
  // of the node apart. The member that carries the others (the column at its side or top, the beam under a beam's end)
  // stays; the others slide off it along their bolts, or along their own axis where no bolts are drawn, those lying on
  // a column's top up; at a base the column goes up off the anchors with its plate and ribs, the nuts of the anchors
  // half way. The bolts hang in the gap along their axes, their nuts nearer the carrying member; a gusset stays with
  // the member it is welded to. Every member is cut to 3 m about the node; the rest of the scheme turns pale meanwhile.
  // Only the picture moves: nothing changes in the scheme, and it is so in the exported file too.
  var explode=null,explodeGroup=new T.Group();scene.add(explodeGroup);
  function buildExplode(n){
   var C=toWorld(n.x,n.y,n.z),R=1.6,H=1.5,up=new T.Vector3(0,1,0),zero=new T.Vector3(),made=[],pieces=[],clips=new Map(),hosts=new Set(),movers=new Map(),hmax=.1;
   // Each member is cut to a box of 3 m about the node, moving with it: the node reads like its drawing, not as whole
   // beams 12 m long; the bolts are drawn whole.
   var clipFor=function(v){var k=v.x+","+v.y+","+v.z;if(!clips.has(k))clips.set(k,{v:v,mats:new Map(),planes:[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(function(a){return new T.Plane(new T.Vector3(a[0],a[1],a[2]),0)})});return clips.get(k)};
   var solid=function(m,clip){var k=clip?clip.mats:clips;if(!clip){if(!clips.bolt)clips.bolt=new Map();k=clips.bolt}
    if(!k.has(m)){var c=m.clone();if(clip)c.clippingPlanes=clip.planes;k.set(m,c);made.push(c)}return k.get(m)};
   var near=function(o){var g=o.geometry;if(!g.boundingBox)g.computeBoundingBox();return g.boundingBox.clone().applyMatrix4(o.matrixWorld).distanceToPoint(C)<=R};
   var add=function(geo,mat,matrix,v,clipped){var o=new T.Mesh(geo,solid(mat,clipped?clipFor(v):null));o.matrixAutoUpdate=false;o.matrix.copy(matrix);explodeGroup.add(o);pieces.push({o:o,base:matrix.clone(),v:v})};
   n.members.forEach(function(m){var id=String(m.c.id);if(n.kind!=="base"&&(m.role==="опора"||m.role==="примыкание"||n.kind==="top"&&m.c.geometryType==="column"))hosts.add(id);
    hmax=Math.max(hmax,halfSection(m.c).h*2)});
   var D=Math.max(.35,Math.min(1.2,.25+2*hmax)),bolts=boltList.filter(function(b){return b.at.distanceTo(C)<=R&&n.members.some(function(m){return String(m.c.id)===b.id})});
   n.members.forEach(function(m){
    var c=m.c,id=String(c.id);if(hosts.has(id)||movers.has(id))return;
    var p=memberPoints(c),a=p[0],b=p[p.length-1],away=a.distanceTo(C)<=b.distanceTo(C)?b.clone().sub(a):a.clone().sub(b);
    if(away.lengthSq()<1e-6)away.copy(up);away.normalize();
    var u=new T.Vector3();bolts.forEach(function(x){if(x.id===id)u.add(u.lengthSq()&&u.dot(x.axis)<0?x.axis.clone().negate():x.axis)});
    var dir=n.kind==="base"&&c.geometryType==="column"?up.clone():u.lengthSq()>1e-6?u.normalize().add(away.multiplyScalar(.5)):n.kind==="top"?up.clone().add(away.multiplyScalar(.5)):away;
    movers.set(id,dir.normalize().multiplyScalar(D))
   });
   steel.updateMatrixWorld(true);
   var done=new Set();
   n.members.forEach(function(m){var id=String(m.c.id);if(done.has(id))return;done.add(id);
    (meshesById.get(id)||[]).forEach(function(o){if(!o.visible||o.userData.footing||!near(o))return;
     add(o.geometry,o.material,o.matrixWorld,o.userData.gusset&&(hosts.size||n.kind!=="base")?zero:movers.get(id)||zero,true)})});
   var detail=details.find(function(d){return d.node===n});
   if(detail){detail.group.updateMatrixWorld(true);var col=n.members.find(function(m){return m.c.geometryType==="column"}),cv=col&&movers.get(String(col.c.id))||zero,nut=up.clone().multiplyScalar(D*.5);
    detail.group.children.forEach(function(o){add(o.geometry,o.material,o.matrixWorld,o.userData.anchor==="rod"?zero:o.userData.anchor==="nut"?nut:cv,o.userData.anchor!=="nut")})}
   bolts.forEach(function(b){var v=movers.get(b.id)||zero,mat=boltMats[b.cls];
    // In the gap between the member and what carries it: the nuts nearer the carrying member, the bolts nearer theirs.
    boltParts(b).forEach(function(x,i,all){add(x.geometry,mat,x.matrixWorld,all.length===5&&i>=3?v.clone().multiplyScalar(.3).sub(b.axis.clone().multiplyScalar(D*.15)):v.clone().multiplyScalar(.6),false)})});
   return{node:n,s:0,C:C,H:H,D:D,pieces:pieces,clips:clips,made:made,moved:movers.size}
  }
  // The rest of the scheme pale while the node is taken apart; its own colours come back after.
  var ghosted=null;
  function ghost(on){
   if(on&&!ghosted){ghosted=new Map();
    [batches,detailGroup,equipment].forEach(function(g){g.traverse(function(o){[].concat(o.material||[]).forEach(function(m){
     if(!ghosted.has(m)){ghosted.set(m,{t:m.transparent,o:m.opacity,d:m.depthWrite});m.transparent=true;m.opacity=Math.min(m.opacity,.08);m.depthWrite=false;m.needsUpdate=true}})})});
    overlay.visible=false}
   else if(!on&&ghosted){ghosted.forEach(function(v,m){m.transparent=v.t;m.opacity=v.o;m.depthWrite=v.d;m.needsUpdate=true});ghosted=null;overlay.visible=true}
   invalidate()
  }
  function setExplode(n,s){
   if(explode&&(explode.node!==n||!(s>0)))clearExplode();
   if(!n||!(s>0))return;
   if(!explode){
    explode=buildExplode(n);ghost(true);
    // The node in the middle of the view, near enough to see its bolts, looked at a little from above.
    var dir=camera.position.clone().sub(controls.target).normalize();if(dir.y<.35){dir.y=.35;dir.normalize()}
    flight={from:controls.target.clone(),to:explode.C.clone(),camFrom:camera.position.clone(),camTo:explode.C.clone().add(dir.multiplyScalar(Math.max(3.5,(explode.H+explode.D)*2.2))),t:0,ms:600,st:performance.now()}
   }
   explode.s=s;
   explode.pieces.forEach(function(p){var e=p.o.matrix.copy(p.base).elements;e[12]+=p.v.x*s;e[13]+=p.v.y*s;e[14]+=p.v.z*s});
   explode.clips.forEach(function(k){if(!k.planes)return;var c=explode.C.clone().add(k.v.clone().multiplyScalar(s)),h=explode.H;
    k.planes[0].constant=h-c.x;k.planes[1].constant=c.x+h;k.planes[2].constant=h-c.y;k.planes[3].constant=c.y+h;k.planes[4].constant=h-c.z;k.planes[5].constant=c.z+h});
   paintNodesFrame();invalidate(300)
  }
  function clearExplode(){
   if(!explode)return;
   explodeGroup.children.slice().forEach(function(o){explodeGroup.remove(o)});
   explode.made.forEach(function(m){m.dispose()});explode=null;ghost(false);paintNodesFrame()
  }
  // Members of a lattice ([u0, z0, u1, z1, role, profile, across] in mm) placed by `at(u, z, across)`: a member with a profile
  // of the sortament is drawn by its section (paired angles back to back), the rest by a thin bar.
  // A truss (byAxis) is given by the axes of its members: a pair of angles stands with its centre on the line, the top
  // chord with its horizontal legs on top (the purlins lie on them — КМ: прогон на верхнем поясе фермы), the other
  // members with them at the bottom. Drawn from the line up, the top chord went through the purlins lying on it. The
  // angles of a pair stand `gap` apart (the gusset between them).
  function drawMembers(c,members,at,plane,byAxis,gap){
   var up=new T.Vector3(0,1,0),parts=[],mat=baseMaterial(c);
   members.forEach(function(m){
    var p0=at(number(m[0]),number(m[1]),number(m[6])),p1=at(number(m[2]),number(m[3]),number(m[6])),v=p1.clone().sub(p0),len=v.length();if(len<.05)return;
    var dir=v.clone().normalize(),y=up.clone().sub(dir.clone().multiplyScalar(up.dot(dir)));if(y.lengthSq()<1e-6)y=plane.clone().sub(dir.clone().multiplyScalar(plane.dot(dir)));
    y.normalize();var x=new T.Vector3().crossVectors(y,dir).normalize();
    // «turn»: an I-section turned a quarter about its axis — its flanges across the plane of the truss (the post I35К1 of a
    // subtruss Фп1, the trusses bolted to its flanges from both sides: КМ1 л.17 узлы 3, 4).
    if(m[7]==="turn"){var tx=x;x=y;y=tx.clone().negate()}
    var basis=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,dir));
    var pr=String(m[5]||""),sec=pr?sectionOf(/^\d/.test(pr)?"∟"+pr:pr):null;
    var lift=0,down=false;
    var put=function(geo,mirror){var mesh=new T.Mesh(geo,mat);mesh.position.copy(p0).add(y.clone().multiplyScalar(lift)).add(x.clone().multiplyScalar((mirror?-1:1)*(number(gap)/2)));mesh.quaternion.copy(basis);mesh.scale.set(mirror?-1:1,down?-1:1,len);parts.push(mesh)};
    if(sec&&sec.shape==="angle"&&byAxis){var ca=angleAxis(sec)/1000;down=m[4]==="top";lift=down?ca:-ca}
    if(sec&&sec.shape==="angle"&&/^(?:2|\d)/.test(pr)){var g=realGeometry(T,meshGeo,sec);put(g,false);put(g,true)}
    else if(sec)put(realGeometry(T,meshGeo,sec),false);
    else{var key="truss-bar",bar=meshGeo.get(key);if(!bar){bar=new T.BoxGeometry(.08,.08,1);bar.translate(0,0,.5);meshGeo.set(key,bar)}put(bar,false)}
   });
   return parts
  }
  // A two-branch column: branches, upper part and the lattice on both faces of the branches, from its point and base.
  function addColumnLattice(c,id){
   var k=c.column,d=k.dir||[0,1],ux=number(d[0]),uy=number(d[1]),x0=number(c.x),y0=number(c.y),z0=number(c.z0);
   var at=function(u,z,w){return toWorld(x0+ux*u-uy*(w||0),y0+uy*u+ux*(w||0),z0+z)};
   var parts=drawMembers(c,k.members,at,at(1000,0).sub(at(0,0)).normalize());
   if(!parts.length)return false;
   parts.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
   var lab=toWorld(x0,y0,number(c.z2)||z0);lab.y+=.35;
   var el=document.createElement("span");el.className="ir-three-member-label";el.textContent=c.mark||c.title||"";
   labelLayer.appendChild(el);labels.push({el:el,pos:lab,id:id});
   return true
  }
  // A truss by its geometric scheme: chords, posts and diagonals in the plane of the truss over its plan line, from the
  // bottom node of its left support (the scheme's left end may be the plan line's end). A member with a profile of the
  // sortament («140х10» of paired angles) is drawn by two angles back to back; the rest — by a thin bar.
  function keepPart(mesh,id){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)}
  // A plate as a box: its middle, its axes (unit vectors) and its sizes along them (m).
  function plateBox(c,at,ax,ay,az,sx,sy,sz){
   var m=new T.Mesh(shared("gusset",function(){return new T.BoxGeometry(1,1,1)}),baseMaterial(c));
   m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(ax,ay,az));m.scale.set(sx,sy,sz);m.position.copy(at);return m
  }
  function boltMm(v,c){var m=/(\d{2})/.exec(String(v||c&&c.joint&&c.joint.bolt||""));return m?number(m[1]):0}
  // The column a truss end is bolted to sideways (a КМ1: «фермы к колоннам каркаса примыкают сбоку и крепятся
  // болтами, в уровне нижнего пояса опорная реакция передаётся через опорный столик, в уровне верхнего пояса — вертикальная
  // листовая фасонка»): the end in the plan of the column, the column higher than the bottom chord there by 300 and more
  // (a truss lying on the top of a column is not this). `u` — into the span; face — mm from the end along u to the face.
  function trussSeat(e,u,zBottom){
   var best=null;
   elems.forEach(function(k){
    if(k.geometryType!=="column"||k.ft||!k.id||k.column&&Array.isArray(k.column.members)&&k.column.members.length)return;
    var hs=halfSection(k),hx=hs.b*1000,hy=hs.h*1000,dx=e.x-number(k.x),dy=e.y-number(k.y);
    if(Math.abs(dx)>hx+60||Math.abs(dy)>hy+60||zBottom<number(k.z0)||zBottom>number(topOf(k))-300)return;
    var face=Math.abs(u.x)*hx+Math.abs(u.y)*hy-(dx*u.x+dy*u.y);
    if(face>0&&face<1500&&(!best||face>best.face))best={k:k,face:face}
   });
   // A post of another truss across the end — the post I35К1 of a subtruss Фп1 with the plates t30 on its flanges (КМ1
   // л.17 узлы 3, 4: the trusses Фс3 bolted to it from both sides): its faces as it is turned, its flange and plate under
   // the bolts.
   elems.forEach(function(k){
    var tr=k.truss;if(!k.id||!tr||!Array.isArray(tr.members))return;
    var a0={x:number(k.x),y:number(k.y)},b0={x:number(k.x2),y:number(k.y2)};if(tr.flip){var q=a0;a0=b0;b0=q}
    var L=Math.hypot(b0.x-a0.x,b0.y-a0.y),kk=L/(number(tr.span_mm)||L),vx=(b0.x-a0.x)/(L||1),vy=(b0.y-a0.y)/(L||1),base=number(tr.base_mm);if(L<500)return;
    var pad=Array.isArray(tr.post_pad_mm)?number(tr.post_pad_mm[0]):0;
    tr.members.forEach(function(m){
     if(m[4]!=="post"||number(m[0])!==number(m[2]))return;
     var sec=sectionOf(String(m[5]||""));if(!sec||sec.shape!=="ibeam")return;
     var lo=base+Math.min(number(m[1]),number(m[3])),hi=base+Math.max(number(m[1]),number(m[3]));if(zBottom<lo||zBottom>hi-300)return;
     var turn=m[7]==="turn",ha=(turn?sec.b:sec.h)/2+(turn?0:pad),hn=(turn?sec.h:sec.b)/2+(turn?pad:0);
     var dx=e.x-(a0.x+vx*number(m[0])*kk),dy=e.y-(a0.y+vy*number(m[0])*kk),da=dx*vx+dy*vy,dn=-dx*vy+dy*vx;
     if(Math.abs(da)>ha+60||Math.abs(dn)>hn+60)return;
     var ua=u.x*vx+u.y*vy,un=-u.x*vy+u.y*vx,face=Math.abs(ua)*ha+Math.abs(un)*hn-(dx*u.x+dy*u.y);
     if(face>0&&face<1500&&(!best||face>best.face))best={k:k,face:face,tc:number(sec.t)+(Math.abs(un)>Math.abs(ua)===turn?pad:0)}
    })
   });
   return best
  }
  // The support node of a truss end at a column side, as the node of its sheet gives it (truss.support: КМ1 л.18 узел 6,
  // л.16 разрезы 1-1, 2-2 of a КМ1), else conventional: the flange of the truss end (опорное ребро, t25 × 220 × 700)
  // bolted to the flange of the column in two rows; under it the support table (столик t40 × 200 × 300) welded to the
  // column; at the top chord the vertical gusset of the truss bolted to a rib of the column (t10, two bolts). The truss
  // parts are of the truss, the table and the rib of the column. `xe` — where the members start (local mm), `s` — +1 at
  // the start, −1 at the end; ex — along the span, nrm — across.
  function trussSupport(c,id,seat,xe,s,members,at,ex,nrm,sp){
   var col=seat.k,cid=String(col.id);
   var mm=function(v,i,d){var x=Array.isArray(v)?number(v[i]):0;return x>0?x:d};
   var tF=mm(sp.flange_mm,0,20),wF=mm(sp.flange_mm,1,200),hF=mm(sp.flange_mm,2,600),tT=mm(sp.table_mm,0,30),wT=mm(sp.table_mm,1,200),hT=mm(sp.table_mm,2,200);
   var zb=number(chordAt(members,"bottom",xe)),zt=chordAt(members,"top",xe),fTop=zb+(number(sp.flange_top_mm)||hF-150),face=xe-s*tF;
   // The top of the flange over the support elevation of the truss (its bottom chord at the end, the mark of the node:
   // КМ1 л.17 узел 4 — 505 over +18,990), when the node gives it so.
   if(number(sp.rib_top_mm))fTop=number(chordAt(c.truss.members,"bottom",s>0?0:number(c.truss.span_mm)))+number(sp.rib_top_mm);
   var up=new T.Vector3(0,1,0),place=function(x,z,across){return at(x,z).add(nrm.clone().multiplyScalar((across||0)/1000))};
   keepPart(plateBox(c,place(face+s*tF/2,fTop-hF/2),ex,up,nrm,tF/1000,hF/1000,wF/1000),id);
   keepPart(plateBox(col,place(face+s*tT/2,fTop-hF-hT/2),ex,up,nrm,tT/1000,hT/1000,wT/1000),cid);
   // Bolts through the flange and the flange of the column: by the chain of the sheet from the top of the flange.
   // (their class as the node gives it: «М24 кл. 8.8» of the support, not of the members)
   var csec=sectionOf(col.profile_name||col.profileName,col.profile_standard),tc=seat.tc||(csec&&csec.t?csec.t:20),d=boltMm(sp.bolt,c),bc={id:c.id,joint:{cls:sp.cls||c.joint&&c.joint.cls}};
   var rows=Array.isArray(sp.bolts_mm)&&sp.bolts_mm.length?sp.bolts_mm.map(number):[],gap=number(sp.bolt_gap_mm)||Math.max(80,wF-80);
   if(!rows.length)for(var r=70;r<=hF-70;r+=Math.max(100,(hF-140)/3))rows.push(r);
   if(d)rows.forEach(function(r){[-1,1].forEach(function(j){addBolt(bc,place(face+s*(tF-tc)/2,fTop-r,j*gap/2),ex.clone().multiplyScalar(s),d/1000,(tF+tc)/1000)})});
   // The top chord: the vertical gusset of the truss to the face, over the rib of the column, two bolts across.
   if(zt===null)return;
   var tp=sp.top&&typeof sp.top==="object"?sp.top:{},gt=trussGussetT(c)*1000,tR=mm(tp.rib_mm,0,10),out=mm(tp.rib_mm,1,250),hR=mm(tp.rib_mm,2,300),dt=boltMm(tp.bolt||sp.bolt,c);
   keepPart(plateBox(c,place(face+s*(out+100)/2,zt-hR/2+20),ex,up,nrm,(out+100)/1000,(hR+40)/1000,gt/1000),id);
   keepPart(plateBox(col,place(face+s*out/2,zt-hR/2,(gt+tR)/2),ex,up,nrm,out/1000,hR/1000,tR/1000),cid);
   // Its two bolts from the top of the rib and from the face as the node gives them (top.bolts_mm, top.bolt_out_mm).
   var tb=Array.isArray(tp.bolts_mm)&&tp.bolts_mm.length?tp.bolts_mm.map(number):[hR*.28,hR*.72],bo=number(tp.bolt_out_mm)||out*.6;
   if(dt)tb.forEach(function(r){addBolt(bc,place(face+s*bo,zt-r,tR/2-gt/2),nrm,dt/1000,(gt+tR)/1000)})
  }
  function addTruss(c,id){
   var t=c.truss,a={x:number(c.x),y:number(c.y)},b={x:number(c.x2),y:number(c.y2)};
   if(t.flip){var q=a;a=b;b=q}
   var L=Math.hypot(b.x-a.x,b.y-a.y),span=number(t.span_mm)||L;if(L<500)return false;
   var ux=(b.x-a.x)/L,uy=(b.y-a.y)/L,k=L/span,base=number(t.base_mm);
   var at=function(x,z){return toWorld(a.x+ux*x*k,a.y+uy*x*k,base+z)};
   // An end at a column side: the truss between the faces, its support node there (trussSupport).
   // truss.supports — the nodes of its two ends when they differ (Фс3: КМ1 л.17 узел 4 at Фп1 of the outer row, узел 3
   // at Фп1 of the middle one), else truss.support for both.
   var spec=function(i){var o=Array.isArray(t.supports)&&t.supports[i]&&typeof t.supports[i]==="object"?t.supports[i]:t.support;return o&&typeof o==="object"?o:{}};
   var tFa=number(Array.isArray(spec(0).flange_mm)&&spec(0).flange_mm[0])||20,tFb=number(Array.isArray(spec(1).flange_mm)&&spec(1).flange_mm[0])||20;
   var ends=[trussSeat(a,{x:ux,y:uy},base+number(chordAt(t.members,"bottom",0))),trussSeat(b,{x:-ux,y:-uy},base+number(chordAt(t.members,"bottom",span)))];
   var xa=ends[0]?(ends[0].face+tFa)/k:0,xb=ends[1]?span-(ends[1].face+tFb)/k:span;
   var members=ends[0]||ends[1]?clipTruss(t.members,xa,xb):t.members;
   var gt=trussGussetT(c),nodes=trussNodes(members,sectionOf);
   var parts=drawMembers(c,nodes.members,at,at(1000,0).sub(at(0,0)).normalize(),true,gt);
   if(!parts.length)return false;
   // The gussets of its nodes in the plane of the truss, between the angles of the pairs.
   var o=at(0,0),ex=at(1000,0).sub(o),ez=at(0,1000).sub(o),nrm=new T.Vector3().crossVectors(ex.clone().normalize(),ez).normalize();
   var place=new T.Matrix4().makeBasis(ex,ez,nrm).setPosition(o);
   nodes.gussets.forEach(function(g){
    if(g.length<3)return;var sh=new T.Shape();g.forEach(function(p,i){i?sh.lineTo(p[0]/1000,p[1]/1000):sh.moveTo(p[0]/1000,p[1]/1000)});sh.closePath();
    var geo=new T.ExtrudeGeometry(sh,{depth:gt,bevelEnabled:false});geo.translate(0,0,-gt/2);geo.applyMatrix4(place);
    var mesh=new T.Mesh(geo,baseMaterial(c));mesh.userData.gusset=true;parts.push(mesh)
   });
   parts.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
   ends.forEach(function(e,i){if(e)trussSupport(c,id,e,i?xb:xa,i?-1:1,members,at,ex.clone().normalize(),nrm,spec(i))});
   // The plates on the flanges of its turned posts (truss.post_pad_mm: t, length from the bottom of the post; КМ1 л.17 —
   // t30 С345 under the bolts of the trusses Фс3).
   var pad=Array.isArray(t.post_pad_mm)?t.post_pad_mm.map(number):null;
   if(pad&&pad[0]>0)t.members.forEach(function(m){
    var sec=m[7]==="turn"&&m[4]==="post"?sectionOf(String(m[5]||"")):null;if(!sec||sec.shape!=="ibeam")return;
    var z0=Math.min(number(m[1]),number(m[3])),hp=Math.min(pad[1]||Infinity,Math.abs(number(m[3])-number(m[1])));
    [-1,1].forEach(function(j){keepPart(plateBox(c,at(number(m[0]),z0+hp/2).add(nrm.clone().multiplyScalar(j*(sec.h/2+pad[0]/2)/1000)),ex.clone().normalize(),new T.Vector3(0,1,0),nrm,sec.b/1000,hp/1000,pad[0]/1000),id)})
   });
   var tops=t.members.filter(function(m){return m[4]==="top"}),hi=tops.length?Math.max.apply(null,tops.map(function(m){return Math.max(number(m[1]),number(m[3]))})):0;
   var lab=at(span/2,hi);lab.y+=.35;
   var el=document.createElement("span");el.className="ir-three-member-label";el.textContent=c.mark||c.title||"";
   labelLayer.appendChild(el);labels.push({el:el,pos:lab,id:id});
   return true
  }
  function addFitting(c,id,start,end){
   var dir=end.clone().sub(start),len=dir.length();dir.normalize();
   if(c.ft==="flight"||c.ft==="ladder"){addStair(c,id,start,end);return}
   // A railing along its line (a stair's, ГОСТ 23120: 1,0 m over the treads or the deck — c.fd its height): posts
   // upright no more than 1,2 m apart, the handrail and the middle rail along the line, sloping with a flight; a low
   // rail of the toe board on a level one.
   if(c.ft==="railing"){
    var rh=Math.max(.6,(number(c.fd)||1000)/1000),rmat=baseMaterial(c),rp=[],np=Math.max(1,Math.ceil(len/1.2)),lift=function(v,h){return v.clone().add(new T.Vector3(0,h,0))};
    var rbar=function(a,b,t){var v=b.clone().sub(a),L=v.length();if(L<.005)return;var m=new T.Mesh(barGeo(t),rmat);m.position.copy(a);m.scale.z=L;m.quaternion.setFromUnitVectors(zAxis,v.normalize());rp.push(m)};
    for(var ri=0;ri<=np;ri++){var rq=start.clone().lerp(end,ri/np);rbar(rq,lift(rq,rh),.04)}
    rbar(lift(start,rh),lift(end,rh),.05);rbar(lift(start,rh/2),lift(end,rh/2),.03);
    if(Math.abs(end.y-start.y)<.05)rbar(lift(start,.1),lift(end,.1),.02);
    rp.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
    var rl2=lift(start.clone().add(end).multiplyScalar(.5),rh+.3);
    var re=document.createElement("span");re.className="ir-three-member-label";re.textContent=c.mark||c.title||"";
    labelLayer.appendChild(re);labels.push({el:re,pos:rl2,id:id});
    return
   }
   // A deck of a landing or a platform: a flat grating of its width between the two points. A landing in the guard ring
   // of a shaft stair (lay.arc_r_mm, Ш1 of РВС-700: 680 out from the frame, 1800 wide) has the arc of the ring for its
   // outer edge: the ring is round the axis of the shaft, its radius less the depth of the landing behind the start.
   // The deck lies on its beams: its level is the top of the beams under it (src/ai-montage-plan.js) — drawn about it, it
   // went 20 mm into them. Round a column standing through it the grating is cut (deckCuts).
   if(c.ft==="deck"){
    var dw=Math.max(.3,(number(c.fd)||1000)/1000),arcR=c.lay&&number(c.lay.arc_r_mm)>0?number(c.lay.arc_r_mm)/1000:0,dg=null,dmat=baseMaterial(c);
    if(arcR>len&&arcR>=dw/2){
     var ds=new T.Shape(),back=arcR-len,dn=24;ds.moveTo(-dw/2,0);ds.lineTo(dw/2,0);
     for(var di=0;di<=dn;di++){var dx=dw/2-dw*di/dn;ds.lineTo(dx,Math.max(0,Math.sqrt(arcR*arcR-dx*dx)-back))}
     ds.closePath();dg=new T.ExtrudeGeometry(ds,{depth:.04,bevelEnabled:false});dg.rotateX(Math.PI/2);dg.translate(0,.04,0)
    }
    var dholes=dg?null:deckHoles.get(id),dside=new T.Vector3(dir.z,0,-dir.x).normalize(),dps=dholes?wallPieces(0,len,dw,dholes).map(function(r){
     var m=new T.Mesh(new T.BoxGeometry(r[3]-r[2],.04,r[1]-r[0]),dmat);m.position.copy(start).add(dir.clone().multiplyScalar((r[0]+r[1])/2)).add(dside.clone().multiplyScalar((r[2]+r[3])/2-dw/2));return m}):null;
    if(!dps){var dm=new T.Mesh(dg||new T.BoxGeometry(dw,.04,len),dmat);if(dg)dm.position.copy(start);else dm.position.copy(start).add(end).multiplyScalar(.5);dps=[dm]}
    dps.forEach(function(dm){if(!dg)dm.position.y+=.02;dm.rotation.y=Math.atan2(dir.x,dir.z);
     dm.userData.memberId=id;steel.add(dm);allMeshes.push(dm);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(dm)});
    var dl=start.clone().add(end).multiplyScalar(.5);dl.y+=.3;
    var de=document.createElement("span");de.className="ir-three-member-label";de.textContent=c.mark||c.title||"";
    labelLayer.appendChild(de);labels.push({el:de,pos:dl,id:id});
    return
   }
   if(c.ft==="window"||c.ft==="door"||c.ft==="gate"){addOpening(c,id,start,end);return}
   // A field of sandwich panels (АР): a wall one stands on its lower edge to its height, a roof one lies on the slope at
   // its width; a trim (нащельник, планка) — a thin bent strip of two shelves along its line.
   if(c.ft==="panel"||c.ft==="trim"){
    var up=new T.Vector3(0,1,0),xv=new T.Vector3().crossVectors(up,dir);if(xv.lengthSq()<1e-6)xv.set(1,0,0);xv.normalize();
    var yv=new T.Vector3().crossVectors(dir,xv).normalize(),q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(xv,yv,dir));
    var pm=[],put=function(geo,off){var m=new T.Mesh(geo,baseMaterial(c));m.quaternion.copy(q);m.position.copy(start).add(end).multiplyScalar(.5).add(off.applyQuaternion(q));pm.push(m)};
    var pt=Math.max(.04,(number(c.lay&&c.lay.thickness_mm)||120)/1000),pw=Math.max(.3,(number(c.fd)||1000)/1000);
    // Panels of a layout one by one, edge to edge: the lock of a sandwich panel leaves no gap (a gap of 12 mm between
    // them was seen through, the engineer 27.10.2026 «изучи шов между сэндвичами, там не должно быть просветов»); the
    // joint is a dark line on both faces (wallSeams). A wall panel under the slope of a lower roof is cut along it
    // (lay.cut: the heights of its lower edge at its start and end).
    var gl=len,cut=c.lay&&Array.isArray(c.lay.cut)&&c.lay.cut.length===2?c.lay.cut:null;
    // (a wall at a corner: run on to the outer face of the other or stopped at its inner face — panelCorners)
    var pe=c.ft==="panel"?panelExt.get(id):null,p0=pe?pe[0]:0;
    if(pe){start=start.clone().sub(dir.clone().multiplyScalar(pe[0]));end=end.clone().add(dir.clone().multiplyScalar(pe[1]));len+=pe[0]+pe[1];gl=len}
    var holed=c.ft==="panel"&&c.lay&&c.lay.panel==="wall"?(Array.isArray(c.lay.holes)?c.lay.holes.map(function(o){return[number(o[0])/1000,number(o[1])/1000,number(o[2])/1000,number(o[3])/1000]}):[]).concat(wallHoles.get(id)||[]).map(function(o){return[o[0]+p0,o[1]+p0,o[2],o[3]]}):[];
    if(!holed.length)holed=null;
    if(c.ft==="panel"&&c.lay&&c.lay.panel==="wall"&&cut){
     // Cut along a slope with holes over it (a window, a grille): the sloped strip whole, the rest in pieces round them.
     var z0=number(c.z0),ca=(number(cut[0])-z0)/1000,cb=(number(cut[1])-z0)/1000,top=holed?Math.min(pw,Math.max(ca,cb)):pw,sh=new T.Shape();
     sh.moveTo(-gl/2,ca);sh.lineTo(gl/2,cb);sh.lineTo(gl/2,top);sh.lineTo(-gl/2,top);sh.closePath();
     if(top-Math.min(ca,cb)>1e-4){var cg=new T.ExtrudeGeometry(sh,{depth:pt,bevelEnabled:false});cg.translate(0,0,-pt/2);cg.rotateY(-Math.PI/2);put(cg,new T.Vector3(0,0,0))}
     if(holed&&top<pw-1e-4){var jj=(len-gl)/2;
      wallPieces(jj,len-jj,pw-top,holed.map(function(o){return[o[0],o[1],o[2]-top,o[3]-top]})).forEach(function(r){put(new T.BoxGeometry(pt,r[3]-r[2],r[1]-r[0]),new T.Vector3(0,top+(r[2]+r[3])/2,(r[0]+r[1])/2-len/2))})}
    }
    // A panel the block of a window, a door or a gate crosses: in pieces round the hole (lay.holes, mm from its start
    // and its foot).
    else if(holed){
     var j=(len-gl)/2;
     wallPieces(j,len-j,pw,holed).forEach(function(r){put(new T.BoxGeometry(pt,r[3]-r[2],r[1]-r[0]),new T.Vector3(0,(r[2]+r[3])/2,(r[0]+r[1])/2-len/2))})
    }
    else if(c.ft==="panel"&&c.lay&&c.lay.panel==="wall")put(new T.BoxGeometry(pt,pw,gl),new T.Vector3(0,pw/2,0).applyQuaternion(q.clone().invert()));
    else if(c.ft==="panel")put(new T.BoxGeometry(pw,pt,gl),new T.Vector3(0,pt/2,0));
    else{var leg=Math.max(.04,Math.min(.4,(number(c.fd)||100)/1000));put(new T.BoxGeometry(leg,.008,len),new T.Vector3(leg/2,0,0));put(new T.BoxGeometry(.008,leg,len),new T.Vector3(0,leg/2,0))}
    if(c.ft==="panel"&&c.lay&&c.lay.panel==="wall"&&c.lay.width_mm)wallSeams(len,pw,cut?[(number(cut[0])-number(c.z0))/1000,(number(cut[1])-number(c.z0))/1000]:[0,0],holed||[]).forEach(function(r){
     var sm=new T.Mesh(shared("plate:box",function(){return new T.BoxGeometry(1,1,1)}),jointMat);sm.quaternion.copy(q);sm.scale.set(pt+.006,r[2]-r[1],.005);
     sm.position.copy(start).add(end).multiplyScalar(.5).add(new T.Vector3(0,(r[1]+r[2])/2,r[0]-len/2).applyQuaternion(q));sm.userData.fixed=true;sm.userData.small=true;pm.push(sm)});
    pm.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
    var pl=start.clone().add(end).multiplyScalar(.5);pl.y+=c.ft==="panel"&&c.lay&&c.lay.panel==="wall"?pw+.3:.3;
    var pe=document.createElement("span");pe.className="ir-three-member-label";pe.textContent=c.mark||c.title||"";
    labelLayer.appendChild(pe);labels.push({el:pe,pos:pl,id:id});
    return
   }
   var r=Math.max(.02,(number(c.fd)||159)/2000),type=c.ft,parts=[];
   var along=function(geo,at,lenZ){
    // geo is built along +Z from 0 to 1 (or centred when lenZ is 0): turned onto the fitting's axis at `at`.
    var mesh=new T.Mesh(geo,baseMaterial(c));mesh.position.copy(at);if(lenZ)mesh.scale.z=lenZ;
    mesh.quaternion.setFromUnitVectors(zAxis,dir);parts.push(mesh);return mesh
   };
   var tube=function(radius){var g=new T.CylinderGeometry(radius,radius,1,24,1,false);g.rotateX(Math.PI/2);g.translate(0,0,.5);return g};
   var disc=function(radius,thick){var g=new T.CylinderGeometry(radius,radius,thick,28);g.rotateX(Math.PI/2);return g};
   if(type==="rod"){along(tube(.02),start,len)}
   // Bolts of a joint: as many as the list gives, round the joint point — a shank and a hexagonal head.
   else if(type==="bolt"){
    var nb=Math.max(1,Math.min(24,number(c.lay&&c.lay.count)||2)),rb=Math.max(.006,(number(c.fd)||20)/2000);
    for(var k=0;k<nb;k++){var a=2*Math.PI*k/nb,o=new T.Vector3(Math.cos(a)*.07,0,Math.sin(a)*.07),at=start.clone().add(o);
     along(tube(rb),at,Math.max(.04,len));var hg=new T.CylinderGeometry(rb*1.8,rb*1.8,rb*1.4,6);hg.rotateX(Math.PI/2);along(hg,at.clone().add(dir.clone().multiplyScalar(Math.max(.04,len))),0)}
   }
   else if((type==="manhole"||type==="hatch")&&c.lay&&Array.isArray(c.lay.oval_mm)&&c.lay.oval_mm.length===2){
    // An oval manhole (lay.oval_mm — along the wall × up it, РВС-700 КМ-14 «Люк-лаз овальный 600х900»; the engineer,
    // 27.10.2026: «почему люк показывается как круглый? если он овальный»): its shell 20 into the tank, the flange and the
    // cover of the same rounded shape (lay.shell_mm, lay.flange_mm — the outer sizes of the sheet; without them 17 mm of
    // the shell and 62 of the flange, as on КМ-14), two handles 80 out on the cover, the hinge at its end.
    var mm=function(v,d){return Array.isArray(v)&&v.length===2&&number(v[0])>0&&number(v[1])>0?[number(v[0])/1000,number(v[1])/1000]:d};
    var ov=mm(c.lay.oval_mm,[.9,.6]),so=mm(c.lay.shell_mm,[ov[0]+.034,ov[1]+.034]),fo=mm(c.lay.flange_mm,[so[0]+.124,so[1]+.124]);
    var stadium=function(w,h){var p=new T.Shape(),rr=Math.min(w,h)/2,hx=Math.max(0,w/2-rr);p.moveTo(-hx,-rr);p.lineTo(hx,-rr);
     p.absarc(hx,0,rr,-Math.PI/2,Math.PI/2,false);p.lineTo(-hx,rr);p.absarc(-hx,0,rr,Math.PI/2,Math.PI*1.5,false);return p};
    var slab=function(w,h,iw,ih,depth,from){var p=stadium(w,h);if(iw>0)p.holes.push(stadium(iw,ih));
     var g=new T.ExtrudeGeometry(p,{depth:depth,bevelEnabled:false,curveSegments:14});g.translate(0,0,from||0);return g};
    along(slab(so[0],so[1],ov[0],ov[1],1),start.clone().sub(dir.clone().multiplyScalar(.02)),len+.02);
    along(slab(fo[0],fo[1],so[0],so[1],.02,-.02),end,0);along(slab(fo[0],fo[1],0,0,.02,0),end,0);
    [-.2,.2].forEach(function(x){var g=new T.BoxGeometry(.02,.15,.02);g.translate(x,0,.1);along(g,end,0);
     [-.065,.065].forEach(function(y){var l=new T.BoxGeometry(.02,.02,.08);l.translate(x,y,.06);along(l,end,0)})});
    var hinge=new T.BoxGeometry(.06,Math.min(.5,fo[1]*.7),.06);hinge.translate(fo[0]/2+.03,0,-.01);along(hinge,end,0)
   }
   else{
    along(tube(r),start,len);
    // Flange at the outer end; hatches and manholes carry a cover over it.
    along(disc(r*1.3+.03,.03),end,0);
    if(type==="manhole"||type==="hatch")along(disc(r*1.25+.03,.05),end.clone().add(dir.clone().multiplyScalar(.04)),0);
    if(type==="valve"){var vb=new T.BoxGeometry(r*2.6,r*2.6,r*2.2);vb.translate(0,0,r*1.1);along(vb,end,0)}
    if(type==="foam"){var fb=new T.BoxGeometry(.45,.45,.7);fb.translate(0,0,.35);along(fb,end,0)}
    if(type==="sensor"){var sb=new T.BoxGeometry(r*2,r*2,r*1.6);sb.translate(0,0,r*.8);along(sb,end,0)}
   }
   parts.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);
    if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
   var top=end.clone();top.y+=.35;
   var el=document.createElement("span");el.className="ir-three-member-label";el.textContent=c.mark||c.title||"";
   labelLayer.appendChild(el);labels.push({el:el,pos:top,id:id})
  }
  // Windows, doors and gates of the АР in their walls (the engineer, 27.10.2026: «Окна и ворота сделай в 3д нормальное
  // отображение»): the block of its width along the wall and its height (c.fd) from its foot, as its scheme in the АР
  // draws it — lay.fields (the panes and sashes of a window), lay.joints (the leaves of a door or a gate), lay.wicket,
  // lay.panes (the glass of a door), mm from its start — else by its mark (ГОСТ 23166, 30970, 31173, 31174).
  // A window (PVC, 70 mm): the frame and the mullions round its fields, a sash in its own frame a little inside with its
  // handle inside at the side it opens from («ПОТ», «ПР»; «ОТ» — at the top), glass; the sill outside, the board inside.
  // A door: its frame, one or two leaves («Оп», «Дп»; the active one the wider) flush with the face it opens to («Н» —
  // outside, «Вн» — inside), hinged at the side its mark gives («Л», «Пр» — as seen from that face), handles on both
  // sides, a threshold («Прг», «П» of a PVC door), glass («О» of a PVC door). A gate («ВМ П Р С Г К»): two leaves on
  // their hinges outside («С») or inside («В») the opening, a wicket («К», «Кл», «Кпр») with its handle; a sectional
  // one («ПС») — its panels, the guides and the tracks inside.
  function addOpening(c,id,start,end){
   var lay=c.lay||{},name=String(c.mark_name||c.title||""),kind=c.ft,L=start.distanceTo(end);
   var tokens=name.replace(/[,;]/g," ").split(/[\s-]+/).filter(Boolean),has=function(t){return tokens.indexOf(t)>=0};
   var along=end.clone().sub(start);along.y=0;if(along.lengthSq()<1e-9||L<.05)return;along.normalize();
   var up=new T.Vector3(0,1,0),side=new T.Vector3().crossVectors(along,up).normalize();
   var foot=start.clone().add(end).multiplyScalar(.5),out;
   if(Array.isArray(lay.outside)&&lay.outside.length===2)out=toWorld(number(lay.outside[0])*1000,number(lay.outside[1])*1000,0).sub(toWorld(0,0,0));
   else out=foot.clone().sub(toWorld(spanX/2,spanY/2,0));
   // s — across the wall, outwards; x — along it from the middle; y — up from the foot.
   var sg=out.dot(side)<0?-1:1,q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(along,up,side));
   var H=Math.max(.3,(number(c.fd)||1500)/1000),t=Math.max(.05,(number(lay.thickness_mm)||150)/1000),mat=baseMaterial(c),parts=[];
   var box=function(a,h,d,x,y,s,m,small,tilt){
    var mesh=new T.Mesh(new T.BoxGeometry(Math.max(.002,a),Math.max(.002,h),Math.max(.002,d)),m||mat);mesh.quaternion.copy(q);
    if(tilt)mesh.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),tilt*sg));
    mesh.position.copy(foot).add(new T.Vector3(x,y,s*sg).applyQuaternion(q));
    if(m&&m!==mat)mesh.userData.fixed=true;if(small)mesh.userData.small=true;parts.push(mesh);return mesh
   };
   var pin=function(r,h,x,y,s,m){var g=new T.CylinderGeometry(r,r,h,10),mesh=new T.Mesh(g,m||hardwareMat);mesh.position.copy(foot).add(new T.Vector3(x,y,s*sg).applyQuaternion(q));mesh.userData.fixed=true;mesh.userData.small=true;parts.push(mesh)};
   var X=function(u){return u-L/2},mm=function(v){return number(v)/1000};
   // The side to the right of one standing on the face `face` (+1 outside, -1 inside) looking at the block: +1 — its end.
   var rightOf=function(face){var look=out.clone().multiplyScalar(-face),r=new T.Vector3().crossVectors(look,up);return r.dot(along)>=0?1:-1};
   // A frame or a leaf less its holes ([from, to along, from, to over the foot], m): its solid pieces.
   var solid=function(u0,u1,z0,z1,holes,d,s,m){
    var hs=holes.map(function(o){return[o[0]-u0,o[1]-u0,o[2]-z0,o[3]-z0]});
    wallPieces(0,u1-u0,z1-z0,hs).forEach(function(r){box(r[1]-r[0],r[3]-r[2],d,X(u0+(r[0]+r[1])/2),z0+(r[2]+r[3])/2,s,m)})
   };
   if(kind==="window"){
    var fw=.068,fd=.07,fields;
    if(Array.isArray(lay.fields)&&lay.fields.length)fields=lay.fields.map(function(f){return{u0:mm(f.u&&f.u[0]),u1:mm(f.u&&f.u[1]),z0:mm(f.z&&f.z[0]),z1:mm(f.z&&f.z[1]),sash:Boolean(f.sash||f.open),open:String(f.open||""),handle:String(f.handle||"")}}).filter(function(f){return f.u1-f.u0>.05&&f.z1-f.z0>.05});
    if(!fields||!fields.length){
     // By its mark («ОСвп-П-1160х3530-СП-К-ВП»): fields about 1,2 m wide; «К» — every other one opens.
     var how=(/-(ПОТ|ПР|ОТ|Н|К)(?=-|$)/.exec(name)||[])[1]||"",n=Math.max(1,Math.ceil(L/1.2-.1)),mw=.08,w=(L-2*fw-(n-1)*mw)/n;fields=[];
     for(var i=0;i<n;i++){var op=how==="К"?(i%2?"":"ПОТ"):how==="Н"?"":how;fields.push({u0:fw+i*(w+mw),u1:fw+i*(w+mw)+w,z0:fw,z1:H-fw,sash:Boolean(op),open:op,handle:op==="ОТ"?"top":i===n-1&&n>1?"start":"end"})}
    }
    solid(0,L,0,H,fields.map(function(f){return[f.u0,f.u1,f.z0,f.z1]}),fd,0);
    fields.forEach(function(f){
     var w=f.u1-f.u0,h=f.z1-f.z0,cx=X((f.u0+f.u1)/2),cy=(f.z0+f.z1)/2;
     if(!f.sash){
      // A pane in the frame, its glazing bead inside.
      box(w,h,.024,cx,cy,0,openingGlass);var gb=.02;
      box(w,gb,.02,cx,f.z1-gb/2,-.025);box(w,gb,.02,cx,f.z0+gb/2,-.025);box(gb,h-2*gb,.02,X(f.u0)+gb/2,cy,-.025);box(gb,h-2*gb,.02,X(f.u1)-gb/2,cy,-.025);
      return
     }
     var sw=Math.min(.075,w/4,h/4),sd=.078,si=-.012,e=.003;
     box(w-2*e,sw,sd,cx,f.z1-e-sw/2,si);box(w-2*e,sw,sd,cx,f.z0+e+sw/2,si);
     box(sw,h-2*e-2*sw,sd,X(f.u0)+e+sw/2,cy,si);box(sw,h-2*e-2*sw,sd,X(f.u1)-e-sw/2,cy,si);
     box(w-2*e-2*sw,h-2*e-2*sw,.024,cx,cy,si,openingGlass);
     if(!f.open)return;
     // Its handle inside: a plate and the lever down (across at the top of a tilting one).
     var face=si-sd/2,top=f.handle==="top",hx=f.handle==="start"?X(f.u0)+e+sw/2:f.handle==="end"?X(f.u1)-e-sw/2:cx,hy=top?f.z1-e-sw/2:f.handle==="bottom"?f.z0+e+sw/2:cy;
     box(top?.075:.03,top?.03:.075,.012,hx,hy,face-.006,mat,true);
     if(top)box(.12,.022,.02,hx+.05,hy,face-.022,mat,true);else box(.022,.12,.02,hx,hy-.05,face-.022,mat,true)
    });
    // The sill outside (its colour from the table of sills), the board inside (its depth from the table of boards).
    if(lay.sill_ral&&ralColor(String(lay.sill_ral))!==undefined){var sd2=t/2+.05-fd/2;box(L+.04,.003,sd2,0,-.012,fd/2+sd2/2,fixedMaterial(ralColor(String(lay.sill_ral))),false,.14)}
    if(number(lay.board_mm)>0){var bd=number(lay.board_mm)/1000;box(L+.04,.02,bd,0,-.01,fd/2-bd,fixedMaterial(0xf4f4f0))}
   }
   else if(kind==="door"){
    var pvc=/^Д[БП]/.test(tokens[1]||tokens[0]||"")||/ДБ[НВМ]/.test(name),df=.065,dd=pvc?.07:.09,lt=pvc?.07:.05;
    var face=has("Вн")?-1:1,sill=has("Прг")||pvc&&has("П"),glazed=pvc&&(has("О")||has("Км"));
    // Hinged at the left or the right of one standing on the face it opens to.
    var hingeEnd=(has("Л")?-1:1)*rightOf(face)>0,two=has("Дп"),inner=L-2*df,bottom=sill?.02:0;
    var cuts=Array.isArray(lay.joints)&&lay.joints.length?lay.joints.map(mm).filter(function(u){return u>df+.1&&u<L-df-.1}):[];
    if(!cuts.length&&two){var aw=inner<1.6?inner*.65:inner/2;cuts=[hingeEnd?L-df-aw:df+aw]}
    var edges=[df].concat(cuts,[L-df]),ls=face*(dd/2-lt/2);
    box(df,H,dd,X(df/2),H/2,0);box(df,H,dd,X(L-df/2),H/2,0);box(L-2*df,df,dd,0,H-df/2,0);
    if(sill)box(L-2*df,.02,dd,0,.01,0,hardwareMat);
    var leaves=[];for(var k=0;k+1<edges.length;k++)leaves.push([edges[k]+.002,edges[k+1]-.002]);
    // The active leaf: the wider (one — itself); hinged at its frame side, the handle at its free edge.
    var act=leaves.reduce(function(b,l,i){return l[1]-l[0]>leaves[b][1]-leaves[b][0]+.01?i:b},leaves.length===1?0:hingeEnd?leaves.length-1:0);
    var panes=Array.isArray(lay.panes)?lay.panes.map(function(p){return[mm(p[0]),mm(p[1]),mm(p[2]),mm(p[3])]}):[];
    leaves.forEach(function(l,i){
     var z0=bottom+.004,z1=H-df-.003,own=panes.filter(function(p){return p[0]>=l[0]-.01&&p[1]<=l[1]+.01});
     if(glazed&&!own.length)own=[[l[0]+.11,l[1]-.11,.12,z1-.11]];
     if(glazed){solid(l[0],l[1],z0,z1,own.map(function(p){return[Math.max(l[0],p[0]),Math.min(l[1],p[1]),Math.max(z0,p[2]),Math.min(z1,p[3])]}),lt,ls);own.forEach(function(p){box(p[1]-p[0],p[3]-p[2],.024,X((p[0]+p[1])/2),(p[2]+p[3])/2,ls,openingGlass)})}
     else box(l[1]-l[0],z1-z0,lt,X((l[0]+l[1])/2),(z0+z1)/2,ls);
     // Hinges on the face it opens to, at the side of the frame.
     var hingeAtEnd=leaves.length===1?hingeEnd:i===leaves.length-1,hx=X(hingeAtEnd?l[1]:l[0]),hs=face*(dd/2+.012);
     [.25,H-.35].concat(H>1.6?[(H-.1)/2]:[]).forEach(function(y){pin(.012,.12,hx,y,hs)});
     if(i!==act)return;
     var fx=X(hingeAtEnd?l[0]+.07:l[1]-.07),dir=hingeAtEnd?1:-1,m=pvc?silverMat:hardwareMat;
     [1,-1].forEach(function(f){var s=ls+f*(lt/2+.006);box(.045,.2,.012,fx,1.0,s,m,true);box(.13,.022,.022,fx+dir*.055,1.04,s+f*.03,m,true)})
    })
   }
   else{
    var sect=/подъ[её]мно|ПС\b|Пс\b/.test(name)||has("ПС"),mount=has("В")?-1:has("С")?1:0;
    var gf=.08,gd=.1,frameS=mount*(t/2-gd/2),lt2=.05,leafS=mount?mount*(t/2+lt2/2+.01):0;
    box(gf,H,gd,X(gf/2),H/2,frameS);box(gf,H,gd,X(L-gf/2),H/2,frameS);box(L-2*gf,gf,gd,0,H-gf/2,frameS);
    if(sect){
     // Sections across, their joints; the guides at the sides and the tracks under the roof inside.
     var ns=Math.max(4,Math.round(H/.55)),sh=(H-gf)/ns,si2=-(t/2+.04);
     for(var k=0;k<ns;k++)box(L-2*gf,sh-.006,.045,0,k*sh+sh/2,si2);
     [gf/2,L-gf/2].forEach(function(u){box(.07,H,.06,X(u),H/2,si2-.01);box(.06,.06,Math.min(H,4),X(u),H+.05,-(t/2+Math.min(H,4)/2),hardwareMat)});
     box(.3,.05,.03,0,.3,si2-.04,hardwareMat,true)
    }
    else{
     var cuts2=Array.isArray(lay.joints)&&lay.joints.length?lay.joints.map(mm).filter(function(u){return u>.3&&u<L-.3}):L>1.5?[L/2]:[];
     var ed=[0].concat(cuts2,[L]),wk=Array.isArray(lay.wicket)&&lay.wicket.length===4?lay.wicket.map(mm):null;
     if(!wk&&(has("К")||has("Кл")||has("Кпр"))&&ed.length>2){
      // Without its scheme: a wicket 900 × 2000 in the left leaf («Кпр» — the right one) as seen from outside, at its
      // meeting edge.
      var rightEnd=rightOf(1)>0,inRight=has("Кпр"),atEnd=inRight===rightEnd,mid=ed[1];
      wk=atEnd?[mid+.2,mid+1.1,.1,2.1]:[mid-1.1,mid-.2,.1,2.1]
     }
     for(var g=0;g+1<ed.length;g++){
      var a=ed[g]+(g?.004:0),b=ed[g+1]-(g+2<ed.length?.004:0),lw=b-a,cx=X((a+b)/2),own2=wk&&wk[0]>=a-.01&&wk[1]<=b+.01;
      // The leaf: its steel frame of tubes round the sheet; a wicket cut in it with its own frame.
      var holes=[[a+.06,b-.06,.06,H-.06]];
      solid(a,b,0,H,holes,lt2,leafS);
      solid(a+.06,b-.06,.06,H-.06,own2?[[wk[0],wk[1],wk[2],Math.min(H-.07,wk[3])]]:[],lt2*.5,leafS);
      if(own2){
       var wx0=wk[0],wx1=wk[1],wz0=wk[2],wz1=Math.min(H-.07,wk[3]),ww=wx1-wx0,wh=wz1-wz0;
       solid(wx0+.006,wx1-.006,wz0+.006,wz1-.006,[[wx0+.05,wx1-.05,wz0+.05,wz1-.05]],lt2,leafS);
       box(ww-.1,wh-.1,lt2*.5,X((wx0+wx1)/2),(wz0+wz1)/2,leafS);
       // Its handle at the edge toward the meeting of the leaves, its hinges at the other.
       var meetEnd=g===0,hxw=X(meetEnd?wx1-.07:wx0+.07),hinge=X(meetEnd?wx0+.01:wx1-.01);
       [1,-1].forEach(function(f){box(.04,.18,.012,hxw,1.0,leafS+f*(lt2/2+.006),hardwareMat,true);box(.12,.022,.022,hxw+(meetEnd?-.05:.05),1.03,leafS+f*(lt2/2+.03),hardwareMat,true)});
       [wz0+.25,wz1-.25].forEach(function(y){pin(.012,.12,hinge,y,leafS+(mount||1)*(lt2/2+.012))})
      }
      // Hinges at the outer edge of the leaf, on the face it hangs on.
      var hx2=X(g===0?a+.02:b-.02),hs2=(mount||1)*(Math.abs(leafS)+lt2/2+.02);
      [.4,H-.5].concat(H>2.2?[H/2]:[]).forEach(function(y){pin(.022,.16,hx2,y,hs2)})
     }
     // The handles at the meeting of the leaves, a vertical bar on each face.
     if(ed.length>2){var jm=X(ed[1]);[1,-1].forEach(function(f){var s=leafS+f*(lt2/2+.03);box(.03,.32,.03,jm-.06,1.05,s,hardwareMat,true);box(.03,.32,.03,jm+.06,1.05,s,hardwareMat,true)})}
    }
   }
   parts.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
   var lp=foot.clone();lp.y+=H+.3;
   var le=document.createElement("span");le.className="ir-three-member-label";le.textContent=c.mark||c.title||"";
   labelLayer.appendChild(le);labels.push({el:le,pos:lp,id:id})
  }
  // A stair flight (ГОСТ 23120, ГОСТ 31385): two stringers, treads at a rise of 200 (no more than 250), handrails 1.0 m
  // over the treads on both sides with a middle rail. A ladder (стремянка): two strings, rungs every 300 (no more than
  // 350) and cage hoops (R 400–450) every 800 from 2 m up. Width — diameter_mm of the record.
  function addStair(c,id,a,b){
   var ladder=c.ft==="ladder",w=Math.max(.4,(number(c.fd)||(ladder?600:800))/1000),parts=[],mat=baseMaterial(c);
   var lo=a.y<=b.y?a:b,hi=a.y<=b.y?b:a,d=hi.clone().sub(lo),flat=new T.Vector3(d.x,0,d.z),run=flat.length(),rise=d.y;
   if(run<.05)ladder=true;
   var up=new T.Vector3(0,1,0),side=run>.05?new T.Vector3(-flat.z,0,flat.x).normalize():new T.Vector3(1,0,0);
   var out=new T.Vector3().crossVectors(side,up).normalize(),basis=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(side,up,out));
   var bar=function(p,q,t){var v=q.clone().sub(p),L=v.length();if(L<.005)return;
    var m=new T.Mesh(barGeo(t),mat);m.position.copy(p);m.scale.z=L;m.quaternion.setFromUnitVectors(zAxis,v.normalize());parts.push(m)};
   var off=function(p,s,h){return p.clone().add(side.clone().multiplyScalar(s)).add(new T.Vector3(0,h||0,0))};
   var at=function(f){return lo.clone().add(d.clone().multiplyScalar(f))};
   [-w/2,w/2].forEach(function(s){bar(off(lo,s),off(hi,s),ladder?.05:.07)});
   if(ladder){
    var nr=Math.max(1,Math.ceil(rise/.3)-1);
    for(var k=1;k<=nr;k++){var p=at(k/(nr+1));bar(off(p,-w/2),off(p,w/2),.025)}
    if(rise>2.2)for(var z=2;z<rise;z+=.8){var hoop=new T.TorusGeometry(Math.max(.4,w/2+.1),.015,6,24,Math.PI);hoop.rotateX(Math.PI/2);
     var hm=new T.Mesh(hoop,mat);hm.position.copy(at(z/rise));hm.quaternion.copy(basis);parts.push(hm)}
   }else{
    var n=Math.max(2,Math.round(rise/.2));if(rise/n>.25)n=Math.ceil(rise/.25);
    var depth=Math.max(.2,run/n+.03);
    var tg=shared("tread:"+w+":"+depth.toFixed(3),function(){return new T.BoxGeometry(w,.03,depth)});
    for(var k=1;k<n;k++){var tm=new T.Mesh(tg,mat);tm.position.copy(at(k/n));tm.quaternion.copy(basis);parts.push(tm)}
    // Railings of its own along it (a stair's plan names them, «огр.»): its handrails are those.
    var u=flat.clone().normalize(),railed=elems.some(function(e){if(e===c||e.ft!=="railing"||e.geometryType==="shell")return false;
     var q=memberPoints(e),v=q[q.length-1].clone().sub(q[0]),fl=new T.Vector3(v.x,0,v.z);if(fl.length()<.3||Math.abs(fl.normalize().dot(u))<.95)return false;
     var m=q[0].clone().add(q[q.length-1]).multiplyScalar(.5).sub(lo),along=m.x*u.x+m.z*u.z;
     return Math.abs(m.x*side.x+m.z*side.z)<=w/2+.5&&along>=-.2*run&&along<=1.2*run});
    if(!railed)[-w/2,w/2].forEach(function(s){bar(off(lo,s,1),off(hi,s,1),.04);bar(off(lo,s,.5),off(hi,s,.5),.025);
     [0,.5,1].forEach(function(f){var p=at(f);bar(off(p,s),off(p,s,1),.035)})});
   }
   parts.forEach(function(mesh){mesh.userData.memberId=id;steel.add(mesh);allMeshes.push(mesh);
    if(!meshesById.has(id))meshesById.set(id,[]);meshesById.get(id).push(mesh)});
   var top=at(.5);top.y+=ladder?.35:1.3;
   var el=document.createElement("span");el.className="ir-three-member-label";el.textContent=c.mark||c.title||"";
   labelLayer.appendChild(el);labels.push({el:el,pos:top,id:id})
  }
  function refreshMaterials(){
   // A node taken apart is put together again over the new colours.
   var apart=explode&&{n:explode.node,s:explode.s};clearExplode();
   allMeshes.forEach(function(mesh){
    var c=dataById.get(mesh.userData.memberId);
    if(!mesh.userData.fixed)mesh.material=mesh.userData.roof?roofMaterial(c):mesh.userData.shell?shellMaterial(c):baseMaterial(c)
   });
   rayTargets=allMeshes.filter(function(m){return!m.userData.small});rebatch();lit=null;paintHighlight();
   root.querySelector("#irThreeCount").textContent=elems.length+" элементов"+(failures?" · без геометрии: "+failures:"")+(conventional.size?" · сечение условное: "+conventional.size:"");
   root.querySelector("#irThreeCount").title=conventional.size?"Профиль этих элементов не найден в справочнике сортаментов (или не указан) — сечение нарисовано условно, не по размерам":"Сечения нарисованы по справочнику сортаментов";
   paintLegend();
   if(apart)setExplode(apart.n,apart.s)
  }
  // Members merged into one mesh per material and per 15 m cell of the plan (a mirrored member keeps its faces turned
  // out). A cell far from the camera is drawn by boxes of the members (12 triangles each, not the rolled section), the
  // bolts only near: 4000 members with their sections, plates and bolts are near a million triangles, and a computer
  // whose graphics card is not used drew one picture for seconds — the program and the whole computer stood.
  var CELL=15,unitBox=null,boxMatrix=new T.Matrix4(),boxCentre=new T.Vector3(),boxSize=new T.Vector3();
  function merge(list,geoOf,matOf,mat){
   var nv=0,ni=0,p=new T.Vector3(),nm=new T.Matrix3();
   list.forEach(function(m){var g=geoOf(m),c=g.attributes.position.count;nv+=c;ni+=g.index?g.index.count:c});
   var pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),idx=new Uint32Array(ni),v=0,i=0;
   list.forEach(function(m){
    var g=geoOf(m),P=g.attributes.position,N=g.attributes.normal,I=g.index,e=matOf(m),flip=e.determinant()<0,n=I?I.count:P.count;
    nm.getNormalMatrix(e);
    for(var k=0;k<P.count;k++){
     p.fromBufferAttribute(P,k).applyMatrix4(e);pos[(v+k)*3]=p.x;pos[(v+k)*3+1]=p.y;pos[(v+k)*3+2]=p.z;
     if(N){p.fromBufferAttribute(N,k).applyMatrix3(nm).normalize();nor[(v+k)*3]=p.x;nor[(v+k)*3+1]=p.y;nor[(v+k)*3+2]=p.z}
    }
    for(var t=0;t+2<n;t+=3){var a=I?I.getX(t):t,b=I?I.getX(t+1):t+1,c=I?I.getX(t+2):t+2;
     idx[i++]=v+a;idx[i++]=v+(flip?c:b);idx[i++]=v+(flip?b:c)}
    v+=P.count
   });
   var bg=new T.BufferGeometry();bg.setAttribute("position",new T.BufferAttribute(pos,3));bg.setAttribute("normal",new T.BufferAttribute(nor,3));
   bg.setIndex(new T.BufferAttribute(idx.subarray(0,i),1));bg.computeBoundingSphere();
   var bm=new T.Mesh(bg,mat);bm.matrixAutoUpdate=false;return bm
  }
  // The box of a member in its own axes: the section's extent along its length.
  function coarse(m){var g=m.geometry;return g.index&&g.index.count<=36||!g.index&&g.attributes.position.count<=36?g:unitBox}
  function coarseMatrix(m){
   var g=m.geometry;if(coarse(m)===g)return m.matrixWorld;
   if(!g.boundingBox)g.computeBoundingBox();g.boundingBox.getCenter(boxCentre);g.boundingBox.getSize(boxSize);
   return boxMatrix.copy(m.matrixWorld).multiply(new T.Matrix4().makeTranslation(boxCentre.x,boxCentre.y,boxCentre.z)).scale(boxSize)
  }
  function rebatch(){
   batches.children.slice().forEach(function(b){batches.remove(b);b.geometry.dispose()});
   steel.updateMatrixWorld(true);if(!unitBox)unitBox=new T.BoxGeometry(1,1,1);
   var groups=new Map();
   allMeshes.forEach(function(m){if(!m.visible)return;var e=m.matrixWorld.elements,k=(m.userData.small?"s":"m")+"|"+Math.floor(e[12]/CELL)+","+Math.floor(e[14]/CELL);
    var byMat=groups.get(k);if(!byMat)groups.set(k,byMat=new Map());var l=byMat.get(m.material);if(!l)byMat.set(m.material,l=[]);l.push(m)});
   // The bolt sets of the cell, by class.
   var seen=function(id){var l=meshesById.get(id);return!l||l.some(function(m){return m.visible})};
   var bolts=new Map();boltList.forEach(function(b){if(!seen(b.id))return;var k=b.cls+"|"+Math.floor(b.at.x/CELL)+","+Math.floor(b.at.z/CELL);if(!bolts.has(k))bolts.set(k,[]);bolts.get(k).push(b)});
   bolts.forEach(function(list,k){var items=[];list.forEach(function(b){items.push.apply(items,boltParts(b))});
    var bm=merge(items,function(m){return m.geometry},function(m){return m.matrixWorld},boltMats[k.split("|")[0]]);bm.userData.lod="small";batches.add(bm)});
   groups.forEach(function(byMat,k){
    var small=k[0]==="s";
    byMat.forEach(function(list,mat){
     var fine=merge(list,function(m){return m.geometry},function(m){return m.matrixWorld},mat);fine.userData.lod=small?"small":"fine";batches.add(fine);
     if(small)return;
     var box=merge(list,coarse,coarseMatrix,mat);box.userData.lod="coarse";box.visible=false;batches.add(box)
    })
   });
   lodAt=null;invalidate()
  }
  // Which of the two pictures of a cell is drawn: by the distance from the camera to the cell's members.
  var lodAt=null;
  function lod(){
   var cam=camera.position;if(lodAt&&lodAt.distanceToSquared(cam)<.25)return;lodAt=cam.clone();
   var near=light?22:45,bolts=light?8:18;
   batches.children.forEach(function(b){
    var s=b.geometry.boundingSphere,d=s?Math.max(0,cam.distanceTo(s.center)-s.radius):0;
    b.visible=b.userData.lod==="small"?d<bolts:b.userData.lod==="coarse"?d>=near:d<near
   })
  }
  // ---- The parts of the selected member as its card lists them (the engineer, 27.10.2026, after the report of 21.10:
  // «вывод информации об элементе сделай такой»): each position of the specification of its assembly sheet in a colour of
  // its own with its number in a circle beside it, the body of the member the position of its section; a position chosen
  // in the card (or by its number) lit, the others pale. The card takes the colours, the mass of the model, the bolts and
  // the nodes of the member from here (card).
  var PART_COLORS=["#4a95c4","#c2507a","#4cbfae","#e0a030","#8a6fd1","#6aae45","#e0703e","#3b6fa8","#b9a832","#9b5a3c"];
  var partMats=new Map(),litPart=null,litFor="",callouts=[];
  function partRows(c){return c&&c.parts&&Array.isArray(c.parts.rows)?c.parts.rows.filter(function(r){return r&&r.pos!==null&&r.pos!==undefined&&r.pos!==""}):[]}
  // The position of the body: the row of its own section, else the longest rolled one at least half as long as the member.
  function bodyPos(c,rows){
   var own=sectionOf(c.profile_name||c.profileName,c.profile_standard),pts=memberPoints(c),L=0,best=null;
   for(var i=1;i<pts.length;i++)L+=pts[i].distanceTo(pts[i-1])*1000;
   var same=function(a){return own&&a&&a.shape===own.shape&&Math.abs(a.h-own.h)<.6&&Math.abs(a.b-own.b)<.6&&Math.abs(number(a.t)-number(own.t))<.3};
   rows.forEach(function(r){var sc=sectionOf(r.section,c.profile_standard),len=number(r.length_mm),k=same(sc)?2:sc&&sc.shape!=="plate"&&len>=L*.5?1:0;
    if(k&&(!best||k>best.k||k===best.k&&len>best.len))best={k:k,len:len,pos:String(r.pos)}});
   return best?best.pos:null
  }
  function partsOf(id){
   var c=dataById.get(String(id)),rows=partRows(c);if(!rows.length)return null;
   var color={},n=0;rows.forEach(function(r){var k=String(r.pos);if(!color[k])color[k]=PART_COLORS[n++%PART_COLORS.length]});
   return{body:bodyPos(c,rows),color:color}
  }
  function meshPos(m,parts){var p=m.userData.body?parts.body:m.userData.pos;return p===null||p===undefined||p===""?null:String(p)}
  // (the others of a member with a position lit: pale grey over the colour of its state)
  function partMat(hex){
   if(!partMats.has(hex))partMats.set(hex,new T.MeshStandardMaterial({color:new T.Color(hex),emissive:new T.Color(hex),emissiveIntensity:hex==="#d3dae0"?0:.16,metalness:.2,roughness:.5,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-4}));
   return partMats.get(hex)
  }
  function clearCallouts(){callouts.forEach(function(o){o.el.remove()});callouts=[]}
  // A number in a circle at the middle of the first piece of each position (as the report draws them).
  function putCallouts(id,parts){
   var first=new Map();(meshesById.get(id)||[]).forEach(function(m){var p=meshPos(m,parts);if(p!==null&&parts.color[p]&&!first.has(p))first.set(p,m)});
   first.forEach(function(m,p){
    // (not a button: the program disables the buttons of a section for a viewer, and these only show)
    var el=document.createElement("span");el.setAttribute("role","button");el.className="ir-three-callout";el.textContent=p;el.style.borderColor=parts.color[p];el.title="Поз. "+p;
    el.onclick=function(e){e.stopPropagation();lightPart(litPart===p?null:p)};
    labelLayer.appendChild(el);callouts.push({el:el,pos:new T.Box3().setFromObject(m).getCenter(new T.Vector3()),p:p})
   })
  }
  function paintCallouts(w,h){
   callouts.forEach(function(o){var q=project(o.pos,w,h);o.el.hidden=!q.inside||q.x<8||q.x>w-8||q.y<8||q.y>h-8;
    if(!o.el.hidden){o.el.style.left=q.x+"px";o.el.style.top=q.y+"px";o.el.classList.toggle("on",litPart===o.p)}})
  }
  // The selected member (blue, or its parts in their colours) and the one under the cursor (orange) over their batch.
  var lit=null;
  function paintHighlight(){
   if(litFor!==selected){litFor=selected;litPart=null}
   var key=selected+"|"+hover+"|"+litPart;if(lit===key)return;lit=key;
   overlay.children.slice().forEach(function(o){overlay.remove(o)});
   var parts=selected?partsOf(selected):null;
   [[selected,selectedMat],[hover!==selected?hover:"",hoverMat]].forEach(function(s,i){
    if(s[0])(meshesById.get(s[0])||[]).forEach(function(m){
     var mat=s[1],p=!i&&parts?meshPos(m,parts):null;
     if(!i&&parts)mat=litPart!==null&&p!==litPart?partMat("#d3dae0"):p!==null&&parts.color[p]?partMat(parts.color[p]):s[1];
     var o=new T.Mesh(m.geometry,mat);o.matrixAutoUpdate=false;o.matrix.copy(m.matrixWorld);overlay.add(o)})
   });
   clearCallouts();if(parts)putCallouts(selected,parts);
   if(typeof document!=="undefined")document.querySelectorAll("[data-ec-pos]").forEach(function(r){r.classList.toggle("on",litPart!==null&&r.getAttribute("data-ec-pos")===litPart)});
   invalidate()
  }
  function lightPart(pos){litPart=pos===null||pos===undefined||pos===""?null:String(pos);paintHighlight();return litPart}
  // The steel of the member as drawn, by the volume of its pieces (a closed mesh: the sum of the tetrahedra from a point
  // of it to its faces): the body, its plates, gussets and ends; not the holes, the anchors, the footing.
  function volumeOf(m){
   var g=m.geometry,at=g&&g.attributes&&g.attributes.position;if(!at)return 0;m.updateWorldMatrix(true,false);
   var idx=g.index,n=idx?idx.count:at.count,mw=m.matrixWorld,o=new T.Vector3().setFromMatrixPosition(mw),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),v=0;
   var get=function(q,i){return q.fromBufferAttribute(at,idx?idx.getX(i):i).applyMatrix4(mw).sub(o)};
   for(var i=0;i+2<n;i+=3){get(a,i);get(b,i+1);get(c,i+2);v+=a.dot(b.cross(c))/6}
   return Math.abs(v)
  }
  function card(id){
   id=String(id||"");var c=dataById.get(id);if(!c)return null;
   var list=meshesById.get(id)||[],v=0,parts=partsOf(id),own=sectionOf(c.profile_name||c.profileName,c.profile_standard);
   list.forEach(function(m){if(m.userData.hole||m.userData.anchor||m.userData.footing||m.material===concreteMat)return;v+=volumeOf(m)});
   return{mass_kg:own&&!conventional.has(id)&&v>0?Math.round(v*7850*10)/10:null,bolts:boltList.filter(function(b){return b.id===id}).length,
    nodes:nodes.filter(function(n){return n.members.some(function(m){return String(m.c.id)===id})}).map(function(n){return{id:n.id,name:nodeKinds[n.kind],axes:axisOf(n.x,n.y).split(" (")[0]}}),
    colors:parts?parts.color:{},body:parts?parts.body:null,lit:litFor===id?litPart:null}
  }
  function legendRows(){
   var counts=new Map(),rows=[];
   elems.forEach(function(c){
    var k=colorMode==="status"?(statusColors[c.status]?c.status:"planned"):colorMode==="confidence"?instanceKey(c):colorMode==="mark"?String(c.mark||"Без марки"):colorKey(c);
    counts.set(k,(counts.get(k)||0)+1)
   });
   counts.forEach(function(n,k){
    var color=colorMode==="status"?statusColors[k][0]:colorMode==="confidence"?instanceColors[k][0]:colorMode==="mark"?hsvMark(T,k):(groups[k]||groups.other)[1];
    var name=colorMode==="status"?statusColors[k][1]:colorMode==="confidence"?instanceColors[k][1]:colorMode==="mark"?k:(groups[k]||groups.other)[0];
    rows.push({name:name,n:n,color:color})
   });
   rows.sort(function(a,b){return b.n-a.n||a.name.localeCompare(b.name,"ru",{numeric:true})});
   return rows
  }
  function prelimCount(){var n=0;elems.forEach(function(c){if(pale(c))n++});return n}
  function paintLegend(){
   var rows=legendRows(),shown=rows.slice(0,colorMode==="mark"?12:20);
   legend.innerHTML=shown.map(function(r){
    return '<span><i style="background:#'+r.color.toString(16).padStart(6,"0")+'"></i>'+escapeHtml(r.name)+' <small>'+r.n+'</small></span>'
   }).join("")+(rows.length>shown.length?'<span class="more">ещё '+(rows.length-shown.length)+'</span>':"")+
    (prelimCount()?'<span title="Экземпляры, определённые по чертежам не полностью: расставлены и показаны бледно. Причина — в карточке элемента."><i style="background:#c9d3dd;opacity:.6;outline:1px dashed #6f7f8f"></i>Предварительно <small>'+prelimCount()+'</small></span>':"")+
    (cranes.length&&showDetails?'<span data-crane style="cursor:pointer;font-weight:700" title="Краны и тали нарисованы условно (в КМ их нет): по рельсам и подкрановым путям. Щелчок — показать следующий"><i style="background:#ff6a00"></i>Краны (условно) <small>'+cranes.length+'</small></span>':"");
   legend.hidden=!rows.length&&!(cranes.length&&showDetails)
  }
  function applyBackground(){
   var choice=P.background||"standard",color=choice==="custom"&&P.backgroundColor?new T.Color(P.backgroundColor).getHex():backgrounds[choice]||backgrounds.standard;
   scene.background=new T.Color(color);
   var dark=new T.Color(color).getHSL({}).l<.35;
   // A dark floor is not lit (lit, it turned grey and the grid stood out light on it).
   floorMaterial.color.setHex(0xd0dfec);floor.material=dark?darkFloorMaterial:floorMaterial;
   if(Boolean(grid.userData.dark)!==dark){floorGrid(dark);grid.userData.dark=dark}
   root.classList.toggle("dark",dark)
  }
  var center=new T.Vector3(X/2,Math.max(4,Math.min(15,number(P.maxZ||10000)/1900)),Y/2);
  var radius=Math.max(24,Math.hypot(X,Y)*.95),controls=new T.OrbitControls(camera,renderer.domElement);
  controls.target.copy(center);controls.enableDamping=true;controls.dampingFactor=.2;controls.rotateSpeed=.6;
  controls.screenSpacePanning=true;controls.minDistance=.05;controls.maxDistance=radius*5;
  // The pressed wheel moves the model like the right button, as in AutoCAD and Tekla: by default it flew the camera
  // straight away from the model, a twentieth farther every step of the mouse — 114 m to 438 m in a finger's move (the
  // engineer, 25.10.2026: «если держать кнопку мышки и пытаться прокрутить схему, то улетает далеко прямо»).
  controls.mouseButtons={LEFT:T.MOUSE.ROTATE,MIDDLE:T.MOUSE.PAN,RIGHT:T.MOUSE.PAN};
  var raycaster=new T.Raycaster(),pointer=new T.Vector2(),flight=null;
  function setView(name){
   flight=null;
   root.querySelectorAll("[data-three-view]").forEach(function(b){b.classList.toggle("active",b.dataset.threeView===name)});
   controls.target.copy(center);camera.up.set(0,1,0);
   if(name==="top"){camera.position.set(center.x,Math.max(45,radius),center.z+.001);camera.up.set(0,0,-1)}
   else if(name==="front")camera.position.set(center.x,center.y+6,center.z+radius);
   else if(name==="side")camera.position.set(center.x+radius,center.y+6,center.z);
   else camera.position.set(center.x+radius*.78,center.y+radius*.5,center.z+radius*.92);
   camera.lookAt(center);controls.update()
  }
  // Smooth camera move to a member, keeping the viewing direction.
  function focus(id){
   var meshes=meshesById.get(String(id));if(!meshes||!meshes.length)return false;
   var box=new T.Box3();meshes.forEach(function(m){box.expandByObject(m)});
   var c=box.getCenter(new T.Vector3()),size=Math.max(6,box.getSize(new T.Vector3()).length()*2.2);
   var dir=camera.position.clone().sub(controls.target).normalize();
   flight={from:controls.target.clone(),to:c,camFrom:camera.position.clone(),camTo:c.clone().add(dir.multiplyScalar(size)),t:0,ms:850,st:performance.now()};
   return true
  }
  function choose(id){
   selected=String(id||"");P.onSelect&&P.onSelect(selected);paintHighlight()
  }
  function screenRay(e){
   var rect=renderer.domElement.getBoundingClientRect();
   pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
   raycaster.setFromCamera(pointer,camera)
  }
  function hitMember(){
   var hits=raycaster.intersectObjects(rayTargets,false);
   return hits[0]?{id:hits[0].object.userData.memberId,point:hits[0].point,d:hits[0].distance}:null
  }
  // ---- Copy a member to another place on the ground plane.
  function reportCopyError(message){
   var hint=root.querySelector("#irThreeCopyHint");
   hint.hidden=false;hint.querySelector(".ir-three-action-error")?.remove();
   var p=document.createElement("span");p.className="ir-three-action-error";p.textContent=message;hint.appendChild(p)
  }
  function startCopy(id){
   if(!P.canEdit||!dataById.has(String(id)))return;
   cancelPlacement();copySource=String(id);root.querySelector("#irThreeCopyHint").hidden=false;viewport.classList.add("copy-target")
  }
  function cancelCopy(){
   copySource="";copyBusy=false;viewport.classList.remove("copy-target");
   var hint=root.querySelector("#irThreeCopyHint");hint.hidden=true;
   hint.querySelector(".ir-three-action-error")?.remove()
  }
  function copyToGround(e){
   if(copyBusy||!copySource||!P.canEdit||!P.onCopyPlacement)return;
   screenRay(e);
   var point=new T.Vector3();
   if(!raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),0),point)||point.x<0||point.x>X||point.z<0||point.z>Y){
    reportCopyError("Выберите точку внутри сетки монтажной схемы.");return
   }
   var mm=fromWorld(point);copyBusy=true;
   Promise.resolve().then(function(){return P.onCopyPlacement(copySource,{x:mm.x,y:mm.y})})
    .then(function(id){cancelCopy();P.onCopied&&P.onCopied(id)})
    .catch(function(error){copyBusy=false;reportCopyError(String(error&&error.message||error))})
  }
  // ---- Interactive placement: pick a mark, click grid nodes or existing members.
  var markerMat=new T.MeshBasicMaterial({color:0xff7a00,depthTest:false}),pointMat=new T.MeshBasicMaterial({color:0x0b63d1,depthTest:false});
  var previewMat=new T.LineBasicMaterial({color:0xff7a00,depthTest:false});
  var marker=new T.Mesh(new T.SphereGeometry(.18,16,12),markerMat);marker.renderOrder=10;marker.visible=false;helpers.add(marker);
  var preview=null,pointMarks=[];
  function nearestAxis(names,pos,value){
   var best=names[0]||"";names.forEach(function(n){if(Math.abs(number(pos[n])-value)<Math.abs(number(pos[best])-value))best=n});return best
  }
  function anchor(x,y,z,memberId,source){
   var ax=nearestAxis(axesX,gridX,x),ay=nearestAxis(axesY,gridY,y);
   return{x:x,y:y,z:z,ax:ax,ay:ay,dx:Math.round(x-number(gridX[ax])),dy:Math.round(y-number(gridY[ay])),memberId:memberId||"",source:source}
  }
  function snapGround(mm,z){
   var ax=nearestAxis(axesX,gridX,mm.x),ay=nearestAxis(axesY,gridY,mm.y),nx=number(gridX[ax]),ny=number(gridY[ay]);
   var tol=Math.max(250,camera.position.distanceTo(controls.target)*14);
   if(Math.hypot(mm.x-nx,mm.y-ny)<=tol*1.6)return anchor(nx,ny,z,"","узел "+ax+"/"+ay);
   var x=Math.abs(mm.x-nx)<=tol?nx:Math.round(mm.x/50)*50,y=Math.abs(mm.y-ny)<=tol?ny:Math.round(mm.y/50)*50;
   return anchor(x,y,z,"",x===nx?"ось "+ax:y===ny?"ось "+ay:"между осями")
  }
  // A beam rests on the top of a column, or on any point of another member.
  function snapMember(hit,mark){
   var c=dataById.get(hit.id);if(!c)return null;
   if(c.geometryType==="column"&&mark.geometry!=="column")return anchor(number(c.x),number(c.y),number(c.z2),c.id,"верх "+(c.mark||"колонны"));
   var p=memberPoints(c),best=null;
   for(var i=0;i<p.length-1;i++){
    var a=p[i],b=p[i+1],ab=b.clone().sub(a),t=Math.max(0,Math.min(1,hit.point.clone().sub(a).dot(ab)/Math.max(1e-9,ab.lengthSq())));
    var q=a.clone().add(ab.multiplyScalar(t)),d=q.distanceTo(hit.point);
    if(!best||d<best.d)best={d:d,q:q,a:a,b:b}
   }
   [best.a,best.b].forEach(function(end){if(end.distanceTo(best.q)<.3)best.q=end.clone()});
   var mm=fromWorld(best.q);
   return anchor(Math.round(mm.x),Math.round(mm.y),Math.round(mm.z),c.id,"на "+(c.mark||"элементе"))
  }
  function placementSnap(e){
   screenRay(e);
   var mark=placing.mark,hit=hitMember();
   if(hit&&mark){var s=snapMember(hit,mark);if(s)return s}
   var level=mark&&mark.geometry==="column"?placing.z0:placing.level,point=new T.Vector3();
   if(!raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-level/1000),point))return null;
   var mm=fromWorld(point);
   if(mm.x<-1||mm.x>spanX+1||mm.y<-1||mm.y>spanY+1)return null;
   return snapGround(mm,level)
  }
  function needed(){
   var g=placing.geometry;return g==="column"?1:g==="bent"&&placing.ridge==="manual"?3:2
  }
  function pointNames(){return placing.geometry==="bent"&&placing.ridge==="manual"?["Начало","Конёк","Конец"]:placing.geometry==="column"?["Точка"]:["Начало","Конец"]}
  function clearPreview(){
   if(preview){helpers.remove(preview);preview.geometry.dispose();preview=null}
   pointMarks.forEach(function(m){helpers.remove(m)});pointMarks=[]
  }
  function drawPoints(current){
   clearPreview();
   var pts=placing.points.map(function(p){return toWorld(p.x,p.y,p.z)});
   pts.forEach(function(v){var m=new T.Mesh(marker.geometry,pointMat);m.position.copy(v);m.renderOrder=10;helpers.add(m);pointMarks.push(m)});
   if(placing.geometry==="column"&&current)pts=[toWorld(current.x,current.y,placing.z0),toWorld(current.x,current.y,placing.z1)];
   else if(current&&pts.length<needed())pts.push(toWorld(current.x,current.y,current.z));
   if(pts.length>1){preview=new T.Line(new T.BufferGeometry().setFromPoints(pts),previewMat);preview.renderOrder=9;helpers.add(preview)}
  }
  function availableMarks(){return(P.marks||[]).filter(function(m){return m.left>0})}
  function startPlacement(){
   if(!P.canEdit)return;
   cancelCopy();
   var marks=availableMarks();
   placing={query:"",mark:null,geometry:"column",ridge:"center",ridgeZ:"",points:[],z0:0,z1:number(P.lastTopZ)||6000,level:number(P.lastLevel)||4500,
    series:true,chain:false,error:"",busy:false};
   if(marks.length)selectMark(marks[0].id);
   paintPlacement();placePanel.hidden=false;viewport.classList.add("placing")
  }
  function selectMark(id){
   var m=(P.marks||[]).find(function(x){return String(x.id)===String(id)});
   placing.mark=m||null;placing.points=[];placing.error="";
   placing.geometry=m?(m.geometry==="beam"&&placing.geometry==="bent"?"bent":m.geometry):"column"
  }
  function cancelPlacement(){
   placing=null;clearPreview();marker.visible=false;cursor.hidden=true;placePanel.hidden=true;viewport.classList.remove("placing")
  }
  function pointText(p,i){
   return '<div class="ir-three-place-point"><b>'+pointNames()[i]+'</b><span>'+escapeHtml(p.ax+"/"+p.ay+(p.dx||p.dy?" ("+(p.dx?(p.dx>0?"+":"")+fmt(p.dx):"0")+"; "+(p.dy?(p.dy>0?"+":"")+fmt(p.dy):"0")+")":""))+
    ' · '+escapeHtml(p.source||"")+'</span><label>Z, мм <input type="number" step="10" data-place-z="'+i+'" value="'+Math.round(p.z)+'"></label></div>'
  }
  function paintPlacement(){
   if(!placing)return;
   var marks=(P.marks||[]),q=placing.query.trim().toLowerCase(),list=marks.filter(function(m){return m.left>0&&(!q||String(m.title+" "+m.mark).toLowerCase().indexOf(q)>=0)});
   var m=placing.mark,g=placing.geometry,count=needed(),ready=m&&placing.points.length>=count;
   placePanel.innerHTML='<div class="ir-three-place-head"><b>Добавить элемент</b><button type="button" data-place="close" title="Закрыть (Esc)">×</button></div>'+
    (!marks.some(function(x){return x.left>0})?'<p class="ir-three-place-note">Нет марок с остатком по ведомости. Добавьте марки или откройте форму.</p>':
    '<label class="ir-three-place-field">Марка<input type="search" data-place="search" value="'+escapeHtml(placing.query)+'" placeholder="Поиск марки"></label>'+
    '<select data-place="mark" data-native-select="1" size="5">'+list.slice(0,200).map(function(x){
     return '<option value="'+escapeHtml(x.id)+'" '+(m&&String(m.id)===String(x.id)?"selected":"")+'>'+escapeHtml(x.title||x.mark)+' · '+(kindNames[x.geometry]||x.geometry)+' · осталось '+x.left+' из '+x.total+'</option>'
    }).join("")+'</select>')+
    (m?'<div class="ir-three-place-kind">'+escapeHtml(m.mark||m.title)+' — '+escapeHtml(kindNames[g]||g)+
     (m.geometry==="beam"?'<label class="ir-three-check"><input type="checkbox" data-place="bent" '+(g==="bent"?"checked":"")+'> ломаная (конёк)</label>':"")+'</div>'+
     (g==="bent"?'<div class="ir-three-place-row"><label>Конёк <select data-place="ridge" data-native-select="1"><option value="center" '+(placing.ridge==="center"?"selected":"")+'>посередине</option><option value="manual" '+(placing.ridge==="manual"?"selected":"")+'>указать точкой</option></select></label>'+
      (placing.ridge==="center"?'<label>Z конька, мм <input type="number" step="10" data-place="ridgeZ" value="'+escapeHtml(placing.ridgeZ)+'"></label>':"")+'</div>':"")+
     (g==="column"?'<div class="ir-three-place-row"><label>Низ, мм <input type="number" step="10" data-place="z0" value="'+placing.z0+'"></label><label>Верх, мм <input type="number" step="10" data-place="z1" value="'+placing.z1+'"></label></div>':
      '<div class="ir-three-place-row"><label title="Высота, на которой выбираются точки, если не попали на колонну или балку">Плоскость, мм <input type="number" step="10" data-place="level" value="'+placing.level+'"></label></div>')+
     '<p class="ir-three-place-note">'+(g==="column"?"Щёлкните узел сетки или точку на плане.":
      "Щёлкните "+pointNames().slice(placing.points.length).join(", затем ").toLowerCase()+": верх колонны, точку на балке или узел сетки.")+'</p>'+
     placing.points.map(pointText).join("")+
     '<div class="ir-three-place-row"><label class="ir-three-check"><input type="checkbox" data-place="series" '+(placing.series?"checked":"")+'> серия</label>'+
     (g!=="column"?'<label class="ir-three-check"><input type="checkbox" data-place="chain" '+(placing.chain?"checked":"")+'> цепочкой</label>':"")+'</div>':"")+
   (placing.error?'<p class="ir-three-action-error">'+escapeHtml(placing.error)+'</p>':"")+
   '<div class="ir-three-place-actions">'+
    (P.onQuickPlace?'<button type="button" class="primary" data-place="save" '+(ready&&!placing.busy?"":"disabled")+'>Сохранить</button>':"")+
    '<button type="button" data-place="form" '+(m?"":"disabled")+' title="Открыть полную форму с выбранными точками">В форме…</button>'+
    '<button type="button" data-place="reset" '+(placing.points.length?"":"disabled")+'>Сбросить точки</button></div>';
   bindPlacement()
  }
  function bindPlacement(){
   var on=function(sel,ev,fn){var el=placePanel.querySelector('[data-place="'+sel+'"]');if(el)el.addEventListener(ev,fn)};
   on("close","click",cancelPlacement);
   on("search","input",function(e){
    placing.query=e.target.value;var at=e.target.selectionStart;paintPlacement();
    var s=placePanel.querySelector('[data-place="search"]');s.focus();try{s.setSelectionRange(at,at)}catch(_e){}
   });
   on("mark","change",function(e){selectMark(e.target.value);drawPoints(null);paintPlacement()});
   on("bent","change",function(e){placing.geometry=e.target.checked?"bent":"beam";placing.points=[];drawPoints(null);paintPlacement()});
   on("ridge","change",function(e){placing.ridge=e.target.value;placing.points=[];drawPoints(null);paintPlacement()});
   on("ridgeZ","change",function(e){placing.ridgeZ=e.target.value});
   on("z0","change",function(e){placing.z0=number(e.target.value)});
   on("z1","change",function(e){placing.z1=number(e.target.value)});
   on("level","change",function(e){placing.level=number(e.target.value)});
   on("series","change",function(e){placing.series=e.target.checked});
   on("chain","change",function(e){placing.chain=e.target.checked});
   on("reset","click",function(){placing.points=[];placing.error="";drawPoints(null);paintPlacement()});
   on("save","click",savePlacement);
   on("form","click",function(){var data=placementData(true);if(!data)return;var p=P.onPlacement;cancelPlacement();p&&p(data)});
   placePanel.querySelectorAll("[data-place-z]").forEach(function(input){
    input.addEventListener("change",function(){var p=placing.points[Number(input.dataset.placeZ)];if(p){p.z=number(input.value);drawPoints(null)}})
   })
  }
  function placementData(partial){
   var m=placing.mark;if(!m)return null;
   var pts=placing.points,g=placing.geometry,strip=function(p){return p?{ax:p.ax,ay:p.ay,dx:p.dx,dy:p.dy,z:p.z,memberId:p.memberId}:null};
   if(!partial&&pts.length<needed())return null;
   var start=pts[0]||null;
   if(g==="column")return{markId:m.id,geometry:"column",start:start?{ax:start.ax,ay:start.ay,dx:start.dx,dy:start.dy,z:start.memberId?start.z:placing.z0,memberId:start.memberId}:null,topZ:placing.z1,height:placing.z1};
   var end=g==="bent"&&placing.ridge==="manual"?pts[2]:pts[1];
   var data={markId:m.id,geometry:g,start:strip(start),end:strip(end),height:end?end.z:placing.level,ridgeMode:g==="bent"?placing.ridge:undefined,zigzag:placing.chain};
   if(g==="bent")data.middle=placing.ridge==="manual"?strip(pts[1]):{z:number(placing.ridgeZ)};
   return data
  }
  function savePlacement(){
   if(!placing||placing.busy||!P.onQuickPlace)return;
   var data=placementData(false);if(!data){placing.error="Укажите все точки.";paintPlacement();return}
   if(data.geometry==="bent"&&data.ridgeMode==="center"&&!String(placing.ridgeZ).trim()){placing.error="Укажите отметку конька.";paintPlacement();return}
   placing.busy=true;placing.error="";paintPlacement();
   Promise.resolve().then(function(){return P.onQuickPlace(data)}).then(function(result){
    if(!placing)return;
    var end=placing.points[placing.points.length-1];
    placing.busy=false;placing.points=[];
    if(placing.geometry==="column")P.lastTopZ=placing.z1;else P.lastLevel=placing.level;
    if(placing.chain&&end&&placing.geometry!=="column"){var saved=result&&result.savedEnd||end;placing.points=[anchor(number(saved.x),number(saved.y),number(saved.z),"","конец предыдущего")]}
    var keep=placing.series;
    P.onQuickPlaced&&P.onQuickPlaced(result);
    if(!keep)cancelPlacement()
   }).catch(function(error){if(!placing)return;placing.busy=false;placing.error=String(error&&error.message||error);paintPlacement()})
  }
  function placementMove(e){
   var s=placementSnap(e);
   if(!s){marker.visible=false;cursor.hidden=true;drawPoints(null);return}
   var z=placing.geometry==="column"&&!s.memberId?placing.z0:s.z;
   marker.position.copy(toWorld(s.x,s.y,z));marker.visible=true;drawPoints(s);
   var rect=viewport.getBoundingClientRect();
   cursor.hidden=false;cursor.style.left=(e.clientX-rect.left+14)+"px";cursor.style.top=(e.clientY-rect.top+14)+"px";
   cursor.textContent=s.ax+"/"+s.ay+" · "+s.source+" · Z "+fmt(z)
  }
  function placementClick(e){
   if(!placing.mark){placing.error="Выберите марку.";paintPlacement();return}
   var s=placementSnap(e);if(!s){placing.error="Точка вне сетки схемы.";paintPlacement();return}
   if(placing.points.length>=needed())placing.points=[];
   placing.points.push(s);placing.error="";drawPoints(null);paintPlacement();
   // A column is complete after one click.
   if(placing.geometry==="column"&&P.onQuickPlace)savePlacement()
  }
  // ---- Pointer and keys.
  var pointerDown=null;
  function down(e){if(e.button===0)pointerDown=[e.clientX,e.clientY]}
  function up(e){
   if(!pointerDown||e.button!==0)return;
   var moved=Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1]);pointerDown=null;
   if(moved>=5)return;
   if(placing){placementClick(e);return}
   if(copySource){copyToGround(e);return}
   screenRay(e);
   var node=hitNode();if(node){chooseNode(node);return}
   // A crane in front of the member: its card, not the member behind it.
   var hit=hitMember(),cr=hitCrane();if(cr&&(!hit||cr.d<hit.d)){showCrane(cr);return}
   if(!selectedNode&&nodePanel)nodePanel.hidden=true;choose(hit?hit.id:"")
  }
  // The member under the cursor is looked for once a frame, not on every move of the mouse.
  var pendingHover=null;
  function move(e){
   if(pointerDown||e.buttons)return;
   if(placing){placementMove(e);invalidate();return}
   pendingHover={clientX:e.clientX,clientY:e.clientY}
  }
  function hoverNow(){
   var e=pendingHover;pendingHover=null;screenRay(e);var hit=hitMember(),cr=hitCrane(),near=cr&&(!hit||cr.d<hit.d),next=hit&&!near?hit.id:"";
   if(next!==hover){hover=next;paintHighlight()}
   var tip=near?craneKinds[cr.k.kind]+" (условно, в КМ его нет): "+cr.part+". Щёлкните — подробнее":"";if(renderer.domElement.title!==tip)renderer.domElement.title=tip
  }
  function leave(){pendingHover=null;if(hover){hover="";paintHighlight()}if(placing){marker.visible=false;cursor.hidden=true;drawPoints(null);invalidate()}}
  function onKey(e){
   if(e.key!=="Escape"&&e.key!=="Enter")return;
   invalidate();
   if(e.target&&e.target.closest&&e.target.closest("dialog"))return;
   if(e.key==="Escape"&&placing){cancelPlacement();e.preventDefault()}
   else if(e.key==="Escape"&&copySource){cancelCopy();e.preventDefault()}
   else if(e.key==="Enter"&&placing&&placePanel.contains(document.activeElement)&&document.activeElement.dataset.place!=="search")savePlacement()
  }
  renderer.domElement.addEventListener("pointerdown",down);
  // No scrolling of the page by the pressed wheel (a browser opening the exported file).
  function noAutoscroll(e){if(e.button===1)e.preventDefault()}
  renderer.domElement.addEventListener("mousedown",noAutoscroll);
  renderer.domElement.addEventListener("pointerup",up);
  renderer.domElement.addEventListener("pointermove",move);
  renderer.domElement.addEventListener("pointerleave",leave);
  renderer.domElement.addEventListener("pointerenter",function(){overView=true});
  renderer.domElement.addEventListener("pointerleave",function(){overView=false});
  document.addEventListener("keydown",onKey);
  viewport.addEventListener("wheel",wheel,{capture:true,passive:false});renderer.domElement.addEventListener("dblclick",dblclick);
  root.addEventListener("wheel",rootWheel,{passive:false});
  document.addEventListener("keydown",keyDown);document.addEventListener("keyup",keyUp);document.addEventListener("keydown",shiftKey);document.addEventListener("keyup",shiftKey);
  function releaseKeys(){held.clear()}
  window.addEventListener("blur",releaseKeys);
  controls.addEventListener("change",function(){invalidate(700)});controls.addEventListener("start",function(){flight=null});
  // Anything done on the panels (toggles, the node card, placement) may change the picture.
  ["click","change","input","keydown","pointerup"].forEach(function(t){root.addEventListener(t,invalidate,true)});
  root.querySelectorAll("[data-three-view]").forEach(function(button){button.onclick=function(){setView(button.dataset.threeView)}});
  root.querySelector("#irThreeReset").onclick=function(){setView("iso")};
  root.querySelector("#irThreeAdd")?.addEventListener("click",function(){placing?cancelPlacement():startPlacement()});
  root.querySelector("#irThreeCancelCopy").onclick=cancelCopy;
  root.querySelector("#irThreeColors").value=colorMode;
  root.querySelector("#irThreeColors").onchange=function(e){colorMode=e.target.value;P.onColorModeChange&&P.onColorModeChange(colorMode);refreshMaterials()};
  root.querySelector("#irThreeGrid").onchange=function(e){showGrid=e.target.checked;ground.visible=showGrid};
  root.querySelector("#irThreeAxes").onchange=function(e){showAxes=e.target.checked};
  root.querySelector("#irThreeNodes").onchange=function(e){nodeMode=e.target.value;if(nodeMode==="off"){selectedNode=null;paintNode()}};
  // «Краны» in the legend: the camera goes to the next crane. A crane on a runway is looked at along its span from below
  // the bridge (from above the roof hid it); the crane stands at a third of the runway, the camera on the longer side.
  legend.onclick=function(e){
   if(!e.target.closest("[data-crane]")||!cranes.length)return;
   var k=cranes[craneTurn++%cranes.length],d=Math.max(12,k.size*.9);
   var to=k.along?k.at.clone().add(k.along.clone().multiplyScalar(d)).add(new T.Vector3(0,-2.5,0)):k.at.clone().add(camera.position.clone().sub(controls.target).normalize().multiplyScalar(d));
   flight={from:controls.target.clone(),to:k.at.clone(),camFrom:camera.position.clone(),camTo:to,t:0,ms:850,st:performance.now()};invalidate()
  };
  root.querySelector("#irThreeDetails").onchange=function(e){showDetails=e.target.checked;equipment.visible=showDetails;paintLegend();
   pedestals.forEach(function(m){m.visible=showDetails});rebatch()};
  function resize(){
   var w=Math.max(250,viewport.clientWidth),h=Math.max(300,viewport.clientHeight);
   renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();invalidate()
  }
  var observer=window.ResizeObserver?new ResizeObserver(resize):null;
  if(observer)observer.observe(viewport);
  window.addEventListener("resize",resize);resize();
  function project(v,w,h){var p=v.clone().project(camera);return{x:(p.x*.5+.5)*w,y:(-p.y*.5+.5)*h,inside:p.z<1&&p.z>-1}}
  // Axis bubbles that would cover one another on the screen (dense grids seen from afar) are left out.
  function paintTags(w,h){
   var taken=[];
   screenTags.forEach(function(t){
    var on=t.group==="tank"?true:t.group==="axes"?showAxes&&showGrid:P.showDimensions&&showGrid;
    if(!on){t.el.hidden=true;return}
    var p=project(t.pos,w,h);
    t.el.hidden=!p.inside||p.x<10||p.x>w-10||p.y<10||p.y>h-10;
    if(!t.el.hidden&&t.group==="axes"){
     if(taken.some(function(q){return Math.abs(q.x-p.x)<22&&Math.abs(q.y-p.y)<20}))t.el.hidden=true;else taken.push(p)
    }
    if(!t.el.hidden){t.el.style.left=p.x+"px";t.el.style.top=p.y+"px"}
   })
  }
  // Member labels: nearest first, never on top of each other, at most 160.
  function paintLabels(w,h){
   if(!P.showLabels){labels.forEach(function(l){l.el.hidden=true});return}
   var cam=camera.position,cells=new Set(),shown=0;
   var order=labels.map(function(l){return{l:l,d:l.pos.distanceToSquared(cam)}}).sort(function(a,b){return a.d-b.d});
   order.forEach(function(o){
    var l=o.l,p=project(l.pos,w,h);
    if(shown>=160||!p.inside||p.x<6||p.x>w-6||p.y<6||p.y>h-6){l.el.hidden=true;return}
    var cx=Math.floor(p.x/58),cy=Math.floor(p.y/18),k=cx+":"+cy;
    if(cells.has(k)&&l.id!==selected){l.el.hidden=true;return}
    cells.add(k);shown++;l.el.hidden=false;l.el.classList.toggle("selected",l.id===selected);
    l.el.style.left=p.x+"px";l.el.style.top=p.y+"px"
   })
  }
  // ---- Moving through the model. The wheel flies to the point under the cursor (a member, else the floor); W A S D or
  // the arrows move over the plan along the view, Q and E down and up, Shift faster; a double click makes the point under
  // the cursor the centre of rotation.
  var held=new Set(),overView=false;
  function pointAt(e){
   screenRay(e);var hit=hitMember();if(hit)return hit.point;
   var q=new T.Vector3();return raycaster.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-ground.position.y),q)?q:null
  }
  // The point to fly to or turn about: the member or the floor under the cursor, unless it lies far beyond the centre
  // of rotation (the floor toward the horizon, a member seen through the gaps of a lattice) — then the point of the
  // cursor's ray at the depth of the centre. The engineer, 25.10.2026: «резкие скачки туда сюда» — one notch of the wheel
  // toward the sky flew the camera 280 m past the building.
  function workPoint(e){
   var p=pointAt(e),d=camera.position.distanceTo(controls.target);
   if(p&&p.distanceTo(camera.position)<=Math.max(3,d*2.5))return p;
   return raycaster.ray.at(Math.max(.5,d),new T.Vector3())
  }
  // Like the report of 21.10.2026: each step scales the camera and the centre of rotation toward the point under the
  // cursor (16 % a notch), the point is looked for once and kept while the wheel turns at one place.
  var wheelAt={x:-9,y:-9,t:0,p:null};
  function wheel(e){
   if(placing&&e.ctrlKey)return;
   e.preventDefault();e.stopPropagation();flight=null;
   var now=performance.now(),p;
   if(wheelAt.p&&now-wheelAt.t<250&&Math.hypot(e.clientX-wheelAt.x,e.clientY-wheelAt.y)<4)p=wheelAt.p;
   else{p=workPoint(e);wheelAt={x:e.clientX,y:e.clientY,t:now,p:p}}
   wheelAt.t=now;
   // One event of a fast wheel or a touchpad is no more than about two notches.
   var dy=Math.max(-240,Math.min(240,e.deltaY*(e.deltaMode===1?33:e.deltaMode===2?400:1)));
   var k=Math.pow(1.0015,dy),cam=camera.position;
   var next=p.clone().add(cam.clone().sub(p).multiplyScalar(k));
   if(k<1&&next.distanceTo(p)<.3)return;
   if(k>1&&next.distanceTo(controls.target)>controls.maxDistance)return;
   controls.target.copy(p.clone().add(controls.target.clone().sub(p).multiplyScalar(k)));cam.copy(next);invalidate(700)
  }
  // The wheel over the bars laid on the picture (the tools, the legend, the hints) turns the model too: it scrolled the
  // page under them, and the whole picture jumped up and down between the turns of the model (the engineer, 25.10.2026:
  // «резкие скачки туда сюда»). A list that scrolls itself keeps its wheel.
  function rootWheel(e){
   if(viewport.contains(e.target))return;
   for(var n=e.target;n&&n!==root;n=n.parentElement){
    if(/^(SELECT|TEXTAREA|DIALOG)$/.test(n.tagName))return;
    var oy=getComputedStyle(n).overflowY;if((oy==="auto"||oy==="scroll")&&n.scrollHeight>n.clientHeight+1)return
   }
   var r=viewport.getBoundingClientRect();
   if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){e.preventDefault();return}
   wheel(e)
  }
  function dblclick(e){
   if(placing||copySource)return;
   var p=pointAt(e);if(!p||p.distanceTo(camera.position)>Math.max(3,camera.position.distanceTo(controls.target)*4))return;
   var shift=p.clone().sub(controls.target);
   flight={from:controls.target.clone(),to:p,camFrom:camera.position.clone(),camTo:camera.position.clone().add(shift),t:0,ms:280,st:performance.now(),out:true}
  }
  var walkKeys={KeyW:1,KeyA:1,KeyS:1,KeyD:1,KeyQ:1,KeyE:1,ArrowUp:1,ArrowDown:1,ArrowLeft:1,ArrowRight:1};
  function typing(t){return t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))}
  function keyDown(e){
   if(!walkKeys[e.code]||e.ctrlKey||e.altKey||e.metaKey||typing(e.target))return;
   if(!overView&&!root.contains(document.activeElement))return;
   held.add(e.code);e.preventDefault()
  }
  function keyUp(e){held.delete(e.code)}
  function walk(dt){
   if(!held.size||!dt)return false;
   var f=camera.getWorldDirection(new T.Vector3());f.y=0;if(f.lengthSq()<1e-6)f.set(0,0,-1).applyQuaternion(camera.quaternion).setY(0);f.normalize();
   var r=new T.Vector3(-f.z,0,f.x),v=new T.Vector3(),has=function(a,b){return held.has(a)||held.has(b)};
   if(has("KeyW","ArrowUp"))v.add(f);if(has("KeyS","ArrowDown"))v.sub(f);if(has("KeyD","ArrowRight"))v.add(r);if(has("KeyA","ArrowLeft"))v.sub(r);
   if(held.has("KeyE"))v.y+=1;if(held.has("KeyQ"))v.y-=1;
   if(v.lengthSq()<1e-6)return false;
   var speed=Math.max(3,Math.min(60,camera.position.distanceTo(controls.target)*.7))*(held.has("ShiftLeft")||held.has("ShiftRight")||window.event&&window.event.shiftKey?3:1);
   v.normalize().multiplyScalar(speed*dt);camera.position.add(v);controls.target.add(v);flight=null;return true
  }
  function shiftKey(e){if(e.code==="ShiftLeft"||e.code==="ShiftRight"){if(e.type==="keydown")held.add(e.code);else held.delete(e.code)}}
  // The picture is drawn again only when something changed: the camera, the members, a toggle (a still scheme cost
  // a full redraw of thousands of members and labels every frame).
  var dirty=true,lastTime=0,needUntil=0,drew=false,slow=0;
  function goLight(){light=true;renderer.setPixelRatio(.75);lodAt=null;resize();showLight()}
  function showLight(){var n=root.querySelector("#irThreeLight");if(n)n.hidden=!light}
  // A change draws the picture now and for a while after it (the camera eases out of a turn, like the report).
  function invalidate(ms){dirty=true;if(ms>0)needUntil=Math.max(needUntil,performance.now()+ms)}
  // Near and far planes follow the distance to the centre: no flicker of faces close up, nothing cut far away.
  function camRange(){var d=camera.position.distanceTo(controls.target),n=Math.max(.02,d/300),f=Math.max(600,d*25+400);
   if(Math.abs(camera.near-n)>n*.05||camera.far!==f){camera.near=n;camera.far=f;camera.updateProjectionMatrix()}}
  function frame(time){
   if(!alive)return;
   raf=requestAnimationFrame(frame);
   var gap=(time||0)-lastTime,dt=Math.min(.1,Math.max(0,gap/1000));lastTime=time||0;
   // The frame after a picture came late: that picture took that long.
   if(drew&&!light&&gap>400){if(++slow>=3)goLight()}else if(drew)slow=0;drew=false;
   if(flight){
    flight.t=Math.min(1,(performance.now()-(flight.st||0))/(flight.ms||850));
    var k=flight.out?flight.t*(2-flight.t):flight.t<.5?4*flight.t*flight.t*flight.t:1-Math.pow(-2*flight.t+2,3)/2;
    controls.target.lerpVectors(flight.from,flight.to,k);camera.position.lerpVectors(flight.camFrom,flight.camTo,k);
    if(flight.t>=1)flight=null;dirty=true
   }
   if(walk(dt))dirty=true;
   if(controls.update())dirty=true;
   if(performance.now()<needUntil)dirty=true;
   if(pendingHover)hoverNow();
   if(!dirty)return;dirty=false;camRange();
   var w=viewport.clientWidth,h=viewport.clientHeight;
   paintTags(w,h);paintLabels(w,h);paintCallouts(w,h);paintNodesFrame();lod();
   renderer.render(scene,camera);drew=true;
   if(!firstPaint){firstPaint=true;P.onFirstPaint&&P.onFirstPaint()}
  }
  // The members are rebuilt only when they changed: choosing a member or a toggle on the page only repaints.
  var built="";
  function signature(list){try{return JSON.stringify(list||[])}catch(e){return String(Math.random())}}
  function update(next){
   var keepPlace=P.lastTopZ,keepLevel=P.lastLevel,mode=colorMode;
   P=next;P.lastTopZ=keepPlace;P.lastLevel=keepLevel;
   // The page opened again over the built model waits for its own first picture (its loading screen stayed forever:
   // the model was drawn behind it, but only the first opening was told so).
   firstPaint=false;
   if(COLOR_MODES.indexOf(P.colorMode)>=0&&P.colorMode!==colorMode){colorMode=P.colorMode;root.querySelector("#irThreeColors").value=colorMode}
   selected=String(P.selected||"");
   var sig=signature(P.elements);
   if(sig!==built){built=sig;buildMembers(P.elements);buildCranes();buildTankDims();buildNodes();lowerGround();refreshMaterials()}
   else if(mode!==colorMode)refreshMaterials();
   else paintHighlight();
   applyBackground();dims.visible=Boolean(P.showDimensions);invalidate();
   if(placing){
    var m=placing.mark&&(P.marks||[]).find(function(x){return String(x.id)===String(placing.mark.id)});
    if(m&&m.left>0)placing.mark=m;else{var left=(P.marks||[]).filter(function(x){return x.left>0});if(left.length)selectMark(left[0].id);else placing.mark=null}
    paintPlacement()
   }
  }
  built=signature(P.elements);buildMembers(P.elements);buildCranes();buildTankDims();buildNodes();lowerGround();applyBackground();refreshMaterials();dims.visible=Boolean(P.showDimensions);
  var memory=cameraMemory[memoryKey];
  if(memory){camera.position.copy(memory.position);controls.target.copy(memory.target);camera.up.copy(memory.up);controls.update()}
  else setView("iso");
  showLight();frame();
  // Footings below ±0.000 (bases at −0.600): the floor, the grid and the dimensions go down to the lowest member,
  // so that bases and their plates stay above the floor.
  function lowerGround(){
   var low=0;elems.forEach(function(c){var z=Math.min(number(c.z0),c.geometryType==="column"?number(c.z0):number(c.z2));if(z<low)low=z});
   var y=Math.min(0,low/1000+.12);ground.position.y=y;dims.position.y=y
  }
  function nodeList(){return nodes.map(function(n){return{id:n.id,kind:n.kind,name:nodeKinds[n.kind],status:n.status,x:n.x,y:n.y,z:n.z,axes:axisOf(n.x,n.y),
   members:n.members.map(function(m){return{id:String(m.c.id),mark:m.c.mark||"",role:m.role,status:m.c.status||"planned"}})}})}
  function openNode(id){var n=nodes.find(function(x){return x.id===id});if(n)chooseNode(n);return Boolean(n)}
  // Pictures of the scheme for an exported file opened where its scripts do not run (the iPhone preview): the whole
  // model from fixed views with the axis bubbles and the legend drawn in. The camera and the colours come back after.
  // 1280 × 800, JPEG 74 % (1600 × 1000 at 84 % were a megabyte of the file in five pictures).
  function snapshots(){
   setExplode(null,0);var range=nodePanel&&nodePanel.querySelector('[data-node="explode"]');if(range)range.value=0;
   var W=1280,H=800,ratio=renderer.getPixelRatio(),keep={pos:camera.position.clone(),target:controls.target.clone(),up:camera.up.clone(),mode:colorMode},out=[];
   renderer.setPixelRatio(1);renderer.setSize(W,H,false);camera.aspect=W/H;camera.updateProjectionMatrix();overlay.visible=false;
   var shot=function(title,view,mode){
    if(mode!==colorMode){colorMode=mode;refreshMaterials()}
    // The view set as on the toolbar, then moved along its direction so that the whole model fills the picture.
    setView(view);var sphere=new T.Box3().setFromObject(batches).getBoundingSphere(new T.Sphere());
    if(sphere.radius>0){var dir=camera.position.clone().sub(controls.target).normalize(),fov=camera.fov*Math.PI/360,fit=sphere.radius/Math.sin(Math.min(fov,Math.atan(Math.tan(fov)*camera.aspect)));
     controls.target.copy(sphere.center);camera.position.copy(sphere.center).add(dir.multiplyScalar(fit*.8));camera.lookAt(sphere.center)}
    paintNodesFrame();helpers.visible=false;renderer.render(scene,camera);helpers.visible=true;
    var c=document.createElement("canvas");c.width=W;c.height=H;var g=c.getContext("2d");g.drawImage(renderer.domElement,0,0,W,H);
    if(showAxes&&showGrid){var taken=[];g.font="600 22px system-ui,sans-serif";g.textAlign="center";g.textBaseline="middle";
     screenTags.forEach(function(t){if(t.group!=="axes")return;var q=project(t.pos,W,H);if(!q.inside||q.x<14||q.x>W-14||q.y<14||q.y>H-14)return;
      if(taken.some(function(o){return Math.abs(o.x-q.x)<46&&Math.abs(o.y-q.y)<36}))return;taken.push(q);
      var hw=Math.max(17,g.measureText(t.el.textContent).width/2+9);g.beginPath();g.moveTo(q.x-hw+17,q.y-17);g.lineTo(q.x+hw-17,q.y-17);
      g.arc(q.x+hw-17,q.y,17,-Math.PI/2,Math.PI/2);g.lineTo(q.x-hw+17,q.y+17);g.arc(q.x-hw+17,q.y,17,Math.PI/2,Math.PI*1.5);g.closePath();g.fillStyle="rgba(255,255,255,.85)";g.fill();
      g.strokeStyle="#9fb4c6";g.lineWidth=1.5;g.stroke();g.fillStyle="#3d5d76";g.fillText(t.el.textContent,q.x,q.y+1)})}
    // The tank's diameter and height, as on the screen.
    g.font="700 20px system-ui,sans-serif";g.textAlign="center";g.textBaseline="middle";
    screenTags.forEach(function(t){if(t.group!=="tank")return;var q=project(t.pos,W,H);if(!q.inside||q.x<60||q.x>W-60||q.y<14||q.y>H-14)return;
     var tw=g.measureText(t.el.textContent).width+14;g.fillStyle="rgba(255,255,255,.88)";g.fillRect(q.x-tw/2,q.y-14,tw,28);g.fillStyle="#173f5b";g.fillText(t.el.textContent,q.x,q.y+1)});
    var rows=legendRows().slice(0,mode==="mark"?12:16),x=18,y=H-24;g.font="600 28px system-ui,sans-serif";g.textAlign="left";g.textBaseline="middle";
    rows.slice(0,8).reverse().forEach(function(r,i){var t=r.name+" · "+r.n,w=g.measureText(t).width+58;
     g.fillStyle="rgba(255,255,255,.9)";g.fillRect(x-8,y-22-i*46,w,44);g.fillStyle="#"+r.color.toString(16).padStart(6,"0");g.fillRect(x,y-12-i*46,24,24);
     g.fillStyle="#1d2b3a";g.fillText(t,x+34,y+1-i*46)});
    out.push({title:title,src:c.toDataURL("image/jpeg",.74)})
   };
   try{
    shot("Общий вид · цвет по монтажу","iso","status");shot("Общий вид · цвет по видам конструкций","iso","type");
    shot("Сверху · цвет по видам","top","type");shot("Фасад · цвет по монтажу","front","status");shot("Сбоку · цвет по монтажу","side","status")
   }finally{
    if(colorMode!==keep.mode){colorMode=keep.mode;refreshMaterials()}
    overlay.visible=true;camera.position.copy(keep.pos);controls.target.copy(keep.target);camera.up.copy(keep.up);camera.lookAt(controls.target);controls.update();
    renderer.setPixelRatio(ratio);resize();
    root.querySelectorAll("[data-three-view]").forEach(function(b){b.classList.toggle("active",b.dataset.threeView==="iso")})
   }
   return out
  }
  return{host:host,key:key,root:root,update:update,focus:focus,startCopy:startCopy,startPlacement:startPlacement,nodes:nodeList,openNode:openNode,snapshots:snapshots,card:card,lightPart:lightPart,
   dispose:function(){
    cameraMemory[memoryKey]={position:camera.position.clone(),target:controls.target.clone(),up:camera.up.clone()};
    alive=false;clearExplode();cancelCopy();cancelPlacement();if(raf)cancelAnimationFrame(raf);
    observer&&observer.disconnect();window.removeEventListener("resize",resize);document.removeEventListener("keydown",onKey);
    renderer.domElement.removeEventListener("pointerdown",down);
    renderer.domElement.removeEventListener("mousedown",noAutoscroll);
    renderer.domElement.removeEventListener("pointerup",up);
    renderer.domElement.removeEventListener("pointermove",move);
    renderer.domElement.removeEventListener("pointerleave",leave);
    viewport.removeEventListener("wheel",wheel,true);root.removeEventListener("wheel",rootWheel);renderer.domElement.removeEventListener("dblclick",dblclick);
    document.removeEventListener("keydown",keyDown);document.removeEventListener("keyup",keyUp);document.removeEventListener("keydown",shiftKey);document.removeEventListener("keyup",shiftKey);
    window.removeEventListener("blur",releaseKeys);
    controls.dispose();clearNodes();clearCallouts();partMats.forEach(function(m){m.dispose()});nodeGeo.dispose();nodeMats.forEach(function(m){m.dispose()});boltMat.dispose();plateMat.dispose();concreteMat.dispose();craneMat.dispose();hoistMat.dispose();wheelMat.dispose();glassMat.dispose();openingGlass.dispose();hardwareMat.dispose();silverMat.dispose();fixedMats.forEach(function(m){m.dispose()});boltMats["8.8"].dispose();boltMats["5.8"].dispose();
    meshGeo.forEach(function(g){g.dispose()});mats.forEach(function(m){m.dispose()});if(metalEnv)metalEnv.dispose();shellMats.forEach(function(m){m.dispose()});roofMats.forEach(function(m){m.dispose()});
    [selectedMat,hoverMat,axisMaterial,dimMaterial,floorMaterial,darkFloorMaterial,markerMat,pointMat,previewMat].forEach(function(m){m.dispose()});
    var cached=new Set(meshGeo.values());
    [scene,steel].forEach(function(top){top.traverse(function(obj){if(obj.geometry&&obj.geometry.dispose&&!cached.has(obj.geometry))obj.geometry.dispose()})});
    renderer.dispose();renderer.forceContextLoss?.();
    renderer.domElement.remove()
   }}
 }
 // The sortament rows for an exported scheme: only what drawing a section takes.
 function sectionRows(){
  return loadSections().then(function(){var out=[];sections.forEach(function(r){var o={};
   ["id","status","standard","h_mm","b_mm","B_mm","b1_mm","a_mm","s_mm","t_mm","R_mm","r_mm","diameters_mm","thicknesses_mm","sizes_mm","rows","mass_kg_m"].forEach(function(k){if(r[k]!=null)o[k]=r[k]});out.push(o)});return out})
 }
 return{render:render,dispose:dispose,sectionOf:sectionOf,massPerMetre:massPerMetre,clipTruss:clipTruss,loadSections:loadSections,sectionRows:sectionRows,fastenerRows:fastenerRows,jointKbRows:jointKbRows,
  focus:function(id){return call("focus",id)},
  startCopy:function(id){return call("startCopy",id)},
  startPlacement:function(){return call("startPlacement")},
  nodes:function(){return call("nodes")||[]},
  openNode:function(id){return call("openNode",id)},
  card:function(id){return call("card",id)||null},
  lightPart:function(pos){return call("lightPart",pos)},
  snapshots:function(){return call("snapshots")||[]}}
})();
