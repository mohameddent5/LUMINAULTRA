import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Home, TrendingUp, Users, FileText, Zap } from "lucide-react";

interface DashboardStat {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}

export default function ClinicalDashboard() {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [recentAnalyses, setRecentAnalyses] = useState<any[]>([]);

  useEffect(() => {
    const archive = JSON.parse(localStorage.getItem("patientArchive") || "[]");
    const plans = JSON.parse(localStorage.getItem("treatmentPlans") || "[]");

    setRecentAnalyses(archive.slice(-5).reverse());

    const avgHarmony = archive.length > 0 ? (archive.reduce((sum: number, p: any) => sum + p.harmony, 0) / archive.length).toFixed(0) : "—";

    setStats([
      {
        label: "Total Patients",
        value: archive.length,
        icon: <Users className="w-6 h-6" />,
        color: "from-blue-600 to-blue-400",
      },
      {
        label: "Treatment Plans",
        value: plans.length,
        icon: <FileText className="w-6 h-6" />,
        color: "from-purple-600 to-purple-400",
      },
      {
        label: "Avg. Harmony Score",
        value: `${avgHarmony}/100`,
        icon: <TrendingUp className="w-6 h-6" />,
        color: "from-green-600 to-green-400",
      },
      {
        label: "Analysis Scans",
        value: archive.length,
        icon: <Zap className="w-6 h-6" />,
        color: "from-cyan-600 to-cyan-400",
      },
    ]);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/5">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm">
        <h1 className="font-heading font-bold text-white">Clinical Dashboard</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white hover:bg-white/10">
          <Home className="w-5 h-5" />
        </Button>
      </nav>

      <div className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <div
              key={i}
              className={`bg-gradient-to-br ${stat.color} bg-opacity-10 rounded-xl border border-white/10 p-6 space-y-3 hover:border-white/20 transition-all`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                </div>
                <div className="text-white/60">{stat.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Quick Access */}
          <div className="bg-card/50 rounded-xl border border-white/10 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Quick Access</h2>
            <div className="space-y-2">
              <Button
                onClick={() => navigate("/scanner")}
                className="w-full justify-start bg-primary hover:bg-primary/90"
              >
                📷 Start New Analysis
              </Button>
              <Button
                onClick={() => navigate("/treatment-planner")}
                className="w-full justify-start bg-secondary hover:bg-secondary/90"
              >
                📋 Create Treatment Plan
              </Button>
              <Button
                onClick={() => navigate("/patient-archive")}
                className="w-full justify-start bg-purple-900/60 hover:bg-purple-900/70 text-purple-300"
              >
                📁 View Patient Archive
              </Button>
              <Button
                onClick={() => navigate("/prescription-generator")}
                className="w-full justify-start bg-orange-900/60 hover:bg-orange-900/70 text-orange-300"
              >
                📄 Generate Lab Prescription
              </Button>
              <Button
                onClick={() => navigate("/smile-simulator")}
                className="w-full justify-start bg-cyan-900/60 hover:bg-cyan-900/70 text-cyan-300"
              >
                ✨ Simulate Smile Design
              </Button>
              <Button
                onClick={() => navigate("/patient-comparison")}
                className="w-full justify-start bg-indigo-900/60 hover:bg-indigo-900/70 text-indigo-300"
              >
                🔄 Compare Patients
              </Button>
              <Button
                onClick={() => navigate("/clinical-guidelines")}
                className="w-full justify-start bg-teal-900/60 hover:bg-teal-900/70 text-teal-300"
              >
                📚 Clinical Guidelines
              </Button>
              <Button
                onClick={() => navigate("/settings")}
                className="w-full justify-start bg-gray-700/60 hover:bg-gray-700/70 text-gray-300"
              >
                ⚙️ Settings & Data
              </Button>
            </div>
          </div>

          {/* Clinical Guidelines */}
          <div className="bg-card/50 rounded-xl border border-white/10 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">DSD Clinical Standards</h2>
            <div className="space-y-3 text-xs">
              {[
                { title: "Golden Proportion", spec: "1.618:1:0.618" },
                { title: "W/L Ratio Target", spec: "78% (ideal range 65-80%)" },
                { title: "Gingival Symmetry", spec: ">85% bilateral match" },
                { title: "Smile Convexity", spec: "Smooth arc (>70 score)" },
                { title: "VDO Ratio", spec: "43-45% lower facial height" },
                { title: "Smile Arc", spec: "Follows lower lip contour" },
              ].map((item, i) => (
                <div key={i} className="p-2 bg-white/5 rounded border border-white/10">
                  <p className="font-semibold text-white mb-1">{item.title}</p>
                  <p className="text-muted-foreground">{item.spec}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Analyses */}
        {recentAnalyses.length > 0 && (
          <div className="bg-card/50 rounded-xl border border-white/10 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Recent Patient Analyses</h2>
            <div className="space-y-3">
              {recentAnalyses.map((patient, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                  <div>
                    <p className="font-medium text-white">{patient.patientName}</p>
                    <p className="text-xs text-muted-foreground">{patient.date}</p>
                  </div>
                  <Badge
                    className={
                      patient.harmony >= 85
                        ? "bg-green-900/60 text-green-300"
                        : patient.harmony >= 70
                          ? "bg-yellow-900/60 text-yellow-300"
                          : "bg-red-900/60 text-red-300"
                    }
                  >
                    {patient.harmony}/100
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Info */}
        <div className="text-center space-y-2 py-8 border-t border-white/10">
          <p className="text-xs text-muted-foreground">Lumina Ultra - Clinical DSD Platform</p>
          <p className="text-xs text-muted-foreground">v2.0 Smile Suite Edition</p>
        </div>
      </div>
    </div>
  );
}
