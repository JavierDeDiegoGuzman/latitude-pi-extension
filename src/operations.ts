import type { OpenApiParameter, OpenApiRequestBody, OpenApiSchema, OperationInfo, OperationIndex } from "./types";

function refName(ref: string): string {
	return ref.split("/").pop() ?? ref;
}

function resolveSchema(schema: OpenApiSchema | undefined, operation: OperationInfo, seen = new Set<string>()): OpenApiSchema | undefined {
	if (!schema?.$ref) return schema;
	if (seen.has(schema.$ref)) return schema;
	seen.add(schema.$ref);
	const resolved = operation.schemas?.[refName(schema.$ref)];
	return resolveSchema(resolved, operation, seen) ?? schema;
}

function resolveRequestBody(body: OpenApiRequestBody | undefined, operation: OperationInfo): OpenApiRequestBody | undefined {
	if (!body?.$ref) return body;
	return operation.requestBodies?.[refName(body.$ref)] ?? body;
}

function schemaType(schema: OpenApiSchema | undefined, operation?: OperationInfo): string {
	const resolved = operation ? resolveSchema(schema, operation) : schema;
	if (!resolved) return "unknown";
	if (resolved.$ref) return refName(resolved.$ref);
	if (resolved.enum) return resolved.enum.map(String).join(" | ");
	if (resolved.type === "array") return `${schemaType(resolved.items, operation)}[]`;
	if (resolved.type) return resolved.format ? `${resolved.type}(${resolved.format})` : resolved.type;
	if (resolved.oneOf || resolved.anyOf) {
		const types = (resolved.oneOf ?? resolved.anyOf ?? []).map((s) => schemaType(s, operation));
		const unique = [...new Set(types)];
		return unique.length === 1 ? unique[0] : unique.join(" | ");
	}
	if (resolved.allOf) return resolved.allOf.map((s) => schemaType(s, operation)).join(" & ");
	if (resolved.properties || resolved.additionalProperties) return "object";
	return "unknown";
}

function cleanText(text: string | undefined): string | undefined {
	return text
		?.replaceAll(/\bthe separate `\/[\w./{}:-]+` endpoint\b/gi, "a separate Latitude action")
		.replaceAll(/\bseparate `\/[\w./{}:-]+` endpoint\b/gi, "separate Latitude action")
		.replaceAll(/`\/[\w./{}:-]+`\s+endpoint/gi, "Latitude action")
		.replaceAll(/`\/[\w./{}:-]+`/g, "the related Latitude action")
		.replaceAll(/\bendpoint\b/gi, "action")
		.replaceAll(/\bAPI reference\b/gi, "Latitude docs")
		.replaceAll(/\s+/g, " ")
		.trim();
}

function schemaDescription(schema: OpenApiSchema | undefined, operation: OperationInfo): string | undefined {
	return cleanText(schema?.description ?? resolveSchema(schema, operation)?.description);
}

function bodyVariants(schema: OpenApiSchema | undefined, operation: OperationInfo): OpenApiSchema[] {
	const resolved = resolveSchema(schema, operation);
	if (!resolved) return [];
	const variants = resolved.oneOf ?? resolved.anyOf;
	if (variants?.length) return variants;
	return [resolved];
}

function normalizedObjectSchema(schema: OpenApiSchema | undefined, operation: OperationInfo): OpenApiSchema | undefined {
	const resolved = resolveSchema(schema, operation);
	if (!resolved) return undefined;
	return resolved.allOf ? mergeAllOf(resolved, operation) : resolved;
}

function bodyArgumentNames(operation: OperationInfo): string[] {
	if (!operation.requestBody) return [];
	const variants = bodyVariants(bodySchema(operation), operation);
	const normalized = normalizedObjectSchema(variants[0], operation);
	const required = normalized?.required ?? [];
	if (required.length > 0) return required.slice(0, 6);
	const properties = Object.keys(normalized?.properties ?? {});
	return properties.length > 0 ? properties.slice(0, 6) : ["body"];
}

function signature(operation: OperationInfo): string {
	const pathAndQuery = operation.parameters.filter((p) => p.in === "path" || p.in === "query").map((p) => p.name);
	const bodyArgs = bodyArgumentNames(operation);
	const args = [...pathAndQuery, ...bodyArgs];
	return `${operation.operationId}${args.length ? `(${args.join(", ")}${bodyArgs.length > 6 ? ", ..." : ""})` : ""}`;
}

export function formatOperationList(index: OperationIndex): string {
	const groups = new Map<string, OperationInfo[]>();
	for (const operation of [...index.values()].sort((a, b) => a.operationId.localeCompare(b.operationId))) {
		const tag = operation.tags[0] ?? "Other";
		groups.set(tag, [...(groups.get(tag) ?? []), operation]);
	}

	const lines: string[] = [];
	let count = 0;
	const maxOperations = 160;
	for (const [tag, operations] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		if (count >= maxOperations) break;
		lines.push(tag);
		for (const operation of operations) {
			if (count >= maxOperations) break;
			lines.push(`- ${signature(operation)}${operation.summary ? ` — ${operation.summary}` : ""}`);
			count++;
		}
		lines.push("");
	}

	if (index.size > count) {
		lines.push(`[Showing ${count} of ${index.size} actions. Use latitude({ "operation": "help:<action>" }) for details.]`);
	}

	return lines.join("\n").trim();
}

