(() => {
  'use strict';

  const cfg = window.TREK_BACKEND || {};
  const slug = 'central-asia-2026';
  let client = null;
  let currentUser = null;
  let editor = false;
  let lastUpdatedAt = null;

  const configured = () => Boolean(cfg.url && cfg.publishableKey && window.supabase?.createClient);

  function ensureClient() {
    if (!configured()) return null;
    if (!client) {
      client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    }
    return client;
  }

  async function checkEditor() {
    editor = false;
    if (!currentUser || !client) return false;
    const { data, error } = await client.from('trek_editors').select('email').limit(1).maybeSingle();
    if (error) throw error;
    editor = Boolean(data);
    return editor;
  }

  async function init() {
    ensureClient();
    if (!client) return state();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    currentUser = data.session?.user || null;
    if (currentUser) await checkEditor();
    return state();
  }

  async function loadData() {
    ensureClient();
    if (!client) return null;
    const { data, error } = await client.from('trek_itineraries').select('content,updated_at').eq('slug', slug).maybeSingle();
    if (error) throw error;
    lastUpdatedAt = data?.updated_at || null;
    return data?.content || null;
  }

  async function login(email, password) {
    ensureClient();
    if (!client) throw new Error('后台尚未连接');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    await checkEditor();
    return state();
  }

  async function logout() {
    if (client) await client.auth.signOut();
    currentUser = null;
    editor = false;
    return state();
  }

  async function saveData(content) {
    if (!client || !currentUser || !editor) throw new Error('当前账号没有编辑权限');
    const now = new Date().toISOString();
    const payload = { slug, content, updated_at: now, updated_by: currentUser.email };
    let result;
    if (lastUpdatedAt) {
      result = await client.from('trek_itineraries').update(payload).eq('slug', slug).eq('updated_at', lastUpdatedAt).select('updated_at').maybeSingle();
      if (!result.error && !result.data) throw new Error('行程已被其他成员更新，请刷新页面后再编辑');
    } else {
      result = await client.from('trek_itineraries').insert(payload).select('updated_at').single();
      if (result.error?.code === '23505') throw new Error('云端已有更新，请刷新页面后再编辑');
    }
    if (result.error) throw result.error;
    lastUpdatedAt = result.data.updated_at;
    return lastUpdatedAt;
  }

  function state() {
    return { configured: configured(), user: currentUser, editor, updatedAt: lastUpdatedAt };
  }

  window.TrekCloud = { init, loadData, login, logout, saveData, state };
})();

