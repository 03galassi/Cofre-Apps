import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, setPersistence, browserSessionPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, ALLOWED_EMAIL, INITIAL_PASSWORD, LOCK_AFTER_MINUTES } from "./firebase-config.js";

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = id => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
const normEmail = e => String(e || "").trim().toLowerCase();
const hrefOf = u => { u = String(u || "").trim(); if (!u) return ""; return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : "https://" + u; };
const showUrl = u => String(u || "").trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
const MUST_CHANGE_KEY = "cofre-must-change";
const ss = {
  get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  del: k => { try { sessionStorage.removeItem(k); } catch {} }
};

function toast(text) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = text;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2000);
}
async function copy(text, label) {
  if (!text) { toast("Campo vazio"); return; }
  try { await navigator.clipboard.writeText(text); toast(label + " copiado"); }
  catch {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast(label + " copiado"); } catch { toast("Selecione e copie manualmente"); }
    ta.remove();
  }
}
function genPassword(len = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?-_";
  const r = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(r, x => chars[x % chars.length]).join("");
}
function authMessage(err) {
  const c = err && err.code || "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email", "auth/invalid-login-credentials"].includes(c)) return "E-mail ou senha incorretos.";
  if (c === "auth/too-many-requests") return "Muitas tentativas seguidas. Aguarde alguns minutos ou use “Esqueci minha senha”.";
  if (c === "auth/network-request-failed") return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  if (c === "auth/weak-password") return "Senha fraca. Use pelo menos 8 caracteres.";
  if (c === "auth/requires-recent-login") return "Por segurança, saia e entre de novo antes de trocar a senha.";
  if (c === "auth/user-disabled") return "Este usuário está desativado no Firebase.";
  if (c === "auth/unauthorized-domain" || c === "auth/unauthorized-continue-uri") return "Este endereço não está autorizado no Firebase (Authentication > Configurações > Domínios autorizados).";
  return "Não foi possível concluir. Tente de novo.";
}

/* ---------- firebase ---------- */
const configured = firebaseConfig && firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("COLE");
let auth, db;
if (configured) {
  const fb = initializeApp(firebaseConfig);
  auth = getAuth(fb);
  auth.languageCode = "pt-BR";
  db = getFirestore(fb);
  setPersistence(auth, browserSessionPersistence).catch(() => {});
}

/* ---------- state ---------- */
const S = {
  user: null, view: "loading", query: "", editing: null, confirmDel: null,
  reveal: new Set(), data: { logins: [], apps: [] }, loaded: { logins: false, apps: false }, unsubs: []
};

const KINDS = {
  logins: { title: "Meus Logins", one: "login", add: "Novo login", ic: "key", done: "Login cadastrado",
    fields: [["nome", "Nome", "text"], ["url", "URL", "url"], ["login", "Login", "text"], ["senha", "Senha", "password"]] },
  apps: { title: "Meus Aplicativos", one: "aplicativo", add: "Novo aplicativo", ic: "apps", done: "Aplicativo cadastrado",
    fields: [["nome", "Nome", "text"], ["url", "URL", "url"], ["hospedagem", "Hospedagem", "text"], ["banco", "Base de dados", "text"], ["login", "Login", "text"], ["senha", "Senha", "password"]] }
};

/* ---------- auto sign-out ---------- */
let idleTimer = null;
function bumpIdle() {
  if (!S.user) return;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { S.lockNote = "Você saiu automaticamente por inatividade."; signOut(auth); }, LOCK_AFTER_MINUTES * 60 * 1000);
}
["pointerdown", "keydown", "scroll"].forEach(ev => addEventListener(ev, bumpIdle, { passive: true }));

