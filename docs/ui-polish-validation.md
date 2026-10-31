# Monorec: согласованный UX/UI-пакет, 31 октября 2026

## Реализовано

- Choice welcome B: заголовок «Что приготовим?», крупная монохромная версия существующей орбитальной иллюстрации, градиент в поверхность карточки, «Давай найдём идею» и «Из твоей книги рецептов». Один штрих #F5A66A, подпись оранжевая только в Dark, нейтральная в Light. CTA снаружи, без стрелки; служебные подписи и постоянная заметка удалены.
- Settings: четыре прежние группы без видимых заголовков, промежутки 28. Названия групп остаются RU/EN заголовками для screen reader, не объединяют кнопки в один элемент.
- MONOREC_THEMES и SETTINGS_THEMES используют одну базовую палитру. Danger/success, fallback THEMES, контексты и механизмы хранения не менялись.
- Tab Bar: общая капсула 72, внутренний padding 6, активная капсула 60, иконки 24 над подписями 11/14. Одно движение 200 мс ease-out с ReduceMotion.System; без пружины и очереди.
- Панель занимает место в layout, не накладывается на список. Сохранены прежний Web bottomInset=0 и native bottom inset, добавлены боковые safe-area insets. На Web сохранён механизм определения клавиатуры; на native — соответствующие Keyboard-события. Подписи с фиксированным размером сохраняют iOS Large Content Viewer.
- Routes/history/tabPress/tabLongPress/inert остаются в существующем Expo Router js-tabs. На повторное нажатие Choice работает прежний сброс welcome.
- Recipes: только главный заголовок `Monorec` → `monorec`. Onboarding: только декоративный chevron в основной кнопке. Иллюстрации онбординга и движения страниц не менялись.

## Изменённые файлы

Приложение:

- `src/app/(tabs)/index.tsx`, `recipes.tsx`, `settings.tsx`, `_layout.tsx`;
- `src/components/choice-art.tsx`, `monorec-tab-bar.tsx` (новый), `settings-list.tsx`, `onboarding.tsx`;
- `src/constants/theme.ts`, `src/constants/i18n.ts`, `src/styles.ts`.

Проверки:

- `e2e/ui-polish.spec.ts` (новый): согласованные тексты и отсутствие служебных подписей, 28px, доступные скрытые заголовки, размеры панели, выбор и переключение вкладок;
- `e2e/tab-bar.spec.ts` (новый): deep link, быстрые нажатия и resize 320/844/390 в обычном/reduced motion;
- существующие `e2e/choice.spec.ts`, `navigation.spec.ts`, `settings.spec.ts`, `home.spec.ts`, `about.spec.ts`, `shopping-design.spec.ts`: ожидания согласованных текста/цветов и проверки фокуса.

Документы: `docs/design/design-guide.md`, `docs/superpowers/plans/2026-10-31-ui-polish.md`, этот отчёт.

`CLAUDE_HANDOFF.md` был untracked до начала работы и не изменялся.

## Проверки

