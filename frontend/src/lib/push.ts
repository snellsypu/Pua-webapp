// Web Push client: register /sw.js, subscribe with the server's VAPID public key,
// and store the subscription. Permission is only ever requested from a click.
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { AppSettings, PushPublicKey, PushStatus } from "@/lib/types";

export type PushSupport = "supported" | "unsupported" | "needs-install";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (ok) return "supported";
  // iOS/iPadOS only exposes Web Push to home-screen-installed web apps (16.4+).
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return ios ? "needs-install" : "unsupported";
}

function b64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function enablePush(): Promise<void> {
  if (pushSupport() !== "supported") throw new Error("This browser can't receive notifications");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked — allow them in your browser's site settings"
        : "Notification permission wasn't granted",
    );
  }
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const { publicKey } = await apiGet<PushPublicKey>("/push/public-key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToBytes(publicKey),
    });
  }
  await apiPost<PushStatus>("/push/subscribe", sub.toJSON());
  // Routine times are local — tell the server which timezone "07:00" means.
  await apiPut<AppSettings>("/settings", {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await apiDelete<PushStatus>(`/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`);
  await sub.unsubscribe();
}
