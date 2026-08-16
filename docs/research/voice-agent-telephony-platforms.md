# Voice-agent telephony platforms for appointment rescheduling

Research checked: 9 August 2026.  
Sources: official vendor documentation and official pricing pages only.

## Decision summary

An agent that can talk is not enough. The product needs two separate capabilities:

1. A PSTN carrier that can place calls from an approved business caller ID.
2. An agent runtime that can hold a live conversation and call the clinic scheduling API.

For India, validate the carrier and caller ID before building the agent. This is the main unknown.

| Best fit | Suggested stack | Why |
|---|---|---|
| Fast pilot, US or supported international routes | Retell + its telephony, or Vapi + imported carrier number | Outbound APIs, batch calls, scheduling tools, voicemail handling, and transfers are built in. |
| India-first rollout | Exotel carrier or approved local SIP route + ElevenLabs, Retell, Vapi, or custom OpenAI agent | Exotel provides Indian virtual numbers, campaigns, call APIs, and a Mumbai region. Confirm the exact route, CLI, AI streaming path, and rates with Exotel before purchase. |
| Maximum control and lowest carrier cost visibility | Twilio Programmable Voice + ConversationRelay + clinic backend | The application owns the call flow, WebSocket agent, scheduler tools, and reporting. It needs more engineering. |
| Custom voice intelligence | SIP carrier + OpenAI Realtime | OpenAI provides the real-time AI layer and SIP call control. It does not publish phone-number purchase or PSTN dialing as part of the Realtime API. A carrier remains required. |

Do not let the model change an appointment by itself. The model should call a server-side scheduling tool. That tool must check availability, place a short-lived hold, and confirm the result in one transaction.

## Capability and price comparison

Prices below are published list prices. They exclude taxes unless the vendor says otherwise. Carrier, LLM, recording, and compliance costs often add to the displayed platform price.

