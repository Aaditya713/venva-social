// Picks the venva.co.in page that best continues a post, so the link-in-bio page (venva.co.in/ig)
// can send each post's readers to the right guide instead of the home page.
// Rules run top to bottom against the post's slug and card text; the first match wins.
const RULES = [
  [/period|menstrual|pcos/, '/blog/period-pain-irregular-periods/'],
  [/cold-water/, '/nutrition/'],

  // Exercise form guides
  [/push-?ups?/, '/exercises/push-up/'],
  [/plank/, '/exercises/plank/'],
  [/glute-bridge|glute bridge/, '/exercises/glute-bridge/'],
  [/hip thrust/, '/exercises/hip-thrust/'],
  [/squat/, '/exercises/goblet-squat/'],
  [/lunge/, '/exercises/bulgarian-split-squat/'],
  [/back-rows|\brows?\b/, '/exercises/one-arm-dumbbell-row/'],
  [/back-pain|desk-stretches|neck/, '/symptoms/neck-back-pain-desk-work/'],
  [/home-workout|resistance-bands|warm-up|stretch|sorenes|no-pain|workouts?\b|warrior|yoga|leg-balance|balance-\d|sit-rise/, '/exercises/'],

  // Symptom pages
  [/hair-?fall|hairfall|oiling/, '/symptoms/hair-fall/'],
  [/acne/, '/symptoms/acne-causes/'],
  [/eye|blink/, '/symptoms/eye-strain-from-screens/'],
  [/dizz/, '/symptoms/dizziness/'],
  [/tired|fatigue|energy-drinks|after-bad-night/, '/symptoms/always-tired/'],
  [/bloat|acidity|ibs|constipation|bowel|gut|spicy-ulcers/, '/symptoms/bloating-and-acidity/'],
  [/knee/, '/symptoms/knee-pain/'],
  [/panic|anxiety|worry|burnout|breathing-stress|grounding|exam-stress|sunday-dread/, '/symptoms/stress-and-anxiety/'],
  [/antibiotics|-colds?\b|fever|dengue|handwashing|salt-gargle/, '/symptoms/getting-sick-often/'],
  [/heartbeats|palpitation/, '/symptoms/heart-palpitations/'],
  [/scale-fluctuations|thyroid-weight/, '/symptoms/sudden-weight-gain/'],
  [/snoring|cant-sleep|fall-asleep|insomnia/, '/symptoms/trouble-sleeping/'],

  // Women's and men's health
  [/bulky/, '/blog/cardio-or-weights/'],
  [/belly|waist|abdominal|crunches/, '/blog/lose-belly-fat-honestly/'],
  [/women|menopause|pregnan|postpartum|breast|folic|anaemia|eating-for-two|pelvic-floor|\bhpv\b|\buti\b/, '/womens-health/'],
  [/mens-|men-|prostate/, '/mens-health/'],

  // Long-form articles
  [/heart-attack|cholesterol|heart-preventable|heart-kitchen|cvd|\bstroke\b|trans-fat/, '/blog/young-heart-attacks-india/'],
  [/cortisol|stress/, '/blog/stress-makes-you-fat/'],
  [/\bscreen\b|social-media|phone/, '/blog/screen-time-effects/'],
  [/smok|tobacco|vaping|hookah/, '/ask/'],
  [/sitting|sedentary|steps|stairs|neat|fidget|walk|inactive|offset/, '/blog/sedentary-lifestyle-damage/'],
  [/protein|paneer|egg|dal-rice|creatine/, '/blog/protein-india-cheap/'],
  [/cardio|strength|muscle|lifting|weights|out-train/, '/blog/cardio-or-weights/'],
  [/fat-loss|weekly-loss|calorie|carbs|fullness|keto|intermittent-fasting|fasted|weight/, '/blog/indian-fat-loss-diet/'],
  [/sleep|nap|bedtime|wind-down|bedroom|jet-lag|night-shift|body-clock/, '/blog/fix-your-sleep/'],

  // Hubs
  [/bmi|portion/, '/personalize/'],
  [/running|zone-2|heart-rate|resting-hr|aerobic|vigorous|who-300|exercise/, '/cardio/'],
  [/blood-pressure|\bbp\b|diabetes|hba1c|sugar|liver|kidney|screening|checkup|dental|family-history|spo2/, '/symptoms/'],
  [/food|\beat|eating|diet|nutri|potato|banana|turmeric|plants|pulses|tomato|organic|carrot|gluten|herbal|vinegar|dinner|fat-free|guava|amla|fruit|veg|salt|sodium|fibre|oil|ghee|rice|millet|ragi|nuts|milk|curd|ferment|iron|b12|vitamin|calcium|water|tea|coffee|caffeine|chai|juice|snack|breakfast|label|oats|granola|chips|noodles|ketchup|cereal|jaggery|honey|alcohol|tiffin|plate|chewing|meal/, '/nutrition/'],
  [/habit|journal|self-talk|hobbies|friend|talk|mental|mood|gratitude|good-things|say-no|nature/, '/routine/'],
];

const FALLBACK = '/ask/';

export function linkFor(post) {
  const text = [post.id, post.headline, post.label, post.highlight, post.number].filter(Boolean).join(' ').toLowerCase();
  return RULES.find(([re]) => re.test(text))?.[1] ?? FALLBACK;
}

// The caption line that points readers to the bio link; links in captions aren't clickable on Instagram.
export const CTA = 'Full guide 👉 link in bio (venva.co.in/ig)';
const OLD_CTA = /^Full guide → venva\.co\.in$/m;

export const withBioCta = caption => caption.replace(OLD_CTA, CTA);
