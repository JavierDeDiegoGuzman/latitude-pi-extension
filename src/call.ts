import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatJson } from "./format";
import { ensureAllowed } from "./policy";
import type { OperationInfo } from "./types";

const API_BASE = "https://api.latitude.so";

type ResolvedRequest = {
	url: URL;
	path: string;
	body?: unknown;
	consumed: Set<string>;
};

function paramsObject(params: unknown): Record<string, unknown> {
	if (!params) return {};
	if (typeof params !== "object" || Array.isArray(params)) {
		throw new Error("params must be an object");
	}
	return params as Record<string, unknown>;
}

function encodePathValue(value: unknown): string {
	if (value === undefined || value === null) throw new Error("Path parameter cannot be null or undefined");
	return encodeURIComponent(String(value));
}

export function resolveRequest(operation: OperationInfo, rawParams: unknown): ResolvedRequest {
	const params = paramsObject(rawParams);
	const consumed = new Set<string>();
	let path = operation.pathTemplate;

	for (const param of operation.parameters.filter((p) => p.in === "path")) {
		const value = params[param.name];
		if (value === undefined || value === null) {
			throw new Error(`Missing required path parameter: ${param.name}`);
		}
		path = path.replaceAll(`{${param.name}}`, encodePathValue(value));
		consumed.add(param.name);
	}

	const url = new URL(path, API_BASE);
	for (const param of operation.parameters.filter((p) => p.in === "query")) {
		const value = params[param.name];
		if (value === undefined || value === null) {
			if (param.required) throw new Error(`Missing required query parameter: ${param.name}`);
			continue;
		}
		consumed.add(param.name);
		if (Array.isArray(value)) {
			for (const item of value) url.searchParams.append(param.name, String(item));
		} else {
			url.searchParams.set(param.name, String(value));
		}
	}

	for (const param of operation.parameters.filter((p) => p.in === "header")) {
		if (params[param.name] !== undefined) consumed.add(param.name);
	}

	let body: unknown;
	if (operation.requestBody) {
		if (Object.prototype.hasOwnProperty.call(params, "body")) {
			body = params.body;
			consumed.add("body");
		} else {
			const remaining: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(params)) {
				if (!consumed.has(key)) remaining[key] = value;
			}
			body = remaining;
		}
	}

	return { url, path: `${url.pathname}${url.search}`, body, consumed };
}

export async function callOperation(
	operation: OperationInfo,
	rawParams: unknown,
	signal: AbortSignal | undefined,
	ctx: ExtensionContext,
): Promise<{ text: string; details: Record<string, unknown> }> {
	const apiKey = process.env.LATITUDE_API_KEY;
	if (!apiKey) {
		throw new Error("LATITUDE_API_KEY is required to use Latitude. Export LATITUDE_API_KEY=... first.");
	}

	const request = resolveRequest(operation, rawParams);
	await ensureAllowed(operation, request.path, ctx);

	const headers: Record<string, string> = {
		Authorization: `Bearer ${apiKey}`,
		Accept: "application/json",
	};
	if (request.body !== undefined) headers["Content-Type"] = "application/json";

	const response = await fetch(request.url, {
		method: operation.method,
		headers,
		body: request.body === undefined ? undefined : JSON.stringify(request.body),
		signal,
	});

	const contentType = response.headers.get("content-type") ?? "";
	let payload: unknown;
	if (contentType.includes("application/json")) {
		payload = await response.json().catch(() => undefined);
	} else {
		payload = await response.text().catch(() => "");
	}

	const responseText = typeof payload === "string" ? payload : formatJson(payload);
	const prefix = response.ok ? "" : `HTTP ${response.status} ${response.statusText}\n\n`;

	return {
		text: `${prefix}${responseText}`,
		details: {
			action: operation.operationId,
			status: response.status,
		},
	};
}
