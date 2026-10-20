(() => {
  'use strict';
  const CONSENT_VERSION = 'github-actions-v1';
  const E = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const knownErrors = {
    unauthorized: '登录已过期，请重新登录训练空间。',
    consent_required: '请先阅读并勾选云端同步授权。',
    disabled: '云端同步尚未启用。',
    session_missing: '尚未完成佳明云端登录，请先完成登录设置。',
    session_expired: '佳明登录已过期，需要重新登录。',
    auth_required: '佳明需要重新登录，已停止继续请求。',
    garmin_auth_required: '佳明需要重新登录，已停止继续请求。',
    rate_limited: '佳明暂时限制了请求，请稍后再试。',
    garmin_rate_limited: '佳明暂时限制了请求，已停止本轮同步，请稍后再试。',
    partial_data: '本次仅取得部分资料，尚未取得的记录不会视为休息日。',
    session_conflict: '佳明会话已有更新，本次操作未覆盖新会话。请刷新连接状态。',
    not_configured: '云端同步后台尚未开通，现有记录仍可查看。'
  };
  let dialog, state = null, busy = false, notice = '', oneTime = null, timer = null, previousFocus = null, generation = 0;
  const needsLogin = value => String(value?.status || '').toLowerCase() === 'needs_login' || ['auth_required','garmin_auth_required','session_expired','authentication_failed','login_required','reauth_required'].includes(String(value?.code || '').toLowerCase());

  function date(value) {
    const parsed = new Date(value);
    return value && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('zh-CN', {timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}) : '尚无';
  }
  function statusView() {
    if (!state) return {title:'尚未读取状态', text:'打开设置后查看云端连接情况。', tone:'pending'};
    const code = String(state.code || '').toLowerCase();
    if (needsLogin(state)) return {title:'需要重新登录佳明', text:'已停止继续请求。请在云端登录入口由本人重新登录。', tone:'attention'};
    if (!state.enabled) return {title:state.status === 'paused' || state.paused ? '云端同步已暂停' : '云端同步尚未开通', text:'历史训练与健康记录仍保留。完成设置后才能从云端自动读取佳明。', tone:'pending'};
    if (!state.sessionPresent) return {title:'等待本人登录佳明', text:'授权已开启，尚未取得云端佳明会话。完成本人登录后仍需验证一次实际同步。', tone:'pending'};
    if (state.status === 'paused' || state.paused) return {title:'云端同步已暂停', text:'恢复后，将由下一次定时任务继续处理。', tone:'pending'};
    if (state.status === 'running' || state.hasActiveRun) return {title:'正在同步佳明', text:'请稍后刷新记录。已有资料可继续查看。', tone:'pending'};
    if (code === 'partial_data') return {title:'本次仅同步部分资料', text:knownErrors.partial_data, tone:'attention'};
    if (state.status === 'failed' || knownErrors[code]) return {title:'本次同步未完成', text:knownErrors[code] || '已有资料保留。请检查云端任务的连接状态后重试。', tone:'attention'};
    if (state.lastSuccessAt && Number.isFinite(Date.parse(state.lastSuccessAt))) return {title:'已取得云端同步结果', text:`最近一次成功：${date(state.lastSuccessAt)}（北京时间）。`, tone:'success'};
    return {title:'等待首次实际同步', text:'已保存云端佳明会话，尚无成功读取数据的记录。', tone:'pending'};
  }
  async function call(action, fields = {}) {
    const client = window.WildCloud?.client, config = window.JinshanConfig || {};
    if (!client || !config.url || !config.key) throw Error('云端登录组件尚未就绪，请稍后再试。');
    const {data, error} = await client.auth.getSession();
    if (error || !data.session?.access_token) throw Error('请先登录自己的云端训练空间。');
    const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 20000);
    try {
      const response = await fetch(`${config.url.replace(/\/$/, '')}/functions/v1/garmin-sync-admin`, {
        method:'POST', signal:abort.signal,
        headers:{Authorization:`Bearer ${data.session.access_token}`, apikey:config.key, 'Content-Type':'application/json'},
        body:JSON.stringify({action, ...fields})
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code = String(typeof result.error === 'string' ? result.error : result.error?.code || result.code || '').toLowerCase();
        throw Error(knownErrors[code] || (response.status === 401 ? knownErrors.unauthorized : response.status === 404 ? knownErrors.not_configured : '云端操作未完成，现有资料仍保留。'));
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('连接超时，请稍后重试。现有资料仍保留。');
      if (error instanceof TypeError) throw Error('暂时无法连接云端同步后台，请稍后重试。');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function secretField(label, value, concealed = false) {
    const row = document.createElement('div');
    row.className = 'garmin-cloud-secret';
    const fieldLabel = document.createElement('label'), input = document.createElement('input');
    fieldLabel.textContent = label; input.value = value; input.readOnly = true;
    input.type = concealed ? 'password' : 'text'; input.autocomplete = 'off'; input.spellcheck = false;
    fieldLabel.append(input); row.append(fieldLabel);
    const controls = document.createElement('div'); controls.className = 'garmin-cloud-secret-actions';
    if (concealed) {
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = '显示';
      toggle.onclick = () => { input.type = input.type === 'password' ? 'text' : 'password'; toggle.textContent = input.type === 'password' ? '显示' : '隐藏'; };
      controls.append(toggle);
    }
    const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = '复制';
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(value); copy.textContent = '已复制'; }
      catch { input.type = 'text'; input.focus(); input.select(); copy.textContent = '请长按复制'; }
    };
    controls.append(copy); row.append(controls); return row;
  }
  function render() {
    if (!dialog) return;
    const view = statusView(), isPaused = state?.status === 'paused' || state?.paused;
    dialog.innerHTML = `<div class="garmin-cloud-head"><div><small>JINSHAN JINBU · CLOUD</small><h2 id="garmin-cloud-title">佳明云端同步</h2></div><button type="button" data-gc-close aria-label="关闭云端佳明设置">✕</button></div>
      <div class="garmin-cloud-body">
        <section class="garmin-cloud-status" data-tone="${E(view.tone)}"><span>连接状态</span><h3>${E(view.title)}</h3><p>${E(view.text)}</p><dl><div><dt>最近执行</dt><dd>${E(date(state?.lastRunAt))}</dd></div><div><dt>最近请求</dt><dd>${E(date(state?.requestedAt))}</dd></div></dl></section>
        <p class="garmin-cloud-notice" role="status" aria-live="polite">${E(notice)}</p>
        <div class="garmin-cloud-actions"><button type="button" data-gc-action="status">刷新状态</button><button type="button" data-gc-action="request" ${!state?.enabled || !state?.sessionPresent || isPaused || needsLogin(state) ? 'disabled' : ''}>请求同步近期记录</button>${state?.enabled || isPaused ? `<button type="button" data-gc-action="${isPaused?'resume':'pause'}">${isPaused?'恢复自动同步':'暂停自动同步'}</button>` : ''}</div>
        <p class="garmin-cloud-schedule">每天北京时间 06:17、12:17、18:17、22:17 计划同步，平台排队时可能延迟。网页请求会进入队列，等待任务执行。</p>
        <section class="garmin-cloud-consent"><h3>本人授权</h3><p>云端定时任务将在你的 GitHub 私有仓库运行，读取佳明中国区的训练与健康数据。同步结果保存在自己的 Supabase 私人训练空间；佳明会话仅以密文保存。</p><p>授权只负责开启连接，不代表已完成佳明登录或已同步成功。账号、密码和验证码由本人在云端登录入口输入，请勿填入本页面或聊天。</p><label class="garmin-cloud-check"><input type="checkbox" id="garmin-cloud-consent"><span>我同意由 GitHub 私有定时任务处理我的佳明会话与训练、健康数据，并将结果保存到我的私人云端空间。</span></label><button type="button" class="garmin-cloud-primary" data-gc-action="authorize" disabled>${state?.enabled?'重新生成同步授权':'同意并开通云端同步'}</button></section>
        <section id="garmin-cloud-credentials" class="garmin-cloud-credentials" hidden></section>
        ${state?.enabled || state?.sessionPresent || isPaused ? '<section class="garmin-cloud-revoke"><h3>解除连接</h3><p>解除后停止云端佳明同步，并清除保存的佳明会话。已同步的训练与健康记录继续保留。</p><button type="button" data-gc-action="revoke">解除云端佳明授权</button></section>' : ''}
      </div>`;
    dialog.querySelector('[data-gc-close]').onclick = close;
    dialog.querySelector('#garmin-cloud-consent').onchange = event => { dialog.querySelector('[data-gc-action="authorize"]').disabled = busy || !event.target.checked; };
    dialog.querySelectorAll('[data-gc-action]').forEach(button => { button.onclick = () => perform(button.dataset.gcAction); });
    if (busy) dialog.querySelectorAll('button,input').forEach(element => { if (!element.hasAttribute('data-gc-close')) element.disabled = true; });
    if (oneTime) {
      const container = dialog.querySelector('#garmin-cloud-credentials'); container.hidden = false;
      container.innerHTML = '<h3>只在本次显示的配置</h3><p>请由本人保存到 GitHub 仓库的 Secrets。关闭窗口后不再显示同步凭据，也不会存入浏览器。</p>';
      container.append(secretField('JINSHAN_SYNC_URL', oneTime.workerUrl), secretField('JINSHAN_SYNC_TOKEN', oneTime.syncToken, true), secretField('OWNER_ID · 登录设置使用', oneTime.ownerId));
      const note = document.createElement('p'); note.textContent = '还需在 GitHub Secrets 配置独立的会话加密密钥 GARMIN_SESSION_KEY，并完成本人云端佳明登录。请按部署说明完成后再查看首次同步结果。'; container.append(note);
    }
  }
  async function perform(action) {
    if (busy) return;
    if (action === 'authorize' && !dialog.querySelector('#garmin-cloud-consent')?.checked) return;
    if (action === 'authorize' && state?.enabled && !window.confirm('确认重新生成同步授权？\n原同步凭据与已保存的佳明会话将失效，需要重新配置 GitHub Secrets 并由本人重新登录佳明。训练与健康历史记录保留。')) return;
    if (action === 'revoke' && !window.confirm('确认解除云端佳明授权？\n将停止云端同步并清除佳明会话；已同步的训练与健康记录继续保留。')) return;
    const requestGeneration = generation;
    busy = true; notice = action === 'status' ? '正在读取云端连接状态…' : '正在提交…'; render();
    try {
      const fields = action === 'authorize' ? {consent:true, consentVersion:CONSENT_VERSION} : action === 'request' ? {mode:'recent'} : {};
      const result = await call(action, fields);
      // Keep only a bounded status projection. One-time credentials never enter durable storage.
      const status = result.state || result;
      if (typeof status.enabled !== 'boolean') throw Error('云端未返回完整连接状态，请稍后刷新。');
      state = {enabled:status.enabled === true, consentVersion:status.consentVersion, sessionPresent:status.sessionPresent === true, sessionRevision:status.sessionRevision, status:status.status, lastSuccessAt:status.lastSuccessAt, lastRunAt:status.lastRunAt, code:status.code || (typeof status.error === 'string' ? status.error : status.error?.code), requestedAt:status.requestedAt, paused:status.paused === true, hasActiveRun:status.hasActiveRun === true, expiresAt:status.expiresAt};
      if (action === 'authorize' && result.syncToken && result.ownerId && result.workerUrl && dialog.open && requestGeneration === generation) oneTime = {syncToken:String(result.syncToken), ownerId:String(result.ownerId), workerUrl:String(result.workerUrl)};
      if (action === 'revoke') oneTime = null;
      notice = action === 'request' ? '请求已保存，等待云端定时任务处理；这不表示已经同步成功。' : action === 'authorize' ? '同步授权已生成，请保存本次配置并完成云端佳明登录。' : action === 'revoke' ? '云端授权已解除，历史记录仍保留。' : action === 'pause' ? '自动同步已暂停。' : action === 'resume' ? '已恢复，等待下一次云端任务执行。' : '';
    } catch (error) { notice = error.message; }
    finally { busy = false; if (dialog.open) render(); }
  }
  function close() {
    if (!dialog) return;
    oneTime = null; generation++; clearInterval(timer); timer = null;
    dialog.close(); dialog.innerHTML = ''; previousFocus?.focus?.();
  }
  function open() {
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'garmin-cloud-dialog'; dialog.className = 'garmin-cloud-dialog';
      dialog.setAttribute('aria-labelledby', 'garmin-cloud-title'); document.body.append(dialog);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      dialog.addEventListener('close', () => { oneTime = null; clearInterval(timer); timer = null; dialog.innerHTML = ''; });
    }
    if (dialog.open) return;
    previousFocus = document.activeElement; notice = ''; oneTime = null; generation++;
    render(); dialog.showModal(); perform('status');
    timer = setInterval(() => { if (dialog.open && !busy && !oneTime && !dialog.querySelector('#garmin-cloud-consent')?.checked) perform('status'); }, 30000);
  }
  function mount() {
    const actions = document.querySelector('.top-actions');
    if (!actions || document.querySelector('#garmin-cloud-open')) return;
    const button = document.createElement('button'); button.id = 'garmin-cloud-open'; button.type = 'button'; button.className = 'garmin-cloud-open';
    button.textContent = '云端佳明设置'; button.onclick = open; actions.prepend(button);
    const profileBody = document.querySelector('#modal-body');
    if (profileBody) {
      const profileEntry = () => {
        if (!profileBody.querySelector('#profile-form') || profileBody.querySelector('[data-garmin-cloud-profile]')) return;
        const entry = document.createElement('button'); entry.type = 'button'; entry.className = 'garmin-cloud-profile'; entry.setAttribute('data-garmin-cloud-profile', ''); entry.textContent = '设置佳明云端同步 ↗'; entry.onclick = open; profileBody.append(entry);
      };
      new MutationObserver(profileEntry).observe(profileBody, {childList:true}); profileEntry();
    }
  }
  window.GarminCloudSettings = {open};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true}); else mount();
})();
