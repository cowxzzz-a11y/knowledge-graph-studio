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
  homeX: number;
  homeY: number;
  isSynthetic?: boolean;
};

const BOUNDARY_RADIUS = 24.5;
const INNER_BOUNDARY_RADIUS = 23.5;
const SETTLE_FRAMES = 120;

function toPoint(value: { x: number; y: number }) {
  return { x: value.x, y: value.y };
}

function projectInsideBoundary(point: Point, radius = INNER_BOUNDARY_RADIUS): Point {
  const distance = Math.hypot(point.x, point.y);
  if (distance <= radius) return point;
  return {
    x: (point.x / distance) * radius,
    y: (point.y / distance) * radius,
  };
}

function getSpacing(left: NodeSnapshot, right: NodeSnapshot) {
  const base = (left.size + right.size) * 0.3 + 1.65;
  if (left.degree === 0 && right.degree === 0) return base + 0.55;
  if (left.degree === 0 || right.degree === 0) return base + 0.28;
  return base + 0.1;
}

const GraphPhysicsController: FC<PropsWithChildren<{ controls: GraphControls }>> = ({ children, controls }) => {
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

      graph.forEachEdge((_, __, source, target) => {
        const left = snapshots.find((entry) => entry.node === source);
        const right = snapshots.find((entry) => entry.node === target);
        if (!left || !right) return;

        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const distance = Math.max(0.001, Math.hypot(dx, dy));
        const desired = 3.2 * controls.linkLength + (Math.max(left.size, right.size) - 2.6) * 0.15;
        const delta = distance - desired;
        if (Math.abs(delta) < 0.02) return;

        const strength = delta * 0.012 * controls.neighborAttraction;
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
        const homeStrength = snapshot.degree === 0 ? 0.026 * controls.gravity : snapshot.isSynthetic ? 0.03 * controls.gravity : 0.036 * controls.gravity;
        shift.x += (snapshot.homeX - snapshot.x) * homeStrength;
        shift.y += (snapshot.homeY - snapshot.y) * homeStrength;

        const radius = Math.hypot(snapshot.x, snapshot.y);
        if (radius > INNER_BOUNDARY_RADIUS) {
          const overflow = radius - INNER_BOUNDARY_RADIUS;
          shift.x -= (snapshot.x / radius) * overflow * 0.22;
          shift.y -= (snapshot.y / radius) * overflow * 0.22;
        } else if (snapshot.degree === 0 && radius > INNER_BOUNDARY_RADIUS - 1.8) {
          const rimBias = radius - (INNER_BOUNDARY_RADIUS - 1.8);
          shift.x -= (snapshot.x / radius) * rimBias * 0.018;
          shift.y -= (snapshot.y / radius) * rimBias * 0.018;
        }

        const step = Math.hypot(shift.x, shift.y);
        const maxStep = 0.22;
        const ratio = step > maxStep ? maxStep / step : 1;
        const nextPoint = {
          x: snapshot.x + shift.x * ratio,
          y: snapshot.y + shift.y * ratio,
        };

        const boundedPoint = Math.hypot(nextPoint.x, nextPoint.y) > BOUNDARY_RADIUS + 2
          ? projectInsideBoundary(nextPoint, BOUNDARY_RADIUS + 2)
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
    registerEvents({
      downNode({ node, event }) {
        if (settleFrameRef.current) {
          cancelAnimationFrame(settleFrameRef.current);
          settleFrameRef.current = null;
        }

        draggedNodeRef.current = node;
        moveNode(node, sigma.viewportToGraph(event));
      },
      moveBody({ event }) {
        const draggedNode = draggedNodeRef.current;
        if (!draggedNode) return;

        moveNode(draggedNode, sigma.viewportToGraph(event));
        runRelaxationStep(draggedNode);

        event.preventSigmaDefault();
        event.original.preventDefault();
        event.original.stopPropagation();
      },
      upNode() {
        const draggedNode = draggedNodeRef.current;
        if (!draggedNode) return;

        const attributes = graph.getNodeAttributes(draggedNode) as { x: number; y: number };
        const homePoint = projectInsideBoundary(toPoint(attributes));
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

        const attributes = graph.getNodeAttributes(draggedNode) as { x: number; y: number };
        const homePoint = projectInsideBoundary(toPoint(attributes));
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
