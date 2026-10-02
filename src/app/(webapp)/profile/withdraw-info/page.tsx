"use client";

import { useState } from "react";
import { HiOutlineExclamationTriangle, HiOutlineWallet } from "react-icons/hi2";
import PageHeader from "@/components/dashboard/PageHeader";
import InputField from "@/components/ui/custom/InputField";
import { useApi } from "@/lib/hooks/useApi";
import {
	withdrawInfo as wiApi,
	fieldErrors,
	ApiError,
	type WithdrawDestination,
} from "@/lib/api";
import { pageRoutes } from "@/config/routes";
import { toast } from "@/lib/utils/toast";

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

/** Withdraw Destinations — saved payout addresses (public Stellar addresses only). */
export default function WithdrawInfoPage() {
	const { data, loading, error, refetch } = useApi(() => wiApi.index(), []);

	const [form, setForm] = useState({ stellar_address: "", destination_label: "" });
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);

	const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = key === "stellar_address" ? e.target.value.trim().toUpperCase() : e.target.value;
		setForm((f) => ({ ...f, [key]: value }));
		setErrors((current) => {
			const rest = { ...current };
			delete rest[key];
			return rest;
		});
	};

	const addressError =
		form.stellar_address && !STELLAR_ADDRESS.test(form.stellar_address)
			? "A Stellar address starts with G and is 56 characters long."
			: undefined;

	const add = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		setErrors({});
		try {
			await wiApi.store({
				stellar_address: form.stellar_address,
				destination_label: form.destination_label.trim() || null,
			});
			setForm({ stellar_address: "", destination_label: "" });
			toast.success("", "Destination added");
			refetch();
		} catch (err) {
			setErrors(fieldErrors(err));
			toast.error(
				err instanceof ApiError ? err.message : "Something went wrong.",
				"Could not add",
			);
		} finally {
			setSaving(false);
		}
	};

	const destinations = data ?? [];

	return (
		<div className="w-full space-y-6 pb-10 md:space-y-8">
			<PageHeader
				title="Withdraw Destinations"
				subtitle="Where your payouts can be sent. Your primary destination is chosen by default."
				back
				backHref={pageRoutes.dashboardRoutes.ME}
			/>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
				<section className="space-y-3">
					{loading && (
						<div className="h-28 animate-pulse rounded-[20px] bg-[#f8f8f8]" />
					)}
					{error && !loading && (
						<div className="rounded-[20px] bg-[#f8f8f8] p-6 text-sm">
							<p className="text-error-500">{error}</p>
							<button onClick={refetch} className="mt-2 font-medium underline">
								Try again
							</button>
						</div>
					)}
					{!loading && !error && destinations.length === 0 && (
						<div className="rounded-[20px] border border-dashed border-neutral-light-active px-6 py-10 text-center text-sm">
							No destinations saved yet. Add the wallet you want payouts sent to.
						</div>
					)}

					{destinations.map((d) => (
						<DestinationCard key={d.id} destination={d} onChanged={refetch} />
					))}
				</section>

				<form onSubmit={add} className="space-y-5 rounded-[20px] bg-[#f8f8f8] p-6 md:p-7">
					<h3 className="text-lg md:text-xl">Add Destination</h3>
					<InputField
						name="stellar_address"
						label="Stellar Address"
						placeholder="G…"
						value={form.stellar_address}
						onChange={set("stellar_address")}
						error={errors.stellar_address ?? addressError}
					/>
					<InputField
						name="destination_label"
						label="Label (optional)"
						placeholder="e.g. My LOBSTR wallet"
						value={form.destination_label}
						onChange={set("destination_label")}
						error={errors.destination_label}
					/>

					{/* Withdrawals are contract calls with no memo, so an exchange
					    deposit address that needs one would strand the funds. */}
					<p className="flex gap-2 rounded-[14px] bg-warning-50 px-4 py-3 text-xs text-warning-900">
						<HiOutlineExclamationTriangle className="mt-0.5 shrink-0 text-base" />
						Use a wallet you control. Exchange addresses that need a memo or
						destination tag can&apos;t receive Saji withdrawals.
					</p>

					<button
						type="submit"
						disabled={saving || !STELLAR_ADDRESS.test(form.stellar_address)}
						className="h-12 w-full rounded-full bg-primary-dark text-sm text-white transition hover:bg-primary-dark-hover disabled:cursor-not-allowed disabled:bg-neutral-light-hover disabled:text-neutral-light-active md:text-base"
					>
						{saving ? "Adding…" : "Add Destination"}
					</button>
				</form>
			</div>
		</div>
	);
}

function DestinationCard({
	destination: d,
	onChanged,
}: {
	destination: WithdrawDestination;
	onChanged: () => void;
}) {
	const [confirming, setConfirming] = useState(false);
	const [busy, setBusy] = useState(false);

	const run = async (action: () => Promise<unknown>, success: string, failure: string) => {
		setBusy(true);
		try {
			await action();
			toast.success("", success);
			onChanged();
		} catch (err) {
			toast.error(err instanceof ApiError ? err.message : "Something went wrong.", failure);
		} finally {
			setBusy(false);
			setConfirming(false);
		}
	};

	return (
		<article
			className={`rounded-[20px] p-5 md:p-6 ${
				d.is_primary ? "bg-primary-light" : "bg-[#f8f8f8]"
			}`}
		>
			<div className="flex items-start gap-4">
				<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-xl text-primary">
					<HiOutlineWallet />
				</span>
				<div className="min-w-0 flex-1">
					<p className="flex flex-wrap items-center gap-2 text-sm md:text-base">
						{d.destination_label ?? "Wallet"}
						{d.is_primary && (
							<span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] text-white">
								Primary
							</span>
						)}
					</p>
					<p className="mt-1 break-all font-mono text-[11px] text-neutral-900 md:text-xs">
						{d.stellar_address}
					</p>
				</div>
			</div>

			<div className="mt-4 flex flex-wrap items-center justify-end gap-2 text-xs md:text-sm">
				{confirming ? (
					<>
						<span className="mr-auto">Remove this destination?</span>
						<button
							type="button"
							onClick={() => setConfirming(false)}
							className="rounded-full px-4 py-2 hover:bg-white"
						>
							Keep
						</button>
						<button
							type="button"
							disabled={busy}
							onClick={() => run(() => wiApi.destroy(d.id), "Destination removed", "Could not remove")}
							className="rounded-full bg-accent px-4 py-2 text-white disabled:opacity-60"
						>
							Remove
						</button>
					</>
				) : (
					<>
						{!d.is_primary && (
							<button
								type="button"
								disabled={busy}
								onClick={() => run(() => wiApi.setPrimary(d.id), "Primary destination updated", "Could not update")}
								className="rounded-full px-4 py-2 text-primary hover:bg-white disabled:opacity-60"
							>
								Make Primary
							</button>
						)}
						<button
							type="button"
							onClick={() => setConfirming(true)}
							className="rounded-full px-4 py-2 text-accent hover:bg-white"
						>
							Remove
						</button>
					</>
				)}
			</div>
		</article>
	);
}