| Platform | Live outbound control and scheduling integration | Numbers and country position | Detection and human handoff | Published scale limit | Published price relevant to this use case |
|---|---|---|---|---|---|
| **Twilio Programmable Voice + ConversationRelay** | Create calls through the Calls API. Connect ConversationRelay to the clinic WebSocket service. The service runs the agent and calls scheduling tools. Status callbacks report call events. | Buy Twilio numbers or use an approved verified caller ID. Twilio publishes US and India destination prices. Country permissions and local registration can apply. | Answering Machine Detection is available. ConversationRelay supports speech interaction. Build transfer policy with Voice call control. | One call per second is included. The console can provision up to 30 calls per second. | US local outbound: **$0.0140/min**. India mobile outbound: **$0.0496/min**. ConversationRelay: **$0.0700/min**. AMD: **$0.0075/call**. US local number: **$1.15/month**. |
| **Vapi** | Single and batch outbound calls. Scheduled batch windows. Server URL receives events and function-tool calls. | Free Vapi numbers are US only. Import a carrier number for international use. Twilio, Telnyx, and DIDWW imports are documented. | Voicemail detection is supported. Fixed, dynamic, and warm call transfers are supported. | 10 concurrent calls included. Extra capacity is available. Vapi asks customers above 50,000 minutes/month to use a custom plan. | Agent platform: **$0.05/min**. Ten concurrent call slots included. Phone number: **$10/line/month**. Model and carrier costs are at cost. HIPAA add-on: **$2,000/month**. |
| **Retell AI** | API creates individual or scheduled batch calls. Dynamic variables and HTTP custom functions can query and reserve appointment slots. Call-started, ended, and analyzed webhooks are available. | Retell supports US and international calls. It publishes India route prices for Retell Twilio and Telnyx telephony. Exact number availability appears during purchase. | Voicemail and IVR handling is built in. Cold, warm, and agentic warm transfers are supported. | 20 concurrent calls are included on pay-as-you-go. Extra concurrency is **$8/call/month**. | Voice infrastructure: **$0.055/min**. Retell/standard voices: **$0.015/min**. Telephony: **$0.015/min** in the generic table. Published India routes: **$0.15/min** through Retell Twilio, **$0.25/min** through Retell Telnyx. Batch dialing: **$0.005/dial**. Retell quotes a broader pay-as-you-go range of **$0.07–$0.31/min**. |
| **Bland AI** | Calls API, batch calling, live pathway webhooks, and post-call webhooks can connect to a scheduling service. | Use Bland telephony or bring Twilio/SIP. The reviewed official pricing page does not publish an India route price. Validate country support with the selected carrier. | The call record reports human, voicemail, unknown, or no-answer. Transfer fields and real-time webhooks are available. | Start: 10 concurrent, 100 calls/day. Build: 50 concurrent, 2,000 calls/day. Scale: 100 concurrent, 5,000 calls/day. | Start: **$0.14/min**, no monthly platform fee. Build: **$0.12/min + $299/month**. Scale: **$0.11/min + $499/month**. These include LLM, STT, and TTS. Telephony is separate or passed through. Transfer is **$0.05/$0.04/$0.03 per min** by plan. |
| **ElevenLabs Conversational AI** | Native Twilio or SIP outbound calling. Batch calls support CSV/XLS uploads and dynamic variables. Secure webhook tools can call the scheduling API. | Phone-number APIs list Twilio, Exotel, and SIP trunk providers. Imported Twilio numbers support inbound and outbound. A verified caller ID supports outbound only. Country reach and rates come from the carrier. | Transfer to an external number or SIP URI is supported. Post-call transcript webhooks are signed and retried. | Included concurrent agents: Free 4, Starter 6, Creator 10, Pro 20, Scale 30, Business 40. Burst capacity costs more. | Extra agent minutes: **$0.080/min**. LLM and telephony are at cost. Plans: Free **$0 / 15 min**; Starter **$6 / 75 min**; Creator **$22 / 275 min**; Pro **$99 / 1,238 min**; Scale **$299 / 3,738 min**; Business **$990 / 12,375 min**. Burst minutes: **$0.160/min**. |
| **OpenAI Realtime** | Realtime sessions support WebRTC, WebSocket, and SIP. The agent can use function calls to invoke the scheduling backend. SIP calls can be accepted, rejected, referred, or ended by API. | **Inference from the API scope:** the inspected OpenAI docs provide SIP/WebRTC sessions, not phone-number purchasing or PSTN outbound dialing. Use a carrier or SIP trunk for that layer. | SIP Refer can send a call to a telephone number or SIP endpoint. Detection, dialing, and local numbers remain carrier responsibilities. | Rate limits depend on account tier. The displayed Tier 5 limit for realtime models is 20,000 RPM and 15 million TPM. Carrier capacity is separate. | gpt-realtime-2 audio input: **$32/M tokens**; audio output: **$64/M tokens**. gpt-realtime-2.1-mini audio input: **$10/M**; audio output: **$20/M**. This is token billing, not a fixed per-minute rate. |
| **Exotel (India-focused carrier layer)** | Campaign API can call up to 5,000 recipients per request. It sends attempt, schedule, and campaign callbacks. Call records expose status, recording URL, price, and an answered-by field. | ExoPhones are virtual numbers. Exotel documents a Mumbai API cluster. Its VoIP service says Veeno Communications holds a Pan-India UL VNO licence. It is a carrier/contact-center layer, not the conversational AI runtime. | Dynamic call flows, call transfer, call recording, auto dialer, voice APIs, and real-time notifications are listed. The AI stream price is not published on the public plan page. | Campaign default capacity is 60 calls/min. Request a higher capacity from Exotel support. | Public packages: Dabbler **₹9,999** for five months with **₹4,999** rental and **₹5,000** credits; Believer **₹19,999** with **₹9,500** credits; Influencer **₹49,499** with **₹39,000** credits. One credit equals ₹1. The page does not publish a universal outbound voice rate. |

## Platform findings and source links

### 1. Twilio Programmable Voice and ConversationRelay

