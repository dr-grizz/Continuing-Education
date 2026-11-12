/** Course-level coverage, distinct from an earned/assessed badge claim. */
export type OfferingSkillReference = { id: string; releaseId: string };
export type OfferingSkill = OfferingSkillReference & {
  name: string;
  description: string;
  category: string;
  url: string;
  source: "O*NET";
  version: string;
  license: string;
};
