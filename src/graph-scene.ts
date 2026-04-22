import {
  Dataset,
  DocumentZone,
  GraphEdgeAttributes,
  GraphNodeAttributes,
  GraphScene,
  GraphViewMode,
  KnowledgeEdge,
  KnowledgeNode,
} from "./types";

type Point = {
  x: number;
  y: number;
};

type DocumentDescriptor = {
  key: string;
  label: string;
  name: string;
  title: string;
  order: number;
};

type SceneNode = KnowledgeNode & {
  originKey: string;
  documentKey: string;
  documentName: string;
  documentTitle: string;
};

type SceneEdge = KnowledgeEdge & {
  documentKey: string;
};

type FamilyCluster = {
  directEntities: SceneNode[];
  primary: SceneNode;
  primaryKey: string;
  radius: number;
  secondaries: SceneNode[];
};

type FamilyRelationLink = {
  leftKey: string;
  rightKey: string;
  weight: number;
};

type DocumentLayout = {
  descriptor: DocumentDescriptor;
  nodes: SceneNode[];
  structurePositions: Map<string, Point>;
  relationPositions: Map<string, Point>;
  familyKeyMap: Map<string, string>;
  relationDegreeMap: Map<string, number>;
  structureRadius: number;
  relationRadius: number;
};

const DOCUMENT_SPACING_STRUCTURE = 0.9;
const DOCUMENT_SPACING_RELATIONS = 1.2;
const DOCUMENT_PADDING = 5.8;

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

function sortClusters(left: FamilyCluster, right: FamilyCluster) {
  if (left.radius !== right.radius) return right.radius - left.radius;
  return sortByLabel(left.primary, right.primary);
}

function getAngle(point: Point) {
  return Math.atan2(point.y, point.x);
}

function normalizeText(value?: string | null) {
  return (value || "").trim();
}

