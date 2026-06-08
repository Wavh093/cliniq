-- Migration 023: Replace incorrect tariff codes with correct SA SADA/NRPL procedure codes
-- Source: DENIS Conservative Dentistry Codes (official SA SADA / NHRPL schedule)
-- Background: Migration 021 seeded codes 8501–8827 etc., which are NOT valid SA NRPL numbers.
--             This migration deletes all existing wrong-coded rows and re-seeds with
--             the correct code numbers as published by SADA / medical schemes (DENIS, GEMS).
-- Apply at: https://supabase.com/dashboard/project/hkmxsbopmvlprzktppzq/sql/new

-- ══════════════════════════════════════════════════════════════════════
--  1. Remove all existing (incorrect) tariff codes
-- ══════════════════════════════════════════════════════════════════════
DELETE FROM dental_tariff_codes;

-- ══════════════════════════════════════════════════════════════════════
--  2. Seed correct SA SADA / NRPL procedure codes
--     nrpl_fee left NULL — consult the current SADA tariff schedule.
--     Categories match standard SADA groupings.
-- ══════════════════════════════════════════════════════════════════════
INSERT INTO dental_tariff_codes (code, description, category) VALUES

-- ── Consultation / Examination ─────────────────────────────────────────
('8101', 'Oral Examination',                                                         'Consultation'),
('8102', 'Comprehensive Oral Examination',                                           'Consultation'),
('8104', 'Limited Oral Examination',                                                 'Consultation'),
('8129', 'Office/Hospital Visit – After Regularly Scheduled Hours',                 'Consultation'),
('8131', 'Emergency Dental Treatment',                                               'Consultation'),
('8190', 'Consultation – Second Opinion or Advice',                                  'Consultation'),

-- ── Radiographs ────────────────────────────────────────────────────────
('8107', 'Intraoral Radiograph – Periapical',                                        'Radiograph'),
('8108', 'Intraoral Radiographs – Complete Series',                                  'Radiograph'),
('8112', 'Intraoral Radiograph – Bitewing',                                          'Radiograph'),
('8113', 'Intraoral Radiograph – Occlusal',                                          'Radiograph'),
('8115', 'Extraoral Radiograph – Panoramic (OPG)',                                   'Radiograph'),
('8116', 'Extraoral Radiograph – Cephalometric',                                     'Radiograph'),
('8117', 'Diagnostic Models',                                                        'Radiograph'),
('8121', 'Oral and/or Facial Image (Digital/Conventional)',                          'Radiograph'),

-- ── Anaesthesia / Sedation ────────────────────────────────────────────
('8141', 'Inhalation Sedation – First 15 Minutes or Part Thereof',                  'Anaesthesia'),
('8143', 'Inhalation Sedation – Each Additional 15 Minutes',                        'Anaesthesia'),
('8145', 'Local Anaesthetic – Per Visit',                                            'Anaesthesia'),

-- ── Preventive ────────────────────────────────────────────────────────
('8109', 'Infection Control / Barrier Techniques',                                   'Preventive'),
('8110', 'Sterilized Instrumentation',                                               'Preventive'),
('8151', 'Oral Hygiene Instruction',                                                 'Preventive'),
('8155', 'Polishing – Complete Dentition',                                           'Preventive'),
('8159', 'Prophylaxis – Complete Dentition',                                         'Preventive'),
('8161', 'Topical Application of Fluoride – Child',                                  'Preventive'),
('8162', 'Topical Application of Fluoride – Adult',                                  'Preventive'),
('8163', 'Dental Sealant',                                                           'Preventive'),
('8165', 'Sedative Filling',                                                         'Preventive'),
('8166', 'Application of Desensitising Resin – Per Tooth',                          'Preventive'),
('8167', 'Application of Desensitising Medicament – Per Visit',                     'Preventive'),
('8169', 'Occlusal Guard',                                                           'Preventive'),
('8171', 'Mouth Protector',                                                          'Preventive'),
('8176', 'Periodontal Screening',                                                    'Preventive'),
('8179', 'Polishing – Complete Dentition (Periodontally Compromised Patient)',       'Preventive'),
('8180', 'Prophylaxis – Complete Dentition (Periodontally Compromised Patient)',     'Preventive'),

