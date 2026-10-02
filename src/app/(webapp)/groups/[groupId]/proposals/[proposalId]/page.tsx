"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
	HiCalendarDays,
	HiCheckCircle,
	HiClock,
	HiExclamationTriangle,
	HiOutlineUserGroup,
	HiPlayCircle,
	HiRectangleStack,
} from "react-icons/hi2";
import PageHeader from "@/components/dashboard/PageHeader";
import { actionCaption, ACTIONS, resultHeadline } from "@/features/governance/copy";
import { ConfirmVoteButton, VoteChoices, VoteStatusNote, useCastVote } from "@/features/governance/CastVote";
import { useGroup, useProposal } from "@/features/governance/hooks";
import {
	Hero,
	InfoList,
	PageState,
	Panel,
	PrimaryAction,
	StatusPill,
	TxCard,
	VoteProgress,
	dateRange,
	dateTime,
	formatAmount,
	shortDate,
	timeLeft,
} from "@/features/governance/ui";
import type { Proposal } from "@/lib/api";
import { pageRoutes } from "@/config/routes";

/**
 * One proposal, in whichever state it's in: open for votes (details, or the
 * recovery vote), carried out (result / recovery complete), or not approved.
 */
export default function ProposalPage() {
	const { groupId, proposalId } = useParams<{ groupId: string; proposalId: string }>();
	const { data, loading, error, refetch } = useProposal(groupId, proposalId);
	const group = useGroup(groupId);
	// The latest copy after a vote, without waiting on a refetch.
	const [updated, setUpdated] = useState<Proposal | null>(null);

	const p = updated ?? data;
	const groupName = group.data?.name ?? "the group";

	const title = !p
		? "Proposal"
		: p.status === "voting"
			? p.kind === "recovery"
				? "Recovery Vote"
				: "Proposal Details"
			: p.kind === "recovery" && p.status === "executed"
				? "Recovery Complete"
				: "Proposal Result";

	return (
		<div className="w-full space-y-6 pb-10">
			<PageHeader title={title} back backHref={pageRoutes.dashboardRoutes.PROPOSALS(groupId)} />
			<PageState loading={loading} error={error} onRetry={refetch} />

			{p &&
				(p.status === "voting" ? (
					p.kind === "recovery" ? (
						<RecoveryVote proposal={p} onVoted={setUpdated} />
					) : (
						<Details proposal={p} groupId={groupId} />
					)
				) : p.status === "executed" || p.status === "approved" ? (
					p.kind === "recovery" ? (
						<RecoveryComplete proposal={p} groupId={groupId} groupName={groupName} />
					) : (
						<Result proposal={p} groupId={groupId} groupName={groupName} />
					)
				) : (
					<NotApproved proposal={p} groupId={groupId} />
				))}
		</div>
	);
}

/** p3 — an open governance proposal. */
function Details({ proposal: p, groupId }: { proposal: Proposal; groupId: string }) {
	const canVote = p.can_vote && !p.my_vote;
	const effect = p.action !== "recovery" ? ACTIONS[p.action].effect : "";

	return (
		<div className="grid items-start gap-6 md:grid-cols-2">
			<div className="space-y-4">
				<div>
					<StatusPill tone="green">Voting open</StatusPill>
					<h3 className="mt-3 text-xl md:text-2xl">{p.title}</h3>
					<p className="text-xs font-light">
						Proposed by {p.created_by.name} · {shortDate(p.created_at)}
					</p>
				</div>
				{p.description && (
					<Panel>
						<p className="text-sm">Why this is proposed</p>
						<p className="mt-1 text-xs font-light">{p.description}</p>
					</Panel>
				)}
				<section className="rounded-[14px] bg-primary-light px-4 py-4 md:px-5">
					<p className="text-sm text-primary">Proposed action</p>
					<p className="mt-1 text-xs text-primary">
						{p.title}. {effect}
					</p>
				</section>
			</div>

			<div className="space-y-4">
				<InfoList
					rows={[
						{ Icon: HiCalendarDays, label: "Voting window", value: dateRange(p.created_at, p.voting_ends_at) },
						{ Icon: HiOutlineUserGroup, label: "Approval threshold", value: `${p.threshold} of ${p.eligible_voters} For` },
					]}
				/>
				<VoteProgress proposal={p} title="Current vote" />
				<TxCard hash={p.tx_hash} explorerUrl={p.explorer_url} state="Pending final decision" />
				{canVote ? (
					<PrimaryAction href={pageRoutes.dashboardRoutes.VOTE(groupId, p.id)}>Cast your vote</PrimaryAction>
				) : (
					<VoteStatusNote proposal={p} />
				)}
			</div>
		</div>
	);
}

