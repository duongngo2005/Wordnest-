# WordNest — Complete Progress & Statistics Audit

- **Ngày kiểm toán:** 2026-10-19 (snapshot DB lúc 14:04:21 ICT / 07:04:21Z)
- **Phạm vi:** source checkout hiện tại, Prisma schema, truy vấn DB chỉ đọc, `GET /api/progress`, typecheck và bằng chứng visual đã có từ dev server đang chạy.
- **An toàn:** không chạy migration, không gọi endpoint ghi dữ liệu, không tạo `ReviewLog`/`PracticeAttempt`, không sửa source hoặc database. Tài liệu này là file duy nhất được tạo trong pha audit.
- **Lưu ý checkout:** worktree đã rất dirty trước audit (103+ file thay đổi/untracked). Đặc biệt `ProgressDashboard.tsx`, `progress-service.ts`, `OnlineTimePanel.tsx` và test liên quan chưa commit. Kết luận “current checkout” không đồng nghĩa “đã phát hành”.

## Quy ước bằng chứng

| Trạng thái | Nghĩa |
|---|---|
| **VERIFIED** | Đọc được source và/hoặc đối chiếu raw DB với service/API ở snapshot. |
| **LIKELY ISSUE** | Có cơ chế nguồn hoặc số liệu cho thấy rủi ro rõ ràng, nhưng chưa tái tạo được toàn bộ edge case trên fixture cô lập. |
| **DESIGN OPINION** | Nhận định UX/visual; không phải lỗi dữ liệu. |
| **NOT VERIFIED** | Không có đủ fixture, browser E2E cô lập hoặc quan sát runtime để khẳng định. |

---

## 1. Executive Summary

WordNest có một nền tảng thống kê tương đối rõ ràng: FSRS (`Flashcard` + `ReviewLog`) tách khỏi thực hành (`PracticeAttempt`), quiz aggregate (`QuizAttempt`) và thời gian sử dụng (`DailyOnlineActivity`). **VERIFIED:** hành động review theo lịch là entry point duy nhất cập nhật scheduler và tạo `ReviewLog`; quiz/typing chỉ tạo evidence, không đổi lịch FSRS ([`src/services/fsrs/fsrs-service.ts:116-209`](../../src/services/fsrs/fsrs-service.ts), [`src/services/vocabulary/quiz-service.ts:1324-1508`](../../src/services/vocabulary/quiz-service.ts)).

Snapshot hiện tại có 1,095 canonical flashcard, 1,095 membership, 2,073 review events, 1,061 practice attempts, 61 quiz summaries, 12 story, 0 lesson. Không có membership/log/attempt mồ côi. Có một nhóm duplicate lịch sử gồm 2 card được giữ không canonical; đây là hành vi chủ ý của schema, không phải bằng chứng corruption.

Điểm mạnh: global/folder progress dedupe flashcard theo ID; review current-day phân biệt 115 thẻ unique với 228 event; quiz first-pass và retry được tách; tracker thời gian có visibility/focus/idle guard. Điểm cần ưu tiên: tên “mastery” ở Library thực chất là tỷ lệ state `KNOWN`, không phải chứng minh đã nhớ; `FSRSService.getSpacedRepetitionStats()` dùng local host date/UTC keys khác study-timezone; Progress global tải toàn bộ `ReviewLog` và quét lại 14 lần; trang Progress quá nhiều panel đồng cấp; mobile có global horizontal overflow từ header (409px trên viewport 390px).

Với “Thời gian sử dụng”, dữ liệu nguồn dùng giây chính xác và tổng 14 ngày là tổng giây trước khi render. Do từng ngày dùng `floor(seconds / 60)` còn tổng cũng floor sau khi cộng, tổng hiển thị có thể lệch tổng các phút từng ngày. Đây là **VERIFIED, không phải double-counting nguồn**; UI cần nói rõ cách làm tròn hoặc dùng cùng một policy trình bày.

## 2. System Architecture

```mermaid
flowchart LR
  A[Hành vi người học] --> B1[Scheduled review UI]
  A --> B2[Quiz / Global-Due typing]
  A --> B3[Foreground + recent interaction]
  B1 --> C1[POST /api/cards/:id/review]
  B2 --> C2[POST /api/decks/:id/quiz or practice API]
  B3 --> C3[POST /api/activity/online]
  C1 --> D1[FSRSService.processScheduledReview]
  C2 --> D2[QuizService.submitQuizResult]
  C3 --> D3[OnlineActivityService.recordActiveSeconds]
  D1 --> E1[(Flashcard + ReviewLog)]
  D2 --> E2[(QuizAttempt + PracticeAttempt)]
  D3 --> E3[(DailyOnlineActivity)]
  E1 --> F[ProgressService.getAnalytics]
  E2 --> F
  E3 --> F
  F --> G[/progress SSR and GET /api/progress]
  G --> H[ProgressDashboard / heatmap / bars]
```

