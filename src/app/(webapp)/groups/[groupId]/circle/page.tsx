"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/dashboard/PageHeader";
import Link from "next/link";
import { useParams } from "next/navigation";
import { HiXMark } from "react-icons/hi2";
import SectionHeader from "@/components/dashboard/SectionHeader";
import { useApi } from "@/lib/hooks/useApi";
import {
	groups as groupsApi,
	contributions as contributionsApi,
	auth,
	ApiError,
} from "@/lib/api";
import { pageRoutes } from "@/config/routes";
import PendingRequests from "@/features/group/PendingRequests";
import ProposalCard from "@/features/governance/ProposalCard";
import { useGovernance } from "@/features/governance/hooks";
import JoinRequestAlert from "@/features/circle/JoinRequestAlert";
import {
	Banner,
	CycleActivityList,
	DecideTogether,
	NothingYet,
	PayoutRotationStrip,
	SavingsCard,
	ThisCycleCard,
	circleStatus,
} from "@/features/circle/CircleSections";
import { useSavingsContract } from "@/lib/hooks/useSavingsContract";
import { useLiveCircle } from "@/lib/hooks/useLiveCircle";
import { requireToken } from "@/lib/contract/tokens";
import { addTrustline } from "@/lib/wallet";
import { toast } from "@/lib/utils/toast";
import { formatStroops, toStroopsOrZero } from "@/lib/stroops";
import { formatCountdown } from "@/features/group/group-view";
import { BAD_AUTH_MESSAGE, displayError, errorMessage, isBadAuthError } from "@/lib/errors";

/** Contribution frequency code → adjective for copy ("daily", "weekly", …). */
function frequencyLabel(frequency: string | undefined): string {
	switch (frequency) {
		case "daily":
			return "daily";
		case "weekly":
			return "weekly";
		case "bi_weekly":
			return "bi-weekly";
		case "monthly":
			return "monthly";
		case "custom":
			return "scheduled";
		default:
			return "regular";
	}
}

/**
 * Per-circle dashboard: the group's pooled savings, payout rotation, and cycle
 * activity — with first-payment onboarding for a brand-new circle. Backed by
 * GET /api/groups/{id}/circle.
 */
