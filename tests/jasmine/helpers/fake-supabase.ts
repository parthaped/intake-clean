/**
 * Lightweight in-memory fake of the slice of `@supabase/supabase-js`
 * `SupabaseClient` that the upload pipeline actually exercises.
 *
 * Why we don't use the real client in unit tests:
 *   - the real client opens a websocket and writes to a real Postgres,
 *   - the chained query API (`from().select().eq().maybeSingle()`) is what
 *     the upload route, processing queue, drain pipeline, and the
 *     `processDocument` orchestrator all talk to, so a focused fake gives
 *     us exact assertions ("did we update `matters.status` to `in_review`
 *     only when the prior status was active or waiting_on_client?")
 *     without requiring a live database.
 *
 * Design:
 *   - `createFakeSupabase()` returns `{ client, calls, on, onStorage, ... }`.
 *   - `client` is shaped to satisfy `getServiceSupabase()` callers (it's
 *     cast to `any` at injection time so we don't have to faithfully
 *     reproduce every PostgREST type).
 *   - Each chain call (`select`, `eq`, `update`, …) is recorded on the
 *     builder and surfaced to a per-table responder when a terminal
 *     (`maybeSingle`, `single`, or `await`) is hit.
 *   - Storage calls (`storage.from(bucket).upload/download/remove`) get
 *     their own responder map.
 *   - All operations are recorded on `calls.table[]` and `calls.storage[]`
 *     so specs can assert on the exact wire-level interactions
 *     (insert payload, eq filters, storage key, etc.) instead of mocking
 *     individual functions.
 *
 * This file deliberately ships only types/functions — no top-level side
 * effects — so the Jasmine helper auto-loader can pull it in safely.
 */

export interface ChainOpRecord {
  /** Table name passed to `from(...)`. */
  table: string;
  /** Inferred query kind. `select` is the default until insert/update/delete/upsert is called. */
  kind: "select" | "insert" | "update" | "delete" | "upsert";
  /** Payload of the insert/update/upsert (if any). */
  payload: unknown;
  /** Ordered list of every chain method called for this query. */
  calls: Array<{ method: string; args: unknown[] }>;
  /** Which terminal triggered resolution. `await` covers `await builder` directly. */
  terminal: "maybeSingle" | "single" | "await";
}

export interface StorageOpRecord {
  bucket: string;
  method: "upload" | "download" | "remove" | "createSignedUrl" | "list";
  args: unknown[];
}

export type ChainResult<T = unknown> =
  | { data: T; error: null }
  | { data: null; error: { code?: string; message: string } };

export type StorageResult<T = unknown> =
  | { data: T; error: null }
  | { data: null; error: { code?: string; message: string } };

export type TableResponder = (op: ChainOpRecord) => ChainResult | Promise<ChainResult>;
export type StorageResponder = (op: StorageOpRecord) => StorageResult | Promise<StorageResult>;

interface FakeSupabaseHandle {
  /** Cast at injection time: `(fake.client as unknown as ReturnType<typeof getServiceSupabase>)`. */
  client: FakeClient;
  /** Mutable log of every recorded operation. */
  calls: {
    table: ChainOpRecord[];
    storage: StorageOpRecord[];
  };
  /** Helper utilities for finding a specific call in `calls.table`. */
  find: {
    /** Find every recorded op for a table; optional predicate further filters. */
    table(name: string, predicate?: (op: ChainOpRecord) => boolean): ChainOpRecord[];
    storage(bucket: string, method?: StorageOpRecord["method"]): StorageOpRecord[];
  };
  /** Install a per-table responder. Subsequent calls to the same table replace it. */
  on(table: string, responder: TableResponder): void;
  /** Install a per-bucket responder. */
  onStorage(bucket: string, responder: StorageResponder): void;
  /** Reset all logs and responders (use in `afterEach`). */
  reset(): void;
}

interface FakeClient {
  from(table: string): QueryBuilder;
  storage: { from(bucket: string): StorageBucket };
}

