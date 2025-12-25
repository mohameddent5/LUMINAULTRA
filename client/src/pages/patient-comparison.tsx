import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Home } from "lucide-react";

interface PatientAnalysis {
  id: number;
  date: string;
  patientName: string;
  harmony: number;
  measurements: Record<string, number>;
  notes: string;
}

export default function PatientComparison() {
  const [, navigate] = useLocation();
  const [patients, setPatients] = useState<PatientAnalysis[]>([]);
  const [selected, setSelected] = useState<[PatientAnalysis | null, PatientAnalysis | null]>([null, null]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("patientArchive") || "[]");
    setPatients(saved);
  }, []);

  const selectPatient = (patient: PatientAnalysis, index: 0 | 1) => {
    const newSelected = [...selected] as [PatientAnalysis | null, PatientAnalysis | null];
    newSelected[index] = patient;
    setSelected(newSelected);
  };

  const metrics = ["centralIncisorsWLRatio", "goldenRatioLateral", "gingivalSymmetry", "smileConvexityScore", "verticalDimensionRatio"];

  const metricLabels: Record<string, string> = {
    centralIncisorsWLRatio: "W/L Ratio",
    goldenRatioLateral: "Golden Ratio",
    gingivalSymmetry: "Gingival Sym",
    smileConvexityScore: "Convexity",
    verticalDimensionRatio: "VDO Ratio",
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/5">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm">
        <h1 className="font-heading font-bold text-white">Patient Comparison</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white hover:bg-white/10">
          <Home className="w-5 h-5" />
        </Button>
      </nav>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {patients.length > 0 ? (
          <>
            <div className="grid md:grid-cols-2 gap-6">
              {[0, 1].map((idx) => (
                <div key={idx} className="bg-card/50 rounded-xl border border-white/10 p-4 space-y-3">
                  <p className="text-sm font-semibold text-white">Patient {idx === 0 ? "1" : "2"}</p>
                  {selected[idx] && (
                    <div className="p-3 bg-white/5 rounded border border-white/10">
                      <p className="font-medium text-white">{selected[idx]?.patientName}</p>
                      <p className="text-xs text-muted-foreground mb-2">{selected[idx]?.date}</p>
                      <Badge className={selected[idx]!.harmony >= 85 ? "bg-green-900/60 text-green-300" : "bg-yellow-900/60 text-yellow-300"}>
                        {selected[idx]?.harmony}/100
                      </Badge>
                    </div>
                  )}
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {patients.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => selectPatient(p, idx as 0 | 1)}
                        className={`w-full text-left p-2 rounded border transition-all ${
                          selected[idx]?.id === p.id ? "border-primary bg-primary/20" : "border-white/10 hover:border-white/30 hover:bg-white/5"
                        }`}
                      >
                        <p className="text-xs font-medium text-white">{p.patientName}</p>
                        <p className="text-[10px] text-muted-foreground">{p.date} • {p.harmony}/100</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selected[0] && selected[1] && (
              <div className="bg-card/50 rounded-xl border border-white/10 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-white">Measurement Comparison</h2>

                <div className="space-y-3">
                  {metrics.map((metric) => {
                    const v1 = selected[0]!.measurements[metric] || 0;
                    const v2 = selected[1]!.measurements[metric] || 0;
                    const diff = v2 - v1;
                    const isImprovement = diff > 0;

                    return (
                      <div key={metric} className="p-3 bg-white/5 rounded border border-white/10">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-white">{metricLabels[metric]}</p>
                          <span className={`text-sm font-bold ${isImprovement ? "text-green-400" : "text-red-400"}`}>
                            {isImprovement ? "+" : ""}{diff.toFixed(1)}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="text-left">
                            <p className="text-muted-foreground">Patient 1</p>
                            <p className="text-white font-semibold">{v1.toFixed(1)}</p>
                          </div>
                          <div className="text-center flex items-center justify-center">
                            <p className="text-muted-foreground">→</p>
                          </div>
                          <div className="text-right">
                            <p className="text-muted-foreground">Patient 2</p>
                            <p className="text-white font-semibold">{v2.toFixed(1)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 bg-white/5 rounded border border-white/10 grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Patient 1</p>
                    <p className="text-2xl font-bold text-yellow-400">{selected[0]!.harmony}</p>
                  </div>
                  <div className="flex items-center justify-center">
                    <p className="text-lg text-muted-foreground">vs</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Patient 2</p>
                    <p className="text-2xl font-bold text-green-400">{selected[1]!.harmony}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <p>No patients in archive. Add patients to compare.</p>
            <Button onClick={() => navigate("/patient-archive")} className="mt-4 bg-primary hover:bg-primary/90">
              Go to Patient Archive
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
