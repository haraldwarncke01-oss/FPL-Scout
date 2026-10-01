#!/usr/bin/env python3
"""Create the static, browser-friendly FPL snapshot used by GitHub Pages."""

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


API = "https://fantasy.premierleague.com/api"
HISTORY_URL = "https://raw.githubusercontent.com/openfootball/football.json/master/{season}/en.1.json"
OUTPUT = Path(__file__).resolve().parents[1] / "site" / "data" / "fpl.json"

TEAM_ALIASES = {
    "AFC Bournemouth": "Bournemouth", "Arsenal FC": "Arsenal",
    "Aston Villa FC": "Aston Villa", "Brentford FC": "Brentford",
    "Brighton & Hove Albion FC": "Brighton", "Chelsea FC": "Chelsea",
    "Coventry City FC": "Coventry City", "Crystal Palace FC": "Crystal Palace",
    "Everton FC": "Everton", "Fulham FC": "Fulham",
    "Hull City AFC": "Hull City", "Ipswich Town FC": "Ipswich Town",
    "Leeds United FC": "Leeds", "Liverpool FC": "Liverpool",
    "Manchester City FC": "Man City", "Manchester United FC": "Man Utd",
    "Newcastle United FC": "Newcastle", "Nottingham Forest FC": "Nott'm Forest",
    "Sunderland AFC": "Sunderland", "Tottenham Hotspur FC": "Spurs",
}


def get_json(endpoint):
    request = Request(
        f"{API}/{endpoint}/",
        headers={"Accept": "application/json", "User-Agent": "FPLScout/1.0 (GitHub Pages data snapshot)"},
    )
    for attempt in range(3):
        try:
            with urlopen(request, timeout=25) as response:
                return json.load(response)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def get_history(season):
    request = Request(HISTORY_URL.format(season=season), headers={"User-Agent": "FPLScout/2.0"})
    with urlopen(request, timeout=25) as response:
        return json.load(response)


def historical_matches(season, data):
    """Read completed OpenFootball matches; scores can be a list or an ft object."""
    matches = []
    for match in data.get("matches", []):
        score = match.get("score")
        final = score.get("ft") if isinstance(score, dict) else score
        if not isinstance(final, list) or len(final) != 2 or any(not isinstance(goal, int) for goal in final):
            continue
        matches.append({
            "season": season, "date": match["date"],
            "home": TEAM_ALIASES.get(match["team1"], match["team1"].removesuffix(" FC")),
            "away": TEAM_ALIASES.get(match["team2"], match["team2"].removesuffix(" FC")),
            "homeGoals": final[0], "awayGoals": final[1],
        })
    return matches


def current_matches(fixtures, teams, season):
    return [{
        "season": season, "date": fixture["kickoff_time"][:10],
        "home": teams[fixture["team_h"]]["name"],
        "away": teams[fixture["team_a"]]["name"],
        "homeGoals": fixture["team_h_score"], "awayGoals": fixture["team_a_score"],
    } for fixture in fixtures if fixture.get("finished") and fixture.get("kickoff_time")
        and fixture.get("team_h_score") is not None and fixture.get("team_a_score") is not None]


def next_fixtures(fixtures):
    """Find the first unfinished fixture for each team, including postponed games."""
    upcoming = [fixture for fixture in fixtures if not fixture.get("finished") and fixture.get("kickoff_time")]
    upcoming.sort(key=lambda fixture: fixture["kickoff_time"])
    by_team = {}
    for fixture in upcoming:
        for team_key, opponent_key, difficulty_key, home in (
            ("team_h", "team_a", "team_h_difficulty", True),
            ("team_a", "team_h", "team_a_difficulty", False),
        ):
            by_team.setdefault(fixture[team_key], {
                "opponent": fixture[opponent_key],
                "home": home,
                "difficulty": fixture.get(difficulty_key),
                "kickoff": fixture["kickoff_time"],
                "gameweek": fixture.get("event"),
            })
    return by_team


