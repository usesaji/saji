"use client";

import React, { useState } from "react";
import PageHeader from "../../components/dashboard/PageHeader";
import { toast } from "../../lib/utils/toast";
import { useApi } from "../../lib/hooks/useApi";
import { ApiError, profile as profileApi, type ProfileDetails } from "../../lib/api";
import { pageRoutes } from "../../config/routes";
import { labelize } from "../group/group-view";
import EditFieldSheet, { type EditingField } from "./EditFieldSheet";
import PersonalInfoRow from "./PersonalInfoRow";

/** The editable profile fields, keyed by their API names. */
type FieldKey = "name" | "tag_name" | "date_of_birth" | "gender" | "address";

const GENDERS = [
	{ value: "female", label: "Female" },
	{ value: "male", label: "Male" },
	{ value: "other", label: "Other" },
	{ value: "prefer_not_to_say", label: "Prefer not to say" },
];

const FIELDS: Record<FieldKey, Omit<EditingField, "key" | "value"> & { required?: boolean }> = {
	name: { label: "Full Name", inputType: "text", required: true },
	tag_name: { label: "Personal Tag", inputType: "text", required: true },
	date_of_birth: { label: "Date of Birth", inputType: "date" },
	gender: { label: "Gender", inputType: "select", options: GENDERS },
	address: { label: "Address", inputType: "text" },
};

/** How a stored value reads in its row. */
function display(key: FieldKey | "email", profile: ProfileDetails): string | null {
	switch (key) {
		case "tag_name":
			return profile.tag_name ? `@${profile.tag_name}` : null;
		case "gender":
			return profile.gender ? labelize(profile.gender) : null;
		case "date_of_birth":
			return profile.date_of_birth
				? new Date(`${profile.date_of_birth.slice(0, 10)}T00:00:00Z`).toLocaleDateString(
						undefined,
						{ day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
					)
				: null;
		default:
			return profile[key] || null;
	}
}

/**
 * Personal Info: one row per field, each edited in its own sheet and saved
 * straight to `PATCH /api/profile`.
 */
export default function PersonalInfoView() {
	const { data, loading, error, refetch } = useApi(() => profileApi.show(), []);
	/** Latest saved profile — the PATCH response, without waiting on a refetch. */
	const [saved, setSaved] = useState<Partial<ProfileDetails>>({});
	const [editing, setEditing] = useState<EditingField | null>(null);

	const profile = data ? ({ ...data, ...saved } as ProfileDetails) : null;

	const edit = (key: FieldKey) => {
		if (!profile) return;
		const raw = profile[key] ?? "";
		setEditing({
			key,
			...FIELDS[key],
			value: key === "date_of_birth" ? String(raw).slice(0, 10) : String(raw),
		});
	};

	/** Returns an error message for the sheet, or null once saved. */
	const save = async (fieldKey: string, value: string): Promise<string | null> => {
		const key = fieldKey as FieldKey;
		const field = FIELDS[key];
		const cleaned = key === "tag_name" ? value.replace(/^@/, "").trim() : value.trim();

		if (field.required && !cleaned) return `${field.label} can't be empty.`;
		if (key === "tag_name" && /\s/.test(cleaned)) return "Tags can't contain spaces.";

		try {
			const updated = await profileApi.update({
				// Optional fields clear to null; the API reads an omitted key as
				// "leave it alone", so an empty value has to be sent explicitly.
				[key]: cleaned || null,
			} as Parameters<typeof profileApi.update>[0]);
			setSaved((s) => ({ ...s, ...(updated as Partial<ProfileDetails>) }));
			setEditing(null);
			toast.success(`Your ${field.label.toLowerCase()} has been updated.`, "Changes saved");
			return null;
		} catch (err) {
			if (err instanceof ApiError) {
				return err.errors?.[key]?.[0] ?? err.message;
			}
			return "Something went wrong. Try again.";
		}
	};

	return (
		<div className="w-full max-w-2xl space-y-6 pb-10">
			<PageHeader title="Personal Info" back backHref={pageRoutes.dashboardRoutes.ME} />

			{loading && <div className="h-80 animate-pulse rounded-[20px] bg-[#f8f8f8]" />}

			{error && !loading && (
				<div className="rounded-[20px] bg-[#f8f8f8] p-6 text-sm">
					<p className="text-error-500">{error}</p>
					<button onClick={refetch} className="mt-2 font-medium underline">
						Try again
					</button>
				</div>
			)}

			{profile && !loading && (
				<>
					<Group title="Profile Info">
						<PersonalInfoRow label="Full Name" value={display("name", profile)} onEdit={() => edit("name")} />
						{/* No endpoint changes the sign-in email, so it isn't editable. */}
						<PersonalInfoRow label="Email Address" value={display("email", profile)} />
						<PersonalInfoRow label="Personal Tag" value={display("tag_name", profile)} onEdit={() => edit("tag_name")} />
					</Group>

					<Group title="Additional Info">
						<PersonalInfoRow label="Date of Birth" value={display("date_of_birth", profile)} onEdit={() => edit("date_of_birth")} />
						<PersonalInfoRow label="Gender" value={display("gender", profile)} onEdit={() => edit("gender")} />
						<PersonalInfoRow label="Address" value={display("address", profile)} onEdit={() => edit("address")} />
					</Group>
				</>
			)}

			<EditFieldSheet field={editing} onDiscard={() => setEditing(null)} onSave={save} />
		</div>
	);
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="rounded-[20px] bg-[#f8f8f8] px-6 pb-1 pt-4">
			<h3 className="border-b border-neutral-light pb-2.5 text-xs font-light">{title}</h3>
			<div className="divide-y divide-neutral-light">{children}</div>
		</section>
	);
}
