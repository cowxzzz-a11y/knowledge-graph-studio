export type GraphViewMode = "structure" | "relations";

export interface NodeStat {
  label: string;
  value: string;
}

export interface NodeAttribute {
  key: string;
  value: string;
}

export interface NodeEvidence {
  locator: string;
  quote: string;
  evidenceType: string;
  supportType: string;
  documentId?: string;
  documentTitle?: string;
  documentName?: string;
  pageHint?: number | null;
  sectionId?: string;
  sectionTitle?: string;
  paragraphIndex?: number | null;
  tableIndex?: number | null;
  figureIndex?: number | null;
  sourceText?: string;
  confidence?: string;
}

export interface RelationEvidence extends NodeEvidence {
  confidence?: string;
}

export interface NodeRelationDetail {
  relation: string;
  relationType: string;
  direction: "outgoing" | "incoming";
  otherNodeKey: string;
  otherLabel: string;
  confidence?: string;
  locator?: string;
  quote?: string;
  supportCount?: number;
  documentCount?: number;
  documents?: string[];
  evidence?: RelationEvidence[];
}

export interface NodeDetail {
  summary: string;
  stats: NodeStat[];
  aliases: string[];
  attributes: NodeAttribute[];
  evidence: NodeEvidence[];
  relations: NodeRelationDetail[];
  children: string[];
}

export interface KnowledgeNode {
  key: string;
  label: string;
  nodeType: string;
  nodeRole?: "root" | "primary_category" | "secondary_category" | "entity";
  parentKey?: string | null;
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
  schemaId?: string;
  categoryPath?: string;
  confidence?: string;
  documentIds?: string[];
  documentNames?: string[];
  detail?: NodeDetail;
}

export interface EdgeDocumentRef {
  documentId?: string;
  documentTitle?: string;
  documentName?: string;
}

export interface KnowledgeEdge {
  key: string;
  source: string;
  target: string;
  relation: string;
  edgeKind?: "structure" | "relation" | "family";
  confidence?: string;
  locator?: string;
  quote?: string;
  supportCount?: number;
  documentCount?: number;
  documents?: Array<string | EdgeDocumentRef>;
  evidence?: RelationEvidence[];
}

export interface DatasetMetadata {
  knowledgeBaseId: string;
  title: string;
  documentTitle: string;
  documentName: string;
  documentCount?: number;
  documentTitles?: string[];
  documentNames?: string[];
  runLabel: string;
  entityCount: number;
  categoryCount: number;
  relationCount: number;
  structureEdgeCount: number;
  dbPath: string;
  generatedFrom: string;
}

export interface Dataset {
  metadata?: DatasetMetadata;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export interface DocumentZone {
  key: string;
  label: string;
  title?: string;
  name?: string;
  centerX: number;
  centerY: number;
  radius: number;
  nodeCount: number;
}

export interface GraphNodeAttributes extends KnowledgeNode {
  originKey: string;
  documentKey?: string;
  documentName?: string;
  documentTitle?: string;
  isDocumentLabel?: boolean;
  documentCenterX?: number;
  documentCenterY?: number;
  documentRadius?: number;
  size: number;
  anchorX: number;
  anchorY: number;
  homeX?: number;
  homeY?: number;
  degree: number;
  relationDegree?: number;
  familyKey?: string;
  importance: number;
  isSynthetic?: boolean;
  hiddenByView?: boolean;
  alwaysShowLabel?: boolean;
}

export interface GraphEdgeAttributes extends KnowledgeEdge {
  size: number;
  color: string;
  isSynthetic?: boolean;
  hiddenByView?: boolean;
}

export interface GraphScene {
  nodes: GraphNodeAttributes[];
  edges: GraphEdgeAttributes[];
  nodeIndex: Record<string, GraphNodeAttributes>;
  documentZones: DocumentZone[];
}

export interface GraphControls {
  searchQuery: string;
  showArrows: boolean;
  showOrphans: boolean;
  textOpacity: number;
  nodeScale: number;
  edgeScale: number;
  edgeOpacity: number;
  edgeGray: number;
  gravity: number;
  repulsion: number;
  neighborAttraction: number;
  linkLength: number;
  viewMode: GraphViewMode;
}
