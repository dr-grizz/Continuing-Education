const $=id=>document.getElementById(id);
let snapshot={records:[],sources:[],errors:[]},filtered=[],page=1;
const pageSize=25;
const when=value=>value?new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'}).format(new Date(value)):'Not recorded';
function easternDay(value){const parts=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/New_York'}).formatToParts(new Date(value));const part=t=>parts.find(p=>p.type===t).value;return `${part('year')}-${part('month')}-${part('day')}`;}
function node(tag,text,className){const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(className)n.className=className;return n;}
function status(text,className=''){return node('span',text,'status-pill '+className);}
async function request(path,body){const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await r.json();if(!r.ok){const error=new Error(data.error||'The register could not be loaded.');error.status=r.status;throw error;}return data;}
function lock(){snapshot={records:[],sources:[],errors:[]};filtered=[];$('rows').replaceChildren();$('detail-content').replaceChildren();if($('detail-dialog').open)$('detail-dialog').close();$('login-panel').hidden=false;$('register-content').hidden=true;$('logout').hidden=true;}
async function refresh(){
  $('refresh').disabled=true;
  try{
    const data=await request('/api/admin/issuances');snapshot=data;
    $('login-panel').hidden=true;$('register-content').hidden=false;$('logout').hidden=false;
    const choice=$('source-filter').value;$('source-filter').replaceChildren(new Option('All sources','all'));
    for(const source of [...data.sources,...data.errors])$('source-filter').append(new Option(source.name||source.sourceName,source.id||source.sourceId));
    if([...$('source-filter').options].some(o=>o.value===choice))$('source-filter').value=choice;
    $('total').textContent=data.records.length;$('active').textContent=data.records.filter(r=>r.status==='issued').length;
    $('revoked').textContent=data.records.filter(r=>r.status==='revoked').length;$('duplicates').textContent=data.records.reduce((n,r)=>n+r.duplicateRequests,0);
    $('source-errors').hidden=!data.errors.length;$('source-errors').textContent=data.errors.map(e=>`${e.sourceName}: ${e.message}`).join(' ');
    $('updated').textContent=`Refreshed ${when(data.retrievedAt)} Eastern`;
    page=1;render();$('message').textContent='';
  }catch(error){if(error.status===401){lock();$('login-message').textContent='Unlock the register to view issuance records.';}else $('message').textContent=error.message;}
  finally{$('refresh').disabled=false;}
}
function render(){
  const search=$('search').value.trim().toLowerCase(),state=$('status-filter').value,source=$('source-filter').value,from=$('from').value,to=$('to').value;
  if(from&&to&&from>to){$('message').textContent='The start date must be before or equal to the end date.';}else $('message').textContent='';
  filtered=snapshot.records.filter(r=>{
    const day=easternDay(r.issuedAt);
    return (state==='all'||r.status===state)&&(source==='all'||r.sourceId===source)&&(!from||day>=from)&&(!to||day<=to)&&
      (!search||[r.id,r.learnerId,r.title,r.issuer,r.achievementId,r.ruleVersion,r.evidence.canvasCourseId,r.evidence.canvasUserId].join(' ').toLowerCase().includes(search));
  });
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pages);
  $('rows').replaceChildren();
  for(const record of filtered.slice((page-1)*pageSize,page*pageSize)){
    const tr=node('tr');
    const credential=node('td');credential.append(node('strong',record.title),node('span',record.id,'mono'),node('small',`Rule ${record.ruleVersion}`));
    const recipient=node('td');recipient.append(node('strong',record.learnerId),node('small',record.evidence.canvasUserId?`Canvas user ${record.evidence.canvasUserId}`:record.demo?'Fictional learner':'Linked learner'));
    const time=node('td',when(record.issuedAt));
    const stateCell=node('td');stateCell.append(status(record.status==='revoked'?'Revoked':'Issued',record.status==='revoked'?'revoked':''),node('small',record.shared?'Public sharing on':'Private'));
    const sourceCell=node('td');sourceCell.append(node('strong',record.evidence.source==='manual-attestation'?(record.evidence.method==='csv'?'Staff CSV award':'Staff manual award'):record.demo?'Fictional demo':'Canvas pilot'),node('small',record.evidence.canvasCourseId?`Course ${record.evidence.canvasCourseId}`:record.sourceName));
    const integrity=node('td',record.signatureValid?'✓ Verified':'✕ Invalid','signature'+(record.signatureValid?'':' invalid'));
    const details=node('td'),button=node('button','View details','secondary view-button');button.addEventListener('click',()=>showDetails(record));details.append(button);
    tr.append(credential,recipient,time,stateCell,sourceCell,integrity,details);$('rows').append(tr);
  }
  $('empty').hidden=filtered.length>0;$('result-count').textContent=`${filtered.length} of ${snapshot.records.length} issuance records`;
  $('page-label').textContent=`Page ${page} of ${pages}`;$('previous').disabled=page<=1;$('next').disabled=page>=pages;
  $('export-csv').disabled=!filtered.length;$('export-json').disabled=!filtered.length;
}
function section(title,fields){const s=node('section',null,'detail-section');s.append(node('h3',title));const dl=node('dl',null,'detail-grid');for(const [label,value]of fields){const wrap=node('div');wrap.append(node('dt',label),node('dd',value??'Not recorded'));dl.append(wrap);}s.append(dl);return s;}
function showDetails(r){
  $('detail-title').textContent=r.title;const content=$('detail-content');content.replaceChildren();
  content.append(section('Credential and recipient',[
    ['Credential ID',r.id],['Current status',r.status==='revoked'?'Revoked':'Issued'],['Recipient / learner ID',r.learnerId],['Canvas user ID',r.evidence.canvasUserId],
    ['Issued · Eastern',when(r.issuedAt)],['Issuer',r.issuer],['Achievement ID',r.achievementId],['Rule version',r.ruleVersion],['Published badge version',r.badgeVersionId],['Course mapping ID',r.courseMappingId],
    ['Public sharing',r.shared?'Enabled':'Off'],['Signature integrity',r.signatureValid?'Verified against the source signing key':'Invalid'],
    ['Credential format',r.credentialFormat],['Source',r.sourceName],['Signing key ID',r.keyId],['Attached badge design',r.designAttached?'Recorded':'No design attached to this issued credential']
  ]));
  const achievement=node('section',null,'detail-section');achievement.append(node('h3','Achievement criteria'),node('p',r.criteria||'Not recorded','detail-text'));
  if(r.artwork&&r.signatureValid){const image=node('img');image.alt=r.title+' artwork frozen at issuance';image.className='issued-artwork';image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(r.artwork);achievement.append(image);}
  if(r.description)achievement.append(node('p',r.description,'detail-text'));content.append(achievement);
  if(r.certificate)content.append(section('Certificate',[['Certificate ID',r.certificate.id],['Printed recipient name',r.certificate.recipientName],['Template revision',r.certificate.templateRevision],['Created · Eastern',when(r.certificate.createdAt)]]));
  if(r.mappingRule)content.append(section('Approved earning rule',[['Canvas course ID',r.mappingRule.canvasCourseId],['Required modules',r.mappingRule.requiredModuleIds.join(', ')],['Assessment ID',r.mappingRule.canvasAssignmentId],['Passing percentage',r.mappingRule.minimumPercent+'%']]));
  if(r.evidence.source==='manual-attestation')content.append(section('Staff award attestation',[['Method',r.evidence.method],['Staff actor',r.evidence.actor],['Award reason',r.evidence.reason],['Evidence URL',r.evidence.evidenceUrl],['Batch ID',r.evidence.batchId],['Attested · Eastern',when(r.evidence.observedAt)]]));
  if(r.evidence.source!=='manual-attestation'){
  const assessment=r.evidence.assessment;
  const score=assessment&&Number.isFinite(assessment.score)&&Number.isFinite(assessment.pointsPossible)&&assessment.pointsPossible>0?`${assessment.score} / ${assessment.pointsPossible} (${Math.round(assessment.score/assessment.pointsPossible*10000)/100}%)`:'Not recorded';
  content.append(section('Evidence captured at issuance',[
    ['Evidence source',r.evidence.source],['Observed · Eastern',when(r.evidence.observedAt)],['Canvas course ID',r.evidence.canvasCourseId],['Assessment result',score],
    ['Graded',assessment?.graded===true?'Yes':'No'],['Excused',assessment?.excused===true?'Yes':'No'],['Assessment ID',assessment?.assignmentId]
  ]));
  const modules=node('section',null,'detail-section');modules.append(node('h3','Module completion evidence'));
  for(const m of r.evidence.modules){const card=node('div',null,'evidence-module');card.append(node('p',`Module ${m.id} · ${m.state||'Not recorded'}`));
    if(m.requirementType)card.append(node('p',`Completion policy: ${m.requirementType} · Published: ${m.published===true?'yes':m.published===false?'no':'not recorded'}`));
    for(const item of m.requiredItems||[])card.append(node('p',`Item ${item.id} · ${item.type}${item.min_score!==undefined?` ≥ ${item.min_score} points`:''} · ${item.completed===true?'complete':'incomplete'}`));
    modules.append(card);
  }if(!r.evidence.modules.length)modules.append(node('p','No module evidence recorded.','detail-text'));content.append(modules);
  }
  if(r.revokedAt)content.append(section('Revocation',[['Revoked · Eastern',when(r.revokedAt)],['Reason',r.revocationReason]]));
  const activity=node('section',null,'detail-section');activity.append(node('h3','Activity history'));const events=node('ol',null,'activity');
  const names={'issued':'Credential issued','duplicate-skipped':'Duplicate issuance request prevented','revoked':'Credential revoked','sharing-enabled':'Public sharing enabled','sharing-disabled':'Public sharing disabled'};
  for(const event of r.history){const li=node('li',names[event.action]||event.action);li.append(node('small',`${when(event.at)} Eastern · Actor: ${event.actor}`));events.append(li);}activity.append(events);content.append(activity);
  const actions=node('div',null,'detail-actions'),download=node('a','Download signed credential','button');download.href=`/api/admin/issuances/${encodeURIComponent(r.sourceId)}/${r.id}/download`;actions.append(download);
  if(r.certificate){const pdfButton=node('button','Download certificate PDF','secondary');pdfButton.disabled=r.status!=='issued'||!r.signatureValid;pdfButton.addEventListener('click',async()=>{pdfButton.disabled=true;try{const pdf=await request(`/api/admin/certificates/pdf/${r.sourceId}/${r.id}`),bytes=Uint8Array.from(atob(pdf.data),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),link=node('a');link.href=url;link.download=pdf.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){$('message').textContent=e.message;}finally{pdfButton.disabled=false;}});actions.append(pdfButton);}
  if(r.evidence.canvasCourseId){const a=node('a','Open Canvas course');a.href=`https://cedarville.instructure.com/courses/${r.evidence.canvasCourseId}`;a.target='_blank';a.rel='noopener';actions.append(a);}
  content.append(actions,node('p','This record shows evidence stored when the award was issued; it does not refresh learner grades. Signature integrity does not establish accreditation or Open Badges interoperability.','detail-note'));
  $('detail-dialog').showModal();
}
$('close-detail').addEventListener('click',()=>$('detail-dialog').close());
for(const id of ['search','status-filter','source-filter','from','to'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;render();});
$('clear-filters').addEventListener('click',()=>{$('search').value='';$('status-filter').value='all';$('source-filter').value='all';$('from').value='';$('to').value='';page=1;render();});
$('previous').addEventListener('click',()=>{page--;render();});$('next').addEventListener('click',()=>{page++;render();});$('refresh').addEventListener('click',refresh);
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const input=$('access-key'),key=input.value;input.value='';try{await request('/api/admin/login',{key});$('login-message').textContent='';await refresh();}catch(error){$('login-message').textContent=error.message;}});
$('logout').addEventListener('click',async()=>{try{await request('/api/admin/logout',{});}finally{lock();}});
function download(blob,name){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvCell(value){let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
$('export-csv').addEventListener('click',()=>{
  const columns=['Credential ID','Achievement','Recipient ID','Issued UTC','Issued Eastern','Status','Source','Canvas Course ID','Canvas User ID','Rule Version','Published Badge Version','Course Mapping ID','Issuer','Signature Verified','Public Sharing','Score','Points Possible','Evidence Observed UTC','Revoked UTC','Revocation Reason','Duplicates Prevented','Issuance Method','Staff Actor','Award Reason','Evidence URL','Batch ID'];
  const rows=filtered.map(r=>[r.id,r.title,r.learnerId,r.issuedAt,when(r.issuedAt),r.status,r.sourceName,r.evidence.canvasCourseId,r.evidence.canvasUserId,r.ruleVersion,r.badgeVersionId,r.courseMappingId,r.issuer,r.signatureValid,r.shared,r.evidence.assessment?.score,r.evidence.assessment?.pointsPossible,r.evidence.observedAt,r.revokedAt,r.revocationReason,r.duplicateRequests,r.evidence.method,r.evidence.actor,r.evidence.reason,r.evidence.evidenceUrl,r.evidence.batchId]);
  const csv=[columns,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');download(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),'cu-issuance-register.csv');$('message').textContent=`Exported ${filtered.length} matching records.`;
});
$('export-json').addEventListener('click',()=>{download(new Blob([JSON.stringify({retrievedAt:snapshot.retrievedAt,scope:'filtered issuance register',records:filtered,sourceErrors:snapshot.errors},null,2)],{type:'application/json'}),'cu-issuance-register.json');$('message').textContent=`Exported ${filtered.length} matching records with evidence and activity.`;});
request('/api/admin/session').then(()=>refresh()).catch(()=>lock());
