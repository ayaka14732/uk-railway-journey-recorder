import { useState } from "react";

const DIRECTIONS = ["Outbound", "Inbound"] as const;
const REASONS = ["Leisure", "Work", "Life", "Love"] as const;
const DETAIL_MAX_CHARS = 45;

export type Direction = typeof DIRECTIONS[number];
export type Reason = typeof REASONS[number];
export type JourneyMetaValues = {
  direction: Direction;
  reason: Reason;
  detailedReason: string;
};

function limitDetail(value: string): string {
  return Array.from(value).slice(0, DETAIL_MAX_CHARS).join("");
}

export default function JourneyMetaDialog({
  title,
  stacked = false,
  initialDirection = "Outbound",
  initialReason = "Leisure",
  initialDetailedReason = "",
  primaryLabel,
  savingLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  stacked?: boolean;
  initialDirection?: Direction;
  initialReason?: Reason;
  initialDetailedReason?: string;
  primaryLabel: string;
  savingLabel?: string;
  onSubmit: (values: JourneyMetaValues) => void | Promise<void>;
  onClose: () => void;
}) {
  const [direction, setDirection] = useState<Direction>(() => initialDirection);
  const [reason, setReason] = useState<Reason>(() => initialReason);
  const [detailedReason, setDetailedReason] = useState(initialDetailedReason);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setMessage("");
    try {
      await onSubmit({ direction, reason, detailedReason });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`token-overlay${stacked ? " stacked-overlay" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="token-dialog">
        <div className="token-dialog-header">
          <span>{title}</span>
          <button type="button" className="token-dialog-close" onClick={onClose}>×</button>
        </div>
        {message && <div className="message-line dialog-message" role="status">{message}</div>}
        <div className="add-dialog-body">
          <div className="add-dialog-field">
            <span>Direction</span>
            <div className="add-dialog-options">
              {DIRECTIONS.map((d) => (
                <button type="button" key={d} className={`add-dialog-option${direction === d ? " selected" : ""}`} onClick={() => setDirection(d)}>{d}</button>
              ))}
            </div>
          </div>
          <div className="add-dialog-field">
            <span>Reason</span>
            <div className="add-dialog-options">
              {REASONS.map((r) => (
                <button type="button" key={r} className={`add-dialog-option${reason === r ? " selected" : ""}`} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
          </div>
          <div className="add-dialog-field">
            <span>Detail</span>
            <input type="text" name="journey-detail-note" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-bwignore="true" className="add-dialog-input" value={detailedReason} onChange={(e) => setDetailedReason(limitDetail(e.target.value))} placeholder="Note" />
          </div>
        </div>
        <div className="token-dialog-actions">
          <button type="button" onClick={submit} disabled={saving}>{saving ? savingLabel ?? primaryLabel : primaryLabel}</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