class QueryBuilder {
  // Module-private builder so external callers can't construct it directly;
  // the only entry point is `client.from(table)`.
  // PostgREST's pattern: every method except the terminals returns `this`,
  // and the terminals (`maybeSingle`, `single`) plus the implicit `await`
  // return a Promise<{data, error}>. A single builder may be awaited
  // directly without calling `.maybeSingle()`/`.single()`.
  private record: ChainOpRecord;

  constructor(table: string, private readonly fake: FakeRoot) {
    this.record = { table, kind: "select", payload: null, calls: [], terminal: "await" };
  }

  private push(method: string, args: unknown[]): this {
    this.record.calls.push({ method, args });
    return this;
  }

  select(arg?: unknown): this {
    return this.push("select", arg === undefined ? [] : [arg]);
  }
  insert(payload: unknown): this {
    this.record.kind = "insert";
    this.record.payload = payload;
    return this.push("insert", [payload]);
  }
  update(payload: unknown): this {
    this.record.kind = "update";
    this.record.payload = payload;
    return this.push("update", [payload]);
  }
  upsert(payload: unknown): this {
    this.record.kind = "upsert";
    this.record.payload = payload;
    return this.push("upsert", [payload]);
  }
  delete(): this {
    this.record.kind = "delete";
    return this.push("delete", []);
  }
  eq(column: string, value: unknown): this {
    return this.push("eq", [column, value]);
  }
  neq(column: string, value: unknown): this {
    return this.push("neq", [column, value]);
  }
  in(column: string, values: unknown[]): this {
    return this.push("in", [column, values]);
  }
  is(column: string, value: unknown): this {
    return this.push("is", [column, value]);
  }
  not(column: string, operator: string, value?: unknown): this {
    return this.push("not", [column, operator, value]);
  }
  or(filter: string): this {
    return this.push("or", [filter]);
  }
  order(column: string, opts?: unknown): this {
    return this.push("order", [column, opts]);
  }
  limit(n: number): this {
    return this.push("limit", [n]);
  }
  range(from: number, to: number): this {
    return this.push("range", [from, to]);
  }

  private async resolve(terminal: ChainOpRecord["terminal"]): Promise<ChainResult> {
    this.record.terminal = terminal;
    const op = cloneOp(this.record);
    this.fake.calls.table.push(op);
    const responder = this.fake.tableResponders.get(this.record.table);
    if (!responder) return { data: null, error: null };
    return await responder(op);
  }

  maybeSingle(): Promise<ChainResult> {
    return this.resolve("maybeSingle");
  }
  single(): Promise<ChainResult> {
    return this.resolve("single");
  }