function sortByLabel(left: { label: string }, right: { label: string }) {
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

function addWeight(map: Map<string, number>, key: string, value = 1) {
  map.set(key, (map.get(key) || 0) + value);
}

function createDegreeMap(nodes: SceneNode[], edges: GraphEdgeAttributes[]) {
  const degreeMap = new Map<string, number>();
  nodes.forEach((node) => degreeMap.set(node.key, 0));
  edges.forEach((edge) => {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
  });
  return degreeMap;
}

function createRelationDegreeMap(edges: Array<KnowledgeEdge | SceneEdge>) {
  const degreeMap = new Map<string, number>();
  edges.forEach((edge) => {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
  });
  return degreeMap;
}

function computeNodeSize(node: Pick<KnowledgeNode, "nodeRole" | "childCount">, degree: number) {
  const role = node.nodeRole || "entity";
  if (role === "root") return 9.8;
  if (role === "primary_category") return 5.7 + Math.min(2.2, node.childCount * 0.045);
  if (role === "secondary_category") return 4.8 + Math.min(1.4, node.childCount * 0.035);
  return 3 + Math.min(1.15, degree * 0.13);
}

function computeImportance(node: Pick<KnowledgeNode, "nodeRole" | "childCount">, degree: number) {
  const role = node.nodeRole || "entity";
  if (role === "root") return 9;
  if (role === "primary_category") return 7.2 + Math.min(2.2, node.childCount * 0.05);
  if (role === "secondary_category") return 6 + Math.min(1.4, node.childCount * 0.04);
  return 4 + Math.min(2, degree * 0.16);
}

function createVisualNodeKey(documentKey: string, originKey: string) {
  return `doc::${documentKey}::${originKey}`;
}

function findMatchingDocumentKey(
  idValue: string,
  nameValue: string,
  titleValue: string,
  keyById: Map<string, string>,
  keyByName: Map<string, string>,
  keyByTitle: Map<string, string>,
) {
  if (idValue && keyById.has(idValue)) return keyById.get(idValue)!;
  if (nameValue && keyByName.has(nameValue)) return keyByName.get(nameValue)!;
  if (titleValue && keyByTitle.has(titleValue)) return keyByTitle.get(titleValue)!;
  return null;
}

function collectDocumentDescriptors(dataset: Dataset) {
  const descriptors = new Map<string, DocumentDescriptor>();
  const keyById = new Map<string, string>();
  const keyByName = new Map<string, string>();
  const keyByTitle = new Map<string, string>();

  const register = (documentId?: string, documentName?: string, documentTitle?: string, order = Number.MAX_SAFE_INTEGER) => {
    const idValue = normalizeText(documentId);
    const nameValue = normalizeText(documentName);
    const titleValue = normalizeText(documentTitle);

    const existingKey = findMatchingDocumentKey(idValue, nameValue, titleValue, keyById, keyByName, keyByTitle);
    const key = existingKey || idValue || `doc::${descriptors.size}`;
    const current = descriptors.get(key);

    if (current) {
      const nextName = current.name || nameValue || titleValue || current.label;
      const nextTitle = current.title || titleValue || nameValue || current.label;
      descriptors.set(key, {
        ...current,
        name: nextName,
        title: nextTitle,
        label: nextName || nextTitle || current.label,
        order: Math.min(current.order, order),
      });
    } else {
      const name = nameValue || titleValue || `文档 ${descriptors.size + 1}`;
      const title = titleValue || nameValue || name;
      descriptors.set(key, {
        key,
        label: name,
        name,
        title,
        order,
      });
    }

    if (idValue) keyById.set(idValue, key);
    if (nameValue) keyByName.set(nameValue, key);
    if (titleValue) keyByTitle.set(titleValue, key);

    return key;
  };

  dataset.nodes.forEach((node) => {
    (node.documentIds || []).forEach((documentId, index) => {
      register(documentId, node.documentNames?.[index], undefined);
    });

    (node.detail?.evidence || []).forEach((evidence) => {
      register(evidence.documentId, evidence.documentName, evidence.documentTitle);
    });

    (node.detail?.relations || []).forEach((relation) => {
      (relation.evidence || []).forEach((evidence) => {
        register(evidence.documentId, evidence.documentName, evidence.documentTitle);
      });
    });
  });

  dataset.edges.forEach((edge) => {
    (edge.documents || []).forEach((document) => {
      if (typeof document === "string") {
        register(undefined, document, document);
        return;
      }
      register(document.documentId, document.documentName, document.documentTitle);
    });

    (edge.evidence || []).forEach((evidence) => {
      register(evidence.documentId, evidence.documentName, evidence.documentTitle);
    });
  });

  (dataset.metadata?.documentNames || []).forEach((name, index) => {
    register(undefined, name, dataset.metadata?.documentTitles?.[index], index);
  });

  return {
    documents: [...descriptors.values()].sort((left, right) => {
      if (left.order !== right.order) return left.order - right.order;
      return left.label.localeCompare(right.label, "zh-CN");
    }),
    keyById,
    keyByName,
    keyByTitle,
  };
}

function resolveDocumentKey(
  documentId: string | undefined,
  documentName: string | undefined,
  documentTitle: string | undefined,
  lookups: Pick<ReturnType<typeof collectDocumentDescriptors>, "keyById" | "keyByName" | "keyByTitle">,
) {
  const idValue = normalizeText(documentId);
  const nameValue = normalizeText(documentName);
  const titleValue = normalizeText(documentTitle);
  return findMatchingDocumentKey(idValue, nameValue, titleValue, lookups.keyById, lookups.keyByName, lookups.keyByTitle);
}

function collectNodeDocumentMembership(
  dataset: Dataset,
  lookups: ReturnType<typeof collectDocumentDescriptors>,
  documentMap: Map<string, DocumentDescriptor>,
) {
  const nodeMap = new Map(dataset.nodes.map((node) => [node.key, node]));
  const childrenByParent = groupBy(
    dataset.nodes.filter((node) => node.parentKey),
    (node) => node.parentKey || null,
  );
  const directMembership = new Map<string, Set<string>>();
  const resolvedMembership = new Map<string, Set<string>>();

  dataset.nodes.forEach((node) => {
    const documents = new Set<string>();

    (node.documentIds || []).forEach((documentId, index) => {
      const key = resolveDocumentKey(documentId, node.documentNames?.[index], undefined, lookups);
      if (key && documentMap.has(key)) documents.add(key);
    });

    (node.documentNames || []).forEach((documentName) => {
      const key = resolveDocumentKey(undefined, documentName, undefined, lookups);
      if (key && documentMap.has(key)) documents.add(key);
    });

    (node.detail?.evidence || []).forEach((evidence) => {
      const key = resolveDocumentKey(evidence.documentId, evidence.documentName, evidence.documentTitle, lookups);
      if (key && documentMap.has(key)) documents.add(key);
    });

    (node.detail?.relations || []).forEach((relation) => {
      (relation.evidence || []).forEach((evidence) => {
        const key = resolveDocumentKey(evidence.documentId, evidence.documentName, evidence.documentTitle, lookups);
        if (key && documentMap.has(key)) documents.add(key);
      });

      (relation.documents || []).forEach((documentName) => {
        const key = resolveDocumentKey(undefined, documentName, undefined, lookups);
        if (key && documentMap.has(key)) documents.add(key);
      });
    });

    directMembership.set(node.key, documents);
  });

  const collect = (nodeKey: string): Set<string> => {
    if (resolvedMembership.has(nodeKey)) {
      return resolvedMembership.get(nodeKey)!;
    }

    const node = nodeMap.get(nodeKey);
    const membership = new Set(directMembership.get(nodeKey) || []);

    (childrenByParent.get(nodeKey) || []).forEach((child) => {
      collect(child.key).forEach((documentKey) => membership.add(documentKey));
    });

    if (!membership.size && node?.nodeRole !== "root" && node?.parentKey) {
      const parentDirectMembership = directMembership.get(node.parentKey);
      if (parentDirectMembership?.size) {
        parentDirectMembership.forEach((documentKey) => membership.add(documentKey));
      }
    }

    resolvedMembership.set(nodeKey, membership);
    return membership;
  };

  dataset.nodes.forEach((node) => {
    collect(node.key);
  });

  return resolvedMembership;
}

function resolveVisualParentKey(
  node: KnowledgeNode,
  documentKey: string,
  membershipByNode: Map<string, Set<string>>,
  nodeMap: Map<string, KnowledgeNode>,
) {
  let currentParentKey = node.parentKey;

  while (currentParentKey) {
    const parent = nodeMap.get(currentParentKey);
    if (!parent) return null;
    if (parent.nodeRole === "root") return null;
    if (membershipByNode.get(parent.key)?.has(documentKey)) {
      return createVisualNodeKey(documentKey, parent.key);
    }
    currentParentKey = parent.parentKey || null;
  }

  return null;
}

function collectDescendantCount(nodeKey: string, childrenByParent: Map<string, SceneNode[]>, cache: Map<string, number>): number {
  if (cache.has(nodeKey)) return cache.get(nodeKey)!;

  const children = childrenByParent.get(nodeKey) || [];
  const count = children.reduce((sum, child) => sum + 1 + collectDescendantCount(child.key, childrenByParent, cache), 0);
  cache.set(nodeKey, count);
  return count;
}

function buildVisualGraph(dataset: Dataset) {
  const documentInfo = collectDocumentDescriptors(dataset);
  const documentMap = new Map(documentInfo.documents.map((document) => [document.key, document]));
  const nodeMap = new Map(dataset.nodes.map((node) => [node.key, node]));
  const membershipByNode = collectNodeDocumentMembership(dataset, documentInfo, documentMap);
  const visualNodes: SceneNode[] = [];
  const visualNodeIndex = new Map<string, SceneNode>();

  dataset.nodes.forEach((node) => {
    if (node.nodeRole === "root") return;

    const membership = [...(membershipByNode.get(node.key) || [])].filter((documentKey) => documentMap.has(documentKey));
    membership.sort((left, right) => {
      const leftOrder = documentMap.get(left)?.order || Number.MAX_SAFE_INTEGER;
      const rightOrder = documentMap.get(right)?.order || Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    });

    membership.forEach((documentKey) => {
      const document = documentMap.get(documentKey);
      if (!document) return;

      const visualNode: SceneNode = {
        ...node,
        key: createVisualNodeKey(documentKey, node.key),
        originKey: node.key,
        parentKey: null,
        group: documentKey,
        documentKey,
        documentName: document.name,
        documentTitle: document.title,
      };

      visualNodes.push(visualNode);
      visualNodeIndex.set(visualNode.key, visualNode);
    });
  });

  visualNodes.forEach((node) => {
    const sourceNode = nodeMap.get(node.originKey);
    if (!sourceNode) return;
    node.parentKey = resolveVisualParentKey(sourceNode, node.documentKey, membershipByNode, nodeMap);
  });

  const childrenByParent = groupBy(
    visualNodes.filter((node) => node.parentKey),
    (node) => node.parentKey || null,
  );
  const descendantCountCache = new Map<string, number>();

  visualNodes.forEach((node) => {
    node.childCount = collectDescendantCount(node.key, childrenByParent, descendantCountCache);
  });

  const familyEdges: SceneEdge[] = visualNodes
    .filter((node) => node.parentKey)
    .map((node) => ({
      key: `family::${node.parentKey}::${node.key}`,
      source: node.parentKey!,
      target: node.key,
      relation: node.nodeRole === "secondary_category" ? "二级类" : "归属",
      edgeKind: "family",
      documentKey: node.documentKey,
    }));

  const relationEdges: SceneEdge[] = [];
  const relationEdgeKeys = new Set<string>();

  dataset.edges
    .filter((edge) => edge.edgeKind === "relation")
    .forEach((edge) => {
      const edgeDocuments = new Set<string>();

      (edge.documents || []).forEach((document) => {
        if (typeof document === "string") {
          const key = resolveDocumentKey(undefined, document, document, documentInfo);
          if (key) edgeDocuments.add(key);
          return;
        }

        const key = resolveDocumentKey(document.documentId, document.documentName, document.documentTitle, documentInfo);
        if (key) edgeDocuments.add(key);
      });

      (edge.evidence || []).forEach((evidence) => {
        const key = resolveDocumentKey(evidence.documentId, evidence.documentName, evidence.documentTitle, documentInfo);
        if (key) edgeDocuments.add(key);
      });

      if (!edgeDocuments.size) {
        const sourceDocuments = membershipByNode.get(edge.source) || new Set<string>();
        const targetDocuments = membershipByNode.get(edge.target) || new Set<string>();
        sourceDocuments.forEach((documentKey) => {
          if (targetDocuments.has(documentKey)) edgeDocuments.add(documentKey);
        });
      }

      edgeDocuments.forEach((documentKey) => {
        const sourceKey = createVisualNodeKey(documentKey, edge.source);
        const targetKey = createVisualNodeKey(documentKey, edge.target);

        if (!visualNodeIndex.has(sourceKey) || !visualNodeIndex.has(targetKey) || sourceKey === targetKey) return;

        const relationKey = `relation::${documentKey}::${edge.key}`;
        if (relationEdgeKeys.has(relationKey)) return;

        relationEdgeKeys.add(relationKey);
        relationEdges.push({
          ...edge,
          key: relationKey,
          source: sourceKey,
          target: targetKey,
          documentKey,
        });
      });
    });

  return {
    documents: documentInfo.documents,
    visualNodes,
    familyEdges,
    relationEdges,
  };
}

function getPrimaryFamilyKey(node: SceneNode, nodeMap: Map<string, SceneNode>) {
  if (node.nodeRole === "primary_category") return node.key;
  if (!node.parentKey) return null;

  const parent = nodeMap.get(node.parentKey);
  if (!parent) return null;
  if (parent.nodeRole === "primary_category") return parent.key;
  if (parent.nodeRole === "secondary_category" && parent.parentKey) return parent.parentKey;
  return null;
}

function buildFamilyRelationLinks(relationEdges: SceneEdge[], nodeMap: Map<string, SceneNode>) {
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

function resolveRelationIslandCenters(clusters: FamilyCluster[], relationLinks: FamilyRelationLink[]) {
  const centers = new Map<string, Point>();
  const sorted = [...clusters].sort(sortClusters);

  if (!sorted.length) return centers;
  if (sorted.length === 1) {
    centers.set(sorted[0].primaryKey, { x: 0, y: 0 });
    return centers;
  }

  const maxRadius = Math.max(...sorted.map((cluster) => cluster.radius));
  const radiusMap = new Map(sorted.map((cluster) => [cluster.primaryKey, cluster.radius]));
  const connectedKeys = new Set<string>();

  relationLinks.forEach((link) => {
    connectedKeys.add(link.leftKey);
    connectedKeys.add(link.rightKey);
  });

  sorted.forEach((cluster, index) => {
    if (index === 0) {
      centers.set(cluster.primaryKey, { x: 0, y: 0 });
      return;
    }

    const angle = -Math.PI / 2 + (Math.PI * 2 * (index - 1)) / Math.max(1, sorted.length - 1);
    const ringRadius = connectedKeys.has(cluster.primaryKey)
      ? maxRadius * 0.78 + (index % 3) * 0.85
      : maxRadius * 1.18 + (index % 4) * 0.9;
    centers.set(cluster.primaryKey, polar(ringRadius, angle));
  });

  for (let step = 0; step < 220; step += 1) {
    for (let index = 0; index < sorted.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < sorted.length; otherIndex += 1) {
        const left = sorted[index];
        const right = sorted[otherIndex];
        const leftPoint = centers.get(left.primaryKey)!;
        const rightPoint = centers.get(right.primaryKey)!;
        const delta = { x: rightPoint.x - leftPoint.x, y: rightPoint.y - leftPoint.y };
        const distance = Math.max(0.001, length(delta));
        const minDistance = left.radius + right.radius + 0.55;

        if (distance >= minDistance) continue;

        const push = ((minDistance - distance) / minDistance) * 0.26;
        const direction = normalize(delta, (Math.PI * 2 * index) / sorted.length);

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
      const desiredDistance = leftRadius + rightRadius + Math.max(0.45, 1.1 - link.weight * 0.08);
      const direction = normalize(delta, 0);

      if (distance > desiredDistance) {
        const pull = Math.min(distance - desiredDistance, 4.2) * 0.032 * Math.min(link.weight, 4);
        leftPoint.x += direction.x * pull * 0.5;
        leftPoint.y += direction.y * pull * 0.5;
        rightPoint.x -= direction.x * pull * 0.5;
        rightPoint.y -= direction.y * pull * 0.5;
      }
    });

    sorted.forEach((cluster, index) => {
      const current = centers.get(cluster.primaryKey)!;
      const compactStrength = index === 0 ? 0.02 : connectedKeys.has(cluster.primaryKey) ? 0.024 : 0.018;
      current.x *= 1 - compactStrength;
      current.y *= 1 - compactStrength;
    });
  }

  return centers;
}

function computeFamilyRadius(primary: SceneNode, secondaries: SceneNode[], directEntities: SceneNode[]) {
  const descendantCount =
    directEntities.length + secondaries.length + secondaries.reduce((sum, node) => sum + node.childCount, 0);
  return 3.3 + Math.sqrt(Math.max(1, descendantCount + primary.childCount)) * 0.56 + secondaries.length * 0.18;
}

function buildPrimaryFamilyClusters(nodes: SceneNode[], nodeMap: Map<string, SceneNode>) {
  const secondaryByPrimary = groupBy(
    nodes.filter((node) => node.nodeRole === "secondary_category"),
    (node) => node.parentKey || null,
  );
  const directEntitiesByPrimary = groupBy(
    nodes.filter((node) => node.nodeRole === "entity"),
    (node) => {
      if (!node.parentKey) return null;
      const parent = nodeMap.get(node.parentKey);
      return parent?.nodeRole === "primary_category" ? parent.key : null;
    },
  );

  return nodes
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
  const shrinkRatio = 0.34;

  if (sorted.length === 1) {
    centers.set(sorted[0].primaryKey, { x: 0, y: 0 });
    return centers;
  }

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
        const minDistance = left.radius + right.radius + 1.4;

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
      const desiredDistance = leftRadius + rightRadius + Math.max(1.8, 3.4 - link.weight * 0.36);
      if (distance <= desiredDistance) return;

      const pull = Math.min(distance - desiredDistance, 5) * 0.03 * Math.min(link.weight, 3);
      const direction = normalize(delta, 0);
      leftPoint.x += direction.x * pull * 0.5;
      leftPoint.y += direction.y * pull * 0.5;
      rightPoint.x -= direction.x * pull * 0.5;
      rightPoint.y -= direction.y * pull * 0.5;
    });

    sorted.forEach((cluster) => {
      const current = centers.get(cluster.primaryKey)!;
      const target = targets.get(cluster.primaryKey)!;
      current.x += (target.x - current.x) * 0.05;
      current.y += (target.y - current.y) * 0.05;
    });
  }

  return centers;
}

