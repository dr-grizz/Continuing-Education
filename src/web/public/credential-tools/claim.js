(() => {
  "use strict";
  const $ = (id) => document.getElementById("claim-" + id),
    node = (tag, text) => {
      const el = document.createElement(tag);
      if (text !== undefined) el.textContent = text;
      return el;
    };
  let busy = false;
  const fragment = location.hash.slice(1);
  history.replaceState(null, "", location.pathname);
  try {
    if (fragment) {
      sessionStorage.setItem("ce-pending-claim", fragment);
    }
    const pending = sessionStorage.getItem("ce-pending-claim");
    if (pending && pending.length <= 100) $("code").value = pending;
  } catch {
    if (fragment.length <= 100) $("code").value = fragment;
  }
  async function request(path, body) {
    const response = await fetch("/api/badges/" + path, {
      credentials: "same-origin",
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error || result.message || "The claim request failed.",
      );
    return result;
  }
  function download(data, filename, type) {
    const url = URL.createObjectURL(new Blob([data], { type })),
      a = node("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    $("submit").disabled = true;
    $("status").textContent = "";
    try {
      await fn();
    } catch (error) {
      $("status").textContent = error.message;
    } finally {
      busy = false;
      $("submit").disabled = false;
    }
  }
  $("code").addEventListener("input", () => {
    try {
      sessionStorage.setItem("ce-pending-claim", $("code").value);
    } catch {}
  });
  $("form").addEventListener("submit", (event) => {
    event.preventDefault();
    action(async () => {
      const result = await request("me/claims/redeem", {
          code: $("code").value,
        }),
        receipt = $("receipt");
      try {
        sessionStorage.removeItem("ce-pending-claim");
      } catch {}
      receipt.replaceChildren(node("h2", result.title));
      receipt.firstChild.id = "claim-title";
      receipt.append(
        node(
          "p",
          result.demonstration
            ? "FICTIONAL DEMONSTRATION — sample badge/certificate; not evidence of real course completion."
            : "Your earned accomplishment is ready.",
        ),
        node(
          "p",
          result.kind === "both"
            ? "Your badge and certificate recognize the same accomplishment."
            : result.kind === "badge"
              ? "Your badge is ready."
              : "Your certificate is ready.",
        ),
      );
      const base = "me/badges/" + result.sourceId + "/" + result.badgeId;
      if (result.kind !== "certificate") {
        const badge = node("button", "Download badge credential");
        badge.type = "button";
        badge.addEventListener("click", () =>
          action(async () => {
            const data = await request(base + "/download");
            download(
              JSON.stringify(data, null, 2),
              "badge-" + result.badgeId + ".json",
              "application/json",
            );
            $("status").textContent = "Badge credential downloaded.";
          }),
        );
        receipt.append(badge);
      }
      if (result.kind !== "badge") {
        const pdf = node("button", "Download certificate PDF");
        pdf.type = "button";
        pdf.addEventListener("click", () =>
          action(async () => {
            const data = await request(base + "/certificate");
            download(
              Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0)),
              data.filename,
              "application/pdf",
            );
            $("status").textContent = "Certificate PDF downloaded.";
          }),
        );
        receipt.append(pdf);
      }
      receipt.hidden = false;
      receipt.focus();
      $("code").value = "";
      $("status").textContent = result.replayed
        ? "This accomplishment was already claimed by your account. Your downloads are available below."
        : "Accomplishment claimed. Your downloads are available below.";
    });
  });
  fetch("/api/demo-session", { credentials: "same-origin" })
    .then(async (response) => {
      if (!response.ok) return;
      const session = await response.json();
      if (session.id) {
        $("session").textContent =
          "Signed in as " +
          (session.display_name || session.email || "the current learner") +
          ".";
        $("sign-in").hidden = true;
      } else {
        $("session").textContent =
          "Sign in before claiming; your code will be kept in this browser tab during sign-in.";
      }
    })
    .catch(() => {
      $("session").textContent =
        "Unable to check sign-in. Sign in, then return to this claim page.";
    });
})();
