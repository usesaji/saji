"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useState } from "react";
import Link from "next/link";
import { FiPlus } from "react-icons/fi";
import { HiOutlineMagnifyingGlass, HiOutlineUserPlus } from "react-icons/hi2";
import { useApi } from "../../lib/hooks/useApi";
import { ApiError, challenges as challengesApi, type Group } from "../../lib/api";
import { formatMoney } from "../../lib/utils";
import { toast } from "../../lib/utils/toast";
import { pageRoutes } from "../../config/routes";
import SectionHeader from "../../components/dashboard/SectionHeader";

/**
 * Card themes, cycled in order as in the design.
 *
 * `art` is optional: the design's honey-jar / piggy-bank illustrations haven't
 * been exported yet. Add them to `public/images/challenges/` and set `art` on
 * a theme to show them; a file that fails to load hides itself.
 */
const THEMES: { card: string; people: string; art?: string }[] = [
	{
		card: "bg-[#ffa200] text-white",
		people: "text-white/90",
	},
	{
		card: "bg-accent-light text-neutral-dark",
		people: "text-neutral-dark/80",
	},
	{
		card: "bg-primary text-white",
		people: "text-white/90",
	},
];

/**
 * "Discover Challenges" (desktop) / "Savings Challenge" (mobile): open public
 * savings challenges anyone can join, from `GET /api/challenges`.
 */
export default function DiscoverChallenges({
	desktopTitle = "Discover Challenges",
}: {
	/** Mobile always reads "Savings Challenge"; pages name it differently on desktop. */
	desktopTitle?: string;
}) {
	const fetcher = useCallback(() => challengesApi.index({ per_page: 6 }), []);
	const { data, loading, error } = useApi(fetcher, []);
	const rows = data?.data ?? [];

	return (
		<section>
			<SectionHeader
				title={
					<>
						<span className="md:hidden">Savings Challenge</span>
						<span className="max-md:hidden">{desktopTitle}</span>
					</>
				}
				action={
					<Link
						href={pageRoutes.dashboardRoutes.SEARCH("")}
						aria-label="Search challenges"
						className="text-2xl md:text-3xl"
					>
						<HiOutlineMagnifyingGlass />
					</Link>
				}
			/>

			{loading ? (
				<div className="mt-4 flex gap-4 overflow-hidden md:mt-6">
					{[0, 1].map((i) => (
						<div
							key={i}
							className="h-44 w-[85%] shrink-0 animate-pulse rounded-[20px] bg-[#f8f8f8] md:h-60 md:w-110"
						/>
					))}
				</div>
			) : error ? (
				<p className="mt-4 text-sm text-error-500">{error}</p>
			) : rows.length === 0 ? (
				<p className="mt-4 text-sm text-neutral-900">
					No open challenges right now — check back soon.
				</p>
			) : (
				// Bleeds to the screen edge on small screens; the scroll padding keeps
				// snapped cards aligned with the page gutter instead of the glass.
				<div className="-mx-3 mt-4 flex snap-x scroll-px-3 gap-4 overflow-x-auto px-3 pb-2 hide-scroll sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mt-6 lg:mx-0 lg:scroll-px-0 lg:px-0">
					{rows.map((challenge, index) => (
						<ChallengeCard
							key={challenge.id}
							challenge={challenge}
							theme={THEMES[index % THEMES.length]}
						/>
					))}
				</div>
			)}
		</section>
	);
}

function ChallengeCard({
	challenge,
	theme,
}: {
	challenge: Group;
	theme: (typeof THEMES)[number];
}) {
	const [state, setState] = useState<"idle" | "joining" | "joined">("idle");
	const [showArt, setShowArt] = useState(true);
	const members = challenge.member_count ?? 0;

	// Joining is idempotent server-side, so tapping it on a challenge you are
	// already in simply confirms the membership.
	const join = async () => {
		setState("joining");
		try {
			await challengesApi.join(challenge.id);
			setState("joined");
			toast.success(`You're in “${challenge.name}”. Start saving toward the goal.`, "Joined");
		} catch (err) {
			setState("idle");
			toast.error(
				err instanceof ApiError ? err.message : "Could not join that challenge.",
				"Join failed",
			);
		}
	};

	return (
		<article
			className={`relative flex h-44 w-[85%] shrink-0 snap-start flex-col overflow-hidden rounded-[20px] p-5 sm:w-96 md:h-60 md:w-110 md:p-6 ${theme.card}`}
		>
			{theme.art && showArt && (
				<img
					src={theme.art}
					alt=""
					aria-hidden
					onError={() => setShowArt(false)}
					className="pointer-events-none absolute -bottom-4 -right-6 h-[85%] md:h-[95%]"
				/>
			)}

			<div className="relative max-w-[70%]">
				<h4 className="truncate text-xl font-light md:text-[28px]">
					{challenge.name}
				</h4>

				<div className="mt-2 flex items-center gap-2">
					<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-sm text-white md:h-8 md:w-8">
						<FiPlus />
					</span>
					<span className={`text-[10px] md:text-sm ${theme.people}`}>
						{members} {members === 1 ? "Person" : "People"}
						{challenge.savings_target
							? ` · Goal ${formatMoney(challenge.savings_target, challenge.asset_code)}`
							: ""}
					</span>
				</div>
			</div>

			<button
				type="button"
				onClick={join}
				disabled={state !== "idle"}
				className="relative mt-auto flex w-fit items-center gap-2 rounded-full bg-neutral-dark px-5 py-2.5 text-xs text-white transition hover:scale-[0.97] disabled:opacity-80 md:px-9 md:py-4 md:text-lg"
			>
				<HiOutlineUserPlus className="text-sm md:text-xl" />
				{state === "joined" ? "Joined" : state === "joining" ? "Joining…" : "Join Now"}
			</button>
		</article>
	);
}
