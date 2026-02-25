# Comet Escape

Простая браузерная аркада: уклоняйся от падающих комет и набирай рекорд.

## Локальный запуск

Открой `index.html` в браузере.

## Управление

- Клавиатура: `←` / `→` или `A` / `D`
- Мобильный: кнопки внизу или свайп по полю

## Публикация на GitHub Pages

1. Инициализируй git и сделай первый коммит:
   ```bash
   git init
   git add .
   git commit -m "Initial game"
   ```
2. Создай публичный репозиторий и запушь:
   ```bash
   gh repo create comet-escape --public --source=. --push
   ```
3. Включи GitHub Pages:
   ```bash
   GITHUB_USER=$(gh api user --jq '.login')
   gh api repos/$GITHUB_USER/comet-escape/pages -X POST --input - <<< '{"build_type":"legacy","source":{"branch":"master","path":"/"}}'
   ```
4. Получи ссылку:
   ```bash
   gh api repos/$GITHUB_USER/comet-escape/pages --jq '.html_url'
   ```

После этого добавь URL в форму **Add a Game Manually** на Play.fun.
