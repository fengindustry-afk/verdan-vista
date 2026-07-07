import type { Feedstock } from "./types";
import { corcMetrics, parseCustodyLog } from "./feedstock";

/**
 * Compliance report generators, ported from the .NET `NCMPComplianceService`.
 * Each returns a plain-text/CSV string in the same layout the mobile/desktop app
 * emits, so downstream regulators receive an identical document from either client.
 * The carbon-tax figures — placeholders in the .NET version — are computed here
 * from the real CORC totals.
 */

function stamp(d = new Date()) {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
function ymd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
function ymdCompact(d = new Date()) {
  return ymd(d).replace(/-/g, "");
}
function addYears(n: number) {
  const d = new Date();
  d.setFullYear(d.getFullYear() + n);
  return d;
}
function addMonths(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d;
}
function q(v: unknown) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function custodyTraceability(f: Feedstock): string {
  const legs = parseCustodyLog(f);
  return Object.entries(legs)
    .map(([stage, leg]) => `${stage}@${leg.Location}`)
    .join(" -> ");
}

export function ncmpFeedstockReport(data: Feedstock[]): string {
  const L: string[] = [];
  const verified = data.filter((x) => (x.Status ?? "").toLowerCase() === "verified").length;
  const pending = data.filter((x) => (x.Status ?? "").toLowerCase() === "pending").length;
  const completionRate = data.length ? (verified / data.length) * 100 : 0;
  const suppliers = new Set(data.map((x) => x.Supplier)).size;

  L.push("MALAYSIA NATIONAL CARBON MARKET POLICY (NCMP) COMPLIANCE REPORT");
  L.push("Policy Effective Date: April 21, 2026");
  L.push(`Report Generated: ${stamp()}`);
  L.push(`Reporting Period: ${new Date().toLocaleString("en", { month: "long", year: "numeric" })}`);
  L.push(`NCMP Reference: NCMP-2026-FEEDSTOCK-${ymdCompact()}`);
  L.push("");
  L.push("REGULATORY COMPLIANCE INFORMATION");
  L.push("────────────────────────────────");
  L.push("Regulatory Body: Bank Negara Malaysia (BNM)");
  L.push("Exchange: Bursa Carbon Exchange (BCX)");
  L.push("Standard: Malaysia NCMP Carbon Credit Standard");
  L.push(`Compliance Status: ${verified > 0 ? "COMPLIANT" : "PARTIALLY COMPLIANT"}`);
  L.push("");
  L.push("PROJECT INFORMATION");
  L.push("──────────────────");
  L.push(`Project ID: CARBON-MY-${ymdCompact()}-${String(data.length).padStart(4, "0")}`);
  L.push("Project Type: Feedstock Carbon Sourcing");
  L.push("Project Location: Malaysia");
  L.push("Methodology: NCMP-Approved Feedstock Methodology v1.0");
  L.push("");
  L.push("NCMP SUMMARY STATISTICS");
  L.push("──────────────────────");
  L.push("Total Feedstock Items,Verified Items,Pending Items,Completion Rate (%),Unique Suppliers,NCMP Status");
  L.push(`${data.length},${verified},${pending},${completionRate.toFixed(2)},${suppliers},${completionRate >= 80 ? "COMPLIANT" : "NEEDS ATTENTION"}`);
  L.push("");
  L.push("DETAILED NCMP FEEDSTOCK DATA");
  L.push("NCMP_ID,Project_ID,Title,Type,Date,Amount,Status,Supplier,Net_CORC,Durability_Class,NCMP_Compliance,Current_Stage,Custody_Traceability");
  data
    .slice()
    .sort((a, b) => (b.Date ?? "").localeCompare(a.Date ?? ""))
    .forEach((item, i) => {
      const m = corcMetrics(item);
      const ncmpId = `NCMP-FS-${ymdCompact()}-${String(i + 1).padStart(4, "0")}`;
      const compliance = m.isCorcEligible ? "ELIGIBLE" : "REVIEW";
      L.push(
        [
          ncmpId,
          `CARBON-MY-${ymdCompact()}`,
          q(item.Title),
          q(item.Type),
          item.Date,
          q(item.Amount),
          q(item.Status),
          q(item.Supplier),
          m.netCorc.toFixed(2),
          m.durabilityClass,
          compliance,
          q(item.CurrentStage),
          q(custodyTraceability(item)),
        ].join(",")
      );
    });
  L.push("");
  L.push("NCMP CERTIFICATION");
  L.push("──────────────────");
  L.push("This report certifies that the project data complies with Malaysia's National Carbon Market Policy (NCMP) standards.");
  L.push(`Certification Date: ${ymd()}`);
  L.push(`Certification Valid Until: ${ymd(addYears(1))}`);
  L.push(`Next Review Date: ${ymd(addMonths(6))}`);
  return L.join("\n");
}

export function shariahReport(data: Feedstock[]): string {
  const L: string[] = [];
  const eligible = data.filter((x) => corcMetrics(x).sourcingEligible).length;
  L.push("SHARIAH COMPLIANCE CERTIFICATION REPORT");
  L.push("Bursa Carbon Exchange (BCX) — Shariah-Compliant Carbon Credits");
  L.push(`Report Generated: ${stamp()}`);
  L.push(`Shariah Reference: BCX-SHARIAH-${ymdCompact()}`);
  L.push("");
  L.push("SHARIAH COMPLIANCE INFORMATION");
  L.push("─────────────────────────────");
  L.push("Certifying Body: Shariah Advisory Council");
  L.push("Standard: BCX Shariah Screening Methodology");
  L.push("Underlying Asset: Biochar carbon removal (halal, asset-backed)");
  L.push(`Screened Batches: ${data.length}`);
  L.push(`Shariah-Eligible Sourcing: ${eligible}`);
  L.push(`Compliance Status: ${eligible === data.length && data.length > 0 ? "FULLY COMPLIANT" : "REVIEW REQUIRED"}`);
  L.push("");
  L.push("BATCH SCREENING DETAIL");
  L.push("Title,Type,Supplier,Sourcing_Status,Shariah_Eligible");
  data.forEach((item) => {
    const m = corcMetrics(item);
    L.push([q(item.Title), q(item.Type), q(item.Supplier), m.sourcingEligible ? "Eligible biomass" : "Sourcing review required", m.sourcingEligible ? "YES" : "NO"].join(","));
  });
  L.push("");
  L.push("This certifies the underlying carbon-removal assets are screened against BCX Shariah criteria.");
  L.push(`Certification Date: ${ymd()}`);
  L.push(`Valid Until: ${ymd(addYears(1))}`);
  return L.join("\n");
}

export function carbonTaxReport(data: Feedstock[]): string {
  const L: string[] = [];
  const totalCorc = data.reduce((s, f) => s + corcMetrics(f).netCorc, 0);
  const usdPerCredit = 25; // indicative CORC price
  const usdToMyr = 4.75;
  const grossValueMyr = totalCorc * usdPerCredit * usdToMyr;

  L.push("MALAYSIA NATIONAL CARBON TAX DISCLOSURE REPORT");
  L.push("Tax Authority: Inland Revenue Board of Malaysia (LHDN)");
  L.push(`Report Generated: ${stamp()}`);
  L.push(`Tax Year: ${new Date().getFullYear()}`);
  L.push(`Tax Reference: NCT-${ymdCompact()}`);
  L.push("");
  L.push("TAX DISCLOSURE INFORMATION");
  L.push("─────────────────────────");
  L.push("Entity Type: Carbon Credit Project");
  L.push("Tax Regime: National Carbon Tax 2026");
  L.push("Reporting Currency: Malaysian Ringgit (MYR)");
  L.push("Exchange Rate: 1 USD = 4.75 MYR (as of report date)");
  L.push("");
  L.push("CARBON CREDIT TAX CALCULATION");
  L.push("────────────────────────────");
  L.push(`Total Net CORCs Generated (tCO2e),${totalCorc.toFixed(2)}`);
  L.push(`Indicative Credit Price (USD),${usdPerCredit.toFixed(2)}`);
  L.push(`Gross Credit Value (MYR),${grossValueMyr.toFixed(2)}`);
  L.push("Tax Payment Due Date,2026-12-31");
  L.push("");
  L.push("TAX COMPLIANCE CERTIFICATION");
  L.push("──────────────────────────");
  L.push("This report is prepared in accordance with Malaysia's National Carbon Tax regulations.");
  L.push("Prepared by: Carbon Tracker System");
  L.push(`Prepared on: ${ymd()}`);
  L.push("Status: READY_FOR_SUBMISSION");
  return L.join("\n");
}

export function downloadText(content: string, filename: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
