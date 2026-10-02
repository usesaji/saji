"use client";
import { useRouter } from "next/navigation";
import React from "react";
import { HiArrowLongLeft } from "react-icons/hi2";

/** A plain "← Back" for pages whose title lives further down the page. */
const GoBack = () => {
	const router = useRouter();

	return (
		<button
			type="button"
			onClick={() => router.back()}
			className="flex w-fit items-center gap-2.5 text-sm md:text-base"
		>
			<HiArrowLongLeft className="text-2xl" />
			Back
		</button>
	);
};

export default GoBack;