function placeNodesOnOrbit(
  nodes: SceneNode[],
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
    const ringCapacity = Math.max(6, Math.floor(circumference / 2.12));
    const ringNodes = nodes.slice(placed, placed + ringCapacity);
    const offset = ringIndex % 2 === 0 ? 0 : Math.PI / Math.max(2, ringNodes.length);

    ringNodes.forEach((node, index) => {
      const angle = startAngle + offset + (Math.PI * 2 * index) / ringNodes.length;
      positions.set(node.key, add(center, polar(radius, angle)));
    });

    placed += ringNodes.length;
    ringIndex += 1;
  }
}

function normalizeArc(startAngle: number, endAngle: number) {
  let span = endAngle - startAngle;
  while (span <= 0) span += Math.PI * 2;
  return span;
}

function placeNodesInArc(
  nodes: SceneNode[],
  center: Point,
  initialRadius: number,
  ringGap: number,
  startAngle: number,
  endAngle: number,
  positions: Map<string, Point>,
) {
  if (!nodes.length) return;

  const span = normalizeArc(startAngle, endAngle);
  let placed = 0;
  let ringIndex = 0;

  while (placed < nodes.length) {
    const radius = initialRadius + ringGap * ringIndex;
    const arcLength = Math.max(5.8, radius * span);
    const ringCapacity = Math.max(3, Math.floor(arcLength / 1.8));
    const ringNodes = nodes.slice(placed, placed + ringCapacity);

    ringNodes.forEach((node, index) => {
      const ratio = ringNodes.length === 1 ? 0.5 : index / (ringNodes.length - 1);
      const angle = startAngle + span * ratio;
      positions.set(node.key, add(center, polar(radius, angle)));
    });

    placed += ringNodes.length;
    ringIndex += 1;
  }
}

