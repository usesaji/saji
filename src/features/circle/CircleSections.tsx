"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import React from "react";
import { IoIosArrowRoundForward } from "react-icons/io";
import { IoEyeOffOutline, IoEyeOutline } from "react-icons/io5";
import { TbCurrencyDollar, TbMoneybag } from "react-icons/tb";
import { SiStellar } from "react-icons/si";
import {
	HiArrowRight,
	HiExclamationTriangle,
	HiInformationCircle,
	HiOutlineCheckCircle,
	HiOutlineShieldCheck,
	HiOutlineUsers,
	HiPauseCircle,
	HiStar,
} from "react-icons/hi2";
import type { GroupCircle } from "../../lib/api";
import MemberAvatars from "../group/MemberAvatars";
import SectionHeader from "../../components/dashboard/SectionHeader";

type Face = { name: string; avatar_url: string | null };

/** "Active" / "Paused" / "In recovery" / "Forming" / "Completed" */
export function circleStatus(status: string | undefined): { label: string; tone: string } {
	switch (status) {
		case "paused":
			return { label: "Paused", tone: "bg-warning-100 text-warning-800" };
		case "recovery":
			return { label: "In recovery", tone: "bg-accent-light text-accent" };
		case "completed":
			return { label: "Completed", tone: "bg-primary-light text-primary" };
		case "active":
			return { label: "Active", tone: "bg-success-50 text-success-700" };
		default:
			return { label: "Forming", tone: "bg-neutral-comment text-neutral-900" };
	}
}

