# Voice-agent compliance and launch checklist

**Research checked:** 9 August 2026  
**Scope:** US and India outbound dental appointment-rescheduling calls.  
**Status:** Product research, not legal advice. Obtain local counsel and carrier approval before launch.

## Decision summary

Do not treat this as a simple appointment-reminder bot.

An AI voice is an **artificial voice** under the US TCPA rules. The FCC says this includes current AI voices that generate human speech. [FCC declaratory ruling](https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf)

Use this safer first release design:

1. Get documented patient consent for automated or AI appointment calls.
2. Never add sales, billing, collection, or promotional content.
3. Verify the recipient before discussing appointment details.
4. Do not record or transcribe before a lawful recording-consent step.
5. Let the patient stop calls at any time. Apply the stop immediately.
6. Use a carrier-approved identity and route in each launch country.
7. Send complex, unsafe, or disputed cases to staff.

The narrow healthcare exceptions can support short notifications. They are a poor base for a multi-turn rescheduling call. Get counsel approval before relying on one.

## 1. United States: TCPA and FCC rules

### AI calls count as artificial-voice calls

The FCC ruled that AI-generated human voices fall within the TCPA term "artificial or prerecorded voice." The ordinary TCPA consent rules therefore apply unless an emergency or a specific exception applies. [FCC ruling](https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf)

For a mobile number, the default rule bars a non-emergency artificial-voice call without the called party's prior express consent. It also protects hospital emergency lines and patient rooms. [47 CFR 64.1200(a)(1)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)

For telemarketing or advertising, prior express **written** consent is required. A rescheduling call must not sell treatment, advertise a promotion, discuss billing, or offer an upgrade. [47 CFR 64.1200(a)(2)-(3), (f)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)

Record proof of consent. Store the patient, number, language, disclosure text, date, source, and withdrawal state. Do not make consent a condition of treatment.

### Healthcare exceptions are narrow

The wireless healthcare exception has strict conditions. The call must:

- go only to the wireless number supplied by the patient;
- identify the provider and give contact details at the start;
- stay within listed healthcare purposes, including appointment and exam confirmations and reminders;
- contain no telemarketing, solicitation, advertising, billing, collection, or financial content;
- comply with HIPAA;
- remain concise, generally one minute or less;
- stay below one message per day and three combined voice or text messages per week; and
- give an easy opt-out and honor it immediately.

The exception also requires that the call not charge the patient or count against plan limits. [47 CFR 64.1200(a)(9)(iv)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)

The residential healthcare-message exception also limits calls to one per day and three combined calls per week. It requires opt-out handling. [47 CFR 64.1200(a)(3)(v)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)

The list names confirmations and reminders. It does not expressly name a long conversation that negotiates a new time. A normal AI rescheduling call can exceed one minute. Treat this exception as legally uncertain for that workflow.

Use prior express consent for the AI call. Ask US counsel to approve any exception-based workflow.

### Identity, callback, and opt-out

Every artificial or prerecorded voice message must name the responsible business at the start. It must give a usable telephone number during or after the message. [47 CFR 64.1200(b)(1)-(2)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)

For an exempt residential call, provide an automated spoken or keypad opt-out. Give short instructions within two seconds after the identity statement. A voicemail must give a toll-free number that reaches the same automated opt-out method. [47 CFR 64.1200(b)(3)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)

Build the voice flow to recognize "stop," "do not call," "unsubscribe," and equivalent phrases. Stop queued work before ending the call. The healthcare wireless exception requires immediate action. The general federal consent-revocation limit is ten business days. [47 CFR 64.1200(a)(9)(iv)(G)-(H), (a)(10)-(11)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)

Say that the caller is an automated scheduling assistant. Federal TCPA text does not create a general AI-disclosure phrase. Clear disclosure still reduces deception risk. State laws can require more.

### Do-not-call and call-time rules

The federal National Do Not Call Registry applies to **telephone solicitations**. The rule defines solicitation as encouraging a purchase, rental, or investment. A genuine treatment rescheduling call normally does not do this. Do not add marketing content, or that analysis changes. [47 CFR 64.1200(c), (f)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)

For solicitation calls, federal rules prohibit calls before 8:00 a.m. or after 9:00 p.m. at the recipient's local time. They require Registry scrubbing and a written compliance process. [47 CFR 64.1200(c)(1)-(2)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)

The National Registry is not a replacement for an internal stop list. Exempt artificial-voice calls also need a written internal do-not-call policy, staff training, immediate recording of requests, and prompt compliance. [47 CFR 64.1200(d)](https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200)

Use a stricter product policy. Call only during a conservative local window, such as 9:00 a.m. to 7:00 p.m. Let state counsel set each state rule. Check the patient location before each call.

### Recording and transcripts

