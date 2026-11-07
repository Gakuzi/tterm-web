// Signing in (from 0.0.9), for everyone: a code from email, then, on a
// device the person trusts, a four-digit quick code. The rules live in the
// core, see tterm/core/auth.py. Laid out as a bank's sign-in is: the logo
// and the name above a card that asks one thing at a time, digits typed
// into dashes and taken as soon as the last one is in.
//
//   email → code → (a new address: the name and one tick) →
//   a quick code → the same once more, or Not now
//   a trusted device: its quick code; Forgot the code?, Switch account
//   another account, from the app's Allow (0.1.8): the email first, as
//   Switch account does

import {
  useEffect, useRef, useState, type FormEvent, type ReactNode, type Ref,
} from "react";
import {
  askCode, authState, checkTelegramAuthSession, configureTelegramBot, createTelegramAuthSession,
  loginWithTelegramWidget, quickSignIn, Refused, requestTelegramCode, setQuickCode, signUp,
  telegramAuthStatus, validateInviteToken, verifyCode, verifyTelegramCode, type InviteValidationResult,
  type KnownDevice, type Legal, type SignedInNow, type TelegramAuthStatus, type TelegramWidgetUser,
} from "./api";
import { LANGUAGES, showLanguage, useT, type Lang, type Translate } from "./i18n";
import { Logo } from "./icons";

const CODE_DIGITS = 6;
const PIN_DIGITS = 4;
/** Seconds before the same address may get another code. */
const RESEND_S = 60;
/** Where the links go until the core says. */
const LEGAL: Legal = {
  terms: "https://tterm.net/terms",
  privacy: "https://tterm.net/privacy",
  support: "support@tterm.net",
};

type Step =
  | { kind: "loading" }
  | { kind: "email" }
  | { kind: "code"; email: string }
  | { kind: "tg_code"; telegramId: string; botUsername?: string; botLink?: string }
  | { kind: "signup"; email: string }
  | { kind: "offer"; name: string; fresh: boolean }
  | { kind: "pin"; device: KnownDevice };

interface Props {
  /** Why the page asks again, if it does: "Your session ended…". */
  note?: string | null;
  /** The address to start with: whoever was signed in on this page. */
  email?: string;
  /** Another account (0.1.8): the email first, even where this browser
   * remembers someone and would ask their quick code. */
  another?: boolean;
  onSignedIn: () => void;
}

function digitsOf(value: string, count: number): string {
  return value.replace(/\D/g, "").slice(0, count);
}

/** The cursor of the input under the dashes stays after the last digit: a
 * click on the first dash or an arrow key would otherwise put the next
 * digit in the middle, while the dashes look as if it came last. */
function keepAtEnd(input: HTMLInputElement): void {
  const end = input.value.length;
  if (input.selectionStart !== end || input.selectionEnd !== end) {
    input.setSelectionRange(end, end);
  }
}

function textOf(error: unknown, t: Translate): string {
  if (error instanceof Error && error.message) return error.message;
  return t("signin.no_answer");
}

/** A quick code anyone would try first, as the core judges it: one digit
 * four times, or the digits in a row (1234, 9876). */
function tooEasy(pin: string): boolean {
  const steps = new Set<number>();
  for (let i = 1; i < pin.length; i++) steps.add(Number(pin[i]) - Number(pin[i - 1]));
  return new Set(pin).size === 1 || (steps.size === 1 && (steps.has(1) || steps.has(-1)));
}

