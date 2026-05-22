/**
 * 70_Integration.gs - 외부 시스템 연동
 *
 * Calendar (이벤트 생성/동기화), Drive (파일 업로드), Docs (약관 HTML 변환).
 * Phase 1에서 이메일/알림톡 발송이 이 파일에 추가될 예정.
 */

// ==========================================
// Drive - 파일 업로드
// ==========================================

/**
 * Blob을 Drive에 업로드. 폴더는 getUploadFolderId()에서 관리.
 * @param {Blob} fileBlob
 * @param {string} reservationNumber - 파일명 prefix로 사용
 * @return {string} 업로드된 파일의 Drive URL
 */
function uploadFile(fileBlob, reservationNumber) {
  try {
    if (!fileBlob) return '';

    var maxSize = 10 * 1024 * 1024;
    if (fileBlob.getBytes().length > maxSize) {
      throw new Error('파일 크기가 10MB를 초과합니다.');
    }

    var folderId = getUploadFolderId();
    var folder = DriveApp.getFolderById(folderId);

    var originalName = fileBlob.getName();
    var fileName = reservationNumber + '_' + originalName;
    var file = folder.createFile(fileBlob.setName(fileName));

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingError) {
      console.log('파일 공유 설정 실패 (무시):', sharingError);
    }

    var fileUrl = file.getUrl();
    log(LOG_LEVEL.INFO, 'file.uploaded', {
      reservationNumber: reservationNumber,
      fileName: fileName,
      fileSize: fileBlob.getBytes().length,
      fileUrl: fileUrl
    });
    return fileUrl;

  } catch (error) {
    logError('uploadFile', error);
    var size = fileBlob ? fileBlob.getBytes().length : 'unknown';
    throw new Error('파일 업로드 실패: ' + error.message + ' (파일크기: ' + size + ' bytes)');
  }
}

// ==========================================
// Calendar - 이벤트 생성
// ==========================================

/**
 * Google Calendar에 예약 이벤트 생성 (260522 약관: 단일 공간, eoacro 캘린더).
 * Calendar ID는 CALENDAR_ID_CONFIRMED Property 우선, 없으면 기본 Calendar 사용.
 *
 * @param {Object} reservationData - 신규 32컬럼 양식 필드 (이름/연락처/이메일/인원/세금계산서/이용시간/총금액/보증금 등)
 * @return {string} eventId
 */
function createCalendarEvent(reservationData) {
  try {
    var calendarId = getConfig('CALENDAR_ID_CONFIRMED');
    var calendar = calendarId
      ? CalendarApp.getCalendarById(calendarId)
      : CalendarApp.getDefaultCalendar();
    if (!calendar) {
      throw new Error('Calendar를 찾을 수 없습니다. CALENDAR_ID_CONFIRMED 설정을 확인하세요.');
    }

    var startDateTime = _composeDateTime(reservationData.date, reservationData.startTime);
    var endDateTime = _composeDateTime(reservationData.date, reservationData.endTime);

    var title = '[예약] ' + reservationData.name + ' (' + reservationData.persons + '명, ' +
                reservationData.hours + '시간)';

    var description =
      '=== 예약 정보 ===\n' +
      '예약번호: ' + reservationData.reservationNumber + '\n' +
      '이용 시간: ' + reservationData.hours + '시간\n' +
      '\n' +
      '=== 예약자 정보 ===\n' +
      '이름: ' + reservationData.name + '\n' +
      '연락처: ' + reservationData.phone + '\n' +
      '이메일: ' + (reservationData.email || '') + '\n' +
      '전체 인원: ' + reservationData.persons + '명\n' +
      '\n' +
      '=== 결제 정보 ===\n' +
      '총 결제 금액: ' + _won(reservationData.totalAmount) + '원\n' +
      (reservationData.deposit ? '└ 보증금: ' + _won(reservationData.deposit) + '원\n' : '') +
      '세금계산서: ' + (reservationData.taxBill === 'Y' ? '발행' : '미발행');

    var event = calendar.createEvent(title, startDateTime, endDateTime, {
      description: description,
      location: '이오 아크로 _성수'
    });
    event.addPopupReminder(30);

    var eventId = event.getId();
    log(LOG_LEVEL.INFO, 'calendar.event.created', {
      reservationNumber: reservationData.reservationNumber,
      eventId: eventId,
      title: title,
      startTime: startDateTime,
      endTime: endDateTime
    });
    return eventId;

  } catch (error) {
    logError('createCalendarEvent', error);
    throw new Error('Calendar 이벤트 생성 실패: ' + error.message);
  }
}

