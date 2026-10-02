# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 이 저장소는 무엇인가

대영중학교 학생회를 위한 정적 웹 페이지 3개로 이루어진 저장소. 빌드 도구, 패키지 매니저, 서버 코드가 전혀 없다. GitHub Pages로 저장소 루트를 그대로 서빙하며, `main`에 push하면 1~2분 내 아래 URL에 그대로 반영된다.

- `index.html` → `https://hyonnie-t.github.io/daeyoung-council/`
- `rules.html` → `https://hyonnie-t.github.io/daeyoung-council/rules.html`
- `staff.html` → `https://hyonnie-t.github.io/daeyoung-council/staff.html`

세 페이지는 서로 링크로 연결돼 있지 않다(각자 독립된 진입점). 새 정적 자료를 추가할 때 `index.html`에서 찾을 수 있게 연결해줄지 매번 확인이 필요하다 — 안 그러면 URL을 아는 사람만 접근 가능한 "숨겨진" 페이지가 된다.

**로컬 확인**: 빌드 과정이 없으므로 해당 HTML 파일을 브라우저로 직접 열면 된다. 정적 서버(`python3 -m http.server`)로 띄워도 되지만 필수는 아니다. 테스트/린트 명령은 없다.

## 저장소 공개 여부 — 항상 전제할 것

GitHub Pages 무료 요금제는 public 저장소에서만 동작한다. 즉 이 저장소는 public이라고 가정하고 작업해야 한다. **비밀번호·계정·API 키·개인정보를 어떤 HTML/JS 파일에도 하드코딩하지 말 것.** 과거 `index.html`에 학생회 공용 계정(캡컷/미리캔버스/구글) ID·PW가 평문으로 박혀 있던 사고가 있었고, 지금은 제거하고 외부 구글 시트 링크(`ACCOUNT_SHEET_URL`)로 대체했다. 앞으로도 같은 종류의 정보는 코드가 아니라 외부 문서 링크로 연결하는 패턴을 유지한다.

## index.html — 학생회 업무 시스템 (핵심 앱)

단일 HTML 파일에 CSS(`<style>`)와 전체 로직(`<script>`)이 인라인으로 들어있다. 프레임워크 없는 바닐라 JS, 템플릿 리터럴로 HTML 문자열을 만들어 `innerHTML`에 꽂는 방식.

### 화면 구조
접속하면 바로 학생 화면(`#sView`, 이름 선택만으로 사용, 로그인 없음)이 뜬다. 예전의 모드 선택 화면은 없앴다. 학생 화면 하단 '선생님 모드' 버튼(`#btnT`) → 비밀번호 화면(`#pwScreen`) → 선생님 화면(`#tView`, 클라이언트 사이드 SHA-256 비밀번호 체크). 선생님 화면의 ←/잠금은 `goHome()`으로 학생 화면으로 돌아간다. 공지(`#noticeBox`)와 이번 달 일정표 이미지는 '해야할 일' 탭 위쪽, 다가오는 행사 텍스트 목록(`#evFront`)은 '달력' 탭 위쪽에 있다.

반응형은 CSS 하단 한 블록에 모여 있다: 모바일 기본, 768px 이상(태블릿)에서 카드 2열·가운데 모달, 1024px 이상(컴퓨터)에서 '해야할 일'이 왼쪽 공지·일정표 / 오른쪽 내 업무 2단.

선생님 비번 화면의 '이 기기에서 기억하기'를 체크하면 `PW_OK_KEY`(localStorage)에 `PW_HASH`를 저장해 다음부터 비번 화면을 건너뛴다(`isPwRemembered`/`setPwRemembered`). 저장소 코드엔 아무것도 추가되지 않고, `PW_HASH`가 바뀌면 자동 무효, 선생님 화면 '🔒 잠금'이 지운다. **이 비밀번호 체크는 실질적 보안장치가 아니다** — 콘솔에서 `enterTeacher()`를 직접 호출하면 그냥 우회된다. 접근 제어가 아니라 "학생이 실수로 안 들어가게 하는 정도"로만 취급할 것.

