# Continuing Education test run record

Copy this template for each execution of the [systematic test cases](use-cases.md). Store sanitized completed records in the team's approved test-evidence location; this repository template contains no executed results. Use one row per case/browser/environment combination and duplicate rows when needed.

## Run details

| Field                                               | Value |
| --------------------------------------------------- | ----- |
| Run ID                                              |       |
| Tester and reviewer                                 |       |
| Date and time zone                                  |       |
| Commit and branch                                   |       |
| Environment and public URL                          |       |
| Database and applied migration                      |       |
| Browser and version, device and viewport            |       |
| Assistive technology and version                    |       |
| Staff auth mode and tested roles                    |       |
| Payment mode and Stripe sandbox label               |       |
| Canvas installation and subaccount, nested accounts |       |
| Approved Canvas course IDs                          |       |
| Learner test emails and offering/registration IDs   |       |
| Simulation setting before run                       |       |
| Scope and changed features                          |       |
| Automated commands and run links                    |       |

Do not record tokens, session cookies, OAuth codes, signing secrets, client secrets, card details or unsanitized provider logs. A Canvas read/import result, a portal enrollment simulation and a real learner enrollment are different outcomes; name which was exercised.

## Results summary

The test set contains **87 functional cases** and **24 security checks** (111 total), including **65 P0 cases**, plus **7 functional future cases** and **6 deferred security gates**. Not run is the starting state, not a pass. Fill the selected scope and counts after execution; list blocked prerequisites separately.

| Category                                           | Count or notes                |
| -------------------------------------------------- | ----------------------------- |
| Cases selected for this run                        |                               |
| Pass                                               | 0                             |
| Fail                                               | 0                             |
| Blocked                                            | 0                             |
| Not run                                            | 111 before scope selection    |
| Not applicable with reasons                        | 0                             |
| Deferred future cases                              | 13 (7 functional, 6 security) |
| Required P0 cases still failing or blocked         |                               |
| Live Canvas and Stripe checks completed            |                               |
| Manual keyboard and screen-reader checks completed |                               |
| Decision and accepted gaps                         | Not reviewed                  |

## Case results

Use Pass, Fail, Blocked, Not run or Not applicable. In Actual result, describe the observed outcome instead of repeating the expected result. In Evidence, give sanitized screenshots/logs, exact relevant IDs, automated assertion/run references and any defect link. A green test command supports only the assertions it actually ran. Missing live credentials do not turn a live case into an automated pass.

