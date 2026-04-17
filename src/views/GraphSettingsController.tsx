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
const BASE_EDGE_COLOR = "rgba(142, 142, 142, 0.3)";
const BASE_SYNTHETIC_EDGE_COLOR = "rgba(128, 128, 128, 0.18)";
const FAMILY_EDGE_COLOR = "rgba(150, 150, 150, 0.28)";
const RELATION_EDGE_COLOR = "rgba(164, 164, 164, 0.34)";
const NEIGHBOR_COLOR = "rgba(218, 225, 233, 0.96)";
const SELECTED_COLOR = "rgba(255, 255, 255, 0.98)";
const ACTIVE_EDGE_COLOR = "rgba(81, 138, 231, 0.7)";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function withAlpha(color: string, alpha: number) {
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return color;

  const channels = match[1].split(",").map((part) => part.trim());
  const [r, g, b] = channels;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function getEdgeOpacityStrength(value: number) {
  return clamp(value, 0.05, 1.6);
}

function getEdgeGrayColor(gray: number, alpha: number) {
  const channel = clamp(Math.round(gray), 96, 220);
  return `rgba(${channel}, ${channel}, ${channel}, ${clamp(alpha, 0, 1)})`;
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

function getRelationViewNodeColor(data: Attributes) {
  if (data.nodeRole === "primary_category" || data.nodeRole === "secondary_category") {
    return "rgba(214, 220, 228, 0.94)";
  }

  if (data.relationDegree > 0) {
    return "rgba(78, 88, 101, 0.94)";
  }

  if (data.degree > 0) {
    return "rgba(104, 113, 124, 0.88)";
  }

  return "rgba(224, 230, 237, 0.92)";
}

function getBaseNodeColor(data: Attributes, controls: GraphControls) {
  if (controls.viewMode === "relations") return getRelationViewNodeColor(data);
  if (typeof data.color === "string" && data.color) return data.color;
  return data.degree === 0 ? "rgba(210, 217, 226, 0.92)" : data.isSynthetic ? BASE_SYNTHETIC_COLOR : BASE_NODE_COLOR;
}

function getActiveNodeColor(data: Attributes, controls: GraphControls) {
  if (controls.viewMode === "structure") {
    return getBaseNodeColor(data, controls);
  }

  if (data.nodeRole === "primary_category" || data.nodeRole === "secondary_category") {
    return "rgba(240, 244, 248, 0.98)";
  }

  return SELECTED_COLOR;
}

function getBaseEdgeColor(data: Attributes, controls: GraphControls, isCrossFamilyRelation: boolean) {
  const opacityStrength = getEdgeOpacityStrength(controls.edgeOpacity);
  const gray = controls.edgeGray;

  if (controls.viewMode === "relations") {
    if (data.edgeKind === "relation") {
      return isCrossFamilyRelation
        ? getEdgeGrayColor(gray - 10, 0.1 + 0.16 * opacityStrength)
        : getEdgeGrayColor(gray + 6, 0.18 + 0.24 * opacityStrength);
    }

    if (data.edgeKind === "family") {
      return getEdgeGrayColor(gray, 0.16 + 0.24 * opacityStrength);
    }
  }

  if (typeof data.color === "string" && data.color) return data.color;
  if (data.edgeKind === "relation") return RELATION_EDGE_COLOR;
  if (data.edgeKind === "family") return FAMILY_EDGE_COLOR;
  return data.isSynthetic ? BASE_SYNTHETIC_EDGE_COLOR : BASE_EDGE_COLOR;
}

function getBaseEdgeSize(data: Attributes, controls: GraphControls, isCrossFamilyRelation: boolean) {
  if (data.edgeKind === "family") return 0.76 * controls.edgeScale;
  if (data.edgeKind === "relation") return (isCrossFamilyRelation ? 0.68 : 0.9) * controls.edgeScale;
  return (data.isSynthetic ? 0.56 : 0.68) * controls.edgeScale;
}

function getActiveEdgeSize(data: Attributes, controls: GraphControls, isCrossFamilyRelation: boolean) {
  if (data.edgeKind === "family") return 1.04 * controls.edgeScale;
  if (data.edgeKind === "relation") return (isCrossFamilyRelation ? 1.08 : 1.32) * controls.edgeScale;
  return (data.isSynthetic ? 0.92 : 1.12) * controls.edgeScale;
}

function getDimEdgeSize(data: Attributes, controls: GraphControls) {
  if (data.edgeKind === "family") return 0.42 * controls.edgeScale;
  return (data.isSynthetic ? 0.34 : 0.38) * controls.edgeScale;
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
      minEdgeThickness: clamp(0.5 + controls.edgeScale * 0.4, 0.82, 2.1),
      antiAliasingFeather: 0.92,
      nodeReducer: (node: string, data: Attributes) => {
        if (data.isDocumentLabel) {
          return {
            ...data,
            color: "rgba(0, 0, 0, 0)",
            size: 0.01,
            hidden: false,
            label: data.label,
            forceLabel: true,
            highlighted: false,
            dimmed: false,
            selected: false,
            labelSize: 16,
            labelOpacity: 1,
            labelTone: 1,
            zIndex: 3,
          };
        }

        const matchesSearch = !normalizedQuery || searchMatches.has(node);
        const allowOrphan = controls.showOrphans || data.degree > 0;
        const labelFade = getLabelFade(cameraRatio, data);
        const adaptiveNodeScale = getAdaptiveNodeScale(cameraRatio, data, controls);
        const visibleByZoom = labelFade > 0;
        const hiddenByView = Boolean(data.hiddenByView);
        const relationFullyZoomedIn = cameraRatio < 0.14;
        const relationDefaultLabelVisible =
          relationFullyZoomedIn ||
          data.nodeRole === "primary_category" ||
          (data.nodeRole === "secondary_category" && cameraRatio < 0.22);
        const shouldShowLabel = !activeNode
          ? normalizedQuery
            ? matchesSearch
            : controls.viewMode === "relations"
              ? relationDefaultLabelVisible && visibleByZoom
              : visibleByZoom
          : neighborhood.has(node) || node === debouncedHoveredNode || node === selectedNode;
        const baseLabelSize = data.alwaysShowLabel ? 17 : data.degree === 0 ? 13 : 14;
        const baseLabelOpacity = clamp(controls.textOpacity * Math.pow(labelFade, 2.15), 0, 1);
        const baseLabelTone = clamp(0.04 + Math.pow(labelFade, 1.08) * 0.96, 0, 1);
        const base = {
          ...data,
          color: getBaseNodeColor(data, controls),
          label: shouldShowLabel ? data.label : "",
          forceLabel: shouldShowLabel,
          highlighted: false,
          dimmed: false,
          selected: false,
          labelSize: baseLabelSize,
          hidden: hiddenByView || !allowOrphan,
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
            color: getActiveNodeColor(data, controls),
            highlighted: false,
            zIndex: 2,
            label: data.label,
            forceLabel: true,
            size: data.size * adaptiveNodeScale,
            labelSize: baseLabelSize,
            labelOpacity: 1,
            labelTone: 1,
          };
        }

        if (node === selectedNode) {
          return {
            ...base,
            color: getActiveNodeColor(data, controls),
            selected: true,
            highlighted: false,
            zIndex: 2,
            label: data.label,
            forceLabel: true,
            size: data.size * adaptiveNodeScale,
            labelSize: baseLabelSize,
            labelOpacity: 1,
            labelTone: 1,
          };
        }

        if (neighborhood.has(node)) {
          return {
            ...base,
            color: controls.viewMode === "structure" ? getBaseNodeColor(data, controls) : NEIGHBOR_COLOR,
            highlighted: false,
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
        const hiddenByView = Boolean(data.hiddenByView);
        const isCrossFamilyRelation =
          data.edgeKind === "relation" &&
          sourceAttributes.familyKey &&
          targetAttributes.familyKey &&
          sourceAttributes.familyKey !== targetAttributes.familyKey;

        if (!activeNode) {
          const baseColor = getBaseEdgeColor(data, controls, Boolean(isCrossFamilyRelation));
          return {
            ...data,
            hidden: hiddenByView || !allowByOrphan || !matchesSearch,
            color: baseColor,
            size: getBaseEdgeSize(data, controls, Boolean(isCrossFamilyRelation)),
            type: controls.showArrows && !data.isSynthetic ? "arrow" : "line",
            zIndex: 0,
          };
        }

        if (graph.hasExtremity(edge, activeNode)) {
          const activeColor = withAlpha(
            ACTIVE_EDGE_COLOR,
            clamp(0.28 + getEdgeOpacityStrength(controls.edgeOpacity) * 0.26, 0.16, 0.72),
          );
          return {
            ...data,
            hidden: hiddenByView || !allowByOrphan || !matchesSearch,
            color: activeColor,
            size: getActiveEdgeSize(data, controls, Boolean(isCrossFamilyRelation)),
            type: controls.showArrows && !data.isSynthetic ? "arrow" : "line",
            zIndex: 1,
          };
        }

        const dimColor = getEdgeGrayColor(
          controls.edgeGray - (data.edgeKind === "family" ? 12 : isCrossFamilyRelation ? 18 : 10),
          clamp(0.08 + getEdgeOpacityStrength(controls.edgeOpacity) * 0.1, 0.08, 0.26),
        );
        return {
          ...data,
          hidden: hiddenByView || !allowByOrphan || !matchesSearch,
          color: dimColor,
          size: getDimEdgeSize(data, controls),
          type: controls.showArrows && !data.isSynthetic ? "arrow" : "line",
          zIndex: 0,
        };
      },
    });
  }, [cameraRatio, controls, debouncedHoveredNode, graph, normalizedQuery, selectedNode, setSettings]);

  useEffect(() => {
    sigma.scheduleRefresh({
      partialGraph: {
        edges: graph.edges(),
      },
    });
  }, [controls.edgeGray, controls.edgeOpacity, controls.edgeScale, controls.showArrows, graph, sigma]);

  useEffect(() => {
    sigma.scheduleRefresh();
  }, [cameraRatio, sigma]);

  return <>{children}</>;
};

export default GraphSettingsController;
