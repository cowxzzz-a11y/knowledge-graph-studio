import { useSigma } from "@react-sigma/core";
import { Attributes } from "graphology-types";
import { FC, useEffect, useRef } from "react";

import { GraphControls, GraphScene } from "../types";

type Props = {
  controls: GraphControls;
  scene: GraphScene | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseRgba(color: string) {
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) {
    return { r: 160, g: 160, b: 160, a: 0.3 };
  }

  const channels = match[1].split(",").map((part) => part.trim());
  return {
    r: Number(channels[0] || 160),
    g: Number(channels[1] || 160),
    b: Number(channels[2] || 160),
    a: channels[3] === undefined ? 1 : Number(channels[3]),
  };
}

function truncateLabel(value: string, maxLength = 24) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

const GraphEdgeOverlay: FC<Props> = ({ controls, scene }) => {
  const sigma = useSigma();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const graph = sigma.getGraph();

    const resizeCanvas = () => {
      const container = sigma.getContainer();
      const width = Math.max(1, container.offsetWidth);
      const height = Math.max(1, container.offsetHeight);
      const pixelRatio = window.devicePixelRatio || 1;

      if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
    };

    const drawDocumentZones = (context: CanvasRenderingContext2D) => {
      if (!scene?.documentZones.length) return;

      scene.documentZones.forEach((zone) => {
        const center = sigma.framedGraphToViewport({ x: zone.centerX, y: zone.centerY });
        const radiusPoint = sigma.framedGraphToViewport({ x: zone.centerX + zone.radius, y: zone.centerY });
        const radius = Math.max(16, Math.abs(radiusPoint.x - center.x));

        context.save();
        context.beginPath();
        context.arc(center.x, center.y, radius, 0, Math.PI * 2);
        context.fillStyle = "rgba(225, 232, 242, 0.018)";
        context.strokeStyle = "rgba(225, 232, 242, 0.12)";
        context.lineWidth = 1;
        context.fill();
        context.stroke();
        context.restore();
      });
    };

    const drawRelationEdges = (context: CanvasRenderingContext2D) => {
      const drawableEdges: Array<{
        color: string;
        size: number;
        source: Attributes;
        target: Attributes;
        zIndex: number;
      }> = [];

      graph.forEachEdge((edge) => {
        const edgeData = sigma.getEdgeDisplayData(edge);
        if (!edgeData || edgeData.hidden) return;

        const sourceKey = graph.source(edge);
        const targetKey = graph.target(edge);
        const sourceData = sigma.getNodeDisplayData(sourceKey);
        const targetData = sigma.getNodeDisplayData(targetKey);
        if (!sourceData || !targetData || sourceData.hidden || targetData.hidden) return;

        drawableEdges.push({
          color: String(edgeData.color || "rgba(160,160,160,0.3)"),
          size: clamp(sigma.scaleSize(edgeData.size || 1) * (0.68 + controls.edgeScale * 0.34), 1.2, 5.8),
          source: sourceData,
          target: targetData,
          zIndex: typeof edgeData.zIndex === "number" ? edgeData.zIndex : 0,
        });
      });

      drawableEdges.sort((left, right) => left.zIndex - right.zIndex);

      context.lineCap = "round";
      context.lineJoin = "round";
      context.imageSmoothingEnabled = true;

      drawableEdges.forEach((edge) => {
        const source = sigma.framedGraphToViewport({ x: Number(edge.source.x), y: Number(edge.source.y) });
        const target = sigma.framedGraphToViewport({ x: Number(edge.target.x), y: Number(edge.target.y) });
        const parsed = parseRgba(edge.color);
        const gray = clamp(Math.round(controls.edgeGray), 96, 220);
        const strokeStyle =
          edge.zIndex > 0
            ? `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${clamp(parsed.a * Math.max(0.72, controls.edgeOpacity), 0.18, 0.88)})`
            : `rgba(${gray}, ${gray}, ${gray}, ${clamp(parsed.a * controls.edgeOpacity * 0.92, 0.04, 0.32)})`;

        context.beginPath();
        context.strokeStyle = strokeStyle;
        context.lineWidth = edge.size;
        context.moveTo(source.x, source.y);
        context.lineTo(target.x, target.y);
        context.stroke();
      });
    };

    const draw = () => {
      resizeCanvas();

      const context = canvas.getContext("2d");
      if (!context) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const pixelRatio = window.devicePixelRatio || 1;

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.scale(pixelRatio, pixelRatio);
      context.clearRect(0, 0, width, height);

      drawDocumentZones(context);

      if (controls.viewMode === "relations") {
        drawRelationEdges(context);
      }
    };

    draw();
    sigma.on("afterRender", draw);
    sigma.on("resize", draw);
    window.addEventListener("resize", draw);

    return () => {
      sigma.removeListener("afterRender", draw);
      sigma.removeListener("resize", draw);
      window.removeEventListener("resize", draw);
    };
  }, [controls, scene, sigma]);

  return <canvas ref={canvasRef} className="graph-edge-overlay" aria-hidden="true" />;
};

export default GraphEdgeOverlay;
