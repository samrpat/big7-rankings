# Big 7 — Pickup Ladder

A live ranking board for your group chat. Log a game, scores update instantly for everyone, and the loser/winner swap spots on the ladder if the winner was ranked lower. No login needed for the group — just a link.

## 1. Create the free Firebase backend (~5 min)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → name it `big7-rankings` (or anything) → keep default settings → Create.
2. In the left sidebar: **Build → Firestore Database → Create database**. Choose **Start in production mode**, pick any region, Enable.
3. Still in Firestore, go to the **Rules** tab, delete what's there, and paste in the contents of `firestore.rules` from this folder. Click **Publish**.
4. Go to **Project settings** (gear icon, top left) → scroll to **Your apps** → click the **`</>`** (web) icon → nickname it anything → **Register app**. Skip the SDK/hosting steps it shows you.
5. Copy the `firebaseConfig` object it gives you and paste the values into `firebase-config.js` in this folder, replacing the `PASTE_ME` placeholders.

## 2. Put it on GitHub Pages (free hosting)

1. Create a new GitHub repo (public or private both work for Pages).
2. Upload all the files in this folder (`index.html`, `style.css`, `app.js`, `firebase-config.js`, `firestore.rules`, `/photos`) to the repo — easiest via the GitHub website: **Add file → Upload files**, drag everything in, commit.
3. In the repo: **Settings → Pages** → under "Build and deployment", set Source to **Deploy from a branch**, branch `main`, folder `/ (root)` → Save.
4. Wait ~1 minute, then refresh that page — GitHub will show your live URL (something like `https://yourname.github.io/big7-rankings/`).

That URL is what you share in the Big 7 group chat. Anyone who opens it can log games and add players — no account needed.

## 3. Add players and photos

- Tap **+ Player** in the app to add each of the 7 (or however many) names. They start at the bottom of the ladder.
- To add a photo: drop an image file into the `/photos` folder in the GitHub repo (e.g. `mike.jpg`), then when adding/editing that player, enter `mike.jpg` as the photo filename.
- No photo yet? The app just shows their initials in a circle — totally fine to add photos later.

## How the ladder works

- Log a game: pick the two players and their scores.
- If the winner was already ranked **higher** than the loser → no rank change, just the W/L and points get recorded.
- If the winner was ranked **lower** → they **swap spots** with the loser. Everyone else on the ladder stays put.
- Full logic: see `RANKING_LOGIC.md` from the planning docs.

## Updating later

Any file you edit and re-upload to the GitHub repo updates the live site automatically within a minute or two — no rebuild step.

## Costs

Firebase's free "Spark" plan and GitHub Pages are both free with no card required, and comfortably cover a group of 7 people logging casual games.
