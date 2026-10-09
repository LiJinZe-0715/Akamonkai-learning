import type { View } from "../public";
/** Query links remain relative to the deployment directory. */
export const lessonHref = (id: string, view: View): string => "?unit=" + encodeURIComponent(id) + "&view=" + view;
export const bookHref = (bookId: string, unitId?: string): string => "./?book=" + encodeURIComponent(bookId)
  + (unitId ? "&focus=" + encodeURIComponent(unitId) + "#unit-" + encodeURIComponent(unitId) : "#catalog");
