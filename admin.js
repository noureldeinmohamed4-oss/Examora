import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, getDoc, updateDoc} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {finished, endAt, fdt, tms} from "./time.js";

const TABS = [["pending","قيد المراجعة"],["active","مفعّلة"],["suspended","موقوفة"]];
const TOP = [["acc","الحسابات"],["cnt","المدرسين والمحتوى"]];
const SUB = [["lec","المحاضرات"],["exm","الامتحانات"],["hw","الواجبات"],["stu","الطلاب"]];
const TN = {explain:"شرح", homework:"واجب", exam:"امتحان"};
const tel = n => n ? `<a href="tel:${esc(n)}" dir="ltr">${esc(n)}</a>` : "";
const fm = ms => ms ? new Date(ms).toLocaleString("ar-EG", {dateStyle:"medium", timeStyle:"short"}) : "—";
const LOAD = '<p class="muted center">جاري التحميل…</p>';
const ERR = '<p class="err center">تعذّر التحميل. تأكد من الإنترنت وقواعد Firestore.</p>';
const get = async (c, ...w) => (await getDocs(query(collection(db, c), ...w))).docs.map(x => ({id: x.id, ...x.data()}));
const back = (id, t = "رجوع") => `<button id="${id}" class="lnk" type="button">${ic("back", 18)} ${t}</button>`;

