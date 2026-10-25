# daeyoung-council — 대영중 학생회 업무 앱 (정적 페이지 + Firebase)

학생회 임원이 행사별 업무를 나눠 맡고 완료를 체크하는 앱. 빌드·패키지·서버 코드 없음. GitHub Pages가 저장소 루트를 그대로 서빙하고
`main`에 push하면 1~2분 안에 https://hyonnie-t.github.io/daeyoung-council/ 에 반영된다(= 바로 배포라는 뜻. 작업은 브랜치 → PR → 효니 병합).
**이 저장소는 public이다.** 비밀번호·계정·개인정보를 HTML/JS에 적지 않는다(과거 공용 계정이 평문으로 들어간 사고 있음 → 지금은 구글 시트 링크 `ACCOUNT_SHEET_URL`).
`FB_API_KEY`(Firebase 웹 API 키)만 예외로 공개돼도 되는 값이다(접근 제어는 DB 규칙).

## 구조
| 파일 | 무엇 |
|---|---|
| `index.html` | 핵심 앱. CSS·JS 전부 인라인(약 3,500줄). 학생 화면(`#sView`, 이름 선택만) / 선생님 화면(`#tView`, SHA-256 비번은 "실수 방지" 수준). 구획 주석 `// ── 이름 ──`으로 찾는다 |
| `rules.html` | 학생회 규정집. `ARTICLES` 배열 하드코딩, 네트워크 없음 |
| `staff.html`, `task-review.html` | 행사 1회성 페이지(환경의 날 담당자 / 10월 업무 확인). `index.html`에서 링크하지 않는다 |
| `firebase/` | `database.rules.json`(콘솔에 게시된 규칙 사본) + 적용 순서 README |
| `tools/` | `backup.mjs`(DB JSON 백업, `backup/`은 gitignore), `backup-weekly.gs` |
| `docs/features.md` | **기능 상세**(화면 구조·데이터 모델·저장/동기화·출석·기분 체크인·말로 쪼개기). 고칠 기능의 절만 `grep -n "^## \|^### "`로 찾아 읽는다 |
| `schedule-YYYY-MM.webp`, `illust-student.webp` | 이번 달 일정표 / 빈 상태 그림. 지난달 일정표는 지운다(git 이력에 남음) |

## 절대 규칙 — 어기면 학생 데이터가 깨진다
1. **쓰기는 건별로.** `fbPut(t)`(PATCH, `doneBy` 제외) / `fbDel(id)` / `fbSetDone(id, 이름, 값)`만 쓴다. `tasks` 배열 통째 PUT(`fbPutAll`)은 두 명이 동시에 쓰면 서로 지워서 없앴다 — 다시 만들지 않는다.
2. **상태는 저장값을 믿지 않는다.** `derive()`가 `doneBy`로 매번 계산한다(보류만 수동). 1인별 완료는 `toggleDone()` 경유.
3. 새 최상위 Firebase 경로를 쓰면 `firebase/database.rules.json`에 추가하고 콘솔 재게시가 필요하다고 효니에게 말한다(안 하면 401/403 → 토스트). 순서는 코드 배포 → 규칙 변경.
4. 업무 객체는 `newTask(o)` 한 곳에서만 만든다(수동 등록·말로 쪼개기 공유). 쓰기 동작을 추가하면 `logAct()`도 같이 부른다. 실패는 `toast()`로 알린다(삼키지 않는다).
5. 클릭은 `document` 위임 리스너의 `data-action` 분기로 추가한다. 예외는 파일 끝 출석 IIFE(인라인 onclick)뿐.
6. 학생 화면 문구는 다른 학생과 비교하지 않는다(응원 문구·기분 체크인 공통). AI 호출(`CHEER_URL`)에 이름·학번을 보내지 않는다.
7. 탭을 추가하면 `sFns`/`tFns`·`S_PANELS`/`T_PANELS`·HTML `data-tab`을 함께 고치고, 출석 IIFE가 `tFns[6]`에 꽂히는 것도 확인한다.
8. 업무 id는 `crypto.randomUUID()`. 날짜 비교 코드는 상시 행사(`isProj(e)`)를 먼저 걸러낸다.

## 작업 습관
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
