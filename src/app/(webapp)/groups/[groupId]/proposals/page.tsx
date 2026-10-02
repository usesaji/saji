"use client";

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/dashboard/PageHeader";
import SectionHeader from "@/components/dashboard/SectionHeader";
import ProposalCard from "@/features/governance/ProposalCard";
import { PageState, Panel, PrimaryAction } from "@/features/governance/ui";
import { useApi } from "@/lib/hooks/useApi";
import { governance as governanceApi } from "@/lib/api";
import { pageRoutes } from "@/config/routes";

type Tab = "active" | "completed" | "all";

const TABS: { value: Tab; label: string }[] = [
	{ value: "active", label: "Active" },
	{ value: "completed", label: "Completed" },
	{ value: "all", label: "All" },
];

/** How many recent outcomes sit beside the active list before "View All". */
const RECENT = 3;

/** Governance / Proposals: what's being voted on, and how recent votes ended. */
export default function ProposalsPage() {
	const { groupId } = useParams<{ groupId: string }>();
	const fetcher = useCallback(() => governanceApi.proposals(Number(groupId)), [groupId]);
	const { data, loading, error, refetch } = useApi(fetcher, [groupId]);
	const [tab, setTab] = useState<Tab>("active");

	const proposals = data ?? [];
	const active = proposals.filter((p) => p.status === "voting");
	const completed = proposals.filter((p) => p.status !== "voting");

	const showActive = tab !== "completed";
	const showCompleted = tab !== "active" || completed.length > 0;
	const completedShown = tab === "active" ? completed.slice(0, RECENT) : completed;

	const empty = (text: string) => (
		<Panel className="py-8 text-center text-sm font-light">{text}</Panel>
	);

	return (
		<div className="w-full space-y-6 pb-10">
			<PageHeader
				title="Proposals"
				back
				backHref={pageRoutes.dashboardRoutes.CIRCLE(groupId)}
				actions={
					<div className="flex gap-1.5 max-md:hidden" role="tablist">
						{TABS.map(({ value, label }) => (
							<TabButton key={value} active={tab === value} onClick={() => setTab(value)}>
								{label}
							</TabButton>
						))}
					</div>
				}
			/>

			<div className="flex gap-1.5 md:hidden" role="tablist">
				{TABS.map(({ value, label }) => (
					<TabButton key={value} active={tab === value} onClick={() => setTab(value)}>
						{label}
					</TabButton>
				))}
			</div>

			<PageState loading={loading} error={error} onRetry={refetch} />

			{data && (
				<div className={`grid items-start gap-6 ${showActive && showCompleted ? "md:grid-cols-2" : ""}`}>
					{showActive && (
						<section className="space-y-3">
							<p className="text-sm">Active</p>
							{active.length === 0
								? empty("Nothing is being voted on right now.")
								: active.map((p) => <ProposalCard key={p.id} proposal={p} groupId={groupId} />)}
						</section>
					)}

					{showCompleted && (
						<section className="space-y-3">
							<SectionHeader
								title={<span className="text-sm">{tab === "active" ? "Recently completed" : "Completed"}</span>}
								action={
									tab === "active" && completed.length > RECENT ? (
										<button
											type="button"
											onClick={() => setTab("completed")}
											className="text-xs text-primary"
										>
											View All →
										</button>
									) : undefined
								}
							/>
							{completedShown.length === 0
								? empty("No decisions yet.")
								: completedShown.map((p) => <ProposalCard key={p.id} proposal={p} groupId={groupId} />)}

							<div className="pt-3 max-md:hidden md:flex md:justify-end">
								<PrimaryAction href={pageRoutes.dashboardRoutes.NEW_PROPOSAL(groupId)}>
									Create Proposal
								</PrimaryAction>
							</div>
						</section>
					)}
				</div>
			)}

			<div className={data && showCompleted ? "md:hidden" : ""}>
				<PrimaryAction href={pageRoutes.dashboardRoutes.NEW_PROPOSAL(groupId)}>
					Create Proposal
				</PrimaryAction>
			</div>
		</div>
	);
}

function TabButton({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			onClick={onClick}
			className={`rounded-full px-4 py-1.5 text-xs transition md:px-5 md:py-2 md:text-sm ${
				active ? "bg-primary text-white" : "bg-neutral-comment hover:bg-primary-light"
			}`}
		>
			{children}
		</button>
	);
}
