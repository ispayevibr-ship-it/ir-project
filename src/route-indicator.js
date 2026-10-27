"use strict";
// The route label at the bottom of the window («objects/id1/…») is not shown any more (the engineer, 27.10.2026:
// «убери надпись снизу objects/id и тд, уже не нужно»); a label left by an older copy of the page is removed.
(()=>{const drop=()=>document.getElementById("routeIndicator")?.remove();drop();window.addEventListener("hashchange",drop)})();
