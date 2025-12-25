import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Home, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function TreatmentPlanner() {
  const [, navigate] = useLocation();
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [measurements, setMeasurements] = useState({
    wlRatio: 78,
    goldenRatio: 62,
    gingivalSym: 85,
    smileConvexity: 70,
    vdoRatio: 45,
  });

  useEffect(() => {
    const archive = JSON.parse(localStorage.getItem("patientArchive") || "[]");
    setPatients(archive);
    if (archive.length > 0) {
      setSelectedPatient(archive[0]);
      setMeasurements({
        wlRatio: archive[0].measurements?.wlRatio || 78,
        goldenRatio: archive[0].measurements?.goldenRatio || 62,
        gingivalSym: archive[0].measurements?.gingivalSym || 85,
        smileConvexity: archive[0].measurements?.smileConvexity || 70,
        vdoRatio: archive[0].measurements?.vdoRatio || 45,
      });
    }
  }, []);

  const calculateHarmony = () => {
    const deviations = [
      Math.abs(measurements.wlRatio - 78) / 78 * 100,
      Math.abs(measurements.goldenRatio - 62) / 62 * 100,
      Math.abs(measurements.gingivalSym - 90) / 90 * 100,
      Math.abs(measurements.smileConvexity - 75) / 75 * 100,
      Math.abs(measurements.vdoRatio - 45) / 45 * 100,
    ];
    const avgDeviation = deviations.reduce((a, b) => a + b) / deviations.length;
    return Math.max(0, 100 - avgDeviation);
  };

  const harmony = calculateHarmony();

  const savePlan = () => {
    const plans = JSON.parse(localStorage.getItem("treatmentPlans") || "[]");
    plans.push({
      id: Date.now(),
      date: new Date().toLocaleDateString(),
      measurements,
      harmony: harmony.toFixed(0),
    });
    localStorage.setItem("treatmentPlans", JSON.stringify(plans));
    toast({
      title: "Treatment Plan Saved",
      description: `Harmony Score: ${harmony.toFixed(0)}/100`,
    });
  };

  const treatmentSpecs = [
    ...(measurements.wlRatio < 75 ? ["⚠ Central incisor width expansion needed"] : []),
    ...(measurements.goldenRatio < 60 ? ["⚠ Lateral incisor width adjustment required"] : []),
    ...(measurements.gingivalSym < 80 ? ["⚠ Periodontal contouring for symmetry"] : []),
    ...(measurements.smileConvexity < 60 ? ["⚠ Smile arc orthodontic correction"] : []),
    ...(measurements.vdoRatio > 48 ? ["⚠ Excessive vertical dimension - posterior support evaluation"] : []),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/5">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm">
        <h1 className="font-heading font-bold text-white">Treatment Planner</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white hover:bg-white/10">
          <Home className="w-5 h-5" />
        </Button>
      </nav>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {patients.length > 0 ? (
          <>
            <div className="bg-card/50 rounded-xl border border-white/10 p-4 space-y-2">
              <label className="text-sm text-muted-foreground block">Select Patient</label>
              <select
                value={selectedPatient?.id || ""}
                onChange={(e) => {
                  const patient = patients.find((p) => p.id === parseInt(e.target.value));
                  if (patient) {
                    setSelectedPatient(patient);
                    setMeasurements({
                      wlRatio: patient.measurements?.wlRatio || 78,
                      goldenRatio: patient.measurements?.goldenRatio || 62,
                      gingivalSym: patient.measurements?.gingivalSym || 85,
                      smileConvexity: patient.measurements?.smileConvexity || 70,
                      vdoRatio: patient.measurements?.vdoRatio || 45,
                    });
                  }
                }}
                className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white outline-none focus:border-primary/50"
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id} className="bg-background text-white">
                    {p.patientName} - {p.date}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-card/50 rounded-xl border border-white/10 p-6 space-y-6">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Treatment Plan for {selectedPatient?.patientName}</h2>
                <p className="text-sm text-muted-foreground">Adjust clinical parameters to plan ideal smile outcome</p>
              </div>

          <div className="space-y-6">
            {[
              { label: "W/L Ratio (ideal 78%)", key: "wlRatio", min: 70, max: 85 },
              { label: "Golden Ratio (ideal 62%)", key: "goldenRatio", min: 55, max: 70 },
              { label: "Gingival Symmetry (ideal 90%)", key: "gingivalSym", min: 70, max: 100 },
              { label: "Smile Convexity (ideal 75)", key: "smileConvexity", min: 50, max: 100 },
              { label: "VDO Ratio (ideal 45%)", key: "vdoRatio", min: 40, max: 50 },
            ].map(({ label, key, min, max }) => (
              <div key={key} className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium text-white">{label}</label>
                  <span className="text-sm text-primary font-semibold">{measurements[key as keyof typeof measurements].toFixed(1)}</span>
                </div>
                <Slider
                  value={[measurements[key as keyof typeof measurements]]}
                  onValueChange={(val) => setMeasurements({ ...measurements, [key]: val[0] })}
                  min={min}
                  max={max}
                  step={0.5}
                  className="cursor-pointer"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 bg-white/5 rounded-lg border border-white/10">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Smile Harmony Score</p>
              <div className={`text-3xl font-bold ${harmony >= 85 ? "text-green-400" : harmony >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                {harmony.toFixed(0)}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Classification</p>
              <p className="text-sm text-white font-semibold">
                {harmony >= 85 ? "Excellent" : harmony >= 70 ? "Acceptable" : "Needs Attention"}
              </p>
            </div>
          </div>

          {treatmentSpecs.length > 0 && (
            <div className="p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg space-y-2">
              <p className="text-xs font-semibold text-orange-300">Treatment Specifications</p>
              {treatmentSpecs.map((spec, i) => (
                <p key={i} className="text-xs text-orange-200">{spec}</p>
              ))}
            </div>
          )}

          <Button onClick={savePlan} className="w-full bg-primary hover:bg-primary/90">
            <Save className="w-4 h-4 mr-2" />
            Save Treatment Plan
          </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-20 space-y-4 text-muted-foreground">
            <p>No patients to plan. Create a patient analysis first.</p>
            <Button onClick={() => navigate("/scanner")} className="bg-primary hover:bg-primary/90 mt-4">
              Open AR Scanner
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
