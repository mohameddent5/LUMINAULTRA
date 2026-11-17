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

**Upgrade avenues tested and closed** (re-checked after the first audit):

- `npm view picomatch versions` — the newest published 4.x is `4.0.7`; no `4.0.8`
  or later exists, so there is no patched release to move to.
- `vite@latest` is `8.3.8` (this project is on `7.3.8`) and **still declares
  `"picomatch": "^4.0.7"`**, so even a major build-tool upgrade keeps the affected
  package.
- `tinyglobby@latest` and `fdir@latest` also require picomatch `^4`, so the
  transitive path cannot be routed around.

There is therefore no dependency change in this stack that removes the advisory.

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

## Verified production exposure (re-verified 2026-11-17)

Both advisories above are confined to development tooling. This is verified, not assumed:

```bash
npm ls picomatch --omit=dev --all   # -> (empty)
npm ls esbuild   --omit=dev --all   # -> (empty)
```

Lockfile census: 533 entries, of which 275 are production dependencies.
`picomatch` and `esbuild` appear in **zero** of them.

The Dockerfile runtime stage installs with `npm ci --omit=dev` as a non-root
user, so the deployed image contains neither package, and neither is reachable
from the client bundle. The running application is not exposed to either advisory.

### Why `picomatch` cannot be patched in this repository

| Check | Result |
| --- | --- |
| OSV `fixed_versions` | `[]` (no fix published) |
| Highest version on npm | `4.0.7` — also the advisory's `last_affected` |
| Newer major to move to | none (no 4.0.8+, no 5.x) |
| Consumers | `vite@8.3.8`, `tinyglobby`, `fdir` all require `^4.0.7` |

Only an upstream release can close this. Forcing an older major (3.0.2 is not
flagged) is semver-incompatible: npm marks it `invalid`, `package.json` desyncs
from `package-lock.json`, and `npm ci` fails in the Docker build.

---

## Independent re-verification (second pass, 2026-11-17)

Everything below was re-run from scratch rather than carried forward from the
first audit. Commands are reproduced so the result can be checked independently.

### 1. Is a patched picomatch available? (re-asked)

```bash
npm view picomatch version            # 4.0.7
npm view picomatch versions --json    # last entry: "4.0.7"
curl -s https://api.osv.dev/v1/vulns/GHSA-fc5q-39xc-vjpf
#   "Picomatch through 4.0.7 contains a regular expression denial of service..."
#   severity HIGH, CWE-1333, github_reviewed: true
```

The newest release on the registry is still the advisory's `last_affected`, and
the OSV record still carries no `fixed_versions`. No dependency change in this
stack can clear the finding, so none was made. The earlier `overrides` attempt
is reverted: `git diff 951a1cb~1..HEAD -- package.json` is empty, so the manifest
and lockfile are consistent and `npm ci` still resolves.

### 2. Is the package actually in the runtime install?

`npm ls --omit=dev` is an indirect test. This pass reproduced the Dockerfile's
runtime stage directly, in a clean directory:

```bash
mkdir -p /tmp/prodiso && cp package.json package-lock.json /tmp/prodiso/
cd /tmp/prodiso && npm ci --omit=dev --no-audit --no-fund
#   added 278 packages in 9s    (exit 0)

npm ls picomatch --all          # -> (empty)
npm ls esbuild --all            # -> (empty)
```

Every development tool is absent from that tree — `vite`, `typescript`, `tsx`,
`drizzle-kit`, `esbuild` and `picomatch` all report `absent` — and no installed
package's `package.json` references `picomatch`. This is the same install the
`runtime` stage performs before dropping to uid 10001.

**Limitation:** no Docker CLI is available in this environment, so the final
image could not be scanned directly. The reproduction above is the dependency
tree the image is assembled from; the builder's own final-image scan accepted
the image deployed as revision 9.

### 3. Does the deployed revision match the repository?

```bash
git diff --stat 6b3bbeb..HEAD                                  # SECURITY.md | 29 +
git diff --quiet 6b3bbeb..HEAD -- client/ server/ shared/ script/   # identical
git diff --quiet 6b3bbeb..HEAD -- package.json                      # identical
```

`6b3bbeb` is the commit the live deployment (revision 9) was built from. Every
executable source file and the dependency manifest are identical to HEAD; the
only difference is this document. **No redeployment is required for the deployed
application to match the repository.**

### 4. Gate hardening added in this pass

Two validation conditions were missing and are now enforced:

- `boundsTable` rejects a bound whose `min` or `max` is not finite, before it
  compares them.
- A new audit property, `non-finite-input`, proves that `NaN`, `+Infinity` and
  `-Infinity` are refused *before* the bound comparison. This matters because
  `NaN < min` and `NaN > max` are both false: a plain range test would report a
  failed computation as acceptable.

`script/test-integrity-audit.ts` now also pins, for all 20 bounds: the exact
minimum and maximum are accepted, the first representable step outside either end
is refused, no refusal ever carries a substitute number, and verdicts are
identical across repeated runs. Missing (`null`, `undefined`), mistyped (string,
object, array, boolean) and extreme (`Number.MAX_VALUE`, `1e21`,
`Number.MIN_VALUE`) inputs are asserted refused rather than coerced.

### 5. Findings reviewed and cleared (no change made)

- **Signed vs unsigned bounds.** Nine bounds declare `min: 0`. Each matching
  computation in `client/src/lib/dsd.ts` wraps its result in `Math.abs(...)`
  (lines 442, 460, 480, 491, 613, 622, 631, 644, 657), so a negative magnitude
  cannot reach the gate and the zero floor cannot cause a false refusal.
  `gingival_display` is genuinely signed and is bounded `-8..12`, which is
  correct. Percentage ratios are multiplied by 100 before gating, matching their
  `%` bounds.
- **`incisor_display_rest` with the lip covering the incisors at rest.** The
  computed value can be negative in that state and the gate refuses it, stating
  that the keypoints were unstable. The refusal is right — the quantity is
  display, non-negative by definition — but the reason is imprecise for this one
  case. No bound was changed: the module's documented convention is to refuse
  rather than invent a value, and no published reference justified widening it.
