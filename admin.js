import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteField} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {finished, endAt, fdt, tms} from "./time.js";
import {SUBJECTS, digits, checkAcc, saveAcc} from "./account.js";

const TABS = [["pending","قيد المراجعة"],["active","مفعّلة"],["suspended","موقوفة"]];
const TOP = [["acc","الحسابات"],["cnt","المدرسين والمحتوى"],["mnt","صيانة"]];
const SUB = [["lec","المحاضرات"],["exm","الامتحانات"],["hw","الواجبات"],["stu","الطلاب"]];
const TN = {explain:"شرح", homework:"واجب", exam:"امتحان"};
const tel = n => n ? `<a href="tel:${esc(n)}" dir="ltr">${esc(n)}</a>` : "";
const fm = ms => ms ? new Date(ms).toLocaleString("ar-EG", {dateStyle:"medium", timeStyle:"short"}) : "—";
const LOAD = '<p class="muted center">جاري التحميل…</p>';
const ERR = '<p class="err center">تعذّر التحميل. تأكد من الإنترنت وقواعد Firestore.</p>';
const get = async (c, ...w) => (await getDocs(query(collection(db, c), ...w))).docs.map(x => ({id: x.id, ...x.data()}));
const back = (id, t = "رجوع") => `<button id="${id}" class="lnk" type="button">${ic("back", 18)} ${t}</button>`;

