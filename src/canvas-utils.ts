import { Settings } from "sigma/settings";
import { NodeDisplayData, PartialButFor, PlainObject } from "sigma/types";

const DEFAULT_LABEL_COLOR = "rgba(242, 246, 251, 1)";
const DIMMED_LABEL_COLOR = "rgba(157, 166, 178, 0.48)";
const HIGHLIGHT_LABEL_COLOR = "rgba(255, 255, 255, 1)";
const SOFT_LABEL_COLOR = { r: 115, g: 123, b: 135 };
const CRISP_LABEL_COLOR = { r: 246, g: 249, b: 253 };

function applyOpacity(color: string, opacity: number) {
  const match = color.match(/rgba?\(([^)]+)\)/);
  if (!match) return color;

  const channels = match[1].split(",").map((part) => part.trim());
  const [r, g, b] = channels;
  const baseAlpha = channels[3] === undefined ? 1 : Number(channels[3]);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, baseAlpha * opacity))})`;
}

function mixTone(tone: number) {
  const amount = Math.max(0, Math.min(1, tone));
  const r = Math.round(SOFT_LABEL_COLOR.r + (CRISP_LABEL_COLOR.r - SOFT_LABEL_COLOR.r) * amount);
  const g = Math.round(SOFT_LABEL_COLOR.g + (CRISP_LABEL_COLOR.g - SOFT_LABEL_COLOR.g) * amount);
  const b = Math.round(SOFT_LABEL_COLOR.b + (CRISP_LABEL_COLOR.b - SOFT_LABEL_COLOR.b) * amount);
  return `rgba(${r}, ${g}, ${b}, 1)`;
}

export function drawHover(context: CanvasRenderingContext2D, data: PlainObject) {
  const x = Math.round(data.x);
  const y = Math.round(data.y);
  const size = Math.max(5, data.size + 2.2);

  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.closePath();
  context.strokeStyle = "rgba(128, 182, 255, 0.88)";
  context.lineWidth = 1.15;
  context.stroke();
}

export function drawLabel(
  context: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color"> & PlainObject,
  settings: Settings,
): void {
  if (!data.label) return;

  const font = settings.labelFont;
  const fontSize = typeof data.labelSize === "number" ? data.labelSize : 15;
  const weight = data.highlighted || data.selected ? 600 : typeof data.labelOpacity === "number" && data.labelOpacity > 0.88 ? 500 : 400;

  context.font = `${weight} ${fontSize}px ${font}`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  if (data.hidden) {
    context.fillStyle = "rgba(0,0,0,0)";
    return;
  }

  if (data.highlighted || data.selected) {
    context.fillStyle = HIGHLIGHT_LABEL_COLOR;
  } else if (data.dimmed) {
    context.fillStyle = DIMMED_LABEL_COLOR;
  } else if (typeof data.labelTone === "number") {
    context.fillStyle = mixTone(data.labelTone);
  } else {
    context.fillStyle = DEFAULT_LABEL_COLOR;
  }

  if (typeof data.labelOpacity === "number") {
    context.fillStyle = applyOpacity(String(context.fillStyle), data.labelOpacity);
  }

  context.shadowColor = "rgba(0, 0, 0, 0.28)";
  context.shadowBlur = data.highlighted || data.selected ? 4 : 2.4;
  context.fillText(data.label, data.x, data.y + data.size + fontSize * 0.95);
  context.shadowBlur = 0;
}
