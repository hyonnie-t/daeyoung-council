# daeyoung-council — 대영중 학생회 업무 앱 (정적 페이지 + Firebase)

학생회 임원이 행사별 업무를 나눠 맡고 완료를 체크하는 앱. 빌드·패키지·서버 코드 없음. GitHub Pages가 저장소 루트를 그대로 서빙하고
`main`에 push하면 1~2분 안에 https://hyonnie-t.github.io/daeyoung-council/ 에 반영된다(= 바로 배포라는 뜻. 작업은 브랜치 → PR → 클로드가 검증 뒤 병합·배포 확인).
**이 저장소는 public이다.** 비밀번호·계정·개인정보를 HTML/JS에 적지 않는다(과거 공용 계정이 평문으로 들어간 사고 있음 → 지금은 구글 시트 링크 `ACCOUNT_SHEET_URL`).
`FB_API_KEY`(Firebase 웹 API 키)만 예외로 공개돼도 되는 값이다(접근 제어는 DB 규칙).

## 구조
| 파일 | 무엇 |
|---|---|
| `index.html` | 핵심 앱. CSS·JS 전부 인라인(약 3,500줄). 학생 화면(`#sView`, 이름 선택만) / 선생님 화면(`#tView`, SHA-256 비번은 "실수 방지" 수준). 구획 주석 `// ── 이름 ──`으로 찾는다 |
| `rules.html` | 학생회 규정집. `ARTICLES` 배열 하드코딩, 네트워크 없음 |
| `staff.html`, `task-review.html` | 행사 1회성 페이지(환경의 날 담당자 / 10월 업무 확인). `index.html`에서 링크하지 않는다 |
| `election.html` | 2027 학생회장 선거 안내 — 선관위(학생회 임원)용이고 전교생에게는 내보내지 않는다(효니, 2026-11-11). 교사용 길잡이에서 교사 전용 내용을 지운 사본. 직접 고치지 말고 원본 OneDrive `학생회/20 학생회장 선거/2027학생회장선거_업무정리.html`을 고친 뒤 다시 만든다(`node 클로드작업/도구/선거길잡이_학생용만들기.js <원본> election.html`, 표지 그림·og:image 넣기와 남는 주석 정리까지 스크립트가 함). 학생 첫 화면 규정집 카드 위 «🗳️ 2027 학생회장 선거 안내» 카드에서 링크(선거 끝나면 카드 지우기) |
| `sangjeom.html` | 행사 상점 기록. 담당 학생(비밀번호)은 학번·점수로 가능/부족 확인 후 기록, 선생님 화면(`?teacher=1`, 관리 비밀번호)은 잠금·담당 비밀번호·남은 상점·기록. 전교생 이름·점수를 로그인 없는 Firebase에 두지 않으려고 학생회 전용 앱스크립트를 쓴다(역사 포털 백엔드에 넣지 않는다, 효니 결정). 행사 전 점수 넣기·행사 뒤 e알리미 음수 등록은 `클로드작업\도구\ealimi\상점행사.ps1` |
| `apps-script/sangjeom/` | 위 페이지의 서버 소스 `Code.gs`(대영중_학생회_DB_2026 시트에 연결된 스크립트의 사본, 스크립트 ID 1MSKMlCsF6MV7bQEIBagFmmJrhLEs5uEJFFSIP-VXVdk1hJCgcwsDEaIW)와 `test.js`(`node apps-script/sangjeom/test.js`). 고치면 편집기에 올리고 «새 버전». 그 시트는 효니만 보게 둔다. `2026 대영중학교 학생회` 시트는 링크로 누구나 수정할 수 있어 점수를 두지 않는다 |
| `firebase/` | `database.rules.json`(콘솔에 게시된 규칙 사본) + 적용 순서 README |
| `tools/` | `backup.mjs`(DB JSON 백업, `backup/`은 gitignore), `backup-weekly.gs` |
| `docs/features.md` | **기능 상세**(화면 구조·데이터 모델·저장/동기화·출석·기분 체크인·말로 쪼개기). 고칠 기능의 절만 `grep -n "^## \|^### "`로 찾아 읽는다 |
| `schedule-YYYY-MM.webp`, `illust-student.webp` | 이번 달 일정표 / 빈 상태 그림. 지난달 일정표는 지운다(git 이력에 남음) |

