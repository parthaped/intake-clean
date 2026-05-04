-- IntakeClean: global checklist templates
-- These are read-only templates available to every org. Staff can either use
-- them directly or copy-and-customize when creating a request.

with t as (
  insert into public.checklist_templates (organization_id, name, matter_type, description, is_global)
  values
    (null, 'Immigration intake',         'immigration',     'Default checklist for immigration filings.', true),
    (null, 'Family law intake',          'family_law',      'Default checklist for family law matters.', true),
    (null, 'Personal injury intake',     'personal_injury', 'Default checklist for personal injury cases.', true),
    (null, 'Probate / estate intake',    'probate_estate',  'Default checklist for probate and estate work.', true),
    (null, 'Real estate intake',         'real_estate',     'Default checklist for real estate transactions.', true)
  returning id, matter_type
)
insert into public.checklist_template_items (template_id, title, description, required, sort_order)
select t.id, item.title, item.description, item.required, item.sort_order
from t
join lateral (
  values
    -- Immigration
    ('immigration'::matter_type_t,     'Passport',                       'Photo page only. All four corners visible.', true,  1),
    ('immigration',                    'Government ID',                  'Driver license or state ID, front and back.', true,  2),
    ('immigration',                    'Birth certificate',              'Issued copy. If non-English, include certified translation.', true, 3),
    ('immigration',                    'Marriage certificate',           'If applicable.',                              false, 4),
    ('immigration',                    'Prior immigration notices',      'Any USCIS or court notices received.',        false, 5),
    ('immigration',                    'Most recent tax return',         'Form 1040 with all schedules.',               true,  6),
    ('immigration',                    'Recent pay stubs',               'Last 3 months if employed.',                  false, 7),
    ('immigration',                    'Proof of address',               'Lease, utility bill, or bank statement.',     true,  8),
    ('immigration',                    'Supporting photos / evidence',   'Family photos, relationship evidence, etc.',  false, 9),

    -- Family law
    ('family_law',                     'Government ID',                  'Driver license or state ID.',                 true,  1),
    ('family_law',                     'Bank statements',                'Last 3 months from each account.',            true,  2),
    ('family_law',                     'Pay stubs',                      'Last 3 months from each employer.',           true,  3),
    ('family_law',                     'Tax returns',                    'Last 2 years.',                               true,  4),
    ('family_law',                     'Parenting communication',        'Texts or app exports relevant to the matter.',false, 5),
    ('family_law',                     'Court orders',                   'Any existing custody, support, or restraining orders.', false, 6),
    ('family_law',                     'Expenses / receipts',            'Childcare, medical, household.',              false, 7),
    ('family_law',                     'Photo evidence',                 'Property, injuries, conditions.',             false, 8),

    -- Personal injury
    ('personal_injury',                'Government ID',                  'Driver license or state ID.',                 true,  1),
    ('personal_injury',                'Police report',                  'Full incident report from law enforcement.',  true,  2),
    ('personal_injury',                'Medical records',                'Records related to injuries from this incident.', true, 3),
    ('personal_injury',                'Insurance documents',            'Auto, health, or other relevant policies.',   true,  4),
    ('personal_injury',                'Photos of injury / damage',      'Clear photos of injuries and property damage.', true, 5),
    ('personal_injury',                'Bills and receipts',             'Medical, prescription, repair, towing.',      true,  6),
    ('personal_injury',                'Wage loss documents',            'Employer letter or pay history showing missed work.', false, 7),

    -- Probate / estate
    ('probate_estate',                 'Death certificate',              'Certified copy.',                             true,  1),
    ('probate_estate',                 'Will or trust document',         'Signed and witnessed copy.',                  true,  2),
    ('probate_estate',                 'Property deed',                  'For real property in the estate.',            false, 3),
    ('probate_estate',                 'Bank / investment statements',   'Most recent statement for each account.',     true,  4),
    ('probate_estate',                 'Beneficiary information',        'Names, addresses, and relationships.',        true,  5),
    ('probate_estate',                 'Court forms',                    'Any forms already submitted to probate court.', false, 6),

    -- Real estate
    ('real_estate',                    'Deed',                           'Current recorded deed.',                      true,  1),
    ('real_estate',                    'Mortgage statement',             'Most recent statement.',                      true,  2),
    ('real_estate',                    'Closing disclosure',             'From the original purchase if available.',    false, 3),
    ('real_estate',                    'Title documents',                'Title insurance, title report.',              true,  4),
    ('real_estate',                    'Tax bill',                       'Most recent property tax bill.',              true,  5),
    ('real_estate',                    'Insurance documents',            'Homeowner or property insurance policy.',     true,  6)
) as item(matter_type, title, description, required, sort_order)
  on item.matter_type = t.matter_type;
