"use client";

import Link from "next/link";
import { HiOutlineBanknotes } from "react-icons/hi2";
import { pageRoutes } from "../../config/routes";
import type { QuickDeposit } from "../../lib/api";

/**
 * "Upcoming Contribution" banner — surfaces the soonest-due contribution and a
 * Fund Account action. Renders nothing when there's nothing due.
 */
export default function UpcomingContribution({
	due,
}: {
	due: QuickDeposit | null;
}) {
	if (!due) return null;

	const amount = `${Number(due.amount).toLocaleString()} ${due.asset_code}`;
	const when = whenLabel(due.due_at);

	return (
		<section className="flex flex-col gap-4 rounded-[20px] bg-primary-light px-6 py-5 md:flex-row md:items-center md:justify-between">
			<div className="min-w-0">
				<p className="text-base md:text-lg">Upcoming Contribution</p>
				<p className="mt-1 max-w-2xl text-xs font-light md:text-sm">
					Your contribution of <span className="font-medium">{amount}</span> to
					“{due.group_name}” is due {when}. Keep enough tokens in your wallet to
					avoid a late penalty.
				</p>
			</div>
			<Link
				href={pageRoutes.dashboardRoutes.CIRCLE(due.group_id)}
				className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary-dark px-6 py-3 text-sm text-white transition hover:bg-primary-dark-hover"
			>
				<HiOutlineBanknotes className="text-lg" />
				Contribute now
			</Link>
		</section>
	);
}

/** "today" / "in 3 days" / "2 days ago" — null due dates read as "soon". */
export function whenLabel(iso: string | null): string {
	if (!iso) return "soon";
	const d = Math.round(
		(new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
	);
	if (d === 0) return "today";
	if (d > 0) return `in ${d} day${d === 1 ? "" : "s"}`;
	return `${Math.abs(d)} day${d === -1 ? "" : "s"} ago`;
}
