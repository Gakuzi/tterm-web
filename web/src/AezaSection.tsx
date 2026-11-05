// Personal Cloud Hosting & VPS Management Section (Aeza Cloud).
// Stores hosting credentials strictly in the personal user profile / vault.
// Shared project collaborators NEVER have access to hoster API keys or billing.

import { useEffect, useState } from "react";
import {
  deleteAezaConfig,
  getAezaAccount,
  getAezaConfig,
  getAezaPlans,
  listAezaServices,
  orderAezaVps,
  saveAezaConfig,
  type AezaAccountInfo,
  type AezaConfigStatus,
  type AezaPlan,
} from "./api";
import { copyToClipboard } from "./clipboard";
import {
  Check,
  Copy,
  Key,
  Lock,
  Plus,
  Restart,
  Server,
  Spark,
  Trash,
  Unlock,
} from "./icons";
import { Group, Row } from "./SettingsRows";

interface Props {
  notify: (text: string) => void;
  onOpenDeployModal?: (initialIp?: string) => void;
  compact?: boolean;
}

export function AezaSection(props: Props) {
  const { notify, onOpenDeployModal } = props;

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AezaConfigStatus | null>(null);
  const [account, setAccount] = useState<AezaAccountInfo | null>(null);
  const [plans, setPlans] = useState<AezaPlan[]>([]);
  const [services, setServices] = useState<any[]>([]);

  // API Key Form State
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isDeletingKey, setIsDeletingKey] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // VPS Ordering State
  const [selectedPlanId, setSelectedPlanId] = useState<number>(52); // MSKs-1
  const [orderHours, setOrderHours] = useState<number>(5);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  const loadAll = async () => {
    try {
      setErrorMsg(null);
      const cfg = await getAezaConfig();
      setConfig(cfg);

      if (cfg.configured) {
        // Fetch account details, plans, and active VPS instances in parallel
        const [accRes, plansRes, srvRes] = await Promise.allSettled([
          getAezaAccount(),
          getAezaPlans(true),
          listAezaServices(),
        ]);

        if (accRes.status === "fulfilled" && accRes.value.ok && accRes.value.account) {
          setAccount(accRes.value.account);
        }
        if (plansRes.status === "fulfilled" && plansRes.value.ok && plansRes.value.plans) {
          setPlans(plansRes.value.plans);
          if (plansRes.value.plans.length > 0 && !selectedPlanId) {
            setSelectedPlanId(plansRes.value.plans[0].id);
          }
        }
        if (srvRes.status === "fulfilled" && srvRes.value.ok && srvRes.value.services) {
          setServices(srvRes.value.services);
        }
      } else {
        setAccount(null);
        setServices([]);
      }
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const handleSaveKey = async () => {
    const cleanKey = apiKeyInput.trim();
    if (!cleanKey) {
      setErrorMsg("Пожалуйста, введите API-ключ Aeza"); // i18n-ignore
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsSavingKey(true);
    try {
      const res = await saveAezaConfig(cleanKey);
      if (res.ok) {
        notify("API-ключ Aeza успешно сохранен и привязан к вашему профилю!"); // i18n-ignore
        setSuccessMsg("Ключ успешно верифицирован в Aeza"); // i18n-ignore
        setApiKeyInput("");
        setIsEditingKey(false);
        void loadAll();
      } else {
        setErrorMsg(res.error || "Не удалось проверить ключ в Aeza. Убедитесь в корректности токена."); // i18n-ignore
      }
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!window.confirm("Удалить сохраненный API-ключ Aeza из вашего личного профиля?")) return; // i18n-ignore
    setIsDeletingKey(true);
    setErrorMsg(null);
    try {
      await deleteAezaConfig();
      notify("API-ключ Aeza удален из профиля"); // i18n-ignore
      setConfig({ ok: true, configured: false, masked_key: null });
      setAccount(null);
      setServices([]);
      setIsEditingKey(false);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setIsDeletingKey(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAll();
    notify("Данные хостинга обновлены"); // i18n-ignore
  };

  const handleCopy = async (text: string, id: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedIp(id);
      notify("IP-адрес скопирован в буфер обмена"); // i18n-ignore
      setTimeout(() => setCopiedIp(null), 2000);
    }
  };

  const handleOrderVps = async () => {
    setIsOrdering(true);
    setErrorMsg(null);
    setOrderResult(null);
    try {
      const res = await orderAezaVps({
        name: "tterm-vps", // i18n-ignore
        product_id: selectedPlanId,
        hours: orderHours,
      });
      if (res.ok) {
        setOrderResult(res.order);
        notify("VPS успешно заказан! Создание сервера в процессе..."); // i18n-ignore
        void loadAll();
      } else {
        setErrorMsg(res.error || "Ошибка заказа VPS. Проверьте баланс аккаунта."); // i18n-ignore
      }
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setIsOrdering(false);
    }
  };

  const extractServiceIp = (s: any): string => {
    if (s.ip) return s.ip;
    if (Array.isArray(s.ips) && s.ips.length > 0) return s.ips[0].ip || s.ips[0];
    if (s.parameters?.ip) return s.parameters.ip;
    if (s.details?.ip) return s.details.ip;
    return "IP назначается..."; // i18n-ignore
  };

  const currentPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];
  const hourRate = currentPlan?.hour_price_rub || 1.40;
  const totalPrice = (hourRate * orderHours).toFixed(2);

  return (
    <>
      <Group
        title="Хостинг и VPS (Aeza Cloud)" // i18n-ignore
        note="Персональные настройки почасового хостинга. Ваши API-ключи и средства защищены в личном профиле и недоступны участникам общих проектов." // i18n-ignore
      >
        {/* Alerts */}
        {errorMsg && (
          <Row label="" after={<div className="error-box" role="alert">{errorMsg}</div>}>
            <span />
          </Row>
        )}
        {successMsg && (
          <Row label="" after={<div className="success-box" style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", color: "#10b981", fontSize: 13 }}>{successMsg}</div>}>
            <span />
          </Row>
        )}

        {/* 1. API Key Row */}
        <Row
          label="API-ключ Aeza" // i18n-ignore
          note={
            config?.configured && !isEditingKey
              ? "Хранится в личном защищенном хранилище" // i18n-ignore
              : "Личный ключ из панели https://my.aeza.ru (Настройки -> API)" // i18n-ignore
          }
          labelNode={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Key size={15} />
              <span>API-ключ Aeza {/* i18n-ignore */}</span>
              {config?.configured && (
                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(16,185,129,0.2)", color: "#10b981", fontWeight: 600 }}>
                  Защищен {/* i18n-ignore */}
                </span>
              )}
            </span>
          }
        >
          {loading ? (
            <span className="spinner" />
          ) : config?.configured && !isEditingKey ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="settings-value" style={{ fontFamily: "monospace", fontSize: 13 }}>
                {config.masked_key || "••••••••••••••••"}
              </span>
              <button
                type="button"
                className="button-plain small"
                onClick={() => {
                  setApiKeyInput("");
                  setIsEditingKey(true);
                }}
              >
                Изменить {/* i18n-ignore */}
              </button>
              <button
                type="button"
                className="button-plain small quiet"
                disabled={isDeletingKey}
                onClick={() => void handleDeleteKey()}
                style={{ color: "#ef4444" }}
              >
                <Trash size={13} />
                Удалить {/* i18n-ignore */}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 440 }}>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="text-input"
                    style={{ width: "100%", paddingRight: 32, fontFamily: "monospace" }}
                    placeholder="1404_2fd3f63e0ec3..." // i18n-ignore
                    value={apiKeyInput}
                    disabled={isSavingKey}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleSaveKey();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="icon-button small"
                    style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", opacity: 0.7 }}
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? "Скрыть" : "Показать"} // i18n-ignore
                  >
                    {showPassword ? <Unlock size={14} /> : <Lock size={14} />}
                  </button>
                </div>
                <button
                  type="button"
                  className="button-accent"
                  disabled={isSavingKey || !apiKeyInput.trim()}
                  onClick={() => void handleSaveKey()}
                >
                  {isSavingKey ? "Проверка..." /* i18n-ignore */ : "Сохранить" /* i18n-ignore */}
                </button>
                {config?.configured && (
                  <button
                    type="button"
                    className="button-plain quiet"
                    disabled={isSavingKey}
                    onClick={() => {
                      setIsEditingKey(false);
                      setApiKeyInput("");
                    }}
                  >
                    Отмена {/* i18n-ignore */}
                  </button>
                )}
              </div>
            </div>
          )}
        </Row>

        {/* 2. Account Balance Card */}
        {config?.configured && (
          <Row
            label="Баланс и аккаунт" // i18n-ignore
            note={account?.email ? `Привязан к ${account.email}` : "Личный лицевой счет в Aeza"} // i18n-ignore
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                padding: "8px 14px",
                borderRadius: 8,
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
              }}>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
                  Баланс: {/* i18n-ignore */}
                </span>
                <strong style={{ fontSize: 16, color: "#10b981", fontWeight: 700 }}>
                  {account?.balance_rub !== undefined
                    ? `${account.balance_rub.toFixed(2)} ₽` // i18n-ignore
                    : "— ₽"} {/* i18n-ignore */}
                </strong>
                <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(16,185,129,0.2)", color: "#10b981" }}>
                  {account?.status || "active"} {/* i18n-ignore */}
                </span>
              </div>
              <button
                type="button"
                className="button-plain small"
                disabled={isRefreshing}
                onClick={() => void handleRefresh()}
                title="Обновить баланс и список серверов" // i18n-ignore
              >
                <Restart size={13} />
                {isRefreshing ? "Обновление..." /* i18n-ignore */ : "Обновить" /* i18n-ignore */}
              </button>
            </div>
          </Row>
        )}

        {/* 3. Active VPS Servers List */}
        {config?.configured && (
          <Row
            label="Активные VPS" // i18n-ignore
            note={`${services.length} ${services.length === 1 ? "сервер" : "серверов"} в аккаунте`} // i18n-ignore
          >
            {services.length === 0 ? (
              <span className="settings-value muted" style={{ fontSize: 13 }}>
                Активных VPS серверов нет. Вы можете заказать сервер ниже. {/* i18n-ignore */}
              </span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 500 }}>
                {services.map((s, idx) => {
                  const ip = extractServiceIp(s);
                  const isCopied = copiedIp === `srv-${s.id || idx}`;
                  return (
                    <div
                      key={s.id || idx}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Server size={16} />
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <strong style={{ fontSize: 13 }}>{s.name || `VPS #${s.id}`}</strong>
                            <span style={{
                              fontSize: 10,
                              padding: "1px 5px",
                              borderRadius: 4,
                              background: s.status === "active" ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)",
                              color: s.status === "active" ? "#10b981" : "#f59e0b",
                            }}>
                              {s.status || "active"} {/* i18n-ignore */}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                            <code style={{ fontSize: 12, color: "#60a5fa" }}>{ip}</code>
                            {ip && ip !== "IP назначается..." && (
                              <button
                                type="button"
                                className="icon-button small"
                                style={{ padding: 2 }}
                                onClick={() => void handleCopy(ip, `srv-${s.id || idx}`)}
                                title="Скопировать IP" // i18n-ignore
                              >
                                {isCopied ? <Check size={12} /> : <Copy size={12} />}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button
                          type="button"
                          className="button-accent small"
                          onClick={() => {
                            if (onOpenDeployModal) {
                              onOpenDeployModal(ip);
                            } else {
                              notify(`Выбран сервер ${ip} для развертывания`); // i18n-ignore
                            }
                          }}
                        >
                          <Spark size={12} />
                          Развернуть {/* i18n-ignore */}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Row>
        )}

        {/* 4. Hourly VPS Ordering */}
        {config?.configured && (
          <Row
            label="Заказ почасового VPS" // i18n-ignore
            note="Быстрый запуск изолированного сервера для тестирования или развертывания" // i18n-ignore
          >
            <div style={{
              padding: "14px",
              borderRadius: 8,
              background: "rgba(59, 130, 246, 0.06)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              width: "100%",
              maxWidth: 480,
            }}>
              {/* Plan Choice */}
              <div>
                <label style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 4 }}>
                  Тарифный план: {/* i18n-ignore */}
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={`button-plain small ${selectedPlanId === 52 ? "active" : ""}`}
                    style={{
                      border: selectedPlanId === 52 ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.1)",
                      background: selectedPlanId === 52 ? "rgba(59,130,246,0.15)" : undefined,
                    }}
                    onClick={() => setSelectedPlanId(52)}
                  >
                    MSKs-1 (1 vCPU, 2GB RAM, 30GB NVMe) • 1.40 ₽/ч {/* i18n-ignore */}
                  </button>
                  {plans.filter((p) => p.id !== 52 && p.hour_price_rub && p.hour_price_rub <= 5).slice(0, 2).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`button-plain small ${selectedPlanId === p.id ? "active" : ""}`}
                      style={{
                        border: selectedPlanId === p.id ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.1)",
                        background: selectedPlanId === p.id ? "rgba(59,130,246,0.15)" : undefined,
                      }}
                      onClick={() => setSelectedPlanId(p.id)}
                    >
                      {p.name} ({p.cpu} CPU, {p.ram_gb}GB) • {p.hour_price_rub} ₽/ч {/* i18n-ignore */}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hours Choice */}
              <div>
                <label style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block", marginBottom: 4 }}>
                  Длительность аренды: {/* i18n-ignore */}
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1, 3, 5, 12, 24].map((hrs) => (
                    <button
                      key={hrs}
                      type="button"
                      className={`button-plain small ${orderHours === hrs ? "active" : ""}`}
                      style={{
                        flex: 1,
                        justifyContent: "center",
                        border: orderHours === hrs ? "1px solid #3b82f6" : "1px solid rgba(255,255,255,0.1)",
                        background: orderHours === hrs ? "rgba(59,130,246,0.15)" : undefined,
                      }}
                      onClick={() => setOrderHours(hrs)}
                    >
                      {hrs} ч. {/* i18n-ignore */}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary and Order Button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div>
                  <span style={{ fontSize: 11, color: "var(--color-text-secondary, #888)", display: "block" }}>
                    К списанию с баланса: {/* i18n-ignore */}
                  </span>
                  <strong style={{ fontSize: 15, color: "#60a5fa" }}>
                    {totalPrice} ₽ ({orderHours} ч.) {/* i18n-ignore */}
                  </strong>
                </div>

                <button
                  type="button"
                  className="button-accent"
                  disabled={isOrdering}
                  onClick={() => void handleOrderVps()}
                >
                  <Plus size={14} />
                  {isOrdering ? "Заказ сервера..." /* i18n-ignore */ : `Заказать VPS (${totalPrice} ₽)` /* i18n-ignore */}
                </button>
              </div>

              {orderResult && (
                <div style={{ padding: "8px 12px", borderRadius: 6, background: "rgba(16, 185, 129, 0.15)", border: "1px solid #10b981", fontSize: 12 }}>
                  <strong style={{ color: "#10b981", display: "block", marginBottom: 2 }}>
                    ✅ Сервер успешно заказан! {/* i18n-ignore */}
                  </strong>
                  <span>Инициализация занимает 1-2 минуты. Он появится в списке серверов выше. {/* i18n-ignore */}</span>
                </div>
              )}
            </div>
          </Row>
        )}
      </Group>

      {/* Prominent One-Click Deploy CTA */}
      <div
        style={{
          marginTop: 20,
          padding: "16px 20px",
          borderRadius: 10,
          background: "linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Spark size={18} />
            <strong style={{ fontSize: 15 }}>
              Развертывание tTerm в облаке (One-Click Deploy) {/* i18n-ignore */}
            </strong>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary, #888)", lineHeight: 1.4 }}>
            Автоматическая установка и запуск собственного экземпляра tTerm Web на вашем VPS в один клик. {/* i18n-ignore */}
          </p>
        </div>

        <button
          type="button"
          className="button-accent"
          style={{ padding: "10px 18px", fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8 }}
          onClick={() => {
            const primaryIp = services[0] ? extractServiceIp(services[0]) : undefined;
            if (onOpenDeployModal) {
              onOpenDeployModal(primaryIp && primaryIp !== "IP назначается..." ? primaryIp : undefined);
            } else {
              notify(primaryIp && primaryIp !== "IP назначается..."
                ? `Сервер готов к развертыванию: ${primaryIp}` // i18n-ignore
                : "Закажите VPS сервер для мгновенного развертывания tTerm"); // i18n-ignore
            }
          }}
        >
          <span>🚀 Развернуть сервис на VPS (One-Click Deploy) {/* i18n-ignore */}</span>
        </button>
      </div>
    </>
  );
}