/**
 * 입금확인(S열) 체크 후 Calendar 동기화. 시트의 UI 측 함수.
 * 신규 32컬럼 양식 기준 — 입금확인은 S(19번째), 입금확인일시는 T(20번째).
 */
function syncToCalendar() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('예약내역');
    var data = sheet.getDataRange().getValues();
    var processedCount = 0;

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var isChecked = row[COL_RES.depositConfirmed];        // S열
      var processedDate = row[COL_RES.depositConfirmedAt];  // T열

      if ((isChecked === true || isChecked === 'Y') && !processedDate) {
        var reservationData = {
          reservationNumber: row[COL_RES.reservationNumber],
          date: row[COL_RES.date],
          startTime: row[COL_RES.startTime],
          endTime: row[COL_RES.endTime],
          hours: row[COL_RES.hours],
          name: row[COL_RES.name],
          phone: row[COL_RES.phone],
          email: row[COL_RES.email],
          persons: row[COL_RES.persons],
          taxBill: row[COL_RES.taxBill],
          totalAmount: row[COL_RES.total],
          deposit: row[COL_RES.deposit]
        };
        createCalendarEvent(reservationData);
        // T열에 처리 일시 기록 (1-base 컬럼 = 20)
        sheet.getRange(i + 1, COL_RES.depositConfirmedAt + 1).setValue(new Date());
        processedCount++;
      }
    }
    SpreadsheetApp.getUi().alert('Calendar 동기화 완료\n\n처리된 예약: ' + processedCount + '건');
  } catch (error) {
    logError('syncToCalendar', error);
    SpreadsheetApp.getUi().alert('오류 발생\n\n' + error.message);
  }
}

/**
 * 시트 셀에서 읽은 날짜/시간 값을 안전하게 Date로 조립.
 * @private
 */
function _composeDateTime(dateVal, timeVal) {
  var dateStr = (dateVal instanceof Date) ? formatDate(dateVal) : String(dateVal);
  var timeStr;
  if (timeVal instanceof Date) {
    timeStr = ('0' + timeVal.getHours()).slice(-2) + ':' + ('0' + timeVal.getMinutes()).slice(-2);
  } else {
    timeStr = String(timeVal);
  }
  return new Date(dateStr + ' ' + timeStr);
}

/**
 * @private
 */
function _won(n) {
  return n ? Number(n).toLocaleString() : '0';
}

// ==========================================
// Docs - 약관 HTML 변환
// ==========================================

/**
 * Google Docs에서 이용약관을 HTML로 가져옴. 클라이언트 호출.
 * Docs ID: TERMS_DOC_ID Property 우선, 없으면 기존 하드코딩 값 폴백.
 * TODO Phase 1: TERMS_DOC_ID를 Property에 명시 등록한 뒤 이 폴백 라인 제거.
 *
 * 응답: { success:true, data:{content, lastModified}, content, lastModified }
 *
 * @return {Object}
 */
function getTermsContent() {
  var data = { content: TERMS_HTML_260522, lastModified: TERMS_VERSION_260522 };
  return ok(data, data);
}

var TERMS_VERSION_260522 = '2026-05-22';

var TERMS_HTML_260522 =
'<h2>공간대여 (이오 아크로 _성수) 이용약관</h2>' +
'<h3>제1조 (목적)</h3>' +
'<p>본 약관은 \'이오 아크로(Eo Acro) 성수\'(이하 \'회사\'라 합니다)가 제공하는 공간대여 서비스 및 관련 부대서비스(이하 \'서비스\'라 합니다)를 이용함에 있어, 회사와 이용고객(이하 \'이용자\'라 합니다) 간의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.</p>' +
'<h3>제2조 (예약 및 확정)</h3>' +
'<p>공간 이용 예약은 회사가 지정한 예약 시스템을 통해 신청하며, 이용대금 전액(기본 요금 및 추가 옵션 비용) 결제와 약정된 보증금(100,000원) 입금, 그리고 회사의 \'확정 안내(eoacro 캘린더 등록 및 문자/메일 발송)\'가 모두 완료된 시점에 예약이 성립된 것으로 봅니다.</p>' +
'<p>관리자 식별 및 문의처는 다음과 같습니다. 모든 예약 요금은 부가세(VAT) 포함 가격이며, 현금영수증 및 사업자 세금계산서 발행은 추가 요금 없이 동일한 금액으로 진행됩니다.</p>' +
'<ul>' +
  '<li>이메일: eoaceo@gmail.com</li>' +
  '<li>연락처: 010-9983-0025 / 010-4499-4734</li>' +