| Case                                                          | Priority and mode | Result  | Actual result | Evidence or reason |
| ------------------------------------------------------------- | ----------------- | ------- | ------------- | ------------------ |
| [AUTH-01](use-cases.md#identity-and-sessions)                 | P0 B              | Not run |               |                    |
| [AUTH-02](use-cases.md#identity-and-sessions)                 | P0 B              | Not run |               |                    |
| [AUTH-03](use-cases.md#identity-and-sessions)                 | P0 B              | Not run |               |                    |
| [AUTH-04](use-cases.md#identity-and-sessions)                 | P0 B              | Not run |               |                    |
| [AUTH-05](use-cases.md#identity-and-sessions)                 | P0 C              | Not run |               |                    |
| [AUTH-06](use-cases.md#identity-and-sessions)                 | P0 C              | Not run |               |                    |
| [AUTH-07](use-cases.md#identity-and-sessions)                 | P0 A              | Not run |               |                    |
| [AUTH-08](use-cases.md#identity-and-sessions)                 | P0 A              | Not run |               |                    |
| [BROWSE-01](use-cases.md#public-course-browsing)              | P0 B              | Not run |               |                    |
| [BROWSE-02](use-cases.md#public-course-browsing)              | P1 B              | Not run |               |                    |
| [BROWSE-03](use-cases.md#public-course-browsing)              | P1 B              | Not run |               |                    |
| [BROWSE-04](use-cases.md#public-course-browsing)              | P2 B              | Not run |               |                    |
| [CANVAS-01](use-cases.md#canvas-discovery-and-course-mapping) | P0 C              | Not run |               |                    |
| [CANVAS-02](use-cases.md#canvas-discovery-and-course-mapping) | P1 C              | Not run |               |                    |
| [CANVAS-03](use-cases.md#canvas-discovery-and-course-mapping) | P1 C              | Not run |               |                    |
| [CANVAS-04](use-cases.md#canvas-discovery-and-course-mapping) | P0 C              | Not run |               |                    |
| [CANVAS-05](use-cases.md#canvas-discovery-and-course-mapping) | P0 C              | Not run |               |                    |
| [CANVAS-06](use-cases.md#canvas-discovery-and-course-mapping) | P0 C              | Not run |               |                    |
| [CANVAS-07](use-cases.md#canvas-discovery-and-course-mapping) | P0 A              | Not run |               |                    |
| [CANVAS-08](use-cases.md#canvas-discovery-and-course-mapping) | P0 A              | Not run |               |                    |
| [CANVAS-09](use-cases.md#canvas-discovery-and-course-mapping) | P1 A              | Not run |               |                    |
| [CANVAS-10](use-cases.md#canvas-discovery-and-course-mapping) | P1 A              | Not run |               |                    |
| [CANVAS-11](use-cases.md#canvas-discovery-and-course-mapping) | P1 C              | Not run |               |                    |
| [CANVAS-12](use-cases.md#canvas-discovery-and-course-mapping) | P1 A              | Not run |               |                    |
| [OFF-01](use-cases.md#offering-administration)                | P0 B              | Not run |               |                    |
| [OFF-02](use-cases.md#offering-administration)                | P0 B              | Not run |               |                    |
| [OFF-03](use-cases.md#offering-administration)                | P1 B              | Not run |               |                    |
| [OFF-04](use-cases.md#offering-administration)                | P0 B              | Not run |               |                    |
| [OFF-05](use-cases.md#offering-administration)                | P1 B              | Not run |               |                    |
| [OFF-06](use-cases.md#offering-administration)                | P0 B              | Not run |               |                    |
| [OFF-07](use-cases.md#offering-administration)                | P0 B              | Not run |               |                    |
| [OFF-08](use-cases.md#offering-administration)                | P1 B              | Not run |               |                    |
| [OFF-09](use-cases.md#offering-administration)                | P1 B              | Not run |               |                    |
| [OFF-10](use-cases.md#offering-administration) | P0 B | Not run | | |
| [IMAGE-01](use-cases.md#course-display-images)                | P0 B              | Not run |               |                    |
| [IMAGE-02](use-cases.md#course-display-images)                | P1 B              | Not run |               |                    |
| [IMAGE-03](use-cases.md#course-display-images)                | P0 B              | Not run |               |                    |
| [IMAGE-04](use-cases.md#course-display-images)                | P0 A              | Not run |               |                    |
| [IMAGE-05](use-cases.md#course-display-images)                | P0 A              | Not run |               |                    |
| [IMAGE-06](use-cases.md#course-display-images)                | P1 A              | Not run |               |                    |
| [REG-01](use-cases.md#registration-and-learner-records)       | P0 B              | Not run |               |                    |
| [REG-02](use-cases.md#registration-and-learner-records)       | P0 A              | Not run |               |                    |
| [REG-03](use-cases.md#registration-and-learner-records)       | P0 B              | Not run |               |                    |
| [REG-04](use-cases.md#registration-and-learner-records)       | P1 A              | Not run |               |                    |
| [REG-05](use-cases.md#registration-and-learner-records)       | P0 B              | Not run |               |                    |
| [REG-06](use-cases.md#registration-and-learner-records)       | P1 A              | Not run |               |                    |
| [REG-07](use-cases.md#registration-and-learner-records)       | P1 B              | Not run |               |                    |
| [REG-08](use-cases.md#registration-and-learner-records)       | P1 B              | Not run |               |                    |
| [REG-09](use-cases.md#registration-and-learner-records)       | P1 B              | Not run |               |                    |
| [PAY-01](use-cases.md#payments-and-checkout-return)           | P0 B              | Not run |               |                    |
| [PAY-02](use-cases.md#payments-and-checkout-return)           | P0 S              | Not run |               |                    |
| [PAY-03](use-cases.md#payments-and-checkout-return)           | P0 S              | Not run |               |                    |
| [PAY-04](use-cases.md#payments-and-checkout-return)           | P1 S              | Not run |               |                    |
| [PAY-05](use-cases.md#payments-and-checkout-return)           | P0 A              | Not run |               |                    |
| [PAY-06](use-cases.md#payments-and-checkout-return)           | P0 A              | Not run |               |                    |
| [PAY-07](use-cases.md#payments-and-checkout-return)           | P1 S              | Not run |               |                    |
| [PAY-08](use-cases.md#payments-and-checkout-return)           | P1 A              | Not run |               |                    |
| [PAY-09](use-cases.md#payments-and-checkout-return)           | P1 B              | Not run |               |                    |
| [REC-01](use-cases.md#recovery-without-a-worker)              | P0 B              | Not run |               |                    |
| [REC-02](use-cases.md#recovery-without-a-worker)              | P1 B              | Not run |               |                    |
| [REC-03](use-cases.md#recovery-without-a-worker)              | P0 B              | Not run |               |                    |
| [REC-04](use-cases.md#recovery-without-a-worker)              | P0 B              | Not run |               |                    |
| [REC-05](use-cases.md#recovery-without-a-worker)              | P0 A              | Not run |               |                    |
| [REFUND-01](use-cases.md#transactions-and-refunds)            | P1 S              | Not run |               |                    |
| [REFUND-02](use-cases.md#transactions-and-refunds)            | P0 S              | Not run |               |                    |
| [REFUND-03](use-cases.md#transactions-and-refunds)            | P1 A              | Not run |               |                    |
| [REFUND-04](use-cases.md#transactions-and-refunds)            | P1 S              | Not run |               |                    |
| [STAFF-01](use-cases.md#staff-access-and-reporting)           | P0 A              | Not run |               |                    |
| [STAFF-02](use-cases.md#staff-access-and-reporting)           | P0 B              | Not run |               |                    |
| [STAFF-03](use-cases.md#staff-access-and-reporting)           | P1 B              | Not run |               |                    |
| [CONTENT-01](use-cases.md#collections-and-sales-content)      | P1 B              | Not run |               |                    |
| [CONTENT-02](use-cases.md#collections-and-sales-content)      | P1 B              | Not run |               |                    |
| [CONTENT-03](use-cases.md#collections-and-sales-content)      | P1 B              | Not run |               |                    |
| [CONTENT-04](use-cases.md#collections-and-sales-content)      | P1 B              | Not run |               |                    |
| [CONTENT-05](use-cases.md#collections-and-sales-content)      | P1 B              | Not run |               |                    |
| [CONTENT-06](use-cases.md#collections-and-sales-content)      | P0 A              | Not run |               |                    |
| [ACCESS-01](use-cases.md#accessibility-and-browser-behavior)  | P0 B              | Not run |               |                    |
| [ACCESS-02](use-cases.md#accessibility-and-browser-behavior)  | P0 B              | Not run |               |                    |
| [ACCESS-03](use-cases.md#accessibility-and-browser-behavior)  | P1 B              | Not run |               |                    |
| [ACCESS-04](use-cases.md#accessibility-and-browser-behavior)  | P1 A              | Not run |               |                    |
| [API-01](use-cases.md#api-and-operational-regression)         | P0 A              | Not run |               |                    |
| [API-02](use-cases.md#api-and-operational-regression)         | P0 A              | Not run |               |                    |
| [API-03](use-cases.md#api-and-operational-regression)         | P1 A              | Not run |               |                    |
| [OPS-01](use-cases.md#api-and-operational-regression)         | P0 D              | Not run |               |                    |
| [OPS-02](use-cases.md#api-and-operational-regression)         | P1 D              | Not run |               |                    |
| [OPS-03](use-cases.md#api-and-operational-regression)         | P1 D              | Not run |               |                    |
| [OPS-04](use-cases.md#api-and-operational-regression)         | P1 D              | Not run |               |                    |

## Security case results

Use the [security specification](security-test-cases.md). Record exact assertions exercised, plus sanitized evidence and findings. For SEC-04, confirmation of demo impersonation is a known authentication gap/Fail, not a passed real authentication control. Functional passes and mocked-provider passes do not clear it.

| Case                             | Priority and mode | Result  | Actual result | Evidence or reason |
| -------------------------------- | ----------------- | ------- | ------------- | ------------------ |
| [SEC-01](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-02](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-03](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-04](security-test-cases.md) | P0 D              | Not run |               |                    |
| [SEC-05](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-06](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-07](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-08](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-09](security-test-cases.md) | P1 A              | Not run |               |                    |
| [SEC-10](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-11](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-12](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-13](security-test-cases.md) | P1 A              | Not run |               |                    |
| [SEC-14](security-test-cases.md) | P1 A              | Not run |               |                    |
| [SEC-15](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-16](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-17](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-18](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-19](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-20](security-test-cases.md) | P0 A              | Not run |               |                    |
| [SEC-21](security-test-cases.md) | P1 A              | Not run |               |                    |
| [SEC-22](security-test-cases.md) | P1 A              | Not run |               |                    |
| [SEC-23](security-test-cases.md) | P0 D              | Not run |               |                    |
| [SEC-24](security-test-cases.md) | P1 D              | Not run |               |                    |

## Future cases

Do not count these as failures or passes against the current demo. Move a case into the executed scope only when its feature and approved integration prerequisites exist.

| Case                                               | Feature                                   | Status   | Notes |
| -------------------------------------------------- | ----------------------------------------- | -------- | ----- |
| [FUTURE-01](use-cases.md#future-integration-cases) | Real learner authentication               | Deferred |       |
| [FUTURE-02](use-cases.md#future-integration-cases) | Canvas identity linking                   | Deferred |       |
| [FUTURE-03](use-cases.md#future-integration-cases) | Account creation after payment            | Deferred |       |
| [FUTURE-04](use-cases.md#future-integration-cases) | Real Canvas enrollment and removal        | Deferred |       |
| [FUTURE-05](use-cases.md#future-integration-cases) | Grades and progress                       | Deferred |       |
| [FUTURE-07](use-cases.md#future-integration-cases) | Mapping health and reviewed remapping     | Deferred |       |
| [FUTURE-08](use-cases.md#future-integration-cases) | Scheduled discovery and hosted deployment | Deferred |       |

## Deferred security gates

These requirements remain relevant for hosted learner use. Keep them visible even when the local prototype's selected checks pass.

| Case                                                                           | Priority | Status   | Notes |
| ------------------------------------------------------------------------------ | -------- | -------- | ----- |
| [SEC-F01](security-test-cases.md#required-hardening-before-hosted-learner-use) | P0       | Deferred |       |
| [SEC-F02](security-test-cases.md#required-hardening-before-hosted-learner-use) | P0       | Deferred |       |
| [SEC-F03](security-test-cases.md#required-hardening-before-hosted-learner-use) | P1       | Deferred |       |
| [SEC-F04](security-test-cases.md#required-hardening-before-hosted-learner-use) | P0       | Deferred |       |
| [SEC-F05](security-test-cases.md#required-hardening-before-hosted-learner-use) | P1       | Deferred |       |
| [SEC-F06](security-test-cases.md#required-hardening-before-hosted-learner-use) | P0       | Deferred |       |

## Findings and retests

| Finding | Case and affected IDs | Expected versus actual | Severity and owner | Follow-up or existing issue | Retest commit and result |
| ------- | --------------------- | ---------------------- | ------------------ | --------------------------- | ------------------------ |
|         |                       |                        |                    |                             |                          |

Create a new GitHub issue only when separately requested. Preserve failed evidence alongside a successful retest.

## Cleanup and handoff

| Item                                                              | Completed or remaining action |
| ----------------------------------------------------------------- | ----------------------------- |
| Simulation restored to original setting or Normal                 |                               |
| Site-wide Explore picks restored                                  |                               |
| Test offerings unpublished and remaining IDs recorded             |                               |
| Synthetic learner cleanup or evidence retention decision          |                               |
| Test staff and authorization changes restored as appropriate      |                               |
| App/listener/environment state left for the next tester           |                               |
| Backup and restore evidence retained                              |                               |
| Required live, keyboard or screen-reader checks still outstanding |                               |
| Security findings and known mock-identity limitations retained    |                               |
| Final reviewer and decision                                       |                               |
