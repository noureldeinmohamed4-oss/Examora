import {db} from "./firebase.js";
import {collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {$, esc, toast, ic} from "./ui.js";
import {pickUpload, upMsg, filesHtml, filesFull} from "./media.js";

const MAXF = 6;
const okImg = s => /^data:image\//.test(s || "");
const legacy = (imgs, rm) => (imgs || []).map((s, i) => okImg(s) ? `<span class="th"><img class="im" src="${esc(s)}" alt="صورة ${i + 1}" style="width:96px;margin:4px">${rm ? `<button class="ab" type="button" data-rm="${i}" aria-label="مسح">${ic("trash", 16)}</button>` : ""}</span>` : "").join("");
const legacyFull = imgs => (imgs || []).map((s, i) => okImg(s) ? `<img class="im" src="${esc(s)}" alt="صورة ${i + 1}">` : "").join("");
const url = u => /^https?:\/\//.test(u || "") ? esc(u) : "";

export async function hwBuilder(el, uid, lec, part, back, openId){
  el.innerHTML = '<p class="muted center">جاري التحميل…</p>';
  let hw = {title: part.title, text: "", imgs: [], files: [], modelUrl: "", max: 10}, subs = [], names = {}, subsErr = false;
  try { const s = await getDoc(doc(db, "homeworks", part.id)); if (s.exists()) hw = {...hw, ...s.data()}; } catch (e) {}
  hw.imgs = hw.imgs || []; hw.files = hw.files || [];
  try {
    (await getDocs(query(collection(db, "links"), where("teacherUid", "==", uid)))).docs.forEach(x => { names[x.data().studentUid] = x.data().studentName; });
    subs = (await getDocs(query(collection(db, "subs"), where("teacherUid", "==", uid), where("partId", "==", part.id)))).docs.map(x => ({id: x.id, ...x.data()}));
    subs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  } catch (e) { subsErr = true; }
  const count = () => hw.imgs.length + hw.files.length;
  const meta = () => { hw.title = $("#ht", el).value.trim(); hw.text = $("#hx", el).value; hw.modelUrl = $("#hm", el).value.trim(); hw.max = +$("#hk", el).value || 10; };
  const draw = () => {
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">إعداد الواجب</h2>
<label class="lb">العنوان</label><input id="ht" class="plain" value="${esc(hw.title)}">
<label class="lb">نص الواجب (اختياري)</label><textarea id="hx" class="plain" rows="3">${esc(hw.text)}</textarea>
<label class="lb">ملفات الواجب (صور أو PDF، حتى ${MAXF})</label><div>${legacy(hw.imgs, true)}${filesHtml(hw.files, true)}</div><button id="ph" class="btn s sm" type="button" style="margin-top:8px">+ صورة أو PDF من المعرض أو الكاميرا</button>
<label class="lb">الدرجة الكاملة</label><input id="hk" class="plain" type="number" min="1" value="${hw.max}">
<label class="lb">نموذج الإجابة (اختياري، بيظهر للطالب بعد ما يسلّم)</label><input id="hm" class="plain" placeholder="https://" value="${esc(hw.modelUrl)}"><button id="mu" class="btn s sm" type="button" style="margin-top:8px">أو ارفع ملف النموذج</button>
<button id="sv" class="btn p full" type="button">حفظ الواجب</button><p id="msg" class="err" role="alert"></p></div>
<div class="card" style="margin-top:14px"><h2 class="h">التسليمات (${subs.length})</h2>${subsErr ? '<p class="err">تعذّر تحميل التسليمات. تأكد من الإنترنت وقواعد Firestore.</p>' : subs.length ? subs.map(s => `<div class="item lrow"><div class="lt"><b>${esc(names[s.studentUid] || "طالب")}</b><small>${s.graded ? "اتصحح: " + s.grade : "لسه ما اتصححش"}</small></div><button class="btn s sm" type="button" data-s="${s.id}">فتح</button></div>`).join("") : '<p class="muted center">لسه ما حدش سلّم.</p>'}</div>`;
    $("#bk", el).onclick = back;
    el.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { meta(); hw.imgs.splice(+b.dataset.rm, 1); draw(); });
    el.querySelectorAll("[data-rmf]").forEach(b => b.onclick = () => { meta(); hw.files.splice(+b.dataset.rmf, 1); draw(); });
    $("#ph", el).onclick = async () => {
      meta();
      try { const r = await pickUpload({kinds: ["image", "pdf"], max: MAXF - count(), edit: true}); hw.files = [...hw.files, ...r]; }
      catch (e) { toast(upMsg(e)); }
      draw();
    };
    $("#mu", el).onclick = async () => {
      meta();
      try { const r = await pickUpload({kinds: ["image", "pdf"], max: 1, edit: true}); if (r.length) hw.modelUrl = r[0].u; }
      catch (e) { toast(upMsg(e)); }
      draw();
    };
    $("#sv", el).onclick = async () => {
      meta(); const m = $("#msg", el);
      if (!hw.title) return m.textContent = "اكتب عنوان الواجب";
      if (hw.modelUrl && !/^https?:\/\//.test(hw.modelUrl)) return m.textContent = "الرابط لازم يبدأ بـ https";
      try { await setDoc(doc(db, "homeworks", part.id), {teacherUid: uid, lectureId: lec.id, partId: part.id, title: hw.title, text: hw.text, imgs: hw.imgs, files: hw.files, modelUrl: hw.modelUrl, max: hw.max, updatedAt: serverTimestamp()}); toast("تم الحفظ"); m.textContent = ""; }
      catch (e) { m.textContent = "حصل خطأ، حاول تاني"; }
    };
    el.querySelectorAll("[data-s]").forEach(b => b.onclick = () => view(subs.find(x => x.id === b.dataset.s)));
  };
  let direct = false;
  const leaveView = () => (direct ? back() : draw());
  const view = s => {
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(names[s.studentUid] || "طالب")}</h2>${legacyFull(s.imgs)}${filesFull(s.files)}<label class="lb">الدرجة (من ${hw.max})</label><input id="g" class="plain" type="number" min="0" max="${hw.max}" step="0.5" value="${s.grade ?? ""}"><label class="lb">ملاحظة (اختياري)</label><textarea id="n" class="plain" rows="2">${esc(s.note || "")}</textarea><button id="sg" class="btn p full" type="button">حفظ الدرجة</button><p id="msg" class="err"></p></div>`;
    $("#bk", el).onclick = leaveView;
    $("#sg", el).onclick = async () => {
      const g = +$("#g", el).value; if ($("#g", el).value === "" || !(g >= 0 && g <= hw.max)) return $("#msg", el).textContent = "الدرجة لازم تكون من 0 لـ " + hw.max;
      try { const p = {grade: g, note: $("#n", el).value.trim(), graded: true}; await updateDoc(doc(db, "subs", s.id), p); Object.assign(s, p); toast("تم الحفظ"); leaveView(); } catch (e) { $("#msg", el).textContent = "حصل خطأ، حاول تاني"; }
    };
  };
  const first = openId && subs.find(x => x.id === openId);
  if (first) { direct = true; view(first); } else draw();
}

export function hwStudent(el, uid, teacherUid, hw, sub, back){
  let imgs = sub ? [...(sub.imgs || [])] : [], files = sub ? [...(sub.files || [])] : [];
  const locked = sub && (sub.graded || hw.modelUrl);
  const count = () => imgs.length + files.length;
  const draw = () => {
    el.innerHTML = `<div class="card"><button id="bk" class="lnk" type="button">${ic("back", 18)} رجوع</button><h2 class="h" style="margin-top:10px">${esc(hw.title)}</h2>${hw.text ? `<p class="qt">${esc(hw.text)}</p>` : ""}${legacyFull(hw.imgs)}${filesFull(hw.files)}</div>
<div class="card" style="margin-top:14px"><h2 class="h">إجابتك</h2>${sub && sub.graded ? `<p><b>درجتك: ${sub.grade} من ${hw.max}</b></p>${sub.note ? `<p class="muted">${esc(sub.note)}</p>` : ""}` : ""}<div>${legacy(imgs, !locked)}${filesHtml(files, !locked)}</div>${locked ? "" : `<button id="ph" class="btn s sm" type="button" style="margin-top:8px">+ صوّر أو ارفع إجابتك (صور أو PDF، حتى ${MAXF})</button><button id="sb" class="btn p full" type="button">${sub ? "حفظ التعديل" : "تسليم"}</button>`}<p id="msg" class="err" role="alert"></p>${sub && url(hw.modelUrl) ? `<a class="btn s full" style="display:block;text-align:center;text-decoration:none" href="${url(hw.modelUrl)}" target="_blank" rel="noopener">نموذج الإجابة</a>` : ""}</div>`;
    $("#bk", el).onclick = back;
    el.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { imgs.splice(+b.dataset.rm, 1); draw(); });
    el.querySelectorAll("[data-rmf]").forEach(b => b.onclick = () => { files.splice(+b.dataset.rmf, 1); draw(); });
    const ph = $("#ph", el);
    if (ph) ph.onclick = async () => {
      try { const r = await pickUpload({kinds: ["image", "pdf"], max: MAXF - count(), edit: true}); files = [...files, ...r]; }
      catch (e) { toast(upMsg(e)); }
      draw();
    };
    const sb = $("#sb", el);
    if (sb) sb.onclick = async () => {
      const m = $("#msg", el);
      if (!count()) return m.textContent = "صوّر إجابتك الأول";
      sb.disabled = true;
      try {
        const id = hw.id + "_" + uid;
        if (sub) await updateDoc(doc(db, "subs", id), {imgs, files});
        else await setDoc(doc(db, "subs", id), {partId: hw.id, teacherUid, studentUid: uid, imgs, files, graded: false, createdAt: serverTimestamp()});
        toast("تم التسليم"); back();
      } catch (e) { m.textContent = "حصل خطأ، حاول تاني"; sb.disabled = false; }
    };
  };
  draw();
}
