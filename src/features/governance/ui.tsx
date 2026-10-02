"use client";

import Link from "next/link";
import React from "react";
import { HiArrowTopRightOnSquare, HiCheck } from "react-icons/hi2";
import type { Proposal } from "../../lib/api";
import MemberAvatars from "../group/MemberAvatars";

/**
 * Building blocks shared by the governance and recovery screens, so the
 * eleven screens in the MVP 2 designs stay visually one family.
 */

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

/** "Sep 28" */
export function shortDate(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Sep 28, 6:03 PM" */
export function dateTime(iso: string | null | undefined): string {
	if (!iso) return "—";
	return new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

/** "Sep 24–28" (or "Sep 30 – Oct 2" across months). */
export function dateRange(fromIso: string, toIso: string): string {
	const from = new Date(fromIso);
	const to = new Date(toIso);
	if (from.getMonth() === to.getMonth()) {
		return `${shortDate(fromIso)}–${to.getDate()}`;
	}
	return `${shortDate(fromIso)} – ${shortDate(toIso)}`;
}

/** "18h left" / "2d left" / "Closing" */
export function timeLeft(iso: string): string {
	const ms = new Date(iso).getTime() - Date.now();
	if (ms <= 0) return "Closed";
	const hours = Math.floor(ms / 3_600_000);
	if (hours < 1) return "Closing";
	if (hours < 48) return `${hours}h left`;
	return `${Math.floor(hours / 24)}d left`;
}

/** "7f45…c81a" */
export function shortHash(hash: string): string {
	return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

export function formatAmount(amount: string | number, asset: string): string {
	return `${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${asset}`;
}

// ---------------------------------------------------------------------------
// pills
// ---------------------------------------------------------------------------

type Tone = "lilac" | "green" | "pink" | "yellow" | "gray";

const PILL: Record<Tone, string> = {
	lilac: "bg-primary-light text-primary",
	green: "bg-success-50 text-success-700",
	pink: "bg-accent-light text-accent",
	yellow: "bg-warning-100 text-warning-800",
	gray: "bg-neutral-comment text-neutral-900",
};

export function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
	return (
		<span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[11px] ${PILL[tone]}`}>
			{children}
		</span>
	);
}

/** The pill a proposal card shows for its state. */
export function proposalPill(p: Pick<Proposal, "status">): { tone: Tone; label: string } {
	switch (p.status) {
		case "voting":
			return { tone: "lilac", label: "Voting" };
		case "approved":
		case "executed":
			return { tone: "green", label: "Executed" };
		case "rejected":
			return { tone: "pink", label: "Rejected" };
		default:
			return { tone: "gray", label: "Expired" };
	}
}

// ---------------------------------------------------------------------------
// cards
// ---------------------------------------------------------------------------

export function Panel({
	className = "",
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return <div className={`rounded-[14px] bg-[#f8f8f8] p-4 md:p-5 ${className}`}>{children}</div>;
}

export type InfoRow = {
	Icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: React.ReactNode;
	/** Colours the value: green for done/none, pink for money owed or held. */
	tone?: "green" | "pink";
};

/** Icon · label · value rows — the "Decision / Effective / Executed" lists. */
export function InfoList({ rows }: { rows: InfoRow[] }) {
	return (
		<Panel className="space-y-3">
			{rows.map(({ Icon, label, value, tone }) => (
				<div key={label} className="flex items-center justify-between gap-4 text-xs md:text-sm">
					<span className="flex items-center gap-2 font-light">
						<Icon className="shrink-0 text-base text-primary" />
						{label}
					</span>
					<span
						className={`text-right ${
							tone === "green" ? "text-success-500" : tone === "pink" ? "text-accent" : ""
						}`}
					>
						{value}
					</span>
				</div>
			))}
		</Panel>
	);
}

/**
 * Vote progress: a heading row, the approval bar against the threshold, and
 * who has voted. `mode` picks the right-hand figure the screen needs.
 */
export function VoteProgress({
	proposal: p,
	title,
	mode = "split",
	heading,
}: {
	proposal: Proposal;
	/** Small caption above the bar, e.g. "Current vote". */
	title?: string;
	/** "split" → "7 For · 2 Against"; "needed" → "7 of 9 needed". */
	mode?: "split" | "needed";
	/** Optional bigger heading, e.g. "Voting result". */
	heading?: string;
}) {
	const percent = Math.min(100, Math.round((p.approvals / Math.max(p.threshold, 1)) * 100));
	return (
		<Panel>
			{heading && <p className="mb-3 text-sm md:text-base">{heading}</p>}
			<div className="flex items-center justify-between gap-3 text-xs">
				<span className="font-light">{title ?? "Approval progress"}</span>
				<span>
					{mode === "needed"
						? `${p.approvals} of ${p.threshold} needed`
						: `${p.approvals} For · ${p.rejections} Against`}
				</span>
			</div>
			<div
				className="mt-2 h-1.5 rounded-full bg-primary-light"
				role="progressbar"
				aria-valuenow={p.approvals}
				aria-valuemin={0}
				aria-valuemax={p.threshold}
			>
				<div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
			</div>
			<div className="mt-4 flex items-center justify-between gap-3">
				<MemberAvatars
					members={p.voters}
					total={p.votes_cast}
					overflowClassName="bg-neutral-dark text-white"
				/>
				<span className="text-xs">
					{p.votes_cast} of {p.eligible_voters} members voted
				</span>
			</div>
		</Panel>
	);
}

/** "Stellar Testnet transaction · <hash> · <state>" with an explorer link. */
export function TxCard({
	hash,
	explorerUrl,
	state,
}: {
	hash: string | null;
	explorerUrl: string | null;
	state: string;
}) {
	return (
		<Panel className="flex items-center justify-between gap-3">
			<div className="min-w-0">
				<p className="text-[11px] font-light">Stellar Testnet transaction</p>
				<p className="mt-0.5 truncate text-xs md:text-sm">
					{hash ? `${shortHash(hash)} · ` : ""}
					{state}
				</p>
			</div>
			{explorerUrl && (
				<a
					href={explorerUrl}
					target="_blank"
					rel="noopener noreferrer"
					aria-label="View on Stellar explorer"
					className="shrink-0 text-lg text-primary"
				>
					<HiArrowTopRightOnSquare />
				</a>
			)}
		</Panel>
	);
}

const HERO: Record<"lilac" | "pink" | "green", { box: string; badge: string; title: string }> = {
	lilac: { box: "bg-primary-light", badge: "bg-primary text-white", title: "text-neutral-dark" },
	pink: { box: "bg-accent-light", badge: "bg-accent text-white", title: "text-neutral-dark" },
	green: { box: "bg-success-50", badge: "bg-success-400 text-white", title: "text-success-700" },
};

/** The big outcome banner: result, missed contribution, recovery complete. */
export function Hero({
	tone,
	Icon = HiCheck,
	title,
	children,
}: {
	tone: "lilac" | "pink" | "green";
	Icon?: React.ComponentType<{ className?: string }>;
	title: string;
	children: React.ReactNode;
}) {
	const t = HERO[tone];
	return (
		<section className={`flex flex-col items-center rounded-[14px] px-6 py-8 text-center md:py-10 ${t.box}`}>
			<span className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl md:h-16 md:w-16 md:text-3xl ${t.badge}`}>
				<Icon />
			</span>
			<h2 className={`mt-4 text-lg md:text-xl ${t.title}`}>{title}</h2>
			<p className="mt-1 max-w-md text-xs font-light md:text-sm">{children}</p>
		</section>
	);
}

/** Lilac or yellow explanatory card. */
export function Note({
	tone = "lilac",
	Icon,
	title,
	children,
}: {
	tone?: "lilac" | "yellow";
	Icon?: React.ComponentType<{ className?: string }>;
	title: string;
	children?: React.ReactNode;
}) {
	return (
		<section
			className={`flex items-start gap-3 rounded-[14px] px-4 py-4 md:px-5 ${
				tone === "yellow" ? "bg-warning-50" : "bg-primary-light"
			}`}
		>
			{Icon && (
				<span
					className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${
						tone === "yellow" ? "bg-warning-400 text-neutral-dark" : "bg-white text-primary"
					}`}
				>
					<Icon />
				</span>
			)}
			<div className="min-w-0">
				<p className={`text-sm md:text-base ${tone === "lilac" ? "text-primary" : ""}`}>{title}</p>
				{children && <div className="mt-1 text-xs font-light">{children}</div>}
			</div>
		</section>
	);
}

/** Selectable option with an icon and a check — vote choices, actions, recovery options. */
export function OptionCard({
	selected,
	onSelect,
	Icon,
	title,
	subtitle,
	disabled = false,
	role = "radio",
}: {
	selected: boolean;
	onSelect: () => void;
	Icon: React.ComponentType<{ className?: string }>;
	title: string;
	subtitle: string;
	disabled?: boolean;
	role?: "radio";
}) {
	return (
		<button
			type="button"
			role={role}
			aria-checked={selected}
			disabled={disabled}
			onClick={onSelect}
			className={`flex w-full items-center gap-3 rounded-[14px] px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 md:px-5 ${
				selected ? "bg-primary-light" : "bg-[#f8f8f8] hover:bg-[#f2f2f2]"
			}`}
		>
			<span
				className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
					selected ? "bg-primary text-white" : "bg-white text-neutral-900"
				}`}
			>
				<Icon />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block text-sm">{title}</span>
				<span className="block text-[11px] font-light">{subtitle}</span>
			</span>
			<span
				aria-hidden
				className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
					selected ? "bg-primary text-white" : "bg-primary-light"
				}`}
			>
				{selected && <HiCheck className="text-sm" />}
			</span>
		</button>
	);
}

