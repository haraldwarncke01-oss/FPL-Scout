import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from fetch_fpl import build_snapshot, next_fixtures


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
            {"team_h": 1, "team_a": 2, "kickoff_time": "2026-10-10T14:00:00Z", "finished": False, "event": 7, "team_h_difficulty": 2, "team_a_difficulty": 4},
            {"team_h": 2, "team_a": 1, "kickoff_time": "2026-10-03T14:00:00Z", "finished": False, "event": 6, "team_h_difficulty": 2, "team_a_difficulty": 3},
            {"team_h": 1, "team_a": 2, "kickoff_time": "2026-09-26T14:00:00Z", "finished": True, "event": 5},
        ]
        result = build_snapshot(bootstrap, fixtures, "2026-09-29T12:00:00+00:00")
        player = result["players"][0]
        self.assertEqual(result["nextGameweek"], 6)
        self.assertEqual(player["price"], 7.5)
        self.assertEqual(player["position"], "MID")
        self.assertEqual(player["nextFixture"], {"opponent": 2, "home": False, "difficulty": 3, "kickoff": "2026-10-03T14:00:00Z", "gameweek": 6})
        self.assertEqual(next_fixtures(fixtures)[2]["opponent"], 1)


if __name__ == "__main__":
    unittest.main()