/* ---------- data subscriptions ---------- */
function subscribe(uid) {
  unsubscribe();
  for (const kind of ["logins", "apps"]) {
    const ref = collection(db, "users", uid, kind);
    S.unsubs.push(onSnapshot(ref, snap => {
      S.data[kind] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      S.loaded[kind] = true;
      if (!S.editing) render(true);
    }, err => {
      console.error(err);
      toast(err.code === "permission-denied" ? "Sem permissão no banco de dados. Confira as regras do Firestore." : "Erro ao carregar os dados.");
    }));
  }
}
function unsubscribe() { S.unsubs.forEach(u => u()); S.unsubs = []; S.data = { logins: [], apps: [] }; S.loaded = { logins: false, apps: false }; }

/* ---------- views ---------- */
function setMsg(sel, text, kind = "err") { const el = $(sel); if (!el) return; el.hidden = !text; el.className = "msg " + kind; el.textContent = text || ""; }

const dialSVG = `
<svg class="dial" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="56" fill="var(--surface-2)" stroke="var(--line)" stroke-width="2"/>
  <g class="ring" id="dial-ring">
    ${Array.from({ length: 40 }, (_, i) => { const a = i * 9 * Math.PI / 180; const L = i % 5 === 0 ? 9 : 4; const r1 = 50, r2 = 50 - L; return `<line x1="${(60 + r1 * Math.sin(a)).toFixed(2)}" y1="${(60 - r1 * Math.cos(a)).toFixed(2)}" x2="${(60 + r2 * Math.sin(a)).toFixed(2)}" y2="${(60 - r2 * Math.cos(a)).toFixed(2)}" stroke="${i % 5 === 0 ? "var(--fg)" : "var(--muted)"}" stroke-width="${i % 5 === 0 ? 2 : 1.2}" stroke-linecap="round"/>`; }).join("")}
  </g>
  <circle cx="60" cy="60" r="30" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
  <rect x="56" y="2" width="8" height="8" rx="2" fill="var(--brass)"/>
  <g transform="translate(48 48)" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="12" rx="2.5"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/></g>
</svg>`;
function spinDial(n) { const r = $("#dial-ring"); if (r) r.style.transform = `rotate(${n * 27}deg)`; }

function passField(id, label, auto = "current-password") {
  return `<div class="field"><label for="${id}">${label}</label><div class="input"><input id="${id}" type="password" autocomplete="${auto}"><button type="button" class="icon-btn" data-toggle="${id}" aria-label="Mostrar senha">${icon("eye")}</button></div></div>`;
}

