/* Talks to the Mac app the page lives in. Opened in an ordinary browser (for
   working on the design), there is no app: actions are logged and
   SYNAMP_STATE comes from ?state=<json> or the page's own example. */
(function () {
  const app = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.synamp;
  const handlers = {};
  let state = window.SYNAMP_STATE;
  if (!state) {
    try { state = JSON.parse(new URLSearchParams(location.search).get("state") || "null"); } catch { state = null; }
  }
  window.SynAmp = {
    inApp: Boolean(app),
    state: state || {},
    send(action, data) {
      const message = Object.assign({ action }, data || {});
      if (app) app.postMessage(message); else console.log("to the app:", JSON.stringify(message));
    },
    on(type, handler) { handlers[type] = handler; },
  };
  // The app answers by calling this.
  window.SynAmpPanel = { receive(message) { const handler = handlers[message.type]; if (handler) handler(message); } };

  // The window is as tall as the page: tell the app whenever that changes.
  const report = () => window.SynAmp.send("resize", { height: Math.ceil(document.documentElement.getBoundingClientRect().height) });
  window.addEventListener("load", () => {
    report();
    new ResizeObserver(report).observe(document.documentElement);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(report);
  });
})();
