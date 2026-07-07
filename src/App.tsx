import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { AuthProvider } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Dashboard from "./pages/Dashboard";
import Feedstock from "./pages/Feedstock";
import FeedstockDetail from "./pages/FeedstockDetail";
import Workflow from "./pages/Workflow";
import CorcCalculator from "./pages/CorcCalculator";
import Assets from "./pages/Assets";
import TestingPlot from "./pages/TestingPlot";
import TreeDetail from "./pages/TreeDetail";
import Users from "./pages/Users";
import AuditTrail from "./pages/AuditTrail";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

// Code-split the routes that pull heavy libraries so they load on demand:
// Reports → xlsx + jspdf, CCTV → hls.js.
const Reports = lazy(() => import("./pages/Reports"));
const Cctv = lazy(() => import("./pages/Cctv"));

const PageFallback = () => (
  <div className="flex items-center gap-2 text-muted-foreground text-sm py-20 justify-center">
    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/feedstock" element={<Feedstock />} />
            <Route path="/feedstock/:id" element={<FeedstockDetail />} />
            <Route path="/workflow" element={<Workflow />} />
            <Route path="/corc-calculator" element={<CorcCalculator />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/cctv" element={<Suspense fallback={<PageFallback />}><Cctv /></Suspense>} />
            <Route path="/testing-plot" element={<TestingPlot />} />
            <Route path="/testing-plot/:id" element={<TreeDetail />} />
            <Route path="/users" element={<Users />} />
            <Route path="/reports" element={<Suspense fallback={<PageFallback />}><Reports /></Suspense>} />
            <Route path="/audit-trail" element={<AuditTrail />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
