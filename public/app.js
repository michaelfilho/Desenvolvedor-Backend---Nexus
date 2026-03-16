const state = {
  authMode: "login",
  session: loadSession(),
  balances: [],
  lastQuote: null
};

const elements = {
  authForm: document.querySelector("#auth-form"),
  authSubmit: document.querySelector("#auth-submit"),
  fillDemoButton: document.querySelector("#fill-demo-button"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  currentUser: document.querySelector("#current-user"),
  refreshSessionButton: document.querySelector("#refresh-session-button"),
  logoutButton: document.querySelector("#logout-button"),
  reloadDashboardButton: document.querySelector("#reload-dashboard-button"),
  healthStatus: document.querySelector("#health-status"),
  balancesGrid: document.querySelector("#balances-grid"),
  depositForm: document.querySelector("#deposit-form"),
  swapForm: document.querySelector("#swap-form"),
  quoteButton: document.querySelector("#quote-button"),
  quoteResult: document.querySelector("#quote-result"),
  withdrawForm: document.querySelector("#withdraw-form"),
  ledgerTableBody: document.querySelector("#ledger-table-body"),
  transactionsTableBody: document.querySelector("#transactions-table-body"),
  consoleOutput: document.querySelector("#console-output"),
  flashMessage: document.querySelector("#flash-message"),
  authTabs: Array.from(document.querySelectorAll("[data-auth-mode]"))
};

bootstrap();

function bootstrap() {
  wireEvents();
  setAuthMode(state.authMode);
  updateSessionUi();
  initializeDepositKey();
  void checkHealth();

  if (state.session?.accessToken) {
    void loadDashboard();
  }
}

function wireEvents() {
  elements.authTabs.forEach((tab) => {
    tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode || "login"));
  });

  elements.authForm.addEventListener("submit", handleAuthSubmit);
  elements.fillDemoButton.addEventListener("click", fillDemoCredentials);
  elements.refreshSessionButton.addEventListener("click", handleRefresh);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.reloadDashboardButton.addEventListener("click", () => void loadDashboard());
  elements.depositForm.addEventListener("submit", handleDeposit);
  elements.swapForm.addEventListener("submit", handleSwap);
  elements.quoteButton.addEventListener("click", handleQuote);
  elements.withdrawForm.addEventListener("submit", handleWithdrawal);
}

function setAuthMode(mode) {
  state.authMode = mode;
  elements.authTabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.authMode === mode);
  });
  setButtonLabel(elements.authSubmit, mode === "register" ? "Criar conta" : "Entrar");
}

function fillDemoCredentials() {
  elements.authEmail.value = "demo@nexus.com";
  elements.authPassword.value = "12345678";
  showFlash("Credenciais de demonstração preenchidas.");
}

