"use client";

import React, { useState } from "react";
import { HiOutlineArrowDownTray, HiOutlineDocumentText } from "react-icons/hi2";
import PageHeader from "../../components/dashboard/PageHeader";
import InputField from "../../components/ui/custom/InputField";
import { ApiError, transactions as transactionsApi } from "../../lib/api";
import { pageRoutes } from "../../config/routes";
import { toast } from "../../lib/utils/toast";

/** yyyy-mm-dd in the user's own timezone — what a date input holds. */
function isoDay(date: Date): string {
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 10);
}

const today = () => isoDay(new Date());

const PRESETS: { label: string; range: () => [string, string] }[] = [
	{
		label: "Last 30 days",
		range: () => [isoDay(new Date(Date.now() - 29 * 86_400_000)), today()],
	},
	{
		label: "Last 3 months",
		range: () => {
			const d = new Date();
			d.setMonth(d.getMonth() - 3);
			return [isoDay(d), today()];
		},
	},
	{
		label: "This year",
		range: () => [`${new Date().getFullYear()}-01-01`, today()],
	},
	{ label: "All time", range: () => ["", ""] },
];

/**
 * Generate Statement: download the user's transactions for a period as CSV,
 * from `GET /api/transactions/statement`.
 *
 * CSV only. The API answers PDF with a 501 until a renderer is added, so it
 * isn't offered here.
 */
export default function GenerateStatementView() {
	const [start, setStart] = useState("");
	const [end, setEnd] = useState("");
	const [preset, setPreset] = useState<string | null>("All time");
	const [downloading, setDownloading] = useState(false);

	const rangeError =
		start && end && end < start
			? "The end date must be on or after the start date."
			: end && end > today()
				? "The end date can't be in the future."
				: null;

	const applyPreset = (label: string, range: () => [string, string]) => {
		const [from, to] = range();
		setStart(from);
		setEnd(to);
		setPreset(label);
	};

	const download = async () => {
		setDownloading(true);
		try {
			const blob = await transactionsApi.statement({
				file_type: "csv",
				...(start && { start_date: start }),
				...(end && { end_date: end }),
			});

			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `saji-statement${start ? `-${start}` : ""}${end ? `-to-${end}` : ""}.csv`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);

			toast.success("Open it in Excel, Google Sheets or Numbers.", "Statement downloaded");
		} catch (err) {
			toast.error(
				err instanceof ApiError ? err.message : "Could not generate your statement.",
				"Download failed",
			);
		} finally {
			setDownloading(false);
		}
	};

	return (
		<div className="w-full max-w-2xl space-y-6 pb-10">
			<PageHeader
				title="Generate Statement"
				subtitle="Every contribution, payout and withdrawal on your account."
				back
				backHref={pageRoutes.dashboardRoutes.ME}
			/>

			<section className="space-y-6 rounded-[20px] bg-[#f8f8f8] p-6 md:p-7">
				<div>
					<p className="text-sm font-light">Period</p>
					<div className="mt-3 flex flex-wrap gap-2">
						{PRESETS.map(({ label, range }) => (
							<button
								key={label}
								type="button"
								aria-pressed={preset === label}
								onClick={() => applyPreset(label, range)}
								className={`rounded-full px-4 py-2 text-xs transition md:text-sm ${
									preset === label
										? "bg-primary text-white"
										: "bg-white text-neutral-dark hover:bg-primary-light"
								}`}
							>
								{label}
							</button>
						))}
					</div>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<InputField
						name="start_date"
						label="Start Date"
						type="date"
						value={start}
						onChange={(e) => {
							setStart(e.target.value);
							setPreset(null);
						}}
					/>
					<InputField
						name="end_date"
						label="End Date"
						type="date"
						value={end}
						onChange={(e) => {
							setEnd(e.target.value);
							setPreset(null);
						}}
						error={rangeError}
					/>
				</div>

				<div className="flex items-center gap-3 rounded-[14px] bg-white px-4 py-3">
					<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-lg text-primary">
						<HiOutlineDocumentText />
					</span>
					<div>
						<p className="text-sm">CSV file</p>
						<p className="text-xs font-light">Opens in Excel, Google Sheets or Numbers.</p>
					</div>
				</div>
			</section>

			<button
				type="button"
				onClick={download}
				disabled={downloading || Boolean(rangeError)}
				className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-dark text-sm text-white transition hover:bg-primary-dark-hover disabled:cursor-not-allowed disabled:bg-neutral-light-hover disabled:text-neutral-light-active md:h-14 md:text-base"
			>
				<HiOutlineArrowDownTray className="text-lg" />
				{downloading ? "Preparing…" : "Download Statement"}
			</button>
		</div>
	);
}
