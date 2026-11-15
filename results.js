import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, getDoc, updateDoc, writeBatch} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";

const ms = t => t && t.toMillis ? t.toMillis() : 0;
const mm = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

export async function examResults(el, uid, exam, back){
  el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
  let key = {}, names = {}, atts = [];
  try {
    key = (await getDoc(doc(db, "exams", exam.id, "key", "main"))).data().answers;
    (await getDocs(query(collection(db, "links"), where("teacherUid", "==", uid)))).docs.forEach(x => { names[x.data().studentUid] = x.data().studentName; });
    atts = (await getDocs(query(collection(db, "attempts"), where("teacherUid", "==", uid), where("examId", "==", exam.id)))).docs.map(x => ({id: x.id, ...x.data()}));
  } catch (e) { el.innerHTML = '<p class="err center">تعذّر تحميل النتائج. تأكد من الإنترنت وقواعد Firestore.</p>'; return; }
  const qs = exam.questions, total = qs.reduce((s, q) => s + q.points, 0), ended = Date.now() > exam.end + 20000;
  const fin = a => a.submitted || ended;
  const auto = (a, q) => (a.answers || {})[q.id] === key[q.id] ? q.points : 0;
  const gr = (a, q) => q.type === "essay" ? ((a.grades || {})[q.id] ?? null) : auto(a, q);
  const score = a => qs.reduce((s, q) => s + (gr(a, q) || 0), 0);
  const pending = a => qs.some(q => q.type === "essay" && (a.grades || {})[q.id] == null);
  const secs = a => a.submitted && a.submittedAt ? (ms(a.submittedAt) - ms(a.startedAt)) / 1000 : exam.duration * 60;
  const run = async fn => { try { await fn(); } catch (e) { toast("حصل خطأ، حاول تاني"); } };

  function home(){
    const f = atts.filter(fin).sort((a, b) => score(b) - score(a) || secs(a) - secs(b));
    const pend = f.filter(pending).length, rel = f.length && f.every(a => a.released);
    const wr = qs.map((q, i) => q.type === "essay" ? null : {i, n: f.filter(a => auto(a, q) === 0).length}).filter(Boolean).sort((a, b) => b.n - a.n)[0];
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(exam.title)}</h2>
<p>دخل: <b>${atts.length}</b> · سلّم: <b>${f.length}</b> · لسه ما خلصش: <b>${atts.length - f.length}</b></p>
${wr && f.length ? `<p class="muted">أكتر سؤال اتغلط فيه: سؤال ${wr.i + 1} (${wr.n} طالب)</p>` : ""}
${pend ? `<p class="err">فيه ${pend} ورقة مقالي لسه ما اتصححتش.</p>` : ""}
<button id="rl" class="btn p full" type="button" ${pend || !f.length ? "disabled" : ""}>${rel ? "تحديث النتيجة عند الطلاب" : "إظهار النتيجة للطلاب"}</button></div>
<div class="card" style="margin-top:14px;overflow-x:auto"><table class="tbl"><tr><th>#</th><th>الاسم</th><th>الدرجة</th><th>الوقت</th><th></th></tr>${f.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(names[a.studentUid] || "طالب")}</td><td>${score(a)} / ${total}</td><td dir="ltr">${mm(secs(a))}</td><td><button class="btn s sm" type="button" data-p="${a.id}">${pending(a) ? "صحّح" : "فتح"}</button></td></tr>`).join("") || '<tr><td colspan="5" class="muted center">لسه ما حدش سلّم.</td></tr>'}</table></div>`;
    $("#bk", el).onclick = back;
    $("#rl", el).onclick = () => run(async () => {
      const b = writeBatch(db);
      f.forEach(a => b.update(doc(db, "attempts", a.id), {result: {score: score(a), total}, released: true}));
      await b.commit(); f.forEach(a => { a.released = true; }); toast("النتيجة ظهرت للطلاب"); home();
    });
    el.querySelectorAll("[data-p]").forEach(b => b.onclick = () => paper(atts.find(a => a.id === b.dataset.p)));
  }

  function paper(a){
    const show = q => { const v = (a.answers || {})[q.id]; return v == null || v === "" ? "—" : q.type === "mcq" ? esc(q.options[v]) : q.type === "tf" ? (v ? "صح" : "خطأ") : esc(v); };
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(names[a.studentUid] || "طالب")} · ${score(a)} / ${total}</h2></div>${qs.map((q, i) => `<div class="card" style="margin-top:14px"><b>سؤال ${i + 1}</b> <small class="muted">(${q.points} درجة)</small><p class="qt">${esc(q.text)}</p><p><b>إجابة الطالب:</b> <span style="white-space:pre-wrap">${show(q)}</span></p>${q.type === "essay" ? `<label class="lb">الدرجة</label><input class="plain" type="number" min="0" max="${q.points}" step="0.5" data-q="${q.id}" data-m="${q.points}" value="${(a.grades || {})[q.id] ?? ""}">` : `<p class="${auto(a, q) ? "muted" : "err"}">${auto(a, q) ? "صح ✓" : "غلط"} · الإجابة الصح: ${q.type === "mcq" ? esc(q.options[key[q.id]]) : key[q.id] ? "صح" : "خطأ"}</p>`}</div>`).join("")}<div class="card" style="margin-top:14px"><button id="sv" class="btn p full" type="button">حفظ الدرجات</button><p id="msg" class="err"></p></div>`;
    $("#bk", el).onclick = home;
    $("#sv", el).onclick = () => run(async () => {
      const g = {...(a.grades || {})};
      for (const i of el.querySelectorAll("[data-q]")) {
        if (i.value === "") continue;
        const v = +i.value;
        if (!(v >= 0 && v <= +i.dataset.m)) return $("#msg", el).textContent = "الدرجة لازم تكون من 0 لـ " + i.dataset.m;
        g[i.dataset.q] = v;
      }
      await updateDoc(doc(db, "attempts", a.id), {grades: g}); a.grades = g; toast("تم الحفظ"); home();
    });
  }
  home();
}
