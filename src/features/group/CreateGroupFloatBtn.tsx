import Link from "next/link";
import React from "react";
import { FiPlus } from "react-icons/fi";
import { pageRoutes } from "../../config/routes";

/**
 * Floating "create a group" button. Mobile-only by default; `desktop` also
 * shows it on wide screens, in the dark style the overview design uses there.
 */
const CreateGroupFloatBtn = ({ desktop = false }: { desktop?: boolean }) => {
	return (
		<Link
			href={pageRoutes.dashboardRoutes.NEW_GROUP}
			aria-label="Create a group"
			className={`hover:scale-[0.9] active:scale-[1.1] duration-150 fixed rounded-full bg-primary flex justify-center items-center bottom-[10%] right-[6%] z-100 w-15 h-15 sm:h-20 sm:w-20 cursor-pointer ${
				desktop
					? "lg:bottom-10 lg:right-10 lg:bg-neutral-dark lg:shadow-lg"
					: "lg:hidden"
			}`}
		>
			<FiPlus className="text-4xl text-white" />
		</Link>
	);
};

export default CreateGroupFloatBtn;
