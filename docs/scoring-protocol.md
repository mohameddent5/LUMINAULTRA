# Scoring protocol (dev set, private labels)

- Scoring width: SCORE_W env (default 1280, never upscaled), the app passes the photo at up to 1280 px. Results changed with width: at 1000 px ex3, ex9 and ex10 were refused.
- Borders: a truth border counts as hit if any found border is within 14 px (1280 px wide frame).
- Report per photo: truth count, found count, hits, recall, precision, median border error (px), teeth found, lower boxes.
- Pooled numbers always state the number of photos.
- Fixed regression table: run the same photos for every change (tools/eval/regress_browser.mjs, then tools/eval/regtable.py). Photos and labels stay private and are never committed.
- A new labeled photo is held out (not used to choose a change) until it is declared used in the report.
- ex3 and ex9 are the same photo with two label sets; they are not independent. ex12 is scored on the whole frame (the app uses a mouth crop).
