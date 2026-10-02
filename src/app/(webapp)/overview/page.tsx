"use client";

import { useCallback, useMemo } from "react";
import { useApi } from "../../../lib/hooks/useApi";
import {
	dashboard as dashboardApi,
	groups as groupsApi,
} from "../../../lib/api";
import SavingsSummaryCard from "../../../features/overview/SavingsSummaryCard";
import LinkWalletPrompt from "../../../features/wallet/LinkWalletPrompt";
import MyActiveGroups from "../../../features/overview/MyActiveGroups";
import DiscoverChallenges from "../../../features/overview/DiscoverChallenges";
import RecentActivities from "../../../features/overview/RecentActivities";
import ExploreCommunities from "../../../features/overview/ExploreCommunities";
import CreateGroupFloatBtn from "../../../features/group/CreateGroupFloatBtn";
import WhatsNewTour from "../../../features/overview/WhatsNewTour";
import { GOVERNANCE_ENABLED } from "../../../config/features";

export default function Page() {
	const dashboard = useApi(() => dashboardApi.show(), []);
	const groupsFetcher = useCallback(() => groupsApi.index(), []);
	const groups = useApi(groupsFetcher, []);

	const data = dashboard.data;

	// Active groups = the dashboard's live, APPROVED circles (open or running),
	// minus challenges, which get their own section. Details come from the
	// `/api/groups` rows: the dashboard payload has no faces, progress or dates,
	// and the groups list alone can't tell an approved member from a pending one.
	const activeGroups = useMemo(() => {
		if (!data || !groups.data) return [];
		const live = new Set(data.circles.map((c) => String(c.id)));
		return groups.data.filter(
			(g) => g.circle_kind !== "challenge" && live.has(String(g.id)),
		);
	}, [data, groups.data]);

	// Real faces for the hero's people stack, one per person.
	const faces = useMemo(() => {
		const seen = new Map<string, { name: string; avatar_url: string | null }>();
		for (const group of activeGroups) {
			for (const face of group.member_avatars ?? []) {
				if (!seen.has(face.name)) seen.set(face.name, face);
			}
		}
		return [...seen.values()];
	}, [activeGroups]);

	return (
		<div className="w-full space-y-8 pb-10 md:space-y-12">
			{dashboard.loading && (
				<div className="h-52 animate-pulse rounded-[20px] bg-primary-light md:h-72 md:rounded-[30px]" />
			)}

			{dashboard.error && !dashboard.loading && (
				<div className="rounded-[20px] bg-[#f8f8f8] p-6 text-sm">
					<p className="text-error-500">{dashboard.error}</p>
					<button
						onClick={dashboard.refetch}
						className="mt-2 font-medium underline"
					>
						Try again
					</button>
				</div>
			)}

			{data && !dashboard.loading && (
				<>
					<div className="space-y-4">
						<SavingsSummaryCard data={data} faces={faces} />
						<LinkWalletPrompt />
					</div>
					<MyActiveGroups
						groups={activeGroups}
						loading={groups.loading}
						error={groups.error}
					/>
					<DiscoverChallenges />
					<RecentActivities />
					<ExploreCommunities />
				</>
			)}

			<CreateGroupFloatBtn desktop />
			{GOVERNANCE_ENABLED && <WhatsNewTour />}
		</div>
	);
}
