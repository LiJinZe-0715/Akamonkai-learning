export type IconName = "home" | "books" | "chart" | "settings" | "arrow" | "search" | "chevron" | "play" | "check";
const paths: Record<IconName, string> = {
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  books: "M4 4h6v16H4z M13 4h6v16h-6z M7 8h0 M16 8h0",
  chart: "M4 20V10h4v10 M10 20V4h4v16 M16 20v-7h4v7 M3 20h18",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  arrow: "M5 12h14 m-6-6 6 6-6 6",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  chevron: "m6 9 6 6 6-6",
  play: "m9 5 11 7-11 7Z",
  check: "m5 12 4 4L19 6",
};
export function Icon({ name }: { name: IconName }) {
  return <svg className="ui-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
