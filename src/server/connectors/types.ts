import type { SourceKind, SourceType } from "@/core/domain";

/** A document as read from a source system, before RadarDB assigns ids/versions. */
export interface ConnectorDocument {
  externalId: string;
  title: string;
  content: string;
  kind: SourceKind;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ConnectorChanges {
  upserts: ConnectorDocument[];
  deletes: string[];
}

export interface ConnectorHealth {
  status: "ok" | "degraded" | "unreachable";
  detail: string;
}

/**
 * Contract every source integration implements. Credentials, when a
 * connector needs them, are resolved server-side inside the connector
 * (e.g. from environment variables) and never appear in Source.connection.
 */
export interface SourceConnector {
  readonly type: SourceType;
  connect(): Promise<void>;
  validate(): Promise<{ ok: boolean; error?: string }>;
  /** Full read of every document. */
  sync(): Promise<ConnectorDocument[]>;
  /** Changes relative to the given externalId → checksum map. */
  incrementalSync(known: Map<string, string>): Promise<ConnectorChanges>;
  getDocuments(): Promise<ConnectorDocument[]>;
  getChanges(known: Map<string, string>): Promise<ConnectorChanges>;
  health(): Promise<ConnectorHealth>;
}
