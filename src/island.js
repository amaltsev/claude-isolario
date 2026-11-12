// The whole survey: seed in, island out. Each stage draws from its own fork
// of the seed, so stages stay independent and the result is reproducible.

import { Rng } from './rng.js';
import { buildTerrain } from './terrain.js';
import { contours, smooth, lineLength } from './contour.js';
import { drainage, traceRivers } from './hydrology.js';
import { buildFeatures, RELIEF_MOUNTAIN } from './features.js';
import { makeLanguage } from './names.js';
import { placeTowns, buildRoads, placeSites } from './settlements.js';

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

/** Eight-point bearing of (dx, dy), with y growing southward. */
export function bearing(dx, dy) {
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return COMPASS[((sector % 8) + 8) % 8];
}

/** Round to two significant figures, the precision of an honest estimate. */
export function roundish(value) {
  if (value < 10) return Math.max(1, Math.round(value));
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
}

export function generateIsland(seed, { size = 200 } = {}) {
  const rng = new Rng(seed);
  const terrain = buildTerrain(rng.fork('terrain'), { size });
  const { N, lake, milesPerCell } = terrain;
  const drains = drainage(terrain);
  const hydro = { ...drains, ...traceRivers(terrain, drains, rng.fork('rivers')) };
  const features = buildFeatures(terrain, hydro, rng.fork('features'));
  const towns = placeTowns(terrain, hydro, features, rng.fork('towns'));
  const { roads } = buildRoads(terrain, hydro, features, towns);
  const sites = placeSites(terrain, hydro, features, towns, rng.fork('sites'));
  const lang = makeLanguage(rng.fork('language'));

  // Coastline: loops in lattice units, each tagged as sea shore or lake shore.
  const coast = contours(terrain.h, N, 0).map((loop) => {
    const line = smooth(loop, 2);
    line.kind = lake[loop.cell[1]] ? 'lake' : 'sea';
    return line;
  });

  // Where the land lies, for bearings.
  const { landmass, land } = features;
  const mainId = landmass.sizes.indexOf(Math.max(...landmass.sizes));
  let cx = 0;
  let cy = 0;
  let cells = 0;
  for (let i = 0; i < N * N; i++) {
    if (land[i]) { cx += i % N; cy += Math.floor(i / N); cells++; }
  }
  cx /= cells;
  cy /= cells;
  const quarter = (p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return Math.hypot(dx, dy) < N * 0.07 ? 'middle' : bearing(dx, dy);
  };

  // Longest reach of the main island, and the way it trends.
  const mainCoast = coast.reduce((a, b) => (b.kind === 'sea' && b.length > a.length ? b : a), coast[0]);
  let span = { d: 0, a: mainCoast[0], b: mainCoast[0] };
  for (let i = 0; i < mainCoast.length; i += 6) {
    for (let j = i + 6; j < mainCoast.length; j += 6) {
      const d = Math.hypot(mainCoast[i][0] - mainCoast[j][0], mainCoast[i][1] - mainCoast[j][1]);
      if (d > span.d) span = { d, a: mainCoast[i], b: mainCoast[j] };
    }
  }

  // --- Names -------------------------------------------------------------
  const sortedMasses = landmass.sizes.slice().sort((a, b) => b - a);
  const scattered = sortedMasses.length >= 6 || (sortedMasses[1] ?? 0) > 0.35 * sortedMasses[0];
  let name;
  if (scattered) {
    const root = lang.root();
    const word = lang.flavour === 'polyn' && terrain.relief === 'lowland' ? 'Atolls' : lang.flavour === 'norn' ? 'Skerries' : 'Isles';
    name = { name: `${root} ${word}`, root, article: true, full: `the ${root} ${word}` };
  } else {
    name = lang.place('island');
  }
  const sea = lang.place('sea');

  const rivers = hydro.rivers.map((r, index) => ({
    ...r,
    index,
    lengthMiles: lineLength(r.points, false) * milesPerCell,
    mouthQuarter: quarter({ x: r.mouth[0], y: r.mouth[1] }),
    name: null,
  }));
  const mains = rivers.filter((r) => r.parent === -1).sort((a, b) => b.lengthMiles - a.lengthMiles);
  for (const r of mains.slice(0, 4)) {
    if (r.cells.length >= 13) r.name = lang.place('river');
  }

  const totalArea = terrain.landCells * milesPerCell ** 2;
  const density = rng.fork('people').range(7, 40) * (1 - 0.6 * features.fractions.mountain);
  const population = totalArea * density;
  const peopleRng = rng.fork('people');
  const shares = towns.map((t) => (t.rank === 'capital' ? 1 : t.rank === 'town' ? peopleRng.range(0.22, 0.5) : peopleRng.range(0.05, 0.14)));
  const urban = peopleRng.range(0.3, 0.5);
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const mouthTaken = new Set();
  const namedTowns = towns.map((t, k) => {
    const river = t.river >= 0 ? rivers[t.river] : null;
    let label;
    if (t.coastal && river?.name && !mouthTaken.has(river.index) && peopleRng.chance(0.6)) {
      mouthTaken.add(river.index);
      label = lang.place('mouth', river.name.root);
    } else {
      label = lang.place(t.coastal ? 'port' : 'town');
    }
    return {
      ...t,
      ...label,
      river: river ? river.index : -1,
      quarter: quarter(t),
      population: Math.max(40, roundish((population * urban * shares[k]) / shareSum)),
      onMain: t.mass === mainId,
    };
  });

  const peaks = features.summits.map((s, k) => {
    const mountain = features.relief[s.y * N + s.x] === RELIEF_MOUNTAIN;
    return { ...s, mountain, quarter: quarter(s), ...lang.place(mountain ? 'peak' : 'hill'), highest: k === 0 };
  });
  const capes = features.capes.slice(0, 2).map((c) => ({ ...c, quarter: quarter(c), ...lang.place('cape') }));
  const bays = features.bays.map((b) => ({ ...b, quarter: quarter(b), ...lang.place('bay') }));
  const wood = features.wood && { ...features.wood, quarter: quarter(features.wood), ...lang.place('wood') };
  const marsh = features.marsh && { ...features.marsh, quarter: quarter(features.marsh), ...lang.place('marsh') };
  const mere = features.mere && { ...features.mere, quarter: quarter(features.mere), ...lang.place('lake') };
  const namedSites = sites.map((s) => ({ ...s, quarter: quarter(s), ...lang.site(s.kind) }));

  const facts = {
    areaSqMiles: totalArea,
    coastMiles: coast.filter((c) => c.kind === 'sea').reduce((sum, c) => sum + lineLength(c), 0) * milesPerCell,
    lengthMiles: span.d * milesPerCell,
    trend: [bearing(span.a[0] - span.b[0], span.a[1] - span.b[1]), bearing(span.b[0] - span.a[0], span.b[1] - span.a[1])],
    peakFeet: peaks.length ? peaks[0].feet : terrain.peakFeet,
    landmasses: sortedMasses.length,
    islets: sortedMasses.length - 1,
    scattered,
    population: roundish(population),
    lakes: coast.filter((c) => c.kind === 'lake').length,
    ...features.fractions,
  };

  return {
    seed: String(seed),
    name,
    sea,
    flavour: lang.flavour,
    shape: terrain.shape,
    relief: terrain.relief,
    widthMiles: terrain.widthMiles,
    centre: { x: cx, y: cy },
    terrain,
    hydro,
    features,
    coast,
    rivers,
    towns: namedTowns,
    roads,
    sites: namedSites,
    peaks,
    capes,
    bays,
    wood,
    marsh,
    mere,
    facts,
  };
}

