"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { HiArrowTopRightOnSquare } from "react-icons/hi2";
import PageHeader from "@/components/dashboard/PageHeader";
import { useApi } from "@/lib/hooks/useApi";
import { transactions as txApi } from "@/lib/api";
import { labelize } from "@/features/group/group-view";
import { formatMoney } from "@/lib/utils";
import { pageRoutes } from "@/config/routes";

const STATUS_STYLES: Record<string, string> = {
	success: "bg-success-50 text-success-700",
	pending: "bg-warning-100 text-warning-800",
	failed: "bg-error-50 text-error-500",
};

const STATUS_LABELS: Record<string, string> = {
	success: "Completed",
	pending: "Pending",
	failed: "Failed",
};

/** Transaction Details screen for a single transaction. */
export default function TransactionDetailPage() {
	const { id } = useParams<{ id: string }>();

	const fetcher = useCallback(() => txApi.show(Number(id)), [id]);
	const { data, loading, error, refetch } = useApi(fetcher, [id]);

	return (
		<div className="w-full max-w-2xl space-y-6 pb-10">
			<PageHeader
				title={data ? labelize(data.type) : "Transaction"}
				back
				actions={
					data && (
						<span
							className={`rounded-full px-3 py-1.5 text-xs ${
								STATUS_STYLES[data.status] ?? STATUS_STYLES.pending
							}`}
						>
							{STATUS_LABELS[data.status] ?? data.status}
						</span>
					)
				}
			/>

			{loading && <div className="h-64 animate-pulse rounded-[20px] bg-[#f8f8f8]" />}

			{error && !loading && (
				<div className="rounded-[20px] bg-[#f8f8f8] p-6 text-sm">
					<p className="text-error-500">{error}</p>
					<button onClick={refetch} className="mt-2 font-medium underline">
						Try again
					</button>
				</div>
			)}

			{data && !loading && (
				<>
					<section className="rounded-[20px] bg-primary px-6 py-7 text-white md:px-8">
						<p className="text-xs md:text-sm">Amount</p>
						{/* The detail payload carries no asset code, so the figure is shown
						    plain rather than with a currency it might not be in. */}
						<p className="mt-1 text-4xl font-medium md:text-5xl">
							{data.amount === null ? "—" : formatMoney(data.amount)}
						</p>
						{data.amount === null && (
							<p className="mt-2 text-xs font-light text-white/80">
								This action didn&apos;t move money.
							</p>
						)}
					</section>

					<section className="rounded-[20px] bg-[#f8f8f8] px-6 py-2">
						<Row label="Type" value={labelize(data.type)} />
						<Row label="Status" value={STATUS_LABELS[data.status] ?? data.status} />
						<Row
							label="Group"
							value={
								data.group ? (
									<Link
										href={pageRoutes.dashboardRoutes.GROUP(String(data.group.id))}
										className="text-primary underline-offset-4 hover:underline"
									>
										{data.group.name}
									</Link>
								) : (
									"—"
								)
							}
						/>
						<Row
							label="Transaction No"
							value={
								data.transaction_no ? (
									<span className="font-mono text-xs" title={data.transaction_no}>
										{`${data.transaction_no.slice(0, 10)}…${data.transaction_no.slice(-10)}`}
									</span>
								) : (
									"—"
								)
							}
						/>
						<Row label="Date & Time" value={new Date(data.date_time).toLocaleString()} />
					</section>

					{data.explorer_url && (
						<a
							href={data.explorer_url}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"
						>
							Verify on Stellar explorer <HiArrowTopRightOnSquare />
						</a>
					)}
				</>
			)}
		</div>
	);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4 border-b border-neutral-light py-3.5 last:border-0">
			<span className="text-sm font-light">{label}</span>
			<span className="text-right text-sm">{value}</span>
		</div>
	);
}
