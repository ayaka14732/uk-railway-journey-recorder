import { apiJson } from "@/lib/api";
import JourneyMetaDialog, { type JourneyMetaValues } from "@/components/JourneyMetaDialog";
import { type Candidate, type SearchForm } from "@/components/JourneySearch";

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
  onAdded: (savedKey: string, journeyId: number | null, detail: JourneyDetail, values: JourneyMetaValues) => void;
}) {
  async function addJourney(values: JourneyMetaValues) {
    const savedKey = `${candidate.identity}-${candidate.departureDate}`;
    const data = await apiJson<{ journeyId: number | null; detail: JourneyDetail }>("/api/resolve-service", {
      method: "POST",
      headers: { "X-RTT-Cookie": rttCookie, ...(authHeaders?.() ?? {}) },
      body: JSON.stringify({
        travelDate: searchForm.travelDate,
        originCrs: searchForm.originCrs,
        destinationCrs: searchForm.destinationCrs,
        identity: candidate.identity,
        departureDate: candidate.departureDate || searchForm.travelDate,
        direction: values.direction,
        reason: values.reason,
        detailedReason: values.detailedReason,
      }),
    });
    onAdded(savedKey, data.journeyId, data.detail, values);
  }

  return (
    <JourneyMetaDialog
      title="Add Journey"
      stacked
      primaryLabel="Add to history"
      savingLabel="Adding…"
      onSubmit={addJourney}
      onClose={onClose}
    />
  );
}
