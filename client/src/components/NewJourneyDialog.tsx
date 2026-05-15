import { useState } from "react";
import JourneySearch, { type Candidate, type SearchForm, type Station } from "@/components/JourneySearch";

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
  onAddCandidate: (candidate: Candidate, searchForm: SearchForm) => void;
}) {
  const [message, setMessage] = useState("");

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
          message={message}
          savedKeys={savedKeys}
          onMessage={setMessage}
          onAddCandidate={(candidate, searchForm) => {
            setMessage("");
            onAddCandidate(candidate, searchForm);
          }}
        />
      </div>
    </div>
  );
}
