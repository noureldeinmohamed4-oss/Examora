import {db} from "./firebase.js";
import {collection, query, where, getDocs, getDoc, doc, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {examBuilder} from "./exam.js";
import {hwBuilder, hwSubView} from "./homework.js";
import {examResults} from "./results.js";
import {pickUpload, upMsg} from "./media.js";
import {finished, endAt, fdt} from "./time.js";

const TYPES = {explain: ["شرح", "vid"], homework: ["واجب", "doc"], exam: ["امتحان", "exam"]};
const GRADES = ["الصف الأول الابتدائي", "الصف الثاني الابتدائي", "الصف الثالث الابتدائي", "الصف الرابع الابتدائي", "الصف الخامس الابتدائي", "الصف السادس الابتدائي", "الصف الأول الإعدادي", "الصف الثاني الإعدادي", "الصف الثالث الإعدادي", "الصف الأول الثانوي", "الصف الثاني الثانوي", "الصف الثالث الثانوي"];
const LEGACY = "غير محدد", MAXG = 10;
const gname = g => g.grade === LEGACY ? (g.label || "") : g.grade + (g.label ? " · " + g.label : "");
const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => CH[n % 32]).join("");

const ytId = u => { const m = String(u || "").trim().match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#\/].*)?$/); return m ? m[1] : ""; };
const mc = p => { const n = (p.media || []).length + (!p.media && p.url ? 1 : 0); return n ? n + " ملف" : "لسه فاضي"; };

const tms = t => t && t.toMillis ? t.toMillis() : 0;
const dayFmt = ms => new Date(ms).toLocaleDateString("ar-EG", {weekday: "long", day: "numeric", month: "long", year: "numeric"});
const fullFmt = ms => new Date(ms).toLocaleString("ar-EG", {weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"});
const ago = ms => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 120) return "دلوقتي";
  if (s < 3600) return "من " + Math.floor(s / 60) + " دقيقة";
  if (s < 86400) { const h = Math.floor(s / 3600); return h === 1 ? "من ساعة" : h === 2 ? "من ساعتين" : h <= 10 ? "من " + h + " ساعات" : "من " + h + " ساعة"; }
  const d = Math.floor(s / 86400);
  return d === 1 ? "من يوم" : d === 2 ? "من يومين" : d <= 10 ? "من " + d + " أيام" : "من " + d + " يوم";
};
const tel = n => n ? `<a href="tel:${esc(n)}" dir="ltr">${esc(n)}</a>` : "—";
const exOut = a => (a.exits || []).filter(x => !(x.p && x.d <= 90));

export async function renderTeacher(el, uid, d){
  let lects = [], stu = [], cur = null, groups = [], gsel = null, gform = false, gmenu = false, gmsg = "", subsAll = [], subsErr = false, tab = "lec", addOpen = false, menu = null, pm = null, sq = "", showAll = false;
  let info = {}, gr = null, grErr = false, grBusy = false, hl = null, hp = null;
  const loadSubs = async () => { try { subsAll = (await getDocs(query(collection(db, "subs"), where("teacherUid", "==", uid)))).docs.map(x => ({id: x.id, ...x.data()})); subsErr = false; } catch (e) { subsErr = true; } };
  const hc = id => { const n = subsAll.filter(s => s.partId === id).length; return n ? n + " تسليم" : "لسه ما حدش سلّم"; };
  const curG = () => groups.find(g => g.id === gsel);
  const loadLects = async () => {
    const s = await getDocs(query(collection(db, "lectures"), where("teacherUid", "==", uid)));
    lects = s.docs.map(x => ({id: x.id, ...x.data()})).filter(l => l.groupId === gsel).sort((a, b) => a.order - b.order);
  };
  async function migrate(){
    let g = groups.find(x => x.code === d.code);
    if (!g) {
      const ref = doc(collection(db, "groups")), data = {teacherUid: uid, grade: LEGACY, label: "المجموعة الأساسية", code: d.code, createdAt: serverTimestamp()};
      await setDoc(ref, data);
      g = {id: ref.id, ...data}; groups.push(g);
    }
    const [L, K] = await Promise.all([getDocs(query(collection(db, "lectures"), where("teacherUid", "==", uid))), getDocs(query(collection(db, "links"), where("teacherUid", "==", uid)))]);
    const todo = [...L.docs, ...K.docs].filter(x => !x.data().groupId);
    for (let i = 0; i < todo.length; i += 400) { const b = writeBatch(db); todo.slice(i, i + 400).forEach(x => b.update(x.ref, {groupId: g.id})); await b.commit(); }
    try { await updateDoc(doc(db, "codes", d.code), {groupId: g.id, groupName: gname(g)}); }
    catch (e) { await setDoc(doc(db, "codes", d.code), {teacherUid: uid, groupId: g.id, groupName: gname(g), name: d.name, subject: d.subject}); }
    await updateDoc(doc(db, "users", uid), {code: ""}); d.code = "";
  }
  const load = async () => {
    groups = (await getDocs(query(collection(db, "groups"), where("teacherUid", "==", uid)))).docs.map(x => ({id: x.id, ...x.data()})).sort((a, b) => tms(a.createdAt) - tms(b.createdAt));
    if (d.code) await migrate();
    if (!groups.some(g => g.id === gsel)) gsel = groups.length ? groups[0].id : null;
    await loadLects();
    const s2 = await getDocs(query(collection(db, "links"), where("teacherUid", "==", uid)));
    stu = s2.docs.map(x => ({id: x.id, ...x.data()}));
    await loadSubs();
  };
  const nameMap = () => { const m = {}; stu.forEach(x => { m[x.studentUid] = x.studentName; }); return m; };
  const loadGr = async () => {
    if (grBusy) return;
    grBusy = true; grErr = false;
    try {
      const [E, A] = await Promise.all([getDocs(query(collection(db, "exams"), where("teacherUid", "==", uid))), getDocs(query(collection(db, "attempts"), where("teacherUid", "==", uid)))]);
      gr = {exams: E.docs.map(x => ({id: x.id, ...x.data()})), atts: A.docs.map(x => ({id: x.id, ...x.data()}))};
    } catch (e) { grErr = true; gr = null; }
    grBusy = false;
  };
  const grData = () => {
    const lid = new Set(lects.map(l => l.id)), gx = gr.exams.filter(e => lid.has(e.lectureId)), byEx = {}; gx.forEach(e => { byEx[e.id] = e; });
    const pend = [], rv = {}, cnt = {};
    gr.atts.forEach(a => {
      const e = byEx[a.examId]; if (!e) return;
      cnt[e.id] = (cnt[e.id] || 0) + 1;
      const fin = finished(a, e);
      if (fin && (e.questions || []).some(q => q.type === "essay" && (a.grades || {})[q.id] == null)) pend.push({a, e});
      const n = Object.keys(a.reviews || {}).length; if (n) rv[e.id] = (rv[e.id] || 0) + n;
    });
    pend.sort((x, y) => endAt(y.a, y.e) - endAt(x.a, x.e));
    return {pend, rv, cnt, exams: [...gx].sort((x, y) => (y.start || 0) - (x.start || 0))};
  };
  const backGr = () => { gr = null; home(); loadGr().then(home); };

  /* ---------- الطلاب ---------- */
  const stuAll = () => {
    const k = sq.trim().toLowerCase();
    return stu.filter(x => x.groupId === gsel && (!k || String(x.studentName || "").toLowerCase().includes(k))).sort((x, y) => String(x.studentName || "").localeCompare(String(y.studentName || ""), "ar"));
  };
  const stuShown = () => { const all = stuAll(); return {all, sh: sq.trim() || showAll ? all : all.slice(0, 10)}; };
  const seenTxt = x => {
    const i = info[x.studentUid];
    if (!i || i.loading) return "جاري التحميل…";
    if (i.err) return "تعذّر تحميل آخر ظهور";
    return "آخر ظهور: " + (i.seen ? ago(i.seen) : "لسه ما ظهرش") + (i.created ? " · سجّل: " + dayFmt(i.created) : "");
  };
  const stuList = () => {
    const {all, sh} = stuShown();
    if (!all.length) return `<p class="muted center small">${sq.trim() ? "مفيش نتايج." : "لسه مفيش طلاب. ابعت كودك للطلاب."}</p>`;
    return sh.map(x => `<div class="item lrow"><div class="lt" data-sd="${x.studentUid}"><b>${esc(x.studentName)}</b><small>${x.status === "suspended" ? "موقوف" : "نشط"}</small><small>${seenTxt(x)}</small></div><button class="btn s sm" type="button" data-st="${x.id}" data-to="${x.status === "suspended" ? "active" : "suspended"}">${x.status === "suspended" ? "تفعيل" : "إيقاف"}</button></div>`).join("") + (sh.length < all.length ? `<button id="sa" class="btn s full" type="button">عرض الكل (${all.length})</button>` : "");
  };
  const stuTab = () => `<input id="sq" class="plain" placeholder="بحث باسم الطالب" aria-label="بحث باسم الطالب" value="${esc(sq)}" style="margin-bottom:8px"><p class="muted small">دوس على اسم الطالب تشوف تفاصيله.</p><div id="sl">${stuList()}</div>`;
  const fill = async () => {
    const need = stuShown().sh.map(x => x.studentUid).filter(u => !info[u]);
    if (!need.length) return;
    need.forEach(u => { info[u] = {loading: true}; });
    await Promise.all(need.map(async u => {
      const o = {};
      try {
        const [s, g] = await Promise.all([getDoc(doc(db, "sessions", u)), getDoc(doc(db, "users", u))]);
        o.seen = s.exists() ? tms(s.data().at) : 0;
        o.created = g.exists() ? tms(g.data().createdAt) : 0;
      } catch (e) { o.err = true; }
      info[u] = o;
    }));
    const sl = $("#sl", el);
    if (tab === "stu" && sl) { sl.innerHTML = stuList(); bindStu(); }
  };
  const bindStu = () => {
    el.querySelectorAll("[data-st]").forEach(b => b.onclick = () => run(async () => { if (b.dataset.to === "suspended" && !confirm("إيقاف الطالب ده من عندك؟")) return; await updateDoc(doc(db, "links", b.dataset.st), {status: b.dataset.to}); stu.find(y => y.id === b.dataset.st).status = b.dataset.to; home(); }));
    el.querySelectorAll("[data-sd]").forEach(b => b.onclick = () => student(stu.find(y => y.studentUid === b.dataset.sd)));
    const sa = $("#sa", el); if (sa) sa.onclick = () => { showAll = true; home(); };
  };

  /* ---------- الواجبات ---------- */
  const hwTab = () => {
    if (subsErr) return '<p class="err center small">تعذّر تحميل التسليمات. تأكد من الإنترنت وقواعد Firestore.</p>';
    const act = stu.filter(x => x.groupId === gsel);
    const bk = k => `<button class="lnk" type="button" data-hb="${k}">${ic("back", 18)} رجوع</button>`;
    const L = lects.find(x => x.id === hl), P = L && L.parts.find(p => p.id === hp && p.type === "homework");
    if (L && P) {
      const by = {}; subsAll.filter(s => s.partId === P.id).forEach(s => { by[s.studentUid] = s; });
      const done = act.filter(x => by[x.studentUid]).sort((x, y) => tms(by[y.studentUid].createdAt) - tms(by[x.studentUid].createdAt)), left = act.filter(x => !by[x.studentUid]);
      return `${bk("lec")}<h2 class="h" style="margin-top:10px">${esc(P.title)}</h2><p class="muted small">${esc(L.title)} · سلّم ${done.length} من ${act.length}</p>
<b>لسه ما سلّموش (${left.length})</b>${left.length ? left.map(x => `<div class="item"><b>${esc(x.studentName)}</b></div>`).join("") : '<p class="muted small">الكل سلّم ✓</p>'}
<b style="display:block;margin-top:14px">سلّموا (${done.length})</b>${done.length ? done.map(x => { const s = by[x.studentUid]; return `<div class="item lrow"><div class="lt"><b>${esc(x.studentName)}</b><small>${tms(s.createdAt) ? fullFmt(tms(s.createdAt)) : ""}</small></div><button class="btn p sm" type="button" data-sv="${s.id}">فتح</button></div>`; }).join("") : '<p class="muted small">لسه ما حدش سلّم.</p>'}`;
    }
    if (L) {
      const hs = L.parts.filter(p => p.type === "homework");
      return `${bk("list")}<h2 class="h" style="margin-top:10px">${esc(L.title)}</h2>${hs.length ? hs.map(p => { const n = act.filter(x => subsAll.some(s => s.partId === p.id && s.studentUid === x.studentUid)).length; return `<div class="item lrow"><div class="lt" data-hp="${p.id}"><b>${esc(p.title)}</b><small>سلّم ${n} من ${act.length}</small></div></div>`; }).join("") : '<p class="muted center small">مفيش واجبات في المحاضرة دي.</p>'}`;
    }
    const hl2 = lects.filter(l => l.parts.some(p => p.type === "homework"));
    return hl2.length ? '<p class="muted small">اختار المحاضرة:</p>' + hl2.map(l => { const ids = l.parts.filter(p => p.type === "homework").map(p => p.id); return `<div class="item lrow"><div class="lt" data-hl="${l.id}"><b>${esc(l.title)}</b><small>${ids.length} واجب · ${subsAll.filter(s => ids.includes(s.partId)).length} تسليم</small></div></div>`; }).join("") : '<p class="muted center small">لسه مفيش واجبات. ضيف جزء "واجب" جوا محاضرة.</p>';
  };

  /* ---------- التصحيح (امتحانات) ---------- */
  const grTab = gd => {
    const ref = '<button class="btn s sm" type="button" data-gref="1">تحديث</button>';
    if (grErr) return '<p class="err center small">تعذّر تحميل البيانات. تأكد من الإنترنت وقواعد Firestore.</p>' + ref;
    if (!gd) return '<p class="muted center small">جاري التحميل…</p>';
    const nm = nameMap(), lt = {}; lects.forEach(l => { lt[l.id] = l.title; });
    return `<div class="lrow"><b class="lt">أوراق مقالي مستنية التصحيح (${gd.pend.length})</b>${ref}</div>${gd.pend.length ? gd.pend.map(({a, e}) => `<div class="item lrow"><div class="lt"><b>${esc(nm[a.studentUid] || "طالب")}</b><small>${esc(e.title)}${lt[e.lectureId] ? " · " + esc(lt[e.lectureId]) : ""}</small></div><button class="btn p sm" type="button" data-gp="${a.id}">تصحيح</button></div>`).join("") : '<p class="muted center small">مفيش حاجة مستنية تصحيح ✓</p>'}
<b style="display:block;margin-top:16px">الامتحانات (${gd.exams.length})</b>${gd.exams.length ? gd.exams.map(e => `<div class="item lrow"><div class="lt"><b>${esc(e.title)}</b><small>دخل ${gd.cnt[e.id] || 0}${gd.rv[e.id] ? " · طلبات مراجعة: " + gd.rv[e.id] : ""}</small></div><button class="btn s sm" type="button" data-ge="${e.id}">النتائج</button></div>`).join("") : '<p class="muted center small">لسه مفيش امتحانات.</p>'}`;
  };

  const lecTab = () => `${addOpen ? '<div class="addrow"><input id="nt" placeholder="اسم المحاضرة (مثال: المحاضرة الأولى)" aria-label="اسم المحاضرة"><button id="add" class="btn p sm" type="button">إضافة</button><button id="nx" class="btn s sm" type="button">إلغاء</button></div>' : '<button id="nl" class="btn p full" type="button" style="margin-top:0">+ محاضرة جديدة</button>'}<div id="ls" style="margin-top:8px">${lects.length ? lects.map((l, i) => `<div class="item"><div class="lrow"><div class="lt" data-act="open" data-id="${l.id}"><b>${esc(l.title)}</b><small>${l.parts.length} أجزاء · ${l.mode === "open" ? "مفتوحة" : "بالترتيب"}${l.hidden ? " · مخفية" : ""}</small></div><button class="ab mn" type="button" data-mn="${l.id}" aria-label="خيارات">⋯</button></div>${menu === l.id ? `<div class="macts">${i > 0 ? `<button class="btn s sm" type="button" data-act="up" data-id="${l.id}">↑ لفوق</button>` : ""}${i < lects.length - 1 ? `<button class="btn s sm" type="button" data-act="down" data-id="${l.id}">↓ لتحت</button>` : ""}<button class="btn s sm" type="button" data-act="hide" data-id="${l.id}">${l.hidden ? "إظهار للطلاب" : "إخفاء عن الطلاب"}</button><button class="btn s sm bad" type="button" data-act="del" data-id="${l.id}">مسح</button></div>` : ""}</div>`).join("") : '<p class="muted center small">مفيش محاضرات لسه. اضغط "+ محاضرة جديدة".</p>'}</div>`;
  const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast("حصل خطأ، حاول تاني"); } };
  const save = async (l, patch) => { await updateDoc(doc(db, "lectures", l.id), patch); Object.assign(l, patch); };
  const swap = (arr, i, j) => { if (j < 0 || j >= arr.length) return false; [arr[i], arr[j]] = [arr[j], arr[i]]; return true; };

  /* ---------- المجموعات ---------- */
  const freshCode = async () => { for (let i = 0; i < 5; i++) { const c = genCode(); if (!(await getDoc(doc(db, "codes", c))).exists()) return c; } return null; };
  const codeDoc = g => ({teacherUid: uid, groupId: g.id, groupName: gname(g), name: d.name, subject: d.subject});
  const dupGroup = (grade, label, skip) => groups.some(g => g.id !== skip && g.grade === grade && String(g.label || "").trim().toLowerCase() === label.trim().toLowerCase());
  const gForm = (p, g) => `<select id="${p}grade" class="plain" aria-label="الصف"><option value="">اختار الصف</option>${GRADES.map(x => `<option${g && g.grade === x ? " selected" : ""}>${x}</option>`).join("")}</select><input id="${p}label" class="plain" placeholder="وصف اختياري (مثال: مجموعة السبت)" maxlength="40" value="${esc(g ? g.label || "" : "")}" style="margin-top:8px" aria-label="وصف المجموعة">`;
  const codeBox = g => g.code
    ? `<div class="codebox"><div><small class="muted">كود ${esc(gname(g))}</small><b class="code" dir="ltr">${esc(g.code)}</b></div></div><div class="macts"><button id="cp" class="btn s sm" type="button">نسخ</button><button id="cc" class="btn s sm" type="button">تغيير الكود</button><button id="cx" class="btn s sm bad" type="button">مسح الكود</button></div>`
    : `<div class="codebox"><div><small class="muted">كود ${esc(gname(g))}</small><b>مقفول</b></div></div><p class="muted small">محدش جديد يقدر ينضم للمجموعة دي لحد ما تعمل كود جديد.</p><div class="macts"><button id="cn" class="btn p sm" type="button">إنشاء كود جديد</button></div>`;
  const groupCard = () => {
    const g = curG(), open = gform || !groups.length;
    return `<div class="card tch"><b>${esc(d.name)}</b><small class="muted" style="display:block">مدرس · ${esc(d.subject)}</small>
${groups.length ? `<small class="muted" style="display:block;margin-top:10px">المجموعات (${groups.length} من ${MAXG})</small><div class="gl">${groups.map(x => `<button type="button" class="gc${x.id === gsel ? " on" : ""}" data-g="${x.id}"><b>${esc(gname(x))}</b><small>${stu.filter(y => y.groupId === x.id).length} طالب${x.code ? ` · <span dir="ltr">${esc(x.code)}</span>` : " · كود مقفول"}</small></button>`).join("")}</div>` : '<p class="muted small" style="margin-top:12px">اعمل أول مجموعة: اختار الصف وهيتولّد لها كود تبعته للطلاب.</p>'}
<div class="acts"><button id="gn" class="btn s sm" type="button">+ مجموعة جديدة</button>${g ? '<button id="gm" class="btn s sm" type="button">⋯ إدارة المجموعة</button>' : ""}</div>
${open ? `<div style="margin-top:10px">${gForm("new")}<div class="acts"><button id="gc" class="btn p sm" type="button">إنشاء</button>${groups.length ? '<button id="gx" class="btn s sm" type="button">إلغاء</button>' : ""}</div></div>` : ""}
${g ? codeBox(g) : ""}
${g && gmenu ? `<div class="item" style="margin-top:10px"><b>تعديل اسم المجموعة</b>${gForm("edit", g)}<button id="gsave" class="btn s sm" type="button" style="margin-top:8px">حفظ</button></div><div class="item"><b class="badm">منطقة خطرة</b><p class="muted small">مسح المجموعة بيمسح محاضراتها وامتحاناتها وواجباتها وتسليمات وإجابات طلابها نهائيًا، ومينفعش يتراجع عنه.</p><button id="gdel" class="btn s sm bad" type="button">مسح المجموعة نهائيًا</button></div>` : ""}
<p id="gmsg" class="err" role="alert">${esc(gmsg)}</p></div>`;
  };
  async function createGroup(grade, label){
    label = label.trim().slice(0, 40);
    if (!GRADES.includes(grade)) return "اختار الصف الأول";
    if (groups.length >= MAXG) return "وصلت للحد الأقصى (" + MAXG + " مجموعات)";
    if (dupGroup(grade, label, null)) return "المجموعة دي موجودة بالفعل";
    const c = await freshCode(); if (!c) return "حصل خطأ، حاول تاني";
    const ref = doc(collection(db, "groups"));
    await setDoc(ref, {teacherUid: uid, grade, label, code: c, createdAt: serverTimestamp()});
    await setDoc(doc(db, "codes", c), codeDoc({id: ref.id, grade, label}));
    gsel = ref.id; gform = false; gmenu = false; gmsg = ""; hl = hp = null; gr = null; sq = ""; showAll = false; menu = null;
    await load(); home(); return "";
  }
  async function saveGroup(grade, label){
    const g = curG(); label = label.trim().slice(0, 40);
    if (!GRADES.includes(grade)) return "اختار الصف";
    if (dupGroup(grade, label, g.id)) return "المجموعة دي موجودة بالفعل";
    const b = writeBatch(db);
    b.update(doc(db, "groups", g.id), {grade, label});
    if (g.code && (await getDoc(doc(db, "codes", g.code))).exists()) b.update(doc(db, "codes", g.code), {groupName: gname({grade, label})});
    await b.commit(); Object.assign(g, {grade, label}); gmenu = false; gmsg = ""; home(); return "";
  }
  async function setCode(mode){
    const g = curG();
    if (mode === "change" && !confirm("الكود القديم هيبطل، والطلاب اللي جوّه المجموعة هيفضلوا زي ما هم. تكمّل؟")) return;
    if (mode === "remove" && !confirm("مسح الكود هيمنع أي طالب جديد ينضم، والمجموعة وطلابها ومحتواها يفضلوا زي ما هم. تكمّل؟")) return;
    const old = g.code && (await getDoc(doc(db, "codes", g.code))).exists() ? g.code : "";
    const c = mode === "remove" ? "" : await freshCode();
    if (mode !== "remove" && !c) throw 0;
    const b = writeBatch(db);
    if (old) b.delete(doc(db, "codes", old));
    if (c) b.set(doc(db, "codes", c), codeDoc(g));
    b.update(doc(db, "groups", g.id), {code: c});
    await b.commit(); g.code = c; gmsg = ""; home();
  }
  async function deleteGroup(){
    const g = curG(), nm = gname(g);
    el.innerHTML = '<div class="card"><p class="muted center" id="ds">جاري حساب اللي هيتمسح…</p></div>';
    let refs = [];
    try {
      const q = (c, ...w) => getDocs(query(collection(db, c), where("teacherUid", "==", uid), ...w));
      const keys = [], mid = [], hws = [], exs = [];
      for (const l of lects) {
        const [E, H] = await Promise.all([q("exams", where("lectureId", "==", l.id)), q("homeworks", where("lectureId", "==", l.id))]);
        for (const e of E.docs) { keys.push(doc(db, "exams", e.id, "key", "main")); exs.push(e.ref); (await q("attempts", where("examId", "==", e.id))).docs.forEach(a => mid.push(a.ref)); }
        for (const h of H.docs) { hws.push(h.ref); (await q("subs", where("partId", "==", h.id))).docs.forEach(a => mid.push(a.ref)); }
        for (const p of l.parts) if (p.type === "explain") (await q("progress", where("partId", "==", p.id))).docs.forEach(a => mid.push(a.ref));
      }
      const lk = (await q("links", where("groupId", "==", g.id))).docs.map(x => x.ref);
      refs = [...keys, ...mid, ...hws, ...exs, ...lects.map(l => doc(db, "lectures", l.id)), ...lk];
    } catch (e) { toast("تعذّر حساب البيانات، حاول تاني"); return home(); }
    const n = refs.length + 2;
    if (!confirm("هيتمسح " + n + " عنصر (محاضرات وامتحانات وواجبات وتسليمات وإجابات وطلاب)، وده بيستهلك " + n + " من حد الكتابة اليومي (20 ألف). مفيش رجوع. تكمّل؟")) return home();
    const t = prompt("للتأكيد اكتب العبارة دي بالظبط (إنجليزي):\n\ndelete my files");
    if (t == null || t.trim().toLowerCase() !== "delete my files") { toast("العبارة مش مطابقة، المسح اتلغى"); return home(); }
    const ds = () => $("#ds", el);
    try {
      if (g.code && (await getDoc(doc(db, "codes", g.code))).exists()) await deleteDoc(doc(db, "codes", g.code));
      for (let i = 0; i < refs.length; i += 400) {
        const b = writeBatch(db); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit();
        if (ds()) ds().textContent = "اتمسح " + Math.min(refs.length, i + 400) + " من " + refs.length + "…";
      }
      await deleteDoc(doc(db, "groups", g.id));
    } catch (e) {
      el.innerHTML = '<div class="card"><p class="err">المسح وقف في النص (غالبًا النت أو حد الكتابة اليومي). اللي اتمسح اتمسح، وتقدر تفتح المجموعة وتكرر المسح.</p><button id="bk" class="btn s full" type="button">رجوع</button></div>';
      $("#bk", el).onclick = () => load().then(home, home); return;
    }
    gsel = null; gmenu = false; gmsg = ""; hl = hp = null; gr = null; menu = null;
    toast("اتمسحت المجموعة"); await load(); home();
  }
  const bindGroup = () => {
    const on = (id, fn) => { const b = $("#" + id, el); if (b) b.onclick = fn; };
    const msg = m => { const x = $("#gmsg", el); if (x) x.textContent = m || ""; };
    el.querySelectorAll("[data-g]").forEach(b => b.onclick = () => { if (b.dataset.g === gsel) return; run(async () => { gsel = b.dataset.g; gmenu = false; gform = false; gmsg = ""; hl = hp = null; sq = ""; showAll = false; gr = null; menu = null; addOpen = false; await loadLects(); home(); }); });
    on("gn", () => { gform = !gform; gmenu = false; gmsg = ""; home(); });
    on("gx", () => { gform = false; gmsg = ""; home(); });
    on("gm", () => { gmenu = !gmenu; gform = false; gmsg = ""; home(); });
    on("gc", () => run(async () => msg(await createGroup($("#newgrade", el).value, $("#newlabel", el).value))));
    on("gsave", () => run(async () => msg(await saveGroup($("#editgrade", el).value, $("#editlabel", el).value))));
    on("cp", () => navigator.clipboard.writeText(curG().code).then(() => toast("اتنسخ الكود"), () => toast(curG().code)));
    on("cc", () => run(() => setCode("change"), "تم تغيير الكود"));
    on("cx", () => run(() => setCode("remove"), "تم مسح الكود"));
    on("cn", () => run(() => setCode("new"), "تم إنشاء الكود"));
    on("gdel", () => deleteGroup());
  };

  function home(){
    cur = null;
    const gd = gr && !grErr ? grData() : null, pend = gd ? gd.pend.length : null, n = stu.filter(x => x.groupId === gsel).length;
    const body = !gsel ? '<p class="muted center small">اعمل أول مجموعة عشان تبدأ تضيف محاضرات وتستقبل طلاب.</p>' : tab === "stu" ? stuTab() : tab === "hw" ? hwTab() : tab === "gr" ? grTab(gd) : lecTab();
    const tabs = [["lec", "المحاضرات"], ["stu", "الطلاب"], ["hw", "الواجبات"], ["gr", "التصحيح" + (pend ? " (" + pend + ")" : "")]];
    el.innerHTML = `<div class="tp">${groupCard()}
<div class="stats"><button class="stat" type="button" data-tb="lec"><b>${lects.length}</b><small>محاضرة</small></button><button class="stat" type="button" data-tb="stu"><b>${n}</b><small>طالب</small></button><button class="stat${pend ? " hot" : ""}" type="button" data-tb="gr"><b>${pend == null ? "—" : pend}</b><small>محتاج تصحيح</small></button></div>
<div class="tabs" style="margin-top:12px">${tabs.map(([k, t]) => `<button type="button" data-tb="${k}" class="${k === tab ? "on" : ""}">${t}</button>`).join("")}</div>
<div class="card" style="margin-top:8px">${body}</div></div>`;
    el.querySelectorAll("[data-tb]").forEach(b => b.onclick = () => { tab = b.dataset.tb; home(); if (tab === "gr" && !gr && !grBusy) loadGr().then(home); });
    bindGroup();
    if (!gsel) { el.querySelectorAll(".stats,.tabs").forEach(x => x.remove()); return; }
    if (tab === "stu") {
      bindStu(); fill();
      $("#sq", el).oninput = e => { sq = e.target.value; $("#sl", el).innerHTML = stuList(); bindStu(); fill(); };
    } else if (tab === "hw") {
      el.querySelectorAll("[data-hl]").forEach(b => b.onclick = () => { hl = b.dataset.hl; hp = null; home(); });
      el.querySelectorAll("[data-hp]").forEach(b => b.onclick = () => { hp = b.dataset.hp; home(); });
      el.querySelectorAll("[data-hb]").forEach(b => b.onclick = () => { if (b.dataset.hb === "list") hl = null; hp = null; home(); });
      el.querySelectorAll("[data-sv]").forEach(b => b.onclick = () => {
        const s = subsAll.find(x => x.id === b.dataset.sv); if (!s) return;
        const p = lects.flatMap(l => l.parts).find(x => x.id === s.partId);
        hwSubView(el, nameMap()[s.studentUid] || "طالب", p ? p.title : "واجب", s, home);
      });
    } else if (tab === "gr") {
      const g = $("[data-gref]", el); if (g) g.onclick = () => { gr = null; grErr = false; home(); loadGr().then(home); };
      el.querySelectorAll("[data-gp]").forEach(b => b.onclick = () => {
        const a = gr.atts.find(x => x.id === b.dataset.gp), e = a && gr.exams.find(x => x.id === a.examId);
        if (e) examResults(el, uid, {id: e.id, title: e.title}, backGr, a.id);
      });
      el.querySelectorAll("[data-ge]").forEach(b => b.onclick = () => {
        const e = gr.exams.find(x => x.id === b.dataset.ge);
        if (e) examResults(el, uid, {id: e.id, title: e.title}, backGr);
      });
    } else {
      const nl = $("#nl", el); if (nl) nl.onclick = () => { addOpen = true; home(); };
      const nx = $("#nx", el); if (nx) nx.onclick = () => { addOpen = false; home(); };
      const nt = $("#nt", el); if (nt) nt.focus();
      const add = $("#add", el); if (add) add.onclick = () => run(async () => {
        const t = $("#nt", el).value.trim(); if (!t) return toast("اكتب اسم المحاضرة");
        await addDoc(collection(db, "lectures"), {teacherUid: uid, title: t, order: Date.now(), hidden: false, mode: "ordered", parts: [], groupId: gsel, createdAt: serverTimestamp()});
        addOpen = false; await load(); home();
      });
      el.querySelectorAll("[data-mn]").forEach(b => b.onclick = () => { menu = menu === b.dataset.mn ? null : b.dataset.mn; home(); });
      el.querySelectorAll("#ls [data-act]").forEach(b => b.onclick = () => run(async () => {
        const i = lects.findIndex(x => x.id === b.dataset.id), l = lects[i], a = b.dataset.act;
        if (a === "open") { pm = null; return lecture(l); }
        if (a === "hide") await save(l, {hidden: !l.hidden});
        else if (a === "del") { if (!confirm("مسح المحاضرة بكل أجزائها؟")) return; await deleteDoc(doc(db, "lectures", l.id)); lects.splice(i, 1); menu = null; }
        else { const j = a === "up" ? i - 1 : i + 1; if (j < 0 || j >= lects.length) return; const o = lects[j].order; await save(lects[j], {order: l.order}); await save(l, {order: o}); lects.sort((x, y) => x.order - y.order); }
        home();
      }));
    }
  }

  /* ---------- تفاصيل الطالب ---------- */
  async function student(x){
    if (!x) return;
    const u = x.studentUid;
    el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
    const mine = c => getDocs(query(collection(db, c), where("teacherUid", "==", uid), where("studentUid", "==", u)));
    const sf = p => p.catch(() => null);
    const [p, g, s, P, S, A] = await Promise.all([sf(getDoc(doc(db, "private", u))), sf(getDoc(doc(db, "users", u))), sf(getDoc(doc(db, "sessions", u))), sf(mine("progress")), sf(mine("subs")), sf(mine("attempts"))]);
    const pv = p && p.exists() ? p.data() : {}, us = g && g.exists() ? g.data() : {}, ss = s && s.exists() ? s.data() : null;
    const pr = {}, sb = {}, at = {};
    if (P) P.docs.forEach(z => { pr[z.data().partId] = z.data(); });
    if (S) S.docs.forEach(z => { sb[z.data().partId] = {id: z.id, ...z.data()}; });
    if (A) A.docs.forEach(z => { at[z.data().examId] = z.data(); });
    const exd = {};
    if (A) await Promise.all(Object.keys(at).map(async id => { try { const z = await getDoc(doc(db, "exams", id)); if (z.exists()) exd[id] = z.data(); } catch (e) {} }));
    const fx = pt => { const a = at[pt.id]; return !!a && (a.submitted || (exd[pt.id] ? finished(a, exd[pt.id]) : false)); };
    const created = tms(us.createdAt), seen = ss ? tms(ss.at) : 0;
    const dn = pt => pt.type === "explain" ? !!(pr[pt.id] && pr[pt.id].done !== false) : pt.type === "homework" ? !!sb[pt.id] : fx(pt);
    const all = lects.flatMap(l => l.parts), fin = all.filter(dn).length;
    const status = pt => {
      if (!P && pt.type === "explain" || !S && pt.type === "homework" || !A && pt.type === "exam") return "—";
      if (pt.type === "explain") { const z = pr[pt.id]; return z && z.done !== false ? '<span class="okm">✓ خلّص</span>' : z && z.pct > 0 ? "شاهد " + z.pct + "%" : "لسه ما بدأش"; }
      if (pt.type === "homework") return sb[pt.id] ? '<span class="okm">✓ سلّم</span>' : "لسه ما سلّمش";
      const a = at[pt.id]; if (!a) return "لسه ما دخلش";
      return (a.submitted ? '<span class="okm">✓ سلّم</span>' : fx(pt) ? '<span class="okm">✓ انتهى وقته</span>' : "لسه بيحل") + (a.released && a.result ? " · " + a.result.score + " من " + a.result.total : "");
    };
    const sub = pt => {
      if (pt.type === "homework" && sb[pt.id] && tms(sb[pt.id].createdAt)) return `<small>${fullFmt(tms(sb[pt.id].createdAt))}</small>`;
      const a = pt.type === "exam" && at[pt.id]; if (!a) return "";
      const xs = exOut(a);
      const tt = exd[pt.id] ? `<small>دخل: ${fdt(tms(a.startedAt))} · خلّص: ${fdt(endAt(a, exd[pt.id]))}${a.submitted ? "" : " (انتهى وقته)"}</small>` : `<small>دخل: ${fdt(tms(a.startedAt))}</small>`;
      return tt + `<small>خروج من الصفحة: ${xs.length} مرة${xs.length ? " · " + xs.reduce((t, z) => t + z.d, 0) + " ث" : ""}</small>`;
    };
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(x.studentName)}</h2>
<div class="item"><small>رقم الطالب</small>${p && p.exists() ? tel(pv.phone) : "—"}</div>
<div class="item"><small>رقم ولي الأمر</small>${p && p.exists() ? tel(pv.parentPhone) : "—"}</div>
${p ? "" : '<p class="err small">تعذّر تحميل الأرقام. تأكد إنك نشرت قواعد Firestore الجديدة.</p>'}
<div class="item"><small>أول تسجيل</small>${created ? esc(fullFmt(created)) : "—"}</div>
<div class="item"><small>آخر ظهور</small>${ss ? esc(fullFmt(seen)) + " (" + ago(seen) + ")" : s ? "لسه ما ظهرش" : "—"}</div>
<div class="item"><small>التقدم</small>خلّص ${fin} من ${all.length} جزء</div>${groups.length > 1 ? `<div class="item"><small>نقل لمجموعة تانية</small><div class="addrow"><select id="mv" class="plain" aria-label="المجموعة">${groups.filter(g => g.id !== gsel).map(g => `<option value="${g.id}">${esc(gname(g))}</option>`).join("")}</select><button id="mb" class="btn s sm" type="button">نقل</button></div></div>` : ""}</div>
${lects.map(l => `<div class="card" style="margin-top:14px"><b>${esc(l.title)}</b>${l.hidden ? ' <small class="muted">مخفية</small>' : ""}${l.parts.length ? l.parts.map(pt => `<div class="item lrow"><span class="ic">${ic(TYPES[pt.type][1])}</span><div class="lt"><b>${esc(pt.title)}</b><small>${TYPES[pt.type][0]}</small>${sub(pt)}</div><span>${status(pt)}</span>${pt.type === "homework" && sb[pt.id] ? `<button class="btn s sm" type="button" data-sv="${pt.id}">فتح</button>` : ""}</div>`).join("") : '<p class="muted small">مفيش أجزاء.</p>'}</div>`).join("")}`;
    $("#bk", el).onclick = home;
    const mb = $("#mb", el); if (mb) mb.onclick = () => run(async () => { const v = $("#mv", el).value, g = groups.find(y => y.id === v); if (!g || !confirm("نقل " + x.studentName + " إلى " + gname(g) + "؟ هيشوف محاضرات المجموعة الجديدة بس.")) return; await updateDoc(doc(db, "links", x.id), {groupId: v}); x.groupId = v; toast("تم النقل"); home(); });
    el.querySelectorAll("[data-sv]").forEach(b => b.onclick = () => { const pt = all.find(z => z.id === b.dataset.sv); hwSubView(el, x.studentName, pt ? pt.title : "واجب", sb[b.dataset.sv], () => student(x)); });
  }

  function lecture(l){
    cur = l;
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع للمحاضرات</button><div class="addrow" style="margin-top:12px"><input id="lt" value="${esc(l.title)}" aria-label="اسم المحاضرة"><button id="sv" class="btn s sm" type="button">حفظ الاسم</button></div><label class="lb">طريقة فتح الأجزاء للطالب</label><div class="roles">${[["ordered", "بالترتيب"], ["open", "مفتوحة"]].map(([k, t]) => `<button type="button" data-m="${k}" class="${l.mode === k ? "on" : ""}"><span>${t}</span></button>`).join("")}</div><p class="muted small">${l.mode === "open" ? "كل الأجزاء ظاهرة للطالب من الأول." : "الطالب يخلّص الجزء اللي قبله عشان يفتح اللي بعده."}</p>${l.mode === "ordered" ? '<button id="all" class="btn s sm" type="button">افتح الكل للطلاب</button>' : ""}</div>
<div class="card" style="margin-top:14px"><h2 class="h">الأجزاء (${l.parts.length})</h2><div class="addrow"><input id="pt" placeholder="عنوان الجزء (اختياري)" aria-label="عنوان الجزء"></div><div class="roles three">${Object.entries(TYPES).map(([k, [t, i]]) => `<button type="button" data-add="${k}">${ic(i, 22)}<span>+ ${t}</span></button>`).join("")}</div><div id="ps">${l.parts.length ? l.parts.map((p, i) => `<div class="item"><div class="lrow"><span class="ic">${ic(TYPES[p.type][1])}</span><div class="lt"><b>${esc(p.title)}</b><small>${TYPES[p.type][0]}${p.type === "explain" ? " · " + mc(p) : p.type === "homework" ? " · " + hc(p.id) : ""}</small></div>${p.type === "exam" ? `<button class="btn s sm" type="button" data-ex="${i}">إعداد</button>` : p.type === "homework" ? `<button class="btn s sm" type="button" data-hwb="${i}">إعداد</button>` : `<button class="btn s sm" type="button" data-cb="${i}">المحتوى</button>`}<button class="ab mn" type="button" data-pm="${p.id}" aria-label="خيارات">⋯</button></div>${pm === p.id ? `<div class="macts">${i > 0 ? `<button class="btn s sm" type="button" data-act="pu" data-id="${i}">↑ لفوق</button>` : ""}${i < l.parts.length - 1 ? `<button class="btn s sm" type="button" data-act="pd" data-id="${i}">↓ لتحت</button>` : ""}<button class="btn s sm bad" type="button" data-act="px" data-id="${i}">مسح</button></div>` : ""}</div>`).join("") : '<p class="muted center">أضف أجزاء المحاضرة من الأزرار فوق.</p>'}</div></div>`;
    $("#bk", el).onclick = home;
    el.querySelectorAll("[data-ex]").forEach(b => b.onclick = () => examBuilder(el, uid, l, l.parts[+b.dataset.ex], () => lecture(l)));
    el.querySelectorAll("[data-hwb]").forEach(b => b.onclick = () => hwBuilder(el, uid, l, l.parts[+b.dataset.hwb], () => lecture(l)));
    el.querySelectorAll("[data-cb]").forEach(b => b.onclick = () => content(l, +b.dataset.cb));
    $("#sv", el).onclick = () => run(async () => { const t = $("#lt", el).value.trim(); if (!t) return toast("اكتب الاسم"); await save(l, {title: t}); }, "تم الحفظ");
    el.querySelectorAll("[data-m]").forEach(b => b.onclick = () => run(async () => { await save(l, {mode: b.dataset.m}); lecture(l); }));
    const all = $("#all", el); if (all) all.onclick = () => run(async () => { await save(l, {mode: "open"}); lecture(l); }, "الأجزاء مفتوحة للطلاب");
    el.querySelectorAll("[data-add]").forEach(b => b.onclick = () => run(async () => {
      const k = b.dataset.add, t = $("#pt", el).value.trim() || TYPES[k][0];
      await save(l, {parts: [...l.parts, {id: crypto.randomUUID(), type: k, title: t}]}); lecture(l);
    }));
    el.querySelectorAll("[data-pm]").forEach(b => b.onclick = () => { pm = pm === b.dataset.pm ? null : b.dataset.pm; lecture(l); });
    el.querySelectorAll("#ps [data-act]").forEach(b => b.onclick = () => run(async () => {
      const i = +b.dataset.id, ps = [...l.parts], a = b.dataset.act;
      if (a === "px") { if (!confirm("مسح الجزء ده؟")) return; ps.splice(i, 1); pm = null; }
      else if (!swap(ps, i, a === "pu" ? i - 1 : i + 1)) return;
      await save(l, {parts: ps}); lecture(l);
    }));
  }

  function content(l, i){
    const p = l.parts[i];
    let media = p.media ? [...p.media] : (p.url ? [{u: p.url, t: "link", n: "رابط"}] : []);
    const persist = async () => { const ps = [...l.parts]; const {url, ...rest} = ps[i]; ps[i] = {...rest, media}; await save(l, {parts: ps}); };
    const TL = {video: "فيديو", yt: "فيديو يوتيوب", pdf: "PDF", link: "رابط (قديم)"};
    const loadMon = async () => {
      const box = $("#mn", el); if (!box) return;
      try {
        const s = await getDocs(query(collection(db, "progress"), where("teacherUid", "==", uid), where("partId", "==", p.id)));
        const pr = {}; s.docs.forEach(x => { pr[x.data().studentUid] = x.data(); });
        const a = stu.filter(x => x.groupId === l.groupId && x.status !== "suspended");
        if (!$("#mn", el)) return;
        $("#mn", el).innerHTML = a.length ? a.map(x => { const g = pr[x.studentUid], dn = g && g.done !== false; return `<div class="item lrow"><div class="lt"><b>${esc(x.studentName)}</b></div><span class="${dn ? "" : "muted"}">${dn ? "✓ خلّص" : g && g.pct > 0 ? "شاهد " + g.pct + "%" : "لسه ما بدأش"}</span></div>`; }).join("") : '<p class="muted center">لسه مفيش طلاب.</p>';
      } catch (e) { if ($("#mn", el)) $("#mn", el).innerHTML = '<p class="err center">تعذّر تحميل المتابعة.</p>'; }
    };
    const draw = () => {
      el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع للمحاضرة</button><h2 class="h" style="margin-top:10px">${esc(p.title)}</h2>
<div id="ml">${media.length ? media.map((m, k) => `<div class="item lrow"><span class="ic">${ic(m.t === "video" || m.t === "yt" ? "vid" : "doc")}</span><div class="lt"><b>${esc(m.n || "ملف")}</b><small>${TL[m.t] || ""}</small></div><a class="btn s sm" style="text-decoration:none" href="${esc(m.u)}" target="_blank" rel="noopener">معاينة</a><button class="ab" type="button" data-d="${k}" aria-label="مسح">${ic("trash", 18)}</button></div>`).join("") : '<p class="muted center">لسه مفيش محتوى. ارفع فيديو أو PDF.</p>'}</div>
<div class="roles three" style="margin-top:12px"><button type="button" data-n="video">${ic("vid", 22)}<span>ارفع فيديو</span></button><button type="button" data-n="vlink">${ic("vid", 22)}<span>رابط فيديو</span></button><button type="button" data-n="pdf">${ic("doc", 22)}<span>ارفع PDF</span></button></div>
<p class="muted small">الفيديو المرفوع لحد 100 ميجا والـ PDF لحد 10 ميجا. رابط الفيديو لازم يكون يوتيوب أو mp4 مباشر، وبيتشغّل جوا المنصة. في الحالتين الجزء بيتحسب للطالب لما يشاهد 90% منه فعلياً.</p></div>
<div class="card" style="margin-top:14px"><h2 class="h">متابعة الطلاب</h2><div id="mn"><p class="muted center">جاري التحميل…</p></div></div>`;
      $("#bk", el).onclick = () => lecture(l);
      el.querySelectorAll("[data-d]").forEach(b => b.onclick = async () => {
        if (!confirm("شيل الملف ده من الجزء؟")) return;
        const old = media; media = media.filter((_, k) => k !== +b.dataset.d);
        try { await persist(); } catch (e) { media = old; toast("حصل خطأ، حاول تاني"); }
        draw();
      });
      el.querySelectorAll("[data-n]").forEach(b => b.onclick = async () => {
        const old = media;
        try {
          const k = b.dataset.n; let r;
          if (k === "vlink") {
            const u = (prompt("الصق رابط الفيديو (يوتيوب أو رابط mp4 مباشر يبدأ بـ https)") || "").trim(); if (!u) return;
            const y = ytId(u);
            if (y) r = [{t: "yt", id: y, u, n: "فيديو"}];
            else if (/^https:\/\/.+\.(mp4|webm|m4v)(\?.*)?$/i.test(u)) r = [{t: "video", u, x: 1, n: "فيديو"}];
            else return toast("الرابط لازم يكون فيديو يوتيوب أو mp4 مباشر");
          } else r = await pickUpload({kinds: [k], max: 1});
          if (!r.length) return;
          media = [...media, ...r]; await persist(); toast("تمت الإضافة");
        } catch (e) { media = old; toast(upMsg(e)); }
        draw();
      });
      loadMon();
    };
    draw();
  }

  el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
  try { await load(); home(); } catch (e) { el.innerHTML = '<p class="err center">تعذّر تحميل المحاضرات. تأكد من الإنترنت وقواعد Firestore.</p>'; }
}
