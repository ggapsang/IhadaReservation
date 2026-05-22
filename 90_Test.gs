/**
 * 90_Test.gs - 인수 기준 자동 검증
 *
 * Apps Script 에디터에서 _verifyPhase0() 실행 → 콘솔에서 모든 ok 확인.
 */

function _verifyPhase0() {
  var results = [];
  function check(name, ok, extra) {
    var r = { check: name, ok: !!ok };
    if (!ok && extra !== undefined) r.detail = extra;
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

  // 2. 레거시 시트가 없어야 함 (setupAll 실행 후)
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ['Room정보', '옵션상품', '임시주문', '결제로그'].forEach(function (name) {
      check('legacy.absent:' + name, !ss.getSheetByName(name));
    });
  } catch (e) {
    check('legacy.check', false, e.message);
  }

  // 3. 예약내역 컬럼 25개 (명세 항목만)
  try {
    var resSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('예약내역');
    var header = resSheet.getRange(1, 1, 1, resSheet.getLastColumn()).getValues()[0];
    check('cols.length=25', header.length === 25, { length: header.length });
    var expected = [
      '예약번호', '신청일시', '예약날짜', '시작시간', '종료시간', '이용시간',
      '이름', '연락처', '이메일', '전체인원', '세금계산서',
      '기본요금', '시간추가요금', '인원추가요금', '소계', 'VAT', '보증금', '총금액',
      '입금확인', '입금확인일시', '사업자등록증',
      'Calendar이벤트ID', '알림톡발송상태',
      '환불금액', '환불일시'
    ];
    expected.forEach(function (name, idx) {
      check('col[' + idx + ']:' + name, header[idx] === name, { got: header[idx] });
    });
  } catch (e) {
    check('cols.read', false, e.message);
  }

  // 4. 설정 시트 — 명세 키 13종 + 옛 키 부재
  try {
    var ss2 = SpreadsheetApp.getActiveSpreadsheet();
    var settingSheet = ss2.getSheetByName('설정');
    var data = settingSheet.getDataRange().getValues();
    var keys = {};
    for (var i = 1; i < data.length; i++) if (data[i][0]) keys[String(data[i][0])] = data[i][1];

    var mustHave = [
      ['기준인원', 4], ['최대인원', 8], ['최소이용시간', 3],
      ['기본요금_평일_3시간', 300000], ['기본요금_주말_3시간', 400000],
      ['시간추가요금', 50000], ['인원추가요금', 10000], ['보증금', 100000],
      ['VAT포함여부', 'Y'],
      ['환불정책_8일이상', 100], ['환불정책_5_7일', 50],
      ['환불정책_3_4일', 30], ['환불정책_2일이내', 0]
    ];
    mustHave.forEach(function (kv) {
      check('setting:' + kv[0] + '=' + kv[1], keys[kv[0]] === kv[1], { got: keys[kv[0]] });
    });

    var mustAbsent = [
      '시간당기본요금', '추가인원단가', 'AB동시대관기준',
      '환불정책_24시간이상', '환불정책_12시간이상', '환불정책_12시간미만',
      '임시점유시간', '결제재시도횟수', '결제재시도간격'
    ];
    mustAbsent.forEach(function (k) {
      check('legacyKey.absent:' + k, !(k in keys));
    });
  } catch (e) {
    check('settings.read', false, e.message);
  }

  // 5. 결제 stub 5종 — 시트 의존성 없이 NOT_IMPLEMENTED 응답
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

  // 6. getReservedSlotsByDate — { slots: [] }
  try {
    var slots = getReservedSlotsByDate('2026-05-20');
    check('getReservedSlotsByDate.shape', slots && Array.isArray(slots.slots), slots);
  } catch (e) {
    check('getReservedSlotsByDate', false, e.message);
  }

  // 7. 가격 회귀 — 요구사항 명세서_260522 표 그대로
  // 시나리오 A: 평일 5명 × 3시간
  //   packageRate=300,000 / extraHours=0 / extraPersons=1, extraPersonFee=1×10,000×3=30,000
  //   subtotal=330,000 / vat=Math.round(330,000×10/110)=30,000 / deposit=100,000 / total=430,000
  try {
    var monday = _findUpcomingWeekday(1);
    var priceA = calculatePrice(5, 3, null, monday);
    check('priceA.basePrice=300000', priceA.basePrice === 300000, { got: priceA.basePrice });
    check('priceA.extraHoursFee=0', priceA.extraHoursFee === 0, { got: priceA.extraHoursFee });
    check('priceA.extraPersonOnlyFee=30000', priceA.extraPersonOnlyFee === 30000, { got: priceA.extraPersonOnlyFee });
    check('priceA.subtotal=330000', priceA.subtotal === 330000, { got: priceA.subtotal });
    check('priceA.deposit=100000', priceA.deposit === 100000, { got: priceA.deposit });
    check('priceA.total=430000', priceA.total === 430000, { got: priceA.total });
    check('priceA.isWeekend=false', priceA.isWeekend === false);
  } catch (e) {
    check('priceA.regression', false, e.message);
  }

  // 시나리오 B: 주말 4명 × 4시간
  //   packageRate=400,000 / extraHours=1, extraHoursFee=50,000 / extraPersonFee=0
  //   subtotal=450,000 / deposit=100,000 / total=550,000
  try {
    var saturday = _findUpcomingWeekday(6);
    var priceB = calculatePrice(4, 4, null, saturday);
    check('priceB.basePrice=400000', priceB.basePrice === 400000, { got: priceB.basePrice });
    check('priceB.extraHoursFee=50000', priceB.extraHoursFee === 50000, { got: priceB.extraHoursFee });
    check('priceB.extraPersonOnlyFee=0', priceB.extraPersonOnlyFee === 0, { got: priceB.extraPersonOnlyFee });
    check('priceB.subtotal=450000', priceB.subtotal === 450000, { got: priceB.subtotal });
    check('priceB.total=550000', priceB.total === 550000, { got: priceB.total });
    check('priceB.isWeekend=true', priceB.isWeekend === true);
  } catch (e) {
    check('priceB.regression', false, e.message);
  }

  // 시나리오 C: 평일 6명 × 4시간 (추가 2명 × 4시간 × 10,000 = 80,000 + 시간추가 50,000)
  //   subtotal=300,000+50,000+80,000=430,000 / deposit=100,000 / total=530,000
  try {
    var monday2 = _findUpcomingWeekday(1);
    var priceC = calculatePrice(6, 4, null, monday2);
    check('priceC.extraHoursFee=50000', priceC.extraHoursFee === 50000, { got: priceC.extraHoursFee });
    check('priceC.extraPersonOnlyFee=80000', priceC.extraPersonOnlyFee === 80000, { got: priceC.extraPersonOnlyFee });
    check('priceC.subtotal=430000', priceC.subtotal === 430000, { got: priceC.subtotal });
    check('priceC.total=530000', priceC.total === 530000, { got: priceC.total });
  } catch (e) {
    check('priceC.regression', false, e.message);
  }

  // 8. checkAvailability 응답 형태
  try {
    var avail = checkAvailability('2026-05-20', '10:00', '13:00');
    check('checkAvailability.available.type', typeof avail.available === 'boolean', avail);
    check('checkAvailability.success', avail.success === true);
  } catch (e) {
    check('checkAvailability', false, e.message);
  }

  // 9. 마스킹
  try {
    var masked = maskSensitive({ card: '1234-5678-9012-3456', PAYMENT_SECRET_KEY: 'secret123' });
    var json = JSON.stringify(masked);
    check('mask.card', json.indexOf('5678') === -1, masked);
    check('mask.secret', json.indexOf('secret123') === -1, masked);
  } catch (e) {
    check('mask', false, e.message);
  }

  // 10. ok/fail 빌더
  try {
    var okResp = ok({ x: 1 }, { x: 1 });
    check('ok.success', okResp.success === true);
    check('ok.rootShim', okResp.x === 1);
    var failResp = fail('INVALID_INPUT', 'msg');
    check('fail.errorCode', failResp.errorCode === 'INVALID_INPUT');
    check('fail.error.compat', failResp.error === 'msg');
  } catch (e) {
    check('builders', false, e.message);
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
 * 다음 주의 특정 요일을 YYYY-MM-DD로 반환.
 * @private
 */
function _findUpcomingWeekday(targetDay) {
  var d = new Date();
  var diff = (targetDay - d.getDay() + 7) % 7;
  if (diff === 0) diff = 7;
  d.setDate(d.getDate() + diff);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * 환불 정책(일 단위) 단독 검증.
 */
function _verifyRefundPolicy_260522() {
  var results = [];
  function _test(name, daysBefore, expectedRate) {
    var d = new Date();
    var reservation = new Date(d);
    reservation.setDate(d.getDate() + daysBefore);
    var resStr = Utilities.formatDate(reservation, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var r = calculateRefundAmount({ amount: 300000, reservationDate: resStr }, d);
    results.push({ check: name, ok: r.refundRate === expectedRate, got: r });
  }
  _test('refund.10일전=100%', 10, 100);
  _test('refund.6일전=50%', 6, 50);
  _test('refund.4일전=30%', 4, 30);
  _test('refund.1일전=0%', 1, 0);
  console.log(JSON.stringify(results, null, 2));
  return results;
}

/**
 * 마스킹 단독 테스트.
 */
function _testMasking() {
  log(LOG_LEVEL.ERROR, 'test.masking', {
    card: '1234-5678-9012-3456',
    PAYMENT_SECRET_KEY: 'sk_test_abc123',
    KAKAO_API_KEY: 'kakao_secret'
  });
}
