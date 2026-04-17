import { useRegisterEvents, useSigma } from "@react-sigma/core";
import { FC, PropsWithChildren, useCallback, useEffect, useRef } from "react";

import { GraphControls } from "../types";

type Point = {
  x: number;
  y: number;
};

type NodeSnapshot = {
  node: string;
  x: number;
  y: number;
  size: number;
  degree: number;
  relationDegree: number;
  familyKey?: string;
  documentKey?: string;
  documentCenterX?: number;
  documentCenterY?: number;
  documentRadius?: number;
  homeX: number;
  homeY: number;
  isSynthetic?: boolean;
};

const SETTLE_FRAMES = 160;

function toPoint(value: { x: number; y: number }) {
  return { x: value.x, y: value.y };
}

function projectInsideBoundary(point: Point, radius: number): Point {
  const distance = Math.hypot(point.x, point.y);
  if (distance <= radius) return point;
  return {
    x: (point.x / distance) * radius,
    y: (point.y / distance) * radius,
  };
}

function projectInsideDocumentBoundary(point: Point, center: Point, radius: number) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius) return point;
  return {
    x: center.x + (dx / distance) * radius,
    y: center.y + (dy / distance) * radius,
  };
}

function getBoundaryRadius(nodeCount: number) {
  return Math.max(24.5, 12 + Math.sqrt(Math.max(1, nodeCount)) * 1.5);
}

function getSpacing(left: NodeSnapshot, right: NodeSnapshot) {
  const base = (left.size + right.size) * 0.3 + 1.65;
  if (left.documentKey && right.documentKey && left.documentKey !== right.documentKey) return base + 2.8;
  if (left.familyKey && right.familyKey && left.familyKey !== right.familyKey) return base + 1.45;
  if (left.familyKey && right.familyKey && left.familyKey === right.familyKey) return Math.max(1.8, base - 0.18);
  if (left.degree === 0 && right.degree === 0) return base + 0.55;
  if (left.degree === 0 || right.degree === 0) return base + 0.28;
  return base + 0.1;
}

