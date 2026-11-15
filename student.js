import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {examSolve} from "./exam.js";

const TYPES = {explain: ["شرح", "vid"], homework: ["واجب", "doc"], exam: ["امتحان", "exam"]};

export async function renderStudent(el, uid, d){
  let links = [];
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast("حصل خطأ، حاول تاني"); } };
  const load = async () => {
    const s = await getDocs(query(collection(db, "links"), where("studentUid", "==", uid)));
    links = s.docs.map(x => ({id: x.id, ...x.data()}));
  };
  const addCode = async raw => {
    const c = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!c) return toast("اكتب الكود");
    const s = await getDoc(doc(db, "codes", c));
    if (!s.exists()) return toast("كود المدرس غير صحيح");
    const t = s.data(), id = t.teacherUid + "_" + uid, ex = links.find(l => l.id === id);
    if (ex && ex.status === "suspended") return toast("مش متاح إضافة المدرس ده، تواصل معاه");
    if (ex && ex.code === c) return toast("المدرس ده مضاف بالفعل");
    if (!confirm(`إضافة ${t.name} (${t.subject})؟`)) return;
    if (ex) await updateDoc(doc(db, "links", id), {code: c});
    else await setDoc(doc(db, "links", id), {teacherUid: t.teacherUid, studentUid: uid, studentName: d.name, teacherName: t.name, subject: t.subject, code: c, status: "active", createdAt: serverTimestamp()});
    toast("تمت الإضافة");
    await load();
    return true;
  };
  const addBox = () => `<div class="addrow"><input id="cd" placeholder="كود المدرس" aria-label="كود المدرس" autocapitalize="characters" autocomplete="off"><button id="ad" class="btn p sm" type="button">إضافة</button></div>`;

  function home(){
    el.innerHTML = `<div class="card stu"><b>أهلاً ${esc(d.name.split(" ")[0])}</b><small class="muted" style="display:block">طالب</small></div><div class="card" style="margin-top:14px"><h2 class="h">مدرسيني (${links.length})</h2>${addBox()}<div id="ls">${links.length ? links.map(l => `<div class="item lrow"><div class="lt" data-act="open" data-id="${l.id}"><b>${esc(l.teacherName)}</b><small>${esc(l.subject)}${l.status === "suspended" ? " · موقوف" : ""}</small></div>${l.status === "active" ? `<button class="ab" type="button" data-act="rm" data-id="${l.id}" aria-label="شيل المدرس">${ic("trash", 18)}</button>` : ""}</div>`).join("") : '<p class="muted center">ضيف كود مدرسك عشان تشوف محاضراته.</p>'}</div></div>`;
    $("#ad", el).onclick = () => run(async () => { if (await addCode($("#cd", el).value)) home(); });
    el.querySelectorAll("#ls [data-act]").forEach(b => b.onclick = () => run(async () => {
      const l = links.find(x => x.id === b.dataset.id);
      if (b.dataset.act === "open") return l.status === "suspended" ? toast("الحساب موقوف عند المدرس ده") : teacher(l);
      if (!confirm("تشيل المدرس ده من قايمتك؟")) return;
      await deleteDoc(doc(db, "links", l.id)); await load(); home();
    }));
  }

  async function teacher(l){
    el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
    let lects;
    try {
      const s = await getDocs(query(collection(db, "lectures"), where("teacherUid", "==", l.teacherUid), where("hidden", "==", false)));
      lects = s.docs.map(x => ({id: x.id, ...x.data()})).sort((a, b) => a.order - b.order);
    } catch (e) {
      el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><p class="err">كود المدرس اتغيّر. اكتب الكود الجديد عشان ترجع.</p>${addBox()}</div>`;
      $("#bk", el).onclick = home;
      $("#ad", el).onclick = () => run(async () => { if (await addCode($("#cd", el).value)) teacher(l); });
      return;
    }
    const exs = {}, atts = {};
    try {
      (await getDocs(query(collection(db, "exams"), where("teacherUid", "==", l.teacherUid), where("published", "==", true)))).docs.forEach(x => { exs[x.id] = {id: x.id, ...x.data()}; });
      (await getDocs(query(collection(db, "attempts"), where("studentUid", "==", uid)))).docs.forEach(x => { atts[x.data().examId] = x.data(); });
    } catch (e) {}
    const fm = ms => new Date(ms).toLocaleString("ar-EG", {dateStyle: "medium", timeStyle: "short"});
    const exBtn = p => {
      const e = exs[p.id]; if (!e) return "";
      const a = atts[p.id], n = Date.now();
      if (a && a.submitted) return '<span class="muted small">تم التسليم</span>';
      if (!a && n < e.start) return `<span class="muted small">يبدأ ${fm(e.start)}</span>`;
      if (n > e.end) return '<span class="muted small">انتهى</span>';
      return `<button class="btn p sm" type="button" data-sx="${p.id}">${a ? "كمّل" : "ابدأ"}</button>`;
    };
    const row = (p, lk) => `<div class="item lrow${lk ? " lk" : ""}"><span class="ic">${ic(lk ? "lock" : TYPES[p.type][1])}</span><div class="lt"><b>${esc(p.title)}</b><small>${TYPES[p.type][0]}${lk ? " · يفتح بعد اللي قبله" : p.type === "exam" && exs[p.id] ? ` · ${exs[p.id].duration} دقيقة` : " · المحتوى قريباً"}</small></div>${!lk && p.type === "exam" ? exBtn(p) : ""}</div>`;
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(l.teacherName)} · ${esc(l.subject)}</h2></div>${lects.length ? lects.map(x => `<div class="card" style="margin-top:14px"><b>${esc(x.title)}</b>${x.parts.length ? x.parts.map((p, i) => row(p, x.mode !== "open" && i > 0)).join("") : '<p class="muted small">لسه مفيش أجزاء.</p>'}</div>`).join("") : '<div class="card" style="margin-top:14px"><p class="muted center">المدرس لسه ما أضافش محاضرات.</p></div>'}`;
    $("#bk", el).onclick = home;
    el.querySelectorAll("[data-sx]").forEach(b => b.onclick = () => examSolve(el, uid, exs[b.dataset.sx], atts[b.dataset.sx], () => teacher(l)));
  }

  el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
  try { await load(); home(); } catch (e) { el.innerHTML = '<p class="err center">تعذّر التحميل. تأكد من الإنترنت وقواعد Firestore.</p>'; }
}
