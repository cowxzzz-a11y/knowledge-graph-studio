import { FC } from "react";

import { DatasetMetadata, GraphNodeAttributes } from "../types";

type Props = {
  metadata: DatasetMetadata | null;
  node: GraphNodeAttributes | null;
};

const NodeDetailPanel: FC<Props> = ({ metadata, node }) => {
  if (!node) {
    return (
      <aside className="detail-panel">
        <div className="detail-panel-header">
          <div className="detail-panel-title">实体详情</div>
          <div className="detail-panel-subtitle">点击左侧图谱中的节点后，这里会显示属性、证据和关系。</div>
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
            {detail.evidence.map((item, index) => (
              <article key={`${item.locator}:${index}`} className="detail-list-item">
                <div className="detail-list-meta">
                  <span>{item.locator}</span>
                  <span>{item.evidenceType}</span>
                  <span>{item.supportType}</span>
                </div>
                <div className="detail-list-copy">{item.quote || "暂无引文"}</div>
              </article>
            ))}
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
                </div>
                <div className="detail-list-copy">
                  {item.direction === "outgoing" ? "指向" : "来自"} {item.otherLabel}
                  {item.locator ? ` · ${item.locator}` : ""}
                </div>
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

      {metadata ? (
        <div className="detail-panel-section detail-panel-footer">
          <div className="detail-section-title">数据来源</div>
          <div className="detail-copy">
            {metadata.documentName}
            <br />
            {metadata.runLabel}
          </div>
        </div>
      ) : null}
    </aside>
  );
};

export default NodeDetailPanel;
