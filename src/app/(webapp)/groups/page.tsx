"use client";

import React, { useCallback, useMemo, useState } from "react";
import { IoReload } from "react-icons/io5";
import GroupStats from "../../../features/group/GroupStats";
import GroupList from "../../../features/group/GroupList";
import GroupFilter, {
	type GroupFilterValue,
	matchesFilter,
} from "../../../features/group/GroupFilter";
import DiscoverChallenges from "../../../features/overview/DiscoverChallenges";
import CreateGroupFloatBtn from "../../../features/group/CreateGroupFloatBtn";
import { useApi } from "../../../lib/hooks/useApi";
import {
	dashboard as dashboardApi,
	groups as groupsApi,
} from "../../../lib/api";

export default function Page() {
	const dashboard = useApi(() => dashboardApi.show(), []);
	const groupsFetcher = useCallback(() => groupsApi.index(), []);
	const groups = useApi(groupsFetcher, []);
	const [filter, setFilter] = useState<GroupFilterValue>("all");

	const visible = useMemo(
		() => (groups.data ?? []).filter((g) => matchesFilter(g, filter)),
		[groups.data, filter],
	);

	const refreshing = dashboard.loading || groups.loading;
	const refresh = () => {
		dashboard.refetch();
		groups.refetch();
	};

	return (
		<div className="w-full space-y-6 pb-10 md:space-y-8">
			<section className="flex items-center justify-between gap-3">
				<h2 className="text-[28px] font-light md:text-[34px] md:font-normal">
					Active Groups
				</h2>
				<div className="flex items-center gap-2">
					<GroupFilter value={filter} onChange={setFilter} />
					<button
						type="button"
						onClick={refresh}
						disabled={refreshing}
						aria-label="Refresh"
						className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-comment text-lg transition hover:bg-neutral-light md:h-11 md:w-11 md:text-xl"
					>
						<IoReload className={refreshing ? "animate-spin" : ""} />
					</button>
				</div>
			</section>

			<GroupStats data={dashboard.data} loading={dashboard.loading} />

			<GroupList
				groups={visible}
				loading={groups.loading}
				error={groups.error}
				onRetry={groups.refetch}
				filtered={filter !== "all"}
			/>

			<div className="pt-4">
				<DiscoverChallenges desktopTitle="Discover Groups" />
			</div>

			<CreateGroupFloatBtn />
		</div>
	);
}
