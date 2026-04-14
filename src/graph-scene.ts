import { Dataset, GraphEdgeAttributes, GraphNodeAttributes, GraphScene, GraphViewMode, KnowledgeEdge, KnowledgeNode } from "./types";

type Point = {
  x: number;
  y: number;
};

type FamilyCluster = {
  directEntities: KnowledgeNode[];
  primary: KnowledgeNode;
  primaryKey: string;
  radius: number;
  secondaries: KnowledgeNode[];
};

type FamilyRelationLink = {
  leftKey: string;
  rightKey: string;
  weight: number;
};

function add(left: Point, right: Point): Point {
  return { x: left.x + right.x, y: left.y + right.y };
}

function scale(point: Point, ratio: number): Point {
  return { x: point.x * ratio, y: point.y * ratio };
}

function polar(radius: number, angle: number): Point {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function length(point: Point) {
  return Math.hypot(point.x, point.y);
}

function normalize(point: Point, fallbackAngle = 0): Point {
  const magnitude = length(point);
  if (magnitude < 0.001) {
    return { x: Math.cos(fallbackAngle), y: Math.sin(fallbackAngle) };
  }

  return {
    x: point.x / magnitude,
    y: point.y / magnitude,
  };
}

function getAngle(point: Point) {
  return Math.atan2(point.y, point.x);
}

function sortByLabel(left: KnowledgeNode, right: KnowledgeNode) {
  return left.label.localeCompare(right.label, "zh-CN");
}

function groupBy<T>(items: T[], getKey: (item: T) => string | null | undefined) {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const key = getKey(item);
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  });
  return grouped;
}

function createDegreeMap(nodes: KnowledgeNode[], edges: GraphEdgeAttributes[]) {
  const degreeMap = new Map<string, number>();
  nodes.forEach((node) => degreeMap.set(node.key, 0));
  edges.forEach((edge) => {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
  });
  return degreeMap;
}

function createRelationDegreeMap(edges: KnowledgeEdge[]) {
  const degreeMap = new Map<string, number>();
  edges.forEach((edge) => {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
  });
  return degreeMap;
}

function computeNodeSize(node: KnowledgeNode, degree: number) {
  const role = node.nodeRole || "entity";
  if (role === "root") return 9.8;
  if (role === "primary_category") return 5.7 + Math.min(2.2, node.childCount * 0.045);
  if (role === "secondary_category") return 4.8 + Math.min(1.4, node.childCount * 0.035);
  return 3 + Math.min(1.15, degree * 0.13);
}

function computeImportance(node: KnowledgeNode, degree: number) {
  const role = node.nodeRole || "entity";
  if (role === "root") return 9;
  if (role === "primary_category") return 7.2 + Math.min(2.2, node.childCount * 0.05);
  if (role === "secondary_category") return 6 + Math.min(1.4, node.childCount * 0.04);
  return 4 + Math.min(2, degree * 0.16);
}

function getPrimaryFamilyKey(node: KnowledgeNode, nodeMap: Map<string, KnowledgeNode>) {
  if (node.nodeRole === "primary_category") return node.key;
  if (!node.parentKey) return null;

  const parent = nodeMap.get(node.parentKey);
  if (!parent) return null;
  if (parent.nodeRole === "primary_category") return parent.key;
  if (parent.nodeRole === "secondary_category" && parent.parentKey) return parent.parentKey;
  return null;
}

function buildFamilyRelationLinks(relationEdges: KnowledgeEdge[], nodeMap: Map<string, KnowledgeNode>) {
  const pairWeights = new Map<string, FamilyRelationLink>();

  relationEdges.forEach((edge) => {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) return;

    const leftKey = getPrimaryFamilyKey(source, nodeMap);
    const rightKey = getPrimaryFamilyKey(target, nodeMap);
    if (!leftKey || !rightKey || leftKey === rightKey) return;

    const pairKey = leftKey < rightKey ? `${leftKey}::${rightKey}` : `${rightKey}::${leftKey}`;
    const current = pairWeights.get(pairKey);
    if (current) {
      current.weight += 1;
      return;
    }

    pairWeights.set(pairKey, {
      leftKey: leftKey < rightKey ? leftKey : rightKey,
      rightKey: leftKey < rightKey ? rightKey : leftKey,
      weight: 1,
    });
  });

  return [...pairWeights.values()];
}

