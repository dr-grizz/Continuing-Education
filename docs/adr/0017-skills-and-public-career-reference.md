# ADR 0017: Assessed skills and public career reference

Accepted October 28, 2026 at the project owner's request.

The portal owns institutional assessment statements. O*NET owns occupational
definitions and relevance; BLS owns published labor-market estimates. Selecting
an occupation or skill in the reference explorer does not establish learner
mastery, eligibility, completion, or an award.

Versioned O*NET 31.0 skills, occupation links, BLS May 2025 regional wages and
2025–2035 national projections are imported into the existing PostgreSQL database
through migration 028. Import validation completes before a transaction activates
both releases. Source URLs and SHA-256 hashes are recorded; old releases remain
immutable so issued credentials keep their definitions. Missing and suppressed
wages remain null, and projection annual openings are converted from thousands
to individual jobs per year. State wages do not turn national projections into
state projections. SOC statistics can aggregate multiple O*NET occupations.

Staff select up to 20 canonical skills in the badge designer and describe how
each is assessed. The server resolves source metadata rather than trusting
browser-provided descriptions. Approved and issued snapshots retain these
definitions and institutional statements. A paired certificate refers to the
same accomplishment; existing issued awards are never rewritten by data imports.
Learner access continues to require the approved private identity mapping and
award ownership.

O*NET Web Services v2 is an explicitly authorized external reference adapter,
separate from simulated payment/Canvas provisioning. It uses a private
`ONET_API_KEY` header on server-side GET requests to the fixed official host.
Only keyword search and national outlook are exposed through explicit public
broker routes, with same-origin browser POST requests, bounded responses,
timeouts, deduplicated 24-hour caching and per-process provider ceilings.
There is no browser key, automatic learner-data upload, or background polling.
Multiple API processes need a shared provider limit before scaling this adapter.

`/skills` and its exact assets/reference endpoints are available without
registration, including in Basic-gated demo configurations. This narrowly amends
ADR 0011's all-path audience gate; staff credential operations and learner records
retain their existing authorization. Public POST requests still pass CSRF and
hosted request limits. Displayed API information includes a prominent O*NET Web
Services link and original outlook wording. A public production URL still needs
to be deployed and registered with O*NET; localhost is only a development preview.

References: [official samples](https://github.com/onetcenter/web-services-v2-samples),
[API reference](https://services.onetcenter.org/reference/start/overview),
[terms](https://services.onetcenter.org/terms),
[database license](https://www.onetcenter.org/license_db.html),
[BLS wages](https://www.bls.gov/oes/tables.htm),
[BLS projections](https://www.bls.gov/emp/tables/occupational-projections-and-characteristics.Htm).
