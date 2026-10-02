"use client";

import { useCallback, useState } from "react";
import ActivityCard from "../../../features/activity/ActivityCard";
import { ReusablePagination } from "../../../components/dashboard/Pagination";
import PageHeader from "../../../components/dashboard/PageHeader";
import { useApi } from "../../../lib/hooks/useApi";
import { activity as activityApi } from "../../../lib/api";

const PER_PAGE = 10;

type Filter = "all" | "contributions" | "payout" | "withdrawal";

/** The filters `GET /api/activity` supports. */
const FILTERS: { value: Filter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "contributions", label: "Contributions" },
	{ value: "payout", label: "Payouts" },
	{ value: "withdrawal", label: "Withdrawals" },
];

const EMPTY: Record<Filter, string> = {
	all: "No activity yet. Contributions, payouts and withdrawals will show up here.",
	contributions: "No contributions yet.",
	payout: "No payouts yet.",
	withdrawal: "No withdrawals yet.",
};

export default function Page() {
	const [filter, setFilter] = useState<Filter>("all");
	const [page, setPage] = useState(1);

	const fetcher = useCallback(
		() => activityApi.index({ per_page: PER_PAGE, filter, page }),
		[filter, page],
	);
	const { data, loading, error, refetch } = useApi(fetcher, [filter, page]);

	const rows = data?.data ?? [];

	return (
		<div className="w-full space-y-6 pb-10">
			<PageHeader title="Activity" />

			<div className="-mx-3 flex gap-2 overflow-x-auto px-3 hide-scroll sm:mx-0 sm:px-0" role="tablist">
				{FILTERS.map(({ value, label }) => (
					<button
						key={value}
						type="button"
						role="tab"
						aria-selected={filter === value}
						onClick={() => {
							setFilter(value);
							setPage(1);
						}}
						className={`shrink-0 rounded-full px-5 py-2 text-sm transition ${
							filter === value
								? "bg-primary text-white"
								: "bg-neutral-comment text-neutral-dark hover:bg-primary-light"
						}`}
					>
						{label}
					</button>
				))}
			</div>

			{loading ? (
				<div className="grid gap-3 md:grid-cols-2 md:gap-4">
					{[0, 1, 2, 3].map((i) => (
						<div key={i} className="h-32 animate-pulse rounded-xl bg-[#f8f8f8]" />
					))}
				</div>
			) : error ? (
				<div className="rounded-[20px] bg-[#f8f8f8] p-6 text-sm">
					<p className="text-error-500">{error}</p>
					<button onClick={refetch} className="mt-2 font-medium underline">
						Try again
					</button>
				</div>
			) : rows.length === 0 ? (
				<p className="rounded-[20px] bg-[#f8f8f8] p-6 text-sm">{EMPTY[filter]}</p>
			) : (
				<>
					<div className="grid gap-3 md:grid-cols-2 md:gap-4">
						{rows.map((row) => (
							<ActivityCard key={row.id} activity={row} />
						))}
					</div>

					{data && data.total > PER_PAGE && (
						<div className="flex justify-center">
							<ReusablePagination
								totalItems={data.total}
								itemsPerPage={PER_PAGE}
								currentPage={page}
								onPageChange={setPage}
							/>
						</div>
					)}
				</>
			)}
		</div>
	);
}