function recenterPositions(positions: Map<string, Point>) {
  const points = [...positions.values()];
  if (!points.length) return;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  points.forEach((point) => {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  positions.forEach((point, key) => {
    positions.set(key, {
      x: point.x - centerX,
      y: point.y - centerY,
    });
  });
}

function measureLayoutRadius(nodes: SceneNode[], positions: Map<string, Point>, hierarchyEdges: SceneEdge[], relationEdges: SceneEdge[]) {
  const degreeMap = createRelationDegreeMap([...hierarchyEdges, ...relationEdges]);
  let radius = 8;

  nodes.forEach((node) => {
    const point = positions.get(node.key) || { x: 0, y: 0 };
    const size = computeNodeSize(node, degreeMap.get(node.key) || 0);
    radius = Math.max(radius, Math.hypot(point.x, point.y) + size * 1.2);
  });

  return radius + DOCUMENT_PADDING;
}

function buildDocumentStructureLayout(nodes: SceneNode[]) {
  const nodeMap = new Map(nodes.map((node) => [node.key, node]));
  const positions = new Map<string, Point>();
  const primaryNodes = nodes.filter((node) => node.nodeRole === "primary_category").sort(sortByLabel);
  const secondaryByPrimary = groupBy(
    nodes.filter((node) => node.nodeRole === "secondary_category"),
    (node) => {
      const parent = node.parentKey ? nodeMap.get(node.parentKey) : null;
      return parent?.nodeRole === "primary_category" ? parent.key : null;
    },
  );
  const directEntitiesByPrimary = groupBy(
    nodes.filter((node) => node.nodeRole === "entity"),
    (node) => {
      const parent = node.parentKey ? nodeMap.get(node.parentKey) : null;
      return parent?.nodeRole === "primary_category" ? parent.key : null;
    },
  );
  const entitiesBySecondary = groupBy(
    nodes.filter((node) => node.nodeRole === "entity"),
    (node) => {
      const parent = node.parentKey ? nodeMap.get(node.parentKey) : null;
      return parent?.nodeRole === "secondary_category" ? parent.key : null;
    },
  );

  if (!primaryNodes.length) {
    placeNodesOnOrbit(nodes.sort(sortByLabel), { x: 0, y: 0 }, 2.8, 1.35, -Math.PI / 2, positions);
    recenterPositions(positions);
    return positions;
  }

  const primaryRing = primaryNodes.length <= 2 ? 2.8 : 3.6;
  const sectorPadding = 0.12;

  primaryNodes.forEach((primary, index) => {
    const ratio = primaryNodes.length === 1 ? 0 : index / primaryNodes.length;
    const angle = -Math.PI / 2 + ratio * Math.PI * 2;
    positions.set(primary.key, polar(primaryRing, angle));
  });

  primaryNodes.forEach((primary, index) => {
    const baseAngle = getAngle(positions.get(primary.key) || { x: 0, y: 0 });
    const sectorSpan = (Math.PI * 2) / Math.max(primaryNodes.length, 1);
    const startAngle = baseAngle - sectorSpan / 2 + sectorPadding;
    const endAngle = baseAngle + sectorSpan / 2 - sectorPadding;

    const secondaries = [...(secondaryByPrimary.get(primary.key) || [])].sort(sortByLabel);
    placeNodesInArc(secondaries, { x: 0, y: 0 }, 6.6, 1.1, startAngle, endAngle, positions);

    secondaries.forEach((secondary, secondaryIndex) => {
      const secondaryAngle =
        secondaries.length <= 1
          ? baseAngle
          : startAngle + ((endAngle - startAngle) * secondaryIndex) / Math.max(1, secondaries.length - 1);
      const childArc = 0.42;
      const secondaryChildren = [...(entitiesBySecondary.get(secondary.key) || [])].sort(sortByLabel);
      placeNodesInArc(
        secondaryChildren,
        { x: 0, y: 0 },
        10.1,
        1.08,
        secondaryAngle - childArc,
        secondaryAngle + childArc,
        positions,
      );
    });

    const directEntities = [...(directEntitiesByPrimary.get(primary.key) || [])].sort(sortByLabel);
    placeNodesInArc(directEntities, { x: 0, y: 0 }, 8.9, 1.15, startAngle, endAngle, positions);
  });

  const unpositioned = nodes.filter((node) => !positions.has(node.key)).sort(sortByLabel);
  placeNodesOnOrbit(unpositioned, { x: 0, y: 0 }, 11.2, 1.25, -Math.PI / 2, positions);
  recenterPositions(positions);
  return positions;
}

function buildDocumentRelationLayout(nodes: SceneNode[], relationEdges: SceneEdge[]) {
  const nodeMap = new Map(nodes.map((node) => [node.key, node]));
  const positions = new Map<string, Point>();
  const relationDegreeMap = createRelationDegreeMap(relationEdges);
  const familyKeyMap = new Map<string, string>();
  const clusters = buildPrimaryFamilyClusters(nodes, nodeMap);
  const familyRelationLinks = buildFamilyRelationLinks(relationEdges, nodeMap);
  const familyCenters = resolveRelationIslandCenters(clusters, familyRelationLinks);
  const secondaryChildren = groupBy(
    nodes.filter((node) => node.nodeRole === "entity"),
    (node) => {
      if (!node.parentKey) return null;
      const parent = nodeMap.get(node.parentKey);
      return parent?.nodeRole === "secondary_category" ? parent.key : null;
    },
  );

  nodes.forEach((node) => {
    const familyKey = getPrimaryFamilyKey(node, nodeMap);
    if (familyKey) familyKeyMap.set(node.key, familyKey);
  });

  clusters.forEach((cluster) => {
    const primaryCenter = familyCenters.get(cluster.primaryKey) || { x: 0, y: 0 };
    const outward = normalize(primaryCenter, getAngle({ x: cluster.primary.x, y: cluster.primary.y }));
    const baseAngle = getAngle(outward);
    const secondaryOrbit = 1.75 + Math.min(1.15, cluster.secondaries.length * 0.15);
    const directOrbit = cluster.secondaries.length > 0 ? secondaryOrbit + 1.9 : 2.7;

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
      placeNodesOnOrbit(children, secondaryCenter, 1.2, 0.92, angle - Math.PI / 2, positions);
    });

    const directEntities = [...cluster.directEntities].sort((left, right) => {
      const leftWeight = relationDegreeMap.get(left.key) || 0;
      const rightWeight = relationDegreeMap.get(right.key) || 0;
      if (leftWeight !== rightWeight) return rightWeight - leftWeight;
      return sortByLabel(left, right);
    });
    placeNodesOnOrbit(directEntities, primaryCenter, directOrbit, 0.96, baseAngle, positions);
  });

  const positionedNodes = new Set(positions.keys());
  const orphanNodes = nodes
    .filter((node) => !positionedNodes.has(node.key))
    .sort((left, right) => {
      if ((left.nodeRole || "") !== (right.nodeRole || "")) {
        return (left.nodeRole || "").localeCompare(right.nodeRole || "");
      }
      return sortByLabel(left, right);
    });

  placeNodesOnOrbit(orphanNodes, { x: 0, y: 0 }, 4.4, 1.15, -Math.PI / 2, positions);
  recenterPositions(positions);

  return {
    positions,
    familyKeyMap,
    relationDegreeMap,
  };
}

