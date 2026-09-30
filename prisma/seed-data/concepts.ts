/** Cross-certification concept map (see the product brief for the required examples). */
export const CONCEPTS: {
  slug: string;
  title: string;
  description: string;
  tr: { title: string; description: string };
  links: { code: string; lessonSlug?: string; note: string }[];
}[] = [
  {
    slug: "identity",
    title: "Identity and access",
    description: "Who someone is (authentication) and what they are allowed to do (authorization). Identity is the foundation of Zero Trust across Azure and Microsoft 365.",
    tr: { title: "Kimlik ve erişim", description: "Birinin kim olduğu (kimlik doğrulama) ve neler yapmasına izin verildiği (yetkilendirme). Kimlik, Azure ve Microsoft 365 genelinde Sıfır Güven yaklaşımının temelidir." },
    links: [
      { code: "AZ-900", lessonSlug: "entra-id-and-authentication", note: "Microsoft Entra ID, authentication methods and Azure RBAC for Azure resources." },
      { code: "SC-900", note: "Identity concepts and Microsoft Entra capabilities in depth." },
      { code: "MS-900", note: "Identity and access management in Microsoft 365 (retired exam)." },
    ],
  },
  {
    slug: "data-concepts",
    title: "Data concepts",
    description: "Structured, semi-structured and unstructured data, and how data prepares the ground for analytics and AI models.",
    tr: { title: "Veri kavramları", description: "Yapılandırılmış, yarı yapılandırılmış ve yapılandırılmamış veriler ile verilerin analiz ve yapay zekâ modelleri için nasıl zemin hazırladığı." },
    links: [
      { code: "DP-900", note: "Ways to represent data and data storage options." },
      { code: "AI-901", lessonSlug: "how-ai-models-work", note: "How data is used to train and ground AI models." },
    ],
  },
  {
    slug: "governance",
    title: "Governance",
    description: "Policies, standards and controls that keep cloud and business solutions compliant and manageable.",
    tr: { title: "Yönetişim", description: "Bulut ve iş çözümlerini uyumlu ve yönetilebilir tutan ilkeler, standartlar ve denetimler." },
    links: [
      { code: "AZ-900", lessonSlug: "azure-policy-and-resource-locks", note: "Azure Policy, resource locks and Microsoft Purview." },
      { code: "SC-900", note: "Compliance management and data governance with Microsoft Purview." },
      { code: "PL-900", note: "Power Platform administration and governance." },
    ],
  },
  {
    slug: "copilot-and-agents",
    title: "Copilot and agents",
    description: "AI assistants and agents that combine models, instructions, knowledge and tools - and the controls needed to govern them.",
    tr: { title: "Copilot ve ajanlar", description: "Modelleri, talimatları, bilgiyi ve araçları birleştiren yapay zekâ asistanları ve ajanlar ile bunları yönetmek için gereken denetimler." },
    links: [
      { code: "AB-900", note: "Administering Microsoft 365 Copilot and agents." },
      { code: "AI-901", lessonSlug: "building-agents-in-foundry", note: "Building agents with Microsoft Foundry." },
      { code: "PL-900", note: "Building and managing agents in Copilot Studio." },
    ],
  },
  {
    slug: "business-applications",
    title: "Business applications",
    description: "Low-code apps, automation and business process solutions that connect people, data and processes.",
    tr: { title: "İş uygulamaları", description: "İnsanları, verileri ve süreçleri birbirine bağlayan düşük kodlu uygulamalar, otomasyon ve iş süreci çözümleri." },
    links: [
      { code: "PL-900", note: "Power Apps, Power Automate and Dataverse." },
      { code: "MB-910", note: "Customer engagement apps in Dynamics 365 (retired exam)." },
      { code: "MB-920", note: "Finance and operations apps in Dynamics 365 (retired exam)." },
    ],
  },
];
