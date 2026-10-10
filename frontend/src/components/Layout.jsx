import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Home, BarChart3, Plus, Sparkles, User, Bell } from "lucide-react";
import api from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import { initials } from "@/components/home/HomeUI";

const Brand = ({ onClick }) => (
  <button data-testid="logo-home-btn" onClick={onClick} className="text-left leading-none">
    <div className="font-heading text-xl font-extrabold tracking-tight text-white">
      SOCLE <span className="text-electric-glow">Artisan</span>
    </div>
    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">par GONAXIS</div>
  </button>
);

const NavItem = ({ t, onClick, mobile }) => (
  <button data-testid={`nav-${t.key}${mobile ? "-mobile" : ""}`} onClick={onClick}
    className={cn(mobile
      ? "flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold transition-colors"
      : "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
      t.active ? "text-electric-glow" : "text-slate-400 hover:text-white",
      !mobile && t.active && "bg-electric/10")}>
    <t.icon size={mobile ? 22 : 17} /> {t.label}
  </button>
);

export const Layout = ({ children }) => {
  const navigate = useNavigate();
  const { pathname: path } = useLocation();
  const isHome = path === "/";
  const { data: company } = useQuery({ queryKey: ["company"], queryFn: api.company });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const alerts = stats?.a_relancer || 0;

  useEffect(() => {
    document.documentElement.classList.add("theme-night");
    return () => document.documentElement.classList.remove("theme-night");
  }, []);

  const tabs = [
    { key: "dash", label: "Accueil", icon: Home, to: "/", active: isHome },
    { key: "quotes", label: "Mon activité", icon: BarChart3, to: "/devis", active: path.startsWith("/devis") },
    { key: "assistant", label: "Assistant", icon: Sparkles, to: "/nouveau", active: path.startsWith("/nouveau") },
    { key: "settings", label: "Profil", icon: User, to: "/parametres", active: path.startsWith("/parametres") },
  ];

  return (
    <div className={cn("min-h-screen pb-28 sm:pb-10", "bg-night-app")}>
      <header data-testid="top-nav" className="sticky top-0 z-30 border-b border-white/5 bg-night/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Brand onClick={() => navigate("/")} />
          <nav className="hidden items-center gap-1 sm:flex">
            {tabs.map((t) => <NavItem key={t.key} t={t} onClick={() => navigate(t.to)} />)}
          </nav>
          <div className="flex items-center gap-2">
            <button data-testid="nav-bell-btn" onClick={() => navigate("/devis")} title="Notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10">
              <Bell size={21} />
              {alerts > 0 && <span data-testid="nav-bell-dot" className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-night" />}
            </button>
            <button data-testid="nav-avatar-btn" onClick={() => navigate("/parametres")} title="Profil"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-electric/40 bg-night-soft text-sm font-bold text-white transition-colors hover:border-electric-glow">
              {initials(company?.artisan_name || company?.name)}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6">{children}</main>

      <button data-testid="nav-new-desktop" onClick={() => navigate("/nouveau")} title="Nouveau devis IA"
        className="fixed bottom-6 right-6 z-30 hidden h-14 w-14 items-center justify-center rounded-full bg-electric text-white shadow-neon transition-transform hover:scale-105 active:scale-95 sm:flex">
        <Plus size={28} strokeWidth={2.5} />
      </button>

      <nav data-testid="mobile-bottom-nav" className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/5 bg-night/95 backdrop-blur-xl sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2 pb-2 pt-1.5">
          {tabs.slice(0, 2).map((t) => <NavItem mobile key={t.key} t={t} onClick={() => navigate(t.to)} />)}
          <div className="flex justify-center">
            <button data-testid="nav-new-mobile" onClick={() => navigate("/nouveau")} aria-label="Nouveau devis IA"
              className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-electric text-white shadow-neon ring-4 ring-night transition-transform active:scale-90">
              <Plus size={30} strokeWidth={2.5} />
            </button>
          </div>
          {tabs.slice(2).map((t) => <NavItem mobile key={t.key} t={t} onClick={() => navigate(t.to)} />)}
        </div>
      </nav>
    </div>
  );
};

export default Layout;
