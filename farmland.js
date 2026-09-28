// Real land cover around each area, from Agriculture and Agri-Food Canada's
// Annual Crop Inventory 2025 (30 m satellite crop map). Percent of land (water excluded)
// within 10 km of each area's centre. Computed with the AAFC ImageServer computeHistograms
// service on 2026-09-28.
//   cropland = annual crops (corn, soybeans, cereals, other field crops)
//   hay = pasture and forage;  land = land type derived from these numbers:
//   urban ≥60% built-up · suburban ≥25% built-up · forest ≥60% forest ·
//   farm ≥45% cropland+hay · mixed ≥25% cropland+hay
export const FARMLAND_SOURCE = {
  name: 'Agriculture and Agri-Food Canada, Annual Crop Inventory 2025',
  url: 'https://open.canada.ca/data/en/dataset/ba2645d5-4458-414d-b196-6303ac06c1c9',
  radiusKm: 10,
};

export const FARMLAND = {
  'embrun': {"cropland": 58, "hay": 9, "corn": 31, "soy": 24, "grain": 3, "urban": 7, "forest": 24, "land": "farm"},
  'hawkesbury': {"cropland": 24, "hay": 12, "corn": 8, "soy": 15, "grain": 1, "urban": 10, "forest": 53, "land": "mixed"},
  'rockland': {"cropland": 27, "hay": 14, "corn": 9, "soy": 17, "grain": 2, "urban": 10, "forest": 47, "land": "mixed"},
  'orleans': {"cropland": 22, "hay": 9, "corn": 7, "soy": 14, "grain": 1, "urban": 30, "forest": 33, "land": "suburban"},
  'ottawa': {"cropland": 3, "hay": 2, "corn": 1, "soy": 1, "grain": 0, "urban": 69, "forest": 26, "land": "urban"},
  'kanata': {"cropland": 19, "hay": 8, "corn": 10, "soy": 8, "grain": 1, "urban": 32, "forest": 36, "land": "suburban"},
  'barrhaven': {"cropland": 28, "hay": 9, "corn": 14, "soy": 12, "grain": 1, "urban": 36, "forest": 25, "land": "suburban"},
  'greely': {"cropland": 23, "hay": 12, "corn": 8, "soy": 13, "grain": 1, "urban": 13, "forest": 49, "land": "mixed"},
  'winchester': {"cropland": 76, "hay": 8, "corn": 35, "soy": 36, "grain": 5, "urban": 4, "forest": 11, "land": "farm"},
  'cornwall': {"cropland": 16, "hay": 11, "corn": 7, "soy": 8, "grain": 1, "urban": 26, "forest": 43, "land": "suburban"},
  'alexandria': {"cropland": 34, "hay": 14, "corn": 13, "soy": 19, "grain": 2, "urban": 4, "forest": 46, "land": "farm"},
  'morrisburg': {"cropland": 34, "hay": 11, "corn": 14, "soy": 17, "grain": 3, "urban": 6, "forest": 45, "land": "farm"},
  'brockville': {"cropland": 15, "hay": 13, "corn": 6, "soy": 7, "grain": 2, "urban": 16, "forest": 51, "land": "mixed"},
  'kemptville': {"cropland": 23, "hay": 12, "corn": 9, "soy": 13, "grain": 1, "urban": 7, "forest": 52, "land": "mixed"},
  'perth': {"cropland": 13, "hay": 25, "corn": 4, "soy": 7, "grain": 1, "urban": 7, "forest": 46, "land": "mixed"},
  'arnprior': {"cropland": 30, "hay": 14, "corn": 9, "soy": 17, "grain": 4, "urban": 9, "forest": 43, "land": "mixed"},
  'carleton-place': {"cropland": 16, "hay": 19, "corn": 7, "soy": 7, "grain": 2, "urban": 8, "forest": 46, "land": "mixed"},
  'sharbot-lake': {"cropland": 0, "hay": 2, "corn": 0, "soy": 0, "grain": 0, "urban": 3, "forest": 86, "land": "forest"},
  'pembroke': {"cropland": 14, "hay": 19, "corn": 3, "soy": 9, "grain": 1, "urban": 10, "forest": 55, "land": "mixed"},
  'kingston': {"cropland": 10, "hay": 25, "corn": 2, "soy": 6, "grain": 2, "urban": 31, "forest": 26, "land": "suburban"},
  'toronto': {"cropland": 1, "hay": 1, "corn": 0, "soy": 0, "grain": 0, "urban": 89, "forest": 7, "land": "urban"},
  'montreal': {"cropland": 0, "hay": 1, "corn": 0, "soy": 0, "grain": 0, "urban": 93, "forest": 5, "land": "urban"},
  'calgary': {"cropland": 1, "hay": 0, "corn": 0, "soy": 0, "grain": 1, "urban": 85, "forest": 4, "land": "urban"},
  'vancouver': {"cropland": 0, "hay": 0, "corn": 0, "soy": 0, "grain": 0, "urban": 77, "forest": 22, "land": "urban"},
  'halifax': {"cropland": 0, "hay": 0, "corn": 0, "soy": 0, "grain": 0, "urban": 45, "forest": 49, "land": "suburban"},
};

// Latest regional crop report. Update this when a new report comes out.
// Points are summarized in our own words.
export const CROP_REPORT = {
  date: '2026-09-25',
  source: 'Farmers Forum, Eastern Ontario Crop Report',
  url: 'https://farmersforum.com/east-crop-report-5/',
  points: [
    'Soybean combining started around Sept. 20 and was expected to be in full swing the week of Sept. 30.',
    'Corn silage harvest was mostly finished; grain corn was drying down.',
    'Winter wheat planting was ramping up right behind the soybean combines.',
    'Soils were very dry after little rain in September.',
    'The last hay was being cut and wrapped.',
  ],
};
