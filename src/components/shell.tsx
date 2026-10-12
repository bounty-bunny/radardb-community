"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import {
  Code,
  Database,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessagesSquare,
  Monitor,
  Moon,
  Route,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import { RadarMark } from "./logo";
import { useWorkspace } from "./workspace";

const NAV: { group: string; items: { href: string; label: string; icon: LucideIcon }[] }[] = [
  { group: "", items: [{ href: "/overview", label: "Overview", icon: LayoutDashboard }] },
  {
    group: "Data",
    items: [
      { href: "/sources", label: "Sources", icon: Database },
      { href: "/evals", label: "Eval set", icon: ListChecks },
    ],
  },
  {
    group: "Optimize",
    items: [
      { href: "/optimizer", label: "Optimizer", icon: FlaskConical },
      { href: "/plans", label: "Context plans", icon: Route },
      { href: "/benchmark", label: "Benchmark", icon: Gauge },
    ],
  },
  {
    group: "Use",
    items: [
      { href: "/playground", label: "Playground", icon: MessagesSquare },
      { href: "/developers", label: "API", icon: Code },
    ],
  },
];

type Theme = "system" | "light" | "dark";

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      setTheme((localStorage.getItem("radar-theme") as Theme) ?? "system");
    } catch {}
  }, []);
  const apply = (t: Theme) => {
    setTheme(t);
    try {
      localStorage.setItem("radar-theme", t);
    } catch {}
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  };
  const opts: { t: Theme; icon: LucideIcon }[] = [
    { t: "light", icon: Sun },
    { t: "system", icon: Monitor },
    { t: "dark", icon: Moon },
  ];
  return (
    <div className="flex rounded-lg border border-line bg-surface-2 p-0.5">
      {opts.map(({ t, icon: Icon }) => (
        <button
          key={t}
          aria-label={`${t} theme`}
          onClick={() => apply(t)}
          className={clsx("grid size-7 place-items-center rounded-md", theme === t ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg")}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const { data } = useWorkspace();
  const running = !!data?.activeRun || !!data?.benchmarkRunning;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <RadarMark spinning={running} />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-fg">RadarDB</div>
          <div className="text-[11px] text-muted">Context optimizer for AI</div>
        </div>
      </div>

      <div className="mx-3 mb-3 rounded-lg border border-line bg-surface px-3 py-2">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted">Project</div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[13px] text-fg">{data?.project.name ?? "…"}</span>
          {data?.sources.some((s) => s.synthetic) && <span className="rounded bg-warn-soft px-1 text-[10px] font-medium text-warn">synthetic</span>}
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3">
        {NAV.map((g) => (
          <div key={g.group || "root"}>
            {g.group && <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted">{g.group}</div>}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = path === it.href || path.startsWith(it.href + "/");
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onNavigate}
                      className={clsx(
                        "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                        active ? "bg-surface-3 font-medium text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <it.icon className={clsx("size-4", active ? "text-accent" : "text-muted")} />
                      {it.label}
                      {it.href === "/optimizer" && data?.activeRun && <span className="ml-auto size-1.5 animate-pulse rounded-full bg-accent" />}
                      {it.href === "/benchmark" && data?.benchmarkRunning && <span className="ml-auto size-1.5 animate-pulse rounded-full bg-accent" />}
                      {it.href === "/plans" && data?.deployed && (
                        <span className="ml-auto rounded bg-accent-soft px-1 text-[10px] font-medium text-accent">v{data.deployed.release.version}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <span className="text-[11px] text-muted">v0.1 · local</span>
        <ThemeToggle />
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-surface-2 lg:block">
        <Sidebar />
      </aside>

      <div className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-line bg-surface px-4 lg:hidden">
        <button aria-label="Open navigation" onClick={() => setOpen(true)} className="grid size-8 place-items-center rounded-md hover:bg-surface-2">
          <Menu className="size-4" />
        </button>
        <RadarMark className="size-6" />
        <span className="text-sm font-semibold">RadarDB</span>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-surface-2">
            <button aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute right-2 top-3 grid size-8 place-items-center rounded-md hover:bg-surface-3">
              <X className="size-4" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="lg:pl-60">
        <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
