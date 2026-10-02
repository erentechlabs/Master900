/** Cross-certification concept map: the same idea seen from different certifications, linked to the lessons that teach it. */
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
    description: "Who someone is (authentication) and what they are allowed to do (authorization). Identity is the foundation of Zero Trust across Azure, Microsoft 365 and GitHub.",
    tr: { title: "Kimlik ve erişim", description: "Birinin kim olduğu (kimlik doğrulama) ve neler yapmasına izin verildiği (yetkilendirme). Kimlik; Azure, Microsoft 365 ve GitHub genelinde Sıfır Güven yaklaşımının temelidir." },
    links: [
      { code: "AZ-900", lessonSlug: "entra-id-and-authentication", note: "Microsoft Entra ID, authentication methods and Azure RBAC for Azure resources." },
      { code: "SC-900", lessonSlug: "entra-id-functions-and-identities", note: "Identity types and the functions of Microsoft Entra ID." },
      { code: "SC-900", lessonSlug: "entra-access-management", note: "Conditional Access and Microsoft Entra roles." },
      { code: "AB-900", lessonSlug: "microsoft-365-security-principles", note: "Identity as the control plane for Microsoft 365 and Copilot." },
      { code: "GH-900", lessonSlug: "secure-accounts-and-access", note: "Two-factor authentication, organizations, teams and repository roles." },
      { code: "MS-900", note: "Identity and access management in Microsoft 365 (retired exam)." },
    ],
  },
  {
    slug: "data-concepts",
    title: "Data concepts",
    description: "Structured, semi-structured and unstructured data, and how data prepares the ground for analytics and AI models.",
    tr: { title: "Veri kavramları", description: "Yapılandırılmış, yarı yapılandırılmış ve yapılandırılmamış veriler ile verilerin analiz ve yapay zekâ modelleri için nasıl zemin hazırladığı." },
    links: [
      { code: "DP-900", lessonSlug: "represent-structured-semi-unstructured-data", note: "Ways to represent data." },
      { code: "DP-900", lessonSlug: "choose-files-and-databases", note: "Files, databases and common data stores." },
      { code: "AI-901", lessonSlug: "how-ai-models-work", note: "How data is used to train and ground AI models." },
    ],
  },
  {
    slug: "governance",
    title: "Governance",
    description: "Policies, standards and controls that keep cloud and business solutions compliant and manageable.",
    tr: { title: "Yönetişim", description: "Bulut ve iş çözümlerini uyumlu ve yönetilebilir tutan ilkeler, standartlar ve denetimler." },
    links: [
      { code: "AZ-900", lessonSlug: "azure-policy-and-resource-locks", note: "Azure Policy and resource locks." },
      { code: "SC-900", lessonSlug: "purview-compliance-manager-and-compliance-score", note: "Compliance Manager and the compliance score in Microsoft Purview." },
      { code: "PL-900", lessonSlug: "pl900-admin-governance", note: "Environments, data policies and security roles in Power Platform." },
      { code: "AB-900", lessonSlug: "purview-for-m365-copilot", note: "Microsoft Purview for Microsoft 365 and Copilot." },
    ],
  },
  {
    slug: "copilot-and-agents",
    title: "Copilot and agents",
    description: "AI assistants and agents that combine models, instructions, knowledge and tools - and the controls needed to govern them.",
    tr: { title: "Copilot ve ajanlar", description: "Modelleri, talimatları, bilgiyi ve araçları birleştiren yapay zekâ asistanları ve ajanlar ile bunları yönetmek için gereken denetimler." },
    links: [
      { code: "AB-900", lessonSlug: "copilot-and-agent-capabilities", note: "Microsoft 365 Copilot, Copilot Chat and agents." },
      { code: "AB-900", lessonSlug: "basic-agent-administration", note: "Administering agents in Microsoft 365." },
      { code: "AI-901", lessonSlug: "building-agents-in-foundry", note: "Building agents with Microsoft Foundry." },
      { code: "PL-900", lessonSlug: "copilot-studio-agent-building-blocks", note: "Building agents in Copilot Studio." },
      { code: "GH-900", lessonSlug: "ai-cloud-development-environments", note: "GitHub Copilot for developers." },
    ],
  },
  {
    slug: "business-applications",
    title: "Business applications",
    description: "Low-code apps, automation and business process solutions that connect people, data and processes.",
    tr: { title: "İş uygulamaları", description: "İnsanları, verileri ve süreçleri birbirine bağlayan düşük kodlu uygulamalar, otomasyon ve iş süreci çözümleri." },
    links: [
      { code: "PL-900", lessonSlug: "pl900-business-value", note: "The business value of Power Platform." },
      { code: "PL-900", lessonSlug: "pl900-power-apps-use-cases", note: "Canvas and model-driven apps." },
      { code: "MB-910", note: "Customer engagement apps in Dynamics 365 (retired exam)." },
      { code: "MB-920", note: "Finance and operations apps in Dynamics 365 (retired exam)." },
    ],
  },
  {
    slug: "threat-protection",
    title: "Threat protection and security operations",
    description: "Defense in depth in practice: posture management, detection, investigation and response across cloud, devices, identities, email and code.",
    tr: { title: "Tehdit koruması ve güvenlik operasyonları", description: "Uygulamada derinlemesine savunma: bulut, cihazlar, kimlikler, e-posta ve kod genelinde güvenlik duruşu yönetimi, algılama, araştırma ve müdahale." },
    links: [
      { code: "AZ-900", lessonSlug: "rbac-zero-trust-defender", note: "Zero Trust, defense in depth and Microsoft Defender for Cloud." },
      { code: "SC-900", lessonSlug: "sentinel-siem-soar-operations", note: "SIEM and SOAR with Microsoft Sentinel." },
      { code: "SC-900", lessonSlug: "defender-xdr-portal-incidents", note: "Incidents in Microsoft Defender XDR." },
      { code: "AB-900", lessonSlug: "microsoft-365-core-security-features", note: "Core security features of Microsoft 365." },
      { code: "GH-900", lessonSlug: "protect-code-and-dependencies", note: "Dependabot, code scanning and secret scanning." },
    ],
  },
  {
    slug: "data-protection",
    title: "Data protection and compliance",
    description: "Knowing where sensitive data lives, labelling and protecting it, preventing loss and oversharing, and proving compliance.",
    tr: { title: "Veri koruma ve uyumluluk", description: "Hassas verilerin nerede olduğunu bilmek, onları etiketleyip korumak, kaybı ve aşırı paylaşımı önlemek ve uyumluluğu kanıtlamak." },
    links: [
      { code: "SC-900", lessonSlug: "classify-protect-and-prevent-data-loss", note: "Sensitivity labels and data loss prevention." },
      { code: "SC-900", lessonSlug: "govern-retain-and-manage-records", note: "Retention and records management." },
      { code: "AB-900", lessonSlug: "copilot-data-access-and-grounding", note: "How Copilot respects permissions and labels." },
      { code: "AB-900", lessonSlug: "sharepoint-oversharing-reports", note: "Finding oversharing in SharePoint." },
      { code: "AZ-900", lessonSlug: "purview-and-service-trust-portal", note: "Microsoft Purview and the Service Trust Portal." },
    ],
  },
  {
    slug: "automation",
    title: "Automation and infrastructure as code",
    description: "Describing work once and letting a platform repeat it reliably: templates, workflows and flows triggered by events or schedules.",
    tr: { title: "Otomasyon ve kod olarak altyapı", description: "İşi bir kez tanımlayıp bir platformun onu güvenilir şekilde tekrarlamasını sağlamak: olaylar veya zamanlamalarla tetiklenen şablonlar, iş akışları ve akışlar." },
    links: [
      { code: "AZ-900", lessonSlug: "infrastructure-as-code", note: "ARM templates and Bicep." },
      { code: "GH-900", lessonSlug: "gh-actions-workflow-basics", note: "GitHub Actions workflows, jobs and runners." },
      { code: "PL-900", lessonSlug: "build-basic-cloud-flow", note: "Triggers and actions in Power Automate cloud flows." },
      { code: "DP-900", lessonSlug: "dp900-analytics-ingestion-pipelines", note: "Repeatable data ingestion pipelines." },
    ],
  },
  {
    slug: "analytics-insights",
    title: "Analytics and insights",
    description: "Turning data and telemetry into answers: analytical stores, queries, reports and dashboards.",
    tr: { title: "Analiz ve içgörüler", description: "Verileri ve telemetriyi yanıtlara dönüştürmek: analitik depolar, sorgular, raporlar ve panolar." },
    links: [
      { code: "DP-900", lessonSlug: "dp900-analytical-stores-platforms", note: "Data warehouses, lakehouses and analytics platforms." },
      { code: "DP-900", lessonSlug: "dp900-power-bi-capabilities", note: "Power BI reports, dashboards and semantic models." },
      { code: "AZ-900", lessonSlug: "azure-monitor-basics", note: "Azure Monitor, Log Analytics and alerts." },
      { code: "SC-900", lessonSlug: "sentinel-siem-soar-operations", note: "Hunting and analytics rules over security data." },
    ],
  },
  {
    slug: "responsible-ai",
    title: "Responsible AI",
    description: "Fairness, reliability and safety, privacy and security, inclusiveness, transparency and accountability - applied to every AI solution and agent.",
    tr: { title: "Sorumlu yapay zekâ", description: "Adillik, güvenilirlik ve emniyet, gizlilik ve güvenlik, kapsayıcılık, şeffaflık ve hesap verebilirlik - her yapay zekâ çözümüne ve ajanına uygulanır." },
    links: [
      { code: "AI-901", lessonSlug: "responsible-ai-principles", note: "The principles of responsible AI." },
      { code: "AI-901", lessonSlug: "applying-responsible-ai", note: "Safety, transparency and human oversight in practice." },
      { code: "AB-900", lessonSlug: "copilot-governance-risks", note: "Governance risks of Copilot and agents." },
      { code: "PL-900", lessonSlug: "design-grounded-agent-conversations", note: "Grounded, helpful agent conversations." },
    ],
  },
];
