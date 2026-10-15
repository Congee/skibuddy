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

export const Sun = (props: IconProps): JSX.Element =>
  svg(
    props,
    <>
      <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.8" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" stroke="currentColor" stroke-width="1.6" />
    </>,
  );

export const Moon = (props: IconProps): JSX.Element =>
  svg(props, <path d="M13.5 10A6 6 0 0 1 6 2.5a6 6 0 1 0 7.5 7.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />);

/** A screen, for "follow the system". */
export const Screen = (props: IconProps): JSX.Element =>
  svg(
    props,
    <>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.6" />
      <path d="M5 14h6M8 11.5V14" stroke="currentColor" stroke-width="1.6" />
    </>,
  );
