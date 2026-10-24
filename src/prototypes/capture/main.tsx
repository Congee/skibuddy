// oxlint-disable-next-line import/no-unassigned-import -- page styles
import './capture.css';
import { render } from 'solid-js/web';
import { Capture } from './Capture';

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');
render(() => <Capture />, root);
