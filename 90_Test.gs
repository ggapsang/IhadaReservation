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

  // 3. 예약내역 컬럼 32개 (260522 약관 신규 양식)
  try {
    var resSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('예약내역');
    var header = resSheet.getRange(1, 1, 1, resSheet.getLastColumn()).getValues()[0];
    check('cols.length=32', header.length === 32, { length: header.length });
    var expected = [
      '예약번호', '신청일시', '예약날짜', '시작시간', '종료시간', '이용시간',
      '이름', '연락처', '이메일', '전체인원', '세금계산서',
      '기본요금', '시간추가요금', '인원추가요금', '소계', 'VAT', '보증금', '총금액',
      '입금확인', '입금확인일시', '사업자등록증',
      'Calendar이벤트ID', '알림톡발송상태',
      '옵션상품', '옵션금액', '주문번호', '결제ID', '결제수단', '결제상태',
      '결제완료일시', '환불금액', '환불일시'
    ];
    expected.forEach(function (name, idx) {
      check('col[' + idx + ']:' + name, header[idx] === name, { got: header[idx] });
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

  // 5. getReservedSlotsByDate 정상 객체 반환 (260522 약관: 단일 공간, slots 배열)
  try {
    var slots = getReservedSlotsByDate('2026-05-20');
    check('getReservedSlotsByDate.shape',
      slots && typeof slots === 'object' && Array.isArray(slots.slots),
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

  // 7. 가격 회귀 — 260522 약관 기준
  // 시나리오 A: 평일(월요일) 5명 × 3시간
  //   packageRate=300,000 / extraHoursFee=0 / extraPersonFee=(5-4)*10,000=10,000
  //   subtotal=310,000 / vat=Math.round(310,000*10/110)=28,182 / deposit=100,000 / total=410,000
  try {
    var mondayDate = _findUpcomingWeekday(1); // 다음 월요일
    var priceWeekday = calculatePrice(5, 3, null, mondayDate);
    check('price.weekday.basePrice', priceWeekday.basePrice === 300000,
          { got: priceWeekday.basePrice, expected: 300000 });
    check('price.weekday.extraPersonOnlyFee', priceWeekday.extraPersonOnlyFee === 10000,
          { got: priceWeekday.extraPersonOnlyFee, expected: 10000 });
    check('price.weekday.subtotal', priceWeekday.subtotal === 310000,
          { got: priceWeekday.subtotal, expected: 310000 });
    check('price.weekday.deposit', priceWeekday.deposit === 100000,
          { got: priceWeekday.deposit, expected: 100000 });
    check('price.weekday.total', priceWeekday.total === 410000,
          { got: priceWeekday.total, expected: 410000 });
    check('price.weekday.isWeekend', priceWeekday.isWeekend === false);
    check('price.success', priceWeekday.success === true);
  } catch (e) {
    check('price.weekday.regression', false, e.message);
  }

  // 시나리오 B: 주말(토요일) 4명 × 4시간
  //   packageRate=400,000 / extraHoursFee=50,000 / extraPersonFee=0
  //   subtotal=450,000 / deposit=100,000 / total=550,000
  try {
    var saturdayDate = _findUpcomingWeekday(6); // 다음 토요일
    var priceWeekend = calculatePrice(4, 4, null, saturdayDate);
    check('price.weekend.basePrice', priceWeekend.basePrice === 400000,
          { got: priceWeekend.basePrice, expected: 400000 });
    check('price.weekend.extraHoursFee', priceWeekend.extraHoursFee === 50000,
          { got: priceWeekend.extraHoursFee, expected: 50000 });
    check('price.weekend.total', priceWeekend.total === 550000,
          { got: priceWeekend.total, expected: 550000 });
    check('price.weekend.isWeekend', priceWeekend.isWeekend === true);
  } catch (e) {
    check('price.weekend.regression', false, e.message);
  }

  // 8. checkAvailability 응답 형태 (단일 공간, roomType 인자 무시)
  try {
    var avail = checkAvailability('2026-05-20', '10:00', '13:00');
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
 * 오늘 기준 가장 가까운 미래의 특정 요일을 YYYY-MM-DD로 반환합니다.
 * @param {number} targetDay - 0=일, 1=월, ..., 6=토
 * @return {string}
 * @private
 */
function _findUpcomingWeekday(targetDay) {
  var d = new Date();
  var diff = (targetDay - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7; // 오늘과 같은 요일이면 다음 주
  d.setDate(d.getDate() + diff);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * 환불 정책(260522 일 단위) 단독 검증.
 */
function _verifyRefundPolicy_260522() {
  var results = [];
  var amount = 300000;

  function _test(name, daysBefore, expectedRate) {
    var d = new Date();
    var reservation = new Date(d);
    reservation.setDate(d.getDate() + daysBefore);
    var resStr = Utilities.formatDate(reservation, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var r = calculateRefundAmount({ amount: amount, reservationDate: resStr }, d);
    var ok = r.refundRate === expectedRate;
    results.push({ check: name, ok: ok, got: r, expected: expectedRate });
  }
  _test('refund.10일전=100%', 10, 100);
  _test('refund.6일전=50%', 6, 50);
  _test('refund.4일전=30%', 4, 30);
  _test('refund.1일전=0%', 1, 0);
  console.log(JSON.stringify(results, null, 2));
  return results;
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