학생 화면 탭은 해야할 일/달력/부서 현황 3개다. 업무 등록 폼은 별도 탭이 아니라 모달(`#addMov`)이고, '해야할 일'의 각 행사 카드 안 '＋ 이 행사에 업무 추가' 버튼(`data-action="addTask"`, `openAdd(행사id)`)으로 열어 그 행사를 미리 선택해 준다('그 밖의 내 업무' 위 버튼은 행사 없이). 이름 select `#s1Name`은 `s0Name`과 값만 맞추는 숨김 요소다. 2주 안 행사는 내 업무가 없어도 전부 카드로 나오고, 카드는 `<details class="ev-fold">`이며 기본은 접힘, 펼침 상태는 `sEvOpen`에 기억한다.

각 화면 내부는 탭(`.tnav`/`.ti`) 전환 방식이고, 탭마다 별도 `render*` 함수가 있다(`sFns`, `tFns` 배열에 인덱스로 매핑, 패널 id 목록은 `S_PANELS`/`T_PANELS`). 새 탭을 추가하면 이 배열들과 HTML의 `data-tab` 번호를 같이 손봐야 하고, 출석 IIFE가 `tFns[6]`에 자기 렌더 함수를 꽂으므로 출석 탭 인덱스가 바뀌면 거기도 고쳐야 한다.

학생 모드는 고른 이름을 `localStorage`(`ME_KEY`)에 기억해서 다음 방문 때 이름 선택 없이 바로 '해야할 일'을 보여준다. 헤더의 '로그아웃'은 이 기억을 지운다(같은 기기를 여러 명이 쓰는 경우). '🔑 계정' 버튼은 `ACCOUNT_SHEET_URL` 구글 시트를 앱 안 팝업(`#acctMov`, iframe)으로 띄우고, 구글 로그인이 필요해 비어 보이면 '새 창에서 열기'로 연다. `#evFront`에는 31일 안의 행사 목록이 텍스트로 나온다.

### 데이터 모델
- `MEMBERS`: 학생회 임원 명단(이름/부서/직책), `DEPTS`/`DC`: 부서 목록과 색상.
- `tasks` 배열이 전체 상태의 단일 소스. 업무(task) 스키마: `{id, assignee, assignees[], dept, title, category, date, deadline, memo, status, subtasks[], createdAt, completedAt, per, eventId, eventIds[], doneBy}`. 업무 등록 칸은 업무명 / 행사(선택·여러 개) / 같이 할 사람 / 마감일 / 메모 / 세부 할 일(접힘)뿐이다. `category`는 입력받지 않고 연결된 행사 이름으로 자동 채운다(검색용). `date`(행사일)는 예전 업무에만 있는 필드로, 새 업무는 날짜를 `deadline` 하나만 쓴다(회의면 회의 날짜). 행사 없는 새 업무는 카드에 '기타'로 표시된다.
- `events` 배열: 행사(`{id, name, start, end, dept, depts[], desc, createdBy, createdAt}`). 주관 부서는 여러 개 가능 — `depts`가 원본이고 `dept`는 첫 번째 부서(색상·예전 데이터 호환). 읽을 땐 `evDeptsOf(e)`. Firebase `events/{id}`에 건별 저장, 로컬 캐시 키 `EK`. 등록 권한은 선생님 모드 + 회장단 + 부장(버튼 숨김 수준, 보안 아님). 연결된 업무가 있는 행사는 삭제 불가. `EV_OCT`는 행사가 하나도 없을 때만 쓰는 10월 일괄 등록용 데이터. 시작일 없이 등록하면 날짜 없는 '상시 행사'(화면 표기, 예: 디케 프로젝트. 코드상 `kind:'project'`, `closed`, `closedAt`)가 된다 — 달력·다가오는 행사 목록에서 빠지고, 학생에겐 남은 업무가 있을 때만 '진행 중인 상시 행사'로 보이며, 선생님 '행사' 탭에서 종료/다시 열기를 한다. 날짜 비교 코드에서는 `!isProj(e)`로 프로젝트를 먼저 걸러낼 것.
- 업무의 `eventId`/`eventIds`: 업무 하나를 여러 행사에 연결할 수 있다 — `eventIds`가 원본, `eventId`는 첫 번째(호환용). 읽을 땐 `evIdsOf(t)`/`inEv(t, id)`, 쓸 땐 `setEvIds(t, ids)`. 행사 선택 UI는 체크박스 목록(`fillEvSel`/`getEvPick`). 행사에 연결된 업무와 새로 만든 모든 업무(`per:true`)가 **1인별 완료 체크**(`doneBy: {이름: ISO시각}`)를 쓴다. 상태(`status`)는 저장값을 믿지 않고 `derive()`가 `doneBy`로 매번 다시 계산한다(보류만 수동). `eventId`도 `per`도 없는 3~9월 기존 업무만 예전 방식(상태 버튼, 세부 할 일로 상태 변경) 그대로. 학생 화면에서 1인별 업무의 수정 창에는 '보류' 버튼만 보인다(다시 누르면 해제). 선생님 화면은 전부 조작 가능: 카드·행사 탭의 이름 칩으로 한 명씩, '전원 완료/전원 취소' 칩(`setAllDone`)으로 한 번에 체크하고, 수정 창에서도 '완료'=전원 완료, '예정'=전원 취소, '보류'를 쓸 수 있다(진행중은 체크 현황으로만 결정). 전원 처리도 `applyAllDone()`이 사람별 키로 나눠 쓴다.
- `SEED`: 최초 1회(로컬에 저장된 데이터가 없을 때)만 쓰이는 초기 시드 데이터. 이후로는 절대 다시 개입하지 않는다.

