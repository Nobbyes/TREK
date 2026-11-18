/* Shared Garmin state and transport. No health records or credentials are persisted here. */
(() => {
  'use strict';
  const schedule = [6 * 60 + 17, 12 * 60 + 17, 18 * 60 + 17, 22 * 60 + 17];
  const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const errors = {
    AUTH_REQUIRED: '登录已过期，请重新登录训练空间。',
    UNAUTHORIZED: '登录已过期，请重新登录训练空间。',
    CONSENT_REQUIRED: '同步尚未授权或授权已过期，请打开连接管理。',
    LOGIN_REQUIRED: '需要完成一次性佳明认证，请在 Codex 中继续开通。',
    SESSION_MISSING: '需要完成一次性佳明认证，请在 Codex 中继续开通。',
    GARMIN_AUTH_REQUIRED: '佳明会话已失效，请重新完成一次性认证。',
    SESSION_EXPIRED: '佳明会话已失效，请重新完成一次性认证。',
    PAUSED: '自动同步已暂停，可在连接管理中恢复。',
    GARMIN_RATE_LIMITED: '佳明暂时限制请求，本轮已停止，请等待后续任务。',
    RATE_LIMITED: '佳明暂时限制请求，本轮已停止，请等待后续任务。',
    PARTIAL_DATA: '本轮只取得部分资料，原有记录已保留。',
    SESSION_CONFLICT: '会话已有更新，本轮未覆盖新会话，请刷新状态。',
    BACKEND_UNAVAILABLE: '暂时无法连接同步服务，已有记录保留。',
    CLOUD_HTTP_FAILED: '本轮云端连接中断，已有记录保留，等待下一轮检查。',
    LEASE_EXPIRED: '上次任务未确认完成，已有记录保留，等待下一轮检查。',
    REQUEST_INVALID: '请求格式不正确，请刷新后重试。',
    SPACE_REQUIRED: '请先打开并初始化自己的训练空间。'
  };
  function nextScheduledAt(now = Date.now()) {
    const shifted = new Date(now + 8 * 3600000);
    const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 8 * 3600000;
    return new Date(schedule.map(minutes => start + minutes * 60000).find(time => time > now) ?? start + 86400000 + schedule[0] * 60000).toISOString();
  }
  function formatDate(value) {
    return validDate(value) ? new Date(value).toLocaleString('zh-CN', {timeZone:'Asia/Shanghai', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false}) : '尚无记录';
  }
  function view(state, now = Date.now()) {
    const base = {cloud:true, mode:'recent', enabled:state?.enabled === true, sessionPresent:state?.sessionPresent === true,
      lastSuccessAt:state?.lastSuccessAt || null, lastRunAt:state?.lastRunAt || null, requestedAt:state?.requestedAt || null,
      nextScheduledAt:nextScheduledAt(now), code:state?.code || null, provider:state?.code==='OFFICIAL_COMPLETE'?'official-personal-api':null, canRequest:false};
    const result = (status, title, message, tone='pending', canRequest=false) => ({...base, status, title, stage:title, message, tone, canRequest});
    if (!state) return result('unknown', '正在检查连接', '已有训练记录可继续查看。');
    const code = String(state.code || '').toUpperCase();
    if (!state.enabled) return result('never', state.status === 'revoked' ? '佳明连接已解除' : '尚未连接佳明', '完成连接后自动同步近7天训练与健康资料。');
    if (validDate(state.expiresAt) && Date.parse(state.expiresAt) <= now) return result('failed', '同步授权已过期', errors.CONSENT_REQUIRED, 'attention');
    if (state.status === 'needs_login' || ['AUTH_REQUIRED','LOGIN_REQUIRED','GARMIN_AUTH_REQUIRED','SESSION_EXPIRED','NEEDS_REAUTH','AUTHENTICATION_FAILED'].includes(code)) return result('failed', '佳明需要重新认证', errors[code] || errors.GARMIN_AUTH_REQUIRED, 'attention');
    if (state.paused || state.status === 'paused') return result('paused', '自动同步已暂停', errors.PAUSED);
    if (!state.sessionPresent) return result('never', '等待佳明认证', errors.LOGIN_REQUIRED);
    // A valid current lease takes precedence over an earlier run's code.
    if (state.hasActiveRun) return result('running', '正在同步', '正在检查近7天资料，完成后可刷新记录。');
    if (state.status === 'waiting') return result('waiting', '同步请求已排队', '等待下一轮云端任务，无需重复提交。');
    if (state.status === 'running') return result('failed', '上次任务未确认完成', errors.LEASE_EXPIRED, 'attention', true);
    if (code === 'PARTIAL_DATA') return result('partial', '部分资料已同步', errors.PARTIAL_DATA, 'attention', true);
    if (state.status === 'failed' || (code && !['COMPLETE','OFFICIAL_COMPLETE','CONFIGURED'].includes(code))) return result('failed', '本轮同步未完成', errors[code] || '已有记录保留，请在连接管理查看并刷新状态。', 'attention', true);
    if (validDate(state.lastSuccessAt)) return result('complete', '佳明已连接', `最近成功 ${formatDate(state.lastSuccessAt)} · 北京时间`, 'success', true);
    return result('waiting', '等待首次实际同步', '会话已保存，尚无成功读取记录。');
  }
  function selectReadiness(records = []) {
    const sorted = records.filter(r => r && Number.isFinite(r.score)).slice().sort((a,b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    return sorted.find(r => r.context === 'AFTER_WAKEUP_RESET') || sorted[0] || {};
  }
  function createTransport({client, url, key, fetchImpl = fetch, ttl = 10000}) {
    let cache = null, cachedAt = 0, pendingStatus = null, epoch = 0;
    const mutations = new Map();
    async function perform(action, fields) {
      const auth = await client.auth.getSession();
      if (auth.error || !auth.data?.session?.access_token) throw Object.assign(Error(errors.AUTH_REQUIRED), {status:401, code:'AUTH_REQUIRED'});
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 20000);
      try {
        const response = await fetchImpl(`${url.replace(/\/$/,'')}/functions/v1/garmin-sync-admin`, {
          method:'POST', signal:abort.signal,
          headers:{Authorization:`Bearer ${auth.data.session.access_token}`, apikey:key, 'Content-Type':'application/json'},
          body:JSON.stringify({action, ...fields})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.error) {
          const code = String(typeof data.error === 'string' ? data.error : data.error?.code || data.code || '').toUpperCase();
          throw Object.assign(Error(errors[code] || (response.status === 401 ? errors.AUTH_REQUIRED : '云端操作未完成，已有记录保留。')), {status:response.ok ? 503 : response.status, code});
        }
        if (typeof (data.state || data).enabled !== 'boolean') throw Object.assign(Error('服务未返回完整连接状态，请稍后刷新。'), {status:503});
        return data;
      } catch (error) {
        if (error.status) throw error;
        throw Object.assign(Error(error.name === 'AbortError' ? '连接超时，请先刷新状态确认结果，避免重复提交。' : errors.BACKEND_UNAVAILABLE), {status:503});
      } finally { clearTimeout(timer); }
    }
    function call(action, fields = {}, {force = false} = {}) {
      if (action === 'status') {
        if (pendingStatus) return pendingStatus;
        if (!force && cache && Date.now() - cachedAt < ttl) return Promise.resolve(cache);
        const version = epoch;
        const pending = perform(action, fields).then(data => {
          if (version === epoch) { cache = data; cachedAt = Date.now(); }
          return data;
        }).finally(() => { if (pendingStatus === pending) pendingStatus = null; });
        pendingStatus = pending;
        return pending;
      }
      // Double taps share one request. Mutations never retry themselves.
      if (mutations.has(action)) return mutations.get(action);
      epoch++; cache = null;
      const pending = perform(action, fields).finally(() => { mutations.delete(action); epoch++; cache = null; });
      mutations.set(action, pending);
      return pending;
    }
    return {call, invalidate() { epoch++; cache = null; }};
  }
  window.GarminSyncCore = {view, selectReadiness, createTransport, nextScheduledAt, formatDate, errors};
})();
