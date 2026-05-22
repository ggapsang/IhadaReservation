/**
 * 60_Payment.gs - 결제 모듈 인터페이스(stub) + 스키마 부트스트랩
 *
 * 명세서 Task 0-3: 5개 결제 함수의 시그니처/JSDoc만 정의. 내부는 NOT_IMPLEMENTED 응답.
 * 명세서 Task 0-2: initializePaymentSchema()로 신규 시트 3개 + 컬럼 9개 + 설정 6개 일괄 부트스트랩.
 *
 * Phase 1에서 stub 내부를 토스페이먼츠 SDK로 채워 넣을 예정.
 */

// ==========================================
// 결제 모듈 stub 5종 (Phase 1에서 구현)
// ==========================================

var _STUB_RESP = {
  success: false,
  errorCode: 'NOT_IMPLEMENTED',
  errorMessage: '결제 모듈이 아직 구현되지 않았습니다.',
  error: '결제 모듈이 아직 구현되지 않았습니다.'
};

/**
 * 결제 사전 등록 — 임시주문 발급.
 *
 * @param {Object} formData - 예약 폼 데이터 (submitReservation 입력과 동일 구조)
 * @param {Array<{id:string, quantity:number}>} [formData.options]
 * @return {Object} 성공 시 { success:true, orderId, amount, amountBreakdown:{reservation, options, vat, total}, expiresAt }
 *                  실패 시 { success:false, errorCode, errorMessage }
 *
 * 사이드 이펙트 (Phase 1 구현 예정):
 *  - 임시주문 시트에 새 행 추가 (상태: HOLDING)
 *  - 결제로그 시트에 ORDER_CREATED 이벤트 기록
 *
 * 예외 케이스 errorCode: INVALID_INPUT, TIME_BLOCKED, INVALID_OPTION, STORAGE_ERROR
 *
 * 보안: 금액은 반드시 서버 재계산. 클라이언트 전달 금액 신뢰 금지. orderId는 UUID v4.
 */
function createPaymentOrder(formData) {
  log(LOG_LEVEL.WARN, 'payment.stub.createPaymentOrder', { reason: 'Phase 0 stub' });
  return _STUB_RESP;
}

/**
 * 결제 검증 — PG사 결제 완료 신호를 재확인하고 예약을 확정.
 *
 * @param {string} orderId
 * @param {string} paymentKey - PG사 발급 결제 식별자
 * @return {Object} 성공 시 { success:true, reservationNumber, amount, paymentMethod }
 *                  실패 시 { success:false, errorCode, errorMessage }
 *
 * 사이드 이펙트 (Phase 1):
 *  - 예약내역 시트에 새 행 추가 (결제 정보 포함, AB~AJ 컬럼 사용)
 *  - 임시주문 상태를 COMPLETED로 변경
 *  - 결제로그에 PAYMENT_VERIFIED 기록
 *  - Google Calendar 이벤트 생성
 *  - 고객 알림 + 관리자 알림 발송
 *
 * 예외: ORDER_NOT_FOUND, ORDER_EXPIRED(자동 취소), AMOUNT_MISMATCH(자동 취소),
 *      PG_API_ERROR(재시도), PG_DECLINED
 *
 * 보안: PG 응답 금액과 임시주문 저장 금액 일치 검증 필수. 불일치 시 즉시 cancelPayment.
 */
function verifyPayment(orderId, paymentKey) {
  log(LOG_LEVEL.WARN, 'payment.stub.verifyPayment', { orderId: orderId });
  return _STUB_RESP;
}

/**
 * 결제 취소 — 임시주문 상태를 CANCELLED로 변경.
 *
 * @param {string} orderId
 * @param {string} reason - 취소 사유
 * @return {Object} { success, errorCode? }
 *
 * 사이드 이펙트: 임시주문 상태 CANCELLED + 결제로그 기록.
 */
function cancelPayment(orderId, reason) {
  log(LOG_LEVEL.WARN, 'payment.stub.cancelPayment', { orderId: orderId, reason: reason });
  return _STUB_RESP;
}

