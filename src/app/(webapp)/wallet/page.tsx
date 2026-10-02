"use client";

import Link from "next/link";
import { HiArrowDownLeft, HiArrowUpRight, HiOutlineSquares2X2 } from "react-icons/hi2";
import { useApi } from "../../../lib/hooks/useApi";
import {
	dashboard as dashboardApi,
	wallet as walletApi,
	profile as profileApi,
} from "../../../lib/api";
import { pageRoutes } from "../../../config/routes";
import { formatMoney } from "../../../lib/utils";
import PageHeader from "../../../components/dashboard/PageHeader";
import SectionHeader from "../../../components/dashboard/SectionHeader";
import SavingsSummaryCard from "../../../features/overview/SavingsSummaryCard";
import UsefulInsights from "../../../features/wallet/UsefulInsights";
import UpcomingContribution from "../../../features/wallet/UpcomingContribution";
import WalletConnectButton from "../../../features/wallet/WalletConnectButton";
import SajiBalanceCard from "../../../features/wallet/SajiBalanceCard";
import { useSajiBalance } from "../../../lib/hooks/useSajiBalance";
import { labelize } from "../../../features/group/group-view";

const STATUS_STYLES: Record<string, string> = {
	success: "text-success-700",
	failed: "text-error-500",
	pending: "text-warning-800",
};

const STATUS_LABELS: Record<string, string> = {
	success: "Completed",
	failed: "Failed",
	pending: "Pending",
};

export default function Page() {
	const { data, loading, error, refetch } = useApi(() => dashboardApi.show(), []);
	// Linked address (DB) drives the connect state; balance/history are extras.
	const { data: me, refetch: refetchProfile } = useApi(() => profileApi.show(), []);
	const { data: history, loading: historyLoading } = useApi(
		() => walletApi.history({ per_page: 20 }),
		[],
	);
	// Saji Balance is read BROWSER-SIDE, not via wallet.sajiBalance() — that
	// endpoint's RPC reads die behind the DNS wall and silently report 0, which
	// is why a waiting payout never used to show here.
	const saji = useSajiBalance();

	const linkedAddress = me?.stellar_address ?? null;
	const txns = history?.data ?? [];

	return (
		<div className="w-full space-y-8 pb-10 md:space-y-10">
			<PageHeader title="Wallet" />

			{loading ? (
				<div className="h-60 animate-pulse rounded-[20px] bg-primary-light md:rounded-[30px]" />
			) : error ? (
				<div className="rounded-[20px] bg-[#f8f8f8] p-6 text-sm">
					<p className="text-error-500">{error}</p>
					<button onClick={refetch} className="mt-2 font-medium underline">
						Try again
					</button>
				</div>
			) : (
				data && <SavingsSummaryCard data={data} />
			)}

			<div className="grid items-start gap-4 lg:grid-cols-2">
				{/* OUTSIDE the dashboard gate on purpose. This card owns its own
				    loading and error states and reads the chain independently; gated
				    behind the dashboard request, a slow or failing dashboard took the
				    balance AND the only Withdraw button off the page entirely. */}
				<SajiBalanceCard balance={saji} />

				<div className="space-y-4">
					{/* Wallet link status (non-custodial). */}
					<section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-[#f8f8f8] px-6 py-5">
						<div className="min-w-0">
							<p className="text-xs font-light md:text-sm">Wallet Address</p>
							<p className="mt-1 break-all font-mono text-xs">
								{linkedAddress ?? "No wallet linked yet."}
							</p>
						</div>
						<WalletConnectButton linkedAddress={linkedAddress} onChange={refetchProfile} />
					</section>

					{data && <UpcomingContribution due={data.quick_deposit} />}
				</div>
			</div>

			{data && <UsefulInsights data={data} />}

			<section>
				<SectionHeader title="Wallet History" href={pageRoutes.dashboardRoutes.ACTIVITY} />

				{historyLoading ? (
					<div className="mt-4 space-y-2">
						{[0, 1, 2].map((i) => (
							<div key={i} className="h-16 animate-pulse rounded-xl bg-[#f8f8f8]" />
						))}
					</div>
				) : txns.length === 0 ? (
					<p className="mt-4 rounded-[20px] bg-[#f8f8f8] p-6 text-sm">
						No transactions yet.
					</p>
				) : (
					<ul className="mt-4 space-y-2 md:mt-6">
						{txns.map((tx) => {
							// `kind`, not `type` — the latter reads "payout" for money
							// LEAVING as well as arriving.
							const incoming = tx.kind === "payout";
							const outgoing = tx.kind === "contribution" || tx.kind === "withdrawal";
							const Icon = incoming ? HiArrowDownLeft : outgoing ? HiArrowUpRight : HiOutlineSquares2X2;

							return (
								<li key={tx.id}>
									<Link
										href={pageRoutes.dashboardRoutes.TRANSACTION(tx.id)}
										className="flex items-center gap-4 rounded-xl bg-[#f8f8f8] px-4 py-3 transition hover:bg-[#f2f2f2] md:px-5"
									>
										<span
											className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
												incoming
													? "bg-success-50 text-success-700"
													: outgoing
														? "bg-accent-light text-accent"
														: "bg-primary-light text-primary"
											}`}
										>
											<Icon />
										</span>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm">
												{labelize(tx.kind)}
												{tx.group && (
													<span className="font-light"> · {tx.group.name}</span>
												)}
											</p>
											<p className="text-xs font-light">
												{new Date(tx.created_at).toLocaleString(undefined, {
													day: "numeric",
													month: "short",
													hour: "2-digit",
													minute: "2-digit",
												})}
											</p>
										</div>
										<div className="shrink-0 text-right">
											{tx.amount && (
												<p className="text-sm">
													{outgoing ? "−" : incoming ? "+" : ""}
													{formatMoney(tx.amount)}
												</p>
											)}
											<p className={`text-[11px] ${STATUS_STYLES[tx.status] ?? ""}`}>
												{STATUS_LABELS[tx.status] ?? tx.status}
											</p>
										</div>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
}
