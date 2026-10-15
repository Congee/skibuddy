import { RegistryProvider } from '@effect/atom-solid';
import { render } from 'solid-js/web';
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