'</ul>' +
'<h3>제3조 (이용 시간 및 인원 준수)</h3>' +
'<ol>' +
  '<li><strong>최소 이용 시간</strong>: 본 공간의 최소 대여 시간은 3시간입니다. 예약된 이용 시간은 [입실 시간 및 퇴실(정리 포함) 시간]을 모두 포함합니다.</li>' +
  '<li><strong>시간 추가</strong>: 예약 시간 외에 연장을 원하실 경우 최소 이용 대음 외에 1시간당 50,000원의 추가 요금이 부과되며, 뒷 타임 예약 상황에 따라 연장이 불가할 수 있습니다. 사전 협의 없는 지연 퇴실 시 보증금 차감 또는 패널티가 청구됩니다.</li>' +
  '<li><strong>인원 기준</strong>: 본 공간의 기본 이용 인원은 4명이며, 최대 8명까지 입실 가능합니다. 기준 인원 초과 시 1인당 10,000원의 추가 인원 요금이 발생하며, 사전 고지 없이 최대 인원을 초과하여 적발될 경우 즉시 퇴실 조치될 수 있습니다.</li>' +
'</ol>' +
'<h3>제4조 (취소 및 환불 규정)</h3>' +
'<p>소비자분쟁해결기준 및 공간대여 특성을 고려하여 환불 규정을 다음과 같이 적용합니다. (올바른 예약을 위해 신중하게 결정해 주시기 바랍니다.)</p>' +
'<ul>' +
  '<li>이용일 8일 전까지 취소 시: 100% 환불</li>' +
  '<li>이용일 7일 ~ 5일 전 취소 시: 총 금액의 50% 환불</li>' +
  '<li>이용일 4일 ~ 3일 전 취소 시: 총 금액의 30% 환불</li>' +
  '<li>이용일 2일 전 ~ 당일 취소 시: 환불 불가 (위약금 100% 발생)</li>' +
'</ul>' +
'<p>※ 천재지변으로 인한 이용 불가의 경우 전액 환불을 원칙으로 합니다.</p>' +
'<h3>제5조 (이용자의 의무 및 변상 책임)</h3>' +
'<ul>' +
  '<li><strong>기물 파손 및 오염</strong>: 이용자는 공간 내 모든 시설, 가구, 인테리어 소품, 조명, 식물 등을 소중히 다루어야 합니다. 이용자의 과실로 인해 시설물이나 소품이 파손, 분실, 또는 이염(오염)되는 경우 실구매가 또는 원상복구에 필요한 비용 전액을 변상하셔야 합니다.</li>' +
  '<li><strong>이용 제한</strong>: 공간 내에서는 승인되지 않은 화기 사용, 위험물 반입, 흡연(전자담배 포함)이 절대 금지됩니다. 위반 시 즉시 퇴실 조치되며 환불은 불가합니다.</li>' +
  '<li><strong>상업적 촬영 및 특수 목적</strong>: 사전에 협의되지 않은 대규모 가구 이동, 벽면 타공, 부착물 설치 등 공간 형태를 변형하는 행위는 금지됩니다. (필요 시 사전 승인 필수)</li>' +
'</ul>' +
'<h3>제6조 (퇴실 가이드 및 원상복구)</h3>' +
'<ul>' +
  '<li>이용자는 퇴실 시 공간 내 가구, 조명, 인테리어 소품, 식물 등을 처음 위치로 원상복구(원위치) 해야 합니다.</li>' +
  '<li>이용 중 발생한 모든 쓰레기는 지정된 방식으로 분리수거해야 하며, 음식물 쓰레기를 포함한 내부 오염물은 깨끗이 정리해야 합니다.</li>' +
  '<li>시설 원상복구 및 기본 정리 상태는 퇴실 후 제7조(보증금 제도)에 따라 확인 및 정산됩니다.</li>' +
