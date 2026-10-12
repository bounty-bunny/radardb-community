"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useJson } from "@/lib/client";
import type { WorkspaceView } from "@/server/views";

type Ctx = ReturnType<typeof useJson<WorkspaceView>>;
const WorkspaceCtx = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const ws = useJson<WorkspaceView>("/api/workspace", { pollMs: (d) => (d?.activeRun || d?.benchmarkRunning ? 1000 : null) });
  return <WorkspaceCtx.Provider value={ws}>{children}</WorkspaceCtx.Provider>;
}

export function useWorkspace(): Ctx {
  const ctx = useContext(WorkspaceCtx);
  if (!ctx) throw new Error("useWorkspace outside WorkspaceProvider");
  return ctx;
}

export function classLabelOf(ws: WorkspaceView | undefined, id: string): string {
  if (id === "*") return "Fallback";
  return ws?.router.classes.find((c) => c.id === id)?.label ?? id;
}
