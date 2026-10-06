/* ============================================================================
   SynAmp Spectrum — shared behaviour
   Reveal-on-scroll · sticky glass header · mobile nav · tabs · accordion ·
   copy · toasts · dialogs · forms · help-centre search.
   No framework. Progressive: everything degrades without JS.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* --- Sticky header: transparent until scroll, then frosted glass -------- */
  function initHeader() {
    var header = $(".site-header");
    if (!header) return;
    var solid = header.hasAttribute("data-solid");
    var onScroll = function () {
      header.classList.toggle("is-scrolled", solid || window.scrollY > 12);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    var toggle = $(".nav__toggle", header);
    var links = $(".nav__links", header);
    if (toggle && links) {
      toggle.addEventListener("click", function () {
        var open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", String(!open));
        links.classList.toggle("is-open", !open);
      });
      links.addEventListener("click", function (e) {
        if (e.target.closest("a")) {
          toggle.setAttribute("aria-expanded", "false");
          links.classList.remove("is-open");
        }
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          toggle.setAttribute("aria-expanded", "false");
          links.classList.remove("is-open");
        }
      });
    }
  }

  /* --- Reveal on scroll --------------------------------------------------- */
  function initReveal() {
    var items = $$(".reveal");
    if (!items.length) return;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* --- Tabs --------------------------------------------------------------- */
  function initTabs() {
    $$("[data-tabs]").forEach(function (group) {
      var tabs = $$('[role="tab"]', group);
      var panels = $$('[role="tabpanel"]', group);
      function select(i) {
        tabs.forEach(function (t, n) {
          t.setAttribute("aria-selected", String(n === i));
          t.tabIndex = n === i ? 0 : -1;
        });
        panels.forEach(function (p, n) { p.hidden = n !== i; });
        window.dispatchEvent(new Event("resize"));
      }
      tabs.forEach(function (t, i) {
        t.addEventListener("click", function () { select(i); });
        t.addEventListener("keydown", function (e) {
          var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          var n = (i + d + tabs.length) % tabs.length;
          tabs[n].focus(); select(n);
        });
      });
      select(Math.max(0, tabs.findIndex(function (t) { return t.getAttribute("aria-selected") === "true"; })));
    });
  }

  /* --- Copy-to-clipboard -------------------------------------------------- */
  function initCopy() {
    $$("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy");
        var done = function () { toast("Copied", text, "success"); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, done);
        } else { done(); }
      });
    });
  }

  /* --- Toasts ------------------------------------------------------------- */
  function toast(title, body, tone) {
    var stack = $(".toast-stack");
    if (!stack) { stack = document.createElement("div"); stack.className = "toast-stack"; stack.setAttribute("aria-live", "polite"); document.body.appendChild(stack); }
    var el = document.createElement("div");
    el.className = "toast";
    if (tone) el.setAttribute("data-tone", tone);
    var icon = tone === "error" ? "alert" : tone === "success" ? "check" : "info";
    el.innerHTML =
      '<span class="toast__icon">' + svgIcon(icon) + "</span>" +
      '<div><strong></strong><p></p></div>' +
      '<button class="toast__close" aria-label="Dismiss">' + svgIcon("x") + "</button>";
    $("strong", el).textContent = title || "";
    $("p", el).textContent = body || "";
    $(".toast__close", el).addEventListener("click", function () { el.remove(); });
    stack.appendChild(el);
    setTimeout(function () { el.style.opacity = "0"; el.style.transform = "translateY(8px)"; setTimeout(function () { el.remove(); }, 260); }, 4600);
  }
  window.synampToast = toast;

  /* --- Dialog helpers ----------------------------------------------------- */
  function initDialogs() {
    $$("[data-open-dialog]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        // Links still work without JavaScript (they go to a page with the same form).
        var d = document.getElementById(btn.getAttribute("data-open-dialog"));
        if (d && d.showModal) { e.preventDefault(); d.showModal(); }
      });
    });
    $$("dialog.modal").forEach(function (d) {
      $$("[data-close]", d).forEach(function (b) { b.addEventListener("click", function () { d.close(); }); });
      d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    });
  }

  /* --- Forms: check the fields, then send ---------------------------------
     Every form has a real action and method, so it works without JavaScript
     too (the server answers with a "thanks" page). With JavaScript, it is sent
     in the background and the answer appears in place. */
  function initForms() {
    $$("form[data-validate]").forEach(function (form) {
      var status = $("[data-form-status]", form);
      var openedAt = Date.now();
      function say(text, tone) {
        if (!status) { toast(tone === "error" ? "Not sent" : "Sent", text, tone); return; }
        status.hidden = false; status.setAttribute("data-tone", tone); status.textContent = text;
      }
      form.addEventListener("submit", function (e) {
        var ok = true;
        $$("[required]", form).forEach(function (field) {
          var wrap = field.closest(".field") || field.closest(".check");
          var err = wrap ? $(".error", wrap) : null;
          var valid = field.checkValidity() && !(field.type === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(field.value));
          field.setAttribute("aria-invalid", String(!valid));
          if (err) err.hidden = valid;
          if (!valid && ok) { field.focus(); ok = false; }
        });
        if (!ok) {
          e.preventDefault();
          say("Please fix the highlighted fields and try again.", "error");
          return;
        }
        if (!form.hasAttribute("data-ajax") || !window.fetch) return; // let the browser send it the ordinary way
        e.preventDefault();
        var buttons = $$("[type='submit']", form).concat(form.id ? $$("[type='submit'][form='" + form.id + "']") : []);
        var labels = buttons.map(function (b) { return b.textContent; });
        buttons.forEach(function (b) { b.disabled = true; b.textContent = "Sending\u2026"; });
        var data = new FormData(form);
        data.append("elapsed_ms", String(Date.now() - openedAt));
        fetch(form.action, { method: "POST", body: new URLSearchParams(data), headers: { Accept: "application/json" } })
          .then(function (res) { return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; }); })
          .then(function (r) {
            if (!r.ok) throw new Error(r.body.error || "Something went wrong on our side.");
            form.reset();
            say(r.body.message || "Thank you — that's on its way.", "success");
          })
          .catch(function (err) {
            say((err && err.message ? err.message : "That didn't send.") + " Please try again in a minute.", "error");
          })
          .then(function () { buttons.forEach(function (b, i) { b.disabled = false; b.textContent = labels[i]; }); });
      });
      // Tie each error message to its field, so screen readers read it out.
      $$("[required]", form).forEach(function (field, i) {
        var wrap = field.closest(".field") || field.closest(".check");
        var err = wrap && $(".error", wrap);
        if (err && field.id && !field.getAttribute("aria-describedby")) {
          if (!err.id) err.id = field.id + "-error";
          field.setAttribute("aria-describedby", err.id);
        }
      });
      $$("[required]", form).forEach(function (field) {
        field.addEventListener("input", function () {
          if (field.getAttribute("aria-invalid") === "true" && field.checkValidity()) {
            field.setAttribute("aria-invalid", "false");
            var wrap = field.closest(".field"); var err = wrap && $(".error", wrap);
            if (err) err.hidden = true;
          }
        });
      });
    });
  }

  /* --- Knowledge-base search / filter ------------------------------------ */
  function initKnowledge() {
    var input = $("[data-kb-search]");
    var list = $("[data-kb-list]");
    if (!input || !list) return;
    var items = $$("[data-kb-item]", list);
    var empty = $("[data-kb-empty]");
    var count = $("[data-kb-count]");
    var chips = $$("[data-kb-filter]");
    var activeTag = "all";

    function apply() {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      items.forEach(function (item) {
        var text = item.textContent.toLowerCase() + " " + (item.dataset.keywords || "").toLowerCase();
        var tags = (item.dataset.tags || "").split(",");
        var match = (!q || text.indexOf(q) > -1) && (activeTag === "all" || tags.indexOf(activeTag) > -1);
        item.hidden = !match;
        if (match) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
      if (count) count.textContent = shown + (shown === 1 ? " guide" : " guides");
    }
    input.addEventListener("input", apply);
    chips.forEach(function (c) {
      c.addEventListener("click", function () {
        activeTag = c.getAttribute("data-kb-filter");
        chips.forEach(function (o) { o.setAttribute("aria-pressed", String(o === c)); });
        apply();
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== input && !/input|textarea/i.test((document.activeElement || {}).tagName || "")) {
        e.preventDefault(); input.focus();
      }
    });
  }

  /* --- Links to a guide open it -------------------------------------------- */
  function initHashDetails() {
    function openTarget() {
      var id = decodeURIComponent(location.hash.slice(1));
      var el = id && document.getElementById(id);
      if (el && el.tagName === "DETAILS") { el.open = true; }
    }
    window.addEventListener("hashchange", openTarget);
    openTarget();
  }

  /* --- Range fill styling ------------------------------------------------- */
  function initRanges() {
    $$(".range").forEach(function (r) {
      var update = function () {
        var p = ((r.value - r.min) / (r.max - r.min)) * 100;
        r.style.setProperty("--range-p", p + "%");
      };
      r.addEventListener("input", update); update();
    });
  }

  /* --- Icons -------------------------------------------------------------- */
  function svgIcon(name) {
    var paths = {
      check: '<path d="M20 6 9 17l-5-5"/>',
      x: '<path d="M18 6 6 18M6 6l12 12"/>',
      alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.info) + "</svg>";
  }

  /* --- Pointer tilt ------------------------------------------------------- */
  function initTilt() {
    var els = $$("[data-tilt]");
    if (!els.length || reduceMotion || window.matchMedia("(hover: none)").matches) return;
    els.forEach(function (el) {
      var host = el.closest("[data-tilt-host]") || el.parentElement;
      if (!host) return;
      var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
      function tick() {
        raf = 0;
        cx += (tx - cx) * 0.1; cy += (ty - cy) * 0.1;
        el.style.setProperty("--py", (cx * 6).toFixed(2) + "deg");
        el.style.setProperty("--px", (-cy * 4.5).toFixed(2) + "deg");
        if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) raf = requestAnimationFrame(tick);
      }
      function move(e) {
        var r = host.getBoundingClientRect();
        tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
        ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
        if (!raf) raf = requestAnimationFrame(tick);
      }
      host.addEventListener("mousemove", move, { passive: true });
      host.addEventListener("mouseleave", function () { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(tick); });
    });
  }

  /* --- Year stamp --------------------------------------------------------- */
  function initYear() { $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); }); }

  document.addEventListener("DOMContentLoaded", function () {
    initHeader(); initReveal(); initTabs(); initCopy(); initDialogs(); initForms(); initKnowledge(); initHashDetails(); initRanges(); initTilt(); initYear();
  });
})();