Twilio is the best choice when the clinic needs full call control. The Calls API creates outbound PSTN, SIP, or client calls. The From value must be a Twilio number or verified outgoing caller ID. Status callbacks can send initiated, ringing, answered, and completed events. A completed call does not prove that a person answered. It can also be voicemail or an IVR. [Calls API](https://www.twilio.com/docs/voice/api/call-resource)

ConversationRelay connects a Twilio call to the clinic's secure WebSocket service. It supplies real-time speech-to-text and text-to-speech. It does not supply the LLM, appointment rules, or data store. The clinic must host those parts. [ConversationRelay overview](https://www.twilio.com/docs/voice/conversationrelay) and [TwiML connection details](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay)

Use [Answering Machine Detection](https://www.twilio.com/docs/voice/answering-machine-detection) before starting the main conversation. Use a staffed handoff path for angry, confused, or medically urgent callers.

Twilio lists US local outbound at $0.0140/min and India mobile outbound at $0.0496/min. ConversationRelay is $0.0700/min in both pricing tables. Thus the known base components are $0.0840/min for a US local call and $0.1196/min for an India mobile call, before LLM, optional recording, optional AMD, tax, and number fees. This is not an all-in quote. [US Voice pricing](https://www.twilio.com/en-us/voice/pricing/us) and [India Voice pricing](https://www.twilio.com/en-us/voice/pricing/in)

Twilio says purchased numbers can need compliance registration in some countries. It also requires country geo-permissions for international dialing. [Phone-number senders](https://www.twilio.com/docs/numbers-and-senders/phone-number-senders) and [geo-permissions](https://help.twilio.com/articles/223180228-International-Voice-Dialing-Geographic-Permissions-Geo-Permissions-and-How-They-Work)

### 2. Vapi

Vapi is a managed agent layer. Its [outbound-calling API](https://docs.vapi.ai/calls/outbound-calling) supports one call, a customer list, and a scheduled calling window. Its [server events](https://docs.vapi.ai/server-url/events) carry tool calls to the clinic backend. This supports an availability lookup, temporary slot hold, confirmation, and call result writeback.

Vapi has [voicemail detection](https://docs.vapi.ai/calls/voicemail-detection) and [warm or dynamic transfers](https://docs.vapi.ai/call-forwarding). Its [concurrency guide](https://docs.vapi.ai/call-concurrency) sets the default at ten concurrent calls. The [pricing page](https://vapi.ai/pricing) lists $0.05/min for the agent platform, $10/line/month, and separate carrier and model costs.

The free managed number is US-only. For India, import a carrier number. Vapi documents imports from [Twilio](https://docs.vapi.ai/phone-numbers/import-twilio) and other carriers. [Free telephony limits](https://docs.vapi.ai/free-telephony)

### 3. Retell AI

Retell has a strong built-in call orchestration set. It supports [single outbound calls](https://docs.retellai.com/api-references/create-phone-call), [scheduled batch calls](https://docs.retellai.com/api-references/create-batch-call), [event webhooks](https://docs.retellai.com/features/webhook-overview), [dynamic variables](https://docs.retellai.com/build/dynamic-variables), and [HTTP custom functions](https://docs.retellai.com/build/conversation-flow/custom-function).

The agent can call an approved appointment service in real time. Its [voicemail and IVR handling](https://docs.retellai.com/build/handle-voicemail) and [cold, warm, or agentic warm transfer](https://docs.retellai.com/build/conversation-flow/call-transfer-node) reduce failed calls.

Retell explicitly publishes international route information. It says Retell Twilio telephony is $0.15/min to India and Retell Telnyx telephony is $0.25/min to India. Check carrier and AI components as well. [International calling](https://docs.retellai.com/deploy/international-call) and [full Retell pricing](https://www.retellai.com/pricing)

### 4. Bland AI

Bland provides an API-first managed agent. The [Calls API](https://docs.bland.ai/api-v1/post/calls) includes caller number, timezone, start time, dynamic data, transfer target, webhooks, recordings, and voicemail controls. [Batch calls](https://docs.bland.ai/tutorials/batch-calls), [live pathway webhooks](https://docs.bland.ai/tutorials/webhooks), and [post-call webhooks](https://docs.bland.ai/tutorials/post-call-webhooks) connect it to a scheduling system.

The [call record](https://docs.bland.ai/api-v1/get/calls-id) exposes early answer classification. Treat that classification as a routing hint. Confirm the result through the transcript and final webhook before updating a patient record.

The published [pricing](https://www.bland.ai/pricing) separates managed AI minutes from carrier costs. Use Twilio or SIP for an India route, and confirm local number and caller-ID rules with that carrier.

### 5. ElevenLabs Conversational AI

ElevenLabs supports phone connections through native Twilio integration or SIP. It documents [outbound calls on a SIP trunk](https://elevenlabs.io/docs/eleven-agents/api-reference/sip-trunk/outbound-call), [batch calling](https://elevenlabs.io/docs/eleven-agents/phone-numbers/batch-calls), and [webhook tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools) for an appointment backend.

The phone-number API supports Twilio, Exotel, and SIP providers. The native Twilio guide states that an imported purchased number supports inbound and outbound calls. A verified caller ID is outbound-only. [Phone-number providers](https://elevenlabs.io/docs/eleven-agents/api-reference/phone-numbers/create) and [Twilio integration](https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration)

For operational safety, use [post-call webhooks](https://elevenlabs.io/docs/eleven-api/resources/webhooks) to finalize the database state and [transfer-to-number](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/transfer-to-number) for human takeover. The [agents pricing page](https://elevenlabs.io/pricing/agents) gives the exact package and overflow prices above.

### 6. OpenAI Realtime API

OpenAI Realtime supports audio sessions over WebRTC, WebSocket, and SIP. It supports function calling, so the agent can request an available appointment slot from the clinic service. [gpt-realtime-2](https://developers.openai.com/api/docs/models/gpt-realtime-2) and [gpt-realtime-2.1-mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)

For an incoming SIP session, the API supports accept, reject, refer, and hang-up operations. Refer can use telephone or SIP destinations. [Realtime calls API](https://developers.openai.com/api/reference/resources/realtime/subresources/calls) and [Realtime webhook events](https://developers.openai.com/api/reference/resources/webhooks)

OpenAI is therefore a viable intelligence layer behind Twilio or a SIP carrier. Do not plan to use it as the carrier. The [official OpenAI pricing page](https://developers.openai.com/api/docs/pricing) lists token rates, so record real pilot usage before estimating a per-minute bill.

### 7. Exotel as an India-first carrier option

Exotel's [Campaign API](https://developer.exotel.com/api/create-campaign) supports lists of up to 5,000 called numbers and sends callbacks for each attempt, schedule, and completed campaign. Its documented default campaign capacity is 60 calls/min, with a support request for more. [Bulk call records](https://developer.exotel.com/api/call-details-bulk) include direction, status, duration, price, answer result, recording URL, and a call ID.

An ExoPhone is a virtual number. Exotel says it leases the number from telecom operators, so the number can change. Do not make it the only durable public number without a service plan for that risk. [Purchase an ExoPhone](https://docs.exotel.com/business-phone-system/purchase-exophone)

Exotel's current public plan page includes virtual numbers, auto dialer, voice APIs, call transfer, recordings, real-time notifications, and dynamic call flows. Voice streaming is a separately quoted offering. [Exotel business-phone pricing](https://exotel.com/pricing/business-phone-system/)

## Practical selection rule

Start with one of these two designs:

1. **Speed:** Retell with its supported telephony, or Vapi/ElevenLabs with an imported approved carrier number. Build one scheduling-tool service and keep agent logic in the vendor.
2. **Control:** Twilio Voice + ConversationRelay + clinic-owned WebSocket agent. This is appropriate when call policy, data retention, routing, or per-minute carrier costs need detailed control.

For a clinic in India, run a paid proof of route before any bulk calling:

1. Obtain and approve the number and caller ID with the selected carrier.
2. Call real Indian mobile and landline test numbers from the same route.
3. Test voicemail, busy, no-answer, IVR, wrong person, and human transfer.
4. Run a scheduling conflict test with two simultaneous callers requesting the same slot.
5. Measure connect rate, human-answer rate, completion rate, agent minutes, carrier minutes, and final confirmed reschedules.

Do not select a platform only on its voice quality. In this use case, the hard requirements are approved outbound caller ID, reliable call events, idempotent scheduler tools, and a safe human fallback.
