export type ClientProfile = {
    title: string;
    key: string;
    moments: string[];
    cta: string;
    href: string;
};
export const clientProfiles: ClientProfile[] = [
    {
        title: "Corporations & Brands",
        key: "A shared language of budgets, deadlines, and KPIs. A single partner from strategy through deployment. Zero vendor fragmentation. No blind spots in the funnel. Every campaign is built on robust market research, never on assumptions.",
        moments: [
            "Launching a product or brand in a new market",
            "Scaling campaigns across multiple regions with a single point of accountability",
            "Rebranding or shifting market positioning",
            "Audience research and insights",
            "A reputational crisis requiring a swift, controlled response",
        ],
        cta: "View Services",
        href: "#services",
    },
    {
        title: "The Public Sector",
        key: "Public communication carries high-stakes accountability. The cost of error is measured in public trust, not cost-per-click. We operate with the nuance and precision this demands: multi-jurisdictional compliance and measurability across all regions.",
        moments: [
            "Large-scale public campaigns: healthcare, education, and national initiatives",
            "Managing the international reputation of a country or region",
            "Delivering specific messages to targeted audiences in precise markets",
            "Public opinion research prior to policy decisions",
            "Compliant media placement across varying jurisdictions",
        ],
        cta: "View Services",
        href: "#services",
    },
];
export const processSteps = [
    {
        title: "Briefing & Immersion",
        body: "We start with the objective, not a pitch deck. What needs to be achieved, where, and by when. If research is required before strategy, we say so upfront",
    },
    {
        title: "Research & Market Analysis",
        body: "Audience research, competitive landscapes, regulatory frameworks, and media habits within target regions. Data precedes decisions.",
    },
    {
        title: "Strategy & Architecture",
        body: "A definitive blueprint: channels, messaging, timelines, and budget allocation. The strategy is an active roadmap, not a deck gathering dust on a shelf.",
    },
    {
        title: "Execution, Placement & Integration",
        body: "Launching the campaigns, platform job, content deployment, and real-time optimization. If the project requires a landing page, an MVP app, or a digital tool, we build it directly within the same workflow",
    },
    {
        title: "Measurement & Reporting",
        body: "Transparent reporting mapped to agreed KPIs. What worked, what didn't, and the next steps. No vanity metrics. No black boxes",
    },
];
