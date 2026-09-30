#!/usr/bin/env python3
"""Create the static, browser-friendly FPL snapshot used by GitHub Pages."""

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


API = "https://fantasy.premierleague.com/api"
OUTPUT = Path(__file__).resolve().parents[1] / "site" / "data" / "fpl.json"


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


def build_snapshot(bootstrap, fixtures, updated_at=None):
    teams = {team["id"]: team for team in bootstrap["teams"]}
    positions = {kind["id"]: kind["singular_name_short"] for kind in bootstrap["element_types"]}
    next_by_team = next_fixtures(fixtures)
    players = []
    for player in bootstrap["elements"]:
        team_id = player["team"]
        players.append({
            "id": player["id"],
            "name": player["web_name"],
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
            "status": player.get("status", "u"),
            "nextFixture": next_by_team.get(team_id),
        })

    current = next((event for event in bootstrap["events"] if event.get("is_current")), None)
    following = next((event for event in bootstrap["events"] if event.get("is_next")), None)
    return {
        "schemaVersion": 1,
        "source": "Fantasy Premier League",
        "updatedAt": updated_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "currentGameweek": current["id"] if current else None,
        "nextGameweek": following["id"] if following else None,
        "teams": [{"id": team["id"], "name": team["name"], "shortName": team["short_name"]} for team in teams.values()],
        "players": players,
    }


def main():
    snapshot = build_snapshot(get_json("bootstrap-static"), get_json("fixtures"))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(temporary, OUTPUT)
    print(f"Saved {len(snapshot['players'])} players to {OUTPUT}")


if __name__ == "__main__":
    main()
