/*
 * Homelab cast — receiver side. Runs inside a TV / kiosk / guest mirror frame.
 *
 * Follows the phone's page, applies remote commands (scroll, fling, select
 * highlight, OK, back), and reports what the screen shows back to the phone.
 * The screen never writes to an app: non-GET requests are refused here, and
 * picking an actionable item hands it to the phone, which does the work.
 */
(function () {
  "use strict";
  if (window.__homelabCastViewer) return;
  window.__homelabCastViewer = true;

  var SEL =
    'a[href],button,[role="button"],[role="tab"],[role="link"],[role="menuitem"],[role="option"],' +
    '[role="checkbox"],[role="switch"],[data-cast-action],input:not([type="hidden"]),select,textarea,summary,' +
    '[tabindex]:not([tabindex="-1"])';

  var appState = window.__castAppState || null;
  var selecting = false;
  var focusEl = null;
  var hl = null;
  var hlRaf = 0;
  var idleTimer = null;
  var lastEvent = null;
  var eventSeq = 0;
  var reportTimer = null;
  var lastReportAt = 0;

  // ------------------------------------------------------------ read-only

  (function blockWrites() {
    var readOnly = function (m) {
      return !/^(GET|HEAD)$/i.test(m || "GET");
    };
    if (window.fetch) {
      var origFetch = window.fetch;
      window.fetch = function (input, init) {
        var method = (init && init.method) || (input && typeof input === "object" && input.method) || "GET";
        if (readOnly(method)) return Promise.reject(new TypeError("This screen is read-only"));
        return origFetch.apply(this, arguments);
      };
    }
    var xo = XMLHttpRequest.prototype.open;
    var xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method) {
      this.__castReadOnly = readOnly(method);
      return xo.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      if (this.__castReadOnly) throw new Error("This screen is read-only");
      return xs.apply(this, arguments);
    };
  })();

  // --------------------------------------------------------------- report

  function currentPath() {
    var params = location.search
      .replace(/^\?/, "")
      .split("&")
      .filter(function (p) {
        return p && p.indexOf("__cast=") !== 0;
      });
    return location.pathname + (params.length ? "?" + params.join("&") : "");
  }

  function post(msg) {
    try {
      window.parent.postMessage(msg, "*");
    } catch (e) {}
  }

  function report() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(sendReport, Math.max(0, 120 - (Date.now() - lastReportAt)));
  }

  function sendReport() {
    lastReportAt = Date.now();
    var sc = mainScroller();
    post({
      type: "cast:report",
      report: {
        path: currentPath(),
        title: String(document.title || "").slice(0, 120),
        scroll: { top: Math.round(sc.scrollTop), max: Math.round(Math.max(0, sc.scrollHeight - sc.clientHeight)) },
        select: selecting,
        focus: selecting && focusEl && focusEl.isConnected ? describe(focusEl) : null,
        event: lastEvent,
        app: appState,
      },
    });
  }

  function emit(event) {
    event.eid = Date.now().toString(36) + "-" + ++eventSeq;
    lastEvent = event;
    report();
  }

  function describe(el) {
    var label =
      el.getAttribute("data-cast-label") ||
      el.getAttribute("aria-label") ||
      el.getAttribute("title") ||
      (el.innerText || el.value || el.placeholder || "").replace(/\s+/g, " ").trim() ||
      el.tagName.toLowerCase();
    var kind = el.hasAttribute("data-cast-action")
      ? "action"
      : el.matches("input,select,textarea")
        ? "input"
        : el.closest("a[href]")
          ? "link"
          : "button";
    return { label: label.slice(0, 80), kind: kind };
  }

  // --------------------------------------------------------------- scroll

  var scroller = null;
  var scrollerAt = 0;

  function mainScroller() {
    var now = Date.now();
    if (scroller && scroller.isConnected && now - scrollerAt < 1200) return scroller;
    scrollerAt = now;
    var root = document.scrollingElement || document.documentElement;
    var layer = modalLayer();
    var best = null;
    var bestArea = 0;
    if (!layer && root.scrollHeight > root.clientHeight + 4) {
      best = root;
      bestArea = innerWidth * innerHeight * 0.9;
    }
    var els = (layer || document.body).getElementsByTagName("*");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.scrollHeight <= el.clientHeight + 4 || el.clientHeight < 60) continue;
      var oy = getComputedStyle(el).overflowY;
      if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") continue;
      var r = el.getBoundingClientRect();
      var w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
      var h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
      if (w > 0 && h > 0 && w * h > bestArea) {
        best = el;
        bestArea = w * h;
      }
    }
    scroller = best || root;
    return scroller;
  }

  var pending = 0;
  var stepRaf = 0;
  function addScroll(px) {
    stopFling();
    pending += px;
    if (!stepRaf) stepRaf = requestAnimationFrame(stepScroll);
  }
  function stepScroll() {
    stepRaf = 0;
    var el = mainScroller();
    var take = Math.abs(pending) < 2 ? pending : pending * 0.35;
    var before = el.scrollTop;
    el.scrollTop = before + take;
    pending -= take;
    if (Math.abs(pending) >= 1 && el.scrollTop !== before) stepRaf = requestAnimationFrame(stepScroll);
    else {
      pending = 0;
      report();
    }
  }

  var flingRaf = 0;
  function stopFling() {
    if (flingRaf) cancelAnimationFrame(flingRaf);
    flingRaf = 0;
  }
  function fling(v) {
    stopFling();
    var last = performance.now();
    var tick = function (t) {
      var dt = Math.min(48, t - last) / 1000;
      last = t;
      var el = mainScroller();
      var before = el.scrollTop;
      el.scrollTop = before + v * dt;
      v *= Math.pow(0.05, dt);
      if (Math.abs(v) > 25 && el.scrollTop !== before) flingRaf = requestAnimationFrame(tick);
      else {
        flingRaf = 0;
        report();
      }
    };
    flingRaf = requestAnimationFrame(tick);
  }

  function scrollEdge(to) {
    stopFling();
    var el = mainScroller();
    el.scrollTo({ top: to === "top" ? 0 : el.scrollHeight, behavior: "smooth" });
    setTimeout(report, 700);
  }

  // --------------------------------------------------------------- select

  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  }

  /** Topmost dialog or full-screen fixed overlay; selection and scroll stay inside it. */
  function modalLayer() {
    var dialogs = document.querySelectorAll('[role="dialog"],[aria-modal="true"],dialog[open]');
    for (var i = dialogs.length - 1; i >= 0; i--) if (visible(dialogs[i])) return dialogs[i];
    var el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    while (el && el !== document.body && el !== document.documentElement) {
      if (getComputedStyle(el).position === "fixed") {
        var r = el.getBoundingClientRect();
        if (r.width * r.height > innerWidth * innerHeight * 0.6) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function candidates() {
    var scope = modalLayer() || document.body;
    var nodes = scope.querySelectorAll(SEL);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.disabled || el.closest('[aria-hidden="true"],[inert]')) continue;
      var holder = el.parentElement && el.parentElement.closest("[data-cast-action]");
      if (holder && scope.contains(holder)) continue;
      if (!visible(el)) continue;
      var r = el.getBoundingClientRect();
      if (r.right <= 0 || r.left >= innerWidth) continue;
      out.push({ el: el, r: r });
    }
    return out;
  }

  function initialFocus(list) {
    var inView = list.filter(function (c) {
      return c.r.bottom > 0 && c.r.top < innerHeight;
    });
    var pool = inView.filter(function (c) {
      return c.el.hasAttribute("data-cast-action");
    });
    if (!pool.length)
      pool = inView.filter(function (c) {
        return !c.el.closest("nav,aside,header");
      });
    if (!pool.length) pool = inView.length ? inView : list;
    pool.sort(function (a, b) {
      return a.r.top - b.r.top || a.r.left - b.r.left;
    });
    return pool[0] ? pool[0].el : null;
  }

  function move(dir) {
    var list = candidates();
    var known = focusEl && focusEl.isConnected && list.some(function (c) {
      return c.el === focusEl;
    });
    if (!known) return setFocus(initialFocus(list));
    var cur = focusEl.getBoundingClientRect();
    var vertical = dir === "up" || dir === "down";
    var sign = dir === "down" || dir === "right" ? 1 : -1;
    var ccx = (cur.left + cur.right) / 2;
    var ccy = (cur.top + cur.bottom) / 2;
    var best = null;
    var bestScore = Infinity;
    list.forEach(function (c) {
      if (c.el === focusEl || focusEl.contains(c.el) || c.el.contains(focusEl)) return;
      var r = c.r;
      var cx = (r.left + r.right) / 2;
      var cy = (r.top + r.bottom) / 2;
      var ahead = vertical ? (cy - ccy) * sign : (cx - ccx) * sign;
      if (ahead <= 2) return;
      var primary = vertical
        ? Math.max(0, sign > 0 ? r.top - cur.bottom : cur.top - r.bottom)
        : Math.max(0, sign > 0 ? r.left - cur.right : cur.left - r.right);
      var gap = vertical
        ? Math.max(0, r.left - cur.right, cur.left - r.right)
        : Math.max(0, r.top - cur.bottom, cur.top - r.bottom);
      var off = vertical ? Math.abs(cx - ccx) : Math.abs(cy - ccy);
      var score = primary + gap * 3 + off * 0.15 + (gap > 0 ? 40 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = c.el;
      }
    });
    if (best) return setFocus(best);
    if (vertical) addScroll(sign * innerHeight * 0.6);
  }

  function setFocus(el) {
    focusEl = el;
    if (!el) return report();
    var r = el.getBoundingClientRect();
    if (r.top < 48 || r.bottom > innerHeight - 48) el.scrollIntoView({ block: "center", behavior: "smooth" });
    if (hl) {
      var radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 8;
      hl.style.borderRadius = radius + 5 + "px";
    }
    report();
  }

  function bumpIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      setSelecting(false);
    }, 120000);
  }

  function setSelecting(on) {
    selecting = on;
    clearTimeout(idleTimer);
    if (on) {
      bumpIdle();
      if (!hl) {
        hl = document.createElement("div");
        hl.setAttribute("data-cast-highlight", "");
        hl.style.cssText =
          "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483646;" +
          "border:2px solid #c3b0ff;border-radius:12px;opacity:0;" +
          "box-shadow:0 0 0 4px rgba(162,123,255,.32),0 0 30px rgba(162,123,255,.55);" +
          "transition:transform .16s ease,width .16s ease,height .16s ease,opacity .2s ease";
        document.documentElement.appendChild(hl);
      }
      if (!focusEl || !focusEl.isConnected) setFocus(initialFocus(candidates()));
      if (!hlRaf) hlRaf = requestAnimationFrame(drawHighlight);
    } else if (hl) {
      hl.style.opacity = "0";
    }
    report();
  }

  function drawHighlight() {
    hlRaf = 0;
    if (!selecting || !hl) return;
    if (focusEl && focusEl.isConnected) {
      var r = focusEl.getBoundingClientRect();
      var pad = 5;
      hl.style.transform = "translate(" + (r.left - pad) + "px," + (r.top - pad) + "px)";
      hl.style.width = r.width + pad * 2 + "px";
      hl.style.height = r.height + pad * 2 + "px";
      hl.style.opacity = "1";
    } else {
      hl.style.opacity = "0";
    }
    hlRaf = requestAnimationFrame(drawHighlight);
  }

  function pulse() {
    if (!hl) return;
    hl.animate(
      [{ boxShadow: "0 0 0 4px rgba(183,243,77,.6),0 0 40px rgba(183,243,77,.7)" }, { boxShadow: "0 0 0 4px rgba(162,123,255,.32),0 0 30px rgba(162,123,255,.55)" }],
      { duration: 420 }
    );
  }

  function activate() {
    if (!selecting) return setSelecting(true);
    var el = focusEl;
    if (!el || !el.isConnected) return setFocus(initialFocus(candidates()));
    pulse();
    var d = describe(el);
    var action = el.getAttribute("data-cast-action");
    if (action) return emit({ type: "action", action: action, id: el.getAttribute("data-cast-id") || "", label: d.label });
    if (el.matches("input,select,textarea,[contenteditable]")) return emit({ type: "input", label: d.label });
    var a = el.closest("a[href]");
    if (a) {
      if (a.origin === location.origin && (!a.target || a.target === "_self") && !a.hasAttribute("download")) {
        return emit({ type: "navigate", path: a.pathname + a.search + a.hash });
      }
      return emit({ type: "external", label: d.label });
    }
    var layerBefore = modalLayer();
    el.click();
    setTimeout(function () {
      if (!focusEl || !focusEl.isConnected || modalLayer() !== layerBefore) setFocus(initialFocus(candidates()));
      report();
    }, 350);
  }

  function goBack() {
    var layer = modalLayer();
    if (!layer) return emit({ type: "back" });
    var target = document.activeElement || document.body;
    var opts = { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent("keydown", opts));
    document.dispatchEvent(new KeyboardEvent("keydown", opts));
    setTimeout(function () {
      if (layer.isConnected && visible(layer)) {
        var buttons = layer.querySelectorAll("button,[role=button]");
        for (var i = 0; i < buttons.length; i++) {
          var b = buttons[i];
          var text = (b.getAttribute("aria-label") || b.innerText || "").trim().toLowerCase();
          if (text === "close" || text === "cancel" || text === "done" || text === "back") {
            b.click();
            break;
          }
        }
      }
      setTimeout(function () {
        if (selecting) setFocus(initialFocus(candidates()));
      }, 250);
    }, 120);
  }

  // ------------------------------------------------------------- refresh

  var RESTORE_KEY = "__castRestore";

  function refreshPage() {
    var ev = new CustomEvent("cast:refresh", { cancelable: true });
    window.dispatchEvent(ev);
    if (ev.defaultPrevented) return;
    try {
      sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ path: currentPath(), top: mainScroller().scrollTop }));
    } catch (e) {}
    location.reload();
  }

  function restoreScroll() {
    var saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(RESTORE_KEY) || "null");
      sessionStorage.removeItem(RESTORE_KEY);
    } catch (e) {}
    if (!saved || saved.path !== currentPath()) return;
    [300, 800, 1600].forEach(function (ms) {
      setTimeout(function () {
        scrollerAt = 0;
        mainScroller().scrollTop = saved.top;
      }, ms);
    });
  }

  // ------------------------------------------------------------- wiring

  function onCommand(cmd) {
    if (!cmd || typeof cmd.type !== "string") return;
    var num = function (v, lim) {
      v = Number(v) || 0;
      return Math.max(-lim, Math.min(lim, v));
    };
    switch (cmd.type) {
      case "scroll":
        return addScroll(num(cmd.dy, 4) * innerHeight);
      case "fling":
        return fling(num(cmd.v, 12) * innerHeight);
      case "scrollTo":
        return scrollEdge(cmd.to);
      case "select":
        return setSelecting(!!cmd.on);
      case "move":
        if (!selecting) return setSelecting(true);
        bumpIdle();
        return move(String(cmd.dir));
      case "ok":
        return activate();
      case "click":
        if (focusEl && focusEl.isConnected) focusEl.click();
        return setTimeout(report, 350);
      case "back":
        return goBack();
      case "refresh":
        return refreshPage();
      case "hello":
        return report();
      default:
        if (cmd.type.indexOf("app.") === 0) {
          window.dispatchEvent(new CustomEvent("cast:command", { detail: cmd }));
        }
    }
  }

  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var d = e.data;
    if (!d) return;
    if (d.type === "cast:command") return onCommand(d.cmd);
    if (d.type !== "cast:navigate" || typeof d.path !== "string") return;
    if (d.path.charAt(0) !== "/" || d.path.charAt(1) === "/") return;
    if (currentPath() !== d.path) {
      applyingRemote = true;
      try {
        history.pushState(null, "", d.path);
      } finally {
        applyingRemote = false;
      }
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    }
    post({ type: "cast:navigated", path: d.path });
    scrollerAt = 0;
    setTimeout(function () {
      if (selecting) setFocus(initialFocus(candidates()));
      report();
    }, 400);
  });

  // The screen moving on its own (a selected button that changes page) asks the
  // phone to follow, so the phone stays the source of truth for the path.
  var applyingRemote = false;
  var origPush = history.pushState;
  history.pushState = function () {
    var before = currentPath();
    var out = origPush.apply(this, arguments);
    if (!applyingRemote && currentPath() !== before) emit({ type: "navigate", path: currentPath() });
    return out;
  };

  window.addEventListener("cast:state", function (e) {
    appState = e.detail || null;
    report();
  });
  window.addEventListener("popstate", function () {
    setTimeout(report, 300);
  });

  restoreScroll();
  setTimeout(report, 500);
})();
