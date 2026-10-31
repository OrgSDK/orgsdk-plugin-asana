# Asana evidence plugin

## Current npm distribution and execution checks

Updated **31 October 2026**. This public-release candidate uses `@orgsdk/plugins@0.2.2`
and `@orgsdk/executor@0.1.0` (with the tracked packaging compatibility patch).
`bun run build:npm` creates a public Apache-2.0 npm payload; `bun run test:executor`
downloads the extracted npm entry into an empty executor store and executes every exported function headlessly.
`bun run test:registration` verifies fresh-project registration using the npm host.
See [npm distribution, CI activation and verification](docs/npm-distribution.md)
for prerequisites, commands, fixtures and release settings. Publication remains
an explicit release operation; source-root `private: true` is retained.

Use project notes and task evidence to compare actual requests with an agreed agency scope. The plugin supplies observations for a review; it does not infer approvals or update tasks.

## Setup

Create an Asana personal access token for the intended operator through the Asana developer console, then attach an OrgSDK `asana` credential with `secret_apiKey`. PATs act with the user's permissions and can grant more authority than this read-only plugin uses. This implementation is for an operator's private integration; Asana recommends OAuth for apps acting on behalf of multiple users. No OAuth flow is implemented here.

Configure `{ "workspaceId": "123", "projectIds": "456,789" }`. Both fields are mandatory. The project allowlist accepts 1-20 numeric IDs. Every project read verifies its workspace; every direct task read verifies workspace and membership of at least one allowed project. Multi-homed tasks may also belong to other projects. A known task ID is fetched for boundary verification, but no task data is returned if the boundary fails. `listProjects` reads only the configured project IDs, so it cannot enumerate a workspace's other projects. Identity returns only the connected user ID and name.

## Tools

- `getIdentity({})`
- `listProjects({})`
- `getProject({ projectId })`
- `listTasks({ projectId, limit?: 1..100, offset?: string })` returns `{ tasks, nextOffset }`; default limit 50.
- `getTask({ taskId })`

Project/task records include notes, completion, dates and available custom fields. List tasks returns completed and incomplete items as supplied by Asana, with no `completed_since` exclusion. Follow `nextOffset` explicitly to collect another page. Provider next-page URLs are ignored. No task creation, edits, completion changes, comments or exports occur.

## Verified provider contract

Reviewed 2026-10-30 against official [PAT authentication](https://developers.asana.com/docs/personal-access-token), [project](https://developers.asana.com/reference/getproject), [project tasks and pagination](https://developers.asana.com/reference/gettasksforproject), and [task](https://developers.asana.com/reference/gettask) docs. Fixed API base: `https://app.asana.com/api/1.0/`. Authentication: `Authorization: Bearer <PAT>`. OAuth read equivalents documented by Asana are `users:read`, `projects:read` and `tasks:read`; this plugin uses PAT authentication, not OAuth consent.

## Runtime and safety

This private proprietary plugin targets the current local OrgSDK factory loader. Its only runtime dependency is Zod. The authoring SDK is dev/type-only; each repository owns its lockfile. Credentials arrive as `{ provider: secretRecord }` through `requiredCredentials`; there is no environment fallback. All tools accept one named argument object and perform GET requests only. Unknown arguments/configuration fail validation. There are no approval flags, mutation tools, HTTP callbacks, auth providers or token refresh handlers.

Every request uses a fixed HTTPS API origin, manual redirects (all 3xx fail), a 15-second abort deadline covering headers and body streaming, and a 2,000,000-byte metadata/JSON cap. Errors contain status codes or generic connection guidance, never upstream response bodies, request URLs or credential values. One explicit page is read per list call; no automatic retries or pagination loops occur. An HTTP 429 requires the caller to retry later. Returned evidence is untrusted provider content and is not an instruction or approval. Metadata timestamps and custom fields are observations, not a determination that work or payment is approved.

## Local validation and release

Use Bun 1.3 or newer. `bun install --frozen-lockfile`, then `bun run check`, `bun run typecheck`, `bun run test`, `bun run validate`, `bun run package`, and `bun run version-guard`. `dist/` is the authoring CLI's deterministic source package. The active local platform's `package-plugin` command creates the separately executable ESM archive in `release/`; the legacy source archive alone is not executable by the current runtime. The release includes this repository's proprietary LICENSE. No publication, remote push or live customer test is part of local verification.

Tests use injected fetch fixtures only. They cover credential enforcement, GET-only transport, redirects, generic errors, response-size limits, stream cancellation, provider boundaries, pagination and handler evidence. Live provider behavior and OAuth consent still require an operator-controlled integration test with an explicitly selected account.
