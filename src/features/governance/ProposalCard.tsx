"use client";

import Link from "next/link";
import type { Proposal } from "../../lib/api";
import { pageRoutes } from "../../config/routes";
import { actionCaption } from "./copy";
import { StatusPill, dateTime, proposalPill, shortDate } from "./ui";
import MemberAvatars from "../group/MemberAvatars";

/**
 * A proposal in a list. Open proposals show approval progress; closed ones
 * show how they ended.
 */
export default function ProposalCard({
	proposal: p,
	groupId,
	showVoters = false,
	tone = "grey",
}: {
	proposal: Proposal;
	groupId: string | number;
	/** Voter faces under the bar (the group dashboard's "Active proposal"). */
	showVoters?: boolean;
	tone?: "grey" | "lilac";
}) {
	const pill = proposalPill(p);
	const open = p.status === "voting";
	const percent = Math.min(100, Math.round((p.approvals / Math.max(p.threshold, 1)) * 100));

	const meta = open
		? `${actionCaption(p)} · Ends ${dateTime(p.voting_ends_at)}`
		: p.status === "executed" || p.status === "approved"
			? `Approved ${shortDate(p.executed_at ?? p.voting_ends_at)} · Action completed`
			: `Closed ${shortDate(p.voting_ends_at)} · Approval not reached`;

	return (
		<Link
			href={pageRoutes.dashboardRoutes.PROPOSAL(groupId, p.id)}
			className={`block rounded-[14px] px-4 py-4 transition md:px-5 ${
				tone === "lilac" ? "bg-primary-light hover:bg-primary-light-hover" : "bg-[#f8f8f8] hover:bg-[#f2f2f2]"
			}`}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate text-sm md:text-base">{p.title}</p>
					<p className="mt-0.5 truncate text-[11px] font-light">{meta}</p>
				</div>
				<StatusPill tone={pill.tone}>{pill.label}</StatusPill>
			</div>

			{open && (
				<>
					<div className="mt-5 flex items-center justify-between text-[11px]">
						<span className="font-light">Approval progress</span>
						<span>
							{p.approvals} / {p.threshold} for
						</span>
					</div>
					<div className="mt-1.5 h-1.5 rounded-full bg-primary-light">
						<div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
					</div>
					{showVoters && p.voters.length > 0 && (
						<div className="mt-3">
							<MemberAvatars
								members={p.voters}
								total={p.votes_cast}
								overflowClassName="bg-neutral-dark text-white"
							/>
						</div>
					)}
				</>
			)}
		</Link>
	);
}
