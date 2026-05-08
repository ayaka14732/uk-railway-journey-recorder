// Selected from https://en.wikipedia.org/wiki/Wikipedia:WikiProject_UK_Railways/Colours_list
export const OPERATOR_COLORS: Record<string, string> = {
  "Avanti West Coast": "004354",
  "c2c": "b7007c",
  "Caledonian Sleeper": "1d2e35",
  "Chiltern Railways": "00bfff",
  "CrossCountry": "660f21",
  "East Midlands Railway": "713563",
  "Great Northern": "6c2d7e",
  "Great Western Railway": "0a493e",
  "Greater Anglia": "d70428",
  "Heathrow Express": "532e63",
  "Hull Trains": "de005c",
  "LNER": "ce0e2d",
  "London Northwestern Railway": "00bf6f",
  "London Overground": "e87722",
  "Lumo": "2b6ef5",
  "Merseyrail": "fff200",
  "Northern": "0f0d78",
  "ScotRail": "1e467d",
  "South Western Railway": "24398c",
  "Southeastern": "389cff",
  "Southern": "8cc63e",
  "Stansted Express": "6b717a",
  "Thameslink": "ff5aa4",
  "TransPennine Express": "09a4ec",
  "Transport for Wales": "ff0000",
  "West Midlands Trains": "ff8300",
};

const OPERATOR_ALIASES: Record<string, string> = {
  "Transpennine Express": "TransPennine Express",
};

export function normaliseOperator(name: string): string {
  return OPERATOR_ALIASES[name] ?? name;
}

function operatorFg(hex: string): string {
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
    <span className="operator-badge" style={{ backgroundColor: `#${hex}`, color: operatorFg(hex) }}>
      {canonical}
    </span>
  );
}