/**
 * 환불 — 예약내역의 환불금액/환불일시 업데이트 + PG API 호출.
 *
 * @param {string} reservationNumber
 * @param {number} [amount] - 환불 금액 (생략 시 전액)
 * @param {string} reason
 * @return {Object} { success, refundedAmount, errorCode? }
 *
 * 사이드 이펙트 (Phase 1):
 *  - 예약내역 AI(환불금액)/AJ(환불일시) 업데이트
 *  - 결제상태 = REFUNDED (전액) 또는 PARTIAL_REFUNDED
 *  - Google Calendar 이벤트 삭제 또는 표시 변경
 *  - 고객 환불 안내 발송
 *  - 결제로그에 REFUND_PROCESSED 기록
 *
 * 제약: 환불 금액 ≤ 결제 금액, 이미 전액 환불된 건은 추가 환불 불가.
 * 정책 적용 금액은 calculateRefundAmount() 별도 함수 사용 (40_Pricing.gs).
 */
function refundPayment(reservationNumber, amount, reason) {
  log(LOG_LEVEL.WARN, 'payment.stub.refundPayment', { reservationNumber: reservationNumber, amount: amount });
  return _STUB_RESP;
}

/**
 * PG사 Webhook 비동기 통보 처리.
 *
 * @param {Object} payload - PG사 Webhook 페이로드
 * @param {string} signature - PG사 발급 시그니처
 * @return {Object} { success, action: 'VERIFIED'|'IGNORED'|'FAILED' }
 *
 * 사이드 이펙트 (Phase 1):
 *  - 시그니처 검증 후 verifyPayment 또는 후속 처리 트리거
 *  - 모든 호출 결제로그 기록
 *
 * 제약:
 *  - 시그니처 검증 실패 시 즉시 거부, PG사 재시도 방지를 위해 에러 응답 없이 200 반환
 *  - 동일 paymentKey 중복 Webhook 멱등성 보장
 */
function processPaymentWebhook(payload, signature) {
  log(LOG_LEVEL.WARN, 'payment.stub.processPaymentWebhook', {});
  return _STUB_RESP;
}

// ==========================================
// 스키마 부트스트랩 (1회 수동 실행)
// ==========================================

/**
 * Apps Script 에디터에서 1회 실행. 260522 약관 기준 신규 32컬럼 양식으로 스키마를 구성합니다.
 *
 * 예약내역 컬럼 (총 32개):
 *   A 예약번호 / B 신청일시 / C 예약날짜 / D 시작시간 / E 종료시간 / F 이용시간 /
 *   G 이름 / H 연락처 / I 이메일 / J 전체인원 / K 세금계산서 /
 *   L 기본요금 / M 시간추가요금 / N 인원추가요금 / O 소계 / P VAT / Q 보증금 / R 총금액 /
 *   S 입금확인 / T 입금확인일시 / U 사업자등록증 /
 *   V Calendar이벤트ID / W 알림톡발송상태 /
 *   X 옵션상품 / Y 옵션금액 / Z 주문번호 / AA 결제ID / AB 결제수단 / AC 결제상태 /
 *   AD 결제완료일시 / AE 환불금액 / AF 환불일시
 *
 * 신규 시트 3종(옵션상품/임시주문/결제로그): Phase 1 결제 모듈용 자리, 본 함수가 헤더만 생성.
 *
 * 설정 시트 결제 운영 키 6종 추가 (없으면 append).
 *
 * 안전성:
 *  - 예약내역에 이미 행이 들어있고 헤더가 신규 32컬럼 양식과 다르면 throw — 데이터 오염 방지.
 *  - 빈 시트(헤더만 있거나 행 없음)는 32컬럼 헤더로 일괄 생성.
 *  - 신규 시트/설정 키는 idempotent.
 *
 * @return {{createdHeader:boolean, createdSheets:Array, addedSettings:Array}}
 */
