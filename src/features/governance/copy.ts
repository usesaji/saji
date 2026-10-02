import type { Proposal, ProposalAction, RecoveryOption } from "../../lib/api";

/** Labels and plain-language effects for each governance action. */
export const ACTIONS: Record<
	Exclude<ProposalAction, "recovery">,
	{ label: string; subtitle: string; effect: string; voteFor: string; voteAgainst: string; placeholder: string }
> = {
	pause: {
		label: "Pause group",
		subtitle: "Temporarily stop contributions and payouts.",
		effect: "No contributions or payouts until members approve a resume proposal.",
		voteFor: "I agree to pause contributions after this cycle.",
		voteAgainst: "I want the group to continue as scheduled.",
		placeholder: "e.g. Pause the group after the current cycle",
	},
	resume: {
		label: "Resume group",
		subtitle: "Restart a group that is currently paused.",
		effect: "Contributions and payouts restart on the normal schedule.",
		voteFor: "I agree to restart the group.",
		voteAgainst: "I want the group to stay paused.",
		placeholder: "e.g. Resume contributions from next week",
	},
	payout_schedule: {
		label: "Change future payout schedule",
		subtitle: "Adjust upcoming dates; past payouts stay unchanged.",
		effect: "Upcoming payout dates change. Past payouts stay exactly as they were.",
		voteFor: "I agree to the new payout schedule.",
		voteAgainst: "Keep the current schedule.",
		placeholder: "e.g. Move the December payout to Jan 5",
	},
};

export const RECOVERY_OPTIONS: Record<
	RecoveryOption,
	{ label: (name: string, days: number) => string; subtitle: (days: number) => string }
> = {
	extend_deadline: {
		label: (name) => `Extend ${name}'s deadline`,
		subtitle: (days) => `Give ${days} more days to complete the contribution.`,
	},
	cover_from_reserve: {
		label: () => "Cover from reserve, repay later",
		subtitle: () => "Use the group reserve now and add a repayment plan.",
	},
};

/** Default extension the design proposes. */
export const EXTENSION_DAYS = 3;

export const firstName = (name: string) => name.split(" ")[0] ?? name;

/** "Pause group" / "Recovery" — the small caption above a proposal title. */
export function actionCaption(p: Pick<Proposal, "action" | "kind">): string {
	if (p.kind === "recovery" || p.action === "recovery") return "Recovery";
	return ACTIONS[p.action].label;
}

/** What a vote For / Against means on this proposal. */
export function voteCopy(p: Proposal): { voteFor: string; voteAgainst: string } {
	if (p.recovery) {
		return p.recovery.option === "extend_deadline"
			? {
					voteFor: `Approve the ${p.recovery.extension_days}-day extension and recovery plan.`,
					voteAgainst: "Do not extend the deadline under this plan.",
				}
			: {
					voteFor: "Approve covering the contribution from the reserve.",
					voteAgainst: "Do not cover it from the reserve.",
				};
	}
	if (p.action === "recovery") return { voteFor: "Approve this plan.", voteAgainst: "Reject this plan." };
	return { voteFor: ACTIONS[p.action].voteFor, voteAgainst: ACTIONS[p.action].voteAgainst };
}

/** Headline for an executed governance proposal. */
export function resultHeadline(p: Proposal, groupName: string): { title: string; body: string } {
	switch (p.action) {
		case "pause":
			return {
				title: `${groupName} is paused`,
				body: "The approved decision was carried out successfully. No contributions or payouts will be collected while paused.",
			};
		case "resume":
			return {
				title: `${groupName} has resumed`,
				body: "The approved decision was carried out successfully. Contributions and payouts are back on schedule.",
			};
		case "payout_schedule":
			return {
				title: "Payout schedule updated",
				body: "The approved change was carried out successfully. Past payouts are unchanged.",
			};
		default:
			return { title: "Decision carried out", body: "The approved action was carried out successfully." };
	}
}
