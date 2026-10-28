(() => {
  'use strict';
  const root = document.querySelector('.cu-certificates');
  if (!root) return;
  const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
  const section = node('section', undefined, 'ca-card cc-email-workspace');
  section.innerHTML = `<h2>Email certificates</h2>
    <p>Send each selected learner a separate, personalized email. Only issued certificates can be emailed; selecting a cohort does not verify completion or issue new certificates.</p>
    <p id="ce-config" role="status"></p>
    <details><summary>Email settings and automatic delivery</summary><form id="ce-settings-form">
      <p id="ce-sender"></p><p>Provider credentials are configured by the server administrator. Automatic delivery starts with newly created certificates and does not email past awards.</p>
      <label class="ca-check"><input id="ce-automatic" type="checkbox">Automatically email newly issued certificates</label>
      <label for="ce-default-mode">Default delivery format</label><select id="ce-default-mode"><option value="attachment">PDF attachment</option><option value="link">Secure download link</option><option value="both">Attachment and link</option></select>
      <label for="ce-default-subject">Default subject</label><input id="ce-default-subject" maxlength="180" required>
      <label for="ce-default-message">Default message</label><textarea id="ce-default-message" rows="6" maxlength="5000" required></textarea>
      <p class="ca-muted">Use {{name}}, {{achievement}}, and {{awardDate}} to personalize each email. Download links expire after seven days; anyone holding the link can download that one certificate while it remains valid.</p>
      <button type="submit">Save email settings</button></form></details>
    <label for="ce-cohort">Filter certificates by cohort</label><select id="ce-cohort"><option value="">All issued certificates</option></select>
    <p class="ca-muted">Cohort membership uses the learner’s existing portal account link. Missing links or email addresses must be corrected in the learner record before sending.</p>
    <div id="ce-choices" role="group" aria-label="Select certificates to email"></div>
    <div class="cc-actions"><button id="ce-select-all" type="button" class="ca-secondary">Select visible certificates</button><button id="ce-clear" type="button" class="ca-secondary">Clear selection</button><button id="ce-compose" type="button" disabled>Preview selected emails</button></div>
    <p id="ce-selection" role="status"></p><p id="ce-status" role="status"></p>
    <h3>Delivery history</h3><p>“Provider accepted” means the provider accepted the request; it does not verify inbox delivery. Uncertain attempts require provider review before resending. Resends create a new recorded attempt.</p>
    <button id="ce-refresh" type="button" class="ca-secondary">Refresh delivery history</button><div id="ce-history"></div>
    <section id="ce-dialog" class="cc-email-review" role="region" aria-labelledby="ce-title" aria-describedby="ce-instructions" hidden>
      <h2 id="ce-title">Preview certificate emails</h2><p id="ce-instructions">Review every recipient, personalized subject and message, and certificate PDF before confirming. Each learner receives only their own certificate.</p>
      <form id="ce-compose-form"><label for="ce-mode">Delivery format</label><select id="ce-mode"><option value="attachment">PDF attachment</option><option value="link">Secure download link</option><option value="both">Attachment and link</option></select>
      <label for="ce-subject">Subject</label><input id="ce-subject" maxlength="180" required>
      <label for="ce-message">Message</label><textarea id="ce-message" maxlength="5000" rows="6" required></textarea>
      <p class="ca-muted">Placeholders: {{name}}, {{achievement}}, {{awardDate}}. A secure link is added automatically for link delivery; it expires seven days after the preview is created.</p>
      <div id="ce-resend-fields" hidden><p>Review the previous attempt in the provider before resending, especially an uncertain attempt: the learner may already have received it.</p><label for="ce-resend-reason">Reason for resend (at least 10 characters)</label><textarea id="ce-resend-reason" rows="2" minlength="10" maxlength="500"></textarea></div>
      <button id="ce-build" type="submit">Build personalized previews</button></form>
      <div id="ce-previews"></div><p id="ce-dialog-status" role="alert"></p>
      <label class="ca-check"><input id="ce-confirm" type="checkbox" disabled>I reviewed the recipients, messages, and certificate PDFs and authorize sending.</label>
      <div class="cc-actions"><button id="ce-send" type="button" disabled>Send emails</button><button id="ce-close" type="button" class="ca-secondary">Close</button></div>
    </section>`;
  root.querySelector('#cc-tools').append(section);
  const $ = id => section.querySelector('#ce-' + id);
  let catalog = { certificates: [], awards: [] }, emailCatalog = null, selected = new Set(), preview = null, resendOf = null, pending = false, returnFocus = null, dialogIds = [];
  async function request(path, body) {
    const response = await fetch(root.dataset.api + '/email/' + path, { credentials: 'same-origin', method: body === undefined ? 'GET' : 'POST',
      headers: { ...(root.dataset.nonce ? { 'X-WP-Nonce': root.dataset.nonce } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.message || 'The email request failed.');
    return data;
  }
  async function run(fn, inDialog = false) {
    if (pending) return;
    pending = true;
    const target = $(inDialog ? 'dialog-status' : 'status'); target.textContent = '';
    section.setAttribute('aria-busy', 'true');
    controls();
    try { await fn(); } catch (error) { target.textContent = error.message; }
    finally { pending = false; section.removeAttribute('aria-busy'); controls(); }
  }
  function controls() {
    $('compose').disabled = pending || !selected.size || !emailCatalog;
    $('build').disabled = pending;
    $('close').disabled = pending;
    for (const field of $('compose-form').querySelectorAll('input,textarea,select')) field.disabled = pending;
    const ready = emailCatalog?.configuration.ready && preview?.emails.length && preview.emails.every(item => !item.reason && (item.mode === 'attachment' || emailCatalog.configuration.linksReady));
    $('confirm').disabled = pending || !ready;
    $('send').disabled = pending || !ready || !$('confirm').checked;
    $('select-all').disabled = pending; $('clear').disabled = pending; $('refresh').disabled = pending;
    $('selection').textContent = `${selected.size} certificate${selected.size === 1 ? '' : 's'} selected (maximum 100).`;
  }
  function invalidate() { preview = null; $('previews').replaceChildren(); $('confirm').checked = false; controls(); }
  function eligible(cert) { return catalog.awards.some(award => award.id === cert.badgeId && award.sourceId === cert.sourceId && award.status === 'issued' && award.signatureValid); }
  function visibleCertificates() { const cohort = $('cohort').value; return catalog.certificates.filter(cert => !cohort || emailCatalog?.contacts[cert.id]?.cohortIds.includes(cohort)); }
  function choices() {
    $('choices').replaceChildren();
    const visible = visibleCertificates();
    if (!visible.length) $('choices').append(node('p', 'No issued certificates match this cohort.'));
    for (const cert of visible) {
      const contact = emailCatalog?.contacts[cert.id], label = node('label', undefined, 'ca-check'), checkbox = node('input');
      checkbox.type = 'checkbox'; checkbox.value = cert.id; checkbox.checked = selected.has(cert.id);
      checkbox.disabled = !eligible(cert) || !contact?.address;
      checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(cert.id) : selected.delete(cert.id); controls(); });
      label.append(checkbox, node('span', `${cert.recipientName} · ${cert.achievement} · ${contact?.address || 'Missing active account link or email'}`));
      $('choices').append(label);
    }
    controls();
  }
  async function loadCatalog() {
    emailCatalog = await request('catalog');
    const c = emailCatalog.configuration, s = emailCatalog.settings;
    $('config').textContent = c.ready ? `Sending configured${c.provider ? ' with ' + c.provider : ''}. ${c.linksReady ? 'Secure links are available.' : 'Link delivery needs a public HTTPS portal address.'}` : c.reason;
    $('sender').textContent = `Sender: ${c.sender}`;
    $('automatic').checked = s.automatic; $('automatic').disabled = !c.ready && !s.automatic;
    $('default-mode').value = s.mode; $('default-subject').value = s.subject; $('default-message').value = s.message;
    const picked = $('cohort').value;
    $('cohort').replaceChildren(new Option('All issued certificates', ''), ...emailCatalog.cohorts.map(group => new Option(group.name, group.id)));
    if (emailCatalog.cohorts.some(group => group.id === picked)) $('cohort').value = picked;
    choices();
  }
  async function loadHistory() {
    const result = await request('history'); $('history').replaceChildren();
    if (!result.deliveries.length) $('history').append(node('p', 'No email attempts recorded.'));
    for (const item of result.deliveries) {
      const entry = node('details', undefined, 'cc-email-history'), title = node('summary', `${item.recipientName} · ${item.recipient || 'No recipient address'} · ${item.state === 'accepted' ? 'Provider accepted' : item.state} · ${new Date(item.createdAt).toLocaleString()}`);
      entry.append(title, node('p', item.subject), node('pre', item.message, 'cc-email-message'), node('p', `${item.achievement} · ${item.mode}${item.resendOf ? ' · resend' : ''}${item.automatic ? ' · automatic' : ''}`));
      entry.append(node('p', `Attempt: ${item.id}${item.providerId ? ' · Provider reference: ' + item.providerId : ''}`, 'ca-muted'));
      if (item.resendReason) entry.append(node('p', 'Resend reason: ' + item.resendReason));
      const events = node('ul');
      for (const event of item.events) events.append(node('li', `${new Date(event.at).toLocaleString()} · ${event.state} · ${event.detail} · ${event.actor}`));
      entry.append(events);
      if (!['queued', 'sending', 'cancelled', 'blocked'].includes(item.state)) {
        const button = node('button', 'Review and resend', 'ca-secondary'); button.type = 'button';
        button.addEventListener('click', () => open([item.certificateId], item.id)); entry.append(button);
      }
      $('history').append(entry);
    }
    $('history').append(node('p', `Showing the latest ${result.limit} attempts at most. Refresh to check queued messages.`,'ca-muted'));
  }
  function open(ids, previous = null) {
    if (pending || !emailCatalog) { $('status').textContent = 'Email settings are loading. Try again shortly.'; return; }
    if (!ids.length || ids.length > 100) { $('status').textContent = 'Select 1–100 certificates.'; return; }
    returnFocus = document.activeElement; dialogIds = ids; resendOf = previous; invalidate();
    const s = emailCatalog.settings;
    $('mode').value = s.mode; $('subject').value = s.subject; $('message').value = s.message;
    $('resend-fields').hidden = !previous; $('resend-reason').required = !!previous; $('resend-reason').value = '';
    $('dialog-status').textContent = emailCatalog.configuration.ready ? '' : emailCatalog.configuration.reason;
    $('dialog').hidden = false; $('mode').focus();
  }
  function close() { if (pending) return; $('dialog').hidden = true; (returnFocus?.isConnected ? returnFocus : $('compose')).focus(); }
  $('close').addEventListener('click', close);
  document.addEventListener('keydown', event => { if (!$('dialog').hidden && event.key === 'Escape') { event.preventDefault(); close(); } });
  $('compose-form').addEventListener('input', invalidate);
  $('confirm').addEventListener('change', controls);
  $('compose-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
    invalidate();
    preview = await request('preview', { certificateIds: dialogIds, mode: $('mode').value, subject: $('subject').value, message: $('message').value,
      ...(resendOf ? { resendOf, resendReason: $('resend-reason').value } : {}) });
    for (const item of preview.emails) {
      const card = node('section', undefined, 'cc-email-preview'); card.append(node('h3', item.recipientName), node('p', `From: ${item.sender}`), node('p', `To: ${item.recipient || 'No email address available'}`), node('p', `Subject: ${item.subject}`), node('pre', item.message, 'cc-email-message'), node('p', `Certificate: ${item.achievement} · ${item.mode}`));
      if (item.reason) card.append(node('p', item.reason, 'cc-email-warning'));
      const download = node('button', 'Review certificate PDF', 'ca-secondary'); download.type = 'button';
      download.addEventListener('click', () => run(async () => {
        const response = await fetch(root.dataset.api + '/pdf/' + item.sourceId + '/' + item.badgeId, { credentials: 'same-origin' }); const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Certificate preview failed.');
        const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(data.data), c => c.charCodeAt(0))], { type: 'application/pdf' }));
        const a = node('a'); a.href = url; a.download = data.filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      }, true)); card.append(download); $('previews').append(card);
    }
    $('dialog-status').textContent = `Review ${preview.emails.length} personalized email${preview.emails.length === 1 ? '' : 's'}. Preview expires in 30 minutes. ${emailCatalog.configuration.ready ? '' : emailCatalog.configuration.reason}`;
  }, true); });
  $('send').addEventListener('click', () => run(async () => {
    if (!preview || !$('confirm').checked) return;
    const result = await request('send', { batchId: preview.batchId, confirmed: true });
    invalidate(); $('dialog-status').textContent = `${result.queued} email${result.queued === 1 ? '' : 's'} queued. Check delivery history for provider acceptance or failure.`;
    await loadHistory();
  }, true));
  $('compose').addEventListener('click', () => open([...selected]));
  $('cohort').addEventListener('change', () => { selected.clear(); choices(); });
  $('select-all').addEventListener('click', () => { const certificates = visibleCertificates().filter(cert => eligible(cert) && emailCatalog?.contacts[cert.id]?.address); if (certificates.length > 100) { $('status').textContent = 'More than 100 certificates match. Select up to 100 individually.'; return; } selected = new Set(certificates.map(cert => cert.id)); choices(); });
  $('clear').addEventListener('click', () => { selected.clear(); choices(); });
  $('refresh').addEventListener('click', () => run(loadHistory));
  $('settings-form').addEventListener('submit', event => { event.preventDefault(); run(async () => {
    await request('settings', { automatic: $('automatic').checked, mode: $('default-mode').value, subject: $('default-subject').value, message: $('default-message').value, revision: emailCatalog.settings.revision });
    await loadCatalog(); $('status').textContent = 'Email settings saved. Existing certificates have not been emailed.';
  }); });
  root.addEventListener('cc-catalog', event => { catalog = event.detail; run(async () => { await loadCatalog(); await loadHistory(); }); });
  root.addEventListener('cc-email-open', event => open(event.detail.ids));
})();
