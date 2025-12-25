import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function ClinicalGuidelines() {
  const [, navigate] = useLocation();

  const guidelines = [
    {
      category: "Golden Proportion",
      standard: "1.618:1:0.618",
      description: "Ideal ratio of central:lateral:canine incisor widths",
      clinicalUse: "Design anterior esthetic dentistry restorations",
    },
    {
      category: "W/L Ratio (Central Incisor)",
      standard: "78% (Range: 65-80%)",
      description: "Width-to-length proportion of central incisors",
      clinicalUse: "Assess tooth proportions; guide restoration sizing",
    },
    {
      category: "Gingival Symmetry",
      standard: ">85% bilateral match",
      description: "Bilateral symmetry of gingival margins",
      clinicalUse: "Identify asymmetric gingival display; plan contouring",
    },
    {
      category: "Smile Arc",
      standard: "Follows lower lip contour",
      description: "Relationship between incisor edges and lower lip",
      clinicalUse: "Assess smile esthetics; determine correction needs",
    },
    {
      category: "Smile Convexity",
      standard: "Smooth arc (>70 score)",
      description: "Smoothness of smile line curvature",
      clinicalUse: "Evaluate smile line quality; plan smile expansion",
    },
    {
      category: "Vertical Dimension of Occlusion",
      standard: "43-45% lower facial height",
      description: "Proportion of lower face height to total facial height",
      clinicalUse: "Assess vertical dimension; guide orthognathic planning",
    },
    {
      category: "Buccal Corridors",
      standard: "2-4mm optimal",
      description: "Space between canine cusp and mouth corner",
      clinicalUse: "Guide smile expansion via implants or orthodontics",
    },
    {
      category: "Intercanine Width",
      standard: "≈35-40mm",
      description: "Distance between canine tips",
      clinicalUse: "Plan arch width; guide implant positioning",
    },
  ];

  const treatments = [
    {
      finding: "Gingival Asymmetry <80%",
      treatments: ["Periodontal contouring", "Osseous contouring", "Gingivectomy", "Gingival graft"],
    },
    {
      finding: "Central Incisor W/L <70%",
      treatments: ["Veneers/crowns", "Composite restoration", "Orthodontic elongation", "Crown lengthening"],
    },
    {
      finding: "Excessive Gum Display (>100%)",
      treatments: ["Periodontal contouring", "Orthognathic surgery", "Lip repositioning", "Botox therapy"],
    },
    {
      finding: "Buccal Corridors >4.5mm",
      treatments: ["Implant augmentation", "Smile arc orthodontics", "Veneers wider angle", "Lip augmentation"],
    },
    {
      finding: "Occlusal Plane Cant >2°",
      treatments: ["Orthodontic correction", "Surgical correction", "Restorative balancing", "Combination therapy"],
    },
    {
      finding: "Midline Deviation >1.5mm",
      treatments: ["Orthodontic correction", "Restorative correction", "Surgical correction", "Combination approach"],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/5">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-sm">
        <h1 className="font-heading font-bold text-white">Clinical Guidelines</h1>
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white hover:bg-white/10">
          <Home className="w-5 h-5" />
        </Button>
      </nav>

      <div className="max-w-5xl mx-auto p-6 space-y-8">
        {/* DSD Standards */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">DSD Clinical Standards</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {guidelines.map((guide, i) => (
              <div key={i} className="bg-card/50 rounded-lg border border-white/10 p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-white text-sm">{guide.category}</h3>
                  <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">{guide.standard}</span>
                </div>
                <p className="text-xs text-muted-foreground">{guide.description}</p>
                <p className="text-xs text-cyan-300">📋 {guide.clinicalUse}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Treatment Protocols */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">Evidence-Based Treatment Protocols</h2>
          <div className="space-y-3">
            {treatments.map((protocol, i) => (
              <div key={i} className="bg-card/50 rounded-lg border border-white/10 p-4 space-y-2">
                <p className="font-semibold text-white text-sm">Finding: {protocol.finding}</p>
                <div className="flex flex-wrap gap-2">
                  {protocol.treatments.map((tx, j) => (
                    <span key={j} className="text-xs bg-green-900/30 text-green-300 border border-green-500/30 px-2 py-1 rounded">
                      • {tx}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* References */}
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6 space-y-3">
          <h2 className="text-lg font-semibold text-blue-300">Clinical References</h2>
          <ul className="text-xs text-muted-foreground space-y-2">
            <li>• Snow, S.R. (1994) "Esthetic smile analysis of maxillary anterior tooth width-length proportion" - JADA</li>
            <li>• Ward, D.H. (1997) "A study of dentists' esthetic preferences for anterior tooth proportions" - JADA</li>
            <li>• Preston, J.D. (1993) "The golden proportion revisited" - J Esthetic Dent</li>
            <li>• Rufenacht, C.R. (1990) "Fundamentals of esthetics" - Quintessence Publishing</li>
            <li>• DSD Protocol by Coachman & Martinez (2012) - Digital Smile Design methodology</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
