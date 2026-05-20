import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { callOperation } from "./call";
import { asToolText, formatJson, localHelp } from "./format";
import { checkOpenApi, getOperationIndex } from "./openapi";
import { formatOperationHelp, formatOperationList } from "./operations";

const LatitudeParams = Type.Object({
	operation: Type.Optional(
		Type.String({
			description: "Empty/help for help, status, list, help:<action>, or a Latitude action to run.",
		}),
	),
	params: Type.Optional(
		Type.Record(Type.String(), Type.Unknown(), {
			description: "Parameters for the Latitude action.",
		}),
	),
});

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "latitude",
		label: "Latitude",
		description: "Use Latitude actions. Omit operation for help.",
		parameters: LatitudeParams,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const operation = params.operation?.trim() || "help";

				if (operation === "help") {
					return asToolText(localHelp(), { operation });
				}

				if (operation === "status") {
					const catalog = await checkOpenApi(signal);
					return asToolText(
						formatJson({
							apiKey: process.env.LATITUDE_API_KEY ? "present" : "missing",
							catalog: catalog.ok
								? { ok: true, actions: catalog.operations }
								: { ok: false, error: catalog.error },
						}),
						{ operation },
					);
				}

				const index = await getOperationIndex(signal);

				if (operation === "list") {
					return asToolText(formatOperationList(index), { operation, operations: index.size });
				}

				if (operation.startsWith("help:")) {
					const operationId = operation.slice("help:".length).trim();
					const info = index.get(operationId);
					if (!info) return asToolText(`Unknown Latitude action: ${operationId}`, { operation, error: "unknown_action" });
					return asToolText(formatOperationHelp(info), { operation, operationId });
				}

				const info = index.get(operation);
				if (!info) {
					return asToolText(
						`Unknown Latitude action: ${operation}\n\nUse latitude({ "operation": "list" }) to discover available actions.`,
						{ operation, error: "unknown_action" },
					);
				}

				const result = await callOperation(info, params.params, signal, ctx);
				return asToolText(result.text, result.details);
			} catch (error) {
				return asToolText(error instanceof Error ? error.message : String(error), { error: true });
			}
		},
	});
}
