import { USE_MOCKS } from "@/mocks/enabled";

/**
 * Group governance (MVP 2): proposals, voting, missed-contribution recovery
 * and decision history.
 *
 * The screens are built, but the backend routes and contract methods behind
 * them are still being implemented (see MVP2-PLAN.md). Until they ship, leave
 * this off: the governance hooks skip their requests, the governance routes
 * show a "coming soon" state, and the what's-new tour stays hidden. The mocks
 * implement the full API, so mock mode always turns it on.
 */
export const GOVERNANCE_ENABLED =
	USE_MOCKS || process.env.NEXT_PUBLIC_GOVERNANCE_ENABLED === "true";
