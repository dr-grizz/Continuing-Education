import { renderBadge as artwork } from '/credential-tools/badge-artwork.js';
const $=id=>document.getElementById(id);
const keys=['title','description','criteria','issuer','label','footer','shape','icon','font','primary','accent','text','border','iconSize'];
const value=key=>$(key).type==='range' ? Number($(key).value) : $(key).type==='color' ? $(key).value.toUpperCase() : $(key).value;
const initial=Object.fromEntries(keys.map(key=>[key,value(key)]));
let currentId=null, revision=null, logo=null, artworkImage=null, baseline=null, svg='', busy=false;
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function design(){return Object.fromEntries([...keys.map(key=>[key,value(key)]),['logo',logo],['artworkImage',artworkImage]]);}
function message(text){$('status').textContent=text;}
function render(){
  const d=design();svg=artwork(d);$('badge-preview').innerHTML=svg;
  $('badge-preview').setAttribute('aria-label',`${d.title||'Untitled'} badge design`);
  $('preview-title').textContent=d.title||'Your badge title';$('preview-description').textContent=d.description||'Add a description of the achievement.';$('preview-issuer').textContent=d.issuer||'Your organization';
  $('border-output').value=d.border;$('iconSize-output').value=d.iconSize;
  $('remove-logo').hidden=!logo;
  $('template-controls').disabled=Boolean(artworkImage);
  $('template-controls').hidden=Boolean(artworkImage);
  $('use-templates').hidden=!artworkImage;$('artwork-state').hidden=!artworkImage;
  $('save-state').textContent=baseline===JSON.stringify(d)?`Saved · revision ${revision}`:currentId?'Unsaved changes':'Unsaved draft';
}
function populate(d){for(const key of keys)$(key).value=d[key];logo=d.logo||null;artworkImage=d.artworkImage||null;$('logo').value='';$('artwork-image').value='';render();}
function selectTab(name){
  for(const tab of ['visual','details']){const selected=tab===name;$(tab+'-panel').hidden=!selected;$(tab+'-tab').setAttribute('aria-selected',String(selected));$(tab+'-tab').tabIndex=selected?0:-1;}
}
for(const tab of ['visual','details']){
  $(tab+'-tab').addEventListener('click',()=>selectTab(tab));
  $(tab+'-tab').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'visual':e.key==='End'?'details':tab==='visual'?'details':'visual';selectTab(next);$(next+'-tab').focus();}});
}
for(const key of keys)$(key).addEventListener('input',()=>{render();message('');});
const templates={classic:{shape:'shield',icon:'book',font:'serif',primary:'#003A63',accent:'#FDB813',text:'#FFFFFF',border:12,iconSize:92},modern:{shape:'hexagon',icon:'star',font:'sans',primary:'#003A63',accent:'#FDB813',text:'#FFFFFF',border:6,iconSize:85},heritage:{shape:'seal',icon:'laurel',font:'serif',primary:'#FDB813',accent:'#003A63',text:'#003A63',border:8,iconSize:92}};
document.querySelectorAll('[data-template]').forEach(button=>button.addEventListener('click',()=>{
  for(const [key,value]of Object.entries(templates[button.dataset.template]))$(key).value=value;
  document.querySelectorAll('[data-template]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});
  render();message('');
}));
async function readArtwork(input,onSuccess){
  const file=input.files[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){message('Choose a PNG, JPEG or WebP image up to 2 MB.');input.value='';return;}
  try{
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
    await new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=reject;image.src=data;});
    onSuccess(data);render();
  }catch{message('The image could not be read; choose another file.');input.value='';}
}
$('logo').addEventListener('change',()=>readArtwork($('logo'),data=>{logo=data;message('Center artwork added to your template.');}));
$('artwork-image').addEventListener('change',()=>readArtwork($('artwork-image'),data=>{artworkImage=data;message('Your uploaded image now replaces the entire badge template.');}));
$('use-templates').addEventListener('click',()=>{artworkImage=null;$('artwork-image').value='';render();message('Template artwork restored; your badge details were kept.');});
$('remove-logo').addEventListener('click',()=>{logo=null;$('logo').value='';render();message('Uploaded artwork removed.');});
function canReplace(){return (baseline||JSON.stringify({...initial,logo:null,artworkImage:null}))===JSON.stringify(design())||window.confirm('Discard your unsaved changes?');}
$('new-design').addEventListener('click',()=>{if(!canReplace())return;currentId=null;revision=null;baseline=null;populate({...initial,logo:null,artworkImage:null});selectTab('details');message('New badge draft ready.');});
async function request(path,body){const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await response.json();if(!response.ok)throw new Error(data.error||'The draft could not be saved.');return data;}
function validDetails(){if(!$('title').value.trim()||!$('description').value.trim()||!$('issuer').value.trim()){selectTab('details');message('Add a badge title, description and issuer before saving.');return false;}return true;}
async function library(){
  const {drafts}=await request('/api/badges/designer/drafts');$('draft-list').replaceChildren();$('draft-count').textContent=`${drafts.length} ${drafts.length===1?'draft':'drafts'}`;
  if(!drafts.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='Save your first badge to start your collection.';$('draft-list').append(empty);}
  for(const draft of drafts){
    const card=document.createElement('article');card.className='draft-card';
    const thumb=document.createElement('div');thumb.className='thumb';thumb.innerHTML=artwork(draft.design,'draft-'+draft.id);
    const details=document.createElement('div'),title=document.createElement('h3'),meta=document.createElement('p'),open=document.createElement('button');
    title.textContent=draft.design.title;meta.textContent=`Draft · revision ${draft.revision}`;open.textContent='Edit draft';
    open.addEventListener('click',()=>{if(!canReplace())return;currentId=draft.id;revision=draft.revision;const normalized={...draft.design,artworkImage:draft.design.artworkImage||null};baseline=JSON.stringify(normalized);populate(normalized);message('Saved draft opened.');window.scrollTo({top:0,behavior:'smooth'});});
    const publish=document.createElement('a');publish.href='/staff/badge-publishing?draft='+draft.id;publish.textContent='Publish & map';publish.className='publish-link';
    details.append(title,meta,open,publish);card.append(thumb,details);$('draft-list').append(card);
  }return drafts;
}
$('badge-form').addEventListener('submit',e=>{e.preventDefault();$('save-design').click();});
$('save-design').addEventListener('click',async()=>{
  if(busy||!validDetails())return;busy=true;$('save-design').disabled=true;
  try{
    const saved=await request(currentId?`/api/badges/designer/drafts/${currentId}`:'/api/badges/designer/drafts',{design:design(),revision});
    const drafts=await library();const fresh=drafts.find(d=>d.id===saved.id);
    if(!fresh||fresh.revision!==saved.revision||JSON.stringify(fresh.design)!==JSON.stringify(saved.design))throw new Error('The saved draft could not be verified.');
    currentId=fresh.id;revision=fresh.revision;baseline=JSON.stringify(fresh.design);populate(fresh.design);message('Badge draft saved and verified.');
  }catch(error){message(error.message);}finally{busy=false;$('save-design').disabled=false;}
});
function filename(){return $('title').value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'badge';}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export-svg').addEventListener('click',()=>{download(new Blob([svg],{type:'image/svg+xml'}),filename()+'.svg');message('SVG artwork exported.');});
$('export-json').addEventListener('click',()=>{
  if(!validDetails())return;
  download(new Blob([JSON.stringify({format:'cu-badge-design-draft-v1',status:'draft',id:currentId,revision,design:design(),artwork:svg},null,2)],{type:'application/json'}),filename()+'.json');message('Badge definition exported with artwork and description.');
});
$('export-png').addEventListener('click',async()=>{
  $('export-png').disabled=true;
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  try{const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1200;canvas.getContext('2d').drawImage(image,0,0,1200,1200);
    const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw new Error();download(png,filename()+'.png');message('Transparent PNG exported at 1200 × 1200 pixels.');
  }catch{message('PNG export failed; try SVG artwork instead.');}finally{URL.revokeObjectURL(url);$('export-png').disabled=false;}
});
render();library().catch(()=>message('Saved drafts are unavailable; you can still design and export artwork.'));
