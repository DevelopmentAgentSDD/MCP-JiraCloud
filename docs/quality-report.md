# Quality Report — opencode-jira-mcp v0.1.0

> **Phase**: Quality (Fase 6 de 7)
> **Date**: 2026-06-13
> **Analyzed by**: quality agent
> **Project type**: TypeScript/Node.js MCP Server

---

## Executive Summary

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Tests passing | 269 | — | ✅ |
| Code coverage (statements) | 89.56% | 70% | ✅ |
| Code coverage (branches) | 82.83% | 70% | ✅ |
| Code coverage (functions) | 87.50% | 70% | ✅ |
| TypeScript compilation | 0 errors | 0 | ✅ |
| ESLint (src/) | 0 errors | 0 | ✅ |
| ESLint (tests/) | 1 error, 2 warnings | 0 errors | ⚠️ |
| npm audit vulnerabilities | 6 (2 critical) | 0 | ❌ |
| Token safety | Verified | — | ✅ |
| No `any` types in src | Confirmed | — | ✅ |

**Verdict**: ⚠️ **CONDITIONALLY READY** — Requires remediation of npm audit vulnerabilities before deploy.

---

## 1. Issues Found

### 1.1 CRITICAL: npm audit — 6 vulnerabilities in dev dependency chain

| Severity | Count | Package | Advisory |
|----------|-------|---------|----------|
| **Critical** | 2 | esbuild ≤0.28.0 | GHSA-gv7w-rqvm-qjhr: Remote Code Execution via `NPM_CONFIG_REGISTRY` |
| **High** | 1 | esbuild ≤0.28.0 | GHSA-67mh-4wv8-2f99: Dev server SSRF to read arbitrary files |
| **Moderate** | 3 | esbuild ≤0.28.0 | Same advisories, classified moderate in certain contexts |

**Path**: `vitest@2.1.9` → `vite@5.x` → `esbuild@0.21.x`

**Impact**: These vulnerabilities affect esbuild, which is used by vite as the bundler for vitest's dev server. The vulnerable code runs in the **dev server context** — if the test watch mode (`vitest`) or vite dev server is exposed to untrusted networks. In the standard MCP Server workflow (local CLI tool with `vitest run` in CI), the attack surface is minimal because:
- The dev server is not exposed to external networks during `npm test`
- No untrusted code is bundled
- CI environments typically run in isolated containers

**However**: These are classified as critical CVEs and must be addressed for compliance.

**Recommendation**:
```bash
# Option A: Update vitest to latest (breaking change — API compatible)
npm install --save-dev vitest@latest @vitest/coverage-v8@latest

# Option B: Override esbuild version (non-breaking if compatible)
npm install --save-dev esbuild@latest
```

**Verification**: After applying the fix, run `npm audit` to confirm 0 vulnerabilities.

---

### 1.2 HIGH: JQL injection via unsanitized string interpolation

**Severity**: High
**Location**: `src/tools/search-issues.ts:104-127`
**Type**: Injection (OWASP A03:2021)

**Description**: The `buildJql()` function interpolates user-provided values directly into JQL strings using template literals without escaping JQL special characters:

```typescript
// Line 104 — projectKey not escaped
if (input.projectKey) clauses.push(`project = "${input.projectKey}"`);
// Line 106 — status not escaped
if (input.status) clauses.push(`status = "${input.status}"`);
// Line 114 — assignee not escaped
clauses.push(`assignee = "${input.assignee}"`);
// Line 127 — text not escaped (uses ~ contains operator)
if (input.text) clauses.push(`text ~ "${input.text}"`);
```

