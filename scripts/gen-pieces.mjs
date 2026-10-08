import { writeFileSync } from 'node:fs';

const ball = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const rect = (x, y, w, h) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>`;
const base = `<path d="M9.5 41.500h26v-1.500c0-1.700-1.200-2.800-3-2.800h-20c-1.800 0-3 1.100-3 2.800z"/>`;

const SHAPES = {
  P: `${ball(22.5, 12.5, 5)}${rect(16.5, 18, 12, 3)}<path d="M18.500 21c.5 6-2.500 10-4.500 16h17c-2-6-5-10-4.500-16z"/>${base}`,
  R: `<path d="M13 8h4.500v3h3.500V8h3v3h3.500V8H32v8c0 1-1 1.500-2 1.500H15c-1 0-2-.5-2-1.500z"/><path d="M16 18h13l1 3.500H15z"/><path d="M16.500 21 15 34h15l-1.500-13z"/>${rect(13, 33, 19, 4)}${base}`,
  B: `${ball(22.5, 5.500, 2.300)}<path d="M22.500 7.500c6 4 7.500 9.500 4.500 14H18c-3-4.500-1.500-10 4.500-14z"/>${rect(15.500, 21, 14, 3.200)}<path d="M19 24c.5 4.500-1.500 8-3.500 13h14c-2-5-4-8.500-3.500-13z"/>${base}`,
  N: `<path d="M12 37c.5-8 3-13 7-16-2.500.5-6 3-8.500 4.500L8.500 22.500C11 17 14.500 13 17.500 11L17 6.500l4 3c9 .5 14 8.500 12 27.500z"/>${base}`,
  Q: `<path d="M15 36.500C14.500 30 12 22 10 14l3.500 9L16 10l3.500 11.500L22.500 8l3 13.500L29 10l2.500 13L35 14c-2 8-4.500 16-5 22.500z"/>${[10, 16, 22.5, 29, 35].map((x, i) => ball(x, [12.500, 8.500, 6.500, 8.500, 12.500][i], 2.300)).join('')}${rect(14, 32.500, 17, 4)}${base}`,
  K: `${rect(21, 1.500, 3, 10)}${rect(17.500, 4.500, 10, 3)}${rect(17, 12, 11, 3.200)}<path d="M14.500 36.500C13 29 12 24 15 20c1.500-2 4-3 4-4.800h7c0 1.800 2.500 2.800 4 4.800 3 4 2 9 .5 16.500z"/>${rect(13.500, 32.500, 18, 4)}${base}`,
};

const DETAIL = {
  N: (c) =>
    `<g fill="${c}"><circle cx="22" cy="15" r="1.400"/><circle cx="12.500" cy="22.800" r=".9"/></g><path d="M25 11.500c3 3 5 8 4.500 14" fill="none" stroke="${c}" stroke-opacity=".5" stroke-width="1" stroke-linecap="round"/>`,
  B: (c) =>
    `<path d="M24.500 11.500 21 17" fill="none" stroke="${c}" stroke-width="1.400" stroke-linecap="round"/>`,
};

const TONES = {
  w: { stops: ['#ffffff', '#efe6d2', '#b5a688'], line: '#4a3f2a', sheen: 0.7, gold: '#c49a45' },
  b: { stops: ['#6f7684', '#2b2f38', '#08090c'], line: '#000000', sheen: 0.28, gold: '#d4af5f' },
};

for (const [color, t] of Object.entries(TONES)) {
  for (const [type, shape] of Object.entries(SHAPES)) {
    const id = `${color}${type}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><defs><linearGradient id="h${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${t.stops[0]}"/><stop offset=".45" stop-color="${t.stops[1]}"/><stop offset="1" stop-color="${t.stops[2]}"/></linearGradient><linearGradient id="v${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${t.sheen}"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient></defs><ellipse cx="22.500" cy="41.500" rx="14" ry="1.800" fill="#000" fill-opacity=".28"/><g fill="${t.line}" stroke="${t.line}" stroke-width="2.600" stroke-linejoin="round">${shape}</g><g fill="url(#h${id})">${shape}</g><g fill="url(#v${id})">${shape}</g>${DETAIL[type]?.(t.line) ?? ''}<path d="M11.500 38.800h22" stroke="${t.gold}" stroke-width=".9" stroke-linecap="round" fill="none"/></svg>`;
    writeFileSync(`public/pieces/${color}${type}.svg`, svg);
  }
}
