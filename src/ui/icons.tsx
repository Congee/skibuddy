import type { JSX } from 'solid-js';

type IconProps = { readonly class?: string | undefined };

const svg = (props: IconProps, children: JSX.Element, viewBox = '0 0 16 16'): JSX.Element => (
  <svg class={props.class} viewBox={viewBox} aria-hidden="true">
    {children}
  </svg>
);

export const ChevronDown = (props: IconProps): JSX.Element =>
  svg(props, <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" />);

export const Check = (props: IconProps): JSX.Element =>
  svg(props, <path d="M2.5 8.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.2" />);

export const Play = (props: IconProps): JSX.Element => svg(props, <path d="M4 2.5v11l9.5-5.5z" fill="currentColor" />);

export const Pause = (props: IconProps): JSX.Element =>
  svg(
    props,
    <>
      <rect x="3" y="2.5" width="3.5" height="11" fill="currentColor" />
      <rect x="9.5" y="2.5" width="3.5" height="11" fill="currentColor" />
    </>,
  );

export const ArrowOut = (props: IconProps): JSX.Element =>
  svg(props, <path d="M5 3h8v8M13 3L3 13" fill="none" stroke="currentColor" stroke-width="2" />);

export const Caution = (props: IconProps): JSX.Element =>
  svg(
    props,
    <>
      <path d="M8 1.5l7 12.5H1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
      <path d="M8 6v4" stroke="currentColor" stroke-width="1.8" />
      <circle cx="8" cy="12" r="1" fill="currentColor" />
    </>,
  );

export const ChangeUp = (props: IconProps): JSX.Element => svg(props, <path d="M7 2l5.5 9h-11z" fill="currentColor" />, '0 0 14 14');

export const ChangeDown = (props: IconProps): JSX.Element =>
  svg(props, <path d="M7 12l5.5-9h-11z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />, '0 0 14 14');

export const ChangeSame = (props: IconProps): JSX.Element =>
  svg(props, <path d="M3 7h8" stroke="currentColor" stroke-width="2" />, '0 0 14 14');
