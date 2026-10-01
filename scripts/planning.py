"""Transparent point estimates and constrained FPL squad plans.

These are unvalidated estimates, not probabilities of finishing top of a GW.
Head-to-head scores remain context only; recent venue records affect estimates.
"""
import math
import statistics
from collections import Counter
import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import coo_matrix

POSITIONS = ["GKP", "DEF", "MID", "FWD"]
QUOTAS = {"GKP": 2, "DEF": 5, "MID": 5, "FWD": 3}
START_MIN = {"GKP": 1, "DEF": 3, "MID": 2, "FWD": 1}
START_MAX = {"GKP": 1, "DEF": 5, "MID": 5, "FWD": 3}
GOAL_POINTS = {"GKP": 10, "DEF": 6, "MID": 5, "FWD": 4}
CS_POINTS = {"GKP": 4, "DEF": 4, "MID": 1, "FWD": 0}


def value(raw, default=0.0):
    try:
        return float(raw) if raw is not None else default
    except (ValueError, TypeError):
        return default


def minutes_estimate(player):
    info = player.get("minutesInfo", {})
    recent = [row["minutes"] for row in info.get("last3", []) if row.get("minutes") is not None]
    if not recent or info.get("avgMinutesPerMatch") is None:
        return {"minutes": 0, "play": 0, "sixty": 0, "availability": 0}
    weights = [0.5, 0.3, 0.2][:len(recent)]
    total_weight = sum(weights)
    average = sum(min(90, minute) * weight for minute, weight in zip(recent, weights)) / total_weight
    play = sum((minute > 0) * weight for minute, weight in zip(recent, weights)) / total_weight
    sixty = sum((minute >= 60) * weight for minute, weight in zip(recent, weights)) / total_weight
    chance = player.get("nextChance")
    availability = max(0, min(1, value(chance, 100) / 100))
    if player.get("status") in ("i", "s", "u", "n") and chance is None:
        availability = 0
    return {
        "minutes": min(90, 0.75 * average + 0.25 * info["avgMinutesPerMatch"]) * availability,
        "play": (0.75 * play + 0.25 * value(info.get("playRate"))) * availability,
        "sixty": (0.75 * sixty + 0.25 * value(info.get("sixtyRate"))) * availability,
        "availability": availability,
    }


def venue_record(matches, team, home, prior_goals, prior_against):
    selected = [m for m in matches if m["home" if home else "away"] == team][:10]
    goals = sum(m["homeGoals" if home else "awayGoals"] for m in selected)
    against = sum(m["awayGoals" if home else "homeGoals"] for m in selected)
    # Five league-average pseudo-matches prevent tiny promoted-team samples dominating.
    return {"scored": (goals + 5 * prior_goals) / (len(selected) + 5),
        "conceded": (against + 5 * prior_against) / (len(selected) + 5), "sample": len(selected)}


