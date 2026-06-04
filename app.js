class OfflineCityGame {
  constructor() {
    this.API_URL = 'http://localhost:3000/api';
    this.state = null;
    this.selectedAnomalies = [];
    this.timelineOrder = [];
    this.rankOrder = [];
    this.codeCombo = ['', '', ''];
    this.selectedMatch = {};
    this.init();
  }

  getPlayerId() {
    let id = localStorage.getItem('offlineCityPlayerId');
    if (!id) {
      id = 'p_' + Date.now();
      localStorage.setItem('offlineCityPlayerId', id);
    }
    return id;
  }

  async init() {
    document.getElementById('newGameBtn').onclick = () => this.newGame();
    document.getElementById('resetBtn').onclick = () => this.resetGame();
    document.getElementById('tabClues').onclick = () => {
      document.getElementById('panelClues').style.display = 'block';
      document.getElementById('panelLog').style.display = 'none';
      document.getElementById('tabClues').classList.add('active');
      document.getElementById('tabLog').classList.remove('active');
    };
    document.getElementById('tabLog').onclick = () => {
      document.getElementById('panelClues').style.display = 'none';
      document.getElementById('panelLog').style.display = 'block';
      document.getElementById('tabLog').classList.add('active');
      document.getElementById('tabClues').classList.remove('active');
    };
    await this.loadGame();
  }

  updateBackground(shift) {
    const bgMap = {
      0: 'citypomehi.png', 1: 'ekran.png', 2: 'shemki.png',
      3: 'citykitai.png', 4: 'errors.png', 5: 'pk.png',
      6: 'tablichki.png', 7: 'servers.png', 8: 'pklamp.png',
      9: 'posts.png', 10: 'detektiv.png'
    };
    const bg = bgMap[shift] || 'citypomehi.png';
    document.body.style.backgroundImage = `url('assets/backgrounds/${bg}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundRepeat = 'no-repeat';
  }

  async loadGame() {
    try {
      const pid = this.getPlayerId();
      const res = await fetch(`${this.API_URL}/state?playerId=${pid}`);
      this.state = await res.json();
      this.updateBackground(this.state.shift || 0);
      this.render();
    } catch (e) { this.showMsg('Сервер недоступен', 'error'); }
  }

  async newGame() {
    const oldId = localStorage.getItem('offlineCityPlayerId');
    if (oldId) {
      await fetch(`${this.API_URL}/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: oldId }) }).catch(() => {});
    }
    localStorage.removeItem('offlineCityPlayerId');
    localStorage.setItem('oc_status', 'active');
    localStorage.setItem('oc_active', '1');
    localStorage.removeItem('oc_result');
    this._ended = false;
    this._loggedShifts = new Set();
    this.selectedAnomalies = []; this.timelineOrder = []; this.rankOrder = []; this.codeCombo = ['', '', '']; this.selectedMatch = {};
    const pid = this.getPlayerId();
    const res = await fetch(`${this.API_URL}/state?playerId=${pid}`);
    this.state = await res.json();
    this.updateBackground(0);
    this.render();
    this.showMsg('Новое дело открыто!');
  }

  async resetGame() {
    if (!confirm('Закрыть текущее дело? Весь прогресс будет потерян.')) return;
    const oldId = localStorage.getItem('offlineCityPlayerId');
    if (oldId) {
      await fetch(`${this.API_URL}/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId: oldId }) }).catch(() => {});
    }
    localStorage.removeItem('offlineCityPlayerId');
    location.reload();
  }

  async apiPost(body) {
    const pid = this.getPlayerId();
    const res = await fetch(`${this.API_URL}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: pid, ...body })
    });
    return res.json();
  }

  async handleActionResult(result) {
    if (result.error) { this.showMsg(result.error, 'error'); return; }
    const prevClues = this.state?.foundClues?.length || 0;
    this.state = result.player;
    this.updateBackground(this.state.shift);

    // Конец игры при падении доверия до нуля
    if ((this.state.trust ?? 100) <= 0 && !this._ended) {
      this._ended = true;
      this.renderGameOver();
      return;
    }

    if (this.state.shift > 10 || (this.state.shift === 10 && this.state.completedEvents?.includes(10))) {
      this.render();
      return;
    }
    if (result.completed) {
      const newClueCount = this.state.foundClues?.length || 0;
      const gotClue = newClueCount > prevClues;
      const lastClue = (result.foundCluesData && result.foundCluesData.length) ? result.foundCluesData[newClueCount - 1] : null;
      const completedShift = Math.max(0, ...(this.state.completedEvents || [0]));
      this.addSystemLog(completedShift, gotClue && lastClue ? lastClue.title : null);
      this.showActionFeedback(true, gotClue ? 'УЛИКА ДОБАВЛЕНА В АРХИВ' : 'ВЕРНОЕ РЕШЕНИЕ');
      this.render();
    } else if (result.retry) {
      this.showActionFeedback(false, result.message || 'НЕВЕРНОЕ РЕШЕНИЕ');
      this.shakeChoices();
      this.render();
    }
  }

  // Полоса-фидбек внизу экрана после действия
  showActionFeedback(ok, text) {
    let fb = document.getElementById('actionFeedback');
    if (!fb) {
      fb = document.createElement('div');
      fb.id = 'actionFeedback';
      document.body.appendChild(fb);
    }
    fb.className = 'action-feedback ' + (ok ? 'feedback-ok' : 'feedback-fail');
    fb.innerHTML = `<span class="af-text">${text}</span><span class="af-bar"></span>`;
    // перезапуск анимации
    void fb.offsetWidth;
    fb.classList.add('show');
    clearTimeout(this._fbTimer);
    this._fbTimer = setTimeout(() => fb.classList.remove('show'), 1200);
  }

  shakeChoices() {
    const c = document.getElementById('choicesContainer');
    if (!c) return;
    c.classList.remove('choices-shake');
    void c.offsetWidth;
    c.classList.add('choices-shake');
    setTimeout(() => c.classList.remove('choices-shake'), 450);
  }

  // Системный журнал: добавляем запись по завершении смены
  addSystemLog(shift, clueTitle) {
    const list = document.getElementById('sysLogList');
    if (!list || !shift) return;
    if (!this._loggedShifts) this._loggedShifts = new Set();
    if (this._loggedShifts.has(shift)) return;
    this._loggedShifts.add(shift);
    const t = new Date();
    const time = [t.getHours(), t.getMinutes(), t.getSeconds()].map(x => String(x).padStart(2, '0')).join(':');
    const msg = clueTitle
      ? `СМЕНА ${shift} завершена. Улика: ${clueTitle}`
      : `СМЕНА ${shift} завершена. Инцидент закрыт.`;
    const el = document.createElement('div');
    el.className = 'sys-log-entry sle-new';
    el.dataset.level = 'info';
    el.innerHTML = `<span class="sle-time">${time}</span><span class="sle-level info">INFO</span><span class="sle-msg">${msg}</span>`;
    list.prepend(el);
    setTimeout(() => el.classList.remove('sle-new'), 3000);
  }

  renderGameOver() {
    this.showEndOverlay(true);
  }

  // Единый полноэкранный финал (победа/поражение)
  showEndOverlay(forcedLose = false) {
    const trust = this.state.trust ?? 0;
    const cluesFound = this.state.foundClues?.length || 0;
    const totalClues = 10;
    const actions = this.state.actions || [];
    const correctActions = actions.filter(a => a.correct === true).length;
    const totalActions = actions.length || 1;

    const IC_TROPHY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';
    const IC_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
    const IC_ALERT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
    const IC_FAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2Z"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';

    let kind, icon, label, title, desc, color;
    if (forcedLose || trust < 20) {
      kind = 'lose'; icon = IC_FAIL; color = '#ff5470';
      label = 'ОПЕРАЦИЯ ПРОВАЛЕНА'; title = 'ДЕЛО ЗАКРЫТО';
      desc = forcedLose
        ? 'Индекс доверия жителей упал до нуля. Городской портал отключён, жители вышли на улицы. Руководство отстранило тебя от расследования — дело передано другому отделу, департамент расформирован. Причину сбоя установить не удалось.'
        : 'Расследование завершено слишком поздно. Доверие горожан потеряно, портал отключён. Виновного установить не удалось — департамент расформирован.';
    } else if (trust >= 80 && cluesFound >= 8) {
      kind = 'win'; icon = IC_TROPHY; color = '#22d3e0';
      label = 'РАССЛЕДОВАНИЕ ЗАВЕРШЕНО'; title = 'МАСТЕР-ДЕТЕКТИВ';
      desc = 'Блестящее расследование. Все десять улик сложились в одну картину: подрядчик внедрил вредоносный Service Worker под видом обновления безопасности — он и подменял данные, и сливал их на сторонний домен. Закладка обезврежена, связь восстановлена, доверие горожан спасено. Город снова онлайн.';
    } else if (trust >= 50 && cluesFound >= 5) {
      kind = 'win'; icon = IC_SEARCH; color = '#51cf66';
      label = 'РАССЛЕДОВАНИЕ ЗАВЕРШЕНО'; title = 'ОПЫТНЫЙ АНАЛИТИК';
      desc = 'Дело раскрыто. Источник сбоя найден, портал восстановлен. Не идеально, но город снова в строю — а виновный за решёткой.';
    } else {
      kind = 'win'; icon = IC_ALERT; color = '#ffa94d';
      label = 'РАССЛЕДОВАНИЕ ЗАВЕРШЕНО'; title = 'НАЧИНАЮЩИЙ СЛЕДОВАТЕЛЬ';
      desc = 'Расследование закончено на честном слове. Доверия почти не осталось, но причину сбоя удалось установить, а портал — спасти.';
    }

    const overlay = document.getElementById('endOverlay');
    const content = document.getElementById('endOverlayContent');
    if (!overlay || !content) return;
    overlay.className = 'end-overlay ' + kind;
    overlay.style.setProperty('--ec', color);

    // Фиксируем исход дела (для главного экрана и блокировки «Продолжить»)
    localStorage.setItem('oc_status', kind === 'win' ? 'won' : 'lost');
    localStorage.removeItem('oc_active');
    try { localStorage.setItem('oc_result', JSON.stringify({ trust, clues: cluesFound, correct: correctActions, total: totalActions, rank: title })); } catch (e) {}
    if (window.__updateMain) window.__updateMain();
    if (window.__refreshContinue) window.__refreshContinue();

    content.innerHTML = `
      <div class="eo-badge">${label}</div>
      <div class="eo-icon">${icon}</div>
      <div class="eo-rank-label">${kind === 'win' ? 'ВАШ РАНГ' : 'СТАТУС: ОТСТРАНЁН'}</div>
      <h1 class="eo-title" data-text="${title}">${title}</h1>
      <p class="eo-desc">${desc}</p>
      <div class="eo-stats">
        <div class="eo-stat"><div class="eo-stat-val countup" data-to="${trust}" data-suffix="%">0%</div><div class="eo-stat-label">Индекс доверия</div></div>
        <div class="eo-stat"><div class="eo-stat-val countup" data-to="${cluesFound}" data-suffix="/${totalClues}">0/${totalClues}</div><div class="eo-stat-label">Улик собрано</div></div>
        <div class="eo-stat"><div class="eo-stat-val countup" data-to="${correctActions}" data-suffix="/${totalActions}">0/${totalActions}</div><div class="eo-stat-label">Верных решений</div></div>
      </div>
      <div class="eo-actions">
        <button class="eo-btn primary" id="eoRestart">Новое расследование</button>
        <button class="eo-btn ghost" id="eoHome">В главное меню</button>
      </div>
    `;

    // частицы только для победы
    const pc = document.getElementById('eoParticles');
    if (pc) {
      pc.innerHTML = '';
      if (kind === 'win') {
        for (let i = 0; i < 28; i++) {
          const p = document.createElement('span');
          p.className = 'eo-p';
          p.style.left = Math.random() * 100 + '%';
          p.style.animationDelay = (Math.random() * 4) + 's';
          p.style.animationDuration = (4 + Math.random() * 4) + 's';
          p.style.opacity = 0.3 + Math.random() * 0.5;
          const s = 2 + Math.random() * 4; p.style.width = s + 'px'; p.style.height = s + 'px';
          pc.appendChild(p);
        }
      }
    }

    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('show'));

    // счётчики
    setTimeout(() => {
      content.querySelectorAll('.countup').forEach(eln => {
        const to = parseInt(eln.dataset.to, 10) || 0;
        const suffix = eln.dataset.suffix || '';
        const dur = 1200, start = performance.now();
        const tick = (now) => {
          const p = Math.min(1, (now - start) / dur);
          const e = 1 - Math.pow(1 - p, 3);
          eln.textContent = Math.round(to * e) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, 700);

    const close = () => { overlay.classList.remove('show'); document.body.style.overflow = ''; };
    const restart = document.getElementById('eoRestart');
    const home = document.getElementById('eoHome');
    if (restart) restart.onclick = async () => {
      close();
      if (window.__game) await window.__game.newGame();   // newGame ставит статус active + сбрасывает
      if (window.__refreshContinue) window.__refreshContinue();
      if (window.__navigateTo) window.__navigateTo('admin');
      else window.location.hash = '#/admin';
    };
    if (home) home.onclick = () => {
      close();
      // дело уже отмечено как won/lost — не сбрасываем, показываем исход на главной
      if (window.__navigateTo) window.__navigateTo('main');
      else window.location.hash = '#/main';
      if (window.__updateMain) window.__updateMain();
      if (window.__refreshContinue) window.__refreshContinue();
    };
  }

  async submitAnomalies(eventId) {
    const result = await this.apiPost({ eventId, selectedAnomalies: this.selectedAnomalies });
    this.selectedAnomalies = [];
    await this.handleActionResult(result);
    if (result.completed) this.showMsg(`Анализ завершён. Найдено аномалий: ${result.anomaliesFound}/3`);
  }

  async submitTimeline(eventId) {
    const result = await this.apiPost({ eventId, timelineOrder: this.timelineOrder });
    this.timelineOrder = [];
    await this.handleActionResult(result);
  }

  async submitRank(eventId) {
    const result = await this.apiPost({ eventId, rankOrder: this.rankOrder });
    this.rankOrder = [];
    await this.handleActionResult(result);
  }

  async submitCode(eventId) {
    const result = await this.apiPost({ eventId, codeCombo: this.codeCombo });
    if (!result.retry) this.codeCombo = ['', '', ''];
    await this.handleActionResult(result);
  }

  async submitMatch(eventId) {
    const result = await this.apiPost({ eventId, selectedMatch: this.selectedMatch });
    if (!result.retry) this.selectedMatch = {};
    await this.handleActionResult(result);
  }

  // =================== RENDER ===================
  async render() {
    if (!this.state) return;

    document.getElementById('currentShift').textContent = this.state.shift;
    document.getElementById('eventsResolved').textContent = this.state.foundClues?.length || 0;

    const trust = this.state.trust ?? 100;
    const fill = document.getElementById('trustFill');
    fill.style.width = `${trust}%`;
    if (trust >= 60) { fill.style.background = 'var(--neon-green)'; fill.style.color = 'var(--neon-green)'; }
    else if (trust >= 30) { fill.style.background = 'var(--warning)'; fill.style.color = 'var(--warning)'; }
    else { fill.style.background = 'var(--danger)'; fill.style.color = 'var(--danger)'; }
    document.getElementById('trustValue').textContent = `${trust}%`;
    document.getElementById('eventBadge').textContent = `СМЕНА ${this.state.shift}`;
    const sp = document.querySelector('.status-panel');
    if (sp) sp.classList.toggle('danger-mode', trust < 30);

    // Проверка финала
    if ((this.state.trust ?? 100) <= 0) {
      this._ended = true;
      this.showEndOverlay(true);
      return;
    }
    if (this.state.shift > 10 || (this.state.shift === 10 && this.state.completedEvents?.includes(10))) {
      this.renderFinalScreen();
      return;
    }

    let event = null;
    try { event = await (await fetch(`${this.API_URL}/events?shift=${this.state.shift}`)).json(); } catch (e) {}

    const card = document.getElementById('eventCard');
    const choices = document.getElementById('choicesContainer');

    if (!event || event.error) {
      card.innerHTML = '<p>Событие не найдено</p>';
      choices.innerHTML = '';
      return;
    }

    // Детективные названия кнопки подтверждения по сменам
    this._confirmLabel = (() => {
      const L = { 3: 'Восстановить хронологию', 4: 'Проверить', 5: 'Активировать', 6: 'Утвердить', 7: 'Зафиксировать', 9: 'Завершить реконструкцию' };
      return L[event.shift] || 'Подтвердить';
    })();

    const done = this.state.completedEvents?.includes(event.id);

    if (done) {
      card.innerHTML = `<h3>${event.title}</h3><p>${event.description}</p>`;
      choices.innerHTML = '<div class="completed-state"><span class="completed-icon">✓</span> Инцидент расследован.</div>';
    } else if (event.type === 'drag') {
      this.renderDragEvent(event, card, choices);
    } else if (event.type === 'oddlog') {
      this.renderOddLogEvent(event, card, choices);
    } else if (event.type === 'timeline') {
      this.renderTimelineEvent(event, card, choices);
    } else if (event.type === 'match') {
      this.renderMatchEvent(event, card, choices);
    } else if (event.type === 'code') {
      this.renderCodeEvent(event, card, choices);
    } else if (event.type === 'rank') {
      this.renderRankEvent(event, card, choices);
    } else if (event.type === 'anomaly') {
      this.renderAnomalyEvent(event, card, choices);
    } else if (event.type === 'choice') {
      this.renderChoiceEvent(event, card, choices);
    } else if (event.type === 'quiz') {
      this.renderQuizEvent(event, card, choices);
    }

    // Улики
    let clues = [];
    try { clues = await (await fetch(`${this.API_URL}/clues?playerId=${this.getPlayerId()}`)).json(); } catch (e) {}
    document.getElementById('clueCount').textContent = `${clues.length}/10`;
    document.getElementById('cluesList').innerHTML = clues.length
      ? clues.map(c => `<div class="clue-card"><div class="clue-type">${c.type}</div><div class="clue-name">${c.title}</div><div class="clue-desc">${c.description}</div></div>`).join('')
      : '<div class="empty-state">Нет записей в базе</div>';

    // HUD: трекер прогресса (10 сегментов)
    const tracker = document.getElementById('progressTracker');
    if (tracker) {
      const completed = this.state.completedEvents?.length || 0;
      tracker.innerHTML = Array.from({ length: 10 }, (_, i) =>
        `<span class="pt-seg ${i < completed ? 'done' : ''}${i === completed ? ' current' : ''}"><i>${String(i + 1).padStart(2, '0')}</i></span>`
      ).join('');
    }
    // HUD: путь терминала
    const tp = document.getElementById('termPath');
    if (tp) tp.textContent = `sys://incident/shift_${this.state.shift}`;

    // HUD: мини-список улик в сайдбаре
    const sc = document.getElementById('sideClues');
    const scc = document.getElementById('sideClueCount');
    if (scc) scc.textContent = clues.length;
    if (sc) {
      sc.innerHTML = clues.length
        ? clues.map(c => `<div class="side-clue"><span class="side-clue-type">${c.type}</span><span class="side-clue-name">${c.title}</span></div>`).join('')
        : '<div class="log-empty-state"><span class="le-cursor">_</span> УЛИКИ НЕ СОБРАНЫ</div>';
    }

    // Журнал смены: цветовая кодировка ходов + плейсхолдер
    const actions = this.state.actions || [];
    document.getElementById('actionLog').innerHTML = actions.length
      ? actions.slice().reverse().slice(0, 12).map(a => {
          const cls = a.correct === true ? 'log-entry-correct' : (a.correct === false ? 'log-entry-wrong' : '');
          const mark = a.correct === true ? '<span class="log-mark ok">[✓]</span>'
                     : (a.correct === false ? '<span class="log-mark err">[✗]</span>' : '');
          return `<div class="log-entry ${cls}"><span class="log-shift">[СМЕНА ${a.shift}]</span>${mark}<span class="log-desc">${a.description}</span></div>`;
        }).join('')
      : '<div class="log-empty-state"><span class="le-cursor">_</span> ОЖИДАНИЕ ДАННЫХ</div>';
  }

  // =================== МИНИ-ИГРЫ ===================

  // Обёртка списка вариантов в «терминальный» контейнер с заголовком
  _wrapChoices(buttonsHTML, count) {
    const word = this._plural(count, ['ВАРИАНТ', 'ВАРИАНТА', 'ВАРИАНТОВ']);
    return `
      <div class="choice-list">
        <div class="choices-header">
          <span class="ch-label">// ВЫБЕРИТЕ ДЕЙСТВИЕ</span>
          <span class="ch-counter">${count} ${word}</span>
        </div>
        ${buttonsHTML}
      </div>
    `;
  }
  _plural(n, forms) {
    const n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  renderDragEvent(event, card, choices) {
    card.innerHTML = `<h3>${event.title}</h3><p>${event.description}</p>`;
    const btns = event.fragments.map(f => `
      <button class="choice-btn" data-event="${event.id}" data-choice="${f.id}">
        ${f.correct ? '<span class="dot-indicator"></span>' : ''}
        <code class="choice-code">${f.text}</code>
      </button>
    `).join('');
    choices.innerHTML = this._wrapChoices(btns, event.fragments.length);
    choices.querySelectorAll('.choice-btn').forEach(btn => {
      btn.onclick = async () => {
        const result = await this.apiPost({ eventId: event.id, choiceId: btn.dataset.choice });
        await this.handleActionResult(result);
      };
    });
  }

  renderOddLogEvent(event, card, choices) {
    card.innerHTML = `<h3>${event.title}</h3><p>${event.description}</p>`;
    const btns = event.logs.map((log, i) => `
      <button class="choice-btn" data-event="${event.id}" data-choice="${i}">
        <span class="choice-txt">${log}</span>
      </button>
    `).join('');
    choices.innerHTML = this._wrapChoices(btns, event.logs.length);
    choices.querySelectorAll('.choice-btn').forEach(btn => {
      btn.onclick = async () => {
        const result = await this.apiPost({ eventId: event.id, choiceId: btn.dataset.choice });
        await this.handleActionResult(result);
      };
    });
  }

  renderTimelineEvent(event, card, choices) {
    this.timelineOrder = [];
    card.innerHTML = `<h3>${event.title}</h3><p>${event.description}</p><p class="mini-game-hint">Нажимайте в порядке 1 → 2 → 3 → 4.</p>`;
    const shuffled = [...event.fragments].sort(() => Math.random() - 0.5);
    const correctOrder = [...event.fragments].sort((a, b) => a.order - b.order);

    choices.innerHTML = `
      <div id="timelineFragments" class="frag-list mini-game-wrap">
        ${shuffled.map(f => `<div class="frag-item" data-id="${f.id}">${f.text}</div>`).join('')}
      </div>
      <div id="timelineOrder" class="order-display"></div>
      <button id="submitTimelineBtn" class="game-btn btn-new mini-submit">${this._confirmLabel}</button>
    `;

    const updateTimelineHint = () => {
      const nextIdx = this.timelineOrder.length;
      const fragments = choices.querySelectorAll('.frag-item');
      fragments.forEach(f => {
        const id = parseInt(f.dataset.id);
        const isSelected = this.timelineOrder.includes(id);
        const isNext = !isSelected && nextIdx < correctOrder.length && correctOrder[nextIdx].id === id;
        const dot = f.querySelector('.hint-dot');
        if (dot) dot.remove();
        if (isNext) {
          const hint = document.createElement('span');
          hint.className = 'dot-indicator hint-dot';
          f.prepend(hint);
        }
        f.classList.toggle('selected', isSelected);
      });
    };

    choices.querySelectorAll('.frag-item').forEach(frag => {
      frag.onclick = () => {
        const id = parseInt(frag.dataset.id);
        if (this.timelineOrder.includes(id)) {
          this.timelineOrder = this.timelineOrder.filter(x => x !== id);
        } else {
          this.timelineOrder.push(id);
        }
        const ordDiv = document.getElementById('timelineOrder');
        ordDiv.innerHTML = '<span class="order-label">Порядок:</span>' +
          this.timelineOrder.map((oid, i) => `<span class="order-pill">${i+1}. ${event.fragments.find(f=>f.id===oid).text.substring(0,16)}</span>`).join('');
        updateTimelineHint();
      };
    });

    updateTimelineHint();

    document.getElementById('submitTimelineBtn').onclick = () => {
      if (this.timelineOrder.length !== event.fragments.length) { this.showMsg('Выберите все фрагменты', 'warning'); return; }
      this.submitTimeline(event.id);
    };
  }

      renderMatchEvent(event, card, choices) {
    this.selectedMatch = {};
    card.innerHTML = `<h3>${event.title}</h3><p>${event.description}</p>`;

    const shuffledMatches = [...event.matches].sort(() => Math.random() - 0.5);

    choices.innerHTML = `
      <div class="mini-game-hint">Сопоставь проблему с уликой</div>
      <div class="mini-game-wrap">
      ${event.problems.map(p => `
        <div class="match-row">
          <div class="match-cell">${p.text}</div>
          <div class="match-options" data-problem="${p.id}">
            ${shuffledMatches.map(m => `<button class="match-opt-btn" data-problem="${p.id}" data-match="${m.id}">${m.text}</button>`).join('')}
          </div>
        </div>
      `).join('')}
      </div>
      <button id="submitMatchBtn" class="game-btn btn-new mini-submit">${this._confirmLabel}</button>
    `;

    choices.querySelectorAll('.match-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const problemId = btn.dataset.problem;
        const matchId = btn.dataset.match;
        choices.querySelectorAll(`.match-opt-btn[data-problem="${problemId}"]`).forEach(b => {
          b.classList.remove('selected');
          const dot = b.querySelector('.match-dot');
          if (dot) dot.remove();
        });
        btn.classList.add('selected');
        const isCorrect = event.problems.find(p => p.id === problemId)?.match === matchId;
        if (isCorrect) {
          const dot = document.createElement('span');
          dot.className = 'dot-indicator match-dot';
          btn.prepend(dot);
        }
        this.selectedMatch[problemId] = matchId;
      });
    });

    document.getElementById('submitMatchBtn').onclick = () => {
      if (Object.keys(this.selectedMatch).length !== event.problems.length) {
        this.showMsg('Сопоставьте все проблемы', 'warning'); return;
      }
      this.submitMatch(event.id);
    };
  }

  renderCodeEvent(event, card, choices) {
    this.codeCombo = ['', '', ''];
    card.innerHTML = `<h3>${event.title}</h3><p>${event.description}</p>`;
    choices.innerHTML = `<div class="mini-game-wrap">` + event.parts.map((part, i) => `
      <div class="code-part">
        <span class="code-part-label">${part.label}</span>
        <div class="code-parts">
          ${part.options.map(o => `
            <button class="code-opt-btn" data-part="${i}" data-id="${o.id}">
              ${o.correct ? '<span class="dot-indicator"></span>' : ''}${o.text}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('') + `</div>
      <div id="codePreview" class="code-preview" data-empty="true">_ _ _<span class="code-cursor">▋</span></div>
      <button id="submitCodeBtn" class="game-btn btn-new mini-submit">${this._confirmLabel}</button>
    `;
    choices.querySelectorAll('.code-opt-btn').forEach(btn => {
      btn.onclick = () => {
        const partIdx = parseInt(btn.dataset.part);
        this.codeCombo[partIdx] = btn.dataset.id;
        choices.querySelectorAll(`.code-opt-btn[data-part="${partIdx}"]`).forEach(b => {
          b.classList.toggle('selected', b.dataset.id === btn.dataset.id);
        });
        const preview = event.parts.map((p, idx) => {
          const opt = p.options.find(o => o.id === this.codeCombo[idx]);
          return opt ? opt.text : '_';
        }).join(' ');
        const pv = document.getElementById('codePreview');
        const full = !this.codeCombo.includes('');
        pv.dataset.empty = full ? 'false' : 'true';
        pv.innerHTML = preview + (full ? '' : '<span class="code-cursor">▋</span>');
      };
    });
    document.getElementById('submitCodeBtn').onclick = () => {
      if (this.codeCombo.includes('')) { this.showMsg('Выберите все 3 части команды', 'warning'); return; }
      this.submitCode(event.id);
    };
  }

  renderRankEvent(event, card, choices) {
    this.rankOrder = [];
    card.innerHTML = `<h3>${event.title}</h3><p>${event.description}</p><p class="mini-game-hint">Нажимайте от самой важной улики к наименее важной.</p>`;
    const shuffled = [...event.items].sort(() => Math.random() - 0.5);
    const correctOrder = [...event.items].sort((a, b) => a.rank - b.rank);

    choices.innerHTML = `
      <div id="rankFragments" class="frag-list mini-game-wrap">
        ${shuffled.map(it => `<div class="frag-item" data-id="${it.id}">${it.text}</div>`).join('')}
      </div>
      <div id="rankOrder" class="order-display"></div>
      <button id="submitRankBtn" class="game-btn btn-new mini-submit">${this._confirmLabel}</button>
    `;

    const updateRankHint = () => {
      const nextIdx = this.rankOrder.length;
      const fragments = choices.querySelectorAll('#rankFragments .frag-item');
      fragments.forEach(f => {
        const id = f.dataset.id;
        const isSelected = this.rankOrder.includes(id);
        const isNext = !isSelected && nextIdx < correctOrder.length && correctOrder[nextIdx].id === id;
        const dot = f.querySelector('.hint-dot');
        if (dot) dot.remove();
        if (isNext) {
          const hint = document.createElement('span');
          hint.className = 'dot-indicator hint-dot';
          f.prepend(hint);
        }
        f.classList.toggle('selected', isSelected);
      });
    };

    choices.querySelectorAll('#rankFragments .frag-item').forEach(frag => {
      frag.onclick = () => {
        const id = frag.dataset.id;
        if (this.rankOrder.includes(id)) {
          this.rankOrder = this.rankOrder.filter(x => x !== id);
        } else {
          this.rankOrder.push(id);
        }
        const ordDiv = document.getElementById('rankOrder');
        ordDiv.innerHTML = '<span class="order-label">Порядок:</span>' +
          this.rankOrder.map((rid, i) => `<span class="order-pill">${i+1}. ${event.items.find(it=>it.id===rid).text.substring(0,16)}</span>`).join('');
        updateRankHint();
      };
    });

    updateRankHint();

    document.getElementById('submitRankBtn').onclick = () => {
      if (this.rankOrder.length !== event.items.length) { this.showMsg('Расставьте все улики', 'warning'); return; }
      this.submitRank(event.id);
    };
  }

  renderAnomalyEvent(event, card, choices) {
    this.selectedAnomalies = [];
    card.innerHTML = `<h3>${event.title}</h3><p>${event.description}</p>`;
    choices.innerHTML = `
      <div class="anomaly-log-wrap">
        ${event.logs.map((log, i) => `<div class="anomaly-line" data-idx="${i}"><span class="log-num">${String(i+1).padStart(2,'0')}</span><span class="log-text">${log}</span></div>`).join('')}
      </div>
      <button id="submitAnomaliesBtn" class="game-btn btn-new mini-submit">${this._confirmLabel}</button>
      <div id="anomalyCounter" class="anomaly-counter">Выбрано: 0/3</div>
    `;
    const selectedIdx = new Set();
    choices.querySelectorAll('.anomaly-line').forEach(line => {
      line.onclick = () => {
        const idx = line.dataset.idx;
        if (selectedIdx.has(idx)) {
          selectedIdx.delete(idx);
          line.classList.remove('selected');
        } else {
          if (selectedIdx.size >= 3) { this.showMsg('Максимум 3', 'warning'); return; }
          selectedIdx.add(idx);
          line.classList.add('selected');
        }
        this.selectedAnomalies = [...selectedIdx].map(i => event.logs[i]);
        document.getElementById('anomalyCounter').textContent = `Выбрано: ${selectedIdx.size}/3`;
      };
    });
    document.getElementById('submitAnomaliesBtn').onclick = () => {
      if (this.selectedAnomalies.length === 0) { this.showMsg('Выберите записи', 'warning'); return; }
      this.submitAnomalies(event.id);
    };
  }

  renderChoiceEvent(event, card, choices) {
    card.innerHTML = `<h3>${event.title}</h3><p>${event.description}</p>`;
    const btns = event.responses.map(r => `
      <button class="choice-btn" data-event="${event.id}" data-choice="${r.id}">
        ${r.correct ? '<span class="dot-indicator"></span>' : ''}
        <code class="choice-code">${r.text}</code>
      </button>
    `).join('');
    choices.innerHTML = this._wrapChoices(btns, event.responses.length);
    choices.querySelectorAll('.choice-btn').forEach(btn => {
      btn.onclick = async () => {
        const result = await this.apiPost({ eventId: event.id, choiceId: btn.dataset.choice });
        await this.handleActionResult(result);
      };
    });
  }

  renderQuizEvent(event, card, choices) {
    card.innerHTML = `<h3>${event.title}</h3><p>${event.description}</p>`;
    const btns = event.choices.map(c => `
      <button class="choice-btn" data-event="${event.id}" data-choice="${c.id}">
        ${c.correct ? '<span class="dot-indicator"></span>' : ''}
        <span class="choice-txt">${c.text}</span>
      </button>
    `).join('');
    choices.innerHTML = this._wrapChoices(btns, event.choices.length);
    choices.querySelectorAll('.choice-btn').forEach(btn => {
      btn.onclick = async () => {
        const result = await this.apiPost({ eventId: event.id, choiceId: btn.dataset.choice });
        await this.handleActionResult(result);
      };
    });
  }

  renderFinalScreen() {
    this.updateBackground(10);
    this.showEndOverlay(false);
  }

  showMsg(text, type = 'success') {
    const n = document.getElementById('notification');
    n.textContent = text;
    n.className = `notification ${type}`;
    n.style.display = 'block';
    setTimeout(() => n.style.display = 'none', 3000);
  }
}

(function () {
  const container = document.getElementById('particles');
  if (!container) return;
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = Math.random() * 100 + '%';
    p.style.animationDelay = Math.random() * 6 + 's';
    p.style.animationDuration = (4 + Math.random() * 8) + 's';
    container.appendChild(p);
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  window.__game = new OfflineCityGame();
});
/* ============================================================
   Интерфейс: навигация, кнопка «Продолжить»,
   зеркало журнала, статус главной, фильтры логов
   ============================================================ */

(function () {

  /* --- СТАРТОВЫЙ ЭКРАН: печать лога загрузки --- */
  (function bootSequence() {
    const log = document.getElementById('bootLog');
    const reveal = document.getElementById('bootReveal');
    const screen = document.getElementById('bootScreen');
    const enter = document.getElementById('bootEnter');
    if (!log || !screen) return;

    const lines = [
      { t: '> SYS_INIT: загрузка ядра безопасности......... ', tail: 'ok', cls: 'ok' },
      { t: '> NET: подключение к порталу «ОФЛАЙН-ГОРОД»..... ', tail: 'fail', cls: 'err' },
      { t: '> ERR: канал связи с дата-центром потерян', tail: '', cls: 'err' },
      { t: '> PWA: переход в офлайн-режим.................. ', tail: 'warn', cls: 'err' },
      { t: '> CORE: активация аварийного протокола......... ', tail: 'ok', cls: 'ok' },
      { t: '> AUTH: дежурный инженер опознан', tail: '', cls: 'ok' },
      { t: '> READY.', tail: '', cls: 'ok' }
    ];

    let li = 0, ci = 0;
    function step() {
      if (li >= lines.length) {
        reveal.classList.add('show');
        return;
      }
      const line = lines[li];
      if (ci <= line.t.length) {
        log.innerHTML = log.dataset.done || '';
        log.innerHTML += line.t.slice(0, ci) + '<span class="cursor">▋</span>';
        ci++;
        setTimeout(step, 14);
      } else {
        const tailHtml = line.tail ? `<span class="${line.cls}">${line.tail}</span>` : '';
        log.dataset.done = (log.dataset.done || '') + line.t + tailHtml + '\n';
        log.innerHTML = log.dataset.done;
        li++; ci = 0;
        setTimeout(step, 220);
      }
    }
    setTimeout(step, 500);

    if (enter) {
      enter.addEventListener('click', () => {
        screen.classList.add('hidden');
        setTimeout(() => { screen.style.display = 'none'; }, 850);
      });
    }
    // запасной выход — клик по фону после появления кнопки
    screen.addEventListener('click', e => {
      if (e.target === screen && reveal.classList.contains('show')) {
        screen.classList.add('hidden');
        setTimeout(() => { screen.style.display = 'none'; }, 850);
      }
    });
  })();

  /* --- Навигация --- */
  function navigateTo(pageId) {
    document.querySelectorAll('.page-section').forEach(p => { p.hidden = true; });
    const target = document.getElementById('page-' + pageId);
    if (target) target.hidden = false;
    document.querySelectorAll('.nav-page-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.page === pageId);
    });
    // Панель статусов скрыта на главной, пока дело не идёт
    const active = (localStorage.getItem('oc_status') || (localStorage.getItem('oc_active') === '1' ? 'active' : 'none')) === 'active';
    toggleStatusPanel(!(pageId === 'main' && !active));
    // Пере-проигрываем анимацию параметров миссии
    if (pageId === 'main') animateMission();
  }
  function toggleStatusPanel(show) {
    const sp = document.querySelector('.status-panel');
    const idle = document.getElementById('idleStrip');
    if (sp) sp.style.display = show ? '' : 'none';
    if (idle) idle.hidden = show;
  }
  function animateMission() {
    const ml = document.getElementById('missionLines');
    if (!ml) return;
    ml.classList.remove('play'); void ml.offsetWidth; ml.classList.add('play');
  }
  // доступ из методов класса (финальный оверлей) + поддержка hash
  window.__navigateTo = navigateTo;
  window.addEventListener('hashchange', () => {
    const m = (location.hash || '').replace(/^#\/?/, '');
    if (['main', 'admin', 'logs', 'archive'].includes(m)) navigateTo(m);
  });

  document.querySelectorAll('.nav-page-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Вкладки сайдбара: журнал / улики
  document.querySelectorAll('.side-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.side-tab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.side-tab-pane').forEach(p => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
    });
  });

  // Часы сессии в шапке
  (function sessionClock() {
    const el = document.getElementById('sysClock');
    if (!el) return;
    const t0 = Date.now();
    const tick = () => {
      const s = Math.floor((Date.now() - t0) / 1000);
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      el.textContent = `${hh}:${mm}:${ss}`;
    };
    tick(); setInterval(tick, 1000);
  })();

  /* --- Карточки локаций на Главной → переход --- */
  document.querySelectorAll('.loc-card').forEach(card => {
    card.addEventListener('click', () => navigateTo(card.dataset.go));
  });

  /* --- Управление активностью игры (для кнопки «Продолжить») --- */
  function setActive(v) {
    if (v) localStorage.setItem('oc_active', '1');
    else localStorage.removeItem('oc_active');
  }
  function refreshContinue() {
    const b = document.getElementById('continueBtn');
    if (!b) return;
    b.disabled = caseStatus() !== 'active';
  }

  /* --- Кнопка Продолжить (только если дело начато) --- */
  const continueBtn = document.getElementById('continueBtn');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      if (localStorage.getItem('oc_active') !== '1') return;
      navigateTo('admin');
    });
  }

  /* --- Кнопка Новое дело → отмечаем активность и переходим в игру --- */
  const newBtn = document.getElementById('newGameBtn');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      setActive(true);
      setTimeout(() => { navigateTo('admin'); refreshContinue(); }, 60);
    });
  }

  /* --- Кнопка Закрыть дело → сбрасываем игру и снимаем активность ---
     (переопределяем после инициализации app.js, см. DOMContentLoaded ниже) */

  /* --- Зеркало actionLog → actionLogMini (сайдбар Адм. панели) --- */
  function syncMiniLog() {
    const src = document.getElementById('actionLog');
    const dst = document.getElementById('actionLogMini');
    if (src && dst) dst.innerHTML = src.innerHTML;
  }

  // Наблюдаем за изменениями в actionLog
  const logObs = new MutationObserver(syncMiniLog);
  const actionLogEl = document.getElementById('actionLog');
  if (actionLogEl) logObs.observe(actionLogEl, { childList: true, subtree: true });

  /* --- Статус системы на Главной (меняем И заголовок, И описание) --- */
  const DESC_PLAYING = '03:14, 14 марта 2031. Городской портал «Офлайн-город» начал отдавать чужие данные, прошлогодние записи и фантомные ошибки. Канал связи с дата-центром оборван. Ты — дежурный инженер системной безопасности. До утренней пересменки у тебя <strong>10 рабочих циклов</strong>, чтобы собрать <strong>10 улик</strong>, вычислить источник сбоя и удержать доверие горожан.';
  const DESC_DONE = 'Расследование закрыто. Источник сбоя установлен: подрядчик внедрил вредоносный Service Worker под видом «обновления безопасности v2.7». Он подменял ответы сервера и сливал данные горожан на сторонний домен. Закладка обезврежена, канал связи восстановлен, кэш очищен. Портал снова работает в штатном режиме — а твой рапорт лёг на стол прокуратуры.';
  const DESC_DONE_FAIL = 'Расследование завершено, но слишком поздно. Доверие жителей потеряно, городской портал отключён. Виновного установить не удалось — департамент расформирован.';
  const DESC_FAIL = 'Индекс доверия жителей критически низок. Городской портал на грани отключения. Расследование нужно довести до конца, пока доверие не упало до нуля.';

  function caseStatus() {
    return localStorage.getItem('oc_status') || (localStorage.getItem('oc_active') === '1' ? 'active' : 'none');
  }

  function buildMissionRows(status, st, result) {
    const trust = (result && result.trust != null) ? result.trust : (st ? (st.trust ?? 100) : 100);
    const clues = (result && result.clues != null) ? result.clues : (st ? (st.foundClues?.length || 0) : 0);
    const shift = st ? (st.shift || 1) : 1;
    if (status === 'won') return [
      ['ЦЕЛЬ', 'выполнена', 'ok'], ['УЛИК СОБРАНО', `${clues}/10`, 'ok'],
      ['ДОВЕРИЕ', `${trust}%`, trust >= 60 ? 'ok' : 'warn'], ['УГРОЗА', 'УСТРАНЕНА', 'ok'],
      ['КАНАЛ', 'ВОССТАНОВЛЕН', 'ok'], ['ПОДОЗРЕВАЕМЫЙ', 'подрядчик', ''], ['СТАТУС', 'ДЕЛО РАСКРЫТО', 'ok'],
    ];
    if (status === 'lost') return [
      ['ЦЕЛЬ', 'провалена', 'danger'], ['УЛИК СОБРАНО', `${clues}/10`, ''],
      ['ДОВЕРИЕ', `${trust}%`, 'danger'], ['УГРОЗА', 'НЕ УСТРАНЕНА', 'danger'],
      ['КАНАЛ', 'ОБОРВАН', 'danger'], ['ПОДОЗРЕВАЕМЫЙ', 'не установлен', 'danger'], ['СТАТУС', 'ДЕЛО ПРОВАЛЕНО', 'danger'],
    ];
    if (status === 'active') return [
      ['ЦЕЛЬ', 'собрать 10 улик', ''], ['ЦИКЛ', `смена ${shift}/10`, ''],
      ['УЛИК СОБРАНО', `${clues}/10`, clues > 0 ? 'ok' : ''],
      ['ДОВЕРИЕ', `${trust}%`, trust >= 60 ? 'ok' : (trust >= 30 ? 'warn' : 'danger')],
      ['УГРОЗА', 'КРИТИЧЕСКАЯ', 'danger'], ['КАНАЛ', 'ОБОРВАН', 'danger'], ['СТАТУС', 'ИДЁТ РАССЛЕДОВАНИЕ', 'ok'],
    ];
    return [
      ['ЦЕЛЬ', 'собрать 10 улик', ''], ['ЦИКЛОВ', '10', ''], ['УГРОЗА', 'КРИТИЧЕСКАЯ', 'danger'],
      ['СТАТУС', 'ОЖИДАНИЕ', 'warn'], ['ОПЕРАТОР', 'дежурный инженер', ''],
      ['КАНАЛ', 'ОБОРВАН', 'danger'], ['ПОДОЗРЕВАЕМЫЙ', 'неизвестен', ''],
    ];
  }

  function updateMainStatus() {
    const status = caseStatus();
    const st = window.__game && window.__game.state;
    let result = null;
    try { result = JSON.parse(localStorage.getItem('oc_result') || 'null'); } catch (e) {}

    const dot = document.getElementById('mainStatusDot');
    const text = document.getElementById('mainStatusText');
    const desc = document.getElementById('mainStatusDesc');
    const trust = (result && result.trust != null) ? result.trust : (st ? (st.trust ?? 100) : 100);

    // заголовок состояния системы + описание
    if (text) {
      dot && dot.classList.remove('ok', 'warn');
      if (status === 'won') {
        dot && dot.classList.add('ok');
        text.style.color = 'var(--neon-green)'; text.textContent = 'ДЕЛО РАСКРЫТО';
        if (desc) desc.innerHTML = DESC_DONE;
      } else if (status === 'lost') {
        text.style.color = 'var(--neon-red)'; text.textContent = 'ДЕЛО ПРОВАЛЕНО';
        if (desc) desc.innerHTML = DESC_DONE_FAIL;
      } else if (status === 'active') {
        if (trust <= 30) { text.style.color = 'var(--neon-red)'; text.textContent = 'КРИТИЧЕСКИЙ СБОЙ'; }
        else if (trust <= 60) { dot && dot.classList.add('warn'); text.style.color = 'var(--neon-orange)'; text.textContent = 'ДЕГРАДАЦИЯ СИСТЕМЫ'; }
        else { text.style.color = 'var(--neon-red)'; text.textContent = 'РАССЛЕДОВАНИЕ ИДЁТ'; }
        if (desc) desc.innerHTML = DESC_PLAYING;
      } else {
        text.style.color = 'var(--neon-red)'; text.textContent = 'АВАРИЙНЫЙ РЕЖИМ';
        if (desc) desc.innerHTML = DESC_PLAYING;
      }
    }

    // панель миссии
    const ml = document.getElementById('missionLines');
    if (ml) {
      ml.innerHTML = buildMissionRows(status, st, result).map(([k, v, cls]) =>
        `<div class="mp-line"><span class="mp-k">${k}</span><span class="mp-dots"></span><span class="mp-v ${cls}">${v}</span></div>`
      ).join('');
      ml.classList.remove('play'); void ml.offsetWidth; ml.classList.add('play');
    }
    const foot = document.getElementById('mpFoot');
    if (foot) foot.textContent = status === 'won' ? 'дело закрыто. рапорт отправлен.'
      : status === 'lost' ? 'доступ к делу отозван.'
      : status === 'active' ? 'расследование в процессе...'
      : 'ожидание команды оператора...';

    // строка-ожидание под шапкой
    const idle = document.getElementById('idleStrip');
    if (idle && !idle.hidden) {
      idle.textContent = status === 'won' ? 'ДЕЛО РАСКРЫТО · «НОВОЕ ДЕЛО» — НАЧАТЬ ЗАНОВО'
        : status === 'lost' ? 'ДЕЛО ПРОВАЛЕНО · «НОВОЕ ДЕЛО» — ПОПРОБОВАТЬ СНОВА'
        : 'СИСТЕМА В РЕЖИМЕ ОЖИДАНИЯ · НАЖМИТЕ «НОВОЕ ДЕЛО»';
    }

    // кнопка «Закрыть дело» активна только если есть что закрывать
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.disabled = (status === 'none');
  }

  // Обновляем статус при изменении смены ИЛИ доверия
  window.__updateMain = updateMainStatus;
  window.__refreshContinue = refreshContinue;
  const shiftEl = document.getElementById('currentShift');
  if (shiftEl) new MutationObserver(() => { updateMainStatus(); refreshContinue(); }).observe(shiftEl, { childList: true });
  const trustEl = document.getElementById('trustValue');
  if (trustEl) new MutationObserver(() => { updateMainStatus(); refreshContinue(); }).observe(trustEl, { childList: true });
  // первичный вызов
  setTimeout(() => { updateMainStatus(); refreshContinue(); }, 500);

  /* --- Фильтры системного журнала --- */
  document.querySelectorAll('.log-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      document.querySelectorAll('.sys-log-entry').forEach(entry => {
        entry.style.display =
          (filter === 'all' || entry.dataset.level === filter) ? '' : 'none';
      });
    });
  });

  /* --- Стартовая страница + донастройка после инициализации app.js --- */
  function afterReady() {
    navigateTo('main');
    refreshContinue();

    // Переопределяем «Закрыть дело», чтобы снять флаг активности.
    // app.js уже навесил resetGame на onclick — заменяем своей версией.
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        if (!confirm('Закрыть текущее дело? Весь прогресс будет потерян.')) return;
        const g = window.__game;
        const oldId = localStorage.getItem('offlineCityPlayerId');
        if (g && oldId) {
          try {
            await fetch(g.API_URL + '/reset', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ playerId: oldId })
            });
          } catch (e) {}
        }
        localStorage.removeItem('offlineCityPlayerId');
        localStorage.removeItem('oc_status');
        localStorage.removeItem('oc_result');
        setActive(false);
        location.reload();
      };
    }
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(afterReady, 0));
  if (document.readyState !== 'loading') setTimeout(afterReady, 0);

})();
