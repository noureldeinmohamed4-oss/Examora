import {auth, db} from "./firebase.js";
import {reauthenticateWithCredential, updatePassword, EmailAuthProvider} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, writeBatch} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {state, toast, ic} from "./ui.js";

export const SUBJECTS = ["اللغة العربية","اللغة الإنجليزية","اللغة الفرنسية","الرياضيات","الفيزياء","الكيمياء","الأحياء","العلوم","التاريخ","الجغرافيا","الفلسفة والمنطق","علم النفس والاجتماع","الحاسب الآلي","مادة أخرى"];
export const digits = s => String(s || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\D/g, "");
export const phoneOk = p => /^01[0125]\d{8}$/.test(p);
export const nameOk = n => String(n || "").trim().split(/\s+/).filter(w => w.length > 1).length >= 3;
const ee = m => { const e = new Error(m); e.ui = true; return e; };

/* ---------- تغيير كلمة السر (لأي مستخدم) ---------- */
const PWERR = {"auth/invalid-credential": "كلمة السر الحالية غلط", "auth/wrong-password": "كلمة السر الحالية غلط", "auth/too-many-requests": "محاولات كتير، استنى شوية", "auth/weak-password": "كلمة السر الجديدة ضعيفة", "auth/network-request-failed": "مفيش إنترنت", "auth/requires-recent-login": "اخرج وادخل تاني وبعدين حاول"};
export function pwCheck(cur, nw, nw2){
  if (!cur) return "اكتب كلمة السر الحالية";
  if (nw.length < 8) return "كلمة السر الجديدة 8 حروف على الأقل";
  if (nw !== nw2) return "تأكيد كلمة السر غير مطابق";
  if (nw === cur) return "كلمة السر الجديدة لازم تكون مختلفة عن الحالية";
  return "";
}
export function openPassword(){
  if (document.getElementById("pwm")) return;
  const u = auth.currentUser;
  if (!u || !u.email) return toast("سجّل دخول الأول");
  const ov = document.createElement("div");
  ov.id = "pwm"; ov.className = "pwm"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
  const f = (id, ph, ac) => `<div class="fld"><span class="ic">${ic("lock")}</span><input id="${id}" type="password" placeholder="${ph}" aria-label="${ph}" autocomplete="${ac}"><button class="eye" type="button" aria-label="إظهار كلمة السر">${ic("eye")}</button></div>`;
  ov.innerHTML = `<div class="card"><h2 class="h">تغيير كلمة السر</h2>${f("pw0", "كلمة السر الحالية", "current-password")}${f("pw1", "كلمة السر الجديدة", "new-password")}${f("pw2", "تأكيد كلمة السر الجديدة", "new-password")}<p id="pwe" class="err" role="alert"></p><button id="pws" class="btn p full" type="button">حفظ</button><button id="pwx" class="btn s full" type="button">إلغاء</button></div>`;
  document.body.appendChild(ov);
  const q = s => ov.querySelector(s), msg = q("#pwe");
  const key = e => { if (e.key === "Escape") close(); };
  const close = () => { document.removeEventListener("keydown", key); ov.remove(); };
  document.addEventListener("keydown", key);
  ov.querySelectorAll(".eye").forEach(b => b.onclick = () => { const i = b.parentNode.querySelector("input"), s = i.type === "password"; i.type = s ? "text" : "password"; b.innerHTML = ic(s ? "eyeoff" : "eye"); });
  q("#pwx").onclick = close;
  ov.onclick = e => { if (e.target === ov) close(); };
  q("#pws").onclick = async () => {
    const cur = q("#pw0").value, nw = q("#pw1").value, nw2 = q("#pw2").value;
    msg.textContent = "";
    const bad = pwCheck(cur, nw, nw2);
    if (bad) { msg.textContent = bad; return; }
    const b = q("#pws"); b.disabled = true; state.busy = true;
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cur));
      await updatePassword(u, nw);
      state.busy = false; close(); toast("تم تغيير كلمة السر");
    } catch (e) { msg.textContent = PWERR[e && e.code] || "حصل خطأ، حاول تاني"; b.disabled = false; }
    state.busy = false;
  };
  const f0 = q("#pw0"); if (f0 && f0.focus) f0.focus();
}

/* ---------- تعديل الأدمن لبيانات حساب ---------- */
export function checkAcc(r, v){
  const st = r.role === "student";
  if (!nameOk(v.name)) return "اكتب الاسم ثلاثي (الأول والثاني والثالث)";
  if (!phoneOk(v.phone)) return "الرقم غير صحيح (11 رقم يبدأ بـ 01)";
  if (st) {
    if (!phoneOk(v.parent)) return "رقم ولي الأمر غير صحيح";
    if (v.parent === v.phone) return "رقم ولي الأمر لازم يكون غير رقم الطالب";
  } else if (!v.subject) return "اختار المادة";
  return "";
}
export async function saveAcc(r, v){
  const st = r.role === "student";
  const phoneChanged = v.phone !== (r.phone || ""), nameChanged = v.name !== r.name, subChanged = !st && v.subject !== r.subject;
  if (phoneChanged) {
    const s = await getDoc(doc(db, "phones", v.phone));
    if (s.exists() && s.data().uid !== r.id) throw ee("الرقم ده مسجّل عند حساب تاني");
    await setDoc(doc(db, "phones", v.phone), {uid: r.id, email: r.email});
  }
  await updateDoc(doc(db, "private", r.id), st ? {phone: v.phone, parentPhone: v.parent} : {phone: v.phone});
  await updateDoc(doc(db, "users", r.id), st ? {name: v.name} : {name: v.name, subject: v.subject});
  if (phoneChanged && r.phone) {
    const o = await getDoc(doc(db, "phones", r.phone));
    if (o.exists() && o.data().uid === r.id) await deleteDoc(doc(db, "phones", r.phone));
  }
  if (nameChanged || subChanged) {
    const patch = st ? {studentName: v.name} : {...(nameChanged ? {teacherName: v.name} : {}), ...(subChanged ? {subject: v.subject} : {})};
    if (!st || nameChanged) {
      const L = (await getDocs(query(collection(db, "links"), where(st ? "studentUid" : "teacherUid", "==", r.id)))).docs;
      for (let i = 0; i < L.length; i += 400) { const b = writeBatch(db); L.slice(i, i + 400).forEach(z => b.update(z.ref, patch)); await b.commit(); }
    }
    if (!st) {
      const G = (await getDocs(query(collection(db, "groups"), where("teacherUid", "==", r.id)))).docs;
      for (const g of G) { const c = g.data().code; if (typeof c === "string" && c) { try { await updateDoc(doc(db, "codes", c), {name: v.name, subject: v.subject}); } catch (e) {} } }
    }
  }
}