function initializePaymentSchema() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = { createdHeader: false, createdSheets: [], addedSettings: [] };

  // 신규 32컬럼 표준 헤더
  var STANDARD_HEADER = [
    '예약번호', '신청일시', '예약날짜', '시작시간', '종료시간', '이용시간',
    '이름', '연락처', '이메일', '전체인원', '세금계산서',
    '기본요금', '시간추가요금', '인원추가요금', '소계', 'VAT', '보증금', '총금액',
    '입금확인', '입금확인일시', '사업자등록증',
    'Calendar이벤트ID', '알림톡발송상태',
    '옵션상품', '옵션금액', '주문번호', '결제ID', '결제수단', '결제상태',
    '결제완료일시', '환불금액', '환불일시'
  ];

  // 1. 예약내역 시트
  var resSheet = ss.getSheetByName('예약내역') || getSheet('예약내역');
  var lastRow = resSheet.getLastRow();
  var lastCol = resSheet.getLastColumn();

  if (lastRow <= 1 && lastCol === 0) {
    // 완전히 빈 시트 — 표준 헤더 일괄 작성
    resSheet.getRange(1, 1, 1, STANDARD_HEADER.length).setValues([STANDARD_HEADER]);
    resSheet.setFrozenRows(1);
    report.createdHeader = true;
  } else if (lastRow <= 1) {
    // 헤더만 있는 빈 시트 — 헤더 교체
    if (lastCol > 0) resSheet.getRange(1, 1, 1, lastCol).clearContent();
    resSheet.getRange(1, 1, 1, STANDARD_HEADER.length).setValues([STANDARD_HEADER]);
    resSheet.setFrozenRows(1);
    report.createdHeader = true;
  } else {
    // 기존 데이터가 있는 시트 — 헤더 일치 여부 확인
    var header = resSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headerMatches = true;
    for (var i = 0; i < STANDARD_HEADER.length; i++) {
      if (header[i] !== STANDARD_HEADER[i]) { headerMatches = false; break; }
    }
    if (!headerMatches) {
      throw new Error(
        '예약내역 시트에 기존 데이터(' + (lastRow - 1) + '행)가 있는데 헤더가 신규 32컬럼 양식과 다릅니다. ' +
        '백업 후 시트를 비우고 다시 실행하거나, 운영 환경 마이그레이션 절차(가이드 5절)를 따르세요.'
      );
    }
    // 헤더는 일치하지만 일부 컬럼이 누락된 경우만 보강
    if (lastCol < STANDARD_HEADER.length) {
      for (var c = lastCol; c < STANDARD_HEADER.length; c++) {
        resSheet.getRange(1, c + 1).setValue(STANDARD_HEADER[c]);
      }
      report.createdHeader = true;
    }
  }

  // 2. 신규 시트 3종 (Phase 1 결제 모듈용)
  _ensureSheet(ss, '옵션상품',
    ['상품ID', '카테고리', '상품명', '설명', '가격', '단위', '최대수량', '활성화', '표시순서'],
    report);
  _ensureSheet(ss, '임시주문',
    ['주문번호', '생성일시', '만료일시', '예약날짜', '시작시간', '종료시간', '예약데이터', '금액', '상태'],
    report);
  _ensureSheet(ss, '결제로그',
    ['로그ID', '일시', '주문번호', '이벤트유형', '결제ID', '금액', '응답코드', '응답메시지', '상세'],
    report);

  // 3. 설정 시트 결제 운영 키
  var settingSheet = ss.getSheetByName('설정') || getSheet('설정');
  var setData = settingSheet.getDataRange().getValues();
  var existingKeys = [];
  for (var s = 1; s < setData.length; s++) {
    if (setData[s][0]) existingKeys.push(String(setData[s][0]));
  }
  var defaults = [
    ['임시점유시간', 10, '분', '결제 진행 중 시간대 점유 기간'],
    ['결제재시도횟수', 3, '회', 'PG API 호출 실패 시'],
    ['결제재시도간격', 5, '초', '재시도 사이 대기']
  ];
  defaults.forEach(function (row) {
    if (existingKeys.indexOf(row[0]) === -1) {
      settingSheet.appendRow(row);
      report.addedSettings.push(row[0]);
    }
  });

  log(LOG_LEVEL.INFO, 'schema.initialized', report);
  return report;
}

/**
 * @private
 */
function _ensureSheet(ss, name, headers, report) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    report.createdSheets.push(name);
  } else if (sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    report.createdSheets.push(name + ' (헤더 보강)');
  }
  return sheet;
}
