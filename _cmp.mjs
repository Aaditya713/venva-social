import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const b64 = readFileSync('out/_fav192.png').toString('base64');
const logo = (stroke, op) => `<svg viewBox="0 0 192 192" width="576" height="576" style="position:absolute;inset:0;opacity:${op}" fill="none" stroke="${stroke}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
<path d="M96 66A26 26 0 1 0 55.6 98.4L96 138.8 136.4 98.4A26 26 0 1 0 96 66Z"/><path d="M48 95H76L82 73 96 119 106 95H144"/></svg>`;
const html = `<body style="margin:0;display:flex;gap:10px;background:#888">
<div style="position:relative;width:576px;height:576px"><img src="data:image/png;base64,${b64}" width=576 style="image-rendering:pixelated">${logo('red',.55)}</div>
<div style="position:relative;width:576px;height:576px;background:linear-gradient(135deg,#2C7A5B,#1F5C46);border-radius:120px">${logo('#fff',1)}</div></body>`;
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1170,height:576}});
await p.setContent(html); await p.waitForTimeout(500); await p.screenshot({path:'out/_cmp.png'}); await b.close();
