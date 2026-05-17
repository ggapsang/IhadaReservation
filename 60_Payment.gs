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
 * Apps Script 에디터에서 1회 실행. 명세서 Task 0-2의 모든 스키마 변경을 idempotent하게 적용.
 *
 *  - 예약내역 컬럼 AB~AJ (28~36) 추가 (헤더 누락 시만)
 *  - 신규 시트 3개: 옵션상품, 임시주문, 결제로그
 *  - 설정 시트에 결제 관련 키 6개 추가 (누락된 키만)
 *
 * 기존 데이터는 절대 수정하지 않음.
 * V열(입금확인) 시프트 사고 방지를 위해 사전 가드 포함.
 *
 * @return {{addedColumns:Array, createdSheets:Array, addedSettings:Array}}
 */
function initializePaymentSchema() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = { addedColumns: [], createdSheets: [], addedSettings: [] };

  // 1. 예약내역 컬럼 AB~AJ
  var resSheet = ss.getSheetByName('예약내역') || getSheet('예약내역');
  var lastCol = resSheet.getLastColumn();
  if (lastCol > 0) {
    var header = resSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    // 가드 — 명세서 가정 깨졌으면 즉시 throw
    if (header.length >= 22 && header[21] && header[21] !== '입금확인') {
      throw new Error('스키마 가정 깨짐: V열(22번째)이 입금확인이 아닙니다. 발견: "' + header[21] + '". 수동 확인 후 재시도하세요.');
    }
    var expected = ['옵션상품', '옵션금액', '주문번호', '결제ID', '결제수단', '결제상태', '결제완료일시', '환불금액', '환불일시'];
    for (var i = 0; i < expected.length; i++) {
      var name = expected[i];
      var col = 28 + i;  // AB=28
      // 헤더에 이미 같은 이름이 있는지 검사 (위치는 상관없음)
      var found = false;
      for (var h = 0; h < header.length; h++) {
        if (header[h] === name) { found = true; break; }
      }
      if (!found) {
        resSheet.getRange(1, col).setValue(name);
        report.addedColumns.push({ col: col, name: name });
      }
    }
  } else {
    // 예약내역 시트가 비어있는 환경 — 헤더 27개도 함께 작성
    var fullHeader = [
      '예약번호','신청일시','예약날짜','시작시간','종료시간','이용시간','Room타입',
      '업체명','인스타그램ID','이름','연락처','전체인원','차량대수','세금계산서',
      '유입경로','촬영내용','기본요금','추가인원요금','소계','VAT','총금액',
      '입금확인','입금확인일시','사업자등록증','Calendar이벤트ID','알림톡발송상태','비고',
      '옵션상품','옵션금액','주문번호','결제ID','결제수단','결제상태','결제완료일시','환불금액','환불일시'
    ];
    resSheet.getRange(1, 1, 1, fullHeader.length).setValues([fullHeader]);
    report.addedColumns.push({ note: '예약내역 헤더 36개 일괄 생성' });
  }

  // 2. 신규 시트 3개
  _ensureSheet(ss, '옵션상품',
    ['상품ID','카테고리','상품명','설명','가격','단위','최대수량','활성화','표시순서'],
    report);
  _ensureSheet(ss, '임시주문',
    ['주문번호','생성일시','만료일시','예약날짜','시작시간','종료시간','Room타입','예약데이터','금액','상태'],
    report);
  _ensureSheet(ss, '결제로그',
    ['로그ID','일시','주문번호','이벤트유형','결제ID','금액','응답코드','응답메시지','상세'],
    report);

  // 3. 설정 시트 항목 추가
  var settingSheet = ss.getSheetByName('설정') || getSheet('설정');
  var setData = settingSheet.getDataRange().getValues();
  var existingKeys = [];
  for (var s = 1; s < setData.length; s++) {
    if (setData[s][0]) existingKeys.push(String(setData[s][0]));
  }
  var defaults = [
    ['임시점유시간', 10, '분', '결제 진행 중 시간대 점유 기간'],
    ['결제재시도횟수', 3, '회', 'PG API 호출 실패 시'],
    ['결제재시도간격', 5, '초', '재시도 사이 대기'],
    ['환불정책_24시간이상', 100, '%', '24시간 이전 취소 시 환불율'],
    ['환불정책_12시간이상', 50, '%', '12-24시간 사이'],
    ['환불정책_12시간미만', 0, '%', '12시간 미만']
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
