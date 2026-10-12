"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { FolderPlus, RefreshCw, Search, Trash, Upload, X } from "lucide-react";
import type { Source } from "@/core/domain";
import { Badge, Button, Card, PageHeader, SOURCE_META, SourceBadge, Spinner } from "@/components/ui";
import { useWorkspace } from "@/components/workspace";
import { fmt, postJson, useJson } from "@/lib/client";
import type { DocSummary } from "@/server/views";

const inputCls = "h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg outline-none placeholder:text-muted focus:border-accent";

function TypeBadge({ s }: { s: Source }) {
  if (s.synthetic) return <Badge tone="warn">synthetic fixture</Badge>;
  if (s.type === "filesystem") return <Badge tone="info">local folder</Badge>;
  return <Badge>upload</Badge>;
}

function ConnectFolder({ root, onDone }: { root: string; onDone: () => void }) {
  const { refresh } = useWorkspace();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <Card title="Connect a local folder" description={`Markdown and text files under ./${root}/. Paths outside it are rejected.`} className="mb-6">
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Runbooks" className={inputCls} />
        <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="folder relative to the sources root, e.g. runbooks" className={clsx(inputCls, "font-mono")} />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!path.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(undefined);
              try {
                await postJson("/api/sources", { type: "filesystem", name, path });
                await refresh();
                onDone();
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Connect
          </Button>
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </Card>
  );
}

