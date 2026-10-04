import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1080,height:1080}});
await p.goto(pathToFileURL('template/post.html').href);
await p.evaluate(x => window.renderPost(x), {template:'stat',number:'7-9',label:'Hours of sleep',body:'Deep sleep is when testosterone\nreleases and hunger hormones reset.\nShort nights = cravings, low energy.\nFix sleep, fix half your problems.'});
const png = await p.screenshot({ clip: { x: 0, y: 0, width: 1080, height: 1080 } });
const r = await p.evaluate(async b64 => { const i = new Image(); i.src = 'data:image/png;base64,' + b64; await i.decode();
  const c = document.createElement('canvas'); c.width = c.height = 1080; const x = c.getContext('2d'); x.drawImage(i, 0, 0);
  const d = x.getImageData(300, 100, 480, 420).data; let top = 1e9, bot = 0;
  for (let y = 0; y < 420; y++) for (let k = 0; k < 480; k++) { const o = (y*480+k)*4; if (d[o] > 240 && d[o+1] > 240 && d[o+2] > 240) { top = Math.min(top, y); bot = Math.max(bot, y); } }
  return { top: top + 100, bottom: bot + 100 }; }, png.toString('base64'));
console.log('number glyph', r, 'target top 225 bottom 468'); await b.close();
