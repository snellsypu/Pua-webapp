// Stats share card: draws a pretty PNG (lei count, days with PUA and all stats) on a
// canvas, then opens the phone's share sheet or downloads it.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Share2 } from "lucide-react";
import type { Stats } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const W = 1080;
const H = 1350;

function loadImg(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

// Plumeria drawn with canvas paths (mirrors the Flower.tsx petal).
function plumeria(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, pink = false) {
  const p = new Path2D("M12 12C9.2 9.6 8.6 4.1 11.4 2.1c1.2-.8 3.6-.5 4.4 1.2 1.2 2.6-.6 6.2-3.8 8.7Z");
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 11);
  g.addColorStop(0, "#facc15");
  g.addColorStop(0.3, pink ? "#f9a8d4" : "#fde68a");
  g.addColorStop(1, pink ? "#ec4899" : "#fffbeb");
  for (let i = 0; i < 5; i++) {
    ctx.save();
    ctx.translate(12, 12);
    ctx.rotate((i * 72 * Math.PI) / 180);
    ctx.translate(-12, -12);
    ctx.fillStyle = g;
    ctx.fill(p);
    ctx.strokeStyle = pink ? "#db2777" : "#d97706";
    ctx.lineWidth = 0.4;
    ctx.stroke(p);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(12, 12, 1.4, 0, Math.PI * 2);
  ctx.fillStyle = "#eab308";
  ctx.fill();
  ctx.restore();
}

async function drawCard(s: Stats, name: string): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#14857c");
  bg.addColorStop(1, "#0b4f49");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // garland of flowers across the top
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    plumeria(ctx, 60 + t * (W - 120), 70 + Math.sin(t * Math.PI) * 120, 78, i % 2 === 1);
  }
  try {
    const logo = await loadImg("/icon-192.png");
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(W / 2 - 70, 250, 140, 140, 32);
    ctx.clip();
    ctx.drawImage(logo, W / 2 - 70, 250, 140, 140);
    ctx.restore();
  } catch { /* logo optional */ }
  ctx.textAlign = "center";
  ctx.fillStyle = "#fffbeb";
  ctx.font = "600 44px system-ui, sans-serif";
  ctx.fillText(`${name}'s PUA in flowers`, W / 2, 460);
  ctx.font = "800 260px system-ui, sans-serif";
  ctx.fillStyle = "#fde68a";
  ctx.fillText(String(s.leisTotal), W / 2, 720);
  ctx.font = "700 56px system-ui, sans-serif";
  ctx.fillStyle = "#fffbeb";
  ctx.fillText(s.leisTotal === 1 ? "lei completed" : "leis completed", W / 2, 800);
  ctx.font = "500 40px system-ui, sans-serif";
  ctx.fillStyle = "#ccfbf1";
  ctx.fillText(`${s.daysUsing} days with PUA · ${s.activeDays} active days`, W / 2, 870);

  const best = Math.max(0, ...s.routines.map((r) => r.bestStreak));
  const tiles: [string, string][] = [
    [String(best), "best routine streak"],
    [String(s.habitCheckOffs), "habit check-offs"],
    [String(s.bestHabitStreak), "best habit streak"],
    [String(s.appointments), "appointments"],
    [String(s.remindersDone), "reminders done"],
    [String(s.bouquets), s.bouquets === 1 ? "bouquet" : "bouquets"],
  ];
  const tw = 300, th = 150, gap = 30, x0 = (W - (tw * 3 + gap * 2)) / 2;
  tiles.forEach(([v, l], i) => {
    const x = x0 + (i % 3) * (tw + gap);
    const y = 940 + Math.floor(i / 3) * (th + gap);
    ctx.fillStyle = "rgba(255,251,235,0.12)";
    ctx.beginPath();
    ctx.roundRect(x, y, tw, th, 28);
    ctx.fill();
    ctx.fillStyle = "#fffbeb";
    ctx.font = "800 64px system-ui, sans-serif";
    ctx.fillText(v, x + tw / 2, y + 78);
    ctx.font = "500 28px system-ui, sans-serif";
    ctx.fillStyle = "#ccfbf1";
    ctx.fillText(l, x + tw / 2, y + 122);
  });
  ctx.font = "800 40px system-ui, sans-serif";
  ctx.fillStyle = "#fde68a";
  ctx.fillText("P U A", W / 2, H - 28);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/png"));
}

export function ShareStatsButton({ stats, name }: { stats: Stats; name: string }) {
  const [open, setOpen] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let u: string | null = null;
    void drawCard(stats, name).then((b) => { setBlob(b); u = URL.createObjectURL(b); setUrl(u); })
      .catch(() => toast.error("Couldn't draw the card"));
    return () => { if (u) URL.revokeObjectURL(u); setUrl(null); setBlob(null); };
  }, [open, stats, name]);

  const file = () => new File([blob!], "pua-stats.png", { type: "image/png" });
  const share = async () => {
    if (!blob) return;
    const f = file();
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: "My PUA stats", text: `${stats.leisTotal} leis completed on PUA 🌺` }); return; }
      catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; }
    }
    download();
    toast.success("Sharing isn't available here — the image was saved instead");
  };
  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "pua-stats.png";
    a.click();
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="stats-share-button"><Share2 className="size-4" /> Share card</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm" data-testid="stats-share-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Share your stats</DialogTitle>
            <DialogDescription>A picture of your leis and PUA totals to send to friends.</DialogDescription>
          </DialogHeader>
          <div className="grid aspect-[4/5] place-items-center overflow-hidden rounded-2xl border bg-muted">
            {url ? <img src={url} alt="Your PUA stats card" className="size-full object-cover" data-testid="stats-share-preview" />
              : <Loader2 className="size-6 animate-spin text-muted-foreground" />}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => void share()} disabled={!blob} data-testid="stats-share-send"><Share2 className="size-4" /> Share</Button>
            <Button variant="outline" onClick={download} disabled={!url} data-testid="stats-share-download"><Download className="size-4" /> Save image</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