| Luồng | Client/API | Service + persistence | Aggregation/UI | Cơ chế cập nhật/caching |
|---|---|---|---|---|
| FSRS review | `StudyMode` → `POST /api/cards/[id]/review` | `FSRSService.processScheduledReview`; transaction cập nhật `Flashcard` và tạo một `ReviewLog`, idempotent bằng `reviewEventId` | `ProgressService`, Home, review queue, Progress heatmap/activity/rating | On-demand SSR/API; `/progress` `revalidate=0`; không tìm thấy analytics cache/background rollup. |
| Deck/Story/Lesson Quiz | `QuizRunner` → `POST /api/decks/[id]/quiz` | `QuizService.submitQuizResult`; xóa session one-use, tạo 1 `QuizAttempt` first-pass + nhiều `PracticeAttempt` | Practice evidence, Mistake Bank, Progress practice cards | On submit; `QuizSession` là snapshot tạm. |
| Global/Due typing | `/practice/typing` → practice route | `GlobalTypingPracticeService` tái dùng `QuizSession`/`QuizService`; mode phân biệt `global_typing`, hint, `due_typing` | Global typing panel; evidence dùng chung | On submit; Due typing chỉ đọc queue FSRS, không scheduler mutation. |
| Usage time | `OnlineActivityTracker` trong root layout → `/api/activity/online` | daily upsert/increment `DailyOnlineActivity.activeSeconds` | `ProgressService.buildOnlineTimeAnalytics` → global Progress | 60s interval, blur/hidden/pagehide beacon; Progress router refresh sau report thành công. |
| Home plan | SSR `src/app/page.tsx` | `TodayLearningService`, `FolderService`, `ReviewLog.groupBy` | TodayPostcard/Library | On-demand SSR, separate projection from Progress. |

**Phụ thuộc và timezone.** `getServerStudyTimezone()` cung cấp timezone cho Progress/API/page; helper chuẩn hoá sang `Asia/Ho_Chi_Minh` nếu invalid ([`src/lib/study-timezone.ts:1-58`](../../src/lib/study-timezone.ts)). `ProgressService` lấy deck membership, history và ledger song song ([`progress-service.ts:601-709`](../../src/services/vocabulary/progress-service.ts)); không có Redis/cache/pre-computed job được phát hiện.

## 3. Complete Metric Inventory

| Nhóm / metric hiển thị hoặc có service | Nguồn chính | Nơi dùng | Trạng thái / phân loại |
|---|---|---|---|
| Tổng thẻ; Mới/Đang học/Đang ôn/Học lại | `Flashcard`, membership | Progress, Deck/Library | **VERIFIED — CORE** |
| Due now, overdue, forecast 7 ngày | canonical card `state`, `due` | Home, Progress, review queue | **VERIFIED — CORE** |
| Đã ôn hôm nay: unique cards / FSRS events | `ReviewLog` | Home, Progress header | **VERIFIED — CORE** |
| 14-day scheduled review activity; ratings | `ReviewLog` | Progress bar/rating bar | **VERIFIED — SUPPORTING** |
| Heatmap 1y/3m, current/longest streak, active days | `ReviewLog` local-date buckets | Progress | **VERIFIED — SUPPORTING** |
| First-pass / retry accuracy; recognition / production; assessed / weak cards | `PracticeAttempt` + evidence classifier | Progress, Mistake Bank, focused practice, Home weak count | **VERIFIED — CORE/SUPPORTING** |
| Quiz score, total, accuracy, history | `QuizAttempt` | Quiz result/deck history; `practice.sessions` | **VERIFIED — SUPPORTING** |
| Global typing total/correct/incorrect/accuracy/cards/sessions/hint/mistakes/trend | filtered `PracticeAttempt` | Global Progress panel | **VERIFIED — SUPPORTING** |
| Due-only typing availability | FSRS due queue | Home CTA / typing page | **VERIFIED — workflow, not an aggregate metric** |
| Deck/folder totals, due, weak, per-deck first-pass, recent reviews | membership + evidence + review log | Library, Home, Progress drill-down | **VERIFIED — CORE at scoped level** |
| Shared/unassigned vocabulary | membership cardinality | Library/unassigned page/deletion impact | **VERIFIED — SUPPORTING** |
| “Mastery rate” / completed deck | `status === KNOWN` | Library/folder summary | **VERIFIED calculation; P1 misleading label** |
| Stories/lessons created | `Story` / `Lesson` | content pages, not Progress aggregate | **VERIFIED stored content; reading progress NOT IMPLEMENTED** |
| Usage: today, 14-day total, active days, daily bars | `DailyOnlineActivity` | Global Progress only | **VERIFIED — SUPPORTING context metric** |
| FSRS mature count, review accuracy, legacy 7d forecast | `FSRSService.getSpacedRepetitionStats` | no current caller found | **VERIFIED implemented but NOT DISPLAYED** |
| Retention estimate, difficulty/stability dashboard, lapses chart, review frequency chart | fields exist but no Progress rendering | — | **NOT IMPLEMENTED as user-facing analytics** |
| Story read/completed, reading sessions, lookup/translation counts | no persistent models/aggregates | — | **NOT IMPLEMENTED / NOT VERIFIED for external telemetry** |

