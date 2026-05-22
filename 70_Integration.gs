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
  try {
    var docId = getConfig('TERMS_DOC_ID') || '15NN03jeN6CHls3TMjkTIQWfmQIDvnxuoKukARue3f_0';
    var doc = DocumentApp.openById(docId);
    var body = doc.getBody();
    var lastModifiedDate = DriveApp.getFileById(docId).getLastUpdated();
    var htmlContent = convertDocToHtml(body);
    var lastModified = Utilities.formatDate(lastModifiedDate, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    var data = { content: htmlContent, lastModified: lastModified };
    return ok(data, data);
  } catch (error) {
    logError('getTermsContent', error);
    // 폴백 응답 — 기존 UI가 result.content를 직접 사용하므로 root에 함께 노출
    var fallback = {
      content: '<p>약관을 불러오는데 실패했습니다. 관리자에게 문의해주세요.</p>',
      lastModified: ''
    };
    var resp = fail(ERROR_CODES.STORAGE_ERROR, '약관을 불러오는데 실패했습니다.');
    resp.content = fallback.content;
    resp.lastModified = fallback.lastModified;
    resp.data = fallback;
    return resp;
  }
}

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