export function SignIn(props: Props) {
  const { onSignedIn, another } = props;
  const t = useT();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [email, setEmail] = useState(props.email ?? "");
  const [note, setNote] = useState<string | null>(props.note ?? null);
  const [legal, setLegal] = useState<Legal>(LEGAL);
  const [inviteInfo, setInviteInfo] = useState<InviteValidationResult | null>(null);

  // Check URL hash/query for project invitations
  useEffect(() => {
    let token = "";
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const query = new URLSearchParams(search);

    if (query.get("invite")) {
      token = query.get("invite")!;
    } else if (hash.includes("token=")) {
      const match = hash.match(/token=([^&]+)/);
      if (match) token = match[1];
    } else if (hash.includes("invite=")) {
      const match = hash.match(/invite=([^&]+)/);
      if (match) token = match[1];
    }

    if (!token) {
      token = sessionStorage.getItem("tterm_pending_invite") || "";
    }

    if (token) {
      sessionStorage.setItem("tterm_pending_invite", token);
      validateInviteToken(token)
        .then((res) => {
          if (res.valid) {
            setInviteInfo(res);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Why the session ended may come after this screen is up: Sign out closes
  // the page's socket a moment before its own answer, "You signed out.",
  // arrives. The later word wins.
  useEffect(() => {
    if (props.note) setNote(props.note);
  }, [props.note]);

  useEffect(() => {
    let stopped = false;
    authState()
      .then((state) => {
        if (stopped) return;
        if (state.legal) setLegal(state.legal);
        if (state.signedIn) onSignedIn();
        else if (state.device && !another) {
          setEmail(state.device.email);
          setStep({ kind: "pin", device: state.device });
        } else setStep({ kind: "email" });
      })
      .catch(() => {
        if (stopped) return;
        setNote(t("signin.no_answer"));
        setStep({ kind: "email" });
      });
    return () => {
      stopped = true;
    };
  }, [onSignedIn, another]);

  const toEmail = (why: string | null, address?: string) => {
    setNote(why);
    if (address !== undefined) setEmail(address);
    setStep({ kind: "email" });
  };
  const toCode = (sent: string) => {
    setEmail(sent);
    setNote(null);
    setStep({ kind: "code", email: sent });
  };
  const toTelegramCode = (tgId: string, botUsername?: string, botLink?: string) => {
    setNote(null);
    setStep({ kind: "tg_code", telegramId: tgId, botUsername, botLink });
  };
  const inNow = (result: SignedInNow) => {
    setNote(null);
    // Another account in a browser that remembers someone (0.1.8): no
    // quick code is offered, it would take the place of theirs.
    if (another) {
      onSignedIn();
      return;
    }
    setStep({ kind: "offer", name: result.name, fresh: result.new });
  };

  let body: ReactNode = null;
  switch (step.kind) {
    case "loading":
      break;
    case "email":
      body = (
        <EmailStep
          email={email}
          setEmail={setEmail}
          onSent={toCode}
          onTelegramSent={toTelegramCode}
          onIn={inNow}
        />
      );
      break;
    case "tg_code":
      body = (
        <TelegramCodeStep
          telegramId={step.telegramId}
          botUsername={step.botUsername}
          botLink={step.botLink}
          onBack={() => toEmail(null)}
          onIn={inNow}
        />
      );
      break;
    case "code":
      body = (
        <CodeStep email={step.email} onBack={() => toEmail(null)} onIn={inNow}
          onSignUp={(address) => {
            setNote(null);
            setStep({ kind: "signup", email: address });
          }} />
      );
      break;
    case "signup":
      body = (
        <SignUpStep email={step.email} legal={legal} onIn={inNow}
          onBack={(why) => toEmail(why)} />
      );
      break;
    case "offer":
      body = <OfferStep name={step.name} fresh={step.fresh} onDone={onSignedIn} />;
      break;
    case "pin":
      body = (
        <PinStep device={step.device} onIn={onSignedIn} onCode={toCode}
          onEmail={(why) => toEmail(why)} onSwitch={() => toEmail(null, "")} />
      );
      break;
  }

  return (
    <main className="signin" aria-busy={step.kind === "loading"}>
      <header className="signin-brand">
        <Logo size={36} />
        <span aria-hidden="true">tTerm</span>
      </header>
      <div className="signin-middle">
        {body && (
          <section className="signin-card">
            {inviteInfo && inviteInfo.valid && (
              <div
                className="signin-invite-banner"
                style={{
                  background: "rgba(59, 130, 246, 0.12)",
                  border: "1px solid rgba(59, 130, 246, 0.35)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  marginBottom: 16,
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: "#60a5fa", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🤝</span> Приглашение в проект
                </div>
                <div style={{ fontSize: 13, marginTop: 6, color: "var(--color-text-primary, #f1f5f9)", lineHeight: 1.4 }}>
                  Вас приглашают в проект <strong>{inviteInfo.project?.name || "Команда"}</strong> ({inviteInfo.project?.creator_name ? `от ${inviteInfo.project.creator_name}` : "tTerm"}) с ролью <strong>{inviteInfo.invite?.role === "admin" ? "Администратор" : inviteInfo.invite?.role === "observer" ? "Наблюдатель" : "Участник"}</strong>.
                </div>
                <div style={{ fontSize: 11, color: "var(--color-text-dim, #94a3b8)", marginTop: 6 }}>
                  Войдите в аккаунт через Telegram или эл. почту для автоматического подключения и доступа к терминалам проекта.
                </div>
              </div>
            )}
            {note && <p className="signin-note" role="status">{note}</p>}
            {body}
          </section>
        )}
      </div>
      {/* The Terms and the Policy are in the sign-up tick; here only the
          way to ask for help. */}
      <footer className="signin-footer">
        <a href={`mailto:${legal.support}`}>{legal.support}</a>
      </footer>
    </main>
  );
}

/** Digits typed into dashes: a real input over them, for the keyboard,
 * pasting and the code from the email's autofill. A quick code shows a dot
 * for each digit. */
function Slots(props: {
  count: number;
  value: string;
  secret?: boolean;
  label: string;
  name: string;
  autoComplete: string;
  /** Being checked: what is typed stays, and nothing more goes in. */
  busy?: boolean;
  disabled?: boolean;
  /** One more at each wrong try: the dashes shake. */
  wrong?: number;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
}) {
  const [focused, setFocused] = useState(false);
  const { count, value } = props;
  const here = focused && !props.disabled && !props.busy && value.length < count
    ? value.length : -1;
  const classes = ["slots"];
  if (props.secret) classes.push("secret");
  if (props.busy) classes.push("busy");
  if (props.disabled) classes.push("off");
  return (
    <div className={classes.join(" ")}>
      <div key={props.wrong ?? 0} className={props.wrong ? "slots-row shake" : "slots-row"}
        aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className={"slot" + (i < value.length ? " filled" : "") +
            (i === here ? " here" : "")}>
            {i < value.length && !props.secret ? value[i] : null}
          </span>
        ))}
      </div>
      <input ref={props.ref} className="slots-input" type="text"
        inputMode="numeric" pattern="[0-9]*" name={props.name}
        autoComplete={props.autoComplete} aria-label={props.label} autoFocus
        spellCheck={false} autoCorrect="off" autoCapitalize="off"
        maxLength={count + 8} value={value} readOnly={props.busy}
        disabled={props.disabled}
        onFocus={(e) => {
          setFocused(true);
          keepAtEnd(e.currentTarget);
        }}
        onBlur={() => setFocused(false)}
        onSelect={(e) => keepAtEnd(e.currentTarget)}
        onChange={(e) => props.onChange(digitsOf(e.target.value, count))} />
    </div>
  );
}

/**
 * Official Telegram Login Widget button.
 * https://core.telegram.org/widgets/login
 * Requires domain configured in @BotFather via /setdomain for the widget iframe to render.
 */
function TelegramLoginWidget(props: {
  botUsername: string;
  onIn: (result: SignedInNow) => void;
  onError: (msg: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (window as any).onTelegramAuth = async (user: TelegramWidgetUser) => {
      try {
        const result = await loginWithTelegramWidget(user);
        props.onIn(result);
      } catch (err) {
        props.onError(err instanceof Error ? err.message : "Ошибка проверки Telegram Widget"); // i18n-ignore
      }
    };

    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", props.botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.async = true;

    containerRef.current.appendChild(script);

    return () => {
      delete (window as any).onTelegramAuth;
    };
  }, [props.botUsername]);

  return <div ref={containerRef} style={{ display: "flex", justifyContent: "center", minHeight: 40, margin: "8px 0" }} />;
}

function EmailStep(props: {
  email: string;
  setEmail: (email: string) => void;
  onSent: (email: string) => void;
  onTelegramSent: (tgId: string, botUsername?: string, botLink?: string) => void;
  onIn: (result: SignedInNow) => void;
}) {
  const t = useT();
  const [method, setMethod] = useState<"email" | "telegram">("email");
  const [tgId, setTgId] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [tgStatus, setTgStatus] = useState<TelegramAuthStatus | null>(null);
  const [setupToken, setSetupToken] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [waitingOneClick, setWaitingOneClick] = useState(false);
  const [tgLink, setTgLink] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    telegramAuthStatus()
      .then((st) => {
        if (active) setTgStatus(st);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleStartOneClick = async () => {
    setBusy(true);
    setProblem(null);
    setWaitingOneClick(true);
    try {
      const session = await createTelegramAuthSession();
      const openLink = session.auth_url || session.bot_link;
      if (openLink) {
        setTgLink(openLink);
        window.open(openLink, "_blank");
      }
      // Poll session status
      const pollTimer = window.setInterval(async () => {
        try {
          const check = await checkTelegramAuthSession(session.session_token);
          if (check.approved && (check.result || (check as any).signedIn)) {
            window.clearInterval(pollTimer);
            setWaitingOneClick(false);
            setBusy(false);
            props.onIn(((check.result || check) as SignedInNow));
          }
        } catch {
          // Keep polling until verified or cancelled
        }
      }, 1500);

      // Auto cancel polling after 3 minutes
      window.setTimeout(() => {
        window.clearInterval(pollTimer);
        setWaitingOneClick(false);
        setBusy(false);
      }, 180000);
    } catch (err) {
      setWaitingOneClick(false);
      setBusy(false);
      setProblem(err instanceof Error ? err.message : "Не удалось создать сессию Telegram"); // i18n-ignore
    }
  };

  const handleConfigureBot = async (e: FormEvent) => {
    e.preventDefault();
    if (!setupToken.trim()) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await configureTelegramBot(setupToken.trim());
      setTgStatus({
        ok: true,
        bot_configured: true,
        bot_username: res.bot_username || "",
        bot_link: res.bot_username ? `https://t.me/${res.bot_username}` : "",
      });
      setShowSetup(false);
      setSetupToken("");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Неверный токен Telegram-бота"); // i18n-ignore
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      if (method === "email") {
        const sent = await askCode(props.email, t.lang);
        props.onSent(sent.email);
      } else {
        const clean = tgId.trim().replace(/^@/, "");
        if (!clean) throw new Error("Укажите Telegram ID или @username"); // i18n-ignore
        await requestTelegramCode(clean);
        props.onTelegramSent(clean, tgStatus?.bot_username, tgStatus?.bot_link);
      }
    } catch (error) {
      setProblem(textOf(error, t));
      setBusy(false);
    }
  };

  return (
    <form className="signin-form" onSubmit={(e) => void submit(e)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>{t("common.sign_in")}</h1>
        <select
          value={t.lang}
          onChange={(e) => void showLanguage(e.target.value as Lang)}
          className="button"
          style={{
            fontSize: 13,
            padding: "4px 8px",
            background: "var(--raised)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            color: "var(--ink)",
            cursor: "pointer",
          }}
          aria-label={"Язык интерфейса" /* i18n-ignore */}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <div className="segmented" style={{ marginBottom: 16 }} role="group">
        <button
          type="button"
          aria-pressed={method === "email"}
          onClick={() => { setMethod("email"); setProblem(null); }}
        >
          {/* i18n-ignore */}
          ✉️ Email
        </button>
        <button
          type="button"
          aria-pressed={method === "telegram"}
          onClick={() => { setMethod("telegram"); setProblem(null); }}
        >
          {/* i18n-ignore */}
          ✈️ Telegram
        </button>
      </div>

      {method === "email" ? (
        <>
          <p className="signin-lead">{t("signin.email_lead")}</p>
          <input className="text-input signin-input" type="email" name="email"
            autoComplete="email" autoFocus required spellCheck={false}
            aria-label={t("signin.email")} placeholder="you@example.com" value={props.email}
            onChange={(e) => props.setEmail(e.target.value)} />
          {problem && <p className="signin-error" role="alert">{problem}</p>}
          <button type="submit" className="button-accent big wide"
            disabled={busy || !props.email.trim()}>
            {busy ? t("signin.sending") : t("signin.get_code")}
          </button>
        </>
      ) : (
        <>
          {tgStatus?.bot_configured ? (
            <>
              {/* Official Telegram Login Widget */}
              <div style={{ marginBottom: 12, textAlign: "center" }}>
                <p className="signin-small" style={{ marginBottom: 6, color: "var(--dim)" }}>
                  {/* i18n-ignore */}
                  <span>Официальный виджет Telegram:</span>
                </p>
                <TelegramLoginWidget
                  botUsername={tgStatus.bot_username}
                  onIn={props.onIn}
                  onError={(err) => setProblem(err)}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span style={{ fontSize: 12, color: "var(--dim)" }}>{/* i18n-ignore */}или прямой переход</span>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className="button-accent big wide"
                  style={{
                    background: "linear-gradient(135deg, #2AABEE 0%, #229ED9 100%)",
                    color: "#fff",
                    fontWeight: 600,
                    boxShadow: "0 4px 12px rgba(34, 158, 217, 0.35)",
                    border: "none",
                  }}
                  disabled={busy}
                  onClick={() => void handleStartOneClick()}
                >
                  {/* i18n-ignore */}
                  {waitingOneClick ? "⏳ Ожидание нажатия Start в Telegram..." : `✈️ Войти в 1 клик через @${tgStatus.bot_username || "бота"}`}
                </button>
                {waitingOneClick && (
                  <div style={{ marginTop: 8, textAlign: "center" }}>
                    <p className="signin-small" style={{ color: "var(--accent)", marginBottom: 6 }}>
                      {/* i18n-ignore */}
                      <span>Откройте бота в Telegram и нажмите кнопку <strong>«Запустить» (/start)</strong> для автоматического входа.</span>
                    </p>
                    {tgLink && (
                      <a
                        href={tgLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 13, fontWeight: 600, color: "#229ED9", textDecoration: "underline", display: "inline-block", margin: "4px 0" }}
                      >
                        {/* i18n-ignore */}
                        👉 Нажмите сюда, если Telegram не открылся автоматически
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span style={{ fontSize: 12, color: "var(--dim)" }}>{/* i18n-ignore */}или по коду</span>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              </div>

              <p className="signin-lead">
                {/* i18n-ignore */}
                Введите ваш Telegram @username или ID для отправки 6-значного кода:
              </p>
              <input className="text-input signin-input" type="text" name="telegram_id"
                autoFocus required spellCheck={false}
                aria-label="Telegram" placeholder="@username или ID" value={tgId} // i18n-ignore
                onChange={(e) => setTgId(e.target.value)} />

              {problem && <p className="signin-error" role="alert">{problem}</p>}
              <button type="submit" className="button-accent big wide"
                disabled={busy || !tgId.trim()}>
                {/* i18n-ignore */}
                {busy ? "Отправка..." : "Получить код в Telegram"}
              </button>
            </>
          ) : (
            <div style={{ padding: "12px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--line)" }}>
              <p className="signin-lead" style={{ margin: "0 0 10px 0" }}>
                {/* i18n-ignore */}
                Telegram-бот авторизации пока не подключен к серверу.
              </p>
              {!showSetup ? (
                <button
                  type="button"
                  className="button-ghost small wide"
                  onClick={() => setShowSetup(true)}
                >
                  {/* i18n-ignore */}
                  ⚙️ Подключить Telegram-бота (@BotFather)
                </button>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <p className="signin-small" style={{ margin: "0 0 8px 0" }}>
                    {/* i18n-ignore */}
                    Создайте бота в @BotFather, скопируйте API Token и вставьте его ниже:
                  </p>
                  <input
                    className="text-input signin-input"
                    type="password"
                    placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="button-accent small"
                      disabled={busy || !setupToken.trim()}
                      onClick={(e) => void handleConfigureBot(e)}
                    >
                      {/* i18n-ignore */}
                      {busy ? "Проверка..." : "Сохранить и включить"}
                    </button>
                    <button
                      type="button"
                      className="button-ghost small"
                      onClick={() => setShowSetup(false)}
                    >
                      {/* i18n-ignore */}
                      Отмена
                    </button>
                  </div>
                </div>
              )}
              {problem && <p className="signin-error" style={{ marginTop: 8 }} role="alert">{problem}</p>}
            </div>
          )}
        </>
      )}

      <p className="signin-small">{t("signin.new_here")}</p>
    </form>
  );
}

function TelegramCodeStep(props: {
  telegramId: string;
  botUsername?: string;
  botLink?: string;
  onBack: () => void;
  onIn: (result: SignedInNow) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const checking = useRef(false);

  const check = async (value: string) => {
    if (checking.current) return;
    checking.current = true;
    setBusy(true);
    setProblem(null);
    setSent(null);
    try {
      const result = await verifyTelegramCode(props.telegramId, value);
      props.onIn(result);
    } catch (error) {
      setCode("");
      setProblem(error instanceof Error ? error.message : "Неверный проверочный код"); // i18n-ignore
      setWrong((n) => n + 1);
      setBusy(false);
      checking.current = false;
      window.setTimeout(() => input.current?.focus(), 0);
    }
  };

  const typed = (value: string) => {
    setCode(value);
    if (value.length === CODE_DIGITS) void check(value);
  };

  const resend = async () => {
    setProblem(null);
    setSent(null);
    try {
      await requestTelegramCode(props.telegramId);
      setCode("");
      setSent("Новый проверочный код отправлен в Telegram"); // i18n-ignore
      window.setTimeout(() => input.current?.focus(), 0);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Не удалось отправить код"); // i18n-ignore
    }
  };

  return (
    <form className="signin-form" onSubmit={(e) => {
      e.preventDefault();
      if (code.length === CODE_DIGITS) void check(code);
    }}>
      <h1>Код из Telegram {/* i18n-ignore */}</h1>
      <p className="signin-lead">
        {/* i18n-ignore */}
        <span>Код отправлен в Telegram пользователю <strong className="ink">@{props.telegramId}</strong></span>
      </p>
      {props.botUsername && (
        <p className="signin-small" style={{ marginBottom: 12, textAlign: "center" }}>
          {/* i18n-ignore */}
          <span>Если бот не прислал сообщение, напишите ему <a href={props.botLink || `https://t.me/${props.botUsername}`} target="_blank" rel="noopener noreferrer">@{props.botUsername}</a> команду <code>/start</code>.</span>
        </p>
      )}
      <Slots ref={input} count={CODE_DIGITS} value={code} label="Код из Telegram" // i18n-ignore
        name="code" autoComplete="one-time-code" busy={busy}
        wrong={wrong} onChange={typed} />
      {problem && <p className="signin-error" role="alert">{problem}</p>}
      {sent && <p className="signin-ok" role="status">{sent}</p>}
      <div className="signin-links">
        <button type="button" className="link-button" onClick={() => void resend()}>
          Запросить код снова {/* i18n-ignore */}
        </button>
        <button type="button" className="link-button" onClick={props.onBack}>
          Выбрать другой способ {/* i18n-ignore */}
        </button>
      </div>
    </form>
  );
}

function CodeStep(props: {
  email: string;
  onBack: () => void;
  onIn: (result: SignedInNow) => void;
  onSignUp: (email: string) => void;
}) {
  const t = useT();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  /** No tries left: only a new code helps. */
  const [spent, setSpent] = useState(false);
  const [wrong, setWrong] = useState(0);
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const checking = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const wait = Math.max(0, RESEND_S - Math.floor((now - sentAt) / 1000));

  const check = async (value: string) => {
    if (checking.current) return;
    checking.current = true;
    setBusy(true);
    setProblem(null);
    setSent(null);
    try {
      const result = await verifyCode(props.email, value);
      if ("signUp" in result) props.onSignUp(result.email);
      else props.onIn(result);
    } catch (error) {
      setCode("");
      setProblem(textOf(error, t));
      setWrong((n) => n + 1);
      if (error instanceof Refused && error.left === 0) setSpent(true);
      setBusy(false);
      checking.current = false;
      window.setTimeout(() => input.current?.focus(), 0);
    }
  };

  const typed = (value: string) => {
    setCode(value);
    if (value.length === CODE_DIGITS && !spent) void check(value);
  };

  const resend = async () => {
    setProblem(null);
    setSent(null);
    try {
      await askCode(props.email, t.lang);
      setSentAt(Date.now());
      setNow(Date.now());
      setSpent(false);
      setCode("");
      setSent(t("signin.code_resent"));
      window.setTimeout(() => input.current?.focus(), 0);
    } catch (error) {
      setProblem(textOf(error, t));
      if (error instanceof Refused && error.wait && error.wait < RESEND_S) {
        setSentAt(Date.now() - (RESEND_S - error.wait) * 1000);
      }
    }
  };

  return (
    <form className="signin-form" onSubmit={(e) => {
      e.preventDefault();
      if (code.length === CODE_DIGITS && !spent) void check(code);
    }}>
      <h1>{t("signin.code_title")}</h1>
      <p className="signin-lead">
        {t.rich("signin.code_sent", {
          email: props.email,
          b: (s) => <strong className="ink">{s}</strong>,
        })}
      </p>
      <Slots ref={input} count={CODE_DIGITS} value={code} label={t("signin.code_label")}
        name="code" autoComplete="one-time-code" busy={busy} disabled={spent}
        wrong={wrong} onChange={typed} />
      {problem && <p className="signin-error" role="alert">{problem}</p>}
      {sent && <p className="signin-ok" role="status">{sent}</p>}
      <div className="signin-links">
        <button type="button" className="link-button" disabled={wait > 0}
          onClick={() => void resend()}>
          {wait > 0 ? t("signin.resend_in", { n: wait }) : t("signin.resend")}
        </button>
        <button type="button" className="link-button" onClick={props.onBack}>
          {t("signin.change_email")}
        </button>
      </div>
      {wait === 0 && !sent && (
        <p className="signin-small">{t("signin.no_email")}</p>
      )}
    </form>
  );
}

function SignUpStep(props: {
  email: string;
  legal: Legal;
  onIn: (result: SignedInNow) => void;
  onBack: (why: string | null) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  /** The one tick: the Terms of Service and the Privacy Policy. */
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      props.onIn(await signUp(props.email, name, agree));
    } catch (error) {
      if (error instanceof Refused && error.status === 410) {
        props.onBack(error.message);
        return;
      }
      setProblem(textOf(error, t));
      setBusy(false);
    }
  };

  return (
    <form className="signin-form" onSubmit={(e) => void submit(e)}>
      <h1>{t("signin.signup_title")}</h1>
      <p className="signin-lead">{props.email}</p>
      <input className="text-input signin-input" name="name" autoComplete="name"
        autoFocus required maxLength={100} aria-label={t("signin.your_name")}
        placeholder={t("signin.your_name")} value={name}
        onChange={(e) => setName(e.target.value)} />
      <label className="signin-check">
        <input type="checkbox" name="agree" checked={agree}
          onChange={(e) => setAgree(e.target.checked)} />
        <span>
          {t.rich("signin.agree", {
            terms: (s) => (
              <a href={props.legal.terms} target="_blank" rel="noreferrer">{s}</a>
            ),
            privacy: (s) => (
              <a href={props.legal.privacy} target="_blank" rel="noreferrer">{s}</a>
            ),
          })}
        </span>
      </label>
      {problem && <p className="signin-error" role="alert">{problem}</p>}
      {/* Without the tick the button does not work, and neither does Enter
          in the name: a form whose button is disabled is not sent. */}
      <button type="submit" className="button-accent big wide"
        disabled={busy || !name.trim() || !agree}>
        {busy ? t("signin.creating") : t("signin.create")}
      </button>
      <div className="signin-links single">
        <button type="button" className="link-button" disabled={busy}
          onClick={() => props.onBack(null)}>
          {t("signin.another_email")}
        </button>
      </div>
    </form>
  );
}

/** A quick code for this device: typed once, then once more on the next
 * screen. */
function OfferStep(props: { name: string; fresh: boolean; onDone: () => void }) {
  const t = useT();
  /** The code typed the first time, while it is typed again. */
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);

  const startOver = (why: string) => {
    setFirst(null);
    setPin("");
    setProblem(why);
    setWrong((n) => n + 1);
  };

  const typed = async (value: string) => {
    setPin(value);
    if (value.length < PIN_DIGITS) return;
    if (first === null) {
      if (tooEasy(value)) {
        startOver(t("signin.pin_easy"));
        return;
      }
      setProblem(null);
      setFirst(value);
      setPin("");
      return;
    }
    if (value !== first) {
      startOver(t("signin.pin_mismatch"));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await setQuickCode(value);
      props.onDone();
    } catch (error) {
      setBusy(false);
      startOver(textOf(error, t));
    }
  };

  const again = first !== null;
  const greeting = props.fresh ? t("signin.welcome", { name: props.name })
    : t("signin.hello", { name: props.name });
  return (
    <form className="signin-form" onSubmit={(e) => e.preventDefault()}>
      {/* A new screen for the second time, the same input under it: the
          keyboard of a phone stays open. */}
      <h1 key={again ? "again" : "first"}>{again ? t("signin.pin_repeat") : greeting}</h1>
      <p className="signin-lead" aria-live="polite">
        {again ? t("signin.pin_repeat_lead") : t("signin.pin_offer_lead")}
      </p>
      <Slots count={PIN_DIGITS} secret value={pin}
        label={again ? t("signin.pin_repeat_label") : t("signin.pin_offer_label")}
        name={again ? "pin-again" : "pin"} autoComplete="off" busy={busy}
        wrong={wrong} onChange={(value) => void typed(value)} />
      {problem && <p className="signin-error" role="alert">{problem}</p>}
      <div className="signin-links single">
        <button type="button" className="link-button quiet" disabled={busy}
          onClick={props.onDone}>
          {t("signin.not_now")}
        </button>
      </div>
    </form>
  );
}

function PinStep(props: {
  device: KnownDevice;
  onIn: () => void;
  onCode: (email: string) => void;
  onEmail: (why: string | null) => void;
  onSwitch: () => void;
}) {
  const t = useT();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [wrong, setWrong] = useState(0);
  const checking = useRef(false);
  const first = props.device.name.split(/\s+/)[0] || props.device.name;

  const check = async (value: string) => {
    if (checking.current) return;
    checking.current = true;
    setBusy(true);
    setProblem(null);
    try {
      await quickSignIn(value);
      props.onIn();
    } catch (error) {
      if (error instanceof Refused && error.status === 410) {
        props.onEmail(error.message);
        return;
      }
      setPin("");
      setProblem(textOf(error, t));
      setWrong((n) => n + 1);
      setBusy(false);
      checking.current = false;
    }
  };

  /** A code from email to the device's address, at once. */
  const forgot = async () => {
    setAsking(true);
    setProblem(null);
    try {
      const sent = await askCode(props.device.email, t.lang);
      props.onCode(sent.email);
    } catch (error) {
      setProblem(textOf(error, t));
      setAsking(false);
    }
  };

  return (
    <form className="signin-form" onSubmit={(e) => {
      e.preventDefault();
      if (pin.length === PIN_DIGITS) void check(pin);
    }}>
      <h1>{t("signin.welcome_back", { name: first })}</h1>
      <p className="signin-lead">{t("signin.pin_lead")}</p>
      <Slots count={PIN_DIGITS} secret value={pin} label={t("signin.pin_label")} name="pin"
        autoComplete="off" busy={busy} wrong={wrong}
        onChange={(value) => {
          setPin(value);
          if (value.length === PIN_DIGITS) void check(value);
        }} />
      {problem && <p className="signin-error" role="alert">{problem}</p>}
      <div className="signin-links">
        <button type="button" className="link-button" disabled={asking || busy}
          onClick={() => void forgot()}>
          {t("signin.forgot")}
        </button>
        <button type="button" className="link-button" disabled={busy}
          onClick={props.onSwitch}>
          {t("signin.switch")}
        </button>
      </div>
    </form>
  );
}
