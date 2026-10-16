import { KINDS, KindId, MogulLine } from './data';

/** What a link restores: the kind of skiing and, on moguls, the line. */
export interface UrlState {
  readonly kind: KindId;
  readonly line: MogulLine;
}

export const DEFAULT_URL_STATE: UrlState = { kind: KindId.Carving, line: MogulLine.Zipper };

export const readUrlState = (search: string): UrlState => {
  const params = new URLSearchParams(search);
  const kind = KINDS.find((k) => k.id === params.get('kind'))?.id ?? DEFAULT_URL_STATE.kind;
  const line = params.get('line') === MogulLine.Tops ? MogulLine.Tops : MogulLine.Zipper;
  return { kind, line };
};

/** The query with this state, defaults left out and other params (?figure=, ?renderer=) kept. */
export const writeUrlState = (state: UrlState, search: string): string => {
  const params = new URLSearchParams(search);
  if (state.kind === DEFAULT_URL_STATE.kind) params.delete('kind');
  else params.set('kind', state.kind);
  if (state.kind === KindId.Moguls && state.line !== DEFAULT_URL_STATE.line) params.set('line', state.line);
  else params.delete('line');
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
};
