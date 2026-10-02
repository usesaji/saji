"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { TbMoneybag } from "react-icons/tb";
import { Button } from "../../components/ui/button";
import { pageRoutes } from "../../config/routes";
import type { Group } from "../../lib/api";
import type { CircleGroup } from "../../lib/utils/circle-group";
import { formatMoney } from "../../lib/utils";
import { groupToCircle, labelize } from "./group-view";
import MemberAvatars from "./MemberAvatars";

/**
 * The two shapes a circle takes in a list, both built from a `GET /api/groups`
 * row: `CircleCard` (desktop grid) and `CircleRow` (compact mobile list).
 */

/** Mobile progress bars cycle through the brand colours, as in the design. */
const BAR_COLORS = ["bg-primary", "bg-accent", "bg-warning-500"];

const BADGE: Record<CircleGroup["status"], string> = {
	PAID: "bg-primary-light text-primary",
	PENDING: "bg-warning-100 text-warning-800",
	OVERDUE: "bg-accent-light text-accent",
};

const formatAmount = (value: number) =>
	value.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Approved members only. `memberCount` counts every membership row, pending
 * requests included — people who neither pay in nor receive.
 */
function approvedCount(group: Group, circle: CircleGroup): number {
	return group.approved_count ?? circle.memberCount;
}

function progressOf(circle: CircleGroup): number {
	return circle.target > 0
		? Math.min(100, Math.round((circle.current / circle.target) * 100))
		: 0;
}

/**
 * A challenge has no rotation, so "paid / your aim" means nothing there. Its
 * figure is the shared goal; personal progress lives on the challenge itself.
 */
const isChallenge = (group: Group) => group.circle_kind === "challenge";

function ProgressBar({ percent, color }: { percent: number; color: string }) {
	return (
		<div
			className="h-1.5 rounded-full bg-neutral-light"
			role="progressbar"
			aria-valuenow={percent}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<div
				className={`h-full rounded-full ${color} transition-all`}
				style={{ width: `${percent}%` }}
			/>
		</div>
	);
}

/** Mobile row: name + members, progress, next deposit date + amounts. */
export function CircleRow({ group, index = 0 }: { group: Group; index?: number }) {
	const circle = groupToCircle(group);
	const members = approvedCount(group, circle);
	const challenge = isChallenge(group);

	return (
		<Link
			href={pageRoutes.dashboardRoutes.GROUP(circle.id)}
			className="block space-y-3 rounded-xl bg-[#f8f8f8] p-4 transition hover:bg-[#f2f2f2]"
		>
			<div className="flex items-center justify-between gap-3">
				<p className="truncate text-sm">{circle.title}</p>
				<div className="flex shrink-0 items-center gap-1.5">
					<MemberAvatars
						members={(circle.memberAvatars ?? []).slice(0, 3)}
						total={members}
						size="sm"
						overflowClassName="bg-primary text-white"
					/>
					<span className="text-[11px]">{members} {members === 1 ? "Member" : "Members"}</span>
				</div>
			</div>

			{!challenge && (
				<ProgressBar
					percent={progressOf(circle)}
					color={BAR_COLORS[index % BAR_COLORS.length]}
				/>
			)}

			<div className="flex items-center justify-between gap-3 text-[11px]">
				{challenge ? (
					<span>Savings Challenge</span>
				) : (
					// The cycle boundary — when this contribution is due and the next
					// deposit window opens. Not called a payout date: a cycle pays out
					// as soon as everyone has funded it, often well before this.
					<span className="flex items-center gap-1.5">
						<TbMoneybag className="text-sm text-primary" />
						Next Deposit : {circle.nextDepositDate}
					</span>
				)}
				<span>
					{challenge
						? `Goal ${formatMoney(group.savings_target, group.asset_code)}`
						: `${formatAmount(circle.current)} / ${formatAmount(circle.target)}`}
				</span>
			</div>
		</Link>
	);
}

/** Desktop card: target progress, status badge, members, View Details. */
export function CircleCard({ group }: { group: Group }) {
	const circle = groupToCircle(group);
	const members = approvedCount(group, circle);
	const challenge = isChallenge(group);

	return (
		<article className="flex flex-col rounded-[20px] bg-[#f8f8f8] p-6 lg:p-7">
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-4">
					<img
						src={circle.image}
						alt=""
						className="h-14 w-14 shrink-0 rounded-full bg-primary-light object-cover"
					/>
					<div className="min-w-0">
						<p className="text-[10px] uppercase tracking-[0.15em]">
							{challenge ? "Goal" : "Target"}
						</p>
						<p className="truncate text-base">
							{challenge ? (
								formatMoney(group.savings_target, group.asset_code)
							) : (
								<>
									{formatAmount(circle.current)} / {formatAmount(circle.target)}{" "}
									<span className="text-xs text-neutral-900">{group.asset_code}</span>
								</>
							)}
						</p>
					</div>
				</div>
				<span
					className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-medium ${BADGE[circle.status]}`}
				>
					{challenge ? "CHALLENGE" : circle.status}
				</span>
			</div>

			<div className="mt-9">
				<p className="truncate text-xl">{circle.title}</p>
				<p className="text-[11px]">
					{challenge
						? "Savings Challenge"
						: `${labelize(group.contribution_frequency)} Contributions`}
				</p>
			</div>

			{!challenge && (
				<div className="mt-5">
					<ProgressBar percent={progressOf(circle)} color="bg-primary" />
				</div>
			)}

			<div className="mt-auto flex items-end justify-between gap-4 pt-12">
				<div className="min-w-0">
					<p className="text-[10px] uppercase tracking-[0.15em]">Members</p>
					<div className="mt-2 flex items-center gap-2">
						<MemberAvatars
							members={(circle.memberAvatars ?? []).slice(0, 3)}
							total={members}
							overflowClassName="bg-primary text-white"
						/>
						<span className="whitespace-nowrap text-sm">{members} {members === 1 ? "Member" : "Members"}</span>
					</div>
				</div>
				<Button
					href={pageRoutes.dashboardRoutes.GROUP(circle.id)}
					variant="dark"
					size="sm"
					className="w-1/2 max-w-60 text-sm lg:text-sm"
				>
					View Details
				</Button>
			</div>
		</article>
	);
}
