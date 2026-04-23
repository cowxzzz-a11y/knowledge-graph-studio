import { FC, useEffect, useMemo, useState } from "react";

import { DatasetMetadata, GraphNodeAttributes, NodeEvidence, NodeRelationDetail, RelationEvidence } from "../types";

type Props = {
  metadata: DatasetMetadata | null;
  node: GraphNodeAttributes | null;
};

type DocumentTab = {
  key: string;
  label: string;
};

function evidenceKey(item: NodeEvidence, index: number) {
  return [
    item.documentId || item.documentName || "",
    item.locator || "",
    item.evidenceType || "",
    item.paragraphIndex ?? item.tableIndex ?? item.figureIndex ?? "",
    index,
  ].join(":");
}

function sourceLabel(item: Pick<NodeEvidence, "documentId" | "documentName" | "documentTitle">) {
  return item.documentName || item.documentTitle || item.documentId || "未标注文档";
}

function sourceKey(item: Pick<NodeEvidence, "documentId" | "documentName" | "documentTitle">) {
  return item.documentId || item.documentName || item.documentTitle || "unknown";
}

function collectDocumentTabs(node: GraphNodeAttributes, evidence: NodeEvidence[], relations: NodeRelationDetail[]) {
  const tabs = new Map<string, DocumentTab>();
  const tabKeyByLabel = new Map<string, string>();

  const addTab = (key: string, label: string) => {
    const cleanKey = key.trim();
    const cleanLabel = label.trim();
    if (!cleanKey || !cleanLabel) return;

    const normalizedLabel = cleanLabel.toLowerCase();
    const existingKey = tabKeyByLabel.get(normalizedLabel);
    if (existingKey) {
      const existing = tabs.get(existingKey);
      if (existing && existing.key === existing.label && cleanKey !== cleanLabel) {
        tabs.delete(existingKey);
        tabs.set(cleanKey, { key: cleanKey, label: cleanLabel });
        tabKeyByLabel.set(normalizedLabel, cleanKey);
      }
      return;
    }

    tabs.set(cleanKey, { key: cleanKey, label: cleanLabel });
    tabKeyByLabel.set(normalizedLabel, cleanKey);
  };

  node.documentIds?.forEach((documentId, index) => {
    const label = node.documentNames?.[index] || documentId;
    addTab(documentId || label, label);
  });

  evidence.forEach((item) => {
    const key = sourceKey(item);
    addTab(key, sourceLabel(item));
  });

  relations.forEach((relation) => {
    relation.evidence?.forEach((item) => {
      const key = sourceKey(item);
      addTab(key, sourceLabel(item));
    });
    relation.documents?.forEach((documentName) => {
      if (documentName) addTab(documentName, documentName);
    });
  });

  return [...tabs.values()].sort((left, right) => left.label.localeCompare(right.label, "zh-CN"));
}

function evidenceMatchesDocument(item: NodeEvidence | RelationEvidence, documentKey: string) {
  return !documentKey || sourceKey(item) === documentKey || sourceLabel(item) === documentKey;
}

function relationMatchesDocument(item: NodeRelationDetail, documentKey: string) {
  if (!documentKey) return true;
  if (item.evidence?.some((evidence) => evidenceMatchesDocument(evidence, documentKey))) return true;
  return Boolean(item.documents?.some((documentName) => documentName === documentKey));
}

