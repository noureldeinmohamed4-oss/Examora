import {auth, db} from "./firebase.js";
import {reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail, EmailAuthProvider} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, writeBatch} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const SUBJECTS = ["اللغة العربية","اللغة الإنجليزية","اللغة الفرنسية","الرياضيات","الفيزياء","الكيمياء","الأحياء","العلوم","التاريخ","الجغرافيا","الفلسفة والمنطق","علم النفس والاجتماع","الحاسب الآلي","مادة أخرى"];
export const digits = s => String(s || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\D/g, "");
export const phoneOk = p => /^01[0125]\d{8}$/.test(p);
export const nameOk = n => String(n || "").trim().split(/\s+/).filter(w => w.length > 1).length >= 3;
const ee = m => { const e = new Error(m); e.ui = true; return e; };

/* ---------- تغيير كلمة السر (لأي مستخدم) ---------- */
const PWERR = {"auth/invalid-credential": "كلمة السر الحالية غلط", "auth/wrong-password": "كلمة السر الحالية غلط", "auth/too-many-requests": "محاولات كتير، استنى شوية", "auth/weak-password": "كلمة السر الجديدة ضعيفة", "auth/network-request-failed": "مفيش إنترنت", "auth/requires-recent-login": "اخرج وادخل تاني وبعدين حاول", "auth/email-already-in-use": "الإيميل ده مستخدم عند حساب تاني", "auth/invalid-email": "الإيميل غير صحيح"};
export function pwCheck(cur, nw, nw2){
  if (!cur) return "اكتب كلمة السر الحالية";
  if (nw.length < 8) return "كلمة السر الجديدة 8 حروف على الأقل";
  if (nw !== nw2) return "تأكيد كلمة السر غير مطابق";
  if (nw === cur) return "كلمة السر الجديدة لازم تكون مختلفة عن الحالية";
  return "";
}
export const pwErr = e => PWERR[e && e.code] || "حصل خطأ، حاول تاني";
export const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const cred = (u, cur) => EmailAuthProvider.credential(u.email, cur);
export async function changePassword(cur, nw){
  const u = auth.currentUser;
  await reauthenticateWithCredential(u, cred(u, cur));
  await updatePassword(u, nw);
}
/* بيبعت رابط تحقق للإيميل الجديد، والإيميل بيتغيّر بعد ما صاحبه يفتح الرابط */
export async function requestEmailChange(cur, email){
  const u = auth.currentUser;
  await reauthenticateWithCredential(u, cred(u, cur));
  await verifyBeforeUpdateEmail(u, email);
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