function buildFamilyEdges(dataset: Dataset, nodeMap: Map<string, KnowledgeNode>) {
  const familyEdges: KnowledgeEdge[] = [];

  dataset.nodes.forEach((node) => {
    if (!node.parentKey || node.nodeRole === "root") return;

    const parent = nodeMap.get(node.parentKey);
    if (!parent || parent.nodeRole === "root") return;

    familyEdges.push({
      key: `family::${parent.key}::${node.key}`,
      source: parent.key,
      target: node.key,
      relation: node.nodeRole === "secondary_category" ? "二级类" : "归属",
      edgeKind: "family",
    });
  });

  return familyEdges;
}

function computeFamilyRadius(primary: KnowledgeNode, secondaries: KnowledgeNode[], directEntities: KnowledgeNode[]) {
  const descendantCount =
    directEntities.length + secondaries.length + secondaries.reduce((sum, node) => sum + node.childCount, 0);
  return 4.5 + Math.sqrt(Math.max(1, descendantCount)) * 0.82 + secondaries.length * 0.28;
}

function buildPrimaryFamilyClusters(dataset: Dataset, nodeMap: Map<string, KnowledgeNode>) {
  const secondaryByPrimary = groupBy(
    dataset.nodes.filter((node) => node.nodeRole === "secondary_category"),
    (node) => node.parentKey || null,
  );
  const directEntitiesByPrimary = groupBy(
    dataset.nodes.filter((node) => node.nodeRole === "entity"),
    (node) => {
      if (!node.parentKey) return null;
      const parent = nodeMap.get(node.parentKey);
      return parent?.nodeRole === "primary_category" ? parent.key : null;
    },
  );

  return dataset.nodes
    .filter((node) => node.nodeRole === "primary_category")
    .map<FamilyCluster>((primary) => {
      const secondaries = [...(secondaryByPrimary.get(primary.key) || [])].sort(sortByLabel);
      const directEntities = [...(directEntitiesByPrimary.get(primary.key) || [])].sort(sortByLabel);
      return {
        primary,
        primaryKey: primary.key,
        secondaries,
        directEntities,
        radius: computeFamilyRadius(primary, secondaries, directEntities),
      };
    });
}

function resolveFamilyCenters(clusters: FamilyCluster[], relationLinks: FamilyRelationLink[]) {
  const centers = new Map<string, Point>();
  const targets = new Map<string, Point>();
  const radiusMap = new Map(clusters.map((cluster) => [cluster.primaryKey, cluster.radius]));
  const sorted = [...clusters].sort(
    (left, right) => getAngle({ x: left.primary.x, y: left.primary.y }) - getAngle({ x: right.primary.x, y: right.primary.y }),
  );
  const shrinkRatio = 0.48;

  sorted.forEach((cluster) => {
    const basePoint = scale({ x: cluster.primary.x, y: cluster.primary.y }, shrinkRatio);
    centers.set(cluster.primaryKey, { ...basePoint });
    targets.set(cluster.primaryKey, basePoint);
  });

  for (let step = 0; step < 180; step += 1) {
    for (let index = 0; index < sorted.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < sorted.length; otherIndex += 1) {
        const left = sorted[index];
        const right = sorted[otherIndex];
        const leftPoint = centers.get(left.primaryKey)!;
        const rightPoint = centers.get(right.primaryKey)!;
        const delta = { x: rightPoint.x - leftPoint.x, y: rightPoint.y - leftPoint.y };
        const distance = Math.max(0.001, length(delta));
        const minDistance = left.radius + right.radius + 1.15;

        if (distance >= minDistance) continue;

        const push = ((minDistance - distance) / minDistance) * 0.44;
        const direction = normalize(
          delta,
          getAngle({ x: right.primary.x - left.primary.x, y: right.primary.y - left.primary.y }),
        );

        leftPoint.x -= direction.x * push;
        leftPoint.y -= direction.y * push;
        rightPoint.x += direction.x * push;
        rightPoint.y += direction.y * push;
      }
    }

    relationLinks.forEach((link) => {
      const leftPoint = centers.get(link.leftKey);
      const rightPoint = centers.get(link.rightKey);
      const leftRadius = radiusMap.get(link.leftKey);
      const rightRadius = radiusMap.get(link.rightKey);
      if (!leftPoint || !rightPoint || !leftRadius || !rightRadius) return;

      const delta = { x: rightPoint.x - leftPoint.x, y: rightPoint.y - leftPoint.y };
      const distance = Math.max(0.001, length(delta));
      const desiredDistance = leftRadius + rightRadius + Math.max(1.7, 3.3 - link.weight * 0.36);
      if (distance <= desiredDistance) return;

      const pull = Math.min(distance - desiredDistance, 4.8) * 0.03 * Math.min(link.weight, 3);
      const direction = normalize(delta, 0);
      leftPoint.x += direction.x * pull * 0.5;
      leftPoint.y += direction.y * pull * 0.5;
      rightPoint.x -= direction.x * pull * 0.5;
      rightPoint.y -= direction.y * pull * 0.5;
    });

    sorted.forEach((cluster) => {
      const current = centers.get(cluster.primaryKey)!;
      const target = targets.get(cluster.primaryKey)!;
      current.x += (target.x - current.x) * 0.055;
      current.y += (target.y - current.y) * 0.055;
    });
  }

  return centers;
}

