/**
 * 40_Pricing.gs - 가격 계산 (260522 약관 기준)
 *
 * 변경 사항:
 *  - 시간당 요금 → 3시간 패키지 + 시간 추가 모델
 *  - 평일/주말(공휴일 포함) 차등 요금
 *  - VAT 포함 가격 (표시는 역산하여 분리)
 *  - 보증금 항목 추가 (예약금과 함께 수령)
 *
 * 명세 참고: 요구사항명세서_260522_1.md (이오 아크로 _성수 약관)
 */

// ==========================================
// 평일/주말 판정
// ==========================================

/**
 * 주어진 날짜가 주말(토·일) 또는 공휴일인지 판정합니다.
 * 공휴일 목록은 설정 시트의 '공휴일목록' 키(쉼표 구분 YYYY-MM-DD)에서 읽으며,
 * 키가 없으면 단순 주말 판정만 수행합니다.
 *
 * @param {string|Date} date - YYYY-MM-DD 또는 Date
 * @return {boolean}
 */
function isWeekendOrHoliday(date) {
  if (!date) return false;
  var d = (date instanceof Date) ? date : new Date(date);
  var day = d.getDay(); // 0=일, 6=토
  if (day === 0 || day === 6) return true;

  // 공휴일 목록 (선택) — 운영자가 설정 시트에 직접 등록한 경우만 처리
  try {
    var settings = _getSettingsRaw();
    var holidaysStr = settings['공휴일목록'];
    if (!holidaysStr) return false;
    var dateStr = (typeof date === 'string') ? date : formatDate(d);
    return String(holidaysStr).split(',').map(function (s) { return s.trim(); }).indexOf(dateStr) >= 0;
  } catch (e) {
    return false;
  }
}

// ==========================================
// 통합 가격 계산
// ==========================================

/**
 * 예약 기본 요금 + 옵션 상품 합산.
 *
 * 260522 약관 기준 가격 모델:
 *   subtotal = (평일/주말 3시간 패키지) + (시간추가요금 × 추가시간) + (인원추가요금 × 초과인원) + (옵션 합계)
 *   total    = subtotal + 보증금
 *   vat      = subtotal × VAT요율 / (100 + VAT요율)   ← VAT 포함 가격에서 역산
 *
 * 모든 표시 가격은 VAT 포함입니다(설정 'VAT포함여부' = 'Y' 가정).
 *
 * @param {{persons:number, hours:number, date?:string}} reservationParams
 *   - 단일 공간 운영이므로 roomType은 사용하지 않습니다.
 * @param {Array<{id:string, quantity:number}>} options - 옵션 상품 (없으면 빈 배열)
 * @return {Object}
 * @throws {Error} 옵션 ID 미존재/비활성/수량초과 → INVALID_OPTION
 */
function calculateTotalPrice(reservationParams, options) {
  var settings = _getSettingsRaw();

  var basePersons = Number(settings['기준인원']) || 4;
  var maxPersons = Number(settings['최대인원']) || 8;
  var minHours = Number(settings['최소이용시간']) || 3;
  var weekdayRate = Number(settings['기본요금_평일_3시간']) || 300000;
  var weekendRate = Number(settings['기본요금_주말_3시간']) || 400000;
  var extraHourRate = Number(settings['시간추가요금']) || 50000;
  var extraPersonRate = Number(settings['인원추가요금']) || 10000;
  var deposit = Number(settings['보증금']) || 100000;
  var vatRate = Number(settings['VAT요율']) || 10;
  var vatIncluded = (settings['VAT포함여부'] || 'Y') !== 'N';

  var persons = parseInt(reservationParams.persons, 10);
  var hours = Number(reservationParams.hours);
  var date = reservationParams.date;

  // 평일/주말 판정 — date가 없으면 평일로 가정 (UI에서 미선택 상태)
  var isWeekend = date ? isWeekendOrHoliday(date) : false;
  var packageRate = isWeekend ? weekendRate : weekdayRate;

  // 시간 추가 (3시간 패키지 초과분)
  var extraHours = Math.max(0, hours - minHours);
  var extraHoursFee = extraHours * extraHourRate;

  // 인원 추가 (기준 인원 초과분, 1인당 1회 부과)
  var extraPersons = Math.max(0, persons - basePersons);
  var extraPersonFee = extraPersons * extraPersonRate;

  var reservationFee = packageRate + extraHoursFee + extraPersonFee;

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
        var err2 = new Error('옵션 상품 수량이 유효하지 않습니다: ' + opt.id +
                             ' (요청 ' + qty + ', 최대 ' + product.maxQuantity + ')');
        err2.errorCode = ERROR_CODES.INVALID_OPTION;
        throw err2;
      }
      var sub = product.price * qty;
      optionsFee += sub;
      optionsDetail.push({
        id: product.id, name: product.name, quantity: qty,
        unitPrice: product.price, subtotal: sub
      });
    });
  }

  var subtotal = reservationFee + optionsFee; // 예약 + 옵션 (VAT 포함)
  var vat;
  if (vatIncluded) {
    // VAT 포함 가격에서 역산
    vat = Math.round(subtotal * vatRate / (100 + vatRate));
  } else {
    vat = Math.round(subtotal * vatRate / 100);
    subtotal = subtotal + vat; // VAT 별도 모델 시 합산
  }
  var total = subtotal + deposit; // 보증금 포함 최종 결제액

  return {
    reservationFee: reservationFee,
    optionsFee: optionsFee,
    deposit: deposit,
    subtotal: subtotal,
    vat: vat,
    total: total,
    isWeekend: isWeekend,
    breakdown: {
      packageRate: packageRate,
      extraHours: extraHours,
      extraHoursFee: extraHoursFee,
      extraPersons: extraPersons,
      extraPersonFee: extraPersonFee,
      optionsDetail: optionsDetail,
      vatIncluded: vatIncluded
    }
  };
}

