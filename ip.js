module.exports = (req, res) => {
  const xf = String(req.headers["x-forwarded-for"] || "");
  const ip = (xf.split(",")[0] || String(req.headers["x-real-ip"] || "")).trim();
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ip});
};