function placeNodesOnOrbit(
  nodes: KnowledgeNode[],
  center: Point,
  initialRadius: number,
  ringGap: number,
  startAngle: number,
  positions: Map<string, Point>,
) {
  if (!nodes.length) return;

  let placed = 0;
  let ringIndex = 0;

  while (placed < nodes.length) {
    const radius = initialRadius + ringGap * ringIndex;
    const circumference = Math.max(8, Math.PI * 2 * radius);
    const ringCapacity = Math.max(6, Math.floor(circumference / 2.02));
    const ringNodes = nodes.slice(placed, placed + ringCapacity);
    const offset = ringIndex % 2 === 0 ? 0 : Math.PI / ringNodes.length;

    ringNodes.forEach((node, index) => {
      const angle = startAngle + offset + (Math.PI * 2 * index) / ringNodes.length;
      positions.set(node.key, add(center, polar(radius, angle)));
    });

    placed += ringNodes.length;
    ringIndex += 1;
  }
}

function buildRelationLayoutPositions(dataset: Dataset, relationEdges: KnowledgeEdge[]) {
  const nodeMap = new Map(dataset.nodes.map((node) => [node.key, node]));
  const positions = new Map<string, Point>();
  const relationDegreeMap = createRelationDegreeMap(relationEdges);
  const familyKeyMap = new Map<string, string>();
  const clusters = buildPrimaryFamilyClusters(dataset, nodeMap);
  const familyRelationLinks = buildFamilyRelationLinks(relationEdges, nodeMap);
  const familyCenters = resolveFamilyCenters(clusters, familyRelationLinks);
  const secondaryChildren = groupBy(
    dataset.nodes.filter((node) => node.nodeRole === "entity"),
    (node) => {
      if (!node.parentKey) return null;
      const parent = nodeMap.get(node.parentKey);
      return parent?.nodeRole === "secondary_category" ? parent.key : null;
    },
  );

  dataset.nodes.forEach((node) => {
    const familyKey = getPrimaryFamilyKey(node, nodeMap);
    if (familyKey) familyKeyMap.set(node.key, familyKey);
  });

  dataset.nodes
    .filter((node) => node.nodeRole === "root")
    .forEach((node) => positions.set(node.key, { x: 0, y: 0 }));

  clusters.forEach((cluster) => {
    const primaryCenter = familyCenters.get(cluster.primaryKey)!;
    const outward = normalize(primaryCenter, getAngle({ x: cluster.primary.x, y: cluster.primary.y }));
    const baseAngle = getAngle(outward);
    const secondaryOrbit = 2.2 + Math.min(1.5, cluster.secondaries.length * 0.22);
    const directOrbit = cluster.secondaries.length > 0 ? secondaryOrbit + 2.05 : 2.9;

    positions.set(cluster.primaryKey, primaryCenter);

    cluster.secondaries.forEach((node, index) => {
      const angle =
        baseAngle +
        Math.PI / 2 +
        (cluster.secondaries.length === 1 ? 0 : (Math.PI * 2 * index) / cluster.secondaries.length);
      const secondaryCenter = add(primaryCenter, polar(secondaryOrbit, angle));
      positions.set(node.key, secondaryCenter);

      const children = [...(secondaryChildren.get(node.key) || [])].sort((left, right) => {
        const leftWeight = relationDegreeMap.get(left.key) || 0;
        const rightWeight = relationDegreeMap.get(right.key) || 0;
        if (leftWeight !== rightWeight) return rightWeight - leftWeight;
        return sortByLabel(left, right);
      });
      placeNodesOnOrbit(children, secondaryCenter, 1.7, 1.15, angle - Math.PI / 2, positions);
    });

    const directEntities = [...cluster.directEntities].sort((left, right) => {
      const leftWeight = relationDegreeMap.get(left.key) || 0;
      const rightWeight = relationDegreeMap.get(right.key) || 0;
      if (leftWeight !== rightWeight) return rightWeight - leftWeight;
      return sortByLabel(left, right);
    });
    placeNodesOnOrbit(directEntities, primaryCenter, directOrbit, 1.18, baseAngle, positions);
  });

  dataset.nodes.forEach((node) => {
    if (!positions.has(node.key)) {
      positions.set(node.key, { x: node.x * 0.48, y: node.y * 0.48 });
    }
  });

  return { familyKeyMap, positions, relationDegreeMap };
}

