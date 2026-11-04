/*
 * Homelab cast — send the page you're on to the TV, the nightstand kiosk, or
 * the guest screen, then keep driving it from the phone.
 *
 * Loaded by every homelab app. Three modes:
 *  - viewer:     inside a receiver's mirror frame; loads viewer.js
 *  - inert:      on the receiver pages themselves (/tv, /control, /guest)
 *  - controller: everywhere else; shows the send button on a sideways phone,
 *                then a full-screen remote (pages, scroll pad, select, app
 *                controls) for the screens this phone is showing on
 *
 * Apps can extend the remote by setting window.castApp:
 *   pages()              -> [{ label, sub?, path, tab? }]
 *   controls(appState)   -> [{ kind: toggle|pager|stepper, ... }] or null
 *   controlsLabel        -> tab name for the controls
 *   actions[name]        -> { load(id) -> { title, subtitle, groups }, run(id, optionId) }
 */
(function () {
  "use strict";
  if (window.__homelabCast) return;
  window.__homelabCast = true;

  var API = "/__cast/api";
  var LANDSCAPE_PHONE = "(orientation: landscape) and (max-height: 500px) and (pointer: coarse)";

  var inFrame = false;
  try {
    inFrame = window.top !== window.self;
  } catch (e) {
    inFrame = true;
  }
  if (inFrame) return viewer();
  if (/^\/(tv|control|guest)(\/|$)/.test(location.pathname)) return;

  var APP = appFromHost(location.hostname, location.port);
  if (!APP) return;

  function appFromHost(host, port) {
    if (port && port !== "80" && port !== "443") return null;
    var first = String(host || "").toLowerCase().split(".")[0];
    if (first === "finance" || first === "guitar" || first === "theology" || first === "homework") return first;
    if (first === "homepage" || first === "homelab" || host === "100.101.135.109") return "home";
    return null;
  }

  function currentPath() {
    var params = location.search
      .replace(/^\?/, "")
      .split("&")
      .filter(function (p) {
        return p && p.indexOf("__cast=") !== 0;
      });
    return location.pathname + (params.length ? "?" + params.join("&") : "");
  }

  // ---------------------------------------------------------------- viewer

  function viewer() {
    var s = document.createElement("script");
    s.src = "/__cast/viewer.js";
    (document.head || document.documentElement).appendChild(s);
  }

  // ------------------------------------------------------------ controller

  var TARGETS = [
    { id: "tv", name: "TV", desc: "Bedroom TV", icon: "tv" },
    { id: "kiosk", name: "Kiosk", desc: "Nightstand screen", icon: "kiosk" },
    { id: "guest", name: "Guest", desc: "Public guest link", icon: "globe" },
  ];
  var APP_NAMES = { home: "Homepage", finance: "Finance", guitar: "Guitar", theology: "Theology", homework: "Homework" };

  var ICONS = {
    cast:
      '<path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"/><path d="M2 12a9 9 0 0 1 8 8"/><path d="M2 16a5 5 0 0 1 4 4"/><line x1="2" x2="2.01" y1="20" y2="20"/>',
    tv: '<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>',
    kiosk: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M8 21h8"/><path d="M12 19v2"/>',
    globe:
      '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    chevron: '<path d="m18 15-6-6-6 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
    back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
  };

  function svg(name, size) {
    return (
      '<svg viewBox="0 0 24 24" width="' +
      (size || 20) +
      '" height="' +
      (size || 20) +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      ICONS[name] +
      "</svg>"
    );
  }

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}",
    "[hidden]{display:none!important}",
    ".root{--f:Figtree,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;--d:Outfit,var(--f);position:fixed;inset:0;pointer-events:none;z-index:2147483000;font-family:var(--f);color:#eef1f8;-webkit-font-smoothing:antialiased}",
    // launcher
    ".fab{position:absolute;top:max(10px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));height:44px;min-width:44px;padding:0 12px;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;border:1px solid rgba(162,123,255,.45);background:rgba(10,12,20,.82);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#eef1f8;font:600 13px/1 var(--f);box-shadow:0 8px 28px rgba(0,0,0,.45),0 0 22px rgba(162,123,255,.28);pointer-events:auto;cursor:pointer;opacity:0;transform:scale(.4) translateY(-8px);transition:opacity .28s ease,transform .45s cubic-bezier(.34,1.56,.64,1),border-color .2s}",
    ".fab.show{opacity:1;transform:none}",
    ".fab.hide{pointer-events:none}",
    ".fab .ic{display:flex;color:#c3b0ff}",
    ".fab .label{display:none;white-space:nowrap}",
    ".fab.live{border-color:rgba(183,243,77,.55);box-shadow:0 8px 28px rgba(0,0,0,.45),0 0 22px rgba(183,243,77,.25)}",
    ".fab.live .label{display:inline}",
    ".dot{width:8px;height:8px;border-radius:8px;background:#b7f34d;box-shadow:0 0 10px rgba(183,243,77,.9);animation:pulse 1.6s ease-in-out infinite}",
    "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}",
    // sheet
    ".sheet{position:absolute;inset:0;pointer-events:auto;background:radial-gradient(ellipse 60% 45% at 50% 0%,rgba(162,123,255,.28),transparent 70%),radial-gradient(ellipse 40% 30% at 12% 0%,rgba(79,139,255,.22),transparent 70%),rgba(5,6,10,.9);-webkit-backdrop-filter:blur(18px) saturate(1.2);backdrop-filter:blur(18px) saturate(1.2);clip-path:circle(0 at var(--ox) var(--oy));transition:clip-path .52s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column;padding:max(16px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left))}",
    ".sheet.open{clip-path:circle(150vmax at var(--ox) var(--oy))}",
    ".sheet.clear{background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none}",
    ".head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}",
    ".eyebrow{font:600 11px/1 var(--f);letter-spacing:.16em;text-transform:uppercase;color:#8d95aa}",
    ".title{margin-top:6px;font:700 22px/1.1 var(--d);letter-spacing:-.01em;background:linear-gradient(92deg,#eef1f8,#c3b0ff 55%,#7fb0ff);-webkit-background-clip:text;background-clip:text;color:transparent}",
    ".sub{margin-top:4px;font-size:12px;color:#8d95aa;max-width:60vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".close{flex:none;width:40px;height:40px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#eef1f8;display:flex;align-items:center;justify-content:center;cursor:pointer}",
    ".cards{flex:1;display:flex;gap:12px;align-items:center;justify-content:center;margin-top:12px;min-height:0}",
    "@media (orientation:portrait){.cards{flex-direction:column;justify-content:flex-start;align-items:stretch}}",
    "@media (orientation:landscape){.card{height:min(168px,100%)}}",
    ".card{flex:1;max-width:240px;min-height:96px;position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:10px;padding:14px;border-radius:20px;border:1px solid rgba(255,255,255,.09);background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.015));color:inherit;text-align:left;font:inherit;cursor:pointer;opacity:0;transform:translateY(18px) scale(.96);transition:opacity .35s ease,transform .5s cubic-bezier(.2,.8,.2,1),border-color .2s,background .2s}",
    "@media (orientation:portrait){.card{max-width:none;flex:none}}",
    ".sheet.open .card{opacity:1;transform:none}",
    ".card:nth-child(2){transition-delay:.06s}.card:nth-child(3){transition-delay:.12s}",
    ".card:active{transform:scale(.97)}",
    ".card .ico{width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,#4f8bff,#a27bff);box-shadow:0 0 24px rgba(162,123,255,.35)}",
    ".card[data-t=kiosk] .ico{background:linear-gradient(135deg,#34e0e8,#4f8bff);box-shadow:0 0 24px rgba(52,224,232,.3)}",
    ".card[data-t=guest] .ico{background:linear-gradient(135deg,#a27bff,#ff6fb5);box-shadow:0 0 24px rgba(255,111,181,.28)}",
    ".card .name{font:700 17px/1.1 var(--d)}",
    ".card .desc{margin-top:3px;font-size:12px;color:#8d95aa}",
    ".card .state{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#8d95aa}",
    ".card.mine{border-color:rgba(183,243,77,.5);background:linear-gradient(180deg,rgba(183,243,77,.12),rgba(183,243,77,.02))}",
    ".card.mine .state{color:#b7f34d}",
    ".off{margin-top:2px;align-self:flex-start;padding:7px 12px;border-radius:999px;border:1px solid rgba(255,102,128,.45);background:rgba(255,102,128,.12);color:#ff8fa3;font:600 12px/1 var(--f);cursor:pointer}",
    ".row{display:flex;align-items:center;gap:12px}",
    "@media (orientation:portrait){.card{flex-direction:row;align-items:center}.card .row{flex:1}}",
    // send mode
    ".send{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;padding-top:max(14px,env(safe-area-inset-top));touch-action:none;pointer-events:auto}",
    ".send.on{display:flex}",
    ".arrow{position:relative;width:76px;height:76px;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,#4f8bff,#a27bff);box-shadow:0 0 0 8px rgba(162,123,255,.12),0 0 44px rgba(162,123,255,.55);transform:scale(var(--grow,1));transition:transform .12s ease-out}",
    ".chev{display:flex;flex-direction:column;align-items:center;margin-top:2px;color:#c3b0ff;line-height:0}",
    ".chev span{display:block;height:14px;animation:rise 1.4s ease-in-out infinite;opacity:0}",
    ".chev span:nth-child(1){animation-delay:.3s}.chev span:nth-child(2){animation-delay:.15s}",
    "@keyframes rise{0%{opacity:0;transform:translateY(8px)}40%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}",
    ".hint{margin-top:8px;font:700 15px/1.2 var(--d);text-shadow:0 2px 12px rgba(0,0,0,.6);transition:opacity .15s}",
    "@media (max-height:500px){.arrow{width:60px;height:60px}.chev span{height:11px}.hint{margin-top:4px}}",
    ".hint small{display:block;margin-top:3px;font:500 11px/1.2 var(--f);color:#9ba3b6;text-align:center}",
    ".cancel{position:absolute;top:max(12px,env(safe-area-inset-top));right:max(14px,env(safe-area-inset-right));width:40px;height:40px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(10,12,20,.75);color:#eef1f8;display:flex;align-items:center;justify-content:center;cursor:pointer}",
    // success
    ".done{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px;pointer-events:none}",
    ".done.on{display:flex}",
    ".done .badge{width:84px;height:84px;border-radius:999px;display:flex;align-items:center;justify-content:center;color:#07080d;background:#b7f34d;box-shadow:0 0 0 10px rgba(183,243,77,.14),0 0 60px rgba(183,243,77,.6);animation:pop .55s cubic-bezier(.34,1.56,.64,1) both}",
    ".done .msg{font:700 20px/1.1 var(--d);animation:fade .4s .1s ease both}",
    ".done .msg small{display:block;margin-top:4px;font:500 12px/1.2 var(--f);color:#9ba3b6;text-align:center}",
    ".done.err .badge{background:#ff6680;color:#fff;box-shadow:0 0 60px rgba(255,102,128,.5)}",
    "@keyframes pop{0%{transform:scale(.2);opacity:0}100%{transform:none;opacity:1}}",
    "@keyframes fade{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:none}}",
    // remote
    ".remote{position:absolute;inset:0;pointer-events:auto;display:flex;flex-direction:column;gap:10px;padding:max(12px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left));background:radial-gradient(ellipse 60% 40% at 50% 0%,rgba(162,123,255,.24),transparent 70%),radial-gradient(ellipse 40% 30% at 10% 100%,rgba(79,139,255,.16),transparent 70%),rgba(5,6,10,.95);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);clip-path:circle(0 at var(--ox) var(--oy));transition:clip-path .5s cubic-bezier(.2,.8,.2,1);overflow:hidden;-webkit-user-select:none;user-select:none}",
    ".remote.open{clip-path:circle(150vmax at var(--ox) var(--oy))}",
    ".rhead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    ".rtarget{display:flex;align-items:center;gap:8px;height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(183,243,77,.45);background:rgba(183,243,77,.08);color:#eef1f8;font:700 14px/1 var(--d);cursor:pointer;white-space:nowrap}",
    ".rtarget small{font:500 12px/1 var(--f);color:#9ba3b6}",
    ".rtabs{display:flex;gap:3px;padding:3px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}",
    ".rtab{height:32px;padding:0 14px;border-radius:999px;border:0;background:transparent;color:#9ba3b6;font:600 13px/1 var(--f);cursor:pointer;white-space:nowrap}",
    ".rtab.on{background:linear-gradient(135deg,#4f8bff,#a27bff);color:#fff;box-shadow:0 0 18px rgba(162,123,255,.4)}",
    ".spacer{flex:1}",
    ".rbtn{height:36px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#eef1f8;font:600 12px/1 var(--f);display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap}",
    ".rbtn.danger{border-color:rgba(255,102,128,.45);color:#ff8fa3;background:rgba(255,102,128,.1)}",
    ".rbtn:active,.pitem:active,.dk:active,.big:active,.ochip:active{transform:scale(.96)}",
    "@media (orientation:portrait){.rtabs{order:3;width:100%}.rtab{flex:1;padding:0 6px}}",
    ".rbody{flex:1;min-height:0;display:flex}",
    ".pane{flex:1;min-height:0;display:flex;gap:12px}",
    "@media (orientation:portrait){.pane{flex-direction:column}}",
    // pages
    ".pane.pages{flex-direction:column;gap:8px}",
    ".rsearch{height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#eef1f8;padding:0 12px;font:500 14px var(--f);outline:none;-webkit-user-select:text;user-select:text}",
    ".plist{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;align-content:start;padding-bottom:8px}",
    ".pitem{min-height:52px;padding:10px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.04);color:#eef1f8;text-align:left;font:600 14px/1.2 var(--f);cursor:pointer;overflow:hidden}",
    ".pitem small{display:block;margin-top:3px;font:500 11px/1.2 var(--f);color:#8d95aa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".pitem.on{border-color:rgba(183,243,77,.55);background:rgba(183,243,77,.1)}",
    // scroll pad
    ".pad{flex:1;min-height:120px;position:relative;border-radius:24px;border:1px solid rgba(162,123,255,.3);background:repeating-linear-gradient(180deg,rgba(255,255,255,.055) 0 1px,transparent 1px 30px),linear-gradient(180deg,rgba(79,139,255,.1),rgba(162,123,255,.07));background-position:0 var(--off,0px),0 0;touch-action:none;display:flex;align-items:center;justify-content:center;cursor:ns-resize;transition:border-color .2s,box-shadow .2s}",
    ".pad.drag{border-color:rgba(162,123,255,.75);box-shadow:inset 0 0 40px rgba(162,123,255,.22)}",
    ".pad-hint{display:flex;flex-direction:column;align-items:center;gap:6px;color:#9ba3b6;font:600 13px/1.2 var(--f);text-align:center;pointer-events:none}",
    ".pad-hint svg{color:#c3b0ff}",
    ".side{display:flex;flex-direction:column;align-items:stretch;gap:10px;width:112px}",
    "@media (orientation:portrait){.side{flex-direction:row;width:auto;align-items:center}}",
    ".big{min-height:48px;padding:0 14px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#eef1f8;font:700 14px/1 var(--d);display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}",
    "@media (orientation:portrait){.side .big{flex:1}}",
    ".meter{position:relative;flex:1;align-self:center;width:8px;min-height:40px;border-radius:8px;background:rgba(255,255,255,.08);overflow:hidden}",
    ".meter span{position:absolute;left:0;top:0;width:100%;height:calc(var(--p,0) * 100%);border-radius:8px;background:linear-gradient(#4f8bff,#a27bff);transition:height .2s,width .2s}",
    "@media (orientation:portrait){.meter{width:auto;height:8px;min-height:0;flex:1}.meter span{height:100%;width:calc(var(--p,0) * 100%)}}",
    // select
    ".dpad{position:relative;flex:none;align-self:center;width:min(240px,60vmin);aspect-ratio:1;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:radial-gradient(circle,rgba(162,123,255,.1),rgba(255,255,255,.02) 70%)}",
    ".dk{position:absolute;width:33%;height:33%;border:0;border-radius:50%;background:transparent;color:#c3b0ff;display:flex;align-items:center;justify-content:center;cursor:pointer}",
    ".dk[data-d=up]{top:1%;left:33.5%}.dk[data-d=down]{bottom:1%;left:33.5%}.dk[data-d=left]{left:1%;top:33.5%}.dk[data-d=right]{right:1%;top:33.5%}",
    ".dk.ok{top:30%;left:30%;width:40%;height:40%;color:#fff;font:700 16px/1 var(--d);background:linear-gradient(135deg,#4f8bff,#a27bff);box-shadow:0 0 30px rgba(162,123,255,.45)}",
    ".selside{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:10px}",
    ".focus{padding:14px 16px;border-radius:18px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.04)}",
    ".focus .eyebrow{margin-bottom:6px}",
    ".focus b{display:block;font:700 16px/1.25 var(--d);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    ".focus small{display:block;margin-top:4px;font:500 12px/1.3 var(--f);color:#8d95aa}",
    // app controls
    ".ctrls{flex:1;min-height:0;display:grid;gap:10px;grid-template-columns:1fr;align-content:stretch;overflow-y:auto}",
    "@media (orientation:landscape){.ctrls.has-pager{grid-template-columns:2fr 1fr}.ctrls.has-pager .c-pager{grid-row:span 4}}",
    ".c-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:18px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.04);color:#eef1f8;font:600 14px/1.2 var(--f);text-align:left;cursor:pointer}",
    ".c-row small{display:block;margin-top:3px;font:500 11px var(--f);color:#8d95aa}",
    ".sw{flex:none;width:46px;height:28px;border-radius:999px;background:rgba(255,255,255,.12);position:relative;transition:background .2s}",
    ".sw::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .2s}",
    ".c-row.on .sw{background:linear-gradient(135deg,#4f8bff,#a27bff)}.c-row.on .sw::after{transform:translateX(18px)}",
    ".step{display:flex;align-items:center;gap:8px}.step b{min-width:44px;text-align:center;font:700 14px var(--d)}",
    ".sbtn{width:40px;height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#eef1f8;font:700 18px/1 var(--d);cursor:pointer}",
    ".c-pager{display:flex;flex-direction:column;gap:8px;min-height:150px}",
    ".pgl{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font:700 15px/1.2 var(--d)}.pgl small{font:600 12px var(--f);color:#9ba3b6}",
    ".pgs{flex:1;display:grid;grid-template-columns:1fr 1.4fr;gap:10px}",
    ".pg{border-radius:22px;border:1px solid rgba(162,123,255,.3);background:rgba(162,123,255,.08);color:#eef1f8;font:700 17px/1 var(--d);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer}",
    ".pg.next{background:linear-gradient(135deg,rgba(79,139,255,.3),rgba(162,123,255,.35));border-color:rgba(162,123,255,.55)}",
    ".pg:active{transform:scale(.97)}.pg[disabled]{opacity:.35}",
    ".empty{margin:auto;max-width:300px;text-align:center;color:#9ba3b6;font:500 13px/1.4 var(--f)}",
    // action sheet + toast
    ".asheet{position:absolute;left:0;right:0;bottom:0;max-height:90%;display:flex;flex-direction:column;gap:10px;padding:16px max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));border-radius:24px 24px 0 0;border-top:1px solid rgba(162,123,255,.4);background:rgba(12,14,22,.98);box-shadow:0 -20px 60px rgba(0,0,0,.6);transform:translateY(105%);transition:transform .35s cubic-bezier(.2,.8,.2,1)}",
    ".asheet.open{transform:none}",
    ".ahead{display:flex;align-items:flex-start;gap:10px}.ahead>div{flex:1;min-width:0}",
    ".atitle{font:700 18px/1.2 var(--d)}.asub{margin-top:3px;font:500 12px/1.3 var(--f);color:#9ba3b6}",
    ".opts{overflow-y:auto;display:flex;flex-direction:column;gap:12px;min-height:0}",
    ".ogroup .eyebrow{margin-bottom:6px}",
    ".ochips{display:flex;flex-wrap:wrap;gap:6px}",
    ".ochip{display:inline-flex;align-items:center;gap:6px;padding:9px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#eef1f8;font:600 13px/1 var(--f);cursor:pointer}",
    ".ochip i{width:8px;height:8px;border-radius:8px;background:var(--c,#9ba3b6)}",
    ".ochip.on{border-color:#b7f34d;background:rgba(183,243,77,.12)}",
    ".afoot{display:flex;gap:8px;justify-content:flex-end}",
    ".toast{position:absolute;left:50%;bottom:max(18px,env(safe-area-inset-bottom));max-width:86%;transform:translate(-50%,20px);opacity:0;padding:10px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(20,22,32,.96);color:#eef1f8;font:600 13px/1.3 var(--f);text-align:center;pointer-events:none;transition:opacity .25s,transform .25s}",
    ".toast.on{opacity:1;transform:translate(-50%,0)}",
  ].join("\n");

  var state = { targets: {}, mine: [] };
  var host, root, fab, sheet, cardsEl, sendEl, doneEl, arrowEl, hintEl;
  var mq = window.matchMedia ? window.matchMedia(LANDSCAPE_PHONE) : null;
  var picked = null;
  var mode = "closed"; // closed | pick | send | busy
  var saved = null;

  function api(path, body) {
    return fetch(API + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function refresh() {
    return api("/state")
      .then(function (data) {
        state.targets = data.targets || {};
        state.mine = data.mine || [];
        var reps = data.reports || {};
        Object.keys(reps).forEach(function (t) {
          var r = reps[t];
          if (!(t in seenEvents)) seenEvents[t] = r && r.event ? r.event.eid : null;
          if (r) reports[t] = r;
        });
        connectStream();
        render();
        if (remote.open) {
          if (!state.mine.length) closeRemote();
          else renderRemote();
        }
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  // --- follow navigation while a session is up --------------------------

  var lastSent = null;
  var followTimer = null;
  function followSoon() {
    clearTimeout(followTimer);
    followTimer = setTimeout(function () {
      if (!state.mine.length) return;
      var path = currentPath();
      var key = APP + " " + path;
      if (key === lastSent) return;
      lastSent = key;
      api("/follow", { app: APP, path: path })
        .then(function (data) {
          state.mine = data.mine || [];
          render();
        })
        .catch(function () {
          lastSent = null;
        });
    }, 250);
  }

  ["pushState", "replaceState"].forEach(function (fn) {
    var orig = history[fn];
    history[fn] = function () {
      var out = orig.apply(this, arguments);
      followSoon();
      return out;
    };
  });
  window.addEventListener("popstate", followSoon);
  window.addEventListener("hashchange", followSoon);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refresh();
  });
  setInterval(function () {
    if (state.mine.length && document.visibilityState === "visible") refresh();
  }, 10000);

  // --- DOM ----------------------------------------------------------------

  function build() {
    host = document.createElement("div");
    host.id = "homelab-cast";
    document.documentElement.appendChild(host);
    var shadow = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    shadow.innerHTML =
      "<style>" +
      CSS +
      '</style><div class="root">' +
      '<button class="fab" type="button" aria-label="Send to a screen"><span class="dot" hidden></span><span class="ic">' +
      svg("cast", 20) +
      '</span><span class="label"></span></button>' +
      remoteHtml() +
      '<div class="sheet" hidden><div class="head"><div><div class="eyebrow">Send to a screen</div><div class="title">' +
      APP_NAMES[APP] +
      '</div><div class="sub"></div></div><button class="close" type="button" aria-label="Close">' +
      svg("x", 18) +
      '</button></div><div class="cards"></div>' +
      '<div class="send"><div class="arrow">' +
      svg("up", 34) +
      '</div><div class="chev"><span>' +
      svg("chevron", 18) +
      "</span><span>" +
      svg("chevron", 18) +
      "</span><span>" +
      svg("chevron", 18) +
      '</span></div><div class="hint"></div><button class="cancel" type="button" aria-label="Cancel">' +
      svg("x", 18) +
      '</button></div><div class="done"><div class="badge">' +
      svg("check", 40) +
      '</div><div class="msg"></div></div></div></div>';

    root = shadow.querySelector(".root");
    fab = root.querySelector(".fab");
    sheet = root.querySelector(".sheet");
    cardsEl = root.querySelector(".cards");
    sendEl = root.querySelector(".send");
    doneEl = root.querySelector(".done");
    arrowEl = root.querySelector(".arrow");
    hintEl = root.querySelector(".hint");

    fab.addEventListener("click", function () {
      if (state.mine.length) openRemote();
      else openSheet();
    });
    bindRemote();
    root.querySelector(".close").addEventListener("click", closeSheet);
    root.querySelector(".cancel").addEventListener("click", cancelSend);
    cardsEl.addEventListener("click", onCardClick);
    sheet.addEventListener("click", function (e) {
      if (mode === "pick" && (e.target === sheet || e.target === cardsEl)) closeSheet();
    });
    bindSwipe();
    if (mq) {
      if (mq.addEventListener) mq.addEventListener("change", render);
      else if (mq.addListener) mq.addListener(render);
    }
    window.addEventListener("resize", render);
  }

  function render() {
    if (!fab) return;
    var landscape = !!(mq && mq.matches);
    var live = state.mine.length > 0;
    var visible = mode === "closed" && !remote.open && (landscape || live);
    fab.classList.toggle("show", visible);
    fab.classList.toggle("hide", !visible);
    fab.classList.toggle("live", live);
    fab.querySelector(".dot").hidden = !live;
    fab.querySelector(".ic").style.display = live ? "none" : "flex";
    fab.querySelector(".label").textContent = live
      ? state.mine.length === 1
        ? "On " + targetName(state.mine[0])
        : "On " + state.mine.length + " screens"
      : "";
    if (mode === "pick") renderCards();
  }

  function targetName(id) {
    for (var i = 0; i < TARGETS.length; i++) if (TARGETS[i].id === id) return TARGETS[i].name;
    return id;
  }

  function renderCards() {
    cardsEl.innerHTML = TARGETS.map(function (t) {
      var mine = state.mine.indexOf(t.id) !== -1;
      var busy = !mine && state.targets[t.id];
      var status = mine
        ? '<span class="state"><span class="dot"></span>Showing ' + APP_NAMES[state.targets[t.id].app] + "</span>"
        : busy
          ? '<span class="state">In use · tap to take over</span>'
          : '<span class="state">Ready</span>';
      return (
        '<button type="button" class="card' +
        (mine ? " mine" : "") +
        '" data-t="' +
        t.id +
        '"><div class="row"><div class="ico">' +
        svg(t.icon, 22) +
        '</div><div><div class="name">' +
        t.name +
        '</div><div class="desc">' +
        t.desc +
        "</div></div></div>" +
        status +
        (mine ? '<span class="off" data-off="' + t.id + '">Take off</span>' : "") +
        "</button>"
      );
    }).join("");
  }

  function openSheet() {
    var rect = fab.getBoundingClientRect();
    sheet.style.setProperty("--ox", rect.left + rect.width / 2 + "px");
    sheet.style.setProperty("--oy", rect.top + rect.height / 2 + "px");
    root.querySelector(".sub").textContent = currentPath();
    mode = "pick";
    renderCards();
    sheet.hidden = false;
    cardsEl.style.display = "";
    root.querySelector(".head").style.display = "";
    sheet.classList.remove("clear");
    sendEl.classList.remove("on");
    doneEl.classList.remove("on", "err");
    render();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        sheet.classList.add("open");
      });
    });
    refresh();
  }

  function closeSheet() {
    sheet.classList.remove("open");
    mode = "closed";
    setTimeout(function () {
      if (mode === "closed") sheet.hidden = true;
      render();
    }, 420);
  }

  function onCardClick(e) {
    var off = e.target.closest && e.target.closest("[data-off]");
    if (off) {
      e.stopPropagation();
      var id = off.getAttribute("data-off");
      api("/stop", { target: id })
        .then(refresh)
        .catch(function () {});
      return;
    }
    var card = e.target.closest && e.target.closest(".card");
    if (!card) return;
    var id2 = card.getAttribute("data-t");
    if (state.mine.indexOf(id2) !== -1) {
      closeSheet();
      setTimeout(function () {
        openRemote(id2);
      }, 200);
      return;
    }
    startSend(id2);
  }

  // --- the page-as-a-card send gesture -----------------------------------

  var BASE_Y = 0.27;
  var BASE_SCALE = 0.56;

  function pageTransform(dy, scale, opacity) {
    var b = document.body;
    b.style.transform = "translateY(" + dy + "px) scale(" + scale + ")";
    if (opacity != null) b.style.opacity = String(opacity);
  }

  function liftPage() {
    var b = document.body;
    var html = document.documentElement;
    saved = {
      bodyStyle: b.getAttribute("style"),
      htmlBg: html.style.background,
      htmlOverflow: html.style.overflow,
    };
    var bg = getComputedStyle(b).backgroundColor;
    if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") bg = getComputedStyle(html).backgroundColor;
    if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") bg = "#07080d";
    var top = window.scrollY || 0;
    var h = window.innerHeight;
    // Insets are measured from the body's own box, which may be shorter than the
    // scrolled document; a negative bottom inset reaches past it.
    var bottom = b.offsetHeight - top - h;
    html.style.background =
      "radial-gradient(ellipse 60% 45% at 50% 0%, rgba(162,123,255,.35), transparent 70%), #05060a";
    html.style.overflow = "hidden";
    b.style.backgroundColor = bg;
    b.style.transformOrigin = "50% " + (top + h / 2) + "px";
    b.style.clipPath = "inset(" + top + "px 0 " + bottom + "px 0 round 28px)";
    b.style.webkitClipPath = b.style.clipPath;
    b.style.boxShadow = "0 30px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(162,123,255,.35)";
    b.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1), opacity .3s ease";
    b.style.willChange = "transform";
    pageTransform(window.innerHeight * BASE_Y, BASE_SCALE);
  }

  function restorePage(animate) {
    var b = document.body;
    var html = document.documentElement;
    if (!saved) return;
    var s = saved;
    saved = null;
    var finish = function () {
      if (s.bodyStyle == null) b.removeAttribute("style");
      else b.setAttribute("style", s.bodyStyle);
      html.style.background = s.htmlBg;
      html.style.overflow = s.htmlOverflow;
    };
    if (!animate) return finish();
    b.style.transition = "none";
    pageTransform(0, 0.94, 0);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        b.style.transition = "transform .42s cubic-bezier(.2,.8,.2,1), opacity .3s ease";
        pageTransform(0, 1, 1);
        b.style.clipPath = "";
        b.style.webkitClipPath = "";
        b.style.boxShadow = "";
        setTimeout(finish, 450);
      });
    });
  }

  function startSend(target) {
    picked = target;
    mode = "send";
    cardsEl.style.display = "none";
    root.querySelector(".head").style.display = "none";
    sheet.classList.add("clear");
    hintEl.innerHTML = "Swipe up to send to " + targetName(target) + "<small>" + APP_NAMES[APP] + " · " + escapeHtml(currentPath()) + "</small>";
    sendEl.classList.add("on");
    arrowEl.style.setProperty("--grow", "1");
    hintEl.style.opacity = "1";
    liftPage();
  }

  function cancelSend() {
    sendEl.classList.remove("on");
    restorePage(false);
    closeSheet();
  }

  function bindSwipe() {
    var startY = null;
    var lastY = 0;
    var lastT = 0;
    var vel = 0;
    var baseY = 0;

    sendEl.addEventListener(
      "touchstart",
      function (e) {
        if (mode !== "send" || (e.target.closest && e.target.closest(".cancel"))) return;
        startY = e.touches[0].clientY;
        lastY = startY;
        lastT = Date.now();
        vel = 0;
        baseY = window.innerHeight * BASE_Y;
        document.body.style.transition = "none";
      },
      { passive: true }
    );
    sendEl.addEventListener(
      "touchmove",
      function (e) {
        if (startY == null) return;
        e.preventDefault();
        var y = e.touches[0].clientY;
        var now = Date.now();
        vel = (y - lastY) / Math.max(1, now - lastT);
        lastY = y;
        lastT = now;
        var dy = y - startY;
        if (dy > 0) dy = dy * 0.25;
        var progress = Math.min(1, Math.max(0, -dy / (window.innerHeight * 0.35)));
        pageTransform(baseY + dy, BASE_SCALE - progress * 0.08);
        arrowEl.style.setProperty("--grow", String(1 + progress * 0.25));
        hintEl.style.opacity = String(Math.max(0, 1 - progress * 2.5));
      },
      { passive: false }
    );
    var end = function () {
      if (startY == null) return;
      var dy = lastY - startY;
      startY = null;
      var b = document.body;
      b.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1), opacity .3s ease";
      if (dy < -window.innerHeight * 0.22 || (vel < -0.6 && dy < -30)) {
        fire();
      } else {
        pageTransform(window.innerHeight * BASE_Y, BASE_SCALE);
        arrowEl.style.setProperty("--grow", "1");
        hintEl.style.opacity = "1";
      }
    };
    sendEl.addEventListener("touchend", end);
    sendEl.addEventListener("touchcancel", end);

    // Mouse / pen fallback for testing on a desktop.
    sendEl.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch" || mode !== "send") return;
      if (e.target.closest && e.target.closest(".cancel")) return;
      startY = e.clientY;
      lastY = startY;
      lastT = Date.now();
      baseY = window.innerHeight * BASE_Y;
      document.body.style.transition = "none";
      var move = function (ev) {
        var now = Date.now();
        vel = (ev.clientY - lastY) / Math.max(1, now - lastT);
        lastY = ev.clientY;
        lastT = now;
        var dy = ev.clientY - startY;
        if (dy > 0) dy = dy * 0.25;
        pageTransform(baseY + dy, BASE_SCALE);
      };
      var up = function () {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        end();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  function fire() {
    mode = "busy";
    var target = picked;
    var b = document.body;
    b.style.transition = "transform .42s cubic-bezier(.55,0,.75,.2), opacity .42s ease-in";
    pageTransform(-window.innerHeight * 1.25, 0.42, 0);
    sendEl.classList.remove("on");
    if (navigator.vibrate) navigator.vibrate(12);

    var request = api("/send", { target: target, app: APP, path: currentPath() });
    var sent = false;
    setTimeout(function () {
      request
        .then(function () {
          sent = true;
          lastSent = APP + " " + currentPath();
          showDone(true, "On " + targetName(target), "Your phone is the remote now");
          return refresh();
        })
        .catch(function () {
          showDone(false, "Couldn't reach the homelab", "Check that you're on Tailscale");
        })
        .then(function () {
          setTimeout(function () {
            doneEl.classList.remove("on", "err");
            restorePage(true);
            closeSheet();
            if (sent) setTimeout(function () { openRemote(target); }, 250);
          }, 1000);
        });
    }, 380);
  }

  function showDone(ok, title, sub) {
    doneEl.classList.toggle("err", !ok);
    doneEl.querySelector(".badge").innerHTML = svg(ok ? "check" : "x", 40);
    doneEl.querySelector(".msg").innerHTML = escapeHtml(title) + "<small>" + escapeHtml(sub) + "</small>";
    doneEl.classList.add("on");
  }

  // --- remote -------------------------------------------------------------

  var remote = { open: false, target: null, tab: null, wantTab: null };
  var remoteEl = null;
  var reports = {};
  var seenEvents = {};
  var stream = null;
  var ctrlCmds = [];
  var actionCtx = null;
  var pageItems = [];

  function castApp() {
    var ca = window.castApp;
    return ca && typeof ca === "object" ? ca : {};
  }

  function pagesList() {
    var ca = castApp();
    try {
      return typeof ca.pages === "function" ? ca.pages() || [] : [];
    } catch (e) {
      return [];
    }
  }

  function appControls() {
    var ca = castApp();
    var rep = reports[remote.target];
    if (typeof ca.controls !== "function") return null;
    try {
      var list = ca.controls(rep ? rep.app : null, currentPath());
      return list && list.length ? list : null;
    } catch (e) {
      return null;
    }
  }

  // Commands go out one request at a time; queued scroll deltas merge, so a
  // slow link batches movement instead of falling behind.
  var cmdQueue = [];
  var cmdBusy = false;
  function command(cmd, target) {
    var t = target || remote.target;
    if (!t) return;
    cmdQueue.push({ target: t, cmd: cmd });
    pumpCommands();
  }
  function pumpCommands() {
    if (cmdBusy || !cmdQueue.length) return;
    var next = cmdQueue.shift();
    if (next.cmd.type === "scroll") {
      var dy = next.cmd.dy;
      while (cmdQueue.length && cmdQueue[0].cmd.type === "scroll" && cmdQueue[0].target === next.target) {
        dy += cmdQueue.shift().cmd.dy;
      }
      next = { target: next.target, cmd: { type: "scroll", dy: Math.round(dy * 10000) / 10000 } };
    }
    cmdBusy = true;
    api("/command", next)
      .catch(function () {})
      .then(function () {
        cmdBusy = false;
        pumpCommands();
      });
  }

  var refreshTimer = null;
  function connectStream() {
    if (!state.mine.length) {
      if (stream) stream.close();
      stream = null;
      return;
    }
    if (stream || typeof EventSource === "undefined") return;
    stream = new EventSource(API + "/events");
    stream.onmessage = function () {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 250);
    };
    stream.addEventListener("report", function (e) {
      var d;
      try {
        d = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      if (!d || state.mine.indexOf(d.target) === -1) return;
      reports[d.target] = d.report;
      var ev = d.report && d.report.event;
      if (ev && ev.eid && seenEvents[d.target] !== ev.eid) {
        seenEvents[d.target] = ev.eid;
        if (remote.open && remote.target === d.target) handleScreenEvent(ev);
      }
      if (remote.open && remote.target === d.target) updateLive();
    });
  }

  // Layer 1: anything saved on the phone refreshes the screens showing this app.
  var changedTimer = null;
  function screensChanged() {
    clearTimeout(changedTimer);
    changedTimer = setTimeout(function () {
      state.mine.forEach(function (t) {
        if (state.targets[t] && state.targets[t].app === APP) command({ type: "refresh" }, t);
      });
    }, 450);
  }
  function watchWrites() {
    var isWrite = function (method, url) {
      if (/^(GET|HEAD)$/i.test(method || "GET")) return false;
      try {
        var u = new URL(url, location.href);
        return u.origin === location.origin && u.pathname.indexOf("/__cast/") !== 0;
      } catch (e) {
        return false;
      }
    };
    if (window.fetch) {
      var origFetch = window.fetch;
      window.fetch = function (input, init) {
        var p = origFetch.apply(this, arguments);
        try {
          var method = (init && init.method) || (input && typeof input === "object" && input.method) || "GET";
          var url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
          if (state.mine.length && isWrite(method, url)) {
            p.then(function (r) {
              if (r && r.ok) screensChanged();
            }, function () {});
          }
        } catch (e) {}
        return p;
      };
    }
    var xo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (isWrite(method, url)) {
        this.addEventListener("load", function () {
          if (state.mine.length && this.status >= 200 && this.status < 300) screensChanged();
        });
      }
      return xo.apply(this, arguments);
    };
  }

  function navigateTo(path) {
    if (!path || path === currentPath()) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
  }

  function remoteHtml() {
    var dk = function (d, icon) {
      return '<button type="button" class="dk" data-d="' + d + '" aria-label="' + d + '">' + svg(icon, 30) + "</button>";
    };
    return (
      '<div class="remote" hidden>' +
      '<div class="rhead"><button type="button" class="rtarget"><span class="dot"></span><span class="rt-name"></span><small class="rt-app"></small></button>' +
      '<div class="rtabs"></div><div class="spacer"></div>' +
      '<button type="button" class="rbtn" data-r="phone">' + svg("phone", 15) + "Use phone</button>" +
      '<button type="button" class="rbtn" data-r="screens" aria-label="Screens">' + svg("cast", 15) + "</button>" +
      '<button type="button" class="rbtn danger" data-r="off">Take off</button></div>' +
      '<div class="rbody">' +
      '<section class="pane pages" data-pane="pages"><input class="rsearch" type="search" placeholder="Search" autocomplete="off" /><div class="plist"></div></section>' +
      '<section class="pane" data-pane="scroll"><div class="pad"><div class="pad-hint">' + svg("chevron", 22) +
      "Drag to scroll<br/>flick to glide" + svg("down", 22) + "</div></div>" +
      '<div class="side"><button type="button" class="big" data-s="top">' + svg("chevron", 16) + 'Top</button><div class="meter"><span></span></div>' +
      '<button type="button" class="big" data-s="bottom">' + svg("down", 16) + "Bottom</button></div></section>" +
      '<section class="pane" data-pane="select"><div class="dpad">' + dk("up", "chevron") + dk("left", "left") + dk("right", "right") + dk("down", "down") +
      '<button type="button" class="dk ok" data-d="ok">OK</button></div>' +
      '<div class="selside"><div class="focus"><div class="eyebrow">Highlighted on screen</div><b class="f-label">—</b><small class="f-hint"></small></div>' +
      '<button type="button" class="big" data-k="back">' + svg("back", 16) + "Back</button></div></section>" +
      '<section class="pane" data-pane="app"><div class="ctrls"></div></section>' +
      "</div>" +
      '<div class="asheet"><div class="ahead"><div><div class="atitle"></div><div class="asub"></div></div>' +
      '<button type="button" class="close" data-a="close" aria-label="Close">' + svg("x", 18) + "</button></div>" +
      '<div class="opts"></div><div class="afoot"><button type="button" class="rbtn" data-a="show">Show details on screen</button></div></div>' +
      '<div class="toast"></div></div>'
    );
  }

  function bindRemote() {
    remoteEl = root.querySelector(".remote");
    remoteEl.querySelector(".rtarget").addEventListener("click", function () {
      if (state.mine.length < 2) return;
      var i = state.mine.indexOf(remote.target);
      switchTarget(state.mine[(i + 1) % state.mine.length]);
    });
    remoteEl.querySelector(".rtabs").addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-tab]");
      if (!b) return;
      remote.wantTab = null;
      setTab(b.getAttribute("data-tab"));
    });
    remoteEl.querySelector("[data-r=phone]").addEventListener("click", closeRemote);
    remoteEl.querySelector("[data-r=screens]").addEventListener("click", function () {
      closeRemote();
      setTimeout(openSheet, 200);
    });
    remoteEl.querySelector("[data-r=off]").addEventListener("click", function () {
      var t = remote.target;
      api("/stop", { target: t })
        .then(refresh)
        .catch(function () {
          toast("Couldn't reach the homelab");
        });
    });
    // pages
    var search = remoteEl.querySelector(".rsearch");
    search.addEventListener("input", renderPages);
    remoteEl.querySelector(".plist").addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-pi]");
      if (!b) return;
      var item = pageItems[+b.getAttribute("data-pi")];
      if (!item) return;
      navigateTo(item.path);
      renderPages();
      remote.wantTab = item.tab === "app" ? "app" : null;
      setTimeout(function () {
        setTab(item.tab === "app" && appControls() ? "app" : "scroll");
      }, 150);
    });
    // scroll
    bindPad(remoteEl.querySelector(".pad"));
    remoteEl.querySelectorAll("[data-s]").forEach(function (b) {
      b.addEventListener("click", function () {
        command({ type: "scrollTo", to: b.getAttribute("data-s") });
      });
    });
    // select
    remoteEl.querySelectorAll(".dk").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = b.getAttribute("data-d");
        command(d === "ok" ? { type: "ok" } : { type: "move", dir: d });
      });
    });
    remoteEl.querySelector("[data-k=back]").addEventListener("click", function () {
      command({ type: "back" });
    });
    // app controls
    remoteEl.querySelector(".ctrls").addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-ci]");
      if (!b || b.disabled) return;
      var cmd = ctrlCmds[+b.getAttribute("data-ci")];
      if (cmd) command(cmd);
    });
    // action sheet
    remoteEl.querySelector("[data-a=close]").addEventListener("click", closeAction);
    remoteEl.querySelector("[data-a=show]").addEventListener("click", function () {
      command({ type: "click" });
      closeAction();
    });
    remoteEl.querySelector(".opts").addEventListener("click", onOptionClick);
  }

  function bindPad(pad) {
    var GAIN = 1.15;
    var lastY = 0;
    var lastT = 0;
    var vel = 0;
    var off = 0;
    var active = null;
    pad.addEventListener("pointerdown", function (e) {
      active = e.pointerId;
      try {
        pad.setPointerCapture(e.pointerId);
      } catch (err) {}
      lastY = e.clientY;
      lastT = e.timeStamp;
      vel = 0;
      pad.classList.add("drag");
      command({ type: "scroll", dy: 0 });
    });
    pad.addEventListener("pointermove", function (e) {
      if (active !== e.pointerId) return;
      var dy = e.clientY - lastY;
      var dt = Math.max(1, e.timeStamp - lastT);
      vel = vel * 0.6 + (dy / dt) * 0.4;
      lastY = e.clientY;
      lastT = e.timeStamp;
      off += dy;
      pad.style.setProperty("--off", off + "px");
      if (dy) command({ type: "scroll", dy: (-dy / pad.clientHeight) * GAIN });
    });
    var end = function (e) {
      if (active !== e.pointerId) return;
      active = null;
      pad.classList.remove("drag");
      if (e.timeStamp - lastT > 90) vel = 0;
      if (Math.abs(vel) > 0.35) command({ type: "fling", v: ((-vel * 1000) / pad.clientHeight) * GAIN });
    };
    pad.addEventListener("pointerup", end);
    pad.addEventListener("pointercancel", end);
  }

  function availableTabs() {
    var tabs = [];
    if (pagesList().length > 1) tabs.push(["pages", "Pages"]);
    if (appControls()) tabs.push(["app", castApp().controlsLabel || "Controls"]);
    tabs.push(["scroll", "Scroll"], ["select", "Select"]);
    return tabs;
  }

  function setTab(tab) {
    var prev = remote.tab;
    if (prev === tab) return;
    remote.tab = tab;
    if (prev === "select") command({ type: "select", on: false });
    if (tab === "select") command({ type: "select", on: true });
    if (tab === "pages") renderPages();
    renderRemote();
  }

  function switchTarget(t) {
    if (remote.tab === "select") command({ type: "select", on: false });
    remote.target = t;
    if (remote.tab === "select") command({ type: "select", on: true });
    command({ type: "hello" });
    renderRemote();
  }

  function openRemote(target) {
    if (!state.mine.length) return openSheet();
    var pick = target || remote.target;
    remote.target = state.mine.indexOf(pick) !== -1 ? pick : state.mine[0];
    var rect = fab.getBoundingClientRect();
    remoteEl.style.setProperty("--ox", rect.left + rect.width / 2 + "px");
    remoteEl.style.setProperty("--oy", rect.top + rect.height / 2 + "px");
    remote.open = true;
    remote.tab = null;
    remoteEl.hidden = false;
    remoteEl.querySelector(".rsearch").value = "";
    setTab(appControls() ? "app" : "scroll");
    command({ type: "hello" });
    render();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        remoteEl.classList.add("open");
      });
    });
  }

  function closeRemote() {
    if (!remote.open) return;
    if (remote.tab === "select") command({ type: "select", on: false });
    remote.open = false;
    remote.tab = null;
    closeAction();
    remoteEl.classList.remove("open");
    setTimeout(function () {
      if (!remote.open) remoteEl.hidden = true;
    }, 480);
    render();
  }

  function renderRemote() {
    if (!remoteEl || !remote.open) return;
    if (state.mine.indexOf(remote.target) === -1) remote.target = state.mine[0];
    var session = state.targets[remote.target];
    remoteEl.querySelector(".rt-name").textContent = "On " + targetName(remote.target) + (state.mine.length > 1 ? " ⇄" : "");
    remoteEl.querySelector(".rt-app").textContent = session ? APP_NAMES[session.app] || session.app : "";
    var tabs = availableTabs();
    var ids = tabs.map(function (t) {
      return t[0];
    });
    if (remote.wantTab && ids.indexOf(remote.wantTab) !== -1 && remote.tab !== remote.wantTab) {
      var want = remote.wantTab;
      remote.wantTab = null;
      return setTab(want);
    }
    if (ids.indexOf(remote.tab) === -1) return setTab(ids.indexOf("scroll") !== -1 ? "scroll" : ids[0]);
    remoteEl.querySelector(".rtabs").innerHTML = tabs
      .map(function (t) {
        return '<button type="button" class="rtab' + (t[0] === remote.tab ? " on" : "") + '" data-tab="' + t[0] + '">' + escapeHtml(t[1]) + "</button>";
      })
      .join("");
    remoteEl.querySelectorAll("[data-pane]").forEach(function (p) {
      p.hidden = p.getAttribute("data-pane") !== remote.tab;
    });
    updateLive();
  }

  function renderPages() {
    var q = remoteEl.querySelector(".rsearch").value.trim().toLowerCase();
    var all = pagesList();
    remoteEl.querySelector(".rsearch").hidden = all.length < 9;
    var here = currentPath();
    pageItems = all.filter(function (p) {
      return !q || (p.label + " " + (p.sub || "")).toLowerCase().indexOf(q) !== -1;
    });
    remoteEl.querySelector(".plist").innerHTML = pageItems
      .map(function (p, i) {
        return (
          '<button type="button" class="pitem' + (p.path === here ? " on" : "") + '" data-pi="' + i + '">' +
          escapeHtml(p.label) + (p.sub ? "<small>" + escapeHtml(p.sub) + "</small>" : "") + "</button>"
        );
      })
      .join("");
  }

  function updateLive() {
    if (!remote.open) return;
    var rep = reports[remote.target] || {};
    // tabs can appear/disappear as the screen's app state changes
    var want = availableTabs()
      .map(function (t) {
        return t[0];
      })
      .join(",");
    var have = Array.prototype.map
      .call(remoteEl.querySelectorAll(".rtab"), function (b) {
        return b.getAttribute("data-tab");
      })
      .join(",");
    if (want !== have) return renderRemote();

    var sc = rep.scroll || { top: 0, max: 0 };
    var p = sc.max > 0 ? Math.min(1, sc.top / sc.max) : 0;
    remoteEl.querySelector(".meter").style.setProperty("--p", String(p));

    var f = rep.focus;
    remoteEl.querySelector(".f-label").textContent = f ? f.label : rep.select ? "Nothing to pick here" : "—";
    remoteEl.querySelector(".f-hint").textContent = !f
      ? "Use the arrows to move around the screen"
      : f.kind === "action"
        ? "OK opens choices on your phone"
        : f.kind === "link"
          ? "OK opens this page"
          : f.kind === "input"
            ? "Typing happens on your phone"
            : "OK presses it on the screen";

    if (remote.tab === "app") renderControls();
  }

  function renderControls() {
    var list = appControls() || [];
    ctrlCmds = [];
    var ref = function (cmd) {
      ctrlCmds.push(cmd);
      return ctrlCmds.length - 1;
    };
    var hasPager = list.some(function (c) {
      return c.kind === "pager";
    });
    var box = remoteEl.querySelector(".ctrls");
    box.classList.toggle("has-pager", hasPager);
    box.innerHTML = list.length
      ? list
          .map(function (c) {
            if (c.kind === "toggle") {
              return (
                '<button type="button" class="c-row' + (c.on ? " on" : "") + '" data-ci="' + ref(c.cmd) + '"><span>' +
                escapeHtml(c.label) + (c.hint ? "<small>" + escapeHtml(c.hint) + "</small>" : "") + '</span><span class="sw"></span></button>'
              );
            }
            if (c.kind === "stepper") {
              return (
                '<div class="c-row"><span>' + escapeHtml(c.label) + '</span><span class="step">' +
                '<button type="button" class="sbtn" data-ci="' + ref(c.dec) + '"' + (c.canDec === false ? " disabled" : "") + ">−</button><b>" +
                escapeHtml(c.value || "") + '</b><button type="button" class="sbtn" data-ci="' + ref(c.inc) + '"' + (c.canInc === false ? " disabled" : "") + ">+</button></span></div>"
              );
            }
            if (c.kind === "pager") {
              return (
                '<div class="c-pager"><div class="pgl"><span>' + escapeHtml(c.label || "") + "</span><small>" + escapeHtml(c.value || "") + "</small></div>" +
                '<div class="pgs"><button type="button" class="pg" data-ci="' + ref(c.prev) + '"' + (c.canPrev === false ? " disabled" : "") + ">" + svg("left", 28) + "Back</button>" +
                '<button type="button" class="pg next" data-ci="' + ref(c.next) + '"' + (c.canNext === false ? " disabled" : "") + ">" + svg("right", 28) + "Next</button></div></div>"
              );
            }
            return "";
          })
          .join("")
      : '<div class="empty">Nothing to control on this page yet.</div>';
  }

  function handleScreenEvent(ev) {
    if (ev.type === "action") return openAction(ev);
    if (ev.type === "navigate") return navigateTo(ev.path);
    if (ev.type === "back") return history.length > 1 ? history.back() : undefined;
    if (ev.type === "input") return toast("Typing happens on your phone. Tap Use phone.");
    if (ev.type === "external") return toast("That link leaves the homelab, so it stays off the screen.");
  }

  function openAction(ev) {
    var def = (castApp().actions || {})[ev.action];
    if (!def || typeof def.load !== "function") return toast("Do this one on your phone. Tap Use phone.");
    var ctx = { ev: ev, def: def, options: [] };
    actionCtx = ctx;
    var sheetEl = remoteEl.querySelector(".asheet");
    sheetEl.querySelector(".atitle").textContent = ev.label || "Selected item";
    sheetEl.querySelector(".asub").textContent = "Loading…";
    sheetEl.querySelector(".opts").innerHTML = "";
    sheetEl.classList.add("open");
    Promise.resolve()
      .then(function () {
        return def.load(ev.id);
      })
      .then(function (info) {
        if (actionCtx !== ctx) return;
        sheetEl.querySelector(".atitle").textContent = info.title || ev.label || "Selected item";
        sheetEl.querySelector(".asub").textContent = info.subtitle || "";
        sheetEl.querySelector(".opts").innerHTML = (info.groups || [])
          .map(function (g) {
            return (
              '<div class="ogroup">' + (g.label ? '<div class="eyebrow">' + escapeHtml(g.label) + "</div>" : "") + '<div class="ochips">' +
              (g.options || [])
                .map(function (o) {
                  ctx.options.push(o);
                  return (
                    '<button type="button" class="ochip' + (o.selected ? " on" : "") + '" data-oi="' + (ctx.options.length - 1) + '"' +
                    (o.color ? ' style="--c:' + escapeHtml(o.color) + '"' : "") + "><i></i>" + escapeHtml(o.label) + "</button>"
                  );
                })
                .join("") +
              "</div></div>"
            );
          })
          .join("");
      })
      .catch(function () {
        if (actionCtx === ctx) sheetEl.querySelector(".asub").textContent = "Couldn't load this item.";
      });
  }

  function onOptionClick(e) {
    var b = e.target.closest && e.target.closest("[data-oi]");
    var ctx = actionCtx;
    if (!b || !ctx) return;
    var opt = ctx.options[+b.getAttribute("data-oi")];
    if (!opt) return;
    b.classList.add("on");
    Promise.resolve()
      .then(function () {
        return ctx.def.run(ctx.ev.id, opt.id);
      })
      .then(function () {
        toast("Saved · " + opt.label);
        closeAction();
      })
      .catch(function () {
        b.classList.remove("on");
        toast("Couldn't save that");
      });
  }

  function closeAction() {
    actionCtx = null;
    if (remoteEl) remoteEl.querySelector(".asheet").classList.remove("open");
  }

  var toastTimer = null;
  function toast(msg) {
    var el = remoteEl && remoteEl.querySelector(".toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("on");
    }, 2600);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function init() {
    build();
    watchWrites();
    render();
    refresh().then(function () {
      if (state.mine.length) followSoon();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
