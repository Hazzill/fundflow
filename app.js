(function () {
const config = window.APP_CONFIG || {};
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const APP_STATE = {
    monthKey: formatMonthKey(new Date()),
    data: null,
    selectedDate: '',
    loading: false,
    lastCalendarClickDate: '',
    lastCalendarClickAt: 0,
  };

  document.addEventListener('DOMContentLoaded', function () {
    document.title = (config.appName || 'FundFlow') + ' Dashboard';
    renderWeekdays();
    bindEvents();
    setDefaultFormDate();
    renderEmptyTable('Connecting to Apps Script API...');
    loadDashboard();
  });

  function bindEvents() {
    document.getElementById('prevMonthBtn').addEventListener('click', function () {
      APP_STATE.monthKey = shiftMonth(APP_STATE.monthKey, -1);
      loadDashboard();
    });

    document.getElementById('nextMonthBtn').addEventListener('click', function () {
      APP_STATE.monthKey = shiftMonth(APP_STATE.monthKey, 1);
      loadDashboard();
    });

    document.getElementById('refreshBtn').addEventListener('click', function () {
      loadDashboard();
    });

    document.getElementById('seedBtn').addEventListener('click', function () {
      seedSampleData();
    });

    document.getElementById('tradeForm').addEventListener('submit', function (event) {
      event.preventDefault();
      submitDailyResult();
    });

    document.getElementById('closeModalBtn').addEventListener('click', closeResultModal);
    document.getElementById('cancelModalBtn').addEventListener('click', closeResultModal);
    document.getElementById('resultModal').addEventListener('click', function (event) {
      if (event.target.id === 'resultModal') {
        closeResultModal();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeResultModal();
      }
    });
  }

  function renderWeekdays() {
    document.getElementById('calendarWeekdays').innerHTML = WEEKDAYS.map(function (day) {
      return '<div class="flex h-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/85 text-[12px] font-medium text-zinc-200 shadow-soft sm:h-9 sm:text-[13px] md:h-10 md:text-sm">' + day + '</div>';
    }).join('');
  }

  function loadDashboard() {
    if (!assertConfigReady()) {
      return;
    }

    setLoadingState(true);
    apiRequest('getDashboardData', { monthKey: APP_STATE.monthKey })
      .then(function (payload) {
        APP_STATE.data = payload.data;
        APP_STATE.monthKey = payload.data.monthKey;
        syncSelectedDate(payload.data);
        renderDashboard();
      })
      .catch(handleError)
      .finally(function () {
        setLoadingState(false);
      });
  }

  function submitDailyResult() {
    if (!assertConfigReady()) {
      return;
    }

    const form = document.getElementById('tradeForm');
    const formData = new FormData(form);
    const payload = {};
    formData.forEach(function (value, key) {
      payload[key] = value;
    });

    const saveButton = document.getElementById('saveTradeBtn');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    apiRequest('saveDailyResult', payload)
      .then(function (response) {
        APP_STATE.data = response.data;
        APP_STATE.monthKey = response.data.monthKey;
        APP_STATE.selectedDate = payload.resultDate;
        renderDashboard();
        closeResultModal();
      })
      .catch(handleError)
      .finally(function () {
        saveButton.disabled = false;
        saveButton.textContent = 'Save result';
      });
  }

  function seedSampleData() {
    if (!assertConfigReady()) {
      return;
    }

    document.getElementById('seedBtn').disabled = true;
    apiRequest('seedSampleResults')
      .then(function () {
        loadDashboard();
      })
      .catch(handleError)
      .finally(function () {
        document.getElementById('seedBtn').disabled = false;
      });
  }

  function renderDashboard() {
    const data = APP_STATE.data;
    if (!data) {
      return;
    }

    document.getElementById('monthLabel').textContent = data.monthLabel;
    document.getElementById('storageInfo').textContent = data.setup.spreadsheetId
      ? 'Apps Script API ready'
      : 'Spreadsheet not created';

    renderCalendar(data.calendar, data.today);
    renderStats(data.summary, data.dailySeries, data.currency || config.currency || 'USDT');
    fillFormForSelectedDate();
  }

  function renderCalendar(cells, today) {
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = cells.map(function (cell) {
      const baseClasses = [
        'relative',
        'min-h-[76px]',
        'rounded-md',
        'border',
        'p-2',
        'text-left',
        'transition',
        'sm:min-h-[92px]',
        'sm:p-3',
        'md:min-h-[96px]'
      ];

      if (!cell.inMonth) {
        baseClasses.push('border-zinc-900', 'bg-zinc-950/70', 'text-zinc-600');
      } else if (APP_STATE.selectedDate === cell.date) {
        baseClasses.push('border-[#f08cbc]', 'bg-zinc-900', 'shadow-[0_0_0_1px_rgba(240,140,188,0.18),0_18px_35px_rgba(0,0,0,0.25)]');
      } else {
        baseClasses.push('border-zinc-800', 'bg-zinc-900/88', 'hover:border-zinc-700', 'hover:bg-zinc-900');
      }

      const valueBlock = cell.recorded
        ? '<div class="text-right text-[10px] font-semibold sm:text-[12px] ' + (cell.pnl >= 0 ? 'text-[#2d8f09]' : 'text-[#c23b8b]') + '">' + formatSigned(cell.pnl) + ' ' + (config.currency || 'USDT') + '</div>'
        : '';
      const noteBlock = cell.recorded
        ? '<div class="max-w-full truncate text-right text-[10px] font-normal text-zinc-400 sm:text-[11px]">' + escapeHtml(cell.note || 'Recorded') + '</div>'
        : '';

      return [
        '<button type="button" class="' + baseClasses.join(' ') + '" data-date="' + cell.date + '" ' + (cell.inMonth ? '' : 'disabled') + '>',
        '<div class="flex h-full flex-col justify-between">',
        '<div class="flex justify-end">',
        renderDayBadge(cell, today),
        '</div>',
        '<div class="space-y-0.5">',
        valueBlock,
        noteBlock,
        '</div>',
        '</div>',
        '</button>'
      ].join('');
    }).join('');

    Array.prototype.forEach.call(grid.querySelectorAll('button[data-date]'), function (button) {
      if (button.disabled) {
        return;
      }
      button.addEventListener('click', function () {
        const clickedDate = button.getAttribute('data-date');
        const now = Date.now();
        const isDoubleActivate =
          APP_STATE.lastCalendarClickDate === clickedDate &&
          now - APP_STATE.lastCalendarClickAt < 350;

        APP_STATE.selectedDate = clickedDate;
        APP_STATE.lastCalendarClickDate = clickedDate;
        APP_STATE.lastCalendarClickAt = now;
        renderDashboard();

        if (isDoubleActivate) {
          startCreateResultForSelectedDate();
        }
      });
    });
  }

  function renderDayBadge(cell, today) {
    if (cell.date === today) {
      return '<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-[12px] font-semibold text-zinc-950 shadow-[0_6px_16px_rgba(255,255,255,0.12)] sm:h-7 sm:w-7 sm:text-[14px]">' + cell.day + '</span>';
    }

    return '<span class="text-[12px] font-semibold text-zinc-100 sm:text-[14px]">' + cell.day + '</span>';
  }

  function renderStats(summary, dailySeries, currency) {
    const totalPnlEl = document.getElementById('totalPnlValue');
    totalPnlEl.textContent = formatSigned(summary.totalPnl) + ' ' + currency;
    totalPnlEl.className = 'mt-3 text-[17px] font-semibold tracking-tight sm:text-[20px] ' + (summary.totalPnl >= 0 ? 'text-[#2d8f09]' : 'text-[#c23b8b]');
    document.getElementById('totalPnlMeta').textContent = summary.recordedDays + ' recorded days';

    document.getElementById('profitFactorValue').textContent = summary.profitFactor.toFixed(2);
    document.getElementById('profitFactorRingLabel').textContent = summary.profitFactor.toFixed(2);
    document.getElementById('winRateValue').textContent = summary.winRate.toFixed(2) + '%';
    document.getElementById('lossRateValue').textContent = summary.lossRate.toFixed(2) + '%';
    document.getElementById('riskRewardValue').textContent = '1:' + summary.riskReward.toFixed(2);
    document.getElementById('avgWinValue').textContent = '+' + Number(summary.avgPositive || 0).toFixed(2);
    document.getElementById('avgLossValue').textContent = '-' + Number(summary.avgNegative || 0).toFixed(2);

    const ringProgress = Math.min(summary.profitFactor / 4, 1);
    document.getElementById('profitFactorRing').style.background =
      'conic-gradient(#7cc713 0turn, #7cc713 ' + ringProgress + 'turn, #ef4aa8 ' + ringProgress + 'turn, #ef4aa8 1turn)';

    document.getElementById('winRateGauge').style.background =
      'conic-gradient(from 180deg, #7cc713 0turn, #7cc713 ' + (summary.winRate / 200) + 'turn, #ef4aa8 ' + (summary.winRate / 200) + 'turn, #ef4aa8 0.5turn, transparent 0.5turn)';

    const profitPortion = summary.avgPositive + summary.avgNegative
      ? (summary.avgPositive / (summary.avgPositive + summary.avgNegative)) * 100
      : 50;
    document.getElementById('riskProfitBar').style.width = profitPortion + '%';
    document.getElementById('riskLossBar').style.width = (100 - profitPortion) + '%';

    renderSparkline(dailySeries);
  }

  function renderSparkline(dailySeries) {
    const svg = document.getElementById('pnlSparkline');
    if (!dailySeries.length) {
      svg.innerHTML = '';
      return;
    }

    const values = dailySeries.map(function (item) { return item.pnl; });
    const min = Math.min.apply(null, values.concat([0]));
    const max = Math.max.apply(null, values.concat([0]));
    const width = 180;
    const height = 100;
    const step = width / Math.max(dailySeries.length - 1, 1);
    const span = max - min || 1;

    const points = dailySeries.map(function (item, index) {
      const x = index * step;
      const y = height - (((item.pnl - min) / span) * 76 + 10);
      return [x, y];
    });

    const line = points.map(function (point, index) {
      return (index ? 'L' : 'M') + point[0].toFixed(2) + ' ' + point[1].toFixed(2);
    }).join(' ');

    const area = line + ' L ' + width + ' ' + height + ' L 0 ' + height + ' Z';
    const latest = dailySeries[dailySeries.length - 1].pnl;
    const color = latest >= 0 ? '#7cc713' : '#ef4aa8';

    svg.innerHTML = [
      '<defs>',
      '<linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">',
      '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.16"></stop>',
      '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"></stop>',
      '</linearGradient>',
      '</defs>',
      '<path d="' + area + '" fill="url(#sparkFill)"></path>',
      '<path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round"></path>'
    ].join('');
  }

  function renderTable(results) {
    const body = document.getElementById('tradeTableBody');
    const title = document.getElementById('tableTitle');
    const chip = document.getElementById('selectedDayChip');

    if (!body || !title || !chip) {
      return;
    }

    if (APP_STATE.selectedDate) {
      title.textContent = 'Record on ' + APP_STATE.selectedDate;
      chip.textContent = APP_STATE.selectedDate;
    } else {
      title.textContent = 'Recent daily records';
      chip.textContent = 'All month';
    }

    if (!results.length) {
      renderEmptyTable(APP_STATE.selectedDate
        ? 'No record for selected date.'
        : 'No daily results recorded for this month yet.');
      return;
    }

    body.innerHTML = results.map(function (item) {
      return [
        '<tr class="transition hover:bg-zinc-900/80">',
        '<td class="border-b border-line px-3 py-3 text-[13px] font-medium text-zinc-200 sm:text-sm">' + item.resultDate + '</td>',
        '<td class="border-b border-line px-3 py-3 text-[13px] font-semibold ' + (item.pnl >= 0 ? 'text-[#2d8f09]' : 'text-[#c23b8b]') + ' sm:text-sm">' + formatSigned(item.pnl) + '</td>',
        '<td class="border-b border-line px-3 py-3 text-[13px] font-normal text-zinc-400 sm:text-sm">' + escapeHtml(item.note || '-') + '</td>',
        '</tr>'
      ].join('');
    }).join('');
  }

  function renderEmptyTable(message) {
    const body = document.getElementById('tradeTableBody');
    if (!body) {
      return;
    }
    body.innerHTML =
      '<tr><td colspan="3" class="border-b border-line px-3 py-8 text-center text-[13px] font-normal text-zinc-400 sm:text-sm">' + escapeHtml(message) + '</td></tr>';
  }

  function filteredResults() {
    if (!APP_STATE.data) {
      return [];
    }

    if (!APP_STATE.selectedDate) {
      return APP_STATE.data.allResults;
    }

    return APP_STATE.data.allResults.filter(function (item) {
      return item.resultDate === APP_STATE.selectedDate;
    });
  }

  function syncSelectedDate(data) {
    const candidate = APP_STATE.selectedDate;
    const monthDates = data.calendar.filter(function (item) {
      return item.inMonth;
    }).map(function (item) {
      return item.date;
    });

    if (candidate && monthDates.indexOf(candidate) !== -1) {
      return;
    }

    if (monthDates.indexOf(data.today) !== -1) {
      APP_STATE.selectedDate = data.today;
      return;
    }

    const firstRecordedDay = data.calendar.find(function (item) {
      return item.inMonth && item.recorded;
    });
    if (firstRecordedDay) {
      APP_STATE.selectedDate = firstRecordedDay.date;
      return;
    }

    APP_STATE.selectedDate = monthDates.length ? monthDates[0] : formatLocalDate(new Date());
  }

  function setDefaultFormDate() {
    APP_STATE.selectedDate = formatLocalDate(new Date());
    fillFormForSelectedDate();
  }

  function fillFormForSelectedDate() {
    const selectedDateInput = document.getElementById('selectedDateInput');
    const pnlInput = document.getElementById('pnlInput');
    const noteInput = document.getElementById('noteInput');
    const targetDate = APP_STATE.selectedDate || formatLocalDate(new Date());

    selectedDateInput.value = targetDate;
    document.getElementById('selectedDateBadge').textContent = targetDate;

    const existing = APP_STATE.data && APP_STATE.data.allResults
      ? APP_STATE.data.allResults.find(function (item) { return item.resultDate === targetDate; })
      : null;

    pnlInput.value = existing ? existing.pnl : '';
    noteInput.value = existing ? existing.note : '';
  }

  function startCreateResultForSelectedDate() {
    const pnlInput = document.getElementById('pnlInput');
    const noteInput = document.getElementById('noteInput');
    const existing = APP_STATE.data && APP_STATE.data.allResults
      ? APP_STATE.data.allResults.find(function (item) { return item.resultDate === APP_STATE.selectedDate; })
      : null;

    document.getElementById('selectedDateBadge').textContent = APP_STATE.selectedDate + ' - editing';

    if (existing) {
      openResultModal();
      pnlInput.focus();
      pnlInput.select();
    } else {
      pnlInput.value = '';
      noteInput.value = '';
      openResultModal();
      pnlInput.focus();
    }
  }

  function openResultModal() {
    const modal = document.getElementById('resultModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
  }

  function closeResultModal() {
    const modal = document.getElementById('resultModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
  }

  function apiRequest(action, params) {
    return new Promise(function (resolve, reject) {
      const callbackName = '__fundflow_cb_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      const query = new URLSearchParams();
      query.set('action', action);
      query.set('callback', callbackName);

      Object.keys(params || {}).forEach(function (key) {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
          query.set(key, params[key]);
        }
      });

      const script = document.createElement('script');
      const cleanup = function () {
        delete window[callbackName];
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };

      const timeout = setTimeout(function () {
        cleanup();
        reject(new Error('Apps Script API timeout'));
      }, Number(config.requestTimeoutMs || 15000));

      window[callbackName] = function (payload) {
        clearTimeout(timeout);
        cleanup();
        if (!payload || payload.ok !== true) {
          reject(new Error((payload && payload.message) || 'Apps Script API error'));
          return;
        }
        resolve(payload);
      };

      script.onerror = function () {
        clearTimeout(timeout);
        cleanup();
        reject(new Error('Failed to load Apps Script API'));
      };

      script.src = buildApiUrl(query.toString());
      document.body.appendChild(script);
    });
  }

  function buildApiUrl(queryString) {
    const baseUrl = String(config.gasWebAppUrl || '').trim();
    return baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + queryString;
  }

  function assertConfigReady() {
    const ready = config.gasWebAppUrl && config.gasWebAppUrl.indexOf('PASTE_YOUR_GAS_WEB_APP_URL_HERE') === -1;
    if (!ready) {
      const message = 'Please set gasWebAppUrl in config.js';
      document.getElementById('storageInfo').textContent = message;
      renderEmptyTable(message);
      showError(message);
      return false;
    }
    return true;
  }

  function handleError(error) {
    const message = error && error.message ? error.message : 'Unexpected error';
    showError(message);
    document.getElementById('storageInfo').textContent = message;
  }

  function showError(message) {
    const current = document.querySelector('.error-banner');
    if (current) {
      current.remove();
    }
    const banner = document.createElement('div');
    banner.className = 'error-banner fixed bottom-4 right-4 z-50 max-w-xs rounded-2xl border border-zinc-800 bg-zinc-900/95 px-4 py-3 text-[13px] font-medium text-white shadow-2xl backdrop-blur-sm sm:bottom-5 sm:right-5 sm:text-sm';
    banner.textContent = message;
    document.body.appendChild(banner);
    setTimeout(function () {
      if (banner.parentNode) {
        banner.parentNode.removeChild(banner);
      }
    }, 4000);
  }

  function setLoadingState(loading) {
    APP_STATE.loading = loading;
    document.getElementById('refreshBtn').disabled = loading;
    document.getElementById('prevMonthBtn').disabled = loading;
    document.getElementById('nextMonthBtn').disabled = loading;
    if (loading) {
      document.getElementById('storageInfo').textContent = 'Loading dashboard...';
    }
  }

  function shiftMonth(monthKey, offset) {
    const parts = monthKey.split('-');
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1 + offset, 1);
    return formatMonthKey(date);
  }

  function formatMonthKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }

  function formatSigned(value) {
    const number = Number(value || 0);
    return (number > 0 ? '+' : '') + number.toFixed(2);
  }

  function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
