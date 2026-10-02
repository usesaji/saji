"use client";

import { useState } from "react";
import { IoClose } from "react-icons/io5";
import { ApiError, groups as groupsApi } from "../../lib/api";
import { toast } from "../../lib/utils/toast";

type PendingMember = { id: number; name: string };

const DISMISSED_KEY = "saji_dismissed_join_alerts";

function readDismissed(): number[] {
	try {
		return JSON.parse(window.sessionStorage.getItem(DISMISSED_KEY) ?? "[]");
	} catch {
		return [];
	}
}

function dismiss(id: number): void {
	try {
		window.sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...readDismissed(), id]));
	} catch {
		/* storage off — it will just show again next visit */
	}
}

/**
 * The organizer's heads-up for a new join request, with Approve / Decline in
 * place (group page, state 3). Closing it only hides the alert for this
 * session; the request stays in Pending Requests.
 */
export default function JoinRequestAlert({
	groupId,
	groupName,
	pending,
	onDecided,
}: {
	groupId: number;
	groupName: string;
	pending: PendingMember[];
	onDecided: () => void;
}) {
	const [hidden, setHidden] = useState<number[]>(() =>
		typeof window === "undefined" ? [] : readDismissed(),
	);
	const [busy, setBusy] = useState(false);

	const member = pending.find((m) => !hidden.includes(m.id));
	if (!member) return null;

	const close = () => {
		dismiss(member.id);
		setHidden((h) => [...h, member.id]);
	};

	const decide = async (approve: boolean) => {
		setBusy(true);
		try {
			if (approve) {
				await groupsApi.approve(groupId, member.id);
				toast.success(`${member.name} has been accepted into ${groupName}.`, "Member Accepted");
			} else {
				await groupsApi.decline(groupId, member.id);
				toast.error(`${member.name}'s request to join ${groupName} was declined.`, "Request Rejected");
			}
			close();
			onDecided();
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : "Something went wrong.", "Failed");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="fixed inset-x-0 top-24 z-1050 mx-auto w-full max-w-md px-4 md:top-28">
			<div role="alert" className="relative rounded-[15px] bg-primary-light px-5 py-4 shadow-lg">
				<button
					type="button"
					onClick={close}
					aria-label="Dismiss"
					className="absolute right-3.5 top-3 text-primary-darker"
				>
					<IoClose />
				</button>
				<p className="text-[10px] font-light text-primary-darker">Notifications</p>
				<p className="mt-1 pr-6 text-base text-primary-darker">{member.name} requested to join</p>
				<p className="text-xs font-light text-primary-darker">
					{member.name} asked to join {groupName} via your invite link.
				</p>
				<div className="mt-3 flex gap-2">
					<button
						type="button"
						disabled={busy}
						onClick={() => decide(false)}
						className="rounded-full bg-accent px-5 py-2 text-xs text-white disabled:opacity-60"
					>
						Decline
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={() => decide(true)}
						className="rounded-full bg-primary px-5 py-2 text-xs text-white disabled:opacity-60"
					>
						Approve
					</button>
				</div>
			</div>
		</div>
	);
}