/** A plain-data summary of an island, safe to print as JSON. */
export function summarise(island) {
  const point = ({ name, x, y, quarter }) => ({ name, x: +(x / (island.terrain.N - 1)).toFixed(3), y: +(y / (island.terrain.N - 1)).toFixed(3), quarter });
  const round = (v) => Math.round(v * 10) / 10;
  return {
    seed: island.seed,
    name: island.name.full,
    sea: island.sea.full,
    language: island.flavour,
    shape: island.shape,
    relief: island.relief,
    sheetWidthMiles: island.widthMiles,
    areaSqMiles: round(island.facts.areaSqMiles),
    coastMiles: round(island.facts.coastMiles),
    lengthMiles: round(island.facts.lengthMiles),
    highestPointFeet: island.facts.peakFeet,
    population: island.facts.population,
    islets: island.facts.islets,
    lakes: island.facts.lakes,
    cover: {
      forest: +island.facts.forest.toFixed(3),
      marsh: +island.facts.marsh.toFixed(3),
      hill: +island.facts.hill.toFixed(3),
      mountain: +island.facts.mountain.toFixed(3),
    },
    towns: island.towns.map((t) => ({ ...point(t), rank: t.rank, population: t.population, coastal: t.coastal })),
    rivers: island.rivers.filter((r) => r.name).map((r) => ({ name: r.name.full, lengthMiles: round(r.lengthMiles), into: r.into })),
    peaks: island.peaks.map((p) => ({ ...point(p), feet: p.feet })),
    capes: island.capes.map(point),
    bays: island.bays.map(point),
    wood: island.wood ? point(island.wood) : null,
    marsh: island.marsh ? point(island.marsh) : null,
    lake: island.mere ? point(island.mere) : null,
    sites: island.sites.map((s) => ({ ...point(s), kind: s.kind })),
  };
}
