import { useSigma } from "@react-sigma/core";
import { getCameraStateToFitViewportToNodes } from "@sigma/utils";
import { FC, PropsWithChildren, useEffect } from "react";

import { GraphScene } from "../types";

type Props = PropsWithChildren<{
  viewportKey: string;
  expectedNodeCount: number;
  scene: GraphScene | null;
}>;

function isFinitePoint(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function computeSceneBounds(scene: GraphScene | null) {
  if (!scene) return null;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  scene.nodes.forEach((node) => {
    if (!isFinitePoint(node.x) || !isFinitePoint(node.y)) return;
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  });

  scene.documentZones.forEach((zone) => {
    const zonePadding = 0.75;
    minX = Math.min(minX, zone.centerX - zone.radius - zonePadding);
    maxX = Math.max(maxX, zone.centerX + zone.radius + zonePadding);
    minY = Math.min(minY, zone.centerY - zone.radius - zonePadding);
    maxY = Math.max(maxY, zone.centerY + zone.radius + 4.8);
  });

  if (![minX, maxX, minY, maxY].every(Number.isFinite)) {
    return null;
  }

  return {
    x: [minX, maxX] as [number, number],
    y: [minY, maxY] as [number, number],
  };
}

const GraphViewportController: FC<Props> = ({ viewportKey, expectedNodeCount, scene, children }) => {
  const sigma = useSigma();

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    const customBounds = computeSceneBounds(scene);

    sigma.setCustomBBox(customBounds);

    const fitViewport = () => {
      if (cancelled) return;

      const graph = sigma.getGraph();
      const nodes = graph.nodes();

      if (!nodes.length || nodes.length < expectedNodeCount) {
        attempts += 1;
        if (attempts < 40) {
          frame = requestAnimationFrame(fitViewport);
        }
        return;
      }

      const readyNodes = nodes.filter((node) => {
        const attributes = graph.getNodeAttributes(node) as { x?: number; y?: number; hidden?: boolean };
        return !attributes.hidden && isFinitePoint(attributes.x) && isFinitePoint(attributes.y);
      });

      if (!readyNodes.length || readyNodes.length < expectedNodeCount) {
        attempts += 1;
        if (attempts < 40) {
          frame = requestAnimationFrame(fitViewport);
        }
        return;
      }

      const camera = sigma.getCamera();
      const state = getCameraStateToFitViewportToNodes(sigma, readyNodes);

      camera.setState({
        ...state,
        ratio: state.ratio * 1.26,
      });
    };

    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(fitViewport);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      sigma.setCustomBBox(null);
    };
  }, [expectedNodeCount, scene, sigma, viewportKey]);

  return <>{children}</>;
};

export default GraphViewportController;
