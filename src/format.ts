import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";

export function localHelp(): string {
	return `Latitude

Usage:
- latitude({ "operation": "list" })
- latitude({ "operation": "help:listIssues" })
- latitude({ "operation": "listIssues", "params": { "projectSlug": "production" } })

Auth:
- export LATITUDE_API_KEY=...

Notes:
- Use list to discover available Latitude actions.
- DELETE actions require confirmation.`;
}

export function truncateText(text: string): { text: string; truncated: boolean } {
	const truncation = truncateHead(text, {
		maxLines: DEFAULT_MAX_LINES,
		maxBytes: DEFAULT_MAX_BYTES,
	});

	if (!truncation.truncated) return { text: truncation.content, truncated: false };

	const note = `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
		truncation.outputBytes,
	)} of ${formatSize(truncation.totalBytes)}).]`;
	return { text: `${truncation.content}${note}`, truncated: true };
}

export function formatJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export function asToolText(text: string, details: Record<string, unknown> = {}) {
	const truncated = truncateText(text);
	return {
		content: [{ type: "text" as const, text: truncated.text }],
		details: { ...details, truncated: truncated.truncated },
	};
}
