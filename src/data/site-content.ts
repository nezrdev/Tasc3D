export type ClientProfile = {
    title: string;
    key: string;
    moments: string[];
    cta: string;
    href: string;
};
export type ServiceCard = {
    title: string;
    summary: string;
    body: string;
    visualCue: string;
    visualType: string;
    focusSlot?: boolean;
};
export type NewsStage = {
    kicker: string;
    title: string;
    body: string;
    cards: Array<{
        label: string;
        title: string;
        metric: string;
    }>;
};
export type HowWeWorkItem = {
    title: string;
    body: string;
};
export type DatumMetric = {
    value: string;
    label: string;
    detail: string;
};
export type TeamSignal = {
    role: string;
    title: string;
    body: string;
};
export const hero = {
    brand: "TASC",
    line: "Tactical Advertising & Strategic Communications",
    descriptor: "A Global Strategic Communications, Marketing & Advertising Group.",
    promise: "Delivering what matters. Worldwide.",
};
export const mission = {
    mission: "TASC is a strategic communications agency for those operating at scale: international brands, major corporations, and government entities. We transform business objectives into advertising and communication campaigns that reach the right audience in the right market - precisely, measurably, and predictably. Our success is measured not by reach for its own sake, but by tangible outcomes: sales growth, market share expansion, active reputation management, and brand value enhancement.",
    vision: "A world where market movers and nation builders deliver their messages with absolute precision and scale - securing the influence their stature demands.",
    bridge: "From business objective to audience impact. Here is how.",
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
export const services: ServiceCard[] = [
    {
        title: "Advertising Strategy & Consulting",
        summary: "Campaign architecture, market analysis and budget direction for large-scale mandates.",
        visualCue: "Strategic architecture",
        visualType: "clockwork planning",
        focusSlot: true,
        body: "We design advertising strategies for sovereign states, global brands, and organizations operating at scale. From market analysis to campaign architecture, we deliver a roadmap that dictates where and why every dollar is deployed.",
    },
    {
        title: "Reputation Management",
        summary: "Reputation strategy and fast response when public perception shifts.",
        visualCue: "Public trust systems",
        visualType: "sentiment pulse",
        body: "Public perception of a nation, brand, or public figure can shift in hours. We build long-term reputational strategies and act decisively when circumstances demand speed.",
    },
    {
        title: "Paid Media & Targeted Advertising",
        summary: "Platform media planning, optimization and reporting across priority networks.",
        visualCue: "Precision media deployment",
        visualType: "market towers",
        focusSlot: true,
        body: "Launching and managing campaigns across platforms: Meta, Google, TikTok, X (Twitter), LinkedIn, DSPs, and regional networks. We create, optimize, and report. Your budget reaches exactly who it is meant for, eliminating waste on non-target traffic.",
    },
];
export const servicesEcosystemNote = "An ecosystem service that bridges advertising with long-term audience relationships. Offered exclusively as an integrated component of our strategic workflows.";
export const cta = {
    title: "Command Attention.",
    body: "Not every brief becomes a proposal. Those that do, deliver results.",
    action: "Submit Brief",
};
export const newsStage: NewsStage = {
    kicker: "Media signal",
    title: "Narratives that move through the channels people actually open.",
    body: "A controlled mobile feed, regional editorial cards, and signal-driven distribution show how sponsored narratives move without collapsing into algorithmic noise.",
    cards: [
        {
            label: "Regional desk",
            title: "Local context before placement",
            metric: "01",
        },
        {
            label: "Editorial screen",
            title: "Sponsored stories filtered for fit",
            metric: "02",
        },
        {
            label: "Distribution",
            title: "Audience-ready signal, not algorithmic noise",
            metric: "03",
        },
    ],
};
export const howWeWork: HowWeWorkItem[] = [
    {
        title: "We don't speculate on markets. We know them before we invest.",
        body: "Every project begins with a grounded view of region, culture, media habits, regulations, local platforms, and trust transfer. Strategy is built only after the market is understood.",
    },
    {
        title: "From Research to Results - via a single point of accountability.",
        body: "Research, strategy, execution, placement, infrastructure, and measurement stay under one roof. The client does not manage vendor fragmentation while the campaign is moving.",
    },
    {
        title: "We understand what is at stake in public communication.",
        body: "Confidence is built behind closed doors and reputation is measured in public. We protect message discipline, documentation, compliance, and public trust instead of chasing cheap attention.",
    },
];
export const datum = {
    kicker: "The Datum",
    title: "A Global Media Network. Built by TASC.",
    body: "TASC is developing a proprietary media asset: a network of independent regional newsrooms and distribution environments for sponsored content that still passes editorial screening.",
    waitlist: "Join the Waitlist",
    metrics: [
        {
            value: "Zero",
            label: "algorithmic noise",
            detail: "Content is designed for people who choose to open it.",
        },
        {
            value: "Global",
            label: "regional newsroom map",
            detail: "Independent environments allow campaigns to respect local context.",
        },
        {
            value: "Screened",
            label: "sponsored content",
            detail: "Placement begins with fit, not inventory dumping.",
        },
    ] satisfies DatumMetric[],
};
export const team = {
    kicker: "Team",
    title: "The team behind the signal.",
    body: "Built by operators who understand strategic communication, media systems, digital infrastructure, and public-stakes execution at scale.",
    signals: [
        {
            role: "Strategy",
            title: "Campaign architecture",
            body: "Objective, audience, market, channel, and budget decisions stay connected before execution starts.",
        },
        {
            role: "Media",
            title: "Placement and distribution",
            body: "Regional nuance, platform behavior, and editorial fit guide where the signal goes.",
        },
        {
            role: "Technology",
            title: "Infrastructure and measurement",
            body: "Landing pages, reporting systems, security, and campaign tools are treated as one operating layer.",
        },
        {
            role: "Operations",
            title: "Single accountable path",
            body: "The mandate moves through controlled intake, approved channels, delivery, and final reporting.",
        },
    ] satisfies TeamSignal[],
};
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
export const contactBlocks = {
    office: {
        label: "Contacts & Office",
        title: "Start the Conversation.",
        body: "TASC routes serious mandates through a controlled brief intake, then continues through the right project channel.",
        mapLabel: "Strategic coordination",
        mapValue: "Brief first, then the right coordinator for the mandate.",
        primaryAction: "Back to Services",
        secondarySignal: "Controlled intake",
    },
    meeting: {
        label: "Book a Meeting",
        title: "Request a Meeting.",
        body: "The first call is opened after scope, stakeholders, and target regions are clear.",
        calendarLabel: "Meeting path",
        calendarValue: "Brief-led scheduling for qualified mandates.",
    },
    footerLine: "TASC — Tactical Advertising & Strategic Communications",
};
export const footerContent = {
    legal: "Strategic communications mandates begin through a controlled brief intake, then move through approved project channels.",
    intake: ["Brief intake", "Strategic review", "Approved project channel"],
    menu: [
        { label: "Clients", href: "#clients" },
        { label: "Services", href: "#services" },
        { label: "How We Work", href: "#work" },
        { label: "Datum", href: "#datum" },
        { label: "Brief", href: "#brief" },
    ],
};
