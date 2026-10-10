import React from "react";
import { toast } from "sonner";

export const soon = (label) => toast(`${label} — bientôt disponible`, { description: "Ce module arrive prochainement dans SOCLE Artisan." });

export const SectionHead = ({ title, action, onAction, testid }) => (
  <div className="mb-3 flex items-end justify-between">
    <h2 className="font-heading text-lg font-bold text-white">{title}</h2>
    {action && (
      <button data-testid={testid} onClick={onAction}
        className="text-xs font-semibold text-electric-glow transition-colors hover:text-white">
        {action}
      </button>
    )}
  </div>
);

export const SoonBadge = () => (
  <span className="rounded-full border border-electric/30 bg-electric/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-electric-glow">
    Bientôt
  </span>
);

export const initials = (name = "") =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "SA";