function UploadDocument({ onDone }: { onDone: () => void }) {
  const { refresh } = useWorkspace();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <Card title="Upload a document" description="Paste Markdown or text (max 1M characters). Content is stored as plain text and never executed." className="mb-6">
      <div className="space-y-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={inputCls} />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={7}
          placeholder={"# Title\n\n## Section\nContent…"}
          className="w-full rounded-lg border border-line-strong bg-surface p-3 font-mono text-xs text-fg outline-none placeholder:text-muted focus:border-accent"
        />
        <div className="flex items-center justify-end gap-2">
          {err && <span className="mr-auto text-xs text-danger">{err}</span>}
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!content.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await postJson("/api/documents", { title, content });
                await refresh();
                onDone();
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Upload
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DocPreview({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useJson<DocSummary & { content: string; checksum: string }>(`/api/documents?id=${encodeURIComponent(id)}`);
  return (
    <tr className="border-t border-line bg-surface-2">
      <td colSpan={5} className="px-5 py-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="truncate font-mono text-xs text-muted">
            {id} {data && `· v${data.version} · sha1 ${data.checksum.slice(0, 10)}`}
          </span>
          <button onClick={onClose} aria-label="Close preview" className="grid size-6 place-items-center rounded hover:bg-surface-3">
            <X className="size-3.5" />
          </button>
        </div>
        {data ? (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 font-mono text-xs leading-relaxed text-fg-2">{data.content}</pre>
        ) : (
          <Spinner />
        )}
      </td>
    </tr>
  );
}

export default function SourcesPage() {
  const { data, refresh } = useWorkspace();
  const { data: meta } = useJson<{ sourcesRoot: string }>("/api/sources");
  const { data: docs, refresh: refreshDocs } = useJson<DocSummary[]>("/api/documents");
  const [mode, setMode] = useState<"folder" | "upload" | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const shown = useMemo(
    () =>
      (docs ?? [])
        .filter((d) => !filter || d.sourceId === filter)
        .filter((d) => !query || d.title.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [docs, filter, query],
  );
  if (!data) return <Spinner className="mt-20 size-6" />;
  const reload = async () => {
    await refresh();
    await refreshDocs();
  };

  return (
    <>
      <PageHeader
        title="Sources"
        description="RadarDB reads from systems you already have. Nothing is migrated; representations are built alongside and versioned by a dataset checksum."
        actions={
          <>
            <Button icon={Upload} onClick={() => setMode("upload")}>
              Upload
            </Button>
            <Button icon={FolderPlus} variant="primary" onClick={() => setMode("folder")}>
              Connect folder
            </Button>
          </>
        }
      />
      {mode === "folder" && <ConnectFolder root={meta?.sourcesRoot ?? "sources"} onDone={() => (setMode(null), reload())} />}
      {mode === "upload" && <UploadDocument onDone={() => (setMode(null), reload())} />}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.sources.map((s) => {
          const m = SOURCE_META[s.kind];
          return (
            <div key={s.id} className={clsx("rounded-xl border bg-surface p-4 shadow-card", filter === s.id ? "border-accent" : "border-line")}>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2">
                  <m.icon className="size-4 text-fg-2" />
                </span>
                <button className="min-w-0 flex-1 text-left" onClick={() => setFilter(filter === s.id ? null : s.id)}>
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                    {s.name} <TypeBadge s={s} />
                  </span>
                  <span className="tnum block text-xs text-muted">
                    {s.documentCount} docs · synced {fmt.rel(s.lastSyncedAt)}
                  </span>
                  {s.connection.path && <span className="block truncate font-mono text-[11px] text-muted">{s.connection.path}</span>}
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs">
                  <span className={clsx("size-1.5 rounded-full", s.syncStatus === "synced" ? "bg-accent" : s.syncStatus === "error" ? "bg-danger" : "bg-warn")} />
                  <span className={s.syncStatus === "error" ? "text-danger" : "text-muted"}>{s.syncStatus === "error" ? s.syncError : s.syncStatus}</span>
                </span>
                <span className="flex gap-1">
                  {s.type !== "upload" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={RefreshCw}
                      loading={syncing === s.id}
                      onClick={async () => {
                        setSyncing(s.id);
                        try {
                          await postJson(`/api/sources/${s.id}`, {});
                          await reload();
                        } finally {
                          setSyncing(null);
                        }
                      }}
                    >
                      Sync
                    </Button>
                  )}
                  {s.type !== "fixture" && (
                    <Button
                      size="sm"
                      variant="danger"
                      icon={Trash}
                      aria-label="Remove source"
                      onClick={async () => {
                        await fetch(`/api/sources/${s.id}`, { method: "DELETE" });
                        await reload();
                      }}
                    />
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <Card
        title={`Documents · ${shown.length}`}
        description={`${data.counts.documents} documents · dataset ${data.datasetVersion}. Distractors are generated noise in the synthetic fixture.`}
        actions={
          <label className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title"
              className="h-8 w-56 rounded-lg border border-line-strong bg-surface pl-8 pr-2.5 text-xs text-fg outline-none placeholder:text-muted focus:border-accent"
            />
          </label>
        }
        bodyClassName="p-0"
        className="mb-6"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="py-2 pl-5 pr-3 font-medium">Title</th>
                <th className="px-3 font-medium">Kind</th>
                <th className="px-3 font-medium">Updated</th>
                <th className="px-3 text-right font-medium">Tokens</th>
                <th className="pl-3 pr-5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <Row key={d.id} d={d} open={open === d.id} onToggle={() => setOpen(open === d.id ? null : d.id)} onDeleted={reload} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Connector architecture" description="Every source implements SourceConnector: connect · validate · sync · incrementalSync · getDocuments · getChanges · health.">
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li className="rounded-lg border border-line p-3">
            <div className="font-medium text-fg">Fixture</div>
            <div className="text-xs text-muted">Synthetic demo data bundled with RadarDB. Never presented as a live integration.</div>
          </li>
          <li className="rounded-lg border border-line p-3">
            <div className="font-medium text-fg">Local folder</div>
            <div className="text-xs text-muted">Real connector. Markdown/text, confined to the sources root, symlinks skipped, 2 MB per file.</div>
          </li>
          <li className="rounded-lg border border-dashed border-line p-3">
            <div className="flex items-center gap-2 font-medium text-fg">
              GitHub <Badge>next</Badge>
            </div>
            <div className="text-xs text-muted">Issues, PRs, Markdown. Token held server-side; permissions carried on chunks.</div>
          </li>
        </ul>
      </Card>
    </>
  );
}

function Row({ d, open, onToggle, onDeleted }: { d: DocSummary; open: boolean; onToggle: () => void; onDeleted: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className={clsx("cursor-pointer border-t border-line hover:bg-surface-2", open && "bg-surface-2")}>
        <td className="max-w-0 py-2.5 pl-5 pr-3">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-fg">{d.title}</span>
            {d.distractor && <Badge>distractor</Badge>}
          </div>
        </td>
        <td className="px-3">
          <SourceBadge source={d.kind} />
        </td>
        <td className="tnum px-3 text-xs text-muted">{d.updatedAt.slice(0, 10)}</td>
        <td className="tnum px-3 text-right text-xs text-muted">{fmt.tokens(d.tokens)}</td>
        <td className="pl-3 pr-5 text-right">
          {d.sourceId === "src_uploads" && (
            <button
              aria-label="Delete document"
              onClick={async (e) => {
                e.stopPropagation();
                await fetch(`/api/documents?id=${encodeURIComponent(d.id)}`, { method: "DELETE" });
                onDeleted();
              }}
              className="grid size-7 place-items-center rounded text-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash className="size-3.5" />
            </button>
          )}
        </td>
      </tr>
      {open && <DocPreview id={d.id} onClose={onToggle} />}
    </>
  );
}