## 4. Metric Calculation Catalogue

| Metric | Formula / unit / window | Timezone, de-dup & update | Evidence / verdict |
|---|---|---|---|
| `today.due` | `state > 0 && due <= now`; includes overdue, excludes new | instant `now`; unique by canonical card after `Map(card.id)` global/folder | [`progress-service.ts:355-366`](../../src/services/vocabulary/progress-service.ts). **VERIFIED**. |
| `today.overdue` | `state > 0 && due < local start-of-today` | supplied study timezone | same. **VERIFIED**. |
| `reviewedCards` / `reviewEvents` | distinct `ReviewLog.cardId` / raw event count within local day inclusive | review logs are events; multiple reviews same card count once vs all | lines 365-366, 535-540. **VERIFIED**. |
| 14d review activity | one bucket/day = count of all `ReviewLog` whose local date key equals day | includes today; zeros materialised; events not unique cards | lines 381-391. **VERIFIED**. |
| Upcoming due | for 7 local date buckets: `state>0 && due>now && start<=due<=end` | today bucket means later-today only; overdue/current due omitted because CTA already handles them | lines 393-401. **VERIFIED**. |
| State distribution | cardinality of current `Flashcard.state` after global/folder dedupe | `0,1,2,3` mapped new/learning/review/relearning | lines 368-379. **VERIFIED**. |
| Ratings | count all scoped `ReviewLog` grouped in application by 1..4 | all time in scope, no date filter | lines 477-482. **VERIFIED**. |
| Heatmap / streak | local-date buckets; current streak starts today, else yesterday; longest over all active dates | active day = ≥1 review event; visible 364d grid but longest all loaded logs | [`review-activity-service.ts:67-297`](../../src/services/vocabulary/review-activity-service.ts). **VERIFIED**. |
| First-pass/retry practice | `PracticeAttempt.attemptNumber=1/2`, grouped per card and axis; accuracy `correct/total*100` (1 decimal) | evidence filters assisted global correct from general evidence; first-pass and retry distinct | [`practice-evidence-service.ts:372-515`](../../src/services/vocabulary/practice-evidence-service.ts), `:1436-1503`. **VERIFIED**. |
| Weak card | at least 2 first-pass attempts; classifier considers latest outcome and last 5 first-pass outcomes; Smart priority adds due/lapses/low stability/slow-response signals | canonical card evidence; shown max 8 sorted priority | lines 421-483, 578-669; Progress 413-463. **VERIFIED**; not a mastery score. |
| Quiz result | session must contain exactly one first-pass answer each; aggregate only first-pass `score/total/accuracy`; retry only `PracticeAttempt` | transaction deletes session before writes, preventing duplicate submit | [`quiz-service.ts:1328-1508`](../../src/services/vocabulary/quiz-service.ts). **VERIFIED**. |
| Global typing | attempts only modes global/hint, `attemptNumber=1`; 14d daily, 7d-vs-prior accuracy, top 5 incorrect by canonical card | one global `PracticeAttempt` is one first attempt; `uniqueCards` Set(card ID), sessions Set(session ID) | [`progress-service.ts:234-306`](../../src/services/vocabulary/progress-service.ts), `:663-707`. **VERIFIED**. |
| Usage time | 14 exact date keys; day seconds=`max(0,floor(row.activeSeconds))`; total=sum raw seconds; active days=`seconds>0` | ledger one row/date primary key, dates in study TZ at report time | lines 309-331; schema `:240-250`. **VERIFIED**. |
| Library “mastery” | `knownCount / totalCards * 100`, where `KNOWN` maps FSRS review state | deck membership totals; folder dedupes `id` | [`folder-service.ts:92-161`](../../src/services/vocabulary/folder-service.ts). **VERIFIED calculation; semantics IMPROVE**. |

`practice.sessions` is `quizAttempts.length` ([`progress-service.ts:546-559`](../../src/services/vocabulary/progress-service.ts)), so it means persisted quiz submission summaries in scope, **not all practice/typing sessions**. It is not currently visibly labelled as “all sessions” in the inspected dashboard, but must not be reused as such.

## 5. Database & API Verification

### Read-only snapshot

