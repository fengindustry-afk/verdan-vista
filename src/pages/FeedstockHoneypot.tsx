import { useEffect, useRef } from "react";
import NotFound from "./NotFound";
import { logOpsEvent } from "@/lib/opsLog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

/**
 * Honeypot for the retired /feedstock list page. Nothing in the app links here
 * anymore, so a visit is either a stale bookmark or someone probing URLs.
 *
 * The hit is recorded server-side by the log-honeypot edge function, which
 * sees the caller's real IP in the request headers — the browser can't know
 * its own public IP, and a MAC address never reaches any web server. Falls
 * back to a client-side ops event if the function is unreachable. Renders the
 * ordinary 404 so the visitor learns nothing either way.
 */
export default function FeedstockHoneypot() {
  const { user } = useAuth();
  const fired = useRef(false);

  const report = (email: string) => {
    if (fired.current) return;
    fired.current = true;
    supabase.functions
      // claimed = unverified hint; the function prefers the JWT identity.
      .invoke("log-honeypot", {
        body: { path: window.location.pathname, claimed: email },
      })
      .then(({ error }) => {
        if (error) throw error;
      })
      .catch(() => {
        logOpsEvent(
          "honeypot-route-hit",
          `Retired /feedstock route opened by ${email || "unknown user"} (IP unrecorded — log-honeypot unreachable)`,
          navigator.userAgent
        );
      });
  };

  // On a hard page load the session restores after mount; wait for it so the
  // JWT rides along, but never longer than 3s — an anonymous hit still logs.
  useEffect(() => {
    if (user?.Email) {
      report(user.Email);
      return;
    }
    const t = setTimeout(() => report(""), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.Email]);

  return <NotFound />;
}
