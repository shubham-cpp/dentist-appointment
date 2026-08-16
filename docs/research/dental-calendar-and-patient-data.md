# Dental calendar and patient-data research

**Prepared:** 31 July 2026  
**Markets:** United States, United Kingdom, Canada  
**Surface:** Multi-provider dental calendar, patient booking, appointment workspace, treatment records, prescriptions, invoices and receipts

> This is product-design research, not legal advice. The rules vary by US state, UK care setting and Canadian province/territory. Before launch, counsel and a privacy/security lead should validate the exact practice type, hosting model, record-retention schedule, consent language, prescription integration and jurisdiction-specific obligations.

## Executive conclusions

1. There is no trustworthy official benchmark that says a general dentist should have one fixed number of appointments per day across the US, UK and Canada. Official sources measure hours, courses of treatment, schedule fullness or wait time using different definitions. The product should therefore model **variable appointment duration and buffers**, not optimize around a hard-coded daily visit quota. The ADA also cautions that over-scheduling can pressure clinicians to rush and that quantity must not outweigh quality. [ADA: Office Hours](https://www.ada.org/resources/practice/practice-management/office-hours)
2. The user's uncertain **4 / 8 / 15** figures are more defensible as light/core/dense **visits per provider per day test cases** than as typical provider counts. ADA says US practices averaged 1.5 dentists in 2025, while its survey reporting distinguishes solo, 2-9-dentist and 10+-dentist practices. [ADA small-practice evidence](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/advocacy/advocacy-in-action/tax-and-small-business-policy/2025/february-13-2025-letter-to-chairmen-daines.pdf), [ADA HPI Q4 2025 report](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/research/hpi/q42025_economic_outlook_dentistry_main.pdf) The product should still support **1-15 providers**, testing 1, 4, 8 and 15, but 8 and 15 are group/large-group stress cases rather than evidence-backed market norms.
3. A patient booking should be a **request**, not a reserved clinical appointment, until staff approves it. The slot needs a visible temporary hold/availability policy so concurrent patients are not promised the same capacity.
4. Collect data progressively. The booking step needs only enough information to identify/contact the patient and route the request. Medical history, insurance, accessibility needs and treatment consent belong in secure pre-visit or clinical steps. This follows the US minimum-necessary standard, UK data-minimisation principle and Canada's limiting-collection principle. [HHS: Minimum Necessary Requirement](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html), [ICO: Data minimisation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/), [OPC: PIPEDA fair information principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/)
5. The staff calendar should show only the operational minimum: patient display name, appointment type, lifecycle status, time and provider. Appointment details can themselves reveal health information, so contact data, clinical reason, medical history, prescription and financial detail should not be exposed on the grid. [ICO: What is special category data?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/)
6. A label such as **"doctor-private note" must not promise that the patient can never access it**. US access rights can cover clinical case/SOAP notes used to make decisions; UK dental patients expect access to their records; PIPEDA includes individual access and correction. Keep clinical notes objective, purpose-specific and attributable. [HHS: Individual access](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/access/index.html), [GDC: Maintain and protect patients' information](https://standards.gdc-uk.org/pages/principle4/principle4), [OPC: PIPEDA fair information principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/)

## 1. Capacity and workload evidence

### What official sources establish

| Market | Official evidence | Product interpretation | Limitation |
|---|---|---|---|
| US | ADA Health Policy Institute data reported that dentists in 2024 worked roughly 35-37 hours per week depending on experience. [ADA HPI workforce report summary](https://adanews.ada.org/new-dentist/2026/march/hours-worked-by-dentists-vary-by-experience/) | Week and day lengths vary, so availability must be configured per provider rather than assumed globally. | Hours do not establish visits per day. |
| US | In the ADA's Q4 2025 owner survey, the average wait for an initial non-emergency appointment was 13.4 business days overall, 11.6 for solo practices and 16.5 for practices with 2-9 dentists. The report could not publish a 10+-dentist breakout because that category had fewer than 30 respondents. [ADA HPI Q4 2025 report, pp. 2, 6 and 41](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/research/hpi/q42025_economic_outlook_dentistry_main.pdf) | A multi-provider calendar needs wait-time visibility, next-available search and waitlist outreach; 10+ providers should be treated as a large-group case. | Wait time is not a capacity target and the report does not provide a current daily visit count. |
| US | ADA evidence used in 2021 workforce modelling reported 29.0-86.4 weekly patient visits per dentist across age/sex groups, explicitly including hygienist visits, based on its 2010-2019 Survey of Dental Practice. [ADA HPI workforce brief, Table 12](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/research/hpi/hpibrief_0521_1.pdf) | A simple five-day division is roughly 6-17 visits/day, so 4/8/15 are reasonable light/core/dense software test cases. | The daily conversion is our inference, not an ADA benchmark; the underlying data are historical, include hygienist visits and vary by schedule, clinician and treatment mix. |
| US | ADA stated in 2025 that dental practices averaged 1.5 dentists and just over six dental staff. [ADA letter citing HPI evidence](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/advocacy/advocacy-in-action/tax-and-small-business-policy/2025/february-13-2025-letter-to-chairmen-daines.pdf) | Support solo/small practices even if the product aims up-market; 8 and 15 provider layouts are group-practice scalability tests. | This US average is not a maximum and does not establish UK or Canadian practice size. |
| US | In a 2022 ADA panel, responding practices reported schedules averaging 83% full; 82% cited no-shows or cancellations within 24 hours as the largest reason schedules did not reach 100%. [ADA report on HPI poll](https://adanews.ada.org/ada-news/2022/november/dentists-report-less-busy-schedules-in-latest-hpi-poll) | Cancellation, no-show, reminders and waitlist workflows are core scheduling functions, not edge cases. | This is older, self-reported panel evidence and should not be treated as a current national target. |
| Canada | For fiscal periods ending in 2023-24, 24.5% of dentist offices could offer existing patients a non-emergency appointment in under a week and 52.5% in one week to under one month; new-patient figures were 24.5% and 55.5%. [Statistics Canada: Survey of Oral Health Care Providers](https://www150.statcan.gc.ca/n1/daily-quotidien/250326/dq250326b-eng.htm) | Show earliest availability, queue age and waitlist opportunities; a request may remain pending while staff verifies suitability. | Wait-time bands do not establish appointments per provider per day. |
| Canada | The same Statistics Canada survey reported that 82% of dentist offices had at least one staffing or HR challenge and 43% reported administrative, financial or operational challenges. [Statistics Canada: Survey of Oral Health Care Providers](https://www150.statcan.gc.ca/n1/daily-quotidien/250326/dq250326b-eng.htm) | Receptionist workflows should prioritize exception handling, bulk confirmation and clear work queues. | Practice sizes and visit mix vary. |
| England | NHS official statistics recorded 35 million courses of treatment, 73 million units of dental activity and 24,655 dentists with NHS activity in 2024/25. Treatment mix included check-ups/simple care and urgent care. [NHSBSA: Dental statistics, England 2024/25](https://www.nhsbsa.nhs.uk/statistical-collections/dental-england/dental-statistics-england-202425) | The data supports a heterogeneous appointment-type model rather than one standard duration. | A course of treatment is not the same as one appointment; the workforce count is not a daily FTE denominator. Dividing these figures would create a misleading daily benchmark. |

### Recommended product and QA envelope

The following are **design assumptions**, not clinical productivity recommendations:

| Dimension | Small/light fixture | Core fixture | Large/dense fixture | Design requirement |
|---|---:|---:|---:|---|
| Providers in one practice | 1 | 4 | 15 | Also test 8. Provider filtering, grouped views and compact density must still scan at 15. No market claim is attached to these fixtures. |
| Patient visits per provider/day | 4 | 8 | 15 | These are mixed-duration test cases only. Do not present them as targets. |
| Total calendar blocks per provider/day | 8 | 16 | 24 | Includes appointments, buffers, working-hours boundaries, time off, holds and administrative blocks. |
| Practice-wide patient visits/day | 4 | 32 | 225 | Virtualize or window dense calendar content; do not render an unbounded all-provider day as a single unreadable grid. |
| Appointment durations | 15-120 minutes | Mixed | Mixed + buffers | Duration and before/after buffer are attributes of appointment type and can be overridden by authorized staff. |

The schedule should remain performant above the stress fixture, but the interface should not encourage clinicians to fill every minute. The ADA explicitly warns that over-scheduling may lead to rushing. [ADA: Office Hours](https://www.ada.org/resources/practice/practice-management/office-hours)

## 2. Information architecture: collect and reveal data by stage

### Patient self-booking request

Collect only what is needed to route and respond to the request:

| Field | Requirement | Notes |
|---|---|---|
| Patient | Required | Signed-in patient identity, or full name for a new patient. Do not expose other patient matches during lookup. |
| Mobile phone | Required by product decision | This is not a universal legal requirement. State the scheduling/safety purpose, verify it before approval or reminders, record whether voice/SMS is allowed and the patient's confidential-communication preference, and provide a staff-assisted alternative for a patient who cannot use a phone. |
| Email | Optional by product decision | Verify before sending clinical documents. Do not make email a barrier when phone contact is available. |
| New/existing patient | Required | Controls record matching and intake, without asking for full medical history on the first screen. |
| Appointment type | Required | Use patient-friendly categories, estimated duration and indicative price/coverage wording where appropriate. Avoid asking patients to self-diagnose. |
| Short reason / symptoms | Conditional | Keep free text short. Route urgent symptoms to a clearly worded urgent-care path; do not imply the booking form is monitored as an emergency service. |
| Provider preference | Optional | Include "any suitable provider" to improve availability. |
| Requested slot | Required | It remains a request until staff approval. State whether the slot is temporarily held and when that hold expires. |
| Accessibility, interpreter or communication support | Optional and purpose-labelled | Ask what support is needed for the visit, not for a diagnosis. Collect only relevant details. |
| Policies and notices | Required acknowledgements where applicable | Show cancellation/rescheduling cutoff, privacy notice and communication choices separately. Clinical informed consent is a later, treatment-specific process. |

The staged approach is an inference from data-minimisation rules: HHS requires reasonable steps to limit many uses, disclosures and requests to the minimum necessary; the ICO requires data to be adequate, relevant and limited to what is necessary; PIPEDA limits collection to identified needs. [HHS: Minimum Necessary Requirement](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html), [ICO: Data minimisation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/), [OPC: PIPEDA fair information principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/)

### Secure pre-visit intake after approval

Request the following only after the practice accepts the appointment, or when the patient establishes a reusable patient record:

- identity matching: legal name, preferred name, date of birth and address;
- guardian or personal representative details when applicable;
- preferred language, accessible format and visit accommodations;
- emergency contact, with a clear purpose and relationship;
- payer/insurance information only where the practice needs it for eligibility, estimates or claims;
- current and past conditions, surgeries, allergies/adverse reactions, current medications and relevant primary/specialist contacts;
- dental history and current concern;
- confirmation that the medical/dental history is current, with patient and reviewer attribution and timestamp.

The ADA states that a complete, accurate history is essential before diagnosis or treatment and identifies conditions, surgeries, medication, reason for care and relevant clinician contacts as common elements; active patients should review/update their history at every visit. [ADA: Medical/Dental Health History](https://www.ada.org/resources/practice/practice-management/medical-dental-health-history) Ontario's dental regulator similarly requires necessary and relevant medical information before treatment. [RCDSO: Medical History Recordkeeping](https://www.rcdso.org/professional-practice-resources/managing-your-practice/medical-history-recordkeeping-)

### Calendar grid: operational minimum

Each appointment block should display:

- patient display name;
- appointment type;
- request/appointment status;
- start/end time and duration;
- assigned provider;
- compact non-clinical indicators for messages, forms incomplete or an operational exception.

Do **not** show phone, email, address, free-text symptoms, medication, diagnosis, procedure detail, balance or note excerpts on the grid. In the UK, appointment details, reminders and invoices may themselves be health data; the grid must be treated as a restricted clinical/operational surface even when it looks administrative. [ICO: What is special category data?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/)

### Open appointment panel

The opened panel can reveal more, subject to role and purpose:

- verified phone, optional email and preferred contact channel;
- date of birth or secondary identifier for safe matching;
- request reason, appointment type, duration and buffers;
- approval history, prior reschedules/cancellations/no-shows and cancellation-rule override reason;
- intake completion and consent/acknowledgement state;
- a prominent **medical-information-needs-review** indicator for reception, with actual allergy/medical details limited to roles that need them;
- accessibility/communication accommodations necessary to deliver the visit;
- treatment-plan linkage and follow-up/recall date;
- invoice/receipt state without exposing unnecessary clinical or payment details.

Role-based disclosure follows HHS's requirement to identify which workforce roles need which categories of PHI, the ICO's expectation that access rights be based on documented job-role profiles, and PIPEDA's safeguard principle. [HHS: Minimum Necessary Requirement](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html), [ICO: Records access controls](https://ico.org.uk/for-organisations/advice-and-services/audits/data-protection-audit-framework/toolkits/records-management/access/), [OPC: PIPEDA fair information principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/)

### Treatment workspace and patient outputs

The appointment workspace should guide the dentist through:

1. review/update medical and dental history;
2. clinical note with author and timestamp;
3. findings, diagnosis/assessment and treatment plan;
4. discussion of options, benefits, risks, alternatives and no-treatment consequences;
5. treatment-specific consent or refusal;
6. procedure/treatment performed and relevant attachments;
7. prescription with drug, dose, amount, directions, timing and refills;
8. postoperative/home instructions;
9. follow-up or recall date and referral where needed;
10. invoice and receipt generation in a financial record linked to, but separated from, the clinical note.

The ADA lists diagnostic information, health history, treatment/progress notes, prescriptions, referrals, missed appointments, follow-up, home instructions and consent/refusal among typical record content, and recommends financial records be maintained separately from the clinical record. [ADA: Documentation/Patient Records](https://www.ada.org/resources/practice/practice-management/documentation-patient-records) The GDC requires contemporaneous, complete and accurate records, up-to-date medical history, treating-clinician attribution, consent discussions and referral/prescription records. [GDC: Maintain and protect patients' information](https://standards.gdc-uk.org/pages/principle4/principle4)

Patient-facing outputs should include the approved prescription, medication directions/timing, home instructions, follow-up date, treatment-plan summary appropriate for the patient, invoice and receipt. Access rights in the US include a broad designated record set such as medical, billing, payment, insurance, consent and clinical case notes. [HHS: Right of access](https://www.hhs.gov/hipaa/for-professionals/faq/2042/what-personal-health-information-do-individuals/index.html)

## 3. Appointment lifecycle and calendar behaviour

This lifecycle is a product recommendation, not a legal taxonomy:

```text
Available slot
    |
    v
Requested -> Under review -> Approved -> Confirmed -> Checked in
    |              |             |                         |
    |              |             |                         v
    |              |             +-> Reschedule request -> Ready
    |              |                                       |
    |              +-> Declined                            v
    |                                                   In treatment
    +-> Withdrawn                                         |
                                                        v
                                                     Completed

Approved/Confirmed -> Cancelled by patient/staff -> Waitlist outreach
Approved/Confirmed -> No-show                     -> Follow-up workflow
```

Key rules:

- A request and an approved appointment are different records/states. Keep the original requested time and decision audit trail.
- Patient cancellation/rescheduling is permitted until the practice-configured cutoff. Dentist and receptionist overrides require reason, actor and timestamp.
- A waitlist entry is not an appointment. Staff chooses whom to contact; log offers, expiry and outcome without silently booking the patient.
- Recurring care should create linked occurrences that can be edited as one or individually; never overwrite completed historical visits.
- Working hours, time off, buffers and provider availability are first-class schedule blocks. At launch the provider is the reservable clinical resource; preserve a nullable room/resource field for a future room-reservation feature.
- One location and one practice time zone are launch constraints. Store a canonical time-zone identifier and absolute event timestamps so reminders and daylight-saving transitions remain unambiguous.

The emphasis on cancellation/no-show tracking is supported by ADA evidence that no-shows and late cancellations commonly create unfilled schedules, and ADA practice guidance recommends consistent cancellation policy and software tracking. [ADA HPI poll](https://adanews.ada.org/ada-news/2022/november/dentists-report-less-busy-schedules-in-latest-hpi-poll), [ADA: Patient Cancellations](https://www.ada.org/resources/practice/practice-management/cancellations)

## 4. Privacy and records requirements by market

### United States

| Topic | Current official rule/guidance | Product implication |
|---|---|---|
| Scope | HIPAA applies to covered entities and business associates handling PHI. A vendor that handles PHI for a covered practice generally needs a business-associate contract defining permitted use, safeguards, breach reporting, subcontractors and return/destruction. [HHS: Business Associate Contracts](https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html) | Determine whether the product is a business associate for each customer; execute BAAs and bind subprocessors before production PHI. |
| Minimum necessary | Covered entities generally must reasonably limit uses, disclosures and requests to the minimum necessary, with defined role classes and information categories; treatment disclosures have stated exceptions. [HHS: Minimum Necessary Requirement](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html) | Implement purpose-based roles; do not interpret the treatment exception as permission for every staff member to see everything. |
| Security | The Security Rule requires administrative, physical and technical safeguards. Its technical standards include access control, audit controls, integrity, authentication and transmission security. [HHS: Summary of the HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) | Unique accounts, least privilege, strong authentication/MFA, encryption, immutable audit events, secure transmission, backups and tested recovery are baseline capabilities. |
| Patient access | Patients generally have access to PHI in designated record sets, including medical, billing/payment, claims, consent and clinical case/SOAP notes, subject to limited exceptions. [HHS: Right of access](https://www.hhs.gov/hipaa/for-professionals/faq/2042/what-personal-health-information-do-individuals/index.html) | Export and portal access must cover more than the curated patient summary. Do not assume a "private doctor note" is excluded merely because of its label. |
| Reminders | Appointment reminders are permitted as treatment communications without separate authorization, but voicemail or messages should disclose only what is needed; reasonable confidential-channel requests must be accommodated. [HHS: Appointment reminders](https://www.hhs.gov/hipaa/for-professionals/faq/286/are-appointment-reminders-allowed-under-hipaa-without-authorization/index.html), [HHS: Messages and reminders](https://www.hhs.gov/hipaa/for-professionals/faq/198/may-health-care-providers-leave-messages/index.html) | Store communication preferences. Default reminder copy to practice name, date/time and callback/manage link; omit procedure, diagnosis and medication from lock-screen/voicemail content. |
| Retention | HIPAA does not itself set medical-record retention periods; state law generally does. HIPAA safeguards apply for however long PHI is kept. [HHS: Medical-record retention FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/580/does-hipaa-require-covered-entities-to-keep-medical-records-for-any-period/index.html) | Retention must be configurable by state/practice policy and record type. Do not ship one universal "HIPAA retention period." |
| State variation | HIPAA is a federal floor; contrary state law can remain where it provides greater privacy protection or fits other exceptions. [HHS: HIPAA preemption](https://www.hhs.gov/hipaa/for-professionals/faq/399/does-hipaa-preempt-state-laws/index.html) | Launch requires a state-by-state policy matrix for records, minors, consent, prescribing and breach duties. |

### United Kingdom

| Topic | Current official rule/guidance | Product implication |
|---|---|---|
| Health data | Data concerning health is special-category data. It can include registration/treatment information and appointment details, reminders and invoices that reveal health status. [ICO: What is special category data?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/) | Treat the calendar, reminder queue and billing views as sensitive, not merely administrative. |
| Lawful basis | Processing special-category data requires both a general lawful basis and an Article 9 condition. Health/social-care processing is one possible Article 9 condition; explicit consent is another, but is not automatically the correct basis for all care processing. [ICO: Rules on special category data](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-rules-on-special-category-data/) | Configure/document the controller's selected bases. Keep privacy-law basis, communication preferences and clinical consent as separate concepts in the UX/data model. |
| Data minimisation and retention | Personal data must be adequate, relevant and limited to what is necessary, and retained no longer than necessary under a documented schedule. [ICO: Data minimisation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/), [ICO: Storage limitation](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/) | Stage intake, document field purpose, and support per-category retention/deletion review rather than keeping every booking draft indefinitely. |
| Security/access | UK GDPR requires appropriate technical and organisational security. ICO audit guidance expects electronic-record access based on documented job roles, rapid access changes and periodic permission review/monitoring. [ICO: Data security](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/security/a-guide-to-data-security/), [ICO: Records access controls](https://ico.org.uk/for-organisations/advice-and-services/audits/data-protection-audit-framework/toolkits/records-management/access/) | Role templates are a starting point; practice administrators need joiner/mover/leaver controls and periodic access review. |
| Dental records/access | GDC standards require contemporaneous, complete and accurate records, current history, confidentiality, secure storage and patient access. [GDC: Maintain and protect patients' information](https://standards.gdc-uk.org/pages/principle4/principle4) | Keep append/correction history and attribution. Build patient export/access and prevent silent alteration of signed clinical entries. |
| Clinical consent | GDC says consent is an ongoing process, not only a form; the dentist must document discussion, understanding and renewed consent at each treatment stage. [GDC: Obtain valid consent](https://standards.gdc-uk.org/pages/principle3/principle3) | A checkbox alone is insufficient. Capture discussion, options, risks, alternatives, patient questions, decision, clinician and timestamp. |
| Dental retention | The NHS Records Management Code notes that the dental clinical-care retention period was reduced from 15 to 11 years; its scope and applicability depend on the care setting. [NHS England: Records Management Code of Practice](https://digital.nhs.uk/data-and-information/information-governance/guidance/records-management-code-of-practice) | Offer an 11-year NHS dental policy template, but have the customer validate private-practice, minors and other record-category rules before activation. |

### Canada

| Topic | Current official rule/guidance | Product implication |
|---|---|---|
| Federal baseline | PIPEDA's principles include accountability, identified purposes, consent, limiting collection, limiting use/disclosure/retention, accuracy, safeguards, openness, individual access and challenge. [OPC: PIPEDA fair information principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/) | Maintain a data inventory/purpose map, configurable retention, patient access/correction, privacy contact and safeguards proportional to health-data sensitivity. |
| Consent | Meaningful consent requires understandable nature, purpose and consequences. The OPC generally expects express consent for sensitive information, unexpected processing or meaningful residual risk, while necessary care processing can also be governed by applicable health law. [OPC: PIPEDA consent](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/principles/p_consent/) | Use plain-language, purpose-specific consent/notice; do not bundle optional marketing or analytics into care. Record withdrawal and legal/contractual constraints. |
| Provincial variation | Alberta, BC and Quebec have substantially similar private-sector laws; Ontario, New Brunswick, Newfoundland and Labrador, and Nova Scotia have substantially similar health-information laws. PIPEDA can still apply to cross-border commercial data flows. Applicability is case-specific. [OPC: Provincial laws that may apply instead of PIPEDA](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/r_o_p/prov-pipeda/), [OPC: Provincial and territorial privacy laws](https://www.priv.gc.ca/en/about-the-opc/what-we-do/provincial-and-territorial-collaboration/provincial-and-territorial-privacy-laws-and-oversight/) | Do not market one generic "PIPEDA compliant" configuration as sufficient nationwide. Select province/territory at practice onboarding and activate a reviewed policy pack. |
| Security and auditability | PIPEDA requires safeguards appropriate to sensitivity. Ontario PHIPA's official consolidation also shows a detailed electronic-audit-log section that takes effect on proclamation; its in-force status must be checked at implementation. [OPC: PIPEDA fair information principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/), [Ontario: PHIPA](https://www.ontario.ca/laws/statute/04p03) | Build a view/create/update/disclose/export audit trail as a cross-market baseline, then validate province-specific log content and retention. |
| Access and correction | PIPEDA requires organizations, on request, to tell an individual about the existence, use and disclosure of their information, provide access and allow accuracy/completeness challenges. [OPC: PIPEDA fair information principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/) | Provide patient data export and a correction-request workflow that preserves the original clinical history and records the amendment. |
| Example retention variation | Ontario's dental regulator requires clinical and financial records and appointment books to be retained at least 10 years after the last entry; for a minor, at least 10 years after turning 18. [RCDSO: Dental recordkeeping FAQ](https://www.rcdso.org/en-ca/standards-guidelines-resources/rcdso-news/frequently-asked-questions/information-on-dental-recordkeeping) | Treat this as an Ontario template, not a Canadian default. Maintain separate retention rules for clinical, financial, appointment and claim records. |

## 5. Role and visibility recommendation

This matrix is a product inference from minimum-necessary, data-minimisation and role-based-access guidance, and must be validated by each practice.

| Data/capability | Dentist | Receptionist | Administrator | Patient |
|---|---|---|---|---|
| Calendar name/type/status/time/provider | Full for assigned/practice scope | Full for scheduling scope | Full for operational scope | Own appointments only |
| Phone/email/contact preference | Yes | Yes | As needed for administration | Own details |
| Detailed medical history/allergies/medications | Yes | Prefer completion indicator; details only if practice policy requires | No by default | Own details and updates |
| Clinical notes/findings/treatment plan | Yes | No by default | No by default | Accessible patient record/approved presentation; access rights may extend beyond the curated summary |
| Operational scheduling note | Yes | Yes | Yes | No, unless used in a record to which access law applies |
| Prescription | Create/sign where authorized | Delivery/status only | No by default | View/download own approved prescription |
| Invoice/receipt | Relevant treatment and fee context | Create/manage where authorized | Full billing administration | View/download own documents |
| Waitlist selection/outreach | Yes | Yes | Policy/reporting | Own waitlist preference/status |
| Override cancellation/cutoff | Yes, with reason | Yes, with reason | Policy configuration | Request within cutoff; contact staff outside it |
| Audit log | Own-event visibility if useful | No by default | Privacy/security role, scoped | Disclosure/access history only where required/offered |

## 6. Notes, authorship and correction rules

- Every clinical and operational entry should store author, role, timestamp and appointment/patient linkage. ADA guidance says entries should be linked to their maker; GDC records should identify the treating clinician. [ADA: Writing in the Dental Record](https://www.ada.org/resources/practice/practice-management/writing-in-the-dental-record), [GDC: Maintain and protect patients' information](https://standards.gdc-uk.org/pages/principle4/principle4)
- Signed/completed clinical notes should be append-only. A late entry or correction should preserve the original, show the new author/time and explain the change; ADA guidance says belated entries should carry their date/time and records should never be altered in response to a claim, inquiry or complaint. [ADA: Writing in the Dental Record](https://www.ada.org/resources/practice/practice-management/writing-in-the-dental-record)
- Avoid personal opinions, criticism and speculative labels. The ADA says records should contain facts relevant to care and warns that informal or disparaging notes may have to be shared. [ADA: Documentation/Patient Records](https://www.ada.org/resources/practice/practice-management/documentation-patient-records)
- If an internal note is genuinely needed for operations, call it **restricted operational note**, state its purpose, restrict its audience and still treat it as potentially discoverable/access-controlled. Never tell clinicians it is categorically invisible to the patient.

## 7. Reminder and document-delivery safety

- Appointment reminders may be treatment communications under HIPAA, but messages should disclose only what is needed and honor reasonable confidential-channel requests. [HHS: Appointment reminders](https://www.hhs.gov/hipaa/for-professionals/faq/286/are-appointment-reminders-allowed-under-hipaa-without-authorization/index.html), [HHS: Messages and reminders](https://www.hhs.gov/hipaa/for-professionals/faq/198/may-health-care-providers-leave-messages/index.html)
- Default SMS/email/voicemail to generic copy: practice name, date/time, confirmation/manage action and callback. Do not include procedure, diagnosis, medication or balance in notification previews.
- Deliver prescriptions, treatment documents and invoices through an authenticated portal; if email delivery is enabled, verify the address, document the selected channel and apply appropriate safeguards. HHS permits email with reasonable safeguards and notes that confidential-communication requests should be accommodated. [HHS: Email with patients](https://www.hhs.gov/hipaa/for-professionals/faq/570/does-hipaa-permit-health-care-providers-to-use-email-to-discuss-health-issues-with-patients/index.html)
- Log notification type, recipient channel, template/version, send status and response, but avoid copying full clinical document content into the notification log.

## 8. Accessibility and safe interaction requirements

These are product requirements derived from the brief and the sensitivity of the workflow:

- status must use text and icon/shape, never color alone;
- all calendar actions must be keyboard-operable, including moving/resizing through an accessible non-drag alternative;
- announce status and validation changes to assistive technology;
- preserve logical focus when opening appointment details or rescheduling;
- show date, time, duration and time zone in unambiguous text;
- never rely on hover for patient-critical information;
- offer accessible formats and communication accommodations as patient preferences;
- require confirmation and show a reversible summary before high-impact actions such as cancellation, approval, provider reassignment, prescription issue or clinical completion.

Formal conformance should target WCAG 2.2 AA and be tested with keyboard, screen reader, zoom/reflow and high-contrast modes before launch. WCAG 2.2 includes requirements relevant to this surface such as use of color, reflow, keyboard access, focus visibility, target size and status messages. [W3C: WCAG 2.2](https://www.w3.org/TR/WCAG22/) This is a product target; jurisdiction-specific accessibility counsel should verify statutory applicability.

## 9. Decisions to resolve before implementation

1. Exact US launch states, UK care settings (NHS, private or both), and Canadian launch provinces/territories.
2. Whether a requested slot receives a short exclusive hold, stays available to multiple requesters or is manually conflict-resolved.
3. Clinical roles beyond dentist (hygienist, dental therapist, assistant) and which can own appointment types.
4. Minor/guardian, substitute decision-maker and dependent-account workflows by jurisdiction.
5. Identity verification strength for portal activation, prescription/invoice access and record export.
6. SMS/email vendors, hosting regions, subprocessors, BAAs/data-processing agreements and cross-border transfer assessment.
7. Source and licensing for medicine autocomplete; it must support jurisdiction-appropriate identifiers and clinician verification rather than autonomous prescribing.
8. Final retention schedules by record class and jurisdiction.
9. Whether billing means invoice/receipt only at first launch or also insurance eligibility, claims, remittance and refunds.
10. What constitutes an urgent dental request and the practice's escalation wording/hours.

## Recommended shape decision

Proceed with an **Operate** surface centered on a staff-controlled, multi-provider day/week calendar. The patient flow creates an approval request; staff accepts, proposes another time or declines; approved visits move through confirmation, check-in, treatment and completion. The appointment opens into a single clinical workspace that produces an approved prescription, patient instructions, follow-up, invoice and receipt, while role-based access keeps sensitive clinical detail off the shared grid.

Design visit-density fixtures at 4, 8 and 15 patient visits per provider/day. Support 1-15 providers and explicitly test 1, 4, 8 and 15 provider practices, but keep provider count, day length, appointment duration, buffers, working hours and time off configurable. Do not encode a universal appointments-per-day target or describe 8/15 providers as typical.
