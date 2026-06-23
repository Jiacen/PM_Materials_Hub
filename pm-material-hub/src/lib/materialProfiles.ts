export type MaterialProfile = {
  folderPrefix: string;
  primaryCardTypes: string[];
  showRawMlfbCards: boolean;
  enforceMlfbCoverage: boolean;
  requiresLlm: boolean;
};

const PROFILES: MaterialProfile[] = [
  {
    folderPrefix: '01_',
    primaryCardTypes: ['product_master'],
    showRawMlfbCards: true,
    enforceMlfbCoverage: true,
    requiresLlm: false,
  },
  {
    folderPrefix: '02_',
    primaryCardTypes: ['product_overview', 'selection_guide', 'module'],
    showRawMlfbCards: true,
    enforceMlfbCoverage: true,
    requiresLlm: true,
  },
  {
    folderPrefix: '03_',
    primaryCardTypes: ['technical_feature', 'technical_spec', 'module', 'limitation'],
    showRawMlfbCards: true,
    enforceMlfbCoverage: true,
    requiresLlm: true,
  },
  {
    folderPrefix: '04_',
    primaryCardTypes: ['product_overview', 'value_proposition', 'technical_feature', 'application', 'comparison', 'sales_message'],
    showRawMlfbCards: false,
    enforceMlfbCoverage: false,
    requiresLlm: true,
  },
  {
    folderPrefix: '05_',
    primaryCardTypes: ['case_study', 'customer_pain', 'solution', 'business_result'],
    showRawMlfbCards: false,
    enforceMlfbCoverage: false,
    requiresLlm: true,
  },
  {
    folderPrefix: '06_',
    primaryCardTypes: ['comparison', 'objection_handling', 'sales_message', 'competitive_claim'],
    showRawMlfbCards: false,
    enforceMlfbCoverage: false,
    requiresLlm: true,
  },
  {
    folderPrefix: '07_',
    primaryCardTypes: ['product_overview', 'release_notice', 'module', 'value_proposition'],
    showRawMlfbCards: false,
    enforceMlfbCoverage: false,
    requiresLlm: true,
  },
  {
    folderPrefix: '08_',
    primaryCardTypes: ['image_asset'],
    showRawMlfbCards: false,
    enforceMlfbCoverage: false,
    requiresLlm: false,
  },
  {
    folderPrefix: '09_',
    primaryCardTypes: ['certificate'],
    showRawMlfbCards: false,
    enforceMlfbCoverage: false,
    requiresLlm: true,
  },
  {
    folderPrefix: '10_',
    primaryCardTypes: ['faq', 'troubleshooting'],
    showRawMlfbCards: false,
    enforceMlfbCoverage: false,
    requiresLlm: true,
  },
];

const DEFAULT_PROFILE: MaterialProfile = {
  folderPrefix: '',
  primaryCardTypes: ['document'],
  showRawMlfbCards: false,
  enforceMlfbCoverage: false,
  requiresLlm: true,
};

export function getMaterialProfile(folderName: string): MaterialProfile {
  return PROFILES.find((profile) => folderName.startsWith(profile.folderPrefix)) || DEFAULT_PROFILE;
}
