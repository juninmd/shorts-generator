// Fetch everything the episode needs from IBGE's public APIs (no key) for one municipality.
// usage: node scripts/fetch-city.mjs <ibge-code-7-digits>   ->   data/<code>.json
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectMesh } from './lib/mesh.mjs';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const API = 'https://servicodados.ibge.gov.br/api';
const code = process.argv[2];
if (!/^\d{7}$/.test(code ?? '')) {
  console.error('usage: node scripts/fetch-city.mjs <ibge-code-7-digits>  (e.g. 3509502 = Campinas)');
  process.exit(2);
}
const uf = code.slice(0, 2);

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`IBGE ${res.status} for ${url}`);
  return res.json();
}

// SIDRA "agregados": one variable, every municipality of the state (or the state itself), latest period.
async function sidra(table, variable, period, level) {
  const where = level === 'state' ? `N3[${uf}]` : `N6[N3[${uf}]]`;
  const url = `${API}/v3/agregados/${table}/periodos/${period}/variaveis/${variable}?localidades=${encodeURIComponent(where)}`;
  const [v] = await get(url);
  const rows = v.resultados[0].series.map(s => {
    const [year, raw] = Object.entries(s.serie).at(-1);
    return { id: s.localidade.id, name: s.localidade.nome.replace(/ (- [A-Z]{2}|\([A-Z]{2}\))$/, ''), year: Number(year), value: Number(raw) };
  });
  return { rows: rows.filter(r => Number.isFinite(r.value)), url };
}

function ranked(rows) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const rank = sorted.findIndex(r => r.id === code) + 1;
  if (!rank) throw new Error(`municipality ${code} missing from an IBGE table`);
  return { ...sorted[rank - 1], rank, of: sorted.length, top: sorted.slice(0, 5).map(({ name, value, id }) => ({ name, value, self: id === code })) };
}

const meshUrl = `${API}/v3/malhas/estados/${uf}?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=municipio`;
const [info, pop, area, dens, pib, statePop, stateArea, history, mesh] = await Promise.all([
  get(`${API}/v1/localidades/municipios/${code}`),
  sidra(4714, 93, 2022, 'city'),
  sidra(4714, 6318, 2022, 'city'),
  sidra(4714, 614, 2022, 'city'),
  sidra(5938, 37, -1, 'city'),
  sidra(4714, 93, 2022, 'state'),
  sidra(4714, 6318, 2022, 'state'),
  get(`${API}/v1/biblioteca?aspas=3&codmun=${code.slice(0, 6)}`),
  get(meshUrl),
]);
if (!info?.id) throw new Error(`IBGE does not know municipality ${code}`);

const state = info.microrregiao.mesorregiao.UF;
const self = rows => rows.find(r => r.id === code);
const pibRank = ranked(pib.rows);
const data = {
  code,
  name: info.nome,
  state: { id: state.id, code: state.sigla, name: state.nome },
  municipalities: mesh.features.length,
  population: ranked(pop.rows),
  areaKm2: self(area.rows).value,
  density: { city: self(dens.rows).value, state: statePop.rows[0].value / stateArea.rows[0].value },
  gdp: { ...pibRank, value: pibRank.value * 1000, top: undefined }, // SIDRA unit is R$ 1,000
  history: (history[code]?.HISTORICO ?? '').replace(/\r\n/g, '\n').trim(),
  sources: {
    census: 'IBGE, Censo Demográfico 2022 (SIDRA tabela 4714)',
    gdp: `IBGE, PIB dos Municípios ${pibRank.year} (SIDRA tabela 5938)`,
    history: 'IBGE Cidades, histórico do município',
    mesh: 'IBGE, malha municipal',
    urls: [pop.url, pib.url, `${API}/v1/biblioteca?aspas=3&codmun=${code.slice(0, 6)}`, meshUrl],
  },
  map: projectMesh(mesh, code),
};

await mkdir(join(ROOT, 'data'), { recursive: true });
const out = join(ROOT, 'data', `${code}.json`);
await writeFile(out, `${JSON.stringify(data)}\n`);
console.error(`${data.name}/${data.state.code}: pop ${data.population.value} (#${data.population.rank}/${data.population.of}), ` +
  `PIB ${data.gdp.year} R$ ${data.gdp.value} (#${data.gdp.rank}), history ${data.history.length} chars -> ${out}`);
