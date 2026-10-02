"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	HiArrowLongLeft,
	HiCheck,
	HiInformationCircle,
	HiMinus,
	HiOutlineClipboardDocument,
	HiOutlineUserPlus,
	HiPlus,
} from "react-icons/hi2";
import { FaShuffle, FaHandPointer, FaCheckToSlot, FaGear } from "react-icons/fa6";
import {
	BsCalendar2DayFill,
	BsCalendar2MonthFill,
	BsCalendar2RangeFill,
	BsCalendar2WeekFill,
} from "react-icons/bs";
import { MdAddPhotoAlternate, MdEditCalendar } from "react-icons/md";
import { IoClose } from "react-icons/io5";
import { PiWarningCircleFill } from "react-icons/pi";
import {
	RiCalendarFill,
	RiGroupFill,
	RiMoneyDollarCircleFill,
	RiPercentFill,
	RiShuffleFill,
} from "react-icons/ri";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../components/ui/select";
import { Label } from "../../components/ui/label";
import Avatar from "../../components/shared/Avatar";
import {
	groups as groupsApi,
	profile as profileApi,
	assetUrl,
	fieldErrors,
	ApiError,
	type CreateGroupInput,
} from "../../lib/api";
import { useApi } from "../../lib/hooks/useApi";
import { pageRoutes } from "../../config/routes";
import { toast } from "../../lib/utils/toast";
import { useSavingsContract } from "../../lib/hooks/useSavingsContract";
import { TOKEN_LIST, requireToken } from "../../lib/contract/tokens";
import { cycleSecondsFor, formatCycleLength, labelize } from "./group-view";
import { BAD_AUTH_MESSAGE, isBadAuthError } from "../../lib/errors";

// ---------------------------------------------------------------------------
// Options and limits
// ---------------------------------------------------------------------------

/**
 * The frequency tiles from the design. Anything else — hourly, every few days,
 * quarterly — is a Custom cycle, set in hours/days/weeks below the tiles.
 */
const FREQUENCIES = [
	{ value: "daily", label: "Daily", Icon: BsCalendar2DayFill },
	{ value: "weekly", label: "Weekly", Icon: BsCalendar2WeekFill },
	{ value: "bi_weekly", label: "Bi Weekly", Icon: BsCalendar2RangeFill },
	{ value: "monthly", label: "Monthly", Icon: BsCalendar2MonthFill },
	{ value: "custom", label: "Custom", Icon: MdEditCalendar },
];

/** How a frequency reads in a sentence: "due every two weeks". */
const FREQUENCY_PHRASE: Record<string, string> = {
	daily: "every day",
	weekly: "every week",
	bi_weekly: "every two weeks",
	monthly: "every month",
};

const CYCLE_UNITS = [
	{ value: "3600", label: "Hours" },
	{ value: "86400", label: "Days" },
	{ value: "604800", label: "Weeks" },
];

const LATE_PENALTIES = [
	{ value: "deduct_from_balance", label: "Charge the late fee" },
	{ value: "remove_member", label: "Remove the member" },
];

const PAYOUT_TILES = [
	{ value: "random", label: "Random", Icon: FaShuffle },
	{ value: "manual", label: "Manual", Icon: FaHandPointer },
	{ value: "vote", label: "Vote", Icon: FaCheckToSlot },
	{ value: "custom", label: "Custom", Icon: FaGear },
];

/**
 * The savings contract's own limits. Checked on these screens so a value the
 * contract would reject is caught here — not after the wallet has signed and
 * the transaction reverts.
 */
const MIN_CYCLE_SECONDS = 3_600; // MIN_CYCLE_LENGTH
const MAX_CYCLE_SECONDS = 120 * 86_400; // MAX_CYCLE_LENGTH
const MAX_FEE_BPS = 1_000; // MAX_FEE_BPS — 10%, for both fees

/** Matches the server's upload cap (`MAX_UPLOAD_BYTES`). */
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** A positive decimal with at most 7 places — what Stellar can represent. */
const AMOUNT = /^\d+(\.\d{1,7})?$/;

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

type FormState = {
	name: string;
	contribution_amount: string;
	target_amount: string;
	asset_code: string;
	contribution_frequency: string;
	cycle_length_value: string;
	cycle_length_unit: string;
	payout_order: string;
	group_type: string;
	late_penalty: string;
	/** Service charge as a PERCENT (converted to bps on submit). */
	service_pct: string;
	/**
	 * How the organizer states the late fee. The contract only stores it as a
	 * percentage of the contribution, so a fixed amount is converted.
	 */
	late_fee_mode: "fixed" | "percent";
	/** Late fee as an AMOUNT of the circle's token. */
	late_fixed: string;
	/** Late fee as a PERCENT of the contribution. */
	late_pct: string;
	/** Grace period in DAYS (converted to hours on submit). */
	grace_days: string;
	auto_approve_join: boolean;
	hide_balances: boolean;
};