-- ── Oral Surgery ──────────────────────────────────────────────────────
('8201', 'Extraction – Tooth or Exposed Tooth Roots (First Per Quadrant)',           'Oral Surgery'),
('8202', 'Extraction – Each Additional Tooth or Exposed Tooth Roots',               'Oral Surgery'),
('8220', 'Cost of Suture Material',                                                  'Oral Surgery'),

-- ── Endodontics ───────────────────────────────────────────────────────
('8132', 'Pulp Removal (Pulpectomy)',                                                'Endodontics'),
('8136', 'Access Through a Prosthetic Crown or Inlay to Facilitate Root Canal',     'Endodontics'),
('8304', 'Rubber Dam – Per Arch',                                                    'Endodontics'),
('8307', 'Pulp Amputation (Pulpotomy)',                                              'Endodontics'),
('8328', 'Root Canal Obturation – Anteriors and Premolars – Each Additional Canal', 'Endodontics'),
('8329', 'Root Canal Therapy – Anteriors and Premolars – Each Additional Canal',    'Endodontics'),
('8330', 'Removal of Root Canal Obstruction',                                        'Endodontics'),
('8332', 'Root Canal Preparatory Visit – Single Canal Tooth',                       'Endodontics'),
('8333', 'Root Canal Preparatory Visit – Multi Canal Tooth',                        'Endodontics'),
('8334', 'Re-treatment of Previously Completed Root Canal Therapy – Per Canal',     'Endodontics'),
('8335', 'Root Canal Obturation – Anteriors and Premolars – First Canal',           'Endodontics'),
('8336', 'Root Canal Obturation – Posteriors – First Canal',                        'Endodontics'),
('8337', 'Root Canal Obturation – Posteriors – Each Additional Canal',              'Endodontics'),
('8338', 'Root Canal Therapy – Anteriors and Premolars – First Canal',              'Endodontics'),
('8339', 'Root Canal Therapy – Posteriors – First Canal',                           'Endodontics'),
('8340', 'Root Canal Therapy – Posteriors – Each Additional Canal',                 'Endodontics'),
('8635', 'Apexification / Apexogenesis / Recalcification – Per Visit',              'Endodontics'),
('8640', 'Removal of Fractured Root Canal Instrument',                              'Endodontics'),

-- ── Amalgam Restoration ───────────────────────────────────────────────
('8341', 'Amalgam – One Surface',                                                    'Amalgam'),
('8342', 'Amalgam – Two Surfaces',                                                   'Amalgam'),
('8343', 'Amalgam – Three Surfaces',                                                 'Amalgam'),
('8344', 'Amalgam – Four or More Surfaces',                                          'Amalgam'),

-- ── Resin Restoration ─────────────────────────────────────────────────
('8350', 'Resin Crown – Anterior Primary Tooth (Direct)',                            'Resin'),
('8351', 'Resin – One Surface, Anterior',                                            'Resin'),
('8352', 'Resin – Two Surfaces, Anterior',                                           'Resin'),
('8353', 'Resin – Three Surfaces, Anterior',                                         'Resin'),
('8354', 'Resin – Four or More Surfaces, Anterior',                                  'Resin'),
('8355', 'Veneer – Resin (Chair-Side)',                                              'Resin'),
('8367', 'Resin – One Surface, Posterior',                                           'Resin'),
('8368', 'Resin – Two Surfaces, Posterior',                                          'Resin'),
('8369', 'Resin – Three Surfaces, Posterior',                                        'Resin'),
('8370', 'Resin – Four or More Surfaces, Posterior',                                 'Resin'),

