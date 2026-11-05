import type { LifecycleState, WorkspaceRole } from "@skill-library/domain";

/**
 * English UI copy, and the shape every other locale must match. Agent prompts
 * (install and MCP setup) stay in English on purpose: they are instructions for
 * an agent, not copy for the reader.
 */
export const en = {
  common: {
    moreInfo: "More information",
  },
  language: {
    label: "Language",
    switchTo: (name: string) => `Switch language to ${name}`,
  },
  lifecycle: {
    draft: "draft",
    published: "published",
    approved: "approved",
    hidden: "hidden",
    deprecated: "deprecated",
  } satisfies Record<LifecycleState, string>,
  roles: {
    labels: {
      user: "Viewer",
      maintainer: "Editor",
      admin: "Admin",
    } satisfies Record<WorkspaceRole, string>,
    descriptions: {
      user: "Browse and install approved skills.",
      maintainer: "Publish drafts and approve skills for the catalog.",
      admin: "Manage teammates plus all editor actions.",
    } satisfies Record<WorkspaceRole, string>,
  },
  login: {
    checking: "Checking your sign-in…",
    redirecting: "Redirecting to Microsoft…",
    signIn: "Sign in with Microsoft",
  },
  rail: {
    workspace: "Workspace",
    overview: "Overview",
    catalog: "Catalog",
    mySkills: "My Skills",
    publish: "Publish",
    reports: "Reports",
    team: "Team",
    leaderboard: "Leaderboard",
    signOut: "Sign out",
    apiKey: "API Key",
    apiKeyPlaceholder: "Enter token...",
  },
  topbar: {
    activeWorkspace: "Active Workspace",
    workspaceOption: (id: string) => `Workspace: ${id}`,
    newWorkspace: "+ New Workspace...",
    workspaceOverview: "Workspace overview",
  },
  overview: {
    startHere: "Start here",
    browseSkills: "Browse skills",
    shareSkill: "Share a skill",
    developerSummary:
      "Using Claude Code, Codex, Cursor or ChatGPT? Connect them too",
    connectAria: "Connect your agent via MCP",
    connectKicker: "Connect your agent",
    connectTitle: "Copy agent setup prompt",
    connectBody:
      "Pick your agent below and paste the copied prompt into it. It connects to the hosted MCP server and signs you in with your company account the first time. No token to copy.",
    registry: "Registry:",
    copyTargetAria: (label: string) => `Copy ${label} MCP setup prompt`,
    copied: "Copied",
    copyPrompt: "Copy prompt",
    metricsAria: "Registry metrics",
    approvedSkills: "Approved skills",
    installs: "Installs",
    needUpdate: "Need update",
    noSkillsYet: "No skills yet",
    publishFirst: "Publish first skill",
  },
  connectClaude: {
    kicker: "Easiest way",
    title: "Connect Claude to the library",
    intro:
      "Do this once. After that, just ask Claude: it finds skills for you, uses them right away, and helps you install the ones you want to keep. Nothing to download.",
    copy: "Copy address",
    copied: "Copied",
    step1Title: "Open Settings, then Connectors",
    step1Body:
      "In Claude (claude.ai or the desktop app), click Add custom connector.",
    step2Title: "Paste the address",
    step2Body: (appName: string) =>
      `Name it ${appName}, paste the address above and click Add.`,
    step3Title: "Click Connect and sign in",
    step3Body: "Use your usual work account. Only the first time.",
    tryIt: 'Then try asking Claude: "Which skills do we have for writing CVs?"',
  },
  howItWorks: {
    title: "How it works",
    findTitle: "Find a skill",
    browse: "Browse the skills",
    findRest: "and click one to see what it does.",
    downloadTitle: "Download it",
    downloadBody: "One click. The file lands in your Downloads folder.",
    addTitle: "Add it to Claude",
    addBody: "Upload it under Customize, then Skills. That's it.",
    newToClaude: "New to Claude? Use it at",
    inBrowserOr: "in your browser, or",
    downloadApp: "download the desktop app",
  },
  addToClaude: {
    title: "Add this skill to Claude",
    downloadTitle: "Download the skill.",
    downloadBefore: "This saves",
    downloadAfter: "to your Downloads folder. You don't need to open it.",
    downloadButton: "Download for Claude",
    openTitle: "Open Claude.",
    openBefore: "Use",
    openAfter: "in your browser, or the Claude desktop app.",
    customizeTitle: "Go to Customize, then Skills.",
    uploadTitle: "Click +, then Create skill, then Upload a skill.",
    uploadBody: "Pick the file you just downloaded.",
    enableTitle: "Turn the skill on.",
    enableBody:
      "Use the switch next to it in your list of skills. After that, just ask Claude for help as usual. It uses the skill when it fits.",
    promptTitle: "Or let Claude add it for you",
    showPrompt: "Show the prompt",
    promptHint:
      "Copy this prompt and paste it into Claude, in the desktop app or Claude Code. Claude checks your access, downloads the skill and saves it so it works in all your conversations. Your personal access key is added when you copy, so don't share the copied text.",
    copied: "Copied",
    copyPrompt: "Copy prompt for Claude",
    copyFailed:
      "Couldn't copy to your clipboard. Select the prompt above and copy it yourself, or try another browser.",
  },
  catalog: {
    allStatuses: "All Statuses",
    approved: "Approved",
    draftsPending: "Drafts & Pending",
    all: "All",
    loading: "Loading skills…",
    empty: "No skills in the catalog yet.",
    featured: "Featured approved skill",
    openCatalog: "Open catalog",
    emptyDrafts:
      "No draft or pending skills in this category match your search.",
    emptyApproved: "No approved skills in this category match your search.",
    emptyAll: "No skills in this category match your search.",
    mineEmptyDrafts:
      "You haven't uploaded any draft or pending skills in this category yet.",
    mineEmptyApproved:
      "You haven't uploaded any approved skills in this category yet.",
    mineEmptyAll: "You haven't uploaded any skills in this category yet.",
  },
  stats: {
    by: (name: string) => `by ${name}`,
    versionValue: (version: string) => `Version ${version}`,
    updated: (date: string) => `Updated ${date}`,
  },
  detail: {
    aria: "Skill detail",
    selected: "Selected package",
    copyLinkTitle: "Copy a shareable link to this skill",
    copied: "Copied",
    copyLink: "Copy link",
    developerSummary:
      "Using Claude Code, Codex, or Cursor? Install with a prompt instead",
    developerHint:
      "Paste this prompt into Claude Code, Codex, Cursor, or any coding agent to install this skill and verify it.",
    installTarget: "Install target",
    copyPrompt: "Copy prompt",
    downloadZip: "Download ZIP",
    noApproved: "No approved version is available for installation.",
    usage: "Usage",
    technical: "Technical details: files and validation",
    contents: "Contents",
    showLessAria: "Show less files",
    showMoreAria: "Show more files",
    showLess: "Show less",
    showMore: (count: number) => `Show ${count} more files`,
    validation: "Validation",
    activeVersion: "Active version",
    noVersion: "No version selected",
    approvedInstall: "Approved install",
    lifecycle: "Lifecycle controls",
    lifecycleCopy:
      "Editors and Admins review drafts here. Approval makes a skill installable from the catalog.",
    approve: "Approve",
    hide: "Hide",
    deprecate: "Deprecate",
    proposal: {
      title: "Proposed change",
      summary: (by: string, version: string, date: string) =>
        `${by} proposed version ${version} on ${date}.`,
      current: (version: string) =>
        `Colleagues keep getting ${version} until the change is approved.`,
      noCurrent: "Colleagues see it once the change is approved.",
      decide: "Read the change, then approve it or reject it.",
      waiting: (owner: string) => `Waiting for ${owner} to approve it.`,
      theOwner: "the skill's owner",
      someone: "A colleague",
      approve: "Approve change",
      reject: "Reject",
      download: "Download proposed version",
    },
    activity: (days: number) =>
      `Download counts and sparklines reflect the last ${days} days of artifact downloads.`,
  },
  validation: {
    none: "No validation results yet.",
    valid:
      "Package shape is valid. SKILL.md frontmatter and bundled files look good.",
    warnings: "Package passed validation with warnings.",
    blocking: "Validation found blocking errors.",
    errors: "Errors",
    warningsTitle: "Warnings",
  },
  reports: {
    title: "Adoption report",
    packages: "Packages",
    current: "Current",
    needsUpdate: "Needs update",
    tableAria: "Package reports",
    installs: (count: number) => `${count} installs`,
    stale: (count: number) => `${count} stale`,
  },
  publish: {
    localAria: "Publish local draft",
    localTitle: "Publish local folder",
    workspace: "Workspace",
    createWorkspace: "+ Create custom workspace...",
    newWorkspaceId: "New Workspace ID",
    newWorkspacePlaceholder: "e.g. engineering",
    slug: "Slug",
    version: "Version",
    categories: "Categories",
    noCategories: "No categories selected. Select or add one below.",
    newCategoryPlaceholder: "Add a new custom category...",
    addCategory: "+ Add",
    name: "Name (optional)",
    namePlaceholder: "e.g. My Great Skill",
    description: "Description (optional)",
    descriptionPlaceholder: "e.g. A skill that does X",
    filesStaged: (count: number) => `${count} files staged`,
    folder: "Folder:",
    chooseDifferent: "Choose different folder",
    dropHere: "Drag & drop a skill folder here",
    orBrowse: "or click to browse your folders",
    chooseFolder: "Choose Folder",
    validate: "Validate",
    upload: "Upload skill",
    preflight: "Preflight validation",
    gitAria: "Import from Git",
    gitTitle: "Import from Git",
    gitDescription:
      "Import a skill package version directly from a remote Git repository.",
    repository: "Repository",
    ref: "Ref",
    subdir: "Subdir",
    import: "Import",
  },
  team: {
    aria: "Team roster",
    title: "Team",
    onlyYou: "Only you have signed in so far",
    youAnd: (count: number) =>
      `You and ${count} other ${count === 1 ? "teammate" : "teammates"}`,
    refresh: "Refresh",
    yourAccount: "Your account",
    joined: "Joined",
    submitted: (count: number) =>
      `${count} skill${count === 1 ? "" : "s"} submitted`,
    roles: "Roles",
    members: "Team members",
    loading: "Loading teammates…",
    none: "No teammates have signed in yet.",
    user: "User",
    role: "Role",
    skillsSubmitted: "Skills submitted",
    joinedColumn: "Joined",
    you: " (you)",
    removeTitle: (name: string) => `Remove ${name}`,
    remove: "Remove",
    branding: "Workspace branding",
    logoUrl: "Logo URL",
    logoHint:
      "Supports http(s), root-relative paths, and base64 image data URLs.",
    saving: "Saving...",
    saveLogo: "Save logo",
    clear: "Clear",
    logoUpdateFailed: "Could not update workspace logo.",
  },
  popularity: {
    noColleagues: "No colleagues have installed this yet",
    installedBy: (count: number) =>
      `Installed by ${count} ${count === 1 ? "colleague" : "colleagues"}`,
    foundUseful: (count: number) => `${count} found it useful`,
    ownUseful: (count: number) => `${count} useful`,
    yourSkill: "Your skill",
    useful: "Useful",
    removeUpvote: "Remove your upvote",
    upvoteHint: "Upvote if this skill helped you",
    sortAria: "Sort skills",
    sortLabel: "Sort",
    sortPopular: "Popular",
    sortNewest: "Newest",
    sortName: "A–Z",
  },
  leaderboard: {
    title: "Top skills",
    intro:
      "The skills colleagues install and upvote the most. Recent installs count most.",
    loading: "Loading skills…",
    empty:
      "No one has installed or upvoted a skill yet. Find a useful one in the catalog and it could be first here.",
    by: (author: string): string => `by ${author}`,
    you: " (yours)",
    colleagues: (count: number): string =>
      count === 1 ? "colleague uses it" : "colleagues use it",
    upvotes: (count: number): string => (count === 1 ? "upvote" : "upvotes"),
    downloads: (count: number): string =>
      count === 1 ? "download" : "downloads",
  },
  notices: {
    upvoteSaved: "Thanks — upvote saved",
    upvoteRemoved: "Upvote removed",
    upvoteFailed: "Upvote failed",
    ready: "Ready",
    installCopied: "Install prompt copied — paste it into your agent",
    mcpCopied: (label: string) => `Copied the ${label} setup prompt`,
    catalogSynced: "Catalog synced",
    catalogEmpty: "Catalog is empty. Publish a skill to get started.",
    refreshFailed: (message?: string) =>
      message
        ? `Could not refresh catalog: ${message}`
        : "Could not refresh catalog",
    apiUnavailable: (message?: string, demo?: boolean) =>
      `API unavailable${message ? `: ${message}` : ""}${demo ? "; showing local demo data" : ""}`,
    noVersion: "No selected version to transition.",
    versionMoved: (version: string, state: string) =>
      `Version ${version} moved to ${state}`,
    lifecycleFailed: "Lifecycle transition failed",
    roleUpdated: (role: string) => `Role updated to ${role}`,
    roleFailed: "Failed to update user role",
    confirmRemove: (name: string) =>
      `Remove ${name} from the registry? This action cannot be undone.`,
    userRemoved: (name: string) => `${name} has been removed`,
    removeFailed: "Failed to remove user",
    skillNotFound: (slug: string) =>
      `Skill "${slug}" was not found in this workspace.`,
    linkCopied: "Link copied — share it with your team",
    logoUpdated: "Workspace logo updated",
    logoCleared: "Workspace logo cleared",
    chooseBeforeValidate: "Choose a skill directory before validating.",
    validationWarnings:
      "Validation passed with warnings. You can upload the draft for maintainer review.",
    validationPassed: "Validation passed. Ready to upload.",
    validationBlocking:
      "Validation found blocking errors. Fix them before approval; you can still upload an invalid draft for review.",
    validationFailed: "Validation failed",
    chooseBeforeUpload:
      "Choose a skill directory or JSON package tree before uploading.",
    uploadedValid: (version: string) =>
      `Uploaded as draft: version ${version}. Validation passed. Maintainers must Approve it from the Catalog page to make it available for download/install.`,
    uploadedInvalid: (version: string) =>
      `Uploaded as draft: version ${version}. Validation found blocking errors — fix frontmatter before approval. Maintainers can review the issue list in Catalog.`,
    uploadFailed: "Upload failed",
    noFilesStaged: "No files staged",
    missingSkillMd:
      "Validation error: The selected folder does not contain a SKILL.md file. Publishing requires a SKILL.md file.",
    filesStaged: (count: number, slug: string) =>
      `${count} files staged for upload from skill folder "${slug}". Ready to publish.`,
    filesDropped: (count: number, slug: string) =>
      `${count} files staged for upload from dropped folder "${slug}". Ready to publish.`,
  },
};

export type Messages = typeof en;
