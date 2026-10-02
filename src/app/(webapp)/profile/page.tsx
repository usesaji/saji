"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
	HiChevronRight,
	HiOutlineArrowRightOnRectangle,
	HiOutlineDocumentText,
	HiOutlineShieldCheck,
	HiOutlineUser,
	HiOutlineWallet,
} from "react-icons/hi2";
import { useApi } from "../../../lib/hooks/useApi";
import {
	profile as profileApi,
	auth as authApi,
	assetUrl,
	clearToken,
} from "../../../lib/api";
import { toast } from "../../../lib/utils/toast";
import ImageUpload from "../../../components/shared/ImageUpload";
import { initials } from "../../../components/shared/Avatar";
import PageHeader from "../../../components/dashboard/PageHeader";
import { pageRoutes } from "../../../config/routes";
import { labelize } from "../../../features/group/group-view";

/** "GABC…WXYZ" — enough to recognise an address without a wall of text. */
const shortAddress = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

const MENU = [
	{
		label: "Personal Info",
		description: "Name, tag, date of birth and address",
		href: pageRoutes.dashboardRoutes.PROFILE_PERSONAL_INFO,
		Icon: HiOutlineUser,
	},
	{
		label: "Password & Security",
		description: "Password, login lockout and withdrawal checks",
		href: pageRoutes.dashboardRoutes.PROFILE_SECURITY,
		Icon: HiOutlineShieldCheck,
	},
	{
		label: "Withdraw Destinations",
		description: "Where your payouts can be sent",
		href: pageRoutes.dashboardRoutes.WITHDRAW_INFO,
		Icon: HiOutlineWallet,
	},
	{
		label: "Generate Statement",
		description: "Download your transaction history",
		href: pageRoutes.dashboardRoutes.PROFILE_STATEMENT,
		Icon: HiOutlineDocumentText,
	},
];