export function buildGraphScene(dataset: Dataset, viewMode: GraphViewMode): GraphScene {
  const nodeMap = new Map(dataset.nodes.map((node) => [node.key, node]));
  const hiddenRootKeys = new Set(dataset.nodes.filter((node) => node.nodeRole === "root").map((node) => node.key));
  const familyEdges = buildFamilyEdges(dataset, nodeMap);
  const relationEdges = dataset.edges.filter(
    (edge) => edge.edgeKind === "relation" && !hiddenRootKeys.has(edge.source) && !hiddenRootKeys.has(edge.target),
  );
  const relationLayout = buildRelationLayoutPositions(dataset, relationEdges);

  const edges: GraphEdgeAttributes[] = [...familyEdges, ...(viewMode === "relations" ? relationEdges : [])].map((edge) => ({
    ...edge,
    size: edge.edgeKind === "relation" ? 1.02 : 0.68,
    color: edge.edgeKind === "relation" ? "rgba(244, 248, 252, 0.24)" : "rgba(184, 195, 207, 0.2)",
    isSynthetic: edge.edgeKind === "family",
    hiddenByView: viewMode !== "relations",
  }));

  const degreeMap = createDegreeMap(dataset.nodes, edges);

  const nodes: GraphNodeAttributes[] = dataset.nodes.map((node) => {
    const degree = degreeMap.get(node.key) || 0;
    const isRootAnchor = node.nodeRole === "root";
    const layoutPoint =
      viewMode === "relations"
        ? relationLayout.positions.get(node.key) || { x: node.x * 0.48, y: node.y * 0.48 }
        : { x: node.x, y: node.y };

    return {
      ...node,
      x: layoutPoint.x,
      y: layoutPoint.y,
      size: computeNodeSize(node, degree),
      anchorX: layoutPoint.x,
      anchorY: layoutPoint.y,
      homeX: layoutPoint.x,
      homeY: layoutPoint.y,
      degree,
      relationDegree: relationLayout.relationDegreeMap.get(node.key) || 0,
      familyKey: relationLayout.familyKeyMap.get(node.key),
      importance: computeImportance(node, degree),
      isSynthetic: isRootAnchor,
      hiddenByView: isRootAnchor,
      alwaysShowLabel: node.nodeRole === "primary_category" || node.nodeRole === "secondary_category",
    };
  });

  const nodeIndex = nodes.reduce<Record<string, GraphNodeAttributes>>((index, node) => {
    index[node.key] = node;
    return index;
  }, {});

  return {
    nodes,
    edges,
    nodeIndex,
  };
}
