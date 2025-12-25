import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, Copy, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function PrescriptionGenerator() {
  const [, navigate] = useLocation();
  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>([
    "Central Incisor Width Adjustment",
    "Gingival Contouring",
    "Smile Arc Correction",
  ]);

  useEffect(() => {
    const archive = JSON.parse(localStorage.getItem("patientArchive") || "[]");
    setPatients(archive);
    if (archive.length > 0) setSelectedPatient(archive[0]);
  }, []);

  const allSpecs = [
    "Central Incisor Width Adjustment",
    "Lateral Incisor Width Modification",
    "Canine Positioning",
    "Gingival Contouring",
    "Smile Arc Correction",
    "Buccal Corridor Expansion",
    "Veneer Preparation",
    "Implant Positioning",
    "Periodontal Therapy",
    "Orthodontic Alignment",
  ];

  const prescription = `DIGITAL SMILE DESIGN LAB PRESCRIPTION

Patient: ${selectedPatient?.patientName || "No Patient Selected"}
Doctor: [Your Name]
Date: ${new Date().toLocaleDateString()}
Age: [Patient Age]
Gender: [Patient Gender]

CLINICAL SPECIFICATIONS:
${selectedSpecs.map((spec) => `• ${spec}`).join("\n")}

DESIGN PARAMETERS:
• Central Incisor W/L Ratio: 78% (target)
• Golden Proportion: 1.618:1:0.618
• Gingival Symmetry: >85%
• Smile Convexity: >70
• VDO Ratio: 43-45%
• Intercanine Width: Arch matched

MATERIAL RECOMMENDATIONS:
• Restoration Type: Ceramic Veneers / All-Ceramic Crowns
• Shade Selection: VITA Shade Guide / Spectrophotometer
• Contour: Replicate natural emergence profile
• Surface Texture: Match natural tooth anatomy

QUALITY ASSURANCE:
✓ All measurements within DSD guidelines
✓ Clinical photography required at delivery
✓ Try-in approval mandatory before cementation
✓ Patient satisfaction sign-off

Lab Notes:
Create restorations that achieve >85/100 harmony score based on digital smile design protocol.

Approved by: [Your Name]
License: [License Number]
Contact: [Contact Information]`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(prescription);
    toast({ title: "Copied", description: "Prescription copied to clipboard" });
  };

  const downloadPrescription = () => {
    const blob = new Blob([prescription], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DSD_Prescription_${selectedPatient?.patientName || "Patient"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded", description: "Prescription saved to device" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/5">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm">
        <h1 className="font-heading font-bold text-white">Prescription Generator</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white hover:bg-white/10">
          <Home className="w-5 h-5" />
        </Button>
      </nav>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {patients.length > 0 ? (
          <>
            <div className="bg-card/50 rounded-xl border border-white/10 p-4 space-y-2">
              <label className="text-sm text-muted-foreground block">Select Patient</label>
              <select
                value={selectedPatient?.id || ""}
                onChange={(e) => {
                  const patient = patients.find((p) => p.id === parseInt(e.target.value));
                  if (patient) setSelectedPatient(patient);
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

            <div className="bg-card/50 rounded-xl border border-white/10 p-6 space-y-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-3">Clinical Specifications</label>
                <div className="grid grid-cols-2 gap-2 p-3 bg-white/5 rounded border border-white/10">
                  {allSpecs.map((spec) => (
                    <button
                      key={spec}
                      onClick={() =>
                        setSelectedSpecs(
                          selectedSpecs.includes(spec)
                            ? selectedSpecs.filter((s) => s !== spec)
                            : [...selectedSpecs, spec]
                        )
                      }
                      className={`p-2 rounded text-xs font-medium transition-all ${
                        selectedSpecs.includes(spec)
                          ? "bg-primary text-primary-foreground"
                          : "bg-white/10 text-white/70 hover:bg-white/20"
                      }`}
                    >
                      {spec}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-black/40 rounded-xl border border-white/10 p-6 font-mono text-xs text-white/80 space-y-2 max-h-96 overflow-y-auto whitespace-pre-wrap">
                {prescription}
              </div>

              <div className="flex gap-3">
                <Button onClick={copyToClipboard} className="flex-1 bg-secondary hover:bg-secondary/90">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Prescription
                </Button>
                <Button onClick={downloadPrescription} className="flex-1 bg-primary hover:bg-primary/90">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-20 space-y-4 text-muted-foreground">
            <p>No patients to prescribe. Create a patient analysis first.</p>
            <Button onClick={() => navigate("/scanner")} className="bg-primary hover:bg-primary/90 mt-4">
              Open AR Scanner
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
