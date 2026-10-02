"use client";

import { useState } from "react";
import PageHeader from "@/components/dashboard/PageHeader";
import InputField from "@/components/ui/custom/InputField";
import SecurityToggleRow from "@/features/profile/SecurityToggleRow";
import SecurityInfoBanner from "@/features/profile/SecurityInfoBanner";
import { useApi } from "@/lib/hooks/useApi";
import { profile as profileApi, fieldErrors, ApiError } from "@/lib/api";
import { pageRoutes } from "@/config/routes";
import { toast } from "@/lib/utils/toast";

/** The lockout threshold the toggle switches on; 0 turns lockout off. */
const DEFAULT_LOCK_AFTER = 5;

/** Password & Security — change password and manage security settings. */
export default function SecurityPage() {
	const { data } = useApi(() => profileApi.show(), []);

	// --- Password change ---
	const [pwd, setPwd] = useState({
		current_password: "",
		password: "",
		password_confirmation: "",
	});
	const [pwdErrors, setPwdErrors] = useState<Record<string, string>>({});
	const [savingPwd, setSavingPwd] = useState(false);

	// Google-only accounts have no password yet, so there's no current one to ask for.
	const hasPassword = data?.has_password ?? true;
	const canSubmit =
		pwd.password.length >= 8 &&
		pwd.password === pwd.password_confirmation &&
		(!hasPassword || pwd.current_password.length > 0);

	const setP = (key: keyof typeof pwd) => (e: React.ChangeEvent<HTMLInputElement>) =>
		setPwd((p) => ({ ...p, [key]: e.target.value }));

	const mismatch =
		pwd.password_confirmation.length > 0 && pwd.password !== pwd.password_confirmation
			? "The passwords don't match."
			: undefined;

	const submitPwd = async (e: React.FormEvent) => {
		e.preventDefault();
		setSavingPwd(true);
		setPwdErrors({});
		try {
			await profileApi.changePassword({
				password: pwd.password,
				password_confirmation: pwd.password_confirmation,
				...(hasPassword ? { current_password: pwd.current_password } : {}),
			});
			toast.success("Other sessions were signed out.", "Password updated");
			setPwd({ current_password: "", password: "", password_confirmation: "" });
		} catch (err) {
			setPwdErrors(fieldErrors(err));
			toast.error(
				err instanceof ApiError ? err.message : "Something went wrong.",
				"Could not update password",
			);
		} finally {
			setSavingPwd(false);
		}
	};

	// --- Security settings ---
	// What the user last set on this screen, over what the profile says.
	const [settings, setSettings] = useState<{ twofa: boolean; lockAfter: number } | null>(null);
	const twofa = settings?.twofa ?? data?.security.twofa_on_suspicious_withdrawal ?? false;
	const lockAfter = settings?.lockAfter ?? data?.security.lock_after_failed_attempts ?? 0;

	/** Optimistic: flip the switch now, put it back if the save fails. */
	const saveSecurity = async (next: { twofa: boolean; lockAfter: number }) => {
		const previous = settings;
		setSettings(next);
		try {
			await profileApi.updateSecurity({
				twofa_on_suspicious_withdrawal: next.twofa,
				lock_after_failed_attempts: next.lockAfter,
			});
			toast.success("", "Security updated");
		} catch (err) {
			setSettings(previous);
			toast.error(
				err instanceof ApiError ? err.message : "Something went wrong.",
				"Could not update",
			);
		}
	};

	return (
		<div className="w-full space-y-6 pb-10 md:space-y-8">
			<PageHeader title="Password & Security" back backHref={pageRoutes.dashboardRoutes.ME} />

			<div className="grid items-start gap-6 lg:grid-cols-2">
				<form onSubmit={submitPwd} className="space-y-5 rounded-[20px] bg-[#f8f8f8] p-6 md:p-7">
					<h3 className="text-lg md:text-xl">
						{hasPassword ? "Change Password" : "Set a Password"}
					</h3>
					{!hasPassword && (
						<p className="-mt-3 text-xs font-light">
							You sign in with Google. Set a password to sign in with your email too.
						</p>
					)}

					{hasPassword && (
						<InputField
							name="current_password"
							label="Current Password"
							type="password"
							value={pwd.current_password}
							onChange={setP("current_password")}
							error={pwdErrors.current_password}
						/>
					)}
					<InputField
						name="password"
						label="New Password"
						type="password"
						description="At least 8 characters."
						value={pwd.password}
						onChange={setP("password")}
						error={pwdErrors.password}
					/>
					<InputField
						name="password_confirmation"
						label="Confirm New Password"
						type="password"
						value={pwd.password_confirmation}
						onChange={setP("password_confirmation")}
						error={mismatch}
					/>

					<button
						type="submit"
						disabled={!canSubmit || savingPwd}
						className="h-12 w-full rounded-full bg-primary-dark text-sm text-white transition hover:bg-primary-dark-hover disabled:cursor-not-allowed disabled:bg-neutral-light-hover disabled:text-neutral-light-active md:text-base"
					>
						{savingPwd ? "Saving…" : hasPassword ? "Update Password" : "Set Password"}
					</button>
				</form>

				<div className="space-y-4">
					<section className="rounded-[20px] bg-[#f8f8f8] px-6 py-2 md:px-7">
						<h3 className="pt-4 text-lg md:text-xl">Security Settings</h3>
						<SecurityToggleRow
							label="2FA on suspicious withdrawal"
							description="Ask for an extra check before an unusual withdrawal."
							checked={twofa}
							onChange={(on) => saveSecurity({ twofa: on, lockAfter })}
						/>
						<SecurityToggleRow
							label="Lock after failed logins"
							description={
								lockAfter > 0
									? `Your account locks for 15 minutes after ${lockAfter} wrong passwords.`
									: "Turn on to lock your account after repeated wrong passwords."
							}
							checked={lockAfter > 0}
							onChange={(on) =>
								saveSecurity({ twofa, lockAfter: on ? DEFAULT_LOCK_AFTER : 0 })
							}
						/>
					</section>
					<SecurityInfoBanner />
				</div>
			</div>
		</div>
	);
}
