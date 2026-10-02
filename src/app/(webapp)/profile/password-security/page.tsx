import { redirect } from "next/navigation";
import { pageRoutes } from "../../../../config/routes";

// Password & Security lives at /profile/security; this route stays so existing
// links keep working.
export default function Page() {
	redirect(pageRoutes.dashboardRoutes.PROFILE_SECURITY);
}
