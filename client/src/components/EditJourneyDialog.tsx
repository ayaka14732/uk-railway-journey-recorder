import { apiJson } from "@/lib/api";
import JourneyMetaDialog, { type Direction, type Reason } from "@/components/JourneyMetaDialog";

export type EditableJourney = {
  id: number;
  direction?: Direction;
  reason?: Reason;
  detailed_reason?: string;
};

export default function EditJourneyDialog({
  journey,
  authHeaders,
  onClose,
  onSaved,
}: {
  journey: EditableJourney;
  authHeaders?: () => Record<string, string>;
  onClose: () => void;
  onSaved: (id: number, direction: Direction, reason: Reason, detailedReason: string) => void;
}) {
  async function save({ direction, reason, detailedReason }: { direction: Direction; reason: Reason; detailedReason: string }) {
    await apiJson(`/api/journeys/${journey.id}`, {
      method: "PATCH",
      headers: authHeaders?.() ?? {},
      body: JSON.stringify({ direction, reason, detailed_reason: detailedReason }),
    });
    onSaved(journey.id, direction, reason, detailedReason);
  }

  return (
    <JourneyMetaDialog
      title="Edit Journey"
      initialDirection={journey.direction ?? "Outbound"}
      initialReason={journey.reason ?? "Leisure"}
      initialDetailedReason={journey.detailed_reason ?? ""}
      primaryLabel="Save"
      onSubmit={save}
      onClose={onClose}
    />
  );
}