export function renderAdmin(el){
  let sec = "acc", accTab = "pending";
  el.innerHTML = `<div class="card"><h2 class="h">لوحة الأدمن</h2><div class="tabs" id="top"></div></div><div id="ls" style="margin-top:14px"></div>`;
  const top = $("#top", el), body = $("#ls", el);
  const drawTop = () => {
    top.innerHTML = TOP.map(([k,t]) => `<button type="button" data-s="${k}" class="${k===sec?"on":""}">${t}</button>`).join("");
    top.querySelectorAll("button").forEach(b => b.onclick = () => { sec = b.dataset.s; drawTop(); sec === "acc" ? accounts() : sec === "mnt" ? maintenance() : teachers(); });
  };

  /* ---------- الحسابات ---------- */
  function accounts(){
    let tab = accTab, rows = [], q = "";
    body.innerHTML = `<div class="card"><div class="tabs" id="tb"></div><input id="q" placeholder="بحث بالاسم أو الرقم"><div id="al"></div></div>`;
    const al = $("#al", body), tb = $("#tb", body);
    const drawTabs = () => {
      tb.innerHTML = TABS.map(([k,t]) => `<button type="button" data-t="${k}" class="${k===tab?"on":""}">${t}</button>`).join("");
      tb.querySelectorAll("button").forEach(b => b.onclick = () => { tab = accTab = b.dataset.t; drawTabs(); load(); });
    };
    const draw = () => {
      const k = q.trim().toLowerCase();
      const list = rows.filter(r => !k || [r.name, r.phone, r.parentPhone, r.email].some(x => String(x || "").toLowerCase().includes(k)));
      if (!list.length) { al.innerHTML = '<p class="muted center">مفيش حسابات هنا</p>'; return; }
      al.innerHTML = list.map(r => `<div class="item"><b>${esc(r.name)}</b><small>${r.role==="teacher"?"مدرس · "+esc(r.subject):"طالب"}</small><small>الرقم: ${tel(r.phone)}</small>${r.parentPhone?`<small>ولي الأمر: ${tel(r.parentPhone)}</small>`:""}<small dir="ltr">${esc(r.email)}</small><div class="acts">${tab!=="active"?`<button class="btn p sm" data-id="${r.id}" data-s="active">تفعيل</button>`:""}${tab!=="suspended"?`<button class="btn s sm" data-id="${r.id}" data-s="suspended">إيقاف</button>`:""}<button class="btn s sm" type="button" data-ed="${r.id}">تعديل</button></div></div>`).join("");
      al.querySelectorAll("[data-ed]").forEach(b => b.onclick = () => editAcc(rows.find(x => x.id === b.dataset.ed)));
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


  /* ---------- تعديل بيانات حساب ---------- */
  function editAcc(r){
    if (!r) return;
    const st = r.role === "student", subs = SUBJECTS.includes(r.subject) || !r.subject ? SUBJECTS : [r.subject, ...SUBJECTS];
    body.innerHTML = `<div class="card">${back("bk")}<h2 class="h" style="margin-top:10px">تعديل ${st ? "طالب" : "مدرس"}</h2>
<label class="lb">الاسم</label><input id="en" class="plain" value="${esc(r.name)}">
<label class="lb">الرقم</label><input id="ep" class="plain" inputmode="numeric" dir="ltr" value="${esc(r.phone || "")}">
${st ? `<label class="lb">رقم ولي الأمر</label><input id="ev" class="plain" inputmode="numeric" dir="ltr" value="${esc(r.parentPhone || "")}">` : `<label class="lb">المادة</label><select id="es" class="plain">${subs.map(x => `<option${x === r.subject ? " selected" : ""}>${esc(x)}</option>`).join("")}</select>`}
<label class="lb">الإيميل (للقراءة فقط)</label><input class="plain" dir="ltr" value="${esc(r.email || "")}" readonly>
<p class="muted small">الإيميل بيتغيّر من Firebase Console بس، لأن الدخول بيعتمد عليه.</p>
<button id="sv" class="btn p full" type="button">حفظ</button><p id="em" class="err" role="alert"></p></div>`;
    $("#bk", body).onclick = accounts;
    $("#sv", body).onclick = async () => {
      const v = {name: $("#en", body).value.trim().replace(/\s+/g, " "), phone: digits($("#ep", body).value)};
      if (st) v.parent = digits($("#ev", body).value); else v.subject = $("#es", body).value;
      const m = $("#em", body), bad = checkAcc(r, v);
      if (bad) { m.textContent = bad; return; }
      if (!confirm("تحديث بيانات " + r.name + "؟")) return;
      const b = $("#sv", body); b.disabled = true; m.textContent = "";
      try { await saveAcc(r, v); toast("تم الحفظ"); accounts(); }
      catch (e) { m.textContent = e && e.ui ? e.message : "حصل خطأ: " + ((e && e.code) || "unknown") + ". اتأكد إن القواعد الجديدة منشورة."; b.disabled = false; }
    };
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
      exm: () => exams.length ? exams.map(e => { const a = atts.filter(x => x.examId === e.id); return `<div class="item lrow"><div class="lt"><b>${esc(e.title)}</b><small>${e.published ? "منشور" : "مسودة"} · ${e.qCount ?? (e.questions || []).length} سؤال · ينتهي ${fm(e.end)}</small><small>دخل ${a.length} · سلّم ${a.filter(x => finished(x, e)).length}</small></div><button class="btn s sm" type="button" data-e="${e.id}">الدرجات</button></div>`; }).join("") : '<p class="muted center">مفيش امتحانات</p>',
      hw: () => hws.length ? hws.map(h => { const s = subs.filter(x => x.partId === h.id); return `<div class="item lrow"><div class="lt"><b>${esc(h.title)}</b><small>تسليمات ${s.length}</small></div><button class="btn s sm" type="button" data-h="${h.id}">التسليمات</button></div>`; }).join("") : '<p class="muted center">مفيش واجبات</p>',
      stu: () => links.length ? links.map(l => `<div class="item"><b>${esc(l.studentName)}</b><small>${l.status === "suspended" ? "موقوف" : "نشط"}</small></div>`).join("") : '<p class="muted center">مفيش طلاب</p>'
    };
    body.innerHTML = `<div class="card">${back("bk", "رجوع للمدرسين")}<h2 class="h" style="margin-top:10px">${esc(t.name)} · ${esc(t.subject)}</h2><div class="tabs" id="st">${SUB.map(([k,x]) => `<button type="button" data-k="${k}" class="${k===tab?"on":""}">${x}</button>`).join("")}</div>${view[tab]()}</div>`;
    $("#bk", body).onclick = teachers;
    body.querySelectorAll("#st button").forEach(b => b.onclick = () => teacher(t, b.dataset.k, data));
    body.querySelectorAll("[data-e]").forEach(b => b.onclick = () => examGrades(t, exams.find(x => x.id === b.dataset.e), atts.filter(x => x.examId === b.dataset.e), names, () => teacher(t, "exm", data), data));
    body.querySelectorAll("[data-h]").forEach(b => b.onclick = () => hwGrades(hws.find(x => x.id === b.dataset.h), subs.filter(x => x.partId === b.dataset.h), names, () => teacher(t, "hw", data)));
  }

  async function examGrades(t, ex, atts, names, bk, data){
    body.innerHTML = LOAD;
    let key, qs; const ips = {};
    try {
      const k = await getDoc(doc(db, "exams", ex.id, "key", "main")); key = k.exists() ? k.data().answers : {};
      qs = ex.questions || (await getDoc(doc(db, "exams", ex.id, "paper", "main"))).data().questions;
      (await getDocs(query(collection(db, "ips"), where("examId", "==", ex.id)))).docs.forEach(x => { ips[x.data().studentUid] = x.data(); });
    } catch (e) { body.innerHTML = ERR; return; }
    const total = qs.reduce((s, q) => s + q.points, 0), fin = a => finished(a, ex), nm = u => names[u] || "طالب";
    const gr = (a, q) => (a.grades || {})[q.id] ?? (q.type === "essay" ? null : ((a.answers || {})[q.id] === key[q.id] ? q.points : 0));
    const score = a => qs.reduce((s, q) => s + (gr(a, q) || 0), 0);
    const pend = a => qs.some(q => q.type === "essay" && (a.grades || {})[q.id] == null);
    const rows = [...atts].sort((a, b) => score(b) - score(a));
    const ipOf = a => (ips[a.studentUid] && ips[a.studentUid].ip) || a.ip || "";
    const grp = {}; atts.forEach(a => { const p = ipOf(a); if (p) (grp[p] = grp[p] || []).push(a); });
    const mates = a => { const p = ipOf(a); return p && grp[p].length > 1 ? grp[p].filter(b => b.studentUid !== a.studentUid) : []; };
    const obj = qs.filter(q => q.type !== "essay" && key[q.id] != null);
    const sim = (a, b) => {
      let both = 0, same = 0, wrong = 0;
      obj.forEach(q => { const x = (a.answers || {})[q.id], y = (b.answers || {})[q.id]; if (x == null || y == null) return; both++; if (x === y) { same++; if (x !== key[q.id]) wrong++; } });
      return {both, same, wrong, pct: both ? Math.round(same / both * 100) : 0};
    };
    const simTxt = (a, b) => { const r = sim(a, b); return r.both ? `تطابق ${r.pct}% (${r.same} من ${r.both}) · غلط متطابق ${r.wrong}` : "لا يوجد أسئلة مشتركة"; };
    const pairs = [];
    Object.values(grp).forEach(g => { for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) pairs.push({a: g[i], b: g[j], r: sim(g[i], g[j])}); });
    pairs.sort((x, y) => y.r.wrong - x.r.wrong || y.r.pct - x.r.pct);
    const ansTxt = (q, v) => v == null || v === "" ? "—" : q.type === "mcq" ? esc((q.options || [])[v]) : q.type === "tf" ? (v ? "صح" : "خطأ") : esc(String(v).slice(0, 80));
    const times = a => `دخل: ${esc(fdt(tms(a.startedAt)))} · خلّص: ${fin(a) ? esc(fdt(endAt(a, ex))) + (a.submitted ? "" : " (انتهى وقته)") : "لسه بيحل"}`;

    function render(){
      body.innerHTML = `<div class="card">${back("bk")}<h2 class="h" style="margin-top:10px">${esc(ex.title)}</h2><p class="muted small">${esc(t.name)} · الدرجة الكلية ${total}</p></div>
${pairs.length ? `<div class="card" style="margin-top:14px"><h2 class="h">نفس الـ IP (${pairs.length})</h2><p class="muted small">إشارة مش دليل: ممكن أخوات أو نفس الشبكة. الغلط المتطابق هو الأقوى.</p>${pairs.map(p => `<div class="item"><b>${esc(nm(p.a.studentUid))} و ${esc(nm(p.b.studentUid))}</b><small dir="ltr">${esc(ipOf(p.a))}</small><small class="${p.r.wrong >= 3 ? "badm" : ""}">${simTxt(p.a, p.b)}</small></div>`).join("")}</div>` : ""}
<div class="card" style="margin-top:14px;overflow-x:auto"><table class="tbl"><tr><th>#</th><th>الاسم</th><th>الدرجة</th><th>دخل</th><th>خلّص</th><th>IP</th><th>الحالة</th><th></th></tr>${rows.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(nm(a.studentUid))}</td><td>${score(a)} / ${total}</td><td>${esc(fdt(tms(a.startedAt)))}</td><td>${fin(a) ? esc(fdt(endAt(a, ex))) : "—"}</td><td dir="ltr">${esc(ipOf(a) || "غير مسجّل")}${mates(a).length ? " ⚠" + mates(a).length : ""}</td><td>${a.submitted ? "سلّم" : fin(a) ? "انتهى وقته" : "لسه"}${pend(a) ? " · مقالي مستني" : ""}${a.released ? " · ظاهرة" : ""}</td><td><button class="btn s sm" type="button" data-u="${a.studentUid}">ملف</button></td></tr>`).join("") || '<tr><td colspan="8" class="muted center">لسه ما حدش دخل.</td></tr>'}</table></div>`;
      $("#bk", body).onclick = bk;
      body.querySelectorAll("[data-u]").forEach(b => b.onclick = () => stuFile(atts.find(a => a.studentUid === b.dataset.u)));
    }

    async function stuFile(a){
      body.innerHTML = LOAD;
      const uid = a.studentUid;
      const one = async (c, id) => { try { const z = await getDoc(doc(db, c, id)); return z.exists() ? z.data() : {}; } catch (e) { return {}; } };
      const [us, pr, ss] = await Promise.all([one("users", uid), one("private", uid), one("sessions", uid)]);
      const ip = ips[uid] || {}, log = ip.log || [], ms = mates(a);
      const others = ((data && data.atts) || []).filter(x => x.studentUid === uid && x.examId !== ex.id).map(x => { const e2 = ((data && data.exams) || []).find(z => z.id === x.examId); return {x, e2}; });
      const xl = (arr, w) => (arr || []).length ? `<p class="small"><b>${w} (${arr.length}):</b> ${arr.map(z => `${esc(fdt(z.t))} (${z.d}ث${z.p ? " · رفع صورة" : ""})`).join("، ")}</p>` : `<p class="muted small">${w}: لا يوجد</p>`;
      body.innerHTML = `<div class="card">${back("bk2", "رجوع للدرجات")}<h2 class="h" style="margin-top:10px">${esc(us.name || nm(uid))}</h2>
<p class="small muted">${us.createdAt ? "سجّل: " + esc(fdt(tms(us.createdAt))) + " · " : ""}${ss.at ? "آخر ظهور: " + esc(fdt(tms(ss.at))) : ""}</p>
<p class="small">${pr.phone ? "رقمه: " + tel(pr.phone) : ""} ${pr.parentPhone ? " · ولي الأمر: " + tel(pr.parentPhone) : ""}</p>${pr.email ? `<p class="small" dir="ltr">${esc(pr.email)}</p>` : ""}</div>
<div class="card" style="margin-top:14px"><h2 class="h">الامتحان ده</h2><p><b>${score(a)} / ${total}</b>${pend(a) ? " · مقالي مستني" : ""}</p><p class="small">${times(a)}</p>
<p class="small" dir="ltr">IP: ${esc(ipOf(a) || "غير مسجّل")}</p>${ip.ua ? `<p class="small muted" dir="ltr">${esc(ip.ua)}</p>` : ""}
${log.length ? `<p class="small"><b>دخول تاني للامتحان (${log.length}):</b></p>${log.map(z => `<p class="small muted" dir="ltr">${esc(fdt(z.t))} · ${esc(z.ip || "غير مسجّل")}${z.ip && z.ip !== ipOf(a) ? " ⚠ مختلف" : ""}</p>`).join("")}` : ""}
${xl(a.exits, "خروج من الصفحة")}${xl(a.blurs, "فقدان التركيز")}</div>
${ms.length ? `<div class="card" style="margin-top:14px"><h2 class="h">نفس الـ IP</h2>${ms.map(b => `<div class="item"><b>${esc(nm(b.studentUid))}</b><small class="${sim(a, b).wrong >= 3 ? "badm" : ""}">${simTxt(a, b)}</small></div>`).join("")}</div>` : ""}
<div class="card" style="margin-top:14px;overflow-x:auto"><h2 class="h">الإجابات</h2><table class="tbl"><tr><th>#</th><th>السؤال</th><th>إجابته</th><th>الصح</th></tr>${qs.map((q, i) => { const v = (a.answers || {})[q.id], g = gr(a, q); return `<tr><td>${i + 1}</td><td>${esc((q.text || "صورة").slice(0, 40))}</td><td>${ansTxt(q, v)}</td><td>${q.type === "essay" ? (g == null ? "لم يُصحح" : g + " / " + q.points) : `${ansTxt(q, key[q.id])} ${g >= q.points ? "✓" : "✗"}`}</td></tr>`; }).join("")}</table></div>
${others.length ? `<div class="card" style="margin-top:14px"><h2 class="h">امتحانات تانية عند نفس المدرس</h2>${others.map(({x, e2}) => `<div class="item"><b>${esc(e2 ? e2.title : "امتحان")}</b><small>${e2 ? (x.submitted ? "سلّم" : finished(x, e2) ? "انتهى وقته" : "لسه") + " · " : ""}دخل: ${esc(fdt(tms(x.startedAt)))} · خروج ${(x.exits || []).length} · تركيز ${(x.blurs || []).length}</small></div>`).join("")}</div>` : ""}`;
      $("#bk2", body).onclick = render;
    }
    render();
  }

  /* ---------- صيانة: ترحيلات بتتعمل مرة واحدة بعد نشر القواعد الجديدة ---------- */
  function maintenance(){
    body.innerHTML = `<div class="card"><h2 class="h">صيانة</h2><p class="muted small">اعمل الترحيلات دي مرة واحدة بعد ما تنشر القواعد الجديدة. أمان تكرارها.</p><button id="m1" class="btn s full" type="button">ترحيل أسئلة الامتحانات القديمة</button><button id="m2" class="btn s full" type="button">ترحيل الـ IP القديم من المحاولات</button><p id="mo" class="muted small" role="status"></p></div>`;
    const out = m => { $("#mo", body).textContent = m; };
    const run = async (b, fn) => { b.disabled = true; try { await fn(); } catch (e) { out("حصل خطأ: " + ((e && e.code) || "unknown") + ". اتأكد إن القواعد الجديدة منشورة."); } b.disabled = false; };
    $("#m1", body).onclick = e => run(e.currentTarget, async () => {
      out("جاري البحث…");
      const old = (await get("exams")).filter(x => Array.isArray(x.questions));
      if (!old.length) return out("مفيش امتحانات قديمة. كله اتنقل.");
      if (!confirm("هنقل أسئلة " + old.length + " امتحان لمستند فرعي. نكمل؟")) return out("");
      let n = 0;
      for (const x of old) {
        await setDoc(doc(db, "exams", x.id, "paper", "main"), {questions: x.questions});
        await updateDoc(doc(db, "exams", x.id), {qCount: x.questions.length, pts: x.questions.reduce((s, q) => s + (+q.points || 0), 0), essayIds: x.questions.filter(q => q.type === "essay").map(q => q.id), questions: deleteField()});
        n++; out("اتنقل " + n + " من " + old.length + "…");
      }
      out("خلص: اتنقل " + n + " امتحان.");
    });
    $("#m2", body).onclick = e => run(e.currentTarget, async () => {
      out("جاري البحث…");
      const old = await get("attempts", where("ip", "!=", ""));
      if (!old.length) return out("مفيش IP قديم في المحاولات.");
      if (!confirm("هننقل الـ IP من " + old.length + " محاولة لمكان الأدمن بس ونمسحه من المحاولة. نكمل؟")) return out("");
      let n = 0;
      for (const a of old) {
        const r = doc(db, "ips", a.id);
        if (!(await getDoc(r)).exists()) await setDoc(r, {examId: a.examId, studentUid: a.studentUid, teacherUid: a.teacherUid, ip: String(a.ip).slice(0, 64), ua: "", at: a.startedAt || new Date()});
        await updateDoc(doc(db, "attempts", a.id), {ip: deleteField()});
        n++; if (n % 5 === 0) out("اتنقل " + n + " من " + old.length + "…");
      }
      out("خلص: اتنقل " + n + " محاولة.");
    });
  }

  function hwGrades(h, subs, names, bk){
    body.innerHTML = `<div class="card">${back("bk")}<h2 class="h" style="margin-top:10px">${esc(h.title)}</h2><p class="muted small">التسليمات: ${subs.length}</p></div><div class="card" style="margin-top:14px;overflow-x:auto"><table class="tbl"><tr><th>الاسم</th><th>وقت التسليم</th></tr>${subs.map(s => `<tr><td>${esc(names[s.studentUid] || "طالب")}</td><td>${s.createdAt && s.createdAt.toMillis ? fm(s.createdAt.toMillis()) : "—"}</td></tr>`).join("") || '<tr><td colspan="2" class="muted center">لسه ما حدش سلّم.</td></tr>'}</table></div>`;
    $("#bk", body).onclick = bk;
  }

  drawTop(); accounts();
}
