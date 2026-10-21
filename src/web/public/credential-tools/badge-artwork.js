const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function titleLines(title){
  const words=title.trim().split(/\s+/).flatMap(word=>word.match(/.{1,23}/gu)||[]);
  const lines=[];
  for(const word of words){if(!lines.length || (lines.at(-1)+' '+word).length>23)lines.push(word);else lines[lines.length-1]+=' '+word;}
  if(lines.length>3){lines.length=3;lines[2]=lines[2].slice(0,20)+'…';}
  return lines.length ? lines : ['Your badge title'];
}
function short(value,max){return value.length>max ? value.slice(0,max-1)+'…':value;}
const icons={
  book:'<path d="M-62-42Q-30-56 0-36Q30-56 62-42V40Q30 26 0 46Q-30 26-62 40Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/><path d="M0-36V46M-46-22Q-24-29-12-21M12-21Q30-29 46-22M-46-4Q-24-11-12-3M12-3Q30-11 46-4" fill="none" stroke="currentColor" stroke-width="4"/>',
  star:'<path d="M0-63L19-20L65-15L31 17L40 62L0 40L-40 62L-31 17L-65-15L-19-20Z" fill="currentColor"/>',
  cross:'<path d="M-14-65H14V-23H51V5H14V65H-14V5H-51V-23H-14Z" fill="currentColor"/>',
  torch:'<path d="M-16 5H16L10 66H-10Z" fill="currentColor"/><path d="M0-67C-40-32-32-12-19-3C-25-21-6-28 0-43C15-24 2-17 16-3C41-21 32-48 18-64C20-47 5-43 0-67Z" fill="currentColor"/><path d="M-23 8H23" stroke="currentColor" stroke-width="7"/>',
  laurel:'<path d="M-12 60C-71 28-68-31-31-60M12 60C71 28 68-31 31-60" fill="none" stroke="currentColor" stroke-width="4"/><g fill="currentColor"><ellipse cx="-49" cy="-38" rx="9" ry="18" transform="rotate(-35 -49 -38)"/><ellipse cx="-59" cy="-10" rx="9" ry="18" transform="rotate(-55 -59 -10)"/><ellipse cx="-51" cy="20" rx="9" ry="18" transform="rotate(-65 -51 20)"/><ellipse cx="-32" cy="43" rx="9" ry="18" transform="rotate(-65 -32 43)"/><ellipse cx="49" cy="-38" rx="9" ry="18" transform="rotate(35 49 -38)"/><ellipse cx="59" cy="-10" rx="9" ry="18" transform="rotate(55 59 -10)"/><ellipse cx="51" cy="20" rx="9" ry="18" transform="rotate(65 51 20)"/><ellipse cx="32" cy="43" rx="9" ry="18" transform="rotate(65 32 43)"/></g><path d="M0-22L7-6L25-4L12 8L16 25L0 16L-16 25L-12 8L-25-4L-7-6Z" fill="currentColor"/>'
};
function shapePath(shape){
  if(shape==='shield')return 'M102 80H498V310Q498 440 300 546Q102 440 102 310Z';
  if(shape==='circle')return 'M300 58A242 242 0 1 1 299.99 58Z';
  if(shape==='hexagon')return 'M180 65H420L551 300L420 535H180L49 300Z';
  const points=[];
  for(let i=0;i<64;i++){const angle=i*Math.PI/32-Math.PI/2;const r=i%2?228:248;points.push(`${300+Math.cos(angle)*r} ${300+Math.sin(angle)*r}`);}
  return `M${points.join('L')}Z`;
}
export function renderBadge(d,suffix='preview'){
  if(d.artworkImage)return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><title>${xml(d.title||'Badge design')}</title><image href="${xml(d.artworkImage)}" x="0" y="0" width="600" height="600" preserveAspectRatio="xMidYMid meet"/></svg>`;
  const lines=titleLines(d.title),font=d.font==='serif'?'Georgia, serif':'Arial, sans-serif';
  const titleY=lines.length===3?337:lines.length===2?350:368;
  const fontSize=lines.length===3?27:31;
  const path=shapePath(d.shape);
  const clip=xml('badge-clip-'+suffix);
  const center=d.logo ? `<image href="${xml(d.logo)}" x="${300-d.iconSize*.7}" y="${233-d.iconSize*.7}" width="${d.iconSize*1.4}" height="${d.iconSize*1.4}" preserveAspectRatio="xMidYMid meet"/>`
    : `<g transform="translate(300 232) scale(${d.iconSize/92})" color="${d.accent}">${icons[d.icon]||icons.book}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><title>${xml(d.title||'Badge design')}</title><defs><clipPath id="${clip}"><path d="${path}"/></clipPath></defs><path d="${path}" fill="${d.primary}" stroke="${d.accent}" stroke-width="${d.border}" stroke-linejoin="round"/><g clip-path="url(#${clip})"><path d="M40 40H560L40 560Z" fill="#FFFFFF" opacity="0.035"/><path d="${path}" transform="translate(300 300) scale(.90) translate(-300 -300)" fill="none" stroke="${d.accent}" opacity=".5" stroke-width="2"/><text x="300" y="132" fill="${d.accent}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${d.label.length>32?11:13}" letter-spacing="2">${xml(short(d.label,46))}</text>${center}<path d="M235 310H365" stroke="${d.accent}" opacity=".65" stroke-width="2"/>${lines.map((line,i)=>`<text x="300" y="${titleY+i*34}" fill="${d.text}" text-anchor="middle" font-family="${font}" font-size="${fontSize}" font-weight="600">${xml(line)}</text>`).join('')}<text x="300" y="439" fill="${d.accent}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${d.footer.length>33?9:11}" letter-spacing="1">${xml(short(d.footer,52))}</text><text x="300" y="467" fill="${d.text}" opacity=".85" text-anchor="middle" font-family="Arial, sans-serif" font-size="10">${xml(short(d.issuer,40))}</text></g></svg>`;
}
