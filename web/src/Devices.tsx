// The browsers where the person signs in with a quick code, on the account
// page (from 0.0.10; a dialog of its own in 0.0.9; from 0.1.27 Settings ›
// Devices, whose window keeps the list over its sections). Forget one, and
// there it is email again; Forget all devices ends every session and
// forgets them all, so that one word means the same for one and for all.
// From 0.1.6 tTerm on a computer, signed in with the browser, is a device
// too: Forget signs it out, and it shows this computer only until it signs
// in again.

import { useState } from "react";
import { forgetAllDevices, forgetDevice, type Device } from "./api";
import { useT } from "./i18n";
import { Computer, Phone } from "./icons";
import { agoLong } from "./time";

interface Props {
  devices: Device[];
  /** One forgotten: the list goes on without it. */
  onForgotten: (id: string) => void;
  /** This browser is signed out now, and why. */
  onSignedOut: (note: string) => void;
  notify: (text: string) => void;
}

/** Phones and tablets by their label, as device_label() writes it. */
function handheld(label: string): boolean {
  return /iPhone|iPad|Android/.test(label);
}

export function DevicesSection(props: Props) {
  const t = useT();
  const { devices } = props;
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  const forget = async (device: Device) => {
    setProblem(null);
    try {
      const result = await forgetDevice(device.id);
      if (result.current) {
        props.onSignedOut(t("devices.this_forgotten"));
        return;
      }
      props.onForgotten(device.id);
      props.notify(device.kind === "app"
        ? t("devices.app_signed_out", { device: device.label })
        : t("devices.forgotten", { device: device.label }));
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  const forgetAll = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await forgetAllDevices();
      props.onSignedOut(t("devices.all_forgotten"));
    } catch (error) {
      setProblem((error as Error).message);
      setBusy(false);
    }
  };

  return (
    <section className="account-section" aria-labelledby="ac-devices">
      <div className="account-section-head">
        <h2 id="ac-devices">{t("devices.title")}</h2>
        <p>
          {t("devices.about")}
        </p>
        <p>
          {t("devices.idle")}
        </p>
      </div>
      <div className="account-card devices-card">
        {devices.length === 0 ? (
          <p className="devices-none">
            {t("devices.none")}
          </p>
        ) : (
          <ul className="device-list">
            {devices.map((device) => (
              <li key={device.id} className="device-row">
                <span className="device-icon" aria-hidden="true">
                  {handheld(device.label) ? <Phone size={17} />
                    : <Computer size={17} />}
                </span>
                <span className="device-text">
                  <strong>
                    {device.label}
                    {device.current && <span className="chip">{t("devices.this_device")}</span>}
                  </strong>
                  <span>
                    {device.kind === "app"
                      ? t("devices.app_times", { created: agoLong(device.createdAt, t),
                        used: agoLong(device.lastUsed, t) })
                      : t("devices.browser_times", { created: agoLong(device.createdAt, t),
                        used: agoLong(device.lastUsed, t) })}
                  </span>
                </span>
                <button type="button" className="button-plain small"
                  onClick={() => void forget(device)}>
                  {t("devices.forget")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="forget-all">
          <span className="forget-all-text">
            <strong>{t("devices.forget_all")}</strong>
            <span>
              {t("devices.forget_all_text")}
            </span>
          </span>
          {asking ? (
            <span className="button-row">
              <button type="button" className="button-danger big"
                disabled={busy} onClick={() => void forgetAll()}>
                {t("devices.forget_all")}
              </button>
              <button type="button" className="button-plain"
                onClick={() => setAsking(false)}>
                {t("common.cancel")}
              </button>
            </span>
          ) : (
            <button type="button" className="button-plain"
              onClick={() => setAsking(true)}>
              {t("devices.forget_all_ask")}
            </button>
          )}
        </div>
        {problem && <div className="error-box" role="alert">{problem}</div>}
      </div>
    </section>
  );
}