function viewNotConfigured() {
  return `<div class="lock"><div class="lock-card"><div class="brand"><h1>Cofre de Acessos</h1><p>Falta ligar o app ao Firebase.</p></div>
  <p class="msg err" style="margin:0">Abra o arquivo <span class="mono">js/firebase-config.js</span> e cole a configuração do seu projeto Firebase. O passo a passo está no README.</p></div></div>`;
}
function viewLoading() { return `<div class="lock"><p class="muted">Carregando…</p></div>`; }
function viewLock() {
  return `<div class="lock"><form class="lock-card" id="f-login" novalidate>
    <div class="dial-wrap">${dialSVG}</div>
    <div class="brand"><h1>Cofre de Acessos</h1><p>Seus logins e aplicativos em um só lugar.</p></div>
    <div class="field"><label for="l-email">E-mail</label><div class="input"><input id="l-email" type="email" autocomplete="username" inputmode="email" value="${esc(S.lastEmail || ALLOWED_EMAIL)}"></div></div>
    ${passField("l-pass", "Senha")}
    <div id="lock-msg" class="msg err" hidden></div>
    <button class="btn block" id="b-login" type="submit">Entrar</button>
    <div style="text-align:center"><button type="button" class="link" data-go="recover">Esqueci minha senha</button></div>
  </form></div>`;
}
function viewRecover() {
  return `<div class="lock"><form class="lock-card" id="f-recover" novalidate>
    <button type="button" class="back" data-go="lock">${icon("back")} Voltar</button>
    <div class="brand"><h1>Recuperar senha</h1><p>Enviaremos um link para o seu e-mail. Abra o link, escolha uma senha nova e volte aqui para entrar.</p></div>
    <div class="field"><label for="r-email">E-mail</label><div class="input"><input id="r-email" type="email" autocomplete="username" inputmode="email" value="${esc(S.lastEmail || ALLOWED_EMAIL)}"></div></div>
    <div id="rec-msg" class="msg err" hidden></div>
    <button class="btn block" type="submit">Enviar link de recuperação</button>
    <p class="hint" style="margin:0;text-align:center">Não chegou? Confira a caixa de spam e a aba Promoções.</p>
  </form></div>`;
}
function viewSetup() {
  return `<div class="lock"><form class="lock-card" id="f-setup" novalidate>
    <div class="brand"><h1>Crie sua senha</h1><p>Você entrou com a senha inicial. Escolha uma senha pessoal para continuar.</p></div>
    ${passField("s-pass", "Nova senha", "new-password")}
    ${passField("s-pass2", "Repita a nova senha", "new-password")}
    <p class="hint" style="margin:-6px 0 0">Pelo menos 8 caracteres. Se esquecer, use “Esqueci minha senha” e receba um link por e-mail.</p>
    <div id="setup-msg" class="msg err" hidden></div>
    <button class="btn block" type="submit">Salvar senha e continuar</button>
    <div style="text-align:center"><button type="button" class="link" id="b-out">Sair</button></div>
  </form></div>`;
}
function topBar() {
  return `<header class="top"><div class="who"><svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="10" fill="var(--accent)"/><circle cx="20" cy="20" r="10" fill="none" stroke="var(--accent-fg)" stroke-width="2"/><circle cx="20" cy="20" r="3" fill="var(--brass)"/><path d="M20 10v4M20 26v4M10 20h4M26 20h4" stroke="var(--accent-fg)" stroke-width="2" stroke-linecap="round"/></svg>
    <div style="min-width:0"><h1>Cofre de Acessos</h1><div class="sub">${esc(S.user.email)}</div></div></div>
    <div class="actions"><button class="icon-btn" data-go="settings" aria-label="Configurações" title="Configurações">${icon("gear")}</button><button class="icon-btn" id="b-lock" aria-label="Sair" title="Sair">${icon("lock")}</button></div></header>`;
}
function viewHome() {
  const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
  const cnt = (k, a, b) => S.loaded[k] ? plural(S.data[k].length, a, b) : "carregando…";
  return `${topBar()}
  <div class="greet"><h2>O que você quer abrir?</h2><p>Escolha uma área para consultar ou cadastrar acessos.</p></div>
  <div class="tiles">
    <button class="tile" data-go="logins"><span class="arrow">${icon("arrow")}</span><span class="ic">${icon("key")}</span><span><h3>Meus Logins</h3><p>Sites e serviços: nome, endereço, login e senha.</p></span><span class="count">${cnt("logins", "login salvo", "logins salvos")}</span></button>
    <button class="tile" data-go="apps"><span class="arrow">${icon("arrow")}</span><span class="ic">${icon("apps")}</span><span><h3>Meus Aplicativos</h3><p>Sistemas próprios: hospedagem, base de dados e credenciais.</p></span><span class="count">${cnt("apps", "aplicativo salvo", "aplicativos salvos")}</span></button>
  </div>`;
}
function viewList(kind) {
  const K = KINDS[kind]; const all = S.data[kind];
  const q = S.query.trim().toLowerCase();
  const items = all.filter(it => !q || K.fields.some(([f, , t]) => t !== "password" && String(it[f] || "").toLowerCase().includes(q)))
    .sort((a, b) => (a.nome || a.url || "").localeCompare(b.nome || b.url || "", "pt-BR", { sensitivity: "base" }));
  const empty = !S.loaded[kind]
    ? `<div class="empty"><p style="margin:0">Carregando…</p></div>`
    : all.length === 0
      ? `<div class="empty"><span class="ic" style="color:var(--accent)">${icon(K.ic)}</span><h3>Nenhum ${K.one} cadastrado</h3><p style="margin:0">Toque em “${K.add}” para guardar o primeiro. Nenhum campo é obrigatório.</p><button class="btn" data-new="${kind}">${icon("plus")} ${K.add}</button></div>`
      : `<div class="empty"><h3>Nada encontrado</h3><p style="margin:0">Nenhum ${K.one} corresponde a “${esc(S.query)}”.</p></div>`;
  return `${topBar()}
  <button class="back" data-go="home">${icon("back")} Início</button>
  <div class="list-head"><h2>${K.title}</h2><button class="btn" data-new="${kind}">${icon("plus")} ${K.add}</button></div>
  ${all.length ? `<div class="list-head"><div class="input search"><span class="pre">${icon("search").replace("<svg", '<svg style="width:16px;height:16px;vertical-align:-3px"')}</span><input id="q" type="search" placeholder="Buscar por nome, URL, login…" value="${esc(S.query)}" autocomplete="off"></div><span class="muted small">${items.length} de ${all.length}</span></div>` : ""}
  <div class="rows">${items.length ? items.map(it => rowHTML(kind, it)).join("") : empty}</div>`;
}
function cell(label, value, o = {}) {
  const has = !!String(value || "").length;
  const shown = o.secret && !o.revealed ? "••••••••••" : value;
  return `<div class="cell"><div class="txt"><span class="k">${label}</span><span class="v">${has ? esc(shown) : '<span class="muted">—</span>'}</span></div>
    ${has && o.secret ? `<button class="icon-btn" data-reveal="${o.id}" aria-label="${o.revealed ? "Ocultar" : "Mostrar"} senha">${icon(o.revealed ? "eyeoff" : "eye")}</button>` : ""}
    ${has ? `<button class="icon-btn" data-copy="${o.kind}|${o.id}|${o.field}" aria-label="Copiar ${label}">${icon("copy")}</button>` : ""}</div>`;
}
function rowHTML(kind, it) {
  const K = KINDS[kind]; const title = it.nome || showUrl(it.url) || it.login || "Sem nome";
  const initial = (title.trim()[0] || "?").toUpperCase(); const revealed = S.reveal.has(it.id);
  const cells = K.fields.filter(([f]) => f !== "nome" && f !== "url")
    .map(([f, label, t]) => cell(label, it[f], { kind, id: it.id, field: f, secret: t === "password", revealed })).join("");
  const conf = S.confirmDel === it.id ? `<div class="confirm"><span>Excluir “${esc(title)}”? Esta ação não pode ser desfeita.</span><button class="btn ghost" data-cancel-del>Cancelar</button><button class="btn danger" data-do-del="${kind}|${it.id}">Excluir</button></div>` : "";
  return `<article class="row"><div class="row-top"><span class="avatar">${esc(initial)}</span>
    <div class="row-title"><strong>${esc(title)}</strong>${it.url ? `<a href="${esc(hrefOf(it.url))}" target="_blank" rel="noopener noreferrer">${esc(showUrl(it.url))}</a>` : ""}</div>
    <div class="row-actions"><button class="icon-btn" data-edit="${kind}|${it.id}" aria-label="Editar">${icon("edit")}</button><button class="icon-btn" data-del="${it.id}" aria-label="Excluir">${icon("trash")}</button></div></div>
    <div class="kv">${cells}</div>${conf}</article>`;
}
function viewSettings() {
  return `${topBar()}
  <button class="back" data-go="home">${icon("back")} Início</button>
  <div class="list-head"><h2>Configurações</h2></div>
  <div class="rows">
    <form class="row" id="f-chpw" novalidate><h3 style="font-size:18px">Alterar senha</h3>
      <div class="grid2">${passField("c-old", "Senha atual")}${passField("c-new", "Nova senha", "new-password")}</div>
      ${passField("c-new2", "Repita a nova senha", "new-password")}
      <div id="chpw-msg" class="msg err" hidden></div>
      <div><button class="btn" type="submit">Salvar nova senha</button></div></form>
    <div class="row"><h3 style="font-size:18px">Recuperação de senha</h3>
      <p class="muted small" style="margin:0">Se esquecer a senha, use “Esqueci minha senha” na tela de entrada. O link de redefinição é enviado para ${esc(S.user.email)}.</p></div>
    <div class="row"><h3 style="font-size:18px">Segurança</h3>
      <p class="muted small" style="margin:0">Os cadastros ficam no Firestore do seu projeto Firebase, acessíveis apenas com este login. Você sai automaticamente após ${LOCK_AFTER_MINUTES} minutos sem uso ou ao fechar a aba.</p></div>
  </div>`;
}
function modalHTML() {
  const { kind, item } = S.editing; const K = KINDS[kind];
  const val = f => esc(item ? item[f] || "" : "");
  const inputs = K.fields.map(([f, label, t]) => {
    if (t === "url") return `<div class="field"><label for="e-${f}">${label}</label><div class="input"><span class="pre">https://</span><input id="e-${f}" autocomplete="off" spellcheck="false" inputmode="url" placeholder="exemplo.com.br" value="${esc(showUrl(item ? item[f] : ""))}"></div></div>`;
    if (t === "password") return `<div class="field"><label for="e-${f}">${label}</label><div class="input"><input id="e-${f}" type="password" class="mono" autocomplete="new-password" value="${val(f)}"><button type="button" class="icon-btn" data-gen="e-${f}" aria-label="Gerar senha forte" title="Gerar senha forte">${icon("dice")}</button><button type="button" class="icon-btn" data-toggle="e-${f}" aria-label="Mostrar senha">${icon("eye")}</button></div></div>`;
    return `<div class="field"><label for="e-${f}">${label}</label><div class="input"><input id="e-${f}" autocomplete="off" value="${val(f)}"></div></div>`;
  }).join("");
  return `<div class="scrim" id="scrim"><form class="sheet" id="f-edit" novalidate role="dialog" aria-modal="true" aria-labelledby="e-title">
    <h3 id="e-title">${item ? "Editar " + K.one : K.add}</h3>
    <div class="grid2">${inputs}</div>
    <p class="hint" style="margin:0">Nenhum campo é obrigatório. A URL pode ser digitada sem “http”.</p>
    <div id="edit-msg" class="msg err" hidden></div>
    <div class="sheet-foot"><button type="button" class="btn ghost" id="b-cancel">Cancelar</button><button class="btn" type="submit" id="b-save">Salvar</button></div>
  </form></div>`;
}

