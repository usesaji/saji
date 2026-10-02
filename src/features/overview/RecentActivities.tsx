"use client";

import { useCallback } from "react";
import { pageRoutes } from "../../config/routes";
import ActivityCard from "../activity/ActivityCard";
import { useApi } from "../../lib/hooks/useApi";
import { activity as activityApi } from "../../lib/api";
import SectionHeader from "../../components/dashboard/SectionHeader";

/** The two latest activity rows, as in the design; the rest is a tap away. */
const LIMIT = 2;

export default function RecentActivities() {
	const fetcher = useCallback(() => activityApi.index({ per_page: LIMIT }), []);
	const { data, loading } = useApi(fetcher, []);

	const rows = data?.data ?? [];

	return (
		<section>
			<SectionHeader
				title="Recent Activity"
				href={pageRoutes.dashboardRoutes.ACTIVITY}
			/>

			{loading ? (
				<div className="mt-4 grid gap-3 md:mt-6 md:grid-cols-2 md:gap-4">
					{[0, 1].map((i) => (
						<div key={i} className="h-32 animate-pulse rounded-xl bg-[#f8f8f8]" />
					))}
				</div>
			) : rows.length === 0 ? (
				<p className="mt-4 text-sm text-neutral-900">No activity yet.</p>
			) : (
				<div className="mt-4 grid gap-3 md:mt-6 md:grid-cols-2 md:gap-4">
					{rows.map((row) => (
						<ActivityCard key={row.id} activity={row} />
					))}
				</div>
			)}
		</section>
	);
}
