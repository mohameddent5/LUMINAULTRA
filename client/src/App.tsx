import { lazy, Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import Studio from "@/pages/studio";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import AppShell from "@/components/AppShell";
import { AuthGate } from "@/components/AuthGate";

/**
 * Pages are split into their own chunks. The home screen no longer has to
 * download the scanner, the simulator and the ONNX model plumbing before a
 * judge sees anything — each workspace loads when it is opened.
 */
const PatientArchive = lazy(() => import("@/pages/patient-archive"));
const Settings = lazy(() => import("@/pages/settings"));
const ClinicalGuidelines = lazy(() => import("@/pages/clinical-guidelines"));
const Validation = lazy(() => import("@/pages/validation"));
const Annotate = lazy(() => import("@/pages/annotate"));

function RouteFallback() {
  return (
    <div className="min-h-[60vh] w-full flex flex-col items-center justify-center gap-3 text-white/60">
      <Loader2 className="w-6 h-6 animate-spin text-accent" aria-hidden="true" />
      <p className="text-sm" role="status">
        Loading workspace…
      </p>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/patient-archive" component={PatientArchive} />
        <Route path="/settings" component={Settings} />
        <Route path="/clinical-guidelines" component={ClinicalGuidelines} />
        <Route path="/validation" component={Validation} />
        <Route path="/annotate" component={Annotate} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function Frame() {
  const [path] = useLocation();
  if (path === "/") return <Studio />;
  return (
    <AppShell>
      <Router />
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthGate>
          <Frame />
        </AuthGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
