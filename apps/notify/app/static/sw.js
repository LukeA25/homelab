self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: "Notification", body: event.data ? event.data.text() : "" };
  }
  var title = String(data.title || "Notification").slice(0, 120);
  event.waitUntil(
    self.registration.showNotification(title, {
      body: String(data.body || "").slice(0, 400),
      tag: data.tag || undefined,
      data: { url: typeof data.url === "string" ? data.url : "/" },
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "/";
  var url;
  try {
    url = new URL(target, self.location.origin);
  } catch (err) {
    url = new URL("/", self.location.origin);
  }
  if (url.origin !== self.location.origin) url = new URL("/", self.location.origin);
  event.waitUntil(self.clients.openWindow(url.href));
});
