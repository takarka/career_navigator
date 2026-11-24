import { render } from 'preact';
import { Shell } from './app/Shell.tsx';
import './styles/global.css';

render(<Shell />, document.getElementById('app')!);
