"use client";

import { useState } from "react";
import { HiHandThumbDown, HiHandThumbUp } from "react-icons/hi2";
import { ApiError, governance as governanceApi, type Proposal } from "../../lib/api";
import { toast } from "../../lib/utils/toast";
import { voteCopy } from "./copy";
import { Note, OptionCard, PrimaryAction } from "./ui";

/** For / Against choices for a proposal. Controlled, so pages can place the button. */
export function VoteChoices({
	proposal,
	choice,
	onChoose,
}: {
	proposal: Proposal;
	choice: "approve" | "reject" | null;
	onChoose: (choice: "approve" | "reject") => void;
}) {
	const copy = voteCopy(proposal);
	return (
		<div className="space-y-3" role="radiogroup" aria-label="Your vote">
			<OptionCard
				selected={choice === "approve"}
				onSelect={() => onChoose("approve")}
				Icon={HiHandThumbUp}
				title="Vote For"
				subtitle={copy.voteFor}
			/>
			<OptionCard
				selected={choice === "reject"}
				onSelect={() => onChoose("reject")}
				Icon={HiHandThumbDown}
				title="Vote Against"
				subtitle={copy.voteAgainst}
			/>
		</div>
	);
}

/** Submits a vote. Votes are final, so the button stays off until a choice is made. */
export function useCastVote(proposal: Proposal | null, onVoted: (p: Proposal) => void) {
	const [choice, setChoice] = useState<"approve" | "reject" | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const submit = async () => {
		if (!proposal || !choice) return;
		setSubmitting(true);
		try {
			const updated = await governanceApi.vote(proposal.group_id, proposal.id, choice);
			toast.success(
				updated.status === "executed"
					? "Your vote reached the threshold — the decision has been carried out."
					: `You voted ${choice === "approve" ? "For" : "Against"}. We'll tell everyone when voting closes.`,
				"Vote recorded",
			);
			onVoted(updated);
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : "Could not record your vote.", "Vote failed");
		} finally {
			setSubmitting(false);
		}
	};

	return { choice, setChoice, submitting, submit };
}

/** Shown instead of the vote form when the viewer can't, or already did, vote. */
export function VoteStatusNote({ proposal }: { proposal: Proposal }) {
	if (proposal.my_vote) {
		return (
			<Note title={`You voted ${proposal.my_vote === "approve" ? "For" : "Against"}`}>
				Votes are final. You&apos;ll be notified when voting closes.
			</Note>
		);
	}
	if (!proposal.can_vote) {
		return (
			<Note tone="yellow" title="You can't vote on this proposal">
				Members don&apos;t vote on the recovery of their own missed contribution.
			</Note>
		);
	}
	return null;
}

export function ConfirmVoteButton({
	label,
	disabled,
	submitting,
	onClick,
}: {
	label: string;
	disabled: boolean;
	submitting: boolean;
	onClick: () => void;
}) {
	return (
		<PrimaryAction onClick={onClick} disabled={disabled || submitting}>
			{submitting ? "Recording…" : label}
		</PrimaryAction>
	);
}
