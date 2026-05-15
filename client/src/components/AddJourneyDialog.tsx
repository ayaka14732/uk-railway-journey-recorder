import { useState } from "react";
import { apiJson } from "@/lib/api";
import JourneyMetaDialog, { type Direction, type Reason } from "@/components/JourneyMetaDialog";
import { type Candidate, type SearchForm } from "@/components/JourneySearch";

const DETAIL_MAX_CHARS = 45;

type JourneyDetail = {
  travelDate: string;
  departureDate?: string;
  operatorName?: string;
  serviceOriginCrs?: string;
  serviceDestinationCrs?: string;
  boarded: { crs: string };
  alighted: { crs: string };
  plannedDeparture?: string;
  departureLatenessMinutes?: number | null;
  platformDeparture?: string | null;
  plannedArrival?: string;
  arrivalLatenessMinutes?: number | null;
  platformArrival?: string | null;
  url?: string;
};

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
  onAdded: (savedKey: string, journeyId: number | null, detail: JourneyDetail, direction: Direction, reason: Reason, detailedReason: string) => void;
}) {
  const [direction, setDirection] = useState<Direction>("Outbound");
  const [reason, setReason] = useState<Reason>("Leisure");
  const [detailedReason, setDetailedReason] = useState("");

  async function addJourney() {
    const data = await apiJson<{ journeyId: number | null; detail: JourneyDetail }>("/api/resolve-service", {
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
    onAdded(`${candidate.identity}-${candidate.departureDate}`, data.journeyId, data.detail, direction, reason, detailedReason);
  }

  return (
    <JourneyMetaDialog
      title="Add Journey"
      stacked
      direction={direction}
      reason={reason}
      detailedReason={detailedReason}
      primaryLabel="Add to history"
      savingLabel="Adding…"
      onDirectionChange={setDirection}
      onReasonChange={setReason}
      onDetailedReasonChange={(value) => setDetailedReason(limitDetail(value))}
      onSubmit={addJourney}
      onClose={onClose}
    />
  );
}
