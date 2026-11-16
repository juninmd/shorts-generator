// Draft an episode script from the IBGE data alone: every number on screen comes from data/<code>.json.
// usage: node scripts/draft-episode.mjs <ibge-code> [--episode 1] [--force]   ->   episodes/<code>.json
// The draft is editable: reword narration, add `timeline` scenes from the IBGE history text, reorder.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const args = process.argv.slice(2);
const code = args[0];
const episode = args.includes('--episode') ? Number(args[args.indexOf('--episode') + 1]) || 1 : 1;
const out = join(ROOT, 'episodes', `${code}.json`);
if (!args.includes('--force') && await access(out).then(() => true, () => false)) {
  console.error(`${out} already exists (edited by hand?). Pass --force to overwrite.`);
  process.exit(1);
}
const d = JSON.parse(await readFile(join(ROOT, 'data', `${code}.json`), 'utf8'));

const int = n => Math.round(n).toLocaleString('pt-BR');
const ORD = ['', 'primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'sétima', 'oitava', 'nona', 'décima'];
const ordF = n => ORD[n] ?? `${n}ª`;
const ordM = n => (ORD[n] ? ORD[n].replace(/a$/, 'o') : `${n}º`);
const money = v => (v >= 1e9 ? `${Math.floor(v / 1e9)} bilhões de reais` : `${Math.floor(v / 1e6)} milhões de reais`);

const p = d.population;
const ahead = p.top.slice(0, p.rank - 1).map(t => t.name);
const rankLine = p.rank === 1 ? 'É a cidade mais populosa do estado.'
  : p.rank <= 3 ? `É a ${ordF(p.rank)} cidade mais populosa do estado, atrás só de ${ahead.join(' e ')}.`
  : `É a ${ordF(p.rank)} mais populosa entre os ${p.of} municípios do estado.`;
const ratio = d.density.city / d.density.state;
const densLine = ratio >= 1.5 ? `${Math.round(ratio)} vezes a média do estado.`
  : ratio <= 0.67 ? `Bem abaixo da média do estado, que é de ${int(d.density.state)}.`
  : 'Bem perto da média do estado.';

const draft = {
  code,
  series: 'Raio-X das Cidades',
  episode,
  voice: 'pt-BR-AntonioNeural',
  scenes: [
    {
      type: 'map-intro',
      narration: `${d.name}, ${d.state.name}. Um raio-x da cidade em números oficiais.`,
      source: d.sources.mesh,
    },
    {
      type: 'counter',
      kicker: `Censo ${p.year}`,
      title: ['Quanta gente', 'mora aqui'],
      narration: `No Censo de ${p.year}, ${d.name} tinha ${int(p.value)} habitantes.`,
      source: d.sources.census,
      props: { to: p.value, unit: 'habitantes', chip: `Censo ${p.year}`, cue: int(p.value) },
    },
    {
      type: 'rank-bars',
      kicker: `${p.rank}º de ${p.of}`,
      title: ['As maiores', `de ${d.state.code}`],
      narration: rankLine,
      source: d.sources.census,
      props: { rows: p.top, rank: p.rank, of: p.of, selfValue: p.value },
    },
    {
      type: 'density',
      kicker: 'Densidade',
      title: ['Gente por', 'quilômetro'],
      narration: `São cerca de ${int(d.density.city)} habitantes por quilômetro quadrado. ${densLine}`,
      source: d.sources.census,
      props: { city: d.density.city, state: d.density.state, cityLabel: d.name, stateLabel: `Média de ${d.state.code}` },
    },
    {
      type: 'counter',
      kicker: `PIB ${d.gdp.year}`,
      title: ['Quanto a', 'cidade produz'],
      narration: `E a economia? O PIB passou de ${money(d.gdp.value)} em ${d.gdp.year}, o ${ordM(d.gdp.rank)} maior do estado.`,
      source: d.sources.gdp,
      props: { to: d.gdp.value / 1e9, decimals: 2, prefix: 'R$', unit: 'bilhões', chip: `${d.gdp.rank}º PIB de ${d.state.code}`, cue: String(Math.floor(d.gdp.value / 1e9)) },
    },
    {
      type: 'outro',
      narration: 'Qual cidade você quer ver no próximo raio-x? Comenta aí.',
      source: 'Fonte de todos os números: IBGE',
    },
  ],
};

await mkdir(join(ROOT, 'episodes'), { recursive: true });
await writeFile(out, `${JSON.stringify(draft, null, 2)}\n`);
console.error(`draft: ${out} (${draft.scenes.length} scenes)`);
