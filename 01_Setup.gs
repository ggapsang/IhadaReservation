/**
 * 01_Setup.gs - 초기 세팅 통합 모듈
 *
 * Apps Script 에디터의 함수 드롭다운에서 단 하나의 함수만 실행하면
 * 운영 환경이 260522 약관 기준으로 완성되도록 모아둡니다.
 *
 * 노출 함수:
 *  - setupAll()              : 초기 배포용. 경고창 동의 후 기존 시트 데이터 삭제 + 전체 초기화.
 *  - setupAll_keepData()     : 데이터 유지하며 누락 항목만 보강 (운영 중 마이그레이션용).
 *
 * 두 함수 모두 내부적으로 다음 3단계를 호출합니다.
 *   1) initializeProperties()      — 10_Config.gs
 *   2) initializePaymentSchema()   — 60_Payment.gs
 *   3) migrateSettings_260522()    — 10_Config.gs
 */

/**
 * 초기 배포용 통합 세팅.
 *
 * 경고창에서 [예]를 누르면:
 *   1) 예약내역/임시주문/결제로그/예약현황로그/옵션상품 시트의 데이터 행을 모두 삭제 (헤더는 보존하거나 새로 작성)
 *   2) Properties 12개 키 초기화
 *   3) 신규 32컬럼 스키마 + 결제 보조 시트 생성
 *   4) 260522 약관 기준 설정 시트 마이그레이션
 *
 * 경고창에서 [아니요]를 누르면 즉시 중단 (`aborted: true`).
 *
 * @return {Object}
 */
function setupAll() {
  var ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    // 스프레드시트에 바인딩되지 않은 standalone 스크립트에서는 UI 사용 불가
    throw new Error(
      'setupAll()은 스프레드시트에 바인딩된 상태에서만 동작합니다. ' +
      '스프레드시트를 열고 메뉴 → 확장 프로그램 → Apps Script에서 실행하세요.'
    );
  }

  var response = ui.alert(
    '⚠️ 초기 세팅 (기존 데이터 삭제됨)',
    '이 작업은 다음을 수행합니다:\n\n' +
    '1) 예약내역·임시주문·결제로그·예약현황로그·옵션상품 시트의 모든 데이터를 삭제합니다.\n' +
    '2) 레거시 시트(Room정보)를 통째로 삭제합니다.\n' +
    '3) Properties 키 12종을 빈 값으로 초기화합니다 (기존 값이 있으면 보존).\n' +
    '4) 신규 32컬럼 예약내역 헤더를 새로 작성합니다.\n' +
    '5) 260522 약관 기준 가격·정책을 설정 시트에 마이그레이션합니다.\n\n' +
    '이미 운영 중이라 기존 예약 데이터를 보존하려면 [아니요]를 누르고 setupAll_keepData() 함수를 대신 실행하세요.\n\n' +
    '계속하시겠습니까?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return { aborted: true, message: '사용자가 취소했습니다.' };
  }

  var report = { cleared: [], deletedLegacy: [], steps: {} };

  // 1) 시트 데이터 삭제 (헤더 행 제외)
  report.cleared = _clearDataSheets();

  // 2) 레거시 시트 통째 삭제 (멀티-룸 운영 시절 잔재)
  report.deletedLegacy = _deleteLegacySheets();

  // 3) Properties
  report.steps.properties = initializeProperties();

  // 4) 스키마 (신규 32컬럼 헤더 작성)
  report.steps.schema = initializePaymentSchema();

  // 5) 260522 약관 설정 시트
  report.steps.settings_260522 = migrateSettings_260522();

  ui.alert('✅ 초기 세팅 완료',
    '예약내역 헤더가 32컬럼으로 작성되었습니다.\n' +
    '설정 시트에 가격·정책 항목이 등록되었습니다.\n' +
    (report.deletedLegacy.length > 0
      ? '레거시 시트(' + report.deletedLegacy.join(', ') + ')를 삭제했습니다.\n'
      : '') +
    '\n다음 단계: Apps Script 에디터에서 _verifyPhase0() 함수를 실행하여 검증하세요.',
    ui.ButtonSet.OK);

  log(LOG_LEVEL.INFO, 'setupAll.completed', report);
  return report;
}

/**
 * 데이터 유지하면서 누락된 키/시트/컬럼만 보강합니다.
 * 운영 중 마이그레이션에 안전한 진입점.
 *
 * @return {Object}
 */
function setupAll_keepData() {
  var report = { steps: {} };
  report.steps.properties = initializeProperties();
  report.steps.schema = initializePaymentSchema();
  report.steps.settings_260522 = migrateSettings_260522();
  log(LOG_LEVEL.INFO, 'setupAll_keepData.completed', report);

  // 스프레드시트에 바인딩된 경우 알림 (없으면 무시)
  try {
    SpreadsheetApp.getUi().alert(
      '✅ 마이그레이션 완료',
      '기존 데이터는 보존되었습니다.\n누락된 항목만 보강했습니다.\n\n검증: _verifyPhase0()',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {}

  return report;
}

/**
 * 260522 약관(단일 공간) 전환 후 더 이상 사용되지 않는 레거시 시트를 통째로 삭제합니다.
 * 현재 대상: 'Room정보' (멀티-룸 운영 시절 잔재).
 * 시트가 없으면 건너뜁니다.
 * @return {Array<string>} 삭제된 시트 이름 목록
 * @private
 */
function _deleteLegacySheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var legacy = ['Room정보'];
  var deleted = [];
  legacy.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    ss.deleteSheet(sheet);
    deleted.push(name);
  });
  return deleted;
}

/**
 * 지정 시트들의 헤더 행을 제외한 데이터를 모두 삭제합니다.
 * 시트가 없으면 건너뜁니다. 시트 자체는 삭제하지 않습니다.
 * @private
 */
function _clearDataSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var targets = ['예약내역', '임시주문', '결제로그', '예약현황로그', '옵션상품'];
  var cleared = [];
  targets.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow <= 1) return;  // 헤더만 있거나 빈 시트
    // 헤더(1행) 제외한 데이터 행 일괄 삭제
    sheet.deleteRows(2, lastRow - 1);
    cleared.push({ sheet: name, rows: lastRow - 1 });
  });
  return cleared;
}
