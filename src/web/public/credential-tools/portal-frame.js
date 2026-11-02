(() => {
  const dark = new URLSearchParams(location.search).get("theme") === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.source !== parent ||
        event.data?.type !== "cu-badge-theme" ||
        !["light", "dark"].includes(event.data.theme)) return;
    document.documentElement.dataset.theme = event.data.theme;
  });
  function send(message) { if (parent !== window) parent.postMessage(message, location.origin); }
  let last = 0;
  function resize() {
    const height = Math.ceil(document.documentElement.scrollHeight);
    if (height !== last) { last = height; send({ type: "cu-badge-height", height }); }
  }
  new ResizeObserver(resize).observe(document.body);
  document.addEventListener("click", event => {
    const link = event.target.closest("a[href]");
    if (!link || link.download || link.target === "_blank") return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && /^\/(staff(?:\/|$)|badges(?:\?|$)|sign-in)/.test(url.pathname)) {
      event.preventDefault(); send({ type: "cu-badge-navigate", href: url.pathname + url.search });
    }
  });
  // Report editor changes to the portal's existing unsaved-change guard.
  let edited = false;
  document.addEventListener("input", event => {
    if (!event.target.closest("#badge-form,.cc-editor")) return;
    edited = true; send({ type: "cu-badge-dirty", dirty: true });
  });
  new MutationObserver(() => {
    const state = document.querySelector("#save-state,#cc-save-note")?.textContent || "";
    if (edited && /^Saved/.test(state)) { edited = false; send({ type: "cu-badge-dirty", dirty: false }); }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  resize();
})();
