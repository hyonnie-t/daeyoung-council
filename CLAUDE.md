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
모드 선택(`#modeSelect`) → 학생 모드(`#sView`, 이름 선택만으로 진입, 로그인 없음) / 선생님 모드(`#tView`, 클라이언트 사이드 SHA-256 비밀번호 체크로 진입). **이 비밀번호 체크는 실질적 보안장치가 아니다** — 콘솔에서 `enterTeacher()`를 직접 호출하면 그냥 우회된다. 접근 제어가 아니라 "학생이 실수로 안 들어가게 하는 정도"로만 취급할 것.

각 화면 내부는 탭(`.tnav`/`.ti`) 전환 방식이고, 탭마다 별도 `render*` 함수가 있다(`sFns`, `tFns` 배열에 인덱스로 매핑). 새 탭을 추가하면 이 배열과 `swTab` 호출부(`bindStatic` 안의 탭 이벤트 바인딩)를 같이 손봐야 한다.

### 데이터 모델
- `MEMBERS`: 학생회 임원 명단(이름/부서/직책), `DEPTS`/`DC`: 부서 목록과 색상.
- `tasks` 배열이 전체 상태의 단일 소스. 업무(task) 스키마: `{id, assignee, assignees[], dept, title, category, date, deadline, memo, status, subtasks[], createdAt, completedAt}`.
- `SEED`: 최초 1회(로컬에 저장된 데이터가 없을 때)만 쓰이는 초기 시드 데이터. 이후로는 절대 다시 개입하지 않는다.

### 저장/동기화 — 여기가 제일 중요
- 진짜 원본은 Firebase Realtime Database(`FB` 상수, 인증 없이 REST로 직접 fetch). `localStorage`(`SK='daeyoung_v8'`)는 오프라인 캐시/즉시 렌더링용이다.
- 로드 순서: `initTasks()`가 로컬 캐시로 먼저 그리고, 화면 진입 시 `fbLoad()`가 비동기로 Firebase에서 받아와 통째로 덮어쓴다.
- **쓰기는 반드시 건별로 한다 (`fbPut(t)` / `fbDel(id)`).** 예전에 신규 업무 등록 시 `tasks` 배열 전체를 Firebase에 통째로 PUT하는 `fbPutAll()`이 있었는데, 두 명이 비슷한 시각에 각자 업무를 등록하면 나중에 저장한 쪽이 먼저 저장한 사람의 데이터를 지워버리는 레이스컨디션이 있었다. 지금은 제거했다 — **이 패턴(배열 전체 PUT)을 다시 만들지 말 것.** 새 기능에서 여러 명이 동시에 쓸 수 있는 데이터는 항상 개별 키 단위로 읽고 써야 한다.
- 업무 id는 `crypto.randomUUID()`로 생성한다(`Date.now()` 기반 id는 동시 생성 시 충돌 가능해서 바꿨다).
- Firebase 쓰기 실패는 `toast()`로 사용자에게 알린다(과거엔 `catch`에서 조용히 무시했음 — 실패를 삼키지 말 것).
- `GAS`(Google Apps Script) 엔드포인트는 업무가 "완료" 상태가 될 때만 `no-cors` POST로 로그를 남기는 부가 기능(`gasLog`)이라 실패해도 앱 동작에 영향 없음.

### 이벤트 처리 패턴
대부분의 클릭은 `document`에 위임된 단일 리스너가 `data-action` 속성으로 분기 처리한다(`edit`, `del`, `chgSt`, `togSub`, `assign` 등). 새 동작을 추가할 때는 이 위임 리스너에 분기를 추가하는 게 일관적이다. 단, 출석 관리 기능(파일 하단의 IIFE)만 예외적으로 인라인 `onclick`을 쓴다 — 이 부분을 건드릴 땐 그 안에서만 인라인 방식을 유지하거나, 아예 위임 방식으로 리팩터링하는 걸 고려할 것.

### 출석 관리 (파일 하단 IIFE, `index.html` 끝부분)
나머지 코드와 분리된 즉시실행함수로 되어 있고 자체 Firebase 경로(`${FB}/attendance`, `${FB}/attList.json`)를 쓴다. `정기`/`상설`이 현재 쓰는 구분이고, `출결`/`기타`는 예전 데이터 호환용으로만 남아있다(`ATT_ALL_TYPES`). 이 레거시 타입을 없애려면 실제 Firebase에 남아있는 과거 데이터 마이그레이션이 먼저 필요하다.

## rules.html — 학생회 규정집

완전히 독립적인 정적 페이지. 조항 데이터(`ARTICLES` 배열)가 JS에 하드코딩돼 있고, 네트워크 요청이 전혀 없다. `localStorage`는 "읽은 조항" 표시에만 쓴다. 규정이 바뀌면 `ARTICLES` 배열을 직접 수정하면 된다.

## staff.html — 행사별 담당자 조회 페이지

특정 행사(환경의 날) 1회성 안내 페이지. 일정/담당자 데이터가 파일 안에 하드코딩돼 있고 백엔드도 로컬스토리지도 쓰지 않는 순수 정적 페이지다. 이런 성격의 "행사 하나짜리" 페이지가 앞으로도 추가될 수 있는데, 만들 때마다 `index.html`에서 링크로 연결해줄지 확인할 것(구글 시트에서 웹앱으로 옮기다가 이런 개별 페이지가 고립되는 문제가 실제로 있었다).
