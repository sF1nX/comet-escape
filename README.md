# Comet Escape

A simple browser arcade game: dodge falling comets and beat your high score.

## Local Run

Open `index.html` in your browser.

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
