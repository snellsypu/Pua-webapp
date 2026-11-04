// PUA (Personal Uplink Assistant) service worker — shows Web Push notifications (routine reminders)
// and focuses/opens the app when one is tapped. Served at /sw.js (Vite public/).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "PUA";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/apple-touch-icon.png",
      badge: "/favicon-32x32.png",
      tag: data.tag || "pua",
      renotify: true,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) return existing.focus().then(() => existing.navigate(target));
      return self.clients.openWindow(target);
    }),
  );
});