async function checkHealth() {
  try {
    const response = await apiFetch("/health", { method: "GET" }, false);
    elements.healthStatus.textContent = `API online · ${new Date(response.timestamp).toLocaleTimeString("pt-BR")}`;
    showFlash("API online. Faça login para habilitar as operações protegidas.");
  } catch (error) {
    elements.healthStatus.textContent = `API indisponivel · ${readErrorMessage(error)}`;
    showFlash(`API indisponível: ${readErrorMessage(error)}`, "error");
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const payload = {
    email: elements.authEmail.value.trim().toLowerCase(),
    password: elements.authPassword.value
  };

  const path = state.authMode === "register" ? "/auth/register" : "/auth/login";
  const idleLabel = state.authMode === "register" ? "Criar conta" : "Entrar";
  const busyLabel = state.authMode === "register" ? "Criando conta..." : "Entrando...";

  try {
    setButtonBusy(elements.authSubmit, true, busyLabel);
    const response = await apiFetch(path, {
      method: "POST",
      body: JSON.stringify(payload)
    }, false);

    persistSession(response);
    logToConsole(response, `${state.authMode.toUpperCase()} concluido`);
    showFlash(`${state.authMode === "register" ? "Cadastro" : "Login"} realizado com sucesso.`, "success");
    await loadDashboard();
  } catch (error) {
    logToConsole(error, `${state.authMode.toUpperCase()} falhou`);
    showFlash(readErrorMessage(error), "error");
  } finally {
    setButtonBusy(elements.authSubmit, false, idleLabel);
  }
}

async function handleRefresh() {
  if (!state.session?.refreshToken) {
    logToConsole({ message: "Nenhum refresh token disponivel" }, "Refresh ignorado");
    showFlash("Nenhum refresh token disponível.", "error");
    return;
  }

  try {
    setButtonBusy(elements.refreshSessionButton, true, "Atualizando...");
    const response = await refreshSessionToken();

    state.session = {
      ...state.session,
      accessToken: response.accessToken,
      refreshToken: response.refreshToken
    };

    saveSession();
    updateSessionUi();
    logToConsole(response, "Refresh concluido");
    showFlash("Token renovado com sucesso.", "success");
    await loadDashboard();
  } catch (error) {
    logToConsole(error, "Refresh falhou");
    showFlash(readErrorMessage(error), "error");
  } finally {
    setButtonBusy(elements.refreshSessionButton, false, "Refresh token");
  }
}

function handleLogout() {
  state.session = null;
  state.balances = [];
  state.lastQuote = null;
  localStorage.removeItem("nexus-wallet-session");
  updateSessionUi();
  renderBalances([]);
  renderLedger([]);
  renderTransactions([]);
  elements.quoteResult.textContent = "Nenhuma cotacao gerada.";
  logToConsole({ message: "Sessao encerrada" }, "Logout");
  showFlash("Sessão encerrada.");
}

async function loadDashboard() {
  if (!state.session?.accessToken) {
    updateSessionUi();
    return;
  }

  try {
    setButtonBusy(elements.reloadDashboardButton, true, "Atualizando...");
    const [balances, ledger, transactions] = await Promise.all([
      apiFetch("/wallet/balances"),
      apiFetch("/ledger?page=1&pageSize=10"),
      apiFetch("/transactions?page=1&pageSize=10")
    ]);

    state.balances = balances.balances;
    renderBalances(balances.balances);
    renderLedger(ledger.items);
    renderTransactions(transactions.items);
    updateSessionUi();
    logToConsole({ balances, ledger: ledger.pagination, transactions: transactions.pagination }, "Dashboard atualizado");
    showFlash("Carteira sincronizada.", "success");
  } catch (error) {
    logToConsole(error, "Falha ao carregar dashboard");
    showFlash(readErrorMessage(error), "error");
  } finally {
    setButtonBusy(elements.reloadDashboardButton, false, "Atualizar dados");
    syncActionState();
  }
}

async function handleDeposit(event) {
  event.preventDefault();
  const form = event.currentTarget;

  if (!state.session?.user?.id) {
    logToConsole({ message: "Login necessario para derivar o userId do deposito" }, "Deposito bloqueado");
    showFlash("Faça login antes de processar depósitos.", "error");
    return;
  }

  const formData = new FormData(form);
  const payload = {
    userId: state.session.user.id,
    token: String(formData.get("token")),
    amount: String(formData.get("amount")).trim(),
    idempotencyKey: String(formData.get("idempotencyKey")).trim()
  };

  const submitButton = form.querySelector('button[type="submit"]');

  try {
    setButtonBusy(submitButton, true, "Processando...");
    const response = await apiFetch("/webhooks/deposit", {
      method: "POST",
      body: JSON.stringify(payload)
    }, false);

    form.reset();
    initializeDepositKey();
    logToConsole(response, "Deposito processado");
    showFlash("Depósito processado com sucesso.", "success");
    await loadDashboard();
  } catch (error) {
    logToConsole(error, "Deposito falhou");
    showFlash(readErrorMessage(error), "error");

    if (isIdempotencyConflict(error)) {
      initializeDepositKey();
    }
  } finally {
    setButtonBusy(submitButton, false, "Processar depósito");
  }
}

async function handleQuote() {
  if (!ensureAuthenticated("Cotacao")) {
    return;
  }

  const formData = new FormData(elements.swapForm);
  const payload = extractSwapPayload(formData);

  try {
    setButtonBusy(elements.quoteButton, true, "Cotando...");
    const response = await apiFetch("/swap/quote", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    state.lastQuote = response;
    elements.quoteResult.textContent = formatQuote(response);
    logToConsole(response, "Cotacao calculada");
    showFlash("Cotação gerada com sucesso.", "success");
  } catch (error) {
    logToConsole(error, "Cotacao falhou");
    showFlash(readErrorMessage(error), "error");
  } finally {
    setButtonBusy(elements.quoteButton, false, "Gerar cotação");
  }
}

async function handleSwap(event) {
  event.preventDefault();

  if (!ensureAuthenticated("Swap")) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const payload = extractSwapPayload(formData);
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');

  try {
    setButtonBusy(submitButton, true, "Executando...");
    const response = await apiFetch("/swap", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    logToConsole(response, "Swap executado");
    showFlash("Swap executado com sucesso.", "success");
    await loadDashboard();
  } catch (error) {
    logToConsole(error, "Swap falhou");
    showFlash(readErrorMessage(error), "error");
  } finally {
    setButtonBusy(submitButton, false, "Executar swap");
  }
}

async function handleWithdrawal(event) {
  event.preventDefault();

  if (!ensureAuthenticated("Saque")) {
    return;
  }

  const formData = new FormData(event.currentTarget);
  const payload = {
    token: String(formData.get("token")),
    amount: String(formData.get("amount")).trim()
  };

  const submitButton = event.currentTarget.querySelector('button[type="submit"]');

  try {
    setButtonBusy(submitButton, true, "Solicitando...");
    const response = await apiFetch("/withdrawals", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    logToConsole(response, "Saque solicitado");
    showFlash("Saque enviado com sucesso.", "success");
    await loadDashboard();
  } catch (error) {
    logToConsole(error, "Saque falhou");
    showFlash(readErrorMessage(error), "error");
  } finally {
    setButtonBusy(submitButton, false, "Solicitar saque");
  }
}

function extractSwapPayload(formData) {
  return {
    fromToken: String(formData.get("fromToken")),
    toToken: String(formData.get("toToken")),
    amount: String(formData.get("amount")).trim()
  };
}

function ensureAuthenticated(actionName) {
  if (!state.session?.accessToken) {
    logToConsole({ message: `${actionName} requer autenticacao` }, `${actionName} bloqueado`);
    showFlash(`${actionName} requer autenticação.`, "error");
    return false;
  }

  return true;
}

function updateSessionUi() {
  const userEmail = state.session?.user?.email;
  elements.currentUser.textContent = userEmail || "Nenhuma sessao ativa";
  syncActionState();
}

function syncActionState() {
  const isAuthenticated = Boolean(state.session?.accessToken);
  elements.refreshSessionButton.disabled = !state.session?.refreshToken;
  elements.logoutButton.disabled = !isAuthenticated;
  elements.reloadDashboardButton.disabled = !isAuthenticated;
  elements.quoteButton.disabled = !isAuthenticated;
  elements.depositForm.querySelector('button[type="submit"]').disabled = !isAuthenticated;
  elements.swapForm.querySelector('button[type="submit"]').disabled = !isAuthenticated;
  elements.withdrawForm.querySelector('button[type="submit"]').disabled = !isAuthenticated;
}

function renderBalances(balances) {
  const orderedTokens = ["BRL", "BTC", "ETH"];
  const mapped = new Map(balances.map((balance) => [balance.token, balance.amount]));

  elements.balancesGrid.innerHTML = orderedTokens
    .map((token) => {
      const amount = mapped.get(token) || "0";
      return `
        <article class="balance-card accent-${token.toLowerCase()}">
          <p class="token">${token}</p>
          <p class="amount">${amount}</p>
        </article>
      `;
    })
    .join("");
}

function renderLedger(items) {
  if (!items.length) {
    elements.ledgerTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum movimento encontrado.</td></tr>';
    return;
  }

  elements.ledgerTableBody.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${item.type}</td>
          <td>${item.token}</td>
          <td>${item.amount}</td>
          <td>${item.previousBalance}</td>
          <td>${item.newBalance}</td>
          <td>${formatDate(item.createdAt)}</td>
        </tr>
      `
    )
    .join("");
}

function renderTransactions(items) {
  if (!items.length) {
    elements.transactionsTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhuma transacao encontrada.</td></tr>';
    return;
  }

  elements.transactionsTableBody.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${item.type}</td>
          <td>${formatLeg(item.sourceToken, item.sourceAmount)}</td>
          <td>${formatLeg(item.destinationToken, item.destinationAmount)}</td>
          <td>${formatLeg(item.feeToken, item.feeAmount)}</td>
          <td>${item.externalReference || "-"}</td>
          <td>${formatDate(item.createdAt)}</td>
        </tr>
      `
    )
    .join("");
}

async function apiFetch(path, options = {}, requiresAuth = true) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (requiresAuth && state.session?.accessToken) {
    headers.Authorization = `Bearer ${state.session.accessToken}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const raw = await response.text();
  const data = raw ? safeJsonParse(raw) : null;

  if (response.status === 401 && requiresAuth && state.session?.refreshToken) {
    try {
      const refreshed = await refreshSessionToken();
      state.session = {
        ...state.session,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken
      };
      saveSession();
      updateSessionUi();

      const retryHeaders = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        Authorization: `Bearer ${state.session.accessToken}`
      };

      const retryResponse = await fetch(path, {
        ...options,
        headers: retryHeaders
      });

      const retryRaw = await retryResponse.text();
      const retryData = retryRaw ? safeJsonParse(retryRaw) : null;

      if (!retryResponse.ok) {
        throw retryData || { message: `HTTP ${retryResponse.status}` };
      }

      return retryData;
    } catch {
      handleLogout();
      throw data || { message: "Sessao expirada. Faca login novamente." };
    }
  }

  if (!response.ok) {
    throw data || { message: `HTTP ${response.status}` };
  }

  return data;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

function persistSession(response) {
  state.session = {
    user: response.user || state.session?.user,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken
  };

  saveSession();
  updateSessionUi();
}

function saveSession() {
  localStorage.setItem("nexus-wallet-session", JSON.stringify(state.session));
}

function loadSession() {
  try {
    const stored = localStorage.getItem("nexus-wallet-session");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function initializeDepositKey() {
  const field = elements.depositForm.querySelector('input[name="idempotencyKey"]');
  field.value = generateIdempotencyKey();
}

function generateIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `deposit-${crypto.randomUUID()}`;
  }

  const random = Math.random().toString(36).slice(2, 10);
  return `deposit-${Date.now()}-${random}`;
}

function formatQuote(quote) {
  return [
    `Origem: ${quote.sourceAmount} ${quote.fromToken}`,
    `Destino liquido: ${quote.destinationAmount} ${quote.toToken}`,
    `Taxa: ${quote.fee.amount} ${quote.fee.token}`,
    `Rate: ${quote.quote.rate}`
  ].join("\n");
}

function formatLeg(token, amount) {
  if (!token || !amount || amount === "0") {
    return "-";
  }

  return `${amount} ${token}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString("pt-BR");
}

function readErrorMessage(error) {
  if (Array.isArray(error?.issues) && error.issues.length > 0) {
    return error.issues.map((issue) => issue.message).join(" | ");
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }

  if (typeof error?.error === "string" && error.error.trim()) {
    return error.error;
  }

  if (typeof error?.raw === "string" && error.raw.trim()) {
    return error.raw;
  }

  return "Erro desconhecido";
}

function isIdempotencyConflict(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();
  return message.includes("idempotency") || code.includes("IDEMPOTENCY");
}

async function refreshSessionToken() {
  return apiFetch(
    "/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({ refreshToken: state.session.refreshToken })
    },
    false
  );
}

function logToConsole(payload, label) {
  elements.consoleOutput.textContent = `${label}\n${JSON.stringify(payload, null, 2)}`;
}

function showFlash(message, tone = "neutral") {
  elements.flashMessage.textContent = message;
  elements.flashMessage.className = `flash-bar is-${tone}`;
}

function setButtonBusy(button, isBusy, label) {
  if (!button) {
    return;
  }

  if (!button.dataset.labelDefault) {
    button.dataset.labelDefault = button.textContent;
  }

  button.disabled = isBusy;
  button.textContent = isBusy ? label : button.dataset.labelDefault;
}

function setButtonLabel(button, label) {
  button.dataset.labelDefault = label;
  button.textContent = label;
}