/** p10 — an open recovery proposal, voted on in place. */
function RecoveryVote({
	proposal: p,
	onVoted,
}: {
	proposal: Proposal;
	onVoted: (p: Proposal) => void;
}) {
	const vote = useCastVote(p, onVoted);
	const r = p.recovery!;
	const who = r.default.member.name.split(" ")[0];
	const canVote = p.can_vote && !p.my_vote;

	return (
		<div className="grid items-start gap-6 md:grid-cols-2">
			<div className="space-y-4">
				<div className="flex items-center justify-between gap-3">
					<StatusPill tone="yellow">Recovery proposed</StatusPill>
					<StatusPill tone="pink">{timeLeft(p.voting_ends_at)}</StatusPill>
				</div>
				<div>
					<h3 className="text-xl md:text-2xl">{p.title}</h3>
					<p className="mt-1 text-xs font-light">
						{r.option === "extend_deadline"
							? `If approved, ${who} can pay by ${shortDate(r.new_deadline)} and Cycle ${r.default.cycle + 1} will resume automatically after payment.`
							: `If approved, the group reserve covers ${who}'s contribution now and Cycle ${r.default.cycle + 1} resumes.`}
					</p>
				</div>
				<InfoList
					rows={[
						{ Icon: HiRectangleStack, label: "Affected cycle", value: `Cycle ${r.default.cycle + 1}` },
						...(r.option === "extend_deadline"
							? [{ Icon: HiCalendarDays, label: "New deadline", value: dateTime(r.new_deadline) }]
							: [{ Icon: HiCalendarDays, label: "Amount covered", value: formatAmount(r.default.amount, r.default.asset_code) }]),
						{ Icon: HiOutlineUserGroup, label: "Approval needed", value: `${p.threshold} For votes` },
					]}
				/>
				<div className="max-md:hidden">
					{canVote && (
						<ConfirmVoteButton
							label="Confirm Recovery Vote"
							disabled={!vote.choice}
							submitting={vote.submitting}
							onClick={vote.submit}
						/>
					)}
				</div>
			</div>

			<div className="space-y-4">
				{canVote ? (
					<VoteChoices proposal={p} choice={vote.choice} onChoose={vote.setChoice} />
				) : (
					<VoteStatusNote proposal={p} />
				)}
				<VoteProgress proposal={p} heading="Progress toward approval" title="Current result" mode="needed" />
			</div>

			{canVote && (
				<div className="md:hidden">
					<ConfirmVoteButton
						label="Confirm recovery vote"
						disabled={!vote.choice}
						submitting={vote.submitting}
						onClick={vote.submit}
					/>
				</div>
			)}
		</div>
	);
}

