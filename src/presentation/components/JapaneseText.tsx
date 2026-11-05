import {Fragment} from "react";
import type {Segment, TranslationCatalog} from "../../shared/kernel/text-types";
import {TranslatedText} from "../StudyContext";

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
      {pieces.map((piece, index) => {
          const ruby = piece.match(/^\[([^:]+):([^\]]+)\]$/);
          return ruby ? (
              <ruby key={index}>
                  {ruby[1]}
                  <rp>（</rp>
                  <rt>{ruby[2]}</rt>
                  <rp>）</rp>
              </ruby>
          ) : (
              <Fragment key={index}>{piece}</Fragment>
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
            {segments.map((segment, index) =>
                segment.textId ? (
                    <TranslatedText key={index} id={segment.textId} catalog={catalog}/>
                ) : (
                    <JapaneseText key={index} text={segment.japanese ?? ""}/>
                ),
            )}
        </>
    );
}
