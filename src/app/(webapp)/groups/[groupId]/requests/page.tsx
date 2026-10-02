"use client";

import { useCallback } from "react";
import PageHeader from "@/components/dashboard/PageHeader";
import { useParams } from "next/navigation";
import { useApi } from "@/lib/hooks/useApi";
import { groups as groupsApi, auth } from "@/lib/api";
import PendingRequests from "@/features/group/PendingRequests";

/** Full "Member Requests" page — pending join requests with Approve / Decline. */
export default function GroupRequestsPage() {
	const { groupId } = useParams<{ groupId: string }>();
	const id = Number(groupId);

	const { data: group, loading, refetch } = useApi(
		useCallback(() => groupsApi.show(id), [id]),
		[id],
	);
	const { data: me } = useApi(useCallback(() => auth.me(), []), []);
	const isOrganizer = !!(me && group && me.id === group.organizer_id);

	const pendingCount = (group?.members ?? []).filter(
		(m) => m.status === "pending",
	).length;

	return (
		<div className="w-full max-w-4xl space-y-6 pb-10">
			<PageHeader title="Requests" subtitle="People asking to join your circle." back />

			{loading ? (
				<p className="mt-6 text-sm text-muted-foreground">Loading requests…</p>
			) : !isOrganizer ? (
				<p className="mt-6 text-sm text-muted-foreground">
					Only the organizer can review join requests.
				</p>
			) : pendingCount === 0 ? (
				<p className="mt-6 text-sm text-muted-foreground">
					No pending requests.
				</p>
			) : (
				<PendingRequests
					groupId={id}
					groupName={group?.name}
					members={group?.members ?? []}
					isOrganizer={isOrganizer}
					onDecided={refetch}
				/>
			)}
		</div>
	);
}
