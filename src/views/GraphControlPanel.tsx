import { ChangeEvent, FC } from "react";

import { GraphControls } from "../types";

type Props = {
  controls: GraphControls;
  onChange: (patch: Partial<GraphControls>) => void;
};

type SliderProps = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
};

const SliderRow: FC<SliderProps> = ({ label, min, max, step, value, onChange }) => (
  <label className="graph-control-row">
    <span>{label}</span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
);

type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

const ToggleRow: FC<ToggleProps> = ({ label, checked, onChange }) => (
  <label className="graph-toggle-row">
    <span>{label}</span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)}
    />
  </label>
);

const GraphControlPanel: FC<Props> = ({ controls, onChange }) => {
  return (
    <aside className="graph-controls">
      <div className="graph-controls-header">
        <div className="graph-controls-title">筛选</div>
      </div>

      <div className="graph-controls-section">
        <input
          className="graph-search"
          type="text"
          value={controls.searchQuery}
          placeholder="搜索文件..."
          onChange={(event) => onChange({ searchQuery: event.target.value })}
        />
        <ToggleRow label="孤立文件" checked={controls.showOrphans} onChange={(value) => onChange({ showOrphans: value })} />
      </div>

      <div className="graph-controls-section">
        <div className="graph-controls-subtitle">外观</div>
        <ToggleRow label="箭头" checked={controls.showArrows} onChange={(value) => onChange({ showArrows: value })} />
        <SliderRow label="文本透明度" min={0.1} max={1} step={0.01} value={controls.textOpacity} onChange={(value) => onChange({ textOpacity: value })} />
        <SliderRow label="节点大小" min={0.7} max={2.8} step={0.01} value={controls.nodeScale} onChange={(value) => onChange({ nodeScale: value })} />
        <SliderRow label="连线粗细" min={0.5} max={2.4} step={0.01} value={controls.edgeScale} onChange={(value) => onChange({ edgeScale: value })} />
      </div>

      <div className="graph-controls-section">
        <div className="graph-controls-subtitle">力度</div>
        <SliderRow label="图谱向心力" min={0.4} max={2.4} step={0.01} value={controls.gravity} onChange={(value) => onChange({ gravity: value })} />
        <SliderRow label="节点间的排斥力" min={0.4} max={2.6} step={0.01} value={controls.repulsion} onChange={(value) => onChange({ repulsion: value })} />
        <SliderRow
          label="相连节点间的吸引力"
          min={0.4}
          max={2.6}
          step={0.01}
          value={controls.neighborAttraction}
          onChange={(value) => onChange({ neighborAttraction: value })}
        />
        <SliderRow label="连线长度" min={0.6} max={1.8} step={0.01} value={controls.linkLength} onChange={(value) => onChange({ linkLength: value })} />
      </div>
    </aside>
  );
};

export default GraphControlPanel;
