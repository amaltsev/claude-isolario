// The gazetteer: an entry for the island in the manner of an old pilot
// book. Every statement of fact is read off the generated island (areas,
// bearings, heights, which town stands at which river mouth); only the
// colour, such as customs and the bottom of an anchorage, is invented.

import { Rng } from './rng.js';
import { roundish } from './island.js';

const OPPOSITE = {
  north: 'south', south: 'north', east: 'west', west: 'east',
  'north-east': 'south-west', 'south-west': 'north-east',
  'north-west': 'south-east', 'south-east': 'north-west',
};

const PRODUCE = {
  aelic: ['oats', 'a strong spirit distilled from barley', 'salt butter'],
  norn: ['stockfish', 'eider down', 'train oil'],
  meridian: ['wine', 'olives', 'dried figs'],
  karst: ['honey', 'plum brandy', 'smoked cheese'],
  polyn: ['copra', 'breadfruit', 'pearl-shell'],
  saxon: ['cider', 'barley', 'salt pork'],
};

const CUSTOMS = [
  'Strangers are reckoned lucky, and are seldom allowed to pay for their first meal ashore.',
  'No boat puts out on the day a child is born in the same street.',
  'The islanders keep their own reckoning of the calendar, and are commonly a day out from their neighbours.',
  'It is the custom to greet the first seal of the year by name.',
  'Debts are settled once a year, at the quay, in the hearing of all.',
  'Every house keeps a lamp in its seaward window from dusk until the boats are in.',
  'The people will not whistle afloat, and look hard at a stranger who does.',
  'A pilot may be had by hoisting a jack at the fore; he will expect to be fed.',
  'The islanders are great singers, and a calm evening carries their voices well offshore.',
  'Salt is never passed from hand to hand here, but set down and taken up.',
  'Bees are told of every death and every wedding before the neighbours are.',
  'Goods are still weighed against a stone kept chained in the market.',
  'The wells are dressed with green boughs on midsummer eve.',
  'Bread is baked once a week, by the whole street together, and a visitor is given the heel.',
];

const BOTTOMS = ['sand', 'stiff mud', 'sand and shell', 'blue clay', 'fine gravel'];

const number = (n) => Math.round(n).toLocaleString('en-GB');
const miles = (m) => (m < 10 ? String(Math.max(0.5, Math.round(m * 2) / 2)) : number(roundish(m)));
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** How to refer to a river mid-sentence: "the River Esk", "the Esk Water". */
const riverRef = (r) => (r.name.article || /^River /.test(r.name.name) ? `the ${r.name.name}` : r.name.name);

function whereabouts(t) {
  if (t.coastal) return t.quarter === 'middle' ? 'on the inner shore' : `on the ${t.quarter} coast`;
  return t.quarter === 'middle' ? 'in the heart of the island' : `inland, in the ${t.quarter}`;
}
const inThe = (quarter) => (quarter === 'middle' ? 'in the middle of the island' : `in the ${quarter}`);

