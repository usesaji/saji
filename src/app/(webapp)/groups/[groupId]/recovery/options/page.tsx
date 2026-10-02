"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
	HiArchiveBox,
	HiBanknotes,
	HiCalendarDays,
	HiExclamationTriangle,
	HiOutlineUser,
	HiPauseCircle,
	HiRectangleStack,
} from "react-icons/hi2";
import PageHeader from "@/components/dashboard/PageHeader";
import { useGovernance } from "@/features/governance/hooks";
import { EXTENSION_DAYS, RECOVERY_OPTIONS, firstName } from "@/features/governance/copy";
import {
	InfoList,
	Note,
	OptionCard,
	PageState,
	Panel,
	PrimaryAction,
	formatAmount,
	shortDate,
} from "@/features/governance/ui";
import type { RecoveryOption } from "@/lib/api";
import { pageRoutes } from "@/config/routes";

const ICONS: Record<RecoveryOption, React.ComponentType<{ className?: string }>> = {
	extend_deadline: HiCalendarDays,
	cover_from_reserve: HiArchiveBox,
};

/** p7 — Recovery Required: the permitted ways the group can resolve a default. */
export default function RecoveryOptionsPage() {
	const { groupId } = useParams<{ groupId: string }>();
	const gov = useGovernance(groupId);
	const [option, setOption] = useState<RecoveryOption>("extend_deadline");
	const d = gov.data?.open_default ?? null;

	const action = (
		<PrimaryAction href={pageRoutes.dashboardRoutes.RECOVERY_PROPOSE(groupId, option)}>
			Create Recovery Proposal
		</PrimaryAction>
	);

	return (
		<div className="w-full space-y-6 pb-10">
			<PageHeader title="Recovery Required" back backHref={pageRoutes.dashboardRoutes.RECOVERY(groupId)} />
			<PageState loading={gov.loading} error={gov.error} onRetry={gov.refetch} />

			{gov.data && !d && (
				<Panel className="py-10 text-center text-sm">Nothing needs recovering right now.</Panel>
			)}

			{d && gov.data && (
				<>
					<div className="grid items-start gap-6 md:grid-cols-2">
						<div className="space-y-4">
							<Note tone="yellow" Icon={HiExclamationTriangle} title="Group action needed">
								Members must agree on how Cycle {d.cycle + 1} should recover.
							</Note>
							<InfoList
								rows={[
									{ Icon: HiOutlineUser, label: "Affected member", value: d.member.name },
									{ Icon: HiBanknotes, label: "Missed contribution", value: formatAmount(d.amount, d.asset_code), tone: "pink" },
									{ Icon: HiPauseCircle, label: "Cycle status", value: "Paused for recovery", tone: "pink" },
									{
										Icon: HiRectangleStack,
										label: "Payout affected",
										value: `Cycle ${d.cycle + 1}${d.payout_due_at ? ` · ${shortDate(d.payout_due_at)}` : ""}`,
									},
								]}
							/>
						</div>

						<div className="space-y-4">
							<p className="text-sm md:text-base">Permitted recovery options</p>
							<div className="space-y-3" role="radiogroup" aria-label="Recovery option">
								{(Object.keys(RECOVERY_OPTIONS) as RecoveryOption[]).map((o) => (
									<OptionCard
										key={o}
										selected={option === o}
										onSelect={() => setOption(o)}
										Icon={ICONS[o]}
										title={RECOVERY_OPTIONS[o].label(firstName(d.member.name), EXTENSION_DAYS)}
										subtitle={RECOVERY_OPTIONS[o].subtitle(EXTENSION_DAYS)}
									/>
								))}
							</div>
							<div className="max-md:hidden md:flex md:justify-end">{action}</div>
						</div>
					</div>

					<Note title="Why the group decides">
						No coordinator can change the cycle alone. A recovery proposal must reach{" "}
						{gov.data.threshold} For votes before SAJI carries it out.
					</Note>

					<div className="md:hidden">{action}</div>
				</>
			)}
		</div>
	);
}
