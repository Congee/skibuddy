// oxlint-disable-next-line import/no-unassigned-import -- self-hosted font faces
import '@fontsource-variable/archivo/standard.css';
import { RegistryProvider } from '@effect/atom-solid';
import { render } from 'solid-js/web';
import { registerServiceWorker } from './pwa/register';
import { App } from './ui/App';

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');

render(
  () => (
    <RegistryProvider>
      <App />
    </RegistryProvider>
  ),
  root,
);

registerServiceWorker();