function bodySchema(operation: OperationInfo): OpenApiSchema | undefined {
	const body = resolveRequestBody(operation.requestBody, operation);
	return body?.content?.["application/json"]?.schema ?? Object.values(body?.content ?? {})[0]?.schema;
}

function mergeAllOf(schema: OpenApiSchema, operation: OperationInfo): OpenApiSchema {
	if (!schema.allOf) return schema;
	const merged: OpenApiSchema = { type: "object", properties: {}, required: [] };
	for (const part of schema.allOf) {
		const resolved = resolveSchema(part, operation);
		if (!resolved) continue;
		const normalized = mergeAllOf(resolved, operation);
		merged.properties = { ...(merged.properties ?? {}), ...(normalized.properties ?? {}) };
		merged.required = [...(merged.required ?? []), ...(normalized.required ?? [])];
	}
	return merged;
}

function bodyShape(schema: OpenApiSchema | undefined, operation: OperationInfo, depth = 0): unknown {
	const resolved = resolveSchema(schema, operation);
	if (!resolved) return "unknown";
	if (depth > 4) return schemaType(resolved, operation);
	if (resolved.allOf) return bodyShape(mergeAllOf(resolved, operation), operation, depth + 1);
	if (resolved.oneOf?.[0]) return bodyShape(resolved.oneOf[0], operation, depth + 1);
	if (resolved.anyOf?.[0]) return bodyShape(resolved.anyOf[0], operation, depth + 1);
	if (resolved.enum?.length) return resolved.enum[0];

	if (resolved.type === "array") return [bodyShape(resolved.items, operation, depth + 1)];
	if (resolved.type === "number" || resolved.type === "integer") return 0;
	if (resolved.type === "boolean") return false;
	if (resolved.type === "string") return resolved.format ? `<${resolved.format}>` : "string";

	if (resolved.properties) {
		const shape: Record<string, unknown> = {};
		for (const [name, prop] of Object.entries(resolved.properties).slice(0, 30)) {
			shape[name] = bodyShape(prop, operation, depth + 1);
		}
		return shape;
	}
	if (resolved.additionalProperties) return {};

	return schemaType(resolved, operation);
}

function bodyFieldList(schema: OpenApiSchema | undefined, operation: OperationInfo): string[] {
	const normalized = normalizedObjectSchema(schema, operation);
	if (!normalized?.properties) return [];

	const required = new Set(normalized.required ?? []);
	return Object.entries(normalized.properties)
		.slice(0, 30)
		.map(([name, prop]) => {
			const description = schemaDescription(prop, operation);
			return `- ${name}: ${schemaType(prop, operation)}${required.has(name) ? ", required" : ""}${description ? ` — ${description}` : ""}`;
		});
}

function variantName(_schema: OpenApiSchema, index: number): string {
	return `Option ${index + 1}`;
}

function exampleParams(operation: OperationInfo): Record<string, unknown> {
	const params: Record<string, unknown> = {};
	for (const param of operation.parameters) {
		if (param.in !== "path" && !param.required) continue;
		params[param.name] = param.schema?.type === "number" || param.schema?.type === "integer" ? 123 : param.name;
	}
	if (operation.requestBody) {
		const shape = bodyShape(bodyVariants(bodySchema(operation), operation)[0] ?? bodySchema(operation), operation);
		if (shape && typeof shape === "object" && !Array.isArray(shape)) {
			Object.assign(params, shape);
		} else {
			params.body = shape;
		}
	}
	return params;
}

export function formatOperationHelp(operation: OperationInfo): string {
	const lines: string[] = [operation.operationId, ""];
	if (operation.summary) lines.push(`Summary: ${cleanText(operation.summary)}`);
	if (operation.description) lines.push(`Description: ${cleanText(operation.description)}`);
	if (operation.summary || operation.description) lines.push("");

	lines.push("Parameters:");
	const parameters = operation.parameters.filter((p): p is OpenApiParameter => p.in === "path" || p.in === "query" || p.in === "header");
	if (parameters.length === 0) {
		lines.push("- none");
	} else {
		for (const param of parameters) {
			const description = cleanText(param.description);
			lines.push(
				`- ${param.name}: ${schemaType(param.schema, operation)}${param.required ? ", required" : ""}${description ? ` — ${description}` : ""}`,
			);
		}
	}
	lines.push("");

	if (operation.requestBody) {
		const resolvedBody = resolveRequestBody(operation.requestBody, operation);
		const schema = bodySchema(operation);
		const variants = bodyVariants(schema, operation);
		lines.push(`Additional input:${resolvedBody?.required ? " required" : ""}`);

		if (variants.length > 1) {
			lines.push("Accepted forms:");
			variants.forEach((variant, index) => {
				const normalized = normalizedObjectSchema(variant, operation);
				const required = normalized?.required ?? [];
				lines.push(`- ${variantName(variant, index)}${required.length ? `: requires ${required.join(", ")}` : ""}`);
			});
			lines.push("");
		}

		const fields = bodyFieldList(variants[0] ?? schema, operation);
		if (fields.length) lines.push(...fields, "");
		lines.push(variants.length > 1 ? "Example input shape (first form):" : "Example input shape:");
		lines.push(JSON.stringify(bodyShape(variants[0] ?? schema, operation), null, 2));
	} else {
		lines.push("Additional input: none");
	}
	lines.push("", "Example:");
	lines.push(`latitude(${JSON.stringify({ operation: operation.operationId, params: exampleParams(operation) }, null, 2)})`);

	return lines.join("\n");
}
