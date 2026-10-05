import { isStudyView, type Catalog } from "./catalog";
/** Aggregate policy: only a catalogued unit and its enabled study views may be selected. */
export class Curriculum {
  constructor(private readonly catalog: Catalog) {}
  select(unitId: string, view: string | null) {
    const book = this.catalog.books.find(b => b.units.some(u => u.id === unitId));
    const unit = book?.units.find(u => u.id === unitId);
    if (!book || !unit || !isStudyView(view) || !unit.views.includes(view))
      throw new Error("Unavailable lesson");
    return { book, unit, view };
  }
}
