import { Collapsible } from '@ark-ui/solid/collapsible';
import { For, Show } from 'solid-js';
import type { Accessor, JSX } from 'solid-js';
import { contractionsFor } from '../../content/effort';
import type { Effort, EffortRamp } from '../../content/effort';
import { citedPages, citedSource, DOF_LABELS, formatPages, INTENSITIES, isAxial, PHASES, SourceRead } from '../../content/schema';
import type { Activation, Citation, Intensity, Source, SourceId } from '../../content/schema';
import { ArrowOut, ChevronDown } from '../icons';
import { visuallyHidden } from '../theme/global.css';
import * as s from './board.css';
import { Stamp } from './marks';
import { INTENSITY_LABELS, phaseWords, settingNotes, variesBySetting } from './intensity';
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

/** "initiation concentric, shaping isometric, finish idle" at setting `i`. */
const contractionWords = (a: Activation, i: Intensity): string => {
  const c = contractionsFor(a, i);
  return PHASES.map((p) => `${p} ${c[p] ?? 'idle'}`).join(', ');
};

/** The joint actions this muscle serves, sided for limbs. */
const servesWords = (a: Activation): string =>
  a.serves.map((dof) => (isAxial(dof) ? DOF_LABELS[dof] : `${DOF_LABELS[dof]} (${a.side})`)).join('; ');

const READ_NOTES: Readonly<Record<SourceRead, string>> = {
  [SourceRead.Full]: 'full text read',
  [SourceRead.Partial]: 'cited sections read',
  [SourceRead.Abstract]: 'abstract read',
};

/** "pp 79–81 · humankinetics.com · full text read" */
export const citeNote = (c: Citation, src: Source): string => {
  const pages = citedPages(c);
  return [...(pages === undefined ? [] : [formatPages(pages)]), host(src.url), READ_NOTES[src.read]].join(' · ');
};

const uniqueSources = (citations: ReadonlyArray<Citation>): ReadonlyArray<SourceId> => [...new Set(citations.map(citedSource))];

// Touch taps fire pointerenter too; only a hovering pointer previews.
const hovering = (e: PointerEvent): boolean => e.pointerType === 'mouse' || e.pointerType === 'pen';

export const Slat = (props: {
  readonly activation: Activation;
  /** The intensity setting the slat shows. */
  readonly intensity: Intensity;
  /** Full name, shown in the open row when the title uses a short one. */
  readonly muscleName: string;
  /** The slat title. */
  readonly muscleShort: string;
  /** The current effort word; changes only on phase change or pause. */
  readonly now: Accessor<Effort>;
  readonly keys: ReadonlyMap<SourceId, number>;
  readonly source: (id: SourceId) => Source | undefined;
  readonly ramp: Accessor<EffortRamp>;
  readonly playhead: (el: HTMLSpanElement) => void;
  readonly dot: (el: HTMLSpanElement) => void;
  /** Shared with the muscle's pin. */
  readonly slatKey: string;
  readonly open: boolean;
  /** This slat's muscle is the one on the figure. */
  readonly focused: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Hover or keyboard focus on the row previews the muscle on the figure. */
  readonly onPreview: (on: boolean) => void;
}): JSX.Element => {
  const a = (): Activation => props.activation;
  const short = (): string => props.muscleShort;
  return (
    <li class={s.slat} data-slat={props.slatKey} data-open={props.open ? '' : undefined} data-focus={props.focused ? '' : undefined}>
      <Collapsible.Root open={props.open} onOpenChange={(d) => props.onOpenChange(d.open)}>
        <Collapsible.Trigger
          class={s.slatRow}
          onPointerEnter={(e) => {
            if (hovering(e)) props.onPreview(true);
          }}
          onPointerLeave={(e) => {
            if (hovering(e)) props.onPreview(false);
          }}
          onFocus={(e) => {
            if (e.currentTarget.matches(':focus-visible')) props.onPreview(true);
          }}
          onBlur={() => props.onPreview(false)}
        >
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
                <For each={uniqueSources(a().sources)}>{(id) => <span class={s.key}>{props.keys.get(id) ?? '?'}</span>}</For>
              </Show>
            </span>
          </span>
          <Strip
            intensity={a().intensity}
            setting={props.intensity}
            label={`${short()}, ${a().side}: ${phaseWords(a(), props.intensity)}`}
            ramp={props.ramp}
            playhead={props.playhead}
            dot={props.dot}
          />
          <ChevronDown class={s.caret} />
        </Collapsible.Trigger>
        <Collapsible.Content class={s.detail}>
          <div class={s.detailBody}>
            <Show when={props.muscleShort !== props.muscleName}>
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
              {capitalise(contractionWords(a(), props.intensity))}.
            </p>
            <p class={s.line}>
              <span class={s.label}>Serves</span>
              {servesWords(a())}.
            </p>
            <p class={s.line}>
              <span class={s.label}>Basis</span>
              {a().basis}.
            </p>
            <p class={s.line}>
              <span class={s.label}>Effort</span>
              {INTENSITY_LABELS[props.intensity]}: {phaseWords(a(), props.intensity)}.{' '}
              {variesBySetting(a()) ? 'Scales with intensity.' : 'The same at every intensity.'}
            </p>
            <Show when={variesBySetting(a())}>
              <p class={s.line}>
                <span class={s.label}>By intensity</span>
                {INTENSITIES.map((i) => `${INTENSITY_LABELS[i]}: ${phaseWords(a(), i)}`).join('. ')}.
                <For each={settingNotes(a())}>{(note) => <> {note}.</>}</For>
              </p>
            </Show>
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
                  {(c) => (
                    <li class={s.cite}>
                      <span class={s.citeKey} aria-hidden="true">
                        {props.keys.get(citedSource(c)) ?? '?'}
                      </span>
                      <Show when={props.source(citedSource(c))} fallback={<span>{citedSource(c)}</span>}>
                        {(src) => (
                          <span>
                            <a class={s.citeLink} href={src().url} target="_blank" rel="noopener noreferrer">
                              {src().citation}
                              <ArrowOut />
                              <span class={visuallyHidden}> (opens in a new tab)</span>
                            </a>
                            <span class={s.citeNote}>
                              {citeNote(c, src())}
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
