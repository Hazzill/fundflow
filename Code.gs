const APP_NAME = 'FundFlow';
const DEFAULT_CURRENCY = 'USDT';
const SPREADSHEET_ID = '1neXJl0bUAgv2DcSK5UdC_cIrYZpH8l1D0-FRQRQuQpI';
const SHEET_NAMES = {
  RESULTS: 'DailyResults',
  META: 'Meta',
};

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'status');

    if (action === 'getDashboardData') {
      const monthKey = e.parameter.monthKey || getMonthKey_(new Date());
      return createApiResponse_({
        ok: true,
        data: getDashboardData(monthKey),
      }, e);
    }

    if (action === 'saveDailyResult') {
      return createApiResponse_({
        ok: true,
        data: saveDailyResult(mapResultParams_(e.parameter || {})),
      }, e);
    }

    if (action === 'seedSampleResults') {
      return createApiResponse_({
        ok: true,
        data: { message: seedSampleResults() },
      }, e);
    }

    return createApiResponse_({
      ok: true,
      data: {
        appName: APP_NAME,
        status: 'ready',
        actions: ['getDashboardData', 'saveDailyResult', 'seedSampleResults'],
      },
    }, e);
  } catch (error) {
    return createApiResponse_({
      ok: false,
      message: error.message || 'Unexpected error',
    }, e);
  }
}

