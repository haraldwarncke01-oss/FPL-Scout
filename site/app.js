const els = {
  search: document.querySelector('#search'), position: document.querySelector('#position'),
  team: document.querySelector('#team'), sort: document.querySelector('#sort'),
  players: document.querySelector('#players'), count: document.querySelector('#result-count'),
  more: document.querySelector('#show-more'), notice: document.querySelector('#notice'),
};
let snapshot;
let visibleLimit = 25;
const number = new Intl.NumberFormat('da-DK');
const decimal = new Intl.NumberFormat('da-DK', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 1 });

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function xgi90(player) {
  const xgi = numeric(player.xGI);
  return player.minutes >= 90 && xgi !== null ? xgi * 90 / player.minutes : null;
}

function cell(content, className = '') {
  const node = document.createElement('td');
  if (className) node.className = className;
  if (content instanceof Node) node.append(content);
  else node.textContent = content;
  return node;
}

function fixtureCell(player, teams) {
  const fixture = player.nextFixture;
  if (!fixture) return cell('—', 'muted');
  const opponent = teams.get(fixture.opponent);
  const wrapper = document.createElement('span');
  wrapper.className = 'fixture';
  const badge = document.createElement('span');
  const difficulty = numeric(fixture.difficulty);
  badge.className = `fixture-badge ${difficulty >= 4 ? 'hard' : difficulty === 3 ? 'medium' : ''}`;
  badge.textContent = opponent?.shortName ?? '—';
  const place = document.createElement('span');
  place.textContent = fixture.home ? '(H)' : '(U)';
  wrapper.append(badge, place);
  return cell(wrapper);
}

function playerRow(player, teams) {
  const row = document.createElement('tr');
  const label = document.createElement('span');
  label.className = 'player-name';
  label.textContent = player.name;
  const team = document.createElement('span');
  team.className = 'team-name';
  team.textContent = teams.get(player.teamId)?.name ?? 'Ukendt hold';
  const name = document.createElement('td');
  name.append(label, team);
  const position = document.createElement('span');
  position.className = 'position-pill';
  position.textContent = player.position;
  row.append(
    name, cell(position), cell(`£${decimal.format(player.price)}m`, 'numeric'),
    cell(number.format(player.points), 'numeric points'),
    cell(numeric(player.form) === null ? '—' : decimal.format(Number(player.form)), 'numeric'),
    cell(xgi90(player) === null ? '—' : decimal.format(xgi90(player)), 'numeric'),
    cell(numeric(player.ownership) === null ? '—' : `${percent.format(Number(player.ownership))}%`, 'numeric'),
    fixtureCell(player, teams),
  );
  return row;
}

function render() {
  if (!snapshot) return;
  const query = els.search.value.trim().toLocaleLowerCase('da-DK');
  const teams = new Map(snapshot.teams.map(team => [team.id, team]));
  const sort = els.sort.value;
  const sortKeys = { points: player => numeric(player.points), xgi90, form: player => numeric(player.form), ownership: player => numeric(player.ownership), price: player => numeric(player.price) };
  const filtered = snapshot.players.filter(player =>
    (!query || player.name.toLocaleLowerCase('da-DK').includes(query) || (teams.get(player.teamId)?.name ?? '').toLocaleLowerCase('da-DK').includes(query)) &&
    (!els.position.value || player.position === els.position.value) &&
    (!els.team.value || String(player.teamId) === els.team.value)
  );
  filtered.sort((a, b) => sort === 'name'
    ? a.name.localeCompare(b.name, 'da')
    : ((sortKeys[sort](b) ?? -Infinity) - (sortKeys[sort](a) ?? -Infinity)) || a.name.localeCompare(b.name, 'da'));
  els.count.textContent = `${number.format(filtered.length)} spillere`;
  els.players.replaceChildren(...filtered.slice(0, visibleLimit).map(player => playerRow(player, teams)));
  if (!filtered.length) {
    const row = document.createElement('tr');
    const empty = cell('Ingen spillere matcher dine filtre. Prøv en anden søgning.', 'empty-cell');
    empty.colSpan = 8;
    row.append(empty);
    els.players.append(row);
  }
  els.more.hidden = filtered.length <= visibleLimit;
}

async function load() {
  try {
    const response = await fetch('./data/fpl.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.schemaVersion !== 1 || !Array.isArray(data.players) || !Array.isArray(data.teams)) throw new Error('Ugyldigt dataformat');
    snapshot = data;
    const updated = new Date(data.updatedAt);
    document.querySelector('#updated').textContent = Number.isNaN(updated.getTime()) ? 'Opdatering ukendt' : `Opdateret ${new Intl.DateTimeFormat('da-DK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Copenhagen' }).format(updated)}`;
    document.querySelector('#gameweek').textContent = data.nextGameweek ? `Næste kampuge ${data.nextGameweek}` : data.currentGameweek ? `Kampuge ${data.currentGameweek}` : 'Kampuge —';
    document.querySelector('#stat-players').textContent = number.format(data.players.length);
    document.querySelector('#stat-teams').textContent = number.format(data.teams.length);
    const leader = [...data.players].sort((a, b) => b.points - a.points)[0];
    document.querySelector('#stat-leader').textContent = leader?.name ?? '—';
    document.querySelector('#stat-leader-points').textContent = leader ? `${number.format(leader.points)} FPL-point` : 'flest FPL-point';
    for (const team of [...data.teams].sort((a, b) => a.name.localeCompare(b.name, 'da'))) {
      const option = document.createElement('option');
      option.value = team.id;
      option.textContent = team.name;
      els.team.append(option);
    }
    render();
  } catch (error) {
    els.players.replaceChildren();
    const row = document.createElement('tr');
    const empty = cell('Spillerdata kunne ikke indlæses. Prøv at opdatere siden senere.', 'empty-cell');
    empty.colSpan = 8;
    row.append(empty);
    els.players.append(row);
    els.notice.textContent = 'Data er ikke tilgængelige endnu. På en ny GitHub-side skal workflowet først gennemføres.';
    els.notice.hidden = false;
    console.error('FPL snapshot could not be loaded:', error);
  }
}

for (const control of [els.search, els.position, els.team, els.sort]) {
  control.addEventListener(control === els.search ? 'input' : 'change', () => { visibleLimit = 25; render(); });
}
els.more.addEventListener('click', () => { visibleLimit += 25; render(); });
load();
