export type ScenarioTemplateSlot = {
  id: string;
  label: string;
  role: 'auto_title' | 'visual' | 'overview' | 'bullets' | 'text';
  type: 'text' | 'image' | 'bullets';
  allowedTypes?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
};

export type ScenarioTemplateLayout = {
  id: string;
  label: string;
  description: string;
  sourceKey: string;
  imageFile: string;
  pptFile: string;
  slideNumber: number;
  slots: ScenarioTemplateSlot[];
};

export const SCENARIO_TEMPLATE_LAYOUTS: ScenarioTemplateLayout[] = [
  {
    id: 'scenario-product-benefits-1',
    label: '场景模板 1',
    description: '左侧主视觉，右侧说明文字与客户收益。',
    sourceKey: 'Siemens_PM_Scenario_Templates_1',
    imageFile: 'Siemens_PM_Scenario_Templates_1_clean.png',
    pptFile: 'Siemens_PM_Scenario_Templates_1.pptx',
    slideNumber: 1,
    slots: [
      {
        id: 'title',
        label: '页面标题',
        role: 'auto_title',
        type: 'text',
        allowedTypes: ['document', 'value_proposition', 'product_overview', 'sales_message', 'ppt_selection'],
        x: 0.030,
        y: 0.052,
        width: 0.490,
        height: 0.085,
        backgroundColor: '#010226',
      },
      {
        id: 'main_visual',
        label: '主视觉',
        role: 'visual',
        type: 'image',
        allowedTypes: ['image', 'slide', 'ppt_selection'],
        x: 0.026,
        y: 0.168,
        width: 0.458,
        height: 0.657,
        backgroundColor: '#010226',
      },
      {
        id: 'overview_text',
        label: '说明文字',
        role: 'overview',
        type: 'text',
        allowedTypes: ['value_proposition', 'product_overview', 'sales_message', 'document', 'ppt_selection'],
        x: 0.514,
        y: 0.207,
        width: 0.459,
        height: 0.258,
        backgroundColor: '#333451',
      },
      {
        id: 'benefits',
        label: '客户收益',
        role: 'bullets',
        type: 'bullets',
        allowedTypes: ['business_result', 'value_proposition', 'customer_pain', 'solution', 'case_study', 'ppt_selection'],
        x: 0.514,
        y: 0.486,
        width: 0.459,
        height: 0.362,
        backgroundColor: '#08BDB4',
      },
    ],
  },
];

export function getScenarioTemplateLayout(templateId?: string | null) {
  return SCENARIO_TEMPLATE_LAYOUTS.find(template => template.id === templateId);
}