export function gazetteer(island) {
  const rng = new Rng(island.seed).fork('gazetteer');
  const { facts, name, sea, towns, peaks, rivers, capes, bays, sites, wood, marsh, mere } = island;
  const plural = facts.scattered;
  const is = plural ? 'are' : 'is';
  const it = plural ? 'they' : 'it';
  const Name = capitalise(name.full);
  const capital = towns[0];
  const sections = [];

  // --- Situation ---------------------------------------------------------
  {
    const area = number(roundish(facts.areaSqMiles));
    let text;
    if (plural) {
      text = `${Name} are a group of ${facts.landmasses} islands and islets in ${sea.full}, with some ${area} square miles of land between them. `;
      text += `The largest is ${miles(facts.lengthMiles)} miles from end to end, lying ${facts.trend[0]} and ${facts.trend[1]}; the whole group has about ${miles(facts.coastMiles)} miles of coast.`;
    } else {
      text = `${Name} is an island of some ${area} square miles in ${sea.full}. `;
      text += `It is ${miles(facts.lengthMiles)} miles at its longest, lying ${facts.trend[0]} and ${facts.trend[1]}, with about ${miles(facts.coastMiles)} miles of coast`;
      text += facts.islets === 0 ? '.' : facts.islets === 1 ? ' and a single islet standing off it.' : ` and ${facts.islets} islets standing off it.`;
    }
    switch (island.shape) {
      case 'crescent':
        text += island.bight.bay
          ? ` The land bends like a sickle about ${island.bight.bay.full}, which lies open to the ${island.bight.opensTo}.`
          : ` The land bends like a sickle about a great bight, open to the ${island.bight.opensTo}.`;
        break;
      case 'long':
        text += ' The island is long and narrow, and a man may cross it in a morning where it would take him days to walk its length.';
        break;
      case 'twin':
        text += plural
          ? ' The two chief islands are parted by a narrow sound.'
          : ' It is all but two islands, held together by a neck of lower ground.';
        break;
      case 'shattered':
        text += ' The sea has broken the coast everywhere into sounds and inlets, so that no house stands far from salt water.';
        break;
      default:
        text += ' The coast is bold and compact, with few deep inlets.';
    }
    sections.push({ heading: 'Situation', text });
  }

  // --- The land ------------------------------------------------------------
  {
    const top = peaks[0];
    let text = '';
    if (top) {
      const leagues = Math.round((1.17 * Math.sqrt(top.feet)) / 3);
      const others = peaks.slice(1).map((p) => `${p.full} (${number(p.feet)} feet)`);
      if (island.relief === 'lowland') {
        text += `The land is low throughout. ${capitalise(top.full)}, its highest ground, reaches only ${number(top.feet)} feet, and is no mark for the mariner until he is close in.`;
      } else if (island.relief === 'downs') {
        text += `The country is one of rolling downs, rising to ${number(top.feet)} feet at ${top.full} ${inThe(top.quarter)}.`;
        if (others.length) text += ` ${capitalise(list(others))} ${others.length > 1 ? 'are' : 'is'} somewhat lower.`;
      } else {
        text += `The interior is ${island.relief === 'alpine' ? 'mountainous' : 'high and broken'}, culminating in ${top.full}, ${number(top.feet)} feet, ${inThe(top.quarter)}; in clear weather it may be raised at ${leagues} leagues.`;
        if (others.length) text += ` The lesser heights are ${list(others)}.`;
      }
    }
    const forest = facts.forest;
    const woods = forest > 0.5 ? `Better than half of ${plural ? 'the land' : 'the island'} is under wood`
      : forest > 0.28 ? `About a third of ${plural ? 'the land' : 'the island'} is wooded`
      : forest > 0.1 ? 'Woods are scattered and of no great size'
      : 'Trees are few, and timber for building is brought in by sea';
    text += ` ${woods}`;
    text += wood && forest > 0.1 ? `, the greatest stretch being ${wood.full} ${inThe(wood.quarter)}.` : '.';
    if (marsh) text += ` ${capitalise(marsh.full)}, ${inThe(marsh.quarter)}, is low wet ground, impassable after rain and much frequented by wildfowl.`;
    if (mere) text += ` ${capitalise(mere.full)} is a sheet of fresh water ${inThe(mere.quarter)}.`;
    sections.push({ heading: 'The land', text: text.trim() });
  }

  // --- Waters --------------------------------------------------------------
  {
    const named = rivers.filter((r) => r.name).sort((a, b) => b.lengthMiles - a.lengthMiles);
    let text;
    if (!named.length) {
      text = 'There is no river worth the name. Water is had from wells and from cisterns cut in the rock, and in a dry summer it is rationed.';
    } else {
      const describe = (r) => {
        const town = towns.find((t) => t.coastal && t.river === r.index);
        if (r.into === 'lake') return `into ${mere ? mere.full : 'a lake'}`;
        if (town) return `to the sea at ${town.name}`;
        return r.mouthQuarter === 'middle' ? 'to the sea' : `to the sea on the ${r.mouthQuarter} coast`;
      };
      const chief = named[0];
      text = `The chief stream is ${riverRef(chief)}, which runs some ${miles(chief.lengthMiles)} miles ${describe(chief)}.`;
      const rest = named.slice(1);
      if (rest.length === 1) {
        text += ` ${capitalise(riverRef(rest[0]))}, ${miles(rest[0].lengthMiles)} miles, runs ${describe(rest[0])}.`;
      } else if (rest.length > 1) {
        text += ` Lesser waters are ${list(rest.map((r) => `${riverRef(r)} (${miles(r.lengthMiles)} miles, ${describe(r)})`))}.`;
      }
      const tail = rng.int(0, 3);
      text += ` ${(named.length > 1
        ? [
          'None is navigable above the tide, but all give good water.',
          'Boats may be taken a little way up the largest on the flood.',
          'All run brown with peat after rain and clear within the day.',
          'They run quick, and turn a number of mills.',
        ]
        : [
          'It is not navigable above the tide, but gives good water.',
          'Boats may be taken a little way up it on the flood.',
          'It runs brown with peat after rain and clears within the day.',
          'It runs quick, and turns a number of mills.',
        ])[tail]}`;
    }
    sections.push({ heading: 'Waters', text });
  }

  // --- Towns ---------------------------------------------------------------
  {
    const river = capital.river >= 0 && rivers[capital.river].name ? rivers[capital.river] : null;
    let text = `${capital.name}, the chief place, stands ${whereabouts(capital)}`;
    if (river) text += capital.coastal ? `, at the mouth of ${riverRef(river)},` : `, on ${riverRef(river)},`;
    text += ` and holds some ${number(capital.population)} souls.`;
    const others = towns.slice(1).filter((t) => t.rank === 'town');
    const villages = towns.filter((t) => t.rank === 'village');
    const entry = (t) => `${t.name} (${number(t.population)}) ${whereabouts(t)}`;
    if (others.length === 1) text += ` The only other town is ${entry(others[0])}.`;
    else if (others.length > 1) text += ` The other towns are ${list(others.map(entry))}.`;
    if (villages.length === 1) text += ` ${villages[0].name}, ${whereabouts(villages[0])}, is a village of ${number(villages[0].population)}.`;
    else if (villages.length > 1) text += ` ${capitalise(list(villages.map((v) => v.name)))} are villages.`;
    const apart = towns.filter((t) => t.mass !== capital.mass);
    if (apart.length) {
      text += ` ${capitalise(list(apart.map((t) => t.name)))} ${apart.length > 1 ? 'lie' : 'lies'} across the water from ${capital.name} and ${apart.length > 1 ? 'are' : 'is'} reached only by boat.`;
    } else if (towns.length > 2) {
      text += ' A cart road joins them all.';
    }
    text += ` The whole population is reckoned at about ${number(facts.population)}.`;
    sections.push({ heading: 'Towns', text });
  }

  // --- Livelihood ----------------------------------------------------------
  {
    const goods = ['fish'];
    if (facts.forest > 0.3) goods.push(rng.pick(['timber', 'charcoal', 'pitch and tar']));
    if (facts.mountain > 0.05) goods.push(rng.pick(['slate', 'copper', 'tin', 'building stone']));
    if (facts.hill + facts.mountain > 0.3) goods.push(rng.pick(['wool', "goats' cheese", 'hides']));
    if (facts.marsh > 0.04) goods.push(rng.pick(['salt', 'eels', 'reed for thatch']));
    if (facts.forest + facts.hill + facts.mountain < 0.45) goods.push(rng.pick(['barley', 'flax', 'salt beef']));
    const local = rng.shuffle(PRODUCE[island.flavour].slice());
    const mine = sites.find((s) => s.kind === 'mine');
    let text = `The people live by ${list(goods.slice(0, 4))}. ${capitalise(local[0])} and ${local[1]} are sent abroad`;
    text += capital.coastal ? `, chiefly through ${capital.name}.` : '.';
    if (mine) text += ` The workings at ${mine.full}, ${inThe(mine.quarter)}, are ${rng.pick(['still busy', 'lately reopened', 'nearly worked out'])}.`;
    text += ` ${rng.pick(CUSTOMS)}`;
    sections.push({ heading: 'Livelihood', text });
  }

  // --- For the mariner -----------------------------------------------------
  {
    const parts = [];
    const bay = bays[0];
    const depth = rng.int(4, 12);
    const bottom = rng.pick(BOTTOMS);
    if (bay) {
      const open = bay.quarter === 'middle' ? null : bay.quarter;
      parts.push(
        `The best anchorage is in ${bay.full}${open ? `, on the ${open} side` : ''}, in ${depth} fathoms, ${bottom}` +
        (open ? `; it is open only to winds from the ${open}.` : ', and sheltered from most winds.'),
      );
    } else if (capital.coastal) {
      parts.push(`There is no sheltered bay; vessels lie off ${capital.name} in ${depth} fathoms, ${bottom}, and must be ready to weigh if the wind comes onshore.`);
    }
    const cape = capes[0];
    if (cape) {
      parts.push(
        `${capitalise(cape.full)}, ${cape.quarter === 'middle' ? 'a bold headland' : `the ${cape.quarter} extremity`}, should be given a berth of ${rng.pick(['half a mile', 'a mile', 'two miles'])}, ${rng.pick([
          'for the race that sets round it on the ebb',
          'for a reef that runs out under water',
          'for the squalls that come down off the high ground',
          'for sunken rocks lying off it',
        ])}.`,
      );
    }
    const light = sites.find((s) => s.kind === 'light');
    if (light) parts.push(`A light is shown from ${light.full}${light.quarter === 'middle' ? '' : ` on the ${light.quarter} shore`}, ${rng.pick(['visible four leagues', 'visible three leagues', 'though it is not to be relied on in thick weather'])}.`);
    const wreck = sites.find((s) => s.kind === 'wreck');
    if (wreck) {
      const ship = wreck.name.replace('Wreck of ', '');
      parts.push(`${capitalise(ship)} was lost ${wreck.quarter === 'middle' ? 'close inshore' : `off the ${wreck.quarter} shore`} in ${rng.int(1688, 1794)}; her ribs still show at low water.`);
    }
    parts.push(`The tide rises ${rng.int(3, 18)} feet at springs.`);
    sections.push({ heading: 'For the mariner', text: parts.join(' ') });
  }

  // --- Curiosities ---------------------------------------------------------
  {
    const parts = [];
    for (const s of sites) {
      const where = inThe(s.quarter);
      if (s.kind === 'ruin') {
        parts.push(`Of ${s.full.replace(/^Ruins of /, '')}, ${where}, only the walls stand; ${rng.pick([
          'the islanders quarry it for their byres',
          'jackdaws have the tower',
          'no one now living remembers it roofed',
          'a fair is still held within them once a year',
        ])}.`);
      } else if (s.kind === 'stones') {
        parts.push(`${capitalise(s.full)}, ${where}, ${/Barrow$/.test(s.name) ? 'is an old burial mound' : /Ring$/.test(s.name) ? 'is a circle of standing stones' : 'are a ring of standing stones'}; ${rng.pick([
          'the islanders will not pass that way after dark',
          'it is said that no two people count the stones alike',
          'they are said to have been dancers who kept at it into a holy day',
          'on the longest day the sun rises exactly between the two tallest',
        ])}.`);
      } else if (s.kind === 'hermitage') {
        parts.push(`${capitalise(s.full)}, ${where}, ${rng.pick([
          "is visited by the whole island on the saint's day",
          'has had no hermit these many years, but the door is kept mended',
          'is kept by one old man, who rings a bell in fog',
        ])}.`);
      } else if (s.kind === 'tower') {
        parts.push(`${capitalise(s.full)}, ${where}, ${rng.pick([
          'was raised against corsairs and never fired a shot',
          'mounts two guns, of which one is sound',
          'is now a store for nets',
        ])}.`);
      }
    }
    if (parts.length) sections.push({ heading: 'Curiosities', text: parts.join(' ') });
  }

  const top = peaks[0];
  const table = [
    ['Area', `${number(roundish(facts.areaSqMiles))} sq. miles`],
    ['Coastline', `${miles(facts.coastMiles)} miles`],
    ['Highest point', top ? `${top.name}, ${number(top.feet)} ft` : `${number(facts.peakFeet)} ft`],
    ['Chief town', capital.name],
    ['Population', number(facts.population)],
    ['Seed', island.seed],
  ];

  return { title: Name, subtitle: `in ${sea.full}`, table, sections };
}