'</ul>' +
'<h3>제7조 (보증금 제도)</h3>' +
'<ul>' +
  '<li><strong>보증금 금액</strong>: 회사는 공간의 청결 유지, 비품 보호 및 이용 시간 준수를 확인하기 위해 금 100,000원(금 십만 원)의 보증금을 예약금과 함께 수령합니다.</li>' +
  '<li><strong>보증금 반환</strong>: 이용자의 퇴실 후 공간 상태(비품 파손 여부, 청소 상태, 이용 시간 준수 등)를 점검하여 이상이 없을 경우, 퇴실 후 [24시간 이내 / 당일 중] 이용자가 지정한 계좌로 전액 환불합니다.</li>' +
  '<li><strong>보증금 차감 및 추가 청구 기준</strong>: 다음 각 호에 해당하는 경우, 회사는 보증금에서 해당 금액을 차감한 후 잔액을 반환하며, 보증금을 초과하는 손해가 발생할 경우 이용자에게 추가 비용을 청구할 수 있습니다.' +
    '<ul>' +
      '<li>청소 및 정리 미비: 분리수거 미이행, 음식물 쓰레기 방치, 내부 오염 등으로 인해 특수 청소가 필요한 경우 (차감액: 최소 30,000원 ~ 100,000원 또는 전문 청소 비용 전액)</li>' +
      '<li>시간 위반: 사전 협의 없이 퇴실 시간이 [10분 이상] 지연된 경우 (차감액: 1시간 이용 요금 상당액)</li>' +
      '<li>비품 위치 미복구: 대형 가구 및 소품을 임의로 이동한 후 원상복구하지 않은 경우 (차감액: 20,000원)</li>' +
      '<li>기물 파손 및 오염: 시설물, 가구, 소품, 식물, 벽면 등이 파손되거나 이염된 경우 (손해액 방지를 위해 보증금 전액 보류 후, 실물 가액 또는 원상복구 비용 견적에 따라 정산)</li>' +
      '<li>실내 흡연: 내부 공간에서 흡연(전자담배 포함) 적발 시 (보증금 100,000원 전액 위약금 처리 및 즉시 퇴실 조치)</li>' +
    '</ul>' +
  '</li>' +
'</ul>' +
'<h3>제8조 (기타)</h3>' +
'<p>본 약관에 명시되지 않은 사항은 관계 법령 및 상관례에 따릅니다.</p>';

/**
 * Docs Body를 HTML로 변환.
 * @param {Body} body
 * @return {string}
 */
function convertDocToHtml(body) {
  var numChildren = body.getNumChildren();
  var html = '';
  for (var i = 0; i < numChildren; i++) {
    var child = body.getChild(i);
    var type = child.getType();

    if (type === DocumentApp.ElementType.PARAGRAPH) {
      var paragraph = child.asParagraph();
      var heading = paragraph.getHeading();
      var text = paragraph.getText();
      if (!text.trim()) continue;

      if (heading === DocumentApp.ParagraphHeading.HEADING1) {
        html += '<h1>' + escapeHtml(text) + '</h1>\n';
      } else if (heading === DocumentApp.ParagraphHeading.HEADING2) {
        html += '<h2>' + escapeHtml(text) + '</h2>\n';
      } else if (heading === DocumentApp.ParagraphHeading.HEADING3) {
        html += '<h3>' + escapeHtml(text) + '</h3>\n';
      } else if (heading === DocumentApp.ParagraphHeading.HEADING4) {
        html += '<h4>' + escapeHtml(text) + '</h4>\n';
      } else {
        html += '<p>' + convertParagraphToHtml(paragraph) + '</p>\n';
      }
    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      var listItem = child.asListItem();
      html += '<li>' + escapeHtml(listItem.getText()) + '</li>\n';
    } else if (type === DocumentApp.ElementType.TABLE) {
      html += convertTableToHtml(child.asTable());
    }
  }
  return html;
}

/**
 * Paragraph → HTML (포맷은 단순 텍스트로만).
 * @param {Paragraph} paragraph
 * @return {string}
 */
function convertParagraphToHtml(paragraph) {
  var text = paragraph.getText();
  var numChildren = paragraph.getNumChildren();
  var html = '';
  for (var i = 0; i < numChildren; i++) {
    var child = paragraph.getChild(i);
    if (child.getType() === DocumentApp.ElementType.TEXT) {
      html += escapeHtml(child.asText().getText());
    }
  }
  return html || escapeHtml(text);
}

/**
 * Table → HTML.
 * @param {Table} table
 * @return {string}
 */
function convertTableToHtml(table) {
  var numRows = table.getNumRows();
  var html = '<table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0;">\n';
  for (var i = 0; i < numRows; i++) {
    var row = table.getRow(i);
    var numCells = row.getNumCells();
    html += '<tr>\n';
    for (var j = 0; j < numCells; j++) {
      var cellText = row.getCell(j).getText();
      var tag = i === 0 ? 'th' : 'td';
      html += '<' + tag + ' style="padding: 8px; border: 1px solid #ddd;">' + escapeHtml(cellText) + '</' + tag + '>\n';
    }
    html += '</tr>\n';
  }
  html += '</table>\n';
  return html;
}

// ==========================================
// 권한 테스트 (수동 실행용)
// ==========================================

function testDrivePermission() {
  DriveApp.createFolder('테스트');
}

function testCalendarPermission() {
  CalendarApp.getDefaultCalendar();
}
