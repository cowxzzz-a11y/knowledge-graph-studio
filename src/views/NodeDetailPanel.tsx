import { FC, useEffect, useState } from "react";

import { DatasetMetadata, GraphNodeAttributes, NodeEvidence } from "../types";

type Props = {
  metadata: DatasetMetadata | null;
  node: GraphNodeAttributes | null;
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

const NodeDetailPanel: FC<Props> = ({ metadata, node }) => {
  const [expandedEvidenceKey, setExpandedEvidenceKey] = useState<string | null>(null);

  useEffect(() => {
    setExpandedEvidenceKey(null);
  }, [node?.key]);

  if (!node) {
    return (
      <aside className="detail-panel">
        <div className="detail-panel-header">
          <div className="detail-panel-title">实体详情</div>
          <div className="detail-panel-subtitle">
            点击图中的节点后，这里会显示摘要、属性、证据、关系以及该节点所属文档。
          </div>
        </div>
      </aside>
    );
  }

  const detail = node.detail || {
    summary: node.description || "暂无摘要",
    stats: [],
    aliases: [],
    attributes: [],
    evidence: [],
    relations: [],
    children: [],
  };

  return (
    <aside className="detail-panel">
      <div className="detail-panel-header">
        <div className="detail-panel-title">{node.label}</div>
        <div className="detail-panel-subtitle">{node.nodeType}</div>
        <div className="detail-chip-row">
          {node.documentName ? <span className="detail-chip">{node.documentName}</span> : null}
          {node.categoryPath ? <span className="detail-chip">{node.categoryPath}</span> : null}
          {node.schemaId ? <span className="detail-chip">{node.schemaId}</span> : null}
          {node.confidence ? <span className="detail-chip">{node.confidence}</span> : null}
        </div>
      </div>

      <div className="detail-panel-section">
        <div className="detail-section-title">摘要</div>
        <div className="detail-copy">{detail.summary || node.description || "暂无摘要"}</div>
      </div>

      {detail.stats.length > 0 ? (
        <div className="detail-panel-section">
          <div className="detail-section-title">关键信息</div>
          <div className="detail-stats">
            {detail.stats.map((item) => (
              <div key={`${item.label}:${item.value}`} className="detail-stat-card">
                <div className="detail-stat-label">{item.label}</div>
                <div className="detail-stat-value">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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

      {detail.evidence.length > 0 ? (
        <div className="detail-panel-section">
          <div className="detail-section-title">证据</div>
          <div className="detail-list">
            {detail.evidence.map((item, index) => {
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
                    {item.documentName ? <span>{item.documentName}</span> : null}
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

      {detail.relations.length > 0 ? (
        <div className="detail-panel-section">
          <div className="detail-section-title">关系</div>
          <div className="detail-list">
            {detail.relations.map((item, index) => (
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
                {item.quote ? <div className="detail-list-note">{item.quote}</div> : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {detail.children.length > 0 ? (
        <div className="detail-panel-section">
          <div className="detail-section-title">代表子项</div>
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
            {node.documentTitle || node.documentName}
            {node.documentTitle && node.documentName && node.documentTitle !== node.documentName ? (
              <>
                <br />
                {node.documentName}
              </>
            ) : null}
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
