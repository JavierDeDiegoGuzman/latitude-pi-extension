# Latitude Pi Extension

A lightweight Pi extension that registers one dynamic tool, `latitude`, for working with Latitude.

## Install globally for Pi

From this repo:

```bash
mkdir -p ~/.pi/agent/extensions
ln -sfn "$PWD" ~/.pi/agent/extensions/latitude-pi-extension
```

Then restart Pi or run `/reload`.

## Authentication

```bash
export LATITUDE_API_KEY=...
```

## Usage

```json
{}
```

```json
{ "operation": "status" }
```

```json
{ "operation": "list" }
```

```json
{ "operation": "help:listProjects" }
```

```json
{ "operation": "listProjects" }
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

## Safety

`DELETE` operations require an interactive confirmation. In non-interactive use they are blocked unless:

```bash
export LATITUDE_PI_ALLOW_DELETE=1
```

## Notes

- Latitude actions are discovered dynamically and cached in memory for the Pi process lifetime.
- No MCP transport, OAuth, subprocess, or per-action tool registration is used.