| Check | Raw DB | Service / API | UI | Match |
|---|---:|---:|---|---|
| Canonical cards / memberships | 1,095 / 1,095 | global `totalCards=1,095` | source renders `analytics.today.totalCards` | **VERIFIED DB↔service↔source** |
| Due / overdue | 57 / 0 | API 57 / 0 | source renders both | **VERIFIED DB↔API↔source** |
| Reviews today event / unique card | 228 / 115 | API 228 / 115 | source labels both separately | **VERIFIED** |
| State 0/1/2/3 | 677/57/361/0 | same API values | horizontal bars bind `states` | **VERIFIED** |
| Online daily seconds | 173 + 3,513 = 3,686 | API day values, today=3,513, total=3,686, active=2 | renderer uses same fields | **VERIFIED DB↔API↔source** |
| Global typing first attempts | 206; correct 73; incorrect 133 | API 206/73/133, 35.4%, 97 cards, 13 sessions | panel directly binds values | **VERIFIED** |
| Orphans | ReviewLog 0; PracticeAttempt 0; membership 0 | n/a | n/a | **VERIFIED integrity** |

`GET /api/progress` returned HTTP success and the same scalar values as direct `progressService.getGlobalAnalytics('Asia/Ho_Chi_Minh')` in the same audit window. The current web UI was observed on the running dev server before the audit boundary; exact displayed data cannot be treated as an immutable snapshot because its root tracker legitimately increments usage time. Thus exact **raw→visible DOM at the same timestamp is NOT VERIFIED**, while binding code is verified.

### Edge-case coverage assessment

| Edge case | Evidence | Status |
|---|---|---|
| Zero days | 14-day arrays materialise absent dates with 0 | **VERIFIED source** |
| Multiple reviews same card/day | `Set(cardId)` vs raw event length | **VERIFIED source + live divergence 115/228** |
| Shared card in several decks | global/folder `Map(card.id)` dedupe; deck intentionally counts membership | **VERIFIED source; live DB has 0 shared cards, so multi-membership runtime result NOT VERIFIED** |
| Historical duplicates | 1 identity has no canonical card, count 2; no auto merge | **VERIFIED DB/schema** |
| Retry after error | server permits at most one retry per failed first-pass, stores `attemptNumber=2` | **VERIFIED source/test inventory** |
| Abandoned quiz | only `QuizSession`; no `QuizAttempt` until submit | **VERIFIED source** |
| Midnight/timezone | review uses helpers; online report assigns entire report at flush date | **LIKELY ISSUE for a session spanning midnight** |
| Multiple tabs/crash/offline | no server-side session/tab idempotency for online increments | **LIKELY ISSUE / NOT VERIFIED fixture** |

## 6. FSRS Statistics Audit

**Integrity path.** `processScheduledReview` verifies `reviewEventId`, optimistic `schedulerVersion`, due state (non-new cannot be reviewed early), calculates with ts-fsrs, writes scheduler fields and `ReviewLog` in one transaction ([`fsrs-service.ts:121-220`](../../src/services/fsrs/fsrs-service.ts)). **VERIFIED:** `Again` still writes a review event and is therefore a completed event for activity/rating, but it is not a correct answer. The dashboard appropriately labels it as a rating, not accuracy.

**Due semantics.** Progress and `getReviewQueue` both use non-new `due <= now`, with membership relations for scoped queues ([`fsrs-service.ts:246-294`](../../src/services/fsrs/fsrs-service.ts)). Overdue is a subset `due < local day start`. New cards are separate queue capacity, explicitly excluded from `today.due`; therefore “57 thẻ cần ôn” does not include new cards. **VERIFIED.**

**Risk: competing stats implementation.** `getSpacedRepetitionStats` independently computes date boundaries with `Date#setHours` and forecast keys with `toISOString()` ([`fsrs-service.ts:299-419`](../../src/services/fsrs/fsrs-service.ts)). This differs from Progress helpers that respect a chosen IANA timezone. It currently has no caller in inspected app source, so no visible mismatch was found; if exposed later, it is a **LIKELY ISSUE** at timezone boundaries. Its `reviewAccuracy = Good/Easy / all ReviewLogs` is a rating distribution proxy, not retention.

**No false retention/mastery claim.** Progress code explicitly says it reports observed activity/evidence, not synthetic retention/mastery ([`progress-service.ts:334-337`](../../src/services/vocabulary/progress-service.ts)). No user-facing aggregate stability/difficulty/retention chart was found. That restraint is correct. FSRS `stability`, `difficulty`, `lapses`, `reps`, `scheduledDays` are persisted but not dashboard metrics.

## 7. Practice & Quiz Statistics Audit

