import JourneySearch, { type Candidate, type Station } from "@/components/JourneySearch";

export default function NewJourneyDialog({
  stations,
  rttCookie,
  authHeaders,
  savedKeys,
  onClose,
  onAddCandidate,
}: {
  stations: Station[];
  rttCookie: string;
  authHeaders?: () => Record<string, string>;
  savedKeys?: Set<string>;
  onClose: () => void;
  onAddCandidate: (candidate: Candidate) => void;
}) {
  return (
    <div className="token-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="token-dialog journey-search-dialog">
        <div className="token-dialog-header">
          <span>New Journey</span>
          <button type="button" className="token-dialog-close" onClick={onClose}>×</button>
        </div>
        <JourneySearch
          stations={stations}
          rttCookie={rttCookie}
          authHeaders={authHeaders}
          savedKeys={savedKeys}
          onAddCandidate={onAddCandidate}
        />
      </div>
    </div>
  );
}
