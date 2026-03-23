import { useSetSettings, useSigma } from "@react-sigma/core";
import { Attributes } from "graphology-types";
import { FC, PropsWithChildren, useEffect, useState } from "react";

import { drawHover, drawLabel } from "../canvas-utils";
import { GraphControls } from "../types";
import useDebounce from "../use-debounce";

const BASE_NODE_COLOR = "rgba(212, 219, 229, 0.92)";
const BASE_SYNTHETIC_COLOR = "rgba(109, 118, 131, 0.62)";
const DIM_NODE_COLOR = "rgba(82, 91, 103, 0.18)";
const DIM_SYNTHETIC_COLOR = "rgba(72, 79, 90, 0.14)";
const BASE_EDGE_COLOR = "rgba(110, 119, 132, 0.16)";
const BASE_SYNTHETIC_EDGE_COLOR = "rgba(94, 104, 118, 0.075)";
const DIM_EDGE_COLOR = "rgba(76, 85, 96, 0.08)";
const NEIGHBOR_COLOR = "rgba(233, 240, 249, 0.96)";
const HOVER_COLOR = "rgba(117, 178, 255, 1)";
const SELECTED_COLOR = "rgba(159, 204, 255, 0.96)";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getLabelFade(cameraRatio: number, data: Attributes) {
  let start = 0.68;
  let full = 0.2;

  if (data.alwaysShowLabel) {
    start = 0.98;
    full = 0.34;
  } else if (!data.isSynthetic && data.degree > 0) {
    start = 0.88;
    full = 0.28;
  } else if (data.degree > 0) {
    start = 0.78;
    full = 0.24;
  }

  if (cameraRatio >= start) return 0;
  if (cameraRatio <= full) return 1;
  return clamp((start - cameraRatio) / (start - full), 0, 1);
}

function getAdaptiveNodeScale(cameraRatio: number, data: Attributes, controls: GraphControls) {
  const zoomAdaptiveScale = clamp(Math.pow(cameraRatio, 0.04), 0.97, 1.05);
  const orphanBoost = data.degree === 0 ? 1.96 : data.isSynthetic ? 1.4 : 1.08;
  return controls.nodeScale * zoomAdaptiveScale * orphanBoost;
}

const GraphSettingsController: FC<
  PropsWithChildren<{ hoveredNode: string | null; selectedNode: string | null; controls: GraphControls }>