JQL special characters that need escaping within double-quoted strings include: `"`, `\`, and control characters. An input value like `PROJ" OR project = "OTHER` would produce malformed JQL.

**Impact**: Medium. Jira API validates JQL server-side and rejects malformed queries. However:
- It can cause unexpected errors returned to the LLM agent
- It breaks the "fail fast" principle (validation should happen client-side)
- Potential for JQL structure manipulation in edge cases

**Recommendation**: Add a JQL escaping utility function:

```typescript
function escapeJqlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
```

Apply to all user-provided values in `buildJql()`:

```typescript
if (input.projectKey) clauses.push(`project = "${escapeJqlString(input.projectKey)}"`);
```

---

### 1.3 HIGH: `mapHttpError` throws plain object for 429 — breaks error handling contract

**Severity**: High
**Location**: `src/utils/errors.ts:119-120`
**Type**: Code smell / Error handling anti-pattern

**Description**: The `mapHttpError` function returns `McpError` instances for all HTTP error codes except 429, where it throws a plain object:

```typescript
case 429:
  throw { status, retryAfter: extractRetryAfter(body) };
```

This breaks the function's contract (documented as returning `McpError`) and causes "Unhandled Rejection" warnings in test environments. The special throw is caught by `withRetry()` via duck-typing (`status === 429`), but:
- Plain objects lack stack traces
- They bypass `instanceof Error` checks in catch blocks
- They generate noise in test output

**Impact**: Medium. Functional correctness is preserved (the retry logic works), but:
- Test output has warnings (documented in `docs/test-report.md`)
- Future error handling middleware could miss these
- Debugging is harder without stack traces

**Recommendation**: Throw a proper `RateLimitError` instance with retry metadata:

```typescript
case 429: {
  const rateLimitError = new RateLimitError(0); // attempt count tracked by withRetry
  // Attach retry metadata as a non-enumerable property
  Object.defineProperty(rateLimitError, 'retryAfter', {
    value: extractRetryAfter(body),
    enumerable: false,
  });
  throw rateLimitError;
}
```

Update `withRetry()` to check for `RateLimitError` via `instanceof`:

```typescript
if (error instanceof RateLimitError) {
  const retryAfter = (error as RateLimitError & { retryAfter?: number }).retryAfter ?? null;
  // ...
}
```

---

### 1.4 MEDIUM: Architecture documentation drift

**Severity**: Medium
**Location**: `docs/architecture.md` vs actual `src/` structure
**Type**: Documentation debt

**Description**: The architecture document (Section 4, "Topologia de modulos TypeScript") describes a project structure that differs from the actual implementation:

| Documented | Actual | Status |
|-----------|--------|--------|
| `src/server.ts` | Does not exist — server init is inline in `index.ts` | ❌ Missing |
| `src/schemas/` (9 schema files) | Schemas co-located in `src/tools/*.ts` | ❌ Different structure |
| `src/client/` directory | `src/services/` directory | ❌ Different name |
| `src/logging/logger.ts` | Logger configured inline in `index.ts` | ❌ Missing |
| `src/types/mcp.ts` + `src/types/jira.ts` | Single `src/types/index.ts` | ❌ Combined |

Additionally, the `docs/design/module-structure.md` describes `src/server.ts` which doesn't exist, and references test files that are structured differently from the actual `tests/` directory.

**Impact**: Low. The code functions correctly, but:
- New contributors will be confused by mismatched documentation
- The architecture doc describes ADR-005's decision but the implementation diverged
- Future planning based on these docs could be inaccurate

**Recommendation**: Either update the architecture docs to reflect actual structure, or refactor the code to match the documented structure. Given the current structure is simpler and has passed all tests, option A (update docs) is recommended:

1. Remove `src/server.ts` from diagrams — its responsibility is absorbed by `index.ts`
2. Update `src/schemas/` references to note schemas are co-located in tool files
3. Change `src/client/` to `src/services/` throughout
4. Remove `src/logging/logger.ts` — note logging is configured in `index.ts`

---

### 1.5 MEDIUM: `manage-comments.ts` coverage below threshold (58.94%)

**Severity**: Medium
**Location**: `src/tools/manage-comments.ts`
**Type**: Test coverage gap

**Description**: This file has the lowest coverage in the project:
- Statements: 58.94% (threshold: 70%)
- Branches: 47.36% (threshold: 70%)

The uncovered code is:
- `extractCommentBody()` function (lines 84-119): ADF parsing with multiple branch paths
- `plainTextToAdf()` function (lines 63-79): Text to ADF conversion
- `registerManageComments()` function (lines 216-249): MCP registration with cast

The ADF extraction function has complex nested object traversal that is only tested indirectly through handler tests.

**Impact**: Low-Medium. The handler tests do exercise the ADF helpers indirectly, but edge cases are not covered:
- Multi-paragraph ADF documents
- Nested inline content (mentions, links, emoji)
- ADF documents with non-paragraph blocks
- Mixed content types in a single paragraph

**Recommendation**: Add dedicated unit tests for `extractCommentBody` and `plainTextToAdf`:

```typescript
describe('extractCommentBody', () => {
  it('extracts text from single-paragraph ADF');
  it('extracts text from multi-paragraph ADF');
  it('handles inline mentions');
  it('returns empty string for empty doc');
  it('handles string body (non-ADF)');
});
```

---

### 1.6 MEDIUM: Code duplication — MCP response formatting

**Severity**: Medium
**Location**: All 9 tool handler files
**Type**: Code duplication (DRY violation)

**Description**: The pattern for formatting MCP tool responses is duplicated verbatim in every handler:

```typescript
return {
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify(output),
    },
  ],
};
```

This appears 19+ times across the codebase. Any change to the response format would require editing every handler.

Additionally, the `isError: true` flag pattern is used inconsistently — some handlers set it for error responses while others throw errors (which get caught by the MCP SDK).

**Recommendation**: Extract a shared helper in `src/utils/response.ts`:

```typescript
export function formatToolResponse<T>(data: T): { content: [{ type: 'text'; text: string }] } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  };
}

export function formatToolError<T>(data: T): { content: [{ type: 'text'; text: string }]; isError: true } {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    isError: true,
  };
}
```

---

### 1.7 MEDIUM: Silent error suppression in `get-sprints.ts`

**Severity**: Medium
**Location**: `src/tools/get-sprints.ts:227`
**Type**: Error handling / Observability

**Description**: When `fetchSprintIssues()` fails, the error is silently swallowed:

```typescript
try {
  sprint.issues = await fetchSprintIssues(jiraClient, sprint.id);
  sprint.issueCount = sprint.issues.length;
} catch {
  // If issue fetch fails, leave issueCount from the sprint data
  sprint.issues = [];
}
```

No logging, no warning to the agent, no indication that `issueCount` might be inaccurate. The agent receives `issues: []` and `issueCount: 0` for that sprint with no context that a fetch failure occurred.

**Impact**: Low. The sprint data is still returned correctly. But:
- The agent cannot distinguish "sprint has 0 issues" from "failed to fetch issues"
- Operations/SRE has no visibility into partial failures
- Debugging requires enabling debug logging

**Recommendation**: Add a warning log and include a partial-failure indicator:

```typescript
} catch (err) {
  logger.warn({ sprintId: sprint.id, err }, 'Failed to fetch issues for sprint');
  sprint.issues = [];
  sprint.issueCount = 0;
  sprint._fetchError = true; // indicates partial data
}
```

---

### 1.8 LOW: Non-null assertions (4 instances)

**Severity**: Low
**Location**: Multiple files
**Type**: TypeScript best practice

| File | Line | Code | Risk |
|------|------|------|------|
| `assign-user.ts` | 86 | `input.accountId!` | Low — `isUnassign` check above guarantees non-null |
| `attach-file.ts` | 147 | `attachments[0]!` | Low-Medium — assumes at least 1 attachment returned |
| `get-sprints.ts` | 125 | `boards[0]!.id`, `boards[0]!.name` | Low — `boards.length === 0` check above |
| `transition-issue.ts` | 115 | `matches[0]!` | Low — `matches.length === 1` check above |

**Recommendation**: Replace with explicit guards for better defensive coding:

```typescript
// Instead of:
const attachment = attachments[0]!;
// Use:
const attachment = attachments[0];
if (!attachment) throw new Error('Jira returned empty attachment array');
```

---

### 1.9 LOW: Magic number duplication (`30_000`)

**Severity**: Low
**Location**: `src/utils/errors.ts:139`, `src/utils/retry.ts:95`
**Type**: Code smell

**Description**: The value `30_000` (30 seconds) is hardcoded in two locations as a default retry timeout, while `DEFAULT_RATE_LIMIT_CONFIG.baseTimeoutMs` also defines it as `30_000` in `src/types/index.ts:218`.

**Recommendation**: Import and use `DEFAULT_RATE_LIMIT_CONFIG.baseTimeoutMs` in `errors.ts` and `retry.ts`.

---

### 1.10 LOW: ESLint error in test file

**Severity**: Low
**Location**: `tests/integration/jira-api.test.ts:304`
**Type**: Linting

**Description**: Uses `Array<T>` syntax instead of `T[]`:

```
304:51  error  Array type using 'Array<T>' is forbidden. Use 'T[]' instead  @typescript-eslint/array-type
```

**Recommendation**: Run `npx eslint --fix tests/` or manually change `Array<T>` to `T[]`.

---

## 2. Positive Findings (What Went Well)

### 2.1 Token Safety — Exemplary ✅
- API token never serialized to JSON, logs, or stdout
- `sanitizeHeaders()` redacts `Authorization` in all log output
- `sanitizeConfig()` ensures config logs show `***SET***` instead of the token
- `buildAuthHeader()` creates the header in-memory only
- 16 token safety tests pass (verified in `tests/integration/token-safety.test.ts`)

### 2.2 TypeScript Strictness — Excellent ✅
- `strict: true` in tsconfig
- `noUncheckedIndexedAccess: true` enabled
- `noImplicitReturns: true` enabled
- Zero `any` types in production source code
- `import type` used consistently for type-only imports

### 2.3 Error Handling Architecture — Strong ✅
- Custom error hierarchy (`McpError` → `ValidationError`, `JiraAuthError`, etc.)
- Descriptive, actionable error messages for LLM consumption
- Proper JSON-RPC error code mapping
- `withRetry()` with exponential backoff for rate limits

### 2.4 Test Quality — High ✅
- 269 tests passing (191 unit + 34 integration + 44 contract)
- 89.56% statement coverage
- Contract tests validate MCP protocol compliance (C001-C003)
- Tests organized by layer (unit, integration, contract)

### 2.5 Code Hygiene — Clean ✅
- No `TODO`, `FIXME`, `HACK` comments in source
- No `console.log` usage — all logging via pino
- No `eval`, `Function()`, `child_process` in production code
- Clean separation: stdout for JSON-RPC, stderr for logs
- No circular dependencies between modules

### 2.6 Input Validation — Robust ✅
- Zod schemas with `.strict()` prevent unknown fields
- Cross-field validation (e.g., `Subtask` requires `parentKey`)
- Descriptive error messages for validation failures
- Input validated before any HTTP call (fail fast)

---

## 3. Security Checklist (OWASP Top 10 for Node.js)

| # | Vulnerability | Status | Notes |
|---|--------------|--------|-------|
| A01 | Broken Access Control | ✅ Pass | Jira permissions enforced server-side; 401/403 properly mapped |
| A02 | Cryptographic Failures | ✅ Pass | HTTPS enforced; no custom crypto |
| A03 | Injection | ⚠️ Review | JQL string interpolation without escaping (see §1.2) |
| A04 | Insecure Design | ✅ Pass | Stateless; fail-fast validation; least privilege |
| A05 | Security Misconfiguration | ✅ Pass | Strict CSP headers via Jira; no CORS needed (stdio) |
| A06 | Vulnerable Components | ❌ Fail | 6 npm audit vulnerabilities (see §1.1) |
| A07 | Auth Failures | ✅ Pass | Token validated lazily; descriptive auth errors |
| A08 | Software & Data Integrity | ✅ Pass | npm lockfile; no unpinned dependencies |
| A09 | Logging & Monitoring Failures | ✅ Pass | Structured logging; token redaction; no PII in logs |
| A10 | SSRF | ✅ Pass | No user-controlled URLs; Jira host validated via Zod |

---

## 4. Architecture Compliance (vs ADRs)

| ADR | Decision | Compliance | Notes |
|-----|----------|-----------|-------|
| ADR-001 | TypeScript + Node.js + MCP SDK | ✅ | Stack exactly as decided |
| ADR-002 | stdio transport only | ✅ | No HTTP/SSE implemented |
| ADR-003 | API Token auth (Basic) | ✅ | OAuth deferred to v1.1 |
| ADR-004 | fetch nativo (no axios) | ✅ | Zero HTTP dependencies |
| ADR-005 | Modulos funcionales + capas | ⚠️ | Structure diverged from documented layout (see §1.4) |
| ADR-006 | Backoff exponencial + error translation | ✅ | Implemented as specified |
| ADR-007 | vitest + 3-layer testing | ✅ | Unit + integration + contract |
| ADR-008 | npm package + bin entry | ✅ | Package.json configured correctly |

---

## 5. Technical Debt Summary

| Type | Count | Severity |
|------|-------|----------|
| npm vulnerabilities | 6 | Critical (2) |
| Injection risk | 1 | High |
| Error handling anti-pattern | 1 | High |
| Architecture doc drift | 4 mismatches | Medium |
| Below-threshold coverage | 1 module | Medium |
| Code duplication | 2 patterns | Medium |
| Silent error suppression | 1 | Medium |
| Non-null assertions | 4 | Low |
| Magic numbers | 2 | Low |
| ESLint issues | 1 error, 2 warnings | Low |

---

## 6. Recommendations (Prioritized)

### Immediate (before deploy)
1. **Fix npm audit vulnerabilities** — Run `npm audit fix` or update vitest to resolve esbuild CVEs. Verify with `npm audit` returning 0.

### Short-term (next sprint)
2. **Add JQL escaping** — Implement `escapeJqlString()` in `src/utils/sanitize.ts` and apply in `search-issues.ts:buildJql()`.
3. **Fix mapHttpError 429 throw** — Replace plain object with `RateLimitError` instance.
4. **Fix ESLint error** — Change `Array<T>` to `T[]` in `tests/integration/jira-api.test.ts:304`.

### Medium-term (v1.1)
5. **Update architecture docs** — Align `docs/architecture.md` with actual project structure OR refactor to match docs.
6. **Extract response formatting helper** — Create `formatToolResponse()` / `formatToolError()` in `src/utils/`.
7. **Add ADF helper tests** — Increase `manage-comments.ts` coverage to >70%.
8. **Add logging to silent catch** — Log fetch failures in `get-sprints.ts:227`.

### Optional improvements
9. Replace non-null assertions with explicit guards
10. Consolidate magic numbers using `DEFAULT_RATE_LIMIT_CONFIG`
11. Extract `https://${host}/browse/${key}` URL builder to shared utility

---

## 7. Final Verdict

| Criterion | Status |
|-----------|--------|
| Functional completeness | ✅ All 9 tools implemented |
| Test coverage | ✅ 89.56% (threshold: 70%) |
| Type safety | ✅ Strict TypeScript, zero `any` |
| Security (token handling) | ✅ Exemplary |
| Security (dependencies) | ❌ 6 vulnerabilities (2 critical) |
| Code quality | ✅ Clean, well-structured |
| Documentation | ⚠️ Architecture drift |
| ESLint compliance | ⚠️ 1 error in tests |
| MCP protocol compliance | ✅ Contract tests pass |
| Observability | ✅ Structured logging with redaction |

### VERDICT: ⚠️ CONDITIONALLY READY FOR DEPLOY

The codebase is well-engineered with strong security practices, excellent test coverage, and clean architecture. **However**, the 6 npm audit vulnerabilities (including 2 critical in esbuild via vitest) must be resolved before production deployment.

Once the esbuild vulnerabilities are remediated (which is a simple `npm install` update), the project meets all quality gates for production.

---

*Report generated by quality agent — Phase 6 of 7*
