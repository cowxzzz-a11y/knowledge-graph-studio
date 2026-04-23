import { SigmaContainer } from "@react-sigma/core";
import { MultiDirectedGraph } from "graphology";
import { FC, useEffect, useMemo, useState } from "react";
import { Settings } from "sigma/settings";

import { drawHover, drawLabel } from "../canvas-utils";
import { buildGraphScene } from "../graph-scene";
import { Dataset, GraphControls } from "../types";
import GraphControlPanel from "./GraphControlPanel";
import GraphEdgeOverlay from "./GraphEdgeOverlay";
import GraphEventsController from "./GraphEventsController";
import GraphPhysicsController from "./GraphPhysicsController";
import GraphSettingsController from "./GraphSettingsController";
import GraphViewportController from "./GraphViewportController";
import ConfigManager from "./ConfigManager";
import NodeDetailPanel from "./NodeDetailPanel";

const DEFAULT_DATASET_URL = "/datasets/knowledge-base-current.json";
const KNOWLEDGE_BASES_URL = "/api/knowledge-bases";

const DEFAULT_CONTROLS: GraphControls = {
  searchQuery: "",
  showArrows: false,
  showOrphans: true,
  textOpacity: 0.82,
  nodeScale: 1,
  edgeScale: 1,
  edgeOpacity: 1.05,
  edgeGray: 132,
  gravity: 1,
  repulsion: 1,
  neighborAttraction: 1,
  linkLength: 1,
  viewMode: "structure",
};

interface KnowledgeBaseListItem {
  id: string;
  title: string;
  dirName: string;
  lastModified: string;
  documentCount: number;
  entityCount: number;
  relationCount: number;
  datasetUrl: string;
}

function resolveExplicitDatasetUrl() {
  const params = new URLSearchParams(window.location.search);
  const dataset = params.get("dataset")?.trim();
  if (dataset) return dataset;

  const knowledgeBaseId = params.get("kb")?.trim();
  if (knowledgeBaseId) {
    return `/api/knowledge-bases/${encodeURIComponent(knowledgeBaseId)}/dataset`;
  }

  return null;
}

