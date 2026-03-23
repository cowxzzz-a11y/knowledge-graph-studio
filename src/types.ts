export interface KnowledgeNode {
  key: string;
  label: string;
  nodeType: string;
  parentKey?: string;
  group: string;
  level: number;
  x: number;
  y: number;
  description: string;
  content: string;
  learningValue: string;
  relationHint?: string;
  childCount: number;
  color: string;
}

export interface KnowledgeEdge {
  key: string;
  source: string;
  target: string;
  relation: string;
}

export interface Dataset {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export interface GraphNodeAttributes extends KnowledgeNode {
  size: number;
  anchorX: number;
  anchorY: number;
  homeX?: number;
  homeY?: number;
  degree: number;
  importance: number;
  isSynthetic?: boolean;
  alwaysShowLabel?: boolean;
}

export interface GraphEdgeAttributes extends KnowledgeEdge {
  size: number;
  color: string;
  isSynthetic?: boolean;
}

export interface GraphScene {
  nodes: GraphNodeAttributes[];
  edges: GraphEdgeAttributes[];
  nodeIndex: Record<string, GraphNodeAttributes>;
}

export interface GraphControls {
  searchQuery: string;
  showArrows: boolean;
  showOrphans: boolean;
  textOpacity: number;
  nodeScale: number;
  edgeScale: number;
  gravity: number;
  repulsion: number;
  neighborAttraction: number;
  linkLength: number;
}

export interface Cluster {
  key: string;
  color: string;
  clusterLabel: string;
}

export interface Tag {
  key: string;
  image: string;
}

export interface FiltersState {
  clusters: Record<string, boolean>;
  tags: Record<string, boolean>;
}