function doPost(e) {
  try {
    const payload = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};

    if (payload.events && Array.isArray(payload.events)) {
      handleLineWebhook_(payload.events);
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (payload.action === 'saveDailyResult') {
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: true,
          data: saveDailyResult(payload.data || {}),
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, message: 'Unsupported payload' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, message: error.message || 'Unexpected error' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getDashboardData(monthKey) {
  ensureStorage_();

  const monthDate = parseMonthKey_(monthKey || getMonthKey_(new Date()));
  const results = getDailyResults_();
  const monthResults = results.filter(function (item) {
    return item.resultDate.slice(0, 7) === getMonthKey_(monthDate);
  });

  const dailyMap = buildDailyMap_(monthResults);

  return {
    appName: APP_NAME,
    currency: DEFAULT_CURRENCY,
    monthKey: getMonthKey_(monthDate),
    monthLabel: Utilities.formatDate(monthDate, Session.getScriptTimeZone(), 'MMMM yyyy'),
    today: formatDate_(new Date()),
    summary: buildSummary_(monthResults),
    calendar: buildCalendar_(monthDate, dailyMap),
    recentResults: monthResults.slice().sort(sortResultsDesc_).slice(0, 12),
    allResults: monthResults.slice().sort(sortResultsDesc_),
    dailySeries: buildDailySeries_(monthDate, dailyMap),
    setup: getSetupStatus_(),
  };
}

function saveDailyResult(payload) {
  ensureStorage_();

  const result = normalizeDailyResult_(payload || {});
  const sheet = getSheet_(SHEET_NAMES.RESULTS);
  const existingRow = findResultRowByDate_(sheet, result.resultDate);

  if (existingRow > 1) {
    sheet.getRange(existingRow, 1, 1, 5).setValues([[
      result.recordId,
      result.resultDate,
      result.pnl,
      result.note,
      result.createdAt,
    ]]);
  } else {
    sheet.appendRow([
      result.recordId,
      result.resultDate,
      result.pnl,
      result.note,
      result.createdAt,
    ]);
  }

  return getDashboardData(result.resultDate.slice(0, 7));
}

function seedSampleResults() {
  ensureStorage_();
  const sheet = getSheet_(SHEET_NAMES.RESULTS);

  if (sheet.getLastRow() > 1) {
    return 'DailyResults sheet already contains data.';
  }

  const baseMonth = new Date();
  const samples = [
    sampleDailyResult_(baseMonth, 2, 120.50, 'Target reached'),
    sampleDailyResult_(baseMonth, 4, -45.00, 'Cut loss'),
    sampleDailyResult_(baseMonth, 7, 88.20, 'Good rebound'),
    sampleDailyResult_(baseMonth, 11, 0.00, 'No close'),
    sampleDailyResult_(baseMonth, 14, -110.75, 'Heavy drawdown'),
    sampleDailyResult_(baseMonth, 18, 64.10, 'Recovered'),
    sampleDailyResult_(baseMonth, 21, -11.20, '4 closed positions'),
    sampleDailyResult_(baseMonth, 22, 34.80, 'Small gain'),
  ];

  samples.forEach(function (result) {
    sheet.appendRow([
      result.recordId,
      result.resultDate,
      result.pnl,
      result.note,
      result.createdAt,
    ]);
  });

  return 'Sample data inserted.';
}

function setLineConfig(config) {
  const props = PropertiesService.getScriptProperties();
  if (config.channelAccessToken) {
    props.setProperty('LINE_CHANNEL_ACCESS_TOKEN', config.channelAccessToken);
  }
  if (config.userId) {
    props.setProperty('LINE_USER_ID', config.userId);
  }
  if (config.dashboardUrl) {
    props.setProperty('APP_BASE_URL', config.dashboardUrl);
  }
  return getSetupStatus_();
}

function ensureStorage_() {
  const spreadsheet = getSpreadsheet_();
  ensureSheet_(
    spreadsheet,
    SHEET_NAMES.RESULTS,
    ['recordId', 'resultDate', 'pnl', 'note', 'createdAt']
  );
  ensureSheet_(spreadsheet, SHEET_NAMES.META, ['key', 'value']);
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = SPREADSHEET_ID || props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID is not configured.');
  }

  props.setProperty('SPREADSHEET_ID', spreadsheetId);

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const metaSheet = ensureSheet_(spreadsheet, SHEET_NAMES.META, ['key', 'value']);
  const createdAtCell = metaSheet.getRange(2, 1, 1, 2).getValues()[0];

  if (!createdAtCell[0]) {
    metaSheet.getRange(2, 1, 2, 2).setValues([
      ['createdAt', new Date()],
      ['currency', DEFAULT_CURRENCY],
    ]);
  }

  return spreadsheet;
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const existingHeaders = headerRange.getValues()[0];
  const headersMatch = headers.every(function (header, index) {
    return existingHeaders[index] === header;
  });
  if (!headersMatch) {
    headerRange.setValues([headers]);
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet not found: ' + name);
  }
  return sheet;
}

function getDailyResults_() {
  const sheet = getSheet_(SHEET_NAMES.RESULTS);
  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  return values.slice(1).filter(function (row) {
    return row[0];
  }).map(function (row) {
    return {
      recordId: String(row[0]),
      resultDate: formatSheetDate_(row[1]),
      pnl: toNumber_(row[2]),
      note: String(row[3] || ''),
      createdAt: row[4] ? String(row[4]) : '',
    };
  });
}

function normalizeDailyResult_(payload) {
  const resultDate = String(payload.resultDate || payload.closedAt || '').trim();
  const pnl = toNumber_(payload.pnl);
  const note = String(payload.note || '').trim();

  if (!resultDate || !/^\d{4}-\d{2}-\d{2}$/.test(resultDate)) {
    throw new Error('Result date is required in YYYY-MM-DD format.');
  }

  return {
    recordId: 'DAY-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    resultDate: resultDate,
    pnl: round2_(pnl),
    note: note,
    createdAt: new Date().toISOString(),
  };
}

function buildSummary_(results) {
  const totals = results.reduce(function (acc, item) {
    acc.totalPnl += item.pnl;
    if (item.pnl > 0) {
      acc.profitDays += 1;
      acc.grossProfit += item.pnl;
    } else if (item.pnl < 0) {
      acc.lossDays += 1;
      acc.grossLoss += Math.abs(item.pnl);
    } else {
      acc.flatDays += 1;
    }
    return acc;
  }, {
    totalPnl: 0,
    profitDays: 0,
    lossDays: 0,
    flatDays: 0,
    grossProfit: 0,
    grossLoss: 0,
  });

  const recordedDays = results.length;
  const avgPositive = totals.profitDays ? totals.grossProfit / totals.profitDays : 0;
  const avgNegative = totals.lossDays ? totals.grossLoss / totals.lossDays : 0;
  const avgDailyPnl = recordedDays ? totals.totalPnl / recordedDays : 0;
  const profitFactor = totals.grossLoss ? totals.grossProfit / totals.grossLoss : (totals.grossProfit ? 999 : 0);
  const winRate = recordedDays ? (totals.profitDays / recordedDays) * 100 : 0;
  const lossRate = recordedDays ? (totals.lossDays / recordedDays) * 100 : 0;
  const riskReward = avgPositive && avgNegative ? avgPositive / avgNegative : 0;

  return {
    totalPnl: round2_(totals.totalPnl),
    recordedDays: recordedDays,
    profitDays: totals.profitDays,
    lossDays: totals.lossDays,
    flatDays: totals.flatDays,
    grossProfit: round2_(totals.grossProfit),
    grossLoss: round2_(totals.grossLoss),
    avgDailyPnl: round2_(avgDailyPnl),
    avgPositive: round2_(avgPositive),
    avgNegative: round2_(avgNegative),
    profitFactor: round2_(profitFactor),
    winRate: round2_(winRate),
    lossRate: round2_(lossRate),
    riskReward: round2_(riskReward),
  };
}

function buildDailyMap_(results) {
  return results.reduce(function (acc, item) {
    acc[item.resultDate] = {
      pnl: item.pnl,
      note: item.note,
      recorded: true,
      item: item,
    };
    return acc;
  }, {});
}

function buildCalendar_(monthDate, dailyMap) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  start.setDate(start.getDate() - start.getDay());
  const cells = [];

  for (var i = 0; i < 42; i += 1) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    const key = formatDate_(current);
    const dayData = dailyMap[key] || { pnl: 0, note: '', recorded: false };
    cells.push({
      date: key,
      day: current.getDate(),
      inMonth: current.getMonth() === monthDate.getMonth(),
      pnl: round2_(dayData.pnl),
      recorded: dayData.recorded,
      note: dayData.note,
    });
  }

  return cells;
}

