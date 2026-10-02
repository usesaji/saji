"use client";
import React, { useState } from "react";
import { Button } from "../../components/ui/button";
import InputField from "../../components/ui/custom/InputField";
import { ResponsiveModal, ResponsiveModalTitle } from "../../components/ui/responsive-modal";

export interface EditingField {
	key: string;
	label: string;
	/** An input type, or "select" to choose from `options`. */
	inputType: string;
	value: string;
	options?: { value: string; label: string }[];
}

interface EditFieldSheetProps {
	field: EditingField | null;
	onDiscard: () => void;
	onSave: (fieldKey: string, value: string) => Promise<string | null>;
}

export default function EditFieldSheet({ field, onDiscard, onSave }: EditFieldSheetProps) {
	// Keeps rendering the last field's content while the drawer plays its
	// close animation, since `field` flips to null the instant it's dismissed.
	const [displayField, setDisplayField] = useState<EditingField | null>(field);
	if (field !== null && field !== displayField) {
		setDisplayField(field);
	}

	return (
		<ResponsiveModal
			open={field !== null}
			onOpenChange={(next) => {
				if (!next) onDiscard();
			}}
		>
			{displayField && (
				<EditFieldForm
					key={displayField.key}
					field={displayField}
					onDiscard={onDiscard}
					onSave={onSave}
				/>
			)}
		</ResponsiveModal>
	);
}

function EditFieldForm({
	field,
	onDiscard,
	onSave,
}: {
	field: EditingField;
	onDiscard: () => void;
	onSave: (fieldKey: string, value: string) => Promise<string | null>;
}) {
	const [value, setValue] = useState(field.value);
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const handleSave = async () => {
		setIsSaving(true);
		setError(null);
		const validationError = await onSave(field.key, value.trim());
		setIsSaving(false);
		if (validationError) {
			setError(validationError);
		}
	};

	return (
		<div className="max-w-md mx-auto w-full">
			<ResponsiveModalTitle className="text-sm font-medium text-neutral-dark text-left mb-3">
				{field.label}
			</ResponsiveModalTitle>

			{field.inputType === "select" && field.options ? (
				<>
					<select
						name={field.key}
						value={value}
						onChange={(e) => setValue(e.target.value)}
						aria-label={field.label}
						className="h-12 w-full rounded-full border border-neutral-light-hover bg-white px-5 text-base outline-none focus:border-primary"
					>
						<option value="">Not set</option>
						{field.options.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					{error && (
						<p className="mt-1.5 text-xs text-error-500" role="alert">
							{error}
						</p>
					)}
				</>
			) : (
				// InputField renders the error message itself.
				<InputField
					name={field.key}
					type={field.inputType}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					error={error}
				/>
			)}

			<div className="flex items-center gap-3 mt-6 w-full">
				<button
					type="button"
					onClick={onDiscard}
					disabled={isSaving}
					className="flex-1 h-12 rounded-full bg-neutral-comment text-neutral-dark font-semibold text-sm cursor-pointer border-0 disabled:cursor-not-allowed disabled:opacity-60"
				>
					Discard
				</button>
				<Button type="button" onClick={handleSave} isLoading={isSaving} className="flex-1">
					Save &amp; Continue
				</Button>
			</div>
		</div>
	);
}
