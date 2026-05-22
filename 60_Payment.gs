/**
 * 60_Payment.gs - 결제 모듈 인터페이스(stub) + 예약내역 헤더 부트스트랩
 *
 * 결제 stub 5종은 시그니처만 제공하며 NOT_IMPLEMENTED 응답.
 * 시트 의존성 없음. 결제 API/시트 구조는 Phase 1에서 도입.
 *
 * initializePaymentSchema는 요구사항 명세서_260522 기준 25컬럼 헤더만 작성.
 */

var _STUB_RESP = {
  success: false,
  errorCode: 'NOT_IMPLEMENTED',
  errorMessage: '결제 모듈이 아직 구현되지 않았습니다.',
  error: '결제 모듈이 아직 구현되지 않았습니다.'
};

function createPaymentOrder(formData) {
  log(LOG_LEVEL.WARN, 'payment.stub.createPaymentOrder', { reason: 'not implemented' });
  return _STUB_RESP;
}

function verifyPayment(orderId, paymentKey) {
  log(LOG_LEVEL.WARN, 'payment.stub.verifyPayment', { orderId: orderId });
  return _STUB_RESP;
}

function cancelPayment(orderId, reason) {
  log(LOG_LEVEL.WARN, 'payment.stub.cancelPayment', { orderId: orderId, reason: reason });
  return _STUB_RESP;
}

function refundPayment(reservationNumber, amount, reason) {
  log(LOG_LEVEL.WARN, 'payment.stub.refundPayment', { reservationNumber: reservationNumber, amount: amount });
  return _STUB_RESP;
}

function processPaymentWebhook(payload, signature) {
  log(LOG_LEVEL.WARN, 'payment.stub.processPaymentWebhook', {});
  return _STUB_RESP;
}

/**
 * 요구사항 명세서_260522 기준 예약내역 시트 헤더(25컬럼) 작성.
 *
 * 헤더:
 *   A 예약번호 / B 신청일시 / C 예약날짜 / D 시작시간 / E 종료시간 / F 이용시간 /
 *   G 이름 / H 연락처 / I 이메일 / J 전체인원 / K 세금계산서 /
 *   L 기본요금 / M 시간추가요금 / N 인원추가요금 / O 소계 / P VAT / Q 보증금 / R 총금액 /
 *   S 입금확인 / T 입금확인일시 / U 사업자등록증 /
 *   V Calendar이벤트ID / W 알림톡발송상태 /
 *   X 환불금액 / Y 환불일시
 *
 * 빈 시트면 헤더 일괄 작성. 기존 데이터가 있는데 헤더가 다르면 throw.
 *
 * @return {{createdHeader:boolean}}
 */
function initializePaymentSchema() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = { createdHeader: false };

  var STANDARD_HEADER = [
    '예약번호', '신청일시', '예약날짜', '시작시간', '종료시간', '이용시간',
    '이름', '연락처', '이메일', '전체인원', '세금계산서',
    '기본요금', '시간추가요금', '인원추가요금', '소계', 'VAT', '보증금', '총금액',
    '입금확인', '입금확인일시', '사업자등록증',
    'Calendar이벤트ID', '알림톡발송상태',
    '환불금액', '환불일시'
  ];

  var resSheet = ss.getSheetByName('예약내역') || getSheet('예약내역');
  var lastRow = resSheet.getLastRow();
  var lastCol = resSheet.getLastColumn();

  if (lastRow <= 1) {
    // 빈 시트 — 기존 헤더 제거 후 표준 헤더 작성
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
        '예약내역 시트에 기존 데이터(' + (lastRow - 1) + '행)가 있고 헤더가 명세 25컬럼 양식과 다릅니다. ' +
        'setupAll()로 초기화하거나 시트를 직접 정리하세요.'
      );
    }
    if (lastCol < STANDARD_HEADER.length) {
      for (var c = lastCol; c < STANDARD_HEADER.length; c++) {
        resSheet.getRange(1, c + 1).setValue(STANDARD_HEADER[c]);
      }
      report.createdHeader = true;
    }
  }

  log(LOG_LEVEL.INFO, 'schema.initialized', report);
  return report;
}
