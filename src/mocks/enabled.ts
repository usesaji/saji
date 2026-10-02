/**
 * The mock-mode switch.
 *
 * `NEXT_PUBLIC_USE_MOCKS=true` (in `.env.local`) detaches the frontend from the
 * backend: the API client, the wallet and the contract clients all answer from
 * the in-memory store in `src/mocks/` instead of the network. See
 * `src/mocks/README.md`.
 *
 * This file is imported statically by the real modules, so it must stay tiny
 * and hold no mock data — the data modules are only ever loaded through
 * `import()`, which keeps them out of the bundle's startup path when the flag
 * is off.
 */

export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

/**
 * A stand-in for a generated contract client (`savingsClient` /
 * `challengeClient`). Every bindings method is async at the call sites, so a
 * Proxy that forwards each method to the lazily loaded mock chain is a drop-in
 * replacement without loading any mock code until a method is actually called.
 */
export function mockContractClient(
	contract: "savings" | "challenge",
	publicKey: string,
): unknown {
	return new Proxy(
		{},
		{
			get(_target, method) {
				// Never look like a thenable or expose symbols — `await client`
				// or a dev-tools inspection must not trigger a contract call.
				if (typeof method !== "string" || method === "then") return undefined;

				return async (args?: Record<string, unknown>) => {
					// Inlined env check, so production builds drop the import.
					if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") {
						const chain = await import("./chain");
						return chain.callContract(contract, method, publicKey, args ?? {});
					}
					throw new Error("Mock contract client used with mocks off.");
				};
			},
		},
	);
}
