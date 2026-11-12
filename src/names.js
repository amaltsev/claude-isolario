// Names. Each island speaks one invented tongue: a flavour of phonology,
// thinned to a subset of its sounds so no two islands talk quite alike,
// plus the stock words its people use for rivers, capes, towns and the rest.
//
// In templates, % stands for a freshly coined root. A % that follows a
// letter is joined in lower case (Aber% -> Aberael); a leading "the" marks
// a name that takes the article in prose but drops it on the chart.

const FLAVOURS = {
  aelic: {
    onsets: ['l', 'n', 'r', 's', 'm', 'v', 'th', 'f', 'h', 'd', 't', 'br', 'gl', 'c', 'll', 'gw', 'cr', 'b', 'dr'],
    nuclei: ['a', 'e', 'i', 'o', 'ae', 'ei', 'y', 'ia', 'u', 'wy'],
    codas: ['n', 'r', 'l', 's', 'th', 'nn', 'rn', 'd', 'm', 'ch'],
    codaChance: 0.4,
    finalCodaChance: 0.75,
    emptyOnset: 0.18,
    syllables: [[1, 3], [2, 5], [3, 1]],
    words: {
      island: ['Inis %', '%', 'Isle of %', 'Ynys %'],
      river: ['River %', 'Afon %', 'the % Water'],
      peak: ['Ben %', 'Carn %', 'Mount %', 'Slieve %'],
      hill: ['% Down', 'Knock%', 'Bryn %'],
      cape: ['% Head', 'Pen %', 'Cape %', 'Rinn %'],
      bay: ['% Bay', 'Cuan %', 'Loch %'],
      lake: ['Loch %', 'Llyn %', 'Lough %'],
      port: ['Port %', '%', 'Dun %', 'Bally%', 'Kil%', 'Caer %', 'Tre%'],
      town: ['%', 'Llan%', 'Bally%', 'Rath %', 'Kil%', 'Tre%'],
      mouth: ['Aber%', 'Inver%'],
      wood: ['Coed %', '% Wood', 'the Forest of %'],
      marsh: ['% Moss', 'the % Fens', 'Cors %'],
      sea: ['Sea of %', 'the % Sound', 'Muir %', 'the % Deeps'],
    },
  },
  norn: {
    onsets: ['sk', 'st', 'h', 'k', 'g', 'v', 'b', 'd', 't', 'f', 'th', 'r', 'n', 'm', 'hr', 'br', 'gr', 'sv', 'fl', 'tr', 'l'],
    nuclei: ['a', 'o', 'u', 'e', 'i', 'y', 'ei', 'au', 'ö', 'å'],
    codas: ['r', 'rn', 'ld', 'k', 'g', 'n', 'm', 'st', 'lf', 'rd', 'nd', 'rk', 'l'],
    codaChance: 0.5,
    finalCodaChance: 0.85,
    emptyOnset: 0.12,
    syllables: [[1, 5], [2, 4]],
    words: {
      island: ['%ey', '%holm', 'Isle of %', '%'],
      river: ['River %', '% Water', '%elv'],
      peak: ['%fjell', '%tind', 'Mount %', '%horn'],
      hill: ['%haug', '% Fell', '%berg'],
      cape: ['%ness', 'Cape %', '%odde', '% Skaw'],
      bay: ['%vik', '% Bay', '%fjord', '% Voe'],
      lake: ['%vatn', 'Lake %', '% Mere'],
      port: ['%vik', '%havn', '%by', '%stad', '%', '%wick', '%sund'],
      town: ['%by', '%stad', '%thorpe', '%dal', '%', '%garth'],
      mouth: ['%os', '%mouth'],
      wood: ['%skog', '% Wood', '%lund'],
      marsh: ['%myr', '% Moss'],
      sea: ['%hav', 'the % Sound', 'Sea of %', 'the % Deeps'],
    },
  },
  meridian: {
    onsets: ['c', 'm', 'p', 'v', 't', 's', 'l', 'r', 'b', 'd', 'f', 'g', 'z', 'n', 'br', 'tr', 'gr', 'pr'],
    nuclei: ['a', 'o', 'e', 'i', 'u', 'ia', 'io'],
    codas: ['n', 'r', 'l', 's'],
    codaChance: 0.25,
    finalCodaChance: 0,
    emptyOnset: 0.15,
    syllables: [[2, 5], [3, 4]],
    endings: ['a', 'o', 'a', 'o', 'ia', 'ino', 'ara', 'etta', 'ona', 'eo', 'ano', 'ese'],
    words: {
      island: ['Isola %', '%', 'Isla %'],
      river: ['Rio %', 'River %', 'Fiume %'],
      peak: ['Monte %', 'Pico %', 'Mount %', 'Serra %'],
      hill: ['Colle %', 'Poggio %'],
      cape: ['Capo %', 'Punta %', 'Cape %'],
      bay: ['Baia di %', 'Golfo di %', 'Cala %'],
      lake: ['Lago %', 'Lago di %'],
      port: ['Porto %', '%', 'Santa %', 'San %', 'Marina di %', 'Villa %'],
      town: ['%', 'Castel %', 'San %', 'Borgo %', 'Torre %'],
      mouth: ['Bocca di %', 'Foce %'],
      wood: ['Bosco %', 'Selva %'],
      marsh: ['Palude %', 'Salina %'],
      sea: ['Mare %', 'Mar di %', 'the % Sea', 'Golfo %'],
    },
  },
  karst: {
    onsets: ['k', 'z', 'v', 'd', 'g', 'b', 'm', 'n', 'r', 'st', 'kr', 'dr', 'zh', 'sh', 'br', 'vl', 't', 's', 'p', 'l', 'sl', 'gr'],
    nuclei: ['a', 'o', 'e', 'i', 'u'],
    codas: ['k', 'n', 'v', 'r', 'sk', 'sh', 't', 'z', 'm', 'l', 'd'],
    codaChance: 0.35,
    finalCodaChance: 0.8,
    emptyOnset: 0.1,
    syllables: [[1, 3], [2, 5]],
    words: {
      island: ['Ostrov %', '%', '% Island'],
      river: ['% Reka', 'River %'],
      peak: ['% Gora', 'Mount %', '% Vrh', 'Velika %'],
      hill: ['% Brdo', '% Hill'],
      cape: ['Rt %', 'Cape %', '% Nos'],
      bay: ['Zaliv %', '% Bay', 'Uvala %'],
      lake: ['% Jezero', 'Lake %'],
      port: ['%grad', '%', '%ovo', 'Novi %', '%ica', 'Stari %', '%sk'],
      town: ['%ovo', '%ica', '%grad', '%', '%ik', '%ovac'],
      mouth: ['Ust-%', 'Usti %'],
      wood: ['% Les', '% Wood', '% Gaj'],
      marsh: ['% Blato', 'the % Mire'],
      sea: ['% More', 'the % Sea', 'Sea of %'],
    },
  },
  polyn: {
    onsets: ['k', 'h', 'l', 'm', 'n', 'p', 't', 'w', 'r', 'v', 'f'],
    nuclei: ['a', 'e', 'i', 'o', 'u', 'ai', 'au', 'oa', 'ua', 'ei'],
    codas: [],
    codaChance: 0,
    finalCodaChance: 0,
    emptyOnset: 0.25,
    syllables: [[2, 4], [3, 5], [4, 1]],
    words: {
      island: ['%', 'Motu %', '% Atoll'],
      river: ['Wai%', '% Stream', 'River %'],
      peak: ['Mauna %', 'Mount %', 'Puu %'],
      hill: ['Puu %', '% Hill'],
      cape: ['Lae %', '% Point', 'Cape %'],
      bay: ['% Bay', 'Hana%', '% Lagoon'],
      lake: ['Roto %', 'Lake %'],
      port: ['%', 'Hana%', '% Landing', 'Port %'],
      town: ['%', 'Kai%', '% Village'],
      mouth: ['Waha%', 'Nuku%'],
      wood: ['Wao %', '% Forest'],
      marsh: ['Repo %', '% Swamp'],
      sea: ['Moana %', 'the % Sea', 'the % Passage'],
    },
  },
  saxon: {
    onsets: ['b', 'br', 'c', 'cr', 'd', 'dr', 'f', 'g', 'gr', 'h', 'l', 'm', 'n', 'p', 'r', 's', 'st', 't', 'th', 'w', 'wh', 'sh'],
    nuclei: ['a', 'e', 'i', 'o', 'u', 'y', 'ea', 'ai', 'ow', 'oo'],
    codas: ['n', 'r', 'l', 'm', 'ck', 'th', 'sh', 'rn', 'ld', 'st', 'ng', 'x', 'd', 't', 'rk', 'll'],
    codaChance: 0.3,
    finalCodaChance: 0.95,
    emptyOnset: 0.14,
    syllables: [[1, 7], [2, 1]],
    words: {
      island: ['%sey', 'Isle of %', '% Island', '%holm', 'Great %'],
      river: ['River %', '% Water', 'the % Brook'],
      peak: ['Mount %', '% Pike', '% Tor', '% Beacon', '% Crag'],
      hill: ['% Down', '% Hill', '% Knoll', '% Tor'],
      cape: ['% Head', '% Point', 'Cape %', '% Ness', '% Bill'],
      bay: ['% Bay', '% Cove', '% Haven', '% Roads'],
      lake: ['% Mere', '% Water', 'Lake %', '% Tarn'],
      port: ['%haven', '%port', '% Quay', '%wick', '%ton', '%by', 'Port %', '%combe', '% Regis', '%stow', '%ham'],
      town: ['%ton', '%ham', '%ford', '%wick', '%stead', '%bury', '%field', '% Cross', 'Market %', '%thorpe'],
      mouth: ['%mouth'],
      wood: ['% Wood', '% Forest', '% Chase', '%wood'],
      marsh: ['% Fen', '% Marsh', '% Levels', 'the % Moss'],
      sea: ['the % Sea', 'the % Channel', '% Sound', 'the % Deeps', 'the % Roads'],
    },
  },
};

