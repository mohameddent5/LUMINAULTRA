import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Home, Trash2, Download, Upload } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CapturedSnapshot {
  id: number;
  date: string;
  time: string;
  image: string;
  analysis?: any;
}

export default function SmileSimulator() {
  const [, navigate] = useLocation();
  const [patients, setPatients] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<CapturedSnapshot[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<CapturedSnapshot | null>(null);
  const [currentState, setCurrentState] = useState({
    wlRatio: 72,
    goldenRatio: 58,
    gingivalSym: 75,
    convexity: 65,
    vdo: 48,
  });

  const [idealState] = useState({
    wlRatio: 78,
    goldenRatio: 62,
    gingivalSym: 90,
    convexity: 75,
    vdo: 45,
  });

  useEffect(() => {
    const archive = JSON.parse(localStorage.getItem("patientArchive") || "[]");
    const saved = JSON.parse(localStorage.getItem("capturedSnapshots") || "[]");
    setPatients(archive);
    setSnapshots(saved);
    if (saved.length > 0) {
      setSelectedSnapshot(saved[saved.length - 1]);
      if (saved[saved.length - 1].analysis) {
        setCurrentState({
          wlRatio: saved[saved.length - 1].analysis.measurements.centralIncisorsWLRatio,
          goldenRatio: saved[saved.length - 1].analysis.measurements.goldenRatioLateral,
          gingivalSym: saved[saved.length - 1].analysis.measurements.gingivalSymmetry,
          convexity: saved[saved.length - 1].analysis.measurements.smileConvexityScore,
          vdo: saved[saved.length - 1].analysis.measurements.verticalDimensionRatio,
        });
      }
    }
  }, []);

  const calculateHarmony = (state: typeof currentState) => {
    const deviations = [
      Math.abs(state.wlRatio - 78) / 78 * 100,
      Math.abs(state.goldenRatio - 62) / 62 * 100,
      Math.abs(state.gingivalSym - 90) / 90 * 100,
      Math.abs(state.convexity - 75) / 75 * 100,
      Math.abs(state.vdo - 45) / 45 * 100,
    ];
    const avgDeviation = deviations.reduce((a, b) => a + b) / deviations.length;
    return Math.max(0, 100 - avgDeviation);
  };

  const currentHarmony = calculateHarmony(currentState);
  const improvements = calculateHarmony(idealState);

  const deleteSnapshot = (id: number) => {
    const updated = snapshots.filter((s) => s.id !== id);
    setSnapshots(updated);
    localStorage.setItem("capturedSnapshots", JSON.stringify(updated));
    if (selectedSnapshot?.id === id) {
      setSelectedSnapshot(updated.length > 0 ? updated[updated.length - 1] : null);
    }
    toast({ title: "Deleted", description: "Snapshot removed" });
  };

  const downloadComparison = () => {
    if (!selectedSnapshot) return;
    
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Draw current state
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, 400, 400);
      ctx.drawImage(img, 0, 0, 400, 400);
      ctx.fillStyle = "rgba(220, 38, 38, 0.6)";
      ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = "white";
      ctx.font = "16px Arial";
      ctx.fillText(`Current: ${currentHarmony.toFixed(0)}/100`, 10, 30);

      // Draw ideal state
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(400, 0, 400, 400);
      ctx.drawImage(img, 400, 0, 400, 400);
      ctx.fillStyle = "rgba(34, 197, 94, 0.6)";
      ctx.fillRect(400, 0, 400, 400);
      ctx.fillStyle = "white";
      ctx.fillText(`Ideal: ${improvements.toFixed(0)}/100`, 410, 30);

      const link = document.createElement("a");
      link.download = `smile-comparison-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast({ title: "Downloaded", description: "Before/After comparison saved" });
    };
    img.src = selectedSnapshot.image;
  };

  const metrics = [
    { label: "W/L Ratio", key: "wlRatio", ideal: 78, unit: "%" },
    { label: "Golden Ratio", key: "goldenRatio", ideal: 62, unit: "%" },
    { label: "Gingival Symmetry", key: "gingivalSym", ideal: 90, unit: "%" },
    { label: "Smile Convexity", key: "convexity", ideal: 75, unit: "" },
    { label: "VDO Ratio", key: "vdo", ideal: 45, unit: "%" },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/5">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm">
        <h1 className="font-heading font-bold text-white">Smile Simulator Pro</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white hover:bg-white/10">
          <Home className="w-5 h-5" />
        </Button>
      </nav>

      <div className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Snapshots Gallery */}
        {snapshots.length > 0 && (
          <div className="bg-card/50 rounded-xl border border-white/10 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Captured Analyses</h3>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {snapshots.map((snap) => (
                <button
                  key={snap.id}
                  onClick={() => setSelectedSnapshot(snap)}
                  className={`relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                    selectedSnapshot?.id === snap.id ? "border-primary" : "border-white/10 hover:border-white/30"
                  }`}
                >
                  <img src={snap.image} alt="snapshot" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Trash2 className="w-4 h-4 text-red-400 cursor-pointer" onClick={(e) => { e.stopPropagation(); deleteSnapshot(snap.id); }} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Comparison */}
        {selectedSnapshot ? (
          <>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Current State - Real Image */}
              <div className="bg-card/50 rounded-xl border border-red-500/30 p-6 space-y-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-white">Current Smile Analysis</h3>
                  <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-white/10">
                    <img src={selectedSnapshot.image} alt="current" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-red-900/40 to-transparent" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge className="bg-red-900/60 text-red-300">Current</Badge>
                    <p className="text-2xl font-bold text-red-300">{currentHarmony.toFixed(0)}</p>
                  </div>
                </div>

                <div className="space-y-2 p-3 bg-white/5 rounded border border-white/10">
                  {metrics.map(({ label, key, ideal, unit }) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-white font-semibold">{currentState[key].toFixed(0)}{unit}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ideal State - Enhanced */}
              <div className="bg-card/50 rounded-xl border border-green-500/30 p-6 space-y-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-white">Ideal Smile Design</h3>
                  <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-white/10">
                    <img src={selectedSnapshot.image} alt="ideal" className="w-full h-full object-cover brightness-110 contrast-125" />
                    <div className="absolute inset-0 bg-gradient-to-t from-green-900/50 to-transparent" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <p className="text-sm font-semibold text-green-300 mb-2">DSD Optimized</p>
                        <p className="text-xs text-green-200">Golden proportions + Symmetry</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge className="bg-green-900/60 text-green-300">Target</Badge>
                    <p className="text-2xl font-bold text-green-300">{improvements.toFixed(0)}</p>
                  </div>
                </div>

                <div className="space-y-2 p-3 bg-white/5 rounded border border-white/10">
                  {metrics.map(({ label, key, ideal, unit }) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-green-300 font-semibold">{ideal}{unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Treatment Sliders */}
            <div className="bg-card/50 rounded-xl border border-white/10 p-6 space-y-6">
              <div>
                <h3 className="font-semibold text-white mb-2">Simulate Treatment Progression</h3>
                <p className="text-xs text-muted-foreground mb-4">Adjust metrics to see smile improvement potential</p>
              </div>

              <div className="space-y-4">
                {metrics.map(({ label, key, ideal, unit }) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-primary font-semibold">{currentState[key].toFixed(0)}{unit}</span>
                    </div>
                    <Slider
                      value={[currentState[key]]}
                      onValueChange={(val) => setCurrentState({ ...currentState, [key]: val[0] })}
                      min={ideal - 20}
                      max={ideal + 20}
                      step={0.5}
                      className="cursor-pointer"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Current</p>
                  <p className={`text-2xl font-bold ${currentHarmony >= 85 ? "text-green-400" : currentHarmony >= 70 ? "text-yellow-400" : "text-red-400"}`}>
                    {currentHarmony.toFixed(0)}
                  </p>
                </div>
                <div className="flex items-center justify-center">
                  <p className="text-lg text-muted-foreground">→</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Target</p>
                  <p className="text-2xl font-bold text-green-400">{improvements.toFixed(0)}</p>
                </div>
              </div>

              <div className="text-xs text-white text-center p-3 bg-cyan-900/20 border border-cyan-500/30 rounded">
                📊 Improvement Potential: <span className="font-bold text-cyan-300">+{(improvements - currentHarmony).toFixed(0)} points</span>
              </div>

              <Button onClick={downloadComparison} className="w-full bg-primary hover:bg-primary/90">
                <Download className="w-4 h-4 mr-2" />
                Download Before/After Comparison
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-20 space-y-4">
            <Upload className="w-12 h-12 text-muted-foreground mx-auto opacity-50" />
            <p className="text-muted-foreground">No captured snapshots yet.</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Use the AR Scanner to capture a smile analysis, then return here to simulate treatment outcomes.
            </p>
            <Button onClick={() => navigate("/scanner")} className="bg-primary hover:bg-primary/90 mt-4">
              Open AR Scanner
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