def expected_conceded_penalty(lam):
    return sum((goals // 2) * math.exp(-lam) * lam ** goals / math.factorial(goals) for goals in range(20))


def recent_form(player):
    """Completed GW stats, with recency and a robust, small outcome contribution."""
    info = player.get("minutesInfo", {})
    last5 = info.get("recentGameweeks", [])[:5]
    last3 = last5[:3]
    weighted = [(row, weight) for row, weight in zip(last3, (0.5, 0.3, 0.2)) if value(row.get("minutes")) > 0]
    minutes = sum(value(row.get("minutes")) for row in last3)
    reliability = min(1, minutes / 270, len(last3) / 3)
    def rate(field):
        known = [(row, weight) for row, weight in weighted if row.get(field) is not None]
        denominator = sum(weight for _, weight in known)
        return sum(value(row[field]) * 90 / row["minutes"] * weight for row, weight in known) / denominator if denominator else None
    historical_outcomes = [(value(row["points"]) - value(row.get("appearancePoints"))) * 90 / row["minutes"]
        for row in last5 if value(row.get("minutes")) > 0]
    median = statistics.median(historical_outcomes) if historical_outcomes else 0
    # A single huge haul is capped to six non-appearance pts/90 above the recent median.
    denominator = sum(weight for _, weight in weighted)
    robust = sum(max(median-6, min(median+6,
        (value(row["points"]) - value(row.get("appearancePoints"))) * 90 / row["minutes"])) * weight
        for row, weight in weighted) / denominator if denominator else None
    season_minutes = max(player["minutes"], 1)
    return {"gameweeks": last5, "last3Points": [row["points"] for row in last3],
        "last3Average": sum(row["points"] for row in last3) / len(last3) if last3 else None,
        "seasonAverage": info.get("avgPointsPerGameweek"),
        "last5Median": statistics.median([row["points"] for row in last5]) if last5 else None,
        "recentXG90": rate("xG"), "recentXA90": rate("xA"),
        "seasonXG90": value(player.get("xG")) * 90 / season_minutes,
        "seasonXA90": value(player.get("xA")) * 90 / season_minutes,
        "bonus90": rate("bonus"), "defensive90": rate("dcPoints"), "saves90": rate("savePoints"),
        "reliability": reliability, "outcome90": robust,
        "outcomeWeight": 0.2 * reliability if robust is not None else 0}


def forecast_players(snapshot):
    start = snapshot.get("nextGameweek") or snapshot.get("currentGameweek")
    event_ids = [event["id"] for event in snapshot["events"] if start and start <= event["id"] < start + 5]
    matches = sorted(snapshot.get("history", {}).get("matches", []), key=lambda m: m["date"], reverse=True)
    home_mean = sum(m["homeGoals"] for m in matches) / len(matches) if matches else 1.5
    away_mean = sum(m["awayGoals"] for m in matches) / len(matches) if matches else 1.2
    teams = {t["id"]: t for t in snapshot["teams"]}
    records = {}
    for team in teams.values():
        records[(team["id"], True)] = venue_record(matches, team["name"], True, home_mean, away_mean)
        records[(team["id"], False)] = venue_record(matches, team["name"], False, away_mean, home_mean)
    priors = {}
    for position in POSITIONS:
        pool = [p for p in snapshot["players"] if p["position"] == position and p["minutes"] >= 270]
        minutes = sum(p["minutes"] for p in pool)
        priors[position] = {field: sum(value(p.get(field)) for p in pool) * 90 / minutes if minutes else 0
            for field in ("xG", "xA")}
        appearances = sum(p.get("minutesInfo", {}).get("appearances", 0) for p in pool)
        priors[position]["bonus"] = sum(value(p.get("bonus")) for p in pool) / appearances if appearances else 0.3
    output = {}
    for player in snapshot["players"]:
        pos = player["position"]
        mins = minutes_estimate(player)
        season_minutes = player["minutes"]
        prior = priors.get(pos, {"xG": 0, "xA": 0, "bonus": 0})
        rates = {field: (value(player.get(field)) * 90 + 450 * prior[field]) / (season_minutes + 450)
            for field in ("xG", "xA")}
        info = player.get("minutesInfo", {})
        form = recent_form(player)
        recent_weight = 0.6 * form["reliability"]
        for field, recent_key in (("xG", "recentXG90"), ("xA", "recentXA90")):
            if form[recent_key] is not None:
                rates[field] = recent_weight * form[recent_key] + (1-recent_weight) * rates[field]
        form["underlyingWeight"] = recent_weight if form["recentXG90"] is not None and form["recentXA90"] is not None else 0
        played = info.get("appearances", 0)
        bonus = (value(player.get("bonus")) + 5 * prior["bonus"]) / (played + 5) * mins["play"]
        if form["bonus90"] is not None:
            bonus = recent_weight * form["bonus90"] * mins["minutes"] / 90 + (1-recent_weight) * bonus
        season_average = value(info.get("avgMinutesPerMatch"))
        minute_ratio = min(1.5, mins["minutes"] / season_average) if season_average else 0
        dc = min(2 * mins["play"], value(info.get("dcPointsPerMatch")) * minute_ratio)
        saves = value(info.get("savePointsPerMatch")) * minute_ratio if pos == "GKP" else 0
        if form["defensive90"] is not None:
            dc = min(2 * mins["play"], recent_weight * form["defensive90"] * mins["minutes"] / 90 + (1-recent_weight) * dc)
        if pos == "GKP" and form["saves90"] is not None:
            saves = recent_weight * form["saves90"] * mins["minutes"] / 90 + (1-recent_weight) * saves
        cards = (value(player.get("yellowCards")) + 3 * value(player.get("redCards"))) * mins["minutes"] / max(season_minutes, 90)
        events = []
        for event_id in event_ids:
            upcoming = [f for f in snapshot["fixtures"] if f["gameweek"] == event_id and not f["finished"]
                and player["teamId"] in (f["home"], f["away"])]
            components = {"appearance": 0, "goals": 0, "assists": 0, "cleanSheet": 0, "bonus": 0,
                "defensive": 0, "saves": 0, "deductions": 0, "recentForm": 0}
            fixture_info = []
            for fixture in upcoming:
                home = player["teamId"] == fixture["home"]
                opponent_id = fixture["away"] if home else fixture["home"]
                own, opponent = records[(player["teamId"], home)], records[(opponent_id, not home)]
                baseline = home_mean if home else away_mean
                own_overall = (records[(player["teamId"], True)]["scored"] + records[(player["teamId"], False)]["scored"]) / 2
                attack = max(0.6, min(1.6, 0.5 * opponent["conceded"] / max(baseline, 0.5)
                    + 0.5 * own["scored"] / max(own_overall, 0.5)))
                conceded_lambda = (opponent["scored"] + own["conceded"]) / 2
                clean_sheet = math.exp(-conceded_lambda)
                components["appearance"] += mins["play"] + mins["sixty"]
                components["goals"] += GOAL_POINTS.get(pos, 4) * rates["xG"] * mins["minutes"] / 90 * attack
                components["assists"] += 3 * rates["xA"] * mins["minutes"] / 90 * attack
                components["cleanSheet"] += CS_POINTS.get(pos, 0) * mins["sixty"] * clean_sheet
                components["bonus"] += bonus
                components["defensive"] += dc
                components["saves"] += saves
                components["deductions"] -= cards
                if pos in ("GKP", "DEF"):
                    components["deductions"] -= expected_conceded_penalty(conceded_lambda * mins["minutes"] / 90)
                fixture_info.append({"id": fixture["id"], "opponent": opponent_id, "home": home,
                    "attackFactor": round(attack, 3), "cleanSheetEstimate": round(clean_sheet, 3),
                    "teamSample": own["sample"], "opponentSample": opponent["sample"]})
            events.append({"gameweek": event_id, "points": round(max(0, sum(components.values())), 3),
                "minutes": round(mins["minutes"] * len(upcoming), 1), "fixtureCount": len(upcoming),
                "components": {key: round(val, 3) for key, val in components.items()}, "fixtures": fixture_info})
            non_appearance = sum(components.values()) - components["appearance"]
            components["recentForm"] = form["outcomeWeight"] * (value(form["outcome90"]) * mins["minutes"] / 90 * len(upcoming) - non_appearance)
            events[-1]["points"] = round(max(0, sum(components.values())), 3)
            events[-1]["components"]["recentForm"] = round(components["recentForm"], 3)
        output[player["id"]] = {"expectedMinutesPerMatch": round(mins["minutes"], 1),
            "availability": mins["availability"], "events": events, "recentForm": form,
            "totals": {str(horizon): round(sum(event["points"] for event in events[:horizon]), 3) for horizon in (1, 3, 5)}}
    return output, event_ids


def optimize_squad(players, forecasts, event_ids, budget=100, club_limit=3, mode="normal", time_limit=30):
    # Exclude unknown-minute and unavailable players from an actionable playing squad.
    candidates = [p for p in players if p.get("canSelect", True) and forecasts[p["id"]]["expectedMinutesPerMatch"] >= 20]
    n, horizon = len(candidates), len(event_ids)
    if n < 15 or not horizon:
        return {"status": "unavailable", "reason": "Not enough selectable players with minute evidence"}
    variables = n * (1 + 2 * horizon)
    objective = np.zeros(variables)
    scores = np.array([[forecasts[p["id"]]["events"][gw]["points"] for p in candidates] for gw in range(horizon)])
    bench_weight = 1.0 if mode == "benchboost" else 0.15
    objective[:n] = -bench_weight * scores.sum(axis=0)
    for gw in range(horizon):
        objective[n + gw*n:n + (gw+1)*n] = -(1-bench_weight) * scores[gw]
        objective[n*(1+horizon) + gw*n:n*(1+horizon) + (gw+1)*n] = -scores[gw]
    rows, columns, values, lows, highs = [], [], [], [], []
    def constraint(items, low=-np.inf, high=np.inf):
        row = len(lows)
        for column, val in items:
            rows.append(row); columns.append(column); values.append(val)
        lows.append(low); highs.append(high)
    constraint([(i, 1) for i in range(n)], 15, 15)
    constraint([(i, round(p["price"]*10)) for i, p in enumerate(candidates)], high=round(budget*10))
    for pos, quota in QUOTAS.items():
        constraint([(i, 1) for i,p in enumerate(candidates) if p["position"]==pos], quota, quota)
    for team in {p["teamId"] for p in candidates}:
        constraint([(i,1) for i,p in enumerate(candidates) if p["teamId"]==team], high=club_limit)
    for gw in range(horizon):
        y, c = n*(1+gw), n*(1+horizon+gw)
        constraint([(y+i,1) for i in range(n)], 11, 11)
        constraint([(c+i,1) for i in range(n)], 1, 1)
        for pos in POSITIONS:
            constraint([(y+i,1) for i,p in enumerate(candidates) if p["position"]==pos], START_MIN[pos], START_MAX[pos])
        for i in range(n):
            constraint([(y+i,1),(i,-1)], high=0)
            constraint([(c+i,1),(y+i,-1)], high=0)
    matrix = coo_matrix((values,(rows,columns)),shape=(len(lows),variables)).tocsc()
    result = milp(objective, integrality=np.ones(variables), bounds=Bounds(0,1),
        constraints=LinearConstraint(matrix,np.array(lows),np.array(highs)),
        options={"time_limit": time_limit,"mip_rel_gap":0.005})
    if result.x is None:
        return {"status":"unavailable", "reason": result.message}
    squad = [p for i,p in enumerate(candidates) if result.x[i]>.5]
    lineups = []
    for gw,event_id in enumerate(event_ids):
        starters = [p for i,p in enumerate(candidates) if result.x[n*(1+gw)+i]>.5]
        captain = next(p for i,p in enumerate(candidates) if result.x[n*(1+horizon+gw)+i]>.5)
        if mode == "benchboost":
            # All 15 score, so starter variables have no primary objective weight.
            # Resolve this tie with the best normal XI for a useful displayed lineup.
            groups = {pos: sorted([p for p in squad if p["position"] == pos],
                key=lambda p: forecasts[p["id"]]["events"][gw]["points"], reverse=True) for pos in POSITIONS}
            alternatives = []
            for defenders in range(3, 6):
                for midfielders in range(2, 6):
                    forwards = 10 - defenders - midfielders
                    if 1 <= forwards <= 3:
                        trial = groups["GKP"][:1] + groups["DEF"][:defenders] + groups["MID"][:midfielders] + groups["FWD"][:forwards]
                        alternatives.append(trial)
            starters = max(alternatives, key=lambda lineup: sum(forecasts[p["id"]]["events"][gw]["points"] for p in lineup)
                + max(forecasts[p["id"]]["events"][gw]["points"] for p in lineup))
            captain = max(starters, key=lambda p: forecasts[p["id"]]["events"][gw]["points"])
        starter_ids = {p["id"] for p in starters}
        bench = [p for p in squad if p["id"] not in starter_ids]
        total = sum(forecasts[p["id"]]["events"][gw]["points"] for p in starters) + forecasts[captain["id"]]["events"][gw]["points"]
        bench_total = sum(forecasts[p["id"]]["events"][gw]["points"] for p in bench)
        lineups.append({"gameweek":event_id,"starters":[p["id"] for p in starters], "bench":[p["id"] for p in bench],
            "captain":captain["id"],"points":round(total,2),"benchPoints":round(bench_total,2)})
    assert len(squad)==15 and Counter(p["position"] for p in squad)==Counter(QUOTAS)
    return {"status":"optimal" if result.status==0 else "feasible", "mipGap":round(float(result.mip_gap),5),
        "mode":mode,"horizon":horizon,"budget":budget,"cost":round(sum(p["price"] for p in squad),1),
        "squad":[p["id"] for p in squad], "lineups":lineups,
        "points":round(sum(row["points"] + (row["benchPoints"] if mode=="benchboost" else 0) for row in lineups),2)}


def build_planning(snapshot):
    forecasts, events = forecast_players(snapshot)
    plans = {}
    for horizon in (1,3,5):
        key = str(horizon)
        plans[key] = optimize_squad(snapshot["players"],forecasts,events[:horizon],snapshot["rules"]["budget"],snapshot["rules"]["clubLimit"])
        print(f"Squad plan {horizon} GW: {plans[key]['status']}", flush=True)
    plans["benchboost"] = optimize_squad(snapshot["players"],forecasts,events[:1],snapshot["rules"]["budget"],snapshot["rules"]["clubLimit"],"benchboost")
    return {"version":2,"events":events,"forecasts":forecasts,"plans":plans,
        "model":"Recent xG/xA (60%) + shrunk season (40%), recent minutes, venue rates; 20% robust recent outcome adjustment; unvalidated",
        "formMethod":"Last three completed playing GWs weighted 50/30/20; small samples reduce weight; non-appearance pts/90 clipped at recent median +/-6",
        "minuteMethod":"75% weighted last-three club-match minutes (50/30/20), 25% season minutes including DNP; availability applied",
        "limitations":["Same availability factor across five GWs; injury return dates unknown", "No predicted autosubs or future transfers",
            "Head-to-head results are context, not a forecasting input", "Bonus, saves and defensive points are approximate empirical estimates"]}
