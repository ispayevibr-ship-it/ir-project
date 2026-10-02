"use strict";
const app = document.getElementById("app");
function render() {
  const route = location.hash.slice(1) || "/objects";
  if (route !== "/objects") {
    location.hash = "/objects";
    return;
  }
  app.innerHTML = "<h1>Objects</h1>";
}
window.addEventListener("hashchange", render);
render();
