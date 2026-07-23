import { useEffect } from "react";
import NotFound from "./NotFound";
import { logOpsEvent } from "@/lib/opsLog";
import { useAuth } from "@/lib/auth";

/**
 * Honeypot for the retired /feedstock list page. Nothing in the app links here
 * anymore, so a visit is either a stale bookmark or someone probing URLs.
 * Log who tripped it to ops_events (surfaces in the admin Notification Centre)
 * and show the ordinary 404 so the visitor learns nothing.
 */
export default function FeedstockHoneypot() {
  const { user } = useAuth();
  useEffect(() => {
    logOpsEvent(
      "honeypot-route-hit",
      `Retired /feedstock route opened by ${user?.Email ?? "unknown user"}`,
      navigator.userAgent
    );
  }, [user?.Email]);
  return <NotFound />;
}