### 저장/동기화 — 여기가 제일 중요
- 진짜 원본은 Firebase Realtime Database(`FB` 상수, 인증 없이 REST로 직접 fetch). `localStorage`(`SK='daeyoung_v8'`)는 오프라인 캐시/즉시 렌더링용이다.
- 로드 순서: `initTasks()`가 로컬 캐시로 먼저 그리고, 화면 진입 시 `fbLoad()`가 비동기로 Firebase에서 받아와 통째로 덮어쓴다.
- **쓰기는 반드시 건별로 한다 (`fbPut(t)` / `fbDel(id)`).** 예전에 신규 업무 등록 시 `tasks` 배열 전체를 Firebase에 통째로 PUT하는 `fbPutAll()`이 있었는데, 두 명이 비슷한 시각에 각자 업무를 등록하면 나중에 저장한 쪽이 먼저 저장한 사람의 데이터를 지워버리는 레이스컨디션이 있었다. 지금은 제거했다 — **이 패턴(배열 전체 PUT)을 다시 만들지 말 것.** 새 기능에서 여러 명이 동시에 쓸 수 있는 데이터는 항상 개별 키 단위로 읽고 써야 한다.
- `fbPut(t)`은 PUT이 아니라 PATCH이고 `doneBy`를 뺀 필드만 보낸다. `doneBy`는 `fbSetDone(id, 이름, 값)`으로 `tasks/{id}/doneBy/{이름}` 키에만 쓴다(학생 '내 몫 완료'와 선생님 화면 이름 칩 `tDone` 모두 `toggleDone()` 경유) — 업무를 통째로 저장하면 다른 사람이 방금 한 완료 체크가 지워지기 때문.
- 업무 id는 `crypto.randomUUID()`로 생성한다(`Date.now()` 기반 id는 동시 생성 시 충돌 가능해서 바꿨다).
- Firebase 쓰기 실패는 `toast()`로 사용자에게 알린다(과거엔 `catch`에서 조용히 무시했음 — 실패를 삼키지 말 것).
- Firebase 보안 규칙에서 허용하지 않은 경로는 쓰기가 401/403으로 거부된다. 새 최상위 경로(예: `events`)를 추가하면 Firebase 콘솔 규칙에도 추가해야 한다. 행사 저장 실패 토스트는 권한 문제면 그 이유를 표시한다.
- **활동 로그(`activity`)**: 업무 등록·수정·삭제, 상태 변경, 세부 할 일 체크, 배정, 1인별 완료 체크/취소를 `logAct(type, t, {at, who, name, to})`가 `${FB}/activity.json`에 건별 POST한다(푸시키라 동시 기록이 안 겹친다). 새 쓰기 동작을 추가하면 `logAct`도 같이 부를 것. Firebase 규칙에 `activity` 읽기/쓰기 허용이 필요하고, 막혀 있으면 토스트를 세션당 한 번 띄운다. 선생님 대시보드의 '🔥 학생별 활동'(히트맵)과 '🕘 최근 활동'(피드)은 `renderActivity()`가 로그 최근 400건에 `doneBy`·`createdAt`을 합쳐서(`activityEvents()`) 그린다. 그래서 로그가 생기기 전의 완료·등록도 보이고(1체크 없는 예전 업무는 `completedAt`을 담당자 전원의 완료로 간주하는 추정치, `legacy:1`), 기간은 7일/4주/전체(`actRange`, `data-action="actRange"`)로 바꾼다. 중복은 키(`done|tid|이름|시각`, `add|tid`)로 걸러낸다. 로그는 지우는 코드가 없어 계속 쌓인다.
- **학생 응원 메시지**: 학생 '해야할 일' 맨 위 `cheerHtml()`이 본인 업무 상황(기한 지남/3일 이내/최근 완료/조용함/전부 완료)만으로 문구를 고른다(`CHEER` 문구 은행, 하루 단위로 고정). 다른 학생과 비교하는 문구는 만들지 말 것. `CHEER_URL`에 `history26_backend`(수업 웹앱 백엔드, 학생회 앱의 `GAS`와 다른 스크립트) 배포 URL을 넣으면 `?mode=cheer&over&soon&left&recent&idle`(숫자만, 이름 제외)로 요청해 `{ok,text}`의 `text`를 받아 문구를 바꾸고, 실패·6초 초과 시 문구 은행을 그대로 쓴다. 결과는 하루 단위로 localStorage에 캐시한다. **(2026-10-01: `CHEER_URL`을 `history26_backend` 배포 URL로 연결함. 효니가 AI 문구를 보고 수준을 판단하는 중이고, 마음에 안 들면 백엔드 `buildCheerPrompt_`를 고치거나 `CHEER_URL`을 다시 비워 문구 은행만 쓰게 하면 된다.)** 학생 화면은 `activity` 로그를 읽지 않고 `doneBy`/`completedAt`만 쓴다.
- `GAS`(Google Apps Script) 엔드포인트는 업무가 "완료" 상태가 될 때만 `no-cors` POST로 로그를 남기는 부가 기능(`gasLog`)이라 실패해도 앱 동작에 영향 없음.

