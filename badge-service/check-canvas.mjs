import { readFileSync } from 'node:fs';
import { canvasEvidence } from './canvas.mjs';
import { eligibility, validateConfig } from './core.mjs';

// Read-only check; no BadgeStore is constructed and no credential is issued.
if (process.argv.length !== 4) {
  console.error('Usage: node check-canvas.mjs configuration.json mapped-learner-id');
  process.exit(2);
}
try {
  const config = validateConfig(JSON.parse(readFileSync(process.argv[2])));
  const evidence = await canvasEvidence(config,process.argv[3]);
  const decision = eligibility(config.course,evidence);
  console.log(JSON.stringify({checkedAt:evidence.observedAt,source:evidence.source,
    canvasCourseId:evidence.canvasCourseId,canvasUserId:evidence.canvasUserId,
    eligible:decision.eligible,reasons:decision.reasons,
    modules:evidence.modules.map(m => ({id:m.id,state:m.state,published:m.published,
      requirementType:m.requirementType,requiredItems:m.requiredItems})),
    assessmentGraded:evidence.assessment.graded,actions:'Read only; no badge issued'},null,2));
} catch {
  console.error('Read-only Canvas check failed; no badge issued. Verify connection and mapping configuration.');
  process.exitCode = 1;
}
