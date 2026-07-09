import type { WorkProcessEntry } from "./workProcess";

/**
 * Compact demo seed for the Work Process hub — a representative subset of the
 * historical Tigasfera workbook rows (the full 316-row import lives in
 * security/seed-work-process.sql). Used as a read-only fallback when the shared
 * Supabase `work_process_entries` table is empty (demo / preview / offline), so
 * the workflow always has realistic data to browse.
 */

const raw = (
  id: string,
  StageKey: string,
  StageTitle: string,
  Values: Record<string, string>,
  Timestamp: string
): WorkProcessEntry => ({ id, Id: id, StageKey, StageTitle, Values, CapturedBy: "Imported (Excel)", Timestamp });

export const WORK_PROCESS_SEED: WorkProcessEntry[] = [
  raw("wpe_receiving_0001", "receiving", "Feedstock Collection", {
    batch_id: "ZA-01-11-24", pre_processing_date: "2024-11-01", biomass_type: "Woodchip",
    origin_location: "Cyberjaya", transport_size: "5 MT Lorry", transport_fuel: "Diesel",
    storage_location: "Zone A", weight: "5000", moisture: "0.5", storage_type: "open",
    supporting_document: "Payment recipt", remarks: "JAD",
  }, "2024-11-01T00:00:00Z"),
  raw("wpe_receiving_0002", "receiving", "Feedstock Collection", {
    batch_id: "ZA-02-11-24", pre_processing_date: "2024-11-06", biomass_type: "Woodchip",
    origin_location: "Cyberjaya", transport_size: "5 MT Lorry", transport_fuel: "Diesel",
    storage_location: "Zone A", weight: "5000", moisture: "0.5", storage_type: "open",
    supporting_document: "Payment recipt", remarks: "JAD",
  }, "2024-11-06T00:00:00Z"),
  raw("wpe_receiving_0003", "receiving", "Feedstock Collection", {
    batch_id: "ZA-03-11-24", pre_processing_date: "2024-11-12", biomass_type: "Woodchip",
    origin_location: "Cyberjaya", transport_size: "5 MT Lorry", transport_fuel: "Diesel",
    storage_location: "Zone A", weight: "5000", moisture: "0.5", storage_type: "open",
    supporting_document: "Payment recipt", remarks: "JAD",
  }, "2024-11-12T00:00:00Z"),

  raw("wpe_isolation_0001", "isolation", "Isolation / Sieving", {
    batch_id: "ZA-01-11-18", zone: "A", pre_processing_date: "2024-11-04", biomass_type: "Woodchip",
    input_quantity: "1", good_feedstock_quantity: "700", reject_quantity: "300", storage_tag: "ZA-01-11-18",
  }, "2024-11-04T00:00:00Z"),
  raw("wpe_isolation_0002", "isolation", "Isolation / Sieving", {
    batch_id: "ZA-01-11-19", zone: "A", pre_processing_date: "2024-11-05", biomass_type: "Woodchip",
    input_quantity: "1", good_feedstock_quantity: "650", reject_quantity: "350", storage_tag: "ZA-01-11-19",
  }, "2024-11-05T00:00:00Z"),
  raw("wpe_isolation_0003", "isolation", "Isolation / Sieving", {
    batch_id: "ZA-01-11-20", zone: "A", pre_processing_date: "2024-11-06", biomass_type: "Woodchip",
    input_quantity: "1", good_feedstock_quantity: "800", reject_quantity: "200", storage_tag: "ZA-01-11-20",
  }, "2024-11-06T00:00:00Z"),

  raw("wpe_drying_0001", "drying", "Drying", {
    batch_id: "ZA-01-11-24", pre_processing_date: "2024-11-11", biomass_type: "Woodchip",
    input_quantity: "250", drying_equipment: "SUN", moisture_before: "0.5", moisture_after: "0.18",
    output_quantity: "200", storage_location: "JUMBO BAG",
  }, "2024-11-11T00:00:00Z"),
  raw("wpe_drying_0002", "drying", "Drying", {
    batch_id: "ZA-01-11-24", pre_processing_date: "2024-11-18", biomass_type: "Woodchip",
    input_quantity: "250", drying_equipment: "SUN", moisture_before: "0.5", moisture_after: "0.15",
    output_quantity: "200", storage_location: "JUMBO BAG",
  }, "2024-11-18T00:00:00Z"),
  raw("wpe_drying_0003", "drying", "Drying", {
    batch_id: "ZA-01-11-24", pre_processing_date: "2024-11-25", biomass_type: "Woodchip",
    input_quantity: "200", drying_equipment: "SUN", moisture_before: "0.5", moisture_after: "0.17",
    output_quantity: "150", storage_location: "JUMBO BAG",
  }, "2024-11-25T00:00:00Z"),

  raw("wpe_production_05_0001", "production_05", "Biochar Production 0.5", {
    batch_id: "ZA-01-11-24", production_date: "2024-11-04", type_of_biomass: "Ash",
    biomass_input_amount: "150", moisture_content_of_biomass: "20", weight_of_fuel: "180",
    pyrolysis_temp_max: "400", residence_time: "8", tar_vinegar_amount: "0.2", emission: "N/A",
    biochar_moisture_after_drying: "15", final_biochar_amount: "14", storage_location: "Biochar Store",
  }, "2024-11-04T00:00:00Z"),
  raw("wpe_production_05_0002", "production_05", "Biochar Production 0.5", {
    batch_id: "ZA-01-11-24", production_date: "2024-11-05", type_of_biomass: "Woodchip",
    biomass_input_amount: "160", moisture_content_of_biomass: "18", weight_of_fuel: "170",
    pyrolysis_temp_max: "420", residence_time: "8", tar_vinegar_amount: "0.3", emission: "N/A",
    biochar_moisture_after_drying: "14", final_biochar_amount: "15", storage_location: "Biochar Store",
  }, "2024-11-05T00:00:00Z"),

  raw("wpe_production_10_0001", "production_10", "Biochar Production 1.0", {
    batch_id: "08012025 CYB", production_date: "2025-01-08", type_of_biomass: "Woodchip",
    biomass_input_amount: "264", moisture_content_of_biomass: "23", diesel_energy_36_mj_l: "180",
    pyrolysis_temp_min: "750", pyrolysis_temp_max: "800", residence_time: "1", tar_vinegar_amount: "2",
    emission: "N/A", biochar_moisture_after_drying: "17", final_biochar_amount: "78", storage_location: "Biochar Store",
  }, "2025-01-08T00:00:00Z"),

  raw("wpe_application_0001", "application", "Application", {
    batch_id: "Qarbotech", biochar_do: "2020808/001", quantity_applied: "8900",
    application_type: "Carbon Dot", transport_fuel: "Lorry", location_of_mixing_processing: "UPM",
    location_of_storage: "UPM", supporting_document: "2020808/001",
  }, "2025-01-01T00:00:00Z"),

  raw("wpe_carbon_sink_0001", "carbon_sink", "Carbon Sink", {
    batch_id: "TIGGT-BT-2505-0001", supporting_document: "Invoice", procurement_delivery_date: "2025-05-15",
    usage_date: "2025-05-17", quantity: "100", carbon_sink_type: "COMMUNITY FARMING",
    location_of_final_permanent_application: "SMH - BATU 3 SEMWNYIH", project_type: "Bamboo",
    remarks: "MITI", references: "TIGGT",
  }, "2025-05-15T00:00:00Z"),
];
