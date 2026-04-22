import { FC, useEffect, useMemo, useRef, useState } from "react";

type ConfigTab = "schema" | "merge";

interface SchemaEntityRow {
  schema_id: string;
  primary_category: string;
  secondary_category?: string | null;
  tertiary_category?: string | null;
  storage_mode?: string;
  priority?: string;
  definition?: string;
  preferred_evidence?: string[];
  schema_section?: string;
  typical_objects?: string[];
}

interface SchemaRelationRow {
  relation_type: string;
  meaning?: string;
  recommended_source_categories?: string[];
  recommended_target_categories?: string[];
}

interface SchemaConfig {
  schema_version: string;
  source_markdown_path?: string;
  heading_index?: Array<Record<string, unknown>>;
  entity_schemas: SchemaEntityRow[];
  relation_schemas: SchemaRelationRow[];
}

interface MergeConfig {
  version: string;
  normalization: {
    generic_trailing_tokens: string[];
    surface_separator_pattern: string;
    strip_locator_prefix: boolean;
    min_core_chars_after_suffix_strip: number;
  };
  display_name: {
    prefer_non_generic_suffix: boolean;
    prefer_shorter_core_when_same: boolean;
  };
  attrs: {
    max_values_per_attr: number;
  };
  evidence: {
    dedupe_fields: string[];
    normalize_quote: boolean;
  };
}

const SCHEMA_CONFIG_URL = "/configs/schema_config.json";
const MERGE_CONFIG_URL = "/configs/entity_merge_config.json";
const CONFIG_API_BASE = "http://127.0.0.1:8765/api/config";

const EMPTY_SCHEMA_ROW: SchemaEntityRow = {
  schema_id: "new_schema",
  primary_category: "",
  secondary_category: "",
  tertiary_category: "",
  storage_mode: "实体节点",
  priority: "P2",
  definition: "",
  preferred_evidence: ["paragraph"],
  schema_section: "",
};

const EMPTY_RELATION_ROW: SchemaRelationRow = {
  relation_type: "new_relation",
  meaning: "",
  recommended_source_categories: [],
  recommended_target_categories: [],
};