### 이벤트 처리 패턴
대부분의 클릭은 `document`에 위임된 단일 리스너가 `data-action` 속성으로 분기 처리한다(`edit`, `del`, `chgSt`, `togSub`, `assign` 등). 새 동작을 추가할 때는 이 위임 리스너에 분기를 추가하는 게 일관적이다. 단, 출석 관리 기능(파일 하단의 IIFE)만 예외적으로 인라인 `onclick`을 쓴다 — 이 부분을 건드릴 땐 그 안에서만 인라인 방식을 유지하거나, 아예 위임 방식으로 리팩터링하는 걸 고려할 것.

### 출석 관리 (파일 하단 IIFE, `index.html` 끝부분)
나머지 코드와 분리된 즉시실행함수로 되어 있고 자체 Firebase 경로(`${FB}/attendance`, `${FB}/attList.json`)를 쓴다. `정기`/`상설`이 현재 쓰는 구분이고, `출결`/`기타`는 예전 데이터 호환용으로만 남아있다(`ATT_ALL_TYPES`). 이 레거시 타입을 없애려면 실제 Firebase에 남아있는 과거 데이터 마이그레이션이 먼저 필요하다.

## rules.html — 학생회 규정집

완전히 독립적인 정적 페이지. 조항 데이터(`ARTICLES` 배열)가 JS에 하드코딩돼 있고, 네트워크 요청이 전혀 없다. `localStorage`는 "읽은 조항" 표시에만 쓴다. 규정이 바뀌면 `ARTICLES` 배열을 직접 수정하면 된다.

## staff.html — 행사별 담당자 조회 페이지

특정 행사(환경의 날) 1회성 안내 페이지. 일정/담당자 데이터가 파일 안에 하드코딩돼 있고 백엔드도 로컬스토리지도 쓰지 않는 순수 정적 페이지다. 이런 성격의 "행사 하나짜리" 페이지가 앞으로도 추가될 수 있는데, 만들 때마다 `index.html`에서 링크로 연결해줄지 확인할 것(구글 시트에서 웹앱으로 옮기다가 이런 개별 페이지가 고립되는 문제가 실제로 있었다).