const initial: FormState = {
	name: "",
	contribution_amount: "",
	target_amount: "",
	asset_code: "USDC",
	contribution_frequency: "monthly",
	cycle_length_value: "",
	cycle_length_unit: "86400",
	payout_order: "manual",
	group_type: "private",
	late_penalty: "deduct_from_balance",
	service_pct: "0",
	late_fee_mode: "fixed",
	late_fixed: "",
	late_pct: "",
	grace_days: "3",
	auto_approve_join: false,
	hide_balances: false,
};

/** The custom cycle in seconds, or null when it isn't a whole positive number. */
function customCycleSeconds(form: FormState): number | null {
	const n = Number(form.cycle_length_value);
	if (!Number.isInteger(n) || n <= 0) return null;
	return n * Number(form.cycle_length_unit);
}

/** Percent string → basis points (100 bps = 1%). */
const pctToBps = (pct: string) => Math.round((Number(pct) || 0) * 100);

/**
 * The late fee in basis points of the contribution, whichever way it was
 * entered. A fixed amount becomes `fixed / contribution`: the contract charges
 * `amount × late_fee_bps / 10_000`, which gives the fixed amount back (to the
 * nearest 0.01% of the contribution).
 */
function lateFeeBps(form: FormState): number {
	if (form.late_fee_mode === "percent") return pctToBps(form.late_pct);
	const fixed = Number(form.late_fixed) || 0;
	const contribution = Number(form.contribution_amount) || 0;
	if (fixed <= 0 || contribution <= 0) return 0;
	return Math.round((fixed / contribution) * 10_000);
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 7 });

/** "5% (2.5 USDC)" — both readings of the late fee. */
function lateFeeLabel(form: FormState): string {
	const bps = lateFeeBps(form);
	if (bps === 0) return "None";
	const contribution = Number(form.contribution_amount) || 0;
	return `${fmt(bps / 100)}% (${fmt((contribution * bps) / 10_000)} ${form.asset_code})`;
}

/** Step-1 problems, keyed by the server's field names. */
function basicsErrors(form: FormState): Record<string, string> {
	const errors: Record<string, string> = {};
	if (!form.name.trim()) errors.name = "Give your group a name.";

	const contribution = form.contribution_amount.trim();
	if (!contribution) {
		errors.contribution_amount = "Enter how much each member contributes per cycle.";
	} else if (!AMOUNT.test(contribution) || Number(contribution) <= 0) {
		errors.contribution_amount = "Enter an amount above 0, with at most 7 decimal places.";
	}

	const target = form.target_amount.trim();
	if (target && (!AMOUNT.test(target) || Number(target) <= 0)) {
		errors.target_amount = "Enter an amount above 0, with at most 7 decimal places.";
	}

	if (form.contribution_frequency === "custom") {
		const seconds = customCycleSeconds(form);
		if (seconds === null) {
			errors.cycle_length_seconds = "Enter a whole number for the cycle length.";
		} else if (seconds < MIN_CYCLE_SECONDS || seconds > MAX_CYCLE_SECONDS) {
			errors.cycle_length_seconds = "A cycle must be between 1 hour and 120 days.";
		}
	}
	return errors;
}

/** Step-2 problems, keyed by the server's field names. */
function rulesErrors(form: FormState): Record<string, string> {
	const errors: Record<string, string> = {};
	const contribution = Number(form.contribution_amount) || 0;

	const raw = form.late_fee_mode === "fixed" ? form.late_fixed : form.late_pct;
	if (raw.trim() && (!AMOUNT.test(raw.trim()) || Number(raw) < 0)) {
		errors.late_fee_bps = "Enter a number, or leave it empty for no late fee.";
	} else if (lateFeeBps(form) > MAX_FEE_BPS) {
		errors.late_fee_bps = `Late fees are capped at 10% of the contribution (${fmt(
			contribution / 10,
		)} ${form.asset_code}).`;
	}

	if (!/^\d+(\.\d+)?$/.test(form.service_pct.trim() || "0")) {
		errors.fee_bps = "Enter a percentage.";
	} else if (pctToBps(form.service_pct) > MAX_FEE_BPS) {
		errors.fee_bps = "The service charge is capped at 10%.";
	}
	return errors;
}

