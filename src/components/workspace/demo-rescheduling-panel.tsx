"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  getCurrentControlledVoiceAttemptAction,
  getControlledVoiceAttemptAction,
  startControlledVoiceAttemptAction,
  stopControlledVoiceAttemptAction,
  updateDemoReschedulingCaseAction,
} from "@/app/(workspace)/dashboard/actions";
import {
  isControlledVoiceAttemptActive,
  type ControlledVoiceAttempt,
  type ControlledVoiceAttemptTransportStatus,
} from "@/lib/controlled-voice-attempt";
import {
  MAX_CONTROLLED_VOICE_POLL_RETRIES,
  nextControlledVoicePollDelay,
} from "@/lib/controlled-voice-polling";
import {
  type DemoReschedulingAction,
  type DemoReschedulingCase,
  type DemoReschedulingCaseStatus,
  type DemoReschedulingSlot,
} from "@/lib/demo-rescheduling-types";
import { Icon, type IconName } from "./icon";

const controlledVoiceStatusLabels: Record<ControlledVoiceAttemptTransportStatus, string> = {
  requested: "Call requested",
  creating: "Creating call",
  creation_uncertain: "Checking call creation",
  initiated: "Call initiated",
  ringing: "Ringing",
  answered: "Connected",
  cancel_requested: "Ending call",
  completed: "Completed",
  busy: "Test phone busy",
  failed: "Failed",
  no_answer: "No answer",
  canceled: "Ended by staff",
  unknown: "Status unknown",
};

const reschedulingStatusDetails: Record<
  DemoReschedulingCaseStatus,
  { actionLabel: string; icon: IconName; label: string; triggerCopy: string }
> = {
  ready: {
    actionLabel: "Review rescheduling",
    icon: "warning",
    label: "Ready for review",
    triggerCopy: "Review the affected appointment before starting a fictional test call.",
  },
  calling: {
    actionLabel: "Open test call",
    icon: "phone",
    label: "Test call in progress",
    triggerCopy: "Test call in progress. No appointment change has been made.",
  },
  "proposal-ready": {
    actionLabel: "Review proposal",
    icon: "check",
    label: "Slot proposed for review",
    triggerCopy: "A replacement time is ready for staff review.",
  },
  "staff-review": {
    actionLabel: "Review staff follow-up",
    icon: "warning",
    label: "Staff review needed",
    triggerCopy: "The simulated outcome needs staff follow-up.",
  },
  rescheduled: {
    actionLabel: "Review new appointment",
    icon: "check",
    label: "Appointment rescheduled",
    triggerCopy: "The fictional appointment moved to the confirmed time.",
  },
  canceled: {
    actionLabel: "Review cancellation",
    icon: "warning",
    label: "Appointment canceled",
    triggerCopy: "The fictional appointment was removed from the active calendar.",
  },
};

function ReplacementSlotSummary({ slot }: { slot: DemoReschedulingSlot }) {
  return (
    <span className="demo-rescheduling-slot-summary">
      <strong><time>{slot.date} · {slot.time}</time></strong>
      <span>{slot.provider}</span>
    </span>
  );
}

