import { useState } from "react";
import { apiJson } from "@/lib/api";
import JourneyMetaDialog from "@/components/JourneyMetaDialog";

const DETAIL_MAX_CHARS = 45;

type Direction = "Outbound" | "Inbound";
type Reason = "Leisure" | "Work" | "Life" | "Love";

type EditableJourney = {
  id: number;
  direction?: string;
  reason?: string;
  detailed_reason?: string;
};

function limitDetail(value: string): string {
  return Array.from(value).slice(0, DETAIL_MAX_CHARS).join("");
}

function normaliseDirection(value?: string): Direction {
  return value === "Inbound" ? "Inbound" : "Outbound";
}

function normaliseReason(value?: string): Reason {
  return value === "Work" || value === "Life" || value === "Love" ? value : "Leisure";
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
  const [direction, setDirection] = useState<Direction>(() => normaliseDirection(journey.direction));
  const [reason, setReason] = useState<Reason>(() => normaliseReason(journey.reason));
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