// ==========================================
// calculatePrice - 클라이언트 호출 (하위 호환)
// ==========================================

/**
 * 실시간 가격 계산. 클라이언트 호출.
 * 새 모델에 맞춰 표시 필드를 재구성하되, 기존 root 키(basePrice/extraPersonFee/subtotal/vat/total)는
 * UI 호환을 위해 유지합니다.
 *
 * 매핑:
 *   basePrice       = 3시간 패키지 요금 (평일/주말 판정 반영)
 *   extraPersonFee  = 시간추가 + 인원추가 합산 (UI가 "추가 요금" 1개 행으로 표시)
 *   subtotal        = basePrice + extraPersonFee (VAT 포함 가격, 보증금 제외)
 *   vat             = VAT 역산값 (표시용)
 *   total           = subtotal + 보증금
 *
 * 새로 노출되는 root 필드:
 *   deposit, extraHoursFee, extraPersonOnlyFee, isWeekend, packageRate
 *
 * @param {number} persons
 * @param {number} hours
 * @param {string} [roomType] - (호환 인자) 단일 공간이므로 사용하지 않습니다.
 * @param {string} [date] - YYYY-MM-DD (선택, 없으면 평일 가정)
 * @return {Object}
 */
function calculatePrice(persons, hours, roomType, date) {
  try {
    var result = calculateTotalPrice(
      { persons: persons, hours: hours, date: date },
      []
    );
    var view = {
      basePrice: result.breakdown.packageRate,
      extraPersonFee: result.breakdown.extraHoursFee + result.breakdown.extraPersonFee,
      subtotal: result.subtotal,
      vat: result.vat,
      total: result.total,
      // 신규 표시 필드
      deposit: result.deposit,
      extraHoursFee: result.breakdown.extraHoursFee,
      extraPersonOnlyFee: result.breakdown.extraPersonFee,
      isWeekend: result.isWeekend,
      packageRate: result.breakdown.packageRate
    };
    return ok(view, view);
  } catch (error) {
    logError('calculatePrice', error);
    var zero = {
      basePrice: 0, extraPersonFee: 0, subtotal: 0, vat: 0, total: 0,
      deposit: 0, extraHoursFee: 0, extraPersonOnlyFee: 0,
      isWeekend: false, packageRate: 0
    };
    var resp = fail(error.errorCode || ERROR_CODES.UNKNOWN_ERROR, '가격 계산 중 오류가 발생했습니다.');
    Object.keys(zero).forEach(function (k) { resp[k] = zero[k]; });
    return resp;
  }
}

// ==========================================
// 옵션 상품 시트 조회 (변경 없음)
// ==========================================

/**
 * 옵션상품 시트 전체를 객체 배열로 반환합니다.
 * 시트가 없으면 빈 배열을 반환합니다(Phase 0 초기 환경 호환).
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
// 환불 금액 계산 (260522 약관 기준, 일 단위)
// ==========================================

/**
 * 환불 정책에 따른 환불 금액 계산.
 *
 * 260522 약관:
 *   - 이용일 8일 전까지 100%
 *   - 7~5일 전 50%
 *   - 4~3일 전 30%
 *   - 2일 전 ~ 당일 0% (위약금 100%)
 *   - 천재지변은 별도 처리 (이 함수에서는 다루지 않음)
 *
 * 설정 시트의 '환불정책_8일이상'/'_5_7일'/'_3_4일'/'_2일이내' 키를 사용하며,
 * 키가 없으면 약관 기본값으로 폴백합니다.
 *
 * 보증금은 별도 항목으로 회사 정책에 따라 처리되므로 본 함수 결과에는 포함하지 않습니다.
 *
 * @param {{amount:number, reservationDate:string, startTime:string}} payment
 *   - amount: 환불 대상 결제 금액 (보증금 제외)
 *   - reservationDate: YYYY-MM-DD
 *   - startTime: HH:MM (선택)
 * @param {Date|string} cancelledAt - 취소 요청 시각
 * @return {{refundRate:number, refundAmount:number, policy:string, daysBefore:number}}
 */
function calculateRefundAmount(payment, cancelledAt) {
  var settings = _getSettingsRaw();

  function n(key, fallback) {
    var v = Number(settings[key]);
    return isNaN(v) ? fallback : v;
  }
  var p8 = n('환불정책_8일이상', 100);
  var p57 = n('환불정책_5_7일', 50);
  var p34 = n('환불정책_3_4일', 30);
  var p2 = n('환불정책_2일이내', 0);

  // 일 단위 차이 계산 (자정 기준)
  var reservationDt = new Date(payment.reservationDate + 'T00:00:00');
  var cancelDt = (cancelledAt instanceof Date) ? cancelledAt : new Date(cancelledAt || new Date());
  var cancelMidnight = new Date(cancelDt.getFullYear(), cancelDt.getMonth(), cancelDt.getDate());
  var daysBefore = Math.floor((reservationDt.getTime() - cancelMidnight.getTime()) / (1000 * 60 * 60 * 24));

  var rate, policy;
  if (daysBefore >= 8) { rate = p8; policy = '8일이상'; }
  else if (daysBefore >= 5) { rate = p57; policy = '5_7일'; }
  else if (daysBefore >= 3) { rate = p34; policy = '3_4일'; }
  else { rate = p2; policy = '2일이내'; }

  return {
    refundRate: rate,
    refundAmount: Math.round((payment.amount || 0) * rate / 100),
    policy: policy,
    daysBefore: daysBefore
  };
}
