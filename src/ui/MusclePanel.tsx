import { For, Show } from 'solid-js';
import type { JSX } from 'solid-js';
import type { MuscleLevel } from '../content/activation';
import type { Content, Movement } from '../content/schema';

export const MusclePanel = (props: {
  readonly levels: ReadonlyArray<MuscleLevel>;
  readonly movement: Movement;
  readonly content: Content;
}): JSX.Element => {
  const muscleName = (id: string): string => props.content.muscles.find((m) => m.id === id)?.name ?? id;
  return (
    <section class="panel" aria-labelledby="muscles-heading">
      <h2 id="muscles-heading">Muscles at work</h2>
      <ul class="muscles">
        <For each={props.movement.activations}>
          {(a, i) => {
            const level = (): number => props.levels[i()]?.level ?? 0;
            return (
              <li class="muscle">
                <div class="muscle-head">
                  <strong>{muscleName(a.muscle)}</strong>
                  <span class="muted">{a.side}</span>
                  <span class={`badge confidence-${a.confidence}`}>{a.confidence} confidence</span>
                </div>
                <div class="level" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={level()} aria-label={`${muscleName(a.muscle)} level`}>
                  <div class="level-fill" style={{ width: `${Math.round(level() * 100)}%` }} />
                </div>
                <p>
                  {a.role}. <span class="muted">{a.contraction.join(', ')}</span>
                </p>
                <p class="muted">{a.basis}</p>
                <Show when={a.sources.length > 0}>
                  <ul class="sources">
                    <For each={a.sources}>
                      {(id) => {
                        const source = props.content.sources.find((s) => s.id === id);
                        return (
                          <li>
                            <Show when={source} fallback={id}>
                              {(s) => (
                                <a href={s().url} target="_blank" rel="noopener noreferrer">
                                  {s().citation}
                                </a>
                              )}
                            </Show>
                          </li>
                        );
                      }}
                    </For>
                  </ul>
                </Show>
              </li>
            );
          }}
        </For>
      </ul>
    </section>
  );
};
