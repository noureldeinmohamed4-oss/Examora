import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, getDoc, updateDoc, writeBatch} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {urlImgs} from "./media.js";

const ms = t => t && t.toMillis ? t.toMillis() : 0;
const mm = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const ft = t => new Date(t).toLocaleTimeString("ar-EG", {hour: "2-digit", minute: "2-digit"});

export async function examResults(el, uid, exam, back){
  el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
  let key = {}, names = {}, atts = [];
  try {
    exam = {...exam, ...(await getDoc(doc(db, "exams", exam.id))).data()};
    key = (await getDoc(doc(db, "exams", exam.id, "key", "main"))).data().answers;
    (await getDocs(query(collection(db, "links"), where("teacherUid", "==", uid)))).docs.forEach(x => { names[x.data().studentUid] = x.data().studentName; });
    atts = (await getDocs(query(collection(db, "attempts"), where("teacherUid", "==", uid), where("examId", "==", exam.id)))).docs.map(x => ({id: x.id, ...x.data()}));
  } catch (e) { el.innerHTML = '<p class="err center">تعذّر تحميل النتائج. تأكد من الإنترنت وقواعد Firestore.</p>'; return; }
  const qs = exam.questions, total = qs.reduce((s, q) => s + q.points, 0), ended = Date.now() > exam.end + 20000;
  const fin = a => a.submitted || ended;
  const auto = (a, q) => (a.answers || {})[q.id] === key[q.id] ? q.points : 0;
  const gr = (a, q) => (a.grades || {})[q.id] ?? (q.type === "essay" ? null : auto(a, q));
  const score = a => qs.reduce((s, q) => s + (gr(a, q) || 0), 0);
  const pending = a => qs.some(q => q.type === "essay" && (a.grades || {})[q.id] == null);
  const secs = a => a.submitted && a.submittedAt ? (ms(a.submittedAt) - ms(a.startedAt)) / 1000 : exam.duration * 60;
  const xs = a => (a.exits || []).filter(x => !(x.p && x.d <= 90)), xt = a => xs(a).reduce((s, x) => s + x.d, 0);
  const lvl = a => !xs(a).length ? "g" : xs(a).length <= 2 && xt(a) < 60 ? "y" : "r";
  const bl = a => (a.blurs || []).filter(x => !(x.p && x.d <= 90)), bt = a => bl(a).reduce((s, x) => s + x.d, 0);
  const pct = s => total ? Math.round(s / total * 100) : 0;
  const ipg = {}; atts.forEach(a => { if (a.ip) (ipg[a.ip] = ipg[a.ip] || []).push(a.studentUid); });
  const same = a => a.ip && ipg[a.ip].length > 1 ? ipg[a.ip].filter(u => u !== a.studentUid).map(u => names[u] || "طالب") : [];
  const run = async fn => { try { await fn(); } catch (e) { toast("حصل خطأ، حاول تاني"); } };
  const upExam = async p => { await updateDoc(doc(db, "exams", exam.id), p); Object.assign(exam, p); };

  const data = () => {
    const f = atts.filter(fin).sort((a, b) => score(b) - score(a) || secs(a) - secs(b)), inprog = atts.filter(a => !fin(a)), seen = new Set(atts.map(a => a.studentUid));
    return {f, inprog, absent: Object.keys(names).filter(u => !seen.has(u)).map(u => names[u])};
  };
  const per = a => { const o = {}; qs.forEach(q => { o[q.id] = gr(a, q) || 0; }); return o; };
  const keyOut = () => { const o = {}; qs.forEach(q => { if (q.type !== "essay" && key[q.id] != null) o[q.id] = key[q.id]; }); return o; };
  const release = async () => {
    const f = atts.filter(fin), b = writeBatch(db);
    f.forEach(a => b.update(doc(db, "attempts", a.id), {result: {score: score(a), total, per: per(a), ...(exam.showKey ? {key: keyOut()} : {})}, released: true}));
    await b.commit(); f.forEach(a => { a.released = true; });
  };
  const csvEsc = v => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const exportCsv = () => {
    const {f, inprog, absent} = data(), nm = a => names[a.studentUid] || "طالب";
    const head = ["الترتيب", "الاسم", "الدرجة", "الدرجة الكلية", "النسبة %", "الوقت (دقيقة)", "مرات الخروج", "ثواني الخروج", "مرات فقدان التركيز", "ثواني فقدان التركيز", "IP", "نفس IP مع", "الحالة"];
    const row = (a, i, st) => [i, nm(a), score(a), total, pct(score(a)), (secs(a) / 60).toFixed(1), xs(a).length, xt(a), bl(a).length, bt(a), a.ip || "", same(a).join(" / "), st];
    const lines = [head, ...f.map((a, i) => row(a, i + 1, pending(a) ? "مقالي لم يُصحح" : "تم")), ...inprog.map(a => row(a, "", "لسه بيحل")), ...absent.map(n => ["", n, "", total, "", "", "", "", "", "", "", "", "لم يدخل"])];
    const blob = new Blob(["\uFEFF" + lines.map(l => l.map(csvEsc).join(",")).join("\r\n")], {type: "text/csv;charset=utf-8"});
    const u = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = u; a.download = ("نتائج-" + exam.title).replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) + ".csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
  };
  function report(){
    const {f, inprog, absent} = data(), sc = f.map(score), n = sc.length, avg = n ? sc.reduce((s, x) => s + x, 0) / n : 0;
    const low = sc.filter(x => total && x / total < .5).length, d = new Date().toLocaleString("ar-EG", {dateStyle: "medium", timeStyle: "short"});
    el.innerHTML = `<div class="card noprint"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><button id="pp" class="btn p full" type="button">طباعة / حفظ PDF</button><p class="muted small">من قايمة الطباعة اختار "حفظ كـ PDF".</p></div>
<div class="card rpt" style="margin-top:14px"><h2 class="h">${esc(exam.title)}</h2><p class="muted small">${esc(d)} · الدرجة الكلية ${total}</p>
<p>دخل: <b>${atts.length}</b> · سلّم: <b>${n}</b> · لسه بيحل: <b>${inprog.length}</b> · لم يدخل: <b>${absent.length}</b></p>
<p>المتوسط: <b>${avg.toFixed(1)}</b> (${pct(avg)}%) · الأعلى: <b>${n ? Math.max(...sc) : 0}</b> · الأقل: <b>${n ? Math.min(...sc) : 0}</b> · أقل من 50%: <b>${low}</b></p>
<table class="tbl"><tr><th>#</th><th>الاسم</th><th>الدرجة</th><th>%</th><th>الوقت</th><th>خروج</th><th>تركيز</th><th>IP</th></tr>${f.map((a, i) => { const lw = total && score(a) / total < .5; return `<tr${lw ? ' class="lowr"' : ""}><td>${i + 1}</td><td>${lw ? "⚠ " : ""}${esc(names[a.studentUid] || "طالب")}${pending(a) ? " (مقالي لم يُصحح)" : ""}</td><td>${score(a)} / ${total}</td><td>${pct(score(a))}%</td><td dir="ltr">${mm(secs(a))}</td><td>${xs(a).length} · ${xt(a)}ث</td><td>${bl(a).length} · ${bt(a)}ث</td><td dir="ltr">${esc(a.ip || "—")}${same(a).length ? " ⚠" : ""}</td></tr>`; }).join("") || '<tr><td colspan="8" class="muted center">لسه ما حدش سلّم.</td></tr>'}</table>
${absent.length ? `<p class="small"><b>لم يدخلوا:</b> ${absent.map(esc).join("، ")}</p>` : ""}</div>`;
    $("#bk", el).onclick = home;
    $("#pp", el).onclick = () => window.print();
  }

  function home(){
    const f = atts.filter(fin).sort((a, b) => score(b) - score(a) || secs(a) - secs(b));
    const pend = f.filter(pending).length, rel = f.length && f.every(a => a.released), rv = f.reduce((s, a) => s + Object.keys(a.reviews || {}).length, 0), ro = exam.reviewUntil > Date.now();
    const wr = qs.map((q, i) => q.type === "essay" ? null : {i, n: f.filter(a => auto(a, q) === 0).length}).filter(Boolean).sort((a, b) => b.n - a.n)[0];
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(exam.title)}</h2>
<p>دخل: <b>${atts.length}</b> · سلّم: <b>${f.length}</b> · لسه ما خلصش: <b>${atts.length - f.length}</b></p>
${wr && f.length ? `<p class="muted">أكتر سؤال اتغلط فيه: سؤال ${wr.i + 1} (${wr.n} طالب)</p>` : ""}
${pend ? `<p class="err">فيه ${pend} ورقة مقالي لسه ما اتصححتش.</p>` : ""}${rv ? `<p class="muted">طلبات المراجعة: ${rv}</p>` : ""}
${atts.length && atts.every(a => !a.ip) ? '<p class="err small">الـ IP مش بيتسجّل. افتح موقعك/api/ip وتأكد إنه بيرجّع رقم، وإن ملف api/ip.js مرفوع.</p>' : ""}
<button id="rl" class="btn p full" type="button" ${pend || !f.length ? "disabled" : ""}>${rel ? "تحديث النتيجة عند الطلاب" : "إظهار النتيجة للطلاب"}</button>
<button id="rq" class="btn s full" type="button">${ro ? "إيقاف طلبات المراجعة" : "تفعيل طلبات المراجعة"}</button>
<button id="sk" class="btn s full" type="button">${exam.showKey ? "إخفاء الإجابات الصحيحة عن الطلاب" : "إظهار الإجابات الصحيحة للطلاب"}</button><p class="muted small">الإجابات الصحيحة بعد إظهار النتيجة: ${exam.showKey ? "ظاهرة" : "مخفية"} للطلاب.</p>
<div class="acts"><button id="xl" class="btn s" type="button" style="flex:1">تصدير Excel</button><button id="pr" class="btn s" type="button" style="flex:1">طباعة / PDF</button></div></div>
<div class="card" style="margin-top:14px;overflow-x:auto"><table class="tbl"><tr><th>#</th><th>الاسم</th><th>الدرجة</th><th>الوقت</th><th>خروج</th><th>تركيز</th><th>IP</th><th></th></tr>${f.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(names[a.studentUid] || "طالب")}</td><td>${score(a)} / ${total}</td><td dir="ltr">${mm(secs(a))}</td><td><span class="dot ${lvl(a)}"></span> ${xs(a).length} · ${xt(a)}ث</td><td>${bl(a).length} · ${bt(a)}ث</td><td dir="ltr">${esc(a.ip || "غير مسجّل")}${same(a).length ? ` <span class="dot y"></span> مع ${same(a).length}` : ""}</td><td><button class="btn s sm" type="button" data-p="${a.id}">${pending(a) ? "صحّح" : "فتح"}</button></td></tr>`).join("") || '<tr><td colspan="8" class="muted center">لسه ما حدش سلّم.</td></tr>'}</table></div>
<div class="card" style="margin-top:14px"><h2 class="h">التحليل (روابط PDF أو فيديو)</h2>${(exam.materials || []).map((m, i) => `<div class="item lrow"><div class="lt"><b>${esc(m.title)}</b></div><button class="ab" type="button" data-md="${i}" aria-label="مسح">${ic("trash", 18)}</button></div>`).join("")}<button id="ma" class="btn s full" type="button">+ إضافة رابط</button><p class="muted small">بيظهر للطالب بعد إظهار النتيجة.</p></div>`;
    $("#bk", el).onclick = back;
    $("#rl", el).onclick = () => run(async () => { await release(); toast("النتيجة ظهرت للطلاب"); home(); });
    $("#sk", el).onclick = () => run(async () => { await upExam({showKey: !exam.showKey}); if (rel) await release(); toast(exam.showKey ? "الإجابات الصحيحة هتظهر للطلاب" : "الإجابات الصحيحة مخفية"); home(); });
    $("#xl", el).onclick = () => run(async () => { exportCsv(); });
    $("#pr", el).onclick = report;
    $("#rq", el).onclick = () => run(async () => {
      if (ro) await upExam({reviewUntil: 0});
      else { const h = +prompt("طلبات المراجعة تفضل متاحة لمدة كام ساعة؟", "24"); if (!(h > 0)) return; await upExam({reviewUntil: Date.now() + h * 3600000}); }
      home();
    });
    $("#ma", el).onclick = () => run(async () => {
      const t = prompt("عنوان الرابط (مثال: حل الامتحان)"); if (!t) return;
      const u = prompt("الصق الرابط (يبدأ بـ https)"); if (!u || !/^https?:\/\//.test(u.trim())) return toast("الرابط لازم يبدأ بـ https");
      await upExam({materials: [...(exam.materials || []), {title: t.trim(), url: u.trim()}]}); home();
    });
    el.querySelectorAll("[data-md]").forEach(b => b.onclick = () => run(async () => { const m = [...exam.materials]; m.splice(+b.dataset.md, 1); await upExam({materials: m}); home(); }));
    el.querySelectorAll("[data-p]").forEach(b => b.onclick = () => paper(atts.find(a => a.id === b.dataset.p)));
  }

  function paper(a){
    const show = q => { const v = (a.answers || {})[q.id]; return v == null || v === "" ? "—" : q.type === "mcq" ? esc(q.options[v]) : q.type === "tf" ? (v ? "صح" : "خطأ") : esc(v); };
    const rvw = q => (a.reviews || {})[q.id];
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(names[a.studentUid] || "طالب")} · ${score(a)} / ${total}</h2>${(a.exits || []).length ? `<p class="muted small">خروج من الصفحة: ${(a.exits || []).map(x => `${ft(x.t)} (${x.d}ث${x.p ? " · رفع صورة" : ""})`).join("، ")}</p>` : ""}${(a.blurs || []).length ? `<p class="muted small">فقدان التركيز: ${(a.blurs || []).map(x => `${ft(x.t)} (${x.d}ث${x.p ? " · رفع صورة" : ""})`).join("، ")}</p>` : ""}<p class="muted small" dir="ltr">IP: ${esc(a.ip || "غير مسجّل")}</p>${same(a).length ? `<p class="err small">نفس الـ IP مع: ${same(a).map(esc).join("، ")}</p>` : ""}</div>${qs.map((q, i) => `<div class="card" style="margin-top:14px"><b>سؤال ${i + 1}</b> <small class="muted">(${q.points} درجة)</small><p class="qt">${esc(q.text)}</p>${urlImgs(q.imgs, 120)}<p><b>إجابة الطالب:</b> <span style="white-space:pre-wrap">${show(q)}</span></p>${q.type === "essay" ? urlImgs((a.answers || {})[q.id + "_i"]) : ""}${q.type !== "essay" ? `<p class="${auto(a, q) ? "muted" : "err"}">${auto(a, q) ? "صح ✓" : "غلط"} · الإجابة الصح: ${q.type === "mcq" ? esc(q.options[key[q.id]]) : key[q.id] ? "صح" : "خطأ"}</p>` : ""}${rvw(q) ? `<p class="err">طلب مراجعة: ${esc(rvw(q).text)}</p>` : ""}${q.type === "essay" || rvw(q) ? `<label class="lb">${q.type === "essay" ? "الدرجة" : "تعديل الدرجة"}</label><input class="plain" type="number" min="0" max="${q.points}" step="0.5" data-q="${q.id}" data-m="${q.points}" value="${(a.grades || {})[q.id] ?? ""}">` : ""}</div>`).join("")}<div class="card" style="margin-top:14px"><button id="sv" class="btn p full" type="button">حفظ الدرجات</button><p id="msg" class="err"></p></div>`;
    $("#bk", el).onclick = home;
    $("#sv", el).onclick = () => run(async () => {
      const g = {...(a.grades || {})};
      for (const i of el.querySelectorAll("[data-q]")) {
        if (i.value === "") continue;
        const v = +i.value;
        if (!(v >= 0 && v <= +i.dataset.m)) return $("#msg", el).textContent = "الدرجة لازم تكون من 0 لـ " + i.dataset.m;
        g[i.dataset.q] = v;
      }
      await updateDoc(doc(db, "attempts", a.id), {grades: g}); a.grades = g; toast("تم الحفظ (اضغط تحديث النتيجة لو كانت ظاهرة)"); home();
    });
  }
  home();
}