export const FLAVOUR_NAMES = Object.keys(FLAVOURS);

const VOWELS = 'aeiouyöåw';
const BLOCKED = [
  'fuck', 'shit', 'cunt', 'dick', 'cock', 'piss', 'arse', 'anus', 'tit', 'fag', 'nig', 'rape',
  'slut', 'twat', 'wank', 'cum', 'poo', 'pee', 'ass', 'sex', 'nazi', 'kkk', 'damn', 'turd',
  'whor', 'porn', 'crap', 'dung', 'puke', 'kill', 'dead', 'die',
];

const SHIPS = [
  'Marigold', 'Prudence', 'Albatross', 'Good Intent', 'Halcyon', 'Sparrowhawk', 'Constance',
  'Lady Maud', 'Tern', 'Perseverance', 'Morning Star', 'Three Brothers', 'Unity', 'Sea Holly',
  'Petrel', 'Fair Wind', 'Amity', 'Black Swan', 'Wanderer', 'Rosalind',
];
const COUNTS = ['Three', 'Five', 'Seven', 'Nine', 'Twelve'];
const KINDRED = ['Sisters', 'Watchers', 'Sleepers', 'Brothers', 'Maidens', 'Pipers', 'Judges', 'Widows'];

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Thin a list to a random subset. Lists run from common sounds to rare, so
 * weight falls with position; clusters are rarer still, and each island
 * jitters the weights to get an accent of its own.
 */
