// GET requests only. Tokens and identity mappings stay on the service host.
export async function canvasEvidence(config, learner, environment = process.env, fetcher = fetch) {
  const c = config.course;
  const user = config.learners[learner]?.canvasUserId;
  for (const value of [user, c.canvasCourseId, c.canvasAssignmentId]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Approved Canvas IDs are not configured');
  }
  const get = canvasClient(environment,fetcher);
  const modules = [];
  let url = `/api/v1/courses/${c.canvasCourseId}/modules?student_id=${user}&per_page=100&include[]=items`;
  const visited = new Set();
  while (url) {
    if (visited.has(url) || visited.size >= 100) throw new Error('Canvas pagination did not terminate');
    visited.add(url);
    const result = await get(url);
    if (!Array.isArray(result.value)) throw new Error('Invalid Canvas module response');
    modules.push(...result.value);
    url = result.next;
  }
  const assignment = (await get(`/api/v1/courses/${c.canvasCourseId}/assignments/${c.canvasAssignmentId}`)).value;
  const submission = (await get(`/api/v1/courses/${c.canvasCourseId}/assignments/${c.canvasAssignmentId}/submissions/${user}`)).value;
  if (assignment.id !== c.canvasAssignmentId || assignment.published !== true || submission.assignment_id !== c.canvasAssignmentId || submission.user_id !== user) throw new Error('Canvas identity, publication or assessment mismatch');
  const checkedModules = [];
  for (const module of modules.filter(m => c.requiredModuleIds.includes(m.id))) {
    // Canvas can omit published from the student-specific module list.
    // Read the definition independently rather than assuming publication.
    const definition = module.published === undefined
      ? (await get(`/api/v1/courses/${c.canvasCourseId}/modules/${module.id}`)).value : module;
    if (definition.id !== module.id) throw new Error('Canvas module definition mismatch');
    let items = module.items;
    if (!Array.isArray(items)) {
      items = [];
      let itemUrl = `/api/v1/courses/${c.canvasCourseId}/modules/${module.id}/items?student_id=${user}&per_page=100`;
      const itemPages = new Set();
      while (itemUrl) {
        if (itemPages.has(itemUrl) || itemPages.size >= 100) throw new Error('Canvas item pagination did not terminate');
        itemPages.add(itemUrl);
        const result = await get(itemUrl);
        if (!Array.isArray(result.value)) throw new Error('Invalid Canvas module item response');
        items.push(...result.value);
        itemUrl = result.next;
      }
    }
    checkedModules.push({ id: module.id, state: module.state, published: definition.published,
      requirementType: definition.requirement_type,
      requiredItems: items.filter(item => item.completion_requirement).map(item => ({id:item.id,contentId:item.content_id??null,pageUrl:item.page_url??null,externalUrl:item.external_url??null,itemType:item.type??null,...item.completion_requirement})) });
  }
  return { source: 'canvas-readback', observedAt: new Date().toISOString(), canvasCourseId: c.canvasCourseId,
    canvasUserId: user, modules: checkedModules,
    assessment: { assignmentId:assignment.id, graded: submission.workflow_state === 'graded', excused: submission.excused === true,
      score: submission.score, pointsPossible: assignment.points_possible } };
}

function canvasClient(environment,fetcher){
  if (!environment.CANVAS_BASE_URL || !environment.CANVAS_TOKEN) throw new Error('Canvas connection is not configured');
  const base = new URL(environment.CANVAS_BASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Canvas must use an HTTPS origin');
  async function get(url) {
    const target = new URL(url, base);
    if (target.origin !== base.origin || target.username || target.password || !target.pathname.startsWith('/api/v1/')) throw new Error('Unsafe Canvas pagination URL');
    const response = await fetcher(target, { headers: { Authorization: `Bearer ${environment.CANVAS_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Canvas read failed (${response.status}); no badge issued`);
    return { value: await response.json(), next: response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] };
  }
  return get;
}

// Read course definitions independently; no grades and no Canvas mutations.
export async function canvasMappingInfo(rule,environment=process.env,fetcher=fetch){
  for(const id of [rule.canvasCourseId,rule.canvasAssignmentId,...rule.requiredModuleIds])if(!Number.isSafeInteger(id)||id<=0)throw new Error('Approved Canvas IDs are not configured');
  const get=canvasClient(environment,fetcher);
  const course=(await get(`/api/v1/courses/${rule.canvasCourseId}`)).value;
  const assignment=(await get(`/api/v1/courses/${rule.canvasCourseId}/assignments/${rule.canvasAssignmentId}`)).value;
  if(course.id!==rule.canvasCourseId||assignment.id!==rule.canvasAssignmentId||assignment.published!==true||!Number.isFinite(assignment.points_possible)||assignment.points_possible<=0)throw new Error('Select a published assessment with positive points in this course');
  const modules=[];
  for(const id of rule.requiredModuleIds){
    const definition=(await get(`/api/v1/courses/${rule.canvasCourseId}/modules/${id}`)).value;
    let url=`/api/v1/courses/${rule.canvasCourseId}/modules/${id}/items?per_page=100`,items=[];const visited=new Set();
    while(url){
      if(visited.has(url)||visited.size>=100)throw new Error('Canvas item pagination did not terminate');visited.add(url);
      const result=await get(url);if(!Array.isArray(result.value))throw new Error('Invalid Canvas module item response');items.push(...result.value);url=result.next;
    }
    const requiredItems=items.filter(i=>i.completion_requirement).map(i=>({id:i.id,contentId:i.content_id??null,pageUrl:i.page_url??null,externalUrl:i.external_url??null,itemType:i.type??null,...i.completion_requirement}));
    if(definition.id!==id||definition.published!==true||definition.requirement_type!=='all'||!requiredItems.length||new Set(requiredItems.map(i=>i.id)).size!==requiredItems.length||requiredItems.some(i=>!Number.isSafeInteger(i.id)||i.id<=0||(i.type==='min_score'&&(!Number.isFinite(i.min_score)||i.min_score<0))||(i.type==='min_percentage'&&(!Number.isFinite(i.min_percentage)||i.min_percentage<0||i.min_percentage>100))||!['must_view','must_submit','must_contribute','min_score','min_percentage','must_mark_done'].includes(i.type)))throw new Error('Select published modules that require all specified items');
    modules.push({id,name:definition.name,published:true,requirementType:'all',requiredItems});
  }
  return {valid:true,checkedAt:new Date().toISOString(),canvasCourseId:course.id,courseName:course.name,assignmentId:assignment.id,assignmentName:assignment.name,pointsPossible:assignment.points_possible,modules};
}
