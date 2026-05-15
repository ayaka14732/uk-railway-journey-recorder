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
  const initialValues: JourneyMetaValues = {
    direction: journey.direction ?? "Outbound",
    reason: journey.reason ?? "Leisure",
    detailedReason: journey.detailed_reason ?? "",
  };

  async function save(values: JourneyMetaValues) {
    const body: {
      direction?: JourneyMetaValues["direction"];
      reason?: JourneyMetaValues["reason"];
      detailed_reason?: string;
    } = {};
    if (values.direction !== initialValues.direction) body.direction = values.direction;
    if (values.reason !== initialValues.reason) body.reason = values.reason;
    if (values.detailedReason !== initialValues.detailedReason) body.detailed_reason = values.detailedReason;

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
      initialDirection={initialValues.direction}
      initialReason={initialValues.reason}
      initialDetailedReason={initialValues.detailedReason}
      primaryLabel="Save"
      onSubmit={save}
      onClose={onClose}
    />
  );
}
