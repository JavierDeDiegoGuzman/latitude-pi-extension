import type { HttpMethod, OpenApiOperation, OpenApiParameter, OpenApiSpec, OperationIndex } from "./types";

const OPENAPI_URL = "https://api.latitude.so/openapi.json";
const METHODS: Record<string, HttpMethod> = {
	get: "GET",
	post: "POST",
	patch: "PATCH",
	delete: "DELETE",
};

let cachedSpec: OpenApiSpec | undefined;
let cachedIndex: OperationIndex | undefined;

export async function fetchOpenApiSpec(signal?: AbortSignal): Promise<OpenApiSpec> {
	if (cachedSpec) return cachedSpec;

	const response = await fetch(OPENAPI_URL, {
		headers: { Accept: "application/json" },
		signal,
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch Latitude OpenAPI spec: HTTP ${response.status} ${response.statusText}`);
	}

	cachedSpec = (await response.json()) as OpenApiSpec;
	return cachedSpec;
}

export async function getOperationIndex(signal?: AbortSignal): Promise<OperationIndex> {
	if (cachedIndex) return cachedIndex;

	const spec = await fetchOpenApiSpec(signal);
	cachedIndex = buildOperationIndex(spec);
	return cachedIndex;
}

export function buildOperationIndex(spec: OpenApiSpec): OperationIndex {
	const index: OperationIndex = new Map();

	for (const [pathTemplate, pathItem] of Object.entries(spec.paths ?? {})) {
		if (!pathItem || typeof pathItem !== "object") continue;
		const commonParameters = Array.isArray((pathItem as { parameters?: unknown }).parameters)
			? ((pathItem as { parameters?: OpenApiParameter[] }).parameters ?? [])
			: [];

		for (const [rawMethod, maybeOperation] of Object.entries(pathItem)) {
			const method = METHODS[rawMethod.toLowerCase()];
			if (!method || !maybeOperation || typeof maybeOperation !== "object") continue;

			const operation = maybeOperation as OpenApiOperation;
			if (!operation.operationId) continue;

			index.set(operation.operationId, {
				operationId: operation.operationId,
				method,
				pathTemplate,
				summary: operation.summary,
				description: operation.description,
				tags: operation.tags ?? ["Other"],
				parameters: [...commonParameters, ...(operation.parameters ?? [])],
				requestBody: operation.requestBody,
				schemas: spec.components?.schemas,
				requestBodies: spec.components?.requestBodies,
			});
		}
	}

	return index;
}

export async function checkOpenApi(signal?: AbortSignal): Promise<{ ok: boolean; error?: string; operations?: number }> {
	try {
		const index = await getOperationIndex(signal);
		return { ok: true, operations: index.size };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}
