# Security & Dependency Risk Register

Scope: this repository is a **demonstration prototype** for a clinical-screening
workflow. It is not a medical device and makes no regulatory claim. This document
records what the dependency audit found, what was done about it, and what remains
open — including the one finding that **cannot currently be fixed by this project**.

Last audited: OSV-Scanner 2.7.0, policy `workspace-dependencies-v1`,
498 resolved packages, **2 findings (1 blocking)**.

---

## Open findings

### 1. picomatch — HIGH (blocking) — **no fix exists upstream**

| Field | Value |
| --- | --- |
| Advisory | [GHSA-fc5q-39xc-vjpf](https://osv.dev/GHSA-fc5q-39xc-vjpf) / CVE-2026-112366 |
| Severity | HIGH, CVSS 3.1 **8.7** (`AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`) |
| Installed | `picomatch@4.0.7` |
| Fixed versions | **none published** |
| Affected range | `introduced 0` → `last_affected 4.0.7` (per the OSV record) |
| Path | `vite@7.3.8` → `fdir@6.5.0`, `tinyglobby@0.2.17` → `picomatch@4.0.7` |
| Dev only | **yes** — `"dev": true` in `package-lock.json` |

**Why it is not fixed:** the advisory's affected range covers *every published
version* through the current latest, and `fixed_versions` is empty. Upgrading
cannot clear it, and downgrading cannot either (all versions are affected, and
Vite 7 requires picomatch `^4`). The upstream fix is
[micromatch/picomatch#194](https://github.com/micromatch/picomatch/pull/194),
which has not shipped in a release. `npm view picomatch version` returns `4.0.7`,
so there is nothing newer to move to.

**What was done:** this project's own `package.json` override was pinning the
vulnerable `4.0.4`. It now pins the latest patch (`4.0.7`). Re-scanning confirmed
the advisory still applies — this is a record of the finding, not a claim of a fix.

**Runtime exposure:** the vulnerable code is a glob-pattern parser
(`analyzeRepeatedExtglob`). It is reachable only while *building* the client, with
glob patterns authored by developers in this repository — never from request
input. The `Dockerfile` is two-stage and the runtime stage installs with
`npm ci --omit=dev`, so picomatch is **not present in the deployed image**; the
client bundle likewise does not include it. Exploitation would require an attacker
to control the build's glob patterns.

**What would close it:** a picomatch release above `4.0.7`. When one exists, bump
the `picomatch@^4` override in `package.json`, run `npm install`, and re-run the
dependency scan plus `npm run check && npm run test:integrity && npm run build`.

### 2. esbuild — MODERATE (non-blocking) — fix available, deliberately deferred

| Field | Value |
| --- | --- |
| Advisory | [GHSA-67mh-4wv8-2f99](https://osv.dev/GHSA-67mh-4wv8-2f99) |
| Severity | MODERATE, CVSS 3.1 5.3 |
| Installed | `esbuild@0.18.20` |
| Fixed version | `0.25.0` |
| Path | `drizzle-kit` (devDependency) → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild@0.18.20` |
| Dev only | **yes** |

The advisory concerns `esbuild serve`: a malicious website can send requests to a
local development server and read the responses. This project never runs
`esbuild serve` — the server is bundled once at build time and the app is served
by Express. Reaching the fixed version requires forcing a major-version override
onto `@esbuild-kit/core-utils`, an unmaintained loader used only by the
`drizzle-kit` CLI. That change carries a real risk of breaking database tooling
for no reduction in actual exposure, so the finding is left visible instead.

---

## Controls in place

- **Two-stage image build.** Development dependencies are used only to compile the
  client and server bundle; the runtime stage installs with `npm ci --omit=dev`.
- **Non-root runtime.** The container runs as uid/gid `10001`; only `/app` is owned
  by that user.
- **OS packages refreshed** in both stages via `apk upgrade --no-cache`, on an
  Alpine-based `node:24` image (Node 24 is a supported LTS line).
- **No secrets in the repository.** Configuration is supplied through environment
  variables at runtime; nothing is committed with a credential in it.
- **Dependency pins** via `overrides` keep transitive copies of picomatch on the
  latest patch release of each major.

## Coverage caveats

- The scan covers **resolved package versions against public advisory data**. It is
  not proof that this application's source is free of vulnerabilities, and it says
  nothing about authorization logic or runtime behaviour.
- 6 packages resolve from local or unknown sources and therefore fall outside
  public advisory coverage.
- A green scan is a snapshot: it must be repeated when dependency files change.

## Reporting

This is a demonstration project. If you find a vulnerability in application code,
please open an issue describing the impact and reproduction steps; do not include
real patient data or credentials in the report.