export default function CircleDashboardPage() {
	const { groupId } = useParams<{ groupId: string }>();
	const fetcher = useCallback(
		() => groupsApi.circle(Number(groupId)),
		[groupId],
	);
	const { data, loading, error, refetch } = useApi(fetcher, [groupId]);

	// Organizer check (for pending-request actions).
	const { data: me } = useApi(useCallback(() => auth.me(), []), []);
	const groupFetcher = useCallback(() => groupsApi.show(Number(groupId)), [groupId]);
	const { data: group, refetch: refetchGroup } = useApi(groupFetcher, [groupId]);
	const isOrganizer = !!(me && group && me.id === group.organizer_id);

	const [hidden, setHidden] = useState(false);
	// Onboarding modal step: 0 = closed, 1 = "alerted 72h", 2 = "payout time".
	// Shown ONCE per circle (persisted in localStorage), not on every visit.
	const onboardKey = `saji:onboarded:circle:${groupId}`;
	// Opens once if this circle hasn't been seen yet. Read lazily rather than in
	// an effect; the modal only renders after the circle loads on the client.
	const [onboard, setOnboard] = useState(() => {
		try {
			return typeof window !== "undefined" && !localStorage.getItem(onboardKey) ? 1 : 0;
		} catch {
			return 0;
		}
	});

	// Mark this circle's onboarding as seen so it never reopens.
	const dismissOnboard = useCallback(() => {
		try {
			localStorage.setItem(onboardKey, "1");
		} catch {
			/* storage off — it may show again, which is harmless */
		}
		setOnboard(0);
	}, [onboardKey]);

	const hasActivity = (data?.cycle_activity.length ?? 0) > 0;

	// Contribute here rather than linking to the group page: once the cycle is
	// active that page redirects straight back here, so a link would look like
	// a dead button.
	const { contribute: contributeOnchain } = useSavingsContract();
	const [contributing, setContributing] = useState(false);

	const onchainId = group?.onchain_group_id ?? null;
	const assetCode = data?.group.asset_code ?? "USDC";

	// LIVE on-chain snapshot — read straight from the RPC so state (status, cycle,
	// whether I've paid, my claimable) updates INSTANTLY after an action, without
	// waiting for the backend indexer. Overlaid on the DB data below; refreshed
	// right after contribute/claim.
	const { live, refresh: refreshLive } = useLiveCircle(onchainId);

	// Prefer live chain truth where we have it, fall back to the DB payload.
	// Live status 3 = Completed.
	const isCompleted = live
		? live.status === 3
		: data?.group.status === "completed";
	const currentCycle = live?.cycle ?? data?.current_cycle ?? 0;

	// Whose turn it is, from the CONTRACT (`next_recipient`), matched back to a
	// rotation row by address.
	//
	// The old version recomputed this as `position - 1 === currentCycle`. The
	// contract abandoned index-based selection on purpose — it scans for the
	// first member who is neither defaulted nor already paid, precisely so a
	// removal never mis-assigns a slot — so after any removal the index math
	// named the wrong person. It also filtered on `removed`, which the indexer
	// never set, making that guard permanently false. Falls back to the old
	// derivation only when the chain read is unavailable.
	// Preference order, most to least trustworthy:
	//  1. the server's own resolution against the contract — works even when
	//     addresses are masked by `hide_balances`,
	//  2. matching our live `next_recipient` read by address,
	//  3. the old index derivation, only when the chain is unreachable.
	const currentRecipient =
		(data?.current_recipient_user_id != null
			? data.payout_rotation.find(
					(m) => m.user_id === data.current_recipient_user_id,
				)
			: undefined) ??
		(live?.nextRecipient
			? data?.payout_rotation.find(
					(m) => m.stellar_address === live.nextRecipient,
				)
			: data?.payout_rotation.find(
					(m) => !m.removed && m.position - 1 === currentCycle,
				));
	const currentRecipientIsMe =
		!!me && !!currentRecipient && currentRecipient.user_id === me.id;

	// Has the current user paid THIS cycle? Live read wins; DB is the fallback.
	const paidThisCycle = live ? live.paidThisCycle : !!data?.you_paid_this_cycle;

	// What the wallet will ACTUALLY be asked to send: the contribution plus any
	// late-fee debt, which the contract adds to the next deposit. Showing the
	// bare contribution meant the first a user heard of a penalty was a larger
	// number in their wallet popup.
	const contributionStroops = toStroopsOrZero(
		data?.group.contribution_amount ?? "0",
	);
	const lateFeeStroops = live?.myLateFeeStroops ?? 0n;
	const amountDueStroops = contributionStroops + lateFeeStroops;

	// Is this round's deposit window open yet?
	//
	// A cycle pays out as soon as everyone who owes has paid, so the schedule is
	// carried by the NEXT round's deposit window — `contribute` reverts with
	// `CycleNotOpen` until it arrives. `depositsOpenAt` is null when the chain
	// could not tell us (an older deployed contract has no such function), and
	// that case must read as OPEN: locking everyone out of a circle that is
	// actually running would be far worse than one rejected signature. The
	// contract remains the real gate.
	const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
	const opensAt = live?.depositsOpenAt ?? null;
	const roundClosed = opensAt !== null && now < opensAt;

	// Only ticks while a round is actually closed, and stops once it opens.
	useEffect(() => {
		if (!roundClosed) return;
		const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
		return () => clearInterval(id);
	}, [roundClosed]);

	const contribute = async () => {
		if (!group) return;

		if (onchainId === null || onchainId === undefined) {
			toast.error(
				"This circle isn't live on-chain yet. The organizer must activate it first.",
				"Not ready",
			);
			return;
		}

		setContributing(true);
		try {
			// The wallet must trust the group's token before it can send it. Add
			// the trustline for the GROUP'S chosen asset up front (one signature,
			// no-op if it already trusts it) so the contribution can't fail for a
			// missing trustline — the asset is picked at group creation, not here.
			const linked = me?.stellar_address ?? null;
			const asset = requireToken(assetCode);
			if (linked && !asset.native && asset.issuer) {
				await addTrustline(linked, asset.code, asset.issuer);
			}

			// Record intent (idempotent), settle on-chain, then confirm the row.
			await contributionsApi.store(group.id);
			await contributeOnchain(onchainId);

			// The money has moved and cannot be un-moved — from here on nothing
			// may present itself as a failure. But a failed confirm was being
			// swallowed entirely while the success toast fired anyway, so a
			// member whose row stayed `pending` had no idea why, and the cron
			// that eventually fixes it runs DAILY. Say so instead.
			let confirmed = true;
			try {
				await contributionsApi.confirm(group.id);
			} catch {
				confirmed = false;
			}

			if (confirmed) {
				toast.success("Your contribution is on-chain.", "Contribution sent");
			} else {
				toast.success(
					"Your payment settled on-chain. It may show as pending here for a little while until we finish reconciling — your money is safe either way.",
					"Payment sent",
				);
			}
			// Read the chain directly for an INSTANT UI update (paid-this-cycle,
			// pool, cycle) — no waiting on the backend indexer.
			refreshLive();
			refetch();
			// The DB-derived bits (activity feed) still reconcile in a standalone
			// process, so refetch once more shortly to pull those in.
			setTimeout(() => refetch(), 6000);
		} catch (err) {
			// See errorMessage: a non-Error throw must not collapse to "" and
			// bypass the specific guidance below.
			const raw = errorMessage(err);

			if (/trustline entry is missing|no trust/i.test(raw)) {
				toast.error(
					`Your wallet can't hold ${assetCode} yet — approve the ${assetCode} trustline when your wallet prompts, then try again.`,
					"Enable the asset first",
				);
			} else if (/#8\b|AlreadyContributed/i.test(raw)) {
				toast.success(
					"You've already contributed this cycle.",
					"Already contributed",
				);
			} else if (/User (declined|rejected)|cancell?ed/i.test(raw)) {
				toast.error("You cancelled the signature.", "Cancelled");
			} else if (isBadAuthError(err)) {
				toast.error(BAD_AUTH_MESSAGE, "Wrong account signed");
			} else if (/insufficient|balance/i.test(raw)) {
				toast.error(
					`Not enough ${assetCode} in your wallet to contribute.`,
					"Insufficient balance",
				);
			} else {
				toast.error(
					err instanceof ApiError
						? err.message
						: displayError(err, "Something went wrong."),
					"Could not contribute",
				);
			}
		} finally {
			setContributing(false);
		}
	};

	// --- governance (MVP 2) — optional: the section hides if it isn't available ---
	const gov = useGovernance(groupId);
	const governance = gov.data;
	const onHold = governance?.on_hold ?? false;
	const groupStatus = governance?.status ?? data?.group.status;

	// This cycle's paid count, for "Group contributions".
	const dashFetcher = useCallback(() => groupsApi.dashboard(Number(groupId)), [groupId]);
	const { data: groupDash } = useApi(dashFetcher, [groupId]);

	const members = group?.members ?? [];
	const faces = members
		.filter((m) => m.status === "approved")
		.map((m) => ({ name: m.user?.name ?? "", avatar_url: m.user?.avatar_url ?? null }));
	const pendingMembers = members
		.filter((m) => m.status === "pending")
		.map((m) => ({ id: m.id, name: m.user?.name ?? "A member" }));

	const afterDecision = () => {
		refetchGroup();
		refetch();
	};

	// Organizer only: the invite endpoint is organizer-gated.
	const [inviting, setInviting] = useState(false);
	const invite = async () => {
		setInviting(true);
		try {
			const link = await groupsApi.inviteLink(Number(groupId));
			const url = link.invite_url ?? `${window.location.origin}/groups/join/${link.invite_token}`;
			const name = data?.group.name ?? "my savings group";
			if (typeof navigator.share === "function") {
				try {
					await navigator.share({ title: name, text: `Join "${name}" on Saji`, url });
					return;
				} catch {
					/* dismissed — fall through to copying */
				}
			}
			await navigator.clipboard.writeText(url);
			toast.success("Paste it wherever your members are.", "Invite link copied");
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : "Could not get the invite link.", "Invite failed");
		} finally {
			setInviting(false);
		}
	};

	const nextPayoutAt = group?.next_payout_at ?? null;
	// `now` (seconds, from the round countdown) instead of Date.now() — render
	// must stay pure.
	const daysUntil = nextPayoutAt
		? Math.round((new Date(nextPayoutAt).getTime() - now * 1000) / 86_400_000)
		: null;
	const dueIn =
		daysUntil === null
			? "this cycle"
			: daysUntil <= 0
				? "today"
				: `in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
	const amountDue = `${formatStroops(amountDueStroops)} ${assetCode}`;

	const confirmedThisCycle = groupDash?.contribution_progress.confirmed ?? null;
	// The recipient doesn't pay into their own pot, so one fewer member owes.
	const payers = Math.max((data?.member_count ?? 1) - 1, 1);

	const ownStatus = currentRecipientIsMe
		? { value: "Your turn to collect", tone: "green" as const }
		: paidThisCycle
			? { value: `${amountDue} paid`, tone: "green" as const }
			: { value: `${amountDue} due`, tone: "pink" as const };

	const isActive = (live ? live.status === 2 : data?.group.status === "active") && !isCompleted;
	const showDue = isActive && !onHold && !paidThisCycle && !currentRecipientIsMe;

	const nothingYet =
		!!data &&
		!hasActivity &&
		!(governance && (governance.open_proposals.length > 0 || governance.proposals_total > 0)) &&
		!(isOrganizer && pendingMembers.length > 0);

	const payLabel = paidThisCycle
		? "Paid this cycle"
		: onHold
			? groupStatus === "recovery"
				? "Paused for recovery"
				: "Group paused"
			: roundClosed
				? `Opens in ${formatCountdown(opensAt! - now)}`
				: "Pay Now";

	return (
		<div className="w-full pb-10">
			<PageHeader
				title={data?.group.name ?? "Circle"}
				back
				backHref={pageRoutes.dashboardRoutes.GROUPS}
				actions={
					isOrganizer ? (
						<Link
							href={`${pageRoutes.dashboardRoutes.GROUP(String(groupId))}?manage=1`}
							className="rounded-full bg-neutral-comment px-4 py-2 text-xs transition hover:bg-primary-light md:text-sm"
						>
							Manage
						</Link>
					) : undefined
				}
			/>

			{loading && (
				<div className="mt-6 h-48 animate-pulse rounded-[20px] bg-[#f8f8f8]" />
			)}
			{error && !loading && (
				<div className="mt-6 rounded-[20px] bg-[#f8f8f8] p-6 text-sm">
					<p className="text-error-500">{error}</p>
					<button onClick={refetch} className="mt-2 font-medium underline">
						Try again
					</button>
				</div>
			)}

			{data && !loading && (
				<div className="mt-6 space-y-8">
					<div className="space-y-4">
						<SavingsCard
							total={data.total_deposited}
							asset={data.group.asset_code}
							hidden={hidden}
							onToggleHidden={() => setHidden((h) => !h)}
							status={circleStatus(groupStatus)}
							faces={faces}
							memberCount={data.member_count}
							percent={data.circle_progress.percent}
							cycleLabel={
								isCompleted
									? `All ${data.circle_progress.cycles_total} cycles done`
									: `Cycle ${Math.min(data.circle_progress.cycles_done + 1, data.circle_progress.cycles_total)} of ${data.circle_progress.cycles_total}`
							}
							progressLabel={
								data.group.target_amount
									? `${Number(data.total_deposited).toLocaleString()} / ${Number(data.group.target_amount).toLocaleString()}`
									: null
							}
							nextPayout={
								nextPayoutAt
									? new Date(nextPayoutAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
									: null
							}
						/>

						{/* What needs attention, most urgent first. */}
						{governance?.open_default ? (
							<Banner
								tone="pink"
								title={`${governance.open_default.member.name.split(" ")[0]} missed a contribution`}
								href={pageRoutes.dashboardRoutes.RECOVERY(groupId)}
								cta="View recovery"
							>
								This cycle is paused until members agree on a recovery action.
							</Banner>
						) : groupStatus === "paused" ? (
							<Banner
								tone="yellow"
								title="This group is paused"
								href={pageRoutes.dashboardRoutes.PROPOSALS(groupId)}
								cta="Proposals"
							>
								Members voted to pause. Contributions and payouts restart once a resume proposal
								passes.
							</Banner>
						) : currentRecipientIsMe && isActive ? (
							<Banner tone="lilac" title="It's your turn to collect this cycle">
								You don&apos;t pay into your own payout — the others fund it. Once they have, it
								shows in your Saji Balance to withdraw.
							</Banner>
						) : showDue ? (
							<Banner tone="lilac" title={roundClosed ? `Next round opens in ${formatCountdown(opensAt! - now)}` : `${amountDue} Due ${dueIn}`}>
								{roundClosed
									? "The last round has been paid out. Contributions for the next one open on schedule."
									: `Your ${frequencyLabel(data.group.contribution_frequency)} group contribution of ${amountDue} is due ${dueIn}. Ensure you leave enough balance to avoid missed payment penalties.`}
								{lateFeeStroops > 0n &&
									` Includes a ${formatStroops(lateFeeStroops)} ${assetCode} late fee from a missed round.`}
							</Banner>
						) : null}
					</div>

					{governance && (
						<div className="grid items-start gap-6 lg:grid-cols-2">
							<section className="space-y-3">
								<SectionHeader
									title={
										<span className="flex items-center gap-2 text-sm md:text-base">
											Active proposal
											{governance.open_proposals.length > 0 && (
												<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-error-400 px-1 text-[10px] text-white">
													{governance.open_proposals.length}
												</span>
											)}
										</span>
									}
									action={
										<Link href={pageRoutes.dashboardRoutes.PROPOSALS(groupId)} className="text-xs text-primary md:text-sm">
											View proposals →
										</Link>
									}
								/>
								{governance.open_proposals[0] ? (
									<ProposalCard proposal={governance.open_proposals[0]} groupId={groupId} showVoters />
								) : (
									<div className="rounded-[14px] bg-[#f8f8f8] px-5 py-6 text-center text-xs font-light">
										Nothing is being voted on right now.
									</div>
								)}
							</section>

							<div className="space-y-4">
								<ThisCycleCard
									historyHref={pageRoutes.dashboardRoutes.GROUP_HISTORY(groupId)}
									rows={[
										{ label: "Your contribution", ...ownStatus },
										{
											label: "Group contributions",
											value:
												confirmedThisCycle === null ? "—" : `${confirmedThisCycle} of ${payers} paid`,
										},
										{
											label: "Defaults recorded",
											value: governance.defaults_recorded === 0 ? "None" : String(governance.defaults_recorded),
											tone: governance.defaults_recorded === 0 ? "green" : "pink",
										},
									]}
								/>
								<DecideTogether href={pageRoutes.dashboardRoutes.PROPOSALS(groupId)} />
							</div>
						</div>
					)}

					<PayoutRotationStrip
						rotation={data.payout_rotation}
						currentUserId={currentRecipient?.user_id ?? null}
						href={pageRoutes.dashboardRoutes.PAYOUT_ORDER(groupId)}
					/>

					<PendingRequests
						groupId={Number(groupId)}
						groupName={data.group.name}
						members={members}
						isOrganizer={isOrganizer}
						limit={2}
						showViewAll
						onDecided={afterDecision}
					/>

					{hasActivity && (
						<CycleActivityList
							activity={data.cycle_activity}
							viewAllHref={pageRoutes.dashboardRoutes.ACTIVITY}
						/>
					)}

					{nothingYet && <NothingYet />}

					{/* The page's two actions, kept in reach while scrolling.

					    The recipient is EXEMPT: the contract rejects a contribution
					    from whoever is due to collect, so they get no pay button. */}
					<div className="sticky bottom-24 z-30 flex gap-3 lg:bottom-6">
						{isCompleted ? (
							<Link
								href={pageRoutes.dashboardRoutes.GROUP_COMPLETE(groupId)}
								className="flex h-12 flex-1 items-center justify-center rounded-full bg-primary text-sm text-white shadow-lg md:max-w-xs"
							>
								View Cycle Summary
							</Link>
						) : (
							!currentRecipientIsMe && (
								<button
									type="button"
									onClick={contribute}
									disabled={contributing || paidThisCycle || roundClosed || onHold || !isActive}
									className="h-12 flex-1 rounded-full bg-primary text-sm text-white shadow-lg transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-neutral-light-hover disabled:text-neutral-light-active disabled:shadow-none md:max-w-xs md:text-base"
								>
									{contributing ? "Confirm in your wallet…" : payLabel}
								</button>
							)
						)}
						{isOrganizer && (
							<button
								type="button"
								onClick={invite}
								disabled={inviting}
								className="h-12 flex-1 rounded-full bg-neutral-comment text-sm text-accent shadow-lg transition hover:bg-accent-light disabled:opacity-60 md:max-w-xs md:text-base"
							>
								Invite Members
							</button>
						)}
					</div>
				</div>
			)}

			{isOrganizer && data && !loading && (
				<JoinRequestAlert
					groupId={Number(groupId)}
					groupName={data.group.name}
					pending={pendingMembers}
					onDecided={afterDecision}
				/>
			)}

			{/* Onboarding — only while the circle is brand-new. */}
			{data && !loading && !hasActivity && onboard > 0 && (
				<OnboardingModal
					step={onboard}
					onNext={() => (onboard === 1 ? setOnboard(2) : dismissOnboard())}
					onPrev={() => setOnboard(1)}
					onClose={dismissOnboard}
				/>
			)}
		</div>
	);
}

/** First-visit walkthrough for a new circle, styled like the dashboard tour. */
function OnboardingModal({
	step,
	onNext,
	onPrev,
	onClose,
}: {
	step: number;
	onNext: () => void;
	onPrev: () => void;
	onClose: () => void;
}) {
	const content =
		step === 1
			? {
					title: "You get alerted 72 hours before",
					body: "We remind you before each contribution is due so you can keep enough balance and avoid missed-payment penalties.",
				}
			: {
					title: "Payout takes 3–5 minutes",
					body: "Once everyone has contributed, the payout settles on-chain in a few minutes to the member whose turn it is.",
				};

	return (
		<div className="fixed inset-0 z-1100 flex items-center justify-center bg-black/15 px-4 backdrop-blur-md">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="circle-onboarding-title"
				className="w-full max-w-lg rounded-[14px] bg-white px-6 pb-6 pt-7 shadow-xl md:px-8 md:pb-8"
			>
				<div className="flex items-start justify-between gap-4">
					<h3 id="circle-onboarding-title" className="text-2xl md:text-[28px]">
						{content.title}
					</h3>
					<button onClick={onClose} type="button" aria-label="Close" className="text-2xl">
						<HiXMark />
					</button>
				</div>
				<p className="mt-2 text-sm leading-relaxed md:text-base">{content.body}</p>
				<div className={`mt-8 flex items-center ${step === 2 ? "justify-between" : ""}`}>
					{step === 2 && (
						<button
							type="button"
							onClick={onPrev}
							className="h-12 rounded-full bg-neutral-comment px-7 text-base transition hover:bg-neutral-light"
						>
							Previous
						</button>
					)}
					<button
						type="button"
						onClick={onNext}
						className="h-12 rounded-full bg-primary px-7 text-base text-white transition hover:bg-primary-hover"
					>
						{step === 1 ? "Next" : "Got it"}
					</button>
				</div>
			</div>
		</div>
	);
}
