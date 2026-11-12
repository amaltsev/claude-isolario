// Seeds for when nobody supplies one: two words, easy to say and to share.

const FIRST = [
  'amber', 'ashen', 'bright', 'cold', 'copper', 'drowned', 'early', 'far', 'fallow', 'gilded',
  'green', 'grey', 'hollow', 'idle', 'iron', 'last', 'late', 'lone', 'low', 'mild', 'north',
  'old', 'pale', 'quiet', 'red', 'salt', 'silver', 'slow', 'small', 'still', 'tall', 'thin',
  'tidal', 'white', 'wide', 'wild', 'winter', 'young',
];
const SECOND = [
  'anchor', 'beacon', 'bell', 'cairn', 'candle', 'compass', 'cormorant', 'current', 'ember',
  'ferry', 'gannet', 'harbour', 'heron', 'kelp', 'lantern', 'ledger', 'mackerel', 'mooring',
  'oar', 'osprey', 'pilot', 'plover', 'quay', 'reef', 'rudder', 'sail', 'sextant', 'shoal',
  'skerry', 'sounding', 'spar', 'squall', 'tern', 'tide', 'tiller', 'wake', 'whimbrel', 'wreck',
];

/** A fresh seed such as "salt-heron". Pass a 0..1 source to make it repeatable. */
export function randomSeed(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  return `${pick(FIRST)}-${pick(SECOND)}`;
}
