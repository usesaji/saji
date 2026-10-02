"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
	HiArrowTopRightOnSquare,
	HiCheckBadge,
	HiCheckCircle,
	HiDocumentText,
	HiExclamationTriangle,
	HiHandThumbUp,
	HiXCircle,
} from "react-icons/hi2";
import PageHeader from "@/components/dashboard/PageHeader";
import { PageState, Panel } from "@/features/governance/ui";
import { useApi } from "@/lib/hooks/useApi";
import { governance as governanceApi, type GovernanceEvent } from "@/lib/api";
import { pageRoutes } from "@/config/routes";

type Filter = "all" | "governance" | "recovery";

const FILTERS: { value: Filter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "governance", label: "Governance" },
	{ value: "recovery", label: "Recovery" },
];

const EVENT_STYLE: Record<
	GovernanceEvent["type"],
	{ Icon: React.ComponentType<{ className?: string }>; tint: string }
> = {
	proposal_created: { Icon: HiDocumentText, tint: "bg-warning-100 text-warning-700" },
	vote_recorded: { Icon: HiHandThumbUp, tint: "bg-primary-light text-primary" },
	proposal_approved: { Icon: HiCheckBadge, tint: "bg-success-50 text-success-500" },
	proposal_executed: { Icon: HiCheckCircle, tint: "bg-success-50 text-success-500" },
	proposal_rejected: { Icon: HiXCircle, tint: "bg-accent-light text-accent" },
	default_recorded: { Icon: HiExclamationTriangle, tint: "bg-accent-light text-accent" },
};

/** "Today" / "Yesterday" / "Sep 28" */
function dayLabel(iso: string): string {
	const date = new Date(iso);
	const today = new Date();
	const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const diff = Math.round((startOf(today) - startOf(date)) / 86_400_000);
	if (diff === 0) return "Today";
	if (diff === 1) return "Yesterday";
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** p12 — Governance & Recovery History. */
export default function HistoryPage() {
	const { groupId } = useParams<{ groupId: string }>();
	const [filter, setFilter] = useState<Filter>("all");
	const fetcher = useCallback(
		() => governanceApi.history(Number(groupId), filter === "all" ? undefined : filter),
		[groupId, filter],
	);
	const { data, loading, error, refetch } = useApi(fetcher, [groupId, filter]);

	// Consecutive events on the same day share a heading.
	const days: { label: string; events: GovernanceEvent[] }[] = [];
	for (const event of data?.events ?? []) {
		const label = dayLabel(event.created_at);
		const last = days[days.length - 1];
		if (last && last.label === label) last.events.push(event);
		else days.push({ label, events: [event] });
	}

	const tabs = (
		<div className="flex gap-1.5" role="tablist">
			{FILTERS.map(({ value, label }) => (
				<button
					key={value}
					type="button"
					role="tab"
					aria-selected={filter === value}
					onClick={() => setFilter(value)}
					className={`rounded-full px-4 py-1.5 text-xs transition md:px-5 md:py-2 md:text-sm ${
						filter === value ? "bg-primary text-white" : "bg-neutral-comment hover:bg-primary-light"
					}`}
				>
					{label}
				</button>
			))}
		</div>
	);

	return (
		<div className="w-full space-y-6 pb-10">
			<PageHeader
				title="History"
				back
				backHref={pageRoutes.dashboardRoutes.CIRCLE(groupId)}
				actions={<div className="max-md:hidden">{tabs}</div>}
			/>
			<div className="md:hidden">{tabs}</div>

			<PageState loading={loading} error={error} onRetry={refetch} />

			{data && (
				<>
					{data.active.length > 0 && (
						<section className="space-y-3">
							<p className="text-sm md:text-base">Active</p>
							{data.active.map((p) => (
								<Link
									key={p.id}
									href={pageRoutes.dashboardRoutes.PROPOSAL(groupId, p.id)}
									className="flex items-center justify-between gap-3 rounded-[14px] bg-primary-light px-5 py-4 transition hover:bg-primary-light-hover"
								>
									<div className="min-w-0">
										<p className="truncate text-sm md:text-base">{p.title}</p>
										<p className="text-[11px] font-light">
											{p.approvals} of {p.threshold} approvals · Ends{" "}
											{new Date(p.voting_ends_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
										</p>
									</div>
									<span className="shrink-0 rounded-full bg-primary-dark px-3 py-1 text-[11px] text-white">
										Voting
									</span>
								</Link>
							))}
						</section>
					)}

					{days.length === 0 ? (
						<Panel className="py-10 text-center text-sm font-light">
							No decisions or recoveries yet.
						</Panel>
					) : (
						<div className="grid items-start gap-x-8 gap-y-6 md:grid-cols-2">
							{days.map((day) => (
								<section key={day.label}>
									<p className="mb-2 text-sm md:text-base">{day.label}</p>
									<ul className="divide-y divide-neutral-light">
										{day.events.map((e) => (
											<EventRow key={e.id} event={e} groupId={groupId} />
										))}
									</ul>
								</section>
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}

function EventRow({ event: e, groupId }: { event: GovernanceEvent; groupId: string }) {
	const { Icon, tint } = EVENT_STYLE[e.type];
	const time = new Date(e.created_at).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});

	const content = (
		<>
			<span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${tint}`}>
				<Icon />
			</span>
			<span className="min-w-0 flex-1">
				<span className="flex items-baseline justify-between gap-3">
					<span className="text-sm">{e.title}</span>
					<span className="shrink-0 text-[11px] font-light">{time}</span>
				</span>
				<span className="block text-[11px] font-light">{e.body}</span>
				{e.explorer_url && (
					<span className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary">
						Stellar Testnet <HiArrowTopRightOnSquare />
					</span>
				)}
			</span>
		</>
	);

	return (
		<li>
			{e.proposal_id ? (
				<Link
					href={pageRoutes.dashboardRoutes.PROPOSAL(groupId, e.proposal_id)}
					className="flex gap-3 py-3 transition hover:opacity-80"
				>
					{content}
				</Link>
			) : e.explorer_url ? (
				<a
					href={e.explorer_url}
					target="_blank"
					rel="noopener noreferrer"
					className="flex gap-3 py-3 transition hover:opacity-80"
				>
					{content}
				</a>
			) : (
				<div className="flex gap-3 py-3">{content}</div>
			)}
		</li>
	);
}
