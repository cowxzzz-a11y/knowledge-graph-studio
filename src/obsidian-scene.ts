import { Dataset, GraphEdgeAttributes, GraphNodeAttributes, GraphScene } from "./types";

type Point = { x: number; y: number };

type OccupiedPoint = Point & { radius: number };

type SeedNode = {
  key: string;
  label: string;
  nodeType: string;
  parentKey?: string;
  group: string;
  level: number;
  description: string;
  content: string;
  learningValue: string;
  relationHint?: string;
  childCount: number;
  isSynthetic?: boolean;
};

type SeedEdge = {
  key: string;
  source: string;
  target: string;
  relation: string;
  isSynthetic?: boolean;
};

const GRID_RADIUS = 24.5;
const GRID_SPACING = 3.08;
const ORPHAN_RADIUS = GRID_RADIUS - 1.05;

const GROUP_CENTERS: Record<string, Point> = {
  zhuanghe: { x: 0.3, y: 6.1 },
  docs: { x: -1.2, y: 12.1 },
  geology: { x: -6.9, y: 9.2 },
  engineering: { x: 7.3, y: 1.4 },
  regional: { x: -9.6, y: -2.5 },
  mining: { x: 10.1, y: 8.5 },
};

const GROUP_ANGLES: Record<string, number> = {
  zhuanghe: -Math.PI / 2,
  docs: Math.PI / 2,
  geology: Math.PI * 0.92,
  engineering: -Math.PI * 0.14,
  regional: Math.PI * 1.14,
  mining: Math.PI * 0.18,
};

const MICRO_CLUSTER_CENTERS: Point[] = [
  { x: -15.6, y: -14.1 },
  { x: 13.9, y: -15.6 },
  { x: -18.6, y: 2.6 },
  { x: 17.6, y: 11.6 },
  { x: -2.1, y: -17.2 },
  { x: 19.2, y: -2.4 },
];

const LABEL_POOL = [
  "README",
  "readme",
  "HISTORY",
  "LICENSE",
  "CHANGELOG",
  "options",
  "settings.ts",
  "image-1.png",
  "fixtures.json",
  "contributor_guide",
  "README_zh-CN",
  "UE资源管理",
  "发布会稿",
  "1月研究内容",
  "2月研究内容",
  "3月研究内容",
  "想法",
  "理论知识",
  "todo.canvas",
  "test.js",
  "index.ts",
];

const MICRO_LABEL_POOL = ["README", "readme", "options", "LICENSE", "CHANGELOG", "HISTORY"];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function distance(left: Point, right: Point) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function distanceSquare(left: Point, right: Point) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function createSeededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function createHexGridPoints(): Point[] {
  const points: Point[] = [];
  const rowHeight = GRID_SPACING * Math.sqrt(3) * 0.5;
  const rows = Math.ceil(GRID_RADIUS / rowHeight);
  const columns = Math.ceil(GRID_RADIUS / GRID_SPACING) + 2;

  for (let row = -rows; row <= rows; row += 1) {
    const y = row * rowHeight;
    const offset = Math.abs(row % 2) * (GRID_SPACING / 2);

    for (let column = -columns; column <= columns; column += 1) {
      const x = column * GRID_SPACING + offset;
      if (Math.hypot(x, y) <= GRID_RADIUS) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

function claimClosestPoint(available: Point[], target: Point) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < available.length; index += 1) {
    const candidateDistance = distanceSquare(available[index], target);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestIndex = index;
    }
  }

  return available.splice(bestIndex, 1)[0];
}

