/**
 * 40_Pricing.gs - 가격 계산
 *
 * 명세서 Task 0-8: 옵션 상품 합산을 처리하는 calculateTotalPrice 신설.
 * 기존 calculatePrice는 옵션 0개 호출 wrapper로 변경하여 가격 결과 회귀 0 보장.
 * suggestRoomType 포함.
 */

// ==========================================
// 통합 가격 계산 (신규, 옵션 포함)
// ==========================================

/**
 * 예약 기본 요금 + 옵션 상품 합산.
 * VAT는 모든 항목 합산 후 일괄 적용 (명세서 0-8 제약).
 *
 * @param {{persons:number, hours:number, roomType:string}} reservationParams
 * @param {Array<{id:string, quantity:number}>} options - 선택된 옵션 상품 (없으면 빈 배열)
 * @return {{reservationFee, optionsFee, subtotal, vat, total, breakdown}}
 * @throws {Error} 옵션 ID 미존재/비활성/수량초과 → INVALID_OPTION
 */
function calculateTotalPrice(reservationParams, options) {
  var settings = _getSettingsRaw();
  var basePersons = settings['기준인원'] || 3;
  var baseRate = settings['시간당기본요금'] || 44000;
  var extraPersonRate = settings['추가인원단가'] || 5000;
  var vatRate = settings['VAT요율'] || 10;

  var persons = parseInt(reservationParams.persons, 10);
  var hours = Number(reservationParams.hours);
  var roomType = reservationParams.roomType;

  // 예약 기본 요금
  var roomMultiplier = roomType === 'A+B' ? 2 : 1;
  var basePrice = baseRate * roomMultiplier * hours;
  var extraPersons = Math.max(0, persons - basePersons);
  var extraPersonFee = extraPersons * extraPersonRate * hours;
  var reservationFee = basePrice + extraPersonFee;

  // 옵션 상품 합산
  var optionsFee = 0;
  var optionsDetail = [];
  if (options && options.length > 0) {
    var products = getOptionProducts();
    var byId = {};
    products.forEach(function (p) { byId[p.id] = p; });

    options.forEach(function (opt) {
      var product = byId[opt.id];
      if (!product || product.active !== 'Y') {
        var err = new Error('옵션 상품 ID가 유효하지 않습니다: ' + opt.id);
        err.errorCode = ERROR_CODES.INVALID_OPTION;
        throw err;
      }
      var qty = parseInt(opt.quantity, 10) || 0;
      if (qty <= 0 || qty > product.maxQuantity) {
        var err2 = new Error('옵션 상품 수량이 유효하지 않습니다: ' + opt.id + ' (요청 ' + qty + ', 최대 ' + product.maxQuantity + ')');
        err2.errorCode = ERROR_CODES.INVALID_OPTION;
        throw err2;
      }
      var sub = product.price * qty;
      optionsFee += sub;
      optionsDetail.push({
        id: product.id,
        name: product.name,
        quantity: qty,
        unitPrice: product.price,
        subtotal: sub
      });
    });
  }

  var subtotal = reservationFee + optionsFee;
  var vat = Math.round(subtotal * vatRate / 100);
  var total = subtotal + vat;

  return {
    reservationFee: reservationFee,
    optionsFee: optionsFee,
    subtotal: subtotal,
    vat: vat,
    total: total,
    breakdown: {
      base: basePrice,
      extraPerson: extraPersonFee,
      optionsDetail: optionsDetail
    }
  };
}

// ==========================================
// calculatePrice - 클라이언트 호출 (하위 호환)
// ==========================================

/**
 * 실시간 가격 계산. 클라이언트 호출.
 * 내부에서 calculateTotalPrice(params, [])로 위임 — 옵션 없는 기존 동작과 결과 동일.
 *
 * 응답: { success:true, data:{basePrice, extraPersonFee, subtotal, vat, total}, basePrice, extraPersonFee, subtotal, vat, total }
 * root 노출은 index.html L954-958이 price.basePrice 등을 직접 읽기 때문.
 *
 * @param {number} persons
 * @param {number} hours
 * @param {string} roomType
 * @return {Object}
 */
