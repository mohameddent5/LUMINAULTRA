import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ARCanvas } from "@/components/ARCanvas";

const KEY = "scanConsentConfirmed";
export const CONSENT_AT_KEY = "scanConsentAt";

/** Consent step before the camera opens (patient data law: consent and purpose must come first). */
export default function Scanner() {
  const [, navigate] = useLocation();
  const [ok, setOk] = useState(() => sessionStorage.getItem(KEY) === "1");
  const [checked, setChecked] = useState(false);

  if (ok) return <ARCanvas />;
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-accent/5 p-6">
      <div className="w-full max-w-md space-y-4 bg-card/50 border border-white/10 rounded-xl p-6 text-sm text-white/80">
        <h1 className="font-heading text-lg font-bold text-white">Patient consent before scanning</h1>
        <p>
          This tool photographs the patient's face and smile to produce a smile design analysis and visual simulation.
          Images and measurements are stored in this clinic's account so the clinic can review them later.
        </p>
        <p>
          It is an assistive design tool. It does not diagnose any condition, and its output must be reviewed by the dentist.
        </p>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>
            The patient has been told what is captured, why, and how long it is kept, and has agreed to this scan.
            They can withdraw consent and ask for their records to be deleted.
          </span>
        </label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate("/")}>Back</Button>
          <Button disabled={!checked} onClick={() => { sessionStorage.setItem(KEY, "1"); sessionStorage.setItem(CONSENT_AT_KEY, new Date().toISOString()); setOk(true); }}>Start scan</Button>
        </div>
      </div>
    </div>
  );
}
