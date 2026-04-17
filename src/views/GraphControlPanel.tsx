import { ChangeEvent, FC } from "react";

import { GraphControls, GraphViewMode } from "../types";

type Props = {
  controls: GraphControls;
  collapsed: boolean;
  onChange: (patch: Partial<GraphControls>) => void;
  onToggleCollapsed: () => void;
};

type SliderProps = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
};

type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
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

const ViewModeButton: FC<{
  mode: GraphViewMode;
  currentMode: GraphViewMode;
  onSelect: (mode: GraphViewMode) => void;
  label: string;
}> = ({ mode, currentMode, onSelect, label }) => (
  <button
    type="button"
    className={`view-mode-button${currentMode === mode ? " is-active" : ""}`}
    onClick={() => onSelect(mode)}
  >
    {label}
  </button>
);

const GraphControlPanel: FC<Props> = ({ controls, collapsed, onChange, onToggleCollapsed }) => {
  return (
    <aside className={`graph-controls${collapsed ? " is-collapsed" : ""}`}>
      <div className="graph-controls-header">
        <div className="graph-controls-title-row">
          {!collapsed ? <div className="graph-controls-title">图谱控制</div> : null}
          <button type="button" className="graph-controls-toggle" onClick={onToggleCollapsed}>
            {collapsed ? "展开" : "收起"}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <>
          <div className="graph-controls-section">
            <div className="graph-controls-subtitle">视图模式</div>
            <div className="view-mode-row">
              <ViewModeButton
                mode="structure"
                currentMode={controls.viewMode}
                onSelect={(mode) => onChange({ viewMode: mode })}
                label="知识结构"
              />
              <ViewModeButton
                mode="relations"
                currentMode={controls.viewMode}
                onSelect={(mode) => onChange({ viewMode: mode })}
                label="关系图谱"
              />
            </div>
          </div>

          <div className="graph-controls-section">
            <div className="graph-controls-subtitle">检索</div>
            <input
              className="graph-search"
              type="text"
              value={controls.searchQuery}
              placeholder="搜索实体、类别..."
              onChange={(event) => onChange({ searchQuery: event.target.value })}
            />
            <ToggleRow label="显示孤立点" checked={controls.showOrphans} onChange={(value) => onChange({ showOrphans: value })} />
          </div>

          <div className="graph-controls-section">
            <div className="graph-controls-subtitle">外观</div>
            <ToggleRow label="显示箭头" checked={controls.showArrows} onChange={(value) => onChange({ showArrows: value })} />
            <SliderRow
              label="文字透明度"
              min={0.1}
              max={1}
              step={0.01}
              value={controls.textOpacity}
              onChange={(value) => onChange({ textOpacity: value })}
            />
            <SliderRow
              label="节点大小"
              min={0.7}
              max={2.8}
              step={0.01}
              value={controls.nodeScale}
              onChange={(value) => onChange({ nodeScale: value })}
            />
            <SliderRow
              label="连线粗细"
              min={0.3}
              max={3.6}
              step={0.01}
              value={controls.edgeScale}
              onChange={(value) => onChange({ edgeScale: value })}
            />
            <SliderRow
              label="连线透明度"
              min={0.1}
              max={1.6}
              step={0.01}
              value={controls.edgeOpacity}
              onChange={(value) => onChange({ edgeOpacity: value })}
            />
            <SliderRow
              label="连线灰度"
              min={96}
              max={210}
              step={1}
              value={controls.edgeGray}
              onChange={(value) => onChange({ edgeGray: value })}
            />
          </div>

          <div className="graph-controls-section">
            <div className="graph-controls-subtitle">物理参数</div>
            <SliderRow
              label="向心力"
              min={0.4}
              max={2.4}
              step={0.01}
              value={controls.gravity}
              onChange={(value) => onChange({ gravity: value })}
            />
            <SliderRow
              label="节点排斥"
              min={0.4}
              max={2.6}
              step={0.01}
              value={controls.repulsion}
              onChange={(value) => onChange({ repulsion: value })}
            />
            <SliderRow
              label="连边吸引"
              min={0.4}
              max={2.6}
              step={0.01}
              value={controls.neighborAttraction}
              onChange={(value) => onChange({ neighborAttraction: value })}
            />
            <SliderRow
              label="连边长度"
              min={0.6}
              max={1.8}
              step={0.01}
              value={controls.linkLength}
              onChange={(value) => onChange({ linkLength: value })}
            />
          </div>
        </>
      ) : null}
    </aside>
  );
};

export default GraphControlPanel;
