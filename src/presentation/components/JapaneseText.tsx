import {Fragment} from "react";
import type {Segment, TranslationCatalog} from "../../shared/kernel/text-types";
import {Text} from "../StudyContext";

export function JapaneseText({
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

export function TextSegments({
                             segments,
                             catalog,
                         }: {
    segments: readonly Segment[];
    catalog: TranslationCatalog;
}) {
    return (
        <>
            {segments.map((s, i) =>
                s.textId ? (
                    <Text key={i} id={s.textId} catalog={catalog}/>
                ) : (
                    <JapaneseText key={i} text={s.ja ?? ""}/>
                ),
            )}
        </>
    );
}