export default function Page() {
	const router = useRouter();
	const { data, loading, error, refetch } = useApi(() => profileApi.show(), []);
	const [loggingOut, setLoggingOut] = useState(false);

	/**
	 * Ends the session.
	 *
	 * `POST /api/auth/logout` revokes the token server-side so it cannot be
	 * replayed if it was ever captured — but the local token is cleared either
	 * way. If the request fails, refusing to log the user out would leave them
	 * stuck signed in on a device they are trying to leave, which is worse than
	 * a token that expires on its own within 30 days.
	 */
	const logout = async () => {
		setLoggingOut(true);
		try {
			await authApi.logout();
		} catch {
			// Revocation failed; clear locally regardless.
		} finally {
			clearToken();
			router.replace(pageRoutes.authRoutes.LOGIN);
			toast.success("", "Signed out");
		}
	};

	// A just-uploaded avatar shows immediately, without waiting on a refetch.
	const [uploadedAvatar, setUploadedAvatar] = useState<string | null>(null);

	if (loading) {
		return (
			<div className="w-full space-y-6">
				<PageHeader title="My Account" />
				<div className="h-56 animate-pulse rounded-[20px] bg-primary-light" />
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="w-full space-y-6">
				<PageHeader title="My Account" />
				<div className="rounded-[20px] bg-[#f8f8f8] p-6 text-sm">
					<p className="text-error-500">{error ?? "Could not load profile."}</p>
					<button onClick={refetch} className="mt-2 font-medium underline">
						Try again
					</button>
				</div>
			</div>
		);
	}

	const avatar = uploadedAvatar ?? data.avatar_url;

	const details: { label: string; value: string }[] = [
		{ label: "Email", value: data.email },
		{ label: "Date of Birth", value: formatDate(data.date_of_birth) },
		{ label: "Gender", value: data.gender ? labelize(data.gender) : "Not set" },
		{ label: "Address", value: data.address ?? "Not set" },
		{
			label: "Sign-in",
			value: data.is_google_linked
				? data.has_password
					? "Google & password"
					: "Google"
				: "Email & password",
		},
	];

	return (
		<div className="w-full space-y-6 pb-10 md:space-y-8">
			<PageHeader title="My Account" />

			<div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
				<div className="space-y-4">
					{/* Identity */}
					<section className="relative overflow-hidden rounded-[20px] bg-primary px-6 py-7 text-white md:px-8">
						<img
							src="/images/wallet-vector.svg"
							alt=""
							aria-hidden
							className="pointer-events-none absolute -bottom-6 -right-6 opacity-70"
						/>
						<div className="relative flex items-center gap-4">
							<ImageUpload
								variant="avatar"
								src={assetUrl(avatar)}
								placeholder={
									<span className="flex h-full w-full items-center justify-center bg-white text-xl font-medium text-primary">
										{initials(data.name)}
									</span>
								}
								alt={data.name}
								onUpload={async (file) => {
									const { avatar_url } = await profileApi.uploadAvatar(file);
									setUploadedAvatar(avatar_url);
									return assetUrl(avatar_url);
								}}
							/>
							<div className="min-w-0">
								<p className="truncate text-xl md:text-2xl">{data.name}</p>
								{data.tag_name && (
									<p className="text-sm text-white/80">@{data.tag_name}</p>
								)}
							</div>
						</div>

						<div className="relative mt-6 flex flex-wrap items-center gap-2 text-xs">
							{data.stellar_address ? (
								<span className="rounded-full bg-primary-dark px-3 py-1.5">
									Wallet linked · {shortAddress(data.stellar_address)}
								</span>
							) : (
								<Link
									href={pageRoutes.dashboardRoutes.WALLET}
									className="rounded-full bg-white px-3 py-1.5 text-primary"
								>
									Link a wallet
								</Link>
							)}
						</div>
					</section>

					{/* Details */}
					<section className="rounded-[20px] bg-[#f8f8f8] px-6 py-2">
						{details.map((row) => (
							<div
								key={row.label}
								className="flex items-start justify-between gap-4 border-b border-neutral-light py-3.5 last:border-0"
							>
								<span className="text-sm font-light">{row.label}</span>
								<span className="break-all text-right text-sm">{row.value}</span>
							</div>
						))}
					</section>
				</div>

				{/* Settings */}
				<section className="space-y-3">
					{MENU.map(({ label, description, href, Icon }) => (
						<Link
							key={href}
							href={href}
							className="flex items-center gap-4 rounded-[20px] bg-[#f8f8f8] px-5 py-4 transition hover:bg-[#f2f2f2] md:px-6 md:py-5"
						>
							<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-xl text-primary">
								<Icon />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block text-sm md:text-base">{label}</span>
								<span className="block truncate text-xs font-light">{description}</span>
							</span>
							<HiChevronRight className="shrink-0 text-xl text-neutral-900" />
						</Link>
					))}

					<button
						type="button"
						onClick={logout}
						disabled={loggingOut}
						className="flex w-full items-center gap-4 rounded-[20px] bg-[#f8f8f8] px-5 py-4 text-left transition hover:bg-accent-light disabled:opacity-60 md:px-6 md:py-5"
					>
						<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-light text-xl text-accent">
							<HiOutlineArrowRightOnRectangle />
						</span>
						<span className="flex-1 text-sm text-accent md:text-base">
							{loggingOut ? "Signing out…" : "Log Out"}
						</span>
					</button>
				</section>
			</div>
		</div>
	);
}

function formatDate(iso: string | null): string {
	if (!iso) return "Not set";
	// A bare date ("1994-03-12") parses as UTC midnight — format it in UTC so a
	// negative timezone doesn't show the day before.
	const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
	return Number.isNaN(date.getTime())
		? iso
		: date.toLocaleDateString(undefined, {
				day: "numeric",
				month: "long",
				year: "numeric",
				timeZone: "UTC",
			});
}
