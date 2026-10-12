// Google tag (gtag.js) + first-party tracking, one copy for every 97a.io page (same setup as the other sites).
(function () {
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=G-HSP66J9SKK";
  document.head.appendChild(s);
})();
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag("js", new Date());
gtag("config", "G-HSP66J9SKK");

// ---------------------------------------------------------------------------
// First-party page-view tracking -> Supabase public.events (insert-only).
// Feeds the Traffic tab of the OS dashboard; the host in `referer` is what
// classifies each row per project. The anon key may INSERT but never SELECT,
// so this can write a view and can never read anyone's data back.
// ---------------------------------------------------------------------------
(function () {
  var API = "https://mrmazotdgcmnrigzxkok.supabase.co/rest/v1/events";
  var KEY = "sb_publishable_yI8wFFTRjprK5MddelYlkQ_unHoGuEX";

  function sid() {
    try {
      var s = sessionStorage.getItem("os_sid");
      if (!s) {
        s = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem("os_sid", s);
      }
      return s;
    } catch (e) { return "nostore"; }
  }

  window.osTrack = function (event, props) {
    try {
      fetch(API, {
        method: "POST",
        headers: {
          apikey: KEY,
          Authorization: "Bearer " + KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        keepalive: true, // a view still lands if the tab closes right away
        body: JSON.stringify([{
          ts: new Date().toISOString(),
          session: sid(),
          event: event || "view_page",
          path: location.pathname,
          view: location.pathname.replace(/^\//, "").replace(/\.html$/, "") || "home",
          referer: location.href,
          props: props || {}
        }])
      }).catch(function () {});
    } catch (e) {}
  };

  window.osTrack("view_page");
})();
