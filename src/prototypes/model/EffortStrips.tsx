import { For, Show, createMemo, createUniqueId } from 'solid-js';
import type { JSX } from 'solid-js';
import { MAX_EFFORT, effortColour } from '../../content/effort';
import type { EffortRamp } from '../../content/effort';
import { Side } from '../../content/schema';
import type { MuscleId } from '../../content/schema';
import type { TurnEvents } from '../../physics/task';
import { RESIDUAL_SHARE } from './effort-strips';
import type { EffortLane, EffortNote, EffortStrip } from './effort-strips';
import { EVENT_ORDER } from './Strip';

// Strip's width and margins, so the event ticks line up with the curves above.
const W = 760;
const L = 44;
const R = 48;
const LANE = 11;
const LABEL = 13;
const GAP = 6;
const SIDE_WORD: Readonly<Record<Side, string>> = { [Side.Outside]: 'out', [Side.Inside]: 'in', [Side.Both]: '' };

const x = (t: number): number => L + t * (W - L - R);
const yOf = (y0: number, v: number): number => y0 + LANE - Math.max(0.75, (Math.min(MAX_EFFORT, Math.max(0, v)) / MAX_EFFORT) * LANE);
const laneTop = (top: number, j: number): number => top + LABEL + j * (LANE + 1);
const stripHeight = (s: EffortStrip): number => LABEL + s.lanes.length * (LANE + 1) + GAP;

const area = (lane: EffortLane, y0: number): string => {
  const n = lane.effort.length;
  const top = lane.effort.map((v, k) => `L${x(k / n).toFixed(1)} ${yOf(y0, v).toFixed(2)}`).join('');
  return `M${x(0)} ${y0 + LANE}${top}L${x(1)} ${yOf(y0, lane.end).toFixed(2)}L${x(1)} ${y0 + LANE}Z`;
};

const step = (a: readonly [number, number, number], y0: number): string =>
  `M${x(0)} ${yOf(y0, a[0])}H${x(1 / 3)}V${yOf(y0, a[1])}H${x(2 / 3)}V${yOf(y0, a[2])}H${x(1)}`;

const noteText = (n: EffortNote): string =>
  `momentBalance ${n.balanced ? 'pass' : 'fail'}: worst residual ${n.residual.toFixed(3)} of the joint moment (limit ${RESIDUAL_SHARE}) · ` +
  `${n.problems.length} derived phase levels fall as intensity rises${n.problems[0] === undefined ? '' : `, e.g. ${n.problems[0]}`}`;

/** One strip per solved leaf muscle: effort 0–3 against t, the content's level per third as a thin grey step. */
export const EffortStrips = (props: {
  readonly strips: ReadonlyArray<EffortStrip>;
  readonly events: TurnEvents;
  readonly ramp: EffortRamp;
  readonly name: (muscle: MuscleId) => string;
  readonly authoredFrom: string | null;
  readonly note: EffortNote | null;
}): JSX.Element => {
  const id = createUniqueId();
  const layout = createMemo(() => {
    let y = 2;
    return props.strips.map((strip) => {
      const top = y;
      y += stripHeight(strip);
      return { strip, top };
    });
  });
  const height = (): number => layout().reduce((h, l) => Math.max(h, l.top + stripHeight(l.strip)), 0);

  return (
    <div class="effort">
      <p class="soft effort-key">
        Effort 0–3 from the solved turn, outside and inside lanes{props.authoredFrom === null ? '' : `; thin grey step: ${props.authoredFrom}'s hand-authored level per third`}
      </p>
      <svg class="strip effort-strips" viewBox={`0 0 ${W} ${height()}`} role="img" aria-label="Solved effort per muscle over one turn">
        <For each={layout()}>
          {({ strip, top }, i) => (
            <g>
              <text class="lane-label" x={L} y={top + 10}>
                {props.name(strip.muscle)}
              </text>
              <For each={strip.lanes}>
                {(lane, j) => {
                  const y0 = laneTop(top, j());
                  const gid = `${id}-${i()}-${j()}`;
                  return (
                    <>
                      <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={x(0)} x2={x(1)} y1="0" y2="0">
                        <For each={lane.effort}>{(v, k) => <stop offset={k() / lane.effort.length} stop-color={effortColour(v, props.ramp)} />}</For>
                        <stop offset="1" stop-color={effortColour(lane.end, props.ramp)} />
                      </linearGradient>
                      <text class="axis" x={L - 4} y={y0 + LANE - 2} text-anchor="end">
                        {SIDE_WORD[lane.side]}
                      </text>
                      <line class="zero" x1={x(0)} x2={x(1)} y1={y0 + LANE} y2={y0 + LANE} />
                      <path d={area(lane, y0)} fill={`url(#${gid})`} />
                      <Show when={lane.authored}>{(a) => <path class="authored" d={step(a(), y0)} />}</Show>
                    </>
                  );
                }}
              </For>
            </g>
          )}
        </For>
        <For each={EVENT_ORDER}>{(e) => <line class="event" x1={x(props.events[e])} x2={x(props.events[e])} y1={0} y2={height()} />}</For>
      </svg>
      <Show when={props.note}>
        {(n) => (
          <p class={`effort-note ${n().balanced && n().problems.length === 0 ? 'soft' : 'flag-text'}`} title={n().problems.join('\n')}>
            {noteText(n())}
          </p>
        )}
      </Show>
    </div>
  );
};
