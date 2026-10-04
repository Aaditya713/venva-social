import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const posts = {
 tip: {template:'tip',label:'Nutrition',headline:'Protein at\nbreakfast',highlight:'Aim 25-35 g per meal',body:'Most people get almost none, then crash by 11am. Try: besan chilla + curd, paneer bhurji, eggs, or oats + milk + peanuts.'},
 myth: {template:'myth',label:'Myth buster',headline:'Crunches burn\nbelly fat?',body:'Nope — you can\'t spot-reduce fat. Crunches build muscle under the fat, they don\'t remove it. Belly fat goes when your total body fat drops.'},
 stat: {template:'stat',number:'7-9',label:'Hours of sleep',body:'Deep sleep is when testosterone\nreleases and hunger hormones reset.\nShort nights = cravings, low energy.\nFix sleep, fix half your problems.'},
};
const b = await chromium.launch(); const p = await b.newPage({viewport:{width:1080,height:1080}});
await p.goto(pathToFileURL('template/post.html').href);
for (const [k, post] of Object.entries(posts)) {
  await p.evaluate(x => window.renderPost(x), post);
  console.log(k, JSON.stringify(await p.evaluate(() => {
    const box = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); };
    const lines = s => { const e = document.querySelector(s); if (!e) return null; const r = document.createRange(); r.selectNodeContents(e);
      return [...r.getClientRects()].filter(x => x.width > 2).map(x => [Math.round(x.left), Math.round(x.top + x.height/2), Math.round(x.width)]); };
    return { pill: box('.pill'), head: lines('.headline'), bar: box('.bar'), body: lines('.body'), rule: box('.rule'), kicker: lines('.kicker'),
      number: lines('.number'), label: lines('.label'), ring: box('.ring'), footer: box('.footer'), icon: box('.brand svg'), venva: lines('.brand span'), handles: lines('.handles') };
  })));
}
await b.close();
