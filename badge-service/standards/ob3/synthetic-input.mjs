// Entirely fictional, deterministic model fixture. These domains are reserved examples.
import {defaultDesign} from '../../designs.mjs';
import {renderBadge} from '../../public/badge-artwork.js';
export function syntheticModelInput(){
  const id='b3a10000-0000-4000-8000-000000000001';
  const design={...defaultDesign,title:'Synthetic Badge Model — Test Only',description:'Fictional achievement for testing the Open Badges 3.0 data model; no real learner award.',criteria:'Complete the fictional learning activities and meet the example assessment rule.',issuer:'Example University — Synthetic Fixture'};
  return {badgeVersion:{id,draftId:'b3a10000-0000-4000-8000-000000000002',revision:1,status:'approved',approvedAt:'2026-10-14T10:00:00.000Z',design,artwork:renderBadge(design,'published-'+id)},
    issuer:{id:'https://badges.example.invalid/issuers/example-university',name:design.issuer,url:'https://example.invalid'},
    credentialId:'https://badges.example.invalid/credentials/b3a10000-0000-4000-8000-000000000003',
    learnerId:'synthetic-learner-001',recipientRegistry:{'synthetic-learner-001':{verified:true,method:'synthetic-test',verifiedAt:'2026-10-14T09:00:00.000Z',subjectId:'urn:uuid:b3a10000-0000-4000-8000-000000000004'}},
    validFrom:'2026-10-14T12:00:00.000Z'};
}