> = ({ children, hoveredNode, selectedNode, controls }) => {
  const sigma = useSigma();
  const setSettings = useSetSettings();
  const graph = sigma.getGraph();
  const debouncedHoveredNode = useDebounce(hoveredNode, 25);
  const normalizedQuery = controls.searchQuery.trim().toLowerCase();
  const [cameraRatio, setCameraRatio] = useState(() => sigma.getCamera().getState().ratio);

  useEffect(() => {
    const camera = sigma.getCamera();
    let frame = 0;

    const syncRatio = ({ ratio }: { ratio: number }) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setCameraRatio((current) => (Math.abs(current - ratio) > 0.0015 ? ratio : current));
      });
    };

    syncRatio(camera.getState());
    camera.on("updated", syncRatio);

    return () => {
      cancelAnimationFrame(frame);
      camera.removeListener("updated", syncRatio);
    };
  }, [sigma]);

  useEffect(() => {
    const activeNode = debouncedHoveredNode || selectedNode;
    const neighborhood = new Set<string>();

    if (activeNode) {
      neighborhood.add(activeNode);
      graph.forEachNeighbor(activeNode, (neighbor) => neighborhood.add(neighbor));
    }

    const searchMatches = new Set<string>();
    if (normalizedQuery) {
      graph.forEachNode((node, data) => {
        const label = String(data.label || "").toLowerCase();
        if (label.includes(normalizedQuery)) {
          searchMatches.add(node);
          graph.forEachNeighbor(node, (neighbor) => searchMatches.add(neighbor));
        }
      });
    }

    setSettings({
      defaultDrawNodeLabel: (context, data, settings) => drawLabel(context, data, settings),
      defaultDrawNodeHover: drawHover,
      nodeReducer: (node: string, data: Attributes) => {
        const matchesSearch = !normalizedQuery || searchMatches.has(node);
        const allowOrphan = controls.showOrphans || data.degree > 0;
        const labelFade = getLabelFade(cameraRatio, data);
        const adaptiveNodeScale = getAdaptiveNodeScale(cameraRatio, data, controls);
        const visibleByZoom = labelFade > 0;
        const shouldShowLabel = !activeNode
          ? normalizedQuery
            ? matchesSearch
            : visibleByZoom
          : neighborhood.has(node) || node === debouncedHoveredNode || node === selectedNode;
        const baseLabelSize = data.alwaysShowLabel ? 17 : data.degree === 0 ? 13 : 14;
        const baseLabelOpacity = clamp(controls.textOpacity * Math.pow(labelFade, 2.15), 0, 1);
        const baseLabelTone = clamp(0.04 + Math.pow(labelFade, 1.08) * 0.96, 0, 1);
        const base = {
          ...data,
          color: data.degree === 0 ? "rgba(210, 217, 226, 0.92)" : data.isSynthetic ? BASE_SYNTHETIC_COLOR : BASE_NODE_COLOR,
          label: shouldShowLabel ? data.label : "",
          forceLabel: shouldShowLabel,
          highlighted: false,
          dimmed: false,
          selected: false,
          labelSize: baseLabelSize,
          hidden: !allowOrphan,
          labelOpacity: shouldShowLabel ? baseLabelOpacity : 0,
          labelTone: baseLabelTone,
          size: data.size * adaptiveNodeScale,
        };

        if (!matchesSearch) {
          return {
            ...base,
            color: data.isSynthetic ? DIM_SYNTHETIC_COLOR : DIM_NODE_COLOR,
            label: "",
            forceLabel: false,
            dimmed: true,
            zIndex: 0,
          };
        }

        if (normalizedQuery && matchesSearch) {
          return {
            ...base,
            forceLabel: true,
            label: data.label,
            labelOpacity: 1,
            labelTone: 1,
          };
        }

        if (!activeNode) return base;

        if (node === debouncedHoveredNode) {
          return {
            ...base,
            color: HOVER_COLOR,
            highlighted: true,
            zIndex: 2,
            label: data.label,
            forceLabel: true,
            size: data.size * adaptiveNodeScale * 1.08,
            labelSize: Math.max(13, baseLabelSize + 1),
            labelOpacity: 1,
            labelTone: 1,
          };
        }

        if (node === selectedNode) {
          return {
            ...base,
            color: SELECTED_COLOR,
            selected: true,
            highlighted: true,
            zIndex: 2,
            label: data.label,
            forceLabel: true,
            size: data.size * adaptiveNodeScale * 1.06,
            labelSize: Math.max(13, baseLabelSize + 1),
            labelOpacity: 1,
            labelTone: 1,
          };
        }

        if (neighborhood.has(node)) {
          return {
            ...base,
            color: NEIGHBOR_COLOR,
            highlighted: true,
            zIndex: 1,
            label: data.label,
            forceLabel: true,
            size: data.size * adaptiveNodeScale,
            labelOpacity: clamp(controls.textOpacity + 0.12, 0, 1),
            labelTone: 1,
          };
        }

        return {
          ...base,
          color: data.isSynthetic ? DIM_SYNTHETIC_COLOR : DIM_NODE_COLOR,
          label: "",
          forceLabel: false,
          dimmed: true,
          zIndex: 0,
        };
      },
      edgeReducer: (edge: string, data: Attributes) => {
        const source = graph.source(edge);
        const target = graph.target(edge);
        const sourceAttributes = graph.getNodeAttributes(source);
        const targetAttributes = graph.getNodeAttributes(target);
        const allowByOrphan =
          controls.showOrphans || (!sourceAttributes.isSynthetic && !targetAttributes.isSynthetic);
        const matchesSearch = !normalizedQuery || (searchMatches.has(source) && searchMatches.has(target));

        if (!activeNode) {
          return {
            ...data,
            hidden: !allowByOrphan || !matchesSearch,
            color: data.isSynthetic ? BASE_SYNTHETIC_EDGE_COLOR : BASE_EDGE_COLOR,
            size: (data.isSynthetic ? 0.55 : 0.92) * controls.edgeScale,
            type: controls.showArrows && !data.isSynthetic ? "arrow" : "line",
            zIndex: 0,
          };
        }

        if (graph.hasExtremity(edge, activeNode)) {
          return {
            ...data,
            hidden: !allowByOrphan || !matchesSearch,
            color: debouncedHoveredNode ? "rgba(109, 165, 255, 0.92)" : "rgba(135, 184, 255, 0.52)",
            size: (data.isSynthetic ? 0.9 : debouncedHoveredNode ? 1.8 : 1.45) * controls.edgeScale,
            type: controls.showArrows && !data.isSynthetic ? "arrow" : "line",
            zIndex: 1,
          };
        }

        return {
          ...data,
          hidden: !allowByOrphan || !matchesSearch,
          color: DIM_EDGE_COLOR,
          size: (data.isSynthetic ? 0.3 : 0.45) * controls.edgeScale,
          type: controls.showArrows && !data.isSynthetic ? "arrow" : "line",
          zIndex: 0,
        };
      },
    });
  }, [cameraRatio, controls, debouncedHoveredNode, graph, normalizedQuery, selectedNode, setSettings]);

  useEffect(() => {
    sigma.scheduleRefresh();
  }, [cameraRatio, sigma]);

  return <>{children}</>;
};

export default GraphSettingsController;
