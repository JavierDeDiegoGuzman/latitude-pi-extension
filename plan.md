# Plan: Latitude Pi Extension

## Context

Pi does not support MCP natively. Latitude exposes an MCP server, but its tools are dynamically generated from the public Latitude OpenAPI/REST API. For Pi, we can provide a lighter integration by using the Latitude OpenAPI spec as the source of truth and `LATITUDE_API_KEY` for authentication.

The extension should add almost no context unless used. It should expose exactly one lightweight Pi tool, `latitude`, with a dynamic MCP-like interface based on OpenAPI operation IDs.

## Goals

- Expose a single Pi tool: `latitude`.
- Keep initial context footprint minimal.
- Avoid MCP protocol, `mcp-remote`, OAuth, subprocesses, and dynamic Pi tool registration.
- Use `https://api.latitude.so/openapi.json` as the operation catalog.
- Use `LATITUDE_API_KEY` from the environment for API authentication.
- Let the model discover functionality on demand through `latitude({ operation: "list" })` and `latitude({ operation: "help:<operationId>" })`.
- Provide UX close to MCP tools without registering every operation as a separate tool.
- Require confirmation only for destructive operations, primarily HTTP `DELETE`.

## Non-goals

- Do not implement MCP transport.
- Do not implement OAuth.
- Do not store secrets.
- Do not inject system prompt context via `before_agent_start`.
- Do not register one Pi tool per Latitude API operation.

## Proposed tool UX

Register one tool:

```ts
latitude({
  operation?: string,
  params?: Record<string, unknown>
})
```

Behavior:

```txt
latitude()                         -> local help, no network required
latitude({ operation: "help" })     -> local help, no network required
latitude({ operation: "status" })   -> check LATITUDE_API_KEY and OpenAPI/API availability
latitude({ operation: "list" })     -> list available operations from OpenAPI
latitude({ operation: "help:listIssues" }) -> describe one operation
latitude({ operation: "listIssues", params: { projectSlug: "production" } }) -> call operation
```

Example calls:

```json
{}
```

```json
{ "operation": "list" }
```

```json
{ "operation": "help:getTrace" }
```

```json
{
  "operation": "getTrace",
  "params": {
    "projectSlug": "production",
    "traceId": "trace_123"
  }
}
```

```json
{
  "operation": "updateProject",
  "params": {
    "projectSlug": "old-slug",
    "name": "New Project Name"
  }
}
```

## Tool schema

Keep the Pi tool definition short:

```ts
parameters: Type.Object({
  operation: Type.Optional(Type.String({
    description: "Empty/help for help, status, list, help:<operationId>, or an OpenAPI operationId to call."
  })),
  params: Type.Optional(Type.Record(Type.String(), Type.Unknown(), {
    description: "Parameters for the Latitude API operation."
  }))
})
```

Tool description should also be short:

```txt
Call Latitude API operations by operationId. Omit operation for help.
```

Avoid `promptSnippet` and `promptGuidelines` unless absolutely necessary.

## Authentication

Use only:

```bash
export LATITUDE_API_KEY=...
```

For API calls, send:

```http
Authorization: Bearer $LATITUDE_API_KEY
Content-Type: application/json
Accept: application/json
```

If `LATITUDE_API_KEY` is missing:

- `help` and `list` can still work if OpenAPI is public.
- `status` reports missing API key.
- operation calls fail with a clear error.

## OpenAPI usage

Fetch and cache:

```txt
https://api.latitude.so/openapi.json
```

The extension should parse:

- `paths`
- HTTP methods: `get`, `post`, `patch`, `delete`
- `operationId`
- `summary`
- `description`
- `tags`
- `parameters`
- `requestBody`

Build an operation index:

```ts
type OperationInfo = {
  operationId: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  pathTemplate: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
};
```

Cache the spec in memory. Optionally add a TTL later, but MVP can cache for the Pi process lifetime.

## Operation execution

Given:

```json
{
  "operation": "getTrace",
  "params": {
    "projectSlug": "production",
    "traceId": "trace_123"
  }
}
```

The extension should:

1. Find `operationId === "getTrace"` in the OpenAPI index.
2. Extract `path` parameters from `parameters` where `in: "path"`.
3. Replace path placeholders like `{projectSlug}`.
4. Extract query parameters from `parameters` where `in: "query"`.
5. Put query parameters into the URL query string.
6. Determine request body:
   - If `params.body` exists, use it as the JSON body.
   - Otherwise, if the operation has `requestBody`, use remaining params not consumed by path/query/header as body.
   - Otherwise, no body.
7. Call `https://api.latitude.so${resolvedPath}`.
8. Return the JSON response, truncated if necessary.

## Parameter routing rules

### Path params

OpenAPI:

```yaml
parameters:
  - name: projectSlug
    in: path
```

Input:

```json
{ "projectSlug": "production" }
```

Result:

```txt
/v1/projects/production
```

### Query params

OpenAPI:

```yaml
parameters:
  - name: limit
    in: query
```

Input:

```json
{ "limit": 20 }
```

Result:

```txt
?limit=20
```

### Body

If `requestBody` exists, remaining params become JSON body unless `body` is explicitly provided.

Input:

```json
{
  "projectSlug": "production",
  "name": "New Project Name"
}
```

For `PATCH /v1/projects/{projectSlug}`, request body becomes:

