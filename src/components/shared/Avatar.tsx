/* eslint-disable @next/next/no-img-element */

/** "Ada Okafor" → "AO", "ada" → "A", "" → "?" */
export function initials(name: string | null | undefined): string {
	const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	const first = parts[0].charAt(0);
	const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
	return (first + last).toUpperCase();
}

/**
 * A person's picture, or their initials when they haven't uploaded one — never
 * a stock face, which would show a stranger as the signed-in user or a member.
 *
 * Size, shape and border come from `className`; it fills its box.
 */
export default function Avatar({
	src,
	name,
	className = "h-9 w-9",
	textClassName = "text-xs",
}: {
	/** An already-resolved URL (see `assetUrl`), or empty for initials. */
	src?: string | null;
	name: string | null | undefined;
	className?: string;
	textClassName?: string;
}) {
	return (
		<span
			className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-light ${className}`}
			title={name ?? undefined}
		>
			{src ? (
				<img src={src} alt={name ?? ""} className="h-full w-full object-cover" />
			) : (
				<span aria-label={name ?? undefined} className={`font-medium text-primary ${textClassName}`}>
					{initials(name)}
				</span>
			)}
		</span>
	);
}
