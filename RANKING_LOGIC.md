# Ranking Logic

## Rule
Two players play a game. Whoever scores more (or is picked as the winner, if scores aren't tracked) wins.

**Every game swaps the two players' rank slots — no matter who was ranked higher going in.**
- Winner's new rank = loser's old rank
- Loser's new rank = winner's old rank

Everyone else on the ladder is untouched — it's always a two-person swap, not a re-sort of the whole ladder. But unlike a "only swap if the underdog wins" rule, the distance isn't capped at 1: beating (or losing to) someone far away on the ladder swings your rank by that many spots at once. The ladder shows this as a delta badge, e.g. `▲6` or `▼2`.

## Example
Ranks: 1 Mike, 2 Dave, 3 Sam, 4 Ravi

Sam (rank 3) beats Dave (rank 2) → Sam moves to rank 2, Dave moves to rank 3. Mike (1) and Ravi (4) unaffected.

Mike (rank 1) beats Ravi (rank 4) → Mike moves to rank 4, Ravi moves to rank 1. Winning doesn't protect a high rank against a low-ranked opponent — every matchup is a genuine risk for both players.

## Scores are optional
Logging a game only strictly requires picking a winner. Scores can be entered too (toggle in the form) — when present they're used for career point totals shown in a player's history; when absent, `totalPoints` just isn't incremented for that game. Either way, the swap rule above applies identically.

## Every game updates
1. `wins`/`losses` +1 for the two players involved
2. `totalPoints` += that game's score for each, if scores were tracked
3. New `games` doc with scores (or null) and rank before/after
4. The two `rank` values always swap on the `players` docs
5. Each player's `lastResult`, `lastOpponentName`, and `lastRankDelta` update, driving the ladder's beat/lost-to line and movement badge

