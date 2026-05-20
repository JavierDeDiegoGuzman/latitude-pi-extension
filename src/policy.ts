import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { OperationInfo } from "./types";

export async function ensureAllowed(operation: OperationInfo, _resolvedPath: string, ctx: ExtensionContext): Promise<void> {
	if (operation.method !== "DELETE") return;
	if (process.env.LATITUDE_PI_ALLOW_DELETE === "1") return;

	try {
		const ok = await ctx.ui.confirm(
			"Confirm destructive Latitude action",
			`${operation.operationId}\n\nAllow?`,
		);
		if (ok) return;
	} catch {
		// Fall through to the non-interactive block below.
	}

	throw new Error("Blocked destructive Latitude action. Set LATITUDE_PI_ALLOW_DELETE=1 to allow destructive actions in non-interactive mode.");
}
