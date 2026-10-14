import { removeTestLearners } from "../../scripts/remove-test-learner";
// Removes the synthetic learner the checks sign in as, with its records, so
// local runs leave no test data behind.
export default async function teardown() {
  await removeTestLearners(["a11y-scan@example.test"]);
}
