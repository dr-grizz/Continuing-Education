(() => {
  "use strict";
  const root = document.querySelector(".cu-certificates,.cu-awards[data-api]");
  if (!root) return;
  const tools = root.querySelector("#cc-tools,#ca-tools");
  if (!tools) return;
  const node = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const section = node("section", undefined, "ca-card cd-workspace");
  section.innerHTML = `<h2>QR and claim-code distribution</h2><p>Distribute an earned badge, its certificate, or both to the same learner. The learner must sign in to their linked portal account; a claim code does not award a second credential or bypass completion requirements.</p>
    <p id="cd-origin" class="ca-muted"></p><button id="cd-refresh" type="button" class="ca-secondary">Refresh available awards and claim history</button>
    <form id="cd-form"><label for="cd-award">Issued accomplishment and recipient</label><select id="cd-award" required><option value="">Select an issued award</option></select>
    <label for="cd-kind">Distribute</label><select id="cd-kind"><option value="badge">Badge</option><option value="certificate">Certificate</option><option value="both">Badge and certificate together</option></select>
    <p id="cd-recipient"></p><label for="cd-days">Claim code expires after (days)</label><input id="cd-days" type="number" value="7" min="1" max="30" required>
    <label class="ca-check"><input id="cd-confirm" type="checkbox">I confirm the recipient and the issued accomplishment selected above.</label><button id="cd-create" type="submit" disabled>Create QR and claim code</button></form>
    <p id="cd-status" role="status"></p><section id="cd-detail" class="cd-detail" aria-labelledby="cd-detail-title" hidden tabindex="-1"></section>
    <h3>Claim history</h3><p class="ca-muted">Revoking a code stops its use; it does not revoke an earned badge or certificate. Expired and redeemed codes remain in history.</p><div id="cd-history"></div>`;
  tools.append(section);
  const $ = (id) => section.querySelector("#cd-" + id);
  let catalog = { awards: [], origin: null },
    busy = false,
    detail = null;
  async function request(path, body) {
    const response = await fetch("/api/badges/admin/distribution/" + path, {
      credentials: "same-origin",
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(root.dataset.nonce ? { "X-WP-Nonce": root.dataset.nonce } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error || result.message || "Distribution request failed.",
      );
    return result;
  }
  function controls() {
    const award = catalog.awards.find(
      (a) => a.sourceId + "/" + a.id === $("award").value,
    );
    $("create").disabled =
      busy || !catalog.origin || !award || !$("confirm").checked;
    $("refresh").disabled = busy;
    for (const input of $("form").querySelectorAll("input,select"))
      input.disabled = busy;
  }
  async function run(fn) {
    if (busy) return;
    busy = true;
    $("status").textContent = "";
    controls();
    try {
      await fn();
    } catch (error) {
      $("status").textContent = error.message;
    } finally {
      busy = false;
      controls();
    }
  }
  function selected() {
    const award = catalog.awards.find(
      (a) => a.sourceId + "/" + a.id === $("award").value,
    );
    $("confirm").checked = false;
    for (const option of $("kind").options)
      option.disabled = option.value !== "badge" && !award?.certificateId;
    $("kind").value = award?.certificateId ? "both" : "badge";
    $("recipient").textContent = award
      ? `${award.recipientName} · ${award.title}${award.demo ? " · Fictional demonstration" : ""}`
      : "";
    controls();
  }
  async function history() {
    const result = await request("history");
    $("history").replaceChildren();
    if (!result.distributions.length)
      $("history").append(node("p", "No claim codes have been created."));
    for (const record of result.distributions) {
      const row = node("div", undefined, "cd-record");
      row.append(
        node(
          "p",
          `${record.recipientName} · ${record.kind} · ${record.state} · expires ${new Date(record.expiresAt).toLocaleString()}`,
        ),
      );
      const button = node(
        "button",
        record.state === "active" ? "View QR and code" : "View claim details",
        "ca-secondary",
      );
      button.type = "button";
      button.addEventListener("click", () => run(() => show(record.id)));
      row.append(button);
      $("history").append(row);
    }
  }
  async function load() {
    catalog = await request("catalog");
    const current = $("award").value;
    $("award").replaceChildren(
      new Option("Select an issued award", ""),
      ...catalog.awards
        .filter((a) => a.status === "issued" && a.signatureValid)
        .map((a) => {
          const o = new Option(
            `${a.recipientName} · ${a.title}${a.certificateId ? " · badge + certificate" : ""}${a.demo ? " · DEMO" : ""}${a.linked ? "" : " · account link required"}`,
            a.sourceId + "/" + a.id,
          );
          o.disabled = !a.linked;
          return o;
        }),
    );
    if (catalog.awards.some((a) => a.sourceId + "/" + a.id === current))
      $("award").value = current;
    $("origin").textContent = !catalog.origin
      ? "Configure WEB_URL before creating distribution codes."
      : catalog.local
        ? "Local demo links use localhost and work on this computer. Phone scanning needs a publicly reachable HTTPS portal address."
        : `Claim links use ${catalog.origin}.`;
    if (catalog.errors?.length)
      $("status").textContent =
        "Some award sources could not be loaded; this list is incomplete.";
    selected();
    await history();
  }
  function save(data, filename) {
    const a = node("a");
    a.href = data;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
  }
  async function show(id) {
    detail = await request(id);
    const container = $("detail");
    container.replaceChildren(node("h3", "Distribution details"));
    container.firstChild.id = "cd-detail-title";
    container.append(
      node("p", `${detail.recipientName} · ${detail.kind} · ${detail.state}`),
      node("p", `Expires: ${new Date(detail.expiresAt).toLocaleString()}`),
    );
    if (detail.qr) {
      const image = node("img");
      image.src = detail.qr;
      image.alt = `Claim QR code for ${detail.recipientName}; the same claim code and link are provided below.`;
      image.className = "cd-qr";
      container.append(image);
      const label = node("label", "Claim code");
      label.htmlFor = "cd-code";
      const code = node("input");
      code.id = "cd-code";
      code.value = detail.code;
      code.readOnly = true;
      code.addEventListener("focus", () => code.select());
      container.append(label, code);
      const linkLabel = node("label", "Private claim link");
      linkLabel.htmlFor = "cd-link";
      const link = node("textarea");
      link.id = "cd-link";
      link.rows = 3;
      link.value = detail.url;
      link.readOnly = true;
      link.addEventListener("focus", () => link.select());
      container.append(linkLabel, link);
      const actions = node("div", undefined, "cc-actions");
      for (const [title, value] of [
        ["Copy claim code", detail.code],
        ["Copy claim link", detail.url],
      ]) {
        const button = node("button", title, "ca-secondary");
        button.type = "button";
        button.addEventListener("click", () =>
          run(async () => {
            try {
              await navigator.clipboard.writeText(value);
              $("status").textContent =
                title === "Copy claim code"
                  ? "Claim code copied."
                  : "Claim link copied.";
            } catch {
              $("status").textContent =
                "Select the code or link above and copy it using your keyboard.";
            }
          }),
        );
        actions.append(button);
      }
      const download = node("button", "Download QR image", "ca-secondary");
      download.type = "button";
      download.addEventListener("click", () =>
        save(detail.qr, "credential-claim-" + detail.id + ".png"),
      );
      actions.append(download);
      const open = node("a", "Open claim page");
      open.href = detail.url;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      actions.append(open);
      container.append(actions);
    }
    if (detail.state !== "revoked") {
      const form = node("form"),
        labelRevoke = node("label", undefined, "ca-check"),
        confirm = node("input");
      confirm.type = "checkbox";
      confirm.required = true;
      labelRevoke.append(
        confirm,
        node("span", "I confirm revoking this claim code."),
      );
      const revoke = node("button", "Revoke claim code", "ca-secondary");
      revoke.type = "submit";
      form.append(labelRevoke, revoke);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        run(async () => {
          await request(detail.id + "/revoke", { confirmed: true });
          await history();
          await show(detail.id);
          $("status").textContent =
            "Claim code revoked. The earned credentials remain available to the learner.";
        });
      });
      container.append(form);
    }
    const events = node("ul");
    for (const event of detail.events || [])
      events.append(
        node(
          "li",
          `${new Date(event.at).toLocaleString()} · ${event.action} · ${event.actor}`,
        ),
      );
    container.append(events);
    container.hidden = false;
    container.focus();
  }
  $("award").addEventListener("change", selected);
  $("confirm").addEventListener("change", controls);
  $("refresh").addEventListener("click", () => run(load));
  $("form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const [sourceId, badgeId] = $("award").value.split("/"),
        result = await request("create", {
          sourceId,
          badgeId,
          kind: $("kind").value,
          days: Number($("days").value),
          confirmed: $("confirm").checked,
        });
      await history();
      await show(result.id);
      $("confirm").checked = false;
      $("status").textContent =
        "QR and claim code ready. Distribute them only to the named learner.";
    });
  });
  run(load);
})();
