"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { HiShieldCheck } from "react-icons/hi2";
import PageHeader from "@/components/dashboard/PageHeader";
import { ACTIONS, actionCaption } from "@/features/governance/copy";
import { ConfirmVoteButton, VoteChoices, useCastVote } from "@/features/governance/CastVote";
import { useProposal } from "@/features/governance/hooks";
import { Note, PageState, VoteProgress, shortDate } from "@/features/governance/ui";
import { pageRoutes } from "@/config/routes";

/** p4 — Cast Your Vote on a governance proposal. */
export default function VotePage() {
	const { groupId, proposalId } = useParams<{ groupId: string; proposalId: string }>();
	const router = useRouter();
	const { data: p, loading, error, refetch } = useProposal(groupId, proposalId);
	const proposalHref = pageRoutes.dashboardRoutes.PROPOSAL(groupId, proposalId);

	const vote = useCastVote(p, () => router.push(proposalHref));

	// Nothing to vote on here — closed, already voted, or not eligible — so the
	// proposal page is the right place to be.
	const cannotVote = !!p && (p.status !== "voting" || !!p.my_vote || !p.can_vote);
	useEffect(() => {
		if (cannotVote) router.replace(proposalHref);
	}, [cannotVote, proposalHref, router]);

	const effect = p && p.action !== "recovery" ? ACTIONS[p.action].effect.toLowerCase() : "";

	return (
		<div className="w-full space-y-6 pb-10">
			<PageHeader title="Cast Your Vote" back backHref={proposalHref} />
			<PageState loading={loading} error={error} onRetry={refetch} />

			{p && !cannotVote && (
				<>
					<div className="grid items-start gap-6 md:grid-cols-2">
						<div className="space-y-4">
							<div>
								<p className="text-[11px] uppercase tracking-wide text-primary">{actionCaption(p)}</p>
								<h3 className="mt-1 text-xl md:text-2xl">{p.title}</h3>
								<p className="text-xs font-light">
									Choose how you want the group to proceed. Your vote is final once confirmed.
								</p>
							</div>
							<VoteChoices proposal={p} choice={vote.choice} onChoose={vote.setChoice} />
						</div>

						<div className="space-y-4">
							<VoteProgress proposal={p} mode="needed" />
							<Note Icon={HiShieldCheck} title="How approval works">
								At least {p.threshold} members must vote For by {shortDate(p.voting_ends_at)}. If
								approved, SAJI carries it out automatically and notifies everyone
								{effect ? ` — ${effect}` : "."}
							</Note>
							<div className="max-md:hidden">
								<ConfirmVoteButton
									label="Confirm Vote"
									disabled={!vote.choice}
									submitting={vote.submitting}
									onClick={vote.submit}
								/>
							</div>
						</div>
					</div>

					<div className="md:hidden">
						<ConfirmVoteButton
							label="Confirm vote"
							disabled={!vote.choice}
							submitting={vote.submitting}
							onClick={vote.submit}
						/>
					</div>
				</>
			)}
		</div>
	);
}