function buildDailySeries_(monthDate, dailyMap) {
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const series = [];
  for (var day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    const key = formatDate_(date);
    const dayData = dailyMap[key] || { pnl: 0 };
    series.push({
      date: key,
      pnl: round2_(dayData.pnl),
    });
  }
  return series;
}

function createApiResponse_(payload, e) {
  const callback = e && e.parameter && e.parameter.callback
    ? String(e.parameter.callback)
    : '';
  const body = JSON.stringify(payload);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + body + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

function mapTradeParams_(params) {
  return mapResultParams_(params);
}

function mapResultParams_(params) {
  return {
    resultDate: params.resultDate || params.closedAt,
    pnl: params.pnl,
    note: params.note,
  };
}

function handleLineWebhook_(events) {
  const config = getLineConfig_();
  if (!config.channelAccessToken) {
    return;
  }

  events.forEach(function (event) {
    if (!event.replyToken || event.type !== 'message' || !event.message || event.message.type !== 'text') {
      return;
    }

    const text = String(event.message.text || '').trim().toLowerCase();
    let messages;

    if (text === 'id') {
      messages = [{
        type: 'text',
        text: 'LINE userId: ' + (event.source && event.source.userId ? event.source.userId : 'Unavailable'),
      }];
    } else if (text === 'summary' || text === 'สรุป') {
      const dashboard = getDashboardData(getMonthKey_(new Date()));
      messages = [{
        type: 'text',
        text: [
          'FundFlow Summary',
          dashboard.monthLabel,
          'Total PnL: ' + formatSignedNumber_(dashboard.summary.totalPnl) + ' ' + DEFAULT_CURRENCY,
          'Recorded days: ' + dashboard.summary.recordedDays,
          'Profit days: ' + dashboard.summary.profitDays,
          'Loss days: ' + dashboard.summary.lossDays,
          config.dashboardUrl ? ('Dashboard: ' + config.dashboardUrl) : '',
        ].filter(String).join('\n'),
      }];
    } else {
      messages = [{
        type: 'text',
        text: 'Use "summary" to get this month summary or "id" to see your LINE userId.',
      }];
    }

    lineReplyMessage_(event.replyToken, messages, config.channelAccessToken);
  });
}

function lineReplyMessage_(replyToken, messages, channelAccessToken) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + channelAccessToken,
    },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: messages,
    }),
    muteHttpExceptions: true,
  });
}

function linePushMessage_(to, messages, channelAccessToken) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + channelAccessToken,
    },
    payload: JSON.stringify({
      to: to,
      messages: messages,
    }),
    muteHttpExceptions: true,
  });
}

function getLineConfig_() {
  const props = PropertiesService.getScriptProperties();
  return {
    channelAccessToken: props.getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '',
    userId: props.getProperty('LINE_USER_ID') || '',
    dashboardUrl: props.getProperty('APP_BASE_URL') || '',
  };
}

function getSetupStatus_() {
  const props = PropertiesService.getScriptProperties();
  return {
    spreadsheetId: props.getProperty('SPREADSHEET_ID') || '',
    lineConfigured: Boolean(props.getProperty('LINE_CHANNEL_ACCESS_TOKEN')),
    lineUserLinked: Boolean(props.getProperty('LINE_USER_ID')),
    dashboardUrl: props.getProperty('APP_BASE_URL') || '',
  };
}

function sampleDailyResult_(baseMonth, day, pnl, note) {
  const date = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), day);
  return normalizeDailyResult_({
    resultDate: formatDate_(date),
    pnl: pnl,
    note: note,
  });
}

function parseMonthKey_(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
  if (!match) {
    return new Date();
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function getMonthKey_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM');
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatSheetDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return formatDate_(value);
  }
  return String(value || '');
}

function sortResultsDesc_(a, b) {
  return a.resultDate < b.resultDate ? 1 : -1;
}

function toNumber_(value) {
  return Number(value || 0);
}

function round2_(value) {
  return Number(Number(value || 0).toFixed(2));
}

function formatSignedNumber_(value) {
  const number = round2_(value);
  return (number > 0 ? '+' : '') + number.toFixed(2);
}

function findResultRowByDate_(sheet, resultDate) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return 0;
  }

  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i += 1) {
    if (formatSheetDate_(values[i][0]) === resultDate) {
      return i + 2;
    }
  }
  return 0;
}
