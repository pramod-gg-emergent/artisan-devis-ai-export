import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, FileText, Plus, Sparkles, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const ARTISAN = "Martin Rénovation";

export const Layout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const tabs = [
    { key: "dash", label: "Accueil", icon: LayoutDashboard, to: "/", active: path === "/" },
    { key: "quotes", label: "Devis", icon: FileText, to: "/devis", active: path.startsWith("/devis") },
    { key: "settings", label: "Paramètres", icon: Settings, to: "/parametres", active: path.startsWith("/parametres") },
  ];

  return (
    <div className="min-h-screen bg-background pb-24 sm:pb-8">
      {/* Top bar */}
      <header
        data-testid="top-nav"
        className="sticky top-0 z-30 border-b border-petrol/10 bg-petrol text-white"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <button
            data-testid="logo-home-btn"
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-lagoon text-white shadow-cta">
              <Sparkles size={18} strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="font-heading text-base font-extrabold tracking-tight">SOCLE Artisan</div>
              <div className="text-[11px] font-medium text-cyan-200">Assistant Devis IA</div>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <button
              data-testid="nav-settings-btn"
              onClick={() => navigate("/parametres")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              title="Paramètres"
            >
              <Settings size={18} />
            </button>
            <div className="flex items-center gap-2 rounded-full bg-white/10 py-1.5 pl-1.5 pr-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-lagoon text-xs font-bold">MR</div>
              <span className="hidden text-sm font-semibold sm:block">{ARTISAN}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Desktop nav */}
      <div className="mx-auto hidden max-w-5xl items-center gap-1 px-6 pt-4 sm:flex">
        {tabs.map((t) => (
          <button
            key={t.key}
            data-testid={`nav-${t.key}`}
            onClick={() => navigate(t.to)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              t.active ? "bg-white text-petrol shadow-card" : "text-petrol/60 hover:bg-white/60"
            )}
          >
            <t.icon size={17} /> {t.label}
          </button>
        ))}
        <button
          data-testid="nav-new-desktop"
          onClick={() => navigate("/nouveau")}
          className="ml-auto flex items-center gap-2 rounded-xl bg-lagoon px-4 py-2 text-sm font-bold text-white shadow-cta transition-transform hover:scale-[1.02] active:scale-95"
        >
          <Plus size={18} strokeWidth={2.5} /> Nouveau devis IA
        </button>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6">{children}</main>

      {/* Mobile bottom bar */}
      <nav
        data-testid="mobile-bottom-nav"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-petrol/10 bg-white/95 backdrop-blur sm:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-3 items-center px-2 py-2">
          <button
            data-testid="nav-dash-mobile"
            onClick={() => navigate("/")}
            className={cn("flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold",
              path === "/" ? "text-lagoon" : "text-slate-400")}
          >
            <LayoutDashboard size={22} /> Accueil
          </button>
          <div className="flex justify-center">
            <button
              data-testid="nav-new-mobile"
              onClick={() => navigate("/nouveau")}
              className="-mt-8 flex h-16 w-16 flex-col items-center justify-center rounded-2xl bg-lagoon text-white shadow-cta transition-transform active:scale-90"
            >
              <Plus size={26} strokeWidth={2.5} />
              <span className="text-[10px] font-bold">Devis IA</span>
            </button>
          </div>
          <button
            data-testid="nav-quotes-mobile"
            onClick={() => navigate("/devis")}
            className={cn("flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold",
              path.startsWith("/devis") ? "text-lagoon" : "text-slate-400")}
          >
            <FileText size={22} /> Devis
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Layout;
