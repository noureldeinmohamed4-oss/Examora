const root = document.documentElement;
export const MODES = ["auto", "light", "dark"];
export const getMode = () => { try { const m = localStorage.getItem("themeMode") || localStorage.getItem("theme"); return MODES.includes(m) ? m : "auto"; } catch (e) { return "auto"; } };
/* من 6 الصبح لـ 6 المغرب فاتح، وبعدها داكن (على ساعة الجهاز) */
export const dayTheme = (d = new Date()) => { const h = d.getHours(); return h >= 6 && h < 18 ? "light" : "dark"; };
export const applyTheme = () => { const m = getMode(); root.dataset.theme = m === "auto" ? dayTheme() : m; };
export const setMode = m => { try { localStorage.setItem("themeMode", m); } catch (e) {} applyTheme(); };
export const initTheme = () => { applyTheme(); setInterval(applyTheme, 60000); document.addEventListener("visibilitychange", () => { if (!document.hidden) applyTheme(); }); };
export const segHtml = () => `<div class="seg">${[["auto", "تلقائي"], ["light", "فاتح"], ["dark", "داكن"]].map(([k, t]) => `<button type="button" data-m="${k}" class="${getMode() === k ? "on" : ""}">${t}</button>`).join("")}</div>`;
export const bindSeg = scope => scope.querySelectorAll(".seg [data-m]").forEach(b => b.onclick = () => { setMode(b.dataset.m); document.querySelectorAll(".seg [data-m]").forEach(x => x.classList.toggle("on", x.dataset.m === b.dataset.m)); });
