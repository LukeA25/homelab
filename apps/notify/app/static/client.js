/* Opt-in phone notifications for one homelab app.
 *
 * <link rel="manifest" href="/manifest.webmanifest">
 * <script src="/__notify/client.js" defer></script>
 *
 * Call HomelabNotify.enable() from a tap. On iPhone, that tap has to happen
 * inside the icon added to the Home Screen.
 */
(function () {
  var BASE = "/__notify";

  function onIphone() {
    return Object.prototype.hasOwnProperty.call(window.navigator, "standalone");
  }

  function installed() {
    return window.navigator.standalone === true
      || window.matchMedia("(display-mode: standalone)").matches;
  }

  function supported() {
    return window.isSecureContext
      && "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window;
  }

  function urlBase64ToUint8Array(value) {
    var padding = "=".repeat((4 - (value.length % 4)) % 4);
    var base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(base64);
    var output = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
  }

  function registration() {
    return navigator.serviceWorker.getRegistration(BASE + "/");
  }

  async function subscribed() {
    if (!supported()) return false;
    var reg = await registration();
    if (!reg) return false;
    return Boolean(await reg.pushManager.getSubscription());
  }

  async function enable() {
    if (!window.isSecureContext) {
      return {
        ok: false,
        permission: "unsupported",
        reason: "Open the https address for this app. Notifications do not work on http.",
      };
    }
    if (onIphone() && !installed()) {
      return {
        ok: false,
        permission: "default",
        reason: "Open this app from the Home Screen icon, not from Safari. Add the https address if the icon was saved from http.",
      };
    }
    if (!supported()) {
      var reason = onIphone()
        ? "This Home Screen icon cannot receive notifications. Delete it, open the https address in Safari, and add it again."
        : "This browser cannot receive notifications.";
      return { ok: false, permission: "unsupported", reason: reason };
    }
    var permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, permission: permission, reason: "Notifications are blocked." };
    }
    var reg = await navigator.serviceWorker.register(BASE + "/sw.js");
    var keyRes = await fetch(BASE + "/vapid");
    if (!keyRes.ok) {
      return { ok: false, permission: permission, reason: "The notification service is unavailable." };
    }
    var key = await keyRes.json();
    var sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key.publicKey),
    });
    var save = await fetch(BASE + "/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
    if (!save.ok) {
      return { ok: false, permission: permission, reason: "Could not save this device." };
    }
    return { ok: true, permission: "granted" };
  }

  async function disable() {
    if (!("serviceWorker" in navigator)) return { ok: true };
    var reg = await registration();
    if (!reg) return { ok: true };
    var sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch(BASE + "/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    return { ok: true };
  }

  window.HomelabNotify = {
    supported: supported,
    permission: function () {
      if (!("Notification" in window)) return "unsupported";
      return Notification.permission;
    },
    subscribed: subscribed,
    enable: enable,
    disable: disable,
  };
})();
