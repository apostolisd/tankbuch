import { render } from 'preact';
import { App } from './app';
import './ui/styles.css';

const wurzel = document.getElementById('app');
if (wurzel) render(<App />, wurzel);

// Service Worker nur in Produktion (cached ausschliesslich die App-Hülle).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* ohne SW weiter */ });
  });
}