- Unit: `npm test` — **246 passed**, 0 failed/skipped; включая сохранение, backup, импорт, smart random, покупки и хеши оригинальных SVG.
- TypeScript: `npm run typecheck` — PASS, включая финальные тесты resize и длинного списка.
- Штатный ESLint: `npm run lint` — PASS. Также `eslint src --no-cache` — PASS.
- Дополнительный запуск ESLint напрямую на всём `e2e` выявил существующий false positive `react-hooks/rules-of-hooks` на Playwright callback `use` в неизменённом `fixtures.ts:31` и unused import в неизменённом `profile-backup.spec.ts`. Эти файлы и конфигурация не менялись. Этот дополнительный запуск не следует считать прошедшим.
- Расширенный E2E: основной прогон 132 сценариев завершился с 129 PASS и 3 устаревшими ожиданиями отсутствующих заголовков в Chromium (после исправления доступности заголовки существуют, но визуально скрыты). Эти три проверки прошли в повторном прогоне.
- **Финальный прогон дополнительных/повторных проверок: 12 PASS, 0 FAIL, 1.2 минуты**, Chromium + WebKit. В нём 6 повторов сценариев Settings из основного прогона и 6 новых сценариев (обычное/reduced motion, deep links/быстрые нажатия/resize и список 40 продуктов с сохранением отметки). Итого **138 различных test/project-сценариев прошли с учётом повторов**, это не один непрерывный зелёный запуск всех 138. Последняя карточка списка 40 продуктов полностью поднялась над панелью, отметка сохранилась после reload в обоих движках.
- Для E2E используется отдельная временная конфигурация и **сервер разработки**, не production export. Холодная компиляция dev bundle требует timeout 90 секунд во временной конфигурации; конфигурация проекта не менялась. После смены среды запуска sandbox ограничил браузерам localhost: потребовались существующий `PLAYWRIGHT_BROWSERS_PATH`, запуск проверок/сервера вне sandbox и адрес `http://localhost:4173` (сервер с `--localhost` слушает IPv6 ::1, а не IPv4 127.0.0.1). Никакие браузеры/пакеты не устанавливались.
- Первый red-прогон воспроизвёл отсутствие новой подписи/заголовков/капсулы; первые два запуска до готовности сервера дали connection refused. Позже проверки обнаружили отсутствие aria-selected; исправлено по установленному стандартному TabBar SDK 58. Первый расширенный dev-прогон имел timeout при холодной загрузке; повторный прогон с допуском 90s прошёл эти сценарии.
- Дополнительный тест 40 продуктов первоначально некорректно передавал массив option-fixture: установленный Playwright считает массив с объектом на втором месте fixture-tuple. Исправлено только тестовое объявление на `[items, { scope: 'test' }]`, как в существующих fixtures. Декодирование валидного массива отдельно проверено через shoppingConfig: 40 записей; код хранения не изменялся.
- Получены восемь PNG работающего приложения: Choice, Settings, Recipes в обеих темах и Settings на 320px. Просмотрены компоновка, единая поверхность, контраст, градиент, интервалы и резерв под панель. Это Chromium web-снимки, не native-скриншоты.
- Внешнее read-only ревью выявило пропущенные боковые insets, Large Content Viewer и семантические группы; всё исправлено. Повторное ревью не нашло конкретных блокеров. Это проверка исходников, не тест устройств.

Временные макеты и снимки находятся вне репозитория:
`C:/Users/GAYniy/.codex/visualizations/2026/10/02/01a0fe48-4424-7962-9cfe-5e87adce2b8b/monorec-stage-a/`.
Файлы `implemented-*.png` — приложение; `choice.png`, `settings.png` и прочие первоначальные PNG — макеты. Не смешивать их при оценке.

## Что не выполнялось и что остаётся

- Нет APK №7, EAS Build/Update, production export, PWA deploy, установки APK, commit или push. Эмулятор-5554/AVD не затронуты.
- Реальные Android с жестовой/трёхкнопочной навигацией и iPhone (native + установленная PWA) не проверены. WebKit с iPhone viewport — браузерная эмуляция, не замена устройству.
- На устройствах отдельно проверить горизонтальные safe areas, клавиатуру/возврат панели, последний продукт длинного списка, VoiceOver/TalkBack и iOS Large Content Viewer, системный Reduce Motion.
- Финальная иллюстрация ещё не предоставлена. Временная монохромная обработка изменяет только строку SVG при отображении; оригинальные asset/TS-файлы сохранены.
- Хранилища, keys, Recipe, SafeStore/ChunkedStorage, алгоритм выбора и импорт с сайтов не изменялись. Перед итогом проверен пустой diff для `src/context`, `src/hooks`, `src/utils`, `public`, app/EAS config и package/lock. `git diff --check` — PASS. HEAD остаётся ee09306 на stage-7.6-unified-backup; изменения не закоммичены.
- Существующие PNG-baselines намеренно не перезаписаны автоматически: смена палитры/панели/текстов требует отдельного контролируемого обновления визуальных эталонов. В этом прогоне проверяются поведение и новые снимки, pixel-diff @visual не заявляется пройденным.

## Документация API

Перед реализацией прочитаны [SDK 58 reference](https://docs.expo.dev/versions/v58.0.0/), [LinearGradient SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/linear-gradient/), [Expo JS tabs](https://docs.expo.dev/router/advanced/tabs/) и [Reanimated withTiming](https://docs.swmansion.com/react-native-reanimated/docs/animations/withTiming/).
Реальный SDK 58 экспортирует `BottomTabBarProps` с `emitter`/`navigateToTab` через `expo-router/js-tabs`; использованы установленные типы и штатный исходник TabBar, без старого предположения о `navigation` в custom renderer.
