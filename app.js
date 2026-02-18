/* Calm Expenses — Vanilla JS SPA (mobile-first, no modal, no filters, no data import/export) */
(() => {
  'use strict';

  const STORAGE_KEY = 'calm-expenses:mobile-first';

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const todayISO = () => new Date().toISOString().slice(0,10);
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)));
  const parseMoney = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return NaN;
    return Math.round(n * 100) / 100;
  };
  const fmtMoney = (n) => (Number(n)||0).toLocaleString('es-ES', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';

  const monthLabel = (date = new Date()) => {
    const fmt = new Intl.DateTimeFormat('es-ES', { month:'long', year:'numeric' });
    return fmt.format(date).replace(/^./, c => c.toUpperCase());
  };
  const monthRange = (date = new Date()) => {
    const y = date.getFullYear();
    const m = date.getMonth();
    const start = new Date(y, m, 1);
    const end = new Date(y, m+1, 1);
    return { startISO: start.toISOString().slice(0,10), endISO: end.toISOString().slice(0,10) };
  };

  const state = {
    accounts: [],
    tags: [],
    transactions: [],
    recurrings: [],
    ui: { tab:'dashboard', txSelectedTags: [], recSelectedTags: [] }
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      accounts: state.accounts,
      tags: state.tags,
      transactions: state.transactions,
      recurrings: state.recurrings
    }));
  };

  const load = () => {
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.accounts = Array.isArray(data.accounts) ? data.accounts : [];
      state.tags = Array.isArray(data.tags) ? data.tags : [];
      state.transactions = Array.isArray(data.transactions) ? data.transactions : [];
      state.recurrings = Array.isArray(data.recurrings) ? data.recurrings : [];
    }catch(e){
      console.warn('Load failed', e);
    }
  };

  // --- Calculations ---
  const accountBalance = (accountId) => {
    const acc = state.accounts.find(a => a.id === accountId);
    const initial = acc ? Number(acc.initial || 0) : 0;
    let delta = 0;
    for (const t of state.transactions){
      if (t.accountId !== accountId) continue;
      const amt = Number(t.amount) || 0;
      delta += (t.type === 'income') ? amt : -amt;
    }
    return Math.round((initial + delta) * 100) / 100;
  };
  const totalBalance = () => state.accounts.reduce((sum, a) => sum + accountBalance(a.id), 0);
  const monthTotals = (date = new Date()) => {
    const { startISO, endISO } = monthRange(date);
    let income = 0, expense = 0;
    for (const t of state.transactions){
      if (t.date >= startISO && t.date < endISO){
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') income += amt;
        else expense += amt;
      }
    }
    return { income: Math.round(income*100)/100, expense: Math.round(expense*100)/100 };
  };

  // --- Tabs ---
  const setTab = (tab) => {
    state.ui.tab = tab;
    $$('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
    $$('.panel').forEach(p => p.classList.toggle('is-active', p.id === `tab-${tab}`));
  };
  const wireTabs = () => {
    $$('.tab').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  };

  // --- Chips & pickers ---
  const renderChips = (container, tagIds, removable, onRemove) => {
    container.innerHTML = '';
    const tags = (tagIds || []).map(id => state.tags.find(t => t.id === id)).filter(Boolean);
    if (!tags.length){
      const p = document.createElement('span');
      p.className = 'muted small';
      p.textContent = 'Sin etiquetas';
      container.appendChild(p);
      return;
    }
    for (const t of tags){
      const chip = document.createElement('span');
      chip.className = 'chip';

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = t.color;
      chip.appendChild(dot);

      const name = document.createElement('span');
      name.textContent = t.name;
      chip.appendChild(name);

      if (removable){
        const x = document.createElement('button');
        x.type = 'button';
        x.setAttribute('aria-label', `Quitar ${t.name}`);
        x.textContent = '×';
        x.addEventListener('click', () => onRemove(t.id));
        chip.appendChild(x);
      }
      container.appendChild(chip);
    }
  };

  const renderPicker = (container, selectedIds, onChange) => {
    container.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'picker-head';

    const title = document.createElement('div');
    title.className = 'picker-title';
    title.textContent = state.tags.length ? 'Selecciona una o varias etiquetas' : 'No hay etiquetas. Crea alguna en “Etiquetas”.';
    head.appendChild(title);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn-ghost btn-sm';
    close.textContent = 'Cerrar';
    close.addEventListener('click', () => { container.hidden = true; });
    head.appendChild(close);

    container.appendChild(head);

    const list = document.createElement('div');
    list.className = 'picker-list';

    for (const t of state.tags){
      const lab = document.createElement('label');
      lab.className = 'pick';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedIds.includes(t.id);
      cb.addEventListener('change', () => {
        const next = cb.checked
          ? Array.from(new Set([...selectedIds, t.id]))
          : selectedIds.filter(x => x !== t.id);
        onChange(next);
      });

      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = t.color;

      const nm = document.createElement('span');
      nm.textContent = t.name;

      lab.appendChild(cb);
      lab.appendChild(sw);
      lab.appendChild(nm);
      list.appendChild(lab);
    }

    container.appendChild(list);
  };

  // --- Toast ---
  let toastTimer = null;
  const toast = (msg) => {
    clearTimeout(toastTimer);
    let el = document.getElementById('__toast');
    if (!el){
      el = document.createElement('div');
      el.id = '__toast';
      el.style.position = 'fixed';
      el.style.left = '50%';
      el.style.bottom = '16px';
      el.style.transform = 'translateX(-50%)';
      el.style.padding = '10px 14px';
      el.style.border = '1px solid rgba(111,207,151,0.5)';
      el.style.background = '#fff';
      el.style.borderRadius = '999px';
      el.style.boxShadow = '0 20px 50px rgba(2,6,23,0.12)';
      el.style.fontSize = '13px';
      el.style.zIndex = '100';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.hidden = false;
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  };

  // --- Render ---
  const renderStats = () => {
    $('#monthLabel').textContent = monthLabel(new Date());
    const { income, expense } = monthTotals(new Date());
    $('#statIncome').textContent = fmtMoney(income);
    $('#statExpense').textContent = fmtMoney(expense);
    $('#statTotal').textContent = fmtMoney(totalBalance());
  };

  const renderTxList = () => {
    const list = $('#txList');
    list.innerHTML = '';
    $('#txEmpty').hidden = state.transactions.length !== 0;

    const items = state.transactions.slice(0, 50);
    for (const t of items){
      const acc = state.accounts.find(a => a.id === t.accountId);

      const item = document.createElement('div');
      item.className = 'item';

      const meta = document.createElement('div');
      meta.className = 'meta';

      const title = document.createElement('div');
      title.className = 'title';

      const badge = document.createElement('span');
      badge.className = 'badge ' + t.type;
      badge.textContent = t.type === 'income' ? 'Ingreso' : 'Gasto';
      title.appendChild(badge);

      const strong = document.createElement('strong');
      strong.textContent = (t.note && t.note.trim()) ? t.note.trim() : '—';
      strong.style.overflow = 'hidden';
      strong.style.textOverflow = 'ellipsis';
      strong.style.whiteSpace = 'nowrap';
      strong.style.maxWidth = '420px';
      title.appendChild(strong);

      meta.appendChild(title);

      const sub = document.createElement('div');
      sub.className = 'muted small';
      const tagNames = (t.tagIds||[]).map(id => state.tags.find(x=>x.id===id)).filter(Boolean).map(x=>x.name).join(', ');
      sub.textContent = `${t.date} · ${acc ? acc.name : 'Cuenta'}${tagNames ? ' · ' + tagNames : ''}${t.recurringId ? ' · Recurrente' : ''}`;
      meta.appendChild(sub);

      const right = document.createElement('div');
      right.className = 'actions';

      const amt = document.createElement('div');
      amt.className = 'amount ' + t.type;
      const sign = t.type === 'income' ? '+' : '−';
      amt.textContent = sign + fmtMoney(Number(t.amount)||0).replace(' €','') + ' €';
      right.appendChild(amt);

      const del = document.createElement('button');
      del.className = 'icon-btn';
      del.type = 'button';
      del.textContent = 'Borrar';
      del.addEventListener('click', () => {
        const ok = confirm('¿Borrar este movimiento?');
        if (!ok) return;
        state.transactions = state.transactions.filter(x => x.id !== t.id);
        save();
        renderAll();
      });
      right.appendChild(del);

      item.appendChild(meta);
      item.appendChild(right);
      list.appendChild(item);
    }
  };

  const fillAccountSelect = (select) => {
    const prev = select.value;
    select.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Selecciona una cuenta';
    ph.disabled = true;
    ph.hidden = true;
    select.appendChild(ph);

    for (const a of state.accounts){
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      select.appendChild(opt);
    }

    if ([...select.options].some(o => o.value === prev)) select.value = prev;
    else select.value = '';
    select.disabled = state.accounts.length === 0;
  };

  const renderAccounts = () => {
    const list = $('#accountList');
    list.innerHTML = '';
    $('#accountEmpty').hidden = state.accounts.length !== 0;

    for (const a of state.accounts){
      const item = document.createElement('div');
      item.className = 'item';

      const meta = document.createElement('div');
      meta.className = 'meta';

      const title = document.createElement('div');
      title.className = 'title';

      const strong = document.createElement('strong');
      strong.textContent = a.name;
      title.appendChild(strong);

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'Inicial: ' + fmtMoney(Number(a.initial||0));
      title.appendChild(badge);

      meta.appendChild(title);

      const sub = document.createElement('div');
      sub.className = 'muted small';
      sub.textContent = 'Saldo actual calculado con movimientos.';
      meta.appendChild(sub);

      const right = document.createElement('div');
      right.className = 'actions';

      const amt = document.createElement('div');
      amt.className = 'amount income';
      amt.textContent = fmtMoney(accountBalance(a.id));
      right.appendChild(amt);

      const edit = document.createElement('button');
      edit.className = 'icon-btn';
      edit.type = 'button';
      edit.textContent = 'Editar';
      edit.addEventListener('click', () => {
        const name = prompt('Nombre de la cuenta:', a.name);
        if (name === null) return;
        const nm = name.trim();
        if (!nm) return alert('Nombre no válido.');

        const initialStr = prompt('Saldo inicial (número, puede ser 0):', String(a.initial ?? 0));
        if (initialStr === null) return;
        const initial = parseMoney(initialStr);
        if (!Number.isFinite(initial)) return alert('Saldo inicial no válido.');

        a.name = nm;
        a.initial = initial;
        save();
        renderAll();
      });
      right.appendChild(edit);

      const del = document.createElement('button');
      del.className = 'icon-btn';
      del.type = 'button';
      del.textContent = 'Borrar';
      del.addEventListener('click', () => deleteAccount(a.id));
      right.appendChild(del);

      item.appendChild(meta);
      item.appendChild(right);
      list.appendChild(item);
    }

    // Update selects used in Tx and Rec
    const txAcc = $('#txAccount');
    const recAcc = $('#recAccount');

    if (state.accounts.length){
      fillAccountSelect(txAcc);
      fillAccountSelect(recAcc);
    } else {
      txAcc.innerHTML = '<option value="" selected>Primero crea una cuenta</option>';
      recAcc.innerHTML = '<option value="" selected>Primero crea una cuenta</option>';
      txAcc.disabled = true;
      recAcc.disabled = true;
    }
  };

  const renderTags = () => {
    const grid = $('#tagList');
    grid.innerHTML = '';
    $('#tagEmpty').hidden = state.tags.length !== 0;

    for (const t of state.tags){
      const card = document.createElement('div');
      card.className = 'tag-card';

      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = t.color;
      card.appendChild(sw);

      const name = document.createElement('strong');
      name.textContent = t.name;
      card.appendChild(name);

      const edit = document.createElement('button');
      edit.className = 'icon-btn';
      edit.type = 'button';
      edit.textContent = 'Editar';
      edit.addEventListener('click', () => {
        const nm = prompt('Nombre de etiqueta:', t.name);
        if (nm === null) return;
        const name2 = nm.trim();
        if (!name2) return alert('Nombre no válido.');

        const col = prompt('Color (hex, ej #84d19a):', t.color);
        if (col === null) return;
        const c = col.trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(c)) return alert('Color no válido.');

        t.name = name2;
        t.color = c;
        save();
        renderAll();
      });
      card.appendChild(edit);

      const del = document.createElement('button');
      del.className = 'icon-btn';
      del.type = 'button';
      del.textContent = 'Borrar';
      del.addEventListener('click', () => deleteTag(t.id));
      card.appendChild(del);

      grid.appendChild(card);
    }

    // Refresh chip views
    renderChips($('#txTagsChips'), state.ui.txSelectedTags, true, (id) => {
      state.ui.txSelectedTags = state.ui.txSelectedTags.filter(x => x !== id);
      save();
      renderAll();
    });
    renderChips($('#recTagsChips'), state.ui.recSelectedTags, true, (id) => {
      state.ui.recSelectedTags = state.ui.recSelectedTags.filter(x => x !== id);
      save();
      renderAll();
    });
  };

  const addRecurringNow = (recId) => {
    const rec = state.recurrings.find(r => r.id === recId);
    if (!rec) return;

    const iso = todayISO();
    const key = `manual:${iso}`;
    const exists = state.transactions.some(t => t.recurringId === recId && t.recurringKey === key);
    if (exists){
      alert('Este recurrente ya se añadió hoy.');
      return;
    }

    state.transactions.push({
      id: uid(),
      type: rec.type,
      amount: Math.round(Number(rec.amount) * 100) / 100,
      date: iso,
      accountId: rec.accountId,
      tagIds: Array.isArray(rec.tagIds) ? rec.tagIds.slice() : [],
      note: rec.name,
      createdAt: Date.now(),
      recurringId: rec.id,
      recurringKey: key
    });

    state.transactions.sort((a,b) => (b.date.localeCompare(a.date) || (b.createdAt - a.createdAt)));
    save();
    renderAll();
    toast('Recurrente añadido ✅');
  };

  const renderRecurrings = () => {
    const list = $('#recList');
    list.innerHTML = '';
    $('#recEmpty').hidden = state.recurrings.length !== 0;

    for (const r of state.recurrings){
      const acc = state.accounts.find(a => a.id === r.accountId);
      const item = document.createElement('div');
      item.className = 'item';

      const meta = document.createElement('div');
      meta.className = 'meta';

      const title = document.createElement('div');
      title.className = 'title';

      const badge = document.createElement('span');
      badge.className = 'badge ' + r.type;
      badge.textContent = r.type === 'income' ? 'Ingreso' : 'Gasto';
      title.appendChild(badge);

      const strong = document.createElement('strong');
      strong.textContent = r.name;
      title.appendChild(strong);

      meta.appendChild(title);

      const sub = document.createElement('div');
      sub.className = 'muted small';
      sub.textContent = `${acc ? acc.name : 'Cuenta'} · ${r.active ? 'Activo' : 'Inactivo'}`;
      meta.appendChild(sub);

      const right = document.createElement('div');
      right.className = 'actions';

      const amt = document.createElement('div');
      amt.className = 'amount ' + r.type;
      const sign = r.type === 'income' ? '+' : '−';
      amt.textContent = sign + fmtMoney(Number(r.amount)||0).replace(' €','') + ' €';
      right.appendChild(amt);

      const toggle = document.createElement('button');
      toggle.className = 'icon-btn';
      toggle.type = 'button';
      toggle.textContent = r.active ? 'Desactivar' : 'Activar';
      toggle.addEventListener('click', () => {
        r.active = !r.active;
        save();
        renderAll();
      });
      right.appendChild(toggle);

      const add = document.createElement('button');
      add.className = 'icon-btn';
      add.type = 'button';
      add.textContent = 'Añadir hoy';
      add.addEventListener('click', () => {
        if (!r.active){
          const ok = confirm('Este recurrente está inactivo. ¿Añadirlo igualmente hoy?');
          if (!ok) return;
        }
        addRecurringNow(r.id);
      });
      right.appendChild(add);

      const del = document.createElement('button');
      del.className = 'icon-btn';
      del.type = 'button';
      del.textContent = 'Borrar';
      del.addEventListener('click', () => {
        const ok = confirm('¿Borrar recurrente? (No borra movimientos ya creados)');
        if (!ok) return;
        state.recurrings = state.recurrings.filter(x => x.id !== r.id);
        save();
        renderAll();
      });
      right.appendChild(del);

      item.appendChild(meta);
      item.appendChild(right);
      list.appendChild(item);
    }
  };

  const renderAll = () => {
    if (!$('#txDate').value) $('#txDate').value = todayISO();
    renderAccounts();
    renderTags();
    renderStats();
    renderTxList();
    renderRecurrings();
  };

  // --- Delete helpers ---
  const deleteAccount = (id) => {
    const used = state.transactions.some(t => t.accountId === id) || state.recurrings.some(r => r.accountId === id);
    const msg = used
      ? 'Esta cuenta está usada en movimientos o recurrentes. Si la borras, también se borrarán esos movimientos/recurrentes asociados. ¿Continuar?'
      : '¿Borrar cuenta?';
    const ok = confirm(msg);
    if (!ok) return;

    state.transactions = state.transactions.filter(t => t.accountId !== id);
    state.recurrings = state.recurrings.filter(r => r.accountId !== id);
    state.accounts = state.accounts.filter(a => a.id !== id);

    save();
    renderAll();
  };

  const deleteTag = (id) => {
    const ok = confirm('¿Borrar etiqueta? Se quitará de movimientos y recurrentes.');
    if (!ok) return;

    for (const tx of state.transactions){
      tx.tagIds = (tx.tagIds || []).filter(tid => tid !== id);
    }
    for (const r of state.recurrings){
      r.tagIds = (r.tagIds || []).filter(tid => tid !== id);
    }
    state.tags = state.tags.filter(t => t.id !== id);

    state.ui.txSelectedTags = state.ui.txSelectedTags.filter(tid => tid !== id);
    state.ui.recSelectedTags = state.ui.recSelectedTags.filter(tid => tid !== id);

    save();
    renderAll();
  };

  // --- Events ---
  const wireForms = () => {
    // Tx
    $('#formTx').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!state.accounts.length) return alert('Crea una cuenta primero.');

      const type = $('#txType').value;
      const amount = parseMoney($('#txAmount').value);
      const date = $('#txDate').value || todayISO();
      const accountId = $('#txAccount').value;
      const note = ($('#txNote').value || '').trim();

      if (!(Number.isFinite(amount) && amount > 0)) return alert('Cantidad debe ser > 0');
      if (!accountId) return alert('Cuenta obligatoria.');

      state.transactions.push({
        id: uid(),
        type,
        amount,
        date,
        accountId,
        tagIds: state.ui.txSelectedTags.slice(),
        note,
        createdAt: Date.now()
      });

      state.transactions.sort((a,b) => (b.date.localeCompare(a.date) || (b.createdAt - a.createdAt)));
      save();
      renderAll();

      $('#txAmount').value = '';
      $('#txNote').value = '';
      state.ui.txSelectedTags = [];
      $('#txTagPicker').hidden = true;
      toast('Movimiento añadido ✅');
    });

    $('#btnTxClear').addEventListener('click', () => {
      $('#txType').value = 'expense';
      $('#txAmount').value = '';
      $('#txDate').value = todayISO();
      $('#txNote').value = '';
      state.ui.txSelectedTags = [];
      $('#txTagPicker').hidden = true;
      renderAll();
    });

    // Accounts
    $('#formAccount').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = ($('#accName').value || '').trim();
      const initialRaw = ($('#accInitial').value || '').trim();
      const initial = initialRaw ? parseMoney(initialRaw) : 0;

      if (!name) return alert('Nombre obligatorio.');
      if (initialRaw && !Number.isFinite(initial)) return alert('Saldo inicial no válido.');

      state.accounts.push({ id: uid(), name, initial: Number(initial||0) });
      save();
      $('#accName').value = '';
      $('#accInitial').value = '';
      renderAll();
      toast('Cuenta añadida ✅');
    });

    // Tags
    $('#formTag').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = ($('#tagName').value || '').trim();
      const color = ($('#tagColor').value || '').trim();
      if (!name) return alert('Etiqueta no puede estar vacía.');
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) return alert('Color no válido.');

      state.tags.push({ id: uid(), name, color });
      save();
      $('#tagName').value = '';
      renderAll();
      toast('Etiqueta añadida ✅');
    });

    // Recurring
    $('#formRec').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!state.accounts.length) return alert('Crea una cuenta primero.');

      const name = ($('#recName').value || '').trim();
      const amount = parseMoney($('#recAmount').value);
      const type = $('#recType').value;
      const accountId = $('#recAccount').value;

      if (!name) return alert('Nombre obligatorio.');
      if (!(Number.isFinite(amount) && amount > 0)) return alert('Cantidad debe ser > 0');
      if (!accountId) return alert('Cuenta obligatoria.');

      state.recurrings.push({
        id: uid(),
        name,
        type,
        amount,
        accountId,
        tagIds: state.ui.recSelectedTags.slice(),
        active: true
      });
      save();

      $('#recName').value = '';
      $('#recAmount').value = '';
      state.ui.recSelectedTags = [];
      $('#recTagPicker').hidden = true;

      renderAll();
      toast('Recurrente añadido ✅');
    });

    // Tag pickers (inline)
    const txPicker = $('#txTagPicker');
    const recPicker = $('#recTagPicker');

    const togglePicker = (picker, other) => {
      other.hidden = true;
      picker.hidden = !picker.hidden;
      if (!picker.hidden){
        const first = picker.querySelector('input');
        first && first.focus();
      }
    };

    $('#btnTxPickTags').addEventListener('click', () => {
      renderPicker(txPicker, state.ui.txSelectedTags, (next) => {
        state.ui.txSelectedTags = next;
        renderChips($('#txTagsChips'), state.ui.txSelectedTags, true, (id) => {
          state.ui.txSelectedTags = state.ui.txSelectedTags.filter(x => x !== id);
          renderAll();
        });
        renderPicker(txPicker, state.ui.txSelectedTags, arguments.callee);
      });
      togglePicker(txPicker, recPicker);
    });

    $('#btnRecPickTags').addEventListener('click', () => {
      renderPicker(recPicker, state.ui.recSelectedTags, (next) => {
        state.ui.recSelectedTags = next;
        renderChips($('#recTagsChips'), state.ui.recSelectedTags, true, (id) => {
          state.ui.recSelectedTags = state.ui.recSelectedTags.filter(x => x !== id);
          renderAll();
        });
        renderPicker(recPicker, state.ui.recSelectedTags, arguments.callee);
      });
      togglePicker(recPicker, txPicker);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape'){
        txPicker.hidden = true;
        recPicker.hidden = true;
      }
    });
  };

  const ensureSeedData = () => {
    if (!state.accounts.length){
      state.accounts.push({ id: uid(), name:'Efectivo', initial: 0 });
      save();
    }
  };

  const init = () => {
    load();
    ensureSeedData();
    wireTabs();
    wireForms();
    setTab('dashboard');
    renderAll();
  };

  window.addEventListener('DOMContentLoaded', init);

  // PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
