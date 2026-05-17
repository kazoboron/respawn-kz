// HTML email shell + text normalizer.

const BASE_HTML = (body: string) => `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e6e6e9; padding: 24px; line-height: 1.5; }
  .container { max-width: 560px; margin: 0 auto; background: #14141c; border-radius: 12px; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 16px; color: #00d4ff; }
  a { color: #00d4ff; }
  a.button { display: inline-block; background: #00d4ff; color: #001014; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-top: 16px; }
  .footer { margin-top: 32px; color: #6e6e7a; font-size: 12px; }
  ul { padding-left: 20px; }
  li { margin: 4px 0; }
</style>
</head>
<body>
  <div class="container">
    ${body}
    <div class="footer">
      respawn.kz · бронирование компьютерных клубов в Алматы<br>
      Если это письмо тебя не касается — игнорируй его.
    </div>
  </div>
</body>
</html>`;

export function renderHtml(body: string): string {
  return BASE_HTML(body.trim());
}

export function renderText(body: string): string {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}
