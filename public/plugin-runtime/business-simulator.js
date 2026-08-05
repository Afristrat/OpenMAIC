(function () {
  'use strict';

  var root = document.getElementById('app');
  var pluginId = document.body.dataset.plugin;
  var currentData = null;
  var fieldSequence = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function number(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function format(value, unit) {
    var rounded = Math.round(value * 10) / 10;
    if (unit === '%') return rounded.toLocaleString() + ' %';
    if (unit) return rounded.toLocaleString() + ' ' + unit;
    return rounded.toLocaleString();
  }

  function field(label, value, options, onChange) {
    var wrapper = el('label', 'field');
    wrapper.appendChild(el('span', 'field-label', label));
    var input = el('input', 'field-input');
    input.id = 'qalem-field-' + pluginId + '-' + ++fieldSequence;
    input.setAttribute('aria-label', label);
    wrapper.htmlFor = input.id;
    input.type = 'number';
    input.value = String(value);
    input.min = String(options.min ?? 0);
    input.max = String(options.max ?? 1000000000);
    input.step = String(options.step ?? 1);
    input.addEventListener('input', function () {
      onChange(number(input.value));
      render();
    });
    wrapper.appendChild(input);
    if (options.unit) wrapper.appendChild(el('span', 'field-unit', options.unit));
    return wrapper;
  }

  function resultCard(label, value, tone) {
    var card = el('div', 'result ' + (tone || ''));
    card.appendChild(el('span', 'result-label', label));
    card.appendChild(el('strong', 'result-value', value));
    return card;
  }

  function shell(data) {
    var page = el('main', 'simulator');
    var header = el('header', 'simulator-header');
    header.appendChild(el('p', 'eyebrow', data.eyebrow || 'Qalem · Atelier interactif'));
    header.appendChild(el('h1', '', data.title || 'Simulation'));
    header.appendChild(
      el(
        'p',
        'intro',
        data.instructions || 'Modifiez les hypothèses et observez les conséquences.',
      ),
    );
    page.appendChild(header);
    var layout = el('div', 'simulator-layout');
    var controls = el('section', 'panel controls');
    controls.setAttribute('aria-label', data.controlsLabel || 'Hypothèses');
    var output = el('section', 'panel output');
    output.setAttribute('aria-live', 'polite');
    layout.appendChild(controls);
    layout.appendChild(output);
    page.appendChild(layout);
    return { page: page, controls: controls, output: output };
  }

  function renderCashFlow(data, view) {
    var assumptions = data.assumptions;
    Object.keys(assumptions).forEach(function (key) {
      var item = assumptions[key];
      view.controls.appendChild(
        field(item.label, item.value, item, function (value) {
          item.value = value;
        }),
      );
    });
    var cash = assumptions.openingCash.value;
    var revenue = assumptions.monthlyRevenue.value;
    var costs = assumptions.monthlyCosts.value;
    var growth = assumptions.revenueGrowth.value / 100;
    var months = Math.max(1, Math.min(24, Math.round(assumptions.months.value)));
    var series = [];
    var firstNegative = null;
    for (var month = 1; month <= months; month += 1) {
      cash += revenue - costs;
      series.push(cash);
      if (cash < 0 && firstNegative === null) firstNegative = month;
      revenue *= 1 + growth;
    }
    var cards = el('div', 'result-grid');
    cards.appendChild(
      resultCard(
        data.labels.endingCash,
        format(cash, data.currency),
        cash >= 0 ? 'positive' : 'negative',
      ),
    );
    cards.appendChild(
      resultCard(
        data.labels.monthlyBalance,
        format(assumptions.monthlyRevenue.value - costs, data.currency),
      ),
    );
    cards.appendChild(
      resultCard(
        data.labels.alert,
        firstNegative ? data.labels.month + ' ' + firstNegative : data.labels.none,
        firstNegative ? 'negative' : 'positive',
      ),
    );
    view.output.appendChild(cards);
    renderBars(view.output, series, data.labels.cashPath, data.currency);
  }

  function renderFunds(data, view) {
    view.controls.appendChild(
      field(data.budget.label, data.budget.value, data.budget, function (value) {
        data.budget.value = value;
      }),
    );
    data.allocations.forEach(function (item) {
      view.controls.appendChild(
        field(
          item.label,
          item.value,
          { min: 0, step: 1000, unit: data.currency },
          function (value) {
            item.value = value;
          },
        ),
      );
    });
    var total = data.allocations.reduce(function (sum, item) {
      return sum + number(item.value);
    }, 0);
    var remaining = data.budget.value - total;
    var cards = el('div', 'result-grid');
    cards.appendChild(resultCard(data.labels.allocated, format(total, data.currency)));
    cards.appendChild(
      resultCard(
        data.labels.remaining,
        format(remaining, data.currency),
        remaining >= 0 ? 'positive' : 'negative',
      ),
    );
    cards.appendChild(
      resultCard(
        data.labels.status,
        remaining === 0
          ? data.labels.balanced
          : remaining > 0
            ? data.labels.unallocated
            : data.labels.overBudget,
        remaining === 0 ? 'positive' : 'warning',
      ),
    );
    view.output.appendChild(cards);
    var totalBase = Math.max(data.budget.value, total, 1);
    renderNamedBars(
      view.output,
      data.allocations.map(function (item) {
        return { label: item.label, value: item.value, ratio: item.value / totalBase };
      }),
      data.labels.breakdown,
      data.currency,
    );
  }

  function renderFunnel(data, view) {
    Object.keys(data.assumptions).forEach(function (key) {
      var item = data.assumptions[key];
      view.controls.appendChild(
        field(item.label, item.value, item, function (value) {
          item.value = value;
        }),
      );
    });
    var a = data.assumptions;
    var reached = (a.audience.value * a.reachRate.value) / 100;
    var visitors = (reached * a.clickRate.value) / 100;
    var leads = (visitors * a.leadRate.value) / 100;
    var clients = (leads * a.conversionRate.value) / 100;
    var revenue = clients * a.averageOrder.value;
    var stages = [
      { label: data.labels.audience, value: a.audience.value },
      { label: data.labels.reached, value: reached },
      { label: data.labels.visitors, value: visitors },
      { label: data.labels.leads, value: leads },
      { label: data.labels.clients, value: clients },
    ];
    var cards = el('div', 'result-grid');
    cards.appendChild(resultCard(data.labels.clients, format(clients)));
    cards.appendChild(resultCard(data.labels.revenue, format(revenue, data.currency), 'positive'));
    cards.appendChild(
      resultCard(
        data.labels.globalRate,
        format(a.audience.value ? (clients / a.audience.value) * 100 : 0, '%'),
      ),
    );
    view.output.appendChild(cards);
    renderNamedBars(
      view.output,
      stages.map(function (item) {
        return {
          label: item.label,
          value: item.value,
          ratio: item.value / Math.max(a.audience.value, 1),
        };
      }),
      data.labels.funnel,
      '',
    );
  }

  function renderCredit(data, view) {
    Object.keys(data.assumptions).forEach(function (key) {
      var item = data.assumptions[key];
      view.controls.appendChild(
        field(item.label, item.value, item, function (value) {
          item.value = value;
        }),
      );
    });
    var a = data.assumptions;
    var monthlyRevenue = a.annualRevenue.value / 12;
    var serviceRatio = monthlyRevenue ? (a.monthlyDebtService.value / monthlyRevenue) * 100 : 0;
    var leverage = a.annualRevenue.value
      ? ((a.existingDebt.value + a.requestedAmount.value) / a.annualRevenue.value) * 100
      : 0;
    var score = 100;
    if (serviceRatio > 30) score -= 35;
    else if (serviceRatio > 20) score -= 15;
    if (leverage > 80) score -= 30;
    else if (leverage > 50) score -= 15;
    if (a.margin.value < 10) score -= 20;
    if (a.cashBuffer.value < 3) score -= 15;
    score = Math.max(0, score);
    var level =
      score >= 75 ? data.labels.controlled : score >= 50 ? data.labels.watch : data.labels.high;
    var cards = el('div', 'result-grid');
    cards.appendChild(
      resultCard(
        data.labels.debtService,
        format(serviceRatio, '%'),
        serviceRatio <= 30 ? 'positive' : 'negative',
      ),
    );
    cards.appendChild(resultCard(data.labels.leverage, format(leverage, '%')));
    cards.appendChild(
      resultCard(
        data.labels.riskLevel,
        level,
        score >= 75 ? 'positive' : score >= 50 ? 'warning' : 'negative',
      ),
    );
    view.output.appendChild(cards);
    var note = el('p', 'notice', data.disclaimer);
    view.output.appendChild(note);
  }

  function renderKpis(data, view) {
    data.metrics.forEach(function (metric) {
      view.controls.appendChild(
        field(metric.label, metric.current, metric, function (value) {
          metric.current = value;
        }),
      );
    });
    var heading = el('h2', 'panel-title', data.labels.dashboard);
    view.output.appendChild(heading);
    data.metrics.forEach(function (metric) {
      var ratio = metric.target
        ? metric.direction === 'lower'
          ? metric.current > 0
            ? metric.target / metric.current
            : 1
          : metric.current / metric.target
        : 0;
      var row = el('div', 'kpi-row');
      var top = el('div', 'kpi-top');
      top.appendChild(el('strong', '', metric.label));
      top.appendChild(
        el(
          'span',
          ratio >= 1 ? 'status positive' : ratio >= 0.8 ? 'status warning' : 'status negative',
          format(metric.current, metric.unit) + ' / ' + format(metric.target, metric.unit),
        ),
      );
      row.appendChild(top);
      var track = el('div', 'bar-track');
      var bar = el('div', 'bar-fill');
      bar.style.width = Math.min(100, Math.max(0, ratio * 100)) + '%';
      track.appendChild(bar);
      row.appendChild(track);
      view.output.appendChild(row);
    });
  }

  function renderSpreadsheet(data, view) {
    data.rows.forEach(function (row) {
      view.controls.appendChild(
        field(row.label + ' · ' + data.labels.quantity, row.quantity, row, function (value) {
          row.quantity = value;
        }),
      );
      view.controls.appendChild(
        field(
          row.label + ' · ' + data.labels.unitPrice,
          row.unitPrice,
          { min: 0, step: row.priceStep || 1, unit: data.currency },
          function (value) {
            row.unitPrice = value;
          },
        ),
      );
    });
    var total = data.rows.reduce(function (sum, row) {
      return sum + number(row.quantity) * number(row.unitPrice);
    }, 0);
    var table = el('div', 'data-table');
    var header = el('div', 'data-row data-header');
    [data.labels.item, data.labels.quantity, data.labels.unitPrice, data.labels.total].forEach(
      function (label) {
        header.appendChild(el('span', '', label));
      },
    );
    table.appendChild(header);
    data.rows.forEach(function (row) {
      var line = el('div', 'data-row');
      line.appendChild(el('strong', '', row.label));
      line.appendChild(el('span', '', format(row.quantity)));
      line.appendChild(el('span', '', format(row.unitPrice, data.currency)));
      line.appendChild(el('span', '', format(row.quantity * row.unitPrice, data.currency)));
      table.appendChild(line);
    });
    view.output.appendChild(table);
    var cards = el('div', 'result-grid compact-results');
    cards.appendChild(resultCard(data.labels.grandTotal, format(total, data.currency), 'positive'));
    cards.appendChild(resultCard(data.labels.lines, format(data.rows.length)));
    view.output.appendChild(cards);
  }

  function renderDecisionTree(data, view) {
    data.options.forEach(function (option) {
      view.controls.appendChild(
        field(
          option.label + ' · ' + data.labels.probability,
          option.probability,
          {
            min: 0,
            max: 100,
            step: 1,
            unit: '%',
          },
          function (value) {
            option.probability = value;
          },
        ),
      );
      view.controls.appendChild(
        field(option.label + ' · ' + data.labels.impact, option.impact, option, function (value) {
          option.impact = value;
        }),
      );
    });
    var ranked = data.options
      .map(function (option) {
        return {
          label: option.label,
          value: (option.probability / 100) * option.impact,
        };
      })
      .sort(function (left, right) {
        return right.value - left.value;
      });
    var best = ranked[0];
    var cards = el('div', 'result-grid');
    cards.appendChild(resultCard(data.labels.preferred, best.label, 'positive'));
    cards.appendChild(resultCard(data.labels.expectedValue, format(best.value, data.unit)));
    cards.appendChild(resultCard(data.labels.options, format(ranked.length)));
    view.output.appendChild(cards);
    var max = Math.max.apply(
      null,
      ranked
        .map(function (item) {
          return Math.abs(item.value);
        })
        .concat([1]),
    );
    renderNamedBars(
      view.output,
      ranked.map(function (item) {
        return { label: item.label, value: item.value, ratio: Math.abs(item.value) / max };
      }),
      data.labels.comparison,
      data.unit,
    );
    view.output.appendChild(el('p', 'notice', data.disclaimer));
  }

  function renderIndustrialProcess(data, view) {
    data.stages.forEach(function (stage) {
      view.controls.appendChild(
        field(stage.label + ' · ' + data.labels.capacity, stage.capacity, stage, function (value) {
          stage.capacity = value;
        }),
      );
      view.controls.appendChild(
        field(
          stage.label + ' · ' + data.labels.availability,
          stage.availability,
          { min: 0, max: 100, step: 1, unit: '%' },
          function (value) {
            stage.availability = value;
          },
        ),
      );
    });
    var effective = data.stages.map(function (stage) {
      return {
        label: stage.label,
        value: stage.capacity * (stage.availability / 100),
      };
    });
    var bottleneck = effective.reduce(function (lowest, stage) {
      return stage.value < lowest.value ? stage : lowest;
    }, effective[0]);
    var demand = number(data.demand);
    var cards = el('div', 'result-grid');
    cards.appendChild(resultCard(data.labels.throughput, format(bottleneck.value, data.unit)));
    cards.appendChild(resultCard(data.labels.bottleneck, bottleneck.label, 'warning'));
    cards.appendChild(
      resultCard(
        data.labels.demandCoverage,
        format(demand ? (bottleneck.value / demand) * 100 : 0, '%'),
        bottleneck.value >= demand ? 'positive' : 'negative',
      ),
    );
    view.output.appendChild(cards);
    var max = Math.max.apply(
      null,
      effective
        .map(function (stage) {
          return stage.value;
        })
        .concat([1]),
    );
    renderNamedBars(
      view.output,
      effective.map(function (stage) {
        return { label: stage.label, value: stage.value, ratio: stage.value / max };
      }),
      data.labels.effectiveCapacity,
      data.unit,
    );
  }

  function renderBars(parent, values, title, unit) {
    var max = Math.max.apply(
      null,
      values
        .map(function (value) {
          return Math.abs(value);
        })
        .concat([1]),
    );
    renderNamedBars(
      parent,
      values.map(function (value, index) {
        return { label: String(index + 1), value: value, ratio: Math.abs(value) / max };
      }),
      title,
      unit,
    );
  }

  function renderNamedBars(parent, items, title, unit) {
    parent.appendChild(el('h2', 'panel-title', title));
    var chart = el('div', 'chart');
    items.forEach(function (item) {
      var row = el('div', 'chart-row');
      row.appendChild(el('span', 'chart-label', item.label));
      var track = el('div', 'bar-track');
      var bar = el('div', 'bar-fill' + (item.value < 0 ? ' negative-bar' : ''));
      bar.style.width = Math.max(2, Math.min(100, item.ratio * 100)) + '%';
      track.appendChild(bar);
      row.appendChild(track);
      row.appendChild(el('strong', 'chart-value', format(item.value, unit)));
      chart.appendChild(row);
    });
    parent.appendChild(chart);
  }

  function render() {
    if (!root || !currentData) return;
    root.replaceChildren();
    var view = shell(currentData);
    root.appendChild(view.page);
    if (pluginId === 'cash-flow-simulator') renderCashFlow(currentData, view);
    else if (pluginId === 'use-of-funds-allocator') renderFunds(currentData, view);
    else if (pluginId === 'marketing-funnel-builder') renderFunnel(currentData, view);
    else if (pluginId === 'credit-decision-lab') renderCredit(currentData, view);
    else if (pluginId === 'kpi-dashboard') renderKpis(currentData, view);
    else if (pluginId === 'controlled-spreadsheet') renderSpreadsheet(currentData, view);
    else if (pluginId === 'decision-tree-lab') renderDecisionTree(currentData, view);
    else if (pluginId === 'industrial-process-simulator')
      renderIndustrialProcess(currentData, view);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    var message = event.data;
    if (!message || message.source !== 'qalem-host') return;
    if (message.type === 'init' || message.type === 'update') {
      currentData = message.payload.data;
      if (message.payload.theme) applyTheme(message.payload.theme);
      render();
    } else if (message.type === 'theme') {
      applyTheme(message.payload.theme);
    }
  });

  window.parent.postMessage(
    { source: 'qalem-plugin', type: 'ready', payload: {} },
    window.location.origin,
  );
})();
