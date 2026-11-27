import {ic, esc} from "./ui.js";

let box = null;
const onKey = e => { if (e.key === "Escape") closeMenu(); };
export function closeMenu(){
  if (!box) return;
  const b = box; box = null;
  document.removeEventListener("keydown", onKey);
  document.body.style.overflow = "";
  b.classList.remove("in");
  setTimeout(() => b.remove(), 220);
  const mn = document.getElementById("mn"); if (mn && mn.focus) mn.focus();
}
/* c = {name, role, items: [{label, icon, on, active, out}]} */
export function openMenu(c){
  if (box) return closeMenu();
  const el = document.createElement("div");
  el.className = "drw";
  el.innerHTML = `<div class="drb"></div><aside class="dr" role="dialog" aria-modal="true" aria-label="القايمة"><div class="drh"><button class="drx" type="button" aria-label="إغلاق القايمة">${ic("back", 22)}</button>${c.name ? `<div class="dru"><b>${esc(c.name)}</b><small>${esc(c.role)}</small></div>` : '<div class="dru"><b>Examora</b></div>'}</div><nav class="drn">${c.items.map((it, i) => `<button class="dri${it.active ? " on" : ""}${it.out ? " out" : ""}" type="button" data-i="${i}">${ic(it.icon, 22)}<span>${esc(it.label)}</span></button>`).join("")}</nav></aside>`;
  document.body.appendChild(el);
  box = el;
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", onKey);
  el.querySelector(".drb").onclick = closeMenu;
  el.querySelector(".drx").onclick = closeMenu;
  el.querySelectorAll(".dri").forEach(b => b.onclick = () => { const it = c.items[+b.dataset.i]; closeMenu(); if (it && it.on) it.on(); });
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  const x = el.querySelector(".drx"); if (x && x.focus) x.focus();
}
