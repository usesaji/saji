"use client";

import { useParams } from "next/navigation";
import {
	HiBanknotes,
	HiCalendarDays,
	HiExclamationTriangle,
	HiOutlineShieldCheck,
	HiOutlineUser,
} from "react-icons/hi2";
import PageHeader from "@/components/dashboard/PageHeader";
import { useGovernance, useGroup } from "@/features/governance/hooks";
import {
	Hero,
	InfoList,
	Note,
	PageState,
	Panel,
	PrimaryAction,
	dateTime,
	formatAmount,
} from "@/features/governance/ui";
import { firstName } from "@/features/governance/copy";
import { pageRoutes } from "@/config/routes";

/** p6 — Missed contribution alert: what was missed, and that the cycle is held. */
export default function RecoveryPage() {
	const { groupId } = useParams<{ groupId: string }>();
	const gov = useGovernance(groupId);
	const group = useGroup(groupId);
	const d = gov.data?.open_default ?? null;

	return (
		<div className="w-full space-y-6 pb-10">
			<PageHeader
				title={group.data?.name ?? "Recovery"}
				back
				backHref={pageRoutes.dashboardRoutes.CIRCLE(groupId)}
			/>
			<PageState loading={gov.loading} error={gov.error} onRetry={gov.refetch} />

			{gov.data && !d && (
				<Panel className="py-10 text-center text-sm">
					No missed contributions. The cycle is running normally.
				</Panel>
			)}

			{d && (
				<>
					<Hero tone="pink" Icon={HiExclamationTriangle} title={`${firstName(d.member.name)} missed a contribution`}>
						The deadline passed without payment. SAJI recorded the missed contribution and paused
						this cycle automatically.
					</Hero>

					<div className="grid items-start gap-4 md:grid-cols-2">
						<InfoList
							rows={[
								{ Icon: HiOutlineUser, label: "Member", value: d.member.name },
								{ Icon: HiBanknotes, label: "Amount missed", value: formatAmount(d.amount, d.asset_code), tone: "pink" },
								{ Icon: HiCalendarDays, label: "Deadline", value: dateTime(d.deadline) },
								{ Icon: HiOutlineShieldCheck, label: "Record status", value: "Confirmed", tone: "green" },
							]}
						/>
						<div className="space-y-4">
							<Note tone="yellow" title={`Cycle ${d.cycle + 1} is paused`}>
								No payout will move forward until members approve a recovery action. Your saved
								funds remain secure.
							</Note>
							<div className="md:flex md:justify-end">
								{/* A vote already open for this default takes you to it. */}
								{d.proposal_id ? (
									<PrimaryAction href={pageRoutes.dashboardRoutes.PROPOSAL(groupId, d.proposal_id)}>
										View recovery vote
									</PrimaryAction>
								) : (
									<PrimaryAction href={pageRoutes.dashboardRoutes.RECOVERY_OPTIONS(groupId)}>
										View recovery options
									</PrimaryAction>
								)}
							</div>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
