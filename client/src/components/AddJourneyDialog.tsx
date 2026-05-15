import { useState } from "react";
import { apiJson } from "@/lib/api";
import JourneyMetaDialog from "@/components/JourneyMetaDialog";
import { type Candidate, type SearchForm } from "@/components/JourneySearch";

const DETAIL_MAX_CHARS = 45;

function limitDetail(value: string): string {
  return Array.from(value).slice(0, DETAIL_MAX_CHARS).join("");
}

export default function AddJourneyDialog({
  candidate,
  searchForm,
  rttCookie,
  authHeaders,
  onClose,
  onAdded,
}: {
  candidate: Candidate;
  searchForm: SearchForm;
  rttCookie: string;
  authHeaders?: () => Record<string, string>;
  onClose: () => void;
  onAdded: (savedKey: string, journeyId: number | null) => void;
}) {
  const [direction, setDirection] = useState<"Outbound" | "Inbound">("Outbound");
  const [reason, setReason] = useState<"Leisure" | "Work" | "Life" | "Love">("Leisure");
  const [detailedReason, setDetailedReason] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function addJourney() {
    setSaving(true);
    setMessage("");
    try {
      const data = await apiJson<{ journeyId: number | null }>("/api/resolve-service", {
        method: "POST",
        headers: { "X-RTT-Cookie": rttCookie, ...(authHeaders?.() ?? {}) },
        body: JSON.stringify({
          travelDate: searchForm.travelDate,
          originCrs: searchForm.originCrs.toUpperCase(),
          destinationCrs: searchForm.destinationCrs.toUpperCase(),
          identity: candidate.identity,
          departureDate: candidate.departureDate || searchForm.travelDate,
          save: true,
          direction,
          reason,
          detailedReason,
        }),
      });
      onAdded(`${candidate.identity}-${candidate.departureDate}`, data.journeyId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <JourneyMetaDialog
      title="Add Journey"
      message={message}
      stacked
      direction={direction}
      reason={reason}
      detailedReason={detailedReason}
      primaryLabel="Add to history"
      saving={saving}
      savingLabel="Adding…"
      onDirectionChange={setDirection}
      onReasonChange={setReason}
      onDetailedReasonChange={(value) => setDetailedReason(limitDetail(value))}
      onSubmit={addJourney}
      onClose={onClose}
    />
  );
}