function inventory(rng, list, keep) {
  const weighted = list.map((item, position) => [
    item,
    (rng.range(0.35, 1.65) * (item.length > 1 ? 0.45 : 1)) / (position + 4),
  ]);
  const count = Math.max(3, Math.round(list.length * keep));
  return rng.shuffle(weighted).slice(0, count);
}

export function makeLanguage(rng, flavourName = rng.pick(FLAVOUR_NAMES)) {
  const f = FLAVOURS[flavourName];
  const onsets = inventory(rng, f.onsets, 0.62);
  const nuclei = inventory(rng, f.nuclei, 0.65);
  const codas = f.codas.length ? inventory(rng, f.codas, 0.6) : [];
  const usedRoots = new Set();
  const usedNames = new Set();
  const usedTemplates = new Map();

  const stockWords = new Set();
  for (const templates of Object.values(f.words)) {
    for (const t of templates) for (const w of t.toLowerCase().match(/[a-zöå]+/g) ?? []) stockWords.add(w);
  }

  const syllable = (first, last) => {
    const onset = first && rng.chance(f.emptyOnset) ? '' : rng.weighted(onsets);
    const nucleus = rng.weighted(nuclei);
    const coda = codas.length && rng.chance(last ? f.finalCodaChance : f.codaChance) ? rng.weighted(codas) : '';
    return [onset + nucleus, coda];
  };

  const acceptable = (word, maxLength) => {
    if (word.length < 3 || word.length > maxLength || stockWords.has(word)) return false;
    if (/[^aeiouyöåw]{4,}/.test(word)) return false;
    if (/(.)\1\1/.test(word) || /[aeiouyöå]{3,}/.test(word)) return false;
    if (/(..)\1\1/.test(word)) return false;
    if (/^(.{2,3})\1/.test(word) && flavourName !== 'polyn') return false;
    if (!/[aeiouyöå]/.test(word)) return false;
    const plain = word.replace(/ö/g, 'o').replace(/å/g, 'a');
    if (BLOCKED.some((b) => plain.includes(b))) return false;
    for (const used of usedRoots) {
      if (used.slice(0, 3) === word.slice(0, 3)) return false;
    }
    return true;
  };

  /** Coin a new root, unlike any this island has used before. */
  const root = (maxLength = 8) => {
    for (let attempt = 0; attempt < 400; attempt++) {
      let count = rng.weighted(f.syllables);
      if (attempt > 300) count++;
      let word = '';
      let echo = false;
      const heads = new Set();
      for (let k = 0; k < count; k++) {
        const [head, coda] = syllable(k === 0, k === count - 1);
        if (heads.has(head)) echo = true;
        heads.add(head);
        word += head + coda;
      }
      // Only the open-syllabled tongue is allowed to stutter (Fafa, Lulu).
      if (echo && flavourName !== 'polyn') continue;
      if (f.endings && rng.chance(0.55)) {
        word = word.replace(/[aeiou]+$/, '') + rng.pick(f.endings);
      }
      if (!acceptable(word, attempt > 300 ? 12 : maxLength) && attempt < 399) continue;
      usedRoots.add(word);
      return capitalise(word);
    }
    return 'Nemo';
  };

  const fill = (template, rootWord) => {
    let article = false;
    let text = template;
    if (text.startsWith('the ')) {
      article = true;
      text = text.slice(4);
    }
    const at = text.indexOf('%');
    const joined = at > 0 && /[A-Za-z]/.test(text[at - 1]);
    const suffixed = at + 1 < text.length && /[a-z]/.test(text[at + 1]);
    let piece = joined ? rootWord.toLowerCase() : rootWord;
    let before = text.slice(0, at);
    let after = text.slice(at + 1);
    if (joined) {
      // Aber + ael, not Aber + rael: avoid doubling across the join.
      const lastChar = before[before.length - 1].toLowerCase();
      if (piece[0] === lastChar) piece = piece.slice(1);
      if (VOWELS.includes(lastChar) && VOWELS.includes(piece[0]) && before.length > 3) before = before.slice(0, -1);
    }
    if (suffixed) {
      const lastChar = piece[piece.length - 1];
      if (after[0] === lastChar) after = after.slice(1);
      else if (VOWELS.includes(lastChar) && VOWELS.includes(after[0]) && lastChar !== 'w') piece = piece.slice(0, -1);
    }
    return { name: before + piece + after, article };
  };

  /**
   * Name a feature of the given kind. Pass `fromRoot` to derive the name
   * from an existing root (a town at a river mouth takes the river's).
   */
  const place = (kind, fromRoot = null) => {
    const templates = f.words[kind];
    const seen = usedTemplates.get(kind) ?? new Map();
    usedTemplates.set(kind, seen);
    for (let attempt = 0; attempt < 60; attempt++) {
      // Favour stock words this island has not yet leaned on.
      const template = rng.weighted(templates.map((t) => [t, 1 / (1 + 3 * (seen.get(t) ?? 0))]));
      // Roots that get welded to a stock word should be short.
      const welded = /[A-Za-z]%|%[a-z]/.test(template);
      const rootWord = fromRoot ?? root(welded ? 6 : 8);
      const { name, article } = fill(template, rootWord);
      if (usedNames.has(name) || name.length > 22) {
        if (!fromRoot) usedRoots.delete(rootWord.toLowerCase());
        continue;
      }
      usedNames.add(name);
      seen.set(template, (seen.get(template) ?? 0) + 1);
      return { name, root: rootWord, article, full: article ? `the ${name}` : name };
    }
    const fallback = fromRoot ?? root();
    return { name: fallback, root: fallback, article: false, full: fallback };
  };

  /** Names for curiosities, which lean on plain English around a root. */
  const site = (kind) => {
    const r = () => root(7);
    let text;
    switch (kind) {
      case 'light':
        text = rng.pick(['the % Light', '% Beacon', 'the Old Light', '% Lantern']);
        break;
      case 'ruin':
        text = rng.pick(['Ruins of %', '% Abbey', 'Old %', '% Priory', 'the % Keep']);
        break;
      case 'stones':
        text = rng.chance(0.6)
          ? `the ${rng.pick(COUNTS)} ${rng.pick(KINDRED)}`
          : rng.pick(['the % Stones', 'the % Ring', '% Barrow']);
        break;
      case 'hermitage':
        text = rng.pick(["St %'s Cell", 'Hermitage of St %', "St %'s Well", "St %'s Chapel"]);
        break;
      case 'wreck':
        text = `Wreck of the ${rng.pick(SHIPS)}`;
        break;
      case 'tower':
        text = rng.pick(['% Tower', 'the % Watch', 'Fort %']);
        break;
      case 'mine':
        text = rng.pick(['% Mine', 'the % Workings', '% Quarry']);
        break;
      default:
        text = '%';
    }
    let article = false;
    if (text.startsWith('the ')) {
      article = true;
      text = text.slice(4);
    }
    const name = text.includes('%') ? text.replace('%', r()) : text;
    if (usedNames.has(name)) return site(kind);
    usedNames.add(name);
    return { name, root: null, article, full: article ? `the ${name}` : name };
  };

  return { flavour: flavourName, root, place, site };
}
