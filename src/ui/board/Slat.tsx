import { Collapsible } from '@ark-ui/solid/collapsible';
import { For, Show, createSignal } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import { effortWord } from '../../content/effort';
import type { Effort, EffortRamp } from '../../content/effort';
import { PHASES, SourceRead } from '../../content/schema';
import type { Activation, Source, SourceId } from '../../content/schema';
import { ArrowOut, ChevronDown } from '../icons';
import { visuallyHidden } from '../theme/global.css';
import * as s from './board.css';
import { Stamp, shortName } from './marks';
import { Strip } from './Strip';

const host = (url: string): string => {
  try {
    const name = new URL(url).hostname.replace(/^www\./, '');
    return name === 'pubmed.ncbi.nlm.nih.gov' ? 'PubMed' : name;
  } catch {
    return url;
  }
};

const capitalise = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);

/** "initiation Working, shaping Working, finish Hard" */
export const phaseWords = (a: Activation): string => PHASES.map((p) => `${p} ${effortWord(a.intensity[p])}`).join(', ');

export const Slat = (props: {
  readonly activation: Activation;
  readonly muscleName: string;
  /** The current effort word; changes only on phase change or pause. */
  readonly now: Accessor<Effort>;
  readonly keys: ReadonlyMap<SourceId, number>;
  readonly source: (id: SourceId) => Source | undefined;
  readonly ramp: Accessor<EffortRamp>;
  readonly dot: (el: HTMLSpanElement) => void;
}): JSX.Element => {
  const [open, setOpen] = createSignal(false);
  const a = (): Activation => props.activation;
  const short = (): string => shortName(props.muscleName);
  return (
    <li class={s.slat} data-open={open() ? '' : undefined}>
      <Collapsible.Root open={open()} onOpenChange={(d) => setOpen(d.open)}>
        <Collapsible.Trigger class={s.slatRow}>
          <span class={s.name}>
            <span class={s.muscle}>{short()}</span>{' '}
            <span class={s.side}>{a().side}</span>
            <span class={visuallyHidden}>, now {props.now()}.</span>
          </span>
          <span class={s.evidence}>
            <Stamp confidence={a().confidence} />
            <span class={s.keys}>
              <Show when={a().sources.length > 0} fallback={<span class={s.noKey}>no source</span>}>
                <span class={visuallyHidden}>Sources </span>
                <For each={a().sources}>{(id) => <span class={s.key}>{props.keys.get(id) ?? '?'}</span>}</For>
              </Show>
            </span>
          </span>
          <Strip intensity={a().intensity} label={`${short()}, ${a().side}: ${phaseWords(a())}`} ramp={props.ramp} dot={props.dot} />
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
              <span class={s.label}>Effort</span>
              {capitalise(phaseWords(a()))}. One value per phase.
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