| Topic | Verified behaviour | Accuracy / semantic conclusion |
|---|---|---|
| Regular quiz | Server scores snapshot session; every question has exactly one first pass; retry only after an incorrect first pass | **VERIFIED:** no duplicate session submit because `deleteMany` claim is transactional. |
| Quiz summary | `QuizAttempt` stores first-pass only; `PracticeAttempt` stores first + retry | **VERIFIED:** quiz accuracy is question-attempt accuracy, not unique vocabulary mastery. |
| Global typing | canonical vocabulary only (`canonicalVocabularyIdentity isNot null`); every selected card has a safe Vietnamese cue | **VERIFIED** (`global-typing-service.ts:211-363`). |
| Due typing | uses `fsrsService.getReviewQueue({newLimit:0})`, snapshots questions, does not schedule review | **VERIFIED** (`:366-428`); it does not reduce due count. |
| Hint | changes stored question mode to `global_typing_hint`; assisted correct is excluded from general evidence queries | **VERIFIED**, fairer than treating hint correct as unassisted recall. |
| Mistake Bank / Smart Practice | weakness uses first-pass windows; priority has documented tiers + FSRS bonus | **VERIFIED**, but count is a targeted practice signal, not a spelling-only diagnosis. |
| Error repetition | global selection counts repeated same normalized wrong answer per card, not every wrong attempt identically | **VERIFIED** (`global-typing-service.ts:286-318`). |

**Likely semantic ambiguity:** global typing panel calls all first attempts “Đã luyện” and uses a single accuracy. Hint-assisted incorrect is included; assisted correct is separately exposed. This is transparent enough, but the single headline should not be read as a pure no-hint recall metric. It already exposes “Đúng không gợi ý”, so recommendation is **KEEP with clearer hierarchy**, not new metric work.

Stories have content persistence and story-cloze can produce `PracticeAttempt`; no schema field records story opened/read/completed, words looked up, translation use or reading duration. **VERIFIED NOT IMPLEMENTED** for reading analytics. Lessons have the same absence and snapshot has 0 lesson rows.

## 8. Activity & Usage Time Audit

### Tracking mechanism

`OnlineActivityTracker` is mounted globally ([`layout.tsx:27-95`](../../src/app/layout.tsx)). It counts only while document is visible and focused; accepts keyboard/pointer/scroll/touch interaction; caps uninterrupted measurement at 60s and idleness at 120s; flushes each 60s and on blur/hidden/pagehide ([`OnlineActivityTracker.tsx:39-124`](../../src/components/analytics/OnlineActivityTracker.tsx)). Server validates 1–75 seconds and increments the per-date row ([`online-activity-service.ts:4-20`](../../src/services/online-activity-service.ts)).

| Question | Finding |
|---|---|
| App open vs active | **VERIFIED:** it is foreground + focused + recently interacting, not merely open. |
| Idle, tab switch, sleep | **VERIFIED:** idle cap and visibility/blur stop future accrual; sleep gap is capped to 60s. |
| Reload/close/crash | **VERIFIED:** pagehide tries beacon; **NOT VERIFIED:** delivery after abrupt crash/network failure. No local durable queue/retry. |
| Multiple tabs | **LIKELY ISSUE:** each tab has independent tracker and increments the shared day; overlap may double count. |
| Midnight | **LIKELY ISSUE:** a pending interval is attributed when server handles a flush via `getTodayDateKey`; it is not split by calendar boundary. |
| Semantics | **VERIFIED:** schema comment calls it foreground/recently-active usage, not learning evidence. “Thời gian sử dụng” is more accurate than “Thời gian online” or “thời gian học”. |

### Rounding cross-check

Raw snapshot: 2026-10-18 = 173s, 2026-10-19 = 3,513s; total = 3,686s. Render function floors each value to minutes (`floor(seconds/60)`) and floors the raw aggregate independently ([`OnlineTimePanel.tsx:10-18`](../../src/components/progress/OnlineTimePanel.tsx)). Thus daily labels are 2m + 58m = 60m while total label is 61m. The same mechanism explains a historical-looking “2m + 56/57m vs 59m/1h” discrepancy.

**VERIFIED conclusion:** source data is consistent (raw seconds are summed once); displayed rounded values need not add up. This is a presentation/expectation issue, not evidence of duplicate ledger rows—the `date` primary key prevents duplicate daily records.

## 9. Global Vocabulary Counting Audit

The model separates canonical `Flashcard` from `DeckVocabularyMembership`; schema documents that membership never owns FSRS/history ([`schema.prisma:53-115`](../../prisma/schema.prisma)). Progress loads cards through membership, then dedupes canonical IDs for global/folder, while deck insights deliberately retain membership cardinality ([`progress-service.ts:355-359`, `:451-531`](../../src/services/vocabulary/progress-service.ts)).

| Concept | Snapshot | Meaning / result |
|---|---:|---|
| Canonical flashcards | 1,095 | global vocabulary records, includes none unassigned in current DB. |
| Deck memberships | 1,095 | card placements; happens to equal card count now. |
| Shared cards | 0 | no live multi-deck case to numerically cross-check; source handles it. |
| Vocabulary identities | 1,094 | 1,093 canonical identities + one preserved historic duplicate group. |
| Cards without canonical identity | 2 | historic group count=2; no automatic reconciliation, by design. |
| Unassigned cards | 0 | query `deckMemberships: { none: {} }`; legacy `deckId` not used for membership totals. |