function sameReschedulingCase(left: DemoReschedulingCase, right: DemoReschedulingCase) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function DemoReschedulingPanel({
  initialReschedulingCase,
}: {
  initialReschedulingCase: DemoReschedulingCase;
}) {
  const [reschedulingCase, setReschedulingCase] = useState(initialReschedulingCase);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState(
    initialReschedulingCase.selectedSlotId ?? initialReschedulingCase.slots[0]?.id ?? "",
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [isStartingVoice, setIsStartingVoice] = useState(false);
  const [isStoppingVoice, setIsStoppingVoice] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [voiceAttempt, setVoiceAttempt] = useState<ControlledVoiceAttempt | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [pollingPaused, setPollingPaused] = useState(false);
  const [pollRetryToken, setPollRetryToken] = useState(0);
  const [callConfirmationOpen, setCallConfirmationOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const callConfirmationRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (reviewOpen && !dialog.open) dialog.showModal();
    if (!reviewOpen && dialog.open) dialog.close();
  }, [reviewOpen]);

  useEffect(() => {
    const dialog = callConfirmationRef.current;
    if (!dialog) return;

    if (callConfirmationOpen && !dialog.open) dialog.showModal();
    if (!callConfirmationOpen && dialog.open) dialog.close();
  }, [callConfirmationOpen]);

  useEffect(() => {
    let disposed = false;

    void getCurrentControlledVoiceAttemptAction()
      .then((result) => {
        if (disposed || !result.ok) return;
        setReschedulingCase((current) => sameReschedulingCase(current, result.reschedulingCase)
          ? current
          : result.reschedulingCase);
        setVoiceAttempt((current) => (
          !current || current.id === result.attempt.id ? result.attempt : current
        ));
      })
      .catch(() => {
        // A missing local voice gateway should not block the dashboard.
      });

    return () => {
      disposed = true;
    };
  }, []);

  const activeVoiceAttemptId = voiceAttempt && isControlledVoiceAttemptActive(voiceAttempt)
    ? voiceAttempt.id
    : undefined;

  useEffect(() => {
    const attemptId = activeVoiceAttemptId;
    if (!attemptId) return;
    const activeAttemptId = attemptId;

    let stopped = false;
    let timeout: number | undefined;
    let gatewayFailureCount = 0;
    let refreshPending = false;

    function scheduleRefresh(id: string, delay: number) {
      if (stopped) return;
      if (document.hidden) {
        refreshPending = true;
        return;
      }
      timeout = window.setTimeout(() => void refreshVoiceAttempt(id), delay);
    }

    async function refreshVoiceAttempt(id: string) {
      let result;
      try {
        result = await getControlledVoiceAttemptAction(id);
      } catch {
        if (!stopped) {
          const delay = nextControlledVoicePollDelay("gateway_unavailable", gatewayFailureCount);
          if (delay === undefined) {
            setPollingPaused(true);
            setVoiceError(`The voice gateway did not respond after ${MAX_CONTROLLED_VOICE_POLL_RETRIES} retries. Retry the status check when the gateway is available.`);
            return;
          }
          setVoiceError("The voice gateway did not return a status. The dashboard will try again.");
          gatewayFailureCount += 1;
          scheduleRefresh(id, delay);
        }
        return;
      }
      if (stopped) return;

      if (result.ok) {
        gatewayFailureCount = 0;
        setPollingPaused(false);
        setVoiceError(null);
        setReschedulingCase((current) => sameReschedulingCase(current, result.reschedulingCase)
          ? current
          : result.reschedulingCase);
        setVoiceAttempt((current) => (
          current?.id === result.attempt.id && current.updatedAt === result.attempt.updatedAt
            ? current
            : result.attempt
        ));
        if (isControlledVoiceAttemptActive(result.attempt)) scheduleRefresh(id, 2_000);
        return;
      } else {
        if (result.code === "not_found") {
          setVoiceAttempt((current) => current?.id === id ? null : current);
          setVoiceError("The gateway restarted, so the last test call result is unavailable. Review a new test call to try again.");
          return;
        }

        setVoiceError(result.message);
        const delay = nextControlledVoicePollDelay(result.code, gatewayFailureCount);
        if (delay !== undefined) {
          gatewayFailureCount += 1;
          scheduleRefresh(id, delay);
        } else if (result.code === "gateway_unavailable") {
          setPollingPaused(true);
          setVoiceError(`The voice gateway did not respond after ${MAX_CONTROLLED_VOICE_POLL_RETRIES} retries. Retry the status check when the gateway is available.`);
        }
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        if (timeout !== undefined) window.clearTimeout(timeout);
        timeout = undefined;
        refreshPending = true;
        return;
      }
      if (refreshPending) {
        refreshPending = false;
        void refreshVoiceAttempt(activeAttemptId);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (document.hidden) refreshPending = true;
    else void refreshVoiceAttempt(activeAttemptId);
    return () => {
      stopped = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeVoiceAttemptId, pollRetryToken]);

  const selectedSlot = reschedulingCase.slots.find((slot) => slot.id === reschedulingCase.selectedSlotId);
  const statusDetails = reschedulingStatusDetails[reschedulingCase.status];

  async function applyAction(action: DemoReschedulingAction, slotId?: string) {
    setActionError(null);
    setIsUpdating(true);

    try {
      const result = await updateDemoReschedulingCaseAction(action, slotId);
      const nextCase = "reschedulingCase" in result ? result.reschedulingCase : result;
      setReschedulingCase(nextCase);
      setSelectedSlotId(nextCase.selectedSlotId ?? nextCase.slots[0]?.id ?? "");

      if ("ok" in result && !result.ok) setActionError(result.message);
      else if (action === "reset-demo") setVoiceAttempt(null);
    } catch {
      setActionError("The demo state could not be updated. Try the action again.");
    } finally {
      setIsUpdating(false);
    }
  }

  function closeReview() {
    setReviewOpen(false);
    setActionError(null);
  }

  function openCallConfirmation() {
    setVoiceError(null);
    setPollingPaused(false);
    setCallConfirmationOpen(true);
  }

  async function startControlledVoiceAttempt() {
    setVoiceError(null);
    setIsStartingVoice(true);

    try {
      const result = await startControlledVoiceAttemptAction(voiceAttempt?.callback?.status === "requested" ? voiceAttempt.id : undefined);
      if (result.ok) {
        setVoiceAttempt(result.attempt);
        setReschedulingCase(result.reschedulingCase);
        setCallConfirmationOpen(false);
      } else {
        setVoiceError(result.message);
      }
    } catch {
      setVoiceError("The controlled phone demo did not return a result. Check the test phone and gateway status.");
    } finally {
      setIsStartingVoice(false);
    }
  }

  async function stopControlledVoiceAttempt() {
    if (!voiceAttempt) return;

    setVoiceError(null);
    setIsStoppingVoice(true);

    try {
      const result = await stopControlledVoiceAttemptAction(voiceAttempt.id);
      if (result.ok) {
        setVoiceAttempt(result.attempt);
        setReschedulingCase(result.reschedulingCase);
      } else {
        setVoiceError(result.message);
      }
    } catch {
      setVoiceError("The controlled phone demo did not confirm the end request. Try to end the call again.");
    } finally {
      setIsStoppingVoice(false);
    }
  }

  const hasActiveVoiceAttempt = voiceAttempt ? isControlledVoiceAttemptActive(voiceAttempt) : false;
  const activeVoiceAttemptLabel = hasActiveVoiceAttempt && voiceAttempt
    ? controlledVoiceStatusLabels[voiceAttempt.transportStatus]
    : undefined;

  return (
    <>
      <section className="demo-rescheduling-trigger" aria-labelledby="rescheduling-trigger-heading">
        <div className="demo-rescheduling-trigger-icon" data-state={reschedulingCase.status}>
          <Icon name={statusDetails.icon} size={20} />
        </div>
        <div className="demo-rescheduling-trigger-copy">
          <div className="demo-rescheduling-trigger-heading">
            <h2 id="rescheduling-trigger-heading">Schedule change needs review</h2>
            <span className="demo-rescheduling-status" data-state={reschedulingCase.status}>{statusDetails.label}</span>
          </div>
          <p>{reschedulingCase.provider} is unavailable on {reschedulingCase.unavailableDate}. One appointment needs a new time.</p>
          <small>{activeVoiceAttemptLabel ? `Phone demo: ${activeVoiceAttemptLabel}.` : statusDetails.triggerCopy}</small>
        </div>
        <button
          type="button"
          className="button button-primary demo-rescheduling-trigger-action"
          title="Review the fictional automated calling demo before taking any action."
          onClick={() => setReviewOpen(true)}
        >
          {hasActiveVoiceAttempt ? "Open live call" : statusDetails.actionLabel}<Icon name="chevron-right" size={16} />
        </button>
      </section>

      <dialog
        ref={dialogRef}
        className="demo-rescheduling-dialog"
        aria-labelledby="demo-rescheduling-dialog-heading"
        onCancel={(event) => {
          event.preventDefault();
          closeReview();
        }}
        onClose={() => setReviewOpen(false)}
      >
        <div className="demo-rescheduling-dialog-header">
          <div>
            <h2 id="demo-rescheduling-dialog-heading">Review automated rescheduling</h2>
            <p>Demo mode uses fictional data. The on-screen simulation does not call anyone. The phone demo needs separate confirmation.</p>
          </div>
          <button type="button" className="icon-button demo-rescheduling-dialog-close" aria-label="Close rescheduling review" onClick={closeReview}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="demo-rescheduling-dialog-content">
          <dl className="demo-rescheduling-facts">
            <div><dt>Patient</dt><dd>{reschedulingCase.patient}</dd></div>
            <div><dt>Current visit</dt><dd>{reschedulingCase.originalAppointment}</dd></div>
            <div><dt>Appointment</dt><dd>{reschedulingCase.appointmentType} · {reschedulingCase.durationMinutes} min</dd></div>
            <div><dt>Calling window</dt><dd>{reschedulingCase.callingWindow}</dd></div>
          </dl>

          <section className="demo-rescheduling-options" aria-labelledby="approved-slots-heading">
            <h3 id="approved-slots-heading">Approved replacement times</h3>
            <ul>
              {reschedulingCase.slots.map((slot) => (
                <li key={slot.id}>
                  <ReplacementSlotSummary slot={slot} />
                </li>
              ))}
            </ul>
          </section>

          <section className="demo-rescheduling-live-call" aria-labelledby="live-call-heading">
            <div className="demo-rescheduling-live-call-heading">
              <div>
                <h3 id="live-call-heading">Live phone demo</h3>
                <p>Calls only your configured test phone. It is billable and can change only Olivia’s fictional appointment.</p>
              </div>
              {voiceAttempt ? <span className="demo-rescheduling-status" data-state={voiceAttempt.transportStatus}>{controlledVoiceStatusLabels[voiceAttempt.transportStatus]}</span> : null}
            </div>

            {voiceAttempt ? (
              <ol className="demo-rescheduling-live-activity" aria-label="Redacted phone demo activity">
                {voiceAttempt.events.slice(0, 8).map((event) => <li key={event.id}>{event.label}</li>)}
              </ol>
            ) : null}

            {voiceAttempt?.callback ? (
              <p>Callback {voiceAttempt.callback.status === "requested" ? "requested" : "started"}: {voiceAttempt.callback.date} at {voiceAttempt.callback.time}{voiceAttempt.callback.timeEnd ? `–${voiceAttempt.callback.timeEnd}` : ""} ({voiceAttempt.callback.timeZone}). This demo requires an operator to start the callback.</p>
            ) : null}
            {voiceAttempt?.cooldownUntil ? (
              <p>Next test call available after {new Date(voiceAttempt.cooldownUntil).toLocaleTimeString()}.</p>
            ) : null}
            <div className="demo-rescheduling-actions">
              {pollingPaused && hasActiveVoiceAttempt ? (
                <button type="button" className="button button-secondary" onClick={() => { setPollingPaused(false); setVoiceError(null); setPollRetryToken((token) => token + 1); }}>
                  Retry status
                </button>
              ) : null}
              {hasActiveVoiceAttempt ? (
                <button type="button" className="button button-secondary" disabled={isStoppingVoice} onClick={() => void stopControlledVoiceAttempt()}>
                  {isStoppingVoice ? "Ending test call" : "End test call"}
                </button>
              ) : (
                <button type="button" className="button button-primary" disabled={isStartingVoice} onClick={openCallConfirmation}>
                  <Icon name="phone" size={16} />{voiceAttempt?.callback?.status === "requested" ? "Review callback" : "Review test call"}
                </button>
              )}
            </div>

            <p className="sr-only" role="status" aria-live="polite">
              {voiceError ?? (activeVoiceAttemptLabel ? `Phone demo status: ${activeVoiceAttemptLabel}. ${voiceAttempt?.events[0]?.label ?? ""}` : "Phone demo ready.")}
            </p>
            {voiceError ? <p className="demo-rescheduling-error" role="alert">{voiceError}</p> : null}
          </section>

          {reschedulingCase.status === "ready" ? (
            <section className="demo-rescheduling-stage">
              <h3>Ready to test</h3>
              <p>Start an on-screen simulation. You will choose its simulated outcome in the next step.</p>
              <div className="demo-rescheduling-actions">
                <button type="button" className="button button-secondary" onClick={closeReview}>Back</button>
                <button type="button" className="button button-primary" disabled={isUpdating} onClick={() => void applyAction("start-test-call")}>
                  <Icon name="phone" size={16} />{isUpdating ? "Starting simulation" : "Start on-screen simulation"}
                </button>
              </div>
            </section>
          ) : null}

          {reschedulingCase.status === "calling" ? (
            <section className="demo-rescheduling-stage" aria-labelledby="simulated-reply-heading">
              <h3 id="simulated-reply-heading">Simulated patient reply</h3>
              <p>Choose the time the fictional patient accepts. This only creates a staff-review proposal.</p>
              <fieldset className="demo-rescheduling-choice-list" disabled={isUpdating}>
                <legend>Replacement time</legend>
                {reschedulingCase.slots.map((slot) => (
                  <label className="demo-rescheduling-choice" key={slot.id}>
                    <input type="radio" name="demo-slot" value={slot.id} checked={selectedSlotId === slot.id} onChange={() => setSelectedSlotId(slot.id)} />
                    <ReplacementSlotSummary slot={slot} />
                  </label>
                ))}
              </fieldset>
              <div className="demo-rescheduling-actions">
                <button type="button" className="button button-secondary" disabled={isUpdating} onClick={() => void applyAction("record-staff-handoff")}>Record staff handoff</button>
                <button type="button" className="button button-primary" disabled={isUpdating} onClick={() => void applyAction("record-selected-slot", selectedSlotId)}>
                  {isUpdating ? "Saving outcome" : "Record selected slot"}
                </button>
              </div>
            </section>
          ) : null}

          {reschedulingCase.status === "proposal-ready" ? (
            <section className="demo-rescheduling-stage demo-rescheduling-outcome" aria-live="polite">
              <Icon name="check" size={20} />
              <div>
                <h3>Slot proposed for staff review</h3>
                <p>{selectedSlot ? `${selectedSlot.date} at ${selectedSlot.time} with ${selectedSlot.provider}.` : "A selected slot is ready for review."} The original appointment remains unchanged.</p>
              </div>
              <div className="demo-rescheduling-actions">
                <Link href={`/calendar?selected=appointment:${reschedulingCase.appointmentId}`} className="button button-secondary">Open appointment</Link>
                <button type="button" className="button button-primary" disabled={isUpdating} onClick={() => void applyAction("reset-demo")}>Reset demo</button>
              </div>
            </section>
          ) : null}

          {reschedulingCase.status === "staff-review" ? (
            <section className="demo-rescheduling-stage demo-rescheduling-outcome" data-outcome="staff-review" aria-live="polite">
              <Icon name="warning" size={20} />
              <div>
                <h3>Staff follow-up recorded</h3>
                <p>The fictional patient needs staff help. The original appointment remains unchanged.</p>
              </div>
              <div className="demo-rescheduling-actions">
                <button type="button" className="button button-secondary" onClick={closeReview}>Close review</button>
                <button type="button" className="button button-primary" disabled={isUpdating} onClick={() => void applyAction("reset-demo")}>Reset demo</button>
              </div>
            </section>
          ) : null}

          {reschedulingCase.status === "rescheduled" ? (
            <section className="demo-rescheduling-stage demo-rescheduling-outcome" aria-live="polite">
              <Icon name="check" size={20} />
              <div>
                <h3>Fictional appointment rescheduled</h3>
                <p>{reschedulingCase.originalAppointment} with {reschedulingCase.provider}. The old time is available again.</p>
              </div>
              <div className="demo-rescheduling-actions">
                <Link href={`/calendar?selected=appointment:${reschedulingCase.appointmentId}`} className="button button-secondary">Open appointment</Link>
                <button type="button" className="button button-primary" disabled={isUpdating} onClick={() => void applyAction("reset-demo")}>Reset demo</button>
              </div>
            </section>
          ) : null}

          {reschedulingCase.status === "canceled" ? (
            <section className="demo-rescheduling-stage demo-rescheduling-outcome" data-outcome="staff-review" aria-live="polite">
              <Icon name="warning" size={20} />
              <div>
                <h3>Fictional appointment canceled</h3>
                <p>The appointment left the active calendar. The time is available, and the cancellation record remains in demo activity.</p>
              </div>
              <div className="demo-rescheduling-actions">
                <button type="button" className="button button-secondary" onClick={closeReview}>Close review</button>
                <button type="button" className="button button-primary" disabled={isUpdating} onClick={() => void applyAction("reset-demo")}>Reset demo</button>
              </div>
            </section>
          ) : null}

          {actionError ? <p className="demo-rescheduling-error" role="alert">{actionError}</p> : null}

          <section className="demo-rescheduling-activity" aria-labelledby="demo-activity-heading">
            <h3 id="demo-activity-heading">Demo activity</h3>
            <ol>
              {reschedulingCase.activity.map((event) => (
                <li key={event.id} data-tone={event.tone}>{event.label}</li>
              ))}
            </ol>
          </section>
        </div>
      </dialog>

      <dialog
        ref={callConfirmationRef}
        className="demo-rescheduling-call-confirmation"
        aria-labelledby="call-confirmation-heading"
        onCancel={(event) => {
          event.preventDefault();
          setCallConfirmationOpen(false);
        }}
        onClose={() => setCallConfirmationOpen(false)}
      >
        <h2 id="call-confirmation-heading">Call your test phone?</h2>
        <p>This creates one billable call to the configured test number. It can reschedule or cancel only Olivia’s fictional appointment.</p>
        <div className="demo-rescheduling-actions">
          <button type="button" className="button button-secondary" disabled={isStartingVoice} onClick={() => setCallConfirmationOpen(false)}>Back</button>
          <button type="button" className="button button-primary" disabled={isStartingVoice} onClick={() => void startControlledVoiceAttempt()}>
            <Icon name="phone" size={16} />{isStartingVoice ? "Starting call" : "Call my test phone"}
          </button>
        </div>
      </dialog>
    </>
  );
}