function buildDocumentLocalLayout(nodes: SceneNode[], relationEdges: SceneEdge[], hierarchyEdges: SceneEdge[], descriptor: DocumentDescriptor): DocumentLayout {
  const structurePositions = buildDocumentStructureLayout(nodes);
  const relationLayout = buildDocumentRelationLayout(nodes, relationEdges);
  const structureRadius = measureLayoutRadius(nodes, structurePositions, hierarchyEdges, relationEdges);
  const relationRadius = measureLayoutRadius(nodes, relationLayout.positions, hierarchyEdges, relationEdges);

  return {
    descriptor,
    nodes,
    structurePositions,
    relationPositions: relationLayout.positions,
    familyKeyMap: relationLayout.familyKeyMap,
    relationDegreeMap: relationLayout.relationDegreeMap,
    structureRadius,
    relationRadius,
  };
}

function getDocumentRadius(layout: DocumentLayout, viewMode: GraphViewMode) {
  return viewMode === "relations" ? layout.relationRadius : layout.structureRadius;
}

function resolveDocumentCenters(layouts: DocumentLayout[], viewMode: GraphViewMode) {
  const centers = new Map<string, Point>();

  if (!layouts.length) return centers;

  if (layouts.length === 1) {
    centers.set(layouts[0].descriptor.key, { x: 0, y: 0 });
    return centers;
  }

  if (layouts.length === 2) {
    const [left, right] = layouts;
    const gap =
      getDocumentRadius(left, viewMode) +
      getDocumentRadius(right, viewMode) +
      (viewMode === "relations" ? DOCUMENT_SPACING_RELATIONS : DOCUMENT_SPACING_STRUCTURE);
    centers.set(left.descriptor.key, { x: -gap / 2, y: 0 });
    centers.set(right.descriptor.key, { x: gap / 2, y: 0 });
    return centers;
  }

  const averageRadius = layouts.reduce((sum, layout) => sum + getDocumentRadius(layout, viewMode), 0) / layouts.length;
  const ringRadius = Math.max(averageRadius * 1.72, 14 + layouts.length * 1.05);

  layouts.forEach((layout, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / layouts.length;
    centers.set(layout.descriptor.key, polar(ringRadius, angle));
  });

  return centers;
}