-- ── Core Build-Up & Post Retention ────────────────────────────────────
('8345', 'Prefabricated Post Retention – Per Post (In Addition to Restoration)',    'Core & Post'),
('8347', 'Pin Retention – First Pin (In Addition to Restoration)',                   'Core & Post'),
('8348', 'Pin Retention – Each Additional Pin (In Addition to Restoration)',         'Core & Post'),
('8349', 'Carve Restoration to Accommodate Existing Removable Prosthesis',          'Core & Post'),
('8376', 'Core Build-Up with Prefabricated Posts',                                  'Core & Post'),
('8379', 'Cost of Prefabricated Posts',                                              'Core & Post'),
('8398', 'Core Build-Up with Pins',                                                  'Core & Post'),

-- ── Removable Prosthodontics (Dentures) ───────────────────────────────
('8231', 'Complete Dentures – Maxillary and Mandibular',                             'Prosthodontics'),
('8232', 'Complete Denture – Maxillary or Mandibular',                               'Prosthodontics'),
('8233', 'Partial Denture – Resin Base – One Tooth',                                'Prosthodontics'),
('8234', 'Partial Denture – Resin Base – Two Teeth',                                'Prosthodontics'),
('8235', 'Partial Denture – Resin Base – Three Teeth',                              'Prosthodontics'),
('8236', 'Partial Denture – Resin Base – Four Teeth',                               'Prosthodontics'),
('8237', 'Partial Denture – Resin Base – Five Teeth',                               'Prosthodontics'),
('8238', 'Partial Denture – Resin Base – Six Teeth',                                'Prosthodontics'),
('8239', 'Partial Denture – Resin Base – Seven Teeth',                              'Prosthodontics'),
('8240', 'Partial Denture – Resin Base – Eight Teeth',                              'Prosthodontics'),
('8241', 'Partial Denture – Resin Base – Nine or More Teeth',                       'Prosthodontics'),
('8244', 'Immediate Denture – Maxillary',                                            'Prosthodontics'),
('8245', 'Immediate Denture – Mandibular',                                           'Prosthodontics'),
('8259', 'Rebase Complete or Partial Denture (Laboratory)',                          'Prosthodontics'),
('8261', 'Remodel Complete or Partial Denture',                                      'Prosthodontics'),
('8263', 'Reline Complete or Partial Denture (Chair-Side)',                          'Prosthodontics'),
('8265', 'Tissue Conditioning Per Arch (Including Soft Self-Cure Reline)',          'Prosthodontics'),
('8267', 'Reline Complete or Partial Denture (Laboratory)',                          'Prosthodontics'),
('8269', 'Repair Denture or Other Intra-Oral Appliance',                            'Prosthodontics'),
('8273', 'Impression to Repair or Modify a Denture or Other Intra-Oral Appliance', 'Prosthodontics'),
('8275', 'Adjust Complete or Partial Denture',                                       'Prosthodontics'),

-- ── Implants / Overdentures ────────────────────────────────────────────
('8533', 'Implant Supported Removable Complete Overdenture',                         'Implants'),
('8534', 'Implant Supported Removable Partial Overdenture',                          'Implants'),
('8652', 'Overdenture – Complete',                                                   'Implants'),
('8653', 'Overdenture – Partial',                                                    'Implants'),
('8654', 'Implant Supported Fixed-Detachable Complete Overdenture',                  'Implants'),
('8655', 'Implant Supported Fixed-Detachable Partial Overdenture',                   'Implants'),

-- ── Occlusion / TMJ ───────────────────────────────────────────────────
('8551', 'Occlusal Adjustment – Major',                                              'Occlusion'),
('8553', 'Occlusal Adjustment – Minor',                                              'Occlusion'),
('8850', 'Treatment of MPDS – First Visit',                                          'Occlusion'),
('8851', 'Treatment of MPDS – Subsequent Visit',                                     'Occlusion'),
('8852', 'Occlusal Orthotic Appliance',                                              'Occlusion')

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  category    = EXCLUDED.category;