/** p5 — an executed governance proposal. */
function Result({
	proposal: p,
	groupId,
	groupName,
}: {
	proposal: Proposal;
	groupId: string;
	groupName: string;
}) {
	const headline = resultHeadline(p, groupName);
	return (
		<div className="space-y-4">
			<Hero tone="lilac" title={headline.title}>
				{headline.body}
			</Hero>
			<div className="grid items-start gap-4 md:grid-cols-2">
				<div className="space-y-4">
					<InfoList
						rows={[
							{ Icon: HiRectangleStack, label: "Decision", value: actionCaption(p) },
							{ Icon: HiCalendarDays, label: "Effective", value: "Immediately" },
							{ Icon: HiCheckCircle, label: "Executed", value: dateTime(p.executed_at), tone: "green" },
						]}
					/>
					<TxCard hash={p.tx_hash} explorerUrl={p.explorer_url} state="Confirmed on Stellar Testnet" />
				</div>
				<div className="space-y-4">
					<VoteProgress proposal={p} heading="Voting result" title="Final approval" />
					<div className="md:flex md:justify-end">
						<PrimaryAction href={pageRoutes.dashboardRoutes.PROPOSALS(groupId)}>Back to Proposals</PrimaryAction>
					</div>
				</div>
			</div>
		</div>
	);
}

/** p11 — an executed recovery proposal. */
function RecoveryComplete({
	proposal: p,
	groupId,
	groupName,
}: {
	proposal: Proposal;
	groupId: string;
	groupName: string;
}) {
	const r = p.recovery;
	const cycle = r ? r.default.cycle + 1 : null;
	return (
		<div className="space-y-4">
			<Hero tone="green" title={cycle ? `Cycle ${cycle} has resumed` : "The cycle has resumed"}>
				{r?.option === "extend_deadline"
					? "The group approved the deadline extension. Contributions and the next payout are active again."
					: "The group approved the recovery plan. Contributions and the next payout are active again."}
			</Hero>
			<div className="grid items-start gap-4 md:grid-cols-2">
				<div className="space-y-4">
					<InfoList
						rows={[
							{
								Icon: HiCheckCircle,
								label: "Approved action",
								value: r?.option === "extend_deadline" ? `${r.extension_days}-day extension` : "Covered from reserve",
							},
							...(r?.option === "extend_deadline"
								? [{ Icon: HiClock, label: "New deadline", value: dateTime(r.new_deadline) }]
								: []),
							{ Icon: HiPlayCircle, label: "Cycle status", value: "Active", tone: "green" as const },
							{ Icon: HiCheckCircle, label: "Execution", value: `Completed ${shortDate(p.executed_at)}`, tone: "green" as const },
						]}
					/>
					<div className="max-md:hidden">
						<PrimaryAction href={pageRoutes.dashboardRoutes.CIRCLE(groupId)}>Return to {groupName}</PrimaryAction>
					</div>
				</div>
				<div className="space-y-4">
					<VoteProgress proposal={p} heading="Resolution result" title="Final vote" />
					<TxCard hash={p.tx_hash} explorerUrl={p.explorer_url} state="Confirmed on Stellar Testnet" />
				</div>
			</div>
			<div className="md:hidden">
				<PrimaryAction href={pageRoutes.dashboardRoutes.CIRCLE(groupId)}>Return to {groupName}</PrimaryAction>
			</div>
		</div>
	);
}

/** Rejected or expired: the threshold wasn't reached, so nothing changed. */
function NotApproved({ proposal: p, groupId }: { proposal: Proposal; groupId: string }) {
	return (
		<div className="space-y-4">
			<Hero tone="pink" Icon={HiExclamationTriangle} title="Proposal not approved">
				&ldquo;{p.title}&rdquo; didn&apos;t reach {p.threshold} For votes before the deadline. Nothing
				changed.
			</Hero>
			<div className="grid items-start gap-4 md:grid-cols-2">
				<InfoList
					rows={[
						{ Icon: HiRectangleStack, label: "Decision", value: actionCaption(p) },
						{ Icon: HiCalendarDays, label: "Voting closed", value: dateTime(p.voting_ends_at) },
					]}
				/>
				<div className="space-y-4">
					<VoteProgress proposal={p} heading="Voting result" title="Final tally" />
					<div className="md:flex md:justify-end">
						<PrimaryAction href={pageRoutes.dashboardRoutes.PROPOSALS(groupId)}>Back to Proposals</PrimaryAction>
					</div>
				</div>
			</div>
		</div>
	);
}