const RULE_FIELDS = new Set(["late_fee_bps", "fee_bps", "grace_period_hours", "payout_order"]);

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export default function CreateGroupForm() {
	const router = useRouter();
	const { createGroup: createGroupOnchain } = useSavingsContract();
	const { data: me } = useApi(() => profileApi.show(), []);

	const [step, setStep] = useState(1); // 1..3, 4 = success
	const [form, setForm] = useState<FormState>(initial);
	/** Errors from the server, which outrank the on-screen checks. */
	const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
	const [touched, setTouched] = useState<Record<string, boolean>>({});
	const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
	const [showNameHint, setShowNameHint] = useState(true);
	const [showSettingsNote, setShowSettingsNote] = useState(true);
	const [saving, setSaving] = useState(false);
	const [created, setCreated] = useState<{
		id: number;
		inviteUrl: string | null;
		onchain: boolean;
	} | null>(null);

	// Release the photo preview's object URL when it's replaced or unmounted.
	const photoUrl = photo?.url;
	useEffect(() => {
		return () => {
			if (photoUrl) URL.revokeObjectURL(photoUrl);
		};
	}, [photoUrl]);

	const clientErrors = { ...basicsErrors(form), ...rulesErrors(form) };
	const fieldError = (key: string, touchKey = key) =>
		serverErrors[key] ?? (touched[touchKey] ? clientErrors[key] : undefined);

	const set =
		(key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value;
			setForm((f) => ({ ...f, [key]: value }));
			// Editing a field clears the server's complaint about it.
			setServerErrors((errors) => {
				const rest = { ...errors };
				delete rest[key];
				return rest;
			});
		};
	const setValue = (key: keyof FormState) => (v: string | boolean) =>
		setForm((f) => ({ ...f, [key]: v }));
	const touch = (key: string) => () => setTouched((t) => ({ ...t, [key]: true }));

	const canProceedStep1 = Object.keys(basicsErrors(form)).length === 0;
	const canProceedStep2 = Object.keys(rulesErrors(form)).length === 0;

	// --- navigation ---
	const back = () => {
		if (step === 1) router.push(pageRoutes.dashboardRoutes.GROUPS);
		else setStep((s) => s - 1);
	};

	const discard = () => {
		setForm(initial);
		setPhoto(null);
		router.push(pageRoutes.dashboardRoutes.GROUPS);
	};

	// --- photo ---
	const pickPhoto = (file: File) => {
		if (!PHOTO_TYPES.includes(file.type)) {
			toast.error("Use a JPG, PNG, or WebP image.", "Unsupported file");
			return;
		}
		if (file.size > MAX_PHOTO_BYTES) {
			toast.error("Image must be 4 MB or smaller.", "File too large");
			return;
		}
		setPhoto({ file, url: URL.createObjectURL(file) });
	};

	// --- copy shown under the form ---
	const customSeconds = customCycleSeconds(form);
	const cyclePhrase =
		form.contribution_frequency === "custom"
			? customSeconds
				? `every ${formatCycleLength(customSeconds)}`
				: "on your custom cycle"
			: (FREQUENCY_PHRASE[form.contribution_frequency] ?? "each cycle");
	const frequencyLabel =
		form.contribution_frequency === "custom" && customSeconds
			? `Every ${formatCycleLength(customSeconds)}`
			: labelize(form.contribution_frequency);

	// --- final create (DB + photo + on-chain + record), then Success ---
	const create = async () => {
		setSaving(true);
		setServerErrors({});

		const payload: CreateGroupInput = {
			name: form.name.trim(),
			description: null,
			asset_code: form.asset_code || "USDC",
			contribution_amount: form.contribution_amount.trim(),
			target_amount: form.target_amount.trim() || null,
			contribution_frequency:
				form.contribution_frequency as CreateGroupInput["contribution_frequency"],
			payout_order: form.payout_order as CreateGroupInput["payout_order"],
			group_type: form.group_type as CreateGroupInput["group_type"],
			late_penalty: form.late_penalty as CreateGroupInput["late_penalty"],
			fee_bps: pctToBps(form.service_pct),
			late_fee_bps: lateFeeBps(form),
			grace_period_hours: (Number(form.grace_days) || 0) * 24,
			auto_approve_join: form.auto_approve_join,
			hide_balances: form.hide_balances,
			...(form.contribution_frequency === "custom" && customSeconds
				? { cycle_length_seconds: customSeconds }
				: {}),
		};

		try {
			const { group } = await groupsApi.store(payload);

			// The photo can only be uploaded once the group exists. Not fatal:
			// the group is real either way, and the photo can be added later.
			if (photo) {
				await groupsApi.uploadPhoto(group.id, photo.file).catch(() =>
					toast.warning(
						"Your group was created, but the photo didn't upload. You can add it from the group page.",
						"Photo not saved",
					),
				);
			}

			// Create on-chain (wallet signs) + link the id. If this fails the
			// group still exists and can be set up on-chain from its page — but
			// the organizer has to be told, not shown an unqualified success.
			let onchain = true;
			try {
				const onchainId = await createGroupOnchain({
					token: requireToken(form.asset_code).sac,
					contributionAmount: payload.contribution_amount,
					cycleLengthSeconds: cycleSecondsFor(form.contribution_frequency, customSeconds),
					feeBps: payload.fee_bps ?? 0,
					lateFeeBps: payload.late_fee_bps ?? 0,
					gracePeriodHours: payload.grace_period_hours ?? 0,
					payoutOrder: form.payout_order,
					latePenalty: form.late_penalty,
				});
				await groupsApi.recordOnchain(group.id, {
					onchain_group_id: Number(onchainId),
				});
			} catch (err) {
				onchain = false;
				toast.warning(
					isBadAuthError(err)
						? BAD_AUTH_MESSAGE
						: "Your group is saved, but it isn't live on-chain yet. Open it to finish setting it up.",
					"Not on-chain yet",
				);
			}

			let inviteUrl: string | null = null;
			try {
				const link = await groupsApi.inviteLink(group.id);
				inviteUrl =
					link.invite_url ?? `${window.location.origin}/groups/join/${link.invite_token}`;
			} catch {
				/* the link is optional on the success screen */
			}

			setCreated({ id: group.id, inviteUrl, onchain });
			setStep(4);
		} catch (err) {
			const errors = fieldErrors(err);
			setServerErrors(errors);
			toast.error(
				err instanceof ApiError ? err.message : "Something went wrong.",
				"Could not create group",
			);
			// Send them to the step that holds the field the server rejected.
			setStep(Object.keys(errors).some((k) => RULE_FIELDS.has(k)) ? 2 : 1);
		} finally {
			setSaving(false);
		}
	};

	// =========================================================================
	// STEP 4 — Success
	// =========================================================================
	if (step === 4 && created) {
		return <SuccessScreen name={form.name.trim()} created={created} />;
	}

	// =========================================================================
	// STEP 3 — Review
	// =========================================================================
	if (step === 3) {
		const target = Number(form.target_amount);
		const rows: { Icon: React.ComponentType<{ className?: string }>; label: string; value: string; danger?: boolean }[] = [
			{
				Icon: RiGroupFill,
				label: "Group Type",
				value: `Rotating · ${labelize(form.group_type)}`,
			},
			{ Icon: RiShuffleFill, label: "Payout Order", value: labelize(form.payout_order) },
			{ Icon: RiCalendarFill, label: "Frequency", value: frequencyLabel },
			{
				Icon: RiMoneyDollarCircleFill,
				label: "Contribution",
				value: `${fmt(Number(form.contribution_amount))} ${form.asset_code}`,
			},
			{
				Icon: RiPercentFill,
				label: "Service Charge",
				value: `${fmt(pctToBps(form.service_pct) / 100)}%`,
			},
			{
				Icon: PiWarningCircleFill,
				label: "Late Penalty",
				value: `${lateFeeLabel(form)} after ${Number(form.grace_days) || 0} days`,
				danger: true,
			},
		];

		return (
			<div className="w-full max-w-5xl">
				<div className="flex items-center gap-3">
					<button type="button" onClick={back} aria-label="Back to Group Rules">
						<HiArrowLongLeft className="text-2xl" />
					</button>
					<h2 className="truncate text-2xl md:text-[28px]">{form.name.trim()}</h2>
				</div>

				<img
					src={photo?.url ?? "/images/group-placeholder.png"}
					alt=""
					className="mt-4 h-40 w-full rounded-[14px] object-cover md:h-56"
				/>

				<div className="mt-3 grid grid-cols-2 gap-3">
					<div className="rounded-[10px] bg-neutral-comment px-4 py-4 md:px-5">
						<p className="text-xs">Target Goal</p>
						<p className="mt-1 truncate text-2xl md:text-[34px]">
							{target > 0
								? `${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(target)} ${form.asset_code}`
								: "—"}
						</p>
					</div>
					<div className="rounded-[10px] bg-neutral-comment px-4 py-4 md:px-5">
						<p className="text-xs">1 Member</p>
						<div className="mt-2 flex items-center">
							<Avatar
								src={assetUrl(me?.avatar_url)}
								name={me?.name ?? "You"}
								className="h-9 w-9 border-2 border-white"
							/>
							{/* Members join after creation, through the invite link. */}
							<span
								aria-hidden
								className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-neutral-dark text-white"
							>
								<HiPlus />
							</span>
						</div>
					</div>
				</div>

				<p className="mt-6 text-sm">Group Settings</p>
				<div className="mt-2">
					{rows.map(({ Icon, label, value, danger }) => (
						<div
							key={label}
							className="flex items-center justify-between gap-4 border-b border-neutral-light py-3 text-sm"
						>
							<span className="flex items-center gap-2">
								<Icon className={`text-base ${danger ? "text-error-400" : "text-primary"}`} />
								{label}
							</span>
							<span className={`text-right ${danger ? "text-error-400" : ""}`}>{value}</span>
						</div>
					))}
				</div>

				<div className="mt-6 rounded-[14px] bg-neutral-comment px-5 py-5">
					<p className="text-sm">Invite your members</p>
					<p className="mt-1 max-w-xl text-xs font-light">
						Your invitation link is ready as soon as the group is created. Members who
						use it are added once you approve them.
					</p>
				</div>

				<button
					type="button"
					onClick={create}
					disabled={saving}
					className="mt-8 h-12 w-48 rounded-full bg-primary-dark text-sm text-white transition hover:bg-primary-dark-hover disabled:cursor-wait disabled:opacity-80 md:h-14 md:text-base"
				>
					{saving ? "Creating…" : "Create Group"}
				</button>
			</div>
		);
	}

	// =========================================================================
	// STEP 2 — Group Rules
	// =========================================================================
	if (step === 2) {
		const lateError = fieldError("late_fee_bps");
		const bps = lateFeeBps(form);
		const contribution = Number(form.contribution_amount) || 0;

		return (
			<div className="w-full max-w-5xl">
				<StepHeader step={2} total={3} onBack={back} />

				<p className="mt-8 text-xs">Late Fees</p>
				<div className="mt-3 grid gap-3 sm:grid-cols-2">
					<LateFeeCard
						label="Fixed Amount"
						selected={form.late_fee_mode === "fixed"}
						onSelect={() => setValue("late_fee_mode")("fixed")}
						prefix={form.asset_code}
						value={form.late_fixed}
						onChange={set("late_fixed")}
						onBlur={touch("late_fee_bps")}
						art="/images/late_fee.svg"
					/>
					<LateFeeCard
						label="Percentage of contribution"
						selected={form.late_fee_mode === "percent"}
						onSelect={() => setValue("late_fee_mode")("percent")}
						suffix="%"
						value={form.late_pct}
						onChange={set("late_pct")}
						onBlur={touch("late_fee_bps")}
					/>
				</div>
				{lateError ? (
					<p className="mt-2 text-xs text-error-400" role="alert">
						{lateError}
					</p>
				) : (
					<p className="mt-2 text-xs font-light text-neutral-900">
						{bps > 0
							? `Charged on a member's next contribution after they miss one: ${fmt(
									(contribution * bps) / 10_000,
								)} ${form.asset_code} (${fmt(bps / 100)}% of the contribution). Capped at 10%.`
							: "Leave both empty for no late fee. Capped at 10% of the contribution."}
					</p>
				)}

				<div className="mt-8 grid gap-8 md:grid-cols-2">
					<div>
						<p className="text-sm font-light">Grace Period (Days)</p>
						<DaysStepper
							value={Number(form.grace_days) || 0}
							onChange={(n) => setValue("grace_days")(String(n))}
						/>
					</div>

					<div className="space-y-5">
						<ToggleRow
							label="Public Discovery"
							description="Allow non-members to find the group"
							value={form.group_type === "public"}
							onChange={(on) => setValue("group_type")(on ? "public" : "private")}
						/>
						<ToggleRow
							label="Contribute Privacy"
							description="Hide member balances from each other"
							value={form.hide_balances}
							onChange={setValue("hide_balances")}
						/>
						<ToggleRow
							label="Auto Approval"
							description="Admit join requests without reviewing them"
							value={form.auto_approve_join}
							onChange={setValue("auto_approve_join")}
						/>
					</div>
				</div>

				<div className="mt-8">
					<p className="text-sm font-light">Payout Order</p>
					<div className="mt-3 flex flex-wrap gap-5 md:gap-6">
						{PAYOUT_TILES.map(({ value, label, Icon }) => (
							<ChoiceTile
								key={value}
								label={label}
								Icon={Icon}
								active={form.payout_order === value}
								onClick={() => setValue("payout_order")(value)}
							/>
						))}
					</div>
				</div>

				{/* Also enforced by the contract, so they're set here even though
				    the design leaves them out. */}
				<div className="mt-8 grid gap-5 md:grid-cols-2">
					<PillInput
						name="service_pct"
						label="Service Charge"
						placeholder="0"
						suffix="%"
						inputMode="decimal"
						value={form.service_pct}
						onChange={set("service_pct")}
						onBlur={touch("fee_bps")}
						error={fieldError("fee_bps")}
					/>
					<SelectField
						label="When a member misses the grace period"
						value={form.late_penalty}
						items={LATE_PENALTIES}
						onChange={setValue("late_penalty")}
					/>
				</div>

				<div className="mt-10 flex gap-3">
					<button
						type="button"
						onClick={discard}
						className="h-12 flex-1 rounded-full bg-neutral-comment text-sm text-error-400 transition hover:bg-neutral-light md:h-14 md:text-base"
					>
						Discard Draft
					</button>
					<button
						type="button"
						disabled={!canProceedStep2}
						onClick={() => setStep(3)}
						className="h-12 rounded-full bg-primary px-8 text-sm text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-neutral-light-hover disabled:text-neutral-light-active md:h-14 md:px-12 md:text-base"
					>
						Save &amp; Continue
					</button>
				</div>

				<div className="relative mt-8 overflow-hidden rounded-[14px] bg-primary px-6 py-6 text-white">
					<img
						src="/images/trust_rules.svg"
						alt=""
						aria-hidden
						className="pointer-events-none absolute -bottom-1 right-4 h-[115%] max-sm:opacity-40"
					/>
					<div className="relative max-w-sm">
						<p className="text-base md:text-lg">Trust Built on Rules</p>
						<p className="mt-1 text-xs font-light md:text-sm">
							Clear rules reduce friction and ensure everyone grows together in your
							community.
						</p>
					</div>
				</div>
			</div>
		);
	}

	// =========================================================================
	// STEP 1 — Basics
	// =========================================================================
	const amountLabel = AMOUNT.test(form.contribution_amount.trim())
		? `${fmt(Number(form.contribution_amount))} ${form.asset_code}`
		: null;

	return (
		<div className="w-full max-w-5xl">
			<StepHeader step={1} total={3} onBack={back} />

			<PhotoPicker photo={photo} onPick={pickPhoto} onRemove={() => setPhoto(null)} />

			<div className="mt-8 grid gap-x-6 gap-y-5 md:grid-cols-2">
				<div className="space-y-2.5">
					<PillInput
						name="name"
						label="Group Name"
						placeholder="e.g Summer Cabin Fund"
						value={form.name}
						onChange={set("name")}
						onBlur={touch("name")}
						error={fieldError("name")}
					/>
					{showNameHint && (
						<span className="inline-flex items-center gap-1.5 rounded-full bg-primary-light px-3 py-1 text-[11px] text-primary">
							<HiInformationCircle className="text-sm" />
							Choose a name that inspires your members
							<button
								type="button"
								onClick={() => setShowNameHint(false)}
								aria-label="Dismiss tip"
								className="ml-1"
							>
								<IoClose />
							</button>
						</span>
					)}
				</div>

				<PillInput
					name="target_amount"
					label="Target Amount"
					placeholder="0.00"
					prefix={form.asset_code}
					inputMode="decimal"
					value={form.target_amount}
					onChange={set("target_amount")}
					onBlur={touch("target_amount")}
					error={fieldError("target_amount")}
				/>

				{/* Required by the contract but not in the step-1 design: what each
				    member pays per cycle, and the token the circle saves in. */}
				<PillInput
					name="contribution_amount"
					label="Contribution per Member"
					placeholder="0.00"
					prefix={form.asset_code}
					inputMode="decimal"
					value={form.contribution_amount}
					onChange={set("contribution_amount")}
					onBlur={touch("contribution_amount")}
					error={fieldError("contribution_amount")}
				/>
				<SelectField
					label="Save in"
					value={form.asset_code}
					items={TOKEN_LIST.map((t) => ({ value: t.code, label: t.label }))}
					onChange={setValue("asset_code")}
				/>
			</div>

			<div className="mt-8">
				<p className="text-sm font-light">Contribution Frequency</p>
				<div className="mt-3 flex flex-wrap gap-5 md:gap-6">
					{FREQUENCIES.map(({ value, label, Icon }) => (
						<ChoiceTile
							key={value}
							label={label}
							Icon={Icon}
							active={form.contribution_frequency === value}
							onClick={() => setValue("contribution_frequency")(value)}
						/>
					))}
				</div>

				{form.contribution_frequency === "custom" && (
					<div className="mt-5 grid max-w-md grid-cols-[1fr_9rem] items-start gap-3">
						<PillInput
							name="cycle_length_value"
							label="Cycle Length"
							placeholder="7"
							inputMode="numeric"
							value={form.cycle_length_value}
							onChange={set("cycle_length_value")}
							onBlur={touch("cycle_length_value")}
							error={fieldError("cycle_length_seconds", "cycle_length_value")}
						/>
						<SelectField
							label="Unit"
							value={form.cycle_length_unit}
							items={CYCLE_UNITS}
							onChange={setValue("cycle_length_unit")}
						/>
					</div>
				)}
			</div>

			<button
				type="button"
				disabled={!canProceedStep1}
				onClick={() => setStep(2)}
				className="mt-12 h-12 w-40 rounded-full bg-primary-dark text-sm text-white transition hover:bg-primary-dark-hover disabled:cursor-not-allowed disabled:bg-neutral-light-hover disabled:text-neutral-light-active md:h-14 md:w-48 md:text-base"
			>
				Continue
			</button>

			{showSettingsNote && (
				<div className="relative mt-10 rounded-[14px] bg-primary-light px-5 py-5 md:px-6">
					<button
						type="button"
						onClick={() => setShowSettingsNote(false)}
						aria-label="Dismiss"
						className="absolute right-4 top-4 text-lg text-primary"
					>
						<IoClose />
					</button>
					<p className="pr-8 text-base md:text-lg">Community Settings</p>
					<p className="mt-1 max-w-xl text-xs md:text-sm">
						{amountLabel
							? `Each member's contribution of ${amountLabel} will be due ${cyclePhrase}.`
							: `Members will contribute ${cyclePhrase}.`}{" "}
						Ensure you leave enough balance to avoid missed payment penalties.
					</p>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Step 4
// ---------------------------------------------------------------------------

function SuccessScreen({
	name,
	created,
}: {
	name: string;
	created: { id: number; inviteUrl: string | null; onchain: boolean };
}) {
	const [copied, setCopied] = useState(false);
	const groupHref = pageRoutes.dashboardRoutes.GROUP(String(created.id));

	const copy = async () => {
		if (!created.inviteUrl) return;
		try {
			await navigator.clipboard.writeText(created.inviteUrl);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Select the link and copy it instead.", "Couldn't copy");
		}
	};

	// The phone's share sheet where there is one (WhatsApp is how most circles
	// form); otherwise the link goes on the clipboard.
	const invite = async () => {
		if (!created.inviteUrl) return;
		if (typeof navigator.share === "function") {
			try {
				await navigator.share({
					title: name,
					text: `Join my savings group "${name}" on Saji`,
					url: created.inviteUrl,
				});
				return;
			} catch {
				/* dismissed — fall through to copying */
			}
		}
		await copy();
		toast.success("Paste it wherever your members are.", "Invite link copied");
	};

	return (
		<div className="mx-auto flex max-w-md flex-col items-center py-10 text-center md:py-16">
			<div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-white md:h-28 md:w-28">
				<HiCheck className="text-5xl md:text-6xl" />
			</div>
			<h2 className="mt-8 text-2xl">
				{created.onchain ? "Your Savings Group is Active" : "Your Savings Group is Saved"}
			</h2>
			<p className="mt-2 text-xs font-light md:text-sm">
				{created.onchain
					? `Your group "${name}" has been successfully created. Now, invite your community to start growing together.`
					: `Your group "${name}" is saved, but it isn't live on-chain yet. Open it to finish setting it up before members contribute.`}
			</p>

			{created.inviteUrl && (
				<div className="mt-16 w-full text-left md:mt-24">
					<Label className="text-sm font-light">Group Invite Link</Label>
					<div className="mt-2 flex h-12 items-center gap-2 rounded-full border border-neutral-light-active bg-white pl-5 pr-2">
						<input
							readOnly
							value={created.inviteUrl}
							onFocus={(e) => e.currentTarget.select()}
							aria-label="Group invite link"
							className="min-w-0 flex-1 truncate bg-transparent text-sm outline-none"
						/>
						<button
							type="button"
							onClick={copy}
							aria-label="Copy invite link"
							className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg text-primary hover:bg-primary-light"
						>
							{copied ? <HiCheck /> : <HiOutlineClipboardDocument />}
						</button>
					</div>
					<p className="mt-2 text-[11px] font-light">
						Anyone with this link can request to join your group.
					</p>
				</div>
			)}

			{created.inviteUrl && (
				<button
					type="button"
					onClick={invite}
					className="mt-10 flex h-12 w-56 items-center justify-center gap-2 rounded-full bg-primary text-sm text-white transition hover:bg-primary-hover"
				>
					<HiOutlineUserPlus className="text-base" />
					Invite Members
				</button>
			)}

			<Link href={groupHref} className="mt-5 text-sm text-primary underline-offset-4 hover:underline">
				Go to your group
			</Link>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

/** Back arrow, "Step N" and the progress segments on one row. 1-indexed. */
function StepHeader({
	step,
	total,
	onBack,
}: {
	step: number;
	total: number;
	onBack: () => void;
}) {
	return (
		<div className="flex items-center gap-4">
			<button
				type="button"
				onClick={onBack}
				className="flex shrink-0 items-center gap-2.5 text-sm md:text-base"
			>
				<HiArrowLongLeft className="text-2xl" />
				<span>Step {step}</span>
			</button>
			<div
				className="flex flex-1 gap-1.5"
				role="progressbar"
				aria-valuenow={step}
				aria-valuemin={1}
				aria-valuemax={total}
			>
				{Array.from({ length: total }).map((_, i) => (
					<div
						key={i}
						className={`h-1 flex-1 rounded-full md:h-1.5 ${
							i < step ? "bg-primary" : "bg-primary-light"
						}`}
					/>
				))}
			</div>
		</div>
	);
}

/** "Set Group Photo" banner. The file is held until the group exists. */
function PhotoPicker({
	photo,
	onPick,
	onRemove,
}: {
	photo: { url: string } | null;
	onPick: (file: File) => void;
	onRemove: () => void;
}) {
	const input = useRef<HTMLInputElement>(null);

	return (
		<div className="relative mt-8 overflow-hidden rounded-[14px] bg-primary text-white">
			{photo && (
				<>
					<img src={photo.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
					<div className="absolute inset-0 bg-black/40" />
				</>
			)}
			<div className="relative flex min-h-36 flex-col px-5 py-5 md:min-h-40 md:px-6">
				<p className="text-sm md:text-base">Set Group Photo</p>
				<div className="mt-3 flex flex-1 flex-col items-center justify-center gap-4">
					{!photo && <MdAddPhotoAlternate className="text-3xl" aria-hidden />}
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => input.current?.click()}
							className="flex items-center gap-1.5 rounded-full bg-primary-dark px-6 py-2.5 text-xs transition hover:bg-primary-dark-hover md:text-sm"
						>
							{photo ? "Change Photo" : "Browse Photos"} <HiPlus />
						</button>
						{photo && (
							<button type="button" onClick={onRemove} className="text-xs underline md:text-sm">
								Remove
							</button>
						)}
					</div>
				</div>
			</div>
			<input
				ref={input}
				type="file"
				accept={PHOTO_TYPES.join(",")}
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = ""; // allow re-picking the same file
					if (file) onPick(file);
				}}
			/>
		</div>
	);
}

/** Rounded text input with an optional unit before or after the value. */
function PillInput({
	name,
	label,
	value,
	onChange,
	onBlur,
	placeholder,
	prefix,
	suffix,
	error,
	inputMode,
}: {
	name: string;
	label: string;
	value: string;
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onBlur?: () => void;
	placeholder?: string;
	prefix?: string;
	suffix?: string;
	error?: string;
	inputMode?: "decimal" | "numeric" | "text";
}) {
	return (
		<div className="space-y-2">
			<label htmlFor={name} className="text-sm font-light">
				{label}
			</label>
			<div
				className={`flex h-12 items-center gap-3 rounded-full border bg-white px-5 transition ${
					error
						? "border-error-400 text-error-400"
						: "border-neutral-light-active focus-within:border-primary focus-within:text-primary"
				}`}
			>
				{prefix && <span className="text-sm font-medium">{prefix}</span>}
				<input
					id={name}
					name={name}
					value={value}
					onChange={onChange}
					onBlur={onBlur}
					placeholder={placeholder}
					inputMode={inputMode}
					aria-invalid={Boolean(error)}
					aria-describedby={error ? `${name}-error` : undefined}
					className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-sm placeholder:text-neutral-light-active"
				/>
				{suffix && <span className="text-sm font-medium">{suffix}</span>}
			</div>
			{error && (
				<p id={`${name}-error`} className="text-xs text-error-400" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}

function SelectField({
	label,
	value,
	items,
	onChange,
}: {
	label: string;
	value: string;
	items: { value: string; label: string }[];
	onChange: (v: string) => void;
}) {
	return (
		<div className="space-y-2">
			<Label className="text-sm font-light">{label}</Label>
			<Select items={items} value={value} onValueChange={onChange}>
				<SelectTrigger className="h-12 w-full rounded-[900px] border-neutral-light-active bg-white px-5">
					<SelectValue />
				</SelectTrigger>
				<SelectContent className="bg-white text-neutral-dark">
					<SelectGroup>
						{items.map((it) => (
							<SelectItem key={it.value} value={it.value}>
								{it.label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</div>
	);
}

/** Round icon option with a caption — frequency and payout-order pickers. */
function ChoiceTile({
	label,
	Icon,
	active,
	onClick,
}: {
	label: string;
	Icon: React.ComponentType;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={active}
			onClick={onClick}
			className="flex w-14 flex-col items-center gap-2"
		>
			<span
				className={`flex h-12 w-12 items-center justify-center rounded-full text-lg transition md:h-14 md:w-14 md:text-xl ${
					active
						? "bg-primary text-white"
						: "bg-primary-light text-primary hover:bg-primary-light-hover"
				}`}
			>
				<Icon />
			</span>
			<span className={`text-[11px] ${active ? "text-primary" : ""}`}>{label}</span>
		</button>
	);
}

function ToggleRow({
	label,
	description,
	value,
	onChange,
}: {
	label: string;
	description: string;
	value: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div>
				<p className="text-sm">{label}</p>
				<p className="text-[11px] font-light">{description}</p>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={value}
				aria-label={label}
				onClick={() => onChange(!value)}
				className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
					value ? "bg-primary" : "bg-neutral-light"
				}`}
			>
				<span
					className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${
						value ? "left-5.5 bg-white" : "left-0.5 bg-neutral-dark"
					}`}
				/>
			</button>
		</div>
	);
}

/**
 * One of the two late-fee cards. Selecting a card picks how the fee is stated;
 * the selected one is filled, the other muted, as in the design.
 */
function LateFeeCard({
	label,
	selected,
	onSelect,
	prefix,
	suffix,
	value,
	onChange,
	onBlur,
	art,
}: {
	label: string;
	selected: boolean;
	onSelect: () => void;
	prefix?: string;
	suffix?: string;
	value: string;
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onBlur: () => void;
	art?: string;
}) {
	const [showArt, setShowArt] = useState(true);

	return (
		<div
			onClick={onSelect}
			className={`relative cursor-pointer overflow-hidden rounded-[10px] px-4 py-4 transition md:px-5 ${
				selected
					? "bg-primary text-white"
					: "bg-primary-light text-neutral-dark hover:bg-primary-light-hover"
			}`}
		>
			{art && showArt && (
				<img
					src={art}
					alt=""
					aria-hidden
					onError={() => setShowArt(false)}
					className="pointer-events-none absolute -bottom-2 right-0 h-[90%]"
				/>
			)}
			<p className="relative text-[11px]">{label}</p>
			<label className="relative mt-1 flex items-baseline gap-1">
				<span className="sr-only">{label}</span>
				{prefix && <span className="text-lg md:text-xl">{prefix}</span>}
				<input
					value={value}
					onChange={onChange}
					onFocus={onSelect}
					onBlur={onBlur}
					inputMode="decimal"
					placeholder="0"
					className={`w-28 min-w-0 bg-transparent text-3xl outline-none md:w-36 md:text-[34px] ${
						selected ? "placeholder:text-white/50" : "placeholder:text-neutral-dark/30"
					}`}
				/>
				{suffix && <span className="text-2xl md:text-3xl">{suffix}</span>}
			</label>
		</div>
	);
}

function DaysStepper({
	value,
	onChange,
}: {
	value: number;
	onChange: (n: number) => void;
}) {
	return (
		<div className="mt-2 flex items-center justify-between rounded-full bg-neutral-comment px-3 py-2">
			<button
				type="button"
				aria-label="One day less"
				onClick={() => onChange(Math.max(0, value - 1))}
				className="flex h-8 w-8 items-center justify-center rounded-full text-lg hover:bg-white"
			>
				<HiMinus />
			</button>
			<span className="text-sm" aria-live="polite">
				{value} {value === 1 ? "day" : "days"}
			</span>
			<button
				type="button"
				aria-label="One day more"
				onClick={() => onChange(value + 1)}
				className="flex h-8 w-8 items-center justify-center rounded-full text-lg hover:bg-white"
			>
				<HiPlus />
			</button>
		</div>
	);
}
