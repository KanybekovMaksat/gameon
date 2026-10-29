# Build rules

The prototype of BilimQuest, a 3D island of knowledge for pupils of grades 5 to 9 and their teachers. It is a demo for a presentation: every screen must look finished and feel premium. Nothing may look like a placeholder.

## Run

- `npm run dev` starts the app on port 5180. A worktree uses its own port: `npx vite --port <port> --strictPort`.
- `/` is the app. `/design` is the design system page. `/lesson/<lessonId>` opens a lesson. `/teacher` is the teacher's room.
- On a wide screen (900px and more) the app is in a phone frame (390 × 844) with the demo panel on the left. On a phone the app is full screen.
- The local server is `server/api.ts` (a Vite plugin): `/api/helper` (Robik, the AI helper, needs `OPENROUTER_API_KEY` in `.env.local`), `/api/student` (Robik as the AI student of «Научи Робика»), `/api/info` (the network address for the QR code) and `/api/events` (learning events for the teacher's room).

## Before a demo

1. Restart the dev server: the teacher's room keeps the learning events in memory, and a restart clears rehearsal data.
2. Open the app in a fresh browser tab and press «Сбросить прогресс» twice in the demo panel («Настройки»).
3. The demo panel's «Сценарий показа» sets up each scene with one click. Scene «Остров знаний» replays the fly-over over the island, so start the talk there.

## Checks

Every change passes all of these before it is done:

1. `npx tsc -b` with no errors.
2. `npx oxlint` with no new errors (the existing `only-export-components` warnings are accepted).
3. `npx vite build` succeeds.
4. Screenshots with Playwright of each changed screen and state, at 390 × 844 (iPhone 13 device, full screen phone layout) and at 1440 × 900 (phone frame layout). Playwright is installed in the scratchpad folder named in the contract; run scripts with `node` from there.

## Where things go

- `src/exercises/kit.tsx` defines an exercise kind (`defineKind`), its props and the `Task` wrapper. Read it before you write a kind.
- `src/exercises/<kind>.tsx`: one file per kind. `src/exercises/registry.ts`: one line per kind.
- `src/content/types.ts` defines subjects (`Topic`), lessons and explanation cards. `src/content/<subject>.ts`: one file per subject (math, informatics, russian, history, geography, biology, physics). `src/content/index.ts`: one line per subject, in the order of the island's road. `choice` and `gap` with `prose` are the kinds for any subject; the code kinds are for informatics.
- `src/content/visuals/`: pictures and small animations for explanation cards.
- `src/app/store.ts`: progress, XP, settings, events (zustand, saved in localStorage).
- `src/rewards/`: XP and levels (`catalog.ts`), achievements and the desk items they bring (`achievements.ts`), the «Награды» tab.
- `src/session/`: the lesson screen, the helper, the finish screen. `src/home/`: the home screen in three versions: the island world (default, `HomeWorld.tsx`, scene in `src/world/island/`), the map road (`HomeMap.tsx`) and the class room (`HomeRoom.tsx`).
- `src/tasks/`: the tab «Миссии», every form of task one tap from its start (the loop forms on the lab page, each kind of task in the lesson that has it).
- `src/lab/`: the lab page `/lab/loops`, working forms of one task type side by side. These forms are separate mini lessons with their own buttons and levels; they do not plug into `kit.tsx` yet.
- `src/app/router.ts`: history as a native stack. Sheets and the lesson's leave guard are layers (`useLayer`); use `navigate` and `leave`, never `history` directly. `src/app/Sheet.tsx`: the one bottom sheet.
- CSS: `src/tokens.css` (tokens), `src/app.css` (shared controls), `src/screens.css` (shell, home, session). A new module keeps its styles in its own CSS file next to its code and imports it from its main component. Use a class prefix per module.

## Design rules

The design system on `/design` was approved for this demo prototype. The production app may change the look. The reference for the feel is Brilliant: clean, modern, pleasant. Do not copy it.

- Near-monochrome: white background, navy text and controls, thin borders. Color only where it means something: blue for selection and progress, green for right, amber for wrong. An error is amber, never red.
- Only the main action button (`.btn`) has volume. Everything else is flat. The brand gradient (teal to blue) is only for brand marks.
- Use the tokens in `src/tokens.css`. No new colors without a reason that the design system does not cover.
- Text must be readable: contrast at least 4.5:1 for text.
- Inter for text, JetBrains Mono for code. No emoji in the interface.
- Touch targets at least 44 px. The layout works from 360 px to 430 px wide and inside the phone frame.
- Motion is short (150 to 350 ms) and has a purpose: it shows what changed. Respect `prefers-reduced-motion`.
- 3D: Kenney Mini Characters, Kenney Furniture Kit, Kenney Nature Kit in `public/models`, all CC0. Robik, the helper robot, is `src/world/HelperBot.tsx`, built from rounded boxes to match the helper mark. A 3D view stops drawing while it is hidden.

## Text rules

Text in the app is Russian, for pupils of grades 5 to 9.

- Speak to the child with «ты». Short, plain sentences. No baby talk. No em dashes. A Russian sentence «X это Y» needs a dash, so reword it instead («X называется…», «X означает…»).
- A hint is a guiding question. It never gives the answer. Hints go from general to specific.
- `why` explains the right answer in 1 to 3 sentences.
- An explanation card is short: a title and one or two short paragraphs. A picture or an animation explains more than a paragraph.

## Git

- Work on your own branch in your own worktree. Commit there. Do not merge to `main`, the main thread merges.
- Do not change files outside the scope of your contract. If you must, say so under `Deviation`.
- Do not add a dependency unless the contract allows it.