def player_minutes(player, fixtures, live):
    """Minutes per completed fixture, including DNP=0; missing live data stays unknown."""
    live = live or {}
    found = {}
    player_events = set()
    entries = {}
    for event_id, event in live.items():
        entry = next((row for row in event.get("elements", []) if row["id"] == player["id"]), None)
        if not entry:
            continue
        player_events.add(event_id)
        entries[event_id] = entry
        for explanation in entry.get("explain", []):
            stats = {row["identifier"]: row for row in explanation.get("stats", [])}
            minute_stat = stats.get("minutes", {})
            found[explanation["fixture"]] = {
                "minutes": minute_stat.get("value", 0),
                "points": sum(row.get("points", 0) for row in stats.values()),
                "dcPoints": stats.get("defensive_contribution", {}).get("points", 0),
                "savePoints": stats.get("saves", {}).get("points", 0),
                "appearancePoints": minute_stat.get("points", 0),
                "bonusPoints": stats.get("bonus", {}).get("points", 0),
            }
    joined = (player.get("team_join_date") or "")[:10]
    logs = []
    for fixture in fixtures:
        if not fixture.get("finished") or not fixture.get("kickoff_time"):
            continue
        own_team = player["team"] in (fixture["team_h"], fixture["team_a"])
        played = found.get(fixture["id"], {}).get("minutes", 0) > 0
        if not played and (not own_team or (joined and fixture["kickoff_time"][:10] < joined)):
            continue
        known = fixture.get("event") in player_events
        result = found.get(fixture["id"], {"minutes": 0, "points": 0, "dcPoints": 0, "savePoints": 0}) if known else {"minutes": None, "points": None}
        home = player["team"] == fixture["team_h"] if own_team else None
        logs.append({
            **result, "fixture": fixture["id"], "date": fixture["kickoff_time"], "gameweek": fixture.get("event"),
            "opponent": fixture["team_a"] if home else fixture["team_h"] if own_team else None,
            "home": home,
        })
    logs.sort(key=lambda row: (row["date"], row["fixture"]), reverse=True)
    known = [row for row in logs if row["minutes"] is not None]
    appearances = [row for row in known if row["minutes"] > 0]
    gameweeks = []
    for event_id in sorted({row["gameweek"] for row in known}, reverse=True):
        rows = [row for row in known if row["gameweek"] == event_id]
        relevant = [f for f in fixtures if f.get("event") == event_id and (
            (player["team"] in (f["team_h"], f["team_a"]) and
                (not joined or not f.get("kickoff_time") or f["kickoff_time"][:10] >= joined))
            or found.get(f["id"], {}).get("minutes", 0) > 0)]
        # A partial double GW is not a completed form observation.
        if not relevant or any(not f.get("finished") for f in relevant):
            continue
        stats = entries[event_id].get("stats", {})
        def optional(field):
            raw = stats.get(field)
            try:
                return float(raw) if raw is not None else None
            except (ValueError, TypeError):
                return None
        gameweeks.append({"gameweek": event_id, "fixtureCount": len(rows),
            "minutes": stats.get("minutes", sum(row["minutes"] for row in rows)),
            "points": stats.get("total_points", sum(row["points"] for row in rows)),
            "xG": optional("expected_goals"), "xA": optional("expected_assists"),
            "appearancePoints": sum(row.get("appearancePoints", 0) for row in rows),
            "bonus": stats.get("bonus", sum(row.get("bonusPoints", 0) for row in rows)),
            "dcPoints": sum(row.get("dcPoints", 0) for row in rows),
            "savePoints": sum(row.get("savePoints", 0) for row in rows)})
    return {
        "last3": logs[:3], "appearances": len(appearances), "matchesKnown": len(known),
        "avgMinutes": round(sum(row["minutes"] for row in appearances) / len(appearances), 1) if appearances else None,
        "avgMinutesPerMatch": round(sum(row["minutes"] for row in known) / len(known), 1) if known else None,
        "playRate": len(appearances) / len(known) if known else None,
        "sixtyRate": sum(row["minutes"] >= 60 for row in known) / len(known) if known else None,
        "dcPointsPerMatch": sum(row.get("dcPoints", 0) for row in known) / len(known) if known else None,
        "savePointsPerMatch": sum(row.get("savePoints", 0) for row in known) / len(known) if known else None,
        "recentGameweeks": gameweeks[:5], "completedGameweeks": len(gameweeks),
        "avgPointsPerGameweek": round(sum(row["points"] for row in gameweeks) / len(gameweeks), 2) if gameweeks else None,
    }


