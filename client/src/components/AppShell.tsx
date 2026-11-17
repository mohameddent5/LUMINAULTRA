import { useState } from "react";
import type { ComponentType } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Camera,
  ClipboardList,
  FileText,
  FolderOpen,
  GitCompare,
  Home,
  LayoutDashboard,
  Menu,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  hint?: string;
};

type NavSection = { title: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      { href: "/", label: "Home", icon: Home, hint: "Workspace overview" },
      { href: "/care-journey", label: "Screening to care", icon: Activity, hint: "Referral, booking, follow-up" },
      { href: "/clinical-dashboard", label: "Clinical dashboard", icon: LayoutDashboard, hint: "Practice activity" },
    ],
  },
  {
    title: "Clinical tools",
    items: [
      { href: "/scanner", label: "AR scanner", icon: Camera, hint: "Live facial analysis" },
      { href: "/treatment-planner", label: "Treatment planner", icon: ClipboardList, hint: "Design the smile" },
      { href: "/smile-simulator", label: "Smile simulator", icon: Sparkles, hint: "Before and after" },
      { href: "/prescription-generator", label: "Lab prescription", icon: FileText, hint: "Send to the lab" },
    ],
  },
  {
    title: "Records",
    items: [
      { href: "/patient-archive", label: "Patient archive", icon: FolderOpen, hint: "Stored analyses" },
      { href: "/patient-comparison", label: "Compare patients", icon: GitCompare, hint: "Side by side" },
    ],
  },
  {
    title: "Reference",
    items: [
      { href: "/clinical-guidelines", label: "DSD guidelines", icon: Stethoscope, hint: "Protocol library" },
      { href: "/validation", label: "Validation", icon: ShieldCheck, hint: "Evidence and accuracy" },
      { href: "/settings", label: "Settings", icon: SettingsIcon, hint: "Clinic and data" },
    ],
  },
];

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Home", subtitle: "Your clinical workspace" },
  "/care-journey": { title: "Screening to care", subtitle: "From a screening result to completed care" },
  "/clinical-dashboard": { title: "Clinical dashboard", subtitle: "Practice activity and standards" },
  "/scanner": { title: "AR scanner", subtitle: "Live facial and smile analysis" },
  "/treatment-planner": { title: "Treatment planner", subtitle: "Design and compare treatment options" },
  "/smile-simulator": { title: "Smile simulator", subtitle: "Preview the planned outcome" },
  "/prescription-generator": { title: "Lab prescription", subtitle: "Prepare instructions for the laboratory" },
  "/patient-archive": { title: "Patient archive", subtitle: "Stored analyses and reports" },
  "/patient-comparison": { title: "Compare patients", subtitle: "Side-by-side measurement review" },
  "/clinical-guidelines": { title: "DSD guidelines", subtitle: "Protocols and reference ranges" },
  "/validation": { title: "Validation", subtitle: "Evidence, accuracy and limits" },
  "/model": { title: "Model", subtitle: "On-device models and weights" },
  "/settings": { title: "Settings", subtitle: "Clinic profile and data controls" },
};

function isActive(path: string, href: string): boolean {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 group">
      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[0_0_20px_rgba(0,212,255,0.25)]">
        <span className="text-sm font-bold text-primary-foreground">Lm</span>
      </div>
      <div className="leading-tight">
        <p className="font-heading font-bold text-white text-sm">
          Lumina<span className="text-primary">Ultra</span>
        </p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Clinical platform</p>
      </div>
    </Link>
  );
}

function NavList({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {SECTIONS.map((section) => (
        <div key={section.title} className="space-y-1">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {section.title}
          </p>
          {section.items.map((item) => {
            const active = isActive(path, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary/15 text-white border border-primary/30"
                    : "text-muted-foreground border border-transparent hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${active ? "text-primary" : ""}`} />
                <span className="min-w-0">
                  <span className="block font-medium leading-snug">{item.label}</span>
                  {item.hint && <span className="block text-[10px] text-muted-foreground/80 leading-tight">{item.hint}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [path] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const meta = PAGE_META[path] ?? { title: "Lumina Ultra", subtitle: "Clinical DSD platform" };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-accent/5 text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 border-r border-white/10 bg-card/40 backdrop-blur-sm">
        <div className="h-16 flex items-center px-4 border-b border-white/10">
          <Brand />
        </div>
        <NavList path={path} />
        <div className="p-3 border-t border-white/10 space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white truncate">Clinical workspace</p>
              <p className="text-[10px] text-muted-foreground">On-device data · v1.0</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-72 max-w-[80%] bg-card border-r border-white/10 flex flex-col">
            <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
              <Brand />
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="p-2 rounded-md text-muted-foreground hover:text-white hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <NavList path={path} onNavigate={() => setMobileOpen(false)} />
          </div>
          <button
            aria-label="Close menu overlay"
            onClick={() => setMobileOpen(false)}
            className="flex-1 bg-black/60 backdrop-blur-sm"
          />
        </div>
      )}

      <div className="lg:pl-64 flex flex-col min-h-screen">
        {/* Global header */}
        <header className="sticky top-0 z-30 h-16 flex items-center gap-3 px-4 sm:px-6 border-b border-white/10 bg-background/85 backdrop-blur-md">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="lg:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-white hover:bg-white/5"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base font-heading font-semibold text-white truncate">{meta.title}</h1>
            <p className="text-[11px] text-muted-foreground truncate">{meta.subtitle}</p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-white/10 rounded-full px-2.5 py-1">
              v1.0 clinical grade
            </span>
            <Link
              href="/care-journey"
              className="text-xs font-semibold rounded-lg px-3 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              New screening
            </Link>
          </div>
        </header>

        <main className="flex-1 min-w-0">{children}</main>

        <footer className="border-t border-white/10 px-4 sm:px-6 py-4 flex flex-col sm:flex-row gap-1 sm:items-center sm:justify-between text-[11px] text-muted-foreground">
          <p>Lumina Ultra — Clinical DSD platform · measurements validated against peer-reviewed protocols</p>
          <p>Clinical decision support, not a diagnosis. Data stays on this device.</p>
        </footer>
      </div>
    </div>
  );
}
