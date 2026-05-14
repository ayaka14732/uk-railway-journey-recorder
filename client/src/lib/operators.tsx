export type OperatorMeta = {
  name: string;
  code: string;
  color: string;
};

// Colours selected from https://en.wikipedia.org/wiki/Wikipedia:WikiProject_UK_Railways/Colours_list
// Codes selected from http://www.railwaycodes.org.uk/operators/toccodes.shtm
export const OPERATOR_DETAILS: OperatorMeta[] = [
  { name: "Avanti West Coast", code: "VT", color: "004354" },
  { name: "c2c", code: "CC", color: "b7007c" },
  { name: "Caledonian Sleeper", code: "CS", color: "1d2e35" },
  { name: "Chiltern Railways", code: "CH", color: "00bfff" },
  { name: "CrossCountry", code: "XC", color: "660f21" },
  { name: "East Midlands Railway", code: "EM", color: "713563" },
  { name: "Elizabeth Line", code: "XR", color: "6950a1" },
  { name: "Eurostar", code: "ES", color: "086bfe" },
  { name: "Gatwick Express", code: "GX", color: "eb1e2d" },
  { name: "Grand Central", code: "GC", color: "1d1d1b" },
  { name: "Great Northern", code: "GN", color: "6c2d7e" },
  { name: "Great Western Railway", code: "GW", color: "0a493e" },
  { name: "Greater Anglia", code: "LE", color: "d70428" },
  { name: "Heathrow Express", code: "HX", color: "532e63" },
  { name: "Hull Trains", code: "HT", color: "de005c" },
  { name: "Island Line", code: "IL", color: "1e90ff" },
  { name: "LNER", code: "GR", color: "ce0e2d" },
  { name: "London Northwestern Railway", code: "LM", color: "00bf6f" },
  { name: "London Overground", code: "LO", color: "e87722" },
  { name: "Lumo", code: "LD", color: "2b6ef5" },
  { name: "Merseyrail", code: "ME", color: "fff200" },
  { name: "Northern", code: "NT", color: "0f0d78" },
  { name: "ScotRail", code: "SR", color: "1e467d" },
  { name: "South Western Railway", code: "SW", color: "24398c" },
  { name: "Southeastern", code: "SE", color: "389cff" },
  { name: "Southern", code: "SN", color: "8cc63e" },
  { name: "Thameslink", code: "TL", color: "ff5aa4" },
  { name: "TransPennine Express", code: "TP", color: "09a4ec" },
  { name: "Transport for Wales", code: "AW", color: "ff0000" },
  // "West Midlands Trains": "ff8300", // LM, same as London Northwestern Railway
  // "Stansted Express": "6b717a", // SX, not a train operator, but a service operated by Greater Anglia
];

export const OPERATOR_COLORS: Record<string, string> = Object.fromEntries(
  OPERATOR_DETAILS.map((operator) => [operator.name, operator.color]),
);

export const OPERATOR_NAMES = new Set(OPERATOR_DETAILS.map((operator) => operator.name));

const OPERATOR_ALIASES: Record<string, string> = {
  "Lumo (East Coast)": "Lumo",
  "Transpennine Express": "TransPennine Express",
};

export function normaliseOperator(name: string): string {
  return OPERATOR_ALIASES[name] ?? name;
}

export function operatorTextColor(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.179 ? "#000000" : "#ffffff";
}

export function OperatorBadge({ name }: { name: string }) {
  const canonical = normaliseOperator(name);
  const hex = OPERATOR_COLORS[canonical];
  if (!hex) return <>{canonical}</>;
  return (
    <span className="operator-badge" style={{ backgroundColor: `#${hex}`, color: operatorTextColor(hex) }}>
      {canonical}
    </span>
  );
}
