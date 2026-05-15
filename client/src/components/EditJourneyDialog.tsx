import { apiJson } from "@/lib/api";
import JourneyMetaDialog, { type JourneyMetaValues } from "@/components/JourneyMetaDialog";

export type EditableJourney = {
  id: number;
  direction?: JourneyMetaValues["direction"];
  reason?: JourneyMetaValues["reason"];
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
  onSaved: (id: number, values: JourneyMetaValues) => void;
}) {
  async function save(values: JourneyMetaValues) {
    await apiJson(`/api/journeys/${journey.id}`, {
      method: "PATCH",
      headers: authHeaders?.() ?? {},
      body: JSON.stringify({ direction: values.direction, reason: values.reason, detailed_reason: values.detailedReason }),
    });
    onSaved(journey.id, values);
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
