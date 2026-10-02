"use client";

import Link from "next/link";
import React, { useState } from "react";
import { FiPlus } from "react-icons/fi";
import { IoEyeOffOutline, IoEyeOutline } from "react-icons/io5";
import type { DashboardData } from "../../lib/api";
import { formatMoney } from "../../lib/utils";
import { pageRoutes } from "../../config/routes";

/**
 * The three headline tiles on the Groups page, from the home dashboard payload.
 *
 * Swipeable on mobile (the third tile peeks in, as in the design) and a
 * three-column row on wider screens.
 */
export default function GroupStats({
	data,
	loading,
}: {
	data: DashboardData | null;
	loading: boolean;
}) {
	// "Total Pending" is the amount currently due (quick_deposit) — the only
	// pending figure the dashboard exposes; "—" when nothing is owed.
	const due = data?.quick_deposit ?? null;
	const activeGroups = data?.circles_total ?? 0;
	const extraAssets = (data?.assets?.length ?? 0) - 1;

	const stats = [
		{
			title: "Total Saved",
			// Largest single asset. A circle saves in one token, so a user across
			// several currencies has more than this — flagged with "+N more"
			// rather than quietly dropped, since this tile can't show a breakdown.
			value: loading
				? "…"
				: formatMoney(data?.saved_balance, data?.asset_code) +
					(extraAssets > 0 ? ` +${extraAssets} more` : ""),
			color: "bg-primary",
			plus: "bg-primary-dark",
			action: { href: pageRoutes.dashboardRoutes.WALLET, label: "Top up from your wallet" },
			hideable: true,
		},
		{
			title: "Total Pending",
			value: loading ? "…" : formatMoney(due?.amount ?? null, due?.asset_code),
			color: "bg-accent",
			plus: "bg-accent-dark",
			// Straight to the circle the money is owed to, where it's paid.
			action: due
				? { href: pageRoutes.dashboardRoutes.CIRCLE(due.group_id), label: `Pay ${due.group_name}` }
				: { href: pageRoutes.dashboardRoutes.WALLET, label: "Open your wallet" },
			hideable: true,
		},
		{
			title: "Active Goals",
			value: loading ? "…" : `${activeGroups} Group${activeGroups === 1 ? "" : "s"}`,
			color: "bg-secondary-dark",
			plus: "bg-secondary-dark-active",
			action: { href: pageRoutes.dashboardRoutes.NEW_GROUP, label: "Create a group" },
			hideable: false,
		},
	];

	return (
		<section className="-mx-3 flex snap-x scroll-px-3 gap-3 overflow-x-auto px-3 hide-scroll sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0">
			{stats.map((s) => (
				<StatsCard key={s.title} {...s} />
			))}
		</section>
	);
}

function StatsCard({
	title,
	value,
	color,
	plus,
	action,
	hideable,
}: {
	title: string;
	value: string;
	color: string;
	plus: string;
	action: { href: string; label: string };
	hideable: boolean;
}) {
	const [visible, setVisible] = useState(true);

	return (
		<div
			className={`${color} relative w-[46%] min-w-40 shrink-0 snap-start rounded-[14px] px-4 py-4 text-white md:w-auto md:min-w-0 md:rounded-[10px] md:px-8 md:py-6`}
		>
			<Link
				href={action.href}
				aria-label={action.label}
				title={action.label}
				className={`${plus} absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-xs transition hover:scale-110 md:right-5 md:top-4`}
			>
				<FiPlus />
			</Link>

			<h5 className="pr-8 text-sm font-light md:text-lg">{title}</h5>
			<div className="mt-1 flex min-w-0 items-center gap-3">
				<p className="truncate text-2xl md:text-[28px] xl:text-[36px]">
					{hideable && !visible ? "••••••" : value}
				</p>
				{hideable && (
					<button
						type="button"
						onClick={() => setVisible((v) => !v)}
						aria-label={visible ? `Hide ${title}` : `Show ${title}`}
						className="shrink-0 text-xl md:text-2xl"
					>
						{visible ? <IoEyeOffOutline /> : <IoEyeOutline />}
					</button>
				)}
			</div>
		</div>
	);
}
