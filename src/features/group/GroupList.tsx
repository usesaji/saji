"use client";

import React, { useState } from "react";
import NoGroupPreview from "./NoGroupPreview";
import { ReusablePagination } from "../../components/dashboard/Pagination";
import type { Group } from "../../lib/api";
import { CircleCard, CircleRow } from "./CircleCards";

const ITEMS_PER_PAGE = 4;

/**
 * The user's groups: compact rows on mobile, a 2-column card grid on wider
 * screens, paginated. Data and filtering are owned by the page, so the
 * refresh button and filter can drive it.
 */
const GroupList = ({
	groups,
	loading,
	error,
	onRetry,
	filtered,
}: {
	groups: Group[];
	loading: boolean;
	error: string | null;
	onRetry: () => void;
	/** A filter is narrowing the list — changes what "empty" means. */
	filtered: boolean;
}) => {
	const [page, setPage] = useState(1);

	if (loading) {
		return (
			<div className="grid gap-3 md:grid-cols-2 md:gap-4">
				{[0, 1, 2, 3].map((i) => (
					<div
						key={i}
						className="h-28 animate-pulse rounded-xl bg-[#f8f8f8] md:h-80 md:rounded-[20px]"
					/>
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div className="rounded-[20px] bg-[#f8f8f8] p-6 text-center text-sm">
				<p className="text-error-500">{error}</p>
				<button onClick={onRetry} className="mt-2 font-medium underline">
					Try again
				</button>
			</div>
		);
	}

	if (groups.length === 0) {
		return filtered ? (
			<p className="rounded-[20px] bg-[#f8f8f8] p-6 text-center text-sm">
				No groups match this filter.
			</p>
		) : (
			<NoGroupPreview />
		);
	}

	// A filter can shrink the list below the current page; never show an empty page.
	const lastPage = Math.max(1, Math.ceil(groups.length / ITEMS_PER_PAGE));
	const current = Math.min(page, lastPage);
	const start = (current - 1) * ITEMS_PER_PAGE;
	const visible = groups.slice(start, start + ITEMS_PER_PAGE);

	return (
		<div>
			<div className="space-y-3 md:hidden">
				{visible.map((group, index) => (
					<CircleRow key={group.id} group={group} index={start + index} />
				))}
			</div>

			<div className="grid grid-cols-2 gap-4 max-md:hidden">
				{visible.map((group) => (
					<CircleCard key={group.id} group={group} />
				))}
			</div>

			{groups.length > ITEMS_PER_PAGE && (
				<div className="mt-6 flex justify-center">
					<ReusablePagination
						totalItems={groups.length}
						itemsPerPage={ITEMS_PER_PAGE}
						currentPage={current}
						onPageChange={setPage}
					/>
				</div>
			)}
		</div>
	);
};

export default GroupList;
