import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Recycle, Workflow, Sprout, ArrowRight } from "lucide-react";

const ONBOARDING_KEY = "ct_onboarded";

const slides = [
  {
    icon: Recycle,
    title: "Turn waste into income",
    body:
      'Carbon credits are proof you stopped CO₂ from being released. Each credit = 1 tonne of CO₂ avoided (that’s what "tCO₂e" means). Companies buy them to offset their own pollution.',
  },
  {
    icon: Workflow,
    title: "How it works — 4 steps",
    body:
      "1. Record the plant waste you collect (the “feedstock”)\n2. Track its journey from field to processing mill\n3. Verify it with a signed audit trail\n4. Earn carbon credits you can export and sell",
  },
  {
    icon: Sprout,
    title: "You’re all set",
    body:
      "Jump in with ready-made sample data. Open any batch in Feedstock to follow its full chain-of-custody journey, or use the CORC Calculator to estimate credits.",
  },
];

/** True once the user has seen (or dismissed) onboarding on this browser. */
export function hasOnboarded() {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

/** Marks onboarding as seen so the one-time prompt isn't shown again. */
export function markOnboarded() {
  localStorage.setItem(ONBOARDING_KEY, "true");
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const last = index === slides.length - 1;

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    navigate("/");
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-background overflow-hidden p-6">
      <div className="glow-orb w-[32rem] h-[32rem] -top-40 -right-40 animate-pulse-glow" />
      <div className="glow-orb w-96 h-96 bottom-0 -left-40 animate-pulse-glow" style={{ animationDelay: "1.5s" }} />

      <button
        onClick={finish}
        className="absolute top-6 right-6 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Skip
      </button>

      <div className="relative w-full max-w-md text-center space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/15">
          <slide.icon className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">{slide.title}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{slide.body}</p>

        {/* Indicators */}
        <div className="flex items-center justify-center gap-2 pt-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-primary" : "w-1.5 bg-muted"}`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <button
          onClick={() => (last ? finish() : setIndex((i) => i + 1))}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground px-6 h-14 w-full text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          {last ? "Explore the dashboard" : "Next"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
