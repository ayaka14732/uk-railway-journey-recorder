import { apiJson } from "@/lib/api";
import JourneyMetaDialog, { Direction, Reason, type JourneyMetaValues } from "@/components/JourneyMetaDialog";

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
  onSaved: (id: number, values: JourneyMetaValues) => void;
}) {
  const { direction: initDirection, reason: initReason, detailed_reason: initDetailedReason } = journey;

  async function save(values: JourneyMetaValues) {
    const { direction, reason, detailedReason } = values;
    const body = {
      ...(direction !== initDirection && { direction }),
      ...(reason !== initReason && { reason }),
      ...(detailedReason !== initDetailedReason && { detailed_reason: detailedReason }),
    };

    await apiJson(`/api/journeys/${journey.id}`, {
      method: "PATCH",
      headers: authHeaders?.() ?? {},
      body: JSON.stringify(body),
    });
    onSaved(journey.id, values);
  }

  return (
    <JourneyMetaDialog
      title="Edit Journey"
      initialDirection={initDirection}
      initialReason={initReason}
      initialDetailedReason={initDetailedReason}
      primaryLabel="Save"
      onSubmit={save}
      onClose={onClose}
    />
  );
}
