import { Fragment } from "react";
import type { Segment, TranslationCatalog } from "../../shared/kernel/types";
import { Text } from "../context";
export function Japanese({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const pieces = text.split(/(\[[^:\]]+:[^\]]+\])/g);
  return (
    <span lang="ja" translate="no" className={className}>
      {pieces.map((p, i) => {
        const m = p.match(/^\[([^:]+):([^\]]+)\]$/);
        return m ? (
          <ruby key={i}>
            {m[1]}
            <rp>（</rp>
            <rt>{m[2]}</rt>
            <rp>）</rp>
          </ruby>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        );
      })}
    </span>
  );
}
export function Segments({
  segments,
  catalog,
}: {
  segments: Segment[];
  catalog: TranslationCatalog;
}) {
  return (
    <>
      {segments.map((s, i) =>
        s.textId ? (
          <Text key={i} id={s.textId} catalog={catalog} />
        ) : (
          <Japanese key={i} text={s.ja ?? ""} />
        ),
      )}
    </>
  );
}
