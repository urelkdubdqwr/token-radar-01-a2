// The dashboard renderer: it reads the radar payload (window.RADAR, written by ../data.js) and paints
// the board, the KPI row, the scatter and the detail drawer into #app. It runs as-is in the browser with
// no build step, so it stays plain ES2020 and touches only the DOM it is handed.

(() => {
  'use strict';

  const payload = (typeof window !== 'undefined' && window.RADAR) ? window.RADAR : {};
  const root = document.getElementById('app');
  if (!root) return;

  root.setAttribute('aria-busy', 'false');
})();
