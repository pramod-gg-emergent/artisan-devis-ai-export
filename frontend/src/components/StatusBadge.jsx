import React from "react";
import { STATUS_META } from "@/lib/format";
import { cn } from "@/lib/utils";

export const StatusBadge = ({ statut, className }) => {
  const meta = STATUS_META[statut] || STATUS_META.brouillon;
  return (
    <span
      data-testid={`status-badge-${statut}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        meta.cls,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
};

export default StatusBadge;
