import { For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import { citedPages, citedSource, formatPages } from '../../content/schema';
import type { Citation, Source } from '../../content/schema';
import { shortCitation } from '../gym/dosing';
import { visuallyHidden } from '../theme/global.css';

/** "Sources: Lind & Sanders 2004, pp 25, 67, 103; …" as links; nothing when there are none. */
export const SourceLine = (props: {
  readonly citations: ReadonlyArray<Citation>;
  readonly sources: ReadonlyArray<Source>;
  readonly class: string;
}): JSX.Element => (
  <Show when={props.citations.length > 0}>
    <p class={props.class}>
      Sources:{' '}
      <For each={props.citations}>
        {(c, i) => {
          const src = props.sources.find((x) => x.id === citedSource(c));
          const pages = citedPages(c);
          return (
            <>
              {i() > 0 ? '; ' : ''}
              <Show when={src} fallback={citedSource(c)}>
                {(s) => (
                  <a href={s().url} target="_blank" rel="noopener noreferrer">
                    {shortCitation(s().citation)}
                    <span class={visuallyHidden}> (opens in a new tab)</span>
                  </a>
                )}
              </Show>
              {pages === undefined ? '' : `, ${formatPages(pages)}`}
            </>
          );
        }}
      </For>
    </p>
  </Show>
);
