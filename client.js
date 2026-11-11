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
        intro: '自动完成每日调试任务打卡。登录、自动运行开关、执行时间范围和高级登录参数都可在此页面直接配置。',
        loading: '正在加载…',
        loadFailed: '无法连接插件服务',
        retry: '重试',
        'section.account': '账号',
        'account.signedIn': '已获取登录信息',
        'account.signedOut': '尚未获取登录信息',
        'account.signedOutHint': '点击下方按钮，直接在默认浏览器中打开 OpenI 登录页。登录并让浏览器保存密码后，回到本页点击“自动获取登录信息”。',
        'account.username': '当前账号',
        'account.source': '凭据来源',
        'account.profile': 'Chrome Profile',
        'account.verified': '验证时间',
        'button.login': '前往默认浏览器登录',
        'button.refreshAccount': '重新获取登录信息',
        'button.signout': '退出登录',
        'button.afterLogin': '登录完成后自动获取',
        'button.discover': '自动获取登录信息',
        'button.advanced': '高级登录参数',
        'section.schedule': '自动打卡设置',
        'section.scheduleHint': '每天开始在设定时间范围内随机执行一次；保存设置会同步更新 Windows 定时任务。',
        'label.enabled': '启用自动打卡',
        'label.startTime': '开始时间',
        'label.endTime': '结束时间',
        'button.save': '保存设置',
        'button.installTask': '重新注册定时任务',
        'button.removeTask': '删除定时任务',
        'task.registered': '定时任务已注册',
        'task.absent': '定时任务未注册',
        'task.window': '任务窗口',
        'section.manage': '运行与日志',
        'button.dryRun': '演练（不修改数据）',
        'button.checkIn': '立即打卡',
        'button.refresh': '刷新状态',
        'button.log': '查看日志',
        'label.lastRun': '上次执行',
        'label.nextRun': '下次计划',
        'label.lastError': '最近错误',
        'advanced.hint': '仅在自动获取失败或需要手动提供凭据时使用。密码/Cookie 只写入 Harness 凭据记录，不写入配置文件。',
        'label.mode': '手动登录方式',
        'mode.auto': '自动获取 Chrome 登录信息',
        'mode.plain': '账号密码',
        'mode.cookie': 'Cookie',
        'label.username': 'OpenI 账号',
        'label.password': 'OpenI 密码',
        'label.cookie': 'OpenI Cookie',
        'label.chromeUserData': 'Chrome 用户数据目录（可选）',
        'label.chromeProfile': 'Chrome Profile（可选）',
        'button.signin': '验证并保存凭据',
        none: '无',
        working: '执行中…',
        success: '操作成功',
        failed: '操作失败',
        output: '输出',
        browserOpened: '已在默认浏览器中打开登录页',
        browserFailed: '未能打开默认浏览器，请手动访问 OpenI 登录页',
        'state.on': '已开启',
        'state.off': '已关闭',
      },
      en: {
        nav: 'OpenI check-in',
        title: 'OpenI daily check-in',
        intro: 'Complete the daily debug-task check-in automatically. Sign-in, the automatic-run switch, the time window and advanced credential options are all configured here.',
        loading: 'Loading…',
        loadFailed: 'Cannot reach the plugin service',
        retry: 'Retry',
        'section.account': 'Account',
        'account.signedIn': 'Sign-in information available',
        'account.signedOut': 'No sign-in information yet',
        'account.signedOutHint': 'Use the button below to open the OpenI login page directly in your default browser. After signing in and letting the browser save the password, return here and choose “Discover sign-in information”.',
        'account.username': 'Current account',
        'account.source': 'Credential source',
        'account.profile': 'Chrome profile',
        'account.verified': 'Verified at',
        'button.login': 'Open default browser to sign in',
        'button.refreshAccount': 'Discover sign-in information again',
        'button.signout': 'Sign out',
        'button.afterLogin': 'I signed in — discover credentials',
        'button.discover': 'Discover sign-in information',
        'button.advanced': 'Advanced sign-in options',
        'section.schedule': 'Automatic check-in',
        'section.scheduleHint': 'A random moment inside this window is chosen each day. Saving also updates the Windows scheduled task.',
        'label.enabled': 'Enable automatic check-in',
        'label.startTime': 'Start time',
        'label.endTime': 'End time',
        'button.save': 'Save settings',
        'button.installTask': 'Register scheduled task',
        'button.removeTask': 'Remove scheduled task',
        'task.registered': 'Scheduled task registered',
        'task.absent': 'Scheduled task not registered',
        'task.window': 'Task window',
        'section.manage': 'Runs and log',
        'button.dryRun': 'Dry run (no changes)',
        'button.checkIn': 'Check in now',
        'button.refresh': 'Refresh status',
        'button.log': 'View log',
        'label.lastRun': 'Last run',
        'label.nextRun': 'Next scheduled',
        'label.lastError': 'Last error',
        'advanced.hint': 'Use only if automatic discovery fails or manual credentials are needed. Passwords and cookies go into a Harness credential record, never a config file.',
        'label.mode': 'Manual sign-in method',
        'mode.auto': 'Discover Chrome credentials',
        'mode.plain': 'Username and password',
        'mode.cookie': 'Cookie',
        'label.username': 'OpenI username',
        'label.password': 'OpenI password',
        'label.cookie': 'OpenI cookie',
        'label.chromeUserData': 'Chrome user data directory (optional)',
        'label.chromeProfile': 'Chrome profile (optional)',
        'button.signin': 'Verify and save credentials',
        none: 'None',
        working: 'Working…',
        success: 'Success',
        failed: 'Failed',
        output: 'Output',
        browserOpened: 'Opened the login page in your default browser',
        browserFailed: 'Could not open your default browser; visit the OpenI login page manually',
        'state.on': 'On',
        'state.off': 'Off',
      },
    };

    const API = (() => {
      try { return new URL('api/openi-checkin', document.baseURI).pathname; } catch { return '/api/openi-checkin'; }
    })();

    async function api(action, body, timeout = 180000) {
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
.oci-page { max-width: 860px; color: var(--dsw-alias-label-primary); }
.oci-head { margin-bottom: 22px; }
.oci-title { margin: 0 0 8px; font-size: 22px; font-weight: 600; }
.oci-intro { margin: 0; color: var(--dsw-alias-label-secondary); line-height: 1.6; }
.oci-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.oci-card h2 { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
.oci-hint { margin: 0 0 16px; font-size: 13px; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.oci-account { display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.oci-avatar { width: 44px; height: 44px; flex: none; border-radius: 12px; display: grid; place-items: center; font-weight: 700; color: var(--dsw-alias-bg-base); background: var(--dsw-alias-brand-primary); }
.oci-identity { flex: 1 1 260px; min-width: 0; }
.oci-identity strong { display: block; font-size: 15px; margin-bottom: 3px; }
.oci-identity span { color: var(--dsw-alias-label-secondary); font-size: 13px; }
.oci-status { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 3px 9px; font-size: 12px; background: var(--dsw-alias-bg-layer-2); }
.oci-status.ok { color: var(--dsw-alias-state-success-primary); }
.oci-status.warn { color: var(--dsw-alias-state-warn-primary); }
.oci-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px 20px; margin: 16px 0 0; }
.oci-fact { font-size: 13px; color: var(--dsw-alias-label-secondary); }
.oci-fact b { color: var(--dsw-alias-label-primary); font-weight: 500; }
.oci-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 10px 0; }
.oci-row > label { min-width: 130px; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.oci-input, .oci-select { flex: 1 1 240px; min-width: 120px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; color-scheme: inherit; }
.oci-input:focus, .oci-select:focus { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.oci-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.oci-button { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); cursor: pointer; font: inherit; }
.oci-button:disabled { opacity: .55; cursor: not-allowed; }
.oci-button.primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-bg-base); }
.oci-button.danger { color: var(--dsw-alias-state-error-primary); }
.oci-button.link { border-color: transparent; background: transparent; padding-left: 0; color: var(--dsw-alias-brand-primary); }
.oci-switchrow { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 0; }
.oci-switchlabel { font-size: 14px; }
.oci-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.oci-switch > button { width: 44px; height: 24px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-state-idle-primary); position: relative; padding: 0; cursor: pointer; }
.oci-switch > button[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.oci-switch > button::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--dsw-alias-bg-base); transition: transform .15s ease; }
.oci-switch > button[aria-checked="true"]::after { transform: translateX(20px); }
.oci-times { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 620px) { .oci-times { grid-template-columns: 1fr; } }
.oci-time { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-base); }
.oci-time label { flex: 1; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.oci-time input { width: 120px; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; color-scheme: inherit; }
.oci-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; background: var(--dsw-alias-bg-layer-2); }
.oci-badge.ok { color: var(--dsw-alias-state-success-primary); }
.oci-badge.warn { color: var(--dsw-alias-state-warn-primary); }
.oci-message { margin-top: 14px; padding: 10px 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); font-size: 13px; white-space: pre-wrap; }
.oci-message.error { color: var(--dsw-alias-state-error-primary); }
.oci-output { margin-top: 12px; max-height: 320px; overflow: auto; padding: 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-secondary); font: 12px/1.5 ui-monospace, Consolas, monospace; white-space: pre-wrap; }
.oci-details { margin-top: 12px; border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 12px; }
.oci-details summary { cursor: pointer; color: var(--dsw-alias-label-secondary); font-size: 13px; }
`;

    function Button(props) {
      return h('button', {
        className: `oci-button${props.primary ? ' primary' : ''}${props.danger ? ' danger' : ''}${props.link ? ' link' : ''}`,
        disabled: props.disabled,
        onClick: props.onClick,
        type: 'button',
      }, props.children);
    }

    function Field(props) {
      return h('div', { className: 'oci-row' },
        h('label', { htmlFor: props.id }, props.label),
        h(props.type === 'select' ? 'select' : 'input', {
          id: props.id,
          className: props.type === 'select' ? 'oci-select' : 'oci-input',
          type: props.type === 'select' ? undefined : (props.type || 'text'),
          value: props.value,
          placeholder: props.placeholder,
          onChange: event => props.onChange(event.target.value),
        }, props.type === 'select' ? props.options.map(option =>
          h('option', { key: option.value, value: option.value }, option.label)) : undefined));
    }

    /** Ask the Host to launch the OS default browser; never use the in-app Browser tab. */
    async function openDefaultBrowser(t, notify) {
      try {
        await api('openLoginBrowser', {});
        notify(t('browserOpened'));
      } catch (error) {
        notify(`${t('browserFailed')}: ${error.message}`, true);
      }
    }

    function SettingsPage(props) {
      const ctx = props.ctx;
      const t = ctx.locale.bind(NS);
      const [status, setStatus] = useState(undefined);
      const [busy, setBusy] = useState('');
      const [message, setMessage] = useState('');
      const [isError, setIsError] = useState(false);
      const [output, setOutput] = useState('');
      const [mode, setMode] = useState('auto');
      const [username, setUsername] = useState('');
      const [password, setPassword] = useState('');
      const [cookie, setCookie] = useState('');
      const [chromeUserData, setChromeUserData] = useState('');
      const [chromeProfile, setChromeProfile] = useState('');
      const [enabled, setEnabled] = useState(false);
      const [startTime, setStartTime] = useState('09:00');
      const [endTime, setEndTime] = useState('10:00');

      const notify = useCallback((value, error = false) => {
        setMessage(value);
        setIsError(error);
      }, []);

      const applyStatus = useCallback(value => {
        setStatus(value);
        setEnabled(Boolean(value.enabled));
        setStartTime(value.startTime || '09:00');
        setEndTime(value.endTime || '10:00');
        if (value.chromeProfile) setChromeProfile(value.chromeProfile);
        if (value.username) setUsername(value.username);
      }, []);

      const load = useCallback(async () => {
        try { applyStatus(await api('status')); setMessage(''); setIsError(false); }
        catch (error) { notify(`${t('loadFailed')}: ${error.message}`, true); }
      }, [applyStatus, notify, t]);

      useEffect(() => { void load(); }, [load]);

      async function act(label, operation, showOutput) {
        setBusy(label);
        setMessage('');
        setIsError(false);
        if (showOutput) setOutput('');
        try {
          const result = await operation();
          if (showOutput && result?.output) setOutput(result.output);
          if (showOutput && result?.lines) setOutput(result.lines.join('\n') || t('none'));
          if (result?.check) setOutput(result.check);
          await load();
          setMessage(t('success'));
        } catch (error) {
          notify(`${t('failed')}: ${error.message}`, true);
        } finally { setBusy(''); }
      }

      const working = busy !== '';
      const signedIn = Boolean(status?.signedIn);
      const schedule = { enabled, startTime, endTime };
      const accountLabel = status?.username || (signedIn ? status?.source : null) || t('account.signedOut');
      const initial = String(accountLabel || '?').trim().charAt(0).toUpperCase() || '?';

      return h('div', { className: 'oci-page' },
        h('style', null, css),
        h('div', { className: 'oci-head' },
          h('h1', { className: 'oci-title' }, t('title')),
          h('p', { className: 'oci-intro' }, t('intro'))),
        status === undefined && h('div', { className: 'oci-card' }, t('loading')),

        status !== undefined && h('div', { className: 'oci-card' },
          h('h2', null, t('section.account')),
          h('div', { className: 'oci-account' },
            h('div', { className: 'oci-avatar', 'aria-hidden': 'true' }, initial),
            h('div', { className: 'oci-identity' },
              h('strong', null, accountLabel),
              h('span', null, signedIn ? t('account.signedIn') : t('account.signedOutHint'))),
            h('span', { className: `oci-status ${signedIn ? 'ok' : 'warn'}` }, signedIn ? t('state.on') : t('state.off'))),
          signedIn && h('div', { className: 'oci-grid' },
            h('div', { className: 'oci-fact' }, t('account.source'), ': ', h('b', null, status.source || t('none'))),
            h('div', { className: 'oci-fact' }, t('account.verified'), ': ', h('b', null, status.verifiedAt || t('none'))),
            h('div', { className: 'oci-fact' }, t('account.profile'), ': ', h('b', null, status.chromeProfile || t('none'))),
            h('div', { className: 'oci-fact' }, t('label.username'), ': ', h('b', null, status.username || t('none')))),
          h('div', { className: 'oci-actions' },
            !signedIn && h(Button, {
              primary: true, disabled: working,
              onClick: () => void openDefaultBrowser(t, notify),
            }, t('button.login')),
            !signedIn && h(Button, {
              disabled: working,
              onClick: () => act('discover', () => api('signIn', { mode: 'auto', chromeUserData, chromeProfile }), true),
            }, busy === 'discover' ? t('working') : t('button.afterLogin')),
            signedIn && h(Button, {
              disabled: working,
              onClick: () => act('discover', () => api('signIn', { mode: 'auto', chromeUserData, chromeProfile }), true),
            }, t('button.refreshAccount')),
            signedIn && h(Button, {
              danger: true, disabled: working,
              onClick: () => act('signout', () => api('signOut', {}), false),
            }, t('button.signout'))),
          h('details', { className: 'oci-details' },
            h('summary', null, t('button.advanced')),
            h('p', { className: 'oci-hint' }, t('advanced.hint')),
            h(Field, { id: 'oci-mode', label: t('label.mode'), type: 'select', value: mode, onChange: setMode,
              options: [
                { value: 'auto', label: t('mode.auto') },
                { value: 'plain', label: t('mode.plain') },
                { value: 'cookie', label: t('mode.cookie') },
              ] }),
            mode === 'auto' && h(Field, { id: 'oci-userdata', label: t('label.chromeUserData'), value: chromeUserData, onChange: setChromeUserData, placeholder: '%LOCALAPPDATA%\\Google\\Chrome\\User Data' }),
            mode === 'auto' && h(Field, { id: 'oci-profile', label: t('label.chromeProfile'), value: chromeProfile, onChange: setChromeProfile, placeholder: 'Profile 2' }),
            mode === 'plain' && h(Field, { id: 'oci-username', label: t('label.username'), value: username, onChange: setUsername }),
            mode === 'plain' && h(Field, { id: 'oci-password', label: t('label.password'), type: 'password', value: password, onChange: setPassword }),
            mode === 'cookie' && h(Field, { id: 'oci-cookie', label: t('label.cookie'), value: cookie, onChange: setCookie }),
            h('div', { className: 'oci-actions' },
              h(Button, {
                disabled: working,
                onClick: () => act('signin', () => api('signIn', { mode, username, password, cookie, chromeUserData, chromeProfile }), true),
              }, t('button.signin'))))),

        status !== undefined && h('div', { className: 'oci-card' },
          h('h2', null, t('section.schedule')),
          h('p', { className: 'oci-hint' }, t('section.scheduleHint')),
          h('div', { className: 'oci-switchrow' },
            h('span', null,
              h('div', { className: 'oci-switchlabel' }, t('label.enabled')),
              h('div', { className: 'oci-fact' }, enabled ? t('state.on') : t('state.off'))),
            h('span', { className: 'oci-switch' },
              h('button', {
                type: 'button', role: 'switch', 'aria-checked': String(enabled),
                'aria-label': t('label.enabled'),
                onClick: () => setEnabled(value => !value),
              }))),
          h('div', { className: 'oci-times' },
            h('div', { className: 'oci-time' },
              h('label', { htmlFor: 'oci-start' }, t('label.startTime')),
              h('input', { id: 'oci-start', type: 'time', value: startTime, onChange: event => setStartTime(event.target.value) })),
            h('div', { className: 'oci-time' },
              h('label', { htmlFor: 'oci-end' }, t('label.endTime')),
              h('input', { id: 'oci-end', type: 'time', value: endTime, onChange: event => setEndTime(event.target.value) }))),
          h('div', { className: 'oci-grid' },
            h('div', { className: 'oci-fact' }, t('task.registered'), ': ',
              h('span', { className: `oci-badge ${status.taskRegistered ? 'ok' : 'warn'}` },
                status.taskRegistered ? t('success') : t('task.absent'))),
            h('div', { className: 'oci-fact' }, t('task.window'), ': ', h('b', null, status.taskWindow || t('none'))),
            h('div', { className: 'oci-fact' }, t('label.nextRun'), ': ', h('b', null, status.nextScheduledAt || t('none')))),
          h('div', { className: 'oci-actions' },
            h(Button, {
              primary: true, disabled: working,
              onClick: () => act('save', () => api('saveSettings', schedule), false),
            }, t('button.save')),
            h(Button, {
              disabled: working || !signedIn,
              onClick: () => act('install', () => api('installTask', schedule), false),
            }, t('button.installTask')),
            h(Button, {
              danger: true, disabled: working,
              onClick: () => act('remove', () => api('removeTask', {}), false),
            }, t('button.removeTask')))),

        status !== undefined && h('div', { className: 'oci-card' },
          h('h2', null, t('section.manage')),
          h('div', { className: 'oci-grid' },
            h('div', { className: 'oci-fact' }, t('label.lastRun'), ': ', h('b', null, status.lastRunAt || t('none'))),
            h('div', { className: 'oci-fact' }, t('label.lastError'), ': ', h('b', null, status.lastError || t('none')))),
          h('div', { className: 'oci-actions' },
            h(Button, {
              disabled: working || !signedIn,
              onClick: () => act('dry', () => api('dryRun', {}, 180000), true),
            }, busy === 'dry' ? t('working') : t('button.dryRun')),
            h(Button, {
              disabled: working || !signedIn,
              onClick: () => act('checkin', () => api('checkIn', {}, 1500000), true),
            }, busy === 'checkin' ? t('working') : t('button.checkIn')),
            h(Button, { disabled: working, onClick: () => act('log', () => api('log', { limit: 100 }), true) }, t('button.log')),
            h(Button, { disabled: working, onClick: () => void load() }, t('button.refresh')))),

        message && h('div', { className: `oci-message${isError ? ' error' : ''}` }, message),
        output && h('div', null,
          h('p', { className: 'oci-hint' }, t('output')),
          h('pre', { className: 'oci-output' }, output)));
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
