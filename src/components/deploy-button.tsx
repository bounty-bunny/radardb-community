"use client";

import { useState } from "react";
import { Check, Rocket } from "lucide-react";
import { Badge, Button } from "./ui";
import { useWorkspace } from "./workspace";
import { postJson, fmt } from "@/lib/client";
import type { PlanRelease } from "@/core/domain";

/** Explicit, human-initiated deployment of a validated release. */
export function DeployButton({ release, size, label = "Deploy optimized plans", onDone }: { release: PlanRelease; size?: "sm" | "md"; label?: string; onDone?: () => void }) {
  const { refresh } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  if (release.status === "deployed")
    return (
      <Badge tone="accent" className="h-8 px-2.5 text-xs">
        <Check className="size-3.5" /> v{release.version} in production · {fmt.rel(release.deployedAt)}
      </Badge>
    );
  const deployable = release.status === "validated" || (release.status === "retired" && !!release.deployedAt);
  if (!deployable) return <Badge tone="warn">v{release.version} {release.status} — not deployable</Badge>;

  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-xs text-danger">{err}</span>}
      <Button
        variant="primary"
        size={size}
        icon={Rocket}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setErr(undefined);
          try {
            await postJson("/api/plans/deploy", { releaseId: release.id });
            await refresh();
            onDone?.();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {release.status === "retired" ? `Redeploy v${release.version}` : label}
      </Button>
    </div>
  );
}
