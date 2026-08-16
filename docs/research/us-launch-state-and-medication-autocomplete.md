# US launch-state and medication-autocomplete research

**Prepared:** 1 August 2026  
**Scope:** California, Texas, Florida and New York; US-first medication search with UK/Canada follow-ons

> This is product research, not legal, clinical or regulatory advice. A dental prescribing workflow is safety-critical. State counsel, a pharmacist/clinical informaticist and the selected e-prescribing vendor should validate the implementation before production use.

## Verdict

1. **Provisional first state: California** if the objective is the largest initial dentist/customer and patient-demand pool. It has the largest 2025 population of the four (39.36 million), and the ADA reports California has the highest share of dentists in solo practice (44%), a potentially useful practice-management buyer segment. The exact four-state dentist counts could not be safely extracted from ADA's official workbook in this environment, so this is a **market-size recommendation, not a completed dentist-count ranking**. [Census Vintage 2025](https://www.census.gov/newsroom/press-releases/2026/population-growth-slows.html), [ADA workforce report](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/research/hpi/us_dentist_workforce_2025.pdf)
2. **Use NLM RxNorm Current Prescribable Content (CPC) as the US autocomplete catalog.** It is a no-license subset of active normalized names/codes intended to approximate drugs currently marketed in the US, includes many OTC drugs, is released monthly with weekly additions, and has a dedicated Prescribable RxNorm API. [NLM CPC](https://www.nlm.nih.gov/research/umls/rxnorm/docs/prescribe.html), [RxNav APIs](https://lhncbc.nlm.nih.gov/RxNav/APIs/index.html)
3. **DailyMed and openFDA are enrichment, not the search authority or prescribing engine.** DailyMed can attach current Structured Product Label (SPL), packaging and NDC references. openFDA can make label fields easier to query, but FDA explicitly says not to rely on openFDA for medical-care decisions. [DailyMed web services](https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm), [openFDA label result disclaimer](https://open.fda.gov/apis/drug/label/understanding-the-api-results/)

## Part A - launch-state comparison

### What is comparable

ADA's current public supply series is **2001-2024** and reports 202,485 professionally active US dentists in 2024, or 59.5 per 100,000 people. ADA explicitly does not recommend a universal dentist-to-patient ratio because it misses economic and geographic differences. Its 2025 workforce report also shows a large urban/rural gap (64.7 versus 32.7 dentists per 100,000 in 2024). Therefore state population or a statewide ratio must not be treated as local capacity. [ADA dentist workforce](https://www.ada.org/resources/research/health-policy-institute/dentist-workforce), [ADA 2025 workforce report](https://www.ada.org/-/media/project/ada-organization/ada/ada-org/files/resources/research/hpi/us_dentist_workforce_2025.pdf)

The ADA dental-care market page reports that **45% of the US population had a dental visit in the prior 12 months in 2022**. No same-year, same-method general-population visit rate for all four states was verified. The demand column below therefore applies that national rate uniformly. It is only a directional population-size proxy, not a state forecast or number of appointments. [ADA dental-care market](https://www.ada.org/resources/research/health-policy-institute/dental-care-market)

| Rank by population | State | Census population, 1 Jul 2025 | Directional residents with >=1 annual visit (population x 45%) | ADA 2024 state supply | Decision signal |
|---:|---|---:|---:|---|---|
| 1 | California | 39,355,309 | 17,709,889 | Official workbook is available, but the state row was unresolved here | Largest addressable population; ADA also reports 44% of dentists in solo practice |
| 2 | Texas | 31,709,821 | 14,269,419 | Unresolved here | Strongest growth: +391,243 from 2024 to 2025 |
| 3 | Florida | 23,462,518 | 10,558,133 | Unresolved here | Second-fastest absolute growth among these four: +196,680 |
| 4 | New York | 20,002,427 | 9,001,092 | Unresolved here | Smaller population, but prescribing implementation has unusually explicit state requirements |

Population and growth figures are from the same Census Vintage 2025 table; values are rounded to whole persons after multiplication. [Census Vintage 2025](https://www.census.gov/newsroom/press-releases/2026/population-growth-slows.html)

### Recommendation and sensitivity

Choose **California for market-size discovery**, but do not make it the irreversible national data model. California's population is 24% larger than Texas's; under the deliberately uniform 45% proxy, its reachable-use pool is also 24% larger. Texas is the best second-state sensitivity test because it is growing faster and will expose whether California's regulatory and market characteristics distort product learning.

Before a final go-to-market commitment, download ADA's `Supply of dentists in U.S.: 2001-2024` workbook and fill the unresolved cells with **professionally active dentist count**, not a count derived by multiplying rounded map ratios. Then compare:

```text
market opportunity = verified active dentists
                   x target-practice share
                   x serviceable geography

patient demand proxy = population x comparable utilization rate
```

Do not combine those terms into a spurious single score until sales segment and geography are defined.

### State rules affect architecture

- California requires dentists and other covered practitioners to consult CURES around Schedule II-V prescribing under defined timing and exception rules. The application needs a jurisdictional policy layer, a recorded prescriber attestation/event and exception reason; autocomplete alone cannot satisfy this workflow. [California Medical Board: CURES mandatory use](https://www.mbc.ca.gov/Resources/Medical-Resources/CURES/Mandatory-Use.aspx/1000)
- New York mandates electronic prescribing for controlled and non-controlled substances subject to exceptions, and most prescribers must consult its PMP for Schedule II-IV prescriptions. That makes New York a materially different integration/compliance launch, not a feature flag labelled simply `controlled=true`. [NY electronic prescribing](https://www.health.ny.gov/professionals/narcotic/electronic_prescribing/), [NY PMP/I-STOP](https://www.health.ny.gov/professionals/narcotic/prescription_monitoring/index.htm)
- Texas and Florida also require state-specific legal review of health-record privacy, retention, controlled-substance/PMP and electronic-prescribing rules before enablement. Do not infer their rules from California or New York. Keep state configuration versioned and effective-dated.

Minimum architecture boundary:

```text
RxNorm search -> clinician selects concept -> clinician enters order
                                            |
                                            v
                              state policy + PMP/eRx checks
                                            |
                                            v
                              sign -> transmit -> audit event
```

## Part B - medication autocomplete

### Recommended source stack

| Layer | Source | Use | Do not use it for |
|---|---|---|---|
| Search/identity | RxNorm CPC / Prescribable RxNorm API | Normalized US drug concepts, RxCUI, concept type, ingredients, strength/form relationships; active/current filtering | Dose, frequency, duration, indication or autonomous clinical recommendations |
| Label reference | DailyMed v2 | Current SPL documents, SET ID/history, product-level RxCUI, NDC and packaging links | Deciding which medicine or regimen is right for a patient |
| Queryable label enrichment | openFDA drug-label API | Optional search/index of SPL-derived label fields and identifiers | Medical-care decisions; FDA carries an explicit disclaimer |
| UK later | NHS dm+d | UK/NHS product identity and communication; weekly-refreshed recognized NHS standard | Re-labelling RxNorm as a UK catalog |
| Canada later | Health Canada DPD | Authorized Canadian product/DIN, status, ingredient, form, route and packaging data; database updated nightly | Medical advice or treating every approved/dormant/cancelled product as currently marketed |

Sources: [RxNorm CPC](https://www.nlm.nih.gov/research/umls/rxnorm/docs/prescribe.html), [RxNorm API](https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html), [DailyMed](https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm), [openFDA](https://open.fda.gov/apis/drug/label/understanding-the-api-results/), [NHS dm+d](https://www.nhsbsa.nhs.uk/pharmacies-gp-practices-and-appliance-contractors/nhs-dictionary-medicines-and-devices-dmd), [Health Canada DPD](https://www.canada.ca/en/health-canada/services/drugs-health-products/drug-products/drug-product-database.html), [DPD API guide](https://health-products.canada.ca/api/documentation/dpd-documentation-en.html)

For search, try exact/normalized matching first. NLM says approximate matches have lower precision and should be treated as **candidates for manual review**; show an explicit selection step and never silently accept rank 1. Restrict results to active concepts and debounce/cache queries. [NLM approximate matching](https://lhncbc.nlm.nih.gov/RxNav/news/RxNormApproxMatch.html)

### TypeScript-friendly data boundary

The catalog describes **what a product concept is**. The order describes **what a clinician decided for one patient**. Keep them separate and snapshot the selected catalog display into the signed order so later RxNorm changes do not rewrite history.

```ts
type RxNormTermType =
  | "IN" | "PIN" | "MIN" | "BN"
  | "SCD" | "SBD" | "GPCK" | "BPCK"
  | "SCDF" | "SBDF" | "SCDG" | "SBDG";

interface MedicationCatalogItem {
  jurisdiction: "US";
  rxcui: string;
  displayName: string;
  termType: RxNormTermType;
  ingredientRxcuis: string[];
  ingredientNames: string[];
  strengthText?: string;
  doseFormRxcui?: string;
  doseFormName?: string;
  brandName?: string;
  genericName?: string;
  isBranded: boolean;
  searchAliases: string[]; // sourced/derived search aids, never clinical synonyms
  source: {
    system: "RxNorm-CPC";
    release: string;
    retrievedAt: string; // ISO-8601
    sourceUrl: string;
  };
  labelRefs?: {
    dailyMedSetIds?: string[];
    ndcs?: string[]; // package identifiers; not the core clinical identity
  };
}

interface PrescriptionOrder {
  id: string;
  patientId: string;
  prescriberId: string;
  encounterId: string;
  jurisdiction: "US";
  medicationRxcui: string;
  medicationSnapshot: Pick<MedicationCatalogItem,
    "rxcui" | "displayName" | "termType" | "ingredientNames" |
    "strengthText" | "doseFormName" | "brandName" | "genericName" | "source"
  >;
  doseQuantity?: string;
  doseUnit?: string;
  routeCode?: string;
  routeDisplay?: string;
  frequencyCode?: string;
  frequencyDisplay?: string;
  startDate?: string;
  endDate?: string;
  durationValue?: number;
  durationUnit?: "hour" | "day" | "week";
  dispenseQuantity?: string;
  dispenseUnit?: string;
  refills?: number;
  substitution: "allowed" | "not_allowed" | "unspecified";
  indicationText?: string;
  sigText: string;
  patientInstructions?: string;
  status: "draft" | "signed" | "sent" | "cancelled";
  authoredAt: string;
  signedAt?: string;
  externalErxId?: string;
}
```

Production should also store authorship, amendments/cancellation, transmission attempts, policy decisions, PMP attestation where applicable and an immutable audit trail. Use strings for medication quantities to avoid floating-point corruption and introduce a vetted coding system for route/frequency rather than inventing app-local clinical semantics.

### Thirty-item fixture rule

**Allowed:** a deterministic, test-only set of 30 concept snapshots taken from a named RxNorm CPC release. Each row may contain RxCUI, normalized display name, term type, ingredient, strength, dose form, brand/generic flag, label references and explicit provenance. Include distinct strengths/forms as distinct concepts, ambiguous search terms and zero-result cases so the UI is tested honestly.

**Forbidden:** default/recommended dose, frequency, route, duration, quantity, refills or indication; patient-specific orders; interaction, contraindication, allergy, pregnancy, renal, pediatric or maximum-dose claims; fabricated RxCUIs/NDCs; inferred equivalence; “most common” rankings presented as clinical guidance; silently auto-selecting a fuzzy match; using the 30 rows as the production catalog; or auto-signing/sending an order.

The fixture proves UI behavior only. It does not prove current market status, safe prescribing, label completeness, pharmacy acceptance or jurisdictional compliance.

## Unresolved evidence and next validation

1. Retrieve the official ADA XLSX and record the 2024 active-dentist count and ratio for CA/TX/FL/NY. The PDF confirms that state ratios exist but its map text extraction did not reliably bind values to states; guessing would be worse than an explicit blank.
2. If a true state demand comparison is required, select one common survey/year/measure from CDC Oral Health Data or BRFSS and export all four states together. CDC lists “dental visit” as an adult oral-health indicator, but this research did not obtain a verified four-row same-year extract. [CDC adult oral-health indicators](https://www.cdc.gov/oral-health-data-systems/about_oral_health_data/adult-indicators.html)
3. Validate RxNorm term-type filters with a clinical informaticist and create tests for retired/remapped RxCUIs before importing the 30-item fixture.
4. Select a certified e-prescribing/EPCS path. A medicine-name API is not an electronic-prescription network, identity-proofing system, controlled-substance signing workflow or pharmacy transmission service.

