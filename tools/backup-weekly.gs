/**
 * Firebase Realtime Database 주간 자동 백업 (Google Apps Script)
 * 학생회 앱(daeyoung-council)과 밴드 앱(daeyoung-band)을 한 스크립트로 백업해서 내 Google Drive에 JSON으로 저장한다.
 *
 * 설치 (한 번만):
 *   1. https://script.google.com 에서 새 프로젝트를 만들고 이 파일 내용을 붙여넣는다(프로젝트는 효니 계정 소유).
 *   2. 위쪽 함수 선택에서 `setupWeeklyTrigger`를 골라 ▶ 실행 → 권한 요청이 뜨면 허용한다. (매주 일요일 새벽 3시대에 돈다)
 *   3. `backupAll`도 한 번 직접 실행해서 Drive에 `firebase-backup` 폴더와 파일이 생기는지, 실행 로그에 오류가 없는지 본다.
 * 바꾸는 법: 요일·시간은 setupWeeklyTrigger, 보관 개수는 KEEP, 백업할 경로는 TARGETS.paths.
 *
 * 한계:
 *  - 규칙에서 읽기를 허용한 경로만 백업된다. 루트의 옛 숫자 키(1001…)와 adminSecret·admin은 안 담긴다 — 콘솔의 "JSON 내보내기"로 따로 받아둘 것.
 *  - 백업 파일에는 학생 이름 등이 들어 있다. 이 Drive 폴더를 공유하지 말 것.
 *  - 실패하면(경로 하나라도 못 읽음) 실행한 계정 메일로 알림을 보낸다.
 */
const TARGETS = [
  {
    name: 'council',
    dbUrl: 'https://daeyoung-council-default-rtdb.firebaseio.com',
    apiKey: 'AIzaSyCtDfzTbaa_Y-G4n-DuUgcSoNnyo6BcmQo',
    paths: ['tasks', 'events', 'activity', 'notice', 'attList', 'attendance']
  },
  {
    name: 'band',
    dbUrl: 'https://daeyoung-band-default-rtdb.firebaseio.com',
    apiKey: 'AIzaSyCNB62DS9UUoVtNFFqwb6pacWZmjgnLKfA',
    paths: ['members', 'songs', 'events', 'roomSchedule', 'schoolCalendar']
  }
];
const FOLDER_NAME = 'firebase-backup';
const KEEP = 12; // 앱마다 최근 12개(약 3개월)만 남긴다

function backupAll() {
  const folder = getFolder_();
  const failures = [];
  TARGETS.forEach(t => {
    try {
      const token = anonToken_(t.apiKey);
      const out = {};
      t.paths.forEach(p => {
        const res = UrlFetchApp.fetch(t.dbUrl + '/' + p + '.json?auth=' + encodeURIComponent(token), { muteHttpExceptions: true });
        if (res.getResponseCode() !== 200) {
          failures.push(t.name + '/' + p + ' (' + res.getResponseCode() + ')');
          return;
        }
        out[p] = JSON.parse(res.getContentText());
      });
      if (Object.keys(out).length) {
        const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
        folder.createFile(t.name + '_' + stamp + '.json', JSON.stringify(out, null, 1), MimeType.PLAIN_TEXT);
      }
      prune_(folder, t.name);
    } catch (e) {
      failures.push(t.name + ': ' + e.message);
    }
  });
  if (failures.length) {
    const msg = 'Firebase 백업 실패: ' + failures.join(', ');
    console.error(msg);
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Firebase 백업 실패', msg);
  } else {
    console.log('백업 완료');
  }
}

function setupWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(tr => { if (tr.getHandlerFunction() === 'backupAll') ScriptApp.deleteTrigger(tr); });
  ScriptApp.newTrigger('backupAll').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
}

function anonToken_(apiKey) {
  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + apiKey, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ returnSecureToken: true }), muteHttpExceptions: true
  });
  const j = JSON.parse(res.getContentText());
  if (!j.idToken) throw new Error('익명 로그인 실패 ' + res.getContentText().slice(0, 120));
  return j.idToken;
}

function getFolder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function prune_(folder, name) {
  const files = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.getName().indexOf(name + '_') === 0) files.push(f);
  }
  files.sort((a, b) => b.getName().localeCompare(a.getName())); // 날짜가 이름에 있어 이름순 = 최신순
  files.slice(KEEP).forEach(f => f.setTrashed(true));
}
