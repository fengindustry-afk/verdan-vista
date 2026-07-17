import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { hasOnboarded, markOnboarded } from "./Onboarding";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// Demo logins set a local session but no real Supabase JWT, so under RLS they
// show empty data. Show the demo shortcuts only in dev, or when a deployment
// explicitly opts in via VITE_ENABLE_DEMO=true (e.g. a staging/demo site).
const SHOW_DEMO =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "true";

export default function Login() {
  const { signIn, demoLogin, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Optional one-time prompt (not a forced gate): only for first-time visitors
  // on this browser who aren't signed in. Dismissing or taking it marks it seen.
  const [tourOpen, setTourOpen] = useState(() => !hasOnboarded());
  const dismissTour = () => {
    markOnboarded();
    setTourOpen(false);
  };
  const takeTour = () => {
    markOnboarded();
    setTourOpen(false);
    navigate("/onboarding");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    try {
      const profile = await signIn(email, password);
      markOnboarded(); // a signed-in user is never a first-timer
      toast.success(`Welcome, ${profile.FullName}`);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    }
  };

  const demo = async (demoEmail: string) => {
    setError("");
    try {
      const profile = await demoLogin(demoEmail);
      markOnboarded();
      toast.success(`Signed in as ${profile.FullName}`);
      navigate("/");
    } catch {
      setError("Demo login failed.");
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background overflow-hidden p-6">
      {/* Optional one-time "take a tour?" prompt */}
      <Dialog open={tourOpen} onOpenChange={(o) => { if (!o) dismissTour(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New to Esterra?</DialogTitle>
            <DialogDescription>
              Take a quick 3-step tour of how waste becomes verified carbon credits.
              You can always skip and jump straight in.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              onClick={dismissTour}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              Maybe later
            </button>
            <button
              onClick={takeTour}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              Take the tour
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="glow-orb w-[32rem] h-[32rem] -top-40 -right-40 animate-pulse-glow" />
      <div className="glow-orb w-96 h-96 bottom-0 -left-40 animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

      <div className="relative w-full max-w-sm glass-card-glow p-8">
        <div className="flex items-center gap-3 mb-6">
          <img src="/esterra-mark.svg" alt="Esterra" className="h-11 w-11 shrink-0" />
          <div>
            <p className="text-lg font-light tracking-[0.28em] text-foreground">
              EST<span className="text-primary">E</span>RRA
            </p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-primary/80">
              Rooted in earth. Designed for tomorrow.
            </p>
          </div>
        </div>

        <h1 className="text-lg font-semibold text-foreground mb-1">Sign in</h1>
        <p className="text-xs text-muted-foreground mb-5">Access your carbon credit dashboard</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs">Email</Label>
            <Input type="email" value={email} placeholder="you@company.com" onChange={(e) => setEmail(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Password</Label>
            <Input type="password" value={password} placeholder="••••••••" onChange={(e) => setPassword(e.target.value)} className="mt-1" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Sign in
          </button>
        </form>

        {SHOW_DEMO && (
        <div className="mt-5 pt-5 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground mb-2">Quick demo access (no password)</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Admin", email: "demo.admin@carbontracker.app" },
              { label: "Operator", email: "operator@carbontracker.app" },
              { label: "Viewer", email: "viewer@carbontracker.app" },
            ].map((d) => (
              <button
                key={d.label}
                onClick={() => demo(d.email)}
                disabled={loading}
                className="rounded-lg border border-border bg-muted/50 px-2 py-1.5 text-[11px] text-foreground hover:bg-muted transition-colors disabled:opacity-60"
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
