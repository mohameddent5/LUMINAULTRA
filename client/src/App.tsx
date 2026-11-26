import { lazy, Suspense } from "react";
import { Switch, Route } from "wouter";
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
const HomeLanding = lazy(() => import("@/pages/home-landing"));
const Scanner = lazy(() => import("@/pages/scanner"));
const TreatmentPlanner = lazy(() => import("@/pages/treatment-planner"));
const PatientArchive = lazy(() => import("@/pages/patient-archive"));
const PrescriptionGenerator = lazy(() => import("@/pages/prescription-generator"));
const SmileSimulator = lazy(() => import("@/pages/smile-simulator"));
const ClinicalDashboard = lazy(() => import("@/pages/clinical-dashboard"));
const Settings = lazy(() => import("@/pages/settings"));
const ClinicalGuidelines = lazy(() => import("@/pages/clinical-guidelines"));
const Validation = lazy(() => import("@/pages/validation"));
const Model = lazy(() => import("@/pages/model"));
const PatientComparison = lazy(() => import("@/pages/patient-comparison"));
const CareJourney = lazy(() => import("@/pages/care-journey"));
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
        <Route path="/" component={HomeLanding} />
        <Route path="/scanner" component={Scanner} />
        <Route path="/treatment-planner" component={TreatmentPlanner} />
        <Route path="/patient-archive" component={PatientArchive} />
        <Route path="/prescription-generator" component={PrescriptionGenerator} />
        <Route path="/smile-simulator" component={SmileSimulator} />
        <Route path="/clinical-dashboard" component={ClinicalDashboard} />
        <Route path="/settings" component={Settings} />
        <Route path="/clinical-guidelines" component={ClinicalGuidelines} />
        <Route path="/validation" component={Validation} />
        <Route path="/model" component={Model} />
        <Route path="/patient-comparison" component={PatientComparison} />
        <Route path="/care-journey" component={CareJourney} />
        <Route path="/annotate" component={Annotate} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthGate>
          <AppShell>
            <Router />
          </AppShell>
        </AuthGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
