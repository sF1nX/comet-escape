# Comet Escape

A simple browser arcade game: dodge falling comets and beat your high score.

## Local Run

Open `index.html` in your browser.

## Backend (Play.fun Integrity)

This project includes a Node backend in `server.js` for server-side score submission:

- `POST /api/session/start`
- `POST /api/session/finish`
- `GET /health`

Required environment variables:

- `GAME_ID`
- `OGP_API_KEY`
- `OGP_API_SECRET_KEY`
- `ALLOWED_ORIGINS` (for this repo: `https://sf1nx.github.io`)

## Controls

- Keyboard: `←` / `→` or `A` / `D`
- Mobile: bottom buttons or swipe on the game area

## Deploy to GitHub Pages

1. Initialize git and make the first commit:
   ```bash
   git init
   git add .
   git commit -m "Initial game"
   ```
2. Create a public repository and push:
   ```bash
   gh repo create comet-escape --public --source=. --push
   ```
3. Enable GitHub Pages:
   ```bash
   GITHUB_USER=$(gh api user --jq '.login')
   gh api repos/$GITHUB_USER/comet-escape/pages -X POST --input - <<< '{"build_type":"legacy","source":{"branch":"main","path":"/"}}'
   ```
4. Get the URL:
   ```bash
   gh api repos/$GITHUB_USER/comet-escape/pages --jq '.html_url'
   ```

Then add that URL in the **Add a Game Manually** form on Play.fun.

## Deploy Backend to Render

1. Push this repository to GitHub (already done).
2. In Render, create a new **Blueprint** and select this repo.
3. Confirm `render.yaml` is detected and create service `comet-escape-api`.
4. Set env values in Render:
   - `GAME_ID`
   - `OGP_API_KEY`
   - `OGP_API_SECRET_KEY`
5. After deploy, copy backend URL, for example:
   `https://comet-escape-api.onrender.com`
6. Set `window.PF_BACKEND_URL` in `index.html` to that URL.
7. Commit + push again so GitHub Pages uses the backend.
