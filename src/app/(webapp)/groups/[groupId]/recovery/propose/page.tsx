"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
	HiArchiveBox,
	HiBanknotes,
	HiCalendarDays,
	HiClock,
	HiOutlineUserGroup,
	HiRectangleStack,
} from "react-icons/hi2";
import PageHeader from "@/components/dashboard/PageHeader";
import { useGovernance, useGroup } from "@/features/governance/hooks";
import { EXTENSION_DAYS, firstName } from "@/features/governance/copy";
import {
	InfoList,
	Note,
	OptionCard,
	PageState,
	Panel,
	PrimaryAction,
	StatusPill,
	dateTime,
	formatAmount,
	shortDate,
} from "@/features/governance/ui";
import { ApiError, governance as governanceApi, type RecoveryOption } from "@/lib/api";
import { pageRoutes } from "@/config/routes";
import { toast } from "@/lib/utils/toast";

/** Recovery votes run for 48 hours (the window in the p9 design). */
const VOTING_HOURS = 48;

/** p9 — Recovery Proposal draft: the chosen option plus a rationale. */
export default function RecoveryProposePage() {
	const { groupId } = useParams<{ groupId: string }>();
	const search = useSearchParams();
	const router = useRouter();
	const gov = useGovernance(groupId);
	const group = useGroup(groupId);
	const [rationale, setRationale] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const option: RecoveryOption =
		search.get("option") === "cover_from_reserve" ? "cover_from_reserve" : "extend_deadline";
	const d = gov.data?.open_default ?? null;

	const submit = async () => {
		if (!d) return;
		setSubmitting(true);
		try {
			const proposal = await governanceApi.startRecovery(Number(groupId), {
				default_id: d.id,
				option,
				extension_days: EXTENSION_DAYS,
				rationale: rationale.trim() || null,
			});
			toast.success("Members can now vote on the recovery plan.", "Recovery proposal submitted");
			router.push(pageRoutes.dashboardRoutes.PROPOSAL(groupId, proposal.id));
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : "Could not submit the proposal.", "Not submitted");
		} finally {
			setSubmitting(false);
		}
	};

	const newDeadline = d
		? new Date(new Date(d.deadline).getTime() + EXTENSION_DAYS * 86_400_000).toISOString()
		: null;
	const who = d ? firstName(d.member.name) : "";

	const action = (
		<PrimaryAction onClick={submit} disabled={submitting || !d}>
			{submitting ? "Submitting…" : "Review & Submit"}
		</PrimaryAction>
	);

	return (
		<div className="w-full space-y-6 pb-10">
			<PageHeader title="Recovery Proposal" back backHref={pageRoutes.dashboardRoutes.RECOVERY_OPTIONS(groupId)} />
			<PageState loading={gov.loading} error={gov.error} onRetry={gov.refetch} />

			{gov.data && !d && (
				<Panel className="py-10 text-center text-sm">Nothing needs recovering right now.</Panel>
			)}

			{d && gov.data && (
				<>
					<div className="grid items-start gap-6 md:grid-cols-2">
						<div className="space-y-4">
							<div className="flex items-start justify-between gap-3">
								<div>
									<p className="text-[11px] uppercase tracking-wide text-primary">
										{group.data?.name ?? "Group"} · Cycle {d.cycle + 1}
									</p>
									<h3 className="mt-1 text-xl md:text-2xl">Resolve missed contribution</h3>
								</div>
								<StatusPill tone="gray">Draft</StatusPill>
							</div>

							<div>
								<p className="mb-2 text-sm">Proposed recovery action</p>
								<OptionCard
									selected
									onSelect={() => router.push(pageRoutes.dashboardRoutes.RECOVERY_OPTIONS(groupId))}
									Icon={option === "extend_deadline" ? HiCalendarDays : HiArchiveBox}
									title={
										option === "extend_deadline"
											? `Extend ${who}'s deadline by ${EXTENSION_DAYS} days`
											: `Cover ${who}'s contribution from reserve`
									}
									subtitle={
										option === "extend_deadline" && newDeadline
											? `Payment will be due ${dateTime(newDeadline)}.`
											: "The reserve pays now; a repayment plan follows."
									}
								/>
							</div>

							<label className="block space-y-2">
								<span className="text-sm">Rationale</span>
								<textarea
									value={rationale}
									onChange={(e) => setRationale(e.target.value)}
									rows={4}
									maxLength={500}
									placeholder={`e.g. ${who} told the group about a delayed salary payment. A short extension keeps the payout plan intact.`}
									className="w-full resize-none rounded-[14px] border border-neutral-light-hover bg-white px-4 py-3 text-sm outline-none focus:border-primary"
								/>
							</label>
						</div>

						<div className="space-y-4">
							<Note title="Before you submit">
								Members will review the exact deadline and rationale. The cycle stays paused while
								voting is open.
							</Note>
							<InfoList
								rows={[
									{
										Icon: HiRectangleStack,
										label: "Affected cycle",
										value: `Cycle ${d.cycle + 1}${d.payout_due_at ? ` · ${shortDate(d.payout_due_at)} payout` : ""}`,
									},
									{ Icon: HiBanknotes, label: "Affected amount", value: formatAmount(d.amount, d.asset_code) },
									{ Icon: HiOutlineUserGroup, label: "Approval threshold", value: `${gov.data.threshold} of ${gov.data.eligible_voters} For` },
									{ Icon: HiClock, label: "Voting period", value: `${VOTING_HOURS} hours` },
								]}
							/>
							<div className="max-md:hidden md:flex md:justify-end">{action}</div>
						</div>
					</div>
					<div className="md:hidden">{action}</div>
				</>
			)}
		</div>
	);
}
