import { useAtomValue } from '@effect/atom-solid';
import { Show, createMemo } from 'solid-js';
import type { JSX } from 'solid-js';
import { matchExercises } from '../content/match';
import type { Content, Drill, Movement } from '../content/schema';
import { drillIdAtom, phaseAt, pinsAtom, turnTimeAtom } from '../state/playback';
import * as s from './app.css';
import { Board } from './board/Board';
import { shortName } from './board/marks';
import { rankSlats } from './board/rank';
import { FigureField } from './figure/FigureField';
import { GymBoard } from './gym/GymBoard';
import { LiftLine, PhaseStops, usePlayback } from './lift/LiftLine';
import { phoneTabs } from './lift/lift.css';
import { REDUCED_MOTION, createMedia } from './media';

const Lodge = (props: { readonly content: Content; readonly drill: Drill; readonly movement: Movement }): JSX.Element => {
  const t = useAtomValue(() => turnTimeAtom);
  const pins = useAtomValue(() => pinsAtom);
  const reducedMotion = createMedia(REDUCED_MOTION);
  usePlayback(reducedMotion);
  const phase = createMemo(() => phaseAt(t()));
  const ranked = createMemo(() => rankSlats(props.movement.activations, phase()));
  const muscleName = (id: string): string => props.content.muscles.find((m) => m.id === id)?.name ?? id;
  const tasks = createMemo(() => props.content.tasks.filter((x) => x.drill === props.drill.id));
  const matches = createMemo(() => matchExercises(props.movement, props.content.exercises));

  return (
    <main class={s.lodge}>
      <section class={s.stage} aria-label="Figure and turn">
        <FigureField
          movement={props.movement}
          muscles={props.content.muscles.map((m) => m.id)}
          ranked={ranked()}
          pins={pins()}
          muscleName={(id) => shortName(muscleName(id))}
        />
        <LiftLine />
      </section>
      <div class={phoneTabs}>
        <PhaseStops look="tabs" />
      </div>
      <div class={s.boards}>
        <Board
          drill={props.drill}
          movement={props.movement}
          tasks={tasks()}
          content={props.content}
          phase={phase()}
          ranked={ranked()}
          reducedMotion={reducedMotion}
        />
        <GymBoard matches={matches()} movement={props.movement} content={props.content} />
      </div>
    </main>
  );
};

export const DrillView = (props: { readonly content: Content }): JSX.Element => {
  const drillId = useAtomValue(() => drillIdAtom);
  const drill = createMemo(() => props.content.drills.find((d) => d.id === drillId()) ?? props.content.drills[0]);
  const movement = createMemo(() => props.content.movements.find((m) => m.id === drill()?.movement));
  return (
    <Show when={drill()} keyed fallback={<p class={s.status}>No drills yet.</p>}>
      {(d) => (
        <Show when={movement()} keyed fallback={<p class={s.status} role="alert">This drill has no movement data yet.</p>}>
          {(m) => <Lodge content={props.content} drill={d} movement={m} />}
        </Show>
      )}
    </Show>
  );
};
