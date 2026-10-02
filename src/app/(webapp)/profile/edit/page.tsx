import { redirect } from "next/navigation";
import { pageRoutes } from "../../../../config/routes";

// Personal details are edited field by field on the Personal Info page; this
// route stays so existing links keep working.
export default function Page() {
	redirect(pageRoutes.dashboardRoutes.PROFILE_PERSONAL_INFO);
}