function render(keepFocus = false) {
  const active = keepFocus ? document.activeElement : null;
  const activeId = active && active.id; const pos = active && active.selectionStart;
  let html;
  if (!configured) html = viewNotConfigured();
  else if (S.view === "loading") html = viewLoading();
  else if (S.view === "lock") html = viewLock();
  else if (S.view === "recover") html = viewRecover();
  else if (!S.user) html = viewLock();
  else if (S.view === "setup") html = viewSetup();
  else if (S.view === "home") html = viewHome();
  else if (S.view === "logins" || S.view === "apps") html = viewList(S.view);
  else if (S.view === "settings") html = viewSettings();
  else html = viewHome();
  if (S.editing && S.user) html += modalHTML();
  app.innerHTML = html;
  if (activeId) { const el = document.getElementById(activeId); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch {} } }
  else if (S.view === "lock") { const p = $("#l-pass"); if (p) p.focus({ preventScroll: true }); }
  if (S.view === "lock" && S.lockNote) { setMsg("#lock-msg", S.lockNote, "ok"); S.lockNote = ""; }
}
function go(view) { S.view = view; S.query = ""; S.confirmDel = null; S.reveal.clear(); render(); scrollTo(0, 0); }

/* ---------- actions ---------- */
function pwProblem(a, b) {
  if (a.length < 8) return "A nova senha precisa ter pelo menos 8 caracteres.";
  if (a !== b) return "As duas senhas digitadas não são iguais.";
  if (a === INITIAL_PASSWORD) return "Escolha uma senha diferente da senha inicial.";
  return "";
}
async function doLogin() {
  const email = normEmail($("#l-email").value), pass = $("#l-pass").value;
  S.lastEmail = email;
  if (email !== normEmail(ALLOWED_EMAIL)) return setMsg("#lock-msg", "E-mail ou senha incorretos.");
  const btn = $("#b-login"); btn.disabled = true; btn.textContent = "Entrando…"; setMsg("#lock-msg", "");
  try {
    if (pass === INITIAL_PASSWORD) ss.set(MUST_CHANGE_KEY, "1"); else ss.del(MUST_CHANGE_KEY);
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) { ss.del(MUST_CHANGE_KEY); setMsg("#lock-msg", authMessage(e)); }
  finally { const b = $("#b-login"); if (b) { b.disabled = false; b.textContent = "Entrar"; } }
}
async function doRecover() {
  const email = normEmail($("#r-email").value);
  if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg("#rec-msg", "Digite um e-mail válido.");
  S.lastEmail = email;
  const btn = $("#f-recover button[type=submit]"); btn.disabled = true; btn.textContent = "Enviando…";
  try {
    if (email === normEmail(ALLOWED_EMAIL)) {
      await sendPasswordResetEmail(auth, email, { url: location.origin + location.pathname });
    }
    setMsg("#rec-msg", `Se ${email} estiver cadastrado, você receberá em instantes um e-mail com o link para criar uma nova senha.`, "ok");
  } catch (e) { setMsg("#rec-msg", authMessage(e)); }
  finally { btn.disabled = false; btn.textContent = "Enviar link de recuperação"; }
}
async function doSetup() {
  const a = $("#s-pass").value, b = $("#s-pass2").value;
  const p = pwProblem(a, b); if (p) return setMsg("#setup-msg", p);
  const btn = $("#f-setup button[type=submit]"); btn.disabled = true; btn.textContent = "Salvando…";
  try { await updatePassword(auth.currentUser, a); ss.del(MUST_CHANGE_KEY); toast("Senha criada"); go("home"); }
  catch (e) { setMsg("#setup-msg", authMessage(e)); btn.disabled = false; btn.textContent = "Salvar senha e continuar"; }
}
async function doChangePw() {
  const old = $("#c-old").value, a = $("#c-new").value, b = $("#c-new2").value;
  const p = pwProblem(a, b); if (p) return setMsg("#chpw-msg", p);
  if (a === old) return setMsg("#chpw-msg", "A nova senha é igual à atual.");
  const btn = $("#f-chpw button[type=submit]"); btn.disabled = true;
  try {
    await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, old));
    await updatePassword(auth.currentUser, a);
    ["#c-old", "#c-new", "#c-new2"].forEach(s => $(s).value = "");
    setMsg("#chpw-msg", "Senha alterada.", "ok");
  } catch (e) {
    setMsg("#chpw-msg", ["auth/invalid-credential", "auth/wrong-password", "auth/invalid-login-credentials"].includes(e.code) ? "A senha atual está incorreta." : authMessage(e));
  } finally { btn.disabled = false; }
}
async function saveEdit() {
  const { kind, item } = S.editing; const K = KINDS[kind]; const rec = {};
  K.fields.forEach(([f, , t]) => {
    let v = $("#e-" + f).value;
    if (t === "url") v = v.trim().replace(/^https?:\/\//i, ""); else if (t !== "password") v = v.trim();
    rec[f] = v;
  });
  if (!K.fields.some(([f]) => rec[f])) return setMsg("#edit-msg", "Preencha ao menos um campo para salvar.");
  const btn = $("#b-save"); btn.disabled = true; btn.textContent = "Salvando…";
  try {
    const col = collection(db, "users", S.user.uid, kind);
    if (item) await updateDoc(doc(col, item.id), { ...rec, atualizado: serverTimestamp() });
    else await addDoc(col, { ...rec, criado: serverTimestamp(), atualizado: serverTimestamp() });
    S.editing = null; render(); toast(item ? "Alterações salvas" : K.done);
  } catch (e) {
    console.error(e);
    setMsg("#edit-msg", e.code === "permission-denied" ? "Sem permissão para gravar. Confira as regras do Firestore." : "Não foi possível salvar. Verifique a conexão e tente de novo.");
    btn.disabled = false; btn.textContent = "Salvar";
  }
}
async function doDelete(kind, id) {
  try { await deleteDoc(doc(db, "users", S.user.uid, kind, id)); S.confirmDel = null; S.reveal.delete(id); toast("Excluído"); }
  catch { toast("Não foi possível excluir. Tente de novo."); }
}

/* ---------- events ---------- */
app.addEventListener("submit", e => {
  e.preventDefault();
  ({ "f-login": doLogin, "f-recover": doRecover, "f-setup": doSetup, "f-chpw": doChangePw, "f-edit": saveEdit })[e.target.id]?.();
});
app.addEventListener("input", e => {
  if (e.target.id === "l-pass") spinDial(e.target.value.length);
  if (e.target.id === "e-url" && /^https?:\/\//i.test(e.target.value)) e.target.value = e.target.value.replace(/^https?:\/\//i, "");
  if (e.target.id === "q") { S.query = e.target.value; render(true); }
});
app.addEventListener("click", e => {
  const t = e.target.closest("button, .scrim"); if (!t) return;
  const d = t.dataset;
  if (t.id === "scrim" && e.target === t) { S.editing = null; render(); return; }
  if (d.toggle) { const inp = $("#" + d.toggle); const show = inp.type === "password"; inp.type = show ? "text" : "password"; t.innerHTML = icon(show ? "eyeoff" : "eye"); t.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha"); return; }
  if (d.gen) { const inp = $("#" + d.gen); inp.value = genPassword(); inp.type = "text"; const tg = inp.parentElement.querySelector("[data-toggle]"); if (tg) tg.innerHTML = icon("eyeoff"); toast("Senha forte gerada"); return; }
  if (d.go) { go(d.go); return; }
  if (t.id === "b-lock" || t.id === "b-out") { S.lockNote = "Você saiu do cofre."; signOut(auth); return; }
  if (d.new) { S.editing = { kind: d.new, item: null }; render(); $("#f-edit input")?.focus(); return; }
  if (d.edit) { const [k, id] = d.edit.split("|"); S.editing = { kind: k, item: S.data[k].find(x => x.id === id) }; render(); $("#f-edit input")?.focus(); return; }
  if (t.id === "b-cancel") { S.editing = null; render(); return; }
  if (d.del) { S.confirmDel = d.del; render(); return; }
  if ("cancelDel" in d) { S.confirmDel = null; render(); return; }
  if (d.doDel) { const [k, id] = d.doDel.split("|"); doDelete(k, id); return; }
  if (d.reveal) { S.reveal.has(d.reveal) ? S.reveal.delete(d.reveal) : S.reveal.add(d.reveal); render(); return; }
  if (d.copy) {
    const [k, id, f] = d.copy.split("|"); const it = S.data[k].find(x => x.id === id);
    const labels = { login: "Login", senha: "Senha", hospedagem: "Hospedagem", banco: "Base de dados" };
    copy(it && it[f], labels[f] || "Valor"); return;
  }
});
addEventListener("keydown", e => { if (e.key === "Escape" && S.editing) { S.editing = null; render(); } });

/* ---------- boot ---------- */
if (!configured) render();
else {
  onAuthStateChanged(auth, user => {
    if (user && normEmail(user.email) !== normEmail(ALLOWED_EMAIL)) { signOut(auth); return; }
    S.user = user || null;
    S.editing = null;
    if (user) {
      subscribe(user.uid); bumpIdle();
      S.view = ss.get(MUST_CHANGE_KEY) ? "setup" : "home";
    } else {
      unsubscribe(); clearTimeout(idleTimer);
      if (S.view !== "recover") S.view = "lock";
    }
    render();
  });
}
