# Azure hosting proposal — not deployed

Azure is a provisional target supplied by the user, not a confirmed subscription or resource assignment. This document proposes the next implementation target and records constraints discovered in the local service. It contains no credentials and creates no Azure resources.

## Recommended managed-service target

Proposed architecture:

```text
Canvas 9943 --read-only--> scheduled completion worker
                                   |
                                   v
CU Portal --private server API--> badge service on Azure Container Apps
                                   |          |
                                   v          v
                            managed database  institutional issuer adapter
                                              |
                                   stable HTTPS verification domain
```

Use Azure Container Apps for the service and worker, a managed PostgreSQL database for durable credential/audit/identity records, and Key Vault references with managed identity for service secrets. This is a proposed target: the current implementation uses SQLite and a local signing key and needs database and issuer adapters before deployment. Microsoft documents [Key Vault references through managed identities](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets) and [Container Apps identities](https://learn.microsoft.com/en-us/azure/container-apps/managed-identity).

Do **not** mount the current SQLite WAL database on Azure Files as the production persistence strategy: [SQLite states that WAL does not work over network filesystems](https://www.sqlite.org/wal.html), while [Container Apps storage mounts](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts) provide Azure Files network shares. Container-local or replica-scoped storage is not a substitute for durable award records.

If IT prefers a small Azure VM for the technical pilot, local SQLite on a managed disk is a separate alternative that avoids the network filesystem issue, but requires VM patching, process management, HTTPS proxying, protected backups and monitoring. Do not silently switch architectures or deploy either option without an assigned owner.

## Public and private boundaries

- Expose only the health check, trusted issuer public key metadata, and opt-in badge verification/status through the public HTTPS entry point.
- Put issuance, revocation and learner listing/download behind institutional server authentication and authorization; never publish portal bearer tokens in JavaScript.
- Disable all `/api/demo/*` endpoints, remove the fictional issuer UI from the production entry point, and require explicit non-demo configuration.
- Use a stable issuer domain and key provenance established by Cedarville. The current random local key is not institutional issuer authority.
- Persist sharing consent, learner identity mapping, rule versions, raw evidence, current status, and attributable staff audit events; keep assessment scores and private revocation reasons out of public responses.

## Local-to-Azure implementation work

1. Replace the SQLite store with a managed database adapter and migrations; enforce a unique award key for learner + achievement + rule version and transactionally record issuance/audit events.
2. Replace the CU pilot envelope with the selected standards issuer (Badge Engine adapter or another validated Open Badges 3.0 implementation); test download, external verification, wallet import, revocation and signing-key rotation. Key Vault storage alone does not make the current envelope standards compatible.
3. Add institutional authentication, scoped reader/issuer permissions, authenticated learner sharing controls, and staff identity in audit events.
4. Introduce an explicitly configured public HTTPS origin and proxy trust, replacing the current loopback-only gate without trusting browser-supplied forwarded headers.
5. Add scheduled polling, exponential backoff, idempotent retries and a staff exception queue; freeze the approved course rule and poll only mapped pilot learners.
6. Add metrics, alerts, backup restoration tests and rate/request limits; build a container image that excludes credentials, local data, screenshots and development fixtures.
7. Reconcile the course setup in `COURSE-9943-PLAN.md`, map the internal pilot learner, run passing/failing/duplicate/revocation tests, and obtain institutional release approval.

## IT decisions needed before infrastructure creation

Azure tenant/subscription and resource group; approved region; hosting owner; badge issuer and verification domain; portal-to-service network route; managed database choice; secrets/signing-key policy; records retention; budget; and operational support responsibility. No prices or capacity estimates have been inferred.

References: [Container Apps security](https://learn.microsoft.com/en-us/azure/container-apps/security), [Key Vault secret references](https://learn.microsoft.com/en-us/azure/container-apps/manage-secrets), [storage lifetimes and mounts](https://learn.microsoft.com/en-us/azure/container-apps/storage-mounts), [SQLite WAL constraints](https://www.sqlite.org/wal.html), [Open Badges implementation guide](https://standards.1edtech.org/open-badges/guides/standards/v3p0/impl).