/** The group's savings card (p1): pool, members, cycle progress. */
export function SavingsCard({
	total,
	asset,
	hidden,
	onToggleHidden,
	status,
	faces,
	memberCount,
	percent,
	cycleLabel,
	progressLabel,
	nextPayout,
}: {
	total: string;
	asset: string;
	hidden: boolean;
	onToggleHidden: () => void;
	status: { label: string; tone: string };
	faces: Face[];
	memberCount: number;
	percent: number;
	cycleLabel: string;
	progressLabel: string | null;
	nextPayout: string | null;
}) {
	return (
		<section className="rounded-[20px] bg-[#f8f8f8] p-5 md:p-7">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<p className="text-[11px] uppercase tracking-wide md:text-sm md:normal-case md:tracking-normal">
						Group Savings · {asset}
					</p>
					<div className="mt-2 flex items-center gap-3">
						<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-neutral-dark text-xl md:hidden">
							{asset === "XLM" ? <SiStellar className="text-base" /> : <TbCurrencyDollar />}
						</span>
						<h2 className="truncate text-[34px] font-medium leading-none tracking-tight md:text-[56px]">
							{hidden ? "••••••" : Number(total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
						</h2>
						<button
							type="button"
							onClick={onToggleHidden}
							aria-label={hidden ? "Show balance" : "Hide balance"}
							className="shrink-0 text-2xl md:text-3xl"
						>
							{hidden ? <IoEyeOutline /> : <IoEyeOffOutline />}
						</button>
					</div>
				</div>
				<div className="flex shrink-0 flex-col items-end gap-3">
					<span className={`rounded-full px-3 py-1 text-[11px] ${status.tone}`}>{status.label}</span>
					<div className="max-md:hidden">
						<MemberAvatars
							members={faces.slice(0, 3)}
							total={memberCount}
							size="lg"
							borderClassName="border-2 border-[#f8f8f8]"
							overflowClassName="bg-neutral-dark text-white"
						/>
					</div>
				</div>
			</div>

			<div
				className="mt-6 h-1.5 rounded-full bg-neutral-light"
				role="progressbar"
				aria-valuenow={percent}
				aria-valuemin={0}
				aria-valuemax={100}
			>
				<div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
			</div>
			<div className="mt-2.5 flex items-center justify-between gap-3 text-xs">
				<span className="flex items-center gap-1.5">
					<TbMoneybag className="text-sm text-primary" />
					{cycleLabel}
				</span>
				{progressLabel && <span>{progressLabel}</span>}
			</div>
			<div className="mt-2 flex items-center justify-between gap-3 text-xs font-light md:hidden">
				<span>
					{memberCount} {memberCount === 1 ? "member" : "members"}
				</span>
				{nextPayout && <span>Next payout · {nextPayout}</span>}
			</div>
		</section>
	);
}

/** Lilac / pink / yellow strip under the savings card. */
export function Banner({
	tone,
	title,
	children,
	href,
	cta,
}: {
	tone: "lilac" | "pink" | "yellow";
	title: string;
	children?: React.ReactNode;
	href?: string;
	cta?: string;
}) {
	const styles = {
		lilac: { box: "bg-primary-light", title: "text-primary", Icon: HiInformationCircle },
		pink: { box: "bg-accent-light", title: "text-accent", Icon: HiExclamationTriangle },
		yellow: { box: "bg-warning-50", title: "text-warning-900", Icon: HiPauseCircle },
	}[tone];
	return (
		<section className={`flex flex-col gap-3 rounded-[14px] px-5 py-5 md:flex-row md:items-center md:justify-between ${styles.box}`}>
			<div className="min-w-0">
				<p className={`text-base md:text-lg ${styles.title}`}>{title}</p>
				{children && <div className="mt-1 max-w-2xl text-xs font-light md:text-sm">{children}</div>}
			</div>
			{href && cta && (
				<Link
					href={href}
					className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-white px-4 py-2 text-xs transition hover:bg-neutral-comment md:self-auto md:text-sm"
				>
					{cta} <HiArrowRight />
				</Link>
			)}
		</section>
	);
}

/** "This Cycle" (p1): your contribution, the group's, and defaults. */
export function ThisCycleCard({
	rows,
	historyHref,
}: {
	rows: { label: string; value: string; tone?: "green" | "pink" }[];
	historyHref?: string;
}) {
	const icons = [HiOutlineCheckCircle, HiOutlineUsers, HiOutlineShieldCheck];
	return (
		<section className="space-y-3">
			<SectionHeader
				title={<span className="text-sm md:text-base">This Cycle</span>}
				action={
					historyHref ? (
						<Link href={historyHref} className="text-xs text-primary md:text-sm">
							History →
						</Link>
					) : undefined
				}
			/>
			<div className="space-y-3 rounded-[14px] bg-[#f8f8f8] px-4 py-4 md:px-5">
				{rows.map((row, i) => {
					const Icon = icons[i % icons.length];
					return (
						<div key={row.label} className="flex items-center justify-between gap-4 text-xs md:text-sm">
							<span className="flex items-center gap-2 font-light">
								<Icon className="text-base text-primary" />
								{row.label}
							</span>
							<span
								className={
									row.tone === "green" ? "text-success-500" : row.tone === "pink" ? "text-accent" : ""
								}
							>
								{row.value}
							</span>
						</div>
					);
				})}
			</div>
		</section>
	);
}

/** "Decide together" (p1): the way into proposals. */
export function DecideTogether({ href }: { href: string }) {
	return (
		<Link
			href={href}
			className="flex items-center justify-between gap-4 rounded-[14px] bg-primary-light px-5 py-5 transition hover:bg-primary-light-hover"
		>
			<span className="min-w-0">
				<span className="block text-sm text-primary md:text-base">Decide together</span>
				<span className="block text-[11px] font-light">
					Create proposals, vote, and track group decisions transparently.
				</span>
			</span>
			<HiArrowRight className="shrink-0 text-xl text-primary" />
		</Link>
	);
}

/** Payout rotation strip: faces in order, the current recipient starred. */
export function PayoutRotationStrip({
	rotation,
	currentUserId,
	href,
}: {
	rotation: GroupCircle["payout_rotation"];
	currentUserId: number | null;
	href: string;
}) {
	return (
		<section>
			<SectionHeader title={<span className="text-base md:text-lg">Payout Rotation</span>} href={href} />
			{rotation.length === 0 ? (
				<p className="mt-4 text-sm font-light">
					No rotation yet — start the cycle to set the payout order.
				</p>
			) : (
				<div className="-mx-3 mt-4 flex gap-4 overflow-x-auto px-3 pb-2 hide-scroll sm:mx-0 sm:px-0">
					{rotation.map((m) => {
						const current = !m.removed && m.user_id === currentUserId;
						const initial = (m.name ?? "?").trim().charAt(0).toUpperCase();
						return (
							<div key={m.user_id} className="flex w-18 shrink-0 flex-col items-center text-center">
								<div className="relative">
									<div
										className={`h-16 w-16 overflow-hidden rounded-full bg-primary-light ${
											m.removed ? "opacity-40 grayscale" : ""
										}`}
									>
										{m.avatar_url ? (
											<img src={m.avatar_url} alt="" className="h-full w-full object-cover" />
										) : (
											<span className="flex h-full w-full items-center justify-center text-lg text-primary">
												{initial}
											</span>
										)}
									</div>
									{current && (
										<span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-white ring-2 ring-white">
											<HiStar />
										</span>
									)}
								</div>
								<p
									className={`mt-1.5 w-full truncate text-xs ${
										m.removed ? "text-neutral-900 line-through" : ""
									}`}
								>
									{m.name ?? "Member"}
								</p>
								<p className={`text-[10px] ${current ? "text-primary" : "font-light"}`}>
									{m.removed ? "Removed" : current ? "Current" : m.has_received_payout ? "Paid" : "Next Cycle"}
								</p>
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
}

const ACTIVITY_LABEL: Record<string, string> = {
	contribution: "Contribution",
	payout: "Payout",
	create_group: "Group Created",
	join: "Member Joined",
	other: "Activity",
};

const ACTIVITY_BODY: Record<string, string> = {
	contribution: "A member's contribution for this cycle was confirmed on-chain.",
	payout: "This cycle's pot was released to its recipient.",
	create_group: "The circle was created on the Stellar network.",
	join: "A new member was admitted to the circle.",
	other: "Something happened in this circle.",
};

/** Cycle Activity: the group's recent on-chain events. */
export function CycleActivityList({
	activity,
	viewAllHref,
}: {
	activity: GroupCircle["cycle_activity"];
	viewAllHref: string;
}) {
	return (
		<section>
			<SectionHeader title={<span className="text-base md:text-lg">Cycle Activity</span>} href={viewAllHref} />
			<ul className="mt-3 divide-y divide-neutral-light">
				{activity.slice(0, 6).map((a) => (
					<li key={a.id} className="flex gap-3 py-3.5">
						<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-light text-accent">
							<svg width="18" height="18" viewBox="15 13 19 20" fill="currentColor" aria-hidden>
								<path d="M22.6812 13.5006C22.2277 13.3418 21.5917 13.4955 21.2607 13.8436L16.7278 18.6104C16.3968 18.9585 16.496 19.3693 16.9494 19.5282L27.7254 23.3004C28.1789 23.4591 28.8147 23.3056 29.1459 22.9575L33.6788 18.1907C34.0098 17.8424 33.9106 17.4316 33.4572 17.2729L22.6812 13.5006Z" />
								<path d="M21.3784 22.9897C20.925 22.8308 20.289 22.9844 19.958 23.3325L15.4251 28.0994C15.0941 28.4475 15.1932 28.8584 15.6466 29.017L26.4227 32.7893C26.8761 32.9481 27.512 32.7946 27.8431 32.4464L32.3759 27.6795C32.707 27.3314 32.6077 26.9206 32.1543 26.7618L21.3784 22.9897Z" />
							</svg>
						</span>
						<div className="min-w-0 flex-1">
							<div className="flex items-baseline justify-between gap-3">
								<p className="text-sm">
									{ACTIVITY_LABEL[a.type] ?? "Activity"}
									{a.status === "pending" ? " (pending)" : a.status === "failed" ? " (failed)" : ""}
								</p>
								<span className="shrink-0 text-[11px] font-light">
									{new Date(a.created_at).toLocaleString(undefined, {
										month: "short",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})}
								</span>
							</div>
							<p className="text-xs font-light">{ACTIVITY_BODY[a.type] ?? ACTIVITY_BODY.other}</p>
							{a.explorer_url && (
								<a
									href={a.explorer_url}
									target="_blank"
									rel="noreferrer"
									className="mt-1.5 inline-flex items-center text-xs text-primary"
								>
									View Transaction <IoIosArrowRoundForward className="text-lg" />
								</a>
							)}
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}

/** "Nothing to see yet" — a brand-new circle with no activity or decisions. */
export function NothingYet() {
	return (
		<div className="flex flex-col items-center py-12 text-center">
			<span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-comment text-2xl text-neutral-700">
				<HiInformationCircle />
			</span>
			<p className="mt-3 text-sm font-light text-neutral-800">Nothing to see yet</p>
		</div>
	);
}

