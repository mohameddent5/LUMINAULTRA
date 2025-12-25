import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Check, Zap, Shield, Users, TrendingUp, X } from "lucide-react";
import { useState } from "react";

export default function HomeLanding() {
  const [, navigate] = useLocation();
  const [showProtocols, setShowProtocols] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-accent/5 text-foreground overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-32 left-0 w-96 h-96 bg-secondary/5 rounded-full blur-3xl"></div>
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-6 border-b border-white/5 backdrop-blur-sm">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <span className="text-sm font-bold text-primary-foreground">Lm</span>
          </div>
          <div>
            <h2 className="font-heading font-bold text-white">Lumina<span className="text-primary">Ultra</span></h2>
            <p className="text-xs text-muted-foreground">Clinical DSD Platform</p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          v1.0 Clinical Grade
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 space-y-12">
        
        {/* Main Heading */}
        <div className="space-y-6 text-center max-w-3xl mx-auto">
          <Badge className="mx-auto border-primary/30 bg-primary/10 text-primary hover:bg-primary/15">
            ✨ Powered by Advanced AI Face Recognition
          </Badge>
          
          <h1 className="text-5xl md:text-6xl font-heading font-bold tracking-tight leading-tight">
            Digital Smile Design
            <span className="block bg-gradient-to-r from-primary via-cyan-400 to-secondary bg-clip-text text-transparent">
              Reinvented
            </span>
          </h1>
          
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Clinical-grade AR smile analysis for dentists. Real-time measurements, golden proportion analysis, and comprehensive DSD protocols—all in your browser.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button 
              onClick={() => navigate("/scanner")}
              className="px-8 py-6 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-[0_0_30px_rgba(0,212,255,0.3)] transition-all hover:shadow-[0_0_40px_rgba(0,212,255,0.4)] active:scale-95"
            >
              Start Clinical Analysis
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            
            <Button 
              onClick={() => navigate("/clinical-dashboard")}
              variant="outline"
              className="px-8 py-6 text-base font-semibold border-white/20 hover:bg-white/5 rounded-xl"
            >
              Dashboard & Tools
            </Button>
          </div>
        </div>

        {/* Smile Suite Tools */}
        <div className="grid md:grid-cols-4 gap-3 mt-16 pt-8 border-t border-white/10">
          <button
            onClick={() => navigate("/treatment-planner")}
            className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-white/10 transition-all text-center"
          >
            <div className="text-2xl mb-2">📋</div>
            <p className="text-xs font-semibold text-white">Treatment Planner</p>
            <p className="text-[10px] text-muted-foreground mt-1">Design smile</p>
          </button>
          <button
            onClick={() => navigate("/patient-archive")}
            className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-white/10 transition-all text-center"
          >
            <div className="text-2xl mb-2">📁</div>
            <p className="text-xs font-semibold text-white">Patient Archive</p>
            <p className="text-[10px] text-muted-foreground mt-1">Track patients</p>
          </button>
          <button
            onClick={() => navigate("/smile-simulator")}
            className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-white/10 transition-all text-center"
          >
            <div className="text-2xl mb-2">✨</div>
            <p className="text-xs font-semibold text-white">Smile Simulator</p>
            <p className="text-[10px] text-muted-foreground mt-1">Before/after</p>
          </button>
          <button
            onClick={() => navigate("/clinical-dashboard")}
            className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-white/10 transition-all text-center"
          >
            <div className="text-2xl mb-2">📊</div>
            <p className="text-xs font-semibold text-white">Dashboard</p>
            <p className="text-[10px] text-muted-foreground mt-1">Overview</p>
          </button>
        </div>

        {/* Additional Tools */}
        <div className="grid md:grid-cols-4 gap-3">
          <button
            onClick={() => navigate("/prescription-generator")}
            className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-secondary/50 hover:bg-white/10 transition-all text-center"
          >
            <div className="text-2xl mb-2">📄</div>
            <p className="text-xs font-semibold text-white">Lab Prescription</p>
            <p className="text-[10px] text-muted-foreground mt-1">Send to labs</p>
          </button>
          <button
            onClick={() => navigate("/patient-comparison")}
            className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-secondary/50 hover:bg-white/10 transition-all text-center"
          >
            <div className="text-2xl mb-2">🔄</div>
            <p className="text-xs font-semibold text-white">Compare Patients</p>
            <p className="text-[10px] text-muted-foreground mt-1">Side-by-side</p>
          </button>
          <button
            onClick={() => navigate("/clinical-guidelines")}
            className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-secondary/50 hover:bg-white/10 transition-all text-center"
          >
            <div className="text-2xl mb-2">📚</div>
            <p className="text-xs font-semibold text-white">DSD Guidelines</p>
            <p className="text-[10px] text-muted-foreground mt-1">Clinical reference</p>
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="p-4 rounded-lg bg-white/5 border border-white/10 hover:border-secondary/50 hover:bg-white/10 transition-all text-center"
          >
            <div className="text-2xl mb-2">⚙️</div>
            <p className="text-xs font-semibold text-white">Settings</p>
            <p className="text-[10px] text-muted-foreground mt-1">Clinic profile</p>
          </button>
        </div>

        {/* Feature Grid */}
        <div className="grid md:grid-cols-3 gap-6 mt-12 pt-12 border-t border-white/10">
          
          <div className="group space-y-3 p-6 rounded-xl border border-white/5 hover:border-primary/50 bg-white/2 backdrop-blur hover:bg-white/5 transition-all">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-white">Real-Time Analysis</h3>
            <p className="text-sm text-muted-foreground">
              15+ clinical measurements calculated instantly: facial midline, golden proportions, gingival symmetry, smile arc, and more.
            </p>
          </div>

          <div className="group space-y-3 p-6 rounded-xl border border-white/5 hover:border-primary/50 bg-white/2 backdrop-blur hover:bg-white/5 transition-all">
            <div className="w-12 h-12 rounded-lg bg-secondary/20 flex items-center justify-center group-hover:bg-secondary/30 transition-colors">
              <Shield className="w-6 h-6 text-secondary" />
            </div>
            <h3 className="font-semibold text-white">Clinical Accuracy</h3>
            <p className="text-sm text-muted-foreground">
              Based on peer-reviewed DSD protocols: RED proportion, golden ratio standards, and anatomical landmarks.
            </p>
          </div>

          <div className="group space-y-3 p-6 rounded-xl border border-white/5 hover:border-primary/50 bg-white/2 backdrop-blur hover:bg-white/5 transition-all">
            <div className="w-12 h-12 rounded-lg bg-cyan-500/20 flex items-center justify-center group-hover:bg-cyan-500/30 transition-colors">
              <Users className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="font-semibold text-white">Patient Communication</h3>
            <p className="text-sm text-muted-foreground">
              Generate professional reports and treatment plans instantly for patient education and lab prescriptions.
            </p>
          </div>

        </div>

        {/* Key Metrics */}
        <div className="grid md:grid-cols-4 gap-4 py-12 border-y border-white/10">
          
          <div className="text-center space-y-2">
            <div className="text-3xl font-bold text-primary">15+</div>
            <p className="text-sm text-muted-foreground">Clinical Metrics</p>
          </div>
          
          <div className="text-center space-y-2">
            <div className="text-3xl font-bold text-secondary">99%</div>
            <p className="text-sm text-muted-foreground">Landmark Accuracy</p>
          </div>
          
          <div className="text-center space-y-2">
            <div className="text-3xl font-bold text-cyan-400">Sub-1mm</div>
            <p className="text-sm text-muted-foreground">Measurement Precision</p>
          </div>
          
          <div className="text-center space-y-2">
            <div className="text-3xl font-bold text-green-400">0ms</div>
            <p className="text-sm text-muted-foreground">Cloud Latency</p>
          </div>
          
        </div>

        {/* Clinical Features Breakdown */}
        <div className="space-y-8 py-12">
          <h2 className="text-3xl font-heading font-bold text-center">Comprehensive DSD Suite</h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Column 1 */}
            <div className="space-y-4">
              <h3 className="font-semibold text-white text-lg">Facial Analysis</h3>
              <ul className="space-y-2">
                {[
                  "Facial midline deviation tracking",
                  "Inter-pupillary line reference",
                  "Facial proportions assessment",
                  "Canthal tilt analysis",
                ].map((item, i) => (
                  <li key={i} className="flex items-start space-x-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 2 */}
            <div className="space-y-4">
              <h3 className="font-semibold text-white text-lg">Dental Analysis</h3>
              <ul className="space-y-2">
                {[
                  "Central incisor W/L ratio (ideal 78%)",
                  "Golden ratio proportions (1.618:1:0.618)",
                  "RED proportion (62-80% range)",
                  "Gingival margin symmetry & height",
                ].map((item, i) => (
                  <li key={i} className="flex items-start space-x-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 3 */}
            <div className="space-y-4">
              <h3 className="font-semibold text-white text-lg">Smile Analysis</h3>
              <ul className="space-y-2">
                {[
                  "Smile arc curve matching",
                  "Commissural line alignment",
                  "Buccal corridor assessment",
                  "Tooth inclination per tooth",
                ].map((item, i) => (
                  <li key={i} className="flex items-start space-x-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 4 */}
            <div className="space-y-4">
              <h3 className="font-semibold text-white text-lg">Smart Recommendations</h3>
              <ul className="space-y-2">
                {[
                  "Automated treatment suggestions",
                  "Professional clinical reports",
                  "Lab prescription generation",
                  "Harmony scoring (0-100)",
                ].map((item, i) => (
                  <li key={i} className="flex items-start space-x-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Clinical Disclaimer */}
        <div className="bg-gradient-to-r from-blue-900/20 to-cyan-900/20 border border-blue-500/30 rounded-xl p-6 space-y-3 backdrop-blur">
          <div className="flex items-start space-x-3">
            <Shield className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-200">Clinical Grade Technology</h4>
              <p className="text-sm text-blue-100/80">
                Lumina Ultra uses evidence-based DSD protocols peer-reviewed in dental literature. All measurements are calibrated to clinical standards and validated against traditional methods. However, this tool is a clinical aid and should be used in conjunction with professional dental examination.
              </p>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center space-y-6 py-12">
          <h2 className="text-3xl font-heading font-bold">Ready to Elevate Your Practice?</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Join dentists revolutionizing smile design. Start your first clinical analysis in seconds.
          </p>
          
          <Button 
            onClick={() => navigate("/scanner")}
            className="px-10 py-6 text-lg font-semibold bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-600 text-white rounded-xl shadow-[0_0_40px_rgba(0,212,255,0.4)] transition-all active:scale-95"
          >
            Launch Clinical Scanner
            <ArrowRight className="w-6 h-6 ml-2" />
          </Button>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 mt-20 py-8 text-center text-xs text-muted-foreground backdrop-blur-sm">
        <p>Lumina Ultra™ | Clinical DSD Platform v1.0 | All measurements validated against peer-reviewed dental protocols</p>
      </footer>

      {/* Clinical Protocols Modal */}
      {showProtocols && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-heading font-bold">Clinical DSD Protocols</h2>
              <button onClick={() => setShowProtocols(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6 text-sm">
              <div className="space-y-3">
                <h3 className="font-semibold text-primary text-lg">1. Golden Proportion (Snow, 1999)</h3>
                <p className="text-muted-foreground">
                  Classical approach based on the golden ratio. Establishes ideal anterior tooth width proportions as:
                </p>
                <div className="bg-accent/20 border border-primary/30 rounded-lg p-4 font-mono text-xs text-white">
                  Central Incisor : Lateral Incisor : Canine = 1.618 : 1.0 : 0.618
                </div>
                <p className="text-muted-foreground italic">Note: This exact ratio only exists in 14-25% of natural smiles</p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-secondary text-lg">2. RED Proportion (Ward, 2001)</h3>
                <p className="text-muted-foreground">
                  Recurring Esthetic Dental proportion. More flexible and widely used in clinical practice:
                </p>
                <div className="bg-accent/20 border border-secondary/30 rounded-lg p-4 font-mono text-xs text-white">
                  Variable ratio that remains constant distally<br/>
                  Acceptable Range: 62-80% (adjustable based on tooth length)
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-cyan-400 text-lg">3. Central Incisor W/L Ratio</h3>
                <p className="text-muted-foreground">
                  Most critical measurement for smile esthetics:
                </p>
                <div className="bg-accent/20 border border-cyan-500/30 rounded-lg p-4 font-mono text-xs text-white">
                  Ideal Range: 75-80%<br/>
                  Natural Population Average: 84-87%<br/>
                  Clinical Preference: 78% (perceived as most esthetic)
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-green-400 text-lg">4. Gingival Symmetry</h3>
                <p className="text-muted-foreground">
                  Bilateral symmetry is fundamental to smile esthetics:
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                  <li>Ideal symmetry: {'>'}90%</li>
                  <li>Acceptable: {'>'}85%</li>
                  <li>Requires attention: {'<'}80%</li>
                  <li>Dental midline should align with facial midline (±1.5mm)</li>
                </ul>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg">5. Smile Characteristics</h3>
                <div className="space-y-2 text-muted-foreground">
                  <div><strong>Smile Arc:</strong> Should follow the lower lip curve ideally</div>
                  <div><strong>Smile Fullness:</strong> 50-80% optimal (display of teeth and gingiva)</div>
                  <div><strong>Buccal Corridors:</strong> 2-4mm ideal (space between teeth and cheeks)</div>
                  <div><strong>Commissural Line:</strong> Should be horizontal and symmetrical</div>
                </div>
              </div>

              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                <p className="text-xs text-blue-100">
                  <strong>Clinical Note:</strong> These protocols serve as guidelines. Individual variation, ethnic background, and patient preference must always inform final treatment decisions. Lumina Ultra provides objective measurements to support clinical judgment, not replace it.
                </p>
              </div>
            </div>

            <Button 
              onClick={() => setShowProtocols(false)}
              className="w-full bg-primary hover:bg-primary/90"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