function buildDocumentLayouts(nodes: SceneNode[], familyEdges: SceneEdge[], relationEdges: SceneEdge[], documents: DocumentDescriptor[]) {
  const nodesByDocument = groupBy(nodes, (node) => node.documentKey);
  const familyEdgesByDocument = groupBy(familyEdges, (edge) => edge.documentKey);
  const relationEdgesByDocument = groupBy(relationEdges, (edge) => edge.documentKey);

  return documents
    .map((descriptor) => {
      const documentNodes = nodesByDocument.get(descriptor.key) || [];
      if (!documentNodes.length) return null;

      return buildDocumentLocalLayout(
        documentNodes,
        relationEdgesByDocument.get(descriptor.key) || [],
        familyEdgesByDocument.get(descriptor.key) || [],
        descriptor,
      );
    })
    .filter((layout): layout is DocumentLayout => Boolean(layout));
}

function buildDocumentZones(layouts: DocumentLayout[], centers: Map<string, Point>, viewMode: GraphViewMode): DocumentZone[] {
  return layouts.map((layout) => {
    const center = centers.get(layout.descriptor.key) || { x: 0, y: 0 };
    return {
      key: layout.descriptor.key,
      label: layout.descriptor.name,
      title: layout.descriptor.title,
      name: layout.descriptor.name,
      centerX: center.x,
      centerY: center.y,
      radius: getDocumentRadius(layout, viewMode),
      nodeCount: layout.nodes.length,
    };
  });
}