def build_snapshot(bootstrap, fixtures, history=None, updated_at=None, live=None):
    teams = {team["id"]: team for team in bootstrap["teams"]}
    positions = {kind["id"]: kind["singular_name_short"] for kind in bootstrap["element_types"]}
    next_by_team = next_fixtures(fixtures)
    players = []
    for player in bootstrap["elements"]:
        team_id = player["team"]
        players.append({
            "id": player["id"],
            "name": player["web_name"],
            "fullName": " ".join(filter(None, (player.get("first_name"), player.get("second_name")))) or player["web_name"],
            "teamId": team_id,
            "position": positions.get(player["element_type"], "?"),
            "price": player["now_cost"] / 10,
            "points": player.get("total_points", 0),
            "minutes": player.get("minutes", 0),
            "form": player.get("form"),
            "ownership": player.get("selected_by_percent"),
            "xG": player.get("expected_goals"),
            "xA": player.get("expected_assists"),
            "xGI": player.get("expected_goal_involvements"),
            "goals": player.get("goals_scored", 0),
            "assists": player.get("assists", 0),
            "starts": player.get("starts", 0),
            "cleanSheets": player.get("clean_sheets", 0),
            "xGC": player.get("expected_goals_conceded"),
            "saves": player.get("saves", 0),
            "bonus": player.get("bonus", 0),
            "defCon": player.get("defensive_contribution", 0),
            "threat": player.get("threat"),
            "creativity": player.get("creativity"),
            "nextChance": player.get("chance_of_playing_next_round"),
            "status": player.get("status", "u"),
            "canSelect": player.get("can_select", True),
            "yellowCards": player.get("yellow_cards", 0),
            "redCards": player.get("red_cards", 0),
            "minutesInfo": player_minutes(player, fixtures, live),
            "nextFixture": next_by_team.get(team_id),
        })

    current = next((event for event in bootstrap["events"] if event.get("is_current")), None)
    following = next((event for event in bootstrap["events"] if event.get("is_next")), None)
    return {
        "schemaVersion": 3,
        "source": "Fantasy Premier League",
        "updatedAt": updated_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "currentGameweek": current["id"] if current else None,
        "nextGameweek": following["id"] if following else None,
        "teams": [{"id": team["id"], "name": team["name"], "shortName": team["short_name"]} for team in teams.values()],
        "players": players,
        "history": history or {"source": "OpenFootball + FPL", "seasons": [], "matches": [], "warnings": []},
        "events": [{"id": event["id"], "deadline": event.get("deadline_time"), "finished": event.get("finished", False)} for event in bootstrap["events"]],
        "fixtures": [{"id": f["id"], "gameweek": f.get("event"), "home": f["team_h"], "away": f["team_a"],
            "kickoff": f.get("kickoff_time"), "finished": f.get("finished", False),
            "homeDifficulty": f.get("team_h_difficulty"), "awayDifficulty": f.get("team_a_difficulty")} for f in fixtures],
        "rules": {"budget": bootstrap.get("game_settings", {}).get("squad_total_spend", 1000) / 10,
            "clubLimit": bootstrap.get("game_settings", {}).get("squad_team_limit", 3),
            "positions": [{"position": kind["singular_name_short"], "squad": kind.get("squad_select"),
                "minStart": kind.get("squad_min_play"), "maxStart": kind.get("squad_max_play")} for kind in bootstrap["element_types"]],
            "chips": bootstrap.get("chips", [])},
    }


def main():
    bootstrap, fixtures = get_json("bootstrap-static"), get_json("fixtures")
    teams = {team["id"]: team for team in bootstrap["teams"]}
    first_deadline = next((event.get("deadline_time") for event in bootstrap["events"] if event.get("deadline_time")), None)
    season_start = int(first_deadline[:4]) if first_deadline else datetime.now(timezone.utc).year
    current_season = f"{season_start}-{str(season_start + 1)[-2:]}"
    history = {
        "source": "FPL (current season) + OpenFootball (previous seasons, CC0)",
        "seasons": [current_season],
        "matches": current_matches(fixtures, teams, current_season),
        "warnings": [],
    }
    for year in range(season_start - 1, season_start - 4, -1):
        season = f"{year}-{str(year + 1)[-2:]}"
        try:
            matches = historical_matches(season, get_history(season))
            if len(matches) < 100:
                raise ValueError(f"Only {len(matches)} completed matches")
            history["seasons"].append(season)
            history["matches"].extend(matches)
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError) as error:
            history["warnings"].append(f"{season}: {type(error).__name__}")
    history["matches"].sort(key=lambda match: match["date"], reverse=True)
    event_ids = sorted({f["event"] for f in fixtures if f.get("finished") and f.get("event")})
    live = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        requests = {pool.submit(get_json, f"event/{event_id}/live"): event_id for event_id in event_ids}
        for request in as_completed(requests):
            event_id = requests[request]
            live[event_id] = request.result()
    print(f"Fetched per-fixture minutes for {len(live)} gameweeks", flush=True)
    snapshot = build_snapshot(bootstrap, fixtures, history, live=live)
    snapshot["season"] = current_season
    from planning import build_planning
    snapshot["planning"] = build_planning(snapshot)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(temporary, OUTPUT)
    print(f"Saved {len(snapshot['players'])} players and {len(history['matches'])} results to {OUTPUT}")
    if history["warnings"]:
        print("History warnings:", ", ".join(history["warnings"]))


if __name__ == "__main__":
    main()
