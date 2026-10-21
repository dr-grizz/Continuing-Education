const list = document.querySelector('#badges');
const result = document.querySelector('#result');
const issue = document.querySelector('#issue');
function element(tag,text,className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function call(path,body) {
  const response = await fetch(path,body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
async function reload() {
  const {badges} = await call('/api/demo/badges');
  list.replaceChildren();
  if (!badges.length) { list.append(element('div','No badges yet. Complete the sample course to earn your first credential.','card')); return; }
  for (const badge of badges) {
    const card = element('article',null,'card');
    card.append(element('div','✦','badge-symbol'),element('small','FICTIONAL DEMONSTRATION'),element('h3',badge.title),
      element('p',badge.status === 'revoked' ? 'Revoked' : badge.signatureValid ? 'Issued · signature verified' : 'Signature invalid',badge.status === 'revoked' ? 'state revoked' : 'state'),
      element('p',badge.criteria),element('p',`Issued ${new Date(badge.issuedAt).toLocaleString()}`));
    const actions = element('div',null,'actions');
    const download = element('a','Download credential','button secondary');
    download.href = `/api/demo/badges/${badge.id}/download`;
    actions.append(download);
    if (badge.verificationUrl) {
      const link = element('a','Verify badge','button secondary');
      link.href = badge.verificationUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      actions.append(link);
    }
    const share = element('button',badge.shared ? 'Stop public sharing' : 'Enable public sharing','secondary');
    share.addEventListener('click',() => action(share,`/api/demo/badges/${badge.id}/share`,{shared:!badge.shared},'Sharing preference saved.'));
    actions.append(share);
    if (badge.status !== 'revoked') {
      const revoke = element('button','Revoke sample award','danger');
      revoke.addEventListener('click',() => action(revoke,`/api/demo/badges/${badge.id}/revoke`,{reason:'Local demonstration revocation'},'Sample award revoked; retries will not restore it.'));
      actions.append(revoke);
    }
    card.append(actions,element('p','CU pilot export format · Open Badges interoperability has not been validated.'));
    list.append(card);
  }
}
async function action(button,path,body,message) {
  button.disabled = true;
  try { await call(path,body); result.textContent = message; await reload(); }
  catch (error) { result.textContent = error.message; }
  finally { button.disabled = false; }
}
issue.addEventListener('click',async () => {
  issue.disabled = true;
  try {
    const decision = await call('/api/demo/issue',{scenario:document.querySelector('#scenario').value});
    result.textContent = !decision.eligible ? `No badge issued: ${decision.reasons.join('; ')}.` : decision.duplicate ? 'Existing award retained; no duplicate issued.' : 'Sample credential issued. Public sharing is off.';
    await reload();
  } catch (error) { result.textContent = error.message; }
  finally { issue.disabled = false; }
});
reload().catch(error => { list.textContent = error.message; });