/** Wrap text to a column width. */
function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/** The gazetteer entry as plain text, for a terminal. */
export function gazetteerText(island, width = 76) {
  const g = gazetteer(island);
  const out = [g.title.toUpperCase(), g.subtitle, '='.repeat(Math.max(g.title.length, g.subtitle.length)), ''];
  const pad = Math.max(...g.table.map(([k]) => k.length));
  for (const [k, v] of g.table) out.push(`${k.padEnd(pad)}  ${v}`);
  for (const s of g.sections) {
    out.push('', s.heading.toUpperCase(), wrap(s.text, width));
  }
  return out.join('\n');
}

/** Escape text for Markdown, so a seed like `*x*` or `a|b` reads as itself. */
const md = (text) => String(text).replace(/\s+/g, ' ').replace(/[\\`*_[\]<>|#~]/g, '\\$&');

/** A URL made safe to sit inside a Markdown link's parentheses. */
const mdUrl = (url) =>
  String(url).replace(/[()<>\s\\]/g, (c) => (c === '(' ? '%28' : c === ')' ? '%29' : encodeURIComponent(c)));

/**
 * The gazetteer entry as Markdown: one paragraph per line, facts as a list.
 * Give `link` (where this island can be opened with its chart) and the
 * closing line points there.
 */
export function gazetteerMarkdown(island, { link } = {}) {
  const g = gazetteer(island);
  const out = [`# ${md(g.title)}`, '', `*${md(g.subtitle)}*`, ''];
  for (const [k, v] of g.table) out.push(`- **${md(k)}:** ${md(v)}`);
  for (const s of g.sections) out.push('', `## ${md(s.heading)}`, '', md(s.text));
  const more = link ? ` [Open this entry with its chart](${mdUrl(link)}).` : '';
  out.push('', '---', '', `*An entry from the Isolario, a book of islands that do not exist.${more}*`, '');
  return out.join('\n');
}
