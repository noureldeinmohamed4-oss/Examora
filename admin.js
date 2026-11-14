import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, getDoc, updateDoc} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast} from "./ui.js";

const TABS = [["pending","قيد المراجعة"],["active","مفعّلة"],["suspended","موقوفة"]];
const tel = n => n ? `<a href="tel:${esc(n)}" dir="ltr">${esc(n)}</a>` : "";

export function renderAdmin(el){
  let tab = "pending", rows = [], q = "";
  el.innerHTML = `<div class="card"><h2 class="h">لوحة الأدمن</h2><div class="tabs" id="tb"></div><input id="q" placeholder="بحث بالاسم أو الرقم"><div id="ls"></div></div>`;
  const ls = $("#ls", el), tb = $("#tb", el);
  const drawTabs = () => {
    tb.innerHTML = TABS.map(([k,t]) => `<button type="button" data-t="${k}" class="${k===tab?"on":""}">${t}</button>`).join("");
    tb.querySelectorAll("button").forEach(b => b.onclick = () => { tab = b.dataset.t; drawTabs(); load(); });
  };
  const draw = () => {
    const k = q.trim().toLowerCase();
    const list = rows.filter(r => !k || [r.name, r.phone, r.parentPhone, r.email].some(x => String(x || "").toLowerCase().includes(k)));
    if (!list.length) { ls.innerHTML = '<p class="muted center">مفيش حسابات هنا</p>'; return; }
    ls.innerHTML = list.map(r => `<div class="item"><b>${esc(r.name)}</b><small>${r.role==="teacher"?"مدرس · "+esc(r.subject):"طالب"}</small><small>الرقم: ${tel(r.phone)}</small>${r.parentPhone?`<small>ولي الأمر: ${tel(r.parentPhone)}</small>`:""}<small dir="ltr">${esc(r.email)}</small><div class="acts">${tab!=="active"?`<button class="btn p sm" data-id="${r.id}" data-s="active">تفعيل</button>`:""}${tab!=="suspended"?`<button class="btn s sm" data-id="${r.id}" data-s="suspended">إيقاف</button>`:""}</div></div>`).join("");
    ls.querySelectorAll("[data-id]").forEach(b => b.onclick = async () => {
      if (b.dataset.s === "suspended" && !confirm("متأكد من الإيقاف؟")) return;
      b.disabled = true;
      try { await updateDoc(doc(db, "users", b.dataset.id), {status: b.dataset.s}); toast("تم"); load(); }
      catch (e) { toast("حصل خطأ، حاول تاني"); b.disabled = false; }
    });
  };
  async function load(){
    ls.innerHTML = '<p class="muted center">جاري التحميل…</p>';
    try {
      const s = await getDocs(query(collection(db, "users"), where("status", "==", tab)));
      rows = await Promise.all(s.docs.map(async d => { const p = await getDoc(doc(db, "private", d.id)); return {id: d.id, ...d.data(), ...(p.exists() ? p.data() : {})}; }));
      rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      draw();
    } catch (e) { ls.innerHTML = '<p class="err center">تعذّر التحميل. تأكد من الإنترنت وقواعد Firestore.</p>'; }
  }
  $("#q", el).oninput = e => { q = e.target.value; draw(); };
  drawTabs(); load();
}
