"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import Link from "next/link";
import { IoEyeOffOutline, IoEyeOutline } from "react-icons/io5";
import { FiChevronDown, FiPlus } from "react-icons/fi";
import { TbCurrencyDollar } from "react-icons/tb";
import { SiStellar } from "react-icons/si";
import { formatMoney } from "../../lib/utils";
import { pageRoutes } from "../../config/routes";
import type { DashboardData } from "../../lib/api";
import { useTotalSavings } from "../../lib/hooks/useTotalSavings";
import { fromStroops } from "../../lib/stroops";
import MemberAvatars from "../group/MemberAvatars";

type Face = { name: string; avatar_url: string | null };

/**
 * The dashboard hero: everything the user's money adds up to.
 *
 * The headline is TOTAL WORTH — withdrawable (claimable payouts + wallet) plus
 * what is still working in circles — because that is what "what have I got"
 * means. Neither half answers it alone: money-in-circles goes DOWN when you are
 * paid and hits zero once a circle completes (an account that worked perfectly
 * looks empty), while withdrawable-only reads zero for anyone mid-cycle who has
 * contributed and isn't owed a payout yet.
 *
 * A circle saves in exactly ONE token, so a user can hold several currencies at
 * once. Rather than stack them or convert (an exchange rate would go stale, and
 * a savings figure that moves with the market is its own problem), the card
 * shows ONE token at a time behind the asset picker.
 */
