const DIRECTIONS = ["Outbound", "Inbound"] as const;
const REASONS = ["Leisure", "Work", "Life", "Love"] as const;

export type Direction = typeof DIRECTIONS[number];
export type Reason = typeof REASONS[number];

export default function JourneyMetaDialog({
  title,
  message = "",
  stacked = false,
  direction,
  reason,
  detailedReason,
  primaryLabel,
  secondaryLabel = "Cancel",
  saving = false,
  savingLabel,
  onDirectionChange,
  onReasonChange,
  onDetailedReasonChange,
  onSubmit,
  onClose,
}: {
  title: string;
  message?: string;
  stacked?: boolean;
  direction: Direction;
  reason: Reason;
  detailedReason: string;
  primaryLabel: string;
  secondaryLabel?: string;
  saving?: boolean;
  savingLabel?: string;
  onDirectionChange: (direction: Direction) => void;
  onReasonChange: (reason: Reason) => void;
  onDetailedReasonChange: (detail: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
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
                <button type="button" key={d} className={`add-dialog-option${direction === d ? " selected" : ""}`} onClick={() => onDirectionChange(d)}>{d}</button>
              ))}
            </div>
          </div>
          <div className="add-dialog-field">
            <span>Reason</span>
            <div className="add-dialog-options">
              {REASONS.map((r) => (
                <button type="button" key={r} className={`add-dialog-option${reason === r ? " selected" : ""}`} onClick={() => onReasonChange(r)}>{r}</button>
              ))}
            </div>
          </div>
          <div className="add-dialog-field">
            <span>Detail</span>
            <input type="text" name="journey-detail-note" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-bwignore="true" className="add-dialog-input" value={detailedReason} onChange={(e) => onDetailedReasonChange(e.target.value)} placeholder="Note" />
          </div>
        </div>
        <div className="token-dialog-actions">
          <button type="button" onClick={onSubmit} disabled={saving}>{saving ? savingLabel ?? primaryLabel : primaryLabel}</button>
          <button type="button" onClick={onClose}>{secondaryLabel}</button>
        </div>
      </div>
    </div>
  );
}
