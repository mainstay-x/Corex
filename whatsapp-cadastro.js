"use strict";

// Página de cadastro do número (Embedded Signup v4 da Meta, com coexistência).
// Precisa ser aberta por HTTPS em um domínio cadastrado no app da Meta.
(function () {
  const config = window.COREX_CONFIG;
  const message = document.getElementById("signup-message");
  const loginForm = document.getElementById("signup-login");
  const connect = document.getElementById("signup-connect");
  const startButton = document.getElementById("signup-start");
  const result = document.getElementById("signup-result");

  function say(text) {
    message.textContent = text || "";
  }

  if (!window.supabase || !config) {
    say("Não foi possível carregar o COREX.");
    return;
  }
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  const appId = config.whatsappAppId || "";
  const signupConfigId = config.whatsappSignupConfigId || "";
  const graphVersion = config.whatsappGraphVersion || "v26.0";
  let sessionInfo = null;
  let pending = false;

  function isFacebookOrigin(origin) {
    try {
      const url = new URL(origin);
      return url.protocol === "https:" && (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com"));
    } catch (_error) {
      return false;
    }
  }

  window.addEventListener("message", (event) => {
    if (!isFacebookOrigin(event.origin)) return;
    let data;
    try {
      data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    } catch (_error) {
      return;
    }
    if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
    if (data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" || data.event === "FINISH") {
      sessionInfo = {
        waba_id: data.data?.waba_id || null,
        phone_number_id: data.data?.phone_number_id || null,
      };
    } else if (data.event === "CANCEL") {
      say("Cadastro interrompido na Meta. Nada foi alterado.");
    } else if (data.event === "ERROR") {
      say(`A Meta informou um erro: ${data.data?.error_message || "sem detalhes"}.`);
    }
  });

  function waitForSessionInfo(timeoutMs) {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (sessionInfo || Date.now() - started > timeoutMs) {
          clearInterval(timer);
          resolve(sessionInfo);
        }
      }, 200);
    });
  }

  function showResult(data) {
    result.replaceChildren();
    const rows = [
      ["Número", data.display_phone_number || "Não informado"],
      ["Nome verificado", data.verified_name || "Não informado"],
      ["Phone number ID", data.phone_number_id],
      ["WABA ID", data.waba_id],
      ["No app do celular", data.is_on_biz_app ? "Sim" : "Não"],
      ["Plataforma", data.platform_type || "Não informada"],
    ];
    for (const [label, value] of rows) {
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = value;
      result.append(term, detail);
    }
    result.hidden = false;
  }

  async function finish(code) {
    say("Concluindo a conexão...");
    const info = await waitForSessionInfo(10000);
    if (!info?.waba_id) {
      say("A Meta não devolveu a conta do WhatsApp. Refaça o cadastro.");
      return;
    }
    const { data, error } = await client.functions.invoke("corex-whatsapp-onboard", {
      body: { code, waba_id: info.waba_id, phone_number_id: info.phone_number_id },
    });
    if (error) {
      let text = "Não foi possível concluir a conexão.";
      try {
        const body = await error.context.json();
        if (body?.error) text = body.error;
      } catch (_error) {
        // mantém a mensagem padrão
      }
      say(text);
      return;
    }
    showResult(data);
    say(
      data.is_on_biz_app && data.platform_type === "CLOUD_API"
        ? "Número conectado. Grave o Phone number ID no secret WHATSAPP_PHONE_NUMBER_ID."
        : "O app foi inscrito, mas a Meta ainda não confirma a coexistência. Confira de novo em alguns minutos."
    );
  }

  function launch() {
    if (pending) return;
    pending = true;
    sessionInfo = null;
    result.hidden = true;
    say("");
    window.FB.login(
      (response) => {
        const code = response?.authResponse?.code;
        if (!code) {
          pending = false;
          say("Cadastro não concluído.");
          return;
        }
        finish(code).finally(() => {
          pending = false;
        });
      },
      {
        config_id: signupConfigId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "whatsapp_business_app_onboarding" },
      }
    );
  }

  function loadFacebookSdk() {
    if (location.protocol !== "https:") {
      say("Abra esta página por HTTPS, no domínio cadastrado no app da Meta.");
      return;
    }
    if (!appId || !signupConfigId) {
      say("Preencha whatsappAppId e whatsappSignupConfigId em config.js.");
      return;
    }
    window.fbAsyncInit = function () {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      startButton.disabled = false;
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    document.body.append(script);
  }

  // A página usa a sessão do COREX (mesmo domínio), já confirmada com o app autenticador.
  function showLogin() {
    connect.hidden = true;
    loginForm.hidden = false;
  }

  function showConnect() {
    loginForm.hidden = true;
    connect.hidden = false;
    if (!window.FB && !document.querySelector('script[src*="connect.facebook.net"]')) loadFacebookSdk();
  }

  document.getElementById("signup-logout").addEventListener("click", async () => {
    await client.auth.signOut();
    result.hidden = true;
    say("");
    showLogin();
  });

  startButton.addEventListener("click", launch);

  async function checkSession() {
    const { data } = await client.auth.getSession();
    if (!data.session) return false;
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    return assurance.data?.currentLevel === "aal2";
  }

  checkSession().then((confirmed) => (confirmed ? showConnect() : showLogin()));
})();