export default function SavingsSummaryCard({
	data,
	faces = [],
}: {
	data: DashboardData;
	/** A few real people the user saves with, for the avatar stack. */
	faces?: Face[];
}) {
	const [hidden, setHidden] = useState(false);
	/** Token the user picked, or null to follow the largest holding. */
	const [picked, setPicked] = useState<string | null>(null);

	const total = useTotalSavings(data);
	const assets = total.assets;

	// Resolved against the live list rather than trusted directly: an asset can
	// disappear between renders (you withdrew all of it), and a stale code would
	// otherwise leave the card showing that token with a blank figure.
	const shown =
		assets.find((a) => a.asset_code === picked) ?? total.headline ?? null;
	const assetCode = shown?.asset_code ?? data.asset_code;

	// Distinct OTHER people, from the backend — not summed over `circles`, which
	// is capped at 5 and would double-count anyone in two of them.
	const people = data.people_total ?? 0;
	const due = data.quick_deposit;

	// Quick Deposit goes where the money is owed: the circle page is where a
	// contribution is signed. With nothing due, the wallet is the place to top up.
	const depositHref = due
		? pageRoutes.dashboardRoutes.CIRCLE(due.group_id)
		: pageRoutes.dashboardRoutes.WALLET;

	const amount = hidden
		? "••••••"
		: total.loading && !shown
			? "…"
			: formatMoney(fromStroops(shown?.total ?? 0n));

	// Names WHERE the money is, so the headline is never ambiguous about whether
	// it can be spent. With nothing at all, it has to tell apart a brand-new user
	// from one whose circles have simply completed — "start saving" would be
	// wrong for someone who already has.
	const detail = (() => {
		if (total.error) return "Couldn't reach the network to read your balance";
		if (!total.hasAnything) {
			return data.circles_total > 0
				? "All caught up — your contributions have rotated back to you"
				: "Join or create a circle to start saving";
		}
		if (hidden || !shown) return null;
		return [
			shown.withdrawable > 0n
				? `${formatMoney(fromStroops(shown.withdrawable), assetCode)} ready to withdraw`
				: null,
			shown.inCircles > 0n
				? `${formatMoney(fromStroops(shown.inCircles), assetCode)} working in circles`
				: null,
		]
			.filter(Boolean)
			.join(" · ");
	})();

	const peopleRow = people > 0 && (
		<div className="flex items-center gap-3">
			<MemberAvatars
				members={faces.slice(0, 3)}
				total={people}
				size="lg"
				borderClassName="border-2 border-primary"
				overflowClassName="bg-primary-dark text-white"
			/>
			<span className="text-xs md:text-base">
				{people} {people === 1 ? "Person" : "People"}
			</span>
		</div>
	);

	const dueNote = due && (
		<p className="text-[11px] text-white/80 md:text-sm">
			{formatMoney(due.amount, due.asset_code)} due
			{due.due_at ? ` ${dueInLabel(due.due_at)}` : ""} · {due.group_name}
		</p>
	);

	return (
		<section className="relative overflow-hidden rounded-[20px] bg-primary px-5 pb-5 pt-6 text-white md:rounded-[30px] md:px-12 md:py-12">
			{/* Decorative backdrop: the darker blob, and the plant on wide screens. */}
			<img
				src="/images/wallet-vector.svg"
				alt=""
				aria-hidden
				className="pointer-events-none absolute -bottom-6 -right-6 origin-bottom-right md:bottom-0 md:right-0 md:scale-[2.4]"
			/>
			<img
				src="/images/wallet-flower.svg"
				alt=""
				aria-hidden
				className="pointer-events-none absolute bottom-0 right-[14%] h-36 max-md:hidden"
			/>

			<div className="relative flex flex-col gap-7 md:flex-row md:items-start md:justify-between">
				<div className="min-w-0">
					<div className="flex items-center gap-3 text-xs md:text-lg">
						<span className="md:hidden">
							<span className="font-medium">{assetCode}</span> · Group Savings
						</span>
						<span className="max-md:hidden">Total Group Savings</span>
						<AssetPicker
							assets={assets.map((a) => a.asset_code)}
							value={assetCode}
							onChange={setPicked}
						/>
					</div>

					<div className="mt-3 flex items-center gap-3 md:mt-4 md:gap-5">
						<AssetIcon code={assetCode} />
						<h2 className="truncate text-[40px] font-medium leading-none tracking-tight md:text-[72px]">
							{amount}
						</h2>
						<button
							type="button"
							onClick={() => setHidden((h) => !h)}
							aria-label={hidden ? "Show balance" : "Hide balance"}
							className="shrink-0 text-2xl md:text-4xl"
						>
							{hidden ? <IoEyeOutline /> : <IoEyeOffOutline />}
						</button>
					</div>

					{detail && (
						<p className="mt-2 text-[11px] font-light text-white/85 md:mt-3 md:text-sm">
							{detail}
						</p>
					)}

					<div className="mt-6 max-md:hidden">{peopleRow}</div>
				</div>

				{/* Desktop: the action sits top-right, with what is owed under it. */}
				<div className="flex flex-col items-end gap-3 max-md:hidden">
					<QuickDeposit href={depositHref} />
					{dueNote}
				</div>

				{/* Mobile: one row along the bottom of the card. */}
				<div className="space-y-3 md:hidden">
					{dueNote}
					<div className="flex items-center justify-between gap-3">
						<QuickDeposit href={depositHref} />
						{peopleRow}
						<Link
							href={pageRoutes.dashboardRoutes.NEW_GROUP}
							aria-label="Create a group"
							className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-dark text-lg"
						>
							<FiPlus />
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}

function QuickDeposit({ href }: { href: string }) {
	return (
		<Link
			href={href}
			className="flex shrink-0 items-center gap-2 rounded-full bg-primary-dark px-5 py-2.5 text-xs transition hover:bg-primary-dark-hover md:px-16 md:py-5 md:text-lg"
		>
			Quick Deposit <FiPlus className="text-sm md:text-xl" />
		</Link>
	);
}

/** Stablecoins get a dollar mark; XLM its own glyph. */
function AssetIcon({ code }: { code: string }) {
	return (
		<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white text-xl md:hidden">
			{code === "XLM" ? <SiStellar className="text-base" /> : <TbCurrencyDollar />}
		</span>
	);
}

/**
 * Which token the card shows. A plain pill when there is only one — a dropdown
 * with a single choice is decoration — and nothing at all when there are none.
 */
function AssetPicker({
	assets,
	value,
	onChange,
}: {
	assets: string[];
	value: string;
	onChange: (code: string) => void;
}) {
	const pill =
		"rounded-full bg-primary-dark py-1.5 text-xs font-medium text-white md:py-2 md:text-sm";

	if (assets.length === 0) return null;

	if (assets.length === 1) {
		return <span className={`${pill} px-4 max-md:ml-auto`}>{assets[0]}</span>;
	}

	return (
		<label className="relative max-md:ml-auto">
			<span className="sr-only">Show savings in</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={`${pill} cursor-pointer appearance-none pl-4 pr-8 outline-none`}
			>
				{assets.map((code) => (
					<option key={code} value={code} className="text-neutral-dark">
						{code}
					</option>
				))}
			</select>
			<FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
		</label>
	);
}

/** "in 3 days" / "today" / "2 days ago" from an ISO date. */
function dueInLabel(iso: string): string {
	const days = Math.round(
		(new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
	);
	if (days === 0) return "today";
	if (days > 0) return `in ${days} day${days === 1 ? "" : "s"}`;
	return `${Math.abs(days)} day${days === -1 ? "" : "s"} ago`;
}
