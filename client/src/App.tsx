import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomeLanding from "@/pages/home-landing";
import Scanner from "@/pages/scanner";
import TreatmentPlanner from "@/pages/treatment-planner";
import PatientArchive from "@/pages/patient-archive";
import PrescriptionGenerator from "@/pages/prescription-generator";
import SmileSimulator from "@/pages/smile-simulator";
import ClinicalDashboard from "@/pages/clinical-dashboard";
import Settings from "@/pages/settings";
import ClinicalGuidelines from "@/pages/clinical-guidelines";
import PatientComparison from "@/pages/patient-comparison";

function Router() {
  return (
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
      <Route path="/patient-comparison" component={PatientComparison} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
