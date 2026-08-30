# Appointment Rescheduling

This context covers automated calls that collect a patient's preferred replacement time for an existing appointment.

## Language

**Patient**:
The named person whose dental appointment needs a new time.
_Avoid_: Appointment manager, call recipient

**Automated scheduling call**:
An outbound call from the dental service to a named patient about changing an appointment time.
_Avoid_: Test-phone conversation, appointment-manager call

**Fictional voice demo**:
A non-production scheduling simulation that uses invented patient and appointment data. It permits complete call measurement for evaluation.
_Avoid_: Production dental workflow, private patient call

**Scheduling dialogue**:
A flexible conversation that helps the patient reschedule. The scheduling system controls identity, availability, confirmation, and appointment changes.
_Avoid_: Fixed call script, unrestricted agent action

**Controlled destination**:
The configured phone number that can receive calls from the fictional voice demo.
_Avoid_: Arbitrary patient number, production destination

**Call evidence record**:
The correlated audio, transcript, timing, event, tool, failure, and outcome data retained for one fictional call.
_Avoid_: Partial debug log, production patient record

**Rescheduling case**:
One affected appointment with its patient, current visit, provider, and permitted replacement times.
_Avoid_: Generic call context

**Replacement time**:
A date and time that the dental service can offer for the rescheduled appointment.
_Avoid_: Model-generated time

**Patient preference**:
A date, time, or scheduling window that the patient says they can attend.
_Avoid_: Replacement time, unless the scheduling system confirms availability

**Confirmed reschedule**:
A fictional appointment change saved after the patient confirms an available replacement time.
_Avoid_: Staff-review proposal

**Generic callback request**:
A voicemail message that identifies the clinic without naming the patient, appointment, or rescheduling reason.
_Avoid_: Appointment voicemail, rescheduling voicemail

**Availability horizon**:
The rolling 21-day period in which the demo can find a replacement time.
_Avoid_: Full calendar, unlimited search window

**Clinic time**:
The `America/New_York` time used to interpret and speak dates during the demo.
_Avoid_: Caller device time, server time

**Eligible free time**:
An open time within clinic hours that satisfies the appointment and provider requirements.
_Avoid_: Any calendar gap, another patient's appointment data

**Atomic reschedule**:
A confirmed change that moves the fictional appointment and releases its old time as one operation.
_Avoid_: Partial appointment update

**Provider preference**:
The patient's choice to keep the current provider or accept another qualified provider for earlier availability.
_Avoid_: Automatic provider switch

**Suggested times**:
The next three eligible free times selected from the patient's provider preference.
_Avoid_: Unavailable times, model-generated times

**Callback window**:
A time range when the patient permits the dental service to call again.
_Avoid_: Replacement time

**Reschedule audit**:
The old and new appointment times, providers, call attempt, confirmation time, and outcome kept after a reschedule.
_Avoid_: Call transcript

**Final confirmation**:
The patient's clear approval after hearing the exact old appointment and proposed new date, time, and provider.
_Avoid_: Inferred approval, partial confirmation

**Relative date**:
A patient date expression resolved from the call date in clinic time and repeated as an absolute date before confirmation.
_Avoid_: Unconfirmed model date

**Availability authority**:
The scheduling system that decides whether a requested date and time is an eligible free time.
_Avoid_: Language model availability, calendar guess

**Staff follow-up**:
An outcome that asks the dental team to handle a request the automated call cannot complete safely.
_Avoid_: Automatic appointment change, silent failure

**Cancellation**:
A confirmed soft delete that removes the appointment from the active calendar, frees its time, and preserves its record.
_Avoid_: Hard delete, automatic cancellation

**Cancellation audit**:
The appointment details, call attempt, confirmation time, and outcome kept after a cancellation.
_Avoid_: Call transcript, deleted history