No join multiplication was found in global Progress: review log is queried directly by card ID and aggregation dedupes cards before counts. In a *deck* projection, shared card history is intentionally visible in each deck containing it; summing deck cards or deck review figures across decks therefore must not be advertised as a global unique total. **VERIFIED source; runtime shared case NOT VERIFIED.**

## 10. Complete Chart Inventory

| Chart / location | Source and axes | Handling | Verdict |
|---|---|---|---|
| Home “Tiến độ hôm nay” native `<progress>` | reviewed unique cards / (`reviewed + current due`) | denominator changes as due queue changes; no chart trend claim | **KEEP**; progress-to-today indicator, not historical completion. |
| Review activity heatmap, Progress | X = Mon–Sun grid, 3m/1y; color = review event count/day | zeros/future explicitly represented; dynamic 0–4 intensity, detail panel + optional table | **KEEP**, but intensity is relative to visible max, not absolute workload. |
| Usage 14-day mini columns, Progress global | X = last 14 date keys; Y = active seconds relative to max day | zeros as 2px baseline; column selection announces exact formatted day | **KEEP after current checkout change**; no duplicate full list. |
| “7 ngày tới” vertical bars | date vs cards due later than now | zero preserved, total text, collapsible raw data list | **KEEP**; forecast should retain wording “từ bây giờ”. |
| “Hoạt động ôn theo lịch” vertical bars | last 14 local dates vs FSRS `ReviewLog` events | zero preserved; labels sampled | **KEEP**; event count correctly distinct from unique cards. |
| “Vòng đời SRS” horizontal bars | current state category vs card count | percentages relative to largest category, count + share | **KEEP** as composition comparison, but direct counts are primary. |
| “Đánh giá khi ôn” horizontal bars | FSRS rating vs all-time review-event count | totals visible, semantic colors per rating | **KEEP**; must not call accuracy/retention. |
| Global typing daily grid | 14 date cells show count + per-day first-attempt accuracy | null shows dash; no chart scale | **MERGE/COMPACT (DESIGN OPINION):** table-as-chart is dense and duplicates headline. |
| Quiz/Study/Free practice progress bars | current index / question/card total | in-flow session progress, no aggregate analytics | **KEEP**, outside dashboard analytics. |

Search covered `role="img"`, chart/heatmap terms, CSS width bars, SVG/canvas usages. No pie/donut, line, area, canvas, scatter, or retention chart was found. SVG in Home is decorative postmark, not statistics.

## 11. Chart Accuracy & Visualization Review

| Current | Best alternative / remove option | Accuracy & UX assessment |
|---|---|---|
| Heatmap + selected day + hidden table | Keep; table is accessibility fallback rather than redundant default | **VERIFIED functional semantics; DESIGN OPINION:** appropriate for annual consistency. Dynamic color needs exact detail because color has no fixed numeric threshold. |
| 14d FSRS bar | Keep bars, not line/pie | **DESIGN OPINION:** discrete daily event volume compares well as bars; 14d data detail list is useful fallback. |
| 7d due bar | Keep bars | **VERIFIED:** forecast comes from actual current `due`, not synthetic retention forecast. |
| Usage bar + daily-detail interaction | Keep just compact bars + selected detail | **VERIFIED current checkout:** satisfies non-duplication goal; a full 14-row list should remain absent by default. |
| SRS/rating bars | Keep horizontal bars, not donut | **DESIGN OPINION:** category labels/counts remain legible and avoid false precision. |
| Global typing 14-cell grid | Compact to a small bar or put below an expandable detail | **DESIGN OPINION:** eight headline cards + another 14 cells compete with core FSRS section. |

Accessibility: heatmap buttons expose date/count via `aria-label`, offer selected details and a table; generic bar charts use `role="img"` plus full concatenated textual description and data details. Usage day columns are real buttons with `aria-pressed` and `aria-live` detail ([`OnlineTimePanel.tsx:69-115`](../../src/components/progress/OnlineTimePanel.tsx)). **VERIFIED source.** Heatmap cells (14–16px) and usage columns (42px observed at 390px) are below 44px preferred touch target: **LIKELY ISSUE** for touch ergonomics, despite keyboard accessibility.

## 12. UI/UX Audit

**Visual evidence.** Existing dev-server observation rendered `/progress` HTTP 200 at desktop 1440px and mobile 390px. Desktop had no global overflow and date selection in usage chart worked; mobile `documentElement.scrollWidth=409` for `innerWidth=390`, traced to header navigation, not contained heatmap. The usage grid uses two rows on mobile and individual buttons measured 42×96px. A cloned-db Playwright E2E attempt did not start because launcher deliberately detected the existing server at port 3000; no destructive workaround was used. Therefore visual QA is **partial, not passed**.

