import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

const vecToJson = (v: Float32Array): string => JSON.stringify(Array.from(v));

export interface EmbeddingMeta {
  kind: "task" | "prompt" | "output";
  session_id: string;
  task_id?: string;
  content_hash?: string;
}

export interface SearchResult {
  id: string;
  distance: number;
  meta: EmbeddingMeta;
}

export class VectorStore {
  private db: Database.Database | null = null;

  constructor(
    private readonly dbPath: string,
    private readonly dims: number,
  ) {}

  open(): void {
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    sqliteVec.load(this.db);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_meta (
        rowid  INTEGER PRIMARY KEY,
        id     TEXT UNIQUE NOT NULL,
        kind   TEXT NOT NULL,
        session_id TEXT NOT NULL,
        task_id    TEXT,
        content_hash TEXT
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_index
        USING vec0(embedding FLOAT[${this.dims}]);
    `);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private get conn(): Database.Database {
    if (!this.db) throw new Error("VectorStore not opened");
    return this.db;
  }

  upsert(id: string, vector: Float32Array, meta: EmbeddingMeta): void {
    const db = this.conn;
    const existing = db
      .prepare<[string], { rowid: number }>("SELECT rowid FROM embedding_meta WHERE id = ?")
      .get(id);

    if (existing) {
      db.prepare(
        "UPDATE embedding_meta SET kind=?, session_id=?, task_id=?, content_hash=? WHERE rowid=?",
      ).run(meta.kind, meta.session_id, meta.task_id ?? null, meta.content_hash ?? null, existing.rowid);
      db.prepare("DELETE FROM vec_index WHERE rowid = ?").run(BigInt(existing.rowid));
      db.prepare("INSERT INTO vec_index(rowid, embedding) VALUES (?, ?)").run(
        BigInt(existing.rowid),
        vecToJson(vector),
      );
    } else {
      const insert = db
        .prepare(
          "INSERT INTO embedding_meta(id, kind, session_id, task_id, content_hash) VALUES (?,?,?,?,?)",
        )
        .run(id, meta.kind, meta.session_id, meta.task_id ?? null, meta.content_hash ?? null);
      db.prepare("INSERT INTO vec_index(rowid, embedding) VALUES (?, ?)").run(
        BigInt(insert.lastInsertRowid as number),
        vecToJson(vector),
      );
    }
  }

  search(
    queryVector: Float32Array,
    k: number,
    filter?: Partial<EmbeddingMeta>,
  ): SearchResult[] {
    const db = this.conn;
    if (k <= 0) return [];

    const kindClause = filter?.kind ? "AND m.kind = ?" : "";
    const sessionClause = filter?.session_id ? "AND m.session_id = ?" : "";
    const params: unknown[] = [vecToJson(queryVector), k * 4];
    if (filter?.kind) params.push(filter.kind);
    if (filter?.session_id) params.push(filter.session_id);

    const rows = db
      .prepare<unknown[], { id: string; distance: number; kind: string; session_id: string; task_id: string | null }>(
        `SELECT m.id, v.distance, m.kind, m.session_id, m.task_id
         FROM vec_index v
         JOIN embedding_meta m ON m.rowid = v.rowid
         WHERE v.embedding MATCH ? AND k = ?
         ${kindClause} ${sessionClause}
         ORDER BY v.distance
         LIMIT ?`,
      )
      .all(...params, k);

    return rows.map((r) => ({
      id: r.id,
      distance: r.distance,
      meta: {
        kind: r.kind as EmbeddingMeta["kind"],
        session_id: r.session_id,
        ...(r.task_id ? { task_id: r.task_id } : {}),
      },
    }));
  }

  delete(id: string): void {
    const db = this.conn;
    const row = db
      .prepare<[string], { rowid: number }>("SELECT rowid FROM embedding_meta WHERE id = ?")
      .get(id);
    if (!row) return;
    db.prepare("DELETE FROM vec_index WHERE rowid = ?").run(row.rowid);
    db.prepare("DELETE FROM embedding_meta WHERE rowid = ?").run(row.rowid);
  }
}