Federal wiretap law permits recording when one party consents, subject to its stated limits. [18 USC 2511(2)(d)](https://uscode.house.gov/view.xhtml?edition=prelim&req=%28title%3A18+section%3A2511%29)

States can impose stricter rules. For example, California bars recording a confidential communication without consent of all parties. [California Penal Code 632](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=632.)

Use a state recording matrix for both caller and patient locations. Do not rely only on the clinic state.

Use this default:

1. Start with recording and transcription disabled.
2. Give a clear recording and transcription notice.
3. Get affirmative consent before enabling either feature.
4. Store the consent event, jurisdiction, and exact notice version.
5. If the patient declines, use an unrecorded staff path or end the call.

Treat a live transcript, audio buffer, quality-review sample, and model prompt as call content. Apply the same privacy and retention controls.

## 2. US health-data controls

HIPAA permits appointment reminders without a patient authorization because they form part of treatment. [HHS appointment-reminder guidance](https://www.hhs.gov/hipaa/for-professionals/faq/286/are-appointment-reminders-allowed-under-hipaa-without-authorization/index.html)

That permission does not let the agent disclose everything. HHS advises providers to limit voicemail content. A provider can leave its name and number, ask for a callback, and only include information needed to confirm an appointment. [HHS phone-message guidance](https://www.hhs.gov/hipaa/for-professionals/faq/198/may-health-care-providers-leave-messages/index.html)

Use a two-stage script:

- Before verification: clinic name, generic scheduling reason, callback, and opt-out.
- After verification: only the affected appointment, lawful candidate slots, location, and confirmation.

Never place clinical notes, diagnosis, procedure detail, balance, insurance data, or the doctor's absence reason in a voicemail. Do not send those fields to the voice model unless the call truly needs them.

HIPAA permits treatment uses and disclosures. Its minimum-necessary rule does not apply to treatment disclosures. Still, design the tool with minimum data. It reduces accidental disclosure and vendor risk. [45 CFR 164.506](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.506) and [HHS minimum-necessary guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html)

The telephony provider, voice-agent provider, speech service, AI provider, transcript store, cloud host, and support vendor can be HIPAA business associates if they create, receive, maintain, or transmit PHI for the clinic. Execute a BAA before sending PHI. HHS specifically lists third-party AI chatbots for medical reminders and appointment scheduling as business-associate examples. [HHS business-associate guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/business-associates/index.html)

The BAA chain must cover subcontractors. It must restrict use, require safeguards, incident reports, and return or destruction. The clinic should also ban independent model training and marketing use. [45 CFR 164.502(e)](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.502) and [45 CFR 164.504(e)](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.504)

Use unique access identities, access control, audit logs, integrity protection, and secure transmission. These are HIPAA Security Rule requirements for ePHI systems. [45 CFR 164.312](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.312)

Honor a patient's reasonable request for another call number or location. HHS gives an office rather than home call as an example. [HHS confidential-communications guidance](https://www.hhs.gov/hipaa/for-professionals/faq/198/may-health-care-providers-leave-messages/index.html)

HIPAA is a federal floor. More protective state health-data rules can still apply. [HHS state-law guidance](https://www.hhs.gov/hipaa/for-professionals/faq/399/does-hipaa-preempt-state-laws/index.html)

## 3. India: TRAI, DLT, and calling route

Treat this appointment call as commercial communication until the Originating Access Provider classifies it. Do not place a bulk AI call from a normal mobile number.

The 2025 TCCCPR amendment defines a **Service Voice Call** as a non-promotional call by a sender to its customer about a product or service. It does not require explicit consent in that defined case. A **Transactional Voice Call** follows a customer-initiated transaction within 30 minutes. A doctor cancellation normally is not such a transaction. [TCCCPR 2025 amendment](https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025_0.pdf)

Do not self-classify without carrier approval. If promotional content is mixed into a service or transaction call, TRAI treats the whole call as promotional. [TCCCPR 2025 amendment](https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025_0.pdf)

The same amendment requires commercial communication to use registered headers or number resources from the special series. It treats unregistered commercial communication as UCC. It also requires every sender to notify its Originating Access Provider in writing before using an auto dialer or robo-calls, including the call objective. [TCCCPR 2025 amendment](https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025_0.pdf)

The 2018 rules define a robo-call as an artificial or prerecorded voice that interactively delivers a message without a human caller. Treat this AI agent as a robo-call unless the carrier gives a different written classification. [TCCCPR 2018](https://www.trai.gov.in/sites/default/files/2024-09/RegulationUcc19072018.pdf)

TRAI directed Access Providers to implement DLT voice solutions. It reserves the 160-level series for service and transactional voice calls. It also directs DLT work for the 140-level series. The provider must supply the usable route, approved caller identity, DLT onboarding, and scrubbing process. [TRAI Voice DLT direction](https://trai.gov.in/sites/default/files/2024-09/Direction_04052024.pdf)

Before an India pilot, get written carrier answers to these questions:

- Is the clinic a registered sender or principal entity?
- Is the AI caller a registered telemarketer or an approved vendor under one?
- Is the call service, transactional, or promotional?
- Which 160 or 140 route and CLI must the clinic use?
- Which headers, content templates, consent templates, and caller scripts need DLT registration?
- Does the carrier scrub recipient preferences, mode, time, and day restrictions before each call?
- What limits apply to robo-calls, abandoned calls, retries, and recordings?

The TCCCPR system supports preferences for voice, auto-dialer, and robo-call modes. It also supports time and day preferences. Carriers must use DLT pre-checks. [TCCCPR 2018](https://www.trai.gov.in/sites/default/files/2024-09/RegulationUcc19072018.pdf)

Keep a clinic stop list even when the carrier classifies the call as service. Honor it immediately. Use a conservative local window, such as 9:00 a.m. to 7:00 p.m., until the carrier confirms the allowed route policy.

The TRAI sources do not establish a general patient-call recording-consent rule. Obtain India counsel and carrier approval. Give a clear notice and obtain affirmative consent before recording or transcribing.

## 4. India: DPDP and health data

The core DPDP data-processing duties in sections 3 to 17 are not yet in force on this research date. The 13 November 2025 notification schedules them and most operational rules for eighteen months later, around 13 May 2027. [DPDP commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf) and [DPDP Rules, 2025](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)

Build to the future rule now. A recording, transcript, phone number, and appointment detail are digital personal data when they identify a patient.

After the relevant provisions start, the clinic will act as a Data Fiduciary. The clinic remains responsible for processors that handle data on its behalf. Design for these controls:

- Give a clear, plain-language notice. Name the data and each purpose.
- Use consent or a reviewed lawful basis. Make withdrawal as easy as consent.
- Use data only for the stated scheduling purpose.
- Give a visible contact for privacy questions and grievance handling.
- Apply reasonable security safeguards and a tested breach process.
- Delete data when the purpose ends, unless another law requires retention.
- Verify a parent or guardian before processing a child's data.
- Map cloud, model, telephony, and transcript data locations before cross-border processing.

The Rules set notice detail, withdrawal links, breach, security, and other implementation requirements. [DPDP Rules, 2025](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)

Until that transition, assess the Information Technology Act and its 2011 SPDI Rules. Those rules cover health condition and medical records and require reasonable security practices. [IT SPDI Rules, 2011](https://upload.indiacode.nic.in/showfile?actid=AC_CEN_45_76_00001_200021_1517807324077&filename=GSR313E_10511%281%29_0.pdf&type=rule)

## 5. Pre-launch checklist

### Legal and policy

- [ ] Obtain US federal and state counsel sign-off for every launch state.
- [ ] Obtain India telecom counsel and carrier sign-off before India calls.
- [ ] Decide whether calls use consent or a documented exception.
- [ ] Approve the call script, voicemail script, AI disclosure, and transfer script.
- [ ] Ban marketing, billing, collection, and clinical advice in the agent policy.
- [ ] Set local call windows and retry limits.
- [ ] Create a state recording-consent matrix.
- [ ] Approve a recording, transcript, and retention policy.

### Carrier and consent

- [ ] Use a clinic-owned, verified caller identity. Never spoof it.
- [ ] Store the number source and consent evidence before dialling.
- [ ] Run the federal and internal stop-list checks before every attempt.
- [ ] For India, complete sender, telemarketer, DLT, CLI, and route approval.
- [ ] Send the India auto-dialer or robo-call notice to the OAP in writing.
- [ ] Make the carrier's DLT scrub result part of the call-attempt record.
- [ ] Test voicemail, refusal, opt-out, callback, transfer, and wrong-person paths.

### Privacy and security

- [ ] Sign BAAs with every PHI vendor before production data use.
- [ ] List all subprocessors and data regions in the vendor review.
- [ ] Disable vendor model training and secondary use of PHI.
- [ ] Pass opaque case tokens to the agent. Do not pass full patient records.
- [ ] Keep sensitive data out of prompts, application logs, analytics, and error tools.
- [ ] Encrypt data in transit and at rest. Restrict access by role.
- [ ] Log access, tool calls, consent, opt-outs, recordings, and retention deletion.
- [ ] Test a data breach, vendor outage, and accidental-disclosure response.

### Runtime safeguards

- [ ] Run a pre-dial gate for location, number type, consent, DNC, time, campaign state, and carrier route.
- [ ] State the clinic identity and callback number before appointment detail.
- [ ] Verify the person before naming the appointment or offering dates.
- [ ] Make spoken opt-out work at every call stage.
- [ ] Cancel all queued attempts when an opt-out, booking, or staff resolution occurs.
- [ ] Start recording only after the required consent event.
- [ ] Offer a live staff transfer and an accessible non-phone alternative.
- [ ] Do not disclose the doctor's private reason for absence.
- [ ] Retain only the operational result when an audio record is unnecessary.

### Pilot evidence

- [ ] Run internal calls first. Then run a staff-monitored, small patient pilot.
- [ ] Audit every call for consent, identity, opt-out, disclosure, and privacy failures.
- [ ] Reconcile provider events before a retry.
- [ ] Measure wrong-party contacts, opt-outs, complaints, handoffs, and unresolved cases.
- [ ] Pause the campaign automatically if compliance checks fail.

## Source note

This report uses primary legal and regulator sources. It does not replace advice for a clinic's facts, state footprint, vendors, or carrier contract.
