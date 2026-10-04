import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
const dir = 'C:/Venva/venva-social/out';
const imgs = readdirSync(dir).filter(f => /^(sample|\d{3})-.*\.jpg$/.test(f)).sort();
const html = `<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(4,440px);gap:4px">${imgs.map(f=>`<img src="data:image/jpeg;base64,${readFileSync(dir+'/'+f).toString('base64')}" width=440>`).join('')}</body>`;
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1772,height:900}});
await p.setContent(html); await p.waitForTimeout(800);
await p.screenshot({path: dir + '/_contact-sheet.jpg', fullPage: true, type:'jpeg', quality:85}); await b.close();