| Area | Assessment |
|---|---|
| Visual language | **VERIFIED source/visual:** warm cream `#FAF6EE`, dark text, terracotta accent, paper surfaces are consistent with WordNest. |
| Hierarchy | **DESIGN OPINION:** Today / review decision is strong, but heatmap, usage, attention, forecast, practice, typing, activity, states, ratings and drilldown are too many peer panels for a personal daily page. |
| Duplication | **VERIFIED:** the new usage panel contains summary + a single chart, selection detail only; it no longer defaults to duplicated 14-day full list. Heatmap table is a deliberate accessibility fallback. |
| Borders/icons | **DESIGN OPINION:** the dashboard has frequent 2px borders, hard shadows and icons. It is branded, but density reduces calm scanning; simplify secondary panels first, not core CTA. |
| Responsive | **VERIFIED failure:** mobile horizontal overflow exists; **LIKELY ISSUE:** small heatmap/usage target sizes. |
| Color/accessibility | **VERIFIED source:** text alternatives exist for charts. **NOT VERIFIED:** measured contrast ratios, screen-reader traversal, reduced-motion behavior and full keyboard visual focus in real browser. |

## 13. Information Redundancy

| Pair / repetition | Same data? | Finding / action |
|---|---|---|
| Usage summary + 14-day columns + full daily list | same raw daily ledger | **VERIFIED:** current checkout has no default full list. Keep three summary numbers + columns; selected-day detail only. |
| Home “đã ôn” and Progress “đã ôn” | same concept (unique cards today) | **Not harmful:** Home is action context; Progress adds event count/analysis. Keep labels consistent. |
| Heatmap + 14d review bars | both ReviewLog but different question | **KEEP both:** year/3m consistency vs short-term daily volume. UI should continue distinguish “lịch sử” from “14 ngày”. |
| `reviewedCards` vs `reviewEvents` | different units | **KEEP both:** snapshot live 115 vs 228 proves why merging would hide repetitions. |
| Practice capability + first-pass summary | same evidence, different synthesis | **DESIGN OPINION:** capability cards are primary; overall first-pass card is supporting and can be collapsed on small screens. |
| Global typing eight cards + 14 daily cells + mistakes | partially overlapping first-attempt data | **DESIGN OPINION:** retain headline, one trend, frequent mistakes; defer day grid to details. |
| Deck/folder cards and global totals | scope changes | **KEEP:** not redundant if scope is labelled; never sum deck figures as global. |

## 14. Missing & Misleading Analytics

| Finding | Status | Why it matters / accurate label |
|---|---|---|
| “Mastery rate” = current `KNOWN` rate | **VERIFIED misleading semantic** | Rename to “Tỷ lệ thẻ ở trạng thái ôn” or explain it is FSRS state, not known-for-life mastery. |
| Usage is presented as learning time | **VERIFIED risk if labelled that way** | Use **Thời gian sử dụng** / “WordNest mở và hoạt động”, never “thời gian học tập”. |
| Quiz / review total may look like words learned | **VERIFIED risk** | Explicitly retain “lượt”, “thẻ unique”, “FSRS event” labels. |
| Review rating distribution as performance | **VERIFIED risk** | It is rating choice behavior, not validated retention. |
| Global typing accuracy as mastery | **VERIFIED risk** | It is first-attempt task accuracy in a selected queue; hint state and selection bias matter. |
| Reading progress | **VERIFIED missing** | No durable data exists; do not fabricate completion/reading-duration dashboard. |
| FSRS retention/stability visual | **NOT IMPLEMENTED** | Fields exist, but adding one needs product semantics and validation, not merely a chart. |
| Goal/target or independent daily study activity | **NOT IMPLEMENTED** | No goal model discovered; do not infer it from app usage. |

## 15. Recommended Optimized Layout

### Minimal version (daily use)

1. **Hôm nay:** Due now, unique reviewed today, overdue only when nonzero, primary review CTA.
2. **Lịch ôn:** heatmap/streak *or* short 14d review bars as one primary temporal surface; keep the other collapsed/secondary based on user intent.
3. **Cần hành động:** up to 5 weak cards and seven-day due forecast.
4. **Thực hành:** recognition/production first-pass cards, one short link to focused practice.
5. **Thời gian sử dụng:** three figures + compact 14d column chart; selected day gives detail, no full list.

### Detailed version (on demand)

- SRS state distribution, all-time rating distribution, folder/deck drilldown.
- Global typing: headline accuracy/unassisted correct, frequent mistakes, then optional daily table/trend.
- Practice axis/retry details and evidence explanation.

This keeps operational decisions (what to review now, whether habit is intact, which cards need attention) first. It does **not** invent retention, reading completion or a goal score for data the system does not currently collect.

## 16. Improvement Backlog

