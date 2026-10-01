/* Pure scouting calculations shared by the page and the lightweight tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FPLAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MIN_MINUTES = 270;
  const number = value => value === null || value === undefined || value === '' ? null : Number(value);
  const per90 = (player, field) => player.minutes >= 90 && Number.isFinite(number(player[field]))
    ? number(player[field]) * 90 / player.minutes : null;
  const points90 = player => per90(player, 'points');
  const xgi90 = player => per90(player, 'xGI');
  const actualGI90 = player => player.minutes >= 90 ? ((Number(player.goals) || 0) + (Number(player.assists) || 0)) * 90 / player.minutes : null;

  // Scale each feature so one raw unit does not dominate the distance.
  const FEATURES = {
    GKP: [['saves', 1.8], ['xGC', 1.0]],
    DEF: [['xG', 0.12], ['xA', 0.14], ['xGC', 1.0], ['defCon', 3.0]],
    MID: [['xG', 0.32], ['xA', 0.28]],
    FWD: [['xG', 0.45], ['xA', 0.24]],
  };

  function distance(a, b) {
    const features = FEATURES[a.position] || FEATURES.MID;
    let sum = 0;
    for (const [field, scale] of features) {
      const left = per90(a, field);
      const right = per90(b, field);
      if (left === null || right === null) return Infinity;
      sum += Math.pow(Math.min(Math.abs(left - right) / scale, 5), 2);
    }
    return Math.sqrt(sum / features.length);
  }

  function scoutPlayers(players) {
    const pool = players.filter(player => player.minutes >= MIN_MINUTES && Number.isFinite(points90(player)));
    const byPosition = new Map();
    for (const player of pool) {
      if (!byPosition.has(player.position)) byPosition.set(player.position, []);
      byPosition.get(player.position).push(player);
    }
    return new Map(players.map(player => {
      if (player.minutes < MIN_MINUTES) return [player.id, { eligible: false, peers: [], peerGap: null, finishingGap: null }];
      const nearest = (byPosition.get(player.position) || [])
        .filter(other => other.id !== player.id)
        .map(other => ({ player: other, distance: distance(player, other) }))
        .filter(item => Number.isFinite(item.distance))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);
      const comparable = nearest.filter(item => item.distance <= 2.25);
      const baseline = comparable.length >= 3
        ? comparable.reduce((sum, item) => sum + points90(item.player), 0) / comparable.length : null;
      const xgi = xgi90(player);
      const actual = actualGI90(player);
      return [player.id, {
        eligible: baseline !== null,
        peers: comparable.map(item => ({ id: item.player.id, name: item.player.name, points90: points90(item.player), distance: item.distance })),
        peerGap: baseline === null ? null : baseline - points90(player),
        peerPoints90: baseline,
        finishingGap: xgi === null || actual === null ? null : xgi - actual,
      }];
    }));
  }

  function teamRecord(matches, teamName, venue, limit = 10) {
    const selected = matches.filter(match => venue === 'home' ? match.home === teamName : match.away === teamName)
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
    const goals = selected.map(match => venue === 'home'
      ? [match.homeGoals, match.awayGoals] : [match.awayGoals, match.homeGoals]);
    const played = goals.length;
    return {
      played,
      wins: goals.filter(([scored, conceded]) => scored > conceded).length,
      cleanSheets: goals.filter(([, conceded]) => conceded === 0).length,
      scored: goals.reduce((sum, [scored]) => sum + scored, 0),
      conceded: goals.reduce((sum, [, conceded]) => sum + conceded, 0),
      scoredPerMatch: played ? goals.reduce((sum, [scored]) => sum + scored, 0) / played : null,
      concededPerMatch: played ? goals.reduce((sum, [, conceded]) => sum + conceded, 0) / played : null,
      matches: selected,
    };
  }

  function headToHead(matches, teamName, opponentName, limit = 6) {
    const selected = matches.filter(match =>
      (match.home === teamName && match.away === opponentName) ||
      (match.away === teamName && match.home === opponentName)
    ).sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
    return {
      played: selected.length,
      teamGoals: selected.reduce((sum, match) => sum + (match.home === teamName ? match.homeGoals : match.awayGoals), 0),
      opponentGoals: selected.reduce((sum, match) => sum + (match.home === teamName ? match.awayGoals : match.homeGoals), 0),
      matches: selected,
    };
  }

  return { MIN_MINUTES, per90, points90, xgi90, actualGI90, distance, scoutPlayers, teamRecord, headToHead };
});
