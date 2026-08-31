# Big 7 Rankings — Decisions

## Stack
- **Frontend:** Single-page static web app (HTML/CSS/JS), hosted free on **GitHub Pages**.
- **Shared data:** **Firebase Firestore** (free Spark plan). Real-time, no server to run/maintain.
- **Photos:** Stored as image files inside the repo (`/photos`), referenced by filename in each player's Firestore doc. Only you (maintainer) add these via GitHub — group members never touch GitHub.
- **Access for group:** Just a URL. No login, no GitHub account, no app install. Type name, pick winner, enter score, submit.

## Why Firebase over "just editing a file on GitHub"
A shared file (e.g. JSON in the repo) can't be safely written by multiple people at once without conflicts, and would require every group member to know Git. Firestore gives everyone a live, shared, conflict-free database through a plain web form — matches "as simple as texting/typing."

## Security tradeoff (accepted, revisit if it becomes a problem)
Firestore write access will be open to anyone with the app link (no auth) to keep it frictionless for a casual group scorekeeping app. Risk: someone with the link could submit joke/bad data. Mitigations available later if needed: shared PIN check, Firebase Anonymous Auth, or per-write rate limiting. Not implemented now — flag if you want it.

## Photos
Group members don't upload their own photos. You add/update a photo by dropping a file into `/photos` in the repo and setting the filename in that player's record. Keeps write access to Firestore (scores) separate from write access to the repo (photos), which is a nice safety boundary.

## Cost
Both GitHub Pages and Firebase Spark plan are free at this scale (7-ish players, casual game volume). No credit card required for Spark plan.