export function renderAdmin(el){
  let sec = "acc";
  el.innerHTML = `<div class="card"><h2 class="h">لوحة الأدمن</h2><div class="tabs" id="top"></div></div><div id="ls" style="margin-top:14px"></div>`;
  const top = $("#top", el), body = $("#ls", el);
  const drawTop = () => {
    top.innerHTML = TOP.map(([k,t]) => `<button type="button" data-s="${k}" class="${k===sec?"on":""}">${t}</button>`).join("");
    top.querySelectorAll("button").forEach(b => b.onclick = () => { sec = b.dataset.s; drawTop(); sec === "acc" ? accounts() : teachers(); });
  };

  /* ---------- الحسابات ---------- */
  function accounts(){
    let tab = "pending", rows = [], q = "";
    body.innerHTML = `<div class="card"><div class="tabs" id="tb"></div><input id="q" placeholder="بحث بالاسم أو الرقم"><div id="al"></div></div>`;
    const al = $("#al", body), tb = $("#tb", body);
    const drawTabs = () => {
      tb.innerHTML = TABS.map(([k,t]) => `<button type="button" data-t="${k}" class="${k===tab?"on":""}">${t}</button>`).join("");
      tb.querySelectorAll("button").forEach(b => b.onclick = () => { tab = b.dataset.t; drawTabs(); load(); });
    };
    const draw = () => {
      const k = q.trim().toLowerCase();
      const list = rows.filter(r => !k || [r.name, r.phone, r.parentPhone, r.email].some(x => String(x || "").toLowerCase().includes(k)));
      if (!list.length) { al.innerHTML = '<p class="muted center">مفيش حسابات هنا</p>'; return; }
      al.innerHTML = list.map(r => `<div class="item"><b>${esc(r.name)}</b><small>${r.role==="teacher"?"مدرس · "+esc(r.subject):"طالب"}</small><small>الرقم: ${tel(r.phone)}</small>${r.parentPhone?`<small>ولي الأمر: ${tel(r.parentPhone)}</small>`:""}<small dir="ltr">${esc(r.email)}</small><div class="acts">${tab!=="active"?`<button class="btn p sm" data-id="${r.id}" data-s="active">تفعيل</button>`:""}${tab!=="suspended"?`<button class="btn s sm" data-id="${r.id}" data-s="suspended">إيقاف</button>`:""}</div></div>`).join("");
      al.querySelectorAll("[data-id]").forEach(b => b.onclick = async () => {
        if (b.dataset.s === "suspended" && !confirm("متأكد من الإيقاف؟")) return;
        b.disabled = true;
        try { await updateDoc(doc(db, "users", b.dataset.id), {status: b.dataset.s}); toast("تم"); load(); }
        catch (e) { toast("حصل خطأ، حاول تاني"); b.disabled = false; }
      });
    };
    async function load(){
      al.innerHTML = LOAD;
      try {
        const s = await getDocs(query(collection(db, "users"), where("status", "==", tab)));
        rows = await Promise.all(s.docs.map(async d => { const p = await getDoc(doc(db, "private", d.id)); return {id: d.id, ...d.data(), ...(p.exists() ? p.data() : {})}; }));
        rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        draw();
      } catch (e) { al.innerHTML = ERR; }
    }
    $("#q", body).oninput = e => { q = e.target.value; draw(); };
    drawTabs(); load();
  }

  /* ---------- المدرسين ---------- */
  async function teachers(){
    body.innerHTML = LOAD;
    try {
      const ts = await get("users", where("role", "==", "teacher"), where("status", "==", "active"));
      body.innerHTML = `<div class="card"><h2 class="h">المدرسين (${ts.length})</h2>${ts.length ? ts.map(t => `<div class="item lrow"><div class="lt" data-t="${t.id}"><b>${esc(t.name)}</b><small>${esc(t.subject)}</small></div></div>`).join("") : '<p class="muted center">مفيش مدرسين مفعّلين</p>'}</div>`;
      body.querySelectorAll("[data-t]").forEach(b => b.onclick = () => teacher(ts.find(x => x.id === b.dataset.t)));
    } catch (e) { body.innerHTML = ERR; }
  }

  async function teacher(t, tab = "lec", data){
    if (!data) {
      body.innerHTML = LOAD;
      try {
        const w = where("teacherUid", "==", t.id);
        const [lects, exams, hws, links, atts, subs] = await Promise.all([get("lectures", w), get("exams", w), get("homeworks", w), get("links", w), get("attempts", w), get("subs", w)]);
        lects.sort((a, b) => a.order - b.order);
        data = {lects, exams, hws, links, atts, subs};
      } catch (e) { body.innerHTML = ERR; return; }
    }
    const {lects, exams, hws, links, atts, subs} = data;
    const names = {}; links.forEach(l => { names[l.studentUid] = l.studentName; });
    const view = {
      lec: () => lects.length ? lects.map(l => `<div class="item"><b>${esc(l.title)}</b>${l.hidden ? " <small class='muted'>مخفية</small>" : ""}${l.parts.length ? l.parts.map(p => `<small>${TN[p.type]} · ${esc(p.title)}</small>`).join("") : "<small>مفيش أجزاء</small>"}</div>`).join("") : '<p class="muted center">مفيش محاضرات</p>',
      exm: () => exams.length ? exams.map(e => { const a = atts.filter(x => x.examId === e.id); return `<div class="item lrow"><div class="lt"><b>${esc(e.title)}</b><small>${e.published ? "منشور" : "مسودة"} · ${e.questions.length} سؤال · ينتهي ${fm(e.end)}</small><small>دخل ${a.length} · سلّم ${a.filter(x => finished(x, e)).length}</small></div><button class="btn s sm" type="button" data-e="${e.id}">الدرجات</button></div>`; }).join("") : '<p class="muted center">مفيش امتحانات</p>',
      hw: () => hws.length ? hws.map(h => { const s = subs.filter(x => x.partId === h.id); return `<div class="item lrow"><div class="lt"><b>${esc(h.title)}</b><small>تسليمات ${s.length}</small></div><button class="btn s sm" type="button" data-h="${h.id}">التسليمات</button></div>`; }).join("") : '<p class="muted center">مفيش واجبات</p>',
      stu: () => links.length ? links.map(l => `<div class="item"><b>${esc(l.studentName)}</b><small>${l.status === "suspended" ? "موقوف" : "نشط"}</small></div>`).join("") : '<p class="muted center">مفيش طلاب</p>'
    };
    body.innerHTML = `<div class="card">${back("bk", "رجوع للمدرسين")}<h2 class="h" style="margin-top:10px">${esc(t.name)} · ${esc(t.subject)}</h2><div class="tabs" id="st">${SUB.map(([k,x]) => `<button type="button" data-k="${k}" class="${k===tab?"on":""}">${x}</button>`).join("")}</div>${view[tab]()}</div>`;
    $("#bk", body).onclick = teachers;
    body.querySelectorAll("#st button").forEach(b => b.onclick = () => teacher(t, b.dataset.k, data));
    body.querySelectorAll("[data-e]").forEach(b => b.onclick = () => examGrades(t, exams.find(x => x.id === b.dataset.e), atts.filter(x => x.examId === b.dataset.e), names, () => teacher(t, "exm", data)));
    body.querySelectorAll("[data-h]").forEach(b => b.onclick = () => hwGrades(hws.find(x => x.id === b.dataset.h), subs.filter(x => x.partId === b.dataset.h), names, () => teacher(t, "hw", data)));
  }

  async function examGrades(t, ex, atts, names, bk){
    body.innerHTML = LOAD;
    let key;
    try { const k = await getDoc(doc(db, "exams", ex.id, "key", "main")); key = k.exists() ? k.data().answers : {}; }
    catch (e) { body.innerHTML = ERR; return; }
    const qs = ex.questions, total = qs.reduce((s, q) => s + q.points, 0);
    const gr = (a, q) => (a.grades || {})[q.id] ?? (q.type === "essay" ? null : ((a.answers || {})[q.id] === key[q.id] ? q.points : 0));
    const score = a => qs.reduce((s, q) => s + (gr(a, q) || 0), 0);
    const pend = a => qs.some(q => q.type === "essay" && (a.grades || {})[q.id] == null);
    const rows = [...atts].sort((a, b) => score(b) - score(a));
    body.innerHTML = `<div class="card">${back("bk")}<h2 class="h" style="margin-top:10px">${esc(ex.title)}</h2><p class="muted small">${esc(t.name)} · الدرجة الكلية ${total}</p></div><div class="card" style="margin-top:14px;overflow-x:auto"><table class="tbl"><tr><th>#</th><th>الاسم</th><th>الدرجة</th><th>دخل</th><th>خلّص</th><th>الحالة</th></tr>${rows.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(names[a.studentUid] || "طالب")}</td><td>${score(a)} / ${total}</td><td>${esc(fdt(tms(a.startedAt)))}</td><td>${finished(a, ex) ? esc(fdt(endAt(a, ex))) : "—"}</td><td>${a.submitted ? "سلّم" : finished(a, ex) ? "انتهى وقته" : "لسه"}${pend(a) ? " · مقالي مستني" : ""}${a.released ? " · ظاهرة" : ""}</td></tr>`).join("") || '<tr><td colspan="6" class="muted center">لسه ما حدش دخل.</td></tr>'}</table></div>`;
    $("#bk", body).onclick = bk;
  }

  function hwGrades(h, subs, names, bk){
    body.innerHTML = `<div class="card">${back("bk")}<h2 class="h" style="margin-top:10px">${esc(h.title)}</h2><p class="muted small">التسليمات: ${subs.length}</p></div><div class="card" style="margin-top:14px;overflow-x:auto"><table class="tbl"><tr><th>الاسم</th><th>وقت التسليم</th></tr>${subs.map(s => `<tr><td>${esc(names[s.studentUid] || "طالب")}</td><td>${s.createdAt && s.createdAt.toMillis ? fm(s.createdAt.toMillis()) : "—"}</td></tr>`).join("") || '<tr><td colspan="2" class="muted center">لسه ما حدش سلّم.</td></tr>'}</table></div>`;
    $("#bk", body).onclick = bk;
  }

  drawTop(); accounts();
}
