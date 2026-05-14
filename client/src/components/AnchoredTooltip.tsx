import { useState, type CSSProperties, type FocusEventHandler, type MouseEventHandler, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TooltipState = {
  left: number;
  y: number;
  arrowX: number;
  ready: boolean;
};

type TriggerProps = {
  "aria-describedby": string;
  onBlur: FocusEventHandler<HTMLElement>;
  onClick: MouseEventHandler<HTMLElement>;
  onFocus: FocusEventHandler<HTMLElement>;
};

type AnchoredTooltipProps = {
  children: (triggerProps: TriggerProps) => ReactNode;
  id: string;
  label: ReactNode;
};

export default function AnchoredTooltip({ children, id, label }: AnchoredTooltipProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  function show(anchor: HTMLElement) {
    const anchorRect = anchor.getBoundingClientRect();
    const anchorCenter = anchorRect.left + anchorRect.width / 2;
    setTooltip({ left: 0, y: anchorRect.top - 5, arrowX: 0, ready: false });
    window.requestAnimationFrame(() => {
      const tooltipNode = document.getElementById(id);
      if (!tooltipNode) return;
      const tooltipWidth = tooltipNode.offsetWidth;
      const minX = 0;
      const maxX = document.documentElement.clientWidth;
      const centeredLeft = anchorCenter - tooltipWidth / 2;
      const left = Math.min(Math.max(minX, centeredLeft), maxX - tooltipWidth);
      const arrowX = Math.min(Math.max(8, anchorCenter - left), tooltipWidth - 8);
      setTooltip({ left, y: anchorRect.top - 5, arrowX, ready: true });
    });
  }

  function hide() {
    setTooltip(null);
  }

  function tooltipStyle(): CSSProperties {
    if (!tooltip) return {};
    return {
      "--anchored-tooltip-left": `${tooltip.left}px`,
      "--anchored-tooltip-y": `${tooltip.y}px`,
      "--anchored-tooltip-arrow-x": `${tooltip.arrowX}px`,
      opacity: tooltip.ready ? 1 : 0,
    } as CSSProperties;
  }

  const triggerProps: TriggerProps = {
    "aria-describedby": id,
    onBlur: hide,
    onClick: (e) => show(e.currentTarget),
    onFocus: (e) => show(e.currentTarget),
  };

  return (
    <span className="anchored-tooltip-wrap" onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={hide}>
      {children(triggerProps)}
      {tooltip && createPortal(
        <div id={id} className="anchored-tooltip" role="tooltip" style={tooltipStyle()}>
          {label}
        </div>,
        document.body,
      )}
    </span>
  );
}
