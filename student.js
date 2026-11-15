import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {examSolve} from "./exam.js";
import {hwStudent} from "./homework.js";

const TYPES = {explain: ["شرح", "vid"], homework: ["واجب", "doc"], exam: ["امتحان", "exam"]};
const fm = ms => new Date(ms).toLocaleString("ar-EG", {dateStyle: "medium", timeStyle: "short"});
const safe = u => /^https?:\/\//.test(u || "") ? esc(u) : "";

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
    const g = (c, ...w) => getDocs(query(collection(db, c), ...w)).then(s => s.docs).catch(() => []);
    const [E, H, A, S, P] = await Promise.all([
      g("exams", where("teacherUid", "==", l.teacherUid), where("published", "==", true)),
      g("homeworks", where("teacherUid", "==", l.teacherUid)),
      g("attempts", where("studentUid", "==", uid)),
      g("subs", where("studentUid", "==", uid)),
      g("progress", where("studentUid", "==", uid))]);
    const exs = {}, hws = {}, atts = {}, subs = {}, prog = {};
    E.forEach(x => { exs[x.id] = {id: x.id, ...x.data()}; });
    H.forEach(x => { hws[x.id] = {id: x.id, ...x.data()}; });
    A.forEach(x => { atts[x.data().examId] = {id: x.id, ...x.data()}; });
    S.forEach(x => { subs[x.data().partId] = {id: x.id, ...x.data()}; });
    P.forEach(x => { prog[x.data().partId] = 1; });
    const done = p => p.type === "exam" ? !!(atts[p.id] && atts[p.id].submitted) : p.type === "homework" ? !!subs[p.id] : !!prog[p.id];
    const exBtn = p => {
      const e = exs[p.id]; if (!e) return '<span class="muted small">لسه ما اتجهزش</span>';
      const a = atts[p.id], n = Date.now();
      if (a && a.released) return `<b>${a.result.score} من ${a.result.total}</b>`;
      if (a && a.submitted) return '<span class="muted small">تم التسليم</span>';
      if (!a && n < e.start) return `<span class="muted small">يبدأ ${fm(e.start)}</span>`;
      if (n > e.end) return '<span class="muted small">انتهى</span>';
      return `<button class="btn p sm" type="button" data-sx="${p.id}">${a ? "كمّل" : "ابدأ"}</button>`;
    };
    const act = p => {
      if (p.type === "exam") return exBtn(p);
      if (p.type === "homework") return hws[p.id] ? `<button class="btn p sm" type="button" data-hw="${p.id}">${subs[p.id] ? "فتح" : "ابدأ"}</button>` : '<span class="muted small">لسه ما اتجهزش</span>';
      return (safe(p.url) ? `<a class="btn s sm" style="text-decoration:none" href="${safe(p.url)}" target="_blank" rel="noopener">فتح</a>` : "") + (prog[p.id] ? '<span class="muted small">تم</span>' : `<button class="btn p sm" type="button" data-pg="${p.id}">تم</button>`);
    };
    const extra = p => {
      const e = exs[p.id], a = atts[p.id]; if (p.type !== "exam" || !e || !a || !a.released) return "";
      return (e.materials || []).map(m => safe(m.url) ? `<a class="lnk" style="display:block;margin-top:6px" href="${safe(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a>` : "").join("") + (e.reviewUntil > Date.now() ? `<button class="btn s sm" type="button" data-rv="${p.id}" style="margin-top:8px">طلب مراجعة</button>` : "");
    };
    const row = (p, lk) => `<div class="item${lk ? " lk" : ""}"><div class="lrow"><span class="ic">${ic(lk ? "lock" : TYPES[p.type][1])}</span><div class="lt"><b>${esc(p.title)}</b><small>${TYPES[p.type][0]}${lk ? " · يفتح بعد اللي قبله" : p.type === "exam" && exs[p.id] ? ` · ${exs[p.id].duration} دقيقة` : ""}</small></div>${lk ? "" : act(p)}</div>${lk ? "" : extra(p)}</div>`;
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(l.teacherName)} · ${esc(l.subject)}</h2></div>${lects.length ? lects.map(x => `<div class="card" style="margin-top:14px"><b>${esc(x.title)}</b>${x.parts.length ? x.parts.map((p, i) => row(p, x.mode !== "open" && i > 0 && !done(x.parts[i - 1]))).join("") : '<p class="muted small">لسه مفيش أجزاء.</p>'}</div>`).join("") : '<div class="card" style="margin-top:14px"><p class="muted center">المدرس لسه ما أضافش محاضرات.</p></div>'}`;
    $("#bk", el).onclick = home;
    const back = () => teacher(l);
    el.querySelectorAll("[data-pg]").forEach(b => b.onclick = () => run(async () => { await setDoc(doc(db, "progress", b.dataset.pg + "_" + uid), {partId: b.dataset.pg, studentUid: uid, teacherUid: l.teacherUid}); back(); }));
    el.querySelectorAll("[data-hw]").forEach(b => b.onclick = () => hwStudent(el, uid, l.teacherUid, hws[b.dataset.hw], subs[b.dataset.hw], back));
    el.querySelectorAll("[data-sx]").forEach(b => b.onclick = () => examSolve(el, uid, exs[b.dataset.sx], atts[b.dataset.sx], back));
    el.querySelectorAll("[data-rv]").forEach(b => b.onclick = () => review(exs[b.dataset.rv], atts[b.dataset.rv], back));
  }

  function review(e, a, back){
    const show = q => { const v = (a.answers || {})[q.id]; return v == null || v === "" ? "—" : q.type === "mcq" ? esc(q.options[v]) : q.type === "tf" ? (v ? "صح" : "خطأ") : esc(v); };
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">طلب مراجعة · ${esc(e.title)}</h2><p class="muted small">متاح لحد ${fm(e.reviewUntil)}</p></div>${e.questions.map((q, i) => `<div class="card" style="margin-top:14px"><b>سؤال ${i + 1}</b><p class="qt">${esc(q.text)}</p><p><b>إجابتك:</b> <span style="white-space:pre-wrap">${show(q)}</span></p>${(a.reviews || {})[q.id] ? '<p class="muted">تم إرسال طلب المراجعة</p>' : `<button class="btn s sm" type="button" data-r="${q.id}">اطلب مراجعة</button>`}</div>`).join("")}`;
    $("#bk", el).onclick = back;
    el.querySelectorAll("[data-r]").forEach(b => b.onclick = () => run(async () => {
      const t = prompt("اكتب سبب طلب المراجعة"); if (!t || !t.trim()) return;
      const r = {text: t.trim().slice(0, 300), at: Date.now()};
      await updateDoc(doc(db, "attempts", a.id), {["reviews." + b.dataset.r]: r});
      a.reviews = {...(a.reviews || {}), [b.dataset.r]: r}; toast("تم الإرسال"); review(e, a, back);
    }));
  }

  el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
  try { await load(); home(); } catch (e) { el.innerHTML = '<p class="err center">تعذّر التحميل. تأكد من الإنترنت وقواعد Firestore.</p>'; }
}
