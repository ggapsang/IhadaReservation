/**
 * 90_Test.gs - Phase 0 인수 기준 자동 검증
 *
 * 운영 코드가 아닌 검증 전용. Apps Script 에디터에서 _verifyPhase0() 실행 후
 * 콘솔 로그(또는 반환값)에서 모든 check.ok === true 확인.
 *
 * 명세서 5절 인수 기준을 코드로 표현.
 */

/**
 * Phase 0 인수 기준 자동 검증.
 * @return {{passed:number, failed:Array}}
 */
function _verifyPhase0() {
  var results = [];
  function check(name, ok, extra) {
    var r = { check: name, ok: !!ok };
    if (!ok && extra) r.detail = extra;
    results.push(r);
  }

  // 1. Property 12개 키 존재
  try {
    var props = PropertiesService.getScriptProperties().getProperties();
    PROPERTY_KEYS.forEach(function (k) {
      check('prop:' + k, k in props);
    });
  } catch (e) {
    check('prop.load', false, e.message);
  }

  // 2. 신규 시트 3개 존재
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ['옵션상품', '임시주문', '결제로그'].forEach(function (name) {
      check('sheet:' + name, !!ss.getSheetByName(name));
    });
  } catch (e) {
    check('sheet.load', false, e.message);
  }

  // 3. 예약내역 컬럼 36개 + AB~AJ 헤더
  try {
    var resSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('예약내역');
    var header = resSheet.getRange(1, 1, 1, resSheet.getLastColumn()).getValues()[0];
    check('cols.length>=36', header.length >= 36, { length: header.length });
    check('cols.V=입금확인', header.length >= 22 && header[21] === '입금확인', { v: header[21] });
    ['옵션상품', '옵션금액', '주문번호', '결제ID', '결제수단', '결제상태', '결제완료일시', '환불금액', '환불일시'].forEach(function (name) {
      check('col:' + name, header.indexOf(name) >= 0);
    });
  } catch (e) {
    check('cols.read', false, e.message);
  }

  // 4. 결제 stub 5종
  var stubs = [
    { name: 'createPaymentOrder', call: function () { return createPaymentOrder({}); } },
    { name: 'verifyPayment', call: function () { return verifyPayment('x', 'y'); } },
    { name: 'cancelPayment', call: function () { return cancelPayment('x', 'r'); } },
    { name: 'refundPayment', call: function () { return refundPayment('x', 0, 'r'); } },
    { name: 'processPaymentWebhook', call: function () { return processPaymentWebhook({}, 's'); } }
  ];
  stubs.forEach(function (s) {
    try {
      var r = s.call();
      check('stub:' + s.name, r && r.success === false && r.errorCode === 'NOT_IMPLEMENTED', r);
    } catch (e) {
      check('stub:' + s.name, false, e.message);
    }
  });

  // 5. getReservedSlotsByDate 정상 객체 반환
  try {
    var slots = getReservedSlotsByDate('2026-05-20');
    check('getReservedSlotsByDate.shape',
      slots && typeof slots === 'object' && slots.hasOwnProperty('A') && slots.hasOwnProperty('A+B'),
      slots);
  } catch (e) {
    check('getReservedSlotsByDate', false, e.message);
  }

  // 6. 클라이언트 호출 함수 호환
  try {
    var settings = _getSettingsRaw();
    check('getSettings.기준인원', !!settings['기준인원'], settings);
  } catch (e) {
    check('getSettings', false, e.message);
  }

  // 7. 가격 회귀 (옵션 0개) — 명세서 인수 기준 "가격 계산 결과 변동 없음"
  try {
    var priceResp = calculatePrice(5, 3, 'A');
    // 기존 공식: basePrice=44000*1*3=132000, extraPersons=2, extraFee=2*5000*3=30000
    //          subtotal=162000, vat=Math.round(162000*0.1)=16200, total=178200
    var expectedBase = 132000;
    var expectedExtra = 30000;
    var expectedSubtotal = 162000;
    var expectedTotal = 178200;
    check('price.basePrice', priceResp.basePrice === expectedBase, { got: priceResp.basePrice, expected: expectedBase });
    check('price.extraPersonFee', priceResp.extraPersonFee === expectedExtra, { got: priceResp.extraPersonFee, expected: expectedExtra });
    check('price.subtotal', priceResp.subtotal === expectedSubtotal, { got: priceResp.subtotal, expected: expectedSubtotal });
    check('price.total', priceResp.total === expectedTotal, { got: priceResp.total, expected: expectedTotal });
    check('price.success', priceResp.success === true);
  } catch (e) {
    check('price.regression', false, e.message);
  }

  // 8. suggestRoomType 문자열 호환
  try {
    check('suggestRoomType(12)=A+B', suggestRoomType(12) === 'A+B');
    check('suggestRoomType(3)=A', suggestRoomType(3) === 'A');
  } catch (e) {
    check('suggestRoomType', false, e.message);
  }

  // 9. checkAvailability 응답 형태
  try {
    var avail = checkAvailability('2026-05-20', '10:00', '13:00', 'A');
    check('checkAvailability.available.type', typeof avail.available === 'boolean', avail);
    check('checkAvailability.success', avail.success === true);
  } catch (e) {
    check('checkAvailability', false, e.message);
  }

  // 10. 마스킹 동작
  try {
    var masked = maskSensitive({ card: '1234-5678-9012-3456', PAYMENT_SECRET_KEY: 'secret123' });
    var json = JSON.stringify(masked);
    check('mask.card', json.indexOf('5678') === -1, masked);
    check('mask.secret', json.indexOf('secret123') === -1, masked);
  } catch (e) {
    check('mask', false, e.message);
  }

  // 11. ok/fail 빌더
  try {
    var okResp = ok({ x: 1 }, { x: 1 });
    check('ok.success', okResp.success === true);
    check('ok.data', okResp.data && okResp.data.x === 1);
    check('ok.rootShim', okResp.x === 1);

    var failResp = fail('INVALID_INPUT', '잘못된 입력');
    check('fail.success', failResp.success === false);
    check('fail.errorCode', failResp.errorCode === 'INVALID_INPUT');
    check('fail.errorMessage', failResp.errorMessage === '잘못된 입력');
    check('fail.error.compat', failResp.error === '잘못된 입력');
  } catch (e) {
    check('builders', false, e.message);
  }

  // 12. ERROR_CODES 14종 + NOT_IMPLEMENTED 존재
  try {
    var requiredCodes = ['INVALID_INPUT','MISSING_REQUIRED_FIELD','RESERVATION_NOT_FOUND','ORDER_NOT_FOUND','ORDER_EXPIRED','TIME_BLOCKED','AMOUNT_MISMATCH','PG_API_ERROR','PG_DECLINED','INVALID_OPTION','STORAGE_ERROR','PERMISSION_DENIED','RATE_LIMITED','UNKNOWN_ERROR','NOT_IMPLEMENTED'];
    requiredCodes.forEach(function (c) {
      check('errorCode:' + c, ERROR_CODES[c] === c);
    });
  } catch (e) {
    check('errorCodes', false, e.message);
  }

  var failed = results.filter(function (r) { return !r.ok; });
  var summary = { passed: results.length - failed.length, total: results.length, failed: failed };
  console.log('=== _verifyPhase0 결과 ===');
  console.log('통과: ' + summary.passed + ' / ' + summary.total);
  if (failed.length > 0) {
    console.log('실패 항목:');
    failed.forEach(function (f) {
      console.log(' - ' + f.check + (f.detail ? ' :: ' + JSON.stringify(f.detail) : ''));
    });
  }
  return summary;
}

/**
 * 마스킹만 단독 테스트.
 */
function _testMasking() {
  log(LOG_LEVEL.ERROR, 'test.masking', {
    card: '1234-5678-9012-3456',
    PAYMENT_SECRET_KEY: 'sk_test_abc123',
    KAKAO_API_KEY: 'kakao_secret',
    note: '결제로그 시트에서 마스킹 확인'
  });
}