const GraphPhysicsController: FC<PropsWithChildren<{ controls: GraphControls; settleKey: string }>> = ({ children, controls, settleKey }) => {
  const sigma = useSigma();
  const graph = sigma.getGraph();
  const registerEvents = useRegisterEvents();
  const draggedNodeRef = useRef<string | null>(null);
  const settleFrameRef = useRef<number | null>(null);
  const remainingStepsRef = useRef(0);

  const moveNode = useCallback(
    (node: string, point: Point, updateHome = false) => {
      graph.mergeNodeAttributes(node, {
        x: point.x,
        y: point.y,
        anchorX: point.x,
        anchorY: point.y,
        ...(updateHome ? { homeX: point.x, homeY: point.y } : {}),
      });
    },
    [graph],
  );

  const collectSnapshots = useCallback(() => {
    const snapshots: NodeSnapshot[] = [];
    graph.forEachNode((node, attributes) => {
      snapshots.push({
        node,
        x: attributes.x,
        y: attributes.y,
        size: attributes.size || 1,
        degree: attributes.degree || 0,
        relationDegree: attributes.relationDegree || 0,
        familyKey: attributes.familyKey,
        documentKey: attributes.documentKey,
        documentCenterX: attributes.documentCenterX,
        documentCenterY: attributes.documentCenterY,
        documentRadius: attributes.documentRadius,
        homeX: typeof attributes.homeX === "number" ? attributes.homeX : attributes.x,
        homeY: typeof attributes.homeY === "number" ? attributes.homeY : attributes.y,
        isSynthetic: attributes.isSynthetic,
      });
    });
    return snapshots;
  }, [graph]);

  const runRelaxationStep = useCallback(
    (lockedNode: string | null) => {
      const snapshots = collectSnapshots();
      const snapshotByNode = new Map(snapshots.map((snapshot) => [snapshot.node, snapshot]));
      const boundaryRadius = getBoundaryRadius(snapshots.length);
      const innerBoundaryRadius = Math.max(boundaryRadius - 1.2, boundaryRadius * 0.94);
      const shifts = new Map<string, Point>();
      let maxMovement = 0;

      snapshots.forEach(({ node }) => shifts.set(node, { x: 0, y: 0 }));

      for (let index = 0; index < snapshots.length; index += 1) {
        for (let otherIndex = index + 1; otherIndex < snapshots.length; otherIndex += 1) {
          const left = snapshots[index];
          const right = snapshots[otherIndex];
          const dx = right.x - left.x;
          const dy = right.y - left.y;
          const distance = Math.max(0.001, Math.hypot(dx, dy));
          const desired = getSpacing(left, right);
          const influence = desired * 1.55;
          if (distance >= influence) continue;

          const strength = ((influence - distance) / influence) * 0.16 * controls.repulsion;
          const nx = dx / distance;
          const ny = dy / distance;
          const leftShift = shifts.get(left.node)!;
          const rightShift = shifts.get(right.node)!;

          if (left.node === lockedNode) {
            rightShift.x += nx * strength;
            rightShift.y += ny * strength;
          } else if (right.node === lockedNode) {
            leftShift.x -= nx * strength;
            leftShift.y -= ny * strength;
          } else {
            leftShift.x -= nx * strength * 0.5;
            leftShift.y -= ny * strength * 0.5;
            rightShift.x += nx * strength * 0.5;
            rightShift.y += ny * strength * 0.5;
          }
        }
      }

      graph.forEachEdge((_, attributes, source, target) => {
        const left = snapshotByNode.get(source);
        const right = snapshotByNode.get(target);
        if (!left || !right) return;

        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distance = Math.max(0.001, Math.hypot(dx, dy));
        const isRelationEdge = attributes.edgeKind === "relation";
        const isFamilyEdge = attributes.edgeKind === "family";
        const desiredBase = isRelationEdge ? 2.5 : isFamilyEdge ? 1.95 : 3.45;
        const desired = desiredBase * controls.linkLength + (Math.max(left.size, right.size) - 2.6) * 0.15;
        const delta = distance - desired;
        if (Math.abs(delta) < 0.02) return;

        const attractionWeight = isFamilyEdge ? 0.032 : isRelationEdge ? 0.012 : 0.0075;
        const strength = delta * attractionWeight * controls.neighborAttraction;
        const nx = dx / distance;
        const ny = dy / distance;
        const leftShift = shifts.get(left.node)!;
        const rightShift = shifts.get(right.node)!;

        if (left.node === lockedNode) {
          rightShift.x -= nx * strength;
          rightShift.y -= ny * strength;
        } else if (right.node === lockedNode) {
          leftShift.x += nx * strength;
          leftShift.y += ny * strength;
        } else {
          leftShift.x += nx * strength * 0.5;
          leftShift.y += ny * strength * 0.5;
          rightShift.x -= nx * strength * 0.5;
          rightShift.y -= ny * strength * 0.5;
        }
      });

      snapshots.forEach((snapshot) => {
        if (snapshot.node === lockedNode) return;

        const shift = shifts.get(snapshot.node)!;
        const homeStrength =
          snapshot.isSynthetic
            ? 0.034 * controls.gravity
            : controls.viewMode === "relations"
              ? snapshot.relationDegree > 0
                ? 0.032 * controls.gravity
                : 0.052 * controls.gravity
              : snapshot.relationDegree > 0
                ? 0.016 * controls.gravity
                : snapshot.degree === 0
                  ? 0.024 * controls.gravity
                  : 0.03 * controls.gravity;
        shift.x += (snapshot.homeX - snapshot.x) * homeStrength;
        shift.y += (snapshot.homeY - snapshot.y) * homeStrength;

        const hasDocumentBoundary =
          typeof snapshot.documentCenterX === "number" &&
          typeof snapshot.documentCenterY === "number" &&
          typeof snapshot.documentRadius === "number";

        if (hasDocumentBoundary) {
          const center = { x: snapshot.documentCenterX!, y: snapshot.documentCenterY! };
          const allowedRadius = Math.max(2.4, snapshot.documentRadius! - Math.max(1.6, snapshot.size * 0.95));
          const dx = snapshot.x - center.x;
          const dy = snapshot.y - center.y;
          const radius = Math.hypot(dx, dy);

          if (radius > allowedRadius) {
            const overflow = radius - allowedRadius;
            shift.x -= (dx / radius) * overflow * 0.34;
            shift.y -= (dy / radius) * overflow * 0.34;
          } else if (snapshot.degree === 0 && radius > allowedRadius - 1.5) {
            const rimBias = radius - (allowedRadius - 1.5);
            shift.x -= (dx / Math.max(radius, 0.001)) * rimBias * 0.028;
            shift.y -= (dy / Math.max(radius, 0.001)) * rimBias * 0.028;
          }
        } else {
          const radius = Math.hypot(snapshot.x, snapshot.y);
          if (radius > innerBoundaryRadius) {
            const overflow = radius - innerBoundaryRadius;
            shift.x -= (snapshot.x / radius) * overflow * 0.22;
            shift.y -= (snapshot.y / radius) * overflow * 0.22;
          } else if (snapshot.degree === 0 && radius > innerBoundaryRadius - 1.8) {
            const rimBias = radius - (innerBoundaryRadius - 1.8);
            shift.x -= (snapshot.x / radius) * rimBias * 0.018;
            shift.y -= (snapshot.y / radius) * rimBias * 0.018;
          }
        }

        const step = Math.hypot(shift.x, shift.y);
        const maxStep = controls.viewMode === "relations" ? 0.12 : 0.22;
        const ratio = step > maxStep ? maxStep / step : 1;
        const nextPoint = {
          x: snapshot.x + shift.x * ratio,
          y: snapshot.y + shift.y * ratio,
        };

        const boundedPoint =
          typeof snapshot.documentCenterX === "number" &&
          typeof snapshot.documentCenterY === "number" &&
          typeof snapshot.documentRadius === "number"
            ? projectInsideDocumentBoundary(
                nextPoint,
                { x: snapshot.documentCenterX, y: snapshot.documentCenterY },
                Math.max(2.2, snapshot.documentRadius - Math.max(1.3, snapshot.size)),
              )
            : Math.hypot(nextPoint.x, nextPoint.y) > boundaryRadius + 2
              ? projectInsideBoundary(nextPoint, boundaryRadius + 2)
              : nextPoint;

        graph.mergeNodeAttributes(snapshot.node, {
          x: boundedPoint.x,
          y: boundedPoint.y,
          anchorX: boundedPoint.x,
          anchorY: boundedPoint.y,
        });

        maxMovement = Math.max(maxMovement, Math.hypot(boundedPoint.x - snapshot.x, boundedPoint.y - snapshot.y));
      });

      sigma.scheduleRefresh();
      return maxMovement;
    },
    [collectSnapshots, controls.gravity, controls.linkLength, controls.neighborAttraction, controls.repulsion, graph, sigma],
  );

  const tickSettle = useCallback(() => {
    if (remainingStepsRef.current <= 0) {
      settleFrameRef.current = null;
      return;
    }

    const movement = runRelaxationStep(null);
    remainingStepsRef.current -= 1;

    if (remainingStepsRef.current <= 0 || movement < 0.0005) {
      settleFrameRef.current = null;
      return;
    }

    settleFrameRef.current = requestAnimationFrame(tickSettle);
  }, [runRelaxationStep]);

  const startSettle = useCallback(() => {
    if (settleFrameRef.current) cancelAnimationFrame(settleFrameRef.current);
    remainingStepsRef.current = SETTLE_FRAMES;
    settleFrameRef.current = requestAnimationFrame(tickSettle);
  }, [tickSettle]);

  useEffect(() => {
    let frame = 0;

    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (graph.order > 0) {
          startSettle();
        }
      });
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [graph, settleKey, startSettle]);

  useEffect(() => {
    registerEvents({
      downNode({ node, event }) {
        if (settleFrameRef.current) {
          cancelAnimationFrame(settleFrameRef.current);
          settleFrameRef.current = null;
        }

        draggedNodeRef.current = node;
        const attributes = graph.getNodeAttributes(node) as {
          documentCenterX?: number;
          documentCenterY?: number;
          documentRadius?: number;
        };
        const rawPoint = sigma.viewportToGraph(event);
        const point =
          typeof attributes.documentCenterX === "number" &&
          typeof attributes.documentCenterY === "number" &&
          typeof attributes.documentRadius === "number"
            ? projectInsideDocumentBoundary(
                rawPoint,
                { x: attributes.documentCenterX, y: attributes.documentCenterY },
                Math.max(2.2, attributes.documentRadius - 1.4),
              )
            : rawPoint;
        moveNode(node, point);
      },
      moveBody({ event }) {
        const draggedNode = draggedNodeRef.current;
        if (!draggedNode) return;

        const attributes = graph.getNodeAttributes(draggedNode) as {
          documentCenterX?: number;
          documentCenterY?: number;
          documentRadius?: number;
        };
        const rawPoint = sigma.viewportToGraph(event);
        const point =
          typeof attributes.documentCenterX === "number" &&
          typeof attributes.documentCenterY === "number" &&
          typeof attributes.documentRadius === "number"
            ? projectInsideDocumentBoundary(
                rawPoint,
                { x: attributes.documentCenterX, y: attributes.documentCenterY },
                Math.max(2.2, attributes.documentRadius - 1.4),
              )
            : rawPoint;
        moveNode(draggedNode, point);
        runRelaxationStep(draggedNode);

        event.preventSigmaDefault();
        event.original.preventDefault();
        event.original.stopPropagation();
      },
      upNode() {
        const draggedNode = draggedNodeRef.current;
        if (!draggedNode) return;

        const attributes = graph.getNodeAttributes(draggedNode) as {
          x: number;
          y: number;
          documentCenterX?: number;
          documentCenterY?: number;
          documentRadius?: number;
        };
        const homePoint =
          typeof attributes.documentCenterX === "number" &&
          typeof attributes.documentCenterY === "number" &&
          typeof attributes.documentRadius === "number"
            ? projectInsideDocumentBoundary(
                toPoint(attributes),
                { x: attributes.documentCenterX, y: attributes.documentCenterY },
                Math.max(2.2, attributes.documentRadius - 1.4),
              )
            : projectInsideBoundary(toPoint(attributes), getBoundaryRadius(graph.order));
        graph.mergeNodeAttributes(draggedNode, {
          homeX: homePoint.x,
          homeY: homePoint.y,
        });

        draggedNodeRef.current = null;
        startSettle();
      },
      upStage() {
        const draggedNode = draggedNodeRef.current;
        if (!draggedNode) return;

        const attributes = graph.getNodeAttributes(draggedNode) as {
          x: number;
          y: number;
          documentCenterX?: number;
          documentCenterY?: number;
          documentRadius?: number;
        };
        const homePoint =
          typeof attributes.documentCenterX === "number" &&
          typeof attributes.documentCenterY === "number" &&
          typeof attributes.documentRadius === "number"
            ? projectInsideDocumentBoundary(
                toPoint(attributes),
                { x: attributes.documentCenterX, y: attributes.documentCenterY },
                Math.max(2.2, attributes.documentRadius - 1.4),
              )
            : projectInsideBoundary(toPoint(attributes), getBoundaryRadius(graph.order));
        graph.mergeNodeAttributes(draggedNode, {
          homeX: homePoint.x,
          homeY: homePoint.y,
        });

        draggedNodeRef.current = null;
        startSettle();
      },
    });

    return () => {
      if (settleFrameRef.current) cancelAnimationFrame(settleFrameRef.current);
    };
  }, [graph, moveNode, registerEvents, runRelaxationStep, sigma, startSettle]);

  return <>{children}</>;
};

export default GraphPhysicsController;