const NodeDetailPanel: FC<Props> = ({ metadata, node }) => {
  const [expandedEvidenceKey, setExpandedEvidenceKey] = useState<string | null>(null);
  const [activeDocumentKey, setActiveDocumentKey] = useState("");

  useEffect(() => {
    setExpandedEvidenceKey(null);
    setActiveDocumentKey("");
  }, [node?.key]);

  const detail = node?.detail || {
    summary: node?.description || "暂无摘要",
    stats: [],
    aliases: [],
    attributes: [],
    evidence: [],
    relations: [],
    children: [],
  };

  const documentTabs = useMemo(
    () => (node ? collectDocumentTabs(node, detail.evidence, detail.relations) : []),
    [detail.evidence, detail.relations, node],
  );

  useEffect(() => {
    if (documentTabs.length > 1 && !documentTabs.some((tab) => tab.key === activeDocumentKey)) {
      setActiveDocumentKey(documentTabs[0].key);
      return;
    }

    if (documentTabs.length <= 1 && activeDocumentKey) {
      setActiveDocumentKey("");
    }
  }, [activeDocumentKey, documentTabs]);

  const filteredEvidence = detail.evidence.filter((item) => evidenceMatchesDocument(item, activeDocumentKey));
  const filteredRelations = detail.relations.filter((item) => relationMatchesDocument(item, activeDocumentKey));

  if (!node) {
    return (
      <aside className="detail-panel">
        <div className="detail-panel-header">
          <div className="detail-panel-title">实体详情</div>
          <div className="detail-panel-subtitle">点击图中的节点后，这里会显示摘要、属性、证据、关系和数据来源。</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel">
      <div className="detail-panel-header">
        <div className="detail-panel-title">{node.label}</div>
        <div className="detail-panel-subtitle">{node.nodeType}</div>
        <div className="detail-chip-row">
          {node.categoryPath ? <span className="detail-chip">{node.categoryPath}</span> : null}
          {node.schemaId ? <span className="detail-chip">{node.schemaId}</span> : null}
          {node.confidence ? <span className="detail-chip">{node.confidence}</span> : null}
        </div>
      </div>

      {documentTabs.length > 1 ? (
        <div className="detail-doc-tabs" role="tablist" aria-label="文档筛选">
          {documentTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`detail-doc-tab${activeDocumentKey === tab.key ? " is-active" : ""}`}
              title={tab.label}
              onClick={() => setActiveDocumentKey(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="detail-panel-section">
        <div className="detail-section-title">摘要</div>
        <div className="detail-copy">{detail.summary || node.description || "暂无摘要"}</div>
      </div>

      {detail.aliases.length > 0 ? (
        <div className="detail-panel-section">
          <div className="detail-section-title">别名</div>
          <div className="detail-chip-row">
            {detail.aliases.map((alias) => (
              <span key={alias} className="detail-chip">
                {alias}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {detail.attributes.length > 0 ? (
        <div className="detail-panel-section">
          <div className="detail-section-title">属性</div>
          <div className="detail-kv-list">
            {detail.attributes.map((item) => (
              <div key={`${item.key}:${item.value}`} className="detail-kv-row">
                <div className="detail-kv-key">{item.key}</div>
                <div className="detail-kv-value">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {filteredEvidence.length > 0 ? (
        <div className="detail-panel-section">
          <div className="detail-section-title">证据</div>
          <div className="detail-list">
            {filteredEvidence.map((item, index) => {
              const key = evidenceKey(item, index);
              const expanded = expandedEvidenceKey === key;
              const sourceText = item.sourceText || item.quote;
              return (
                <button
                  key={key}
                  type="button"
                  className={`detail-list-item detail-evidence-item${expanded ? " is-expanded" : ""}`}
                  title="查看原文段落"
                  aria-expanded={expanded}
                  onClick={() => setExpandedEvidenceKey((current) => (current === key ? null : key))}
                >
                  <div className="detail-list-meta">
                    <span>{sourceLabel(item)}</span>
                    <span>{item.locator}</span>
                    <span>{item.evidenceType}</span>
                    <span>{item.supportType}</span>
                  </div>
                  <div className="detail-list-copy">{item.quote || "暂无引文"}</div>
                  {expanded ? (
                    <div className="detail-source-block">
                      <div className="detail-source-meta">
                        <span>原文</span>
                        {item.sectionTitle ? <span>{item.sectionTitle}</span> : null}
                        {item.pageHint ? <span>页 {item.pageHint}</span> : null}
                      </div>
                      <div className="detail-source-text">{sourceText || "暂无原文"}</div>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {filteredRelations.length > 0 ? (
        <div className="detail-panel-section">
          <div className="detail-section-title">关系</div>
          <div className="detail-list">
            {filteredRelations.map((item, index) => {
              const relationEvidence =
                activeDocumentKey === "all"
                  ? item.evidence || []
                  : (item.evidence || []).filter((evidence) => evidenceMatchesDocument(evidence, activeDocumentKey));
              return (
                <article key={`${item.otherNodeKey}:${item.relationType}:${index}`} className="detail-list-item">
                  <div className="detail-list-meta">
                    <span>{item.direction === "outgoing" ? "出边" : "入边"}</span>
                    <span>{item.relation}</span>
                    <span>{item.confidence || "-"}</span>
                    {item.documentCount ? <span>{item.documentCount} 个文档</span> : null}
                  </div>
                  <div className="detail-list-copy">
                    {item.direction === "outgoing" ? "指向" : "来自"} {item.otherLabel}
                    {item.locator ? ` · ${item.locator}` : ""}
                  </div>
                  {item.documents?.length ? <div className="detail-list-note">{item.documents.join(" / ")}</div> : null}
                  {relationEvidence.slice(0, 3).map((evidence, evidenceIndex) => (
                    <div key={`${sourceKey(evidence)}:${evidence.locator}:${evidenceIndex}`} className="detail-list-note">
                      {sourceLabel(evidence)} · {evidence.locator}
                      {evidence.quote ? ` · ${evidence.quote}` : ""}
                    </div>
                  ))}
                  {!relationEvidence.length && item.quote ? <div className="detail-list-note">{item.quote}</div> : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {detail.children.length > 0 ? (
        <div className="detail-panel-section">
          <div className="detail-section-title">所属文档</div>
          <div className="detail-chip-row">
            {detail.children.map((item) => (
              <span key={item} className="detail-chip">
                {item}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {(node.documentTitle || metadata) ? (
        <div className="detail-panel-section detail-panel-footer">
          <div className="detail-section-title">数据来源</div>
          <div className="detail-copy">
            {metadata?.title || node.documentTitle || node.documentName}
            {metadata?.runLabel ? (
              <>
                <br />
                {metadata.runLabel}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
};

export default NodeDetailPanel;