  // Thenable so `await builder` works without an explicit terminal.
  then<TResult1 = ChainResult, TResult2 = never>(
    onfulfilled?: ((value: ChainResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.resolve("await").then(onfulfilled, onrejected);
  }
}

class StorageBucket {
  constructor(private readonly bucket: string, private readonly fake: FakeRoot) {}

  private async invoke(method: StorageOpRecord["method"], args: unknown[]): Promise<StorageResult> {
    const op: StorageOpRecord = { bucket: this.bucket, method, args };
    this.fake.calls.storage.push(op);
    const responder = this.fake.storageResponders.get(this.bucket);
    if (!responder) return { data: null, error: null };
    return await responder(op);
  }

  upload(path: string, body: unknown, options?: unknown): Promise<StorageResult> {
    return this.invoke("upload", [path, body, options]);
  }
  download(path: string): Promise<StorageResult> {
    return this.invoke("download", [path]);
  }
  remove(paths: string[]): Promise<StorageResult> {
    return this.invoke("remove", [paths]);
  }
  createSignedUrl(path: string, expiresIn: number): Promise<StorageResult> {
    return this.invoke("createSignedUrl", [path, expiresIn]);
  }
  list(prefix: string): Promise<StorageResult> {
    return this.invoke("list", [prefix]);
  }
}

interface FakeRoot {
  tableResponders: Map<string, TableResponder>;
  storageResponders: Map<string, StorageResponder>;
  calls: {
    table: ChainOpRecord[];
    storage: StorageOpRecord[];
  };
}

function cloneOp(op: ChainOpRecord): ChainOpRecord {
  return {
    table: op.table,
    kind: op.kind,
    payload: op.payload,
    terminal: op.terminal,
    calls: op.calls.map((c) => ({ method: c.method, args: [...c.args] })),
  };
}

export function createFakeSupabase(): FakeSupabaseHandle {
  const root: FakeRoot = {
    tableResponders: new Map(),
    storageResponders: new Map(),
    calls: { table: [], storage: [] },
  };

  const client: FakeClient = {
    from(table: string) {
      return new QueryBuilder(table, root);
    },
    storage: {
      from(bucket: string) {
        return new StorageBucket(bucket, root);
      },
    },
  };

  return {
    client,
    calls: root.calls,
    find: {
      table(name, predicate) {
        const all = root.calls.table.filter((op) => op.table === name);
        return predicate ? all.filter(predicate) : all;
      },
      storage(bucket, method) {
        const all = root.calls.storage.filter((op) => op.bucket === bucket);
        return method ? all.filter((op) => op.method === method) : all;
      },
    },
    on(table, responder) {
      root.tableResponders.set(table, responder);
    },
    onStorage(bucket, responder) {
      root.storageResponders.set(bucket, responder);
    },
    reset() {
      root.tableResponders.clear();
      root.storageResponders.clear();
      root.calls.table.length = 0;
      root.calls.storage.length = 0;
    },
  };
}

/**
 * Convenience helpers for the most common test patterns. Tests that need a
 * different verdict per-call (e.g. claim succeeds first, second drain pass
 * sees no row) can register a closure-based responder directly via `on()`.
 */
export function staticResponder(result: ChainResult): TableResponder {
  return () => result;
}

export function staticStorageResponder(result: StorageResult): StorageResponder {
  return () => result;
}

/**
 * Builds a per-kind responder so a single table's reads, inserts, updates
 * can be configured independently. Any kind not configured returns
 * `{ data: null, error: null }` — same default as if no responder were
 * installed at all.
 */
export function byKind(map: Partial<Record<ChainOpRecord["kind"], ChainResult | TableResponder>>): TableResponder {
  return (op) => {
    const entry = map[op.kind];
    if (entry === undefined) return { data: null, error: null };
    if (typeof entry === "function") return (entry as TableResponder)(op);
    return entry;
  };
}

/**
 * Find the eq() filter value applied to a column in a chain op. Returns
 * the first matching value or `undefined`. Useful for spec assertions like
 * "this update was scoped to id = 'file-1'".
 */
export function eqArg(op: ChainOpRecord, column: string): unknown {
  for (const c of op.calls) {
    if (c.method === "eq" && c.args[0] === column) return c.args[1];
  }
  return undefined;
}

/** Same as `eqArg` but for `.in(column, [...])` filters. */
export function inArg(op: ChainOpRecord, column: string): unknown[] | undefined {
  for (const c of op.calls) {
    if (c.method === "in" && c.args[0] === column) return c.args[1] as unknown[];
  }
  return undefined;
}

/**
 * tsx (esbuild) compiles `export` to property descriptors with a getter and
 * `configurable: true` but no setter. That's enough for ESM live-binding
 * semantics but breaks `spyOn(mod, "name")` because Jasmine attempts a
 * plain assignment. `redefineExport` redefines the descriptor with a
 * writable value, returning a restore function for `afterEach`.
 *
 * Use this whenever a test needs to swap a module-level export (typically
 * `getServiceSupabase`, `scanForViruses`, `recordAudit`, etc.) for a stub.
 */
export function redefineExport<T extends object, K extends keyof T>(
  mod: T,
  key: K,
  replacement: T[K],
): () => void {
  const previous = Object.getOwnPropertyDescriptor(mod, key);
  Object.defineProperty(mod, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: replacement,
  });
  return () => {
    if (previous) Object.defineProperty(mod, key, previous);
    else delete (mod as Record<string, unknown>)[key as string];
  };
}
