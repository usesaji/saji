"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { ApiError, groups as groupsApi, type Group } from "../../lib/api";
import { pageRoutes } from "../../config/routes";
import { toast } from "../../lib/utils/toast";
import SectionHeader from "../../components/dashboard/SectionHeader";

function requestedAgo(iso?: string): string {
	if (!iso) return "Requested to join";
	const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
	if (hours < 1) return "Requested just now";
	if (hours < 24) return `Requested ${hours}h ago`;
	return `Requested ${Math.floor(hours / 24)}d ago`;
}

/**
 * Pending join requests for the organizer — approve or decline each one. Used
 * inline on the group page (capped) and on the full Requests page. Renders
 * nothing for non-organizers or when nobody is waiting.
 *
 * Takes the group's members from the caller, which already loaded them, and
 * reports back after a decision so the caller can refresh.
 */
export default function PendingRequests({
	groupId,
	groupName,
	members,
	isOrganizer,
	limit,
	showViewAll = false,
	onDecided,
}: {
	groupId: number;
	groupName?: string;
	members: NonNullable<Group["members"]>;
	isOrganizer: boolean;
	/** Cap the number shown (e.g. 2 on the group page). */
	limit?: number;
	showViewAll?: boolean;
	onDecided: () => void;
}) {
	const [busy, setBusy] = useState<number | null>(null);

	const pending = members.filter((m) => m.status === "pending");
	const shown = limit ? pending.slice(0, limit) : pending;

	if (!isOrganizer || pending.length === 0) return null;

	const decide = async (memberId: number, name: string, approve: boolean) => {
		setBusy(memberId);
		const where = groupName ? ` ${groupName}` : " the group";
		try {
			if (approve) {
				await groupsApi.approve(groupId, memberId);
				toast.success(`${name} has been accepted into${where}.`, "Member Accepted");
			} else {
				await groupsApi.decline(groupId, memberId);
				toast.error(`${name}'s request to join${where} was declined.`, "Request Rejected");
			}
			onDecided();
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : "Something went wrong.", "Failed");
		} finally {
			setBusy(null);
		}
	};

	return (
		<section>
			<SectionHeader
				title={
					<span className="flex items-center gap-2 text-base md:text-lg">
						Pending Requests
						<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error-400 px-1 text-[10px] text-white">
							{pending.length}
						</span>
					</span>
				}
				href={
					showViewAll && pending.length > (limit ?? 0)
						? pageRoutes.dashboardRoutes.GROUP_REQUESTS(groupId)
						: undefined
				}
			/>

			<ul className="mt-3 space-y-3">
				{shown.map((m) => {
					const name = m.user?.name ?? "Member";
					return (
						<li key={m.id} className="flex items-center justify-between gap-3">
							<div className="flex min-w-0 items-center gap-3">
								<div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-primary-light">
									{m.user?.avatar_url ? (
										<img src={m.user.avatar_url} alt="" className="h-full w-full object-cover" />
									) : (
										<span className="flex h-full w-full items-center justify-center text-primary">
											{name.charAt(0).toUpperCase()}
										</span>
									)}
								</div>
								<div className="min-w-0">
									<p className="truncate text-sm">{name}</p>
									<p className="text-[11px] font-light">{requestedAgo(m.created_at)}</p>
								</div>
							</div>
							<div className="flex shrink-0 gap-2">
								<button
									type="button"
									disabled={busy === m.id}
									onClick={() => decide(m.id, name, false)}
									className="rounded-full bg-accent px-4 py-2 text-xs text-white transition hover:bg-accent-hover disabled:opacity-60"
								>
									Decline
								</button>
								<button
									type="button"
									disabled={busy === m.id}
									onClick={() => decide(m.id, name, true)}
									className="rounded-full bg-primary px-4 py-2 text-xs text-white transition hover:bg-primary-hover disabled:opacity-60"
								>
									Approve
								</button>
							</div>
						</li>
					);
				})}
			</ul>
		</section>
	);
}