function splitList(value: string): string[] {
  return value
    .split(/[\n,，、;；/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinList(value: string[] | undefined): string {
  return (value || []).join("、");
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

async function fetchConfig<T>(kind: "schema" | "merge", fallbackUrl: string): Promise<{ data: T; live: boolean }> {
  try {
    return { data: await fetchJson<T>(`${CONFIG_API_BASE}/${kind}`), live: true };
  } catch {
    return { data: await fetchJson<T>(fallbackUrl), live: false };
  }
}

async function writeConfig(kind: "schema" | "merge", data: unknown): Promise<void> {
  const response = await fetch(`${CONFIG_API_BASE}/${kind}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`config api HTTP ${response.status}`);
  }
}

async function resetConfig<T>(kind: "schema" | "merge"): Promise<T> {
  const response = await fetch(`${CONFIG_API_BASE}/${kind}/reset`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`config api HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { data: T };
  return payload.data;
}

async function saveJsonFile(filename: string, data: unknown): Promise<"saved" | "downloaded"> {
  const json = JSON.stringify(data, null, 2);
  const picker = (window as unknown as {
    showSaveFilePicker?: (options: unknown) => Promise<{
      createWritable: () => Promise<{
        write: (content: string) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  }).showSaveFilePicker;

  if (picker) {
    const handle = await picker({
      suggestedName: filename,
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    return "saved";
  }

  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}

const ConfigManager: FC = () => {
  const [activeTab, setActiveTab] = useState<ConfigTab>("schema");
  const [schemaConfig, setSchemaConfig] = useState<SchemaConfig | null>(null);
  const [mergeConfig, setMergeConfig] = useState<MergeConfig | null>(null);
  const [schemaQuery, setSchemaQuery] = useState("");
  const [relationQuery, setRelationQuery] = useState("");
  const [newSuffix, setNewSuffix] = useState("");
  const [newEvidenceField, setNewEvidenceField] = useState("");
  const [status, setStatus] = useState("正在加载配置...");
  const [error, setError] = useState<string | null>(null);
  const [liveSync, setLiveSync] = useState(false);
  const [highlightedEntityIndex, setHighlightedEntityIndex] = useState<number | null>(null);
  const skipAutoSaveRef = useRef({ schema: true, merge: true });

  useEffect(() => {
    let cancelled = false;
    async function loadConfigs() {
      try {
        const [schemaResult, mergeResult] = await Promise.all([
          fetchConfig<SchemaConfig>("schema", SCHEMA_CONFIG_URL),
          fetchConfig<MergeConfig>("merge", MERGE_CONFIG_URL),
        ]);
        if (!cancelled) {
          setSchemaConfig(schemaResult.data);
          setMergeConfig(mergeResult.data);
          setLiveSync(schemaResult.live && mergeResult.live);
          setStatus(schemaResult.live && mergeResult.live ? "配置已加载，修改会自动同步到 JSON" : "配置已加载，本地配置 API 未启动");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "unknown error");
          setStatus("配置加载失败");
        }
      }
    }
    void loadConfigs();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!schemaConfig) return;
    if (skipAutoSaveRef.current.schema) {
      skipAutoSaveRef.current.schema = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void persistConfig("schema", schemaConfig);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [schemaConfig]);

  useEffect(() => {
    if (!mergeConfig) return;
    if (skipAutoSaveRef.current.merge) {
      skipAutoSaveRef.current.merge = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void persistConfig("merge", mergeConfig);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [mergeConfig]);

  const filteredEntities = useMemo(() => {
    const query = schemaQuery.trim().toLowerCase();
    const items = schemaConfig?.entity_schemas || [];
    if (!query) return items.map((item, index) => ({ item, index }));
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) =>
        [
          item.schema_id,
          item.primary_category,
          item.secondary_category,
          item.tertiary_category,
          item.definition,
          item.priority,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
  }, [schemaConfig, schemaQuery]);

  const filteredRelations = useMemo(() => {
    const query = relationQuery.trim().toLowerCase();
    const items = schemaConfig?.relation_schemas || [];
    if (!query) return items.map((item, index) => ({ item, index }));
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) =>
        [
          item.relation_type,
          item.meaning,
          joinList(item.recommended_source_categories),
          joinList(item.recommended_target_categories),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
  }, [relationQuery, schemaConfig]);

  const entityTree = useMemo(() => {
    const groups = new Map<
      string,
      {
        count: number;
        firstIndex: number;
        children: Map<string, { count: number; firstIndex: number }>;
      }
    >();
    (schemaConfig?.entity_schemas || []).forEach((item, index) => {
      const primary = (item.primary_category || "未分类").trim();
      const secondary = (item.secondary_category || "").trim();
      if (!groups.has(primary)) {
        groups.set(primary, { count: 0, firstIndex: index, children: new Map() });
      }
      const group = groups.get(primary)!;
      group.count += 1;
      group.firstIndex = Math.min(group.firstIndex, index);
      if (secondary) {
        const current = group.children.get(secondary);
        if (current) {
          current.count += 1;
        } else {
          group.children.set(secondary, { count: 1, firstIndex: index });
        }
      }
    });
    return Array.from(groups.entries()).map(([primary, group]) => ({
      primary,
      count: group.count,
      firstIndex: group.firstIndex,
      children: Array.from(group.children.entries()).map(([secondary, info]) => ({ secondary, ...info })),
    }));
  }, [schemaConfig]);

  function patchEntity(index: number, patch: Partial<SchemaEntityRow>) {
    setSchemaConfig((current) => {
      if (!current) return current;
      const next = cloneJson(current);
      next.entity_schemas[index] = { ...next.entity_schemas[index], ...patch };
      return next;
    });
  }

  function patchRelation(index: number, patch: Partial<SchemaRelationRow>) {
    setSchemaConfig((current) => {
      if (!current) return current;
      const next = cloneJson(current);
      next.relation_schemas[index] = { ...next.relation_schemas[index], ...patch };
      return next;
    });
  }

  function updateMergeSection<K extends keyof MergeConfig>(section: K, patch: Partial<MergeConfig[K]>) {
    setMergeConfig((current) => {
      if (!current) return current;
      const sectionValue = current[section] as Record<string, unknown>;
      return { ...current, [section]: { ...sectionValue, ...patch } };
    });
  }

  async function persistConfig(kind: "schema" | "merge", data: unknown) {
    try {
      await writeConfig(kind, data);
      setLiveSync(true);
      setError(null);
      setStatus(kind === "schema" ? "Schema 已自动同步到 JSON" : "合并规则已自动同步到 JSON");
    } catch (saveError) {
      setLiveSync(false);
      setError(saveError instanceof Error ? saveError.message : "config api unavailable");
      setStatus("本地配置 API 未启动，修改暂时只在页面内");
    }
  }

  async function exportConfig(kind: "schema" | "merge") {
    const data = kind === "schema" ? schemaConfig : mergeConfig;
    if (!data) return;
    try {
      await writeConfig(kind, data);
      setLiveSync(true);
      setError(null);
      setStatus(kind === "schema" ? "Schema 已同步到 JSON" : "合并规则已同步到 JSON");
    } catch {
      const result = await saveJsonFile(kind === "schema" ? "schema_config.json" : "entity_merge_config.json", data);
      setStatus(result === "saved" ? "配置已保存" : "配置已导出");
    }
  }

  async function resetCurrentConfig() {
    const kind = activeTab === "schema" ? "schema" : "merge";
    const label = kind === "schema" ? "Schema 配置" : "合并配置";
    if (!window.confirm(`确定重置 ${label} 吗？当前修改会被默认配置覆盖。`)) {
      return;
    }
    try {
      if (kind === "schema") {
        skipAutoSaveRef.current.schema = true;
        setSchemaConfig(await resetConfig<SchemaConfig>("schema"));
      } else {
        skipAutoSaveRef.current.merge = true;
        setMergeConfig(await resetConfig<MergeConfig>("merge"));
      }
      setLiveSync(true);
      setError(null);
      setStatus(`${label} 已重置为默认版本`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "reset failed");
      setStatus("重置失败，本地配置 API 未连接");
    }
  }

  function scrollToEntity(index: number) {
    setSchemaQuery("");
    window.setTimeout(() => {
      document.getElementById(`schema-entity-${index}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlightedEntityIndex(index);
      window.setTimeout(() => setHighlightedEntityIndex((current) => (current === index ? null : current)), 2600);
    }, 40);
  }

  function addSuffix() {
    const token = newSuffix.trim();
    if (!token || !mergeConfig) return;
    updateMergeSection("normalization", {
      generic_trailing_tokens: Array.from(new Set([...mergeConfig.normalization.generic_trailing_tokens, token])),
    });
    setNewSuffix("");
  }

  function addEvidenceField() {
    const field = newEvidenceField.trim();
    if (!field || !mergeConfig) return;
    updateMergeSection("evidence", {
      dedupe_fields: Array.from(new Set([...mergeConfig.evidence.dedupe_fields, field])),
    });
    setNewEvidenceField("");
  }

  return (
    <div id="app-root" className="config-root">
      <header className="config-header">
        <div>
          <a className="config-back-link" href="/">
            返回图谱
          </a>
          <h1>知识图谱约束配置</h1>
          <p>{status}</p>
        </div>
        <div className="config-actions">
          <span className={liveSync ? "config-sync is-live" : "config-sync"}>{liveSync ? "实时同步" : "未连接同步"}</span>
          <button type="button" onClick={() => void exportConfig("schema")} disabled={!schemaConfig}>
            保存 Schema
          </button>
          <button type="button" onClick={() => void exportConfig("merge")} disabled={!mergeConfig}>
            保存合并规则
          </button>
          <button type="button" className="config-reset-button" onClick={() => void resetCurrentConfig()}>
            重置当前配置
          </button>
        </div>
      </header>

      <nav className="config-tabs" aria-label="配置标签页">
        <button className={activeTab === "schema" ? "is-active" : ""} type="button" onClick={() => setActiveTab("schema")}>
          Schema 约束
        </button>
        <button className={activeTab === "merge" ? "is-active" : ""} type="button" onClick={() => setActiveTab("merge")}>
          合并约束
        </button>
      </nav>

      {error ? <div className="config-alert">{error}</div> : null}

      {activeTab === "schema" && schemaConfig ? (
        <main className="config-workspace">
          <section className="config-toolbar">
            <div className="config-stat">
              <span>实体类型</span>
              <strong>{schemaConfig.entity_schemas.length}</strong>
            </div>
            <div className="config-stat">
              <span>关系类型</span>
              <strong>{schemaConfig.relation_schemas.length}</strong>
            </div>
            <button
              type="button"
              onClick={() =>
                setSchemaConfig((current) =>
                  current
                    ? { ...current, entity_schemas: [{ ...EMPTY_SCHEMA_ROW, schema_id: `new_schema_${current.entity_schemas.length + 1}` }, ...current.entity_schemas] }
                    : current,
                )
              }
            >
              新增实体类型
            </button>
            <button
              type="button"
              onClick={() =>
                setSchemaConfig((current) =>
                  current
                    ? { ...current, relation_schemas: [{ ...EMPTY_RELATION_ROW, relation_type: `new_relation_${current.relation_schemas.length + 1}` }, ...current.relation_schemas] }
                    : current,
                )
              }
            >
              新增关系规则
            </button>
          </section>

          <div className="schema-editor-layout">
            <aside className="schema-tree">
              <h2>对象树</h2>
              {entityTree.map((group) => (
                <div className="schema-tree-group" key={group.primary}>
                  <button type="button" onClick={() => scrollToEntity(group.firstIndex)}>
                    <span>{group.primary}</span>
                    <strong>{group.count}</strong>
                  </button>
                  {group.children.length ? (
                    <div className="schema-tree-children">
                      {group.children.map((child) => (
                        <button type="button" key={`${group.primary}:${child.secondary}`} onClick={() => scrollToEntity(child.firstIndex)}>
                          <span>{child.secondary}</span>
                          <strong>{child.count}</strong>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </aside>

          <section className="config-section schema-table-section">
            <div className="config-section-title">
              <h2>实体 Schema</h2>
              <input value={schemaQuery} onChange={(event) => setSchemaQuery(event.target.value)} placeholder="搜索实体类型" />
            </div>
            <div className="schema-grid">
              <div className="schema-row schema-row-header">
                <span>Schema ID</span>
                <span>一级类别</span>
                <span>二级类别</span>
                <span>三级类别</span>
                <span>重要度</span>
                <span>存储方式</span>
                <span>证据类型</span>
                <span>定义</span>
                <span>操作</span>
              </div>
              {filteredEntities.map(({ item, index }) => (
                <article
                  className={highlightedEntityIndex === index ? "schema-row is-highlighted" : "schema-row"}
                  id={`schema-entity-${index}`}
                  key={`${item.schema_id}:${index}`}
                >
                  <input value={item.schema_id || ""} onChange={(event) => patchEntity(index, { schema_id: event.target.value })} placeholder="schema_id" />
                  <input value={item.primary_category || ""} onChange={(event) => patchEntity(index, { primary_category: event.target.value })} placeholder="一级类别" />
                  <input value={item.secondary_category || ""} onChange={(event) => patchEntity(index, { secondary_category: event.target.value })} placeholder="二级类别" />
                  <input value={item.tertiary_category || ""} onChange={(event) => patchEntity(index, { tertiary_category: event.target.value })} placeholder="三级类别" />
                  <select value={item.priority || "P2"} onChange={(event) => patchEntity(index, { priority: event.target.value })}>
                    <option value="P0">P0</option>
                    <option value="P1">P1</option>
                    <option value="P2">P2</option>
                  </select>
                  <input value={item.storage_mode || ""} onChange={(event) => patchEntity(index, { storage_mode: event.target.value })} placeholder="存储模式" />
                  <input value={joinList(item.preferred_evidence)} onChange={(event) => patchEntity(index, { preferred_evidence: splitList(event.target.value) })} placeholder="证据类型" />
                  <textarea value={item.definition || ""} onChange={(event) => patchEntity(index, { definition: event.target.value })} placeholder="定义" />
                  <button
                    className="config-danger"
                    type="button"
                    onClick={() =>
                      setSchemaConfig((current) =>
                        current ? { ...current, entity_schemas: current.entity_schemas.filter((_, itemIndex) => itemIndex !== index) } : current,
                      )
                    }
                  >
                    删除
                  </button>
                </article>
              ))}
            </div>
          </section>
          </div>

          <section className="config-section">
            <div className="config-section-title">
              <h2>关系白名单</h2>
              <input value={relationQuery} onChange={(event) => setRelationQuery(event.target.value)} placeholder="搜索关系类型" />
            </div>
            <div className="relation-grid">
              {filteredRelations.map(({ item, index }) => (
                <article className="relation-row" key={`${item.relation_type}:${index}`}>
                  <input value={item.relation_type || ""} onChange={(event) => patchRelation(index, { relation_type: event.target.value })} placeholder="relation_type" />
                  <input value={item.meaning || ""} onChange={(event) => patchRelation(index, { meaning: event.target.value })} placeholder="含义" />
                  <input
                    value={joinList(item.recommended_source_categories)}
                    onChange={(event) => patchRelation(index, { recommended_source_categories: splitList(event.target.value) })}
                    placeholder="推荐源类别"
                  />
                  <input
                    value={joinList(item.recommended_target_categories)}
                    onChange={(event) => patchRelation(index, { recommended_target_categories: splitList(event.target.value) })}
                    placeholder="推荐目标类别"
                  />
                  <button
                    className="config-danger"
                    type="button"
                    onClick={() =>
                      setSchemaConfig((current) =>
                        current ? { ...current, relation_schemas: current.relation_schemas.filter((_, itemIndex) => itemIndex !== index) } : current,
                      )
                    }
                  >
                    删除
                  </button>
                </article>
              ))}
            </div>
          </section>
        </main>
      ) : null}

      {activeTab === "merge" && mergeConfig ? (
        <main className="config-workspace">
          <section className="config-toolbar">
            <div className="config-stat">
              <span>语义后缀</span>
              <strong>{mergeConfig.normalization.generic_trailing_tokens.length}</strong>
            </div>
            <div className="config-stat">
              <span>证据去重字段</span>
              <strong>{mergeConfig.evidence.dedupe_fields.length}</strong>
            </div>
          </section>

          <section className="config-section config-form">
            <h2>实体归一化</h2>
            <label>
              分隔符正则
              <input
                value={mergeConfig.normalization.surface_separator_pattern}
                onChange={(event) => updateMergeSection("normalization", { surface_separator_pattern: event.target.value })}
              />
            </label>
            <label>
              去后缀后最短字数
              <input
                type="number"
                min={1}
                value={mergeConfig.normalization.min_core_chars_after_suffix_strip}
                onChange={(event) => updateMergeSection("normalization", { min_core_chars_after_suffix_strip: Number(event.target.value) })}
              />
            </label>
            <label className="config-check">
              <input
                type="checkbox"
                checked={mergeConfig.normalization.strip_locator_prefix}
                onChange={(event) => updateMergeSection("normalization", { strip_locator_prefix: event.target.checked })}
              />
              去掉表/图/编号前缀
            </label>
            <div className="config-chip-editor">
              <div className="config-chip-list">
                {mergeConfig.normalization.generic_trailing_tokens.map((token) => (
                  <button
                    type="button"
                    key={token}
                    onClick={() =>
                      updateMergeSection("normalization", {
                        generic_trailing_tokens: mergeConfig.normalization.generic_trailing_tokens.filter((item) => item !== token),
                      })
                    }
                  >
                    {token}
                  </button>
                ))}
              </div>
              <div className="config-inline-add">
                <input value={newSuffix} onChange={(event) => setNewSuffix(event.target.value)} placeholder="新增语义后缀" />
                <button type="button" onClick={addSuffix}>
                  添加
                </button>
              </div>
            </div>
          </section>

          <section className="config-section config-form">
            <h2>属性与证据合并</h2>
            <label>
              单个属性最多保留值数
              <input
                type="number"
                min={1}
                value={mergeConfig.attrs.max_values_per_attr}
                onChange={(event) => updateMergeSection("attrs", { max_values_per_attr: Number(event.target.value) })}
              />
            </label>
            <label className="config-check">
              <input
                type="checkbox"
                checked={mergeConfig.evidence.normalize_quote}
                onChange={(event) => updateMergeSection("evidence", { normalize_quote: event.target.checked })}
              />
              证据 quote 归一化后再去重
            </label>
            <div className="config-chip-editor">
              <div className="config-chip-list">
                {mergeConfig.evidence.dedupe_fields.map((field) => (
                  <button
                    type="button"
                    key={field}
                    onClick={() =>
                      updateMergeSection("evidence", {
                        dedupe_fields: mergeConfig.evidence.dedupe_fields.filter((item) => item !== field),
                      })
                    }
                  >
                    {field}
                  </button>
                ))}
              </div>
              <div className="config-inline-add">
                <input value={newEvidenceField} onChange={(event) => setNewEvidenceField(event.target.value)} placeholder="新增去重字段" />
                <button type="button" onClick={addEvidenceField}>
                  添加
                </button>
              </div>
            </div>
          </section>
        </main>
      ) : null}
    </div>
  );
};

export default ConfigManager;
