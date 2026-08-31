# Data Model (Firestore)

## Collection: `players`
Doc ID: auto-generated

| Field | Type | Notes |
|---|---|---|
| name | string | |
| photoFile | string | filename in `/photos`, e.g. `mike.jpg` |
| rank | number | 1 = top. Unique, contiguous, no gaps |
| wins | number | total wins |
| losses | number | total losses |
| totalPoints | number | career points scored across all games (not used for ranking — shown in history only) |
| lastResult | string \| null | `'win'` or `'loss'`, from most recent game |
| lastOpponentName | string \| null | opponent in most recent game |
| lastRankChanged | boolean | true if the most recent game caused a ladder swap |
| lastRankDelta | number | spots moved on most recent game (+ up, − down); drives the ladder's beat/lost-to line and delta badge |
| createdAt | timestamp | |

## Collection: `games`
Doc ID: auto-generated

| Field | Type | Notes |
|---|---|---|
| player1Id | string | ref to players doc |
| player2Id | string | ref to players doc |
| player1Score | number \| null | winner's score — null if this game wasn't scored |
| player2Score | number \| null | loser's score — null if this game wasn't scored |
| hasScores | boolean | true if scores were entered for this game |
| winnerId | string | |
| loserId | string | |
| rankSwapped | boolean | true if winner moved up |
| player1RankBefore / After | number | for history display |
| player2RankBefore / After | number | for history display |
| timestamp | timestamp | |

## Per-player history
Not a separate collection — derived by querying `games` where `player1Id` or `player2Id` == that player, sorted by timestamp. Keeps writes simple (one doc per game) and avoids duplicated data.
