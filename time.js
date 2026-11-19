let off = 0, synced = false;
export const now = () => Date.now() + off;
export const tms = t => t && t.toMillis ? t.toMillis() : 0;
export const fdt = t => t ? new Date(t).toLocaleString("ar-EG", {day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit"}) : "—";

/* يزامن ساعة الشاشة مع ساعة السيرفر (api/ip بيرجّع الوقت). بيرجّع الـ IP كمان. القواعد هي اللي بتفرض الوقت فعليًا. */
export async function syncClock(){
  try {
    const t0 = Date.now();
    const j = await Promise.race([fetch("/api/ip", {cache: "no-store"}).then(r => r.json()), new Promise((_, no) => setTimeout(no, 3000))]);
    const t1 = Date.now();
    if (j && +j.t > 0) { off = +j.t - (t0 + t1) / 2; synced = true; }
    return String((j && j.ip) || "").slice(0, 64);
  } catch (e) { return ""; }
}
/* لو الـ API مش شغّال: نضبط الفرق من وقت بداية المحاولة (وقت السيرفر) */
export const calibrate = serverMs => { if (!synced && serverMs > 0) off = serverMs - Date.now(); };

/* آخر وقت مسموح للطالب في المحاولة دي */
export const deadline = (a, e) => { const s = tms(a.startedAt); return s ? Math.min(s + e.duration * 60000, e.end) : e.end; };
/* الطالب اللي وقته خلص ومسلّمش بيتحسب خلّص */
export const expired = (a, e, t = now()) => !!a && !a.submitted && t > deadline(a, e) + 20000;
export const finished = (a, e, t = now()) => !!a && (!!a.submitted || expired(a, e, t));
export const endAt = (a, e) => a.submitted && tms(a.submittedAt) ? tms(a.submittedAt) : deadline(a, e);
