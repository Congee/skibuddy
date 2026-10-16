import { assignVars, createGlobalTheme, createThemeContract, globalStyle } from '@vanilla-extract/css';

export const vars = createThemeContract({
  color: {
    ground: null,
    frame: null,
    plate: null,
    plateInk: null,
    plateInk2: null,
    slat: null,
    slatOpen: null,
    well: null,
    ink: null,
    ink2: null,
    ink3: null,
    rule: null,
    field: null,
    snow: null,
    snowLine: null,
    focus: null,
    selection: null,
    pinBg: null,
    pinInk: null,
    leader: null,
    rest: null,
    l1: null,
    l1Ink: null,
    l2: null,
    l2Ink: null,
    l3: null,
    l3Ink: null,
  },
  font: { body: null },
  shadow: { pop: null },
});

const level = {
  l1: '#8ECBFF',
  l1Ink: '#0A1A2B',
  l2: '#2F6BFF',
  l2Ink: '#FFFFFF',
  l3: '#3A10A8',
  l3Ink: '#FFFFFF',
};

const font = { body: '"Archivo Variable", "Archivo", system-ui, sans-serif' };

const light = {
  color: {
    ground: '#F3F5F1',
    frame: '#1E3A32',
    plate: '#1E3A32',
    plateInk: '#F3F5F1',
    plateInk2: '#CFDCD5',
    slat: '#FFFFFF',
    slatOpen: '#FFFFFF',
    well: '#EEF2EF',
    ink: '#12231E',
    ink2: '#33493F',
    ink3: '#4A5C54',
    rule: '#C2CDC7',
    field: '#1E3A32',
    snow: '#E4EBE7',
    snowLine: '#C3CFC9',
    focus: '#3A10A8',
    selection: '#8ECBFF',
    pinBg: '#FFFFFF',
    pinInk: '#12231E',
    leader: '#F3F5F1',
    rest: '#B9C5BF',
    ...level,
  },
  font,
  shadow: {
    pop: '0 12px 32px -8px rgba(10, 25, 20, 0.35), 0 2px 6px rgba(10, 25, 20, 0.18)',
  },
};

const dark = {
  color: {
    ground: '#0D1915',
    frame: '#07110E',
    plate: '#12241F',
    plateInk: '#F3F5F1',
    plateInk2: '#C6D4CD',
    slat: '#1E3A32',
    slatOpen: '#234339',
    well: '#12241F',
    ink: '#F3F5F1',
    ink2: '#C6D4CD',
    ink3: '#A9BBB3',
    rule: '#3D5F53',
    field: '#142A23',
    snow: '#1B352D',
    snowLine: '#21403A',
    focus: '#8ECBFF',
    selection: '#3A10A8',
    pinBg: '#E4EBE7',
    pinInk: '#12231E',
    leader: '#F3F5F1',
    rest: '#4C6359',
    ...level,
  },
  font,
  shadow: {
    pop: '0 12px 32px -8px rgba(0, 0, 0, 0.7), 0 2px 6px rgba(0, 0, 0, 0.5)',
  },
};

// Light by default; dark from the OS unless data-theme="light", or always with data-theme="dark".
createGlobalTheme(':root', vars, light);

globalStyle(':root', { colorScheme: 'light dark' });

globalStyle(':root:not([data-theme="light"])', {
  '@media': {
    '(prefers-color-scheme: dark)': { vars: assignVars(vars, dark) },
  },
});

globalStyle(':root[data-theme="light"]', { colorScheme: 'light' });

globalStyle(':root[data-theme="dark"]', { colorScheme: 'dark', vars: assignVars(vars, dark) });
