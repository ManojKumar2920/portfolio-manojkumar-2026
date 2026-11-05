// Single source of truth for personal details shown on the canvas home page and the DOM pages.
// Anything marked TODO is a placeholder: replace it before deploying.

export const site = {
  name: 'Manoj Kumar',
  initials: 'MK',
  role: 'Software Engineer',
  focus: 'Distributed systems & cloud backends',
  pitch: 'I design and run distributed systems, cloud backends and web platforms that hold up at scale.',
  // The exhibits on the home page's hall walls, in order (the rest of the work lives on /work and the profile page).
  hallWork: ['moveit-india', 'panchayat-voting', 'crux', 'cfoco'],
  // From the resume: the profile page's opening paragraph.
  summary:
    'Software engineer with 2.5+ years of experience designing microservices, distributed systems and cloud-native applications across logistics, SaaS, eCommerce and consumer platforms. I lead engineering initiatives and ship products that handle millions of requests and high-concurrency workloads.',
  // Printed on the old note on the path (home page, first scroll).
  tagline: 'Built to last. Built to scale.',
  email: 'manojkumararumainathan@gmail.com', 
  // Every "Let's talk" / "Get in touch" / "Contact" opens this Cal.com booking popup.
  booking: { link: 'manojkumar20/ship-now', namespace: 'ship-now', url: 'https://cal.com/manojkumar20/ship-now' },
  availability: 'Open to new opportunities',
  // The shared side of the 3D world (candles on exhibits, visitors' favourites as stars): ../portfolio-server.
  // Both values are public. The Turnstile site key pairs with the TURNSTILE_SECRET set on the Worker.
  social: {
    api: 'https://portfolio-server.manojkumararumainathan.workers.dev',
    turnstileSiteKey: '0x4AAAAAAF0fvZHqZMeZeFuJ',
  },
  location: 'India · IST',
  socials: [
    { label: 'GitHub', href: 'https://github.com/ManojKumar2920' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/manojkumar20' },
  ],
  // Proof points under the statement on the home page (from the resume).
  stats: [
    { value: '2.5+', label: 'years shipping' },
    { value: '40+', label: 'apps & sites delivered' },
    { value: '47M+', label: 'requests served' },
    { value: '35%', label: 'cloud cost cut' },
  ],
  // Roles, newest first: the first card of the home page's experience section and the About page.
  experience: [
    {
      role: 'Software Engineer',
      org: 'TIC Global Services',
      place: 'India',
      period: 'Jul 2024 – present',
      line: 'Lead engineering across logistics, SaaS, analytics and eCommerce products; architected MoveIt India (20+ microservices) and delivered 40+ client apps and sites.',
      points: [
        'Lead end-to-end engineering execution across logistics, SaaS, analytics and eCommerce products, contributing to **40% revenue growth** through reliable client delivery.',
        'Mentor **5+ developers and interns**, coordinate cross-team delivery, and set development standards, code review processes and release workflows.',
        'Produced **40+ client apps and websites** as the primary technical point of contact, turning business requirements into scalable technical solutions.',
        'Architected and developed MoveIt India, a logistics platform of **20+ microservices** on Go, NestJS, Kafka, PostgreSQL, Redis and AWS EKS.',
      ],
      tags: ['Go', 'NestJS', 'Kafka', 'AWS EKS'],
      metrics: [
        { value: '20+', label: 'microservices architected' },
        { value: '40+', label: 'apps & sites delivered' },
        { value: '5+', label: 'developers mentored' },
      ],
    },
  ],
  // Technical skills, grouped as on the resume. `icon` is a Simple Icons slug (logo); without one a monogram is drawn.
  skills: [
    { group: 'Languages', items: [
      { name: 'Go', icon: 'go' }, { name: 'TypeScript', icon: 'typescript' }, { name: 'JavaScript', icon: 'javascript' },
      { name: 'Python', icon: 'python' }, { name: 'Java', icon: 'openjdk' },
    ] },
    { group: 'Backend & architecture', items: [
      { name: 'Node.js', icon: 'nodedotjs' }, { name: 'NestJS', icon: 'nestjs' }, { name: 'Gin', icon: 'gin' }, { name: 'Kafka', icon: 'apachekafka' },
      { name: 'gRPC', mono: 'gRPC' }, { name: 'REST APIs' }, { name: 'Microservices' }, { name: 'Event-driven systems' },
    ] },
    { group: 'AI & agents', items: [
      { name: 'MCP servers', icon: 'modelcontextprotocol' }, { name: 'AI agents' }, { name: 'Tool calling' }, { name: 'LLM APIs' },
    ] },
    { group: 'Databases & caching', items: [
      { name: 'PostgreSQL', icon: 'postgresql' }, { name: 'Redis', icon: 'redis' }, { name: 'MongoDB', icon: 'mongodb' }, { name: 'MySQL', icon: 'mysql' },
    ] },
    { group: 'Cloud & infrastructure', items: [
      { name: 'AWS', mono: 'aws' }, { name: 'Cloudflare', icon: 'cloudflare' }, { name: 'Docker', icon: 'docker' }, { name: 'Kubernetes', icon: 'kubernetes' },
      { name: 'Terraform', icon: 'terraform' }, { name: 'Kong', icon: 'kong' }, { name: 'Prometheus', icon: 'prometheus' }, { name: 'GitHub Actions', icon: 'githubactions' },
    ] },
    { group: 'Frontend & 3D', items: [
      { name: 'React', icon: 'react' }, { name: 'Next.js', icon: 'nextdotjs' }, { name: 'Tailwind CSS', icon: 'tailwindcss' },
      { name: 'Three.js / R3F', icon: 'threedotjs' }, { name: 'GSAP', icon: 'gsap' }, { name: 'Framer Motion', icon: 'framer' },
    ] },
    { group: 'Tools & practice', items: [
      { name: 'Git', icon: 'git' }, { name: 'Linux', icon: 'linux' }, { name: 'CI/CD' }, { name: 'System design' }, { name: 'Agile delivery' },
    ] },
  ],
  // Headline numbers on the profile page (all from the resume).
  highlights: [
    { value: '2.5+', label: 'years shipping' },
    { value: '40+', label: 'apps & sites delivered' },
    { value: '5M+', label: 'lines of code shipped' },
    { value: '5+', label: 'developers mentored' },
  ],
  // The freelance side of the profile page ("Start a project").
  freelance: {
    services: [
      { title: 'Landing pages & websites', line: 'Fast, polished marketing sites and launch pages that load quickly, rank well and convert.', tags: ['Next.js', 'GSAP', 'Cloudflare'] },
      { title: '3D & interactive websites', line: 'Immersive brand and product sites: real-time 3D, scroll-driven stories, product viewers.', tags: ['Three.js', 'WebGL', 'GSAP'] },
      { title: 'Web apps & SaaS', line: 'Full-stack products from first prototype to launch: dashboards, portals, marketplaces and subscriptions.', tags: ['Next.js', 'NestJS', 'PostgreSQL'] },
      { title: 'Custom software', line: 'Software shaped around how your business runs: internal tools, CRMs, ERPs, admin panels and integrations.', tags: ['Node.js', 'TypeScript', 'Go', 'PostgreSQL'] },
      { title: 'AI automations', line: 'Agents and workflows that take repetitive work off your team: tool calling, MCP servers, assistants over your own data.', tags: ['LLM APIs', 'MCP', 'AI agents'] },
      { title: 'Backends & APIs at scale', line: 'Microservices, event-driven pipelines and APIs built to stay fast under real traffic.', tags: ['Node.js', 'Go', 'Kafka', 'Redis'] },
      { title: 'Cloud, performance & cost', line: 'Infrastructure that scales without surprises, with budgets and bills kept in check.', tags: ['AWS', 'Kubernetes', 'Cloudflare'] },
    ],
    process: [
      { title: 'First, we talk.', line: 'A call to understand the goal, the users and the constraints. You get a clear scope and plan.' },
      { title: 'Then, we agree the plan.', line: 'Architecture, milestones and the look agreed up front, so there are no surprises later.' },
      { title: 'Next, I build it in the open.', line: 'Small, frequent releases you can click through, with updates every week.' },
      { title: 'Finally, we launch.', line: 'Deployment, monitoring and a hand-over, with support after launch.' },
    ],
    // Pricing on the profile page ("Ways to work together"). `price` with `from: true` reads "Starting from $X*" and
    // carries the footnote; `from: false` shows the price line as written. Prices in US dollars.
    engagements: [
      {
        title: 'Fixed-scope project',
        price: '$750' as string | null,
        from: true,
        per: 'per project',
        line: 'For a complete website, app or product with a clear goal. Scope, timeline and price are agreed before any work starts.',
        includes: ['Scope, milestones and price agreed up front', 'Design, development and launch', 'Weekly progress you can click through', 'Deployment, hand-over and launch support'],
        cta: 'Plan a project',
      },
      {
        title: 'Ongoing partnership',
        price: '$1,200' as string | null,
        from: true,
        per: 'per month',
        line: 'For teams that need a senior engineer on hand every month for new features, scaling and upkeep, without hiring full-time.',
        includes: ['A dedicated block of engineering time each month', 'New features, fixes and performance work', 'Infrastructure and cloud cost reviews', 'Priority replies'],
        cta: 'Discuss a retainer',
      },
      {
        title: 'Specific or budget-friendly',
        price: 'Custom quote' as string | null,
        from: false,
        per: '',
        line: "Need just one thing done, or working with a tighter budget? Tell me the problem and I'll suggest the leanest way to solve it.",
        includes: ['A single feature, fix, integration or AI automation', 'A smaller scope sized to your budget', 'A clear quote before any work starts'],
        cta: 'Get a quote',
      },
    ],
  },
  education: { degree: 'B.E. Computer Science', school: 'Info Institute of Engineering', detail: 'Graduated May 2025 · CGPA 8.12 / 10', period: 'May 2025', grade: 'CGPA 8.12 / 10' },
  // Shown on the canvas "Craft" section and the About page.
  stack: ['Go · TypeScript', 'NestJS · Next.js', 'Kafka · Redis', 'PostgreSQL', 'AWS · Kubernetes', 'Cloudflare Workers'],
  principles: [
    { title: 'Built to last', line: 'Readable code, typed boundaries, tests where they pay off.' },
    { title: 'Fast by default', line: 'Performance budgets set on day one, not patched in later.' },
    { title: 'Shipped, not stalled', line: 'Small releases, clear updates, no surprises.' },
  ],
  // Shown on /credits, each beside a still of where it appears in the 3D world (public/images/credits).
  credits: [
    {
      label: '"Golden Gate Hills" HDRI',
      by: 'Poly Haven',
      license: 'CC0',
      href: 'https://polyhaven.com/a/golden_gate_hills',
      where: 'The light and the sky over the hillside, where the walk begins.',
      image: '/images/credits/hill.jpg',
    },
    {
      label: 'Free Realistic Tree Asset Pack',
      by: 'CGTrader', // TODO: add the author's name from the CGTrader page
      license: 'Royalty Free License',
      href: 'https://www.cgtrader.com/free-3d-models/plant/leaf/free-realistic-tree-aset-pack',
      where: 'The cherry trees round the ruin, petals and all.',
      image: '/images/credits/orbit.jpg',
    },
    {
      label: 'Airplane model',
      by: 'Sketchfab', // TODO: the author's name (CC BY 4.0 asks for it): see https://skfb.ly/oT7t8
      license: 'CC BY 4.0',
      href: 'https://skfb.ly/oT7t8',
      where: 'The flight above the clouds at the very end, on the way to About.',
      image: '/images/credits/flight.jpg',
    },
  ],
} as const;

export type Site = typeof site;
