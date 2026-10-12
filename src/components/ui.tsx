"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  BookText,
  FileText,
  GitPullRequest,
  LoaderCircle,
  MessageSquare,
  Rocket,
  Siren,
  Ticket,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { PlanConfig, SourceKind } from "@/core/domain";
import { describePlan } from "@/engine/labels";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx("min-w-0 rounded-xl border border-line bg-surface shadow-card", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: LucideIcon;
  loading?: boolean;
};

export function Button({ variant = "secondary", size = "md", icon: Icon, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-accent text-accent-ink hover:bg-accent-strong",
        variant === "secondary" && "border border-line-strong bg-surface text-fg hover:bg-surface-2",
        variant === "ghost" && "text-fg-2 hover:bg-surface-2 hover:text-fg",
        variant === "danger" && "text-danger hover:bg-danger-soft",
        className,
      )}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </button>
  );
}

export type Tone = "neutral" | "accent" | "warn" | "danger" | "info" | "violet";

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-2 border-line",
  accent: "bg-accent-soft text-accent border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
  violet: "bg-violet-soft text-violet border-transparent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4", TONE[tone], className)}>
      {children}
    </span>
  );
}

/** Change indicator. `points` renders an absolute change in percentage points (for rates like accuracy). */
export function Delta({ value, goodWhen, points, className }: { value: number; goodWhen: "up" | "down"; points?: boolean; className?: string }) {
  if (!isFinite(value) || Math.abs(value) < 0.005) return <span className={clsx("text-xs text-muted", className)}>no change</span>;
  const good = goodWhen === "up" ? value > 0 : value < 0;
  return (
    <span className={clsx("tnum text-xs font-medium", good ? "text-accent" : "text-danger", className)}>
      {points ? `${value > 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(0)} pts` : `${value > 0 ? "▲" : "▼"} ${Math.abs(value * 100).toFixed(0)}%`}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={clsx("size-4 animate-spin text-muted", className)} />;
}

export function Empty({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 grid size-10 place-items-center rounded-xl bg-surface-2 text-muted">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ConfigChips({ config, className }: { config: PlanConfig; className?: string }) {
  return (
    <div className={clsx("flex flex-wrap gap-1", className)}>
      {describePlan(config).map((p) => (
        <span key={p} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] leading-4 text-fg-2">
          {p}
        </span>
      ))}
    </div>
  );
}

export const SOURCE_META: Record<SourceKind, { label: string; icon: LucideIcon; tone: Tone }> = {
  confluence: { label: "Confluence", icon: BookText, tone: "info" },
  pagerduty: { label: "PagerDuty", icon: Siren, tone: "danger" },
  deployctl: { label: "Deploy log", icon: Rocket, tone: "warn" },
  github: { label: "GitHub", icon: GitPullRequest, tone: "neutral" },
  jira: { label: "Jira", icon: Ticket, tone: "info" },
  slack: { label: "Slack", icon: MessageSquare, tone: "violet" },
  markdown: { label: "Markdown", icon: FileText, tone: "neutral" },
  upload: { label: "Upload", icon: Upload, tone: "neutral" },
};

/** Labels a number as measured (timed) or estimated (modeled). Never omit on cost/latency. */
export function Basis({ kind }: { kind: "measured" | "estimated" }) {
  return (
    <span
      title={kind === "measured" ? "Timed wall-clock on this machine" : "Modeled, not measured. See cost model."}
      className={clsx(
        "ml-1 rounded px-1 align-middle text-[9px] font-semibold uppercase tracking-wider",
        kind === "measured" ? "bg-info-soft text-info" : "bg-warn-soft text-warn",
      )}
    >
      {kind === "measured" ? "measured" : "est."}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={clsx("w-full rounded-xl border border-line bg-surface shadow-xl", wide ? "max-w-4xl" : "max-w-2xl")}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md px-2 py-1 text-sm text-muted hover:bg-surface-2 hover:text-fg">
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function SourceBadge({ source }: { source: SourceKind }) {
  const m = SOURCE_META[source] ?? SOURCE_META.upload;
  return (
    <Badge tone={m.tone}>
      <m.icon className="size-3" />
      {m.label}
    </Badge>
  );
}

export function Progress({ value, live }: { value: number; live?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div
        className={clsx("h-full rounded-full bg-accent transition-[width] duration-500", live && "progress-live")}
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.value ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
