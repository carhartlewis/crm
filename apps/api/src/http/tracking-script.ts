import { TRACKING_COLLECT_PATH, TRACKING_IDENTIFY_PATH } from "@crm/core/tracking";

/**
 * The website snippet (`<script async src=".../api/t/script.js" data-key="trk_…">`). It keeps an
 * anonymous visitor id in localStorage and sends each page view (path, referrer, UTM tags) on
 * load and on every history change. Calls are CORS-simple (text/plain, no credentials needed),
 * so they need no preflight. `window.crm.identify(email)` links the browser's visits to the
 * contact with that email; `window.crm.company(domain)` names the visitor's company.
 */
export const TRACKING_SCRIPT = `(function () {
  var script = document.currentScript;
  if (!script || !script.dataset.key || window.crm && window.crm.__loaded) return;
  var key = script.dataset.key;
  var origin = new URL(script.src).origin;
  var visitor;
  try {
    visitor = localStorage.getItem("crm_vid");
    if (!visitor || !/^[0-9A-Za-z_-]{8,64}$/.test(visitor)) {
      visitor = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^0-9A-Za-z_-]/g, "");
      localStorage.setItem("crm_vid", visitor);
    }
  } catch (error) {
    visitor = String(Math.random()).slice(2) + Date.now();
  }
  var companyDomain = null;
  var last = null;
  function send(path, body) {
    var text = JSON.stringify(body);
    var url = origin + path;
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([text], { type: "text/plain" }))) return;
    } catch (error) {}
    try {
      fetch(url, { method: "POST", body: text, keepalive: true, mode: "no-cors", headers: { "content-type": "text/plain" } });
    } catch (error) {}
  }
  function view() {
    var path = location.pathname;
    if (path === last) return;
    var params = new URLSearchParams(location.search);
    send(${JSON.stringify(TRACKING_COLLECT_PATH)}, {
      key: key,
      visitor_id: visitor,
      path: path,
      host: location.host,
      referrer: last === null ? document.referrer || null : null,
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      company_domain: companyDomain
    });
    last = path;
  }
  function wrap(name) {
    var original = history[name];
    history[name] = function () {
      var result = original.apply(this, arguments);
      setTimeout(view, 0);
      return result;
    };
  }
  wrap("pushState");
  wrap("replaceState");
  addEventListener("popstate", view);
  window.crm = {
    __loaded: true,
    identify: function (email) {
      if (typeof email === "string" && email.indexOf("@") > 0) {
        send(${JSON.stringify(TRACKING_IDENTIFY_PATH)}, { key: key, visitor_id: visitor, email: email });
      }
    },
    company: function (domain) {
      if (typeof domain === "string") companyDomain = domain;
    }
  };
  view();
})();
`;
