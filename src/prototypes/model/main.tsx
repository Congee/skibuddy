// oxlint-disable-next-line import/no-unassigned-import -- page styles
import './model.css';
import { render } from 'solid-js/web';
import { Model } from './Model';

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');
render(() => <Model />, root);
