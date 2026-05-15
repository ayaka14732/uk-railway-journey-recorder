import { useState } from "react";
import { apiJson } from "@/lib/api";
import JourneyMetaDialog, { type Direction, type Reason } from "@/components/JourneyMetaDialog";

const DETAIL_MAX_CHARS = 45;

type EditableJourney = {
  id: number;
  direction?: Direction;
  reason?: Reason;
  detailed_reason?: string;
};

function limitDetail(value: string): string {
  return Array.from(value).slice(0, DETAIL_MAX_CHARS).join("");
}

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
  const [direction, setDirection] = useState<Direction>(() => journey.direction ?? "Outbound");
  const [reason, setReason] = useState<Reason>(() => journey.reason ?? "Leisure");
  const [detailedReason, setDetailedReason] = useState(journey.detailed_reason ?? "");
  const [message, setMessage] = useState("");

  async function save() {
    setMessage("");
    try {
      await apiJson(`/api/journeys/${journey.id}`, {
        method: "PATCH",
        headers: authHeaders?.() ?? {},
        body: JSON.stringify({ direction, reason, detailed_reason: detailedReason }),
      });
      onSaved(journey.id, direction, reason, detailedReason);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <JourneyMetaDialog
      title="Edit Journey"
      message={message}
      direction={direction}
      reason={reason}
      detailedReason={detailedReason}
      primaryLabel="Save"
      onDirectionChange={setDirection}
      onReasonChange={setReason}
      onDetailedReasonChange={(value) => setDetailedReason(limitDetail(value))}
      onSubmit={save}
      onClose={onClose}
    />
  );
}
