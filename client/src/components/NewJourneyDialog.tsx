import JourneySearch, { type Candidate, type SearchForm, type Station } from "@/components/JourneySearch";

export default function NewJourneyDialog({
  stations,
  rttCookie,
  authHeaders,
  message,
  savedKeys,
  savingId,
  onMessage,
  onClose,
  onAddCandidate,
}: {
  stations: Station[];
  rttCookie: string;
  authHeaders?: () => Record<string, string>;
  message: string;
  savedKeys?: Set<string>;
  savingId: string;
  onMessage: (message: string) => void;
  onClose: () => void;
  onAddCandidate: (candidate: Candidate, searchForm: SearchForm) => void;
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
          title={null}
          message={message}
          savedKeys={savedKeys}
          savingId={savingId}
          onMessage={onMessage}
          onAddCandidate={onAddCandidate}
        />
      </div>
    </div>
  );
}
