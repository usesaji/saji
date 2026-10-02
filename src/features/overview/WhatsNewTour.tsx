"use client";

import { useEffect, useRef, useState } from "react";
import { IoClose } from "react-icons/io5";

/**
 * Steps of the "what's new" tour, in order. Adding a step is one entry here.
 */
const STEPS = [
	{
		title: "New Features",
		body: "SAJI now lets savings groups govern themselves. Members create proposals, vote on decisions like pausing or resuming the group, and approved actions execute automatically.",
	},
	{
		title: "Missed Contributions",
		body: "Missed contributions trigger automatic recovery votes, pausing the cycle until members approve a resolution together, no coordinator required.",
	},
];

/**
 * Bump when the tour's content changes, so people who dismissed the old one
 * see the new one once.
 */
const SEEN_KEY = "saji_whats_new_seen_v1";

function hasSeen(): boolean {
	try {
		return window.localStorage.getItem(SEEN_KEY) === "1";
	} catch {
		// Storage can be blocked (private mode, site data off). Better to show
		// the tour again than to never show it.
		return false;
	}
}

function markSeen(): void {
	try {
		window.localStorage.setItem(SEEN_KEY, "1");
	} catch {
		/* see hasSeen */
	}
}

/**
 * One-time "what's new" walkthrough over the dashboard: a card per feature
 * with Previous / Next, dismissable at any step. Seen-state is per browser.
 */
export default function WhatsNewTour() {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(0);
	const nextRef = useRef<HTMLButtonElement>(null);

	// Decided after mount: localStorage doesn't exist during server rendering.
	useEffect(() => {
		if (hasSeen()) return;
		const timer = setTimeout(() => setOpen(true), 400);
		return () => clearTimeout(timer);
	}, []);

	const close = () => {
		markSeen();
		setOpen(false);
	};

	// Escape closes; focus lands on the main action of each step.
	useEffect(() => {
		if (!open) return;
		nextRef.current?.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, step]);

	if (!open) return null;

	const { title, body } = STEPS[step];
	const isFirst = step === 0;
	const isLast = step === STEPS.length - 1;

	return (
		<div className="fixed inset-0 z-1100 flex items-center justify-center bg-black/15 px-4 backdrop-blur-md">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="whats-new-title"
				aria-describedby="whats-new-body"
				className="w-full max-w-lg rounded-[14px] bg-white px-6 pb-6 pt-7 shadow-xl md:px-8 md:pb-8"
			>
				<div className="flex items-start justify-between gap-4">
					<h2 id="whats-new-title" className="text-2xl md:text-[28px]">
						{title}
					</h2>
					<button
						type="button"
						onClick={close}
						aria-label="Close"
						className="-mr-1 shrink-0 text-2xl md:text-3xl"
					>
						<IoClose />
					</button>
				</div>

				<p id="whats-new-body" className="mt-2 text-sm leading-relaxed md:text-base">
					{body}
				</p>

				<div className={`mt-8 flex items-center ${isFirst ? "" : "justify-between"}`}>
					{!isFirst && (
						<button
							type="button"
							onClick={() => setStep((s) => s - 1)}
							className="h-12 rounded-full bg-neutral-comment px-7 text-base transition hover:bg-neutral-light md:h-14 md:px-9 md:text-lg"
						>
							Previous
						</button>
					)}
					<button
						ref={nextRef}
						type="button"
						onClick={() => (isLast ? close() : setStep((s) => s + 1))}
						className="h-12 rounded-full bg-primary px-7 text-base text-white transition hover:bg-primary-hover md:h-14 md:px-9 md:text-lg"
					>
						{isLast ? "Got it" : "Next"}
					</button>
				</div>

				<p className="sr-only" aria-live="polite">
					Step {step + 1} of {STEPS.length}
				</p>
			</div>
		</div>
	);
}