function createGlobalDescriptor(dataset: Dataset): DocumentDescriptor {
  const title = dataset.metadata?.title || "知识库";
  return {
    key: "knowledge-base",
    label: title,
    name: title,
    title: dataset.metadata?.generatedFrom || title,
    order: 0,
  };
}

function joinSourceLabels(values: string[] | undefined, fallback: string) {
  const unique = [...new Set((values || []).map((value) => normalizeText(value)).filter(Boolean))];
  if (!unique.length) return fallback;
  if (unique.length === 1) return unique[0];
  return `${unique.length} 个文档`;
}

function buildGlobalVisualGraph(dataset: Dataset) {
  const descriptor = createGlobalDescriptor(dataset);
  const visualNodes: SceneNode[] = dataset.nodes.map((node) => ({
    ...node,
    originKey: node.key,
    documentKey: descriptor.key,
    documentName: joinSourceLabels(node.documentNames, descriptor.name),
    documentTitle: joinSourceLabels(node.documentNames || node.documentIds, descriptor.title),
    group: node.group || descriptor.key,
  }));

  const visualNodeKeys = new Set(visualNodes.map((node) => node.key));
  const familyEdges: SceneEdge[] = dataset.edges
    .filter((edge) => edge.edgeKind === "structure" || edge.edgeKind === "family")
    .filter((edge) => visualNodeKeys.has(edge.source) && visualNodeKeys.has(edge.target))
    .map((edge) => ({
      ...edge,
      edgeKind: "family",
      documentKey: descriptor.key,
    }));

  const relationEdges: SceneEdge[] = dataset.edges
    .filter((edge) => edge.edgeKind === "relation")
    .filter((edge) => visualNodeKeys.has(edge.source) && visualNodeKeys.has(edge.target) && edge.source !== edge.target)
    .map((edge) => ({
      ...edge,
      documentKey: descriptor.key,
    }));

  return {
    descriptor,
    visualNodes,
    familyEdges,
    relationEdges,
  };
}

