# План проєкту

Позначки: [ ] — не зроблено, [x] — зроблено, 👤 — ручна дія власника.

## Етап 0 — Фундамент

- [x] Ініціалізувати Next.js (App Router, TypeScript strict, Tailwind, ESLint, src/, pnpm). Якщо create-next-app відмовляється працювати в непорожній директорії, згенеруй у тимчасовій папці й перенеси файли.
- [x] Prettier, скрипти lint/typecheck/test/test:e2e, Vitest, Playwright
- [x] Базовий layout, шрифти через next/font, заглушка головної
- [x] .gitignore, .env.example, README з описом проєкту
- [x] 👤 Створити репозиторій на GitHub, запушити код
- [x] GitHub Actions: lint + typecheck + test + build на кожен push/PR
- [x] 👤 Акаунт Vercel, імпорт репозиторію, перший деплой (preview + production)
- [x] 👤 Обрати і купити домен (Cloudflare Registrar; варіанти: імʼя.dev / .com / .me) — imsequencer.dev
- [x] 👤 Налаштувати DNS у Cloudflare → Vercel, перевірити HTTPS і редирект www ↔ apex
- [ ] 👤 Cloudflare Email Routing: hello@домен → особиста пошта
- [ ] Пояснити мені, як працює вся ланка: домен → DNS → CDN → хостинг → SSL

## Етап 1 — Прототип секвенсера

- [ ] Архітектура аудіо-движка в src/audio (опиши мені перед реалізацією)
- [ ] Інструменти: для MVP синтезовані барабани через Tone.js (kick, snare, hat, clap...), щоб не залежати від ліцензій семплів; 1 простий синт-трек
- [ ] Модель патерну: 8 треків × 16 кроків, BPM, swing
- [ ] Транспорт: play/stop, BPM, swing; пробіл = play/stop
- [ ] Zustand-стор, звʼязок UI ↔ движок
- [ ] UI сітки: клік/тач по клітинках, підсвітка поточного кроку синхронно зі звуком, керування з клавіатури
- [ ] Кодування патерну в URL (компактно, base64url) + декодування; шеринг посиланням
- [ ] Unit-тести: модель патерну, encode/decode
- [ ] Перевірка на iOS Safari (розблокування AudioContext, перемикач беззвучного режиму, фон/повернення у вкладку)

## Етап 2 — Головна і дизайн

- [ ] 👤 Мудборд: openai.com/codex, apple.com, awwwards.com, godly.website — обрати 3–5 референсів
- [ ] Дизайн-токени: кольори, типографіка (variable font), відступи, темна тема як основна
- [ ] Lenis + GSAP ScrollTrigger: секції з появою тексту, пінінгом, паралаксом
- [ ] Hero: шейдерна або 3D-сцена на R3F, ліниве завантаження, статичний фолбек
- [ ] Секція «Про мене»
- [ ] /projects: картки iOS-застосунків (контент-заглушки), можливо 3D-мокап iPhone
- [ ] Переходи між сторінками (View Transitions API, де підтримується)
- [ ] prefers-reduced-motion для всіх анімацій
- [ ] Адаптивність: mobile / tablet / desktop
- [ ] Контакти, футер, посилання на GitHub/LinkedIn/App Store

## Етап 3 — Полірування секвенсера

- [ ] Аудіо-реактивні візуали: Tone.Analyser (FFT) → uniforms шейдера/3D-сцени
- [ ] Пресети: House, Lo-fi, Techno, Hip-hop
- [ ] Експорт WAV (рендер через Tone.Offline)
- [ ] Експорт MIDI-файлу
- [ ] Мобільний UX: тач, розміри клітинок, орієнтація
- [ ] (опційно) Web MIDI: керування з MIDI-контролера
- [ ] Динамічне OG-зображення для кожного поширеного патерну (next/og)
- [ ] e2e-тест Playwright: відкрити секвенсер, увімкнути кроки, отримати посилання, відкрити його

## Етап 4 — SEO, аналітика, якість

- [ ] Metadata API для всіх сторінок, canonical URL
- [ ] sitemap.ts, robots.ts
- [ ] JSON-LD (Schema.org): Person (головна), WebApplication (секвенсер), BlogPosting (статті)
- [ ] OG-зображення для всіх ключових сторінок
- [ ] 👤 Google Search Console: верифікація через DNS, подати sitemap
- [ ] 👤 Bing Webmaster Tools: імпорт із Search Console
- [ ] Аналітика: Plausible або Umami (без cookie), GA4, Microsoft Clarity. Поясни, які з них потребують cookie-банера (GDPR) і чи він потрібен.
- [ ] Кастомні події: play, share, export_wav, export_midi, preset_selected
- [ ] Sentry для помилок (окремо — помилки аудіо)
- [ ] Lighthouse CI у GitHub Actions з порогами з CLAUDE.md
- [ ] Аудит доступності (axe), виправлення
- [ ] Пояснити мені основи SEO на прикладі мого сайту: індексація, ранжування, Core Web Vitals, як читати звіти Search Console

## Етап 5 — Блог, i18n, запуск

- [ ] MDX: список статей, сторінка статті, підсвітка коду, час читання
- [ ] RSS-фід
- [ ] Чернетки перших статей (я пишу, ти допомагаєш структурувати й редагувати):
  - «Як iOS-розробник зробив музичний секвенсер у браузері»
  - «Точний таймінг у Web Audio API: чому не setTimeout»
  - «SwiftUI vs React: анімації очима iOS-розробника»
- [ ] Двомовність uk/en: маршрути /[locale], hreflang, локалізовані metadata і sitemap
- [ ] Чекліст запуску: Product Hunt, Show HN, Reddit (r/webdev, r/WeAreTheMusicMakers), DOU, LinkedIn, кроспост на dev.to/Medium з canonical на мій сайт
- [ ] Через 2–4 тижні: аналіз Search Console + аналітики, план нових статей під реальні запити

## Етап 6 — Розширення (опційно)

- [ ] Supabase: авторизація, збереження патернів, публічна галерея
- [ ] PWA: встановлення на телефон, офлайн-режим
- [ ] Колаборативний режим у реальному часі (WebSockets / Supabase Realtime)
- [ ] Альтернативний деплой на власний VPS (Hetzner + Docker + Caddy) заради DevOps-досвіду
- [ ] Self-hosted Umami на VPS
