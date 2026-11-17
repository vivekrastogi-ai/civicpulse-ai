export async function makeRiskCard(o: {
  place: string;
  date: string;
  riskPct: string;
  level: string;
  score?: number | null;
}): Promise<Blob> {
  const W = 1080, H = 1080;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;

  const col = o.level === "High" ? "#ef4444" : o.level === "Medium" ? "#f59e0b" : "#22c55e";

  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#020617"); bg.addColorStop(1, "#1e1b4b");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);

  const glow = g.createRadialGradient(W / 2, 520, 20, W / 2, 520, 460);
  glow.addColorStop(0, col + "55"); glow.addColorStop(1, "transparent");
  g.fillStyle = glow; g.fillRect(0, 0, W, H);

  g.fillStyle = "#e2e8f0"; g.font = "bold 54px Arial";
  g.fillText("CivicPulse AI", 70, 110);
  g.fillStyle = "#94a3b8"; g.font = "30px Arial";
  g.fillText("Delhi waterlogging risk", 70, 160);

  // gauge
  const cx = W / 2, cy = 640, r = 300;
  g.lineWidth = 48; g.lineCap = "round";
  g.strokeStyle = "#1e293b";
  g.beginPath(); g.arc(cx, cy, r, Math.PI, 2 * Math.PI); g.stroke();
  const frac = o.level === "High" ? 0.95 : o.level === "Medium" ? 0.6 : 0.2;
  g.strokeStyle = col;
  g.beginPath(); g.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * frac); g.stroke();

  g.textAlign = "center";
  g.fillStyle = "#ffffff"; g.font = "bold 150px Arial";
  g.fillText(o.riskPct, cx, cy - 20);
  g.fillStyle = col; g.font = "bold 56px Arial";
  g.fillText(o.level.toUpperCase() + " RISK", cx, cy + 60);

  g.fillStyle = "#ffffff"; g.font = "bold 62px Arial";
  const place = o.place.length > 26 ? o.place.slice(0, 25) + "…" : o.place;
  g.fillText(place, cx, 880);
  g.fillStyle = "#94a3b8"; g.font = "34px Arial";
  g.fillText(o.date + (o.score != null ? `  |  Resilience ${o.score}/100` : ""), cx, 935);

  g.fillStyle = "#64748b"; g.font = "26px Arial";
  g.fillText("Model estimate, not an emergency alert", cx, 1010);

  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}