export function buildGraphScene(dataset: Dataset, viewMode: GraphViewMode): GraphScene {
  const { descriptor, visualNodes, familyEdges, relationEdges } = buildGlobalVisualGraph(dataset);
  const rootNodes = visualNodes.filter((node) => node.nodeRole === "root");
  const layoutNodes = visualNodes.filter((node) => node.nodeRole !== "root");
  const structurePositions = buildDocumentStructureLayout(layoutNodes);
  rootNodes.forEach((node) => structurePositions.set(node.key, { x: 0, y: 0 }));

  const relationLayout = buildDocumentRelationLayout(layoutNodes, relationEdges);
  rootNodes.forEach((node) => relationLayout.positions.set(node.key, { x: 0, y: 0 }));
  const positionMap = viewMode === "relations" ? relationLayout.positions : structurePositions;
  const relationDegreeMap = relationLayout.relationDegreeMap;
  const familyKeyMap = relationLayout.familyKeyMap;

  const activeEdges = [...familyEdges, ...(viewMode === "relations" ? relationEdges : [])];
  const radius = measureLayoutRadius(visualNodes, positionMap, familyEdges, relationEdges);
  const documentZones: DocumentZone[] = [
    {
      key: descriptor.key,
      label: descriptor.label,
      title: descriptor.title,
      name: descriptor.name,
      centerX: 0,
      centerY: 0,
      radius,
      nodeCount: visualNodes.length,
    },
  ];

  const edges: GraphEdgeAttributes[] = activeEdges.map((edge) => ({
    ...edge,
    size: edge.edgeKind === "relation" ? 1.02 : 0.68,
    color: edge.edgeKind === "relation" ? "rgba(244, 248, 252, 0.24)" : "rgba(184, 195, 207, 0.2)",
    isSynthetic: edge.edgeKind === "family",
    hiddenByView: edge.edgeKind === "relation" ? viewMode !== "relations" : false,
  }));

  const degreeMap = createDegreeMap(visualNodes, edges);

  const nodes: GraphNodeAttributes[] = visualNodes.map((node) => {
    const degree = degreeMap.get(node.key) || 0;
    const layoutPoint = positionMap.get(node.key) || { x: 0, y: 0 };

    return {
      ...node,
      x: layoutPoint.x,
      y: layoutPoint.y,
      documentCenterX: 0,
      documentCenterY: 0,
      documentRadius: radius,
      size: computeNodeSize(node, degree),
      anchorX: layoutPoint.x,
      anchorY: layoutPoint.y,
      homeX: layoutPoint.x,
      homeY: layoutPoint.y,
      degree,
      relationDegree: relationDegreeMap.get(node.key) || 0,
      familyKey: familyKeyMap.get(node.key),
      importance: computeImportance(node, degree),
      isSynthetic: false,
      hiddenByView: false,
      alwaysShowLabel: node.nodeRole === "root" || node.nodeRole === "primary_category",
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
    documentZones,
  };
}
