import { SigmaContainer } from "@react-sigma/core";
import { UndirectedGraph } from "graphology";
import { FC, useEffect, useMemo, useState } from "react";
import { Settings } from "sigma/settings";

import { drawHover, drawLabel } from "../canvas-utils";
import { createMockDataset } from "../mock-data";
import { createObsidianScene } from "../obsidian-scene";
import { GraphControls } from "../types";
import GraphControlPanel from "./GraphControlPanel";
import GraphEventsController from "./GraphEventsController";
import GraphPhysicsController from "./GraphPhysicsController";
import GraphSettingsController from "./GraphSettingsController";
import GraphViewportController from "./GraphViewportController";

const DEFAULT_CONTROLS: GraphControls = {
  searchQuery: "",
  showArrows: false,
  showOrphans: true,
  textOpacity: 0.78,
  nodeScale: 1,
  edgeScale: 1,
  gravity: 1,
  repulsion: 1,
  neighborAttraction: 1,
  linkLength: 1,
};

const Root: FC = () => {
  const graph = useMemo(() => new UndirectedGraph(), []);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [controls, setControls] = useState<GraphControls>(DEFAULT_CONTROLS);
  const dataset = useMemo(() => createMockDataset(), []);
  const scene = useMemo(() => createObsidianScene(dataset), [dataset]);

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
      hideEdgesOnMove: false,
      zIndex: true,
    }),
    [],
  );

  useEffect(() => {
    graph.clear();

    scene.nodes.forEach((node) => {
      graph.addNode(node.key, {
        ...node,
        hidden: false,
      });
    });

    scene.edges.forEach((edge) => {
      if (!graph.hasEdge(edge.source, edge.target)) {
        graph.addEdgeWithKey(edge.key, edge.source, edge.target, edge);
      }
    });

    setHoveredNode(null);
    setSelectedNode((current) => (current && scene.nodeIndex[current] ? current : null));
  }, [graph, scene]);

  return (
    <div id="app-root" className="obsidian-root">
      <GraphControlPanel controls={controls} onChange={(patch) => setControls((current) => ({ ...current, ...patch }))} />

      <SigmaContainer graph={graph} settings={sigmaSettings} className="obsidian-sigma">
        <GraphViewportController />
        <GraphSettingsController hoveredNode={hoveredNode} selectedNode={selectedNode} controls={controls} />
        <GraphEventsController setHoveredNode={setHoveredNode} setSelectedNode={setSelectedNode} />
        <GraphPhysicsController controls={controls} />
      </SigmaContainer>
    </div>
  );
};

export default Root;
