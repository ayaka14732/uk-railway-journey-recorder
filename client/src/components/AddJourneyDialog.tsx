import { apiJson } from "@/lib/api";
import JourneyMetaDialog, { type JourneyMetaValues } from "@/components/JourneyMetaDialog";
import { type Candidate } from "@/components/JourneySearch";

export default function AddJourneyDialog({
  candidate,
  authHeaders,
  onClose,
  onAdded,
}: {
  candidate: Candidate;
  authHeaders?: () => Record<string, string>;
  onClose: () => void;
  onAdded: (savedKey: string, journeyId: number | null, values: JourneyMetaValues) => void;
}) {
  async function addJourney(values: JourneyMetaValues) {
    const savedKey = `${candidate.identity}-${candidate.departureDate}`;
    const data = await apiJson<{ journeyId: number | null }>("/api/resolve-service", {
      method: "POST",
      headers: { ...(authHeaders?.() ?? {}) },
      body: JSON.stringify({
        detail: candidate,
        direction: values.direction,
        reason: values.reason,
        detailedReason: values.detailedReason,
      }),
    });
    onAdded(savedKey, data.journeyId, values);
  }

  return (
    <JourneyMetaDialog
      title="Add Journey"
      stacked
      onSubmit={addJourney}
      onClose={onClose}
    />
  );
}