const GraphApp: FC<{ datasetUrl: string }> = ({ datasetUrl }) => {
  const graph = useMemo(() => new MultiDirectedGraph(), []);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [controls, setControls] = useState<GraphControls>(DEFAULT_CONTROLS);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scene = useMemo(
    () => (dataset ? buildGraphScene(dataset, controls.viewMode) : null),
    [controls.viewMode, dataset],
  );
  const viewportKey = useMemo(
    () => (scene ? `${controls.viewMode}:${scene.nodes.length}:${scene.edges.length}` : "empty"),
    [controls.viewMode, scene],
  );
  const settleKey = useMemo(
    () =>
      `${viewportKey}:${controls.gravity}:${controls.repulsion}:${controls.neighborAttraction}:${controls.linkLength}`,
    [controls.gravity, controls.linkLength, controls.neighborAttraction, controls.repulsion, viewportKey],
  );

  const selectedNodeData =
    scene && selectedNode && scene.nodeIndex[selectedNode] && !scene.nodeIndex[selectedNode].isDocumentLabel
      ? scene.nodeIndex[selectedNode]
      : null;
  const documentCount = dataset?.metadata?.documentCount ?? scene?.documentZones.length ?? 0;

  const sigmaSettings: Partial<Settings> = useMemo(
    () => ({
      defaultDrawNodeLabel: drawLabel,
      defaultDrawNodeHover: drawHover,
      defaultEdgeType: "line",
      renderEdgeLabels: false,
      labelDensity: 1,
      labelGridCellSize: 1,
      labelRenderedSizeThreshold: 0,
      labelFont: "\"Avenir Next\", \"Inter\", \"PingFang SC\", sans-serif",
      labelWeight: "400",
      zoomToSizeRatioFunction: () => 1,
      minCameraRatio: 0.095,
      maxCameraRatio: 2.1,
      minEdgeThickness: 0.44,
      antiAliasingFeather: 0.45,
      hideEdgesOnMove: false,
      zIndex: true,
      doubleClickZoomingRatio: 1,
      doubleClickZoomingDuration: 0,
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDataset() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(datasetUrl, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as Dataset;
        if (!cancelled) {
          setDataset(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "unknown error");
          setDataset(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDataset();

    return () => {
      cancelled = true;
    };
  }, [datasetUrl]);

  useEffect(() => {
    graph.clear();

    if (!scene) {
      setHoveredNode(null);
      setSelectedNode(null);
      return;
    }

    scene.nodes.forEach((node) => {
      graph.addNode(node.key, {
        ...node,
        hidden: false,
      });
    });

    scene.edges.forEach((edge) => {
      if (!graph.hasEdge(edge.key)) {
        graph.addEdgeWithKey(edge.key, edge.source, edge.target, edge);
      }
    });

    setHoveredNode(null);
    setSelectedNode((current) => {
      if (!current) return null;
      return scene.nodeIndex[current] ? current : null;
    });
  }, [graph, scene]);

  return (
    <div id="app-root" className="obsidian-root">
      <div className="graph-topbar">
        <div className="graph-tab">
          <span className="graph-tab-icon" />
          <span>{dataset?.metadata?.title || "Knowledge Graph Studio"}</span>
        </div>
        <div className="graph-topbar-meta">
          <a className="graph-topbar-link" href="/">
            切换知识库
          </a>
          <a className="graph-topbar-link" href="?view=config">
            配置管理
          </a>
          <span>{documentCount ? `${documentCount} 个文档` : "等待数据集加载"}</span>
          <span>{controls.viewMode === "structure" ? "知识结构视图" : "关系图谱视图"}</span>
        </div>
      </div>

      <GraphControlPanel
        controls={controls}
        collapsed={controlsCollapsed}
        onChange={(patch) => setControls((current) => ({ ...current, ...patch }))}
        onToggleCollapsed={() => setControlsCollapsed((current) => !current)}
      />

      {selectedNodeData ? <NodeDetailPanel metadata={dataset?.metadata || null} node={selectedNodeData} /> : null}

      {loading ? <div className="graph-status-card">正在加载图谱数据...</div> : null}
      {!loading && error ? <div className="graph-status-card graph-status-error">数据加载失败: {error}</div> : null}

      <SigmaContainer graph={graph} settings={sigmaSettings} className="obsidian-sigma">
        <GraphEdgeOverlay controls={controls} scene={scene} />
        <GraphViewportController viewportKey={viewportKey} expectedNodeCount={scene?.nodes.length || 0} scene={scene} />
        <GraphSettingsController hoveredNode={hoveredNode} selectedNode={selectedNode} controls={controls} />
        <GraphEventsController setHoveredNode={setHoveredNode} setSelectedNode={setSelectedNode} />
        <GraphPhysicsController controls={controls} settleKey={settleKey} />
      </SigmaContainer>
    </div>
  );
};

const KnowledgeBaseSelector: FC = () => {
  const [items, setItems] = useState<KnowledgeBaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadKnowledgeBases() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(KNOWLEDGE_BASES_URL, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const data = (await response.json()) as { items?: KnowledgeBaseListItem[] };
        if (!cancelled) {
          setItems(data.items || []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadKnowledgeBases();

    return () => {
      cancelled = true;
    };
  }, []);

  function openKnowledgeBase(id: string) {
    window.location.href = `?kb=${encodeURIComponent(id)}`;
  }

  return (
    <div id="app-root" className="kb-selector-root">
      <header className="kb-selector-header">
        <div>
          <h1>选择知识库</h1>
          <p>从 knowledge-graph-service/data 目录加载图谱数据</p>
        </div>
        <a className="graph-topbar-link" href="?view=config">
          配置管理
        </a>
      </header>

      <main className="kb-selector-main">
        {loading ? <div className="graph-status-card">正在读取知识库目录...</div> : null}
        {!loading && error ? (
          <section className="kb-selector-empty">
            <h2>知识库目录读取失败</h2>
            <p>{error}</p>
            <a className="graph-topbar-link" href={`?dataset=${encodeURIComponent(DEFAULT_DATASET_URL)}`}>
              打开当前同步数据
            </a>
          </section>
        ) : null}
        {!loading && !error && !items.length ? (
          <section className="kb-selector-empty">
            <h2>还没有可显示的知识库</h2>
            <p>重新运行抽取流程后，这里会显示 data 目录下包含 studio_dataset.json 的知识库。</p>
          </section>
        ) : null}
        {!loading && !error && items.length ? (
          <section className="kb-list">
            {items.map((item) => (
              <button className="kb-card" type="button" key={item.id} onClick={() => openKnowledgeBase(item.id)}>
                <span className="kb-card-title">{item.title}</span>
                <span className="kb-card-dir">{item.dirName}</span>
                <span className="kb-card-stats">
                  <strong>{item.documentCount}</strong> 文档
                  <strong>{item.entityCount}</strong> 实体
                  <strong>{item.relationCount}</strong> 关系
                </span>
                <span className="kb-card-time">{new Date(item.lastModified).toLocaleString()}</span>
              </button>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  );
};

const Root: FC = () => {
  const appView = new URLSearchParams(window.location.search).get("view");
  if (appView === "config") {
    return <ConfigManager />;
  }

  const datasetUrl = resolveExplicitDatasetUrl();
  return datasetUrl ? <GraphApp datasetUrl={datasetUrl} /> : <KnowledgeBaseSelector />;
};

export default Root;
