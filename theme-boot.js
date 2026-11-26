(function () {
  try {
    var m = localStorage.getItem("themeMode") || localStorage.getItem("theme") || "auto";
    if (m !== "light" && m !== "dark") { var h = new Date().getHours(); m = h >= 6 && h < 18 ? "light" : "dark"; }
    document.documentElement.setAttribute("data-theme", m);
  } catch (e) {}
})();
