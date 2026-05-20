# latitude-pi-extension

Pi extension that registers a `latitude` tool for working with Latitude from Pi.

Entry point: `src/index.ts`.

## Install

Install directly from GitHub:

```bash
pi install git:github.com/JavierDeDiegoGuzman/latitude-pi-extension
```

Or test without installing:

```bash
pi -e git:github.com/JavierDeDiegoGuzman/latitude-pi-extension
```

For local development from this repo:

```bash
pi install /Users/javier/Documents/Coding/latitude-pi-extension
```

Reload Pi after editing/installing:

```bash
/reload
```

## Authentication

Set your Latitude API key before starting Pi:

```bash
export LATITUDE_API_KEY=...
```

## Usage

The extension exposes one tool: `latitude`.

Discover available actions:

```json
{ "operation": "list" }
```

Get help for an action:

```json
{ "operation": "help:listProjects" }
```

Run an action:

```json
{ "operation": "listProjects" }
```

Run an action with parameters:

```json
{
  "operation": "getTrace",
  "params": {
    "projectSlug": "production",
    "traceId": "trace_123"
  }
}
```

## Behavior

- registers a single `latitude` tool
- discovers Latitude actions dynamically
- keeps the model-facing interface concise and Latitude-native
- supports `help`, `status`, `list`, and `help:<action>`
- routes path/query/additional input automatically from `params`
- returns JSON responses as formatted text
- truncates large output using Pi's standard limits
- requires confirmation for destructive actions

## Tool schema

```ts
latitude({
  operation?: string,
  params?: Record<string, unknown>,
})
```

## Safety

Destructive actions require interactive confirmation. In non-interactive mode they are blocked unless explicitly enabled:

```bash
export LATITUDE_PI_ALLOW_DELETE=1
```

## Development

Pi core packages are declared as peer dependencies because Pi provides them at runtime.

```bash
npm install
npm run typecheck
```
