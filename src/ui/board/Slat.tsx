import { Collapsible } from '@ark-ui/solid/collapsible';
import { For, Match, Show, Switch, createSignal } from 'solid-js';
import type { JSX } from 'solid-js';
import { PHASES, SourceRead } from '../../content/schema';
import type { Phase, Source, SourceId } from '../../content/schema';
import { ArrowOut, ChangeDown, ChangeSame, ChangeUp, ChevronDown } from '../icons';
import { visuallyHidden } from '../theme/global.css';
import * as s from './board.css';
import { Stamp, Tag, phaseLabel, shortName } from './marks';
import { Change } from './rank';
import type { RankedSlat } from './rank';

const host = (url: string): string => {
  try {
    const name = new URL(url).hostname.replace(/^www\./, '');
    return name === 'pubmed.ncbi.nlm.nih.gov' ? 'PubMed' : name;
  } catch {
    return url;
  }
};

const changeWords = (slat: RankedSlat, before: Phase): string =>
  slat.change === Change.Same
    ? `same as ${before}`
    : `${slat.change === Change.Up ? 'up' : 'down'} from ${slat.previousLevel} at ${before}`;

export const Slat = (props: {
  readonly slat: RankedSlat;
  readonly phase: Phase;
  readonly before: Phase;
  readonly muscleName: string;
  readonly keys: ReadonlyMap<SourceId, number>;
  readonly source: (id: SourceId) => Source | undefined;
  readonly ref: (el: HTMLLIElement) => void;
}): JSX.Element => {
  const [open, setOpen] = createSignal(false);
  const a = (): RankedSlat['activation'] => props.slat.activation;
  return (
    <li class={s.slat} ref={props.ref} data-open={open() ? '' : undefined}>
      <Collapsible.Root open={open()} onOpenChange={(d) => setOpen(d.open)}>
        <Collapsible.Trigger class={s.slatRow}>
          <span class={s.change}>
            <Switch fallback={<ChangeSame class={`${s.change} ${s.changeSame}`} />}>
              <Match when={props.slat.change === Change.Up}>
                <ChangeUp class={s.change} />
              </Match>
              <Match when={props.slat.change === Change.Down}>
                <ChangeDown class={s.change} />
              </Match>
            </Switch>
          </span>
          <span class={s.name}>
            <span class={s.muscle}>{shortName(props.muscleName)}</span>{' '}
            <span class={s.side}>{a().side}</span>
            <span class={visuallyHidden}>, {changeWords(props.slat, props.before)}.</span>
          </span>
          <For each={PHASES}>
            {(p, i) => (
              <Tag
                level={a().intensity[p]}
                size={p === props.phase ? 'now' : 'small'}
                phase={p}
                class={s.tagCells[i()] ?? ''}
              />
            )}
          </For>
          <span class={s.evidence}>
            <Stamp confidence={a().confidence} />
            <span class={s.keys}>
              <Show when={a().sources.length > 0} fallback={<span class={s.noKey}>no source</span>}>
                <span class={visuallyHidden}>Sources </span>
                <For each={a().sources}>{(id) => <span class={s.key}>{props.keys.get(id) ?? '?'}</span>}</For>
              </Show>
            </span>
          </span>
          <ChevronDown class={s.caret} />
        </Collapsible.Trigger>
        <Collapsible.Content class={s.detail}>
          <div class={s.detailBody}>
            <Show when={shortName(props.muscleName) !== props.muscleName}>
              <p class={s.line}>
                <span class={s.label}>Muscle</span>
                {props.muscleName}
              </p>
            </Show>
            <p class={s.line}>
              <span class={s.label}>Role</span>
              {a().role}.
            </p>
            <p class={s.line}>
              <span class={s.label}>Contraction</span>
              {a().contraction.join(', ')}
            </p>
            <p class={s.line}>
              <span class={s.label}>Basis</span>
              {a().basis}.
            </p>
            <p class={s.line}>
              <span class={s.label}>Now</span>
              {phaseLabel(props.phase)} {props.slat.level}, {changeWords(props.slat, props.before)}.
            </p>
            <Show
              when={a().sources.length > 0}
              fallback={
                <p class={s.line}>
                  <span class={s.label}>Sources</span>
                  None. This is expert opinion from body mechanics, not a measurement.
                </p>
              }
            >
              <ol class={s.cites} aria-label="Sources">
                <For each={a().sources}>
                  {(id) => (
                    <li class={s.cite}>
                      <span class={s.citeKey} aria-hidden="true">
                        {props.keys.get(id) ?? '?'}
                      </span>
                      <Show when={props.source(id)} fallback={<span>{id}</span>}>
                        {(src) => (
                          <span>
                            <a class={s.citeLink} href={src().url} target="_blank" rel="noopener noreferrer">
                              {src().citation}
                              <ArrowOut />
                              <span class={visuallyHidden}> (opens in a new tab)</span>
                            </a>
                            <span class={s.citeNote}>
                              {host(src().url)} · {src().read === SourceRead.Full ? 'full text read' : 'abstract read'}
                            </span>
                          </span>
                        )}
                      </Show>
                    </li>
                  )}
                </For>
              </ol>
            </Show>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </li>
  );
};