function randomPointInCircle(random: () => number): Point {
  const angle = random() * Math.PI * 2;
  const radius = ORPHAN_RADIUS * Math.sqrt(random());
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function scoreOrphanCandidate(candidate: Point, placed: Point[], occupied: OccupiedPoint[]) {
  const radialDistance = Math.hypot(candidate.x, candidate.y);
  const boundaryClearance = ORPHAN_RADIUS - radialDistance;

  let minPlacedDistance = ORPHAN_RADIUS;
  for (let index = 0; index < placed.length; index += 1) {
    minPlacedDistance = Math.min(minPlacedDistance, distance(candidate, placed[index]));
  }

  let minOccupiedDistance = ORPHAN_RADIUS;
  for (let index = 0; index < occupied.length; index += 1) {
    const obstacle = occupied[index];
    minOccupiedDistance = Math.min(minOccupiedDistance, distance(candidate, obstacle) - obstacle.radius);
  }

  return Math.min(minPlacedDistance, minOccupiedDistance + 0.75, boundaryClearance + 1.4);
}

function relaxOrphanPoints(points: Point[], anchors: Point[], occupied: OccupiedPoint[]) {
  const desiredSpacing = 2.7;
  const neighborRange = desiredSpacing * 1.34;
  const relaxed = points.map((point) => ({ ...point }));

  for (let iteration = 0; iteration < 42; iteration += 1) {
    const next = relaxed.map((point) => ({ ...point }));

    for (let index = 0; index < relaxed.length; index += 1) {
      const point = relaxed[index];
      let fx = 0;
      let fy = 0;

      for (let otherIndex = 0; otherIndex < relaxed.length; otherIndex += 1) {
        if (index === otherIndex) continue;

        const other = relaxed[otherIndex];
        const dx = point.x - other.x;
        const dy = point.y - other.y;
        const d = Math.max(0.001, Math.hypot(dx, dy));
        if (d >= neighborRange) continue;

        const base = d < desiredSpacing ? 0.22 : 0.08;
        const force = ((neighborRange - d) / neighborRange) * base;
        fx += (dx / d) * force;
        fy += (dy / d) * force;
      }

      for (let obstacleIndex = 0; obstacleIndex < occupied.length; obstacleIndex += 1) {
        const obstacle = occupied[obstacleIndex];
        const dx = point.x - obstacle.x;
        const dy = point.y - obstacle.y;
        const d = Math.max(0.001, Math.hypot(dx, dy));
        const desired = obstacle.radius + 1.38;
        if (d >= desired) continue;

        const force = ((desired - d) / desired) * 0.26;
        fx += (dx / d) * force;
        fy += (dy / d) * force;
      }

      fx += (anchors[index].x - point.x) * 0.032;
      fy += (anchors[index].y - point.y) * 0.032;

      const radius = Math.hypot(point.x, point.y);
      if (radius > ORPHAN_RADIUS) {
        fx -= (point.x / radius) * (radius - ORPHAN_RADIUS) * 0.8;
        fy -= (point.y / radius) * (radius - ORPHAN_RADIUS) * 0.8;
      }

      const step = Math.hypot(fx, fy);
      const maxStep = 0.18;
      const ratio = step > maxStep ? maxStep / step : 1;
      next[index] = {
        x: point.x + fx * ratio,
        y: point.y + fy * ratio,
      };
    }

    for (let index = 0; index < next.length; index += 1) {
      const point = next[index];
      const radius = Math.hypot(point.x, point.y);
      if (radius > ORPHAN_RADIUS) {
        next[index] = {
          x: (point.x / radius) * ORPHAN_RADIUS,
          y: (point.y / radius) * ORPHAN_RADIUS,
        };
      }
    }

    for (let index = 0; index < next.length; index += 1) {
      relaxed[index] = next[index];
    }
  }

  return relaxed;
}

function generateUniformOrphanPoints(count: number, occupied: OccupiedPoint[]) {
  const random = createSeededRandom(27);
  const points: Point[] = [];
  const anchors: Point[] = [];

  for (let index = 0; index < count; index += 1) {
    let bestCandidate = randomPointInCircle(random);
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let candidateIndex = 0; candidateIndex < 44; candidateIndex += 1) {
      const candidate = randomPointInCircle(random);
      const score = scoreOrphanCandidate(candidate, points, occupied);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    points.push(bestCandidate);
    anchors.push(bestCandidate);
  }

  return relaxOrphanPoints(points, anchors, occupied);
}

function createMicroClusterSeeds() {
  const nodes: SeedNode[] = [];
  const edges: SeedEdge[] = [];

  MICRO_CLUSTER_CENTERS.forEach((_, clusterIndex) => {
    const hubKey = `micro-${clusterIndex}-hub`;
    nodes.push({
      key: hubKey,
      label: MICRO_LABEL_POOL[clusterIndex % MICRO_LABEL_POOL.length],
      nodeType: "note",
      group: "micro",
      level: 2,
      description: "Synthetic disconnected note cluster for graph density.",
      content: "",
      learningValue: "",
      childCount: 4,
      isSynthetic: true,
    });

    const satelliteCount = 3 + (clusterIndex % 3);
    for (let index = 0; index < satelliteCount; index += 1) {
      const key = `micro-${clusterIndex}-${index}`;
      nodes.push({
        key,
        label: LABEL_POOL[(clusterIndex * 4 + index) % LABEL_POOL.length],
        nodeType: "note",
        parentKey: hubKey,
        group: "micro",
        level: 3,
        description: "Synthetic disconnected note cluster for graph density.",
        content: "",
        learningValue: "",
        childCount: 0,
        isSynthetic: true,
      });

      edges.push({
        key: `${hubKey}-${key}`,
        source: hubKey,
        target: key,
        relation: "refs",
        isSynthetic: true,
      });

      if (index > 0 && index % 2 === 0) {
        edges.push({
          key: `${key}-chain-${index}`,
          source: `micro-${clusterIndex}-${index - 1}`,
          target: key,
          relation: "refs",
          isSynthetic: true,
        });
      }
    }

    const ringKey = `micro-${clusterIndex}-ring`;
    nodes.push({
      key: ringKey,
      label: LABEL_POOL[(clusterIndex * 5 + 1) % LABEL_POOL.length],
      nodeType: "note",
      parentKey: hubKey,
      group: "micro",
      level: 3,
      description: "Synthetic disconnected note cluster for graph density.",
      content: "",
      learningValue: "",
      childCount: 0,
      isSynthetic: true,
    });

    edges.push({
      key: `${hubKey}-${ringKey}`,
      source: hubKey,
      target: ringKey,
      relation: "refs",
      isSynthetic: true,
    });
  });

  return { nodes, edges };
}

function createDegreeMap(nodes: SeedNode[], edges: SeedEdge[]) {
  const degreeMap = new Map<string, number>();

  nodes.forEach((node) => degreeMap.set(node.key, 0));
  edges.forEach((edge) => {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
  });

  return degreeMap;
}

function createNodeChildrenMap(nodes: SeedNode[]) {
  const childrenMap = new Map<string, SeedNode[]>();

  nodes.forEach((node) => {
    if (!node.parentKey) return;
    const currentChildren = childrenMap.get(node.parentKey) || [];
    currentChildren.push(node);
    childrenMap.set(node.parentKey, currentChildren);
  });

  return childrenMap;
}

function toGraphNode(seed: SeedNode, point: Point, degree: number): GraphNodeAttributes {
  const size = seed.isSynthetic
    ? degree === 0
      ? 2.7
      : clamp(2.78 + degree * 0.3, 2.8, 4.8)
    : clamp(2.4 + degree * 0.45 + seed.childCount * 0.24 + (seed.level === 0 ? 1.4 : 0), 2.4, 7.4);

  const importance = seed.isSynthetic
    ? degree
    : clamp(degree * 1.15 + seed.childCount * 0.52 + (seed.level <= 1 ? 1.8 : 0), 0, 10);

  return {
    ...seed,
    originKey: seed.key,
    x: point.x,
    y: point.y,
    anchorX: point.x,
    anchorY: point.y,
    homeX: point.x,
    homeY: point.y,
    degree,
    importance,
    size,
    color: seed.isSynthetic ? "#cfd6e0" : "#d7dee8",
    alwaysShowLabel: !seed.isSynthetic && (seed.level <= 1 || importance >= 5.4),
  };
}

function assignActualNodes(nodes: SeedNode[], available: Point[], degreeMap: Map<string, number>) {
  const positions = new Map<string, Point>();
  const childrenMap = createNodeChildrenMap(nodes);
  const sortedNodes = [...nodes].sort((left, right) => {
    if (left.level !== right.level) return left.level - right.level;
    return (degreeMap.get(right.key) || 0) - (degreeMap.get(left.key) || 0);
  });

  return sortedNodes.map((node) => {
    let desired = GROUP_CENTERS[node.group] || { x: 0, y: 0 };

    if (node.level === 0) {
      desired = GROUP_CENTERS.zhuanghe;
    } else if (node.parentKey && positions.has(node.parentKey)) {
      const parentPosition = positions.get(node.parentKey)!;
      const siblings = childrenMap.get(node.parentKey) || [];
      const index = siblings.findIndex((sibling) => sibling.key === node.key);
      const spread = siblings.length <= 1 ? 0 : (index - (siblings.length - 1) / 2) * 0.48;
      const angle = (GROUP_ANGLES[node.group] || 0) + spread;
      const radius = node.level === 1 ? 4.6 : node.level === 2 ? 3.8 : 3.2;
      desired = {
        x: parentPosition.x + Math.cos(angle) * radius,
        y: parentPosition.y + Math.sin(angle) * radius,
      };
    }

    const point = claimClosestPoint(available, desired);
    positions.set(node.key, point);
    return toGraphNode(node, point, degreeMap.get(node.key) || 0);
  });
}

function assignMicroClusterNodes(nodes: SeedNode[], available: Point[], degreeMap: Map<string, number>) {
  const positions = new Map<string, Point>();
  const childrenMap = createNodeChildrenMap(nodes);

  return nodes.map((node) => {
    const parts = node.key.split("-");
    const clusterIndex = Number(parts[1]);
    const center = MICRO_CLUSTER_CENTERS[clusterIndex] || { x: 0, y: 0 };
    let desired = center;

    if (node.parentKey && positions.has(node.parentKey)) {
      const parentPosition = positions.get(node.parentKey)!;
      const siblings = childrenMap.get(node.parentKey) || [];
      const index = siblings.findIndex((sibling) => sibling.key === node.key);
      const angle = -Math.PI / 2 + (index / Math.max(1, siblings.length)) * Math.PI * 2;
      const radius = node.key.endsWith("ring") ? 5.1 : 3.15 + (index % 2) * 0.45;
      desired = {
        x: parentPosition.x + Math.cos(angle) * radius,
        y: parentPosition.y + Math.sin(angle) * radius,
      };
    }

    const point = claimClosestPoint(available, desired);
    positions.set(node.key, point);
    return toGraphNode(node, point, degreeMap.get(node.key) || 0);
  });
}

function createOrphanNodes(count: number, degreeMap: Map<string, number>, occupiedNodes: GraphNodeAttributes[]) {
  const occupied: OccupiedPoint[] = occupiedNodes.map((node) => ({
    x: node.x,
    y: node.y,
    radius: node.size * 0.82 + (node.degree > 0 ? 0.95 : 0.35),
  }));
  const orphanPoints = generateUniformOrphanPoints(count, occupied);

  return orphanPoints.map((point, index) =>
    toGraphNode(
      {
        key: `orphan-${index}`,
        label: LABEL_POOL[index % LABEL_POOL.length],
        nodeType: "note",
        group: "orphans",
        level: 4,
        description: "Synthetic orphan note to mimic Obsidian graph density.",
        content: "",
        learningValue: "",
        childCount: 0,
        isSynthetic: true,
      },
      point,
      degreeMap.get(`orphan-${index}`) || 0,
    ),
  );
}

export function createObsidianScene(dataset: Dataset): GraphScene {
  const realSeeds: SeedNode[] = dataset.nodes.map((node) => ({
    key: node.key,
    label: node.label,
    nodeType: node.nodeType,
    parentKey: node.parentKey,
    group: node.group,
    level: node.level,
    description: node.description,
    content: node.content,
    learningValue: node.learningValue,
    relationHint: node.relationHint,
    childCount: node.childCount,
  }));

  const realEdges: SeedEdge[] = dataset.edges.map((edge) => ({
    key: edge.key,
    source: edge.source,
    target: edge.target,
    relation: edge.relation,
  }));

  const { nodes: microSeeds, edges: microEdges } = createMicroClusterSeeds();
  const orphanSeeds: SeedNode[] = Array.from({ length: 96 }, (_, index) => ({
    key: `orphan-${index}`,
    label: LABEL_POOL[index % LABEL_POOL.length],
    nodeType: "note",
    group: "orphans",
    level: 4,
    description: "Synthetic orphan note to mimic Obsidian graph density.",
    content: "",
    learningValue: "",
    childCount: 0,
    isSynthetic: true,
  }));

  const allSeeds = [...realSeeds, ...microSeeds, ...orphanSeeds];
  const allSeedEdges = [...realEdges, ...microEdges];
  const degreeMap = createDegreeMap(allSeeds, allSeedEdges);
  const available = createHexGridPoints();

  const assignedRealNodes = assignActualNodes(realSeeds, available, degreeMap);
  const assignedMicroNodes = assignMicroClusterNodes(microSeeds, available, degreeMap);
  const assignedOrphans = createOrphanNodes(orphanSeeds.length, degreeMap, [...assignedRealNodes, ...assignedMicroNodes]);

  const nodeIndex = [...assignedRealNodes, ...assignedMicroNodes, ...assignedOrphans].reduce<Record<string, GraphNodeAttributes>>(
    (index, node) => {
      index[node.key] = node;
      return index;
    },
    {},
  );

  const edges: GraphEdgeAttributes[] = allSeedEdges.map((edge) => ({
    ...edge,
    size: edge.isSynthetic ? 0.7 : 0.92,
    color: edge.isSynthetic ? "rgba(110, 118, 130, 0.14)" : "rgba(109, 117, 128, 0.2)",
    isSynthetic: edge.isSynthetic,
  }));

  return {
    nodes: [...assignedRealNodes, ...assignedMicroNodes, ...assignedOrphans],
    edges,
    nodeIndex,
    documentZones: [],
  };
}
