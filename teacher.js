import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {examBuilder} from "./exam.js";
import {hwBuilder} from "./homework.js";

const TYPES = {explain: ["شرح", "vid"], homework: ["واجب", "doc"], exam: ["امتحان", "exam"]};
const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => CH[n % 32]).join("");
const ab = (act, icon, label, id = "", extra = "") => `<button class="ab" type="button" data-act="${act}" data-id="${id}" ${extra} aria-label="${label}">${ic(icon, 18)}</button>`;

export async function renderTeacher(el, uid, d){
  let lects = [], stu = [], cur = null, code = d.code;
  const load = async () => {
    const s = await getDocs(query(collection(db, "lectures"), where("teacherUid", "==", uid)));
    lects = s.docs.map(x => ({id: x.id, ...x.data()})).sort((a, b) => a.order - b.order);
    const s2 = await getDocs(query(collection(db, "links"), where("teacherUid", "==", uid)));
    stu = s2.docs.map(x => ({id: x.id, ...x.data()}));
  };
  const studentsCard = () => { const a = stu.filter(x => x.code === code); return `<div class="card" style="margin-top:14px"><h2 class="h">الطلاب (${a.length})</h2>${a.length ? a.map(x => `<div class="item lrow"><div class="lt"><b>${esc(x.studentName)}</b><small>${x.status === "suspended" ? "موقوف" : "نشط"}</small></div><button class="btn s sm" type="button" data-st="${x.id}" data-to="${x.status === "suspended" ? "active" : "suspended"}">${x.status === "suspended" ? "تفعيل" : "إيقاف"}</button></div>`).join("") : '<p class="muted center">لسه مفيش طلاب. ابعت كودك للطلاب.</p>'}</div>`; };
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast("حصل خطأ، حاول تاني"); } };
  const save = async (l, patch) => { await updateDoc(doc(db, "lectures", l.id), patch); Object.assign(l, patch); };
  const swap = (arr, i, j) => { if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };

  function home(){
    cur = null;
    el.innerHTML = `<div class="card"><b>${esc(d.name)}</b><small class="muted" style="display:block">مدرس · ${esc(d.subject)}</small><div class="codebox"><div><small class="muted">كودك</small><b class="code" dir="ltr">${esc(code)}</b></div><div class="acts" style="margin:0"><button id="cp" class="btn s sm" type="button">نسخ</button><button id="cc" class="btn s sm" type="button">تغيير</button></div></div></div>${studentsCard()}
<div class="card" style="margin-top:14px"><h2 class="h">المحاضرات (${lects.length})</h2><div class="addrow"><input id="nt" placeholder="اسم المحاضرة (مثال: المحاضرة الأولى)" aria-label="اسم المحاضرة"><button id="add" class="btn p sm" type="button">إضافة</button></div><div id="ls">${lects.length ? lects.map(l => `<div class="item lrow"><div class="lt" data-act="open" data-id="${l.id}"><b>${esc(l.title)}</b><small>${l.parts.length} أجزاء · ${l.mode === "open" ? "مفتوحة" : "بالترتيب"}${l.hidden ? " · مخفية" : ""}</small></div>${ab("up", "up", "فوق", l.id)}${ab("down", "down", "تحت", l.id)}${ab("hide", l.hidden ? "eyeoff" : "eye", l.hidden ? "إظهار" : "إخفاء", l.id)}${ab("del", "trash", "مسح", l.id)}</div>`).join("") : '<p class="muted center">مفيش محاضرات لسه. أضف أول محاضرة.</p>'}</div></div>`;
    $("#cp", el).onclick = () => navigator.clipboard.writeText(code).then(() => toast("اتنسخ الكود"), () => toast(code));
    el.querySelectorAll("[data-st]").forEach(b => b.onclick = () => run(async () => { if (b.dataset.to === "suspended" && !confirm("إيقاف الطالب ده من عندك؟")) return; await updateDoc(doc(db, "links", b.dataset.st), {status: b.dataset.to}); stu.find(y => y.id === b.dataset.st).status = b.dataset.to; home(); }));
    $("#cc", el).onclick = () => run(async () => {
      if (!confirm("تغيير الكود هيفصل طلابك الحاليين لحد ما يكتبوا الكود الجديد. متأكد؟")) return;
      let n = null;
      for (let i = 0; i < 5 && !n; i++) { const c = genCode(); const {getDoc} = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"); if (!(await getDoc(doc(db, "codes", c))).exists()) n = c; }
      if (!n) throw 0;
      const b = writeBatch(db);
      b.set(doc(db, "codes", n), {teacherUid: uid, name: d.name, subject: d.subject});
      b.delete(doc(db, "codes", code));
      b.update(doc(db, "users", uid), {code: n});
      await b.commit(); code = n; home();
    }, "تم تغيير الكود");
    $("#add", el).onclick = () => run(async () => {
      const t = $("#nt", el).value.trim(); if (!t) return toast("اكتب اسم المحاضرة");
      await addDoc(collection(db, "lectures"), {teacherUid: uid, title: t, order: Date.now(), hidden: false, mode: "ordered", parts: [], createdAt: serverTimestamp()});
      await load(); home();
    });
    el.querySelectorAll("#ls [data-act]").forEach(b => b.onclick = () => run(async () => {
      const i = lects.findIndex(x => x.id === b.dataset.id), l = lects[i], a = b.dataset.act;
      if (a === "open") return lecture(l);
      if (a === "hide") await save(l, {hidden: !l.hidden});
      else if (a === "del") { if (!confirm("مسح المحاضرة بكل أجزائها؟")) return; await deleteDoc(doc(db, "lectures", l.id)); lects.splice(i, 1); }
      else { const j = a === "up" ? i - 1 : i + 1; if (j < 0 || j >= lects.length) return; const o = lects[j].order; await save(lects[j], {order: l.order}); await save(l, {order: o}); lects.sort((x, y) => x.order - y.order); }
      home();
    }));
  }

  function lecture(l){
    cur = l;
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع للمحاضرات</button><div class="addrow" style="margin-top:12px"><input id="lt" value="${esc(l.title)}" aria-label="اسم المحاضرة"><button id="sv" class="btn s sm" type="button">حفظ الاسم</button></div><label class="lb">طريقة فتح الأجزاء للطالب</label><div class="roles">${[["ordered", "بالترتيب"], ["open", "مفتوحة"]].map(([k, t]) => `<button type="button" data-m="${k}" class="${l.mode === k ? "on" : ""}"><span>${t}</span></button>`).join("")}</div><p class="muted small">${l.mode === "open" ? "كل الأجزاء ظاهرة للطالب من الأول." : "الطالب يخلّص الجزء اللي قبله عشان يفتح اللي بعده."}</p>${l.mode === "ordered" ? '<button id="all" class="btn s sm" type="button">افتح الكل للطلاب</button>' : ""}</div>
<div class="card" style="margin-top:14px"><h2 class="h">الأجزاء (${l.parts.length})</h2><div class="addrow"><input id="pt" placeholder="عنوان الجزء (اختياري)" aria-label="عنوان الجزء"></div><div class="roles three">${Object.entries(TYPES).map(([k, [t, i]]) => `<button type="button" data-add="${k}">${ic(i, 22)}<span>+ ${t}</span></button>`).join("")}</div><div id="ps">${l.parts.length ? l.parts.map((p, i) => `<div class="item lrow"><span class="ic">${ic(TYPES[p.type][1])}</span><div class="lt"><b>${esc(p.title)}</b><small>${TYPES[p.type][0]} · المحتوى قريباً</small></div>${p.type === "exam" ? `<button class="btn s sm" type="button" data-ex="${i}">إعداد</button>` : p.type === "homework" ? `<button class="btn s sm" type="button" data-hwb="${i}">إعداد</button>` : `<button class="btn s sm" type="button" data-ln="${i}">رابط</button>`}${ab("pu", "up", "فوق", i)}${ab("pd", "down", "تحت", i)}${ab("px", "trash", "مسح", i)}</div>`).join("") : '<p class="muted center">أضف أجزاء المحاضرة من الأزرار فوق.</p>'}</div></div>`;
    $("#bk", el).onclick = home;
    el.querySelectorAll("[data-ex]").forEach(b => b.onclick = () => examBuilder(el, uid, l, l.parts[+b.dataset.ex], () => lecture(l)));
    el.querySelectorAll("[data-hwb]").forEach(b => b.onclick = () => hwBuilder(el, uid, l, l.parts[+b.dataset.hwb], () => lecture(l)));
    el.querySelectorAll("[data-ln]").forEach(b => b.onclick = () => run(async () => { const i = +b.dataset.ln, u = prompt("الصق رابط الفيديو أو الملف (يبدأ بـ https)", l.parts[i].url || ""); if (u === null) return; if (u && !/^https?:\/\//.test(u.trim())) return toast("الرابط لازم يبدأ بـ https"); const ps = [...l.parts]; ps[i] = {...ps[i], url: u.trim()}; await save(l, {parts: ps}); lecture(l); }));
    $("#sv", el).onclick = () => run(async () => { const t = $("#lt", el).value.trim(); if (!t) return toast("اكتب الاسم"); await save(l, {title: t}); }, "تم الحفظ");
    el.querySelectorAll("[data-m]").forEach(b => b.onclick = () => run(async () => { await save(l, {mode: b.dataset.m}); lecture(l); }));
    const all = $("#all", el); if (all) all.onclick = () => run(async () => { await save(l, {mode: "open"}); lecture(l); }, "الأجزاء مفتوحة للطلاب");
    el.querySelectorAll("[data-add]").forEach(b => b.onclick = () => run(async () => {
      const k = b.dataset.add, t = $("#pt", el).value.trim() || TYPES[k][0];
      await save(l, {parts: [...l.parts, {id: crypto.randomUUID(), type: k, title: t}]}); lecture(l);
    }));
    el.querySelectorAll("#ps [data-act]").forEach(b => b.onclick = () => run(async () => {
      const i = +b.dataset.id, ps = [...l.parts], a = b.dataset.act;
      if (a === "px") { if (!confirm("مسح الجزء ده؟")) return; ps.splice(i, 1); }
      else if (!swap(ps, i, a === "pu" ? i - 1 : i + 1)) return;
      await save(l, {parts: ps}); lecture(l);
    }));
  }

  el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
  try { await load(); home(); } catch (e) { el.innerHTML = '<p class="err center">تعذّر تحميل المحاضرات. تأكد من الإنترنت وقواعد Firestore.</p>'; }
}
