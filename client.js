window.__ModuleLoader__.load({
  id: 'dsh-openi-checkin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;
    const NS = 'settings.openiCheckin';

    const DICT = {
      zh: {
        nav: 'OpenI 打卡',
        title: 'OpenI 每日打卡',
        intro: '支持多账号打卡：每个账号拥有独立的随机执行时间，均落在下面的全局时间范围内。',
        loading: '正在加载…',
        loadFailed: '无法连接插件服务',
        'section.global': '全局设置',
        'section.globalHint': '自动打卡的总开关与时间范围。每个账号可在该范围内单独设置自己的随机执行窗口。',
        'label.enabled': '启用自动打卡',
        'label.window': '全局时间范围',
        'label.startTime': '开始',
        'label.endTime': '结束',
        'button.save': '保存设置',
        'button.refresh': '刷新状态',
        'section.accounts': '账号',
        'accounts.empty': '还没有账号。先在默认浏览器中登录 OpenI，然后点击下方“添加账号”。',
        'account.notSignedIn': '未登录',
        'account.signedIn': '已登录',
        'account.window': '执行时间',
        'account.next': '下次执行',
        'account.task': '定时任务',
        'account.lastRun': '上次执行',
        'account.lastError': '最近错误',
        'account.state': '任务状态',
        'button.relogin': '重新获取登录信息',
        'button.dryRun': '演练',
        'button.checkIn': '立即打卡',
        'button.log': '日志',
        'button.remove': '删除账号',
        'button.removeConfirm': '确认删除？',
        'button.login': '前往默认浏览器登录',
        'section.add': '添加账号',
        'section.addHint': '先在默认浏览器登录 OpenI 并让浏览器保存密码，再点“自动获取登录信息”；也可手动填写账号密码或 Cookie。',
        'label.mode': '凭据方式',
        'mode.auto': '自动获取 Chrome 登录信息',
        'mode.plain': '账号密码',
        'mode.cookie': 'Cookie',
        'label.label': '账号备注（可选）',
        'label.username': 'OpenI 账号',
        'label.password': 'OpenI 密码',
        'label.cookie': 'OpenI Cookie',
        'label.chromeUserData': 'Chrome 用户数据目录（可选）',
        'label.chromeProfile': 'Chrome Profile（可选）',
        'button.add': '添加账号',
        'button.scanChrome': '自动获取登录信息',
        'button.loginAgain': '前往默认浏览器登录',
        'label.chromeAccount': 'Chrome 中的 OpenI 账号',
        'chrome.newest': '最近使用的一个（默认）',
        'chrome.pickHint': 'Chrome 里保存了多个 OpenI 账号，请选择要添加的那一个。若刚登录的账号没出现在列表里，点「自动获取登录信息」重新扫描。',
        'chrome.found': '已找到保存的账号',
        'chrome.none': 'Chrome 中未找到已保存的 OpenI 账号，请先在默认浏览器登录并保存密码',
        'nextRun.task': '来自定时任务',
        'nextRun.session': '仅本次会话',
        'browserOpened': '已在默认浏览器中打开登录页',
        'browserFailed': '未能打开默认浏览器，请手动访问 OpenI 登录页',
        none: '无',
        working: '执行中…',
        success: '操作成功',
        failed: '操作失败',
        output: '输出',
        advanced: '高级选项',
      },
      en: {
        nav: 'OpenI check-in',
        title: 'OpenI daily check-in',
        intro: 'Multiple accounts, each with its own random execution time inside the global window below.',
        loading: 'Loading…',
        loadFailed: 'Cannot reach the plugin service',
        'section.global': 'Global settings',
        'section.globalHint': 'The master switch and the time range. Each account can narrow its own random window inside this range.',
        'label.enabled': 'Enable automatic check-in',
        'label.window': 'Global time range',
        'label.startTime': 'Start',
        'label.endTime': 'End',
        'button.save': 'Save settings',
        'button.refresh': 'Refresh status',
        'section.accounts': 'Accounts',
        'accounts.empty': 'No accounts yet. Sign in to OpenI in your default browser, then use “Add account” below.',
        'account.notSignedIn': 'Not signed in',
        'account.signedIn': 'Signed in',
        'account.window': 'Execution time',
        'account.next': 'Next run',
        'account.task': 'Scheduled task',
        'account.lastRun': 'Last run',
        'account.lastError': 'Last error',
        'account.state': 'Task state',
        'button.relogin': 'Discover sign-in again',
        'button.dryRun': 'Dry run',
        'button.checkIn': 'Check in now',
        'button.log': 'Log',
        'button.remove': 'Remove account',
        'button.removeConfirm': 'Confirm removal?',
        'button.login': 'Open default browser to sign in',
        'section.add': 'Add account',
        'section.addHint': 'Sign in to OpenI in your default browser and let it save the password, then choose “Discover sign-in information”. Manual password or cookie works too.',
        'label.mode': 'Credential method',
        'mode.auto': 'Discover Chrome credentials',
        'mode.plain': 'Username and password',
        'mode.cookie': 'Cookie',
        'label.label': 'Account note (optional)',
        'label.username': 'OpenI username',
        'label.password': 'OpenI password',
        'label.cookie': 'OpenI cookie',
        'label.chromeUserData': 'Chrome user data directory (optional)',
        'label.chromeProfile': 'Chrome profile (optional)',
        'button.add': 'Add account',
        'button.scanChrome': 'Discover sign-in information',
        'button.loginAgain': 'Open default browser to sign in',
        'label.chromeAccount': 'OpenI account saved in Chrome',
        'chrome.newest': 'Most recently used (default)',
        'chrome.pickHint': 'Chrome holds more than one saved OpenI account — choose the one to add. If the account you just signed in with is missing, choose “Discover sign-in information” again.',
        'chrome.found': 'Saved accounts found',
        'chrome.none': 'No saved OpenI account was found in Chrome. Sign in once in your default browser and let it save the password.',
        'nextRun.task': 'from scheduled task',
        'nextRun.session': 'this session only',
        'browserOpened': 'Opened the login page in your default browser',
        'browserFailed': 'Could not open your default browser; visit the OpenI login page manually',
        none: 'None',
        working: 'Working…',
        success: 'Success',
        failed: 'Failed',
        output: 'Output',
        advanced: 'Advanced options',
      },
    };

    const API = (() => {
      try { return new URL('api/openi-checkin', document.baseURI).pathname; } catch { return '/api/openi-checkin'; }
    })();

    async function api(action, body, timeout = 300000) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(`${API}/${action}`, {
          method: body === undefined ? 'GET' : 'POST',
          headers: body === undefined ? {} : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctrl.signal,
          credentials: 'same-origin',
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${res.status}`);
        return payload.result;
      } finally { clearTimeout(timer); }
    }

    const css = `
.oci-page { max-width: 900px; color: var(--dsw-alias-label-primary); }
.oci-head { margin-bottom: 22px; }
.oci-title { margin: 0 0 8px; font-size: 22px; font-weight: 600; }
.oci-intro { margin: 0; color: var(--dsw-alias-label-secondary); line-height: 1.6; }
.oci-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.oci-card h2 { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
.oci-hint { margin: 0 0 16px; font-size: 13px; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.oci-switchrow { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 6px 0 12px; }
.oci-switchlabel { font-size: 14px; }
.oci-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.oci-switch > button { width: 44px; height: 24px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-state-idle-primary); position: relative; padding: 0; cursor: pointer; }
.oci-switch > button[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.oci-switch > button::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--dsw-alias-bg-base); transition: transform .15s ease; }
.oci-switch > button[aria-checked="true"]::after { transform: translateX(20px); }
.oci-window { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.oci-window label { color: var(--dsw-alias-label-secondary); font-size: 13px; }
.oci-window input[type="time"] { padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; color-scheme: inherit; }
.oci-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.oci-button { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); cursor: pointer; font: inherit; }
.oci-button:disabled { opacity: .55; cursor: not-allowed; }
.oci-button.primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
.oci-button.danger { color: var(--dsw-alias-state-error-primary); }
.oci-acct { border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 16px; margin-bottom: 12px; background: var(--dsw-alias-bg-base); }
.oci-acct-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.oci-avatar { width: 40px; height: 40px; flex: none; border-radius: 10px; display: grid; place-items: center; font-weight: 700; color: var(--dsw-alias-bg-base); background: var(--dsw-alias-brand-primary); }
.oci-acct-id { flex: 1 1 220px; min-width: 0; }
.oci-acct-id strong { display: block; font-size: 15px; }
.oci-acct-id span { color: var(--dsw-alias-label-secondary); font-size: 12.5px; }
.oci-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.oci-badge.ok { color: var(--dsw-alias-state-success-primary); }
.oci-badge.warn { color: var(--dsw-alias-state-warn-primary); }
.oci-badge.err { color: var(--dsw-alias-state-error-primary); }
.oci-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px 20px; margin: 12px 0 0; }
.oci-fact { font-size: 13px; color: var(--dsw-alias-label-secondary); }
.oci-fact b { color: var(--dsw-alias-label-primary); font-weight: 500; }
.oci-note { color: var(--dsw-alias-label-secondary); font-size: 12px; margin-left: 6px; }
.oci-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 9px 0; }
.oci-row > label { min-width: 130px; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.oci-input, .oci-select { flex: 1 1 240px; min-width: 120px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; color-scheme: inherit; }
.oci-input:focus, .oci-select:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.oci-message { margin-top: 14px; padding: 10px 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); font-size: 13px; white-space: pre-wrap; }
.oci-message.error { color: var(--dsw-alias-state-error-primary); }
.oci-output { margin-top: 12px; max-height: 300px; overflow: auto; padding: 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font: 12px/1.5 ui-monospace, Consolas, monospace; white-space: pre-wrap; }
.oci-details { margin-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 12px; }
.oci-details summary { cursor: pointer; color: var(--dsw-alias-label-secondary); font-size: 13px; }
`;

    function formatTime(value) {
      try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);
        return d.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
      } catch { return String(value); }
    }

    function Button(props) {
      return h('button', {
        className: `oci-button${props.primary ? ' primary' : ''}${props.danger ? ' danger' : ''}`,
        disabled: props.disabled,
        onClick: props.onClick,
        type: 'button',
      }, props.children);
    }

    function Field(props) {
      const control = props.type === 'select'
        ? h('select', {
          id: props.id, className: 'oci-select', value: props.value,
          onChange: event => props.onChange(event.target.value),
        }, props.options.map(option => h('option', { key: option.value, value: option.value }, option.label)))
        : h('input', {
          id: props.id, className: 'oci-input', type: props.type || 'text',
          value: props.value, placeholder: props.placeholder,
          onChange: event => props.onChange(event.target.value),
        });
      return h('div', { className: 'oci-row' }, h('label', { htmlFor: props.id }, props.label), control);
    }

    function Switch(props) {
      return h('span', { className: 'oci-switch' },
        h('button', {
          type: 'button', role: 'switch', 'aria-checked': String(Boolean(props.checked)),
          'aria-label': props.label, disabled: props.disabled,
          onClick: props.onChange,
        }));
    }

    async function openDefaultBrowser(t, notify) {
      try { await api('openLoginBrowser', {}); notify(t('browserOpened')); }
      catch (error) { notify(`${t('browserFailed')}: ${error.message}`, true); }
    }

    function AccountCard(props) {
      const { t, account, draft, setDraft, busy, working, onAct, onRemove, output } = props;
      const d = draft ?? { enabled: account.enabled, startTime: account.startTime, endTime: account.endTime };
      const update = patch => setDraft({ ...d, ...patch });
      const signedIn = Boolean(account.signedIn);
      const initial = String(account.label || account.username || '?').trim().charAt(0).toUpperCase() || '?';
      const nextText = account.nextScheduledAt ? formatTime(account.nextScheduledAt) : t('none');
      return h('div', { className: 'oci-acct' },
        h('div', { className: 'oci-acct-head' },
          h('div', { className: 'oci-avatar', 'aria-hidden': 'true' }, initial),
          h('div', { className: 'oci-acct-id' },
            h('strong', null, account.label || account.username || account.id),
            h('span', null, `${account.username || account.id} · ${signedIn ? t('account.signedIn') : t('account.notSignedIn')}`)),
          h('span', { className: `oci-badge ${signedIn ? 'ok' : 'warn'}` }, signedIn ? account.source || t('account.signedIn') : t('account.notSignedIn')),
          h('span', { className: `oci-badge ${account.taskRegistered ? 'ok' : 'warn'}` }, account.taskRegistered ? t('success') : t('task.absent')),
          h(Switch, {
            checked: d.enabled, label: t('label.enabled'),
            disabled: working, onChange: () => update({ enabled: !d.enabled }),
          })),
        h('div', { className: 'oci-grid' },
          h('div', { className: 'oci-fact' }, `${t('account.window')}: `,
            h('span', { className: 'oci-window' },
              h('label', { htmlFor: `st-${account.id}` }, t('label.startTime')),
              h('input', { id: `st-${account.id}`, type: 'time', value: d.startTime, onChange: e => update({ startTime: e.target.value }) }),
              h('label', { htmlFor: `et-${account.id}` }, t('label.endTime')),
              h('input', { id: `et-${account.id}`, type: 'time', value: d.endTime, onChange: e => update({ endTime: e.target.value }) }))),
          h('div', { className: 'oci-fact' }, `${t('account.next')}: `, h('b', null, nextText),
            account.nextScheduledAt && account.nextScheduledSource
              ? h('span', { className: 'oci-note' }, t(account.nextScheduledSource === 'scheduled-task' ? 'nextRun.task' : 'nextRun.session'))
              : null),
          h('div', { className: 'oci-fact' }, `${t('account.state')}: `, h('b', null, account.taskState || t('none'))),
          h('div', { className: 'oci-fact' }, `${t('account.lastRun')}: `, h('b', null, account.lastRunAt ? formatTime(account.lastRunAt) : t('none'))),
          account.lastError ? h('div', { className: 'oci-fact' }, `${t('account.lastError')}: `, h('b', null, account.lastError)) : null),
        h('div', { className: 'oci-actions' },
          h(Button, { disabled: working, onClick: () => onAct('relogin', account.id, () => api('signIn', { accountId: account.id, mode: 'auto' }), true) },
            busy === `relogin:${account.id}` ? t('working') : t('button.relogin')),
          h(Button, { disabled: working || !signedIn, onClick: () => onAct('dry', account.id, () => api('dryRun', { accountId: account.id }, 900000), true) },
            busy === `dry:${account.id}` ? t('working') : t('button.dryRun')),
          h(Button, { disabled: working || !signedIn, onClick: () => onAct('check', account.id, () => api('checkIn', { accountId: account.id }, 1500000), true) },
            busy === `check:${account.id}` ? t('working') : t('button.checkIn')),
          h(Button, { disabled: working, onClick: () => onAct('log', account.id, () => api('log', { accountId: account.id, limit: 120 }), true) }, t('button.log')),
          h(Button, { danger: true, disabled: working, onClick: () => onRemove(account.id) }, t('button.remove'))),
        output ? h('pre', { className: 'oci-output' }, output) : null);
    }

    function SettingsPage(props) {
      const ctx = props.ctx;
      const t = ctx.locale.bind(NS);
      const [status, setStatus] = useState(undefined);
      const [busy, setBusy] = useState('');
      const [message, setMessage] = useState('');
      const [isError, setIsError] = useState(false);
      const [outputs, setOutputs] = useState({});
      const [drafts, setDrafts] = useState({});
      const [enabled, setEnabled] = useState(false);
      const [startTime, setStartTime] = useState('09:00');
      const [endTime, setEndTime] = useState('10:00');
      const [confirmId, setConfirmId] = useState('');
      const [form, setForm] = useState({ mode: 'auto', label: '', username: '', password: '', cookie: '', chromeUserData: '', chromeProfile: '' });
      const [chromeAccounts, setChromeAccounts] = useState([]);

      const notify = useCallback((value, error = false) => { setMessage(value); setIsError(error); }, []);

      const load = useCallback(async () => {
        try {
          const value = await api('status');
          setStatus(value);
          setEnabled(Boolean(value.enabled));
          setStartTime(value.startTime);
          setEndTime(value.endTime);
          const next = {};
          for (const account of value.accounts) next[account.id] = { enabled: account.enabled, startTime: account.startTime, endTime: account.endTime };
          setDrafts(next);
          setMessage('');
          setIsError(false);
        } catch (error) { notify(`${t('loadFailed')}: ${error.message}`, true); }
      }, [notify, t]);

      useEffect(() => { void load(); }, [load]);

      const run = useCallback(async (label, operation, outputFor) => {
        setBusy(label);
        setMessage('');
        setIsError(false);
        try {
          const result = await operation();
          if (outputFor) {
            const text = result?.output ?? (Array.isArray(result?.lines) ? result.lines.join('\n') : result?.check);
            if (text) setOutputs(prev => ({ ...prev, [outputFor]: text }));
          }
          await load();
          setMessage(t('success'));
        } catch (error) { notify(`${t('failed')}: ${error.message}`, true); }
        finally { setBusy(''); }
      }, [load, notify, t]);

      async function onAct(kind, accountId, operation, showOutput) {
        await run(`${kind}:${accountId}`, operation, showOutput ? accountId : null);
      }

      async function onRemove(accountId) {
        if (confirmId !== accountId) { setConfirmId(accountId); notify(t('button.removeConfirm')); return; }
        setConfirmId('');
        await run(`remove:${accountId}`, () => api('removeAccount', { accountId }), null);
      }

      async function saveAll() {
        const accounts = Object.entries(drafts).map(([id, value]) => ({ id, ...value }));
        await run('save', () => api('saveSettings', { enabled, startTime, endTime, accounts }), null);
      }

      async function addAccount() {
        await run('add', () => api('addAccount', form), null);
      }

      async function scanChrome() {
        setBusy('scan');
        setMessage('');
        setIsError(false);
        try {
          const result = await api('chromeAccounts', { chromeProfile: form.chromeProfile, chromeUserData: form.chromeUserData });
          const list = Array.isArray(result?.accounts) ? result.accounts : [];
          setChromeAccounts(list);
          if (list.length > 0) {
            const keep = list.some(item => item.username === form.username) ? form.username : '';
            setForm(prev => ({ ...prev, username: keep }));
            notify(`${t('chrome.found')}: ${list.map(item => item.username).join(', ')}`);
          } else {
            notify(t('chrome.none'), true);
          }
        } catch (error) { notify(`${t('failed')}: ${error.message}`, true); }
        finally { setBusy(''); }
      }

      const working = busy !== '';
      const accounts = status?.accounts ?? [];

      return h('div', { className: 'oci-page' },
        h('style', null, css),
        h('div', { className: 'oci-head' },
          h('h1', { className: 'oci-title' }, t('title')),
          h('p', { className: 'oci-intro' }, t('intro'))),
        status === undefined && h('div', { className: 'oci-card' }, t('loading')),

        status !== undefined && h('div', { className: 'oci-card' },
          h('h2', null, t('section.global')),
          h('p', { className: 'oci-hint' }, t('section.globalHint')),
          h('div', { className: 'oci-switchrow' },
            h('span', null, h('div', { className: 'oci-switchlabel' }, t('label.enabled'))),
            h(Switch, { checked: enabled, label: t('label.enabled'), disabled: working, onChange: () => setEnabled(v => !v) })),
          h('div', { className: 'oci-window' },
            h('label', { htmlFor: 'global-start' }, t('label.window')),
            h('input', { id: 'global-start', type: 'time', value: startTime, onChange: e => setStartTime(e.target.value) }),
            h('label', { htmlFor: 'global-end' }, '–'),
            h('input', { id: 'global-end', type: 'time', value: endTime, onChange: e => setEndTime(e.target.value) })),
          h('div', { className: 'oci-actions' },
            h(Button, { primary: true, disabled: working, onClick: saveAll }, busy === 'save' ? t('working') : t('button.save')),
            h(Button, { disabled: working, onClick: () => void load() }, t('button.refresh')))),

        status !== undefined && h('div', { className: 'oci-card' },
          h('h2', null, t('section.accounts')),
          accounts.length === 0 ? h('p', { className: 'oci-hint' }, t('accounts.empty')) : null,
          accounts.map(account => h(AccountCard, {
            key: account.id, t, account,
            draft: drafts[account.id],
            setDraft: value => setDrafts(prev => ({ ...prev, [account.id]: value })),
            busy, working,
            onAct, onRemove,
            output: outputs[account.id],
          }))),

        status !== undefined && h('div', { className: 'oci-card' },
          h('h2', null, t('section.add')),
          h('p', { className: 'oci-hint' }, t('section.addHint')),
          h(Field, { id: 'add-mode', label: t('label.mode'), type: 'select', value: form.mode,
            onChange: value => setForm({ ...form, mode: value }),
            options: [
              { value: 'auto', label: t('mode.auto') },
              { value: 'plain', label: t('mode.plain') },
              { value: 'cookie', label: t('mode.cookie') },
            ] }),
          h(Field, { id: 'add-label', label: t('label.label'), value: form.label, onChange: value => setForm({ ...form, label: value }) }),
          form.mode === 'auto' && h('div', { className: 'oci-actions' },
            h(Button, { disabled: working, onClick: scanChrome }, busy === 'scan' ? t('working') : t('button.scanChrome')),
            h(Button, { disabled: working, onClick: () => void openDefaultBrowser(t, notify) }, t('button.loginAgain'))),
          form.mode === 'auto' && chromeAccounts.length > 0 && h(Field, {
            id: 'add-chrome-user', label: t('label.chromeAccount'), type: 'select', value: form.username,
            onChange: value => setForm({ ...form, username: value }),
            options: [{ value: '', label: t('chrome.newest') }, ...chromeAccounts.map(item => ({
              value: item.username,
              label: `${item.username}${item.chromeProfile ? ` · ${item.chromeProfile}` : ''}`,
            }))],
          }),
          form.mode === 'auto' && chromeAccounts.length > 0 && h('p', { className: 'oci-hint' }, t('chrome.pickHint')),
          form.mode === 'auto' && h('details', { className: 'oci-details' },
            h('summary', null, t('advanced')),
            h(Field, { id: 'add-userdata', label: t('label.chromeUserData'), value: form.chromeUserData, onChange: value => setForm({ ...form, chromeUserData: value }), placeholder: '%LOCALAPPDATA%\\Google\\Chrome\\User Data' }),
            h(Field, { id: 'add-profile', label: t('label.chromeProfile'), value: form.chromeProfile, onChange: value => setForm({ ...form, chromeProfile: value }), placeholder: 'Profile 2' })),
          form.mode === 'plain' && h(Field, { id: 'add-username', label: t('label.username'), value: form.username, onChange: value => setForm({ ...form, username: value }) }),
          form.mode === 'plain' && h(Field, { id: 'add-password', label: t('label.password'), type: 'password', value: form.password, onChange: value => setForm({ ...form, password: value }) }),
          form.mode === 'cookie' && h(Field, { id: 'add-cookie', label: t('label.cookie'), value: form.cookie, onChange: value => setForm({ ...form, cookie: value }) }),
          h('div', { className: 'oci-actions' },
            h(Button, { primary: true, disabled: working, onClick: addAccount }, busy === 'add' ? t('working') : t('button.add')))),

        message && h('div', { className: `oci-message${isError ? ' error' : ''}` }, message));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: DICT.zh, en: DICT.en }), 'openi-checkin: dictionaries');
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'openi-checkin',
          order: 60,
          label: () => ctx.locale.bind(NS)('nav'),
          locale: NS,
        }, props => h(SettingsPage, { ...props, ctx })));
      },
    };
  },
});
