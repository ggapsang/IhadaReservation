/**
 * 01_Setup.gs - 초기 세팅 통합 모듈
 *
 * 운영자는 setupAll() 하나만 실행하면 됩니다.
 *
 *  - setupAll()           : 초기 배포. 경고창 1회 후 모든 레거시·옛 키·기존 데이터를 깨끗이 삭제하고
 *                           요구사항 명세서_260522 기준으로 처음부터 세팅합니다.
 *  - setupAll_keepData()  : 기존 데이터 유지하며 누락된 부분만 보강 (운영 중 마이그레이션용).
 */

/**
 * 요구사항 명세서_260522 기준으로 환경을 처음부터 세팅합니다.
 * 경고창에서 [예]를 누르면 다음을 일괄 수행:
 *   1) 예약내역·예약현황로그의 모든 데이터 삭제
 *   2) 레거시 시트 일괄 삭제 (Room정보, 옵션상품, 임시주문, 결제로그)
 *   3) 설정 시트의 옛 키 일괄 삭제
 *   4) Properties 12종 빈 값으로 초기화
 *   5) 예약내역 헤더(25컬럼) 신규 작성
 *   6) 설정 시트에 명세 기준 가격·정책 키 일괄 작성
 */
function setupAll() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); }
  catch (e) { throw new Error('setupAll()은 스프레드시트에 바인딩된 상태에서만 동작합니다.'); }

  var response = ui.alert(
    '⚠️ 초기 세팅',
    '이 작업은 다음을 일괄 수행합니다:\n\n' +
    '1) 예약내역·예약현황로그의 모든 데이터를 삭제합니다.\n' +
    '2) 레거시 시트(Room정보·옵션상품·임시주문·결제로그)를 통째로 삭제합니다.\n' +
    '3) 설정 시트의 옛 키를 모두 제거하고 명세 기준 키만 남깁니다.\n' +
    '4) Properties를 빈 값으로 초기화합니다 (기존 값 보존).\n' +
    '5) 예약내역 25컬럼 헤더를 새로 작성합니다.\n' +
    '6) 명세 기준 가격·정책을 설정 시트에 작성합니다.\n\n' +
    '기존 예약 데이터를 보존하려면 [아니요]를 누르고 setupAll_keepData()를 실행하세요.\n\n' +
    '계속하시겠습니까?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return { aborted: true };
  }

  var report = {};

  report.cleared = _clearDataSheets();
  report.deletedLegacy = _deleteLegacySheets();
  report.removedLegacyKeys = _removeLegacySettingsKeys();
  report.properties = initializeProperties();
  report.schema = initializePaymentSchema();
  report.settings = migrateSettings_260522();

  ui.alert('✅ 초기 세팅 완료',
    '예약내역 25컬럼 헤더 작성 완료.\n' +
    '설정 시트가 명세 기준으로 정리되었습니다.\n' +
    (report.deletedLegacy.length > 0 ? '삭제된 레거시 시트: ' + report.deletedLegacy.join(', ') + '\n' : '') +
    (report.removedLegacyKeys.length > 0 ? '삭제된 옛 키: ' + report.removedLegacyKeys.join(', ') + '\n' : '') +
    '\n다음 단계: _verifyPhase0() 함수로 검증하세요.',
    ui.ButtonSet.OK);

  log(LOG_LEVEL.INFO, 'setupAll.completed', report);
  return report;
}

/**
 * 데이터 유지하며 누락 항목만 보강합니다 (운영 중 마이그레이션용).
 */
function setupAll_keepData() {
  var report = {};
  report.properties = initializeProperties();
  report.schema = initializePaymentSchema();
  report.settings = migrateSettings_260522();
  log(LOG_LEVEL.INFO, 'setupAll_keepData.completed', report);
  try {
    SpreadsheetApp.getUi().alert('✅ 마이그레이션 완료',
      '기존 데이터는 보존되었습니다.\n검증: _verifyPhase0()',
      SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {}
  return report;
}

/**
 * @private
 * 더 이상 사용하지 않는 레거시 시트 일괄 삭제.
 */
function _deleteLegacySheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var legacy = ['Room정보', '옵션상품', '임시주문', '결제로그'];
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
 * @private
 * 운영 시 사용하는 시트들의 데이터 행을 삭제합니다(헤더 보존).
 */
function _clearDataSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var targets = ['예약내역', '예약현황로그'];
  var cleared = [];
  targets.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;
    sheet.deleteRows(2, lastRow - 1);
    cleared.push({ sheet: name, rows: lastRow - 1 });
  });
  return cleared;
}

/**
 * @private
 * 설정 시트에서 요구사항 명세서_260522에 없는 옛 키들을 행 단위로 삭제합니다.
 */
function _removeLegacySettingsKeys() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('설정');
  if (!sheet) return [];

  var legacyKeys = {
    '시간당기본요금': true,
    '추가인원단가': true,
    'AB동시대관기준': true,
    '환불정책_24시간이상': true,
    '환불정책_12시간이상': true,
    '환불정책_12시간미만': true,
    '임시점유시간': true,
    '결제재시도횟수': true,
    '결제재시도간격': true
  };

  // 아래에서 위로 행을 검사·삭제 (위에서 지우면 인덱스가 밀림)
  var data = sheet.getDataRange().getValues();
  var removed = [];
  for (var i = data.length - 1; i >= 1; i--) {
    var key = data[i][0];
    if (key && legacyKeys[String(key)]) {
      sheet.deleteRow(i + 1);  // 1-based
      removed.push(String(key));
    }
  }
  return removed;
}
