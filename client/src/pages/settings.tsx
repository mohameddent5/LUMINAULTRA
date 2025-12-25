import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home, Download, Upload, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ClinicSettings {
  clinicName: string;
  doctorName: string;
  licenseNumber: string;
  contactInfo: string;
  theme: "dark" | "light";
}

export default function Settings() {
  const [, navigate] = useLocation();
  const [settings, setSettings] = useState<ClinicSettings>({
    clinicName: "Dental Clinic",
    doctorName: "Dr. Smith",
    licenseNumber: "DDS-12345",
    contactInfo: "info@clinic.com",
    theme: "dark",
  });

  useEffect(() => {
    const saved = localStorage.getItem("clinicSettings");
    if (saved) setSettings(JSON.parse(saved));
  }, []);

  const saveSettings = () => {
    localStorage.setItem("clinicSettings", JSON.stringify(settings));
    toast({ title: "Saved", description: "Clinic settings updated" });
  };

  const exportData = () => {
    const data = {
      settings,
      patients: JSON.parse(localStorage.getItem("patientArchive") || "[]"),
      snapshots: JSON.parse(localStorage.getItem("capturedSnapshots") || "[]"),
      plans: JSON.parse(localStorage.getItem("treatmentPlans") || "[]"),
      timestamp: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lumina-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "All data backed up successfully" });
  };

  const importData = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev: any) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.settings) localStorage.setItem("clinicSettings", JSON.stringify(data.settings));
          if (data.patients) localStorage.setItem("patientArchive", JSON.stringify(data.patients));
          if (data.snapshots) localStorage.setItem("capturedSnapshots", JSON.stringify(data.snapshots));
          if (data.plans) localStorage.setItem("treatmentPlans", JSON.stringify(data.plans));
          setSettings(data.settings || settings);
          toast({ title: "Imported", description: "Data restored from backup" });
        } catch (err) {
          toast({ title: "Error", description: "Invalid backup file", variant: "destructive" });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const clearAllData = () => {
    if (confirm("Are you sure? This will delete all patient data, snapshots, and plans.")) {
      localStorage.removeItem("patientArchive");
      localStorage.removeItem("capturedSnapshots");
      localStorage.removeItem("treatmentPlans");
      toast({ title: "Cleared", description: "All patient data deleted" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/5">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm">
        <h1 className="font-heading font-bold text-white">Settings</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white hover:bg-white/10">
          <Home className="w-5 h-5" />
        </Button>
      </nav>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Clinic Profile */}
        <div className="bg-card/50 rounded-xl border border-white/10 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Clinic Profile</h2>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Clinic Name</label>
            <input
              value={settings.clinicName}
              onChange={(e) => setSettings({ ...settings, clinicName: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder:text-white/50 outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Doctor Name</label>
            <input
              value={settings.doctorName}
              onChange={(e) => setSettings({ ...settings, doctorName: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder:text-white/50 outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">License Number</label>
            <input
              value={settings.licenseNumber}
              onChange={(e) => setSettings({ ...settings, licenseNumber: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder:text-white/50 outline-none focus:border-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-2">Contact Information</label>
            <input
              value={settings.contactInfo}
              onChange={(e) => setSettings({ ...settings, contactInfo: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-white placeholder:text-white/50 outline-none focus:border-primary/50"
            />
          </div>

          <Button onClick={saveSettings} className="w-full bg-primary hover:bg-primary/90">
            Save Clinic Profile
          </Button>
        </div>

        {/* Data Management */}
        <div className="bg-card/50 rounded-xl border border-white/10 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">Data Management</h2>

          <Button onClick={exportData} className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/90">
            <Download className="w-4 h-4" />
            Export All Data (Backup)
          </Button>

          <Button onClick={importData} className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/90">
            <Upload className="w-4 h-4" />
            Import from Backup
          </Button>

          <Button onClick={clearAllData} className="w-full flex items-center justify-center gap-2 bg-red-900/60 hover:bg-red-900/70 text-red-300">
            <Trash2 className="w-4 h-4" />
            Clear All Patient Data
          </Button>
        </div>

        {/* Info */}
        <div className="text-center space-y-2 p-4 bg-white/5 rounded border border-white/10">
          <p className="text-xs text-muted-foreground">Lumina Ultra Pro</p>
          <p className="text-xs text-muted-foreground">Clinical DSD Platform v2.0</p>
        </div>
      </div>
    </div>
  );
}
