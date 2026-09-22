/** Ordered schema migrations; index + 1 is the resulting PRAGMA user_version. */
export const migrations: string[] = [
  /* 1: initial schema */ `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    starred INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX project_files_project ON project_files(project_id);

  CREATE VIRTUAL TABLE project_chunks USING fts5(
    content,
    file_id UNINDEXED,
    project_id UNINDEXED,
    ord UNINDEXED
  );

  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    starred INTEGER NOT NULL DEFAULT 0,
    current_leaf_id TEXT,
    model_provider TEXT,
    model_id TEXT,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX conversations_updated ON conversations(updated_at DESC);
  CREATE INDEX conversations_project ON conversations(project_id);

  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    parent_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    reasoning TEXT,
    attachments TEXT NOT NULL DEFAULT '[]',
    model TEXT,
    stats TEXT,
    status TEXT NOT NULL DEFAULT 'complete',
    error TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX messages_conversation ON messages(conversation_id, created_at);
  CREATE INDEX messages_parent ON messages(parent_id);

  CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    conversation_id UNINDEXED,
    message_id UNINDEXED
  );

  CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    kind TEXT NOT NULL,
    path TEXT,
    text TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    identifier TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    language TEXT,
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX artifacts_conversation ON artifacts(conversation_id, created_at);

  CREATE TABLE local_models (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL,
    publisher TEXT,
    repo TEXT,
    file_name TEXT NOT NULL,
    shards TEXT NOT NULL DEFAULT '[]',
    mmproj_path TEXT,
    size_bytes INTEGER NOT NULL,
    mtime INTEGER NOT NULL,
    gguf TEXT,
    gguf_error TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE model_presets (
    model_key TEXT PRIMARY KEY,
    load_config TEXT,
    inference TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE downloads (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    label TEXT NOT NULL,
    target TEXT NOT NULL,
    files TEXT NOT NULL,
    status TEXT NOT NULL,
    total_bytes INTEGER NOT NULL DEFAULT 0,
    received_bytes INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    dest_dir TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE provider_configs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE runtimes (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    dir TEXT NOT NULL UNIQUE,
    variant TEXT,
    created_at INTEGER NOT NULL
  );
  `,
  /* 2: Cowork tasks */ `
  ALTER TABLE conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat';
  ALTER TABLE conversations ADD COLUMN task TEXT;
  ALTER TABLE messages ADD COLUMN parts TEXT;
  CREATE INDEX conversations_kind ON conversations(kind, updated_at DESC);
  `,
  /* 3: Customize, Scheduled, embeddings */ `
  CREATE TABLE connectors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    transport TEXT NOT NULL,
    command TEXT NOT NULL DEFAULT '',
    args TEXT NOT NULL DEFAULT '[]',
    env TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    headers TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    tool_policies TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'user',
    conversation_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE scheduled_tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'chat',
    cron TEXT NOT NULL,
    model TEXT,
    folder TEXT,
    permission_mode TEXT NOT NULL DEFAULT 'auto-edits',
    allow_commands INTEGER NOT NULL DEFAULT 0,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at INTEGER,
    last_status TEXT,
    last_fire_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE scheduled_runs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
    conversation_id TEXT,
    trigger TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    started_at INTEGER NOT NULL,
    finished_at INTEGER
  );
  CREATE INDEX scheduled_runs_task ON scheduled_runs(task_id, started_at DESC);

  CREATE TABLE project_vectors (
    file_id TEXT NOT NULL REFERENCES project_files(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL,
    ord INTEGER NOT NULL,
    model TEXT NOT NULL,
    dims INTEGER NOT NULL,
    vector BLOB NOT NULL,
    PRIMARY KEY (file_id, ord, model)
  );
  CREATE INDEX project_vectors_project ON project_vectors(project_id, model);
  `,
  /* 4: Design canvases */ `
  CREATE TABLE designs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
    format TEXT NOT NULL DEFAULT 'custom',
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX designs_updated ON designs(updated_at DESC);
  `,
  /* 5: Math boards */ `
  CREATE TABLE boards (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
    topic TEXT NOT NULL DEFAULT '',
    paper TEXT NOT NULL DEFAULT 'grid',
    angle_mode TEXT NOT NULL DEFAULT 'deg',
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX boards_updated ON boards(updated_at DESC);
  `,
  /* 6: MCP OAuth */ `
  CREATE TABLE connector_oauth (
    connector_id TEXT PRIMARY KEY,
    client_info TEXT NOT NULL DEFAULT '',
    tokens TEXT NOT NULL DEFAULT '',
    code_verifier TEXT NOT NULL DEFAULT '',
    discovery_state TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
  );
  `,
  /* 7: reminders a model sets for itself (one-shot scheduled tasks) */ `
  ALTER TABLE scheduled_tasks ADD COLUMN one_shot INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE scheduled_tasks ADD COLUMN fire_at INTEGER;
  ALTER TABLE scheduled_tasks ADD COLUMN reminder TEXT;
  `,
  /* 8: memory generated from conversations, grouped like Claude's "You" / "Topics" / "Areas" */ `
  CREATE TABLE memory_topics (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX memory_topics_category_title ON memory_topics(category, title);
  CREATE INDEX memory_topics_updated ON memory_topics(updated_at DESC);

  CREATE TABLE memory_processed (
    conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
    message_count INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  /* 9: Design version history */ `
  CREATE TABLE design_versions (
    id TEXT PRIMARY KEY,
    design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    data TEXT NOT NULL,
    source TEXT NOT NULL,
    name TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX design_versions_design ON design_versions(design_id, version DESC);
  `,
  /* 10: Custom fonts for Design */ `
  CREATE TABLE fonts (
    id TEXT PRIMARY KEY,
    family TEXT NOT NULL,
    source TEXT NOT NULL,
    source_ref TEXT,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX fonts_family ON fonts(family);
  `,
  /* 11: Memory retrieval enhancements — history, vectors, confidence columns */ `
  ALTER TABLE memory_topics ADD COLUMN confidence REAL NOT NULL DEFAULT 0.8;
  ALTER TABLE memory_topics ADD COLUMN last_confirmed_at INTEGER;

  CREATE TABLE memory_topic_history (
    id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL REFERENCES memory_topics(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX memory_topic_history_topic ON memory_topic_history(topic_id);

  CREATE TABLE memory_vectors (
    topic_id TEXT PRIMARY KEY REFERENCES memory_topics(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    dims INTEGER NOT NULL,
    vector BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  /* 12: Study — books (a copy of the PDF lives on disk), their text by page, and annotations */ `
  CREATE TABLE books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    hash TEXT NOT NULL,
    size INTEGER NOT NULL,
    page_count INTEGER NOT NULL,
    pages TEXT NOT NULL,
    outline TEXT NOT NULL DEFAULT '[]',
    last_page INTEGER NOT NULL DEFAULT 1,
    annotations TEXT NOT NULL DEFAULT '[]',
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX books_updated ON books(updated_at DESC);
  CREATE INDEX books_hash ON books(hash);

  CREATE TABLE book_pages (
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    page INTEGER NOT NULL,
    text TEXT NOT NULL,
    lines TEXT NOT NULL,
    PRIMARY KEY (book_id, page)
  );

  CREATE VIRTUAL TABLE book_fts USING fts5(
    content,
    book_id UNINDEXED,
    page UNINDEXED,
    tokenize = 'unicode61 remove_diacritics 2'
  );

  CREATE TABLE book_vectors (
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    page INTEGER NOT NULL,
    model TEXT NOT NULL,
    dims INTEGER NOT NULL,
    vector BLOB NOT NULL,
    PRIMARY KEY (book_id, page, model)
  );
  `,
];