function calculatePrice(persons, hours, roomType) {
  try {
    var result = calculateTotalPrice({ persons: persons, hours: hours, roomType: roomType }, []);
    var view = {
      basePrice: result.breakdown.base,
      extraPersonFee: result.breakdown.extraPerson,
      subtotal: result.subtotal,
      vat: result.vat,
      total: result.total
    };
    return ok(view, view);
  } catch (error) {
    logError('calculatePrice', error);
    // 기존 폴백: 0원 + error 필드. root에 0 값도 함께 노출하여 UI 깨짐 방지.
    var zero = { basePrice: 0, extraPersonFee: 0, subtotal: 0, vat: 0, total: 0 };
    var resp = fail(error.errorCode || ERROR_CODES.UNKNOWN_ERROR, '가격 계산 중 오류가 발생했습니다.');
    Object.keys(zero).forEach(function (k) { resp[k] = zero[k]; });
    return resp;
  }
}

// ==========================================
// suggestRoomType - 클라이언트 호출 (하위 호환)
// ==========================================

/**
 * 인원 기준 Room 자동 추천. 클라이언트 호출.
 * 명세서 6-1 표준 포맷 예외 — index.html L897이 `=== 'A+B'` 문자열 비교를 하므로
 * 의도적으로 문자열을 그대로 반환.
 *
 * @param {number} persons
 * @return {string} 'A' 또는 'A+B'
 */
function suggestRoomType(persons) {
  try {
    var settings = _getSettingsRaw();
    var abThreshold = settings['AB동시대관기준'] || 10;
    return (persons >= abThreshold) ? 'A+B' : 'A';
  } catch (error) {
    logError('suggestRoomType', error);
    return 'A';
  }
}

// ==========================================
// 옵션 상품 시트 조회
// ==========================================

/**
 * 옵션상품 시트 전체를 객체 배열로 반환.
 * 시트가 없으면 빈 배열 (Phase 0 초기 환경 호환).
 *
 * @return {Array<{id, category, name, description, price, unit, maxQuantity, active, order}>}
 */
function getOptionProducts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('옵션상품');
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var products = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    products.push({
      id: row[0],
      category: row[1],
      name: row[2],
      description: row[3],
      price: Number(row[4]) || 0,
      unit: row[5],
      maxQuantity: Number(row[6]) || 0,
      active: row[7] === 'Y' || row[7] === true ? 'Y' : 'N',
      order: Number(row[8]) || 0
    });
  }
  return products;
}

// ==========================================
// 환불 금액 계산 (시그니처만, Phase 1에서 채워질 자리)
// ==========================================

/**
 * 환불 정책에 따른 환불 금액 계산.
 * Phase 0에서는 정책 매트릭스만 적용한 단순 계산. Phase 1에서 결제 모듈 연동 시 확장 예정.
 *
 * @param {{amount:number, reservationDate:string, startTime:string}} payment
 * @param {Date|string} cancelledAt - 취소 요청 시각
 * @return {{refundRate:number, refundAmount:number, policy:string}}
 */
function calculateRefundAmount(payment, cancelledAt) {
  var settings = _getSettingsRaw();
  var policy24 = Number(settings['환불정책_24시간이상']);
  var policy12 = Number(settings['환불정책_12시간이상']);
  var policy0 = Number(settings['환불정책_12시간미만']);
  if (isNaN(policy24)) policy24 = 100;
  if (isNaN(policy12)) policy12 = 50;
  if (isNaN(policy0)) policy0 = 0;

  var reservationDt = new Date(payment.reservationDate + ' ' + (payment.startTime || '00:00'));
  var cancelDt = (cancelledAt instanceof Date) ? cancelledAt : new Date(cancelledAt || new Date());
  var hoursBefore = (reservationDt.getTime() - cancelDt.getTime()) / (1000 * 60 * 60);

  var rate;
  var policy;
  if (hoursBefore >= 24) { rate = policy24; policy = '24시간이상'; }
  else if (hoursBefore >= 12) { rate = policy12; policy = '12-24시간'; }
  else { rate = policy0; policy = '12시간미만'; }

  return {
    refundRate: rate,
    refundAmount: Math.round((payment.amount || 0) * rate / 100),
    policy: policy
  };
}
