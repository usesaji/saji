"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { HiCalendarDays, HiPause, HiPlay } from "react-icons/hi2";
import PageHeader from "@/components/dashboard/PageHeader";
import MemberAvatars from "@/features/group/MemberAvatars";
import { ACTIONS } from "@/features/governance/copy";
import { useGovernance, useGroup } from "@/features/governance/hooks";
import { OptionCard, PageState, PrimaryAction } from "@/features/governance/ui";
import { ApiError, fieldErrors, governance as governanceApi } from "@/lib/api";
import { pageRoutes } from "@/config/routes";
import { toast } from "@/lib/utils/toast";

type Action = keyof typeof ACTIONS;

const ICONS: Record<Action, React.ComponentType<{ className?: string }>> = {
	pause: HiPause,
	resume: HiPlay,
	payout_schedule: HiCalendarDays,
};

/** Create Proposal: pick a supported action, explain it, send it to a vote. */
export default function NewProposalPage() {
	const { groupId } = useParams<{ groupId: string }>();
	const router = useRouter();
	const gov = useGovernance(groupId);
	const group = useGroup(groupId);

	const [action, setAction] = useState<Action | null>(null);
	const [description, setDescription] = useState("");
	const [title, setTitle] = useState("");
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [submitting, setSubmitting] = useState(false);

	const status = gov.data?.status;
	/** Why an action can't be proposed right now, or null when it can. */
	const blocked = (a: Action): string | null => {
		if (status === "recovery") return "Resolve the missed contribution first.";
		if (a === "pause" && status === "paused") return "The group is already paused.";
		if (a === "resume" && status !== "paused") return "The group isn't paused.";
		return null;
	};

	const submit = async () => {
		if (!action) return;
		setSubmitting(true);
		setErrors({});
		try {
			const proposal = await governanceApi.create(Number(groupId), {
				action,
				title: title.trim(),
				description: description.trim() || null,
			});
			toast.success("Members can now vote on it.", "Proposal created");
			router.push(pageRoutes.dashboardRoutes.PROPOSAL(groupId, proposal.id));
		} catch (err) {
			setErrors(fieldErrors(err));
			toast.error(err instanceof ApiError ? err.message : "Could not create the proposal.", "Not created");
		} finally {
			setSubmitting(false);
		}
	};

	const members = (group.data?.members ?? [])
		.filter((m) => m.status === "approved")
		.map((m) => ({ name: m.user?.name ?? "", avatar_url: m.user?.avatar_url ?? null }));

	const threshold = gov.data && (
		<section className="rounded-[14px] bg-primary-light px-5 py-5">
			<p className="text-base text-primary md:text-lg">Approval threshold</p>
			<p className="mt-1 max-w-md text-xs md:text-sm">
				The action will only happen when at least {gov.data.threshold_pct}% of members vote For
				before the deadline.
			</p>
			<div className="mt-4 flex items-center justify-between gap-3">
				<MemberAvatars
					members={members.slice(0, 3)}
					total={members.length}
					overflowClassName="bg-neutral-dark text-white"
				/>
				<span className="text-xs">
					{gov.data.threshold} of {gov.data.eligible_voters} members
				</span>
			</div>
		</section>
	);

	return (
		<div className="w-full space-y-6 pb-10">
			<PageHeader title="Create Proposal" back backHref={pageRoutes.dashboardRoutes.PROPOSALS(groupId)} />

			<PageState loading={gov.loading} error={gov.error} onRetry={gov.refetch} />

			{gov.data && (
				<>
					<div className="grid items-start gap-6 md:grid-cols-2">
						<section>
							<p className="text-base md:text-lg">What should the group decide?</p>
							<div className="mt-3 space-y-3" role="radiogroup" aria-label="Proposal type">
								{(Object.keys(ACTIONS) as Action[]).map((a) => {
									const reason = blocked(a);
									return (
										<OptionCard
											key={a}
											selected={action === a}
											onSelect={() => setAction(a)}
											disabled={reason !== null}
											Icon={ICONS[a]}
											title={ACTIONS[a].label}
											subtitle={reason ?? ACTIONS[a].subtitle}
										/>
									);
								})}
							</div>
							{errors.action && <p className="mt-2 text-xs text-error-500">{errors.action}</p>}
						</section>

						<section className="space-y-5">
							<Field label="Description" error={errors.description}>
								<textarea
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder="Give members a clear reason"
									rows={3}
									className="w-full resize-none rounded-[20px] border border-neutral-light-hover bg-white px-5 py-3 text-sm outline-none focus:border-primary"
								/>
							</Field>
							<Field label="Proposed action" error={errors.title}>
								<input
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									placeholder={action ? ACTIONS[action].placeholder : "Choose what the group should decide first"}
									maxLength={120}
									className="h-12 w-full rounded-full border border-neutral-light-hover bg-white px-5 text-sm outline-none focus:border-primary"
								/>
							</Field>
							<div className="max-md:hidden md:flex md:justify-end">
								<PrimaryAction onClick={submit} disabled={!action || !title.trim() || submitting}>
									{submitting ? "Creating…" : "Review Proposal"}
								</PrimaryAction>
							</div>
						</section>
					</div>

					{threshold}

					<div className="md:hidden">
						<PrimaryAction onClick={submit} disabled={!action || !title.trim() || submitting}>
							{submitting ? "Creating…" : "Review Proposal"}
						</PrimaryAction>
					</div>
				</>
			)}
		</div>
	);
}

function Field({
	label,
	error,
	children,
}: {
	label: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<label className="block space-y-2">
			<span className="text-xs font-light md:text-sm">{label}</span>
			{children}
			{error && <span className="block text-xs text-error-500">{error}</span>}
		</label>
	);
}
