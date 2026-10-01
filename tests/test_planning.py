import sys
import unittest
from pathlib import Path
from collections import Counter
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from planning import minutes_estimate, optimize_squad, forecast_players, recent_form, QUOTAS
from copy import deepcopy


class PlanningTests(unittest.TestCase):
    def test_recent_form_outweighs_old_haul_and_limits_new_outlier(self):
        rows=[{"gameweek":gw,"minutes":90,"fixtureCount":1,"points":pts,"xG":xg,"xA":xa,
            "appearancePoints":2,"bonus":3 if pts==23 else 0,"dcPoints":0,"savePoints":0}
            for gw,pts,xg,xa in [(5,2,.28,.19),(4,2,.03,.33),(3,2,.15,.06),(2,23,2.02,.48),(1,2,.08,.26)]]
        player={"id":1,"teamId":1,"position":"MID","minutes":450,"xG":2.56,"xA":1.32,"bonus":3,
            "points":31,"status":"a","minutesInfo":{"last3":[{"minutes":90}]*3,"avgMinutesPerMatch":90,
                "playRate":1,"sixtyRate":1,"appearances":5,"recentGameweeks":rows,"avgPointsPerGameweek":6.2}}
        snapshot={"nextGameweek":6,"events":[{"id":6}],"players":[player],
            "teams":[{"id":1,"name":"A"},{"id":2,"name":"B"}],
            "fixtures":[{"id":1,"home":1,"away":2,"gameweek":6,"finished":False}]}
        cold,_=forecast_players(snapshot)
        self.assertEqual(cold[1]["recentForm"]["last3Average"],2)
        self.assertEqual(cold[1]["recentForm"]["seasonAverage"],6.2)
        self.assertAlmostEqual(cold[1]["recentForm"]["recentXG90"],.179)
        self.assertAlmostEqual(cold[1]["recentForm"]["underlyingWeight"],.6)
        self.assertLess(cold[1]["events"][0]["components"]["recentForm"],0)
        no_recent=deepcopy(snapshot);no_recent["players"][0]["minutesInfo"].pop("recentGameweeks")
        baseline,_=forecast_players(no_recent)
        self.assertLess(cold[1]["events"][0]["points"],baseline[1]["events"][0]["points"])
        warm=deepcopy(player);warm["minutesInfo"]["recentGameweeks"]=[rows[3],rows[0],rows[1],rows[2],rows[4]]
        self.assertEqual(recent_form(warm)["outcome90"],3,'23-point haul is capped before the small outcome contribution')
        unknown=deepcopy(snapshot)
        for row in unknown["players"][0]["minutesInfo"]["recentGameweeks"]:row["xG"]=None;row["xA"]=None
        missing,_=forecast_players(unknown)
        self.assertIsNone(missing[1]["recentForm"]["recentXG90"])
        self.assertEqual(missing[1]["recentForm"]["underlyingWeight"],0)
        self.assertAlmostEqual(missing[1]["events"][0]["components"]["goals"],baseline[1]["events"][0]["components"]["goals"])

    def test_recent_minutes_and_availability(self):
        p = {"status": "a", "minutesInfo": {"last3": [{"minutes":90},{"minutes":0},{"minutes":90}],
            "avgMinutesPerMatch":60,"playRate":2/3,"sixtyRate":2/3}}
        estimate = minutes_estimate(p)
        self.assertAlmostEqual(estimate["minutes"], 62.25)
        p["nextChance"] = 0
        self.assertEqual(minutes_estimate(p)["minutes"], 0)

    def test_optimizer_budget_positions_clubs_and_captain(self):
        players, forecasts = [], {}
        for position, count in {"GKP":5,"DEF":9,"MID":9,"FWD":6}.items():
            for j in range(count):
                pid = len(players)+1
                players.append({"id":pid,"position":position,"price":4+j*.4,"teamId":pid%8,"canSelect":True})
                forecasts[pid]={"expectedMinutesPerMatch":80,"events":[{"points":2+j*.6},{"points":3+j*.4}]}
        plan=optimize_squad(players, forecasts,[6,7],budget=85,time_limit=5)
        self.assertIn(plan["status"],("optimal","feasible"))
        squad=[p for p in players if p["id"] in plan["squad"]]
        self.assertEqual(Counter(p["position"] for p in squad),Counter(QUOTAS))
        self.assertLessEqual(plan["cost"],85)
        self.assertLessEqual(max(Counter(p["teamId"] for p in squad).values()),3)
        for lineup in plan["lineups"]:
            self.assertEqual(len(lineup["starters"]),11)
            self.assertEqual(len(lineup["bench"]),4)
            self.assertIn(lineup["captain"],lineup["starters"])

    def test_double_and_blank_gameweeks(self):
        player={"id":1,"teamId":1,"position":"MID","minutes":450,"xG":2,"xA":1,"bonus":2,
            "status":"a","minutesInfo":{"last3":[{"minutes":90}]*3,"avgMinutesPerMatch":90,
                "playRate":1,"sixtyRate":1,"appearances":5}}
        snapshot={"nextGameweek":6,"events":[{"id":6},{"id":7}],"players":[player],
            "teams":[{"id":1,"name":"A"},{"id":2,"name":"B"}],
            "fixtures":[{"id":1,"home":1,"away":2,"gameweek":6,"finished":False}]}
        single,_=forecast_players(snapshot)
        snapshot["fixtures"].append({"id":2,"home":1,"away":2,"gameweek":6,"finished":False})
        double,_=forecast_players(snapshot)
        self.assertEqual(double[1]["events"][0]["minutes"],180)
        self.assertAlmostEqual(double[1]["events"][0]["points"],2*single[1]["events"][0]["points"],places=2)
        self.assertEqual(double[1]["events"][1]["points"],0)
        self.assertEqual(double[1]["events"][1]["minutes"],0)


if __name__ == "__main__":
    unittest.main()