## 절대 규칙 — 어기면 학생 데이터가 깨진다
1. **쓰기는 건별로.** `fbPut(t)`(PATCH, `doneBy` 제외) / `fbDel(id)` / `fbSetDone(id, 이름, 값)`만 쓴다. `tasks` 배열 통째 PUT(`fbPutAll`)은 두 명이 동시에 쓰면 서로 지워서 없앴다 — 다시 만들지 않는다.
2. **상태는 저장값을 믿지 않는다.** `derive()`가 `doneBy`로 매번 계산한다(보류만 수동). 1인별 완료는 `toggleDone()` 경유.
3. 새 최상위 Firebase 경로를 쓰면 `firebase/database.rules.json`에 추가하고 콘솔 재게시가 필요하다고 효니에게 말한다(안 하면 401/403 → 토스트). 순서는 코드 배포 → 규칙 변경.
4. 업무 객체는 `newTask(o)` 한 곳에서만 만든다(수동 등록·말로 쪼개기 공유). 쓰기 동작을 추가하면 `logAct()`도 같이 부른다. 실패는 `toast()`로 알린다(삼키지 않는다).
5. 클릭은 `document` 위임 리스너의 `data-action` 분기로 추가한다. 예외는 파일 끝 출석 IIFE(인라인 onclick)와 «홈 화면에 추가» IIFE(`addEventListener`, Firebase 안 건드림)뿐.
6. 학생 화면 문구는 다른 학생과 비교하지 않는다(응원 문구·기분 체크인 공통). AI 호출(`CHEER_URL`)에 이름·학번을 보내지 않는다.
7. 탭을 추가하면 `sFns`/`tFns`·`S_PANELS`/`T_PANELS`·HTML `data-tab`을 함께 고치고, 출석 IIFE가 `tFns[6]`에 꽂히는 것도 확인한다.
8. 업무 id는 `crypto.randomUUID()`. 날짜 비교 코드는 상시 행사(`isProj(e)`)를 먼저 걸러낸다.

## 작업 습관
- 고치기 전에 `git fetch` 후 `origin/main`에서 임시 worktree(`git worktree add <임시폴더> -b <브랜치> origin/main`)를 만들어 작업한다. 여러 세션이 이 폴더를 같이 쓰므로 공용 폴더는 `main`으로 둔다(2026-11-08).
- `index.html`은 통째로 Read하지 않는다. `grep -n "^// ── \|^function 이름" index.html`로 위치를 찾고 범위만 읽는다. 문서에 줄번호를 적지 않는다.
- 로컬 확인: 교사업무 루트 `.claude/launch.json`의 `daeyoung-council`(포트 8771)로 띄우고 내장 브라우저에서 폰 390·태블릿 820·PC 1280 세 폭을 직접 본다(`file://`는 Firebase 호출이 안 된다).
  로컬에서도 Firebase에 **진짜로 쓰인다** — 확인은 보기만 하고, 등록·완료 체크 시험은 효니에게 먼저 묻는다.
- 매달 일정표 교체: `schedule-YYYY-MM.webp`를 넣고 `index.html`의 `<img src>`·`<a href>` 두 곳을 바꾼다. 새 이미지는 1MB 이하(webp)로.
- 커밋 전 `git diff --cached`에서 URL·비밀번호·이름 같은 민감정보를 확인한다(public 레포).

## 더 읽을 것
| 작업 | 먼저 읽기 |
|---|---|
| 화면·탭·카드·응원 문구·부서 현황 | `docs/features.md` "화면 구조" |
| 업무·행사 필드, 1인별 완료, 여러 행사 연결 | `docs/features.md` "데이터 모델" |
| Firebase 저장·활동 로그·인증·규칙 | `docs/features.md` "저장/동기화", `firebase/README.md` |
| 회의 출석 / 접속 출석·오늘의 기분 | `docs/features.md` 해당 절 |
| 말로 쪼개기(AI 업무 분해) | `docs/features.md` "말로 쪼개기", 백엔드는 `hyonnie-t/history26_backend`(`mode=cheer`, `action=breakdown`) |