const ACTION_CLASS =
	"inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-neutral-light-hover disabled:text-neutral-light-active max-md:w-full md:h-11";

/** The screen's main action: full width on phones, a compact pill on desktop. */
export function PrimaryAction(
	props:
		| ({ href: string } & { children: React.ReactNode })
		| (React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined }),
) {
	if (props.href) {
		return (
			<Link href={props.href} className={ACTION_CLASS}>
				{props.children}
			</Link>
		);
	}
	const { className = "", ...rest } = props as React.ButtonHTMLAttributes<HTMLButtonElement>;
	return <button type="button" className={`${ACTION_CLASS} ${className}`} {...rest} />;
}

/** Loading and error states shared by these pages. */
export function PageState({
	loading,
	error,
	onRetry,
}: {
	loading: boolean;
	error: string | null;
	onRetry: () => void;
}) {
	if (loading) {
		return (
			<div className="grid gap-4 md:grid-cols-2">
				<div className="h-48 animate-pulse rounded-[14px] bg-[#f8f8f8]" />
				<div className="h-48 animate-pulse rounded-[14px] bg-[#f8f8f8]" />
			</div>
		);
	}
	if (error) {
		return (
			<Panel className="text-sm">
				<p className="text-error-500">{error}</p>
				<button onClick={onRetry} className="mt-2 font-medium underline">
					Try again
				</button>
			</Panel>
		);
	}
	return null;
}
