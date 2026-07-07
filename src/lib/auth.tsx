import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import { getCollection, upsertDocument } from "./data";
import { Collections } from "./collections";
import type { UserProfile } from "./types";
import { parseRole, UserRole } from "./rbac";

/**
 * Authentication with two paths:
 *  - Real Supabase Auth (`signIn` / `signUp`) via `supabase.auth`. On a confirmed
 *    sign-in the matching `UserProfile` is loaded from the `users` collection (or
 *    derived + upserted on first login).
 *  - Demo access (`demoLogin`) — mock role derivation from the email, no password,
 *    mirroring the .NET `LoginViewModel`. Kept so the app stays demoable offline.
 *
 * Sessions restore on load from the Supabase session (real) or localStorage (demo).
 */

interface AuthState {
  user: UserProfile | null;
  role: UserRole;
  signIn: (email: string, password: string) => Promise<UserProfile>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  demoLogin: (email: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  loading: boolean;
}

const STORAGE_KEY = "ct_user";

const AuthContext = createContext<AuthState | undefined>(undefined);

function profileForEmail(email: string): UserProfile {
  const e = email.toLowerCase();
  const now = new Date().toISOString();
  if (e.includes("admin")) {
    return {
      id: "admin_user_001", Email: email, FullName: "System Administrator",
      JobTitle: "Global Sustainability Lead", Department: "Executive Operations",
      Role: "Admin", CompanyName: "CarbonTracker Corp", EmployeeId: "ADM-001",
      LastLoginAt: now,
    };
  }
  if (e.includes("operator")) {
    return {
      id: "operator_user_001", Email: email, FullName: "Alex Operator",
      JobTitle: "Field Technician", Department: "Supply Chain",
      Role: "Operator", CompanyName: "Lestari Mill", EmployeeId: "OP-252",
      LastLoginAt: now,
    };
  }
  return {
    id: "viewer_user_001", Email: email, FullName: "Guest Viewer",
    JobTitle: "External Auditor", Department: "Compliance",
    Role: "Viewer", CompanyName: "EcoVerify Ltd", LastLoginAt: now,
  };
}

function loadStoredUser(): UserProfile | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/** Resolve the app profile for an authenticated Supabase user: existing row by
 * email, else derive from the email and persist it. */
async function resolveProfile(email: string, authId: string): Promise<UserProfile> {
  try {
    const users = await getCollection<UserProfile>(Collections.users);
    const existing = users.find((u) => (u.Email ?? "").toLowerCase() === email.toLowerCase());
    if (existing) {
      const updated = { ...existing, LastLoginAt: new Date().toISOString() };
      await upsertDocument(Collections.users, updated);
      return updated;
    }
  } catch {
    /* fall through to derive */
  }
  const derived = { ...profileForEmail(email), id: authId, Email: email };
  await upsertDocument(Collections.users, derived);
  return derived;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(() => loadStoredUser());
  const [loading, setLoading] = useState(false);

  // Restore a real Supabase session on load (demo sessions are already restored
  // synchronously from localStorage above).
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const s = data.session;
      if (s?.user?.email && !localStorage.getItem(STORAGE_KEY)) {
        const profile = await resolveProfile(s.user.email, s.user.id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
        setUser(profile);
      }
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.toLowerCase().includes("not confirmed")) {
          throw new Error("Please confirm your email address before signing in (check your inbox).");
        }
        throw new Error(error.message || "Invalid email or password.");
      }
      const authUser = data.user;
      const profile = await resolveProfile(authUser!.email!, authUser!.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      setUser(profile);
      return profile;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw new Error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const demoLogin = async (email: string) => {
    setLoading(true);
    try {
      const profile = profileForEmail(email);
      await upsertDocument(Collections.users, profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      setUser(profile);
      return profile;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    if (isSupabaseConfigured) {
      try { await supabase.auth.signOut(); } catch { /* ignore */ }
    }
  };

  return (
    <AuthContext.Provider value={{ user, role: parseRole(user?.Role), signIn, signUp, demoLogin, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
