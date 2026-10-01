import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fetch_fpl import build_snapshot, next_fixtures, historical_matches, current_matches, player_minutes


class SnapshotTests(unittest.TestCase):
    def test_next_fixture_and_player_mapping(self):
        bootstrap = {
            "teams": [
                {"id": 1, "name": "North FC", "short_name": "NOR"},
                {"id": 2, "name": "South FC", "short_name": "SOU"},
            ],
            "element_types": [{"id": 3, "singular_name_short": "MID"}],
            "events": [{"id": 5, "is_current": True}, {"id": 6, "is_next": True}],
            "elements": [{
                "id": 19, "web_name": "Example", "team": 1, "element_type": 3,
                "now_cost": 75, "total_points": 48, "minutes": 450,
                "form": "6.2", "selected_by_percent": "12.3",
                "expected_goals": "2.10", "expected_assists": "1.20",
                "expected_goal_involvements": "3.30", "goals_scored": 2,
                "assists": 1, "status": "a",
            }],
        }
        fixtures = [
            {"id": 1, "team_h": 1, "team_a": 2, "kickoff_time": "2026-10-10T14:00:00Z", "finished": False, "event": 7, "team_h_difficulty": 2, "team_a_difficulty": 4},
            {"id": 2, "team_h": 2, "team_a": 1, "kickoff_time": "2026-10-03T14:00:00Z", "finished": False, "event": 6, "team_h_difficulty": 2, "team_a_difficulty": 3},
            {"id": 3, "team_h": 1, "team_a": 2, "kickoff_time": "2026-09-26T14:00:00Z", "finished": True, "event": 5},
        ]
        result = build_snapshot(bootstrap, fixtures, updated_at="2026-09-29T12:00:00+00:00")
        player = result["players"][0]
        self.assertEqual(result["nextGameweek"], 6)
        self.assertEqual(player["price"], 7.5)
        self.assertEqual(player["position"], "MID")
        self.assertEqual(player["nextFixture"], {"opponent": 2, "home": False, "difficulty": 3, "kickoff": "2026-10-03T14:00:00Z", "gameweek": 6})
        self.assertEqual(next_fixtures(fixtures)[2]["opponent"], 1)

    def test_history_scores_and_current_results(self):
        old = {"matches": [
            {"date": "2025-09-01", "team1": "Arsenal FC", "team2": "Chelsea FC", "score": {"ft": [2, 0]}},
            {"date": "2025-10-01", "team1": "Chelsea FC", "team2": "Arsenal FC", "score": [1, 1]},
            {"date": "2025-11-01", "team1": "Arsenal FC", "team2": "Chelsea FC", "score": None},
        ]}
        matches = historical_matches("2025-26", old)
        self.assertEqual(len(matches), 2)
        self.assertEqual(matches[0]["home"], "Arsenal")
        self.assertEqual(matches[1]["awayGoals"], 1)
        fixtures = [
            {"finished": True, "kickoff_time": "2026-09-01T12:00:00Z", "team_h": 1, "team_a": 2, "team_h_score": 0, "team_a_score": 0},
            {"finished": False, "kickoff_time": "2026-10-01T12:00:00Z", "team_h": 1, "team_a": 2, "team_h_score": None, "team_a_score": None},
        ]
        self.assertEqual(current_matches(fixtures, {1: {"name": "Arsenal"}, 2: {"name": "Chelsea"}}, "2026-27"), [
            {"season": "2026-27", "date": "2026-09-01", "home": "Arsenal", "away": "Chelsea", "homeGoals": 0, "awayGoals": 0}
        ])

    def test_minutes_include_dnp_and_keep_missing_data_unknown(self):
        player = {"id": 7, "team": 1}
        fixtures = [{"id": i, "finished": True, "kickoff_time": f"2026-09-0{i}T12:00:00Z", "event": i,
            "team_h": 1, "team_a": 2} for i in (1, 2, 3)]
        live = {1: {"elements": [{"id": 7, "explain": [{"fixture": 1, "stats": [{"identifier": "minutes", "value": 90, "points": 2}]}]}]},
            2: {"elements": [{"id": 7, "explain": []}]}}
        result = player_minutes(player, fixtures, live)
        self.assertEqual([r["minutes"] for r in result["last3"]], [None, 0, 90])
        self.assertEqual(result["avgMinutes"], 90)
        self.assertEqual(result["avgMinutesPerMatch"], 45)


if __name__ == "__main__":
    unittest.main()
