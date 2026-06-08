-- Migration 021: SA Dental Tariff Reference Tables + Structured Clinical Codes
-- Apply at: https://supabase.com/dashboard/project/hkmxsbopmvlprzktppzq/sql/new
-- No practice_id on reference tables — these are shared lookup tables.

-- ══════════════════════════════════════════════════════════════════════
--  1. Dental tariff reference codes (SADA/NRPL procedure codes)
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dental_tariff_codes (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  code         text        NOT NULL UNIQUE,
  description  text        NOT NULL,
  category     text        NOT NULL DEFAULT 'General',
  nrpl_fee     numeric(10,2),   -- Reference price in ZAR (NULL = consult SADA tariff book)
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════
--  2. ICD-10 oral health diagnosis codes
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS dental_icd10_codes (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  code         text        NOT NULL UNIQUE,
  description  text        NOT NULL,
  category     text        NOT NULL DEFAULT 'General',
  is_active    boolean     NOT NULL DEFAULT true
);

-- ══════════════════════════════════════════════════════════════════════
--  3. Convert appointments.tariff_codes and icd10_codes text[] → jsonb
--     Must drop the existing default first — Postgres cannot auto-cast
--     a text[] default to jsonb in a single ALTER COLUMN statement.
--     to_jsonb() safely converts '{}' → [] and '{"K02.1"}' → ["K02.1"]
--     The UI normalises string elements to objects on load.
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE appointments ALTER COLUMN tariff_codes DROP DEFAULT;
ALTER TABLE appointments ALTER COLUMN tariff_codes
  TYPE jsonb USING to_jsonb(COALESCE(tariff_codes, '{}'::text[]));
ALTER TABLE appointments ALTER COLUMN tariff_codes SET DEFAULT '[]'::jsonb;
ALTER TABLE appointments ALTER COLUMN tariff_codes SET NOT NULL;

ALTER TABLE appointments ALTER COLUMN icd10_codes DROP DEFAULT;
ALTER TABLE appointments ALTER COLUMN icd10_codes
  TYPE jsonb USING to_jsonb(COALESCE(icd10_codes, '{}'::text[]));
ALTER TABLE appointments ALTER COLUMN icd10_codes SET DEFAULT '[]'::jsonb;
ALTER TABLE appointments ALTER COLUMN icd10_codes SET NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
--  4. Seed correct SA SADA / NRPL procedure codes
--     Source: DENIS Conservative Dentistry Codes (official SADA / NHRPL schedule)
--     nrpl_fee left NULL — consult the current SADA tariff schedule for current rates.
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
  category    = EXCLUDED.category,
  nrpl_fee    = EXCLUDED.nrpl_fee;

-- ══════════════════════════════════════════════════════════════════════
--  5. Seed oral health ICD-10 diagnosis codes
-- ══════════════════════════════════════════════════════════════════════
INSERT INTO dental_icd10_codes (code, description, category) VALUES

-- Caries
('K02.0', 'Dental caries limited to enamel',                        'Caries'),
('K02.1', 'Dental caries of dentine',                               'Caries'),
('K02.2', 'Dental caries of cementum',                              'Caries'),
('K02.3', 'Arrested dental caries',                                 'Caries'),
('K02.8', 'Other dental caries',                                    'Caries'),
('K02.9', 'Dental caries, unspecified',                             'Caries'),

-- Hard tissue diseases
('K03.0', 'Excessive attrition of teeth',                           'Hard Tissue'),
('K03.1', 'Abrasion of teeth',                                      'Hard Tissue'),
('K03.2', 'Erosion of teeth',                                       'Hard Tissue'),
('K03.3', 'Pathological resorption of teeth',                       'Hard Tissue'),
('K03.4', 'Hypercementosis',                                        'Hard Tissue'),
('K03.6', 'Deposits (accretions) on teeth',                         'Hard Tissue'),
('K03.7', 'Post-eruptive colour changes of dental tissue',          'Hard Tissue'),

-- Pulp and periapical
('K04.0', 'Pulpitis',                                               'Pulp & Periapical'),
('K04.1', 'Necrosis of pulp',                                       'Pulp & Periapical'),
('K04.2', 'Pulp degeneration',                                      'Pulp & Periapical'),
('K04.4', 'Acute apical periodontitis of pulpal origin',            'Pulp & Periapical'),
('K04.5', 'Chronic apical periodontitis',                           'Pulp & Periapical'),
('K04.6', 'Periapical abscess with sinus',                          'Pulp & Periapical'),
('K04.7', 'Periapical abscess without sinus',                       'Pulp & Periapical'),
('K04.8', 'Radicular cyst',                                         'Pulp & Periapical'),

-- Periodontal
('K05.0', 'Acute gingivitis',                                       'Periodontal'),
('K05.1', 'Chronic gingivitis',                                     'Periodontal'),
('K05.2', 'Acute periodontitis',                                    'Periodontal'),
('K05.3', 'Chronic periodontitis',                                  'Periodontal'),
('K05.4', 'Periodontosis (aggressive periodontitis)',               'Periodontal'),
('K05.5', 'Other periodontal diseases',                             'Periodontal'),

-- Gingival
('K06.0', 'Gingival recession',                                     'Gingival'),
('K06.1', 'Gingival enlargement (hyperplasia)',                     'Gingival'),
('K06.2', 'Gingival and edentulous alveolar ridge disorders',       'Gingival'),

-- Tooth development
('K00.0', 'Anodontia',                                              'Development'),
('K00.1', 'Supernumerary teeth',                                    'Development'),
('K00.2', 'Abnormalities of tooth size and form',                   'Development'),
('K00.4', 'Disturbances in tooth eruption',                         'Development'),
('K00.6', 'Disturbances in tooth eruption — natal/neonatal',        'Development'),
('K01.0', 'Embedded teeth',                                         'Development'),
('K01.1', 'Impacted teeth',                                         'Development'),

-- Other tooth disorders
('K08.0', 'Exfoliation of teeth due to systemic causes',            'Other'),
('K08.1', 'Loss of teeth due to accident, extraction or local causes','Other'),
('K08.2', 'Atrophy of edentulous alveolar ridge',                   'Other'),
('K08.3', 'Retained dental root',                                   'Other'),
('K08.8', 'Other specified disorders of teeth and supporting structures','Other'),

-- Cysts
('K09.0', 'Developmental odontogenic cysts (dentigerous)',          'Cysts'),
('K09.1', 'Developmental (non-odontogenic) cysts of oral region',  'Cysts'),
('K09.2', 'Other cysts of jaw',                                     'Cysts'),

-- Jaw conditions
('K10.2', 'Inflammatory conditions of jaws (osteitis/osteomyelitis)','Jaw'),
('K10.3', 'Alveolitis of jaws (dry socket / alveolar osteitis)',    'Jaw'),
('K10.8', 'Other specified diseases of jaws',                       'Jaw'),

-- Oral mucosa
('K12.0', 'Recurrent oral aphthae (aphthous ulcers)',               'Oral Mucosa'),
('K12.1', 'Other forms of stomatitis',                              'Oral Mucosa'),
('K12.2', 'Cellulitis and abscess of mouth',                        'Oral Mucosa'),
('K13.0', 'Diseases of lips (angular cheilitis / cheilosis)',       'Oral Mucosa'),
('K13.3', 'Hairy leukoplakia',                                      'Oral Mucosa'),
('K13.7', 'Other and unspecified lesions of oral mucosa',           'Oral Mucosa'),

-- Trauma
('S02.5', 'Fracture of tooth',                                      'Trauma'),
('S02.6', 'Fracture of mandible',                                   'Trauma'),
('S03.2', 'Dislocation of tooth',                                   'Trauma'),
('S03.4', 'Sprain of joints and ligaments of jaw',                  'Trauma'),

-- TMJ
('K07.6', 'Temporomandibular joint disorders (TMD)',                'TMJ'),
('M26.60','Temporomandibular joint disorders — unspecified',        'TMJ'),

-- Systemic / other
('E11.0', 'Type 2 diabetes mellitus — oral manifestations',         'Systemic'),
('B37.0', 'Oral candidiasis (oral thrush)',                          'Systemic'),
('L23.7', 'Allergic contact dermatitis — oral cavity',              'Systemic')

ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  category    = EXCLUDED.category;

-- ══════════════════════════════════════════════════════════════════════
--  6. Indexes
-- ══════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_dental_tariff_codes_code     ON dental_tariff_codes(code);
CREATE INDEX IF NOT EXISTS idx_dental_tariff_codes_category ON dental_tariff_codes(category);
CREATE INDEX IF NOT EXISTS idx_dental_tariff_codes_search   ON dental_tariff_codes USING gin(to_tsvector('simple', code || ' ' || description));
CREATE INDEX IF NOT EXISTS idx_dental_icd10_codes_code      ON dental_icd10_codes(code);
CREATE INDEX IF NOT EXISTS idx_dental_icd10_codes_category  ON dental_icd10_codes(category);

-- ══════════════════════════════════════════════════════════════════════
--  7. RLS — shared reference tables, read by authenticated, full by service-role
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE dental_tariff_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dental_icd10_codes  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_tariff"  ON dental_tariff_codes;
DROP POLICY IF EXISTS "auth_read_tariff"          ON dental_tariff_codes;
DROP POLICY IF EXISTS "service_role_all_icd10"   ON dental_icd10_codes;
DROP POLICY IF EXISTS "auth_read_icd10"           ON dental_icd10_codes;

CREATE POLICY "service_role_all_tariff" ON dental_tariff_codes FOR ALL      TO service_role  USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_tariff"        ON dental_tariff_codes FOR SELECT   TO authenticated USING (true);
CREATE POLICY "service_role_all_icd10"  ON dental_icd10_codes  FOR ALL      TO service_role  USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_icd10"         ON dental_icd10_codes  FOR SELECT   TO authenticated USING (true);
