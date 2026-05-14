import { useEffect, useRef, useState, type CSSProperties, type FocusEventHandler, type PointerEventHandler, type ReactNode } from "react";
import { createPortal } from "react-dom";

type TooltipState = {
  left: number;
  y: number;
  arrowX: number;
  ready: boolean;
};

type TriggerProps = {
  "aria-describedby"?: string;
  onBlur: FocusEventHandler<HTMLElement>;
  onFocus: FocusEventHandler<HTMLElement>;
  onPointerDown: PointerEventHandler<HTMLElement>;
};

type AnchoredTooltipProps = {
  children: (triggerProps: TriggerProps) => ReactNode;
  id: string;
  label: ReactNode;
};

export default function AnchoredTooltip({ children, id, label }: AnchoredTooltipProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const suppressNextFocus = useRef(false);

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
      const maxLeft = Math.max(minX, maxX - tooltipWidth);
      const left = Math.min(Math.max(minX, centeredLeft), maxLeft);
      const arrowInset = Math.min(8, tooltipWidth / 2);
      const minArrowX = arrowInset;
      const maxArrowX = Math.max(minArrowX, tooltipWidth - arrowInset);
      const arrowX = Math.min(Math.max(minArrowX, anchorCenter - left), maxArrowX);
      setTooltip({ left, y: anchorRect.top - 5, arrowX, ready: true });
    });
  }

  function hide() {
    setTooltip(null);
  }

  useEffect(() => {
    if (!tooltip) return;
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [tooltip]);

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
    "aria-describedby": tooltip ? id : undefined,
    onBlur: hide,
    onFocus: (e) => {
      if (suppressNextFocus.current) {
        suppressNextFocus.current = false;
        return;
      }
      show(e.currentTarget);
    },
    onPointerDown: (e) => {
      if (e.pointerType === "mouse") {
        suppressNextFocus.current = true;
        return;
      }
      e.preventDefault();
      if (tooltip) hide();
      else show(e.currentTarget);
    },
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