```json
{ "name": "New Project Name" }
```

Explicit body override:

```json
{
  "projectSlug": "production",
  "body": {
    "name": "New Project Name"
  }
}
```

## Destructive action policy

Require confirmation for operations whose resolved HTTP method is `DELETE`.

Interactive mode:

```txt
Confirm destructive Latitude API call
DELETE /v1/projects/production

Allow?
```

Non-interactive modes:

- Block `DELETE` by default.
- Allow only if:

```bash
LATITUDE_PI_ALLOW_DELETE=1
```

Do not require confirmation for `POST` or `PATCH` by default.

Optional future hardening: maintain an extra set of destructive operation IDs if Latitude adds non-DELETE destructive endpoints.

## Help behavior

### `latitude()` / `latitude({ operation: "help" })`

Return concise local help without fetching OpenAPI:

```txt
Latitude Pi extension

Usage:
- latitude({ "operation": "list" })
- latitude({ "operation": "help:listIssues" })
- latitude({ "operation": "listIssues", "params": { "projectSlug": "production" } })

Auth:
- export LATITUDE_API_KEY=...

Notes:
- Operations are resolved dynamically from https://api.latitude.so/openapi.json
- DELETE requests require confirmation.
```

### `latitude({ operation: "list" })`

Fetch OpenAPI and return compact grouped operations:

```txt
Projects
- listProjects — GET /v1/projects — List projects
- getProject(projectSlug) — GET /v1/projects/{projectSlug} — Get project
- updateProject(projectSlug, body) — PATCH /v1/projects/{projectSlug} — Update project

Issues
- listIssues(projectSlug) — GET /v1/projects/{projectSlug}/issues — List project issues
```

Keep output concise. If too large, group by tag and truncate with a note suggesting `help:<operationId>`.

### `latitude({ operation: "help:listIssues" })`

Return operation detail:

```txt
listIssues
GET /v1/projects/{projectSlug}/issues

Summary: List project issues

Parameters:
- projectSlug: string, path, required

Body: none

Example:
latitude({
  "operation": "listIssues",
  "params": { "projectSlug": "production" }
})
```

If request body exists, include a compact schema summary and example.

## Result formatting

Return tool result content as text containing JSON or a concise textual summary.

Rules:

- Prefer raw JSON pretty-printed for correctness.
- Truncate large responses to avoid overwhelming context.
- Include status code on non-2xx responses.
- Include request method/path in `details` for debugging.

Example result shape:

```ts
return {
  content: [{ type: "text", text: formatted }],
  details: {
    operationId,
    method,
    path,
    status,
    truncated
  }
};
```

Use Pi truncation utilities if available:

- `truncateHead`
- `DEFAULT_MAX_BYTES`
- `DEFAULT_MAX_LINES`

## Files to create

```txt
latitude-pi-extension/
├── package.json
├── README.md
├── LICENSE
└── src/
    ├── index.ts          # Pi extension entrypoint and tool registration
    ├── openapi.ts        # fetch/cache/parse OpenAPI
    ├── operations.ts     # operation index + describe/list formatting helpers
    ├── call.ts           # resolve params and execute HTTP request
    ├── format.ts         # help/result/truncation formatting
    ├── policy.ts         # DELETE confirmation policy
    └── types.ts          # local types for OpenAPI subset
```

For an initial local-only prototype, this could also be a single file:

```txt
~/.pi/agent/extensions/latitude.ts
```

But for sharing with Latitude, use a package directory.

## Implementation steps

- [x] Create extension package structure.
- [x] Register one Pi tool named `latitude`.
- [x] Implement local `help` response with no network calls.
- [x] Implement OpenAPI fetch/cache from `https://api.latitude.so/openapi.json`.
- [x] Build operation index by `operationId`.
- [x] Implement `list` grouped by tag.
- [x] Implement `help:<operationId>`.
- [x] Implement operation execution from `operationId + params`.
- [x] Add `LATITUDE_API_KEY` auth header.
- [x] Add DELETE confirmation policy.
- [x] Add response formatting and truncation.
- [x] Add README with install and usage examples.
- [ ] Test with read-only endpoints first: `listProjects`, `getAccount`, `listIssues`.
- [ ] Test `PATCH`/`POST` on safe resources if available.
- [ ] Test DELETE confirmation without actually deleting critical data.

## Verification

Manual checks:

```txt
latitude()
```

Expected: local help, no API key required.

```txt
latitude({ "operation": "list" })
```

Expected: operation list from OpenAPI.

```txt
latitude({ "operation": "help:listProjects" })
```

Expected: operation details and example.

```txt
latitude({ "operation": "listProjects" })
```

Expected: authenticated API response when `LATITUDE_API_KEY` is set.

```txt
latitude({ "operation": "deleteProject", "params": { "projectSlug": "test" } })
```

Expected: confirmation prompt before request; blocked in non-interactive mode unless `LATITUDE_PI_ALLOW_DELETE=1`.

## Open questions

- Confirm exact REST auth header. Current assumption: `Authorization: Bearer $LATITUDE_API_KEY`.
- Confirm whether all OpenAPI request bodies can be safely built from remaining params or whether some operations require explicit `body`.
- Decide final package name: `latitude-pi`, `pi-latitude`, or `@latitude-dev/pi`.
- Decide final tool name: `latitude` vs `latitude_api`. Current recommendation: `latitude` for simplicity.