| Priority | Problem / evidence | Recommended change (not implemented) | Files likely affected | Risk / verification |
|---|---|---|---|---|
| **P0** | No verified incorrect aggregate data in snapshot | No data repair. Preserve integrity constraints and add regression fixture for shared-card global counts before relying on multi-deck UI. | progress/evidence tests | No migration; clone DB test with shared membership. |
| **P1** | `masteryRate` reflects `KNOWN`, not mastery | Relabel across Library/folder, document state semantics. | `folder-service`, `FolderLibrary`, deck/folder views | Copy/UI-only; source tests + visual. |
| **P1** | Usage daily rounded minutes need not equal rounded total | Use explicit “tổng tính từ giây” copy or one documented rounding policy; retain raw seconds aggregation. | `OnlineTimePanel` only | No migration/calculation rewrite; fixture 59+59 seconds etc. |
| **P1** | Legacy FSRS stats uses host local/UTC, unlike study timezone | Either retire unused method or make it consume `study-timezone` helpers before exposing it. | `fsrs-service`, tests | Regression at UTC/local midnight; no migration. |
| **P1** | Online usage can double count tabs / crosses midnight in one flush | Decide whether this metric needs session/tab idempotency and day splitting; otherwise document as approximate usage. | tracker/service/schema only if product chooses precision | Higher complexity, migration only if session ledger added. |
| **P2** | Progress has too many equal-weight panels | Apply minimal/detailed information architecture; compact Global typing day grid. | `ProgressDashboard` | UI regression; desktop/mobile/a11y screenshot checks. |
| **P2** | Mobile global overflow and <44px chart targets | Fix Header overflow; enlarge/reflow tap targets without constraining heatmap’s intentional scroll container. | `Header`, progress CSS/components | Test 390/430/768px, keyboard focus. |
| **P2** | Global analytics scans all review logs and filters 14 times | Bucket once (or bounded SQL date range) while preserving all-time heatmap/streak requirements. | `progress-service`, tests | Measure current 2,073+ history; time-zone fixture. |
| **P3** | Dense border/icon/shadow usage distracts from learning action | Reduce chrome in supporting panels; preserve core WordNest cream/terracotta identity. | Progress components/CSS | Design-only visual regression. |

## 17. Confidence & Verification Gaps

- **Production identity:** database URL resolves to the local configured SQLite environment; it was not independently established as production. Treat values as a local snapshot, not customer telemetry.
- **Dirty checkout:** relevant source is uncommitted, so release parity is **NOT VERIFIED**.
- **Browser:** partial desktop/mobile visual evidence exists, but test navigation itself can add online-usage seconds. Exact final UI data snapshot and full screen-reader/contrast/reduced-motion audit are **NOT VERIFIED**.
- **E2E:** no mutating suite was run against this DB. Clone E2E could not launch because the launcher intentionally forbids a second dev instance while port-3000 server is active. This is environment/test-harness blocking, not a product pass/fail.
- **Shared card runtime:** source contains dedupe logic but live DB has zero shared cards; the designated fixture path needs clone execution.
- **Concurrency/offline/clock edges:** tracker code supports reasonable best effort but two tabs, browser crash, packet loss and midnight split were not reproduced. **NOT VERIFIED.**
- **Tests:** fresh `npm run typecheck` passed. Source test inventory covers FSRS, heatmap, evidence, quiz submissions, due/global typing and dedicated E2E files, but their full execution was intentionally not performed without isolated database setup.

## 18. Final Verdict

| Dimension | Score / judgement | Basis |
|---|---|---|
| Data accuracy | **8/10** | Raw DB, service and API match for key current metrics; online raw arithmetic correct; edge cases remain untested. |
| FSRS integrity | **8/10** | Single transactional/idempotent review path is strong; unused alternate timezone implementation should not be surfaced unchanged. |
| Statistics completeness | **7/10** | Good FSRS/practice/typing coverage; reading and durable learning-time data intentionally absent. |
| Analytical usefulness | **7/10** | Strong actionable due/weak/first-pass signals; some supporting panels are dense or semantically easy to overread. |
| Visualization quality | **7/10** | Bars/heatmap are generally appropriate and accessible in code; mobile target size/overflow remain. |
| UI/UX quality | **6.5/10** | Distinct WordNest visual identity and clear core CTA; page length and equal-weight card density diminish daily focus. |
| Maintainability | **6.5/10** | Shared aggregation is pure/testable, but full-history client-side-style bucketing and parallel legacy stats raise drift/performance risk. |
| Overall readiness | **Conditional ready for incremental UI simplification** | No verified corruption or FSRS mutation breach. Resolve P1 semantics/timezone and P2 mobile/layout/performance before calling the analytics surface polished. |

The most important product decision is not to add more analytics. Keep the existing separation between scheduled review, practice evidence and usage context; make labels precise, preserve raw-source arithmetic, and privilege the next learning action over dashboard density.
